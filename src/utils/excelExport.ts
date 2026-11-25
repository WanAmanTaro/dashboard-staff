import * as XLSX from 'xlsx';
import type { AuditLog, StaffProfile } from '../types/iab';

export function exportStaffProfilesToExcel(profiles: StaffProfile[], fileNamePrefix = 'IAB_Modal_Insan') {
  const rows = profiles.map((p) => ({
    'ID Staf': p.staffId,
    'Nama Penuh': p.fullName,
    'Emel Rasmi': p.officialEmail,
    Jawatan: p.position || 'Belum Diisi',
    Gred: p.grade || 'Belum Diisi',
    Skim: p.scheme || 'Belum Diisi',
    Kategori: p.isLecturer ? 'Pensyarah' : 'Bukan Pensyarah',
    Pusat: p.centerName || 'Belum Diisi',
    Jabatan: p.departmentName || 'Belum Diisi',
    'Kelayakan Tertinggi': p.highestQualification || 'Belum Diisi',
    'Kepakaran Utama': p.primaryExpertise || 'Belum Diisi',
    'Kepakaran Kedua': p.secondaryExpertise || '-',
    'Kompetensi Digital & AI': p.digitalCompetencies?.join('; ') || 'Belum Diisi',
    'Peratus Kelengkapan (%)': p.completionPercent,
    'Gambar Profil': p.hasPhoto ? 'Ada' : 'Tiada',
    'Bilangan Sijil': p.certificateCount,
    'Bilangan Penerbitan': p.publicationCount,
    Status: p.status,
  }));

  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Profil Pegawai');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `${fileNamePrefix}_${stamp}.xlsx`);
}

export function exportAuditLogsToExcel(logs: AuditLog[]) {
  const rows = logs.map((l) => ({
    'ID Log': l.id,
    'Actor UID': l.actorUid,
    'Emel Pelaku': l.actorEmail,
    'ID Staf': l.staffId || '-',
    'Jenis Aktiviti': l.actionType,
    'Objek Terlibat': `${l.targetType}:${l.targetId}`,
    Keputusan: l.outcome === 'success' ? 'Berjaya' : 'Gagal',
    Butiran: l.details,
  }));
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, ws, 'Audit Log');
  const stamp = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(wb, `IAB_Audit_Log_${stamp}.xlsx`);
}
