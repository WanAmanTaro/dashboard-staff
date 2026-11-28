import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  Database,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  FolderCog,
  HardDrive,
  History,
  KeyRound,
  Layers,
  Plus,
  RefreshCw,
  Save,
  Search,
  Settings,
  ShieldCheck,
  Trash2,
  Unplug,
  UserCheck,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DriveImage } from '../components/DriveImage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import {
  CERTIFICATE_CATEGORIES,
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  ROLE_LABELS,
  ROLE_SHORT_LABELS,
  formatBytes,
  isCountableStaff,
} from '../lib/constants';
import {
  disconnectDriveApi,
  fetchDriveFileBlob,
  getDriveStatus,
  openDriveOAuthPopup,
  testDriveConnectionApi,
  type DriveStatusResponse,
} from '../services/apiClient';
import {
  adminUpdateUserAccount,
  createInvitation,
  getAllCertificatesAdmin,
  getAllPhotosAdmin,
  getSystemSettings,
  makeRecordId,
  purgeLegacyUatRecords,
  saveDepartment,
  saveOrganization,
  saveSystemSettings,
  subscribeAuditLogs,
  subscribeInvitations,
  subscribeUsers,
  syncDriveSettingsMetadata,
} from '../services/firestoreService';
import type {
  AccountStatus,
  AuditLog,
  Certificate,
  Department,
  OrganizationCenter,
  ProfilePhoto,
  StaffProfile,
  SystemSetting,
  UserAccount,
  UserInvitation,
  UserRole,
} from '../types/iab';
import { exportAuditLogsToExcel, exportStaffProfilesToExcel } from '../utils/excelExport';

interface AdminPageProps {
  profiles: StaffProfile[];
  organizations: OrganizationCenter[];
  departments: Department[];
  onInspectProfile: (staffId: string) => void;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

type AdminSection =
  | 'users'
  | 'roles'
  | 'organizations'
  | 'departments'
  | 'profiles'
  | 'drive'
  | 'certificates'
  | 'photos'
  | 'categories'
  | 'settings'
  | 'audit'
  | 'export'
  | 'backup'
  | 'monitoring';

const ADMIN_MENU: Array<{
  id: AdminSection;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'users', label: '1. Pengurusan Pengguna', icon: Users },
  { id: 'roles', label: '2. Pengurusan Peranan (RBAC)', icon: KeyRound },
  { id: 'organizations', label: '3. Pengurusan Pusat', icon: Building2 },
  { id: 'departments', label: '4. Pengurusan Jabatan', icon: Layers },
  { id: 'profiles', label: '5. Pengurusan Profil Pegawai', icon: UserCheck },
  { id: 'drive', label: '6. Pengurusan Google Drive', icon: HardDrive },
  { id: 'certificates', label: '7. Pengurusan Sijil', icon: Award },
  { id: 'photos', label: '8. Pengurusan Gambar Profil', icon: Camera },
  { id: 'categories', label: '9. Kategori Kepakaran & AI', icon: FolderCog },
  { id: 'settings', label: '10. Tetapan Sistem', icon: Settings },
  { id: 'audit', label: '11. Log Audit Keselamatan', icon: History },
  { id: 'export', label: '12. Eksport Data Rasmi', icon: FileSpreadsheet },
  { id: 'backup', label: '13. Sandaran & Pemulihan', icon: Database },
  { id: 'monitoring', label: '14. Pemantauan Kelengkapan', icon: ShieldCheck },
];

const DEV_CALLBACK_URL =
  'https://ais-dev-2t7lg5pwvibl4brc2xuhio-564116479865.asia-southeast1.run.app/api/drive/callback';
const PRE_CALLBACK_URL =
  'https://ais-pre-2t7lg5pwvibl4brc2xuhio-564116479865.asia-southeast1.run.app/api/drive/callback';

function sanitizeId(raw: string, fallbackPrefix: string): string {
  const cleaned = raw
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return cleaned || makeRecordId(fallbackPrefix);
}

