import express from 'express';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import path from 'node:path';
import fs from 'node:fs';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import {
  firestoreGetAsCaller,
  requireActiveStaff,
  requireAdmin,
  requireVerifiedAuth,
  verifyDriveFileAccess,
} from './server/authMiddleware.ts';
import {
  clearDriveVault,
  completeDriveOAuthCallback,
  deleteDriveFile,
  generateDriveAuthUrl,
  getDriveFileMetadata,
  getDriveStatusSummary,
  replaceDriveFileContent,
  testDriveConnection,
  uploadFileToDrive,
  verifyOAuthState,
  streamDriveFile,
} from './server/driveVault.ts';

dotenv.config();

const PORT = 3000;
const app = express();
app.set('trust proxy', 1);

app.use(express.json({ limit: '4mb' }));

// Rate limiters for sensitive endpoints
const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Terlalu banyak permintaan. Sila cuba sebentar lagi.' },
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Had muat naik dicapai. Sila tunggu sebentar.' },
});

app.use('/api/', apiLimiter);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 25 * 1024 * 1024, // 25 MB max server cap
  },
});

const ALLOWED_PHOTO_MIMES = new Set(['image/jpeg', 'image/jpg', 'image/png']);
const ALLOWED_CERT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
]);

// =========================================================
// PUBLIC / HEALTH ENDPOINTS (NO PII)
// =========================================================
app.get('/api/health', (_req, res) => {
  const driveStatus = getDriveStatusSummary();
  res.json({
    ok: true,
    service: 'iab-modal-insan-api',
    driveStatus: driveStatus.status,
    timestamp: new Date().toISOString(),
  });
});

// =========================================================
// AUTH ENDPOINTS
// =========================================================
app.get('/api/auth/profile', requireVerifiedAuth, async (req, res) => {
  const caller = req.caller!;
  res.json({
    uid: caller.uid,
    email: caller.email,
    emailVerified: caller.emailVerified,
    isAdmin: caller.isAdmin,
    isActive: caller.isActive,
    role: caller.role,
    staffId: caller.staffId,
    centerId: caller.centerId,
    departmentId: caller.departmentId,
  });
});

app.post('/api/auth/link-provider', requireVerifiedAuth, async (req, res) => {
  const caller = req.caller!;
  res.json({
    verified: true,
    uid: caller.uid,
    email: caller.email,
    message: 'Identiti Firebase disahkan untuk pemautan akaun.',
  });
});

// =========================================================
// GOOGLE DRIVE OAUTH & STORAGE OWNER ENDPOINTS
// =========================================================
app.get('/api/drive/status', requireActiveStaff, (_req, res) => {
  res.json(getDriveStatusSummary());
});

app.get('/api/drive/connect', requireAdmin, (req, res) => {
  try {
    const caller = req.caller!;
    const url = generateDriveAuthUrl(caller.uid, req.get('host'));
    res.json({ url });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Gagal menjana pautan OAuth Google Drive.' });
  }
});

app.post('/api/drive/reconnect', requireAdmin, (req, res) => {
  try {
    const caller = req.caller!;
    const url = generateDriveAuthUrl(caller.uid, req.get('host'));
    res.json({ url });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Gagal menjana pautan sambungan semula.' });
  }
});

