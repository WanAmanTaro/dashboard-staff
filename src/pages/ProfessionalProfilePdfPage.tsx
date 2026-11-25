import React, { useEffect, useState } from 'react';
import { CloudUpload, Download, FileText } from 'lucide-react';
import { DriveImage } from '../components/DriveImage';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';
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
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
} from '../types/iab';

interface ProfessionalProfilePdfPageProps {
  profiles: StaffProfile[];
  initialStaffId?: string | null;
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
    publications: Publication[];
    certificates: Certificate[];
  } | null>(null);

  useEffect(() => {
    if (initialStaffId) setSelectedStaffId(initialStaffId);
  }, [initialStaffId]);

  useEffect(() => {
    if (!selectedStaffId) return;
    setLoading(true);
    getStaffProfileBundle(selectedStaffId)
      .then((res) => setBundle(res))
      .catch((err) => showToast('error', err?.message || 'Gagal memuatkan data profil.'))
      .finally(() => setLoading(false));
  }, [selectedStaffId]);

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
            category: 'GENERATED_PROFILE',
          });
          driveFileId = uploaded.fileId;
          status = 'stored_in_drive';
        } catch (driveErr: any) {
          showToast(
            'warning',
            `PDF dimuat turun ke peranti, tetapi simpanan ke Google Drive gagal: ${driveErr?.message}`
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
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menjana PDF.');
    } finally {
      setGenerating(false);
    }
  };

  const p = bundle?.profile;

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">Penjanaan Profil Profesional PDF</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Dokumen PDF dijana terus daripada rekod sebenar Firestore tanpa menambah maklumat yang tiada dalam rekod.
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
        <div className="bg-white border border-slate-300 rounded-xl max-w-4xl mx-auto overflow-hidden shadow-sm">
          {/* Official Header */}
          <div className="bg-[#0B1F3B] text-white px-8 py-6 border-b-4 border-[#C69738] flex items-center justify-between gap-4">
            <div>
              <p className="text-xs font-bold tracking-wider text-[#F5D076]">
                INSTITUT AMINUDDIN BAKI · KEMENTERIAN PENDIDIKAN MALAYSIA
              </p>
              <h3 className="text-lg font-extrabold mt-1">
                {templateType === 'ringkas'
                  ? 'PRATONTON PROFIL PROFESIONAL (RINGKAS)'
                  : 'PRATONTON PROFIL PROFESIONAL (LENGKAP)'}
              </h3>
            </div>
            <span className="text-xs font-mono-tabular text-slate-300">{p.staffId}</span>
          </div>

          <div className="p-8 space-y-6 text-sm">
            <div className="flex items-start justify-between gap-6 pb-6 border-b border-slate-200">
              <div className="space-y-1">
                <h4 className="text-xl font-bold text-[#0B1F3B]">{p.fullName}</h4>
                <p className="text-slate-700 font-medium">
                  {p.position || 'Jawatan belum diisi'} ({p.grade || '-'})
                </p>
                <p className="text-slate-600">{p.departmentName || '-'}</p>
                <p className="text-slate-500 text-xs">{p.centerName || '-'}</p>
                <p className="text-slate-500 text-xs">Emel Rasmi: {p.officialEmail}</p>
              </div>
              <DriveImage
                driveFileId={p.photoDisplayUrl}
                fullName={p.fullName}
                className="w-24 h-24 rounded-lg shrink-0"
              />
            </div>

            {templateType === 'ringkas' ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-bold text-[#0B1F3B] mb-1">Kelayakan Akademik Tertinggi</p>
                  <p className="text-slate-700">{p.highestQualification || 'Belum diisi'}</p>
                </div>
                <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-bold text-[#0B1F3B] mb-1">Kepakaran Utama</p>
                  <p className="text-slate-700">{p.primaryExpertise || 'Belum diisi'}</p>
                </div>
                <div className="sm:col-span-2 p-4 bg-slate-50 rounded-lg border border-slate-200">
                  <p className="font-bold text-[#0B1F3B] mb-1">Pengalaman Profesional</p>
                  <p className="text-slate-700 leading-relaxed">
                    {bundle?.expertise?.professionalExp ||
                      bundle?.expertise?.teachingExp ||
                      'Tiada rekod pengalaman profesional.'}
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-6 text-xs">
                <div>
                  <h5 className="font-bold text-[#0B1F3B] text-sm mb-2">Kelayakan Akademik</h5>
                  <ul className="space-y-1 text-slate-700">
                    {bundle?.qualifications.length ? (
                      bundle.qualifications.map((q) => (
                        <li key={q.id}>
                          • <strong>{q.level}</strong> — {q.fieldOfStudy}, {q.institution} ({q.graduationYear})
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500">Tiada kelayakan akademik direkodkan.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h5 className="font-bold text-[#0B1F3B] text-sm mb-2">Kepakaran & Kompetensi Digital/AI</h5>
                  <p className="text-slate-700 mb-1">
                    <strong>Kepakaran Utama:</strong> {p.primaryExpertise || 'Belum diisi'}
                  </p>
                  <p className="text-slate-700 mb-1">
                    <strong>Kepakaran Kedua:</strong> {p.secondaryExpertise || 'Tiada rekod'}
                  </p>
                  <p className="text-slate-700">
                    <strong>Kompetensi Digital & AI:</strong>{' '}
                    {bundle?.competencies?.items?.map((c) => `${c.categoryName} (${c.level})`).join(', ') ||
                      'Tiada rekod'}
                  </p>
                </div>

                <div>
                  <h5 className="font-bold text-[#0B1F3B] text-sm mb-2">Penerbitan & Penyelidikan</h5>
                  <ul className="space-y-1 text-slate-700">
                    {bundle?.publications.length ? (
                      bundle.publications.map((pub) => (
                        <li key={pub.id}>
                          • [{pub.type}] {pub.title} ({pub.year})
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500">Tiada penerbitan direkodkan.</li>
                    )}
                  </ul>
                </div>

                <div>
                  <h5 className="font-bold text-[#0B1F3B] text-sm mb-2">Senarai Sijil & Pautan Terkawal</h5>
                  <ul className="space-y-1 text-slate-700">
                    {bundle?.certificates.length ? (
                      bundle.certificates.map((c) => (
                        <li key={c.id}>
                          • {c.title} ({c.category}) — <span className="font-mono-tabular text-slate-500">ID Drive: {c.driveFileId}</span>
                        </li>
                      ))
                    ) : (
                      <li className="text-slate-500">Tiada sijil dimuat naik.</li>
                    )}
                  </ul>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
