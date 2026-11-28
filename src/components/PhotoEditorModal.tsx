import React, { useEffect, useRef, useState } from 'react';
import {
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartHorizontal,
  ArrowDownToLine,
  ArrowUpToLine,
  Move,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { fetchDriveFileBlob, uploadStaffPhotosApi } from '../services/apiClient';
import { saveProfilePhotoMetadata } from '../services/firestoreService';
import type { ProfilePhoto } from '../types/iab';
import { useToast } from './Toast';

interface PhotoEditorModalProps {
  open: boolean;
  staffId: string;
  staffName?: string;
  staffEmail?: string;
  uid: string;
  centerId: string;
  departmentId: string;
  existingPhoto: ProfilePhoto | null;
  maxSizeMb?: number;
  onClose: () => void;
  onSaved: () => void;
}

export const PhotoEditorModal: React.FC<PhotoEditorModalProps> = ({
  open,
  staffId,
  staffName,
  staffEmail,
  uid,
  centerId,
  departmentId,
  existingPhoto,
  maxSizeMb = 5,
  onClose,
  onSaved,
}) => {
  const { showToast } = useToast();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [imageEl, setImageEl] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState<number>(existingPhoto?.zoom || 1);
  const [cropX, setCropX] = useState<number>(existingPhoto?.cropX || 0);
  const [cropY, setCropY] = useState<number>(existingPhoto?.cropY || 0);
  const [alignX, setAlignX] = useState<'left' | 'center' | 'right'>(existingPhoto?.alignX || 'center');
  const [alignY, setAlignY] = useState<'top' | 'center' | 'bottom'>(existingPhoto?.alignY || 'center');
  const [dragging, setDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; origX: number; origY: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingOriginal, setLoadingOriginal] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setErrorMsg(null);
    setZoom(existingPhoto?.zoom || 1);
    setCropX(existingPhoto?.cropX || 0);
    setCropY(existingPhoto?.cropY || 0);
    setAlignX(existingPhoto?.alignX || 'center');
    setAlignY(existingPhoto?.alignY || 'center');

    let objectUrl: string | null = null;
    if (!selectedFile && existingPhoto?.originalDriveFileId) {
      setLoadingOriginal(true);
      fetchDriveFileBlob(existingPhoto.originalDriveFileId)
        .then((res) => {
          objectUrl = res.blobUrl;
          const img = new Image();
          img.onload = () => {
            setImageEl(img);
            setLoadingOriginal(false);
          };
          img.onerror = () => setLoadingOriginal(false);
          img.src = res.blobUrl;
        })
        .catch(() => setLoadingOriginal(false));
    }

    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, existingPhoto?.originalDriveFileId]);

  useEffect(() => {
    if (!open || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = canvas.width;
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#F1F5F9';
    ctx.fillRect(0, 0, size, size);

    if (!imageEl) return;

    const baseScale = Math.max(size / imageEl.width, size / imageEl.height);
    const drawW = imageEl.width * baseScale * zoom;
    const drawH = imageEl.height * baseScale * zoom;
    const centerX = (size - drawW) / 2 + cropX;
    const centerY = (size - drawH) / 2 + cropY;

    ctx.drawImage(imageEl, centerX, centerY, drawW, drawH);

    // Subtle 1:1 rule-of-thirds frame guide
    ctx.strokeStyle = 'rgba(198, 151, 56, 0.35)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size / 3, 0);
    ctx.lineTo(size / 3, size);
    ctx.moveTo((2 * size) / 3, 0);
    ctx.lineTo((2 * size) / 3, size);
    ctx.moveTo(0, size / 3);
    ctx.lineTo(size, size / 3);
    ctx.moveTo(0, (2 * size) / 3);
    ctx.lineTo(size, (2 * size) / 3);
    ctx.stroke();
  }, [open, imageEl, zoom, cropX, cropY]);

  if (!open) return null;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setErrorMsg(null);
    const file = e.target.files?.[0];
    if (!file) return;

    const validTypes = ['image/jpeg', 'image/jpg', 'image/png'];
    if (!validTypes.includes(file.type)) {
      setErrorMsg('Format fail tidak disokong. Sila pilih fail JPG, JPEG atau PNG sahaja.');
      return;
    }
    if (file.size > maxSizeMb * 1024 * 1024) {
      setErrorMsg(`Saiz fail melebihi had ${maxSizeMb} MB yang ditetapkan.`);
      return;
    }

    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      setSelectedFile(file);
      setImageEl(img);
      setZoom(1);
      setCropX(0);
      setCropY(0);
      setAlignX('center');
      setAlignY('center');
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      setErrorMsg('Fail gambar tidak dapat dibaca.');
      URL.revokeObjectURL(url);
    };
    img.src = url;
  };

  const applyAlignment = (ax: 'left' | 'center' | 'right', ay: 'top' | 'center' | 'bottom') => {
    if (!imageEl || !canvasRef.current) return;
    const size = canvasRef.current.width;
    const baseScale = Math.max(size / imageEl.width, size / imageEl.height);
    const drawW = imageEl.width * baseScale * zoom;
    const drawH = imageEl.height * baseScale * zoom;
    const maxOffsetX = Math.max(0, (drawW - size) / 2);
    const maxOffsetY = Math.max(0, (drawH - size) / 2);

    const nextX = ax === 'left' ? maxOffsetX : ax === 'right' ? -maxOffsetX : 0;
    const nextY = ay === 'top' ? maxOffsetY : ay === 'bottom' ? -maxOffsetY : 0;
    setAlignX(ax);
    setAlignY(ay);
    setCropX(nextX);
    setCropY(nextY);
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!imageEl) return;
    setDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY, origX: cropX, origY: cropY });
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragging || !dragStart) return;
    setCropX(dragStart.origX + (e.clientX - dragStart.x));
    setCropY(dragStart.origY + (e.clientY - dragStart.y));
  };

  const handlePointerUp = () => {
    setDragging(false);
    setDragStart(null);
  };

  const handleSave = async () => {
    if (!imageEl) {
      setErrorMsg('Sila muat naik gambar terlebih dahulu.');
      return;
    }

    setSaving(true);
    setErrorMsg(null);
    try {
      // Render clean 512x512 1:1 output without grid lines
      const outCanvas = document.createElement('canvas');
      outCanvas.width = 512;
      outCanvas.height = 512;
      const outCtx = outCanvas.getContext('2d');
      if (!outCtx) throw new Error('Kanvas tidak disokong.');

      const previewSize = canvasRef.current?.width || 320;
      const ratio = 512 / previewSize;
      const baseScale = Math.max(512 / imageEl.width, 512 / imageEl.height);
      const drawW = imageEl.width * baseScale * zoom;
      const drawH = imageEl.height * baseScale * zoom;
      const dx = (512 - drawW) / 2 + cropX * ratio;
      const dy = (512 - drawH) / 2 + cropY * ratio;

      outCtx.fillStyle = '#FFFFFF';
      outCtx.fillRect(0, 0, 512, 512);
      outCtx.drawImage(imageEl, dx, dy, drawW, drawH);

      const displayBlob = await new Promise<Blob>((resolve, reject) => {
        outCanvas.toBlob(
          (b) => (b ? resolve(b) : reject(new Error('Gagal memproses gambar 1:1.'))),
          'image/png',
          0.92
        );
      });

      const uploadResult = await uploadStaffPhotosApi({
        staffId,
        staffName,
        staffEmail,
        originalFile: selectedFile,
        displayBlob,
      });

      const originalDriveId =
        uploadResult.original?.fileId || existingPhoto?.originalDriveFileId || uploadResult.display.fileId;
      const originalFileName =
        uploadResult.original?.fileName || existingPhoto?.originalFileName || uploadResult.display.fileName;

      await saveProfilePhotoMetadata({
        id: staffId,
        staffId,
        uid,
        centerId,
        departmentId,
        originalDriveFileId: originalDriveId,
        displayDriveFileId: uploadResult.display.fileId,
        originalFileName,
        displayFileName: uploadResult.display.fileName,
        cropX: Math.round(cropX),
        cropY: Math.round(cropY),
        zoom: Number(zoom.toFixed(2)),
        alignX,
        alignY,
        aspectRatio: '1:1',
        mimeType: selectedFile?.type || 'image/png',
        fileSize: selectedFile?.size || displayBlob.size,
        status: 'active',
      });

      showToast('success', 'Gambar asal dan paparan 1:1 berjaya disimpan ke Google Drive.');
      onSaved();
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || 'Gagal menyimpan gambar ke Google Drive.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4" role="dialog" aria-modal="true">
      <div className="bg-white border border-slate-200 rounded-xl max-w-2xl w-full p-6 shadow-xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-slate-200 pb-4 mb-5">
          <div>
            <h3 className="text-lg font-bold text-[#0B1F3B]">Editor Gambar Profil Pegawai (1:1)</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Gambar asal disimpan berasingan tanpa diubah; versi paparan 1:1 diproses secara selamat.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg"
            aria-label="Tutup editor gambar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {errorMsg && (
          <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
            {errorMsg}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
          <div className="flex flex-col items-center">
            <div className="relative rounded-xl overflow-hidden border-2 border-[#C69738]/60 bg-slate-100 shadow-inner">
              <canvas
                ref={canvasRef}
                width={320}
                height={320}
                onPointerDown={handlePointerDown}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerUp}
                onPointerLeave={handlePointerUp}
                className={`w-[280px] h-[280px] sm:w-[320px] sm:h-[320px] touch-none ${
                  imageEl ? 'cursor-grab active:cursor-grabbing' : ''
                }`}
              />
              {!imageEl && !loadingOriginal && (
                <div className="absolute inset-0 flex flex-col items-center justify-center p-4 text-center pointer-events-none">
                  <Upload className="w-8 h-8 text-slate-400 mb-2" />
                  <p className="text-xs text-slate-500">Muat naik gambar JPG, JPEG atau PNG (Maks. {maxSizeMb} MB)</p>
                </div>
              )}
              {loadingOriginal && (
                <div className="absolute inset-0 flex items-center justify-center bg-white/80 text-xs text-slate-600">
                  Memuatkan gambar asal...
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-slate-500 flex items-center gap-1.5">
              <Move className="w-3.5 h-3.5" /> Seret gambar di dalam bingkai untuk melaras kedudukan
            </p>
          </div>

          <div className="space-y-5">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png"
                onChange={handleFileChange}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 border border-slate-300 rounded-lg transition-colors"
              >
                <Upload className="w-4 h-4" />
                {selectedFile || existingPhoto ? 'Pilih Gambar Baharu' : 'Muat Naik Gambar (JPG/PNG)'}
              </button>
              {selectedFile && (
                <p className="text-xs text-emerald-700 mt-1.5 truncate">
                  Fail dipilih: {selectedFile.name}
                </p>
              )}
            </div>

            <div>
              <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2">
                <span>Tahap Zum</span>
                <span className="font-mono-tabular">{zoom.toFixed(2)}x</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.1).toFixed(2))))}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                  aria-label="Zum keluar"
                >
                  <ZoomOut className="w-4 h-4 text-slate-600" />
                </button>
                <input
                  type="range"
                  min="0.5"
                  max="3.5"
                  step="0.05"
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                  className="flex-1 accent-[#0B1F3B]"
                />
                <button
                  type="button"
                  onClick={() => setZoom((z) => Math.min(3.5, Number((z + 0.1).toFixed(2))))}
                  className="p-2 rounded-lg border border-slate-200 hover:bg-slate-50"
                  aria-label="Zum masuk"
                >
                  <ZoomIn className="w-4 h-4 text-slate-600" />
                </button>
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Penjajaran Mendatar</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['left', 'Kiri', AlignStartHorizontal],
                    ['center', 'Tengah', AlignCenterHorizontal],
                    ['right', 'Kanan', AlignEndHorizontal],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyAlignment(key, alignY)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                      alignX === key
                        ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-semibold text-slate-700 mb-2">Penjajaran Menegak</p>
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    ['top', 'Atas', ArrowUpToLine],
                    ['center', 'Tengah', AlignCenterHorizontal],
                    ['bottom', 'Bawah', ArrowDownToLine],
                  ] as const
                ).map(([key, label, Icon]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => applyAlignment(alignX, key)}
                    className={`flex items-center justify-center gap-1.5 py-2 px-2 text-xs font-medium rounded-lg border transition-colors ${
                      alignY === key
                        ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 border-t border-slate-200 pt-4 mt-6">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50"
          >
            Batal
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !imageEl}
            className="px-5 py-2 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
          >
            {saving ? 'Menyimpan ke Drive...' : 'Simpan Gambar'}
          </button>
        </div>
      </div>
    </div>
  );
};
