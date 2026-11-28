import React, { useEffect, useState } from 'react';
import { CloudUpload, Download, ExternalLink, FileText } from 'lucide-react';
import { DriveImage } from '../components/DriveImage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
import {
  getIabCertDisplayLabel,
  getProgramEvaluationRating,
  sortPublicationsDefault,
  sortQualificationsHighestFirst,
} from '../lib/constants';
import { fetchDriveFileBlob, uploadFileToDriveApi } from '../services/apiClient';
import {
  getStaffProfileBundle,
  makeRecordId,
  recordGeneratedProfile,
} from '../services/firestoreService';
import { generateProfessionalProfilePdf } from '../utils/pdfGenerator';
import type {
  Certificate,
  CompetencyRecord,
  ExpertiseRecord,
  IabCompetencyRecord,
  Publication,
  Qualification,
  StaffAchievementsRecord,
  StaffFunctionsRecord,
  StaffPrivatePII,
  StaffProfile,
  TeachingExperienceRecord,
} from '../types/iab';

interface ProfessionalProfilePdfPageProps {
  profiles: StaffProfile[];
  initialStaffId?: string | null;
}

function formatSafeUrl(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const ProfessionalProfilePdfPage: React.FC<ProfessionalProfilePdfPageProps> = ({
  profiles,
  initialStaffId,
}) => {
  const { userAccount } = useAuth();
  const { showToast } = useToast();

  const canSelectOthers =
    Boolean(userAccount?.isAdmin) || userAccount?.role === 'L1' || userAccount?.role === 'L2';

  const selectableProfiles = canSelectOthers
    ? profiles
    : profiles.filter((p) => p.staffId === userAccount?.staffId);

  const [selectedStaffId, setSelectedStaffId] = useState<string>(
    initialStaffId || userAccount?.staffId || selectableProfiles[0]?.staffId || ''
  );
  const [templateType, setTemplateType] = useState<'ringkas' | 'lengkap'>('lengkap');
  const [saveToDrive, setSaveToDrive] = useState(false);

  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [bundle, setBundle] = useState<{
    profile: StaffProfile | null;
    pii: StaffPrivatePII | null;
    qualifications: Qualification[];
    expertise: ExpertiseRecord | null;
    competencies: CompetencyRecord | null;
    iabCompetencies?: IabCompetencyRecord | null;
    staffFunctions?: StaffFunctionsRecord | null;
    staffAchievements?: StaffAchievementsRecord | null;
    teachingExperience?: TeachingExperienceRecord | null;
    publications: Publication[];
    certificates: Certificate[];
  } | null>(null);

  useEffect(() => {
    if (initialStaffId) setSelectedStaffId(initialStaffId);
  }, [initialStaffId]);

  useEffect(() => {
    if (!selectedStaffId || !userAccount) return;
    setLoading(true);
    getStaffProfileBundle(selectedStaffId, userAccount)
      .then((res) => setBundle(res))
      .catch((err) => showToast('error', err?.message || 'Gagal memuatkan data profil.'))
      .finally(() => setLoading(false));
  }, [selectedStaffId, userAccount?.uid]);

  const handleGeneratePdf = async () => {
    if (!bundle?.profile || !userAccount) {
      showToast('error', 'Profil pegawai belum disimpan dalam pangkalan data.');
      return;
    }

    setGenerating(true);
    try {
      let photoDataUrl: string | null = null;
      if (bundle.profile.photoDisplayUrl) {
        try {
          const imgRes = await fetchDriveFileBlob(bundle.profile.photoDisplayUrl);
          const resp = await fetch(imgRes.blobUrl);
          const blob = await resp.blob();
          photoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(String(reader.result || ''));
            reader.readAsDataURL(blob);
          });
          URL.revokeObjectURL(imgRes.blobUrl);
        } catch {
          photoDataUrl = null;
        }
      }

      const { blob, fileName, dataVersion } = generateProfessionalProfilePdf(
        {
          profile: bundle.profile,
          pii: bundle.pii,
          qualifications: bundle.qualifications,
          expertise: bundle.expertise,
          competencies: bundle.competencies,
          iabCompetencies: bundle.iabCompetencies,
          staffFunctions: bundle.staffFunctions,
          staffAchievements: bundle.staffAchievements,
          teachingExperience: bundle.teachingExperience,
          publications: bundle.publications,
          certificates: bundle.certificates,
          photoDataUrl,
        },
        templateType
      );

      let driveFileId = '';
      let status: 'generated' | 'stored_in_drive' = 'generated';

      if (saveToDrive) {
        try {
          const uploaded = await uploadFileToDriveApi({
            file: blob,
            fileName,
            staffId: bundle.profile.staffId,
            staffName: bundle.profile.fullName,
            staffEmail: bundle.profile.officialEmail,
            category: 'GENERATED_PROFILE',
          });
          driveFileId = uploaded.fileId;
          status = 'stored_in_drive';
        } catch (driveErr: unknown) {
          const msg = driveErr instanceof Error ? driveErr.message : String(driveErr);
          showToast(
            'warning',
            `PDF dimuat turun ke peranti, tetapi simpanan ke Google Drive gagal: ${msg}`
          );
        }
      }

      await recordGeneratedProfile({
        id: makeRecordId('PDF'),
        staffId: bundle.profile.staffId,
        uid: bundle.profile.uid || userAccount.uid,
        centerId: bundle.profile.centerId,
        departmentId: bundle.profile.departmentId,
        templateType,
        dataVersion,
        driveFileId,
        fileName,
        status,
      });

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 2000);

      showToast(
        'success',
        status === 'stored_in_drive'
          ? 'PDF berjaya dijana, dimuat turun dan disimpan ke folder 07_GENERATED_PROFILES.'
          : 'PDF rasmi berjaya dijana dan dimuat turun.'
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Gagal menjana PDF.';
      showToast('error', msg);
    } finally {
      setGenerating(false);
    }
  };

  const p = bundle?.profile;
  const pii = bundle?.pii;
  const sortedQuals = sortQualificationsHighestFirst(bundle?.qualifications || []);
  const sortedPubs = sortPublicationsDefault(bundle?.publications || []);
  const researchPubs = sortedPubs.filter((pub) => pub.type === 'Penyelidikan');
  const publicationPubs = sortedPubs.filter((pub) => pub.type !== 'Penyelidikan');

  const compItems = bundle?.competencies?.items || [];
  const appSkills = compItems.filter((c) => c.skillType === 'aplikasi');
  const knowSkills = compItems.filter((c) => c.skillType !== 'aplikasi');

  const iabCerts = bundle?.iabCompetencies?.certifications || [];
  const iabCertsAda = iabCerts.filter((c) => c.status === 'Ada');
  const iabModules = bundle?.iabCompetencies?.modules || [];

  const iabTeaching =
    bundle?.teachingExperience?.iabTeachingList || bundle?.expertise?.iabTeachingList || [];
  const schoolTeaching =
    bundle?.teachingExperience?.schoolTeachingList || bundle?.expertise?.schoolTeachingList || [];
  const extTeaching =
    bundle?.teachingExperience?.externalTeachingList ||
    bundle?.expertise?.externalTeachingList ||
    [];

  const fn = bundle?.staffFunctions;
  const trainings = fn?.trainings || [];
  const programManagements = fn?.programManagements || [];
  const consultations = fn?.consultations || [];
  const npqelSupervisions = fn?.npqelSupervisions || [];
  const programEvaluations = fn?.programEvaluations || [];
  const thinkTankEntries = fn?.thinkTankEntries || [];

  const ach = bundle?.staffAchievements;
  const apcAwards = ach?.apcAwards || [];
  const innovations = ach?.innovations || [];
  const achResearch = ach?.researchOutputs || [];
  const otherAchievements = ach?.otherAchievements || [];

  const totalAchievementsCount =
    apcAwards.length + innovations.length + achResearch.length + otherAchievements.length;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">Penjanaan Profil Profesional PDF</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Pratonton dan muat turun Bio/CV eksekutif bersepadu daripada kesemua modul rekod rasmi pegawai.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canSelectOthers && (
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              {selectableProfiles.map((sp) => (
                <option key={sp.staffId} value={sp.staffId}>
                  {sp.fullName} ({sp.staffId})
                </option>
              ))}
            </select>
          )}

          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            <button
              type="button"
              onClick={() => setTemplateType('ringkas')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                templateType === 'ringkas' ? 'bg-white text-[#0B1F3B] shadow-sm' : 'text-slate-600'
              }`}
            >
              A. Profil Ringkas
            </button>
            <button
              type="button"
              onClick={() => setTemplateType('lengkap')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md ${
                templateType === 'lengkap' ? 'bg-white text-[#0B1F3B] shadow-sm' : 'text-slate-600'
              }`}
            >
              B. Profil Lengkap
            </button>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-slate-700 px-2">
            <input
              type="checkbox"
              checked={saveToDrive}
              onChange={(e) => setSaveToDrive(e.target.checked)}
              className="accent-[#0B1F3B]"
            />
            <CloudUpload className="w-3.5 h-3.5 text-slate-500" />
            Simpan ke Drive
          </label>

          <button
            type="button"
            onClick={handleGeneratePdf}
            disabled={generating || !p}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
          >
            <Download className="w-3.5 h-3.5" />
            {generating ? 'Menjana PDF...' : 'Jana & Muat Turun PDF'}
          </button>
        </div>
      </div>

      {/* Live Document Preview */}
      {loading ? (
        <div className="h-96 bg-white border border-slate-200 rounded-xl animate-pulse" />
      ) : !p ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <FileText className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#0B1F3B]">Rekod profil pegawai belum wujud</p>
          <p className="text-xs text-slate-500 mt-1">
            Sila lengkapkan dan simpan Profil Pegawai terlebih dahulu sebelum menjana dokumen PDF.
          </p>
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl max-w-4xl mx-auto overflow-hidden shadow-sm">
          {/* Official Executive Header */}
          <div className="bg-[#0B1F3B] text-white px-8 py-6 border-b-2 border-[#C69738] flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] font-bold tracking-widest text-[#F5D076] uppercase">
                INSTITUT AMINUDDIN BAKI · KEMENTERIAN PENDIDIKAN MALAYSIA
              </p>
              <h3 className="text-lg font-extrabold mt-1 tracking-tight">
                {templateType === 'ringkas'
                  ? 'PRATONTON PROFIL PROFESIONAL (RINGKAS)'
                  : 'PRATONTON PROFIL PROFESIONAL (LENGKAP)'}
              </h3>
            </div>
            <div className="text-right">
              <p className="text-[11px] text-slate-300 uppercase tracking-wider">ID Staf Rasmi</p>
              <p className="text-xs font-mono-tabular font-bold text-white mt-0.5">{p.staffId}</p>
            </div>
          </div>

          <div className="p-8 space-y-8 text-xs">
            {/* Bio Identity Masthead */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 pb-6 border-b border-slate-200">
              <div className="space-y-2 min-w-0">
                <h4 className="text-2xl font-extrabold text-[#0B1F3B] tracking-tight">
                  {p.fullName}
                </h4>
                <p className="text-sm text-slate-800 font-semibold">
                  {p.position || 'Jawatan belum diisi'} · Hakiki: {p.grade || '-'}
                  {p.kupGrade && p.kupGrade !== 'TIDAK BERKENAAN' ? ` · KUP: ${p.kupGrade}` : ''}
                </p>
                <p className="text-slate-700 font-medium">
                  {p.departmentName || '-'} · {p.centerName || '-'}
                </p>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-slate-500 pt-1">
                  <span>Emel Rasmi: {p.officialEmail || '-'}</span>
                  {pii?.phone && <span>· Tel: {pii.phone}</span>}
                  {p.scheme && <span>· Skim: {p.scheme}</span>}
                </div>
              </div>
              <DriveImage
                driveFileId={p.photoDisplayUrl}
                fullName={p.fullName}
                className="w-28 h-28 rounded-xl border border-slate-200 shrink-0"
              />
            </div>

            {/* Executive Highlight Strip (Unboxed tabular metrics) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pb-6 border-b border-slate-200">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Kelulusan Tertinggi
                </p>
                <p className="text-sm font-bold text-[#0B1F3B] mt-1">
                  {sortedQuals[0]?.level || p.highestQualification || 'Belum diisi'}
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Tempoh Perkhidmatan
                </p>
                <p className="text-sm font-bold text-[#0B1F3B] font-mono-tabular mt-1">
                  {pii?.yearsOfService ?? 0} Tahun
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Pensijilan IAB
                </p>
                <p className="text-sm font-bold text-[#0B1F3B] font-mono-tabular mt-1">
                  {iabCertsAda.length} Pensijilan · {iabModules.length} Modul
                </p>
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  Rekod Pencapaian
                </p>
                <p className="text-sm font-bold text-[#0B1F3B] font-mono-tabular mt-1">
                  {totalAchievementsCount} Rekod
                </p>
              </div>
            </div>

            {templateType === 'ringkas' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-bold text-[#0B1F3B] mb-1">Kelayakan Akademik Tertinggi</p>
                  <p className="text-slate-700">
                    {sortedQuals[0]
                      ? `${sortedQuals[0].level} — ${sortedQuals[0].fieldOfStudy} (${sortedQuals[0].institution}, ${sortedQuals[0].graduationYear})`
                      : p.highestQualification || 'Belum diisi'}
                  </p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-bold text-[#0B1F3B] mb-1">Kepakaran Utama</p>
                  <p className="text-slate-700">{p.primaryExpertise || 'Belum diisi'}</p>
                </div>
                <div className="sm:col-span-2 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                  <p className="font-bold text-[#0B1F3B]">Kompetensi Digital & AI</p>
                  <p className="text-slate-700">
                    <strong>Aplikasi AI:</strong>{' '}
                    {appSkills.length
                      ? appSkills.map((c) => `${c.categoryName} (${c.level}, ${c.years} thn)`).join(', ')
                      : 'Tiada rekod'}
                  </p>
                  <p className="text-slate-700">
                    <strong>Pengetahuan AI:</strong>{' '}
                    {knowSkills.length
                      ? knowSkills.map((c) => `${c.categoryName} (${c.level}, ${c.years} thn)`).join(', ')
                      : 'Tiada rekod'}
                  </p>
                </div>
                <div className="sm:col-span-2 p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                  <p className="font-bold text-[#0B1F3B]">Ringkasan Pengalaman Mengajar & Pencapaian</p>
                  <p className="text-slate-700">
                    <strong>Pengalaman Mengajar:</strong>{' '}
                    {iabTeaching.length + schoolTeaching.length + extTeaching.length > 0
                      ? `${iabTeaching.length} di IAB · ${schoolTeaching.length} di Sekolah · ${extTeaching.length} Luar`
                      : bundle?.expertise?.professionalExp || bundle?.expertise?.teachingExp || 'Tiada rekod'}
                  </p>
                  <p className="text-slate-700">
                    <strong>Pencapaian:</strong>{' '}
                    {totalAchievementsCount > 0
                      ? `${apcAwards.length} APC · ${innovations.length} Inovasi · ${achResearch.length} Penerbitan/Kajian · ${otherAchievements.length} Lain-lain`
                      : 'Tiada rekod pencapaian'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* 1. PROFIL PERKHIDMATAN & ORGANISASI */}
                <section className="space-y-3">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    1. Profil Perkhidmatan & Organisasi
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-2 text-slate-700">
                    <div>
                      <span className="font-semibold text-slate-500">Jawatan & Skim:</span>{' '}
                      {p.position || '-'} ({p.scheme || '-'})
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Gred Hakiki / KUP:</span>{' '}
                      {p.grade || '-'} / {p.kupGrade || 'TIDAK BERKENAAN'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Tarikh Lantikan:</span>{' '}
                      <span className="font-mono-tabular">{pii?.appointmentDate || '-'}</span> (
                      {pii?.serviceStatus || '-'})
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Pengalaman Perkhidmatan:</span>{' '}
                      <span className="font-mono-tabular">{pii?.yearsOfService ?? 0} tahun</span>
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Pusat / Jabatan / Unit:</span>{' '}
                      {p.centerName || '-'} · {p.departmentName || '-'} · {p.unit || '-'}
                    </div>
                    <div>
                      <span className="font-semibold text-slate-500">Ketua Pusat / Ketua Jabatan:</span>{' '}
                      {p.headOfCenter || 'TIADA MAKLUMAT'} / {p.headOfDepartment || 'TIADA MAKLUMAT'}
                    </div>
                  </div>
                </section>

                {/* 2. KELULUSAN AKADEMIK */}
                <section className="space-y-3">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    2. Kelulusan Akademik
                  </h5>
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                          <th className="py-2.5 px-3 w-10">Bil.</th>
                          <th className="py-2.5 px-3">Tahap</th>
                          <th className="py-2.5 px-3">Institusi</th>
                          <th className="py-2.5 px-3">Bidang Pengajian</th>
                          <th className="py-2.5 px-3 w-24">Tahun</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200">
                        {sortedQuals.length > 0 ? (
                          sortedQuals.map((q, idx) => (
                            <tr key={q.id}>
                              <td className="py-2 px-3 font-mono-tabular text-slate-500">{idx + 1}.</td>
                              <td className="py-2 px-3 font-semibold text-[#0B1F3B]">{q.level}</td>
                              <td className="py-2 px-3 text-slate-700">{q.institution}</td>
                              <td className="py-2 px-3 text-slate-700">{q.fieldOfStudy}</td>
                              <td className="py-2 px-3 font-mono-tabular text-slate-700">
                                {q.graduationYear}
                              </td>
                            </tr>
                          ))
                        ) : (
                          <tr>
                            <td colSpan={5} className="py-4 px-3 text-center text-slate-500">
                              Tiada kelulusan akademik direkodkan.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>

                {/* 3. PENGALAMAN MENGAJAR */}
                <section className="space-y-4">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    3. Pengalaman Mengajar
                  </h5>
                  {iabTeaching.length === 0 &&
                  schoolTeaching.length === 0 &&
                  extTeaching.length === 0 ? (
                    <p className="text-slate-500">Tiada rekod pengalaman mengajar didaftarkan.</p>
                  ) : (
                    <div className="space-y-4">
                      {iabTeaching.length > 0 && (
                        <div>
                          <p className="font-bold text-[#0B1F3B] mb-1.5">
                            A. Pengalaman Mengajar di IAB
                          </p>
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                                  <th className="py-2 px-3 w-10">Bil.</th>
                                  <th className="py-2 px-3">Bidang / Modul</th>
                                  <th className="py-2 px-3">Jenis Pengajaran</th>
                                  <th className="py-2 px-3 w-32">Tempoh</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {iabTeaching.map((t, idx) => (
                                  <tr key={t.id}>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-500">{idx + 1}.</td>
                                    <td className="py-2 px-3 font-semibold text-[#0B1F3B]">{t.moduleOrField}</td>
                                    <td className="py-2 px-3 text-slate-700">{t.teachingType}</td>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-700">{t.years} tahun</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {schoolTeaching.length > 0 && (
                        <div>
                          <p className="font-bold text-[#0B1F3B] mb-1.5">
                            B. Pengalaman Mengajar di Sekolah
                          </p>
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                                  <th className="py-2 px-3 w-10">Bil.</th>
                                  <th className="py-2 px-3">Mata Pelajaran</th>
                                  <th className="py-2 px-3 w-32">Tempoh</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {schoolTeaching.map((s, idx) => (
                                  <tr key={s.id}>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-500">{idx + 1}.</td>
                                    <td className="py-2 px-3 font-semibold text-[#0B1F3B]">{s.subject}</td>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-700">{s.years} tahun</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {extTeaching.length > 0 && (
                        <div>
                          <p className="font-bold text-[#0B1F3B] mb-1.5">
                            C. Pengalaman Mengajar Selain Di IAB & Sekolah
                          </p>
                          <div className="overflow-x-auto border border-slate-200 rounded-lg">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase">
                                  <th className="py-2 px-3 w-10">Bil.</th>
                                  <th className="py-2 px-3">Institusi / Organisasi</th>
                                  <th className="py-2 px-3">Bidang / Modul</th>
                                  <th className="py-2 px-3">Jenis Pengajaran</th>
                                  <th className="py-2 px-3 w-28">Tempoh</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-200">
                                {extTeaching.map((e, idx) => (
                                  <tr key={e.id}>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-500">{idx + 1}.</td>
                                    <td className="py-2 px-3 font-semibold text-[#0B1F3B]">{e.institution}</td>
                                    <td className="py-2 px-3 text-slate-700">{e.moduleOrField}</td>
                                    <td className="py-2 px-3 text-slate-700">{e.teachingType}</td>
                                    <td className="py-2 px-3 font-mono-tabular text-slate-700">{e.years} tahun</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* 4. PENGLIBATAN 6 FUNGSI TERAS IAB */}
                <section className="space-y-4">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    4. Penglibatan Dalam 6 Fungsi Teras IAB
                  </h5>

                  <div className="grid grid-cols-1 gap-4">
                    {/* Fungsi 1 */}
                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">
                        Fungsi 1: Latihan dan Pembangunan ({trainings.length} Latihan ·{' '}
                        {programManagements.length} Pengurusan Program)
                      </p>
                      {trainings.length === 0 && programManagements.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod latihan atau pengurusan program.</p>
                      ) : (
                        <ul className="space-y-1 text-slate-700">
                          {trainings.map((t, i) => (
                            <li key={t.id}>
                              {i + 1}. [Latihan] {t.moduleName} — {t.role} (
                              <span className="font-mono-tabular">{t.year}</span>)
                            </li>
                          ))}
                          {programManagements.map((pg, i) => (
                            <li key={pg.id}>
                              {i + 1}. [Program] {pg.programName} ({pg.centerName}
                              {pg.departmentName ? ` / ${pg.departmentName}` : ''}) — {pg.role} (
                              <span className="font-mono-tabular">{pg.year}</span>)
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Fungsi 2 */}
                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">
                        Fungsi 2: Khidmat Pembangunan Organisasi / Konsultasi ({consultations.length})
                      </p>
                      {consultations.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod konsultasi.</p>
                      ) : (
                        <ul className="space-y-1 text-slate-700">
                          {consultations.map((c, i) => (
                            <li key={c.id}>
                              {i + 1}. {c.title} ({c.organization}) — {c.consultationType} ·{' '}
                              {c.role} (<span className="font-mono-tabular">{c.year}</span>)
                              {c.impact ? ` · Impak: ${c.impact}` : ''}
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Fungsi 3 & 4 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                        <p className="font-bold text-[#0B1F3B]">
                          Fungsi 3: Penyelidikan ({researchPubs.length})
                        </p>
                        {researchPubs.length === 0 ? (
                          <p className="text-slate-500">Tiada rekod penyelidikan.</p>
                        ) : (
                          <ul className="space-y-1 text-slate-700">
                            {researchPubs.map((r, i) => (
                              <li key={r.id}>
                                {i + 1}. {r.title} (
                                <span className="font-mono-tabular">{r.year}</span>)
                                {r.achievement ? ` · ${r.achievement}` : ''}
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>

                      <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                        <p className="font-bold text-[#0B1F3B]">
                          Fungsi 4: Penerbitan ({publicationPubs.length})
                        </p>
                        {publicationPubs.length === 0 ? (
                          <p className="text-slate-500">Tiada rekod penerbitan.</p>
                        ) : (
                          <ul className="space-y-1 text-slate-700">
                            {publicationPubs.map((pub, i) => (
                              <li key={pub.id}>
                                {i + 1}. [{pub.type}] {pub.title} (
                                <span className="font-mono-tabular">{pub.year}</span>)
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    </div>

                    {/* Fungsi 5 */}
                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">
                        Fungsi 5: Pentaksiran ({npqelSupervisions.length} Penyeliaan NPQEL ·{' '}
                        {programEvaluations.length} Penilaian Program)
                      </p>
                      {npqelSupervisions.length === 0 && programEvaluations.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod pentaksiran.</p>
                      ) : (
                        <ul className="space-y-1 text-slate-700">
                          {npqelSupervisions.map((n, i) => (
                            <li key={n.id}>
                              {i + 1}. [Penyeliaan NPQEL] {n.participantName} (Kelas{' '}
                              {n.participantClass},{' '}
                              <span className="font-mono-tabular">{n.year}</span>)
                            </li>
                          ))}
                          {programEvaluations.map((ev, i) => (
                            <li key={ev.id}>
                              {i + 1}. [Penilaian Program] {ev.programName} ({ev.centerName}) —{' '}
                              {ev.role} · Skor{' '}
                              <span className="font-mono-tabular">{ev.score}%</span> (
                              {getProgramEvaluationRating(ev.score)},{' '}
                              <span className="font-mono-tabular">{ev.year}</span>)
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>

                    {/* Fungsi 6 */}
                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">
                        Fungsi 6: Pasukan Pemikir ({thinkTankEntries.length})
                      </p>
                      {thinkTankEntries.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod keahlian pasukan pemikir.</p>
                      ) : (
                        <ul className="space-y-1 text-slate-700">
                          {thinkTankEntries.map((tk, i) => (
                            <li key={tk.id}>
                              {i + 1}. {tk.committeeName} [{tk.level}] — {tk.role} ·{' '}
                              {tk.focusArea} (<span className="font-mono-tabular">{tk.year}</span>,{' '}
                              {tk.activeStatus})
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </section>

                {/* 5. KOMPETENSI IAB & KOMPETENSI DIGITAL DAN AI */}
                <section className="space-y-4">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    5. Kompetensi IAB & Kompetensi Digital dan AI
                  </h5>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">Kompetensi IAB</p>
                      {iabCertsAda.length === 0 && iabModules.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod Kompetensi IAB.</p>
                      ) : (
                        <div className="space-y-2 text-slate-700">
                          {iabCertsAda.length > 0 && (
                            <ul className="space-y-1">
                              {iabCertsAda.map((c) => (
                                <li key={c.key}>
                                  • {getIabCertDisplayLabel(c.key, c.label)} (Tahun Lulus:{' '}
                                  <span className="font-mono-tabular">{c.passYear || '-'}</span>)
                                </li>
                              ))}
                            </ul>
                          )}
                          {iabModules.length > 0 && (
                            <div className="pt-1 border-t border-slate-200">
                              <p className="font-semibold text-slate-600 mb-1">Modul / CPD:</p>
                              <ul className="space-y-1">
                                {iabModules.map((m) => (
                                  <li key={m.id}>
                                    • {m.moduleName} — {m.contribution} (
                                    <span className="font-mono-tabular">{m.year}</span>,{' '}
                                    {m.activeStatus})
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="p-4 border border-slate-200 rounded-lg space-y-2">
                      <p className="font-bold text-[#0B1F3B]">Kompetensi Digital & AI</p>
                      {compItems.length === 0 ? (
                        <p className="text-slate-500">Tiada rekod kompetensi digital & AI.</p>
                      ) : (
                        <div className="space-y-2 text-slate-700">
                          {appSkills.length > 0 && (
                            <div>
                              <p className="font-semibold text-slate-600">Kemahiran Aplikasi:</p>
                              <ul className="space-y-1 mt-0.5">
                                {appSkills.map((c) => (
                                  <li key={c.categoryId}>
                                    • {c.categoryName} — {c.level} ({c.years} thn) · Sijil:{' '}
                                    {c.certificateDriveFileId ? 'Ada' : c.hasCertificate ? 'Ada' : 'Tiada'}
                                    {c.hasValidityPeriod && c.certificateValidityDuration
                                      ? ` · Sah Laku: ${c.certificateValidityDuration}`
                                      : ''}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          {knowSkills.length > 0 && (
                            <div className="pt-1 border-t border-slate-200">
                              <p className="font-semibold text-slate-600">Kemahiran Pengetahuan:</p>
                              <ul className="space-y-1 mt-0.5">
                                {knowSkills.map((c) => (
                                  <li key={c.categoryId}>
                                    • {c.categoryName} — {c.level} ({c.years} thn)
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </section>

                {/* 6. PENCAPAIAN & PENGIKTIRAFAN */}
                <section className="space-y-4">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    6. Rekod Pencapaian & Pengiktirafan
                  </h5>
                  {totalAchievementsCount === 0 ? (
                    <p className="text-slate-500">Tiada rekod pencapaian didaftarkan.</p>
                  ) : (
                    <div className="space-y-3">
                      {apcAwards.length > 0 && (
                        <div className="p-4 border border-slate-200 rounded-lg">
                          <p className="font-bold text-[#0B1F3B] mb-1">
                            A. Anugerah Perkhidmatan Cemerlang (APC)
                          </p>
                          <ul className="space-y-1 text-slate-700">
                            {apcAwards.map((a, idx) => (
                              <li key={a.id}>
                                {idx + 1}. {a.awardName} — Tahun{' '}
                                <span className="font-mono-tabular">{a.year}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {innovations.length > 0 && (
                        <div className="p-4 border border-slate-200 rounded-lg">
                          <p className="font-bold text-[#0B1F3B] mb-1">
                            B. Inovasi, Kreativiti & Penambahbaikan
                          </p>
                          <ul className="space-y-1 text-slate-700">
                            {innovations.map((inv, idx) => (
                              <li key={inv.id}>
                                {idx + 1}. {inv.projectName} ({inv.innovationType}) — {inv.role} ·
                                Peringkat {inv.level} (
                                <span className="font-mono-tabular">{inv.year}</span>)
                                {inv.recognition ? ` · Pengiktirafan: ${inv.recognition}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {achResearch.length > 0 && (
                        <div className="p-4 border border-slate-200 rounded-lg">
                          <p className="font-bold text-[#0B1F3B] mb-1">
                            C. Penerbitan & Penyelidikan (Pencapaian)
                          </p>
                          <ul className="space-y-1 text-slate-700">
                            {achResearch.map((r, idx) => (
                              <li key={r.id}>
                                {idx + 1}. [{r.outputType}] {r.title} — {r.role} ·{' '}
                                {r.publisherOrJournal || '-'} ({r.indexing},{' '}
                                <span className="font-mono-tabular">{r.year}</span>)
                                {r.identifier ? ` · ${r.identifier}` : ''}
                                {r.url && (
                                  <>
                                    {' '}
                                    <a
                                      href={formatSafeUrl(r.url)}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="inline-flex items-center gap-0.5 text-[#0B1F3B] underline"
                                    >
                                      Pautan <ExternalLink className="w-3 h-3" />
                                    </a>
                                  </>
                                )}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {otherAchievements.length > 0 && (
                        <div className="p-4 border border-slate-200 rounded-lg">
                          <p className="font-bold text-[#0B1F3B] mb-1">
                            D. Lain-lain Pencapaian / Pengiktirafan
                          </p>
                          <ul className="space-y-1 text-slate-700">
                            {otherAchievements.map((o, idx) => (
                              <li key={o.id}>
                                {idx + 1}. {o.title} [{o.achievementType}] — {o.role} ·{' '}
                                {o.organization || '-'} (Peringkat {o.level},{' '}
                                <span className="font-mono-tabular">{o.dateOrYear}</span>)
                                {o.impact ? ` · Impak: ${o.impact}` : ''}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </section>

                {/* 7. SENARAI SIJIL & DOKUMEN TERKAWAL */}
                <section className="space-y-2">
                  <h5 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wider border-b border-slate-200 pb-2">
                    7. Senarai Sijil & Pautan Dokumen Terkawal
                  </h5>
                  <ul className="space-y-1 text-slate-700">
                    {bundle?.certificates.length ? (
                      bundle.certificates.map((c) => (
                        <li key={c.id}>
                          • {c.title} ({c.category}) —{' '}
                          <span className="font-mono-tabular text-slate-500">
                            ID Drive: {c.driveFileId}
                          </span>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500">Tiada sijil dimuat naik.</li>
                    )}
                  </ul>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
