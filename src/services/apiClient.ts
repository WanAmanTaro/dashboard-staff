import { auth } from '../lib/firebase';

export interface DriveStatusResponse {
  status: 'connected' | 'disconnected' | 'error' | 'pending_configuration';
  oauthConfigured: boolean;
  encryptionKeyPersistent: boolean;
  connectedEmail: string;
  rootFolderId: string;
  folderIds: Record<string, string>;
  lastConnectedAt: string;
  lastUploadAt: string;
  uploadedDocumentsCount: number;
  uploadedPhotosCount: number;
  redirectUri: string;
  message: string;
}

async function getAuthHeaders(): Promise<Record<string, string>> {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Sesi pengguna tidak ditemui. Sila log masuk semula.');
  }
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
  };
}

function formatApiErrorMessage(rawMessage: string): string {
  if (rawMessage.includes('DRIVE_DISCONNECTED')) {
    return 'Storan Google Drive sistem belum disambungkan. Sila hubungi Pentadbir Sistem untuk menyambungkan Google Drive di Modul Pengurusan Google Drive.';
  }
  if (rawMessage.includes('GOOGLE_DRIVE_CLIENT_ID') || rawMessage.includes('GOOGLE_DRIVE_CLIENT_SECRET')) {
    return 'Konfigurasi Google Drive OAuth pelayan belum lengkap. Sila hubungi Pentadbir Sistem.';
  }
  return rawMessage;
}

async function parseApiJsonResponse<T>(res: Response, fallbackError: string): Promise<T> {
  const text = await res.text();
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  const trimmed = text.trim();

  if (
    trimmed.startsWith('<!doctype') ||
    trimmed.startsWith('<!DOCTYPE') ||
    trimmed.startsWith('<html') ||
    contentType.includes('text/html')
  ) {
    throw new Error(
      `Pelayan muat naik tidak memulangkan respons JSON yang sah (HTTP ${res.status}). Pastikan pelayan API aktif dan storan Google Drive telah disambungkan oleh Pentadbir.`
    );
  }

  let json: any = {};
  if (trimmed) {
    try {
      json = JSON.parse(trimmed);
    } catch {
      throw new Error(`${fallbackError} (Respons pelayan tidak sah: HTTP ${res.status})`);
    }
  }

  if (!res.ok) {
    throw new Error(formatApiErrorMessage(json?.error || fallbackError));
  }

  return json as T;
}

export async function getDriveStatus(): Promise<DriveStatusResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/drive/status', { headers });
  return parseApiJsonResponse<DriveStatusResponse>(res, 'Gagal mendapatkan status Google Drive.');
}

export async function openDriveOAuthPopup(mode: 'connect' | 'reconnect' = 'connect'): Promise<string> {
  const headers = await getAuthHeaders();
  const endpoint = mode === 'reconnect' ? '/api/drive/reconnect' : '/api/drive/connect';
  const method = mode === 'reconnect' ? 'POST' : 'GET';

  const res = await fetch(endpoint, { method, headers });
  const json = await parseApiJsonResponse<{ url?: string; error?: string }>(
    res,
    'Gagal mendapatkan pautan pengesahan Google Drive.'
  );
  if (!json.url) {
    throw new Error('Gagal mendapatkan pautan pengesahan Google Drive.');
  }

  return new Promise((resolve, reject) => {
    const popup = window.open(json.url, 'iab_drive_oauth', 'width=600,height=720');
    if (!popup) {
      reject(new Error('Tetingkap popup disekat oleh pelayar. Sila benarkan popup untuk laman ini.'));
      return;
    }

    const timeout = window.setTimeout(() => {
      window.removeEventListener('message', onMessage);
      reject(new Error('Tamat masa pengesahan Google Drive.'));
    }, 180000);

    const onMessage = (event: MessageEvent) => {
      const origin = event.origin || '';
      if (!origin.endsWith('.run.app') && !origin.includes('localhost') && origin !== window.location.origin) {
        return;
      }
      if (event.data?.type === 'IAB_DRIVE_OAUTH_SUCCESS') {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        resolve(event.data.message || 'Sambungan Google Drive berjaya.');
      } else if (event.data?.type === 'IAB_DRIVE_OAUTH_ERROR') {
        window.clearTimeout(timeout);
        window.removeEventListener('message', onMessage);
        reject(new Error(event.data.message || 'Pengesahan Google Drive gagal.'));
      }
    };

    window.addEventListener('message', onMessage);
  });
}

