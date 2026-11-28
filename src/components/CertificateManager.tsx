import React, { useRef, useState } from 'react';
import {
  Download,
  ExternalLink,
  FileCheck2,
  Plus,
  RefreshCw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { CERTIFICATE_CATEGORIES, buildSafeDriveFilePrefix, formatBytes } from '../lib/constants';
import {
  deleteDriveFileApi,
  fetchDriveFileBlob,
  replaceDriveFileApi,
  uploadFileToDriveApi,
} from '../services/apiClient';
import {
  deleteCertificateMetadata,
  makeRecordId,
  saveCertificateMetadata,
} from '../services/firestoreService';
import type { Certificate, CertificateCategory } from '../types/iab';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';

interface CertificateManagerProps {
  staffId: string;
  staffName?: string;
  staffEmail?: string;
  uid: string;
  centerId: string;
  departmentId: string;
  certificates: Certificate[];
  canEdit: boolean;
  maxSizeMb?: number;
  onChanged: () => void;
}

export const CertificateManager: React.FC<CertificateManagerProps> = ({
  staffId,
  staffName,
  staffEmail,
  uid,
  centerId,
  departmentId,
  certificates,
  canEdit,
  maxSizeMb = 15,
  onChanged,
}) => {
  const { showToast } = useToast();
  const replaceInputRef = useRef<HTMLInputElement | null>(null);

  const [showAddForm, setShowAddForm] = useState(false);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState<CertificateCategory>('Sijil Akademik');
  const [certificateDate, setCertificateDate] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const [replacingCert, setReplacingCert] = useState<Certificate | null>(null);
  const [deletingCert, setDeletingCert] = useState<Certificate | null>(null);
  const [previewDoc, setPreviewDoc] = useState<{
    title: string;
    blobUrl: string;
    mimeType: string;
  } | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const handleUploadNew = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !selectedFile) {
      showToast('error', 'Sila masukkan nama sijil dan pilih fail untuk dimuat naik.');
      return;
    }

    const allowed = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowed.includes(selectedFile.type)) {
      showToast('error', 'Format fail tidak disokong. Sila muat naik PDF, JPG atau PNG sahaja.');
      return;
    }
    if (selectedFile.size > maxSizeMb * 1024 * 1024) {
      showToast('error', `Saiz fail melebihi had ${maxSizeMb} MB.`);
      return;
    }

    setUploading(true);
    let uploadedDriveFileId = '';
    try {
      const filePrefix = buildSafeDriveFilePrefix(staffName, staffEmail, staffId);
      const uploadRes = await uploadFileToDriveApi({
        file: selectedFile,
        fileName: `${filePrefix}_${selectedFile.name}`,
        staffId,
        staffName,
        staffEmail,
        category,
      });
      uploadedDriveFileId = uploadRes.fileId;

      await saveCertificateMetadata(
        {
          id: makeRecordId('CERT'),
          staffId,
          uid,
          centerId,
          departmentId,
          title: title.trim(),
          category,
          certificateDate: certificateDate.trim(),
          driveFileId: uploadRes.fileId,
          driveFolderId: uploadRes.folderId,
          fileName: uploadRes.fileName,
          mimeType: uploadRes.mimeType,
          fileSize: uploadRes.size,
          uploadedBy: uid,
          status: 'active',
        },
        true
      );

      showToast('success', 'Sijil berjaya dimuat naik ke Google Drive dan didaftarkan.');
      setTitle('');
      setCertificateDate('');
      setSelectedFile(null);
      setShowAddForm(false);
      onChanged();
    } catch (err: any) {
      // Orphan cleanup if Drive succeeded but Firestore metadata write failed
      if (uploadedDriveFileId) {
        await deleteDriveFileApi(uploadedDriveFileId, true).catch(() => {});
      }
      showToast('error', err?.message || 'Muat naik sijil gagal.');
    } finally {
      setUploading(false);
    }
  };

  const handleViewCert = async (cert: Certificate) => {
    setLoadingId(cert.id);
    try {
      const res = await fetchDriveFileBlob(cert.driveFileId, false);
      setPreviewDoc({ title: cert.title, blobUrl: res.blobUrl, mimeType: res.mimeType });
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal membuka fail sijil daripada Google Drive.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleDownloadCert = async (cert: Certificate) => {
    setLoadingId(cert.id);
    try {
      const res = await fetchDriveFileBlob(cert.driveFileId, true);
      const a = document.createElement('a');
      a.href = res.blobUrl;
      a.download = cert.fileName || res.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.setTimeout(() => URL.revokeObjectURL(res.blobUrl), 2000);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuat turun sijil.');
    } finally {
      setLoadingId(null);
    }
  };

  const handleReplaceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingCert) return;

    setLoadingId(replacingCert.id);
    try {
      const res = await replaceDriveFileApi(replacingCert.driveFileId, file);
      await saveCertificateMetadata(
        {
          ...replacingCert,
          fileName: res.fileName,
          mimeType: res.mimeType,
          fileSize: res.size,
        },
        false
      );
      showToast('success', 'Fail sijil berjaya digantikan di Google Drive.');
      onChanged();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menggantikan fail sijil.');
    } finally {
      setLoadingId(null);
      setReplacingCert(null);
      if (replaceInputRef.current) replaceInputRef.current.value = '';
    }
  };

  const handleConfirmDelete = async () => {
    if (!deletingCert) return;
    setLoadingId(deletingCert.id);
    try {
      await deleteDriveFileApi(deletingCert.driveFileId, false).catch(() => {});
      await deleteCertificateMetadata(deletingCert.id, staffId, deletingCert.title);
      showToast('success', 'Rekod sijil berjaya dipadam.');
      setDeletingCert(null);
      onChanged();
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memadam sijil.');
    } finally {
      setLoadingId(null);
    }
  };

  const closePreview = () => {
    if (previewDoc?.blobUrl) URL.revokeObjectURL(previewDoc.blobUrl);
    setPreviewDoc(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-bold text-[#0B1F3B]">Senarai Sijil dan Dokumen Sokongan</h4>
          <p className="text-xs text-slate-500">
            Hanya nama sijil dan pautan akses terkawal dipaparkan. Fail disimpan secara peribadi di Google Drive IAB.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowAddForm((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg transition-colors whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Muat Naik Sijil
          </button>
        )}
      </div>

      {showAddForm && canEdit && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h4 className="text-sm font-bold text-[#0B1F3B]">Muat Naik Sijil & Dokumen Sokongan</h4>
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="p-1 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang sijil"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleUploadNew} className="p-5 space-y-4">
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Sijil *</label>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Contoh: Sijil Ijazah Doktor Falsafah"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
                    <select
                      value={category}
                      onChange={(e) => setCategory(e.target.value as CertificateCategory)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    >
                      {CERTIFICATE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Tarikh Sijil</label>
                    <input
                      type="date"
                      value={certificateDate}
                      onChange={(e) => setCertificateDate(e.target.value)}
                      className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Fail Sijil *</label>
                <label className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-medium text-[#0B1F3B] bg-slate-50 border border-slate-300 rounded-lg cursor-pointer hover:bg-slate-100">
                  <Upload className="w-3.5 h-3.5" />
                  <span>{selectedFile ? selectedFile.name : `Pilih Fail (PDF/JPG/PNG, Maks ${maxSizeMb} MB)`}</span>
                  <input
                    type="file"
                    accept=".pdf,image/jpeg,image/jpg,image/png"
                    onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddForm(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={uploading}
                  className="px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  {uploading ? 'Memuat naik...' : 'Simpan & Muat Naik'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <input
        ref={replaceInputRef}
        type="file"
        accept=".pdf,image/jpeg,image/jpg,image/png"
        onChange={handleReplaceFileSelect}
        className="hidden"
      />

      {certificates.length === 0 ? (
        <div className="p-6 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
          <FileCheck2 className="w-7 h-7 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-700">Tiada sijil dimuat naik lagi</p>
          <p className="text-xs text-slate-500 mt-1">
            Muat naik sijil akademik, profesional atau kompetensi untuk melengkapkan rekod anda.
          </p>
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white divide-y divide-slate-100">
          {certificates.map((cert) => (
            <div
              key={cert.id}
              className="p-3.5 sm:px-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50/70"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-[#0B1F3B] truncate">{cert.title}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-0.5">
                  <span>{cert.category}</span>
                  <span aria-hidden="true">·</span>
                  <span>{cert.certificateDate || 'Tarikh tidak dinyatakan'}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono-tabular">{formatBytes(cert.fileSize)}</span>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handleViewCert(cert)}
                  disabled={loadingId === cert.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Buka Sijil
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadCert(cert)}
                  disabled={loadingId === cert.id}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
                  title="Muat turun"
                >
                  <Download className="w-3.5 h-3.5" />
                </button>
                {canEdit && (
                  <>
                    <button
                      type="button"
                      onClick={() => {
                        setReplacingCert(cert);
                        replaceInputRef.current?.click();
                      }}
                      disabled={loadingId === cert.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-slate-700 border border-slate-200 hover:bg-slate-50 rounded-md transition-colors"
                      title="Ganti Fail"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDeletingCert(cert)}
                      disabled={loadingId === cert.id}
                      className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-700 border border-red-200 hover:bg-red-50 rounded-md transition-colors"
                      title="Padam Sijil"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {previewDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 p-4" role="dialog" aria-modal="true">
          <div className="bg-white rounded-xl max-w-4xl w-full h-[85vh] flex flex-col overflow-hidden shadow-2xl">
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B] truncate">{previewDoc.title}</h3>
              <button
                type="button"
                onClick={closePreview}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup paparan sijil"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex-1 bg-slate-100 p-4 flex items-center justify-center overflow-auto">
              {previewDoc.mimeType.includes('pdf') ? (
                <iframe
                  src={previewDoc.blobUrl}
                  title={previewDoc.title}
                  className="w-full h-full rounded-lg border border-slate-200 bg-white"
                />
              ) : (
                <img
                  src={previewDoc.blobUrl}
                  alt={previewDoc.title}
                  className="max-w-full max-h-full object-contain rounded-lg shadow"
                />
              )}
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deletingCert)}
        title="Sahkan Pemadaman Sijil"
        description={`Adakah anda pasti mahu memadam sijil "${deletingCert?.title || ''}" daripada rekod dan storan Google Drive? Tindakan ini tidak boleh dikembalikan.`}
        confirmLabel="Padam Sijil"
        busy={Boolean(loadingId)}
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeletingCert(null)}
      />
    </div>
  );
};
