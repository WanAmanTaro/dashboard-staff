import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export type UserRole = 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

export interface FirebaseAppletConfig {
  projectId: string;
  firestoreDatabaseId?: string;
}

export interface CallerContext {
  uid: string;
  email: string;
  emailVerified: boolean;
  idToken: string;
  isBootstrapAdmin: boolean;
  isAdmin: boolean;
  isActive: boolean;
  role: UserRole;
  staffId: string;
  centerId: string;
  departmentId: string;
  userDoc: Record<string, unknown> | null;
}

declare global {
  namespace Express {
    interface Request {
      caller?: CallerContext;
    }
  }
}

const BOOTSTRAP_ADMIN_EMAIL = 'iab-1248@moe-dl.edu.my';

export function loadFirebaseConfig(): FirebaseAppletConfig {
  const cfgPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
  if (!fs.existsSync(cfgPath)) {
    throw new Error('Konfigurasi firebase-applet-config.json tidak ditemui.');
  }
  const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return {
    projectId: raw.projectId,
    firestoreDatabaseId: raw.firestoreDatabaseId || '(default)',
  };
}

function getFirebaseAdminAuth() {
  const { projectId } = loadFirebaseConfig();
  const app = getApps().length ? getApp() : initializeApp({ projectId });
  return getAuth(app);
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return null;
  if ('stringValue' in val) return val.stringValue;
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('timestampValue' in val) return val.timestampValue;
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    return (val.arrayValue.values || []).map(fromFirestoreValue);
  }
  if ('mapValue' in val) {
    const out: Record<string, any> = {};
    const fields = val.mapValue.fields || {};
    for (const [k, v] of Object.entries(fields)) {
      out[k] = fromFirestoreValue(v);
    }
    return out;
  }
  return null;
}

function parseFirestoreDoc(docJson: any): Record<string, any> | null {
  if (!docJson || !docJson.fields) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(docJson.fields)) {
    out[k] = fromFirestoreValue(v);
  }
  return out;
}

export async function firestoreGetAsCaller(
  docPath: string,
  idToken: string
): Promise<Record<string, any> | null> {
  const { projectId, firestoreDatabaseId } = loadFirebaseConfig();
  const dbId = firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents/${docPath}`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${idToken}` },
  });
  if (res.status === 404) return null;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Firestore REST error (${res.status}): ${errText}`);
  }
  const json = await res.json();
  return parseFirestoreDoc(json);
}

export async function firestoreQueryByFieldAsCaller(
  collectionId: string,
  fieldPath: string,
  value: string,
  idToken: string
): Promise<Record<string, any>[]> {
  const { projectId, firestoreDatabaseId } = loadFirebaseConfig();
  const dbId = firestoreDatabaseId || '(default)';
  const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/${encodeURIComponent(dbId)}/documents:runQuery`;

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${idToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId }],
        where: {
          fieldFilter: {
            field: { fieldPath },
            op: 'EQUAL',
            value: { stringValue: value },
          },
        },
        limit: 10,
      },
    }),
  });

  if (!res.ok) {
    return [];
  }
  const rows = await res.json();
  if (!Array.isArray(rows)) return [];
  const results: Record<string, any>[] = [];
  for (const row of rows) {
    if (row.document) {
      const parsed = parseFirestoreDoc(row.document);
      if (parsed) results.push(parsed);
    }
  }
  return results;
}

export async function verifyBearerCaller(req: Request): Promise<CallerContext> {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    throw new Error('UNAUTHORIZED: Token pengesahan Firebase diperlukan.');
  }
  const idToken = authHeader.slice(7).trim();
  if (!idToken) {
    throw new Error('UNAUTHORIZED: Token pengesahan kosong.');
  }

  const adminAuth = getFirebaseAdminAuth();
  const decoded = await adminAuth.verifyIdToken(idToken);
  const uid = decoded.uid;
  const email = (decoded.email || '').toLowerCase();
  const emailVerified = Boolean(decoded.email_verified);

  if (!emailVerified) {
    throw new Error('FORBIDDEN_UNVERIFIED: Emel anda belum disahkan.');
  }

  let userDoc: Record<string, any> | null = null;
  try {
    userDoc = await firestoreGetAsCaller(`users/${uid}`, idToken);
  } catch {
    userDoc = null;
  }

  const isBootstrapAdmin = email === BOOTSTRAP_ADMIN_EMAIL && emailVerified;
  const isActive = isBootstrapAdmin || Boolean(userDoc && userDoc.status === 'active');
  const isAdmin = isBootstrapAdmin || Boolean(userDoc && userDoc.status === 'active' && userDoc.isAdmin === true);

  return {
    uid,
    email,
    emailVerified,
    idToken,
    isBootstrapAdmin,
    isAdmin,
    isActive,
    role: (userDoc?.role as UserRole) || (isBootstrapAdmin ? 'L1' : 'L5'),
    staffId: String(userDoc?.staffId || ''),
    centerId: String(userDoc?.centerId || ''),
    departmentId: String(userDoc?.departmentId || ''),
    userDoc,
  };
}