export async function testDriveConnectionApi(): Promise<{
  ok: boolean;
  email: string;
  rootFolderId: string;
  foldersVerified: number;
  folderIds: Record<string, string>;
}> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/drive/test', { method: 'POST', headers });
  return parseApiJsonResponse(res, 'Ujian sambungan Google Drive gagal.');
}

export async function disconnectDriveApi(): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/drive/disconnect', { method: 'POST', headers });
  await parseApiJsonResponse(res, 'Gagal memutuskan sambungan Google Drive.');
}

export async function uploadFileToDriveApi(params: {
  file: Blob;
  fileName: string;
  staffId: string;
  staffName?: string;
  staffEmail?: string;
  category: string;
  isPhoto?: boolean;
}): Promise<{
  fileId: string;
  folderId: string;
  fileName: string;
  mimeType: string;
  size: number;
}> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append('file', params.file, params.fileName);
  form.append('staffId', params.staffId);
  if (params.staffName) form.append('staffName', params.staffName);
  if (params.staffEmail) form.append('staffEmail', params.staffEmail);
  form.append('category', params.category);
  form.append('isPhoto', params.isPhoto ? 'true' : 'false');

  const res = await fetch('/api/drive/upload', {
    method: 'POST',
    headers,
    body: form,
  });
  return parseApiJsonResponse(res, 'Muat naik ke Google Drive gagal.');
}

export async function uploadStaffPhotosApi(params: {
  staffId: string;
  staffName?: string;
  staffEmail?: string;
  originalFile?: File | null;
  displayBlob: Blob;
}): Promise<{
  original: { fileId: string; folderId: string; fileName: string; mimeType: string; size: number } | null;
  display: { fileId: string; folderId: string; fileName: string; mimeType: string; size: number };
}> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append('staffId', params.staffId);
  if (params.staffName) form.append('staffName', params.staffName);
  if (params.staffEmail) form.append('staffEmail', params.staffEmail);
  if (params.originalFile) {
    form.append('original', params.originalFile, params.originalFile.name);
  }
  const safePrefix =
    (params.staffName || params.staffEmail || params.staffId)
      .replace(/[\\/:*?"<>|]+/g, ' ')
      .replace(/\s+/g, '_')
      .slice(0, 60) || params.staffId;
  form.append('display', params.displayBlob, `display_${safePrefix}.png`);

  const res = await fetch('/api/profile/photo', {
    method: 'POST',
    headers,
    body: form,
  });
  return parseApiJsonResponse(res, 'Muat naik gambar ke Google Drive gagal.');
}

export async function replaceDriveFileApi(
  driveFileId: string,
  file: File
): Promise<{ fileId: string; fileName: string; mimeType: string; size: number }> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append('file', file, file.name);
  const res = await fetch(`/api/drive/replace/${encodeURIComponent(driveFileId)}`, {
    method: 'POST',
    headers,
    body: form,
  });
  return parseApiJsonResponse(res, 'Gagal menggantikan fail dalam Google Drive.');
}

export async function deleteDriveFileApi(driveFileId: string, orphanCleanup = false): Promise<void> {
  const headers = await getAuthHeaders();
  const url = `/api/drive/file/${encodeURIComponent(driveFileId)}${orphanCleanup ? '?orphan=1' : ''}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  await parseApiJsonResponse(res, 'Gagal memadam fail dalam Google Drive.');
}

export async function fetchDriveFileBlob(
  driveFileId: string,
  download = false
): Promise<{ blobUrl: string; mimeType: string; fileName: string }> {
  const headers = await getAuthHeaders();
  const res = await fetch(
    `/api/drive/file/${encodeURIComponent(driveFileId)}${download ? '?download=1' : ''}`,
    { headers }
  );
  if (!res.ok) {
    await parseApiJsonResponse(res, 'Gagal memuat turun fail daripada Google Drive.');
  }
  const blob = await res.blob();
  const disposition = res.headers.get('content-disposition') || '';
  const match = disposition.match(/filename="([^"]+)"/);
  const fileName = match ? decodeURIComponent(match[1]) : 'dokumen';
  return {
    blobUrl: URL.createObjectURL(blob),
    mimeType: blob.type || 'application/octet-stream',
    fileName,
  };
}
