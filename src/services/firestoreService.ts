import {
  collection,
  deleteDoc,
  doc,
  getDoc,
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
  DEFAULT_COMPETENCY_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  computeProfileCompletion,
  getHighestQualificationFromList,
} from '../lib/constants';
import type {
  AccountStatus,
  AuditLog,
  Certificate,
  CompetencyRecord,
  Department,
  DriveSetting,
  ExpertiseRecord,
  GeneratedProfile,
  OrganizationCenter,
  ProfilePhoto,
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
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
}): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = 'system_settings/main';
  try {
    const existing = await getDoc(doc(db, 'system_settings', 'main'));
    if (existing.exists()) {
      await updateDoc(doc(db, 'system_settings', 'main'), {
        systemName: data.systemName.slice(0, 160),
        institutionName: data.institutionName.slice(0, 160),
        expertiseCategories: data.expertiseCategories.slice(0, 60),
        competencyCategories: data.competencyCategories.slice(0, 60),
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    } else {
      await setDoc(doc(db, 'system_settings', 'main'), {
        id: 'main',
        systemName: data.systemName.slice(0, 160),
        institutionName: data.institutionName.slice(0, 160),
        expertiseCategories: data.expertiseCategories.slice(0, 60),
        competencyCategories: data.competencyCategories.slice(0, 60),
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

    const orgsSnap = await getDocs(collection(db, 'organizations'));
    if (orgsSnap.empty) {
      const batch = writeBatch(db);
      const centers = [
        {
          id: 'CTR-IAB-INDUK',
          code: 'IAB-INDUK',
          name: 'Pusat Pengurusan dan Kepimpinan Pendidikan',
          headName: 'Dr. Haji Ahmad Fauzi bin Ismail',
          headUid: '',
          location: 'Bandar Enstek, Nilai',
        },
        {
          id: 'CTR-TEKNOLOGI-AI',
          code: 'IAB-TEKA',
          name: 'Pusat Pembangunan Teknologi Pendidikan dan AI',
          headName: 'Dr. Nurul Huda binti Razak',
          headUid: '',
          location: 'Bandar Enstek, Nilai',
        },
        {
          id: 'CTR-DASAR-PENYELIDIKAN',
          code: 'IAB-DASAR',
          name: 'Pusat Dasar, Penyelidikan dan Inovasi Pendidikan',
          headName: 'Prof. Madya Dr. Azman bin Khalid',
          headUid: '',
          location: 'Bandar Enstek, Nilai',
        },
      ];
      for (const c of centers) {
        batch.set(doc(db, 'organizations', c.id), {
          ...c,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: adminUid,
          updatedBy: adminUid,
        });
      }
      await batch.commit();

      const deptBatch = writeBatch(db);
      const depts = [
        {
          id: 'DEPT-KEPIMPINAN',
          centerId: 'CTR-IAB-INDUK',
          code: 'JKP',
          name: 'Jabatan Kepimpinan Pendidikan',
          headName: 'Dr. Siti Mariam binti Salleh',
          headUid: '',
        },
        {
          id: 'DEPT-PENGURUSAN-ORG',
          centerId: 'CTR-IAB-INDUK',
          code: 'JPO',
          name: 'Jabatan Pengurusan Organisasi dan Bakat',
          headName: 'En. Mohd Hafiz bin Mansor',
          headUid: '',
        },
        {
          id: 'DEPT-AI-GENAI',
          centerId: 'CTR-TEKNOLOGI-AI',
          code: 'JAI',
          name: 'Jabatan Kecerdasan Buatan dan Analitik Data',
          headName: 'Ts. Dr. Faridah binti Yusof',
          headUid: '',
        },
        {
          id: 'DEPT-EDTECH',
          centerId: 'CTR-TEKNOLOGI-AI',
          code: 'JET',
          name: 'Jabatan Teknologi Pendidikan Digital',
          headName: 'En. Wan Azri bin Wan Sulaiman',
          headUid: '',
        },
        {
          id: 'DEPT-PENYELIDIKAN',
          centerId: 'CTR-DASAR-PENYELIDIKAN',
          code: 'JPP',
          name: 'Jabatan Penyelidikan dan Pembangunan Dasar',
          headName: 'Dr. Noraini binti Harun',
          headUid: '',
        },
      ];
      for (const d of depts) {
        deptBatch.set(doc(db, 'departments', d.id), {
          ...d,
          status: 'active',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
          createdBy: adminUid,
          updatedBy: adminUid,
        });
      }
      await deptBatch.commit();
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
  try {
    await updateDoc(doc(db, 'users', targetUid), {
      ...updates,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    });
    await logAudit({
      actionType,
      targetType: 'users',
      targetId: targetUid,
      staffId: updates.staffId || '',
      outcome: 'success',
      details: `Kemas kini akaun (${JSON.stringify(updates)})`,
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
  } else if (user.role === 'L1') {
    q = query(col, where('centerId', '==', user.centerId));
  } else if (user.role === 'L2') {
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

export async function getStaffProfileBundle(staffId: string): Promise<{
  profile: StaffProfile | null;
  pii: StaffPrivatePII | null;
  qualifications: Qualification[];
  expertise: ExpertiseRecord | null;
  competencies: CompetencyRecord | null;
  publications: Publication[];
  certificates: Certificate[];
  photo: ProfilePhoto | null;
}> {
  try {
    const profileSnap = await getDoc(doc(db, 'staff_profiles', staffId));
    const profile = profileSnap.exists() ? (profileSnap.data() as StaffProfile) : null;

    let pii: StaffPrivatePII | null = null;
    try {
      const piiSnap = await getDoc(doc(db, 'staff_profiles', staffId, 'private', 'pii'));
      pii = piiSnap.exists() ? (piiSnap.data() as StaffPrivatePII) : null;
    } catch {
      pii = null; // Restricted PII if caller lacks scope
    }

    const [qualSnap, expSnap, compSnap, pubSnap, certSnap, photoSnap] = await Promise.all([
      getDocs(query(collection(db, 'qualifications'), where('staffId', '==', staffId))),
      getDoc(doc(db, 'expertise', staffId)),
      getDoc(doc(db, 'competencies', staffId)),
      getDocs(query(collection(db, 'publications'), where('staffId', '==', staffId))),
      getDocs(query(collection(db, 'certificates'), where('staffId', '==', staffId))).catch(() => null),
      getDoc(doc(db, 'profile_photos', staffId)).catch(() => null),
    ]);

    return {
      profile,
      pii,
      qualifications: qualSnap.docs.map((d) => d.data() as Qualification).filter((q) => q.status === 'active'),
      expertise: expSnap.exists() ? (expSnap.data() as ExpertiseRecord) : null,
      competencies: compSnap.exists() ? (compSnap.data() as CompetencyRecord) : null,
      publications: pubSnap.docs.map((d) => d.data() as Publication).filter((p) => p.status === 'active'),
      certificates: certSnap
        ? certSnap.docs.map((d) => d.data() as Certificate).filter((c) => c.status === 'active')
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
  const actorUid = auth.currentUser?.uid || 'system';
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

  try {
    const profileRef = doc(db, 'staff_profiles', staffId);
    const existingProfile = await getDoc(profileRef);
    const digitalCompNames = params.competencies.items.map((i) => i.categoryName).slice(0, 30);

    const profilePayload = {
      ...params.profile,
      id: staffId,
      primaryExpertise: params.expertise.primaryExpertise || params.profile.primaryExpertise,
      secondaryExpertise: params.expertise.secondaryExpertise || params.profile.secondaryExpertise,
      expertiseKeywords: (params.expertise.keywords || []).slice(0, 30),
      digitalCompetencies: digitalCompNames,
      completionPercent,
      missingSections: missingSections.slice(0, 12),
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };

    if (existingProfile.exists()) {
      await updateDoc(profileRef, profilePayload);
    } else {
      await setDoc(profileRef, {
        ...profilePayload,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    const piiRef = doc(db, 'staff_profiles', staffId, 'private', 'pii');
    const existingPii = await getDoc(piiRef);
    const piiPayload = {
      ...params.pii,
      staffId,
      centerId: params.profile.centerId,
      departmentId: params.profile.departmentId,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (existingPii.exists()) {
      await updateDoc(piiRef, piiPayload);
    } else {
      await setDoc(piiRef, {
        ...piiPayload,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    const expRef = doc(db, 'expertise', staffId);
    const existingExp = await getDoc(expRef);
    const expPayload = {
      ...params.expertise,
      id: staffId,
      staffId,
      centerId: params.profile.centerId,
      departmentId: params.profile.departmentId,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (existingExp.exists()) {
      await updateDoc(expRef, expPayload);
    } else {
      await setDoc(expRef, {
        ...expPayload,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    const compRef = doc(db, 'competencies', staffId);
    const existingComp = await getDoc(compRef);
    const compPayload = {
      ...params.competencies,
      id: staffId,
      staffId,
      centerId: params.profile.centerId,
      departmentId: params.profile.departmentId,
      updatedAt: serverTimestamp(),
      updatedBy: actorUid,
    };
    if (existingComp.exists()) {
      await updateDoc(compRef, compPayload);
    } else {
      await setDoc(compRef, {
        ...compPayload,
        createdAt: serverTimestamp(),
        createdBy: actorUid,
      });
    }

    await logAudit({
      actionType: 'UPDATE_STAFF_PROFILE',
      targetType: 'staff_profiles',
      targetId: staffId,
      staffId,
      outcome: 'success',
      details: `Mengemas kini profil pegawai (${completionPercent}% lengkap)`,
    });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `staff_profiles/${staffId}`);
  }
}

export async function addOrUpdateQualification(
  qual: Omit<Qualification, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'>,
  isNew: boolean
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `qualifications/${qual.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'qualifications', qual.id), {
        ...qual,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      await updateDoc(doc(db, 'qualifications', qual.id), {
        level: qual.level,
        institution: qual.institution,
        fieldOfStudy: qual.fieldOfStudy,
        graduationYear: qual.graduationYear,
        notes: qual.notes,
        status: qual.status,
        centerId: qual.centerId,
        departmentId: qual.departmentId,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    // Sync highestQualification on staff_profiles
    const qSnap = await getDocs(query(collection(db, 'qualifications'), where('staffId', '==', qual.staffId)));
    const activeQuals = qSnap.docs.map((d) => d.data() as Qualification).filter((x) => x.status === 'active');
    const highest = getHighestQualificationFromList(activeQuals);
    await updateDoc(doc(db, 'staff_profiles', qual.staffId), {
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
  isNew: boolean
): Promise<void> {
  const uid = auth.currentUser?.uid || 'system';
  const path = `publications/${pub.id}`;
  try {
    if (isNew) {
      await setDoc(doc(db, 'publications', pub.id), {
        ...pub,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        createdBy: uid,
        updatedBy: uid,
      });
    } else {
      await updateDoc(doc(db, 'publications', pub.id), {
        type: pub.type,
        title: pub.title,
        publisherOrVenue: pub.publisherOrVenue,
        year: pub.year,
        url: pub.url,
        description: pub.description,
        status: pub.status,
        centerId: pub.centerId,
        departmentId: pub.departmentId,
        updatedAt: serverTimestamp(),
        updatedBy: uid,
      });
    }
    const pSnap = await getDocs(query(collection(db, 'publications'), where('staffId', '==', pub.staffId)));
    const count = pSnap.docs.filter((d) => (d.data() as Publication).status === 'active').length;
    await updateDoc(doc(db, 'staff_profiles', pub.staffId), {
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
  else if (user.role === 'L1') q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2') q = query(col, where('departmentId', '==', user.departmentId));
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
  else if (user.role === 'L1') q = query(col, where('centerId', '==', user.centerId));
  else if (user.role === 'L2') q = query(col, where('departmentId', '==', user.departmentId));
  else if (user.role === 'L3' || user.role === 'L4') q = query(col, where('status', '==', 'active'));
  else q = query(col, where('uid', '==', user.uid));

  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => d.data() as ExpertiseRecord);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'expertise');
  }
}

// =========================================================
// EXPLICIT ADMIN-TRIGGERED UAT TEST DATASET SEEDER
// =========================================================
export async function seedUatTestRecords(adminUid: string): Promise<number> {
  await ensureInitialSystemDefaults(adminUid);

  const sampleStaff: Array<{
    staffId: string;
    fullName: string;
    email: string;
    position: string;
    grade: string;
    scheme: string;
    isLecturer: boolean;
    centerId: string;
    centerName: string;
    departmentId: string;
    departmentName: string;
    highestQualification: string;
    primaryExpertise: string;
    secondaryExpertise: string;
    digitalCompetencies: string[];
    keywords: string[];
    roleLabel: string;
  }> = [
    {
      staffId: 'IAB-UAT-0001',
      fullName: 'Dr. Haji Ahmad Fauzi bin Ismail',
      email: 'uat.kp1@iab.edu.my',
      position: 'Ketua Pusat',
      grade: 'DG54',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-IAB-INDUK',
      centerName: 'Pusat Pengurusan dan Kepimpinan Pendidikan',
      departmentId: 'DEPT-KEPIMPINAN',
      departmentName: 'Jabatan Kepimpinan Pendidikan',
      highestQualification: 'PhD',
      primaryExpertise: 'Kepimpinan Pendidikan',
      secondaryExpertise: 'Pengurusan Organisasi Pendidikan',
      digitalCompetencies: ['Digital Leadership', 'Data-Driven Decision Making', 'AI Governance'],
      keywords: ['NPQEL', 'Kepimpinan Instruksional', 'Pengurusan Sekolah', 'UAT'],
      roleLabel: 'L1',
    },
    {
      staffId: 'IAB-UAT-0002',
      fullName: 'Dr. Siti Mariam binti Salleh',
      email: 'uat.kj1@iab.edu.my',
      position: 'Ketua Jabatan',
      grade: 'DG52',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-IAB-INDUK',
      centerName: 'Pusat Pengurusan dan Kepimpinan Pendidikan',
      departmentId: 'DEPT-KEPIMPINAN',
      departmentName: 'Jabatan Kepimpinan Pendidikan',
      highestQualification: 'PhD',
      primaryExpertise: 'Kepimpinan Pendidikan',
      secondaryExpertise: 'Kaunseling, Bimbingan & Pementoran',
      digitalCompetencies: ['Digital Leadership', 'Educational Technology'],
      keywords: ['Coaching', 'Mentoring', 'Kepimpinan Transformasi', 'UAT'],
      roleLabel: 'L2',
    },
    {
      staffId: 'IAB-UAT-0003',
      fullName: 'Ts. Dr. Faridah binti Yusof',
      email: 'uat.kj2@iab.edu.my',
      position: 'Ketua Jabatan',
      grade: 'DG52',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-TEKNOLOGI-AI',
      centerName: 'Pusat Pembangunan Teknologi Pendidikan dan AI',
      departmentId: 'DEPT-AI-GENAI',
      departmentName: 'Jabatan Kecerdasan Buatan dan Analitik Data',
      highestQualification: 'PhD',
      primaryExpertise: 'Kecerdasan Buatan (AI) & GenAI dalam Pendidikan',
      secondaryExpertise: 'Analitik Data & Pembuatan Keputusan',
      digitalCompetencies: ['Generative AI', 'AI Governance', 'AI Ethics and Safety', 'Data Analytics', 'Vibe Programming'],
      keywords: ['GenAI', 'LLM', 'Analitik Pembelajaran', 'Etika AI', 'UAT'],
      roleLabel: 'L2',
    },
    {
      staffId: 'IAB-UAT-0004',
      fullName: 'Dr. Noraini binti Harun',
      email: 'uat.kj3@iab.edu.my',
      position: 'Ketua Jabatan',
      grade: 'DG52',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-DASAR-PENYELIDIKAN',
      centerName: 'Pusat Dasar, Penyelidikan dan Inovasi Pendidikan',
      departmentId: 'DEPT-PENYELIDIKAN',
      departmentName: 'Jabatan Penyelidikan dan Pembangunan Dasar',
      highestQualification: 'PhD',
      primaryExpertise: 'Dasar dan Perancangan Pendidikan',
      secondaryExpertise: 'Penyelidikan Pendidikan & Inovasi',
      digitalCompetencies: ['Data-Driven Decision Making', 'Data Analytics'],
      keywords: ['Penyelidikan Dasar', 'Metodologi Kajian', 'UAT'],
      roleLabel: 'L2',
    },
    {
      staffId: 'IAB-UAT-0005',
      fullName: 'En. Muhammad Syafiq bin Abdullah',
      email: 'uat.pensyarah1@iab.edu.my',
      position: 'Pensyarah Kanan',
      grade: 'DG48',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-TEKNOLOGI-AI',
      centerName: 'Pusat Pembangunan Teknologi Pendidikan dan AI',
      departmentId: 'DEPT-AI-GENAI',
      departmentName: 'Jabatan Kecerdasan Buatan dan Analitik Data',
      highestQualification: 'Sarjana',
      primaryExpertise: 'Teknologi Pendidikan & Pembelajaran Digital',
      secondaryExpertise: 'Kecerdasan Buatan (AI) & GenAI dalam Pendidikan',
      digitalCompetencies: ['Generative AI', 'Educational Technology', 'Digital Content Development', 'Vibe Programming'],
      keywords: ['Prompt Engineering', 'Pembelajaran Teradun', 'UAT'],
      roleLabel: 'L3',
    },
    {
      staffId: 'IAB-UAT-0006',
      fullName: 'Pn. Rosmawati binti Aziz',
      email: 'uat.pensyarah2@iab.edu.my',
      position: 'Pensyarah',
      grade: 'DG44',
      scheme: 'Pegawai Perkhidmatan Pendidikan',
      isLecturer: true,
      centerId: 'CTR-IAB-INDUK',
      centerName: 'Pusat Pengurusan dan Kepimpinan Pendidikan',
      departmentId: 'DEPT-PENGURUSAN-ORG',
      departmentName: 'Jabatan Pengurusan Organisasi dan Bakat',
      highestQualification: 'Sarjana',
      primaryExpertise: 'Pengurusan Bakat & Pembangunan Profesional',
      secondaryExpertise: 'Pengurusan Kurikulum dan Instruksional',
      digitalCompetencies: ['Digital Transformation', 'Digital Content Development'],
      keywords: ['Latihan Eksekutif', 'Pembangunan Kompetensi', 'UAT'],
      roleLabel: 'L3',
    },
    {
      staffId: 'IAB-UAT-0007',
      fullName: 'En. Khairul Anuar bin Zulkifli',
      email: 'uat.pegawai1@iab.edu.my',
      position: 'Pegawai Teknologi Maklumat',
      grade: 'F44',
      scheme: 'Pegawai Teknologi Maklumat',
      isLecturer: false,
      centerId: 'CTR-TEKNOLOGI-AI',
      centerName: 'Pusat Pembangunan Teknologi Pendidikan dan AI',
      departmentId: 'DEPT-EDTECH',
      departmentName: 'Jabatan Teknologi Pendidikan Digital',
      highestQualification: 'Sarjana Muda',
      primaryExpertise: 'Keselamatan Siber & Tadbir Urus Digital',
      secondaryExpertise: 'Teknologi Pendidikan & Pembelajaran Digital',
      digitalCompetencies: ['Cybersecurity Awareness', 'AI Governance', 'Digital Transformation'],
      keywords: ['Keselamatan ICT', 'Cloud Security', 'UAT'],
      roleLabel: 'L4',
    },
    {
      staffId: 'IAB-UAT-0008',
      fullName: 'Cik Nur Syahirah binti Hamid',
      email: 'uat.sokongan1@iab.edu.my',
      position: 'Pembantu Tadbir (P/O)',
      grade: 'N22',
      scheme: 'Pelaksana',
      isLecturer: false,
      centerId: 'CTR-IAB-INDUK',
      centerName: 'Pusat Pengurusan dan Kepimpinan Pendidikan',
      departmentId: 'DEPT-PENGURUSAN-ORG',
      departmentName: 'Jabatan Pengurusan Organisasi dan Bakat',
      highestQualification: 'Diploma',
      primaryExpertise: 'Pengurusan Kewangan & Pentadbiran Awam',
      secondaryExpertise: '',
      digitalCompetencies: ['Cybersecurity Awareness'],
      keywords: ['Pentadbiran', 'Rekod Latihan', 'UAT'],
      roleLabel: 'L5',
    },
  ];

  const batch = writeBatch(db);
  for (const s of sampleStaff) {
    const profileRef = doc(db, 'staff_profiles', s.staffId);
    batch.set(profileRef, {
      id: s.staffId,
      staffId: s.staffId,
      uid: '',
      fullName: s.fullName,
      officialEmail: s.email,
      position: s.position,
      grade: s.grade,
      scheme: s.scheme,
      isLecturer: s.isLecturer,
      centerId: s.centerId,
      centerName: s.centerName,
      departmentId: s.departmentId,
      departmentName: s.departmentName,
      unit: 'Unit Pembangunan Profesional',
      orgPosition: s.position,
      headOfCenter: 'Ketua Pusat IAB',
      headOfDepartment: 'Ketua Jabatan IAB',
      highestQualification: s.highestQualification,
      primaryExpertise: s.primaryExpertise,
      secondaryExpertise: s.secondaryExpertise,
      digitalCompetencies: s.digitalCompetencies,
      expertiseKeywords: s.keywords,
      completionPercent: 75,
      missingSections: ['I. Gambar Pegawai', 'J. Sijil & Dokumen'],
      hasPhoto: false,
      photoDisplayUrl: '',
      certificateCount: 0,
      publicationCount: 1,
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUid,
      updatedBy: adminUid,
    });

    const expRef = doc(db, 'expertise', s.staffId);
    batch.set(expRef, {
      id: s.staffId,
      staffId: s.staffId,
      uid: '',
      centerId: s.centerId,
      departmentId: s.departmentId,
      primaryExpertise: s.primaryExpertise,
      secondaryExpertise: s.secondaryExpertise,
      specializations: [s.primaryExpertise],
      researchAreas: [s.primaryExpertise],
      teachingAreas: [s.primaryExpertise],
      trainingAreas: ['Kursus Kepimpinan & Pengurusan Pendidikan'],
      keywords: s.keywords,
      teachingExp: 'Mengendalikan latihan eksekutif dan bengkel kepimpinan pegawai pendidikan.',
      managementExp: 'Penyelaras program pembangunan kapasiti peringkat institut.',
      facilitatorExp: 'Fasilitator bengkel strategi dan transformasi digital.',
      speakerExp: 'Penceramah jemputan seminar pengurusan pendidikan.',
      coachExp: 'Jurulatih bimbingan kepimpinan sekolah.',
      projectExp: 'Ahli pasukan projek pendigitalan latihan IAB.',
      professionalExp: 'Berpengalaman dalam sektor pendidikan dan latihan kepimpinan.',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUid,
      updatedBy: adminUid,
    });

    const qualId = `QUAL-${s.staffId}-1`;
    batch.set(doc(db, 'qualifications', qualId), {
      id: qualId,
      staffId: s.staffId,
      uid: '',
      centerId: s.centerId,
      departmentId: s.departmentId,
      level: s.highestQualification as Qualification['level'],
      institution: 'Universiti Awam Malaysia',
      fieldOfStudy: s.primaryExpertise,
      graduationYear: '2018',
      notes: 'Rekod sampel UAT',
      status: 'active',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      createdBy: adminUid,
      updatedBy: adminUid,
    });
  }

  await batch.commit();

  await logAudit({
    actionType: 'SEED_UAT_DATA',
    targetType: 'staff_profiles',
    targetId: 'UAT_BATCH',
    outcome: 'success',
    details: `Menjana ${sampleStaff.length} rekod sampel UAT berlabel IAB-UAT-*`,
  });

  return sampleStaff.length;
}
