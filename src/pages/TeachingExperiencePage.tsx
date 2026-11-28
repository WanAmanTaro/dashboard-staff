import React, { useEffect, useState } from 'react';
import { Briefcase, Loader2, Save, Users } from 'lucide-react';
import { useToast } from '../components/Toast';
import { computeProfileCompletion, DEFAULT_EXPERTISE_CATEGORIES } from '../lib/constants';
import { getStaffProfileBundle, saveStaffExpertise } from '../services/firestoreService';
import type {
  Certificate,
  CompetencyItem,
  ProfilePhoto,
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
  UserAccount,
} from '../types/iab';

interface TeachingExperiencePageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
}

function splitCsv(val: string): string[] {
  return val
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export const TeachingExperiencePage: React.FC<TeachingExperiencePageProps> = ({
  userAccount,
  profiles,
  sysSettings,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bundleProfile, setBundleProfile] = useState<StaffProfile | null>(null);
  const [bundlePii, setBundlePii] = useState<StaffPrivatePII | null>(null);
  const [bundleQuals, setBundleQuals] = useState<Qualification[]>([]);
  const [bundleComps, setBundleComps] = useState<CompetencyItem[]>([]);
  const [bundlePubs, setBundlePubs] = useState<Publication[]>([]);
  const [bundleCerts, setBundleCerts] = useState<Certificate[]>([]);
  const [bundlePhoto, setBundlePhoto] = useState<ProfilePhoto | null>(null);

  // Expertise & Teaching Experience fields
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

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile =
    profiles.find((p) => p.staffId === selectedStaffId) || bundleProfile;
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const expertiseOptions = sysSettings?.expertiseCategories?.length
    ? sysSettings.expertiseCategories
    : DEFAULT_EXPERTISE_CATEGORIES;

  const loadData = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const bundle = await getStaffProfileBundle(staffIdToLoad, userAccount);
      setBundleProfile(bundle.profile);
      setBundlePii(bundle.pii);
      setBundleQuals(bundle.qualifications);
      setBundleComps(bundle.competencies?.items || []);
      setBundlePubs(bundle.publications);
      setBundleCerts(bundle.certificates);
      setBundlePhoto(bundle.photo);

      const exp = bundle.expertise;
      const prof = bundle.profile;
      setPrimaryExpertise(exp?.primaryExpertise || prof?.primaryExpertise || '');
      setSecondaryExpertise(exp?.secondaryExpertise || prof?.secondaryExpertise || '');
      setSpecializationsText(exp?.specializations?.join(', ') || '');
      setResearchAreasText(exp?.researchAreas?.join(', ') || '');
      setTeachingAreasText(exp?.teachingAreas?.join(', ') || '');
      setTrainingAreasText(exp?.trainingAreas?.join(', ') || '');
      setKeywordsText(exp?.keywords?.join(', ') || prof?.expertiseKeywords?.join(', ') || '');
      setTeachingExp(exp?.teachingExp || '');
      setManagementExp(exp?.managementExp || '');
      setFacilitatorExp(exp?.facilitatorExp || '');
      setSpeakerExp(exp?.speakerExp || '');
      setCoachExp(exp?.coachExp || '');
      setProjectExp(exp?.projectExp || '');
      setProfessionalExp(exp?.professionalExp || '');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuatkan rekod pengalaman mengajar.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadData(selectedStaffId);
    }
  }, [selectedStaffId]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedStaffId) return;
    setSaving(true);
    try {
      const targetUid = activeProfile?.uid || (isOwnRecord ? userAccount.uid : '');
      const centerId = activeProfile?.centerId || userAccount.centerId || '';
      const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';

      const nextCompletion = computeProfileCompletion({
        profile: {
          fullName: activeProfile?.fullName || (isOwnRecord ? userAccount.displayName : ''),
          officialEmail: activeProfile?.officialEmail || (isOwnRecord ? userAccount.email : ''),
          position: activeProfile?.position || '',
          grade: activeProfile?.grade || '',
          scheme: activeProfile?.scheme || '',
          centerId,
          departmentId,
          highestQualification: activeProfile?.highestQualification || '',
          primaryExpertise: primaryExpertise.trim(),
          digitalCompetencies: bundleComps.map((i) => i.categoryName),
          hasPhoto: Boolean(bundlePhoto || activeProfile?.hasPhoto),
        },
        pii: bundlePii,
        qualificationsCount: bundleQuals.length,
        expertise: {
          primaryExpertise: primaryExpertise.trim(),
          teachingExp: teachingExp.trim(),
          managementExp: managementExp.trim(),
          facilitatorExp: facilitatorExp.trim(),
          speakerExp: speakerExp.trim(),
          coachExp: coachExp.trim(),
          projectExp: projectExp.trim(),
          professionalExp: professionalExp.trim(),
        },
        competencies: { items: bundleComps },
        publicationsCount: bundlePubs.length,
        certificatesCount: bundleCerts.length,
      });

      await saveStaffExpertise({
        expertise: {
          id: selectedStaffId,
          staffId: selectedStaffId,
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
        completion: nextCompletion,
      });

      showToast('success', 'Rekod kepakaran dan pengalaman mengajar berjaya disimpan.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan pengalaman mengajar.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Pengalaman Mengajar</h1>
            <p className="text-xs text-slate-500 mt-1">
              Maklumat kepakaran utama/kedua, bidang pengajaran, latihan serta pengalaman profesional pegawai.
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
          <p className="text-xs text-slate-500">Memuatkan rekod pengalaman mengajar...</p>
        </div>
      ) : (
        <form
          onSubmit={handleSave}
          className="bg-white border border-slate-200 rounded-xl p-6 space-y-8"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h2 className="text-base font-bold text-[#0B1F3B]">
                Kepakaran & Pengalaman Mengajar{' '}
                {activeProfile?.fullName ? `— ${activeProfile.fullName}` : ''}
              </h2>
              <p className="text-xs text-slate-500">
                Pilih kategori kepakaran piawai kawalan Admin supaya carian direktori dan analitik kapasiti kekal seragam.
              </p>
            </div>
            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan Rekod'}
              </button>
            )}
          </div>

          <div>
            <h3 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide mb-4">
              Kepakaran Pegawai
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kepakaran Utama *</label>
                <select
                  disabled={!canEdit}
                  value={primaryExpertise}
                  onChange={(e) => setPrimaryExpertise(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                >
                  <option value="">-- Pilih Kepakaran Utama --</option>
                  {primaryExpertise && !expertiseOptions.includes(primaryExpertise) && (
                    <option value={primaryExpertise}>{primaryExpertise}</option>
                  )}
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
                  disabled={!canEdit}
                  value={secondaryExpertise}
                  onChange={(e) => setSecondaryExpertise(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white disabled:bg-slate-50"
                >
                  <option value="">-- Pilih Kepakaran Kedua --</option>
                  {secondaryExpertise && !expertiseOptions.includes(secondaryExpertise) && (
                    <option value={secondaryExpertise}>{secondaryExpertise}</option>
                  )}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
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
                  disabled={!canEdit}
                  value={keywordsText}
                  onChange={(e) => setKeywordsText(e.target.value)}
                  placeholder="GenAI, Analitik Data, Pengurusan Sekolah, Coaching"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                />
              </div>
            </div>
          </div>

          <div className="border-t border-slate-200 pt-6">
            <h3 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide mb-4">
              Pengalaman Mengajar dan Sumbangan
            </h3>
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
                    disabled={!canEdit}
                    value={val}
                    onChange={(e) => setter(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg disabled:bg-slate-50"
                  />
                </div>
              ))}
            </div>
          </div>
        </form>
      )}
    </div>
  );
};
