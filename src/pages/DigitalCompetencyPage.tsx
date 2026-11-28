import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Check,
  Cpu,
  Edit3,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  COMPETENCY_LEVELS,
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  buildSafeDriveFilePrefix,
  computeProfileCompletion,
} from '../lib/constants';
import {
  deleteDriveFileApi,
  fetchDriveFileBlob,
  getDriveStatus,
  uploadFileToDriveApi,
  type DriveStatusResponse,
} from '../services/apiClient';
import {
  getStaffProfileBundle,
  getSystemSettings,
  makeRecordId,
  saveCertificateMetadata,
  saveStaffCompetencies,
  saveSystemSettings,
} from '../services/firestoreService';
import type {
  Certificate,
  CompetencyItem,
  CompetencySkillType,
  ExpertiseRecord,
  ProfilePhoto,
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
  UserAccount,
} from '../types/iab';

interface DigitalCompetencyPageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

function computeValidityDuration(
  startStr: string,
  endStr: string
): { valid: boolean; label: string } {
  if (!startStr || !endStr) {
    return { valid: false, label: 'Sila pilih tarikh mula dan tarikh tamat' };
  }
  const sParts = startStr.split('-').map(Number);
  const eParts = endStr.split('-').map(Number);
  if (
    sParts.length !== 3 ||
    eParts.length !== 3 ||
    sParts.some(Number.isNaN) ||
    eParts.some(Number.isNaN)
  ) {
    return { valid: false, label: 'Format tarikh tidak sah' };
  }
  const [sy, sm, sd] = sParts;
  const [ey, em, ed] = eParts;
  const startUtc = Date.UTC(sy, sm - 1, sd);
  const endUtc = Date.UTC(ey, em - 1, ed);
  if (endUtc < startUtc) {
    return { valid: false, label: 'Tarikh tamat mestilah selepas tarikh mula' };
  }

  let years = ey - sy;
  let months = em - sm;
  let days = ed - sd;

  if (days < 0) {
    const prevMonthDays = new Date(Date.UTC(ey, em - 1, 0)).getUTCDate();
    days += prevMonthDays;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} tahun`);
  if (months > 0) parts.push(`${months} bulan`);
  if (days > 0 || parts.length === 0) parts.push(`${days} hari`);

  return { valid: true, label: parts.join(' ') };
}

function formatDisplayDate(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

export const DigitalCompetencyPage: React.FC<DigitalCompetencyPageProps> = ({
  userAccount,
  profiles,
  sysSettings: initialSettings,
  onSystemSettingsUpdated,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(initialSettings);

  const [bundleProfile, setBundleProfile] = useState<StaffProfile | null>(null);
  const [bundlePii, setBundlePii] = useState<StaffPrivatePII | null>(null);
  const [bundleQuals, setBundleQuals] = useState<Qualification[]>([]);
  const [bundleExp, setBundleExp] = useState<ExpertiseRecord | null>(null);
  const [bundlePubs, setBundlePubs] = useState<Publication[]>([]);
  const [bundlePhoto, setBundlePhoto] = useState<ProfilePhoto | null>(null);

  const [competencyItems, setCompetencyItems] = useState<CompetencyItem[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);

  // Modal state
  const [compFormOpen, setCompFormOpen] = useState(false);
  const [compFormType, setCompFormType] = useState<CompetencySkillType>('aplikasi');
  const [editingCompIndex, setEditingCompIndex] = useState<number | null>(null);
  const [cCategoryName, setCCategoryName] = useState('');
  const [cLevel, setCLevel] = useState<CompetencyItem['level']>('Pertengahan');
  const [cYears, setCYears] = useState<number>(1);
  const [cNotes, setCNotes] = useState('');
  const [cHasCert, setCHasCert] = useState(false);
  const [cCertSource, setCCertSource] = useState<'existing' | 'upload'>('upload');
  const [cExistingCertId, setCExistingCertId] = useState('');
  const [cCertTitle, setCCertTitle] = useState('');
  const [cCertFile, setCCertFile] = useState<File | null>(null);
  const [cHasValidityPeriod, setCHasValidityPeriod] = useState(false);
  const [cCertStartDate, setCCertStartDate] = useState('');
  const [cCertEndDate, setCCertEndDate] = useState('');
  const [compFormError, setCompFormError] = useState('');
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [savingComp, setSavingComp] = useState(false);
  const [deletingCompIndex, setDeletingCompIndex] = useState<number | null>(null);

  // Admin droplist modal
  const [adminEditListType, setAdminEditListType] = useState<CompetencySkillType | null>(null);
  const [adminDraftList, setAdminDraftList] = useState<string[]>([]);
  const [adminNewSkillOption, setAdminNewSkillOption] = useState('');
  const [adminEditingIdx, setAdminEditingIdx] = useState<number | null>(null);
  const [adminEditingText, setAdminEditingText] = useState('');
  const [savingAdminList, setSavingAdminList] = useState(false);

  // Cert preview modal
  const [compCertPreview, setCompCertPreview] = useState<{
    title: string;
    blobUrl: string;
    mimeType: string;
  } | null>(null);
  const [loadingCertPreviewId, setLoadingCertPreviewId] = useState<string | null>(null);

  useEffect(() => {
    setSysSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile =
    profiles.find((p) => p.staffId === selectedStaffId) || bundleProfile;
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const applicationSkillOptions = useMemo(
    () =>
      sysSettings?.applicationSkillCategories?.length
        ? sysSettings.applicationSkillCategories
        : DEFAULT_APPLICATION_SKILL_CATEGORIES,
    [sysSettings?.applicationSkillCategories]
  );

  const knowledgeSkillOptions = useMemo(
    () =>
      sysSettings?.knowledgeSkillCategories?.length
        ? sysSettings.knowledgeSkillCategories
        : DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
    [sysSettings?.knowledgeSkillCategories]
  );

  const getEffectiveSkillType = (item: CompetencyItem): CompetencySkillType => {
    if (item.skillType === 'aplikasi' || item.skillType === 'pengetahuan') return item.skillType;
    return applicationSkillOptions.includes(item.categoryName) ? 'aplikasi' : 'pengetahuan';
  };

  const indexedAppCompetencies = useMemo(
    () =>
      competencyItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => getEffectiveSkillType(item) === 'aplikasi'),
    [competencyItems, applicationSkillOptions]
  );

  const indexedKnowCompetencies = useMemo(
    () =>
      competencyItems
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => getEffectiveSkillType(item) === 'pengetahuan'),
    [competencyItems, applicationSkillOptions]
  );

  const loadData = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const bundle = await getStaffProfileBundle(staffIdToLoad, userAccount);
      setBundleProfile(bundle.profile);
      setBundlePii(bundle.pii);
      setBundleQuals(bundle.qualifications);
      setBundleExp(bundle.expertise);
      setBundlePubs(bundle.publications);
      setBundlePhoto(bundle.photo);
      setCompetencyItems(bundle.competencies?.items || []);
      setCertificates(bundle.certificates);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuatkan rekod kompetensi digital & AI.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadData(selectedStaffId);
    }
  }, [selectedStaffId]);

  useEffect(() => {
    getDriveStatus()
      .then(setDriveStatus)
      .catch(() => null);
  }, []);

  const persistCompetencyList = async (
    nextItems: CompetencyItem[],
    newCert?: Certificate | null
  ) => {
    if (!selectedStaffId) return;
    const centerId = activeProfile?.centerId || userAccount.centerId || '';
    const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';
    const targetUid = activeProfile?.uid || (isOwnRecord ? userAccount.uid : '');
    const updatedCertCount = newCert ? certificates.length + 1 : certificates.length;

    const nextComp = computeProfileCompletion({
      profile: {
        fullName: activeProfile?.fullName || (isOwnRecord ? userAccount.displayName : ''),
        officialEmail: activeProfile?.officialEmail || (isOwnRecord ? userAccount.email : ''),
        position: activeProfile?.position || '',
        grade: activeProfile?.grade || '',
        scheme: activeProfile?.scheme || '',
        centerId,
        departmentId,
        highestQualification: activeProfile?.highestQualification || '',
        primaryExpertise: bundleExp?.primaryExpertise || activeProfile?.primaryExpertise || '',
        digitalCompetencies: nextItems.map((i) => i.categoryName),
        hasPhoto: Boolean(bundlePhoto || activeProfile?.hasPhoto),
      },
      pii: bundlePii,
      qualificationsCount: bundleQuals.length,
      expertise: bundleExp,
      competencies: { items: nextItems },
      publicationsCount: bundlePubs.length,
      certificatesCount: updatedCertCount,
    });

    const saved = await saveStaffCompetencies({
      staffId: selectedStaffId,
      uid: targetUid,
      centerId,
      departmentId,
      items: nextItems,
      completion: nextComp,
    });
    setCompetencyItems(saved);
    if (newCert) {
      setCertificates((prev) => [newCert, ...prev]);
    }
  };

  const openAddCompetencyForm = (type: CompetencySkillType) => {
    if (!canEdit) return;
    const options = type === 'aplikasi' ? applicationSkillOptions : knowledgeSkillOptions;
    setCompFormType(type);
    setEditingCompIndex(null);
    setCCategoryName(options[0] || '');
    setCLevel('Pertengahan');
    setCYears(1);
    setCNotes('');
    setCHasCert(false);
    setCCertSource('upload');
    setCExistingCertId('');
    setCCertTitle('');
    setCCertFile(null);
    setCHasValidityPeriod(false);
    setCCertStartDate('');
    setCCertEndDate('');
    setCompFormError('');
    setCompFormOpen(true);
    getDriveStatus()
      .then(setDriveStatus)
      .catch(() => null);
  };

  const openEditCompetencyForm = (item: CompetencyItem, index: number) => {
    if (!canEdit) return;
    const effectiveType = getEffectiveSkillType(item);
    setCompFormType(effectiveType);
    setEditingCompIndex(index);
    setCCategoryName(item.categoryName);
    setCLevel(item.level || 'Pertengahan');
    setCYears(Number(item.years) || 0);
    setCNotes(item.notes || '');
    const hasCert = Boolean(item.hasCertificate || item.certificateDriveFileId);
    setCHasCert(hasCert);
    setCCertSource(item.certificateId ? 'existing' : 'upload');
    setCExistingCertId(item.certificateId || '');
    setCCertTitle(item.certificateTitle || '');
    setCCertFile(null);
    const hasValidity = Boolean(
      effectiveType === 'aplikasi' &&
        hasCert &&
        (item.hasValidityPeriod || (item.certificateStartDate && item.certificateEndDate))
    );
    setCHasValidityPeriod(hasValidity);
    setCCertStartDate(hasValidity ? item.certificateStartDate || '' : '');
    setCCertEndDate(hasValidity ? item.certificateEndDate || '' : '');
    setCompFormError('');
    setCompFormOpen(true);
    getDriveStatus()
      .then(setDriveStatus)
      .catch(() => null);
  };

  const handleSaveCompetencyItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedStaffId || !canEdit) return;
    setCompFormError('');
    const selectedName = cCategoryName.trim();
    if (!selectedName) {
      const msg = 'Sila pilih kemahiran daripada senarai.';
      setCompFormError(msg);
      showToast('error', msg);
      return;
    }

    if (
      editingCompIndex === null &&
      competencyItems.some(
        (item) => getEffectiveSkillType(item) === compFormType && item.categoryName === selectedName
      )
    ) {
      const msg = `"${selectedName}" sudah direkodkan. Sila gunakan butang Edit pada baris berkenaan.`;
      setCompFormError(msg);
      showToast('error', msg);
      return;
    }

    let resolvedHasValidity = false;
    let resolvedStartDate = '';
    let resolvedEndDate = '';
    let resolvedValidityDuration = compFormType === 'aplikasi' ? 'TIDAK BERKENAAN' : '';

    if (compFormType === 'aplikasi' && cHasCert && cHasValidityPeriod) {
      const calc = computeValidityDuration(cCertStartDate, cCertEndDate);
      if (!calc.valid) {
        setCompFormError(calc.label);
        showToast('error', calc.label);
        return;
      }
      resolvedHasValidity = true;
      resolvedStartDate = cCertStartDate;
      resolvedEndDate = cCertEndDate;
      resolvedValidityDuration = calc.label;
    }

    setSavingComp(true);
    let uploadedDriveFileId = '';
    let createdCert: Certificate | null = null;
    try {
      let certId = '';
      let certTitle = '';
      let certDriveFileId = '';
      const centerId = activeProfile?.centerId || userAccount.centerId || '';
      const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';

      if (cHasCert) {
        if (cCertSource === 'upload' && cCertFile) {
          const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
          if (!allowed.includes(cCertFile.type)) {
            const msg = 'Format fail tidak disokong. Sila muat naik PDF, JPG atau PNG sahaja.';
            setCompFormError(msg);
            showToast('error', msg);
            setSavingComp(false);
            return;
          }
          if (cCertFile.size > 15 * 1024 * 1024) {
            const msg = 'Saiz fail melebihi had 15 MB.';
            setCompFormError(msg);
            showToast('error', msg);
            setSavingComp(false);
            return;
          }
          if (driveStatus && driveStatus.status !== 'connected') {
            const msg =
              'Storan Google Drive sistem belum disambungkan oleh Pentadbir. Sila buang fail yang dipilih (butang X) untuk menyimpan status "Ada, belum muat naik", atau hubungi Pentadbir untuk menyambungkan Google Drive.';
            setCompFormError(msg);
            showToast('error', msg);
            setSavingComp(false);
            return;
          }
          const resolvedStaffName = activeProfile?.fullName?.trim() || userAccount.displayName || '';
          const resolvedStaffEmail =
            activeProfile?.officialEmail?.trim() || userAccount.email || '';
          const filePrefix = buildSafeDriveFilePrefix(
            resolvedStaffName,
            resolvedStaffEmail,
            selectedStaffId
          );
          const uploadRes = await uploadFileToDriveApi({
            file: cCertFile,
            fileName: `${filePrefix}_${cCertFile.name}`,
            staffId: selectedStaffId,
            staffName: resolvedStaffName,
            staffEmail: resolvedStaffEmail,
            category: 'Sijil Kompetensi',
          });
          uploadedDriveFileId = uploadRes.fileId;
          const targetUid = activeProfile?.uid || (isOwnRecord ? userAccount.uid : '') || userAccount.uid;
          const newCertId = makeRecordId('CERT');
          const resolvedTitle = cCertTitle.trim() || `Sijil ${selectedName}`;
          const certRecord: Omit<Certificate, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> =
            {
              id: newCertId,
              staffId: selectedStaffId,
              uid: targetUid,
              centerId,
              departmentId,
              title: resolvedTitle,
              category: 'Sijil Kompetensi',
              certificateDate: resolvedStartDate || new Date().toISOString().slice(0, 10),
              driveFileId: uploadRes.fileId,
              driveFolderId: uploadRes.folderId,
              fileName: uploadRes.fileName,
              mimeType: uploadRes.mimeType,
              fileSize: uploadRes.size,
              uploadedBy: userAccount.uid,
              status: 'active',
            };
          await saveCertificateMetadata(certRecord, true);
          createdCert = certRecord as Certificate;
          certId = newCertId;
          certTitle = resolvedTitle;
          certDriveFileId = uploadRes.fileId;
        } else if (cCertSource === 'existing' && cExistingCertId) {
          const picked = certificates.find((c) => c.id === cExistingCertId);
          if (picked) {
            certId = picked.id;
            certTitle = picked.title;
            certDriveFileId = picked.driveFileId;
          }
        } else {
          const prevItem = editingCompIndex !== null ? competencyItems[editingCompIndex] : null;
          if (prevItem?.certificateDriveFileId) {
            certId = prevItem.certificateId || '';
            certTitle = cCertTitle.trim() || prevItem.certificateTitle || '';
            certDriveFileId = prevItem.certificateDriveFileId || '';
          } else {
            certTitle = cCertTitle.trim();
          }
        }
      }

      const existingItem = editingCompIndex !== null ? competencyItems[editingCompIndex] : null;
      const nextItem: CompetencyItem = {
        categoryId:
          existingItem?.categoryId ||
          `${compFormType}-${selectedName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`.slice(0, 80),
        categoryName: selectedName,
        skillType: compFormType,
        level: cLevel,
        years: Math.max(0, Math.min(60, Math.round(Number(cYears) || 0))),
        notes: cNotes.trim(),
        hasCertificate: cHasCert,
        certificateId: certId,
        certificateTitle: certTitle,
        certificateDriveFileId: certDriveFileId,
        hasValidityPeriod: resolvedHasValidity,
        certificateStartDate: resolvedStartDate,
        certificateEndDate: resolvedEndDate,
        certificateValidityDuration: resolvedValidityDuration,
      };

      const nextList =
        editingCompIndex !== null
          ? competencyItems.map((it, idx) => (idx === editingCompIndex ? nextItem : it))
          : [...competencyItems, nextItem];

      await persistCompetencyList(nextList, createdCert);
      showToast('success', 'Rekod kompetensi digital & AI berjaya disimpan ke pangkalan data.');
      setCompFormOpen(false);
      setEditingCompIndex(null);
      setCCertFile(null);
      setCompFormError('');
    } catch (err: any) {
      if (uploadedDriveFileId && !createdCert) {
        await deleteDriveFileApi(uploadedDriveFileId, true).catch(() => {});
      }
      const msg = err?.message || 'Gagal menyimpan rekod kompetensi.';
      setCompFormError(msg);
      showToast('error', msg);
    } finally {
      setSavingComp(false);
    }
  };

  const handlePreviewCompetencyCert = async (item: CompetencyItem) => {
    if (!item.certificateDriveFileId) return;
    setLoadingCertPreviewId(item.categoryId + item.categoryName);
    try {
      const res = await fetchDriveFileBlob(item.certificateDriveFileId, false);
      setCompCertPreview({
        title: item.certificateTitle || `Sijil ${item.categoryName}`,
        blobUrl: res.blobUrl,
        mimeType: res.mimeType,
      });
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal membuka fail sijil daripada Google Drive.');
    } finally {
      setLoadingCertPreviewId(null);
    }
  };

  const openAdminDroplistEditor = (type: CompetencySkillType) => {
    if (!userAccount.isAdmin) return;
    const baseList = type === 'aplikasi' ? applicationSkillOptions : knowledgeSkillOptions;
    setAdminEditListType(type);
    setAdminDraftList([...baseList]);
    setAdminNewSkillOption('');
    setAdminEditingIdx(null);
    setAdminEditingText('');
  };

  const handleSaveAdminDroplist = async () => {
    if (!userAccount.isAdmin || !adminEditListType) return;
    const cleaned = Array.from(new Set(adminDraftList.map((s) => s.trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      showToast('error', 'Senarai pilihan mesti mengandungi sekurang-kurangnya satu item.');
      return;
    }
    setSavingAdminList(true);
    try {
      const nextApp = adminEditListType === 'aplikasi' ? cleaned : applicationSkillOptions;
      const nextKnow = adminEditListType === 'pengetahuan' ? cleaned : knowledgeSkillOptions;
      await saveSystemSettings({
        systemName:
          sysSettings?.systemName || 'Sistem Pengurusan Modal Insan dan Kepakaran IAB',
        institutionName:
          sysSettings?.institutionName ||
          'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia',
        expertiseCategories: sysSettings?.expertiseCategories?.length
          ? sysSettings.expertiseCategories
          : DEFAULT_EXPERTISE_CATEGORIES,
        competencyCategories: Array.from(new Set([...nextApp, ...nextKnow])),
        applicationSkillCategories: nextApp,
        knowledgeSkillCategories: nextKnow,
        institutionCategories: sysSettings?.institutionCategories?.length
          ? sysSettings.institutionCategories
          : DEFAULT_INSTITUTION_CATEGORIES,
        publicationYears: sysSettings?.publicationYears?.length
          ? sysSettings.publicationYears
          : DEFAULT_PUBLICATION_YEARS,
        iabModules: sysSettings?.iabModules?.length
          ? sysSettings.iabModules
          : DEFAULT_IAB_MODULES,
      });
      const updatedSettings = await getSystemSettings().catch(() => null);
      if (updatedSettings) setSysSettings(updatedSettings);
      await onSystemSettingsUpdated?.();
      showToast(
        'success',
        `Senarai pilihan ${adminEditListType === 'aplikasi' ? 'Kemahiran Aplikasi' : 'Kemahiran Pengetahuan'} berjaya dikemas kini.`
      );
      setAdminEditListType(null);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan senarai pilihan.');
    } finally {
      setSavingAdminList(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <Cpu className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Kompetensi Digital dan AI</h1>
            <p className="text-xs text-slate-500 mt-1">
              Senarai kemahiran aplikasi dan kemahiran pengetahuan digital/AI yang dikuasai bersama tahap penguasaan, tahun pengalaman, tempoh sah laku dan status sijil kursus.
            </p>
          </div>
        </div>

        {canSwitchStaff && profiles.length > 0 && (
          <div className="flex items-center gap-2 min-w-[260px]">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              aria-label="Pilih Pegawai"
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-[#0B1F3B]"
            >
              {!profiles.some((p) => p.staffId === userAccount.staffId) && userAccount.staffId && (
                <option value={userAccount.staffId}>
                  {userAccount.displayName} (Rekod Saya)
                </option>
              )}
              {profiles.map((p) => (
                <option key={p.staffId} value={p.staffId}>
                  {p.fullName} ({p.staffId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-[#0B1F3B] animate-spin" />
          <p className="text-xs text-slate-500">Memuatkan rekod Kompetensi Digital dan AI...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* SECTION 1: KEMAHIRAN APLIKASI */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#0B1F3B] tracking-wide uppercase">
                  KEMAHIRAN APLIKASI
                </h2>
                <span className="text-xs font-mono-tabular text-slate-500">
                  ({indexedAppCompetencies.length})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {userAccount.isAdmin && canEdit && (
                  <button
                    type="button"
                    onClick={() => openAdminDroplistEditor('aplikasi')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
                  >
                    <Settings className="w-3 h-3" /> Edit Senarai Pilihan (Admin)
                  </button>
                )}
              </div>
            </div>

            {indexedAppCompetencies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white">
                Tiada kemahiran aplikasi direkodkan lagi.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4 w-12">Bil.</th>
                      <th className="py-2.5 px-4">Kemahiran Aplikasi</th>
                      <th className="py-2.5 px-4 w-28">Tahap</th>
                      <th className="py-2.5 px-4 w-40">Pengalaman</th>
                      <th className="py-2.5 px-4 w-36">Sijil Kursus</th>
                      <th className="py-2.5 px-4 w-52">Tempoh Sah Laku</th>
                      {canEdit && <th className="py-2.5 px-4 text-right w-40">Tindakan</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {indexedAppCompetencies.map(({ item, index }, rowNum) => {
                      const isUploaded = Boolean(item.certificateDriveFileId);
                      const hasValidity = Boolean(
                        item.hasCertificate &&
                          item.hasValidityPeriod &&
                          item.certificateStartDate &&
                          item.certificateEndDate
                      );
                      const validityLabel = hasValidity
                        ? item.certificateValidityDuration ||
                          computeValidityDuration(
                            item.certificateStartDate || '',
                            item.certificateEndDate || ''
                          ).label
                        : 'TIDAK BERKENAAN';
                      const todayIso = new Date().toISOString().slice(0, 10);
                      const isExpired = hasValidity && (item.certificateEndDate || '') < todayIso;

                      return (
                        <tr
                          key={`${item.categoryId}-${index}`}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                            {rowNum + 1}.
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="font-semibold text-[#0B1F3B]">{item.categoryName}</div>
                            {item.notes && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{item.notes}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap align-top">
                            {item.level}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap align-top">
                            {item.years} Tahun Pengalaman
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap align-top">
                            {isUploaded ? (
                              <button
                                type="button"
                                onClick={() => handlePreviewCompetencyCert(item)}
                                disabled={loadingCertPreviewId === item.categoryId + item.categoryName}
                                className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:text-emerald-900 text-left disabled:opacity-60"
                                title={item.certificateTitle || 'Lihat Sijil Kursus'}
                              >
                                <span>Ada</span>
                                <span className="underline text-[#0B1F3B] font-semibold">[preview]</span>
                              </button>
                            ) : item.hasCertificate ? (
                              <span className="text-amber-700 font-medium">Ada (belum muat naik)</span>
                            ) : (
                              <span className="text-slate-500">Tiada</span>
                            )}
                          </td>
                          <td className="py-3 px-4 align-top">
                            {hasValidity ? (
                              <div className="space-y-0.5">
                                <div className="font-semibold text-[#0B1F3B] text-xs sm:text-sm">
                                  {validityLabel}
                                </div>
                                <div className="text-[11px] font-mono-tabular text-slate-500">
                                  {formatDisplayDate(item.certificateStartDate || '')} –{' '}
                                  {formatDisplayDate(item.certificateEndDate || '')}
                                </div>
                                {isExpired && (
                                  <div className="text-[11px] font-semibold text-red-600">
                                    Tamat tempoh
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs font-medium text-slate-500 uppercase tracking-wide">
                                TIDAK BERKENAAN
                              </span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => openEditCompetencyForm(item, index)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingCompIndex(index)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && (
              <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openAddCompetencyForm('aplikasi')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Kemahiran Aplikasi
                </button>
              </div>
            )}
          </div>

          {/* SECTION 2: KEMAHIRAN PENGETAHUAN */}
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-bold text-[#0B1F3B] tracking-wide uppercase">
                  KEMAHIRAN PENGETAHUAN
                </h2>
                <span className="text-xs font-mono-tabular text-slate-500">
                  ({indexedKnowCompetencies.length})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {userAccount.isAdmin && canEdit && (
                  <button
                    type="button"
                    onClick={() => openAdminDroplistEditor('pengetahuan')}
                    className="inline-flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-md"
                  >
                    <Settings className="w-3 h-3" /> Edit Senarai Pilihan (Admin)
                  </button>
                )}
              </div>
            </div>

            {indexedKnowCompetencies.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500 bg-white">
                Tiada kemahiran pengetahuan direkodkan lagi.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="py-2.5 px-4 w-12">Bil.</th>
                      <th className="py-2.5 px-4">Kemahiran Pengetahuan</th>
                      <th className="py-2.5 px-4 w-32">Tahap</th>
                      <th className="py-2.5 px-4 w-44">Pengalaman</th>
                      <th className="py-2.5 px-4 w-36">Sijil Kursus</th>
                      {canEdit && <th className="py-2.5 px-4 text-right w-40">Tindakan</th>}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                    {indexedKnowCompetencies.map(({ item, index }, rowNum) => {
                      const isUploaded = Boolean(item.certificateDriveFileId);
                      return (
                        <tr
                          key={`${item.categoryId}-${index}`}
                          className="hover:bg-slate-50/70 transition-colors"
                        >
                          <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                            {rowNum + 1}.
                          </td>
                          <td className="py-3 px-4 align-top">
                            <div className="font-semibold text-[#0B1F3B]">{item.categoryName}</div>
                            {item.notes && (
                              <p className="text-[11px] text-slate-500 mt-0.5">{item.notes}</p>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-700 whitespace-nowrap align-top">
                            {item.level}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-600 whitespace-nowrap align-top">
                            {item.years} Tahun Pengalaman
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap align-top">
                            {isUploaded ? (
                              <button
                                type="button"
                                onClick={() => handlePreviewCompetencyCert(item)}
                                disabled={loadingCertPreviewId === item.categoryId + item.categoryName}
                                className="inline-flex items-center gap-1.5 text-emerald-700 font-semibold hover:text-emerald-900 text-left disabled:opacity-60"
                                title={item.certificateTitle || 'Lihat Sijil Kursus'}
                              >
                                <span>Ada</span>
                                <span className="underline text-[#0B1F3B] font-semibold">[preview]</span>
                              </button>
                            ) : item.hasCertificate ? (
                              <span className="text-amber-700 font-medium">Ada (belum muat naik)</span>
                            ) : (
                              <span className="text-slate-500">Tiada</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-2 text-xs">
                                <button
                                  type="button"
                                  onClick={() => openEditCompetencyForm(item, index)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeletingCompIndex(index)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-3 h-3" /> Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {canEdit && (
              <div className="px-4 py-3 bg-slate-50/70 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => openAddCompetencyForm('pengetahuan')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Tambah Kemahiran Pengetahuan
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={deletingCompIndex !== null}
        title="Padam Rekod Kompetensi"
        description={`Sahkan pemadaman rekod "${
          deletingCompIndex !== null ? competencyItems[deletingCompIndex]?.categoryName || '' : ''
        }" daripada senarai kompetensi digital & AI?`}
        confirmLabel="Padam"
        onConfirm={async () => {
          if (deletingCompIndex === null) return;
          const nextList = competencyItems.filter((_, idx) => idx !== deletingCompIndex);
          await persistCompetencyList(nextList);
          showToast('success', 'Rekod kompetensi dipadam daripada pangkalan data.');
          setDeletingCompIndex(null);
        }}
        onCancel={() => setDeletingCompIndex(null)}
      />

      {/* Popup Modal: Add / Edit Competency */}
      {compFormOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingComp) {
              setCompFormOpen(false);
              setEditingCompIndex(null);
            }
          }}
        >
          <form
            onSubmit={handleSaveCompetencyItem}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3B]">
                  {editingCompIndex !== null ? 'Kemas Kini' : 'Tambah'}{' '}
                  {compFormType === 'aplikasi' ? 'KEMAHIRAN APLIKASI' : 'KEMAHIRAN PENGETAHUAN'}
                </h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Lengkapkan maklumat tahap penguasaan, pengalaman dan status sijil kursus.
                </p>
              </div>
              <button
                type="button"
                disabled={savingComp}
                onClick={() => {
                  setCompFormOpen(false);
                  setEditingCompIndex(null);
                }}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg disabled:opacity-50"
                aria-label="Tutup borang kompetensi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-4">
              {compFormError && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2.5 text-xs text-red-800">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-600 mt-0.5" />
                  <p className="leading-relaxed">{compFormError}</p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-3">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {compFormType === 'aplikasi'
                      ? 'Pilihan Kemahiran Aplikasi *'
                      : 'Pilihan Kemahiran Pengetahuan *'}
                  </label>
                  <select
                    required
                    value={cCategoryName}
                    onChange={(e) => setCCategoryName(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                  >
                    <option value="">-- Pilih Kemahiran --</option>
                    {Array.from(
                      new Set([
                        ...(compFormType === 'aplikasi'
                          ? applicationSkillOptions
                          : knowledgeSkillOptions),
                        ...(cCategoryName ? [cCategoryName] : []),
                      ])
                    ).map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tahap Penguasaan *
                  </label>
                  <select
                    value={cLevel}
                    onChange={(e) => setCLevel(e.target.value as CompetencyItem['level'])}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                  >
                    {COMPETENCY_LEVELS.map((lvl) => (
                      <option key={lvl} value={lvl}>
                        {lvl}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tahun Pengalaman *
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={60}
                    required
                    value={cYears}
                    onChange={(e) => setCYears(Number(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular focus:outline-none focus:border-[#0B1F3B]"
                  />
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="flex flex-wrap items-center gap-4">
                  <span className="text-xs font-semibold text-slate-700">Sijil Kursus:</span>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="cHasCert"
                      checked={!cHasCert}
                      onChange={() => {
                        setCHasCert(false);
                        setCompFormError('');
                      }}
                      className="accent-[#0B1F3B]"
                    />
                    Tiada
                  </label>
                  <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="cHasCert"
                      checked={cHasCert}
                      onChange={() => setCHasCert(true)}
                      className="accent-[#0B1F3B]"
                    />
                    Ada (Muat Naik / Pautkan Sijil)
                  </label>
                </div>

                {cHasCert && (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                    {driveStatus && driveStatus.status !== 'connected' && cCertSource === 'upload' && (
                      <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 leading-relaxed">
                        <strong>Nota Storan Google Drive:</strong> Sambungan Google Drive sistem belum diaktifkan oleh Pentadbir. Anda masih boleh memilih <strong>Ada</strong> dan klik <strong>Simpan Kompetensi</strong> tanpa melampirkan fail sekarang.
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <button
                        type="button"
                        onClick={() => setCCertSource('upload')}
                        className={`px-3 py-1.5 rounded-md font-semibold border ${
                          cCertSource === 'upload'
                            ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        Muat Naik Sijil Baharu
                      </button>
                      {certificates.length > 0 && (
                        <button
                          type="button"
                          onClick={() => setCCertSource('existing')}
                          className={`px-3 py-1.5 rounded-md font-semibold border ${
                            cCertSource === 'existing'
                              ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          Pilih Sijil Sedia Ada ({certificates.length})
                        </button>
                      )}
                    </div>

                    {cCertSource === 'upload' ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Tajuk Sijil Kursus
                          </label>
                          <input
                            type="text"
                            value={cCertTitle}
                            onChange={(e) => setCCertTitle(e.target.value)}
                            placeholder={`Sijil ${cCategoryName || 'Kompetensi'}`}
                            className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Fail Sijil (PDF/JPG/PNG, Maks 15 MB)
                          </label>
                          <div className="flex items-center gap-1.5">
                            <label className="flex-1 min-w-0 flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-[#0B1F3B] bg-white border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                              <Upload className="w-3.5 h-3.5 shrink-0" />
                              <span className="truncate">
                                {cCertFile
                                  ? cCertFile.name
                                  : editingCompIndex !== null &&
                                    competencyItems[editingCompIndex]?.certificateDriveFileId
                                  ? 'Ganti fail sijil sedia ada (uploaded)'
                                  : 'Pilih fail sijil...'}
                              </span>
                              <input
                                type="file"
                                accept=".pdf,image/jpeg,image/jpg,image/png"
                                onChange={(e) => {
                                  setCCertFile(e.target.files?.[0] || null);
                                  setCompFormError('');
                                }}
                                className="hidden"
                              />
                            </label>
                            {cCertFile && (
                              <button
                                type="button"
                                onClick={() => {
                                  setCCertFile(null);
                                  setCompFormError('');
                                }}
                                className="p-1.5 text-slate-500 hover:text-red-700 bg-white border border-slate-300 rounded-lg"
                                title="Buang fail dipilih"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Pilih Daripada Senarai Sijil Pegawai
                        </label>
                        <select
                          value={cExistingCertId}
                          onChange={(e) => setCExistingCertId(e.target.value)}
                          className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        >
                          <option value="">-- Pilih Sijil --</option>
                          {certificates.map((cert) => (
                            <option key={cert.id} value={cert.id}>
                              {cert.title} ({cert.category})
                            </option>
                          ))}
                        </select>
                      </div>
                    )}

                    {compFormType === 'aplikasi' && (
                      <div className="pt-2.5 border-t border-slate-200 space-y-2.5">
                        <div className="flex flex-wrap items-center gap-4">
                          <span className="text-[11px] font-semibold text-slate-700">
                            Tempoh Sah Laku Sijil:
                          </span>
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="cHasValidityPeriod"
                              checked={!cHasValidityPeriod}
                              onChange={() => {
                                setCHasValidityPeriod(false);
                                setCompFormError('');
                              }}
                              className="accent-[#0B1F3B]"
                            />
                            Tiada (TIDAK BERKENAAN)
                          </label>
                          <label className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-700 cursor-pointer">
                            <input
                              type="radio"
                              name="cHasValidityPeriod"
                              checked={cHasValidityPeriod}
                              onChange={() => {
                                setCHasValidityPeriod(true);
                                setCompFormError('');
                              }}
                              className="accent-[#0B1F3B]"
                            />
                            Ada Tempoh Sah Laku
                          </label>
                        </div>

                        {cHasValidityPeriod ? (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Tarikh Mula *
                              </label>
                              <input
                                type="date"
                                required={cHasValidityPeriod}
                                value={cCertStartDate}
                                onChange={(e) => {
                                  setCCertStartDate(e.target.value);
                                  setCompFormError('');
                                }}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-tabular"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Tarikh Tamat *
                              </label>
                              <input
                                type="date"
                                required={cHasValidityPeriod}
                                min={cCertStartDate || undefined}
                                value={cCertEndDate}
                                onChange={(e) => {
                                  setCCertEndDate(e.target.value);
                                  setCompFormError('');
                                }}
                                className="w-full px-3 py-1.5 text-xs bg-white border border-slate-300 rounded-lg font-mono-tabular"
                              />
                            </div>
                            <div>
                              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                                Tempoh Sah Laku (Auto Kira)
                              </label>
                              {(() => {
                                const calc = computeValidityDuration(cCertStartDate, cCertEndDate);
                                return (
                                  <div
                                    className={`px-3 py-1.5 text-xs rounded-lg border font-medium ${
                                      !cCertStartDate || !cCertEndDate
                                        ? 'bg-slate-100 border-slate-200 text-slate-500'
                                        : calc.valid
                                        ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                                        : 'bg-red-50 border-red-200 text-red-700'
                                    }`}
                                  >
                                    {calc.label}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        ) : (
                          <div className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-600">
                            Tempoh Sah Laku: <strong className="text-slate-700">TIDAK BERKENAAN</strong>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Catatan Tambahan (Pilihan)
                </label>
                <input
                  type="text"
                  value={cNotes}
                  onChange={(e) => setCNotes(e.target.value)}
                  placeholder="Contoh: Digunakan dalam pembangunan bahan latihan IAB"
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingComp}
                onClick={() => {
                  setCompFormOpen(false);
                  setEditingCompIndex(null);
                }}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900 disabled:opacity-50"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingComp}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingComp ? 'Menyimpan...' : 'Simpan Kompetensi'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Admin Droplist Editor */}
      {userAccount.isAdmin && adminEditListType && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingAdminList) setAdminEditListType(null);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3B]">
                  Urus Senarai Pilihan (Admin Sahaja) —{' '}
                  {adminEditListType === 'aplikasi'
                    ? 'KEMAHIRAN APLIKASI'
                    : 'KEMAHIRAN PENGETAHUAN'}
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Hanya pentadbir sistem dibenarkan menambah, mengubah atau memadam pilihan dalam droplist ini.
                </p>
              </div>
              <button
                type="button"
                disabled={savingAdminList}
                onClick={() => setAdminEditListType(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup editor senarai pilihan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adminNewSkillOption}
                  onChange={(e) => setAdminNewSkillOption(e.target.value)}
                  placeholder={
                    adminEditListType === 'aplikasi'
                      ? 'Tambah aplikasi AI baharu (cth: Perplexity AI)...'
                      : 'Tambah kemahiran pengetahuan baharu...'
                  }
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = adminNewSkillOption.trim();
                    if (!v || adminDraftList.includes(v)) return;
                    setAdminDraftList([...adminDraftList, v]);
                    setAdminNewSkillOption('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  Tambah Pilihan
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {adminDraftList.map((opt, i) => (
                  <div
                    key={`${opt}-${i}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {adminEditingIdx === i ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={adminEditingText}
                          onChange={(e) => setAdminEditingText(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = adminEditingText.trim();
                            if (!v) return;
                            setAdminDraftList(adminDraftList.map((x, idx) => (idx === i ? v : x)));
                            setAdminEditingIdx(null);
                          }}
                          className="p-1 text-emerald-700 hover:text-emerald-900"
                          title="Simpan"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800">{opt}</span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setAdminEditingIdx(i);
                          setAdminEditingText(opt);
                        }}
                        className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminDraftList(adminDraftList.filter((_, idx) => idx !== i))}
                        className="p-1 text-red-600 hover:text-red-800"
                        title="Padam"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingAdminList}
                onClick={() => setAdminEditListType(null)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={savingAdminList}
                onClick={handleSaveAdminDroplist}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingAdminList ? 'Menyimpan...' : 'Simpan Senarai Pilihan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Certificate preview modal */}
      {compCertPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B] truncate">{compCertPreview.title}</h3>
              <button
                type="button"
                onClick={() => {
                  if (compCertPreview.blobUrl) URL.revokeObjectURL(compCertPreview.blobUrl);
                  setCompCertPreview(null);
                }}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup paparan sijil"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-auto">
              {compCertPreview.mimeType.includes('pdf') ? (
                <iframe
                  src={compCertPreview.blobUrl}
                  title={compCertPreview.title}
                  className="w-full h-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={compCertPreview.blobUrl}
                  alt={compCertPreview.title}
                  className="max-w-full max-h-full object-contain rounded-lg shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
