import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export type UserRole = 'L0' | 'L1' | 'L2' | 'L3' | 'L4' | 'L5';

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
  idToken: string,
  limit = 100
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
        limit,
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
  const isAdmin =
    isBootstrapAdmin ||
    Boolean(userDoc && userDoc.status === 'active' && (userDoc.isAdmin === true || userDoc.role === 'L0'));

  return {
    uid,
    email,
    emailVerified,
    idToken,
    isBootstrapAdmin,
    isAdmin,
    isActive,
    role: (userDoc?.role as UserRole) || (isBootstrapAdmin ? 'L0' : 'L5'),
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
    // Return 401 JSON so reverse proxy error_page 403 never replaces JSON with HTML
    res.status(401).json({ error: msg, code: msg.startsWith('FORBIDDEN') ? 'FORBIDDEN' : 'UNAUTHORIZED' });
  }
}

export async function requireActiveStaff(req: Request, res: Response, next: NextFunction) {
  try {
    const caller = await verifyBearerCaller(req);
    if (!caller.isActive) {
      res.status(401).json({ error: 'Akaun anda belum diluluskan atau tidak aktif.', code: 'FORBIDDEN' });
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
      res.status(401).json({ error: 'Akses ditolak. Peranan Admin diperlukan.', code: 'FORBIDDEN' });
      return;
    }
    req.caller = caller;
    next();
  } catch (err: any) {
    const msg = err?.message || 'Pengesahan gagal.';
    res.status(401).json({ error: msg });
  }
}

async function findScopedRecordByDriveFileId(
  collectionId: string,
  matchFields: string[],
  driveFileId: string,
  caller: CallerContext,
  mode: 'read' | 'write',
  allowDirectoryActiveRead = false
): Promise<Record<string, any> | null> {
  const matchesTarget = (doc: Record<string, any>) =>
    matchFields.some((f) => String(doc[f] || '') === driveFileId);

  // 1. Query by caller's staffId (allowed by Firestore rules allow list)
  if (caller.staffId) {
    const byStaff = await firestoreQueryByFieldAsCaller(collectionId, 'staffId', caller.staffId, caller.idToken, 200);
    const found = byStaff.find(matchesTarget);
    if (found) return found;
  }

  // 2. Query by caller's uid (allowed by Firestore rules allow list)
  const byUid = await firestoreQueryByFieldAsCaller(collectionId, 'uid', caller.uid, caller.idToken, 200);
  const foundByUid = byUid.find(matchesTarget);
  if (foundByUid) return foundByUid;

  if (mode === 'read') {
    // 3. L1 center-scoped read
    if (caller.role === 'L1' && caller.centerId) {
      const byCenter = await firestoreQueryByFieldAsCaller(collectionId, 'centerId', caller.centerId, caller.idToken, 200);
      const foundByCenter = byCenter.find(matchesTarget);
      if (foundByCenter) return foundByCenter;
    }

    // 4. L2 department-scoped read
    if (caller.role === 'L2' && caller.departmentId) {
      const byDept = await firestoreQueryByFieldAsCaller(collectionId, 'departmentId', caller.departmentId, caller.idToken, 200);
      const foundByDept = byDept.find(matchesTarget);
      if (foundByDept) return foundByDept;
    }

    // 5. Directory read for active display profile photos (L3/L4)
    if (allowDirectoryActiveRead && (caller.role === 'L3' || caller.role === 'L4')) {
      const activeDocs = await firestoreQueryByFieldAsCaller(collectionId, 'status', 'active', caller.idToken, 200);
      const foundActive = activeDocs.find(matchesTarget);
      if (foundActive) return foundActive;
    }
  }

  return null;
}