app.get(['/api/drive/callback', '/api/drive/callback/'], async (req, res) => {
  const code = String(req.query.code || '');
  const state = String(req.query.state || '');
  const errorParam = String(req.query.error || '');

  const sendPopupClose = (success: boolean, message: string) => {
    const safeMsg = JSON.stringify(message);
    res.send(`<!doctype html>
<html lang="ms">
  <head><meta charset="utf-8"><title>Sambungan Google Drive IAB</title></head>
  <body style="font-family: system-ui, sans-serif; padding: 32px; background: #0B1F3B; color: #FFFFFF;">
    <div style="max-width: 440px; margin: 40px auto; background: #14325C; padding: 24px; border-radius: 12px; border: 1px solid rgba(198,151,56,0.4);">
      <h2 style="margin: 0 0 12px; color: #F5D076;">Integrasi Google Drive IAB</h2>
      <p id="msg" style="margin: 0 0 16px; line-height: 1.5;"></p>
      <p style="font-size: 13px; color: #CBD5E1;">Tetingkap ini akan ditutup secara automatik...</p>
    </div>
    <script>
      document.getElementById('msg').textContent = ${safeMsg};
      if (window.opener) {
        window.opener.postMessage({ type: ${success ? "'IAB_DRIVE_OAUTH_SUCCESS'" : "'IAB_DRIVE_OAUTH_ERROR'"}, message: ${safeMsg} }, '*');
        setTimeout(() => window.close(), 1200);
      }
    </script>
  </body>
</html>`);
  };

  if (errorParam) {
    sendPopupClose(false, `Kebenaran Google Drive dibatalkan atau ditolak (${errorParam}).`);
    return;
  }

  const verifiedState = verifyOAuthState(state);
  if (!verifiedState.valid) {
    sendPopupClose(false, 'Parameter keselamatan state OAuth tidak sah atau telah tamat tempoh.');
    return;
  }

  if (!code) {
    sendPopupClose(false, 'Kod pengesahan OAuth tidak diterima daripada Google.');
    return;
  }

  try {
    const summary = await completeDriveOAuthCallback(code, req.get('host'));
    sendPopupClose(true, `Berjaya disambungkan ke akaun storan ${summary.connectedEmail}.`);
  } catch (err: any) {
    sendPopupClose(false, err?.message || 'Gagal melengkapkan sambungan Google Drive.');
  }
});

app.post('/api/drive/test', requireAdmin, async (_req, res) => {
  try {
    const result = await testDriveConnection();
    res.json(result);
  } catch (err: any) {
    res.status(400).json({ ok: false, error: err?.message || 'Ujian sambungan Google Drive gagal.' });
  }
});

app.post('/api/drive/disconnect', requireAdmin, (_req, res) => {
  clearDriveVault();
  res.json({ disconnected: true, status: getDriveStatusSummary() });
});

// Upload certificate, PDF, or photo to Storage Owner's Drive
app.post('/api/drive/upload', uploadLimiter, requireActiveStaff, upload.single('file'), async (req, res) => {
  try {
    const caller = req.caller!;
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'Tiada fail dipilih untuk dimuat naik.' });
      return;
    }

    const staffId = String(req.body.staffId || caller.staffId || '').trim();
    const category = String(req.body.category || 'Dokumen Lain').trim();
    const isPhoto = req.body.isPhoto === 'true' || category === 'PROFILE_PHOTO';

    if (!staffId || !/^[a-zA-Z0-9_-]+$/.test(staffId)) {
      res.status(400).json({ error: 'Staff ID tidak sah.' });
      return;
    }

    if (!caller.isAdmin && caller.staffId !== staffId) {
      res.status(403).json({ error: 'Anda hanya dibenarkan memuat naik fail untuk profil sendiri.' });
      return;
    }

    if (isPhoto && !ALLOWED_PHOTO_MIMES.has(file.mimetype)) {
      res.status(400).json({ error: 'Format gambar tidak disokong. Sila muat naik JPG, JPEG atau PNG sahaja.' });
      return;
    }

    if (!isPhoto && category !== 'GENERATED_PROFILE' && !ALLOWED_CERT_MIMES.has(file.mimetype)) {
      res.status(400).json({ error: 'Format sijil tidak disokong. Sila muat naik fail PDF, JPG atau PNG sahaja.' });
      return;
    }

    const uploaded = await uploadFileToDrive({
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
      staffId,
      category,
      isPhoto,
    });

    res.json({ ok: true, ...uploaded });
  } catch (err: any) {
    const message = err?.message || 'Muat naik fail ke Google Drive gagal.';
    const status = message.includes('DRIVE_DISCONNECTED') || message.includes('GOOGLE_DRIVE_CLIENT_ID') ? 503 : 400;
    res.status(status).json({ error: message });
  }
});