export async function requireVerifiedAuth(req: Request, res: Response, next: NextFunction) {
  try {
    req.caller = await verifyBearerCaller(req);
    next();
  } catch (err: any) {
    const msg = err?.message || 'Pengesahan gagal.';
    const status = msg.startsWith('FORBIDDEN') ? 403 : 401;
    res.status(status).json({ error: msg });
  }
}

export async function requireActiveStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const caller = await verifyBearerCaller(req);
    if (!caller.isActive) {
      res.status(403).json({ error: 'Akaun anda belum diluluskan atau tidak aktif.' });
      return;
    }
    req.caller = caller;
    next();
  } catch (err: any) {
    const msg = err?.message || 'Pengesahan gagal.';
    res.status(401).json({ error: msg });
  }
}

export async function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const caller = await verifyBearerCaller(req);
    if (!caller.isAdmin) {
      res.status(403).json({ error: 'Akses ditolak. Peranan Admin diperlukan.' });
      return;
    }
    req.caller = caller;
    next();
  } catch (err: any) {
    const msg = err?.message || 'Pengesahan gagal.';
    res.status(401).json({ error: msg });
  }
}

export async function verifyDriveFileAccess(
  caller: CallerContext,
  driveFileId: string,
  mode: 'read' | 'write'
): Promise<{ allowed: boolean; recordType?: string; ownerUid?: string; staffId?: string }> {
  if (caller.isAdmin) {
    return { allowed: true, recordType: 'admin' };
  }

  // Check certificates
  const certs = await firestoreQueryByFieldAsCaller('certificates', 'driveFileId', driveFileId, caller.idToken);
  if (certs.length > 0) {
    const cert = certs[0];
    if (mode === 'write') {
      return {
        allowed: cert.uid === caller.uid,
        recordType: 'certificate',
        ownerUid: cert.uid,
        staffId: cert.staffId,
      };
    }
    const readAllowed =
      cert.uid === caller.uid ||
      (caller.role === 'L1' && cert.centerId === caller.centerId) ||
      (caller.role === 'L2' && cert.departmentId === caller.departmentId);
    return { allowed: readAllowed, recordType: 'certificate', ownerUid: cert.uid, staffId: cert.staffId };
  }

  // Check display profile photos
  const displayPhotos = await firestoreQueryByFieldAsCaller(
    'profile_photos',
    'displayDriveFileId',
    driveFileId,
    caller.idToken
  );
  if (displayPhotos.length > 0) {
    const photo = displayPhotos[0];
    if (mode === 'write') {
      return { allowed: photo.uid === caller.uid, recordType: 'profile_photo', ownerUid: photo.uid, staffId: photo.staffId };
    }
    const readAllowed =
      photo.uid === caller.uid ||
      (caller.role === 'L1' && photo.centerId === caller.centerId) ||
      (caller.role === 'L2' && photo.departmentId === caller.departmentId) ||
      ((caller.role === 'L3' || caller.role === 'L4') && photo.status === 'active');
    return { allowed: readAllowed, recordType: 'profile_photo', ownerUid: photo.uid, staffId: photo.staffId };
  }

  // Check original profile photos (strictly owner or Admin or L1/L2 in scope)
  const originalPhotos = await firestoreQueryByFieldAsCaller(
    'profile_photos',
    'originalDriveFileId',
    driveFileId,
    caller.idToken
  );
  if (originalPhotos.length > 0) {
    const photo = originalPhotos[0];
    if (mode === 'write') {
      return { allowed: photo.uid === caller.uid, recordType: 'profile_photo_original', ownerUid: photo.uid, staffId: photo.staffId };
    }
    return {
      allowed: photo.uid === caller.uid,
      recordType: 'profile_photo_original',
      ownerUid: photo.uid,
      staffId: photo.staffId,
    };
  }

  // Check generated profiles PDFs
  const generated = await firestoreQueryByFieldAsCaller(
    'generated_profiles',
    'driveFileId',
    driveFileId,
    caller.idToken
  );
  if (generated.length > 0) {
    const gen = generated[0];
    if (mode === 'write') {
      return { allowed: gen.uid === caller.uid, recordType: 'generated_profile', ownerUid: gen.uid, staffId: gen.staffId };
    }
    const readAllowed =
      gen.uid === caller.uid ||
      (caller.role === 'L1' && gen.centerId === caller.centerId) ||
      (caller.role === 'L2' && gen.departmentId === caller.departmentId);
    return { allowed: readAllowed, recordType: 'generated_profile', ownerUid: gen.uid, staffId: gen.staffId };
  }

  return { allowed: false };
}
