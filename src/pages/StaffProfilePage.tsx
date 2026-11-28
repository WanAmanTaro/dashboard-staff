import React, { useEffect, useMemo, useState } from 'react';
import {
  Camera,
  Edit3,
  Eye,
  Link2,
  Save,
} from 'lucide-react';
import { CertificateManager } from '../components/CertificateManager';
import { DriveImage } from '../components/DriveImage';
import { PhotoEditorModal } from '../components/PhotoEditorModal';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  SERVICE_GRADES_HAKIKI,
  SERVICE_GRADES_KUP,
  SERVICE_POSITIONS,
  computeProfileCompletion,
  computeYearsOfService,
  getHighestQualificationFromList,
  sortPublicationsDefault,
  sortQualificationsHighestFirst,
} from '../lib/constants';
import {
  getStaffProfileBundle,
  getSystemSettings,
  saveFullStaffProfile,
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
  Qualification,
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

type ProfileSectionTab = 'A_C' | 'I_J';

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

  // Expertise & Experience loaded from bundle to keep saveFullStaffProfile & completion intact
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

  const applicationSkillOptions = useMemo(
    () =>
      sysSettings?.applicationSkillCategories?.length
        ? sysSettings.applicationSkillCategories
        : DEFAULT_APPLICATION_SKILL_CATEGORIES,
    [sysSettings?.applicationSkillCategories]
  );

  const sortedQualifications = useMemo(
    () => sortQualificationsHighestFirst(qualifications),
    [qualifications]
  );

  const sortedPublications = useMemo(() => sortPublicationsDefault(publications), [publications]);

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
      const loadedApptDate = priv?.appointmentDate || '';
      setAppointmentDate(loadedApptDate);
      setServiceStatus(priv?.serviceStatus || 'Tetap');
      setYearsOfService(
        loadedApptDate ? computeYearsOfService(loadedApptDate) : (priv?.yearsOfService ?? 0)
      );

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
          yearsOfService: appointmentDate.trim()
            ? computeYearsOfService(appointmentDate)
            : Number(yearsOfService) || 0,
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
          {/* Section Navigation Tabs (A-C dan I-J sahaja; bahagian lain di menu sidebar) */}
          <div className="flex flex-wrap items-center justify-between gap-2 pb-1">
            <div className="flex items-center gap-1.5 overflow-x-auto">
              {(
                [
                  ['A_C', 'A–C. Biodata, Perkhidmatan & Organisasi'],
                  ['I_J', 'Gambar dan Sijil'],
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
            <p className="text-[11px] text-slate-500">
              Kelulusan Akademik, Pengalaman Mengajar, Fungsi 1–6 & Kompetensi boleh diakses terus melalui menu sisi.
            </p>
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
                        onChange={(e) => {
                          const val = e.target.value;
                          setAppointmentDate(val);
                          setYearsOfService(computeYearsOfService(val));
                        }}
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
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Pengalaman Perkhidmatan (Tahun)
                      </label>
                      <input
                        type="number"
                        readOnly
                        disabled
                        value={appointmentDate ? computeYearsOfService(appointmentDate) : yearsOfService}
                        className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-slate-100 text-slate-700 cursor-not-allowed font-mono-tabular"
                      />
                      <p className="text-[11px] text-slate-500 mt-1">
                        Dikira secara automatik berdasarkan Tarikh Lantikan.
                      </p>
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
    </div>
  );
};
