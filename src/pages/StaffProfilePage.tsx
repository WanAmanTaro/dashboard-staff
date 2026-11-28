import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Award,
  BookOpen,
  Camera,
  Check,
  CheckCircle2,
  Edit3,
  ExternalLink,
  Eye,
  GraduationCap,
  Link2,
  Plus,
  Save,
  Settings,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CertificateManager } from '../components/CertificateManager';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DriveImage } from '../components/DriveImage';
import { PhotoEditorModal } from '../components/PhotoEditorModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import {
  COMPETENCY_LEVELS,
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  PUBLICATION_TYPES,
  QUALIFICATION_LEVELS,
  SERVICE_GRADES_HAKIKI,
  SERVICE_GRADES_KUP,
  SERVICE_POSITIONS,
  buildSafeDriveFilePrefix,
  computeProfileCompletion,
  getHighestQualificationFromList,
  hasValidAchievement,
  sortPublicationsDefault,
  sortQualificationsHighestFirst,
} from '../lib/constants';
import {
  deleteDriveFileApi,
  fetchDriveFileBlob,
  getDriveStatus,
  uploadFileToDriveApi,
  type DriveStatusResponse,
} from '../services/apiClient';
import {
  addOrUpdatePublication,
  addOrUpdateQualification,
  deletePublication,
  deleteQualification,
  getStaffProfileBundle,
  getSystemSettings,
  makeRecordId,
  saveCertificateMetadata,
  saveFullStaffProfile,
  saveStaffCompetencies,
  saveSystemSettings,
} from '../services/firestoreService';
import type {
  Certificate,
  CompetencyItem,
  CompetencySkillType,
  Department,
  ExpertiseRecord,
  OrganizationCenter,
  ProfilePhoto,
  Publication,
  PublicationType,
  Qualification,
  QualificationLevel,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
} from '../types/iab';

