import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  BookOpenCheck,
  Edit3,
  ExternalLink,
  Eye,
  FileText,
  Lightbulb,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  ACHIEVEMENT_INDEXING_OPTIONS,
  ACHIEVEMENT_RESEARCH_ROLES,
  ACHIEVEMENT_RESEARCH_TYPES,
  APC_AWARD_PRESETS,
  INNOVATION_LEVELS,
  INNOVATION_ROLES,
  INNOVATION_TYPES,
  OTHER_ACHIEVEMENT_LEVELS,
  OTHER_ACHIEVEMENT_ROLES,
  OTHER_ACHIEVEMENT_TYPES,
  buildSafeDriveFilePrefix,
} from '../lib/constants';
import {
  deleteDriveFileApi,
  fetchDriveFileBlob,
  getDriveStatus,
  uploadFileToDriveApi,
  type DriveStatusResponse,
} from '../services/apiClient';
import {
  getStaffAchievements,
  makeRecordId,
  saveCertificateMetadata,
  saveStaffAchievements,
} from '../services/firestoreService';
import type {
  AchievementResearchRecord,
  ApcAwardRecord,
  Certificate,
  InnovationRecord,
  OtherAchievementRecord,
  StaffAchievementsRecord,
  StaffProfile,
  UserAccount,
} from '../types/iab';

interface PencapaianPageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
}

const YEAR_OPTIONS = Array.from({ length: 41 }, (_, i) => String(2030 - i));
const ALLOWED_MIME_TYPES = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];

function formatSafeExternalUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

