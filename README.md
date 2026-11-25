# Sistem Pengurusan Modal Insan dan Kepakaran IAB

Platform web rasmi **Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia** bagi pengurusan berpusat modal insan, biodata pegawai (Seksyen A–J), kepakaran instruksional, kompetensi digital dan kecerdasan buatan (AI), storan dokumen Google Drive terkawal, penjanaan profil profesional PDF, dan analisis kapasiti organisasi.

---

## 1. Seni Bina Sistem

- **Frontend:** React 19, TypeScript, Vite, Tailwind CSS v4, Recharts, jsPDF, SheetJS (`xlsx`).
- **Backend Proxy & OAuth:** Node.js + Express (`server.ts`, `server/authMiddleware.ts`, `server/driveVault.ts`).
- **Pangkalan Data & Pengesahan:** Firebase Authentication (Google Sign-In + Emel/Kata Laluan) dan Cloud Firestore (`firebase-blueprint.json` & `firestore.rules`).
- **Storan Fail Rasmi:** Satu akaun Pemilik Storan Google Drive rasmi melalui Google Drive API v3 (`drive.file` + `userinfo.email`) dengan token refresh disulitkan AES-256-GCM pada pelayan.

### Tahap Kawalan Akses (RBAC)
| Tahap | Peranan | Skop Capaian Data |
| :--- | :--- | :--- |
| **L1** | Ketua Pusat | Membaca profil pegawai & PII dalam pusat sendiri; mengurus profil sendiri; melihat Dashboard Pusat, Dashboard Jabatan, Direktori Kepakaran, dan Analisis Kapasiti. |
| **L2** | Ketua Jabatan | Membaca profil pegawai & PII dalam jabatan sendiri sahaja (terkunci); mengurus profil sendiri; melihat Dashboard Jabatan, Direktori Kepakaran, dan Analisis Kapasiti. |
| **L3** | Pensyarah | Mengurus profil/sijil/gambar sendiri; mencari pakar dalam Direktori Kepakaran; menjana PDF profil sendiri. |
| **L4** | Pegawai Bukan Pensyarah | Mengurus profil/sijil/gambar sendiri; mencari pakar dalam Direktori Kepakaran; menjana PDF profil sendiri. |
| **L5** | Bukan Pegawai / Staf Sokongan | Mengurus profil/sijil/gambar sendiri dan menjana PDF profil sendiri sahaja. |
| **Admin** | Pentadbir Sistem | Akses penuh kesemua 14 sub-modul Pentadbiran Sistem termasuk kelulusan pengguna, RBAC, Drive OAuth, Log Audit, Sandaran, dan Penjanaan Data Sampel UAT. |

Pentadbir Utama awal (*Bootstrap Admin*): `iab-1248@moe-dl.edu.my` (aktif sebaik sahaja disahkan emel). Akaun pendaftaran baharu tanpa jemputan rasmi diletakkan dalam status `pending` sehingga diluluskan oleh Admin.

---

## 2. Konfigurasi Wajib Selepas Pemasangan

### A. Aktifkan Log Masuk Emel & Kata Laluan dalam Firebase Console
1. Buka **Firebase Console** untuk projek `gen-lang-client-0981298587`.
2. Pergi ke **Authentication > Sign-in method**.
3. Pastikan **Google** diaktifkan dan aktifkan penyedia **Email/Password**.
4. *(Disyorkan)* Aktifkan **Multi-Factor Authentication (MFA)** bagi akaun Pentadbir Sistem (`Admin`), Ketua Pusat (`L1`), dan Ketua Jabatan (`L2`) di **Authentication > Settings > Multi-factor authentication**.

### B. Integrasi Pemilik Storan Google Drive (OAuth 2.0)
1. Buka **Google Cloud Console > APIs & Services > Library** dan aktifkan **Google Drive API**.
2. Pergi ke **APIs & Services > Credentials** dan cipta **OAuth 2.0 Client ID (Web Application)**.
3. Masukkan kedua-dua **Authorized redirect URIs** berikut dengan tepat:
   - `https://ais-dev-2t7lg5pwvibl4brc2xuhio-564116479865.asia-southeast1.run.app/api/drive/callback`
   - `https://ais-pre-2t7lg5pwvibl4brc2xuhio-564116479865.asia-southeast1.run.app/api/drive/callback`
4. Masukkan pemboleh ubah berikut ke dalam **AI Studio Secrets**:
   - `GOOGLE_DRIVE_CLIENT_ID`
   - `GOOGLE_DRIVE_CLIENT_SECRET`
   - `DRIVE_TOKEN_ENCRYPTION_KEY` (rentetan rawak minimum 32 aksara)
5. Log masuk sebagai **Admin**, buka **Pentadbiran Sistem > 6. Pengurusan Google Drive**, dan klik **Sambung Akaun Google Drive**.

---

## 3. Struktur Folder Google Drive IAB

Semua fail disimpan secara sulit (*private*, tiada akses awam) di bawah folder induk `IAB_HUMAN_CAPITAL_SYSTEM/`:
- `01_PROFILE_PHOTOS/<STAFF_ID>/` (menyimpan gambar asal & gambar paparan 1:1 secara berasingan)
- `02_ACADEMIC_CERTIFICATES/<STAFF_ID>/`
- `03_PROFESSIONAL_CERTIFICATES/<STAFF_ID>/`
- `04_COMPETENCY_CERTIFICATES/<STAFF_ID>/`
- `05_TRAINING_CERTIFICATES/<STAFF_ID>/`
- `06_OTHER_DOCUMENTS/<STAFF_ID>/`
- `07_GENERATED_PROFILES/<STAFF_ID>/`

---

## 4. Kesinambungan Operasi, Sandaran & Pemulihan

- **Pertukaran Pemilik Storan Drive:** Kongsikan folder induk `IAB_HUMAN_CAPITAL_SYSTEM` kepada akaun Google rasmi baharu terlebih dahulu, kemudian gunakan butang **Sambung Semula / Tukar Akaun Drive** di Modul Admin.
- **Pertukaran / Persaraan Pegawai:** Gunakan status `suspended` atau `inactive` pada akaun pengguna. Semua metadata Firestore dan fail sijil kekal terpelihara tanpa dipadam.
- **Sandaran Data:** Gunakan **Pentadbiran Sistem > 13. Sandaran & Pemulihan** untuk memuat turun salinan `.json` penuh atau **12. Eksport Data Rasmi** untuk laporan Excel (`.xlsx`).
- **Data Sampel UAT:** Tidak dimuatkan secara automatik ke rekod sebenar. Pentadbir boleh menjana 8 rekod UAT bertanda `IAB-UAT-*` secara eksplisit melalui **Pentadbiran Sistem > 13. Sandaran & Pemulihan**.
