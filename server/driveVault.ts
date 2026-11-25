import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import { google } from 'googleapis';

export const IAB_ROOT_FOLDER_NAME = 'IAB_HUMAN_CAPITAL_SYSTEM';

export const IAB_SUBFOLDERS = [
  '01_PROFILE_PHOTOS',
  '02_ACADEMIC_CERTIFICATES',
  '03_PROFESSIONAL_CERTIFICATES',
  '04_COMPETENCY_CERTIFICATES',
  '05_TRAINING_CERTIFICATES',
  '06_PUBLICATIONS',
  '07_GENERATED_PROFILES',
] as const;

export type IabSubfolderKey = (typeof IAB_SUBFOLDERS)[number];

interface EncryptedVaultPayload {
  iv: string;
  tag: string;
  ciphertext: string;
  connectedEmail: string;
  rootFolderId: string;
  folderIds: Record<string, string>;
  lastConnectedAt: string;
  lastUploadAt: string;
  uploadedDocumentsCount: number;
  uploadedPhotosCount: number;
}

interface DecryptedTokenData {
  refresh_token: string;
  access_token?: string;
  expiry_date?: number;
  scope?: string;
}

const VAULT_FILE = path.resolve(process.cwd(), '.drive_token_vault.enc.json');
const EPHEMERAL_KEY = crypto.randomBytes(32);

function getEncryptionKey(): { key: Buffer; persistent: boolean } {
  const envKey = (process.env.DRIVE_TOKEN_ENCRYPTION_KEY || '').trim();
  if (!envKey) {
    return { key: EPHEMERAL_KEY, persistent: false };
  }
  return {
    key: crypto.createHash('sha256').update(envKey).digest(),
    persistent: true,
  };
}

export function isDriveOAuthConfigured(): boolean {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  return Boolean(clientId && clientSecret);
}

export function getAppRedirectUri(fallbackHost?: string): string {
  const appUrl = (process.env.APP_URL || '').trim();
  if (appUrl && appUrl !== 'MY_APP_URL') {
    return `${appUrl.replace(/\/+$/, '')}/api/drive/callback`;
  }
  if (fallbackHost) {
    const protocol = fallbackHost.includes('localhost') ? 'http' : 'https';
    return `${protocol}://${fallbackHost}/api/drive/callback`;
  }
  return 'http://localhost:3000/api/drive/callback';
}

function createOAuthClient(redirectUri?: string) {
  const clientId = (process.env.GOOGLE_DRIVE_CLIENT_ID || '').trim();
  const clientSecret = (process.env.GOOGLE_DRIVE_CLIENT_SECRET || '').trim();
  if (!clientId || !clientSecret) {
    throw new Error('Konfigurasi GOOGLE_DRIVE_CLIENT_ID dan GOOGLE_DRIVE_CLIENT_SECRET belum ditetapkan.');
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri || getAppRedirectUri());
}

export function signOAuthState(adminUid: string): string {
  const { key } = getEncryptionKey();
  const payload = JSON.stringify({ uid: adminUid, ts: Date.now(), nonce: crypto.randomBytes(8).toString('hex') });
  const encoded = Buffer.from(payload).toString('base64url');
  const sig = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifyOAuthState(state: string): { valid: boolean; uid?: string } {
  const parts = (state || '').split('.');
  if (parts.length !== 2) return { valid: false };
  const [encoded, sig] = parts;
  const { key } = getEncryptionKey();
  const expectedSig = crypto.createHmac('sha256', key).update(encoded).digest('base64url');
  if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expectedSig))) {
    return { valid: false };
  }
  try {
    const data = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!data.ts || Date.now() - data.ts > 15 * 60 * 1000) {
      return { valid: false };
    }
    return { valid: true, uid: data.uid };
  } catch {
    return { valid: false };
  }
}

function readVault(): EncryptedVaultPayload | null {
  if (!fs.existsSync(VAULT_FILE)) return null;
  try {
    return JSON.parse(fs.readFileSync(VAULT_FILE, 'utf8'));
  } catch {
    return null;
  }
}

function writeVault(payload: EncryptedVaultPayload) {
  fs.writeFileSync(VAULT_FILE, JSON.stringify(payload, null, 2), { mode: 0o600 });
}