export const PencapaianPage: React.FC<PencapaianPageProps> = ({
  userAccount,
  profiles,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [record, setRecord] = useState<StaffAchievementsRecord | null>(null);
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);

  // Preview Modal
  const [previewModal, setPreviewModal] = useState<{
    title: string;
    blobUrl: string;
    mimeType: string;
  } | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  // Confirm delete dialog
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  // BAHAGIAN A: APC Modal state
  const [apcModalOpen, setApcModalOpen] = useState(false);
  const [editingApcId, setEditingApcId] = useState<string | null>(null);
  const [apcPreset, setApcPreset] = useState<string>(APC_AWARD_PRESETS[0]);
  const [apcCustomName, setApcCustomName] = useState('');
  const [apcYear, setApcYear] = useState('2025');
  const [apcExistingDriveId, setApcExistingDriveId] = useState('');
  const [apcExistingCertId, setApcExistingCertId] = useState('');
  const [apcExistingFileName, setApcExistingFileName] = useState('');
  const [apcFile, setApcFile] = useState<File | null>(null);
  const [apcFormError, setApcFormError] = useState('');

  // BAHAGIAN B: Inovasi Modal state
  const [invModalOpen, setInvModalOpen] = useState(false);
  const [editingInvId, setEditingInvId] = useState<string | null>(null);
  const [invName, setInvName] = useState('');
  const [invType, setInvType] = useState<string>(INNOVATION_TYPES[0]);
  const [invRole, setInvRole] = useState<string>(INNOVATION_ROLES[0]);
  const [invLevel, setInvLevel] = useState<string>(INNOVATION_LEVELS[0]);
  const [invRecognition, setInvRecognition] = useState('');
  const [invYear, setInvYear] = useState(String(new Date().getFullYear()));
  const [invUrl, setInvUrl] = useState('');
  const [invExistingDriveId, setInvExistingDriveId] = useState('');
  const [invExistingFileName, setInvExistingFileName] = useState('');
  const [invFile, setInvFile] = useState<File | null>(null);
  const [invFormError, setInvFormError] = useState('');

  // BAHAGIAN C: Penerbitan & Penyelidikan Modal state
  const [resModalOpen, setResModalOpen] = useState(false);
  const [editingResId, setEditingResId] = useState<string | null>(null);
  const [resOutputType, setResOutputType] = useState<string>(ACHIEVEMENT_RESEARCH_TYPES[0]);
  const [resTitle, setResTitle] = useState('');
  const [resRole, setResRole] = useState<string>(ACHIEVEMENT_RESEARCH_ROLES[0]);
  const [resPublisher, setResPublisher] = useState('');
  const [resIdentifier, setResIdentifier] = useState('');
  const [resYear, setResYear] = useState(String(new Date().getFullYear()));
  const [resIndexing, setResIndexing] = useState<string>(ACHIEVEMENT_INDEXING_OPTIONS[4]);
  const [resField, setResField] = useState('');
  const [resUrl, setResUrl] = useState('');
  const [resExistingDriveId, setResExistingDriveId] = useState('');
  const [resExistingFileName, setResExistingFileName] = useState('');
  const [resFile, setResFile] = useState<File | null>(null);
  const [resFormError, setResFormError] = useState('');

  // BAHAGIAN D: Lain-lain Pencapaian Modal state
  const [otherModalOpen, setOtherModalOpen] = useState(false);
  const [editingOtherId, setEditingOtherId] = useState<string | null>(null);
  const [othTitle, setOthTitle] = useState('');
  const [othType, setOthType] = useState<string>(OTHER_ACHIEVEMENT_TYPES[0]);
  const [othDesc, setOthDesc] = useState('');
  const [othRole, setOthRole] = useState<string>(OTHER_ACHIEVEMENT_ROLES[0]);
  const [othOrg, setOthOrg] = useState('');
  const [othLevel, setOthLevel] = useState<string>(OTHER_ACHIEVEMENT_LEVELS[0]);
  const [othDateOrYear, setOthDateOrYear] = useState(String(new Date().getFullYear()));
  const [othImpact, setOthImpact] = useState('');
  const [othUrl, setOthUrl] = useState('');
  const [othNotes, setOthNotes] = useState('');
  const [othExistingDriveId, setOthExistingDriveId] = useState('');
  const [othExistingFileName, setOthExistingFileName] = useState('');
  const [othFile, setOthFile] = useState<File | null>(null);
  const [othFormError, setOthFormError] = useState('');

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile = useMemo(
    () => profiles.find((p) => p.staffId === selectedStaffId) || null,
    [profiles, selectedStaffId]
  );
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const loadData = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const [ach, drv] = await Promise.all([
        getStaffAchievements(staffIdToLoad),
        getDriveStatus().catch(() => null),
      ]);
      setRecord(ach);
      if (drv) setDriveStatus(drv);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Gagal memuatkan rekod pencapaian pegawai.';
      showToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadData(selectedStaffId);
    }
  }, [selectedStaffId]);

  const apcList = record?.apcAwards || [];
  const innovationList = record?.innovations || [];
  const researchList = record?.researchOutputs || [];
  const otherList = record?.otherAchievements || [];

  const persistAchievements = async (next: {
    apcAwards: ApcAwardRecord[];
    innovations: InnovationRecord[];
    researchOutputs: AchievementResearchRecord[];
    otherAchievements: OtherAchievementRecord[];
  }) => {
    const targetUid = isOwnRecord ? userAccount.uid : activeProfile?.uid || '';
    const centerId = activeProfile?.centerId || userAccount.centerId || '';
    const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';
    const saved = await saveStaffAchievements({
      staffId: selectedStaffId,
      uid: targetUid,
      centerId,
      departmentId,
      ...next,
    });
    setRecord(saved);
  };

  const uploadEvidenceToDrive = async (
    file: File,
    category: Certificate['category']
  ): Promise<{ fileId: string; folderId: string; fileName: string; mimeType: string; size: number }> => {
    if (!ALLOWED_MIME_TYPES.includes(file.type)) {
      throw new Error('Format fail tidak disokong. Sila muat naik PDF, JPG atau PNG sahaja.');
    }
    if (file.size > 15 * 1024 * 1024) {
      throw new Error('Saiz fail melebihi had maksimum 15 MB.');
    }
    const latestDrive = driveStatus || (await getDriveStatus().catch(() => null));
    if (latestDrive) setDriveStatus(latestDrive);
    if (latestDrive && latestDrive.status !== 'connected') {
      throw new Error(
        'Storan Google Drive sistem belum disambungkan oleh Pentadbir. Sila hubungi Pentadbir untuk menyambungkan Google Drive sebelum memuat naik fail.'
      );
    }

    const resolvedStaffName = activeProfile?.fullName?.trim() || userAccount.displayName || '';
    const resolvedStaffEmail = activeProfile?.officialEmail?.trim() || userAccount.email || '';
    const prefix = buildSafeDriveFilePrefix(
      resolvedStaffName,
      resolvedStaffEmail,
      selectedStaffId
    );
    return uploadFileToDriveApi({
      file,
      fileName: `${prefix}_${file.name}`,
      staffId: selectedStaffId,
      staffName: resolvedStaffName,
      staffEmail: resolvedStaffEmail,
      category,
    });
  };

  const handleOpenPreview = async (driveFileId: string, title: string) => {
    if (!driveFileId) return;
    setLoadingPreviewId(driveFileId);
    try {
      const { blobUrl, mimeType } = await fetchDriveFileBlob(driveFileId);
      setPreviewModal({ title, blobUrl, mimeType });
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Gagal membuka paparan fail daripada Google Drive.';
      showToast('error', message);
    } finally {
      setLoadingPreviewId(null);
    }
  };

  // =========================================================
  // BAHAGIAN A: APC HANDLERS
  // =========================================================
  const openAddApc = () => {
    setEditingApcId(null);
    setApcPreset(APC_AWARD_PRESETS[0]);
    setApcCustomName('');
    setApcYear(String(new Date().getFullYear()));
    setApcExistingDriveId('');
    setApcExistingCertId('');
    setApcExistingFileName('');
    setApcFile(null);
    setApcFormError('');
    setApcModalOpen(true);
  };

  const openEditApc = (item: ApcAwardRecord) => {
    setEditingApcId(item.id);
    if ((APC_AWARD_PRESETS as readonly string[]).includes(item.awardName)) {
      setApcPreset(item.awardName);
      setApcCustomName('');
    } else {
      setApcPreset('Lain-lain');
      setApcCustomName(item.awardName);
    }
    setApcYear(item.year || String(new Date().getFullYear()));
    setApcExistingDriveId(item.certificateDriveFileId || '');
    setApcExistingCertId(item.certificateId || '');
    setApcExistingFileName(item.fileName || '');
    setApcFile(null);
    setApcFormError('');
    setApcModalOpen(true);
  };

  const handleSaveApc = async (e: React.FormEvent) => {
    e.preventDefault();
    const resolvedAwardName =
      apcPreset === 'Lain-lain' ? apcCustomName.trim() : apcPreset.trim();
    if (!resolvedAwardName) {
      setApcFormError('Sila nyatakan nama anugerah APC.');
      return;
    }
    if (!apcYear.trim()) {
      setApcFormError('Sila pilih tahun penerimaan APC.');
      return;
    }
    if (!apcFile && !apcExistingDriveId) {
      setApcFormError('Sila muat naik salinan Sijil APC (PDF, JPG atau PNG).');
      return;
    }

    setSaving(true);
    setApcFormError('');
    let uploadedDriveId = '';
    try {
      let certId = apcExistingCertId;
      let certDriveId = apcExistingDriveId;
      let fileName = apcExistingFileName;
      const certTitle = `${resolvedAwardName} (${apcYear.trim()})`;

      if (apcFile) {
        const up = await uploadEvidenceToDrive(apcFile, 'Sijil Pengiktirafan');
        uploadedDriveId = up.fileId;
        certDriveId = up.fileId;
        fileName = up.fileName;

        const targetUid =
          activeProfile?.uid || (isOwnRecord ? userAccount.uid : '') || userAccount.uid;
        const centerId = activeProfile?.centerId || userAccount.centerId || '';
        const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';
        certId = makeRecordId('CERT');
        await saveCertificateMetadata(
          {
            id: certId,
            staffId: selectedStaffId,
            uid: targetUid,
            centerId,
            departmentId,
            title: certTitle,
            category: 'Sijil Pengiktirafan',
            certificateDate: `${apcYear.trim()}-01-01`,
            driveFileId: up.fileId,
            driveFolderId: up.folderId,
            fileName: up.fileName,
            mimeType: up.mimeType,
            fileSize: up.size,
            uploadedBy: userAccount.uid,
            status: 'active',
          },
          true
        );
      }

      const nextEntry: ApcAwardRecord = {
        id: editingApcId || makeRecordId('APC'),
        awardName: resolvedAwardName,
        year: apcYear.trim(),
        certificateId: certId,
        certificateTitle: certTitle,
        certificateDriveFileId: certDriveId,
        fileName,
      };

      const nextList = editingApcId
        ? apcList.map((item) => (item.id === editingApcId ? nextEntry : item))
        : [...apcList, nextEntry];

      await persistAchievements({
        apcAwards: nextList,
        innovations: innovationList,
        researchOutputs: researchList,
        otherAchievements: otherList,
      });

      setApcModalOpen(false);
      showToast('success', 'Rekod Anugerah Perkhidmatan Cemerlang (APC) berjaya disimpan.');
    } catch (err: unknown) {
      if (uploadedDriveId) {
        await deleteDriveFileApi(uploadedDriveId).catch(() => {});
      }
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod APC.';
      setApcFormError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // BAHAGIAN B: INOVASI HANDLERS
  // =========================================================
  const openAddInnovation = () => {
    setEditingInvId(null);
    setInvName('');
    setInvType(INNOVATION_TYPES[0]);
    setInvRole(INNOVATION_ROLES[0]);
    setInvLevel(INNOVATION_LEVELS[0]);
    setInvRecognition('');
    setInvYear(String(new Date().getFullYear()));
    setInvUrl('');
    setInvExistingDriveId('');
    setInvExistingFileName('');
    setInvFile(null);
    setInvFormError('');
    setInvModalOpen(true);
  };

  const openEditInnovation = (item: InnovationRecord) => {
    setEditingInvId(item.id);
    setInvName(item.projectName);
    setInvType(item.innovationType || INNOVATION_TYPES[0]);
    setInvRole(item.role || INNOVATION_ROLES[0]);
    setInvLevel(item.level || INNOVATION_LEVELS[0]);
    setInvRecognition(item.recognition || '');
    setInvYear(item.year || String(new Date().getFullYear()));
    setInvUrl(item.evidenceUrl || '');
    setInvExistingDriveId(item.evidenceDriveFileId || '');
    setInvExistingFileName(item.evidenceFileName || '');
    setInvFile(null);
    setInvFormError('');
    setInvModalOpen(true);
  };

  const handleSaveInnovation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invName.trim()) {
      setInvFormError('Sila masukkan nama inovasi atau projek.');
      return;
    }

    setSaving(true);
    setInvFormError('');
    let uploadedDriveId = '';
    try {
      let driveId = invExistingDriveId;
      let fileName = invExistingFileName;
      if (invFile) {
        const up = await uploadEvidenceToDrive(invFile, 'Sijil Pengiktirafan');
        uploadedDriveId = up.fileId;
        driveId = up.fileId;
        fileName = up.fileName;
      }

      const nextEntry: InnovationRecord = {
        id: editingInvId || makeRecordId('INV'),
        projectName: invName.trim(),
        innovationType: invType,
        role: invRole,
        level: invLevel,
        recognition: invRecognition.trim(),
        year: invYear.trim(),
        evidenceUrl: invUrl.trim(),
        evidenceDriveFileId: driveId,
        evidenceFileName: fileName,
      };

      const nextList = editingInvId
        ? innovationList.map((item) => (item.id === editingInvId ? nextEntry : item))
        : [...innovationList, nextEntry];

      await persistAchievements({
        apcAwards: apcList,
        innovations: nextList,
        researchOutputs: researchList,
        otherAchievements: otherList,
      });

      setInvModalOpen(false);
      showToast('success', 'Rekod inovasi, kreativiti & penambahbaikan berjaya disimpan.');
    } catch (err: unknown) {
      if (uploadedDriveId) {
        await deleteDriveFileApi(uploadedDriveId).catch(() => {});
      }
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod inovasi.';
      setInvFormError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // BAHAGIAN C: PENERBITAN & PENYELIDIKAN HANDLERS
  // =========================================================
  const openAddResearch = () => {
    setEditingResId(null);
    setResOutputType(ACHIEVEMENT_RESEARCH_TYPES[0]);
    setResTitle('');
    setResRole(ACHIEVEMENT_RESEARCH_ROLES[0]);
    setResPublisher('');
    setResIdentifier('');
    setResYear(String(new Date().getFullYear()));
    setResIndexing(ACHIEVEMENT_INDEXING_OPTIONS[4]);
    setResField('');
    setResUrl('');
    setResExistingDriveId('');
    setResExistingFileName('');
    setResFile(null);
    setResFormError('');
    setResModalOpen(true);
  };

  const openEditResearch = (item: AchievementResearchRecord) => {
    setEditingResId(item.id);
    setResOutputType(item.outputType || ACHIEVEMENT_RESEARCH_TYPES[0]);
    setResTitle(item.title);
    setResRole(item.role || ACHIEVEMENT_RESEARCH_ROLES[0]);
    setResPublisher(item.publisherOrJournal || '');
    setResIdentifier(item.identifier || '');
    setResYear(item.year || String(new Date().getFullYear()));
    setResIndexing(item.indexing || ACHIEVEMENT_INDEXING_OPTIONS[4]);
    setResField(item.field || '');
    setResUrl(item.url || '');
    setResExistingDriveId(item.evidenceDriveFileId || '');
    setResExistingFileName(item.evidenceFileName || '');
    setResFile(null);
    setResFormError('');
    setResModalOpen(true);
  };

  const handleSaveResearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resTitle.trim()) {
      setResFormError('Sila masukkan tajuk penuh penerbitan atau kajian.');
      return;
    }

    setSaving(true);
    setResFormError('');
    let uploadedDriveId = '';
    try {
      let driveId = resExistingDriveId;
      let fileName = resExistingFileName;
      if (resFile) {
        const up = await uploadEvidenceToDrive(resFile, 'Dokumen Lain');
        uploadedDriveId = up.fileId;
        driveId = up.fileId;
        fileName = up.fileName;
      }

      const nextEntry: AchievementResearchRecord = {
        id: editingResId || makeRecordId('ACHR'),
        outputType: resOutputType,
        title: resTitle.trim(),
        role: resRole,
        publisherOrJournal: resPublisher.trim(),
        identifier: resIdentifier.trim(),
        year: resYear.trim(),
        indexing: resIndexing,
        field: resField.trim(),
        url: resUrl.trim(),
        evidenceDriveFileId: driveId,
        evidenceFileName: fileName,
      };

      const nextList = editingResId
        ? researchList.map((item) => (item.id === editingResId ? nextEntry : item))
        : [...researchList, nextEntry];

      await persistAchievements({
        apcAwards: apcList,
        innovations: innovationList,
        researchOutputs: nextList,
        otherAchievements: otherList,
      });

      setResModalOpen(false);
      showToast('success', 'Rekod penerbitan & penyelidikan berjaya disimpan.');
    } catch (err: unknown) {
      if (uploadedDriveId) {
        await deleteDriveFileApi(uploadedDriveId).catch(() => {});
      }
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod penerbitan.';
      setResFormError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // BAHAGIAN D: LAIN-LAIN PENCAPAIAN HANDLERS
  // =========================================================
  const openAddOther = () => {
    setEditingOtherId(null);
    setOthTitle('');
    setOthType(OTHER_ACHIEVEMENT_TYPES[0]);
    setOthDesc('');
    setOthRole(OTHER_ACHIEVEMENT_ROLES[0]);
    setOthOrg('');
    setOthLevel(OTHER_ACHIEVEMENT_LEVELS[0]);
    setOthDateOrYear(String(new Date().getFullYear()));
    setOthImpact('');
    setOthUrl('');
    setOthNotes('');
    setOthExistingDriveId('');
    setOthExistingFileName('');
    setOthFile(null);
    setOthFormError('');
    setOtherModalOpen(true);
  };

  const openEditOther = (item: OtherAchievementRecord) => {
    setEditingOtherId(item.id);
    setOthTitle(item.title);
    setOthType(item.achievementType || OTHER_ACHIEVEMENT_TYPES[0]);
    setOthDesc(item.description || '');
    setOthRole(item.role || OTHER_ACHIEVEMENT_ROLES[0]);
    setOthOrg(item.organization || '');
    setOthLevel(item.level || OTHER_ACHIEVEMENT_LEVELS[0]);
    setOthDateOrYear(item.dateOrYear || '');
    setOthImpact(item.impact || '');
    setOthUrl(item.evidenceUrl || '');
    setOthNotes(item.notes || '');
    setOthExistingDriveId(item.evidenceDriveFileId || '');
    setOthExistingFileName(item.evidenceFileName || '');
    setOthFile(null);
    setOthFormError('');
    setOtherModalOpen(true);
  };

  const handleSaveOther = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!othTitle.trim()) {
      setOthFormError('Sila masukkan nama atau tajuk pencapaian.');
      return;
    }

    setSaving(true);
    setOthFormError('');
    let uploadedDriveId = '';
    try {
      let driveId = othExistingDriveId;
      let fileName = othExistingFileName;
      if (othFile) {
        const up = await uploadEvidenceToDrive(othFile, 'Sijil Pengiktirafan');
        uploadedDriveId = up.fileId;
        driveId = up.fileId;
        fileName = up.fileName;
      }

      const nextEntry: OtherAchievementRecord = {
        id: editingOtherId || makeRecordId('OTHA'),
        title: othTitle.trim(),
        achievementType: othType,
        description: othDesc.trim(),
        role: othRole,
        organization: othOrg.trim(),
        level: othLevel,
        dateOrYear: othDateOrYear.trim(),
        impact: othImpact.trim(),
        evidenceUrl: othUrl.trim(),
        evidenceDriveFileId: driveId,
        evidenceFileName: fileName,
        notes: othNotes.trim(),
      };

      const nextList = editingOtherId
        ? otherList.map((item) => (item.id === editingOtherId ? nextEntry : item))
        : [...otherList, nextEntry];

      await persistAchievements({
        apcAwards: apcList,
        innovations: innovationList,
        researchOutputs: researchList,
        otherAchievements: nextList,
      });

      setOtherModalOpen(false);
      showToast('success', 'Rekod pencapaian & pengiktirafan berjaya disimpan.');
    } catch (err: unknown) {
      if (uploadedDriveId) {
        await deleteDriveFileApi(uploadedDriveId).catch(() => {});
      }
      const message =
        err instanceof Error ? err.message : 'Gagal menyimpan rekod pencapaian lain.';
      setOthFormError(message);
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (
    section: 'apc' | 'inv' | 'res' | 'other',
    id: string,
    label: string
  ) => {
    setConfirmState({
      open: true,
      title: 'Padam Rekod Pencapaian',
      message: `Adakah anda pasti mahu memadam rekod "${label}"?`,
      onConfirm: async () => {
        setSaving(true);
        try {
          await persistAchievements({
            apcAwards: section === 'apc' ? apcList.filter((i) => i.id !== id) : apcList,
            innovations:
              section === 'inv' ? innovationList.filter((i) => i.id !== id) : innovationList,
            researchOutputs:
              section === 'res' ? researchList.filter((i) => i.id !== id) : researchList,
            otherAchievements:
              section === 'other' ? otherList.filter((i) => i.id !== id) : otherList,
          });
          showToast('success', 'Rekod berjaya dipadamkan.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Gagal memadam rekod.';
          showToast('error', message);
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Pencapaian</h1>
            <p className="text-xs text-slate-500 mt-1">
              Rekod rasmi Anugerah Perkhidmatan Cemerlang (APC), inovasi, penerbitan dan penyelidikan, serta pengiktirafan profesional pegawai.
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
              {!profiles.some((p) => p.staffId === userAccount.staffId) &&
                userAccount.staffId && (
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
          <p className="text-xs text-slate-500">Memuatkan rekod pencapaian pegawai...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* BAHAGIAN A: APC */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Award className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN A: ANUGERAH PERKHIDMATAN CEMERLANG (APC)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod anugerah rasmi atas kecemerlangan prestasi dan perkhidmatan.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddApc}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah APC
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Nama Anugerah</th>
                    <th className="py-3 px-4 w-32">Tahun Anugerah</th>
                    <th className="py-3 px-4">Bukti: Sijil</th>
                    {canEdit && <th className="py-3 px-4 text-right w-28">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {apcList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 5 : 4}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada rekod Anugerah Perkhidmatan Cemerlang (APC) didaftarkan.
                      </td>
                    </tr>
                  ) : (
                    [...apcList]
                      .sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
                      .map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/60">
                          <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                          <td className="py-3 px-4 font-semibold text-[#0B1F3B]">{item.awardName}</td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-700">{item.year}</td>
                          <td className="py-3 px-4">
                            {item.certificateDriveFileId ? (
                              <div className="flex items-center gap-2">
                                <span className="text-slate-700">Ada</span>
                                <button
                                  type="button"
                                  disabled={loadingPreviewId === item.certificateDriveFileId}
                                  onClick={() =>
                                    handleOpenPreview(
                                      item.certificateDriveFileId || '',
                                      `${item.awardName} (${item.year})`
                                    )
                                  }
                                  className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline disabled:opacity-50"
                                >
                                  <Eye className="w-3.5 h-3.5" />
                                  {loadingPreviewId === item.certificateDriveFileId
                                    ? 'Membuka...'
                                    : '[Preview]'}
                                </button>
                              </div>
                            ) : (
                              <span className="text-slate-400">Tiada</span>
                            )}
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => openEditApc(item)}
                                  className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                  title="Edit"
                                >
                                  <Edit3 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => requestDelete('apc', item.id, item.awardName)}
                                  className="p-1 text-red-600 hover:text-red-800"
                                  title="Padam"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* BAHAGIAN B: INOVASI, KREATIVITI & PENAMBAHBAIKAN */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Lightbulb className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN B: Inovasi, Kreativiti & Penambahbaikan
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod inovasi, projek kreatif, penambahbaikan proses kerja dan hasil inovasi.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddInnovation}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Inovasi
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Nama Inovasi / Projek</th>
                    <th className="py-3 px-4">Jenis Inovasi</th>
                    <th className="py-3 px-4">Peranan Pegawai</th>
                    <th className="py-3 px-4">Peringkat</th>
                    <th className="py-3 px-4">Pengiktirafan</th>
                    <th className="py-3 px-4 w-20">Tahun</th>
                    <th className="py-3 px-4">Bukti</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {innovationList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 9 : 8}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada rekod inovasi, kreativiti & penambahbaikan didaftarkan.
                      </td>
                    </tr>
                  ) : (
                    innovationList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4 font-semibold text-[#0B1F3B]">{item.projectName}</td>
                        <td className="py-3 px-4 text-slate-700">{item.innovationType}</td>
                        <td className="py-3 px-4 text-slate-700">{item.role}</td>
                        <td className="py-3 px-4 text-slate-700">{item.level}</td>
                        <td className="py-3 px-4 text-slate-700">
                          {item.recognition || 'Tidak Berkenaan'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">{item.year}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.evidenceDriveFileId && (
                              <button
                                type="button"
                                disabled={loadingPreviewId === item.evidenceDriveFileId}
                                onClick={() =>
                                  handleOpenPreview(item.evidenceDriveFileId!, item.projectName)
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                              </button>
                            )}
                            {item.evidenceUrl && (
                              <a
                                href={formatSafeExternalUrl(item.evidenceUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Pautan
                              </a>
                            )}
                            {!item.evidenceDriveFileId && !item.evidenceUrl && (
                              <span className="text-slate-400">Tiada</span>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditInnovation(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete('inv', item.id, item.projectName)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* BAHAGIAN C: PENERBITAN & PENYELIDIKAN */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <BookOpenCheck className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN C: Penerbitan & Penyelidikan
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod penulisan, penerbitan, penyelidikan, kajian dan hasil intelektual.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddResearch}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Penerbitan / Kajian
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Jenis Hasil</th>
                    <th className="py-3 px-4">Tajuk</th>
                    <th className="py-3 px-4">Peranan</th>
                    <th className="py-3 px-4">Penerbit / Jurnal</th>
                    <th className="py-3 px-4">ISBN / ISSN / DOI</th>
                    <th className="py-3 px-4 w-20">Tahun Terbit</th>
                    <th className="py-3 px-4">Indeks</th>
                    <th className="py-3 px-4">Bidang</th>
                    <th className="py-3 px-4">Pautan & Bukti</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {researchList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 11 : 10}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada rekod penerbitan & penyelidikan didaftarkan.
                      </td>
                    </tr>
                  ) : (
                    researchList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4 text-slate-700">{item.outputType}</td>
                        <td className="py-3 px-4 font-semibold text-[#0B1F3B] max-w-[240px]">
                          {item.title}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{item.role}</td>
                        <td className="py-3 px-4 text-slate-700">
                          {item.publisherOrJournal || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {item.identifier || '-'}
                        </td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">{item.year}</td>
                        <td className="py-3 px-4 text-slate-700">{item.indexing}</td>
                        <td className="py-3 px-4 text-slate-700">{item.field || '-'}</td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.evidenceDriveFileId && (
                              <button
                                type="button"
                                disabled={loadingPreviewId === item.evidenceDriveFileId}
                                onClick={() =>
                                  handleOpenPreview(item.evidenceDriveFileId!, item.title)
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Dokumen
                              </button>
                            )}
                            {item.url && (
                              <a
                                href={formatSafeExternalUrl(item.url)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                URL
                              </a>
                            )}
                            {!item.evidenceDriveFileId && !item.url && (
                              <span className="text-slate-400">Tiada</span>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditResearch(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete('res', item.id, item.title)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* BAHAGIAN D: LAIN-LAIN PENCAPAIAN / PENGIKTIRAFAN */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Sparkles className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN D: Lain-lain Pencapaian / Pengiktirafan
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod pencapaian peribadi profesional, sukan, seni dan budaya, teknologi, keusahawanan, kesukarelawanan dan pencapaian khas.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddOther}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah Pencapaian Lain
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Nama Pencapaian</th>
                    <th className="py-3 px-4">Jenis Pencapaian</th>
                    <th className="py-3 px-4">Peranan Pegawai</th>
                    <th className="py-3 px-4">Organisasi / Institusi</th>
                    <th className="py-3 px-4">Peringkat</th>
                    <th className="py-3 px-4">Tarikh / Tahun</th>
                    <th className="py-3 px-4">Impak & Catatan</th>
                    <th className="py-3 px-4">Bukti</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {otherList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 10 : 9}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada rekod pencapaian atau pengiktirafan lain didaftarkan.
                      </td>
                    </tr>
                  ) : (
                    otherList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4">
                          <div className="font-semibold text-[#0B1F3B]">{item.title}</div>
                          {item.description && (
                            <p className="text-[11px] text-slate-500 mt-0.5 line-clamp-2">
                              {item.description}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{item.achievementType}</td>
                        <td className="py-3 px-4 text-slate-700">{item.role}</td>
                        <td className="py-3 px-4 text-slate-700">{item.organization || '-'}</td>
                        <td className="py-3 px-4 text-slate-700">{item.level}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {item.dateOrYear}
                        </td>
                        <td className="py-3 px-4 text-slate-700 max-w-[200px]">
                          <div>{item.impact || '-'}</div>
                          {item.notes && (
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              Catatan: {item.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex flex-wrap items-center gap-2">
                            {item.evidenceDriveFileId && (
                              <button
                                type="button"
                                disabled={loadingPreviewId === item.evidenceDriveFileId}
                                onClick={() =>
                                  handleOpenPreview(item.evidenceDriveFileId!, item.title)
                                }
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <Eye className="w-3.5 h-3.5" />
                                Preview
                              </button>
                            )}
                            {item.evidenceUrl && (
                              <a
                                href={formatSafeExternalUrl(item.evidenceUrl)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] hover:underline"
                              >
                                <ExternalLink className="w-3.5 h-3.5" />
                                Pautan
                              </a>
                            )}
                            {!item.evidenceDriveFileId && !item.evidenceUrl && (
                              <span className="text-slate-400">Tiada</span>
                            )}
                          </div>
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditOther(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete('other', item.id, item.title)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL BAHAGIAN A: APC                                     */}
      {/* ========================================================= */}
      {apcModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingApcId ? 'Edit Rekod APC' : 'Tambah Rekod Anugerah Perkhidmatan Cemerlang (APC)'}
              </h3>
              <button
                type="button"
                onClick={() => setApcModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveApc} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nama Anugerah *</label>
                <select
                  value={apcPreset}
                  onChange={(e) => setApcPreset(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {APC_AWARD_PRESETS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                  <option value="Lain-lain">Lain-lain (Nyatakan)</option>
                </select>
                {apcPreset === 'Lain-lain' && (
                  <input
                    type="text"
                    required
                    value={apcCustomName}
                    onChange={(e) => setApcCustomName(e.target.value)}
                    placeholder="Contoh: APC Kali Kelima"
                    className="mt-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Tahun Anugerah *</label>
                <select
                  value={apcYear}
                  onChange={(e) => setApcYear(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono-tabular"
                >
                  {YEAR_OPTIONS.map((yr) => (
                    <option key={yr} value={yr}>
                      {yr}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Bukti: Sijil (Wajib Muat Naik) *
                </label>
                {apcExistingDriveId && !apcFile && (
                  <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                    <span className="text-slate-700 truncate">
                      Sijil sedia ada: {apcExistingFileName || apcExistingDriveId}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleOpenPreview(apcExistingDriveId, 'Sijil APC')}
                      className="text-[#0B1F3B] font-semibold hover:underline shrink-0"
                    >
                      Preview
                    </button>
                  </div>
                )}
                <label className="flex items-center justify-center gap-2 px-3 py-2.5 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                  <Upload className="w-4 h-4 text-slate-500" />
                  <span className="text-slate-600">
                    {apcFile ? apcFile.name : 'Pilih fail Sijil APC (PDF / JPG / PNG, maks 15MB)'}
                  </span>
                  <input
                    type="file"
                    accept=".pdf,.jpg,.jpeg,.png"
                    onChange={(e) => setApcFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              {apcFormError && (
                <p className="text-xs text-red-600 font-medium">{apcFormError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setApcModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan APC'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL BAHAGIAN B: INOVASI                                 */}
      {/* ========================================================= */}
      {invModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingInvId
                  ? 'Edit Rekod Inovasi'
                  : 'Tambah Inovasi, Kreativiti & Penambahbaikan'}
              </h3>
              <button
                type="button"
                onClick={() => setInvModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveInnovation} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Inovasi / Projek *
                  </label>
                  <input
                    type="text"
                    required
                    value={invName}
                    onChange={(e) => setInvName(e.target.value)}
                    placeholder="Contoh: Sistem Analitik Kepimpinan Digital"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Inovasi *</label>
                  <select
                    value={invType}
                    onChange={(e) => setInvType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {INNOVATION_TYPES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Peranan Pegawai *</label>
                  <select
                    value={invRole}
                    onChange={(e) => setInvRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {INNOVATION_ROLES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Peringkat *</label>
                  <select
                    value={invLevel}
                    onChange={(e) => setInvLevel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {INNOVATION_LEVELS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    value={invYear}
                    onChange={(e) => setInvYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono-tabular"
                  >
                    {YEAR_OPTIONS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pengiktirafan (Anugerah / Pertandingan / Pameran jika ada)
                  </label>
                  <input
                    type="text"
                    value={invRecognition}
                    onChange={(e) => setInvRecognition(e.target.value)}
                    placeholder="Contoh: Pingat Emas KIK / Anugerah Inovasi KPM"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pautan Bukti (URL jika ada)
                  </label>
                  <input
                    type="text"
                    value={invUrl}
                    onChange={(e) => setInvUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Muat Naik Bukti (Laporan / Gambar / Sijil jika ada)
                  </label>
                  {invExistingDriveId && !invFile && (
                    <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-700 truncate">
                        Fail sedia ada: {invExistingFileName || invExistingDriveId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(invExistingDriveId, invName || 'Bukti Inovasi')}
                        className="text-[#0B1F3B] font-semibold hover:underline shrink-0"
                      >
                        Preview
                      </button>
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {invFile ? invFile.name : 'Pilih fail bukti (PDF / JPG / PNG)'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setInvFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {invFormError && (
                <p className="text-xs text-red-600 font-medium">{invFormError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setInvModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Inovasi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL BAHAGIAN C: PENERBITAN & PENYELIDIKAN               */}
      {/* ========================================================= */}
      {resModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingResId
                  ? 'Edit Rekod Penerbitan & Penyelidikan'
                  : 'Tambah Penerbitan & Penyelidikan'}
              </h3>
              <button
                type="button"
                onClick={() => setResModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveResearch} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Jenis Hasil *</label>
                  <select
                    value={resOutputType}
                    onChange={(e) => setResOutputType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {ACHIEVEMENT_RESEARCH_TYPES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Peranan *</label>
                  <select
                    value={resRole}
                    onChange={(e) => setResRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {ACHIEVEMENT_RESEARCH_ROLES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Tajuk Penuh *</label>
                  <input
                    type="text"
                    required
                    value={resTitle}
                    onChange={(e) => setResTitle(e.target.value)}
                    placeholder="Tajuk penuh penerbitan atau kajian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nama Penerbit / Jurnal
                  </label>
                  <input
                    type="text"
                    value={resPublisher}
                    onChange={(e) => setResPublisher(e.target.value)}
                    placeholder="Nama penerbit atau jurnal"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    ISBN / ISSN / DOI (jika ada)
                  </label>
                  <input
                    type="text"
                    value={resIdentifier}
                    onChange={(e) => setResIdentifier(e.target.value)}
                    placeholder="Contoh: 978-983-..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Tahun Terbit *</label>
                  <select
                    value={resYear}
                    onChange={(e) => setResYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white font-mono-tabular"
                  >
                    {YEAR_OPTIONS.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Indeks *</label>
                  <select
                    value={resIndexing}
                    onChange={(e) => setResIndexing(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {ACHIEVEMENT_INDEXING_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">Bidang</label>
                  <input
                    type="text"
                    value={resField}
                    onChange={(e) => setResField(e.target.value)}
                    placeholder="Bidang penyelidikan atau penulisan"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Pautan (URL penerbitan jika ada)
                  </label>
                  <input
                    type="text"
                    value={resUrl}
                    onChange={(e) => setResUrl(e.target.value)}
                    placeholder="https://..."
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Bukti (Muka depan / DOI / Surat / Dokumen)
                  </label>
                  {resExistingDriveId && !resFile && (
                    <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-700 truncate">
                        Fail sedia ada: {resExistingFileName || resExistingDriveId}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleOpenPreview(resExistingDriveId, resTitle || 'Bukti Penerbitan')}
                        className="text-[#0B1F3B] font-semibold hover:underline shrink-0"
                      >
                        Preview
                      </button>
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <FileText className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {resFile ? resFile.name : 'Pilih fail dokumen bukti (PDF / JPG / PNG)'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setResFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
              </div>

              {resFormError && (
                <p className="text-xs text-red-600 font-medium">{resFormError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setResModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Penerbitan / Kajian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* MODAL BAHAGIAN D: LAIN-LAIN PENCAPAIAN                    */}
      {/* ========================================================= */}
      {otherModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingOtherId
                  ? 'Edit Lain-lain Pencapaian / Pengiktirafan'
                  : 'Tambah Lain-lain Pencapaian / Pengiktirafan'}
              </h3>
              <button
                type="button"
                onClick={() => setOtherModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveOther} className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    1. Nama Pencapaian *
                  </label>
                  <input
                    type="text"
                    required
                    value={othTitle}
                    onChange={(e) => setOthTitle(e.target.value)}
                    placeholder="Nama atau tajuk pencapaian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    2. Jenis Pencapaian *
                  </label>
                  <select
                    value={othType}
                    onChange={(e) => setOthType(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {OTHER_ACHIEVEMENT_TYPES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    3. Keterangan Pencapaian
                  </label>
                  <textarea
                    rows={2}
                    value={othDesc}
                    onChange={(e) => setOthDesc(e.target.value)}
                    placeholder="Huraian ringkas tentang pencapaian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    4. Peranan Pegawai *
                  </label>
                  <select
                    value={othRole}
                    onChange={(e) => setOthRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {OTHER_ACHIEVEMENT_ROLES.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    5. Organisasi / Institusi
                  </label>
                  <input
                    type="text"
                    value={othOrg}
                    onChange={(e) => setOthOrg(e.target.value)}
                    placeholder="Nama organisasi atau institusi berkaitan"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">6. Peringkat *</label>
                  <select
                    value={othLevel}
                    onChange={(e) => setOthLevel(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    {OTHER_ACHIEVEMENT_LEVELS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    7. Tarikh / Tahun *
                  </label>
                  <input
                    type="text"
                    required
                    value={othDateOrYear}
                    onChange={(e) => setOthDateOrYear(e.target.value)}
                    placeholder="Contoh: 2024 atau 14/08/2024"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    8. Impak / Nilai Pencapaian
                  </label>
                  <input
                    type="text"
                    value={othImpact}
                    onChange={(e) => setOthImpact(e.target.value)}
                    placeholder="Sumbangan, manfaat atau nilai pencapaian"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    9. Bukti Pencapaian (Pautan URL & Muat Naik Dokumen)
                  </label>
                  <input
                    type="text"
                    value={othUrl}
                    onChange={(e) => setOthUrl(e.target.value)}
                    placeholder="Pautan URL (jika ada)"
                    className="mb-2 w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                  {othExistingDriveId && !othFile && (
                    <div className="mb-2 flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg">
                      <span className="text-slate-700 truncate">
                        Fail sedia ada: {othExistingFileName || othExistingDriveId}
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenPreview(othExistingDriveId, othTitle || 'Bukti Pencapaian')
                        }
                        className="text-[#0B1F3B] font-semibold hover:underline shrink-0"
                      >
                        Preview
                      </button>
                    </div>
                  )}
                  <label className="flex items-center justify-center gap-2 px-3 py-2 border border-dashed border-slate-300 rounded-lg cursor-pointer hover:bg-slate-50">
                    <Upload className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-600">
                      {othFile ? othFile.name : 'Muat naik Sijil / Surat / Gambar / Dokumen'}
                    </span>
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      onChange={(e) => setOthFile(e.target.files?.[0] || null)}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="sm:col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">10. Catatan</label>
                  <textarea
                    rows={2}
                    value={othNotes}
                    onChange={(e) => setOthNotes(e.target.value)}
                    placeholder="Maklumat tambahan jika perlu"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>

              {othFormError && (
                <p className="text-xs text-red-600 font-medium">{othFormError}</p>
              )}

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setOtherModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Pencapaian'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Certificate / Evidence Preview Modal */}
      {previewModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B] truncate">{previewModal.title}</h3>
              <button
                type="button"
                onClick={() => {
                  if (previewModal.blobUrl) URL.revokeObjectURL(previewModal.blobUrl);
                  setPreviewModal(null);
                }}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup paparan bukti"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-auto">
              {previewModal.mimeType.includes('pdf') ? (
                <iframe
                  src={previewModal.blobUrl}
                  title={previewModal.title}
                  className="w-full h-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewModal.blobUrl}
                  alt={previewModal.title}
                  className="max-w-full max-h-full object-contain rounded-lg shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.message}
        confirmLabel="Padam"
        variant="danger"
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
        onConfirm={async () => {
          const fn = confirmState.onConfirm;
          setConfirmState((s) => ({ ...s, open: false }));
          await fn();
        }}
      />
    </div>
  );
};