// Upload both original untouched photo + processed 1:1 display photo separately
app.post(
  '/api/profile/photo',
  uploadLimiter,
  requireActiveStaff,
  upload.fields([
    { name: 'original', maxCount: 1 },
    { name: 'display', maxCount: 1 },
  ]),
  async (req, res) => {
    const uploadedIds: string[] = [];
    try {
      const caller = req.caller!;
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const originalFile = files?.original?.[0];
      const displayFile = files?.display?.[0];

      if (!displayFile) {
        res.status(400).json({ error: 'Gambar paparan 1:1 diperlukan.' });
        return;
      }

      const staffId = String(req.body.staffId || caller.staffId || '').trim();
      if (!staffId || !/^[a-zA-Z0-9_-]+$/.test(staffId)) {
        res.status(400).json({ error: 'Staff ID tidak sah.' });
        return;
      }
      if (!caller.isAdmin && caller.staffId !== staffId) {
        res.status(403).json({ error: 'Akses ditolak untuk mengemas kini gambar pegawai lain.' });
        return;
      }

      if (originalFile && !ALLOWED_PHOTO_MIMES.has(originalFile.mimetype)) {
        res.status(400).json({ error: 'Format gambar asal mestilah JPG, JPEG atau PNG.' });
        return;
      }
      if (!ALLOWED_PHOTO_MIMES.has(displayFile.mimetype)) {
        res.status(400).json({ error: 'Format gambar paparan mestilah JPG, JPEG atau PNG.' });
        return;
      }

      let originalRes = null;
      if (originalFile) {
        originalRes = await uploadFileToDrive({
          buffer: originalFile.buffer,
          fileName: `ORIGINAL_${staffId}_${Date.now()}_${originalFile.originalname}`,
          mimeType: originalFile.mimetype,
          staffId,
          category: 'PROFILE_PHOTO',
          isPhoto: true,
        });
        uploadedIds.push(originalRes.fileId);
      }

      const displayRes = await uploadFileToDrive({
        buffer: displayFile.buffer,
        fileName: `DISPLAY_1x1_${staffId}_${Date.now()}.png`,
        mimeType: displayFile.mimetype,
        staffId,
        category: 'PROFILE_PHOTO',
        isPhoto: true,
      });
      uploadedIds.push(displayRes.fileId);

      res.json({
        ok: true,
        original: originalRes,
        display: displayRes,
      });
    } catch (err: any) {
      // Cleanup partial upload if second upload failed
      for (const id of uploadedIds) {
        await deleteDriveFile(id).catch(() => {});
      }
      const message = err?.message || 'Muat naik gambar ke Google Drive gagal.';
      const status = message.includes('DRIVE_DISCONNECTED') || message.includes('GOOGLE_DRIVE_CLIENT_ID') ? 503 : 400;
      res.status(status).json({ error: message });
    }
  }
);

// Authenticated Drive file stream (NEVER public)
app.get('/api/drive/file/:id', requireActiveStaff, async (req, res) => {
  try {
    const caller = req.caller!;
    const fileId = String(req.params.id || '').trim();
    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      res.status(400).json({ error: 'ID fail Google Drive tidak sah.' });
      return;
    }

    const access = await verifyDriveFileAccess(caller, fileId, 'read');
    if (!access.allowed) {
      res.status(403).json({ error: 'Anda tidak mempunyai kebenaran untuk mengakses dokumen ini.' });
      return;
    }

    const file = await streamDriveFile(fileId);
    const download = req.query.download === '1';
    res.setHeader('Content-Type', file.mimeType);
    res.setHeader(
      'Content-Disposition',
      `${download ? 'attachment' : 'inline'}; filename="${encodeURIComponent(file.name)}"`
    );
    res.setHeader('Cache-Control', 'private, max-age=120');
    file.stream.pipe(res);
  } catch (err: any) {
    res.status(404).json({ error: err?.message || 'Fail tidak ditemui atau Drive tidak disambungkan.' });
  }
});