function encryptTokens(tokens: DecryptedTokenData): { iv: string; tag: string; ciphertext: string } {
  const { key } = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plain = JSON.stringify(tokens);
  const encrypted = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    ciphertext: encrypted.toString('base64'),
  };
}

function decryptTokens(vault: EncryptedVaultPayload): DecryptedTokenData {
  const { key } = getEncryptionKey();
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(vault.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(vault.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(vault.ciphertext, 'base64')),
    decipher.final(),
  ]);
  return JSON.parse(decrypted.toString('utf8'));
}

export function clearDriveVault() {
  if (fs.existsSync(VAULT_FILE)) {
    fs.unlinkSync(VAULT_FILE);
  }
}

export function generateDriveAuthUrl(adminUid: string, host?: string): string {
  const redirectUri = getAppRedirectUri(host);
  const oauth2Client = createOAuthClient(redirectUri);
  const state = signOAuthState(adminUid);
  return oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: [
      'https://www.googleapis.com/auth/drive.file',
      'https://www.googleapis.com/auth/userinfo.email',
    ],
    state,
  });
}

async function getAuthenticatedDriveClient() {
  const vault = readVault();
  if (!vault) {
    throw new Error('DRIVE_DISCONNECTED: Tiada sambungan Google Drive pemilik storan.');
  }
  const tokens = decryptTokens(vault);
  const oauth2Client = createOAuthClient();
  oauth2Client.setCredentials(tokens);

  // Persist refreshed tokens if rotated
  oauth2Client.on('tokens', (newTokens) => {
    const current = readVault();
    if (!current) return;
    try {
      const existingTokens = decryptTokens(current);
      const merged: DecryptedTokenData = {
        ...existingTokens,
        access_token: newTokens.access_token || existingTokens.access_token,
        expiry_date: newTokens.expiry_date || existingTokens.expiry_date,
        refresh_token: newTokens.refresh_token || existingTokens.refresh_token,
      };
      const enc = encryptTokens(merged);
      writeVault({ ...current, ...enc });
    } catch {
      // Ignore background rotation write error
    }
  });

  return {
    oauth2Client,
    drive: google.drive({ version: 'v3', auth: oauth2Client }),
    vault,
  };
}

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId?: string
): Promise<string> {
  const escaped = name.replace(/'/g, "\\'");
  const qParts = [
    `name = '${escaped}'`,
    `mimeType = 'application/vnd.google-apps.folder'`,
    `trashed = false`,
  ];
  if (parentId) {
    qParts.push(`'${parentId}' in parents`);
  }
  const listRes = await drive.files.list({
    q: qParts.join(' and '),
    fields: 'files(id, name)',
    spaces: 'drive',
    pageSize: 5,
  });
  if (listRes.data.files && listRes.data.files.length > 0 && listRes.data.files[0].id) {
    return listRes.data.files[0].id;
  }

  const createRes = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      ...(parentId ? { parents: [parentId] } : {}),
    },
    fields: 'id',
  });
  if (!createRes.data.id) {
    throw new Error(`Gagal mencipta folder Google Drive: ${name}`);
  }
  return createRes.data.id;
}

export async function ensureRootFolderStructure(drive: ReturnType<typeof google.drive>) {
  const rootFolderId = await findOrCreateFolder(drive, IAB_ROOT_FOLDER_NAME);
  const folderIds: Record<string, string> = {};
  for (const sub of IAB_SUBFOLDERS) {
    folderIds[sub] = await findOrCreateFolder(drive, sub, rootFolderId);
  }
  return { rootFolderId, folderIds };
}