interface StaffProfilePageProps {
  targetStaffId?: string | null;
  organizations: OrganizationCenter[];
  departments: Department[];
  onClearTarget?: () => void;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

type ProfileSectionTab =
  | 'A_C'
  | 'D'
  | 'E_G'
  | 'F'
  | 'H'
  | 'I_J';

function splitCsv(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
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
  if (sParts.length !== 3 || eParts.length !== 3 || sParts.some(Number.isNaN) || eParts.some(Number.isNaN)) {
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

export const StaffProfilePage: React.FC<StaffProfilePageProps> = ({
  targetStaffId,
  organizations,
  departments,
  onClearTarget,
  onSystemSettingsUpdated,
}) => {
  const { userAccount, firebaseUser, linkGoogleProviderToCurrentUser } = useAuth();
  const { showToast } = useToast();

  const effectiveStaffId = targetStaffId || userAccount?.staffId || '';
  const isOwnProfile = !targetStaffId || targetStaffId === userAccount?.staffId;
  const canEdit = Boolean(isOwnProfile || userAccount?.isAdmin);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<'view' | 'edit' | 'preview'>(isOwnProfile ? 'edit' : 'view');
  const [activeTab, setActiveTab] = useState<ProfileSectionTab>('A_C');

  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(null);
  const [photoModalOpen, setPhotoModalOpen] = useState(false);

  // Core state
  const [profile, setProfile] = useState<StaffProfile | null>(null);
  const [pii, setPii] = useState<StaffPrivatePII | null>(null);
  const [qualifications, setQualifications] = useState<Qualification[]>([]);
  const [expertise, setExpertise] = useState<ExpertiseRecord | null>(null);
  const [competencyItems, setCompetencyItems] = useState<CompetencyItem[]>([]);
  const [publications, setPublications] = useState<Publication[]>([]);
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [photo, setPhoto] = useState<ProfilePhoto | null>(null);

  // Editable form state
  const [fullName, setFullName] = useState('');
  const [officialEmail, setOfficialEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState('');
  const [icNumber, setIcNumber] = useState('');
  const [altContact, setAltContact] = useState('');

  const [position, setPosition] = useState('');
  const [grade, setGrade] = useState('');
  const [kupGrade, setKupGrade] = useState('TIDAK BERKENAAN');
  const [scheme, setScheme] = useState('Pegawai Perkhidmatan Pendidikan');
  const [isLecturer, setIsLecturer] = useState(true);
  const [appointmentDate, setAppointmentDate] = useState('');
  const [serviceStatus, setServiceStatus] = useState('Tetap');
  const [yearsOfService, setYearsOfService] = useState<number>(0);

  const [centerId, setCenterId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [unit, setUnit] = useState('');
  const [orgPosition, setOrgPosition] = useState('');
  const [headOfCenter, setHeadOfCenter] = useState('');
  const [headOfDepartment, setHeadOfDepartment] = useState('');

  // Expertise & Experience fields
  const [primaryExpertise, setPrimaryExpertise] = useState('');
  const [secondaryExpertise, setSecondaryExpertise] = useState('');
  const [specializationsText, setSpecializationsText] = useState('');
  const [researchAreasText, setResearchAreasText] = useState('');
  const [teachingAreasText, setTeachingAreasText] = useState('');
  const [trainingAreasText, setTrainingAreasText] = useState('');
  const [keywordsText, setKeywordsText] = useState('');
  const [teachingExp, setTeachingExp] = useState('');
  const [managementExp, setManagementExp] = useState('');
  const [facilitatorExp, setFacilitatorExp] = useState('');
  const [speakerExp, setSpeakerExp] = useState('');
  const [coachExp, setCoachExp] = useState('');
  const [projectExp, setProjectExp] = useState('');
  const [professionalExp, setProfessionalExp] = useState('');

  // Sub-modals/forms for Qualification & Publication
  const [showQualForm, setShowQualForm] = useState(false);
  const [editingQualId, setEditingQualId] = useState<string | null>(null);
  const [qLevel, setQLevel] = useState<QualificationLevel>('Sarjana');
  const [qInst, setQInst] = useState('');
  const [qField, setQField] = useState('');
  const [qYear, setQYear] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [deletingQual, setDeletingQual] = useState<Qualification | null>(null);

  const [showPubForm, setShowPubForm] = useState(false);
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [pType, setPType] = useState<PublicationType>('Artikel Jurnal');
  const [pTitle, setPTitle] = useState('');
  const [pVenue, setPVenue] = useState('');
  const [pYear, setPYear] = useState('');
  const [pAchievement, setPAchievement] = useState('Tidak Berkenaan');
  const [pUrl, setPUrl] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [deletingPub, setDeletingPub] = useState<Publication | null>(null);

  const [pubSort, setPubSort] = useState<{
    key: 'default' | 'type' | 'title' | 'year' | 'achievement';
    dir: 'asc' | 'desc';
  }>({ key: 'default', dir: 'asc' });

  // Admin catalog droplist modal for Tab D (Institutions) & Tab H (Years)
  const [adminCatalogModal, setAdminCatalogModal] = useState<'institutions' | 'pubYears' | null>(null);
  const [adminCatalogDraft, setAdminCatalogDraft] = useState<string[]>([]);
  const [adminCatalogNewItem, setAdminCatalogNewItem] = useState('');
  const [adminCatalogEditIdx, setAdminCatalogEditIdx] = useState<number | null>(null);
  const [adminCatalogEditText, setAdminCatalogEditText] = useState('');
  const [savingAdminCatalog, setSavingAdminCatalog] = useState(false);

  // Tab F: Kompetensi Digital & AI state
  const [compFormOpen, setCompFormOpen] = useState(false);
  const [compFormType, setCompFormType] = useState<CompetencySkillType>('aplikasi');
  const [editingCompIndex, setEditingCompIndex] = useState<number | null>(null);
  const [cCategoryName, setCCategoryName] = useState('');
  const [cLevel, setCLevel] = useState<CompetencyItem['level']>('Pertengahan');
  const [cYears, setCYears] = useState<number>(1);
  const [cNotes, setCNotes] = useState('');
  const [cHasCert, setCHasCert] = useState<boolean>(false);
  const [cCertSource, setCCertSource] = useState<'existing' | 'upload'>('upload');
  const [cExistingCertId, setCExistingCertId] = useState('');
  const [cCertTitle, setCCertTitle] = useState('');
  const [cCertFile, setCCertFile] = useState<File | null>(null);
  const [cHasValidityPeriod, setCHasValidityPeriod] = useState<boolean>(false);
  const [cCertStartDate, setCCertStartDate] = useState('');
  const [cCertEndDate, setCCertEndDate] = useState('');
  const [compFormError, setCompFormError] = useState('');
  const [driveStatus, setDriveStatus] = useState<DriveStatusResponse | null>(null);
  const [savingComp, setSavingComp] = useState(false);
  const [deletingCompIndex, setDeletingCompIndex] = useState<number | null>(null);

  // Tab F: Admin-only droplist management
  const [adminEditListType, setAdminEditListType] = useState<CompetencySkillType | null>(null);
  const [adminDraftList, setAdminDraftList] = useState<string[]>([]);
  const [adminNewSkillOption, setAdminNewSkillOption] = useState('');
  const [adminEditingIdx, setAdminEditingIdx] = useState<number | null>(null);
  const [adminEditingText, setAdminEditingText] = useState('');
  const [savingAdminList, setSavingAdminList] = useState(false);

  // Certificate preview modal for Tab F
  const [compCertPreview, setCompCertPreview] = useState<{
    title: string;
    blobUrl: string;
    mimeType: string;
  } | null>(null);
  const [loadingCertPreviewId, setLoadingCertPreviewId] = useState<string | null>(null);

  const expertiseOptions = sysSettings?.expertiseCategories?.length
    ? sysSettings.expertiseCategories
    : DEFAULT_EXPERTISE_CATEGORIES;
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
  const institutionOptions = useMemo(
    () =>
      sysSettings?.institutionCategories?.length
        ? sysSettings.institutionCategories
        : DEFAULT_INSTITUTION_CATEGORIES,
    [sysSettings?.institutionCategories]
  );
  const pubYearOptions = useMemo(
    () =>
      sysSettings?.publicationYears?.length
        ? sysSettings.publicationYears
        : DEFAULT_PUBLICATION_YEARS,
    [sysSettings?.publicationYears]
  );
  const iabModuleOptions = useMemo(
    () => (sysSettings?.iabModules?.length ? sysSettings.iabModules : DEFAULT_IAB_MODULES),
    [sysSettings?.iabModules]
  );

  const sortedQualifications = useMemo(
    () => sortQualificationsHighestFirst(qualifications),
    [qualifications]
  );

  const sortedPublications = useMemo(() => {
    const base = sortPublicationsDefault(publications);
    if (pubSort.key === 'default') return base;
    const factor = pubSort.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (pubSort.key === 'year') {
        const yrA = parseInt(String(a.year || '0'), 10) || 0;
        const yrB = parseInt(String(b.year || '0'), 10) || 0;
        return (yrA - yrB) * factor;
      }
      if (pubSort.key === 'achievement') {
        const aHas = hasValidAchievement(a.achievement) ? 1 : 0;
        const bHas = hasValidAchievement(b.achievement) ? 1 : 0;
        if (aHas !== bHas) return (aHas - bHas) * factor;
        return String(a.achievement || '').localeCompare(String(b.achievement || '')) * factor;
      }
      if (pubSort.key === 'type') {
        return a.type.localeCompare(b.type) * factor;
      }
      return a.title.localeCompare(b.title) * factor;
    });
  }, [publications, pubSort]);

  const loadBundle = async () => {
    if (!effectiveStaffId || !userAccount) return;
    setLoading(true);
    try {
      const [bundle, settings] = await Promise.all([
        getStaffProfileBundle(effectiveStaffId, userAccount),
        getSystemSettings().catch(() => null),
      ]);
      setSysSettings(settings);
      setProfile(bundle.profile);
      setPii(bundle.pii);
      setQualifications(bundle.qualifications);
      setExpertise(bundle.expertise);
      setCompetencyItems(bundle.competencies?.items || []);
      setPublications(bundle.publications);
      setCertificates(bundle.certificates);
      setPhoto(bundle.photo);

      const p = bundle.profile;
      const priv = bundle.pii;
      const exp = bundle.expertise;

      setFullName(p?.fullName || (isOwnProfile ? userAccount.displayName : ''));
      setOfficialEmail(p?.officialEmail || (isOwnProfile ? userAccount.email : ''));
      setPhone(priv?.phone || '');
      setGender(priv?.gender || '');
      setIcNumber(priv?.icNumber || '');
      setAltContact(priv?.altContact || '');

      setPosition(p?.position || '');
      setGrade(p?.grade || '');
      setKupGrade(p?.kupGrade || 'TIDAK BERKENAAN');
      setScheme(p?.scheme || 'Pegawai Perkhidmatan Pendidikan');
      setIsLecturer(p?.isLecturer ?? (userAccount.role === 'L1' || userAccount.role === 'L2' || userAccount.role === 'L3'));
      setAppointmentDate(priv?.appointmentDate || '');
      setServiceStatus(priv?.serviceStatus || 'Tetap');
      setYearsOfService(priv?.yearsOfService ?? 0);

      const cid = p?.centerId || userAccount.centerId || organizations[0]?.id || '';
      const did = p?.departmentId || userAccount.departmentId || '';
      setCenterId(cid);
      setDepartmentId(did);
      setUnit(p?.unit || '');
      setOrgPosition(p?.orgPosition || '');
      setHeadOfCenter(p?.headOfCenter || '');
      setHeadOfDepartment(p?.headOfDepartment || '');

      setPrimaryExpertise(exp?.primaryExpertise || p?.primaryExpertise || '');
      setSecondaryExpertise(exp?.secondaryExpertise || p?.secondaryExpertise || '');
      setSpecializationsText(exp?.specializations?.join(', ') || '');
      setResearchAreasText(exp?.researchAreas?.join(', ') || '');
      setTeachingAreasText(exp?.teachingAreas?.join(', ') || '');
      setTrainingAreasText(exp?.trainingAreas?.join(', ') || '');
      setKeywordsText(exp?.keywords?.join(', ') || p?.expertiseKeywords?.join(', ') || '');

      setTeachingExp(exp?.teachingExp || '');
      setManagementExp(exp?.managementExp || '');
      setFacilitatorExp(exp?.facilitatorExp || '');
      setSpeakerExp(exp?.speakerExp || '');
      setCoachExp(exp?.coachExp || '');
      setProjectExp(exp?.projectExp || '');
      setProfessionalExp(exp?.professionalExp || '');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuatkan rekod profil pegawai.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    setMode(isOwnProfile ? 'edit' : 'view');
    loadBundle();
  }, [effectiveStaffId]);

  useEffect(() => {
    if (activeTab === 'F') {
      getDriveStatus()
        .then(setDriveStatus)
        .catch(() => null);
    }
  }, [activeTab]);

  const filteredDepts = useMemo(
    () => departments.filter((d) => !centerId || d.centerId === centerId),
    [departments, centerId]
  );

  const selectedCenter = organizations.find((c) => c.id === centerId);
  const selectedDept = departments.find((d) => d.id === departmentId);
  const resolvedHeadOfCenter = selectedCenter?.headName?.trim() || 'TIADA MAKLUMAT';
  const resolvedHeadOfDepartment = selectedDept?.headName?.trim() || 'TIADA MAKLUMAT';

  const liveCompletion = useMemo(() => {
    return computeProfileCompletion({
      profile: {
        fullName,
        officialEmail,
        position,
        grade,
        scheme,
        centerId,
        departmentId,
        highestQualification: profile?.highestQualification || '',
        primaryExpertise,
        digitalCompetencies: competencyItems.map((i) => i.categoryName),
        hasPhoto: Boolean(photo || profile?.hasPhoto),
      },
      pii: { phone },
      qualificationsCount: qualifications.length,
      expertise: {
        primaryExpertise,
        teachingExp,
        managementExp,
        facilitatorExp,
        speakerExp,
        coachExp,
        projectExp,
        professionalExp,
      },
      competencies: { items: competencyItems },
      publicationsCount: publications.length,
      certificatesCount: certificates.length,
    });
  }, [
    fullName,
    officialEmail,
    phone,
    position,
    grade,
    scheme,
    centerId,
    departmentId,
    profile?.highestQualification,
    profile?.hasPhoto,
    primaryExpertise,
    competencyItems,
    photo,
    qualifications.length,
    teachingExp,
    managementExp,
    facilitatorExp,
    speakerExp,
    coachExp,
    projectExp,
    professionalExp,
    publications.length,
    certificates.length,
  ]);

  const handleSaveAll = async () => {
    if (!userAccount || !effectiveStaffId) return;
    if (!fullName.trim() || officialEmail.trim().length < 3) {
      showToast('error', 'Nama penuh dan emel rasmi yang sah wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const ownUid = firebaseUser?.uid || userAccount.uid;
      const targetUid = profile?.uid || (isOwnProfile ? ownUid : '');
      const centerName = selectedCenter?.name || profile?.centerName || '';
      const departmentName = selectedDept?.name || profile?.departmentName || '';

      await saveFullStaffProfile({
        profile: {
          id: effectiveStaffId,
          staffId: effectiveStaffId,
          uid: targetUid,
          fullName: fullName.trim(),
          officialEmail: officialEmail.trim().toLowerCase(),
          position: position.trim(),
          grade: grade.trim(),
          kupGrade: kupGrade.trim() || 'TIDAK BERKENAAN',
          scheme: scheme.trim(),
          isLecturer,
          centerId,
          centerName,
          departmentId,
          departmentName,
          unit: unit.trim(),
          orgPosition: orgPosition.trim(),
          headOfCenter: resolvedHeadOfCenter,
          headOfDepartment: resolvedHeadOfDepartment,
          highestQualification:
            getHighestQualificationFromList(qualifications) || profile?.highestQualification || '',
          primaryExpertise: primaryExpertise.trim(),
          secondaryExpertise: secondaryExpertise.trim(),
          digitalCompetencies: competencyItems.map((i) => i.categoryName),
          expertiseKeywords: splitCsv(keywordsText),
          completionPercent: liveCompletion.completionPercent,
          missingSections: liveCompletion.missingSections,
          hasPhoto: Boolean(photo || profile?.hasPhoto),
          photoDisplayUrl: photo?.displayDriveFileId || profile?.photoDisplayUrl || '',
          certificateCount: certificates.length,
          publicationCount: publications.length,
          status: 'active',
        },
        pii: {
          staffId: effectiveStaffId,
          uid: targetUid,
          centerId,
          departmentId,
          phone: phone.trim(),
          gender: gender.trim(),
          icNumber: icNumber.trim(),
          altContact: altContact.trim(),
          appointmentDate: appointmentDate.trim(),
          serviceStatus: serviceStatus.trim(),
          yearsOfService: Number(yearsOfService) || 0,
        },
        expertise: {
          id: effectiveStaffId,
          staffId: effectiveStaffId,
          uid: targetUid,
          centerId,
          departmentId,
          primaryExpertise: primaryExpertise.trim(),
          secondaryExpertise: secondaryExpertise.trim(),
          specializations: splitCsv(specializationsText),
          researchAreas: splitCsv(researchAreasText),
          teachingAreas: splitCsv(teachingAreasText),
          trainingAreas: splitCsv(trainingAreasText),
          keywords: splitCsv(keywordsText),
          teachingExp: teachingExp.trim(),
          managementExp: managementExp.trim(),
          facilitatorExp: facilitatorExp.trim(),
          speakerExp: speakerExp.trim(),
          coachExp: coachExp.trim(),
          projectExp: projectExp.trim(),
          professionalExp: professionalExp.trim(),
          status: 'active',
        },
        competencies: {
          id: effectiveStaffId,
          staffId: effectiveStaffId,
          uid: targetUid,
          centerId,
          departmentId,
          items: competencyItems,
          status: 'active',
        },
        qualificationsCount: qualifications.length,
        publicationsCount: publications.length,
        certificatesCount: certificates.length,
      });

      showToast('success', 'Profil pegawai berjaya disimpan ke Firestore.');
      await loadBundle();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan profil pegawai.');
    } finally {
      setSaving(false);
    }
  };

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

  const openAddCompetencyForm = (type: CompetencySkillType) => {
    if (!canEdit || mode !== 'edit') return;
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
    if (!canEdit || mode !== 'edit') return;
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

  const persistCompetencyList = async (nextItems: CompetencyItem[], newCert?: Certificate | null) => {
    if (!userAccount || !effectiveStaffId) return;
    const targetUid = profile?.uid || (isOwnProfile ? firebaseUser?.uid || userAccount.uid : '');
    const updatedCertCount = newCert ? certificates.length + 1 : certificates.length;
    const nextComp = computeProfileCompletion({
      profile: {
        fullName,
        officialEmail,
        position,
        grade,
        scheme,
        centerId,
        departmentId,
        highestQualification: profile?.highestQualification || '',
        primaryExpertise,
        digitalCompetencies: nextItems.map((i) => i.categoryName),
        hasPhoto: Boolean(photo || profile?.hasPhoto),
      },
      pii: { phone },
      qualificationsCount: qualifications.length,
      expertise: {
        primaryExpertise,
        teachingExp,
        managementExp,
        facilitatorExp,
        speakerExp,
        coachExp,
        projectExp,
        professionalExp,
      },
      competencies: { items: nextItems },
      publicationsCount: publications.length,
      certificatesCount: updatedCertCount,
    });

    const saved = await saveStaffCompetencies({
      staffId: effectiveStaffId,
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

  const handleSaveCompetencyItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!userAccount || !effectiveStaffId) return;
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
          const resolvedStaffName = fullName.trim() || userAccount.displayName || '';
          const resolvedStaffEmail = officialEmail.trim() || userAccount.email || '';
          const filePrefix = buildSafeDriveFilePrefix(resolvedStaffName, resolvedStaffEmail, effectiveStaffId);
          const uploadRes = await uploadFileToDriveApi({
            file: cCertFile,
            fileName: `${filePrefix}_${cCertFile.name}`,
            staffId: effectiveStaffId,
            staffName: resolvedStaffName,
            staffEmail: resolvedStaffEmail,
            category: 'Sijil Kompetensi',
          });
          uploadedDriveFileId = uploadRes.fileId;
          const targetUid = profile?.uid || (isOwnProfile ? firebaseUser?.uid || userAccount.uid : '') || userAccount.uid;
          const newCertId = makeRecordId('CERT');
          const resolvedTitle = cCertTitle.trim() || `Sijil ${selectedName}`;
          const certRecord: Omit<Certificate, 'createdAt' | 'updatedAt' | 'createdBy' | 'updatedBy'> = {
            id: newCertId,
            staffId: effectiveStaffId,
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
    if (!userAccount?.isAdmin) return;
    const baseList = type === 'aplikasi' ? applicationSkillOptions : knowledgeSkillOptions;
    setAdminEditListType(type);
    setAdminDraftList([...baseList]);
    setAdminNewSkillOption('');
    setAdminEditingIdx(null);
    setAdminEditingText('');
  };

  const handleSaveAdminDroplist = async () => {
    if (!userAccount?.isAdmin || !adminEditListType) return;
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
        systemName: sysSettings?.systemName || 'Sistem Pengurusan Modal Insan dan Kepakaran IAB',
        institutionName:
          sysSettings?.institutionName || 'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia',
        expertiseCategories: expertiseOptions,
        competencyCategories: Array.from(new Set([...nextApp, ...nextKnow])),
        applicationSkillCategories: nextApp,
        knowledgeSkillCategories: nextKnow,
        institutionCategories: institutionOptions,
        publicationYears: pubYearOptions,
        iabModules: iabModuleOptions,
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

  const openAdminCatalogModal = (kind: 'institutions' | 'pubYears') => {
    if (!userAccount?.isAdmin) return;
    setAdminCatalogModal(kind);
    setAdminCatalogDraft([...(kind === 'institutions' ? institutionOptions : pubYearOptions)]);
    setAdminCatalogNewItem('');
    setAdminCatalogEditIdx(null);
    setAdminCatalogEditText('');
  };

  const handleSaveAdminCatalog = async () => {
    if (!userAccount?.isAdmin || !adminCatalogModal) return;
    const cleaned = Array.from(new Set(adminCatalogDraft.map((s) => s.trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      showToast('error', 'Senarai pilihan mesti mengandungi sekurang-kurangnya satu item.');
      return;
    }
    setSavingAdminCatalog(true);
    try {
      await saveSystemSettings({
        systemName: sysSettings?.systemName || 'Sistem Pengurusan Modal Insan dan Kepakaran IAB',
        institutionName:
          sysSettings?.institutionName || 'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia',
        expertiseCategories: expertiseOptions,
        competencyCategories: Array.from(new Set([...applicationSkillOptions, ...knowledgeSkillOptions])),
        applicationSkillCategories: applicationSkillOptions,
        knowledgeSkillCategories: knowledgeSkillOptions,
        institutionCategories: adminCatalogModal === 'institutions' ? cleaned : institutionOptions,
        publicationYears: adminCatalogModal === 'pubYears' ? cleaned : pubYearOptions,
        iabModules: iabModuleOptions,
      });
      const updatedSettings = await getSystemSettings().catch(() => null);
      if (updatedSettings) setSysSettings(updatedSettings);
      await onSystemSettingsUpdated?.();
      showToast(
        'success',
        adminCatalogModal === 'institutions'
          ? 'Senarai Institusi berjaya dikemas kini.'
          : 'Senarai Tahun Penerbitan berjaya dikemas kini.'
      );
      setAdminCatalogModal(null);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan senarai pilihan.');
    } finally {
      setSavingAdminCatalog(false);
    }
  };

  const handleSaveQualification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qInst.trim() || !qField.trim() || !qYear.trim()) return;
    try {
      const targetUid = profile?.uid || (isOwnProfile ? userAccount?.uid : '') || '';
      const existingQual = editingQualId ? qualifications.find((q) => q.id === editingQualId) : null;
      await addOrUpdateQualification(
        {
          id: editingQualId || makeRecordId('QUAL'),
          staffId: effectiveStaffId,
          uid: targetUid,
          centerId,
          departmentId,
          level: qLevel,
          institution: qInst.trim(),
          fieldOfStudy: qField.trim(),
          graduationYear: qYear.trim(),
          notes: qNotes.trim(),
          status: 'active',
        },
        !editingQualId,
        Boolean(existingQual && existingQual.uid === '' && targetUid)
      );
      showToast('success', 'Kelayakan akademik disimpan.');
      setShowQualForm(false);
      setEditingQualId(null);
      setQInst('');
      setQField('');
      setQYear('');
      setQNotes('');
      await loadBundle();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan kelayakan akademik.');
    }
  };

  const handleSavePublication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pTitle.trim() || !pYear.trim()) return;
    try {
      const targetUid = profile?.uid || (isOwnProfile ? userAccount?.uid : '') || '';
      const existingPub = editingPubId ? publications.find((p) => p.id === editingPubId) : null;
      await addOrUpdatePublication(
        {
          id: editingPubId || makeRecordId('PUB'),
          staffId: effectiveStaffId,
          uid: targetUid,
          centerId,
          departmentId,
          type: pType,
          title: pTitle.trim(),
          publisherOrVenue: pVenue.trim(),
          year: pYear.trim(),
          achievement: pAchievement.trim() || 'Tidak Berkenaan',
          url: pUrl.trim(),
          description: pDesc.trim(),
          status: 'active',
        },
        !editingPubId,
        Boolean(existingPub && existingPub.uid === '' && targetUid)
      );
      showToast('success', 'Rekod penerbitan/penyelidikan disimpan.');
      setShowPubForm(false);
      setEditingPubId(null);
      setPTitle('');
      setPVenue('');
      setPYear('');
      setPAchievement('Tidak Berkenaan');
      setPUrl('');
      setPDesc('');
      await loadBundle();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan penerbitan.');
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-32 bg-white border border-slate-200 rounded-xl animate-pulse" />
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      </div>
    );
  }

  const hasGoogleLinked = firebaseUser?.providerData.some((p) => p.providerId === 'google.com');

  return (
    <div className="space-y-6">
      {targetStaffId && onClearTarget && (
        <div className="flex items-center justify-between bg-[#0B1F3B] text-white px-4 py-3 rounded-xl text-xs">
          <span>
            Sedang memaparkan profil pegawai: <strong>{fullName || targetStaffId}</strong> ({targetStaffId})
          </span>
          <button
            type="button"
            onClick={onClearTarget}
            className="px-3 py-1 bg-white/15 hover:bg-white/25 rounded-md font-semibold"
          >
            Kembali ke Profil Saya
          </button>
        </div>
      )}

      {/* Top Profile Summary & Completion Progress */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-center gap-4 min-w-0">
          <DriveImage
            driveFileId={photo?.displayDriveFileId || profile?.photoDisplayUrl}
            fullName={fullName || 'Pegawai IAB'}
            className="w-20 h-20 rounded-xl"
          />
          <div className="min-w-0 space-y-1">
            <h2 className="text-xl font-bold text-[#0B1F3B] truncate">
              {fullName || 'Profil Pegawai Baharu'}
            </h2>
            <p className="text-sm text-slate-600 truncate">
              {position || 'Jawatan belum diisi'}
              {grade ? ` (Hakiki: ${grade}${kupGrade && kupGrade !== 'TIDAK BERKENAAN' ? ` | KUP: ${kupGrade}` : ''})` : ''} · {selectedDept?.name || profile?.departmentName || 'Jabatan belum ditetapkan'}
            </p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-mono-tabular">{effectiveStaffId}</span>
              <span aria-hidden="true">·</span>
              <span>{officialEmail}</span>
              {isOwnProfile && !hasGoogleLinked && (
                <>
                  <span aria-hidden="true">·</span>
                  <button
                    type="button"
                    onClick={() => linkGoogleProviderToCurrentUser().then(() => showToast('success', 'Akaun Google berjaya dipautkan.')).catch((e) => showToast('error', e.message))}
                    className="inline-flex items-center gap-1 text-[#0B1F3B] font-semibold underline hover:text-[#9D741E]"
                  >
                    <Link2 className="w-3 h-3" /> Pautkan Google Sign-In
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Completion Meter & Mode Controls */}
        <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end gap-4 shrink-0">
          <div className="w-full sm:w-64">
            <div className="flex items-center justify-between text-xs font-semibold mb-1.5">
              <span className="text-slate-600">Kelengkapan Profil</span>
              <span className="font-mono-tabular text-[#0B1F3B]">{liveCompletion.completionPercent}%</span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-[#C69738] transition-all duration-300"
                style={{ width: `${liveCompletion.completionPercent}%` }}
              />
            </div>
            {liveCompletion.missingSections.length > 0 && (
              <p className="text-[11px] text-amber-700 mt-1.5">
                Belum lengkap: {liveCompletion.missingSections.slice(0, 3).join(', ')}
                {liveCompletion.missingSections.length > 3
                  ? ` (+${liveCompletion.missingSections.length - 3} lagi)`
                  : ''}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setMode('view')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${
                  mode === 'view' ? 'bg-white text-[#0B1F3B] shadow-sm' : 'text-slate-600'
                }`}
              >
                <Eye className="w-3.5 h-3.5" /> Lihat
              </button>
              <button
                type="button"
                onClick={() => setMode('preview')}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${
                  mode === 'preview' ? 'bg-white text-[#0B1F3B] shadow-sm' : 'text-slate-600'
                }`}
              >
                Pratonton
              </button>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => setMode('edit')}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-md ${
                    mode === 'edit' ? 'bg-white text-[#0B1F3B] shadow-sm' : 'text-slate-600'
                  }`}
                >
                  <Edit3 className="w-3.5 h-3.5" /> Kemas Kini
                </button>
              )}
            </div>

            {canEdit && mode === 'edit' && (
              <>
                <button
                  type="button"
                  onClick={() => {
                    loadBundle();
                    setMode('view');
                  }}
                  className="px-3 py-2 text-xs font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
                >
                  Batal
                </button>
                <button
                  type="button"
                  onClick={handleSaveAll}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  {saving ? 'Menyimpan...' : 'Simpan Profil'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Preview Profile Card Mode */}
      {mode === 'preview' ? (
        <div className="bg-white border border-slate-200 rounded-xl p-8 max-w-4xl mx-auto space-y-6">
          <div className="flex items-start justify-between border-b border-slate-200 pb-6 gap-4">
            <div className="flex items-center gap-5">
              <DriveImage
                driveFileId={photo?.displayDriveFileId || profile?.photoDisplayUrl}
                fullName={fullName}
                className="w-24 h-24 rounded-xl"
              />
              <div>
                <p className="text-xs font-semibold text-[#9D741E] uppercase tracking-wider">
                  Pratonton Profil Rasmi IAB
                </p>
                <h3 className="text-2xl font-bold text-[#0B1F3B] mt-1">{fullName}</h3>
                <p className="text-sm text-slate-600">
                  {position || '-'} (Hakiki: {grade || '-'}{kupGrade && kupGrade !== 'TIDAK BERKENAAN' ? ` | KUP: ${kupGrade}` : ''}) · {selectedDept?.name || '-'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{selectedCenter?.name || '-'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-2">
              <h4 className="font-bold text-[#0B1F3B]">Maklumat Perkhidmatan & Hubungan</h4>
              <p className="text-slate-600">Gred Hakiki: {grade || '-'} · Gred KUP: {kupGrade || 'TIDAK BERKENAAN'}</p>
              <p className="text-slate-600">Skim: {scheme || '-'}</p>
              <p className="text-slate-600">Status Perkhidmatan: {serviceStatus || '-'} ({yearsOfService} tahun)</p>
              <p className="text-slate-600">Telefon: {phone || 'Terhad / Belum diisi'}</p>
              <p className="text-slate-600">Emel Rasmi: {officialEmail}</p>
            </div>
            <div className="space-y-2">
              <h4 className="font-bold text-[#0B1F3B]">Kepakaran & Kompetensi AI/Digital</h4>
              <p className="text-slate-600">Kepakaran Utama: {primaryExpertise || 'Belum diisi'}</p>
              <p className="text-slate-600">Kepakaran Kedua: {secondaryExpertise || '-'}</p>
              <p className="text-slate-600">
                Kemahiran Aplikasi: {indexedAppCompetencies.map(({ item }) => `${item.categoryName} (${item.level})`).join(', ') || 'Belum diisi'}
              </p>
              <p className="text-slate-600">
                Kemahiran Pengetahuan: {indexedKnowCompetencies.map(({ item }) => `${item.categoryName} (${item.level})`).join(', ') || 'Belum diisi'}
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-[#0B1F3B] text-sm mb-2">D. Kelayakan Akademik ({sortedQualifications.length})</h4>
            {sortedQualifications.length === 0 ? (
              <p className="text-xs text-slate-500">Tiada rekod kelayakan akademik.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700">
                {sortedQualifications.map((q, idx) => (
                  <li key={q.id}>
                    {idx + 1}. <strong>{q.level}</strong> — {q.fieldOfStudy}, {q.institution} ({q.graduationYear})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="font-bold text-[#0B1F3B] text-sm mb-2">H. Penerbitan & Penyelidikan ({sortedPublications.length})</h4>
            {sortedPublications.length === 0 ? (
              <p className="text-xs text-slate-500">Tiada rekod penerbitan.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700">
                {sortedPublications.map((p, idx) => (
                  <li key={p.id}>
                    {idx + 1}. [{p.type}] {p.title} ({p.year}) — Pencapaian: {p.achievement || 'Tidak Berkenaan'}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Section Navigation Tabs */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
            {(
              [
                ['A_C', 'A–C. Biodata, Perkhidmatan & Organisasi'],
                ['D', 'D. Kelayakan Akademik'],
                ['E_G', 'E & G. Kepakaran & Pengalaman'],
                ['F', 'F. Kompetensi Digital & AI'],
                ['H', 'H. Penerbitan & Penyelidikan'],
                ['I_J', 'I & J. Gambar & Sijil'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                className={`px-3.5 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === key
                    ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-6">
            {/* TAB A-C */}
            {activeTab === 'A_C' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-1">A. Maklumat Peribadi</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Maklumat sensitif (no. telefon & no. KP) diasingkan ke storan PII terhad dan hanya boleh dilihat oleh pemilik, Ketua Jabatan/Pusat dalam skop, dan Admin.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Penuh *</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Emel Rasmi *</label>
                      <input
                        type="email"
                        disabled={!canEdit || mode !== 'edit'}
                        value={officialEmail}
                        onChange={(e) => setOfficialEmail(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Nombor Telefon</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="01X-XXXXXXX"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jantina</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={gender}
                        onChange={(e) => setGender(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih --</option>
                        <option value="Lelaki">Lelaki</option>
                        <option value="Perempuan">Perempuan</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        No. Kad Pengenalan (Akses Terhad)
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={icNumber}
                        onChange={(e) => setIcNumber(e.target.value)}
                        placeholder="Pilihan / Jika diperlukan"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Maklumat Hubungan Lain</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={altContact}
                        onChange={(e) => setAltContact(e.target.value)}
                        placeholder="Sambungan pejabat / Bilik"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nama Ketua Jabatan (Autofill)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={resolvedHeadOfDepartment}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Diambil daripada pangkalan data jabatan (tidak boleh diedit).
                      </p>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nama Ketua Pusat (Autofill)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={resolvedHeadOfCenter}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Diambil daripada pangkalan data pusat (tidak boleh diedit).
                      </p>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-4">B. Maklumat Perkhidmatan</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jawatan</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Jawatan --</option>
                        {position && !SERVICE_POSITIONS.includes(position) && (
                          <option value={position}>{position}</option>
                        )}
                        {SERVICE_POSITIONS.map((pos) => (
                          <option key={pos} value={pos}>
                            {pos}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Gred Hakiki</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Gred Hakiki --</option>
                        {grade && !SERVICE_GRADES_HAKIKI.includes(grade) && (
                          <option value={grade}>{grade}</option>
                        )}
                        {SERVICE_GRADES_HAKIKI.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Gred KUP</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={kupGrade}
                        onChange={(e) => setKupGrade(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                      >
                        {kupGrade && !SERVICE_GRADES_KUP.includes(kupGrade) && (
                          <option value={kupGrade}>{kupGrade}</option>
                        )}
                        {SERVICE_GRADES_KUP.map((g) => (
                          <option key={g} value={g}>
                            {g}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Skim Perkhidmatan</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={scheme}
                        onChange={(e) => setScheme(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Tarikh Lantikan</label>
                      <input
                        type="date"
                        disabled={!canEdit || mode !== 'edit'}
                        value={appointmentDate}
                        onChange={(e) => setAppointmentDate(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Status Perkhidmatan</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={serviceStatus}
                        onChange={(e) => setServiceStatus(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="Tetap">Tetap</option>
                        <option value="Kontrak">Kontrak</option>
                        <option value="Pinjaman">Pinjaman / Kader</option>
                        <option value="Cuti Belajar">Cuti Belajar</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pengalaman Perkhidmatan (Tahun)</label>
                      <input
                        type="number"
                        min={0}
                        max={60}
                        disabled={!canEdit || mode !== 'edit'}
                        value={yearsOfService}
                        onChange={(e) => setYearsOfService(Number(e.target.value))}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50 font-mono-tabular"
                      />
                    </div>
                    <div className="sm:col-span-2 lg:col-span-3 flex items-center gap-3 pt-1">
                      <input
                        id="isLecturerCheck"
                        type="checkbox"
                        disabled={!canEdit || mode !== 'edit'}
                        checked={isLecturer}
                        onChange={(e) => setIsLecturer(e.target.checked)}
                        className="w-4 h-4 accent-[#0B1F3B]"
                      />
                      <label htmlFor="isLecturerCheck" className="text-sm text-slate-700">
                        Pegawai merupakan Pensyarah / Tenaga Pengajar IAB
                      </label>
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-4">C. Maklumat Organisasi</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={centerId}
                        onChange={(e) => {
                          setCenterId(e.target.value);
                          setDepartmentId('');
                        }}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Pusat --</option>
                        {organizations.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={departmentId}
                        onChange={(e) => setDepartmentId(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Jabatan --</option>
                        {filteredDepts.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Unit</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={unit}
                        onChange={(e) => setUnit(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jawatan Organisasi</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={orgPosition}
                        onChange={(e) => setOrgPosition(e.target.value)}
                        placeholder="Contoh: Penyelaras Program"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ketua Pusat (Autofill)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={resolvedHeadOfCenter}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Ketua Jabatan (Autofill)
                      </label>
                      <input
                        type="text"
                        readOnly
                        disabled
                        value={resolvedHeadOfDepartment}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB D: KELAYAKAN AKADEMIK */}
            {activeTab === 'D' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3B]">D. Kelayakan Akademik</h3>
                    <p className="text-xs text-slate-500">
                      Disusun bermula daripada kelayakan akademik tertinggi (PhD ke Diploma / Lain-lain).
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {userAccount?.isAdmin && canEdit && mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => openAdminCatalogModal('institutions')}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                      >
                        <Settings className="w-3.5 h-3.5" /> Edit Senarai Institusi (Admin)
                      </button>
                    )}
                    {canEdit && mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingQualId(null);
                          setQLevel('PhD');
                          setQInst(institutionOptions[0] || '');
                          setQField('');
                          setQYear('');
                          setQNotes('');
                          setShowQualForm(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Kelayakan
                      </button>
                    )}
                  </div>
                </div>

                {sortedQualifications.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <GraduationCap className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Tiada kelayakan akademik direkodkan</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-4 w-14">Bil.</th>
                            <th className="py-2.5 px-4 w-36">TAHAP</th>
                            <th className="py-2.5 px-4">INSTITUSI</th>
                            <th className="py-2.5 px-4">BIDANG PENGAJIAN</th>
                            <th className="py-2.5 px-4 w-32">TAHUN TAMAT</th>
                            {canEdit && mode === 'edit' && (
                              <th className="py-2.5 px-4 text-right w-32">Tindakan</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                          {sortedQualifications.map((q, idx) => (
                            <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                                {idx + 1}.
                              </td>
                              <td className="py-3 px-4 font-bold text-[#0B1F3B] whitespace-nowrap align-top">
                                {q.level}
                              </td>
                              <td className="py-3 px-4 text-slate-800 font-medium align-top">
                                {q.institution}
                              </td>
                              <td className="py-3 px-4 align-top">
                                <div className="text-slate-800 font-medium">{q.fieldOfStudy}</div>
                                {q.notes && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{q.notes}</p>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap align-top">
                                {q.graduationYear}
                              </td>
                              {canEdit && mode === 'edit' && (
                                <td className="py-3 px-4 text-right align-top">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingQualId(q.id);
                                        setQLevel(q.level);
                                        setQInst(q.institution);
                                        setQField(q.fieldOfStudy);
                                        setQYear(q.graduationYear);
                                        setQNotes(q.notes || '');
                                        setShowQualForm(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                      title="Edit"
                                    >
                                      <Edit3 className="w-3 h-3" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingQual(q)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                      title="Padam"
                                    >
                                      <Trash2 className="w-3 h-3" /> Padam
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB E & G: KEPAKARAN & PENGALAMAN */}
            {activeTab === 'E_G' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-1">E. Kepakaran Pegawai</h3>
                  <p className="text-xs text-slate-500 mb-4">
                    Pilih kategori kepakaran piawai kawalan Admin supaya carian direktori dan analitik kapasiti kekal seragam.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Kepakaran Utama *</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={primaryExpertise}
                        onChange={(e) => setPrimaryExpertise(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Kepakaran Utama --</option>
                        {expertiseOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Kepakaran Kedua</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={secondaryExpertise}
                        onChange={(e) => setSecondaryExpertise(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Kepakaran Kedua --</option>
                        {expertiseOptions.map((cat) => (
                          <option key={cat} value={cat}>
                            {cat}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kepakaran Khusus (pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={specializationsText}
                        onChange={(e) => setSpecializationsText(e.target.value)}
                        placeholder="NPQEL, Kepimpinan Instruksional"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bidang Penyelidikan (pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={researchAreasText}
                        onChange={(e) => setResearchAreasText(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bidang Pengajaran (pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={teachingAreasText}
                        onChange={(e) => setTeachingAreasText(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Bidang Latihan Yang Boleh Dikendalikan
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={trainingAreasText}
                        onChange={(e) => setTrainingAreasText(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Kata Kunci Kepakaran untuk Carian Direktori (pisahkan dengan koma)
                      </label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={keywordsText}
                        onChange={(e) => setKeywordsText(e.target.value)}
                        placeholder="GenAI, Analitik Data, Pengurusan Sekolah, Coaching"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-4">G. Pengalaman dan Sumbangan</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {(
                      [
                        ['Pengalaman Mengajar', teachingExp, setTeachingExp],
                        ['Pengalaman Pengurusan', managementExp, setManagementExp],
                        ['Pengalaman sebagai Fasilitator', facilitatorExp, setFacilitatorExp],
                        ['Pengalaman sebagai Penceramah', speakerExp, setSpeakerExp],
                        ['Pengalaman sebagai Jurulatih / Coach', coachExp, setCoachExp],
                        ['Pengalaman Projek', projectExp, setProjectExp],
                        ['Pengalaman Profesional Keseluruhan', professionalExp, setProfessionalExp],
                      ] as const
                    ).map(([label, val, setter]) => (
                      <div key={label} className={label.includes('Keseluruhan') ? 'md:col-span-2' : ''}>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">{label}</label>
                        <textarea
                          rows={2}
                          disabled={!canEdit || mode !== 'edit'}
                          value={val}
                          onChange={(e) => setter(e.target.value)}
                          className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB F: KOMPETENSI DIGITAL DAN AI */}
            {activeTab === 'F' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">F. Kompetensi Digital dan AI</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Senarai kemahiran aplikasi dan kemahiran pengetahuan digital/AI yang dikuasai bersama tahap penguasaan, tahun pengalaman dan status sijil kursus.
                  </p>
                </div>

                {/* SECTION 1: KEMAHIRAN APLIKASI (TABLE) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[#0B1F3B] tracking-wide uppercase">
                        KEMAHIRAN APLIKASI
                      </h4>
                      <span className="text-xs font-mono-tabular text-slate-500">
                        ({indexedAppCompetencies.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {userAccount?.isAdmin && canEdit && mode === 'edit' && (
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
                            {canEdit && mode === 'edit' && (
                              <th className="py-2.5 px-4 text-right w-40">Tindakan</th>
                            )}
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
                                {canEdit && mode === 'edit' && (
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

                  {canEdit && mode === 'edit' && (
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

                {/* SECTION 2: KEMAHIRAN PENGETAHUAN (TABLE) */}
                <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold text-[#0B1F3B] tracking-wide uppercase">
                        KEMAHIRAN PENGETAHUAN
                      </h4>
                      <span className="text-xs font-mono-tabular text-slate-500">
                        ({indexedKnowCompetencies.length})
                      </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {userAccount?.isAdmin && canEdit && mode === 'edit' && (
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
                            {canEdit && mode === 'edit' && (
                              <th className="py-2.5 px-4 text-right w-40">Tindakan</th>
                            )}
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
                                {canEdit && mode === 'edit' && (
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

                  {canEdit && mode === 'edit' && (
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

            {/* TAB H: PENERBITAN & PENYELIDIKAN */}
            {activeTab === 'H' && (
              <div className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3B]">H. Penerbitan dan Penyelidikan</h3>
                    <p className="text-xs text-slate-500">
                      Rekod dengan Pencapaian dipaparkan di bahagian atas secara lalai. Klik tajuk lajur jadual untuk susunan.
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    {pubSort.key !== 'default' && (
                      <button
                        type="button"
                        onClick={() => setPubSort({ key: 'default', dir: 'asc' })}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                      >
                        Reset Susunan Lalai
                      </button>
                    )}
                    {userAccount?.isAdmin && canEdit && mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => openAdminCatalogModal('pubYears')}
                        className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
                      >
                        <Settings className="w-3.5 h-3.5" /> Edit Senarai Tahun (Admin)
                      </button>
                    )}
                    {canEdit && mode === 'edit' && (
                      <button
                        type="button"
                        onClick={() => {
                          setEditingPubId(null);
                          setPType('Inovasi');
                          setPTitle('');
                          setPVenue('');
                          setPYear(pubYearOptions[pubYearOptions.length - 1] || '2025');
                          setPAchievement('Tidak Berkenaan');
                          setPUrl('');
                          setPDesc('');
                          setShowPubForm(true);
                        }}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                      >
                        <Plus className="w-3.5 h-3.5" /> Tambah Rekod
                      </button>
                    )}
                  </div>
                </div>

                {sortedPublications.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Tiada penerbitan atau inovasi direkodkan</p>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                            <th className="py-2.5 px-4 w-12">Bil.</th>
                            {(
                              [
                                ['type', 'Kategori'],
                                ['title', 'Tajuk'],
                                ['year', 'Tahun'],
                                ['achievement', 'Pencapaian'],
                              ] as const
                            ).map(([colKey, label]) => {
                              const active = pubSort.key === colKey;
                              const SortIcon = !active
                                ? ArrowUpDown
                                : pubSort.dir === 'asc'
                                ? ArrowUp
                                : ArrowDown;
                              return (
                                <th key={colKey} className="py-2.5 px-4">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setPubSort((prev) =>
                                        prev.key === colKey
                                          ? { key: colKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                                          : { key: colKey, dir: colKey === 'year' || colKey === 'achievement' ? 'desc' : 'asc' }
                                      )
                                    }
                                    className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-[#0B1F3B] ${
                                      active ? 'text-[#0B1F3B]' : 'text-slate-500'
                                    }`}
                                  >
                                    {label}
                                    <SortIcon className="w-3 h-3" />
                                  </button>
                                </th>
                              );
                            })}
                            <th className="py-2.5 px-4">Pautan Penerbitan (URL)</th>
                            {canEdit && mode === 'edit' && (
                              <th className="py-2.5 px-4 text-right w-32">Tindakan</th>
                            )}
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                          {sortedPublications.map((p, idx) => (
                            <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                              <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                                {idx + 1}.
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#9D741E] whitespace-nowrap align-top">
                                {p.type}
                              </td>
                              <td className="py-3 px-4 align-top">
                                <div className="font-bold text-[#0B1F3B]">{p.title}</div>
                                {p.publisherOrVenue && (
                                  <p className="text-[11px] text-slate-500 mt-0.5">{p.publisherOrVenue}</p>
                                )}
                              </td>
                              <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap align-top">
                                {p.year}
                              </td>
                              <td className="py-3 px-4 align-top">
                                {hasValidAchievement(p.achievement) ? (
                                  <span className="font-semibold text-emerald-800">{p.achievement}</span>
                                ) : (
                                  <span className="text-slate-500">Tidak Berkenaan</span>
                                )}
                              </td>
                              <td className="py-3 px-4 align-top">
                                {p.url ? (
                                  <a
                                    href={p.url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] underline hover:text-[#9D741E]"
                                  >
                                    Pautan <ExternalLink className="w-3 h-3" />
                                  </a>
                                ) : (
                                  <span className="text-slate-500">Tidak Berkenaan</span>
                                )}
                              </td>
                              {canEdit && mode === 'edit' && (
                                <td className="py-3 px-4 text-right align-top">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingPubId(p.id);
                                        setPType(p.type);
                                        setPTitle(p.title);
                                        setPVenue(p.publisherOrVenue || '');
                                        setPYear(p.year);
                                        setPAchievement(p.achievement || 'Tidak Berkenaan');
                                        setPUrl(p.url || '');
                                        setPDesc(p.description || '');
                                        setShowPubForm(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                    >
                                      <Edit3 className="w-3 h-3" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setDeletingPub(p)}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                    >
                                      <Trash2 className="w-3 h-3" /> Padam
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB I & J: GAMBAR PEGAWAI & SIJIL */}
            {activeTab === 'I_J' && (
              <div className="space-y-8">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 border-b border-slate-200">
                  <div className="flex items-center gap-4">
                    <DriveImage
                      driveFileId={photo?.displayDriveFileId || profile?.photoDisplayUrl}
                      fullName={fullName || 'Pegawai'}
                      className="w-24 h-24 rounded-xl"
                    />
                    <div>
                      <h3 className="text-base font-bold text-[#0B1F3B]">I. Gambar Pegawai (Nisbah 1:1)</h3>
                      <p className="text-xs text-slate-500 mt-1 max-w-md">
                        Gambar asal disimpan secara kekal tanpa perubahan. Gambar paparan 1:1 boleh di-crop, dizum dan dilaras kedudukannya.
                      </p>
                      {photo && (
                        <p className="text-xs text-emerald-700 mt-1.5 font-mono-tabular">
                          Zum: {photo.zoom}x · Jajaran: {photo.alignX}/{photo.alignY}
                        </p>
                      )}
                    </div>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => setPhotoModalOpen(true)}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg shrink-0"
                    >
                      <Camera className="w-4 h-4" />
                      {photo ? 'Ubah / Laras Gambar' : 'Muat Naik Gambar'}
                    </button>
                  )}
                </div>

                <CertificateManager
                  staffId={effectiveStaffId}
                  staffName={fullName || userAccount?.displayName || ''}
                  staffEmail={officialEmail || userAccount?.email || ''}
                  uid={profile?.uid || userAccount?.uid || ''}
                  centerId={centerId}
                  departmentId={departmentId}
                  certificates={certificates}
                  canEdit={canEdit}
                  onChanged={loadBundle}
                />
              </div>
            )}
          </div>
        </>
      )}

      <PhotoEditorModal
        open={photoModalOpen}
        staffId={effectiveStaffId}
        staffName={fullName || userAccount?.displayName || ''}
        staffEmail={officialEmail || userAccount?.email || ''}
        uid={profile?.uid || userAccount?.uid || ''}
        centerId={centerId}
        departmentId={departmentId}
        existingPhoto={photo}
        onClose={() => setPhotoModalOpen(false)}
        onSaved={loadBundle}
      />

      <ConfirmDialog
        open={Boolean(deletingQual)}
        title="Padam Kelayakan Akademik"
        description={`Sahkan pemadaman rekod "${deletingQual?.level || ''} — ${deletingQual?.fieldOfStudy || ''}"?`}
        confirmLabel="Padam"
        onConfirm={async () => {
          if (!deletingQual) return;
          await deleteQualification(deletingQual.id, effectiveStaffId);
          showToast('success', 'Kelayakan akademik dipadam.');
          setDeletingQual(null);
          await loadBundle();
        }}
        onCancel={() => setDeletingQual(null)}
      />

      <ConfirmDialog
        open={Boolean(deletingPub)}
        title="Padam Rekod Penerbitan"
        description={`Sahkan pemadaman rekod "${deletingPub?.title || ''}"?`}
        confirmLabel="Padam"
        onConfirm={async () => {
          if (!deletingPub) return;
          await deletePublication(deletingPub.id, effectiveStaffId);
          showToast('success', 'Rekod penerbitan dipadam.');
          setDeletingPub(null);
          await loadBundle();
        }}
        onCancel={() => setDeletingPub(null)}
      />

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

      {/* Popup Modal: Add / Edit Competency (Tab F) */}
      {compFormOpen && canEdit && mode === 'edit' && (
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
                        ...(compFormType === 'aplikasi' ? applicationSkillOptions : knowledgeSkillOptions),
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahap Penguasaan *</label>
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
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Pengalaman *</label>
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
                        <strong>Nota Storan Google Drive:</strong> Sambungan Google Drive sistem belum diaktifkan oleh Pentadbir. Anda masih boleh memilih <strong>Ada</strong> dan klik <strong>Simpan Kompetensi</strong> tanpa melampirkan fail sekarang (rekod disimpan sebagai <em>Ada, belum muat naik</em>).
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

      {/* Popup Modal: Admin-only Droplist Editor (Tab F) */}
      {userAccount?.isAdmin && adminEditListType && (
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
                  {adminEditListType === 'aplikasi' ? 'KEMAHIRAN APLIKASI' : 'KEMAHIRAN PENGETAHUAN'}
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

      {/* Popup Modal: Add / Edit Qualification (Tab D) */}
      {showQualForm && canEdit && mode === 'edit' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowQualForm(false)}
        >
          <form
            onSubmit={handleSaveQualification}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingQualId ? 'Kemas Kini Kelayakan Akademik' : 'Tambah Kelayakan Akademik'}
              </h4>
              <button
                type="button"
                onClick={() => setShowQualForm(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang kelayakan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahap *</label>
                  <select
                    value={qLevel}
                    onChange={(e) => setQLevel(e.target.value as QualificationLevel)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {QUALIFICATION_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Tamat *</label>
                  <input
                    type="text"
                    required
                    value={qYear}
                    onChange={(e) => setQYear(e.target.value)}
                    placeholder="2020"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Institusi *</label>
                  <select
                    required
                    value={qInst}
                    onChange={(e) => setQInst(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Pilih Institusi --</option>
                    {qInst && !institutionOptions.includes(qInst) && (
                      <option value={qInst}>{qInst}</option>
                    )}
                    {institutionOptions.map((inst) => (
                      <option key={inst} value={inst}>
                        {inst}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bidang Pengajian *</label>
                  <input
                    type="text"
                    required
                    value={qField}
                    onChange={(e) => setQField(e.target.value)}
                    placeholder="SAINS KOMPUTER / KEPIMPINAN PENDIDIKAN"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Maklumat Berkaitan</label>
                  <input
                    type="text"
                    value={qNotes}
                    onChange={(e) => setQNotes(e.target.value)}
                    placeholder="Tajuk tesis atau pengkhususan (pilihan)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowQualForm(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Kelayakan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup Modal: Add / Edit Publication (Tab H) */}
      {showPubForm && canEdit && mode === 'edit' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowPubForm(false)}
        >
          <form
            onSubmit={handleSavePublication}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingPubId ? 'Kemas Kini Penerbitan & Penyelidikan' : 'Tambah Penerbitan & Penyelidikan'}
              </h4>
              <button
                type="button"
                onClick={() => setShowPubForm(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang penerbitan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={pType}
                    onChange={(e) => setPType(e.target.value as PublicationType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {PUBLICATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={pYear}
                    onChange={(e) => setPYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {pYear && !pubYearOptions.includes(pYear) && (
                      <option value={pYear}>{pYear}</option>
                    )}
                    {pubYearOptions.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tajuk *</label>
                  <input
                    type="text"
                    required
                    value={pTitle}
                    onChange={(e) => setPTitle(e.target.value)}
                    placeholder="cth: Robot AI dalam Pengurusan Sekolah"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pencapaian</label>
                  <input
                    type="text"
                    value={pAchievement}
                    onChange={(e) => setPAchievement(e.target.value)}
                    placeholder="cth: Pingat Emas / Tidak Berkenaan"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Penerbit / Persidangan</label>
                  <input
                    type="text"
                    value={pVenue}
                    onChange={(e) => setPVenue(e.target.value)}
                    placeholder="cth: Jurnal IAB / Seminar Kebangsaan"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pautan Penerbitan (URL)</label>
                  <input
                    type="url"
                    value={pUrl}
                    onChange={(e) => setPUrl(e.target.value)}
                    placeholder="https://... (biarkan kosong jika Tidak Berkenaan)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowPubForm(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Save className="w-3.5 h-3.5" />
                Simpan Penerbitan
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Popup Modal: Admin-only Catalog Editor for Tab D (Institutions) & Tab H (Years) */}
      {userAccount?.isAdmin && adminCatalogModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingAdminCatalog) setAdminCatalogModal(null);
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
                  {adminCatalogModal === 'institutions' ? 'SENARAI INSTITUSI' : 'SENARAI TAHUN PENERBITAN'}
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Hanya pentadbir sistem dibenarkan menambah, mengubah atau memadam pilihan dalam droplist ini.
                </p>
              </div>
              <button
                type="button"
                disabled={savingAdminCatalog}
                onClick={() => setAdminCatalogModal(null)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup editor senarai"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={adminCatalogNewItem}
                  onChange={(e) => setAdminCatalogNewItem(e.target.value)}
                  placeholder={
                    adminCatalogModal === 'institutions'
                      ? 'Tambah nama institusi baharu (cth: UMP / Universiti Luar Negara)...'
                      : 'Tambah tahun baharu (cth: 2031)...'
                  }
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = adminCatalogNewItem.trim();
                    if (!v || adminCatalogDraft.includes(v)) return;
                    setAdminCatalogDraft([...adminCatalogDraft, v]);
                    setAdminCatalogNewItem('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  Tambah Pilihan
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {adminCatalogDraft.map((opt, i) => (
                  <div
                    key={`${opt}-${i}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {adminCatalogEditIdx === i ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={adminCatalogEditText}
                          onChange={(e) => setAdminCatalogEditText(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = adminCatalogEditText.trim();
                            if (!v) return;
                            setAdminCatalogDraft(adminCatalogDraft.map((x, idx) => (idx === i ? v : x)));
                            setAdminCatalogEditIdx(null);
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
                          setAdminCatalogEditIdx(i);
                          setAdminCatalogEditText(opt);
                        }}
                        className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setAdminCatalogDraft(adminCatalogDraft.filter((_, idx) => idx !== i))}
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
                disabled={savingAdminCatalog}
                onClick={() => setAdminCatalogModal(null)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={savingAdminCatalog}
                onClick={handleSaveAdminCatalog}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingAdminCatalog ? 'Menyimpan...' : 'Simpan Senarai Pilihan'}
              </button>
            </div>
          </div>
        </div>
      )}

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