// Replace existing file in Drive
app.post('/api/drive/replace/:id', uploadLimiter, requireActiveStaff, upload.single('file'), async (req, res) => {
  try {
    const caller = req.caller!;
    const fileId = String(req.params.id || '').trim();
    const file = req.file;
    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId) || !file) {
      res.status(400).json({ error: 'ID fail yang sah dan fail baharu diperlukan.' });
      return;
    }

    const access = await verifyDriveFileAccess(caller, fileId, 'write');
    if (!access.allowed) {
      res.status(403).json({ error: 'Anda hanya dibenarkan menggantikan dokumen milik anda sendiri.' });
      return;
    }

    if (!ALLOWED_CERT_MIMES.has(file.mimetype)) {
      res.status(400).json({ error: 'Format fail tidak disokong.' });
      return;
    }

    const updated = await replaceDriveFileContent({
      fileId,
      buffer: file.buffer,
      fileName: file.originalname,
      mimeType: file.mimetype,
    });

    res.json({ ok: true, ...updated });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Gagal menggantikan fail di Google Drive.' });
  }
});

// Delete / orphan cleanup file in Drive
app.delete('/api/drive/file/:id', requireActiveStaff, async (req, res) => {
  try {
    const caller = req.caller!;
    const fileId = String(req.params.id || '').trim();
    const isOrphanCleanup = req.query.orphan === '1';

    if (!fileId || !/^[a-zA-Z0-9_-]+$/.test(fileId)) {
      res.status(400).json({ error: 'ID fail tidak sah.' });
      return;
    }

    if (isOrphanCleanup) {
      if (!caller.isAdmin) {
        const meta = await getDriveFileMetadata(fileId);
        const safeStaffId = caller.staffId.replace(/[^a-zA-Z0-9_-]/g, '_');
        if (!safeStaffId || !meta.description.includes(`IAB_STAFF_ID:${safeStaffId}`)) {
          res.status(403).json({ error: 'Anda tidak dibenarkan membersihkan fail milik pegawai lain.' });
          return;
        }
      }
    } else {
      const access = await verifyDriveFileAccess(caller, fileId, 'write');
      if (!access.allowed) {
        res.status(403).json({ error: 'Anda tidak dibenarkan memadam dokumen ini.' });
        return;
      }
    }

    const result = await deleteDriveFile(fileId);
    res.json({ ok: true, ...result });
  } catch (err: any) {
    res.status(400).json({ error: err?.message || 'Gagal memadam fail Google Drive.' });
  }
});

// Server-validated profile metadata endpoint
app.get('/api/profile/:staffId', requireActiveStaff, async (req, res) => {
  try {
    const caller = req.caller!;
    const staffId = String(req.params.staffId || '').trim();
    if (!staffId || !/^[a-zA-Z0-9_-]+$/.test(staffId)) {
      res.status(400).json({ error: 'Staff ID tidak sah.' });
      return;
    }
    const doc = await firestoreGetAsCaller(`staff_profiles/${staffId}`, caller.idToken);
    if (!doc) {
      res.status(404).json({ error: 'Profil pegawai tidak ditemui.' });
      return;
    }
    res.json(doc);
  } catch (err: any) {
    res.status(403).json({ error: err?.message || 'Akses profil ditolak.' });
  }
});

// =========================================================
// VITE MIDDLEWARE (DEV) OR STATIC DIST (PROD)
// =========================================================
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distDir));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distDir, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sistem Pengurusan Modal Insan IAB berjalan di port ${PORT}`);
  });
}

startServer();