export async function completeDriveOAuthCallback(code: string, host?: string) {
  const redirectUri = getAppRedirectUri(host);
  const oauth2Client = createOAuthClient(redirectUri);
  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token && !tokens.access_token) {
    throw new Error('Token OAuth Google Drive tidak diterima.');
  }
  oauth2Client.setCredentials(tokens);

  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const userInfo = await oauth2.userinfo.get();
  const connectedEmail = userInfo.data.email || '';

  const drive = google.drive({ version: 'v3', auth: oauth2Client });
  const { rootFolderId, folderIds } = await ensureRootFolderStructure(drive);

  const prevVault = readVault();
  const refreshToken =
    tokens.refresh_token || (prevVault ? decryptTokens(prevVault).refresh_token : '');
  if (!refreshToken) {
    throw new Error('Refresh token tiada. Sila sambung semula dengan keizinan luar talian (offline consent).');
  }

  const enc = encryptTokens({
    refresh_token: refreshToken,
    access_token: tokens.access_token || undefined,
    expiry_date: tokens.expiry_date || undefined,
    scope: tokens.scope || undefined,
  });

  const now = new Date().toISOString();
  const payload: EncryptedVaultPayload = {
    ...enc,
    connectedEmail,
    rootFolderId,
    folderIds,
    lastConnectedAt: now,
    lastUploadAt: prevVault?.lastUploadAt || '',
    uploadedDocumentsCount: prevVault?.uploadedDocumentsCount || 0,
    uploadedPhotosCount: prevVault?.uploadedPhotosCount || 0,
  };
  writeVault(payload);
  return getDriveStatusSummary();
}

export function getDriveStatusSummary() {
  const oauthConfigured = isDriveOAuthConfigured();
  const { persistent } = getEncryptionKey();
  const redirectUri = getAppRedirectUri();

  if (!oauthConfigured) {
    return {
      status: 'pending_configuration' as const,
      oauthConfigured: false,
      encryptionKeyPersistent: persistent,
      connectedEmail: '',
      rootFolderId: '',
      folderIds: {} as Record<string, string>,
      lastConnectedAt: '',
      lastUploadAt: '',
      uploadedDocumentsCount: 0,
      uploadedPhotosCount: 0,
      redirectUri,
      message: 'Pemboleh ubah persekitaran GOOGLE_DRIVE_CLIENT_ID dan GOOGLE_DRIVE_CLIENT_SECRET belum dikonfigurasikan di pelayan.',
    };
  }

  const vault = readVault();
  if (!vault) {
    return {
      status: 'disconnected' as const,
      oauthConfigured: true,
      encryptionKeyPersistent: persistent,
      connectedEmail: '',
      rootFolderId: '',
      folderIds: {} as Record<string, string>,
      lastConnectedAt: '',
      lastUploadAt: '',
      uploadedDocumentsCount: 0,
      uploadedPhotosCount: 0,
      redirectUri,
      message: 'Google Drive pemilik storan belum disambungkan.',
    };
  }

  try {
    decryptTokens(vault);
    return {
      status: 'connected' as const,
      oauthConfigured: true,
      encryptionKeyPersistent: persistent,
      connectedEmail: vault.connectedEmail,
      rootFolderId: vault.rootFolderId,
      folderIds: vault.folderIds,
      lastConnectedAt: vault.lastConnectedAt,
      lastUploadAt: vault.lastUploadAt,
      uploadedDocumentsCount: vault.uploadedDocumentsCount,
      uploadedPhotosCount: vault.uploadedPhotosCount,
      redirectUri,
      message: `Disambungkan kepada akaun pemilik storan (${vault.connectedEmail}).`,
    };
  } catch {
    return {
      status: 'error' as const,
      oauthConfigured: true,
      encryptionKeyPersistent: persistent,
      connectedEmail: vault.connectedEmail,
      rootFolderId: vault.rootFolderId,
      folderIds: vault.folderIds,
      lastConnectedAt: vault.lastConnectedAt,
      lastUploadAt: vault.lastUploadAt,
      uploadedDocumentsCount: vault.uploadedDocumentsCount,
      uploadedPhotosCount: vault.uploadedPhotosCount,
      redirectUri,
      message: 'Token tersimpan tidak dapat dinyahsulit (kunci penyulitan berubah). Sila sambung semula Google Drive.',
    };
  }
}

export async function testDriveConnection() {
  const { drive, vault } = await getAuthenticatedDriveClient();
  const about = await drive.about.get({ fields: 'user(emailAddress,displayName),storageQuota' });
  const { rootFolderId, folderIds } = await ensureRootFolderStructure(drive);
  const updated: EncryptedVaultPayload = {
    ...vault,
    connectedEmail: about.data.user?.emailAddress || vault.connectedEmail,
    rootFolderId,
    folderIds,
  };
  writeVault(updated);
  return {
    ok: true,
    email: updated.connectedEmail,
    rootFolderId,
    foldersVerified: Object.keys(folderIds).length,
    folderIds,
  };
}

