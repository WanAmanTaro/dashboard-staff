# Spesifikasi Keselamatan Firestore (Phase 0: Payload-First Security TDD)

## 1. Data Invariants
1. **Identity Integrity**: Setiap dokumen pengguna (`/users/{uid}`) hanya boleh dicipta oleh pemilik `uid` yang telah disahkan emelnya (`email_verified == true`), atau oleh Admin. Pengguna biasa tidak boleh menetapkan `isAdmin: true`, `status: 'active'` (kecuali melalui tuntutan jemputan sah atau bootstrap admin), atau menukar `role` sendiri.
2. **Strict RBAC Scope**:
   - **Admin**: Akses penuh pengurusan pengguna, organisasi, jabatan, tetapan sistem, katalog kepakaran/kompetensi, `drive_settings`, dan membaca `audit_logs`.
   - **L1 (Ketua Pusat)**: Boleh membaca semua profil pegawai, kelayakan, kepakaran, kompetensi, penerbitan dan sijil dalam pusatnya sahaja (`centerId`). Tidak boleh mengubah profil pegawai lain secara senyap.
   - **L2 (Ketua Jabatan)**: Boleh membaca semua profil dan rekod dalam jabatannya sahaja (`departmentId`). Tidak boleh mengubah profil pegawai lain.
   - **L3 (Pensyarah) & L4 (Bukan Pensyarah - Pegawai)**: Boleh membaca dan mengemas kini profil/rekod sendiri sahaja, dan boleh membaca direktori aktif organisasi (tanpa PII terhad).
   - **L5 (Bukan Pensyarah - Bukan Pegawai)**: Boleh membaca dan mengemas kini profil sendiri sahaja; akses disekat terhadap data direktori atau pegawai lain.
3. **PII Isolation**: Maklumat sensitif (`phone`, `icNumber`, `altContact`, `appointmentDate`) diasingkan ke subkoleksi `/staff_profiles/{staffId}/private/{docId}` dan hanya boleh dibaca oleh pemilik `uid`, L1 (pusat sama), L2 (jabatan sama), atau Admin.
4. **Immutable Audit Trail**: Koleksi `/audit_logs/{logId}` membenarkan `create` oleh pengguna aktif yang disahkan untuk rekod milik `actorUid == request.auth.uid`, dan `read` oleh Admin sahaja; `update` dan `delete` diharamkan sepenuhnya (`if false`).
5. **Temporal Integrity & Anti-Update-Gap**: Semua ciptaan menggunakan `createdAt`/`updatedAt` yang sepadan dengan `request.time` (atau dalam tetingkap cap masa pelayan `±10s` daripada `request.time` bagi keserasian `serverTimestamp()`), semua kemas kini mengekalkan `createdAt == existing().createdAt` dan `updatedAt` pada masa pelayan, dan setiap medan terhad saiz (`<= max`) serta kunci dokumen disekat melalui `hasOnly(...)`.
6. **Non-Existent Document & Non-Empty Scope Guard**: Operasi `get` ke atas dokumen yang belum wujud (`resource == null`) bagi `staff_profiles`, `private/pii`, `expertise`, `competencies`, dan `profile_photos` hanya dibenarkan untuk Admin, pemilik `staffId` sendiri, atau pembaca dalam skop apabila rekod induk `staff_profiles/{staffId}` wujud; skop `L1`/`L2` turut mewajibkan `centerId != ''` / `departmentId != ''`.
7. **Unlinked Staff Record Claim Integrity**: Apabila dokumen sedia ada mempunyai `uid == ''` dan `staffId == userDoc().staffId`, pemilik aktif yang disahkan (`isActiveUser()`) hanya boleh menuntut pemilikan dengan menetapkan `uid == request.auth.uid` serta `updatedBy == request.auth.uid`; rekod yang sudah mempunyai `uid` bukan kosong tidak boleh dituntut oleh pengguna lain.
8. **Safe `userDoc()` Field Access**: Semua semakan peranan dan pemilikan terhadap dokumen `/users/{uid}` mengesahkan kewujudan kunci (`'field' in userDoc()`) terlebih dahulu agar ralat medan tiada tidak menggugurkan operasi sah.

## 2. The "Dirty Dozen" Payloads (Mesti Ditolak dengan PERMISSION_DENIED)
1. **Privilege Escalation Self-Signup**: Pengguna biasa mencipta `/users/{uid}` dengan `{ isAdmin: true, status: "active", role: "L1" }`.
2. **Self-Role Promotion Update**: Pengguna L3 mengemas kini `/users/{uid}` untuk menukar `{ role: "L1", isAdmin: true }`.
3. **Unverified Email Write**: Pengguna dengan `email_verified: false` cuba menulis ke `/staff_profiles/{staffId}`.
4. **Cross-Owner Profile Tampering**: Pengguna L3 A cuba mengemas kini `/staff_profiles/IAB-STF-0002` milik pengguna B.
5. **PII Snooping by L3/L5**: Pengguna L3 atau L5 cuba membaca `/staff_profiles/IAB-STF-0002/private/pii` milik pegawai lain.
6. **Cross-Department L2 Read**: Ketua Jabatan (L2) Jabatan A cuba membaca `/staff_profiles/{staffId}/private/pii` pegawai Jabatan B.
7. **L5 Directory Scraping**: Pengguna L5 cuba `list` koleksi `/staff_profiles` tanpa penapis `uid == request.auth.uid`.
8. **Shadow Field Injection**: Penyerang menghantar `{ fullName: "Ali", shadowVerified: true }` semasa `create` atau `update` `/staff_profiles/{staffId}`.
9. **ID Poisoning**: Penyerang menghantar document ID melebihi 128 aksara atau aksara khas (`../admin`) ke `/certificates/{certId}`.
10. **Audit Log Tampering**: Pengguna biasa atau Admin cuba `update` atau `delete` dokumen dalam `/audit_logs/{logId}`.
11. **Timestamp Forgery**: Penyerang menghantar `createdAt` palsu dari klien yang tidak sama dengan `request.time`.
12. **Array/String Resource Exhaustion**: Penyerang menghantar `digitalCompetencies` dengan > 30 item atau string > 2000 aksara.
