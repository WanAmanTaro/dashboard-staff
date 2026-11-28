import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  limit,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from '../lib/firebase';
import {
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_COMPETENCY_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  IAB_CERT_DEFINITIONS,
  IAB_MODULE_CONTRIBUTIONS,
  computeProfileCompletion,
  computeYearsOfService,
  getHighestQualificationFromList,
  normalizeGenderShort,
} from '../lib/constants';
import type {
  AccountStatus,
  AuditLog,
  Certificate,
  CompetencyItem,
  CompetencyRecord,
  ConsultationRecord,
  Department,
  DriveSetting,
  ExpertiseRecord,
  GeneratedProfile,
  IabCertItem,
  IabCompetencyRecord,
  IabModuleContribution,
  NpqelSupervisionRecord,
  OrganizationCenter,
  ProfilePhoto,
  ProgramEvaluationRecord,
  ProgramManagementRecord,
  Publication,
  Qualification,
  StaffFunctionsRecord,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
  ThinkTankRecord,
  TrainingRecord,
  UserAccount,
  UserInvitation,
  UserRole,
} from '../types/iab';

export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input.trim().toLowerCase());
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export function makeRecordId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${rand}`;
}

export async function logAudit(params: {
  actionType: string;
  targetType: string;
  targetId: string;
  outcome: 'success' | 'failure';
  details: string;
  staffId?: string;
}): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  const logId = makeRecordId('LOG');
  const path = `audit_logs/${logId}`;
  try {
    await setDoc(doc(db, 'audit_logs', logId), {
      id: logId,
      actorUid: user.uid,
      actorEmail: (user.email || 'unknown').slice(0, 200),
      staffId: (params.staffId || '').slice(0, 64),
      actionType: params.actionType.slice(0, 80),
      targetType: params.targetType.slice(0, 80),
      targetId: params.targetId.slice(0, 128),
      outcome: params.outcome,
      details: params.details.slice(0, 500),
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('Audit log write warning:', err);
  }
}

// =========================================================
// SYSTEM SETTINGS & DEFAULT REFERENCE STRUCTURE
// =========================================================
export async function getSystemSettings(): Promise<SystemSetting | null> {
  const path = 'system_settings/main';
  try {
    const snap = await getDoc(doc(db, 'system_settings', 'main'));
    return snap.exists() ? (snap.data() as SystemSetting) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveSystemSettings(data: {
  systemName: string;
  institutionName: string;
  expertiseCategories: string[];
  competencyCategories: string[];
  applicationSkillCategories?: string[];
  knowledgeSkillCategories?: string[];
  institutionCategories?: string[];
  publicationYears?: string[];
  iabModules?: string[];
}): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = 'system_settings/main';
  const cleanList = (arr: string[] | undefined, max: number) =>
    Array.from(new Set((arr || []).map((s) => String(s).trim().slice(0, 160)).filter(Boolean))).slice(0, max);

  const safeExp = cleanList(data.expertiseCategories, 60);
  const safeApp = data.applicationSkillCategories
    ? cleanList(data.applicationSkillCategories, 60)
    : undefined;
  const safeKnow = data.knowledgeSkillCategories
    ? cleanList(data.knowledgeSkillCategories, 60)
    : undefined;
  const safeInst = data.institutionCategories
    ? cleanList(data.institutionCategories, 120)
    : undefined;
  const safeYears = data.publicationYears
    ? cleanList(data.publicationYears, 40)
    : undefined;
  const safeIabModules = data.iabModules
    ? cleanList(data.iabModules, 100)
    : undefined;
  const mergedComp =
    safeApp || safeKnow
      ? cleanList([...(safeApp || []), ...(safeKnow || [])], 120)
      : cleanList(data.competencyCategories, 120);

  try {
    const existing = await getDoc(doc(db, 'system_settings', 'main'));
    if (existing.exists()) {
      const updatePayload: Record<string, unknown> = {
        systemName: data.systemName.slice(0, 160),
        institutionName: data.institutionName.slice(0, 160),
        expertiseCategories: safeExp,
        competencyCategories: mergedComp,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      if (safeApp) updatePayload.applicationSkillCategories = safeApp;
      if (safeKnow) updatePayload.knowledgeSkillCategories = safeKnow;
      if (safeInst) updatePayload.institutionCategories = safeInst;
      if (safeYears) updatePayload.publicationYears = safeYears;
      if (safeIabModules) updatePayload.iabModules = safeIabModules;
      await updateDoc(doc(db, 'system_settings', 'main'), updatePayload);
    } else {
      await setDoc(doc(db, 'system_settings', 'main'), {
        id: 'main',
        systemName: data.systemName.slice(0, 160),
        institutionName: data.institutionName.slice(0, 160),
        expertiseCategories: safeExp,
        competencyCategories: mergedComp,
        applicationSkillCategories: safeApp || DEFAULT_APPLICATION_SKILL_CATEGORIES,
        knowledgeSkillCategories: safeKnow || DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
        institutionCategories: safeInst || DEFAULT_INSTITUTION_CATEGORIES,
        publicationYears: safeYears || DEFAULT_PUBLICATION_YEARS,
        iabModules: safeIabModules || DEFAULT_IAB_MODULES,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    }
    await logAudit({
      actionType: 'UPDATE_SYSTEM_SETTINGS',
      targetType: 'system_settings',
      targetId: 'main',
      outcome: 'success',
      details: 'Mengemas kini tetapan sistem dan katalog kategori.',
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function ensureInitialSystemDefaults(adminUid: string): Promise<void> {
  try {
    const sysSnap = await getDoc(doc(db, 'system_settings', 'main'));
    if (!sysSnap.exists()) {
      await setDoc(doc(db, 'system_settings', 'main'), {
        id: 'main',
        systemName: 'Sistem Pengurusan Modal Insan dan Kepakaran IAB',
        institutionName: 'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia',
        expertiseCategories: DEFAULT_EXPERTISE_CATEGORIES,
        competencyCategories: DEFAULT_COMPETENCY_CATEGORIES,
        applicationSkillCategories: DEFAULT_APPLICATION_SKILL_CATEGORIES,
        knowledgeSkillCategories: DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
        institutionCategories: DEFAULT_INSTITUTION_CATEGORIES,
        publicationYears: DEFAULT_PUBLICATION_YEARS,
        iabModules: DEFAULT_IAB_MODULES,
        status: 'active',
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: adminUid,
        updatedBy: adminUid,
      });
    }

    const driveSnap = await getDoc(doc(db, 'drive_settings', 'main'));
    if (!driveSnap.exists()) {
      await setDoc(doc(db, 'drive_settings', 'main'), {
        id: 'main',
        status: 'pending_configuration',
        connectedEmail: '',
        rootFolderId: '',
        folderIds: {},
        lastConnectedAt: '',
        lastUploadAt: '',
        uploadedDocumentsCount: 0,
        uploadedPhotosCount: 0,
        maxPhotoSizeMb: 5,
        maxCertSizeMb: 15,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: adminUid,
        updatedBy: adminUid,
      });
    }
  } catch (err) {
    console.warn('Initial system defaults note:', err);
  }
}

// =========================================================
// ORGANIZATIONS & DEPARTMENTS
// =========================================================
export function subscribeOrganizations(onData: (items: OrganizationCenter[]) => void) {
  const path = 'organizations';
  return onSnapshot(
    query(collection(db, path), orderBy('name', 'asc')),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as OrganizationCenter));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeDepartments(onData: (items: Department[]) => void) {
  const path = 'departments';
  return onSnapshot(
    query(collection(db, path), orderBy('name', 'asc')),
    (snap) => {
      onData(snap.docs.map((d) => d.data() as Department));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function saveOrganization(org: Omit<OrganizationCenter, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>, isNew: boolean) {
  const uid = auth.currentUser?.uid || 'system';
  const path = `organizations/${org.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'organizations', org.id), {
        ...org,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      await updateDoc(doc(db, 'organizations', org.id), {
        code: org.code,
        name: org.name,
        headName: org.headName,
        headUid: org.headUid,
        location: org.location,
        status: org.status,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    await logAudit({
      actionType: isNew ? 'CREATE_ORGANIZATION' : 'UPDATE_ORGANIZATION',
      targetType: 'organizations',
      targetId: org.id,
      outcome: 'success',
      details: `${isNew ? 'Menambah' : 'Mengemas kini'} Pusat: ${org.name}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function saveDepartment(dept: Omit<Department, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>, isNew: boolean) {
  const uid = auth.currentUser?.uid || 'system';
  const path = `departments/${dept.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'departments', dept.id), {
        ...dept,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      await updateDoc(doc(db, 'departments', dept.id), {
        centerId: dept.centerId,
        code: dept.code,
        name: dept.name,
        headName: dept.headName,
        headUid: dept.headUid,
        status: dept.status,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    await logAudit({
      actionType: isNew ? 'CREATE_DEPARTMENT' : 'UPDATE_DEPARTMENT',
      targetType: 'departments',
      targetId: dept.id,
      outcome: 'success',
      details: `${isNew ? 'Menambah' : 'Mengemas kini'} Jabatan: ${dept.name}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// =========================================================
// USERS & INVITATIONS (ADMIN + AUTH)
// =========================================================
export function subscribeUsers(onData: (users: UserAccount[]) => void) {
  const path = 'users';
  return onSnapshot(
    query(collection(db, path), orderBy('displayName', 'asc')),
    (snap) => onData(snap.docs.map((d) => d.data() as UserAccount)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export function subscribeInvitations(onData: (invites: UserInvitation[]) => void) {
  const path = 'invitations';
  return onSnapshot(
    query(collection(db, path), orderBy('fullName', 'asc')),
    (snap) => onData(snap.docs.map((d) => d.data() as UserInvitation)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function createInvitation(params: {
  email: string;
  fullName: string;
  staffId: string;
  role: UserRole;
  isAdmin: boolean;
  centerId: string;
  departmentId: string;
}): Promise<string> {
  const uid = auth.currentUser?.uid || 'system';
  const normalizedEmail = params.email.trim().toLowerCase();
  const inviteId = await sha256Hex(normalizedEmail);
  const path = `invitations/${inviteId}`;
  try {
    await setDoc(doc(db, 'invitations', inviteId), {
      id: inviteId,
      email: normalizedEmail,
      fullName: params.fullName.trim().slice(0, 160),
      staffId: params.staffId.trim().slice(0, 64),
      role: params.role,
      isAdmin: params.isAdmin,
      centerId: params.centerId,
      departmentId: params.departmentId,
      status: 'invited',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });
    await logAudit({
      actionType: 'CREATE_INVITATION',
      targetType: 'invitations',
      targetId: inviteId,
      staffId: params.staffId,
      outcome: 'success',
      details: `Mendaftar jemputan pengguna ${normalizedEmail} (${params.role})`,
    });
    return inviteId;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function adminUpdateUserAccount(
  targetUid: string,
  updates: {
    displayName?: string;
    role?: UserRole;
    isAdmin?: boolean;
    status?: AccountStatus;
    centerId?: string;
    departmentId?: string;
    staffId?: string;
  },
  actionType = 'UPDATE_USER_ACCOUNT'
): Promise<void> {
  const actorUid = auth.currentUser?.uid || 'system';
  const path = `users/${targetUid}`;
  const effectiveUpdates = { ...updates };
  if (effectiveUpdates.role === 'L0') {
    effectiveUpdates.isAdmin = true;
  }
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      ...effectiveUpdates,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });

    if (effectiveUpdates.role) {
      let targetStaffId = effectiveUpdates.staffId || '';
      if (!targetStaffId) {
        const uSnap = await getDoc(doc(db, 'users', targetUid)).catch(() => null);
        if (uSnap && uSnap.exists()) {
          targetStaffId = String(uSnap.data().staffId || '');
        }
      }
      if (targetStaffId) {
        await updateDoc(doc(db, 'staff_profiles', targetStaffId), {
          role: effectiveUpdates.role,
          updatedAt: serverTimestamp(),
          updatedBy: actorUid,
        }).catch(() => {});
      }
    }

    await logAudit({
      actionType,
      targetType: 'users',
      targetId: targetUid,
      staffId: effectiveUpdates.staffId || '',
      outcome: 'success',
      details: `Kemas kini akaun (${JSON.stringify(effectiveUpdates)})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// =========================================================
// STAFF PROFILES (SCOPED BY RBAC)
// =========================================================
export function subscribeScopedStaffProfiles(
  user: UserAccount,
  onData: (profiles: StaffProfile[]) => void
) {
  const col = collection(db, 'staff_profiles');
  let q;
  if (user.isAdmin) {
    q = query(col);
  } else if (user.role === 'L1' && user.centerId) {
    q = query(col, where('centerId', '==', user.centerId));
  } else if (user.role === 'L2' && user.departmentId) {
    q = query(col, where('departmentId', '==', user.departmentId));
  } else if (user.role === 'L3' || user.role === 'L4') {
    q = query(col, where('status', '==', 'active'));
  } else {
    q = query(col, where('uid', '==', user.uid));
  }

  return onSnapshot(
    q,
    (snap) => {
      const list = snap.docs.map((d) => d.data() as StaffProfile);
      list.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
      onData(list);
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'staff_profiles')
  );
}

function buildScopedStaffSubQuery(
  collectionName: 'qualifications' | 'publications' | 'certificates',
  staffId: string,
  viewer?: UserAccount | null
) {
  const col = collection(db, collectionName);
  if (!viewer || viewer.isAdmin || viewer.staffId === staffId) {
    return query(col, where('staffId', '==', staffId));
  }
  if (viewer.role === 'L1' && viewer.centerId) {
    return query(col, where('centerId', '==', viewer.centerId));
  }
  if (viewer.role === 'L2' && viewer.departmentId) {
    return query(col, where('departmentId', '==', viewer.departmentId));
  }
  if ((viewer.role === 'L3' || viewer.role === 'L4') && collectionName !== 'certificates') {
    return query(col, where('status', '==', 'active'));
  }
  return null;
}

export async function getStaffProfileBundle(
  staffId: string,
  viewer?: UserAccount | null
): Promise<{
  profile: StaffProfile | null;
  pii: StaffPrivatePII | null;
  qualifications: Qualification[];
  expertise: ExpertiseRecord | null;
  competencies: CompetencyRecord | null;
  iabCompetencies: IabCompetencyRecord | null;
  publications: Publication[];
  certificates: Certificate[];
  photo: ProfilePhoto | null;
}> {
  try {
    const profileSnap = await getDoc(doc(db, 'staff_profiles', staffId));
    const profile = profileSnap.exists() ? (profileSnap.data() as StaffProfile) : null;

    const canAccessPiiAndCerts =
      !viewer ||
      viewer.isAdmin ||
      viewer.staffId === staffId ||
      (viewer.role === 'L1' && Boolean(viewer.centerId)) ||
      (viewer.role === 'L2' && Boolean(viewer.departmentId));

    let pii: StaffPrivatePII | null = null;
    if (canAccessPiiAndCerts) {
      try {
        const piiSnap = await getDoc(doc(db, 'staff_profiles', staffId, 'private', 'pii'));
        pii = piiSnap.exists() ? (piiSnap.data() as StaffPrivatePII) : null;
      } catch {
        pii = null; // Restricted PII if caller lacks scope
      }
    }

    const qualQuery = buildScopedStaffSubQuery('qualifications', staffId, viewer);
    const pubQuery = buildScopedStaffSubQuery('publications', staffId, viewer);
    const certQuery = canAccessPiiAndCerts
      ? buildScopedStaffSubQuery('certificates', staffId, viewer)
      : null;

    const [qualSnap, expSnap, compSnap, iabCompSnap, pubSnap, certSnap, photoSnap] = await Promise.all([
      qualQuery ? getDocs(qualQuery) : Promise.resolve(null),
      getDoc(doc(db, 'expertise', staffId)).catch(() => null),
      getDoc(doc(db, 'competencies', staffId)).catch(() => null),
      getDoc(doc(db, 'iab_competencies', staffId)).catch(() => null),
      pubQuery ? getDocs(pubQuery) : Promise.resolve(null),
      certQuery ? getDocs(certQuery).catch(() => null) : Promise.resolve(null),
      getDoc(doc(db, 'profile_photos', staffId)).catch(() => null),
    ]);

    return {
      profile,
      pii,
      qualifications: qualSnap
        ? qualSnap.docs
            .map((d) => d.data() as Qualification)
            .filter((q) => q.staffId === staffId && q.status === 'active')
        : [],
      expertise: expSnap && expSnap.exists() ? (expSnap.data() as ExpertiseRecord) : null,
      competencies: compSnap && compSnap.exists() ? (compSnap.data() as CompetencyRecord) : null,
      iabCompetencies:
        iabCompSnap && iabCompSnap.exists() ? (iabCompSnap.data() as IabCompetencyRecord) : null,
      publications: pubSnap
        ? pubSnap.docs
            .map((d) => d.data() as Publication)
            .filter((p) => p.staffId === staffId && p.status === 'active')
        : [],
      certificates: certSnap
        ? certSnap.docs
            .map((d) => d.data() as Certificate)
            .filter((c) => c.staffId === staffId && c.status === 'active')
        : [],
      photo: photoSnap && photoSnap.exists() ? (photoSnap.data() as ProfilePhoto) : null,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, `staff_profiles/${staffId}`);
  }
}

export async function saveFullStaffProfile(params: {
  profile: Omit<StaffProfile, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  pii: Omit<StaffPrivatePII, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  expertise: Omit<ExpertiseRecord, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  competencies: Omit<CompetencyRecord, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  qualificationsCount: number;
  publicationsCount: number;
  certificatesCount: number;
}): Promise<void> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) {
    throw new Error('Sesi pengesahan telah tamat. Sila log masuk semula sebelum menyimpan profil.');
  }
  const staffId = params.profile.staffId;
  const { completionPercent, missingSections } = computeProfileCompletion({
    profile: params.profile,
    pii: params.pii,
    qualificationsCount: params.qualificationsCount,
    expertise: params.expertise,
    competencies: params.competencies,
    publicationsCount: params.publicationsCount,
    certificatesCount: params.certificatesCount,
  });

  const sanitizeStringList = (arr: string[] | undefined, maxItems: number) =>
    (arr || [])
      .map((s) => String(s).trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, maxItems);

  const safeCenterId = String(params.profile.centerId || '').slice(0, 64);
  const safeDepartmentId = String(params.profile.departmentId || '').slice(0, 64);
  const digitalCompNames = sanitizeStringList(
    (params.competencies.items || []).map((i) => i.categoryName),
    60
  );
  const safeKeywords = sanitizeStringList(params.expertise.keywords, 30);

  const summarizeFieldVal = (v: unknown) => {
    if (Array.isArray(v)) {
      const first = v[0];
      return {
        t: 'list',
        len: v.length,
        firstType: typeof first,
        firstLen: typeof first === 'string' ? first.length : null,
      };
    }
    if (typeof v === 'string') return { t: 's', len: v.length };
    if (typeof v === 'boolean' || typeof v === 'number') return { t: typeof v, val: v };
    return { t: v === null ? 'null' : typeof v };
  };

  const buildPermissionDiag = async (
    op: OperationType,
    targetRefPath: string,
    payload: Record<string, unknown>,
    expectedPayloadKeys: string[],
    expectedFullKeys: string[],
    existingData?: Record<string, unknown> | null,
    allowedExtraFullKeys: string[] = []
  ): Promise<string> => {
    const keys = Object.keys(payload);
    const missingKeys = expectedPayloadKeys.filter((k) => !keys.includes(k));
    const extraKeys = keys.filter((k) => !expectedPayloadKeys.includes(k));
    let userGate: Record<string, unknown> = { fetched: false };
    try {
      const uSnap = await getDocFromServer(doc(db, 'users', actorUid));
      if (uSnap.exists()) {
        const u = uSnap.data() as Record<string, unknown>;
        userGate = {
          fetched: true,
          uidMatches: u.uid === actorUid,
          status: u.status ?? null,
          isAdmin: u.isAdmin ?? null,
          role: u.role ?? null,
          staffIdMatches: u.staffId === staffId,
          userStaffIdLen: typeof u.staffId === 'string' ? u.staffId.length : null,
          hasCreatedAt: 'createdAt' in u,
          userKeysCount: Object.keys(u).length,
        };
      } else {
        userGate = { fetched: true, exists: false };
      }
    } catch {
      userGate = { fetched: false };
    }
    const existingKeys = existingData ? Object.keys(existingData) : [];
    const allowedAllKeys = [...expectedFullKeys, ...allowedExtraFullKeys];
    const existingGate = existingData
      ? {
          uidMatchesActor: existingData.uid === actorUid,
          uidIsEmpty: existingData.uid === '',
          idMatchesStaffId: existingData.id === staffId,
          staffIdMatches: existingData.staffId === staffId,
          hasCreatedAt: 'createdAt' in existingData,
          createdByLen: typeof existingData.createdBy === 'string' ? existingData.createdBy.length : null,
          keyCount: existingKeys.length,
          missingFullKeys: expectedFullKeys.filter((k) => !existingKeys.includes(k)),
          extraFullKeys: existingKeys.filter((k) => !allowedAllKeys.includes(k)),
        }
      : null;

    let serverProbe: Record<string, unknown> | null = null;
    let minProfileUpdateProbe: string | null = null;
    const failingFields: Record<string, string> = {};
    const failingFieldStats: Record<string, unknown> = {};

    if (targetRefPath === `staff_profiles/${staffId}` && op === OperationType.UPDATE) {
      const pRef = doc(db, 'staff_profiles', staffId);
      try {
        const sSnap = await getDocFromServer(pRef);
        if (sSnap.exists()) {
          const sd = sSnap.data() as Record<string, unknown>;
          const sKeys = Object.keys(sd);
          serverProbe = {
            fetched: true,
            uidMatchesActor: sd.uid === actorUid,
            idMatchesStaffId: sd.id === staffId,
            staffIdMatches: sd.staffId === staffId,
            createdByMatchesActor: sd.createdBy === actorUid,
            hasCreatedAt: 'createdAt' in sd,
            keyCount: sKeys.length,
            missingFullKeys: expectedFullKeys.filter((k) => !sKeys.includes(k)),
            extraFullKeys: sKeys.filter((k) => !allowedAllKeys.includes(k)),
          };
        } else {
          serverProbe = { fetched: true, exists: false };
        }
      } catch (e: unknown) {
        serverProbe = { fetched: false, err: e instanceof Error ? e.message : String(e) };
      }

      try {
        await updateDoc(pRef, { updatedAt: serverTimestamp(), updatedBy: actorUid });
        minProfileUpdateProbe = 'ok';
      } catch (e: unknown) {
        minProfileUpdateProbe = e instanceof Error ? e.message : String(e);
      }

      if (minProfileUpdateProbe === 'ok') {
        for (const [k, v] of Object.entries(payload)) {
          if (k === 'updatedAt' || k === 'updatedBy') continue;
          try {
            await updateDoc(pRef, {
              [k]: v,
              updatedAt: serverTimestamp(),
              updatedBy: actorUid,
            });
          } catch (e: unknown) {
            failingFields[k] = e instanceof Error ? e.message : String(e);
            failingFieldStats[k] = summarizeFieldVal(v);
          }
        }
      }
    }

    return JSON.stringify({
      op,
      emailVerified: Boolean(auth.currentUser?.emailVerified),
      missingKeys,
      extraKeys,
      userGate,
      existingGate,
      serverProbe,
      minProfileUpdateProbe,
      failingFields,
      failingFieldStats,
    });
  };

  const expectedProfileFullKeys = [
    'id', 'staffId', 'uid', 'fullName', 'officialEmail', 'position', 'grade', 'scheme',
    'isLecturer', 'centerId', 'centerName', 'departmentId', 'departmentName',
    'unit', 'orgPosition', 'headOfCenter', 'headOfDepartment',
    'highestQualification', 'primaryExpertise', 'secondaryExpertise',
    'digitalCompetencies', 'expertiseKeywords', 'completionPercent', 'missingSections',
    'hasPhoto', 'photoDisplayUrl', 'certificateCount', 'publicationCount',
    'status', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  ];

  // 1. staff_profiles/{staffId}
  const profilePath = `staff_profiles/${staffId}`;
  let profileOp: OperationType = OperationType.GET;
  let profileWritePayload: Record<string, unknown> = {};
  let existingProfileData: Record<string, unknown> | null = null;
  try {
    const profileRef = doc(db, 'staff_profiles', staffId);
    const existingProfile = await getDocFromServer(profileRef).catch(() => getDoc(profileRef));
    const validRoles: UserRole[] = ['L0', 'L1', 'L2', 'L3', 'L4', 'L5'];
    const profileMutableFields: Record<string, unknown> = {
      fullName: String(params.profile.fullName || '').trim().slice(0, 160),
      officialEmail: String(params.profile.officialEmail || '').trim().toLowerCase().slice(0, 200),
      position: String(params.profile.position || '').trim().slice(0, 120),
      grade: String(params.profile.grade || '').trim().slice(0, 40),
      kupGrade: String(params.profile.kupGrade || 'TIDAK BERKENAAN').trim().slice(0, 40),
      scheme: String(params.profile.scheme || '').trim().slice(0, 80),
      isLecturer: Boolean(params.profile.isLecturer),
      centerId: safeCenterId,
      centerName: String(params.profile.centerName || '').trim().slice(0, 160),
      departmentId: safeDepartmentId,
      departmentName: String(params.profile.departmentName || '').trim().slice(0, 160),
      unit: String(params.profile.unit || '').trim().slice(0, 120),
      orgPosition: String(params.profile.orgPosition || '').trim().slice(0, 120),
      headOfCenter: String(params.profile.headOfCenter || '').trim().slice(0, 160),
      headOfDepartment: String(params.profile.headOfDepartment || '').trim().slice(0, 160),
      highestQualification: String(params.profile.highestQualification || '').trim().slice(0, 80),
      primaryExpertise: String(
        params.expertise.primaryExpertise || params.profile.primaryExpertise || ''
      )
        .trim()
        .slice(0, 160),
      secondaryExpertise: String(
        params.expertise.secondaryExpertise || params.profile.secondaryExpertise || ''
      )
        .trim()
        .slice(0, 160),
      digitalCompetencies: digitalCompNames,
      expertiseKeywords: safeKeywords,
      completionPercent: Math.max(0, Math.min(100, Math.round(Number(completionPercent) || 0))),
      missingSections: sanitizeStringList(missingSections, 12),
      hasPhoto: Boolean(params.profile.hasPhoto),
      photoDisplayUrl: String(params.profile.photoDisplayUrl || '').slice(0, 500),
      certificateCount: Math.max(
        0,
        Math.min(500, Math.round(Number(params.profile.certificateCount) || 0))
      ),
      publicationCount: Math.max(
        0,
        Math.min(500, Math.round(Number(params.profile.publicationCount) || 0))
      ),
      status:
        params.profile.status === 'inactive' || params.profile.status === 'draft'
          ? params.profile.status
          : ('active' as const),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (params.profile.role && validRoles.includes(params.profile.role)) {
      profileMutableFields.role = params.profile.role;
    }

    if (existingProfile.exists()) {
      profileOp = OperationType.UPDATE;
      existingProfileData = existingProfile.data() as Record<string, unknown>;
      if (!profileMutableFields.role && typeof existingProfileData.role === 'string' && validRoles.includes(existingProfileData.role as UserRole)) {
        profileMutableFields.role = existingProfileData.role;
      }
      const isClaimingUid = existingProfileData.uid === '' && Boolean(params.profile.uid);
      profileWritePayload = isClaimingUid
        ? { uid: String(params.profile.uid).slice(0, 128), ...profileMutableFields }
        : profileMutableFields;
      await updateDoc(profileRef, profileWritePayload);
    } else {
      profileOp = OperationType.CREATE;
      profileWritePayload = {
        id: staffId,
        staffId,
        uid: String(params.profile.uid || '').slice(0, 128),
        ...profileMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      };
      await setDoc(profileRef, profileWritePayload);
    }
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    if (baseMsg.toLowerCase().includes('permission')) {
      const diag = await buildPermissionDiag(
        profileOp,
        profilePath,
        profileWritePayload,
        profileOp === OperationType.CREATE ? expectedProfileFullKeys : Object.keys(profileWritePayload),
        expectedProfileFullKeys,
        existingProfileData,
        ['role', 'kupGrade']
      );
      handleFirestoreError(new Error(`${baseMsg} [diag:${diag}]`), profileOp, profilePath);
    }
    handleFirestoreError(err, profileOp, profilePath);
  }

  // 2. staff_profiles/{staffId}/private/pii
  const expectedPiiFullKeys = [
    'staffId', 'uid', 'centerId', 'departmentId', 'phone', 'gender', 'icNumber',
    'altContact', 'appointmentDate', 'serviceStatus', 'yearsOfService',
    'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  ];
  const piiPath = `staff_profiles/${staffId}/private/pii`;
  let piiOp: OperationType = OperationType.GET;
  let piiWritePayload: Record<string, unknown> = {};
  let existingPiiData: Record<string, unknown> | null = null;
  try {
    const piiRef = doc(db, 'staff_profiles', staffId, 'private', 'pii');
    const existingPii = await getDocFromServer(piiRef).catch(() => getDoc(piiRef));
    const piiMutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      phone: String(params.pii.phone || '').trim().slice(0, 40),
      gender: String(params.pii.gender || '').trim().slice(0, 30),
      icNumber: String(params.pii.icNumber || '').trim().slice(0, 24),
      altContact: String(params.pii.altContact || '').trim().slice(0, 160),
      appointmentDate: String(params.pii.appointmentDate || '').trim().slice(0, 32),
      serviceStatus: String(params.pii.serviceStatus || '').trim().slice(0, 60),
      yearsOfService: String(params.pii.appointmentDate || '').trim()
        ? computeYearsOfService(params.pii.appointmentDate)
        : Math.max(0, Math.min(80, Math.round(Number(params.pii.yearsOfService) || 0))),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    if (existingPii.exists()) {
      piiOp = OperationType.UPDATE;
      existingPiiData = existingPii.data() as Record<string, unknown>;
      const isClaimingUid = existingPiiData.uid === '' && Boolean(params.pii.uid);
      piiWritePayload = isClaimingUid
        ? { uid: String(params.pii.uid).slice(0, 128), ...piiMutableFields }
        : piiMutableFields;
      await updateDoc(piiRef, piiWritePayload);
    } else {
      piiOp = OperationType.CREATE;
      piiWritePayload = {
        staffId,
        uid: String(params.pii.uid || '').slice(0, 128),
        ...piiMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      };
      await setDoc(piiRef, piiWritePayload);
    }
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    if (baseMsg.toLowerCase().includes('permission')) {
      const diag = await buildPermissionDiag(
        piiOp,
        piiPath,
        piiWritePayload,
        piiOp === OperationType.CREATE ? expectedPiiFullKeys : Object.keys(piiWritePayload),
        expectedPiiFullKeys,
        existingPiiData
      );
      handleFirestoreError(new Error(`${baseMsg} [diag:${diag}]`), piiOp, piiPath);
    }
    handleFirestoreError(err, piiOp, piiPath);
  }

  // 3. expertise/{staffId}
  const expectedExpFullKeys = [
    'id', 'staffId', 'uid', 'centerId', 'departmentId', 'primaryExpertise', 'secondaryExpertise',
    'specializations', 'researchAreas', 'teachingAreas', 'trainingAreas', 'keywords',
    'teachingExp', 'managementExp', 'facilitatorExp', 'speakerExp', 'coachExp',
    'projectExp', 'professionalExp', 'status', 'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  ];
  const expPath = `expertise/${staffId}`;
  let expOp: OperationType = OperationType.GET;
  let expWritePayload: Record<string, unknown> = {};
  let existingExpData: Record<string, unknown> | null = null;
  try {
    const expRef = doc(db, 'expertise', staffId);
    const existingExp = await getDocFromServer(expRef).catch(() => getDoc(expRef));
    const expMutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      primaryExpertise: String(params.expertise.primaryExpertise || '').trim().slice(0, 160),
      secondaryExpertise: String(params.expertise.secondaryExpertise || '').trim().slice(0, 160),
      specializations: sanitizeStringList(params.expertise.specializations, 20),
      researchAreas: sanitizeStringList(params.expertise.researchAreas, 20),
      teachingAreas: sanitizeStringList(params.expertise.teachingAreas, 20),
      trainingAreas: sanitizeStringList(params.expertise.trainingAreas, 20),
      keywords: safeKeywords,
      teachingExp: String(params.expertise.teachingExp || '').trim().slice(0, 1500),
      managementExp: String(params.expertise.managementExp || '').trim().slice(0, 1500),
      facilitatorExp: String(params.expertise.facilitatorExp || '').trim().slice(0, 1500),
      speakerExp: String(params.expertise.speakerExp || '').trim().slice(0, 1500),
      coachExp: String(params.expertise.coachExp || '').trim().slice(0, 1500),
      projectExp: String(params.expertise.projectExp || '').trim().slice(0, 1500),
      professionalExp: String(params.expertise.professionalExp || '').trim().slice(0, 1500),
      status: params.expertise.status === 'draft' ? ('draft' as const) : ('active' as const),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    if (existingExp.exists()) {
      expOp = OperationType.UPDATE;
      existingExpData = existingExp.data() as Record<string, unknown>;
      const isClaimingUid = existingExpData.uid === '' && Boolean(params.expertise.uid);
      expWritePayload = isClaimingUid
        ? { uid: String(params.expertise.uid).slice(0, 128), ...expMutableFields }
        : expMutableFields;
      await updateDoc(expRef, expWritePayload);
    } else {
      expOp = OperationType.CREATE;
      expWritePayload = {
        id: staffId,
        staffId,
        uid: String(params.expertise.uid || '').slice(0, 128),
        ...expMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      };
      await setDoc(expRef, expWritePayload);
    }
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    if (baseMsg.toLowerCase().includes('permission')) {
      const diag = await buildPermissionDiag(
        expOp,
        expPath,
        expWritePayload,
        expOp === OperationType.CREATE ? expectedExpFullKeys : Object.keys(expWritePayload),
        expectedExpFullKeys,
        existingExpData
      );
      handleFirestoreError(new Error(`${baseMsg} [diag:${diag}]`), expOp, expPath);
    }
    handleFirestoreError(err, expOp, expPath);
  }

  // 4. competencies/{staffId}
  const expectedCompFullKeys = [
    'id', 'staffId', 'uid', 'centerId', 'departmentId', 'items', 'status',
    'createdAt', 'updatedAt', 'createdBy', 'updatedBy',
  ];
  const compPath = `competencies/${staffId}`;
  let compOp: OperationType = OperationType.GET;
  let compWritePayload: Record<string, unknown> = {};
  let existingCompData: Record<string, unknown> | null = null;
  try {
    const compRef = doc(db, 'competencies', staffId);
    const existingComp = await getDocFromServer(compRef).catch(() => getDoc(compRef));
    const safeItems = sanitizeCompetencyItems(params.competencies.items || []);
    const compMutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      items: safeItems,
      status: params.competencies.status === 'draft' ? ('draft' as const) : ('active' as const),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    if (existingComp.exists()) {
      compOp = OperationType.UPDATE;
      existingCompData = existingComp.data() as Record<string, unknown>;
      const isClaimingUid = existingCompData.uid === '' && Boolean(params.competencies.uid);
      compWritePayload = isClaimingUid
        ? { uid: String(params.competencies.uid).slice(0, 128), ...compMutableFields }
        : compMutableFields;
      await updateDoc(compRef, compWritePayload);
    } else {
      compOp = OperationType.CREATE;
      compWritePayload = {
        id: staffId,
        staffId,
        uid: String(params.competencies.uid || '').slice(0, 128),
        ...compMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      };
      await setDoc(compRef, compWritePayload);
    }
  } catch (err) {
    const baseMsg = err instanceof Error ? err.message : String(err);
    if (baseMsg.toLowerCase().includes('permission')) {
      const diag = await buildPermissionDiag(
        compOp,
        compPath,
        compWritePayload,
        compOp === OperationType.CREATE ? expectedCompFullKeys : Object.keys(compWritePayload),
        expectedCompFullKeys,
        existingCompData
      );
      handleFirestoreError(new Error(`${baseMsg} [diag:${diag}]`), compOp, compPath);
    }
    handleFirestoreError(err, compOp, compPath);
  }

  await logAudit({
    actionType: 'UPDATE_STAFF_PROFILE',
    targetType: 'staff_profiles',
    targetId: staffId,
    staffId,
    outcome: 'success',
    details: `Mengemas kini profil pegawai (${completionPercent}% lengkap)`,
  });
}

export function sanitizeCompetencyItems(items: CompetencyItem[]): CompetencyItem[] {
  return (items || [])
    .slice(0, 60)
    .map((item) => {
      const skillType = item.skillType === 'aplikasi' ? ('aplikasi' as const) : ('pengetahuan' as const);
      const hasCert = Boolean(item.hasCertificate);
      const hasValidity = skillType === 'aplikasi' && hasCert && Boolean(item.hasValidityPeriod);
      return {
        categoryId: String(item.categoryId || '').trim().slice(0, 80) || makeRecordId('CMP'),
        categoryName: String(item.categoryName || '').trim().slice(0, 160),
        skillType,
        level: (['Asas', 'Pertengahan', 'Lanjutan', 'Pakar'].includes(item.level)
          ? item.level
          : 'Pertengahan') as CompetencyItem['level'],
        years: Math.max(0, Math.min(60, Math.round(Number(item.years) || 0))),
        notes: String(item.notes || '').trim().slice(0, 300),
        hasCertificate: hasCert,
        certificateId: String(item.certificateId || '').slice(0, 128),
        certificateTitle: String(item.certificateTitle || '').trim().slice(0, 200),
        certificateDriveFileId: String(item.certificateDriveFileId || '').slice(0, 200),
        hasValidityPeriod: hasValidity,
        certificateStartDate: hasValidity ? String(item.certificateStartDate || '').trim().slice(0, 32) : '',
        certificateEndDate: hasValidity ? String(item.certificateEndDate || '').trim().slice(0, 32) : '',
        certificateValidityDuration: hasValidity
          ? String(item.certificateValidityDuration || '').trim().slice(0, 120)
          : skillType === 'aplikasi'
          ? 'TIDAK BERKENAAN'
          : '',
      };
    })
    .filter((i) => i.categoryName.length > 0);
}

export async function saveStaffCompetencies(params: {
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  items: CompetencyItem[];
  completion?: { completionPercent: number; missingSections: string[] };
}): Promise<CompetencyItem[]> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) {
    throw new Error('Sesi pengesahan telah tamat. Sila log masuk semula sebelum menyimpan kompetensi.');
  }
  const staffId = params.staffId;
  const compPath = `competencies/${staffId}`;
  const safeItems = sanitizeCompetencyItems(params.items);
  const safeCenterId = String(params.centerId || '').slice(0, 64);
  const safeDepartmentId = String(params.departmentId || '').slice(0, 64);

  let compOp: OperationType = OperationType.WRITE;
  try {
    const compRef = doc(db, 'competencies', staffId);
    const existingComp = await getDoc(compRef);
    const compMutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      items: safeItems,
      status: 'active' as const,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (existingComp.exists()) {
      compOp = OperationType.UPDATE;
      const existingData = existingComp.data() as Record<string, unknown>;
      const isClaimingUid = existingData.uid === '' && Boolean(params.uid);
      await updateDoc(
        compRef,
        isClaimingUid ? { uid: String(params.uid).slice(0, 128), ...compMutableFields } : compMutableFields
      );
    } else {
      compOp = OperationType.CREATE;
      await setDoc(compRef, {
        id: staffId,
        staffId,
        uid: String(params.uid || actorUid).slice(0, 128),
        ...compMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    // Best-effort sync to staff_profiles summary fields if profile doc exists
    const profileRef = doc(db, 'staff_profiles', staffId);
    const profileSnap = await getDoc(profileRef).catch(() => null);
    if (profileSnap && profileSnap.exists()) {
      const compNames = Array.from(new Set(safeItems.map((i) => i.categoryName))).slice(0, 60);
      const profileUpdate: Record<string, unknown> = {
        digitalCompetencies: compNames,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      };
      if (params.completion) {
        profileUpdate.completionPercent = Math.max(
          0,
          Math.min(100, Math.round(Number(params.completion.completionPercent) || 0))
        );
        profileUpdate.missingSections = (params.completion.missingSections || [])
          .map((s) => String(s).trim().slice(0, 160))
          .filter(Boolean)
          .slice(0, 12);
      }
      await updateDoc(profileRef, profileUpdate).catch(() => {});
    }

    await logAudit({
      actionType: 'UPDATE_STAFF_COMPETENCIES',
      targetType: 'competencies',
      targetId: staffId,
      staffId,
      outcome: 'success',
      details: `Mengemas kini ${safeItems.length} rekod kompetensi digital dan AI.`,
    });

    return safeItems;
  } catch (err) {
    handleFirestoreError(err, compOp, compPath);
  }
}

export function sanitizeIabCertifications(certs: IabCertItem[]): IabCertItem[] {
  const byKey = new Map<string, IabCertItem>();
  for (const c of certs || []) {
    if (c && c.key) byKey.set(c.key, c);
  }
  const normalized: IabCertItem[] = IAB_CERT_DEFINITIONS.map((def) => {
    const raw = byKey.get(def.key);
    const status = raw?.status === 'Ada' ? ('Ada' as const) : ('Tiada' as const);
    return {
      key: def.key,
      label: def.label,
      status,
      passYear: status === 'Ada' ? String(raw?.passYear || '').trim().slice(0, 24) : '',
    };
  });
  const map = new Map(normalized.map((c) => [c.key, c]));
  if (map.get('certifiedCoach')?.status !== 'Ada') {
    const mc = map.get('certifiedMasterCoach');
    if (mc) {
      mc.status = 'Tiada';
      mc.passYear = '';
    }
  }
  if (map.get('certifiedTrainer')?.status !== 'Ada') {
    const mt = map.get('certifiedMasterTrainer');
    if (mt) {
      mt.status = 'Tiada';
      mt.passYear = '';
    }
  }
  const prereqsForKonsultan: Array<IabCertItem['key']> = [
    'certifiedCoach',
    'certifiedMasterCoach',
    'certifiedTrainer',
    'certifiedMasterTrainer',
    'certifiedAccessor',
  ];
  const allFiveAda = prereqsForKonsultan.every((k) => map.get(k)?.status === 'Ada');
  if (!allFiveAda) {
    const kon = map.get('konsultanIab');
    if (kon) {
      kon.status = 'Tiada';
      kon.passYear = '';
    }
  }
  return normalized;
}

export function sanitizeIabModules(modules: IabModuleContribution[]): IabModuleContribution[] {
  return (modules || [])
    .slice(0, 100)
    .map((m) => ({
      id: String(m.id || '').trim().slice(0, 64) || makeRecordId('MOD'),
      moduleName: String(m.moduleName || '').trim().slice(0, 160),
      year: String(m.year || '').trim().slice(0, 16),
      contribution: (IAB_MODULE_CONTRIBUTIONS.includes(m.contribution as any)
        ? m.contribution
        : 'Ahli') as IabModuleContribution['contribution'],
      activeStatus: (m.activeStatus === 'Tidak Aktif' ? 'Tidak Aktif' : 'Aktif') as IabModuleContribution['activeStatus'],
    }))
    .filter((m) => m.moduleName.length > 0);
}

export async function getIabCompetency(staffId: string): Promise<IabCompetencyRecord | null> {
  const path = `iab_competencies/${staffId}`;
  try {
    const snap = await getDoc(doc(db, 'iab_competencies', staffId));
    return snap.exists() ? (snap.data() as IabCompetencyRecord) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveIabCompetencies(params: {
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  certifications: IabCertItem[];
  modules: IabModuleContribution[];
}): Promise<IabCompetencyRecord> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) {
    throw new Error('Sesi pengesahan telah tamat. Sila log masuk semula sebelum menyimpan Kompetensi IAB.');
  }
  const staffId = params.staffId;
  const path = `iab_competencies/${staffId}`;
  const safeCerts = sanitizeIabCertifications(params.certifications);
  const safeModules = sanitizeIabModules(params.modules);
  const safeCenterId = String(params.centerId || '').slice(0, 64);
  const safeDepartmentId = String(params.departmentId || '').slice(0, 64);

  let op: OperationType = OperationType.WRITE;
  try {
    const ref = doc(db, 'iab_competencies', staffId);
    const existing = await getDoc(ref);
    const mutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      certifications: safeCerts,
      modules: safeModules,
      status: 'active' as const,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    let finalUid = String(params.uid || actorUid).slice(0, 128);
    if (existing.exists()) {
      op = OperationType.UPDATE;
      const existingData = existing.data() as Record<string, unknown>;
      const isClaimingUid = existingData.uid === '' && Boolean(params.uid);
      finalUid = String(isClaimingUid ? params.uid : existingData.uid || finalUid).slice(0, 128);
      await updateDoc(
        ref,
        isClaimingUid ? { uid: finalUid, ...mutableFields } : mutableFields
      );
    } else {
      op = OperationType.CREATE;
      await setDoc(ref, {
        id: staffId,
        staffId,
        uid: finalUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    await logAudit({
      actionType: 'UPDATE_IAB_COMPETENCIES',
      targetType: 'iab_competencies',
      targetId: staffId,
      staffId,
      outcome: 'success',
      details: `Mengemas kini Kompetensi IAB (${safeCerts.filter((c) => c.status === 'Ada').length} pensijilan, ${safeModules.length} rekod modul).`,
    });

    return {
      id: staffId,
      staffId,
      uid: finalUid,
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      certifications: safeCerts,
      modules: safeModules,
      status: 'active',
      createdBy: actorUid,
      updatedBy: actorUid,
    };
  } catch (err) {
    handleFirestoreError(err, op, path);
  }
}

export async function addOrUpdateQualification(
  qual: Omit<Qualification, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  isNew: boolean,
  claimUid = false
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `qualifications/${qual.id}`;
  const safeQual = {
    id: String(qual.id || '').slice(0, 64),
    staffId: String(qual.staffId || '').slice(0, 64),
    uid: String(qual.uid || '').slice(0, 128),
    centerId: String(qual.centerId || '').slice(0, 64),
    departmentId: String(qual.departmentId || '').slice(0, 64),
    level: qual.level,
    institution: String(qual.institution || '').trim().slice(0, 200),
    fieldOfStudy: String(qual.fieldOfStudy || '').trim().slice(0, 200),
    graduationYear: String(qual.graduationYear || '').trim().slice(0, 10),
    notes: String(qual.notes || '').trim().slice(0, 500),
    status: qual.status === 'archived' ? ('archived' as const) : ('active' as const),
  };
  try {
    if (isNew) {
      await setDoc(doc(db, 'qualifications', safeQual.id), {
        ...safeQual,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      const updatePayload: Record<string, unknown> = {
        level: safeQual.level,
        institution: safeQual.institution,
        fieldOfStudy: safeQual.fieldOfStudy,
        graduationYear: safeQual.graduationYear,
        notes: safeQual.notes,
        status: safeQual.status,
        centerId: safeQual.centerId,
        departmentId: safeQual.departmentId,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      if (claimUid && safeQual.uid) {
        updatePayload.uid = safeQual.uid;
      }
      await updateDoc(doc(db, 'qualifications', safeQual.id), updatePayload);
    }
    // Sync highestQualification on staff_profiles
    const qSnap = await getDocs(
      query(collection(db, 'qualifications'), where('staffId', '==', safeQual.staffId))
    );
    const activeQuals = qSnap.docs
      .map((d) => d.data() as Qualification)
      .filter((x) => x.status === 'active');
    const highest = getHighestQualificationFromList(activeQuals);
    await updateDoc(doc(db, 'staff_profiles', safeQual.staffId), {
      highestQualification: highest,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteQualification(qualId: string, staffId: string): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  try {
    await deleteDoc(doc(db, 'qualifications', qualId));
    const qSnap = await getDocs(query(collection(db, 'qualifications'), where('staffId', '==', staffId)));
    const activeQuals = qSnap.docs.map((d) => d.data() as Qualification).filter((x) => x.status === 'active');
    const highest = getHighestQualificationFromList(activeQuals);
    await updateDoc(doc(db, 'staff_profiles', staffId), {
      highestQualification: highest,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `qualifications/${qualId}`);
  }
}

export async function addOrUpdatePublication(
  pub: Omit<Publication, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  isNew: boolean,
  claimUid = false
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `publications/${pub.id}`;
  const safePub = {
    id: String(pub.id || '').slice(0, 64),
    staffId: String(pub.staffId || '').slice(0, 64),
    uid: String(pub.uid || '').slice(0, 128),
    centerId: String(pub.centerId || '').slice(0, 64),
    departmentId: String(pub.departmentId || '').slice(0, 64),
    type: pub.type,
    title: String(pub.title || '').trim().slice(0, 240),
    publisherOrVenue: String(pub.publisherOrVenue || '').trim().slice(0, 200),
    year: String(pub.year || '').trim().slice(0, 10),
    achievement: String(pub.achievement || 'Tidak Berkenaan').trim().slice(0, 200) || 'Tidak Berkenaan',
    url: String(pub.url || '').trim().slice(0, 500),
    description: String(pub.description || '').trim().slice(0, 1000),
    status: pub.status === 'archived' ? ('archived' as const) : ('active' as const),
  };
  try {
    if (isNew) {
      await setDoc(doc(db, 'publications', safePub.id), {
        ...safePub,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      const updatePayload: Record<string, unknown> = {
        type: safePub.type,
        title: safePub.title,
        publisherOrVenue: safePub.publisherOrVenue,
        year: safePub.year,
        achievement: safePub.achievement,
        url: safePub.url,
        description: safePub.description,
        status: safePub.status,
        centerId: safePub.centerId,
        departmentId: safePub.departmentId,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      };
      if (claimUid && safePub.uid) {
        updatePayload.uid = safePub.uid;
      }
      await updateDoc(doc(db, 'publications', safePub.id), updatePayload);
    }
    const pSnap = await getDocs(
      query(collection(db, 'publications'), where('staffId', '==', safePub.staffId))
    );
    const count = pSnap.docs.filter((d) => (d.data() as Publication).status === 'active').length;
    await updateDoc(doc(db, 'staff_profiles', safePub.staffId), {
      publicationCount: count,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deletePublication(pubId: string, staffId: string): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  try {
    await deleteDoc(doc(db, 'publications', pubId));
    const pSnap = await getDocs(query(collection(db, 'publications'), where('staffId', '==', staffId)));
    const count = pSnap.docs.filter((d) => (d.data() as Publication).status === 'active').length;
    await updateDoc(doc(db, 'staff_profiles', staffId), {
      publicationCount: count,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `publications/${pubId}`);
  }
}

// =========================================================
// CERTIFICATES & PROFILE PHOTOS METADATA
// =========================================================
export async function saveCertificateMetadata(
  cert: Omit<Certificate, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  isNew: boolean
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `certificates/${cert.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'certificates', cert.id), {
        ...cert,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      await updateDoc(doc(db, 'certificates', cert.id), {
        title: cert.title,
        category: cert.category,
        certificateDate: cert.certificateDate,
        driveFileId: cert.driveFileId,
        driveFolderId: cert.driveFolderId,
        fileName: cert.fileName,
        mimeType: cert.mimeType,
        fileSize: cert.fileSize,
        status: cert.status,
        centerId: cert.centerId,
        departmentId: cert.departmentId,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }

    const cSnap = await getDocs(query(collection(db, 'certificates'), where('staffId', '==', cert.staffId)));
    const count = cSnap.docs.filter((d) => (d.data() as Certificate).status === 'active').length;
    await updateDoc(doc(db, 'staff_profiles', cert.staffId), {
      certificateCount: count,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});

    await logAudit({
      actionType: isNew ? 'UPLOAD_CERTIFICATE' : 'REPLACE_CERTIFICATE',
      targetType: 'certificates',
      targetId: cert.id,
      staffId: cert.staffId,
      outcome: 'success',
      details: `${isNew ? 'Muat naik' : 'Ganti'} sijil: ${cert.title} (${cert.category})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function deleteCertificateMetadata(certId: string, staffId: string, title: string): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  try {
    await deleteDoc(doc(db, 'certificates', certId));
    const cSnap = await getDocs(query(collection(db, 'certificates'), where('staffId', '==', staffId)));
    const count = cSnap.docs.filter((d) => (d.data() as Certificate).status === 'active').length;
    await updateDoc(doc(db, 'staff_profiles', staffId), {
      certificateCount: count,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});
    await logAudit({
      actionType: 'DELETE_CERTIFICATE',
      targetType: 'certificates',
      targetId: certId,
      staffId,
      outcome: 'success',
      details: `Memadam sijil: ${title}`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `certificates/${certId}`);
  }
}

export async function saveProfilePhotoMetadata(
  photo: Omit<ProfilePhoto, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `profile_photos/${photo.id}`;
  try {
    const existing = await getDoc(doc(db, 'profile_photos', photo.id));
    if (existing.exists()) {
      await updateDoc(doc(db, 'profile_photos', photo.id), {
        centerId: photo.centerId,
        departmentId: photo.departmentId,
        displayDriveFileId: photo.displayDriveFileId,
        displayFileName: photo.displayFileName,
        cropX: photo.cropX,
        cropY: photo.cropY,
        zoom: photo.zoom,
        alignX: photo.alignX,
        alignY: photo.alignY,
        status: photo.status,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } else {
      await setDoc(doc(db, 'profile_photos', photo.id), {
        ...photo,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    }

    await updateDoc(doc(db, 'staff_profiles', photo.staffId), {
      hasPhoto: true,
      photoDisplayUrl: photo.displayDriveFileId,
      updatedAt: serverTimestamp(),
      updatedBy: uid,
    }).catch(() => {});

    await logAudit({
      actionType: existing.exists() ? 'UPDATE_PROFILE_PHOTO' : 'UPLOAD_PROFILE_PHOTO',
      targetType: 'profile_photos',
      targetId: photo.id,
      staffId: photo.staffId,
      outcome: 'success',
      details: `Kemas kini gambar profil 1:1 (zoom ${photo.zoom.toFixed(2)}x, align ${photo.alignX}/${photo.alignY})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// =========================================================
// GENERATED PROFILES, AUDIT LOGS & DRIVE SETTINGS
// =========================================================
export async function recordGeneratedProfile(
  gen: Omit<GeneratedProfile, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `generated_profiles/${gen.id}`;
  try {
    await setDoc(doc(db, 'generated_profiles', gen.id), {
      ...gen,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: uid,
      updatedBy: uid,
    });
    await logAudit({
      actionType: 'GENERATE_PROFILE_PDF',
      targetType: 'generated_profiles',
      targetId: gen.id,
      staffId: gen.staffId,
      outcome: 'success',
      details: `Menjana PDF Profil ${gen.templateType.toUpperCase()} (${gen.fileName})`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export function subscribeAuditLogs(onData: (logs: AuditLog[]) => void) {
  const path = 'audit_logs';
  return onSnapshot(
    query(collection(db, path), orderBy('createdAt', 'desc'), limit(200)),
    (snap) => onData(snap.docs.map((d) => d.data() as AuditLog)),
    (err) => handleFirestoreError(err, OperationType.LIST, path)
  );
}

export async function syncDriveSettingsMetadata(
  statusData: Omit<DriveSetting, 'id' | 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = 'drive_settings/main';
  try {
    const existing = await getDoc(doc(db, 'drive_settings', 'main'));
    if (existing.exists()) {
      await updateDoc(doc(db, 'drive_settings', 'main'), {
        ...statusData,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } else {
      await setDoc(doc(db, 'drive_settings', 'main'), {
        id: 'main',
        ...statusData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    }
  } catch (err) {
    console.warn('Drive settings sync note:', err);
  }
}

export async function getAllCertificatesAdmin(): Promise<Certificate[]> {
  try {
    const snap = await getDocs(collection(db, 'certificates'));
    return snap.docs.map((d) => d.data() as Certificate);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'certificates');
  }
}

export async function getAllPhotosAdmin(): Promise<ProfilePhoto[]> {
  try {
    const snap = await getDocs(collection(db, 'profile_photos'));
    return snap.docs.map((d) => d.data() as ProfilePhoto);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'profile_photos');
  }
}

export async function getAllQualificationsForScope(user: UserAccount): Promise<Qualification[]> {
  const col = collection(db, 'qualifications');
  let q;
  if (user.isAdmin) q = query(col);
  else if (user.role === 'L1' && user.centerId) q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2' && user.departmentId) q = query(col, where('departmentId', '==', user.departmentId));
  else if (user.role === 'L3' || user.role === 'L4') q = query(col, where('status', '==', 'active'));
  else q = query(col, where('uid', '==', user.uid));

  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as Qualification).filter((x) => x.status === 'active');
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'qualifications');
  }
}

export async function getAllExpertiseForScope(user: UserAccount): Promise<ExpertiseRecord[]> {
  const col = collection(db, 'expertise');
  let q;
  if (user.isAdmin) q = query(col);
  else if (user.role === 'L1' && user.centerId) q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2' && user.departmentId) q = query(col, where('departmentId', '==', user.departmentId));
  else if (user.role === 'L3' || user.role === 'L4') q = query(col, where('status', '==', 'active'));
  else q = query(col, where('uid', '==', user.uid));

  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ExpertiseRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'expertise');
  }
}

export function subscribeScopedCompetencies(
  user: UserAccount,
  onData: (records: CompetencyRecord[]) => void
) {
  const col = collection(db, 'competencies');
  let q;
  if (user.isAdmin) q = query(col);
  else if (user.role === 'L1' && user.centerId) q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2' && user.departmentId) q = query(col, where('departmentId', '==', user.departmentId));
  else if (user.role === 'L3' || user.role === 'L4') q = query(col, where('status', '==', 'active'));
  else q = query(col, where('uid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as CompetencyRecord));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'competencies')
  );
}

export function subscribeScopedIabCompetencies(
  user: UserAccount,
  onData: (records: IabCompetencyRecord[]) => void
) {
  const col = collection(db, 'iab_competencies');
  let q;
  if (user.isAdmin) q = query(col);
  else if (user.role === 'L1' && user.centerId) q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2' && user.departmentId) q = query(col, where('departmentId', '==', user.departmentId));
  else if (user.role === 'L3' || user.role === 'L4') q = query(col, where('status', '==', 'active'));
  else q = query(col, where('uid', '==', user.uid));

  return onSnapshot(
    q,
    (snap) => {
      onData(snap.docs.map((d) => d.data() as IabCompetencyRecord));
    },
    (err) => handleFirestoreError(err, OperationType.LIST, 'iab_competencies')
  );
}

export async function getGenderMapForProfiles(
  profiles: StaffProfile[],
  viewer: UserAccount | null
): Promise<Record<string, 'L' | 'P' | ''>> {
  const map: Record<string, 'L' | 'P' | ''> = {};
  if (!viewer || (!viewer.isAdmin && viewer.role !== 'L1' && viewer.role !== 'L2')) {
    return map;
  }

  const eligible = profiles.filter((p) => {
    if (viewer.isAdmin) return true;
    if (viewer.role === 'L1') return Boolean(viewer.centerId && p.centerId === viewer.centerId);
    if (viewer.role === 'L2') return Boolean(viewer.departmentId && p.departmentId === viewer.departmentId);
    return p.staffId === viewer.staffId;
  });

  await Promise.all(
    eligible.map(async (p) => {
      try {
        const snap = await getDoc(doc(db, 'staff_profiles', p.staffId, 'private', 'pii'));
        if (snap.exists()) {
          const data = snap.data() as Partial<StaffPrivatePII>;
          map[p.staffId] = normalizeGenderShort(data.gender);
        }
      } catch {
        // Ignore individual PII read failure cleanly
      }
    })
  );

  return map;
}

// =========================================================
// STANDALONE EXPERTISE & TEACHING EXPERIENCE SAVE
// =========================================================
export async function saveStaffExpertise(params: {
  expertise: Omit<ExpertiseRecord, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>;
  completion?: { completionPercent: number; missingSections: string[] };
}): Promise<ExpertiseRecord> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) {
    throw new Error('Sesi pengesahan telah tamat. Sila log masuk semula sebelum menyimpan rekod.');
  }
  const staffId = params.expertise.staffId;
  const expPath = `expertise/${staffId}`;
  const sanitizeList = (arr: string[] | undefined, max: number) =>
    (arr || [])
      .map((s) => String(s).trim().slice(0, 160))
      .filter(Boolean)
      .slice(0, max);

  const safeCenterId = String(params.expertise.centerId || '').slice(0, 64);
  const safeDepartmentId = String(params.expertise.departmentId || '').slice(0, 64);
  const safeKeywords = sanitizeList(params.expertise.keywords, 30);
  const primaryExpertise = String(params.expertise.primaryExpertise || '').trim().slice(0, 160);
  const secondaryExpertise = String(params.expertise.secondaryExpertise || '').trim().slice(0, 160);

  const expMutableFields = {
    centerId: safeCenterId,
    departmentId: safeDepartmentId,
    primaryExpertise,
    secondaryExpertise,
    specializations: sanitizeList(params.expertise.specializations, 20),
    researchAreas: sanitizeList(params.expertise.researchAreas, 20),
    teachingAreas: sanitizeList(params.expertise.teachingAreas, 20),
    trainingAreas: sanitizeList(params.expertise.trainingAreas, 20),
    keywords: safeKeywords,
    teachingExp: String(params.expertise.teachingExp || '').trim().slice(0, 1500),
    managementExp: String(params.expertise.managementExp || '').trim().slice(0, 1500),
    facilitatorExp: String(params.expertise.facilitatorExp || '').trim().slice(0, 1500),
    speakerExp: String(params.expertise.speakerExp || '').trim().slice(0, 1500),
    coachExp: String(params.expertise.coachExp || '').trim().slice(0, 1500),
    projectExp: String(params.expertise.projectExp || '').trim().slice(0, 1500),
    professionalExp: String(params.expertise.professionalExp || '').trim().slice(0, 1500),
    status: params.expertise.status === 'draft' ? ('draft' as const) : ('active' as const),
    updatedAt: serverTimestamp(),
    updatedBy: actorUid,
  };

  let op: OperationType = OperationType.WRITE;
  try {
    const expRef = doc(db, 'expertise', staffId);
    const existing = await getDoc(expRef);
    let finalUid = String(params.expertise.uid || actorUid).slice(0, 128);
    if (existing.exists()) {
      op = OperationType.UPDATE;
      const existingData = existing.data() as Record<string, unknown>;
      const isClaimingUid = existingData.uid === '' && Boolean(params.expertise.uid);
      finalUid = String(isClaimingUid ? params.expertise.uid : existingData.uid || finalUid).slice(0, 128);
      await updateDoc(expRef, isClaimingUid ? { uid: finalUid, ...expMutableFields } : expMutableFields);
    } else {
      op = OperationType.CREATE;
      await setDoc(expRef, {
        id: staffId,
        staffId,
        uid: finalUid,
        ...expMutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    const profileRef = doc(db, 'staff_profiles', staffId);
    const profileSnap = await getDoc(profileRef).catch(() => null);
    if (profileSnap && profileSnap.exists()) {
      const profileUpdate: Record<string, unknown> = {
        primaryExpertise,
        secondaryExpertise,
        expertiseKeywords: safeKeywords,
        updatedAt: serverTimestamp(),
        updatedBy: actorUid,
      };
      if (params.completion) {
        profileUpdate.completionPercent = Math.max(
          0,
          Math.min(100, Math.round(Number(params.completion.completionPercent) || 0))
        );
        profileUpdate.missingSections = sanitizeList(params.completion.missingSections, 12);
      }
      await updateDoc(profileRef, profileUpdate).catch(() => {});
    }

    await logAudit({
      actionType: 'UPDATE_STAFF_EXPERTISE',
      targetType: 'expertise',
      targetId: staffId,
      staffId,
      outcome: 'success',
      details: `Mengemas kini kepakaran & pengalaman mengajar (${primaryExpertise || 'Umum'}).`,
    });

    return {
      id: staffId,
      staffId,
      uid: finalUid,
      ...expMutableFields,
      createdBy: actorUid,
    };
  } catch (err) {
    handleFirestoreError(err, op, expPath);
  }
}

// =========================================================
// FUNGSI 1, 2, 5, 6 (staff_functions/{staffId})
// =========================================================
export function sanitizeTrainings(list: TrainingRecord[]): TrainingRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => ({
      id: String(item.id || '').trim().slice(0, 64) || makeRecordId('TRN'),
      moduleName: String(item.moduleName || '').trim().slice(0, 200),
      role: String(item.role || '').trim().slice(0, 80),
      year: String(item.year || '').trim().slice(0, 16),
    }))
    .filter((i) => i.moduleName.length > 0);
}

export function sanitizeProgramManagements(list: ProgramManagementRecord[]): ProgramManagementRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => ({
      id: String(item.id || '').trim().slice(0, 64) || makeRecordId('PRG'),
      programName: String(item.programName || '').trim().slice(0, 200),
      centerId: String(item.centerId || '').trim().slice(0, 64),
      centerName: String(item.centerName || '').trim().slice(0, 160),
      departmentId: String(item.departmentId || '').trim().slice(0, 64),
      departmentName: String(item.departmentName || '').trim().slice(0, 160),
      role: String(item.role || '').trim().slice(0, 80),
      year: String(item.year || '').trim().slice(0, 16),
    }))
    .filter((i) => i.programName.length > 0);
}

export function sanitizeConsultations(list: ConsultationRecord[]): ConsultationRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => ({
      id: String(item.id || '').trim().slice(0, 64) || makeRecordId('CON'),
      title: String(item.title || '').trim().slice(0, 240),
      organization: String(item.organization || '').trim().slice(0, 200),
      consultationType: String(item.consultationType || '').trim().slice(0, 100),
      role: String(item.role || '').trim().slice(0, 80),
      year: String(item.year || '').trim().slice(0, 16),
      impact: String(item.impact || '').trim().slice(0, 500),
    }))
    .filter((i) => i.title.length > 0);
}

export function sanitizeNpqelSupervisions(list: NpqelSupervisionRecord[]): NpqelSupervisionRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => ({
      id: String(item.id || '').trim().slice(0, 64) || makeRecordId('NPQ'),
      participantName: String(item.participantName || '').trim().slice(0, 160),
      participantClass: String(item.participantClass || '').trim().slice(0, 80),
      year: String(item.year || '').trim().slice(0, 16),
    }))
    .filter((i) => i.participantName.length > 0);
}

export function sanitizeProgramEvaluations(list: ProgramEvaluationRecord[]): ProgramEvaluationRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => {
      const parsed = Number(item.score);
      const bounded = Number.isFinite(parsed) ? Math.max(0, Math.min(100, Math.round(parsed * 10) / 10)) : 0;
      return {
        id: String(item.id || '').trim().slice(0, 64) || makeRecordId('EVA'),
        programName: String(item.programName || '').trim().slice(0, 200),
        centerId: String(item.centerId || '').trim().slice(0, 64),
        centerName: String(item.centerName || '').trim().slice(0, 160),
        departmentId: String(item.departmentId || '').trim().slice(0, 64),
        departmentName: String(item.departmentName || '').trim().slice(0, 160),
        role: String(item.role || '').trim().slice(0, 80),
        year: String(item.year || '').trim().slice(0, 16),
        score: bounded,
      };
    })
    .filter((i) => i.programName.length > 0);
}

export function sanitizeThinkTankEntries(list: ThinkTankRecord[]): ThinkTankRecord[] {
  return (list || [])
    .slice(0, 100)
    .map((item) => ({
      id: String(item.id || '').trim().slice(0, 64) || makeRecordId('THK'),
      committeeName: String(item.committeeName || '').trim().slice(0, 240),
      level: String(item.level || '').trim().slice(0, 100),
      role: String(item.role || '').trim().slice(0, 80),
      focusArea: String(item.focusArea || '').trim().slice(0, 240),
      year: String(item.year || '').trim().slice(0, 16),
      activeStatus: (item.activeStatus === 'Tamat' ? 'Tamat' : 'Aktif') as 'Aktif' | 'Tamat',
    }))
    .filter((i) => i.committeeName.length > 0);
}

export async function getStaffFunctions(staffId: string): Promise<StaffFunctionsRecord | null> {
  const path = `staff_functions/${staffId}`;
  try {
    const snap = await getDoc(doc(db, 'staff_functions', staffId));
    return snap.exists() ? (snap.data() as StaffFunctionsRecord) : null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function saveStaffFunctions(params: {
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  trainings: TrainingRecord[];
  programManagements: ProgramManagementRecord[];
  consultations: ConsultationRecord[];
  npqelSupervisions: NpqelSupervisionRecord[];
  programEvaluations: ProgramEvaluationRecord[];
  thinkTankEntries: ThinkTankRecord[];
}): Promise<StaffFunctionsRecord> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) {
    throw new Error('Sesi pengesahan telah tamat. Sila log masuk semula sebelum menyimpan rekod fungsi.');
  }
  const staffId = params.staffId;
  const path = `staff_functions/${staffId}`;
  const safeCenterId = String(params.centerId || '').slice(0, 64);
  const safeDepartmentId = String(params.departmentId || '').slice(0, 64);
  const safeTrainings = sanitizeTrainings(params.trainings);
  const safePrograms = sanitizeProgramManagements(params.programManagements);
  const safeConsultations = sanitizeConsultations(params.consultations);
  const safeNpqel = sanitizeNpqelSupervisions(params.npqelSupervisions);
  const safeEvaluations = sanitizeProgramEvaluations(params.programEvaluations);
  const safeThinkTanks = sanitizeThinkTankEntries(params.thinkTankEntries);

  let op: OperationType = OperationType.WRITE;
  try {
    const ref = doc(db, 'staff_functions', staffId);
    const existing = await getDoc(ref);
    const mutableFields = {
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      trainings: safeTrainings,
      programManagements: safePrograms,
      consultations: safeConsultations,
      npqelSupervisions: safeNpqel,
      programEvaluations: safeEvaluations,
      thinkTankEntries: safeThinkTanks,
      status: 'active' as const,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    let finalUid = String(params.uid || actorUid).slice(0, 128);
    if (existing.exists()) {
      op = OperationType.UPDATE;
      const existingData = existing.data() as Record<string, unknown>;
      const isClaimingUid = existingData.uid === '' && Boolean(params.uid);
      finalUid = String(isClaimingUid ? params.uid : existingData.uid || finalUid).slice(0, 128);
      await updateDoc(ref, isClaimingUid ? { uid: finalUid, ...mutableFields } : mutableFields);
    } else {
      op = OperationType.CREATE;
      await setDoc(ref, {
        id: staffId,
        staffId,
        uid: finalUid,
        ...mutableFields,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    await logAudit({
      actionType: 'UPDATE_STAFF_FUNCTIONS',
      targetType: 'staff_functions',
      targetId: staffId,
      staffId,
      outcome: 'success',
      details: `Mengemas kini rekod fungsi (${safeTrainings.length} latihan, ${safePrograms.length} pengurusan program, ${safeConsultations.length} konsultasi, ${safeNpqel.length + safeEvaluations.length} pentaksiran, ${safeThinkTanks.length} pemikir).`,
    });

    return {
      id: staffId,
      staffId,
      uid: finalUid,
      centerId: safeCenterId,
      departmentId: safeDepartmentId,
      trainings: safeTrainings,
      programManagements: safePrograms,
      consultations: safeConsultations,
      npqelSupervisions: safeNpqel,
      programEvaluations: safeEvaluations,
      thinkTankEntries: safeThinkTanks,
      status: 'active',
      createdBy: actorUid,
      updatedBy: actorUid,
    };
  } catch (err) {
    handleFirestoreError(err, op, path);
  }
}

export async function purgeLegacyUatRecords(): Promise<number> {
  const actorUid = auth.currentUser?.uid;
  if (!actorUid) return 0;

  const [profSnap, expSnap, qualSnap] = await Promise.all([
    getDocs(collection(db, 'staff_profiles')),
    getDocs(collection(db, 'expertise')),
    getDocs(collection(db, 'qualifications')),
  ]);

  const uatProfIds = profSnap.docs
    .map((d) => d.id)
    .filter((id) => id.startsWith('IAB-UAT-'));
  const uatExpIds = expSnap.docs
    .map((d) => d.id)
    .filter((id) => id.startsWith('IAB-UAT-'));
  const uatQualIds = qualSnap.docs
    .filter((d) => {
      const data = d.data() as Partial<Qualification>;
      return String(data.staffId || '').startsWith('IAB-UAT-');
    })
    .map((d) => d.id);

  const batch = writeBatch(db);
  for (const id of uatProfIds) batch.delete(doc(db, 'staff_profiles', id));
  for (const id of uatExpIds) batch.delete(doc(db, 'expertise', id));
  for (const id of uatQualIds) batch.delete(doc(db, 'qualifications', id));
  const totalRemoved = uatProfIds.length + uatExpIds.length + uatQualIds.length;
  if (totalRemoved > 0) {
    await batch.commit();
    await logAudit({
      actionType: 'PURGE_UAT_DUMMY_DATA',
      targetType: 'staff_profiles',
      targetId: 'UAT_CLEANUP',
      outcome: 'success',
      details: `Membersihkan ${uatProfIds.length} profil dummy IAB-UAT-* dan rekod berkaitan.`,
    });
  }
  return uatProfIds.length;
}