export function mapCategoryToSubfolder(category: string): IabSubfolderKey {
  switch (category) {
    case 'PROFILE_PHOTO':
      return '01_PROFILE_PHOTOS';
    case 'Sijil Akademik':
      return '02_ACADEMIC_CERTIFICATES';
    case 'Sijil Profesional':
      return '03_PROFESSIONAL_CERTIFICATES';
    case 'Sijil Kompetensi':
      return '04_COMPETENCY_CERTIFICATES';
    case 'Sijil Latihan':
    case 'Sijil Pengiktirafan':
    case 'Dokumen Lain':
      return '05_TRAINING_CERTIFICATES';
    case 'PUBLICATION':
      return '06_PUBLICATIONS';
    case 'GENERATED_PROFILE':
      return '07_GENERATED_PROFILES';
    default:
      return '05_TRAINING_CERTIFICATES';
  }
}

export async function uploadFileToDrive(params: {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  staffId: string;
  category: string;
  isPhoto?: boolean;
}) {
  const { drive, vault } = await getAuthenticatedDriveClient();
  const subfolderKey = mapCategoryToSubfolder(params.category);
  let categoryFolderId = vault.folderIds?.[subfolderKey];

  if (!categoryFolderId) {
    const ensured = await ensureRootFolderStructure(drive);
    vault.rootFolderId = ensured.rootFolderId;
    vault.folderIds = ensured.folderIds;
    categoryFolderId = ensured.folderIds[subfolderKey];
  }

  // Strictly use non-sensitive Staff ID for employee subfolder (never IC number)
  const safeStaffId = params.staffId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const staffFolderId = await findOrCreateFolder(drive, safeStaffId, categoryFolderId);

  const res = await drive.files.create({
    requestBody: {
      name: params.fileName,
      parents: [staffFolderId],
      description: `IAB_STAFF_ID:${safeStaffId} CATEGORY:${params.category}`,
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: 'id, name, mimeType, size, parents',
  });

  if (!res.data.id) {
    throw new Error('Google Drive tidak mengembalikan File ID selepas muat naik.');
  }

  vault.lastUploadAt = new Date().toISOString();
  if (params.isPhoto) {
    vault.uploadedPhotosCount = (vault.uploadedPhotosCount || 0) + 1;
  } else {
    vault.uploadedDocumentsCount = (vault.uploadedDocumentsCount || 0) + 1;
  }
  writeVault(vault);

  return {
    fileId: res.data.id,
    folderId: staffFolderId,
    fileName: res.data.name || params.fileName,
    mimeType: res.data.mimeType || params.mimeType,
    size: Number(res.data.size || params.buffer.length),
  };
}

export async function replaceDriveFileContent(params: {
  fileId: string;
  buffer: Buffer;
  fileName: string;
  mimeType: string;
}) {
  const { drive } = await getAuthenticatedDriveClient();
  const res = await drive.files.update({
    fileId: params.fileId,
    requestBody: {
      name: params.fileName,
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.buffer),
    },
    fields: 'id, name, mimeType, size',
  });
  return {
    fileId: res.data.id || params.fileId,
    fileName: res.data.name || params.fileName,
    mimeType: res.data.mimeType || params.mimeType,
    size: Number(res.data.size || params.buffer.length),
  };
}

export async function streamDriveFile(fileId: string) {
  const { drive } = await getAuthenticatedDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, mimeType, size, trashed',
  });
  if (meta.data.trashed) {
    throw new Error('FILE_NOT_FOUND: Fail telah dipadam.');
  }
  const mediaRes = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'stream' }
  );
  return {
    name: meta.data.name || 'dokumen',
    mimeType: meta.data.mimeType || 'application/octet-stream',
    size: Number(meta.data.size || 0),
    stream: mediaRes.data as NodeJS.ReadableStream,
  };
}

export async function getDriveFileMetadata(fileId: string) {
  const { drive } = await getAuthenticatedDriveClient();
  const meta = await drive.files.get({
    fileId,
    fields: 'id, name, description',
  });
  return {
    id: meta.data.id || fileId,
    name: meta.data.name || '',
    description: meta.data.description || '',
  };
}

export async function deleteDriveFile(fileId: string) {
  const { drive } = await getAuthenticatedDriveClient();
  await drive.files.delete({ fileId });
  return { deleted: true, fileId };
}
