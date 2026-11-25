import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  BookOpen,
  Camera,
  CheckCircle2,
  Edit3,
  Eye,
  GraduationCap,
  Link2,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { CertificateManager } from '../components/CertificateManager';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { DriveImage } from '../components/DriveImage';
import { PhotoEditorModal } from '../components/PhotoEditorModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import {
  COMMON_GRADES,
  COMPETENCY_LEVELS,
  DEFAULT_COMPETENCY_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  PUBLICATION_TYPES,
  QUALIFICATION_LEVELS,
  computeProfileCompletion,
} from '../lib/constants';
import {
  addOrUpdatePublication,
  addOrUpdateQualification,
  deletePublication,
  deleteQualification,
  getStaffProfileBundle,
  getSystemSettings,
  makeRecordId,
  saveFullStaffProfile,
} from '../services/firestoreService';
import type {
  Certificate,
  CompetencyItem,
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

export const StaffProfilePage: React.FC<StaffProfilePageProps> = ({
  targetStaffId,
  organizations,
  departments,
  onClearTarget,
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
  const [pUrl, setPUrl] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [deletingPub, setDeletingPub] = useState<Publication | null>(null);

  const expertiseOptions = sysSettings?.expertiseCategories?.length
    ? sysSettings.expertiseCategories
    : DEFAULT_EXPERTISE_CATEGORIES;
  const competencyOptions = sysSettings?.competencyCategories?.length
    ? sysSettings.competencyCategories
    : DEFAULT_COMPETENCY_CATEGORIES;

  const loadBundle = async () => {
    if (!effectiveStaffId || !userAccount) return;
    setLoading(true);
    try {
      const [bundle, settings] = await Promise.all([
        getStaffProfileBundle(effectiveStaffId),
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

  const filteredDepts = useMemo(
    () => departments.filter((d) => !centerId || d.centerId === centerId),
    [departments, centerId]
  );

  const selectedCenter = organizations.find((c) => c.id === centerId);
  const selectedDept = departments.find((d) => d.id === departmentId);

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
    if (!fullName.trim() || !officialEmail.trim()) {
      showToast('error', 'Nama penuh dan emel rasmi wajib diisi.');
      return;
    }

    setSaving(true);
    try {
      const targetUid = profile?.uid || (isOwnProfile ? userAccount.uid : '');
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
          scheme: scheme.trim(),
          isLecturer,
          centerId,
          centerName,
          departmentId,
          departmentName,
          unit: unit.trim(),
          orgPosition: orgPosition.trim(),
          headOfCenter: headOfCenter.trim() || selectedCenter?.headName || '',
          headOfDepartment: headOfDepartment.trim() || selectedDept?.headName || '',
          highestQualification: profile?.highestQualification || '',
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

  const toggleCompetency = (categoryName: string) => {
    if (!canEdit || mode !== 'edit') return;
    setCompetencyItems((prev) => {
      const exists = prev.find((i) => i.categoryName === categoryName);
      if (exists) return prev.filter((i) => i.categoryName !== categoryName);
      return [
        ...prev,
        {
          categoryId: categoryName.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
          categoryName,
          level: 'Pertengahan',
          years: 1,
          notes: '',
        },
      ];
    });
  };

  const updateCompetencyDetail = (
    categoryName: string,
    patch: Partial<Pick<CompetencyItem, 'level' | 'years' | 'notes'>>
  ) => {
    setCompetencyItems((prev) =>
      prev.map((i) => (i.categoryName === categoryName ? { ...i, ...patch } : i))
    );
  };

  const handleSaveQualification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!qInst.trim() || !qField.trim() || !qYear.trim()) return;
    try {
      const targetUid = profile?.uid || userAccount?.uid || '';
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
        !editingQualId
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
      const targetUid = profile?.uid || userAccount?.uid || '';
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
          url: pUrl.trim(),
          description: pDesc.trim(),
          status: 'active',
        },
        !editingPubId
      );
      showToast('success', 'Rekod penerbitan/penyelidikan disimpan.');
      setShowPubForm(false);
      setEditingPubId(null);
      setPTitle('');
      setPVenue('');
      setPYear('');
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
              {grade ? ` (${grade})` : ''} · {selectedDept?.name || profile?.departmentName || 'Jabatan belum ditetapkan'}
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
                  {position || '-'} ({grade || '-'}) · {selectedDept?.name || '-'}
                </p>
                <p className="text-xs text-slate-500 mt-1">{selectedCenter?.name || '-'}</p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-sm">
            <div className="space-y-2">
              <h4 className="font-bold text-[#0B1F3B]">Maklumat Perkhidmatan & Hubungan</h4>
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
                Kompetensi: {competencyItems.map((c) => `${c.categoryName} (${c.level})`).join(', ') || 'Belum diisi'}
              </p>
            </div>
          </div>

          <div>
            <h4 className="font-bold text-[#0B1F3B] text-sm mb-2">Kelayakan Akademik ({qualifications.length})</h4>
            {qualifications.length === 0 ? (
              <p className="text-xs text-slate-500">Tiada rekod kelayakan akademik.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700 list-disc list-inside">
                {qualifications.map((q) => (
                  <li key={q.id}>
                    <strong>{q.level}</strong> — {q.fieldOfStudy}, {q.institution} ({q.graduationYear})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div>
            <h4 className="font-bold text-[#0B1F3B] text-sm mb-2">Penerbitan & Penyelidikan ({publications.length})</h4>
            {publications.length === 0 ? (
              <p className="text-xs text-slate-500">Tiada rekod penerbitan.</p>
            ) : (
              <ul className="space-y-1 text-sm text-slate-700 list-disc list-inside">
                {publications.map((p) => (
                  <li key={p.id}>
                    [{p.type}] {p.title} ({p.year})
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
                  </div>
                </div>

                <div className="border-t border-slate-200 pt-6">
                  <h3 className="text-base font-bold text-[#0B1F3B] mb-4">B. Maklumat Perkhidmatan</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Jawatan</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={position}
                        onChange={(e) => setPosition(e.target.value)}
                        placeholder="Contoh: Pensyarah Kanan"
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Gred Jawatan</label>
                      <select
                        disabled={!canEdit || mode !== 'edit'}
                        value={grade}
                        onChange={(e) => setGrade(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      >
                        <option value="">-- Pilih Gred --</option>
                        {COMMON_GRADES.map((g) => (
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
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Ketua Pusat</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={headOfCenter || selectedCenter?.headName || ''}
                        onChange={(e) => setHeadOfCenter(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Ketua Jabatan</label>
                      <input
                        type="text"
                        disabled={!canEdit || mode !== 'edit'}
                        value={headOfDepartment || selectedDept?.headName || ''}
                        onChange={(e) => setHeadOfDepartment(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* TAB D: KELAYAKAN AKADEMIK */}
            {activeTab === 'D' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3B]">D. Kelayakan Akademik</h3>
                    <p className="text-xs text-slate-500">
                      Rekod Diploma, Sarjana Muda, Sarjana, PhD dan kelayakan profesional lain.
                    </p>
                  </div>
                  {canEdit && mode === 'edit' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingQualId(null);
                        setQLevel('Sarjana');
                        setQInst('');
                        setQField('');
                        setQYear('');
                        setQNotes('');
                        setShowQualForm(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Kelayakan
                    </button>
                  )}
                </div>

                {showQualForm && (
                  <form onSubmit={handleSaveQualification} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
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
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Institusi *</label>
                        <input
                          type="text"
                          required
                          value={qInst}
                          onChange={(e) => setQInst(e.target.value)}
                          placeholder="Universiti Malaya"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Bidang Pengajian *</label>
                        <input
                          type="text"
                          required
                          value={qField}
                          onChange={(e) => setQField(e.target.value)}
                          placeholder="Kepimpinan Pendidikan"
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
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
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">Maklumat Berkaitan</label>
                      <input
                        type="text"
                        value={qNotes}
                        onChange={(e) => setQNotes(e.target.value)}
                        placeholder="Tajuk tesis atau pengkhususan"
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setShowQualForm(false)}
                        className="px-3 py-2 text-xs text-slate-600"
                      >
                        Batal
                      </button>
                      <button
                        type="submit"
                        className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                      >
                        Simpan Kelayakan
                      </button>
                    </div>
                  </form>
                )}

                {qualifications.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <GraduationCap className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Tiada kelayakan akademik direkodkan</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {qualifications.map((q) => (
                      <div key={q.id} className="p-4 flex items-center justify-between gap-4 bg-white">
                        <div>
                          <p className="text-sm font-bold text-[#0B1F3B]">
                            {q.level} — {q.fieldOfStudy}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5">
                            {q.institution} · Tahun Tamat: <span className="font-mono-tabular">{q.graduationYear}</span>
                          </p>
                          {q.notes && <p className="text-xs text-slate-500 mt-1">{q.notes}</p>}
                        </div>
                        {canEdit && mode === 'edit' && (
                          <div className="flex items-center gap-2 shrink-0">
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
                              className="p-1.5 text-slate-500 hover:text-[#0B1F3B]"
                              title="Edit"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingQual(q)}
                              className="p-1.5 text-red-600 hover:text-red-800"
                              title="Padam"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
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
              <div className="space-y-4">
                <div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">F. Kompetensi Digital dan AI</h3>
                  <p className="text-xs text-slate-500 mt-1">
                    Tandakan kompetensi digital dan kecerdasan buatan yang dikuasai serta nyatakan tahap penguasaan.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {competencyOptions.map((cat) => {
                    const activeItem = competencyItems.find((i) => i.categoryName === cat);
                    const checked = Boolean(activeItem);
                    return (
                      <div
                        key={cat}
                        className={`p-3.5 rounded-xl border transition-colors ${
                          checked ? 'border-[#0B1F3B] bg-slate-50/80' : 'border-slate-200 bg-white'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-2.5 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              disabled={!canEdit || mode !== 'edit'}
                              checked={checked}
                              onChange={() => toggleCompetency(cat)}
                              className="w-4 h-4 accent-[#0B1F3B]"
                            />
                            <span className="text-sm font-semibold text-[#0B1F3B]">{cat}</span>
                          </label>
                          {checked && <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />}
                        </div>

                        {checked && activeItem && (
                          <div className="grid grid-cols-2 gap-2 mt-3 pt-3 border-t border-slate-200">
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-1">Tahap</label>
                              <select
                                disabled={!canEdit || mode !== 'edit'}
                                value={activeItem.level}
                                onChange={(e) =>
                                  updateCompetencyDetail(cat, {
                                    level: e.target.value as CompetencyItem['level'],
                                  })
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md"
                              >
                                {COMPETENCY_LEVELS.map((lvl) => (
                                  <option key={lvl} value={lvl}>
                                    {lvl}
                                  </option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="block text-[11px] text-slate-600 mb-1">Tahun Pengalaman</label>
                              <input
                                type="number"
                                min={0}
                                max={40}
                                disabled={!canEdit || mode !== 'edit'}
                                value={activeItem.years}
                                onChange={(e) =>
                                  updateCompetencyDetail(cat, { years: Number(e.target.value) || 0 })
                                }
                                className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-md font-mono-tabular"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* TAB H: PENERBITAN & PENYELIDIKAN */}
            {activeTab === 'H' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <h3 className="text-base font-bold text-[#0B1F3B]">H. Penerbitan dan Penyelidikan</h3>
                    <p className="text-xs text-slate-500">
                      Buku, artikel jurnal, prosiding, penyelidikan, inovasi dan pengiktirafan.
                    </p>
                  </div>
                  {canEdit && mode === 'edit' && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingPubId(null);
                        setPType('Artikel Jurnal');
                        setPTitle('');
                        setPVenue('');
                        setPYear('');
                        setPUrl('');
                        setPDesc('');
                        setShowPubForm(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah Rekod
                    </button>
                  )}
                </div>

                {showPubForm && (
                  <form onSubmit={handleSavePublication} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
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
                      <div className="sm:col-span-2">
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Tajuk *</label>
                        <input
                          type="text"
                          required
                          value={pTitle}
                          onChange={(e) => setPTitle(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Penerbit / Persidangan</label>
                        <input
                          type="text"
                          value={pVenue}
                          onChange={(e) => setPVenue(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                        <input
                          type="text"
                          required
                          value={pYear}
                          onChange={(e) => setPYear(e.target.value)}
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">Pautan Penerbitan (URL)</label>
                        <input
                          type="url"
                          value={pUrl}
                          onChange={(e) => setPUrl(e.target.value)}
                          placeholder="https://..."
                          className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button type="button" onClick={() => setShowPubForm(false)} className="px-3 py-2 text-xs text-slate-600">
                        Batal
                      </button>
                      <button type="submit" className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] rounded-lg">
                        Simpan Penerbitan
                      </button>
                    </div>
                  </form>
                )}

                {publications.length === 0 ? (
                  <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
                    <BookOpen className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-700">Tiada penerbitan atau inovasi direkodkan</p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                    {publications.map((p) => (
                      <div key={p.id} className="p-4 flex items-start justify-between gap-4 bg-white">
                        <div className="min-w-0">
                          <p className="text-xs font-semibold text-[#9D741E]">{p.type} · {p.year}</p>
                          <p className="text-sm font-bold text-[#0B1F3B] mt-0.5">{p.title}</p>
                          {p.publisherOrVenue && <p className="text-xs text-slate-600 mt-0.5">{p.publisherOrVenue}</p>}
                          {p.url && (
                            <a
                              href={p.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-[#0B1F3B] underline mt-1 inline-block"
                            >
                              Lihat Pautan Penerbitan
                            </a>
                          )}
                        </div>
                        {canEdit && mode === 'edit' && (
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPubId(p.id);
                                setPType(p.type);
                                setPTitle(p.title);
                                setPVenue(p.publisherOrVenue || '');
                                setPYear(p.year);
                                setPUrl(p.url || '');
                                setPDesc(p.description || '');
                                setShowPubForm(true);
                              }}
                              className="p-1.5 text-slate-500 hover:text-[#0B1F3B]"
                            >
                              <Edit3 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPub(p)}
                              className="p-1.5 text-red-600 hover:text-red-800"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
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
    </div>
  );
};