export async function verifyDriveFileAccess(
  caller: CallerContext,
  driveFileId: string,
  mode: 'read' | 'write'
): Promise<{ allowed: boolean; recordType?: string; ownerUid?: string; staffId?: string }> {
  if (caller.isAdmin) {
    return { allowed: true, recordType: 'admin' };
  }

  // Check certificates using rule-compliant scoped queries
  const cert = await findScopedRecordByDriveFileId('certificates', ['driveFileId'], driveFileId, caller, mode);
  if (cert) {
    if (mode === 'write') {
      const writeAllowed = cert.uid === caller.uid || (Boolean(caller.staffId) && cert.staffId === caller.staffId);
      return {
        allowed: writeAllowed,
        recordType: 'certificate',
        ownerUid: String(cert.uid || ''),
        staffId: String(cert.staffId || ''),
      };
    }
    const readAllowed =
      cert.uid === caller.uid ||
      (Boolean(caller.staffId) && cert.staffId === caller.staffId) ||
      (caller.role === 'L1' && cert.centerId === caller.centerId) ||
      (caller.role === 'L2' && cert.departmentId === caller.departmentId);
    return {
      allowed: readAllowed,
      recordType: 'certificate',
      ownerUid: String(cert.uid || ''),
      staffId: String(cert.staffId || ''),
    };
  }

  // Fallback check: competency certificate linked directly on caller's competencies record
  if (caller.staffId) {
    const compDoc = await firestoreGetAsCaller(`competencies/${caller.staffId}`, caller.idToken).catch(() => null);
    if (compDoc && Array.isArray(compDoc.items)) {
      const hasMatch = compDoc.items.some(
        (it: any) => it && String(it.certificateDriveFileId || '') === driveFileId
      );
      if (hasMatch) {
        return {
          allowed: true,
          recordType: 'competency_certificate',
          ownerUid: String(compDoc.uid || caller.uid),
          staffId: caller.staffId,
        };
      }
    }
  }

  // Check display profile photos
  const displayPhoto = await findScopedRecordByDriveFileId(
    'profile_photos',
    ['displayDriveFileId'],
    driveFileId,
    caller,
    mode,
    true
  );
  if (displayPhoto) {
    if (mode === 'write') {
      const writeAllowed =
        displayPhoto.uid === caller.uid || (Boolean(caller.staffId) && displayPhoto.staffId === caller.staffId);
      return {
        allowed: writeAllowed,
        recordType: 'profile_photo',
        ownerUid: String(displayPhoto.uid || ''),
        staffId: String(displayPhoto.staffId || ''),
      };
    }
    const readAllowed =
      displayPhoto.uid === caller.uid ||
      (Boolean(caller.staffId) && displayPhoto.staffId === caller.staffId) ||
      (caller.role === 'L1' && displayPhoto.centerId === caller.centerId) ||
      (caller.role === 'L2' && displayPhoto.departmentId === caller.departmentId) ||
      ((caller.role === 'L3' || caller.role === 'L4') && displayPhoto.status === 'active');
    return {
      allowed: readAllowed,
      recordType: 'profile_photo',
      ownerUid: String(displayPhoto.uid || ''),
      staffId: String(displayPhoto.staffId || ''),
    };
  }

  // Check original profile photos (strictly owner or Admin)
  const originalPhoto = await findScopedRecordByDriveFileId(
    'profile_photos',
    ['originalDriveFileId'],
    driveFileId,
    caller,
    mode
  );
  if (originalPhoto) {
    const isOwner =
      originalPhoto.uid === caller.uid || (Boolean(caller.staffId) && originalPhoto.staffId === caller.staffId);
    return {
      allowed: isOwner,
      recordType: 'profile_photo_original',
      ownerUid: String(originalPhoto.uid || ''),
      staffId: String(originalPhoto.staffId || ''),
    };
  }

  // Check generated profiles PDFs
  const gen = await findScopedRecordByDriveFileId('generated_profiles', ['driveFileId'], driveFileId, caller, mode);
  if (gen) {
    if (mode === 'write') {
      return {
        allowed: gen.uid === caller.uid,
        recordType: 'generated_profile',
        ownerUid: String(gen.uid || ''),
        staffId: String(gen.staffId || ''),
      };
    }
    const readAllowed =
      gen.uid === caller.uid ||
      (Boolean(caller.staffId) && gen.staffId === caller.staffId) ||
      (caller.role === 'L1' && gen.centerId === caller.centerId) ||
      (caller.role === 'L2' && gen.departmentId === caller.departmentId);
    return {
      allowed: readAllowed,
      recordType: 'generated_profile',
      ownerUid: String(gen.uid || ''),
      staffId: String(gen.staffId || ''),
    };
  }

  return { allowed: false };
}