export const AdminPage: React.FC<AdminPageProps> = ({
  profiles,
  organizations,
  departments,
  onInspectProfile,
  onSystemSettingsUpdated,
}) => {
  const { userAccount } = useAuth();
  const { showToast } = useToast();
  const [section, setSection] = useState<AdminSection>('users');

  // Shared Admin Firestore subscriptions & data
  const [users, setUsers] = useState<UserAccount[]>([]);
  const [invitations, setInvitations] = useState<UserInvitation[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(null);
  const [certsAdmin, setCertsAdmin] = useState<Certificate[]>([]);
  const [photosAdmin, setPhotosAdmin] = useState<ProfilePhoto[]>([]);
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [loadingDrive, setLoadingDrive] = useState(false);

  // Confirm Dialog state
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    description: string;
    variant: 'danger' | 'warning' | 'primary';
    confirmLabel: string;
    onConfirm: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  // (1) Invite / Edit User state (Popup modals)
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    email: '',
    fullName: '',
    staffId: '',
    role: 'L3' as UserRole,
    isAdmin: false,
    centerId: organizations[0]?.id || '',
    departmentId: departments[0]?.id || '',
  });
  const [editingUser, setEditingUser] = useState<UserAccount | null>(null);
  const [userSearch, setUserSearch] = useState('');

  // (3) Organization form state (Popup modal)
  const [orgModalOpen, setOrgModalOpen] = useState(false);
  const [orgForm, setOrgForm] = useState({
    id: '',
    code: '',
    name: '',
    headName: '',
    headUid: '',
    location: 'Bandar Enstek, Nilai',
    status: 'active' as 'active' | 'inactive',
    isNew: true,
  });

  // (4) Department form state (Popup modal)
  const [deptModalOpen, setDeptModalOpen] = useState(false);
  const [deptForm, setDeptForm] = useState({
    id: '',
    centerId: organizations[0]?.id || '',
    code: '',
    name: '',
    headName: '',
    headUid: '',
    status: 'active' as 'active' | 'inactive',
    isNew: true,
  });

  // (5) Profile search
  const [profileSearch, setProfileSearch] = useState('');

  // (7) Certificates filter
  const [certCategoryFilter, setCertCategoryFilter] = useState('ALL');
  const [certSearch, setCertSearch] = useState('');

  // (9) Categories state
  const [expCategories, setExpCategories] = useState<string[]>(DEFAULT_EXPERTISE_CATEGORIES);
  const [appSkillCategories, setAppSkillCategories] = useState<string[]>(
    DEFAULT_APPLICATION_SKILL_CATEGORIES
  );
  const [knowSkillCategories, setKnowSkillCategories] = useState<string[]>(
    DEFAULT_KNOWLEDGE_SKILL_CATEGORIES
  );
  const [institutionCategories, setInstitutionCategories] = useState<string[]>(
    DEFAULT_INSTITUTION_CATEGORIES
  );
  const [publicationYears, setPublicationYears] = useState<string[]>(DEFAULT_PUBLICATION_YEARS);
  const [iabModules, setIabModules] = useState<string[]>(DEFAULT_IAB_MODULES);

  const [newExpCat, setNewExpCat] = useState('');
  const [newAppSkillCat, setNewAppSkillCat] = useState('');
  const [newKnowSkillCat, setNewKnowSkillCat] = useState('');
  const [newInstitutionCat, setNewInstitutionCat] = useState('');
  const [newPubYear, setNewPubYear] = useState('');
  const [newIabModule, setNewIabModule] = useState('');

  const [editingAppIdx, setEditingAppIdx] = useState<number | null>(null);
  const [editingAppVal, setEditingAppVal] = useState('');
  const [editingKnowIdx, setEditingKnowIdx] = useState<number | null>(null);
  const [editingKnowVal, setEditingKnowVal] = useState('');
  const [editingInstIdx, setEditingInstIdx] = useState<number | null>(null);
  const [editingInstVal, setEditingInstVal] = useState('');
  const [editingIabModIdx, setEditingIabModIdx] = useState<number | null>(null);
  const [editingIabModVal, setEditingIabModVal] = useState('');

  // (10) System Settings state
  const [systemName, setSystemName] = useState('Sistem Pengurusan Modal Insan dan Kepakaran IAB');
  const [institutionName, setInstitutionName] = useState(
    'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia'
  );
  const [maxPhotoSizeMb, setMaxPhotoSizeMb] = useState(5);
  const [maxCertSizeMb, setMaxCertSizeMb] = useState(15);

  // (11) Audit log filter
  const [auditSearch, setAuditSearch] = useState('');
  const [auditOutcomeFilter, setAuditOutcomeFilter] = useState<'ALL' | 'success' | 'failure'>('ALL');

  // (14) Monitoring filter
  const [monitoringFilter, setMonitoringFilter] = useState<'ALL' | 'INCOMPLETE' | 'NO_PHOTO' | 'COMPLETE'>('ALL');

  useEffect(() => {
    if (!userAccount?.isAdmin) return;
    const unsubUsers = subscribeUsers(setUsers);
    const unsubInv = subscribeInvitations(setInvitations);
    const unsubAudit = subscribeAuditLogs(setAuditLogs);

    getSystemSettings()
      .then((s) => {
        if (s) {
          setSysSettings(s);
          setSystemName(s.systemName);
          setInstitutionName(s.institutionName);
          if (s.expertiseCategories?.length) setExpCategories(s.expertiseCategories);
          if (s.applicationSkillCategories?.length) {
            setAppSkillCategories(s.applicationSkillCategories);
          }
          if (s.knowledgeSkillCategories?.length) {
            setKnowSkillCategories(s.knowledgeSkillCategories);
          }
          if (s.institutionCategories?.length) {
            setInstitutionCategories(s.institutionCategories);
          }
          if (s.publicationYears?.length) {
            setPublicationYears(s.publicationYears);
          }
          if (s.iabModules?.length) {
            setIabModules(s.iabModules);
          }
        }
      })
      .catch(() => {});

    return () => {
      unsubUsers();
      unsubInv();
      unsubAudit();
    };
  }, [userAccount?.isAdmin]);

  useEffect(() => {
    if (organizations.length && !inviteForm.centerId) {
      setInviteForm((prev) => ({
        ...prev,
        centerId: organizations[0].id,
        departmentId: departments.find((d) => d.centerId === organizations[0].id)?.id || departments[0]?.id || '',
      }));
    }
    if (organizations.length && !deptForm.centerId) {
      setDeptForm((prev) => ({ ...prev, centerId: organizations[0].id }));
    }
  }, [organizations, departments]);

  const refreshDriveStatus = async () => {
    setLoadingDrive(true);
    try {
      const status = await getDriveStatus();
      setDriveStatus(status);
      await syncDriveSettingsMetadata({
        status: status.status,
        connectedEmail: status.connectedEmail || '',
        rootFolderId: status.rootFolderId || '',
        folderIds: status.folderIds || {},
        lastConnectedAt: status.lastConnectedAt || '',
        lastUploadAt: status.lastUploadAt || '',
        uploadedDocumentsCount: status.uploadedDocumentsCount || 0,
        uploadedPhotosCount: status.uploadedPhotosCount || 0,
        maxPhotoSizeMb,
        maxCertSizeMb,
      });
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyemak status Google Drive.');
    } finally {
      setLoadingDrive(false);
    }
  };

  useEffect(() => {
    if (section === 'drive' && !driveStatus) {
      refreshDriveStatus();
    }
    if (section === 'certificates') {
      getAllCertificatesAdmin().then(setCertsAdmin).catch(() => {});
    }
    if (section === 'photos') {
      getAllPhotosAdmin().then(setPhotosAdmin).catch(() => {});
    }
  }, [section]);

  const runConfirmed = async () => {
    if (!confirmState) return;
    setConfirmBusy(true);
    try {
      await confirmState.onConfirm();
      setConfirmState(null);
    } catch (err: any) {
      showToast('error', err?.message || 'Tindakan gagal dilaksanakan.');
    } finally {
      setConfirmBusy(false);
    }
  };

  // Handlers
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const safeStaffId = sanitizeId(inviteForm.staffId, 'IAB-STF');
    try {
      await createInvitation({
        email: inviteForm.email,
        fullName: inviteForm.fullName,
        staffId: safeStaffId,
        role: inviteForm.role,
        isAdmin: inviteForm.role === 'L0' ? true : inviteForm.isAdmin,
        centerId: inviteForm.centerId,
        departmentId: inviteForm.departmentId,
      });
      showToast('success', `Jemputan rasmi untuk ${inviteForm.email} (${safeStaffId}) berjaya didaftarkan.`);
      setInviteForm((prev) => ({ ...prev, email: '', fullName: '', staffId: '' }));
      setInviteModalOpen(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal mendaftar jemputan.');
    }
  };

  const handleSaveUserEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    const originalUser = users.find((u) => u.uid === editingUser.uid);
    const isSelfAdminEscalation =
      editingUser.uid === userAccount?.uid && originalUser && !originalUser.isAdmin && editingUser.isAdmin;
    if (isSelfAdminEscalation) {
      showToast('error', 'Pentadbir tidak boleh menaik taraf peranan Admin sendiri.');
      return;
    }

    setConfirmState({
      open: true,
      title: 'Sahkan Kemas Kini Akaun Pengguna',
      description: `Adakah anda pasti mahu mengemas kini maklumat, peranan (${editingUser.role}), status (${editingUser.status}) dan penempatan bagi ${editingUser.displayName}?`,
      variant: 'warning',
      confirmLabel: 'Simpan Perubahan',
      onConfirm: async () => {
        await adminUpdateUserAccount(editingUser.uid, {
          displayName: editingUser.displayName,
          staffId: sanitizeId(editingUser.staffId, 'IAB-STF'),
          role: editingUser.role,
          isAdmin: editingUser.isAdmin,
          status: editingUser.status,
          centerId: editingUser.centerId,
          departmentId: editingUser.departmentId,
        });
        showToast('success', `Akaun ${editingUser.displayName} berjaya dikemas kini.`);
        setEditingUser(null);
      },
    });
  };

  const handleQuickStatusChange = (u: UserAccount, nextStatus: AccountStatus) => {
    if (u.uid === userAccount?.uid && nextStatus !== 'active') {
      showToast('error', 'Anda tidak boleh menggantung atau menyahaktifkan akaun anda sendiri.');
      return;
    }
    setConfirmState({
      open: true,
      title: `Sahkan Status Akaun: ${nextStatus.toUpperCase()}`,
      description: `Tindakan ini akan menukar status akses bagi ${u.displayName} (${u.email}) kepada "${nextStatus}".`,
      variant: nextStatus === 'active' ? 'primary' : 'danger',
      confirmLabel: 'Teruskan',
      onConfirm: async () => {
        await adminUpdateUserAccount(
          u.uid,
          { status: nextStatus },
          nextStatus === 'active' ? 'ACTIVATE_USER' : 'CHANGE_USER_STATUS'
        );
        showToast('success', `Status akaun ${u.displayName} dikemas kini kepada ${nextStatus}.`);
      },
    });
  };

  const handleRoleChange = (u: UserAccount, nextRole: UserRole, nextAdmin: boolean) => {
    if (u.uid === userAccount?.uid && !u.isAdmin && nextAdmin) {
      showToast('error', 'Anda tidak dibenarkan menaikkan hak Admin pada akaun sendiri.');
      return;
    }
    setConfirmState({
      open: true,
      title: 'Sahkan Perubahan Peranan RBAC',
      description: `Tukar peranan ${u.displayName} kepada ${ROLE_LABELS[nextRole]}${nextAdmin ? ' + Pentadbir Sistem (Admin)' : ''}? Perubahan ini berkuat kuasa serta-merta dan direkodkan dalam Log Audit.`,
      variant: 'warning',
      confirmLabel: 'Sahkan Peranan',
      onConfirm: async () => {
        await adminUpdateUserAccount(
          u.uid,
          { role: nextRole, isAdmin: nextAdmin },
          'CHANGE_USER_ROLE'
        );
        showToast('success', `Peranan ${u.displayName} berjaya dikemas kini.`);
      },
    });
  };

  const handleSaveOrg = async (e: React.FormEvent) => {
    e.preventDefault();
    const id = orgForm.isNew ? sanitizeId(orgForm.id || `CTR-${orgForm.code}`, 'CTR') : orgForm.id;
    try {
      await saveOrganization(
        {
          id,
          code: orgForm.code.trim().toUpperCase(),
          name: orgForm.name.trim(),
          headName: orgForm.headName.trim(),
          headUid: orgForm.headUid.trim(),
          location: orgForm.location.trim(),
          status: orgForm.status,
        },
        orgForm.isNew
      );
      showToast('success', `Rekod Pusat "${orgForm.name}" berjaya disimpan.`);
      setOrgForm({
        id: '',
        code: '',
        name: '',
        headName: '',
        headUid: '',
        location: 'Bandar Enstek, Nilai',
        status: 'active',
        isNew: true,
      });
      setOrgModalOpen(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan rekod pusat.');
    }
  };

  const handleSaveDept = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deptForm.centerId) {
      showToast('error', 'Sila pilih Pusat induk bagi jabatan ini.');
      return;
    }
    const id = deptForm.isNew ? sanitizeId(deptForm.id || `DEPT-${deptForm.code}`, 'DEPT') : deptForm.id;
    try {
      await saveDepartment(
        {
          id,
          centerId: deptForm.centerId,
          code: deptForm.code.trim().toUpperCase(),
          name: deptForm.name.trim(),
          headName: deptForm.headName.trim(),
          headUid: deptForm.headUid.trim(),
          status: deptForm.status,
        },
        deptForm.isNew
      );
      showToast('success', `Rekod Jabatan "${deptForm.name}" berjaya disimpan.`);
      setDeptForm({
        id: '',
        centerId: organizations[0]?.id || '',
        code: '',
        name: '',
        headName: '',
        headUid: '',
        status: 'active',
        isNew: true,
      });
      setDeptModalOpen(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan rekod jabatan.');
    }
  };

  const handleSaveCategoriesAndSettings = async () => {
    try {
      await saveSystemSettings({
        systemName: systemName.trim(),
        institutionName: institutionName.trim(),
        expertiseCategories: expCategories,
        competencyCategories: Array.from(new Set([...appSkillCategories, ...knowSkillCategories])),
        applicationSkillCategories: appSkillCategories,
        knowledgeSkillCategories: knowSkillCategories,
        institutionCategories,
        publicationYears,
        iabModules,
      });
      if (driveStatus) {
        await syncDriveSettingsMetadata({
          status: driveStatus.status,
          connectedEmail: driveStatus.connectedEmail || '',
          rootFolderId: driveStatus.rootFolderId || '',
          folderIds: driveStatus.folderIds || {},
          lastConnectedAt: driveStatus.lastConnectedAt || '',
          lastUploadAt: driveStatus.lastUploadAt || '',
          uploadedDocumentsCount: driveStatus.uploadedDocumentsCount || 0,
          uploadedPhotosCount: driveStatus.uploadedPhotosCount || 0,
          maxPhotoSizeMb: Number(maxPhotoSizeMb) || 5,
          maxCertSizeMb: Number(maxCertSizeMb) || 15,
        });
      }
      await onSystemSettingsUpdated?.();
      showToast('success', 'Tetapan sistem dan katalog kepakaran berjaya disimpan.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan tetapan sistem.');
    }
  };

  const handleDriveConnect = async (mode: 'connect' | 'reconnect') => {
    try {
      const msg = await openDriveOAuthPopup(mode);
      showToast('success', msg);
      await refreshDriveStatus();
    } catch (err: any) {
      showToast('error', err?.message || 'Sambungan Google Drive gagal.');
    }
  };

  const handleDriveTest = async () => {
    setLoadingDrive(true);
    try {
      const res = await testDriveConnectionApi();
      showToast(
        'success',
        `Sambungan berjaya (${res.email}). ${res.foldersVerified}/7 folder struktur IAB disahkan.`
      );
      await refreshDriveStatus();
    } catch (err: any) {
      showToast('error', err?.message || 'Ujian sambungan Google Drive gagal.');
    } finally {
      setLoadingDrive(false);
    }
  };

  const handleDriveDisconnect = () => {
    setConfirmState({
      open: true,
      title: 'Putuskan Sambungan Pemilik Storan Google Drive?',
      description:
        'Tindakan ini akan memadam token akses Google Drive daripada pelayan. Muat naik dan paparan fail Drive baharu tidak dapat berfungsi sehingga pentadbir menyambungkan akaun pemilik storan semula.',
      variant: 'danger',
      confirmLabel: 'Putuskan Sambungan',
      onConfirm: async () => {
        await disconnectDriveApi();
        showToast('info', 'Sambungan Google Drive telah diputuskan.');
        await refreshDriveStatus();
      },
    });
  };

  const legacyUatCount = useMemo(
    () => profiles.filter((p) => p.staffId.startsWith('IAB-UAT-')).length,
    [profiles]
  );

  const handlePurgeLegacyUat = () => {
    if (!userAccount) return;
    setConfirmState({
      open: true,
      title: 'Bersihkan Rekod Sampel Dummy (IAB-UAT-*)?',
      description:
        'Tindakan ini akan memadam semua profil sampel IAB-UAT-* yang terdahulu beserta rekod kepakaran dan kelayakan berkaitannya daripada Firestore.',
      variant: 'danger',
      confirmLabel: 'Padam Rekod Sampel',
      onConfirm: async () => {
        const count = await purgeLegacyUatRecords();
        showToast('success', `${count} rekod sampel dummy IAB-UAT-* telah dibersihkan.`);
      },
    });
  };

  const handleDownloadBackupJson = async () => {
    try {
      const [allCerts, allPhotos] = await Promise.all([
        getAllCertificatesAdmin().catch(() => []),
        getAllPhotosAdmin().catch(() => []),
      ]);
      const snapshot = {
        exportedAt: new Date().toISOString(),
        exportedBy: userAccount?.email || '',
        systemSettings: sysSettings,
        organizations,
        departments,
        users,
        invitations,
        staffProfiles: profiles,
        certificates: allCerts,
        profilePhotos: allPhotos,
        auditLogsLatest200: auditLogs,
      };
      const blob = new Blob([JSON.stringify(snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `IAB_Backup_Snapshot_${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('success', 'Fail sandaran JSON rasmi berjaya dimuat turun.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menjana fail sandaran JSON.');
    }
  };

  const countableUsers = useMemo(
    () => users.filter((u) => u.role !== 'L0'),
    [users]
  );

  const countableProfiles = useMemo(
    () => profiles.filter((p) => isCountableStaff(p)),
    [profiles]
  );

  const filteredUsers = useMemo(() => {
    const q = userSearch.trim().toLowerCase();
    return users.filter(
      (u) =>
        !q ||
        u.displayName.toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        u.staffId.toLowerCase().includes(q)
    );
  }, [users, userSearch]);

  const filteredProfiles = useMemo(() => {
    const q = profileSearch.trim().toLowerCase();
    return countableProfiles.filter(
      (p) =>
        !q ||
        p.fullName.toLowerCase().includes(q) ||
        p.staffId.toLowerCase().includes(q) ||
        p.departmentName.toLowerCase().includes(q) ||
        p.primaryExpertise.toLowerCase().includes(q)
    );
  }, [countableProfiles, profileSearch]);

  const filteredCerts = useMemo(() => {
    const q = certSearch.trim().toLowerCase();
    return certsAdmin.filter((c) => {
      if (certCategoryFilter !== 'ALL' && c.category !== certCategoryFilter) return false;
      if (
        q &&
        !c.title.toLowerCase().includes(q) &&
        !c.staffId.toLowerCase().includes(q) &&
        !c.fileName.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [certsAdmin, certCategoryFilter, certSearch]);

  const filteredAuditLogs = useMemo(() => {
    const q = auditSearch.trim().toLowerCase();
    return auditLogs.filter((l) => {
      if (auditOutcomeFilter !== 'ALL' && l.outcome !== auditOutcomeFilter) return false;
      if (
        q &&
        !l.actionType.toLowerCase().includes(q) &&
        !l.actorEmail.toLowerCase().includes(q) &&
        !l.details.toLowerCase().includes(q) &&
        !l.targetId.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [auditLogs, auditSearch, auditOutcomeFilter]);

  const monitoredProfiles = useMemo(() => {
    return countableProfiles.filter((p) => {
      if (monitoringFilter === 'INCOMPLETE') return p.completionPercent < 80;
      if (monitoringFilter === 'NO_PHOTO') return !p.hasPhoto;
      if (monitoringFilter === 'COMPLETE') return p.completionPercent >= 80;
      return true;
    });
  }, [countableProfiles, monitoringFilter]);

  if (!userAccount?.isAdmin) {
    return (
      <div className="bg-white border border-red-200 rounded-xl p-8 text-center">
        <h2 className="text-lg font-bold text-red-900">Akses Terhad kepada Pentadbir Sistem</h2>
        <p className="text-sm text-slate-600 mt-1">
          Hanya pengguna yang diberi peranan Admin boleh membuka modul pentadbiran sistem.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Admin Top Bar Summary */}
      <div className="bg-[#0B1F3B] text-white rounded-xl p-6 flex flex-col md:flex-row md:items-center justify-between gap-4 border-b-4 border-[#C69738]">
        <div>
          <p className="text-xs font-semibold text-[#F5D076] uppercase tracking-wider">
            Konsol Tadbir Urus Pentadbir Utama
          </p>
          <h2 className="text-xl font-bold mt-1">Pentadbiran Sistem Pengurusan Modal Insan IAB</h2>
          <p className="text-xs text-slate-300 mt-1">
            Pengurusan akaun, kelulusan pengguna, peranan RBAC, struktur organisasi, storan Google Drive dan jejak audit.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-4 shrink-0 text-center">
          <div className="bg-white/10 rounded-lg px-4 py-2.5">
            <p className="text-xs text-slate-300">Pengguna</p>
            <p className="text-lg font-bold font-mono-tabular">{countableUsers.length}</p>
          </div>
          <div className="bg-white/10 rounded-lg px-4 py-2.5">
            <p className="text-xs text-slate-300">Menunggu</p>
            <p className="text-lg font-bold font-mono-tabular text-[#F5D076]">
              {countableUsers.filter((u) => u.status === 'pending').length}
            </p>
          </div>
          <div className="bg-white/10 rounded-lg px-4 py-2.5">
            <p className="text-xs text-slate-300">Profil Staf</p>
            <p className="text-lg font-bold font-mono-tabular">{countableProfiles.length}</p>
          </div>
        </div>
      </div>

      {/* Layout Grid: Submodule Menu + Active Workspace */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Sub-module Navigation */}
        <aside className="lg:col-span-3 bg-white border border-slate-200 rounded-xl p-2 space-y-0.5">
          {ADMIN_MENU.map((item) => {
            const Icon = item.icon;
            const active = section === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setSection(item.id)}
                className={`w-full flex items-center gap-2.5 px-3 py-2 text-xs font-semibold rounded-lg text-left transition-colors ${
                  active
                    ? 'bg-[#0B1F3B] text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#F5D076]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </aside>

        {/* Right Workspace */}
        <div className="lg:col-span-9 space-y-6 min-w-0">
          {/* 1. USER MANAGEMENT */}
          {section === 'users' && (
            <div className="space-y-6">
              {/* Pending + Active Users Table */}
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3B]">Senarai Akaun Pengguna Sistem</h3>
                    <p className="text-xs text-slate-500">
                      Luluskan pengguna berstatus menunggu (pending), gantung, atau kemas kini penempatan staf. Peranan L0 — Admin tidak dikira dalam bilangan staf dan pengguna.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="relative w-full sm:w-56">
                      <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Cari nama, emel, ID staf..."
                        className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => setInviteModalOpen(true)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg whitespace-nowrap shrink-0"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Tambah Pengguna
                    </button>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 pr-3 font-semibold">Nama & Emel</th>
                        <th className="py-2.5 px-3 font-semibold">ID Staf</th>
                        <th className="py-2.5 px-3 font-semibold">Peranan</th>
                        <th className="py-2.5 px-3 font-semibold">Status</th>
                        <th className="py-2.5 pl-3 font-semibold text-right">Tindakan</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredUsers.map((u) => (
                        <tr key={u.uid} className="hover:bg-slate-50">
                          <td className="py-3 pr-3">
                            <p className="font-semibold text-[#0B1F3B]">{u.displayName}</p>
                            <p className="text-slate-500">{u.email}</p>
                          </td>
                          <td className="py-3 px-3 font-mono-tabular text-slate-700">{u.staffId || '-'}</td>
                          <td className="py-3 px-3 text-slate-700">
                            {ROLE_SHORT_LABELS[u.role]}
                            {u.isAdmin ? ' · Admin' : ''}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`font-semibold ${
                                u.status === 'active'
                                  ? 'text-emerald-700'
                                  : u.status === 'pending'
                                  ? 'text-amber-700'
                                  : 'text-red-700'
                              }`}
                            >
                              {u.status === 'active'
                                ? 'Aktif'
                                : u.status === 'pending'
                                ? 'Menunggu Kelulusan'
                                : u.status === 'suspended'
                                ? 'Digantung'
                                : 'Tidak Aktif'}
                            </span>
                          </td>
                          <td className="py-3 pl-3 text-right space-x-2 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => setEditingUser(u)}
                              className="px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                            >
                              Ubah
                            </button>
                            {u.status !== 'active' ? (
                              <button
                                type="button"
                                onClick={() => handleQuickStatusChange(u, 'active')}
                                className="px-2.5 py-1 text-xs font-medium text-white bg-emerald-700 hover:bg-emerald-800 rounded"
                              >
                                Aktifkan
                              </button>
                            ) : (
                              u.uid !== userAccount.uid && (
                                <button
                                  type="button"
                                  onClick={() => handleQuickStatusChange(u, 'suspended')}
                                  className="px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                >
                                  Gantung
                                </button>
                              )
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Invitations summary */}
                {invitations.length > 0 && (
                  <div className="pt-4 border-t border-slate-100">
                    <h4 className="text-xs font-bold text-slate-700 mb-2">
                      Rekod Jemputan Pra-Kelulusan ({invitations.length})
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {invitations.slice(0, 8).map((inv) => (
                        <div
                          key={inv.id}
                          className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center justify-between gap-2"
                        >
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-800 truncate">{inv.fullName}</p>
                            <p className="text-slate-500 truncate">
                              {inv.email} · {inv.role}
                            </p>
                          </div>
                          <span
                            className={`font-semibold shrink-0 ${
                              inv.status === 'claimed' ? 'text-emerald-700' : 'text-amber-700'
                            }`}
                          >
                            {inv.status === 'claimed' ? 'Ditebus' : 'Dijemput'}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. ROLE MANAGEMENT */}
          {section === 'roles' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">Pengurusan Peranan & Kawalan Akses (RBAC)</h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  L0 (Admin — tidak dikira dalam bilangan staf dan pengguna), L1 (Ketua Pusat), L2 (Ketua Jabatan), L3 (Pensyarah), L4 (Pegawai Bukan Pensyarah), L5 (Staf Sokongan).
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-semibold">Pegawai</th>
                      <th className="py-2.5 px-3 font-semibold">Peranan Semasa</th>
                      <th className="py-2.5 px-3 font-semibold">Hak Admin</th>
                      <th className="py-2.5 pl-3 font-semibold text-right">Ubah Peranan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {users.map((u) => (
                      <tr key={u.uid}>
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-[#0B1F3B]">{u.displayName}</p>
                          <p className="text-slate-500">{u.email}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{ROLE_LABELS[u.role]}</td>
                        <td className="py-3 px-3 font-semibold">
                          {u.isAdmin ? (
                            <span className="text-[#0B1F3B]">Pentadbir Sistem</span>
                          ) : (
                            <span className="text-slate-400">Pengguna Biasa</span>
                          )}
                        </td>
                        <td className="py-3 pl-3 text-right space-x-2 whitespace-nowrap">
                          <select
                            aria-label={`Pilih peranan untuk ${u.displayName}`}
                            value={u.role}
                            onChange={(e) => {
                              const nextRole = e.target.value as UserRole;
                              handleRoleChange(u, nextRole, nextRole === 'L0' ? true : u.isAdmin);
                            }}
                            className="px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                          >
                            {(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as UserRole[]).map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                          {u.uid !== userAccount.uid && u.role !== 'L0' && (
                            <button
                              type="button"
                              onClick={() => handleRoleChange(u, u.role, !u.isAdmin)}
                              className={`px-2.5 py-1 text-xs font-semibold rounded ${
                                u.isAdmin
                                  ? 'bg-red-50 text-red-700 hover:bg-red-100'
                                  : 'bg-[#0B1F3B] text-white hover:bg-[#14325C]'
                              }`}
                            >
                              {u.isAdmin ? 'Lucut Admin' : 'Lantik Admin'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. ORGANIZATION MANAGEMENT */}
          {section === 'organizations' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-[#0B1F3B]">
                    Senarai Pusat & Organisasi ({organizations.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Urus pusat dan ketua pusat di bawah struktur rasmi IAB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setOrgForm({
                      id: '',
                      code: '',
                      name: '',
                      headName: '',
                      headUid: '',
                      location: 'Bandar Enstek, Nilai',
                      status: 'active',
                      isNew: true,
                    });
                    setOrgModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Pusat
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {organizations.map((o) => (
                  <div key={o.id} className="py-3 flex items-center justify-between gap-4">
                    <div>
                      <p className="font-bold text-[#0B1F3B]">
                        {o.name} <span className="font-mono-tabular text-slate-500">({o.code})</span>
                      </p>
                      <p className="text-slate-600 mt-0.5">
                        Ketua: {o.headName || 'Belum ditetapkan'} · Lokasi: {o.location || '-'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setOrgForm({ ...o, isNew: false });
                        setOrgModalOpen(true);
                      }}
                      className="px-3 py-1.5 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                    >
                      Ubah
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 4. DEPARTMENT MANAGEMENT */}
          {section === 'departments' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 className="text-base font-bold text-[#0B1F3B]">
                    Senarai Jabatan ({departments.length})
                  </h4>
                  <p className="text-xs text-slate-500">
                    Urus jabatan di bawah setiap Pusat IAB.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeptForm({
                      id: '',
                      centerId: organizations[0]?.id || '',
                      code: '',
                      name: '',
                      headName: '',
                      headUid: '',
                      status: 'active',
                      isNew: true,
                    });
                    setDeptModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Jabatan
                </button>
              </div>
              <div className="divide-y divide-slate-100 text-xs">
                {departments.map((d) => {
                  const center = organizations.find((o) => o.id === d.centerId);
                  return (
                    <div key={d.id} className="py-3 flex items-center justify-between gap-4">
                      <div>
                        <p className="font-bold text-[#0B1F3B]">
                          {d.name} <span className="font-mono-tabular text-slate-500">({d.code})</span>
                        </p>
                        <p className="text-slate-600 mt-0.5">
                          Pusat: {center?.name || d.centerId} · Ketua: {d.headName || 'Belum ditetapkan'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setDeptForm({ ...d, isNew: false });
                          setDeptModalOpen(true);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                      >
                        Ubah
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* 5. PROFILE MANAGEMENT */}
          {section === 'profiles' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">Pengurusan Profil Pegawai</h3>
                  <p className="text-xs text-slate-500">
                    Semak, cari dan buka mana-mana rekod profil pegawai untuk pengesahan atau kemas kini.
                  </p>
                </div>
                <div className="relative w-full sm:w-64">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={profileSearch}
                    onChange={(e) => setProfileSearch(e.target.value)}
                    placeholder="Cari nama, ID staf, kepakaran..."
                    className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-semibold">Pegawai</th>
                      <th className="py-2.5 px-3 font-semibold">Pusat & Jabatan</th>
                      <th className="py-2.5 px-3 font-semibold">Kepakaran Utama</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Kelengkapan</th>
                      <th className="py-2.5 pl-3 font-semibold text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProfiles.map((p) => (
                      <tr key={p.staffId} className="hover:bg-slate-50">
                        <td className="py-3 pr-3 flex items-center gap-2.5">
                          <DriveImage driveFileId={p.photoDisplayUrl} fullName={p.fullName} className="w-9 h-9 rounded-lg" />
                          <div>
                            <p className="font-semibold text-[#0B1F3B]">{p.fullName}</p>
                            <p className="text-slate-500 font-mono-tabular">
                              {p.staffId} · {p.grade || '-'}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-700">
                          <p className="font-medium">{p.departmentName || '-'}</p>
                          <p className="text-slate-500">{p.centerName || '-'}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{p.primaryExpertise || '-'}</td>
                        <td className="py-3 px-3 text-right font-mono-tabular font-bold text-[#0B1F3B]">
                          {p.completionPercent}%
                        </td>
                        <td className="py-3 pl-3 text-right whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => onInspectProfile(p.staffId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            Buka Profil
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 6. GOOGLE DRIVE MANAGEMENT */}
          {section === 'drive' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center">
                      <Cloud className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-[#0B1F3B]">
                        Integrasi Pemilik Storan Google Drive Berpusat
                      </h3>
                      <p className="text-xs text-slate-500">
                        Satu akaun Google rasmi IAB menyimpan gambar profil & sijil pegawai secara sulit.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={refreshDriveStatus}
                    disabled={loadingDrive}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingDrive ? 'animate-spin' : ''}`} />
                    Semak Status
                  </button>
                </div>

                {/* Live Drive Status KPIs */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Status Sambungan</p>
                    <p
                      className={`text-sm font-bold mt-1 ${
                        driveStatus?.status === 'connected'
                          ? 'text-emerald-700'
                          : driveStatus?.status === 'pending_configuration' || driveStatus?.status === 'disconnected'
                          ? 'text-amber-700'
                          : 'text-red-700'
                      }`}
                    >
                      {driveStatus?.status === 'connected'
                        ? 'Bersambung (Aktif)'
                        : driveStatus?.status === 'pending_configuration'
                        ? 'Menunggu Konfigurasi Secrets'
                        : driveStatus?.status === 'disconnected'
                        ? 'Sedia Disambung (OAuth Dikesan)'
                        : 'Ralat / Belum Disambung'}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Emel Pemilik Storan</p>
                    <p className="text-sm font-bold text-[#0B1F3B] mt-1 truncate">
                      {driveStatus?.connectedEmail || 'Belum disambung'}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Folder Induk & Penyulitan</p>
                    <p className="text-xs font-mono-tabular font-semibold text-[#0B1F3B] mt-1 truncate">
                      {driveStatus?.rootFolderId || '-'}
                    </p>
                    <p
                      className={`text-[11px] font-semibold mt-0.5 ${
                        driveStatus?.encryptionKeyPersistent ? 'text-emerald-700' : 'text-amber-700'
                      }`}
                    >
                      {driveStatus?.encryptionKeyPersistent
                        ? 'Kunci penyulitan kekal aktif'
                        : 'Kunci sementara (sila set DRIVE_TOKEN_ENCRYPTION_KEY)'}
                    </p>
                  </div>
                  <div className="p-4 rounded-lg bg-slate-50 border border-slate-200">
                    <p className="text-slate-500">Jumlah Fail Disimpan</p>
                    <p className="text-sm font-bold font-mono-tabular text-[#0B1F3B] mt-1">
                      {(driveStatus?.uploadedDocumentsCount || 0) + (driveStatus?.uploadedPhotosCount || 0)} fail
                    </p>
                  </div>
                </div>

                {/* OAuth Actions */}
                <div className="flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    disabled={!driveStatus?.oauthConfigured}
                    onClick={() =>
                      handleDriveConnect(driveStatus?.status === 'connected' ? 'reconnect' : 'connect')
                    }
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50 whitespace-nowrap"
                  >
                    <Cloud className="w-4 h-4" />
                    {driveStatus?.status === 'connected'
                      ? 'Sambung Semula / Tukar Akaun Drive'
                      : 'Sambung Akaun Google Drive'}
                  </button>
                  <button
                    type="button"
                    disabled={driveStatus?.status !== 'connected' || loadingDrive}
                    onClick={handleDriveTest}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg disabled:opacity-50 whitespace-nowrap"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    Uji Sambungan & Folder
                  </button>
                  {driveStatus?.status === 'connected' && (
                    <button
                      type="button"
                      onClick={handleDriveDisconnect}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-red-700 bg-red-50 hover:bg-red-100 rounded-lg whitespace-nowrap"
                    >
                      <Unplug className="w-4 h-4" />
                      Putuskan Sambungan
                    </button>
                  )}
                </div>

                {/* Configuration Guide (always truthful if env vars missing) */}
                <div className="p-5 rounded-xl bg-amber-50/70 border border-amber-200 space-y-3 text-xs text-slate-700">
                  <p className="font-bold text-amber-950">
                    Keperluan Konfigurasi Google Cloud OAuth 2.0 (Pemilik Storan)
                  </p>
                  <p className="leading-relaxed">
                    {driveStatus?.message ||
                      'Untuk mengaktifkan muat naik sebenar ke Google Drive, tetapkan pemboleh ubah persekitaran pelayan berikut dalam AI Studio Secrets:'}
                  </p>
                  <ul className="list-disc pl-5 space-y-1 font-mono-tabular text-[11px]">
                    <li>GOOGLE_DRIVE_CLIENT_ID ({driveStatus?.oauthConfigured ? 'Dikesan' : 'Belum ditetapkan'})</li>
                    <li>GOOGLE_DRIVE_CLIENT_SECRET ({driveStatus?.oauthConfigured ? 'Dikesan' : 'Belum ditetapkan'})</li>
                    <li>
                      DRIVE_TOKEN_ENCRYPTION_KEY ({driveStatus?.encryptionKeyPersistent ? 'Dikesan (Kekal)' : 'Belum ditetapkan — guna kunci sementara'})
                    </li>
                  </ul>
                  <div className="pt-2 space-y-1.5">
                    <p className="font-semibold text-slate-900">
                      Authorized Redirect URIs (Google Cloud Console &gt; OAuth 2.0 Client):
                    </p>
                    <div className="p-2.5 rounded bg-white border border-amber-200 font-mono-tabular text-[11px] break-all">
                      {DEV_CALLBACK_URL}
                    </div>
                    <div className="p-2.5 rounded bg-white border border-amber-200 font-mono-tabular text-[11px] break-all">
                      {PRE_CALLBACK_URL}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 7. CERTIFICATE MANAGEMENT */}
          {section === 'certificates' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">
                    Pengurusan Sijil Pegawai ({certsAdmin.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Senarai metadata sijil berdaftar dalam Firestore bersama pautan tontonan selamat melalui pelayan.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={certCategoryFilter}
                    onChange={(e) => setCertCategoryFilter(e.target.value)}
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="ALL">Semua Kategori</option>
                    {CERTIFICATE_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                  <input
                    type="text"
                    value={certSearch}
                    onChange={(e) => setCertSearch(e.target.value)}
                    placeholder="Cari tajuk sijil atau ID staf..."
                    className="px-3 py-2 text-xs border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {filteredCerts.length === 0 ? (
                <p className="text-xs text-slate-500 py-8 text-center">
                  Tiada rekod sijil ditemui dalam pangkalan data.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 text-slate-500">
                        <th className="py-2.5 pr-3 font-semibold">Tajuk Sijil</th>
                        <th className="py-2.5 px-3 font-semibold">ID Staf</th>
                        <th className="py-2.5 px-3 font-semibold">Kategori</th>
                        <th className="py-2.5 px-3 font-semibold">Saiz</th>
                        <th className="py-2.5 pl-3 font-semibold text-right">Fail Drive</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredCerts.map((c) => (
                        <tr key={c.id}>
                          <td className="py-3 pr-3 font-semibold text-[#0B1F3B]">{c.title}</td>
                          <td className="py-3 px-3 font-mono-tabular">{c.staffId}</td>
                          <td className="py-3 px-3">{c.category}</td>
                          <td className="py-3 px-3 font-mono-tabular">{formatBytes(c.fileSize)}</td>
                          <td className="py-3 pl-3 text-right">
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  const { blobUrl, fileName } = await fetchDriveFileBlob(c.driveFileId, true);
                                  const a = document.createElement('a');
                                  a.href = blobUrl;
                                  a.download = fileName;
                                  a.click();
                                  URL.revokeObjectURL(blobUrl);
                                } catch (err: any) {
                                  showToast('error', err?.message || 'Gagal memuat turun sijil.');
                                }
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                            >
                              <Download className="w-3.5 h-3.5" />
                              Muat Turun
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* 8. PHOTO MANAGEMENT */}
          {section === 'photos' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">
                  Pengurusan Gambar Profil Pegawai (1:1)
                </h3>
                <p className="text-xs text-slate-500">
                  {photosAdmin.length} gambar berdaftar ·{' '}
                  {countableProfiles.filter((p) => !p.hasPhoto).length} pegawai belum memuat naik gambar profil.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {countableProfiles.map((p) => (
                  <div
                    key={p.staffId}
                    className="p-3.5 rounded-lg border border-slate-200 flex items-center gap-3"
                  >
                    <DriveImage
                      driveFileId={p.photoDisplayUrl}
                      fullName={p.fullName}
                      className="w-12 h-12 rounded-lg"
                    />
                    <div className="min-w-0 flex-1 text-xs">
                      <p className="font-bold text-[#0B1F3B] truncate">{p.fullName}</p>
                      <p className="text-slate-500 font-mono-tabular">{p.staffId}</p>
                      <p className={p.hasPhoto ? 'text-emerald-700 font-semibold mt-0.5' : 'text-amber-700 font-semibold mt-0.5'}>
                        {p.hasPhoto ? 'Gambar 1:1 Tersedia' : 'Tiada Gambar'}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => onInspectProfile(p.staffId)}
                      className="px-2.5 py-1 text-xs font-semibold text-[#0B1F3B] bg-slate-100 rounded"
                    >
                      Lihat
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 9. EXPERTISE, COMPETENCY & DROPLIST CATALOGS */}
          {section === 'categories' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">
                  Katalog Piawai Dropdown &amp; Kompetensi Digital / AI
                </h3>
                <p className="text-xs text-slate-500">
                  Senarai ini mengawal pilihan dropdown dalam Borang Profil (Tab D Institusi, Tab E Kepakaran, Tab F Kemahiran Aplikasi &amp; Pengetahuan, Tab H Tahun Penerbitan) dan Kompetensi IAB. Hanya Admin dibenarkan mengubah senarai ini.
                </p>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Expertise Categories */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">Bidang Kepakaran Utama ({expCategories.length})</h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newExpCat}
                      onChange={(e) => setNewExpCat(e.target.value)}
                      placeholder="Tambah bidang kepakaran..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newExpCat.trim();
                        if (!val || expCategories.includes(val)) return;
                        setExpCategories([...expCategories, val]);
                        setNewExpCat('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {expCategories.map((cat) => (
                      <div
                        key={cat}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        <span>{cat}</span>
                        <button
                          type="button"
                          onClick={() => setExpCategories(expCategories.filter((x) => x !== cat))}
                          className="text-slate-400 hover:text-red-700"
                          aria-label={`Padam ${cat}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kemahiran Aplikasi Droplist */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">
                    Kemahiran Aplikasi ({appSkillCategories.length})
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newAppSkillCat}
                      onChange={(e) => setNewAppSkillCat(e.target.value)}
                      placeholder="cth: Canva AI, NotebookLM..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newAppSkillCat.trim();
                        if (!val || appSkillCategories.includes(val)) return;
                        setAppSkillCategories([...appSkillCategories, val]);
                        setNewAppSkillCat('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {appSkillCategories.map((cat, idx) => (
                      <div
                        key={`${cat}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        {editingAppIdx === idx ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingAppVal}
                              onChange={(e) => setEditingAppVal(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = editingAppVal.trim();
                                if (!v) return;
                                setAppSkillCategories(appSkillCategories.map((x, i) => (i === idx ? v : x)));
                                setEditingAppIdx(null);
                              }}
                              className="text-emerald-700 hover:text-emerald-900"
                              aria-label="Simpan"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span>{cat}</span>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingAppIdx(idx);
                              setEditingAppVal(cat);
                            }}
                            className="text-slate-400 hover:text-[#0B1F3B]"
                            aria-label={`Edit ${cat}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setAppSkillCategories(appSkillCategories.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-700"
                            aria-label={`Padam ${cat}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Kemahiran Pengetahuan Droplist */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">
                    Kemahiran Pengetahuan ({knowSkillCategories.length})
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newKnowSkillCat}
                      onChange={(e) => setNewKnowSkillCat(e.target.value)}
                      placeholder="cth: Digital Leadership..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newKnowSkillCat.trim();
                        if (!val || knowSkillCategories.includes(val)) return;
                        setKnowSkillCategories([...knowSkillCategories, val]);
                        setNewKnowSkillCat('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                    {knowSkillCategories.map((cat, idx) => (
                      <div
                        key={`${cat}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        {editingKnowIdx === idx ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingKnowVal}
                              onChange={(e) => setEditingKnowVal(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = editingKnowVal.trim();
                                if (!v) return;
                                setKnowSkillCategories(knowSkillCategories.map((x, i) => (i === idx ? v : x)));
                                setEditingKnowIdx(null);
                              }}
                              className="text-emerald-700 hover:text-emerald-900"
                              aria-label="Simpan"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span>{cat}</span>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingKnowIdx(idx);
                              setEditingKnowVal(cat);
                            }}
                            className="text-slate-400 hover:text-[#0B1F3B]"
                            aria-label={`Edit ${cat}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setKnowSkillCategories(knowSkillCategories.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-700"
                            aria-label={`Padam ${cat}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-4 border-t border-slate-200">
                {/* Senarai Institusi (Tab D) */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">
                    Senarai Institusi Tab D ({institutionCategories.length})
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newInstitutionCat}
                      onChange={(e) => setNewInstitutionCat(e.target.value)}
                      placeholder="cth: UMP / UTAR..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newInstitutionCat.trim();
                        if (!val || institutionCategories.includes(val)) return;
                        setInstitutionCategories([...institutionCategories, val]);
                        setNewInstitutionCat('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {institutionCategories.map((inst, idx) => (
                      <div
                        key={`${inst}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        {editingInstIdx === idx ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingInstVal}
                              onChange={(e) => setEditingInstVal(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = editingInstVal.trim();
                                if (!v) return;
                                setInstitutionCategories(
                                  institutionCategories.map((x, i) => (i === idx ? v : x))
                                );
                                setEditingInstIdx(null);
                              }}
                              className="text-emerald-700 hover:text-emerald-900"
                              aria-label="Simpan"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span>{inst}</span>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingInstIdx(idx);
                              setEditingInstVal(inst);
                            }}
                            className="text-slate-400 hover:text-[#0B1F3B]"
                            aria-label={`Edit ${inst}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setInstitutionCategories(institutionCategories.filter((_, i) => i !== idx))
                            }
                            className="text-slate-400 hover:text-red-700"
                            aria-label={`Padam ${inst}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Senarai Tahun Penerbitan (Tab H) */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">
                    Senarai Tahun Tab H ({publicationYears.length})
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newPubYear}
                      onChange={(e) => setNewPubYear(e.target.value)}
                      placeholder="cth: 2031..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg font-mono-tabular"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newPubYear.trim();
                        if (!val || publicationYears.includes(val)) return;
                        setPublicationYears([...publicationYears, val]);
                        setNewPubYear('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {publicationYears.map((yr, idx) => (
                      <div
                        key={`${yr}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-mono-tabular"
                      >
                        <span>{yr}</span>
                        <button
                          type="button"
                          onClick={() =>
                            setPublicationYears(publicationYears.filter((_, i) => i !== idx))
                          }
                          className="text-slate-400 hover:text-red-700"
                          aria-label={`Padam ${yr}`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Senarai Modul IAB (Kompetensi IAB) */}
                <div className="space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">
                    Senarai Modul IAB ({iabModules.length})
                  </h4>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newIabModule}
                      onChange={(e) => setNewIabModule(e.target.value)}
                      placeholder="cth: Modul AI / NPQEL..."
                      className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const val = newIabModule.trim();
                        if (!val || iabModules.includes(val)) return;
                        setIabModules([...iabModules, val]);
                        setNewIabModule('');
                      }}
                      className="px-3 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      Tambah
                    </button>
                  </div>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {iabModules.map((mod, idx) => (
                      <div
                        key={`${mod}-${idx}`}
                        className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs"
                      >
                        {editingIabModIdx === idx ? (
                          <div className="flex-1 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={editingIabModVal}
                              onChange={(e) => setEditingIabModVal(e.target.value)}
                              className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const v = editingIabModVal.trim();
                                if (!v) return;
                                setIabModules(iabModules.map((x, i) => (i === idx ? v : x)));
                                setEditingIabModIdx(null);
                              }}
                              className="text-emerald-700 hover:text-emerald-900"
                              aria-label="Simpan"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <span>{mod}</span>
                        )}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingIabModIdx(idx);
                              setEditingIabModVal(mod);
                            }}
                            className="text-slate-400 hover:text-[#0B1F3B]"
                            aria-label={`Edit ${mod}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setIabModules(iabModules.filter((_, i) => i !== idx))}
                            className="text-slate-400 hover:text-red-700"
                            aria-label={`Padam ${mod}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveCategoriesAndSettings}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Save className="w-4 h-4" />
                  Simpan Katalog Kategori
                </button>
              </div>
            </div>
          )}

          {/* 10. SYSTEM SETTINGS */}
          {section === 'settings' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">Tetapan Sistem & Had Muat Naik</h3>
                <p className="text-xs text-slate-500">
                  Konfigurasi nama rasmi platform dan polisi saiz fail maksimum.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sistem</label>
                  <input
                    type="text"
                    value={systemName}
                    onChange={(e) => setSystemName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Institusi</label>
                  <input
                    type="text"
                    value={institutionName}
                    onChange={(e) => setInstitutionName(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Had Saiz Gambar Profil (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={maxPhotoSizeMb}
                    onChange={(e) => setMaxPhotoSizeMb(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Had Saiz Sijil / Dokumen (MB)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={maxCertSizeMb}
                    onChange={(e) => setMaxCertSizeMb(Number(e.target.value))}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleSaveCategoriesAndSettings}
                  className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Save className="w-4 h-4" />
                  Simpan Tetapan Sistem
                </button>
              </div>
            </div>
          )}

          {/* 11. AUDIT LOGS */}
          {section === 'audit' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">
                    Log Audit Keselamatan (Rekod Kekal / Tidak Boleh Dipadam)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Menjejak log masuk, perubahan peranan, kelulusan akaun, kemas kini profil, muat naik fail dan eksport.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => exportAuditLogsToExcel(filteredAuditLogs)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg shrink-0"
                >
                  <Download className="w-3.5 h-3.5" />
                  Eksport Audit (.xlsx)
                </button>
              </div>

              <div className="flex flex-wrap gap-3">
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => setAuditSearch(e.target.value)}
                  placeholder="Cari aktiviti, emel pelaku, butiran..."
                  className="flex-1 min-w-[220px] px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <select
                  value={auditOutcomeFilter}
                  onChange={(e) => setAuditOutcomeFilter(e.target.value as 'ALL' | 'success' | 'failure')}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">Semua Keputusan</option>
                  <option value="success">Berjaya</option>
                  <option value="failure">Gagal</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-semibold">Aktiviti</th>
                      <th className="py-2.5 px-3 font-semibold">Pelaku</th>
                      <th className="py-2.5 px-3 font-semibold">Sasaran</th>
                      <th className="py-2.5 px-3 font-semibold">Status</th>
                      <th className="py-2.5 pl-3 font-semibold">Butiran</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAuditLogs.map((l) => (
                      <tr key={l.id}>
                        <td className="py-2.5 pr-3 font-mono-tabular font-semibold text-[#0B1F3B]">
                          {l.actionType}
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{l.actorEmail}</td>
                        <td className="py-2.5 px-3 font-mono-tabular text-slate-600">
                          {l.targetType}:{l.targetId}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`font-semibold ${
                              l.outcome === 'success' ? 'text-emerald-700' : 'text-red-700'
                            }`}
                          >
                            {l.outcome === 'success' ? 'Berjaya' : 'Gagal'}
                          </span>
                        </td>
                        <td className="py-2.5 pl-3 text-slate-600">{l.details}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 12. DATA EXPORT */}
          {section === 'export' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">Eksport Data Rasmi Organisasi</h3>
                <p className="text-xs text-slate-500">
                  Jana fail hamparan Excel (.xlsx) daripada rekod Firestore sebenar mengikut skop organisasi.
                </p>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-5 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">Daftar Penuh Modal Insan & Kepakaran</h4>
                  <p className="text-xs text-slate-600">
                    Mengandungi {countableProfiles.length} rekod pegawai termasuk gred hakiki/KUP, jabatan, kelayakan tertinggi, kepakaran, dan kompetensi digital.
                  </p>
                  <button
                    type="button"
                    onClick={() => exportStaffProfilesToExcel(countableProfiles, 'IAB_Daftar_Modal_Insan')}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                    Muat Turun Excel (.xlsx)
                  </button>
                </div>
                <div className="p-5 rounded-xl border border-slate-200 space-y-3">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">Rekod Log Audit Keselamatan</h4>
                  <p className="text-xs text-slate-600">
                    Mengandungi {auditLogs.length} log aktiviti terkini bagi tujuan semakan tatakelola ICT dan audit dalaman.
                  </p>
                  <button
                    type="button"
                    onClick={() => exportAuditLogsToExcel(auditLogs)}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                    Muat Turun Audit (.xlsx)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* 13. BACKUP & RECOVERY + EXPLICIT UAT SEED */}
          {section === 'backup' && (
            <div className="space-y-6">
              <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
                <h3 className="text-base font-bold text-[#0B1F3B]">Sandaran Data & Pelan Pemulihan (BCP)</h3>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Muat turun salinan sandaran penuh struktur Firestore dalam format JSON untuk arkib berkala
                  pentadbir sistem. Fail fizikal kekal tersimpan secara selamat dalam struktur folder Google Drive
                  IAB (01 hingga 07) berasaskan ID Staf.
                </p>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={handleDownloadBackupJson}
                    className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                  >
                    <Download className="w-4 h-4" />
                    Muat Turun Sandaran Penuh (.json)
                  </button>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2 text-xs text-slate-700">
                  <p className="font-bold text-[#0B1F3B]">Prosedur Kesinambungan Operasi (Continuity Runbook)</p>
                  <ul className="list-disc pl-5 space-y-1 leading-relaxed">
                    <li>
                      <strong>Pertukaran Pemilik Storan Google Drive:</strong> Pastikan folder induk{' '}
                      <span className="font-mono-tabular">IAB_HUMAN_CAPITAL_SYSTEM</span> dikongsi kepada akaun
                      baharu terlebih dahulu, kemudian klik "Sambung Semula / Tukar Akaun Drive" pada Modul 6.
                    </li>
                    <li>
                      <strong>Penggantungan / Persaraan Pegawai:</strong> Tukar status akaun kepada{' '}
                      <span className="font-mono-tabular">suspended</span> atau{' '}
                      <span className="font-mono-tabular">inactive</span>; fail sijil & profil kekal dalam rekod
                      organisasi tanpa hilang.
                    </li>
                    <li>
                      <strong>Pertukaran Jabatan / Pusat:</strong> Kemas kini Pusat dan Jabatan pada Profil Pegawai
                      atau Akaun Pengguna; skop capaian L1/L2 diselaraskan secara automatik oleh Firestore Rules.
                    </li>
                  </ul>
                </div>
              </div>

              {legacyUatCount > 0 && (
                <div className="bg-white border border-amber-200 rounded-xl p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <Trash2 className="w-5 h-5 text-red-600" />
                    <h3 className="text-base font-bold text-[#0B1F3B]">
                      Pembersihan Rekod Sampel Terdahulu ({legacyUatCount})
                    </h3>
                  </div>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Dikesan <span className="font-mono-tabular font-semibold">{legacyUatCount}</span> rekod dummy{' '}
                    <span className="font-mono-tabular font-semibold">IAB-UAT-*</span> yang masih tersimpan dalam Firestore.
                    Klik butang di bawah untuk membersihkan rekod sampel tersebut sepenuhnya.
                  </p>
                  <button
                    type="button"
                    onClick={handlePurgeLegacyUat}
                    className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                    Bersihkan Data Sampel Dummy
                  </button>
                </div>
              )}
            </div>
          )}

          {/* 14. PROFILE COMPLETION MONITORING */}
          {section === 'monitoring' && (
            <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">
                    Pemantauan Kelengkapan Profil Pegawai ({monitoredProfiles.length})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Kenal pasti pegawai yang belum melengkapkan Seksyen A–J atau belum memuat naik gambar profil.
                  </p>
                </div>
                <select
                  value={monitoringFilter}
                  onChange={(e) => setMonitoringFilter(e.target.value as typeof monitoringFilter)}
                  className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                >
                  <option value="ALL">Semua Pegawai</option>
                  <option value="INCOMPLETE">Belum Lengkap (&lt; 80%)</option>
                  <option value="NO_PHOTO">Tiada Gambar Profil</option>
                  <option value="COMPLETE">Lengkap (&ge; 80%)</option>
                </select>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 text-slate-500">
                      <th className="py-2.5 pr-3 font-semibold">Pegawai</th>
                      <th className="py-2.5 px-3 font-semibold">Jabatan</th>
                      <th className="py-2.5 px-3 font-semibold">Bahagian Belum Lengkap</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Peratus</th>
                      <th className="py-2.5 pl-3 font-semibold text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {monitoredProfiles.map((p) => (
                      <tr key={p.staffId}>
                        <td className="py-3 pr-3">
                          <p className="font-semibold text-[#0B1F3B]">{p.fullName}</p>
                          <p className="text-slate-500 font-mono-tabular">{p.staffId}</p>
                        </td>
                        <td className="py-3 px-3 text-slate-700">{p.departmentName || '-'}</td>
                        <td className="py-3 px-3 text-slate-600">
                          {p.missingSections?.length ? p.missingSections.slice(0, 3).join(', ') : 'Tiada'}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span
                            className={`font-mono-tabular font-bold ${
                              p.completionPercent >= 80
                                ? 'text-emerald-700'
                                : p.completionPercent >= 50
                                ? 'text-amber-700'
                                : 'text-red-700'
                            }`}
                          >
                            {p.completionPercent}%
                          </span>
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => onInspectProfile(p.staffId)}
                            className="px-2.5 py-1 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                          >
                            Semak
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Popup Modal: Daftar & Jemput Pengguna Rasmi */}
      {inviteModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setInviteModalOpen(false)}
        >
          <form
            onSubmit={handleInviteSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-[#0B1F3B]" />
                <div>
                  <h3 className="text-sm font-bold text-[#0B1F3B]">Daftar &amp; Jemput Pengguna Rasmi</h3>
                  <p className="text-[11px] text-slate-500">
                    Pengguna yang dijemput akan diaktifkan serta-merta apabila log masuk menggunakan emel berdaftar.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang jemputan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Emel Rasmi *</label>
                  <input
                    type="email"
                    required
                    value={inviteForm.email}
                    onChange={(e) => setInviteForm({ ...inviteForm, email: e.target.value })}
                    placeholder="pegawai@iab.edu.my"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Penuh *</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.fullName}
                    onChange={(e) => setInviteForm({ ...inviteForm, fullName: e.target.value })}
                    placeholder="Dr. / En. / Pn. Nama"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ID Staf (A-Z, 0-9, -) *</label>
                  <input
                    type="text"
                    required
                    value={inviteForm.staffId}
                    onChange={(e) => setInviteForm({ ...inviteForm, staffId: e.target.value })}
                    placeholder="IAB-STF-0102"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan (RBAC)</label>
                  <select
                    value={inviteForm.role}
                    onChange={(e) => {
                      const nextRole = e.target.value as UserRole;
                      setInviteForm({
                        ...inviteForm,
                        role: nextRole,
                        isAdmin: nextRole === 'L0' ? true : inviteForm.isAdmin,
                      });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat</label>
                  <select
                    value={inviteForm.centerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      const firstDept = departments.find((d) => d.centerId === cid)?.id || '';
                      setInviteForm({ ...inviteForm, centerId: cid, departmentId: firstDept });
                    }}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
                  <select
                    value={inviteForm.departmentId}
                    onChange={(e) => setInviteForm({ ...inviteForm, departmentId: e.target.value })}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {departments
                      .filter((d) => !inviteForm.centerId || d.centerId === inviteForm.centerId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={inviteForm.role === 'L0'}
                  checked={inviteForm.role === 'L0' ? true : inviteForm.isAdmin}
                  onChange={(e) => setInviteForm({ ...inviteForm, isAdmin: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Beri hak Pentadbir Sistem (Admin) tambahan
              </label>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setInviteModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" />
                Daftar Jemputan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup Modal: Kemas Kini Akaun Pengguna */}
      {editingUser && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setEditingUser(null)}
        >
          <form
            onSubmit={handleSaveUserEdit}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3B]">
                  Kemas Kini Akaun: {editingUser.email}
                </h4>
              </div>
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang pengguna"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Paparan</label>
                  <input
                    type="text"
                    required
                    value={editingUser.displayName}
                    onChange={(e) => setEditingUser({ ...editingUser, displayName: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ID Staf</label>
                  <input
                    type="text"
                    required
                    value={editingUser.staffId}
                    onChange={(e) => setEditingUser({ ...editingUser, staffId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                  <select
                    value={editingUser.status}
                    onChange={(e) =>
                      setEditingUser({ ...editingUser, status: e.target.value as AccountStatus })
                    }
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="pending">pending</option>
                    <option value="active">active</option>
                    <option value="suspended">suspended</option>
                    <option value="inactive">inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat</label>
                  <select
                    value={editingUser.centerId}
                    onChange={(e) => setEditingUser({ ...editingUser, centerId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Pilih Pusat --</option>
                    {organizations.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
                  <select
                    value={editingUser.departmentId}
                    onChange={(e) => setEditingUser({ ...editingUser, departmentId: e.target.value })}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="">-- Pilih Jabatan --</option>
                    {departments
                      .filter((d) => !editingUser.centerId || d.centerId === editingUser.centerId)
                      .map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.name}
                        </option>
                      ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan</label>
                  <select
                    value={editingUser.role}
                    onChange={(e) => {
                      const nextRole = e.target.value as UserRole;
                      setEditingUser({
                        ...editingUser,
                        role: nextRole,
                        isAdmin: nextRole === 'L0' ? true : editingUser.isAdmin,
                      });
                    }}
                    className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                  >
                    {(['L0', 'L1', 'L2', 'L3', 'L4', 'L5'] as UserRole[]).map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <label className="inline-flex items-center gap-2 text-xs font-medium text-slate-700">
                <input
                  type="checkbox"
                  disabled={editingUser.role === 'L0'}
                  checked={editingUser.role === 'L0' ? true : editingUser.isAdmin}
                  onChange={(e) => setEditingUser({ ...editingUser, isAdmin: e.target.checked })}
                  className="rounded border-slate-300"
                />
                Hak Pentadbir Sistem (Admin)
              </label>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setEditingUser(null)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Akaun
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup Modal: Tambah / Ubah Pusat */}
      {orgModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setOrgModalOpen(false)}
        >
          <form
            onSubmit={handleSaveOrg}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {orgForm.isNew ? 'Tambah Pusat Baharu' : `Kemas Kini Pusat: ${orgForm.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setOrgModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang pusat"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kod Pusat *</label>
                <input
                  type="text"
                  required
                  value={orgForm.code}
                  onChange={(e) => setOrgForm({ ...orgForm, code: e.target.value })}
                  placeholder="IAB-INDUK"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Rasmi Pusat *</label>
                <input
                  type="text"
                  required
                  value={orgForm.name}
                  onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                  placeholder="Pusat Pengurusan dan Kepimpinan Pendidikan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Ketua Pusat</label>
                <input
                  type="text"
                  value={orgForm.headName}
                  onChange={(e) => setOrgForm({ ...orgForm, headName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Lokasi / Kampus</label>
                <input
                  type="text"
                  value={orgForm.location}
                  onChange={(e) => setOrgForm({ ...orgForm, location: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={orgForm.status}
                  onChange={(e) => setOrgForm({ ...orgForm, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                </select>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOrgModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Pusat
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup Modal: Tambah / Ubah Jabatan */}
      {deptModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setDeptModalOpen(false)}
        >
          <form
            onSubmit={handleSaveDept}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {deptForm.isNew ? 'Tambah Jabatan Baharu' : `Kemas Kini Jabatan: ${deptForm.name}`}
              </h3>
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang jabatan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat Induk *</label>
                <select
                  required
                  value={deptForm.centerId}
                  onChange={(e) => setDeptForm({ ...deptForm, centerId: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Pilih Pusat --</option>
                  {organizations.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kod Jabatan *</label>
                <input
                  type="text"
                  required
                  value={deptForm.code}
                  onChange={(e) => setDeptForm({ ...deptForm, code: e.target.value })}
                  placeholder="JKP"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Jabatan *</label>
                <input
                  type="text"
                  required
                  value={deptForm.name}
                  onChange={(e) => setDeptForm({ ...deptForm, name: e.target.value })}
                  placeholder="Jabatan Kepimpinan Pendidikan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Ketua Jabatan</label>
                <input
                  type="text"
                  value={deptForm.headName}
                  onChange={(e) => setDeptForm({ ...deptForm, headName: e.target.value })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Status</label>
                <select
                  value={deptForm.status}
                  onChange={(e) => setDeptForm({ ...deptForm, status: e.target.value as 'active' | 'inactive' })}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="active">Aktif</option>
                  <option value="inactive">Tidak Aktif</option>
                </select>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeptModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Jabatan
              </button>
            </div>
          </form>
        </div>
      )}

      {confirmState && (
        <ConfirmDialog
          open={confirmState.open}
          title={confirmState.title}
          description={confirmState.description}
          variant={confirmState.variant}
          confirmLabel={confirmState.confirmLabel}
          busy={confirmBusy}
          onConfirm={runConfirmed}
          onCancel={() => setConfirmState(null)}
        />
      )}
    </div>
  );
};
