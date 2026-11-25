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

export async function getDriveStatus(): Promise<DriveStatusResponse> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/drive/status', { headers });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Gagal mendapatkan status Google Drive.');
  }
  return json;
}

export async function openDriveOAuthPopup(mode: 'connect' | 'reconnect' = 'connect'): Promise<string> {
  const headers = await getAuthHeaders();
  const endpoint = mode === 'reconnect' ? '/api/drive/reconnect' : '/api/drive/connect';
  const method = mode === 'reconnect' ? 'POST' : 'GET';

  const res = await fetch(endpoint, { method, headers });
  const json = await res.json();
  if (!res.ok || !json.url) {
    throw new Error(json.error || 'Gagal mendapatkan pautan pengesahan Google Drive.');
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
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Ujian sambungan Google Drive gagal.');
  }
  return json;
}

export async function disconnectDriveApi(): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch('/api/drive/disconnect', { method: 'POST', headers });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Gagal memutuskan sambungan Google Drive.');
  }
}

export async function uploadFileToDriveApi(params: {
  file: Blob;
  fileName: string;
  staffId: string;
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
  form.append('category', params.category);
  form.append('isPhoto', params.isPhoto ? 'true' : 'false');

  const res = await fetch('/api/drive/upload', {
    method: 'POST',
    headers,
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Muat naik ke Google Drive gagal.');
  }
  return json;
}

export async function uploadStaffPhotosApi(params: {
  staffId: string;
  originalFile?: File | null;
  displayBlob: Blob;
}): Promise<{
  original: { fileId: string; folderId: string; fileName: string; mimeType: string; size: number } | null;
  display: { fileId: string; folderId: string; fileName: string; mimeType: string; size: number };
}> {
  const headers = await getAuthHeaders();
  const form = new FormData();
  form.append('staffId', params.staffId);
  if (params.originalFile) {
    form.append('original', params.originalFile, params.originalFile.name);
  }
  form.append('display', params.displayBlob, `display_${params.staffId}.png`);

  const res = await fetch('/api/profile/photo', {
    method: 'POST',
    headers,
    body: form,
  });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Muat naik gambar ke Google Drive gagal.');
  }
  return json;
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
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Gagal menggantikan fail dalam Google Drive.');
  }
  return json;
}

export async function deleteDriveFileApi(driveFileId: string, orphanCleanup = false): Promise<void> {
  const headers = await getAuthHeaders();
  const url = `/api/drive/file/${encodeURIComponent(driveFileId)}${orphanCleanup ? '?orphan=1' : ''}`;
  const res = await fetch(url, { method: 'DELETE', headers });
  const json = await res.json();
  if (!res.ok) {
    throw new Error(json.error || 'Gagal memadam fail dalam Google Drive.');
  }
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
    const errJson = await res.json().catch(() => ({}));
    throw new Error(errJson.error || 'Gagal memuat turun fail daripada Google Drive.');
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
