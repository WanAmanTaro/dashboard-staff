import * as XLSX from 'xlsx';
import type { AuditLog, CompetencyItem, StaffProfile } from '../types/iab';

export function exportStaffProfilesToExcel(
  profiles: StaffProfile[],
  fileNamePrefix = 'IAB_Modal_Insan',
  compMap?: Map<string, CompetencyItem[]>
) {
  const rows = profiles.map((p) => {
    const compItems = compMap?.get(p.staffId) || [];
    const appSkills = compItems.filter((i) => i.skillType === 'aplikasi');
    const knowSkills = compItems.filter((i) => i.skillType === 'pengetahuan');
    const otherSkills = compItems.filter(
      (i) => i.skillType !== 'aplikasi' && i.skillType !== 'pengetahuan'
    );

    const formatItem = (i: CompetencyItem) =>
      `${i.categoryName} (${i.level}, ${i.years} thn${
        i.certificateDriveFileId ? ', Ada Sijil' : i.hasCertificate ? ', Sijil Belum Muat Naik' : ''
      })`;

    const combinedSummary =
      compItems.length > 0
        ? compItems.map(formatItem).join('; ')
        : p.digitalCompetencies?.join('; ') || 'Belum Diisi';

    return {
      'ID Staf': p.staffId,
      Peranan: p.role || '-',
      'Nama Penuh': p.fullName,
      'Emel Rasmi': p.officialEmail,
      Jawatan: p.position || 'Belum Diisi',
      'Gred Hakiki': p.grade || 'Belum Diisi',
      'Gred KUP': p.kupGrade || 'TIDAK BERKENAAN',
      Skim: p.scheme || 'Belum Diisi',
      Kategori: p.isLecturer ? 'Pensyarah' : 'Bukan Pensyarah',
      Pusat: p.centerName || 'Belum Diisi',
      Jabatan: p.departmentName || 'Belum Diisi',
      'Kelayakan Tertinggi': p.highestQualification || 'Belum Diisi',
      'Kepakaran Utama': p.primaryExpertise || 'Belum Diisi',
      'Kepakaran Kedua': p.secondaryExpertise || '-',
      'Kemahiran Aplikasi AI': appSkills.length ? appSkills.map(formatItem).join('; ') : '-',
      'Kemahiran Pengetahuan AI':
        knowSkills.length || otherSkills.length
          ? [...knowSkills, ...otherSkills].map(formatItem).join('; ')
          : '-',
      'Kompetensi Digital & AI': combinedSummary,
      'Peratus Kelengkapan (%)': p.completionPercent,
      'Gambar Profil': p.hasPhoto ? 'Ada' : 'Tiada',
      'Bilangan Sijil': p.certificateCount,
      'Bilangan Penerbitan': p.publicationCount,
      Status: p.status,
    };
  });

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
