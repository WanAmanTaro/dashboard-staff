import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildSafeDriveFilePrefix,
  getIabCertDisplayLabel,
  sortPublicationsDefault,
  sortQualificationsHighestFirst,
} from '../lib/constants';
import type {
  Certificate,
  CompetencyRecord,
  ExpertiseRecord,
  IabCompetencyRecord,
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
} from '../types/iab';

export interface ProfilePdfBundle {
  profile: StaffProfile;
  pii: StaffPrivatePII | null;
  qualifications: Qualification[];
  expertise: ExpertiseRecord | null;
  competencies: CompetencyRecord | null;
  iabCompetencies?: IabCompetencyRecord | null;
  publications: Publication[];
  certificates: Certificate[];
  photoDataUrl?: string | null;
}

export function generateProfessionalProfilePdf(
  bundle: ProfilePdfBundle,
  templateType: 'ringkas' | 'lengkap'
): { blob: Blob; fileName: string; dataVersion: string } {
  const {
    profile,
    pii,
    qualifications,
    expertise,
    competencies,
    iabCompetencies,
    publications,
    certificates,
    photoDataUrl,
  } = bundle;
  const sortedQualifications = sortQualificationsHighestFirst(qualifications);
  const sortedPublications = sortPublicationsDefault(publications);

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const nowStr = new Date().toLocaleString('ms-MY', {
    dateStyle: 'long',
    timeStyle: 'short',
  });
  const dataVersion = `v-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}`;

  // Official IAB Navy Header Banner
  doc.setFillColor(11, 31, 59); // #0B1F3B
  doc.rect(0, 0, 210, 34, 'F');
  doc.setFillColor(198, 151, 56); // #C69738 gold stripe
  doc.rect(0, 34, 210, 1.5, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('INSTITUT AMINUDDIN BAKI (IAB)', 14, 13);
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(226, 232, 240);
  doc.text('KEMENTERIAN PENDIDIKAN MALAYSIA', 14, 19);
  doc.setTextColor(245, 208, 118);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text(
    templateType === 'ringkas'
      ? 'PROFIL PROFESIONAL PEGAWAI (RINGKAS)'
      : 'PROFIL PROFESIONAL PEGAWAI (LENGKAP)',
    14,
    27
  );

  doc.setTextColor(203, 213, 225);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.text(`ID Staf: ${profile.staffId}`, 196, 13, { align: 'right' });
  doc.text(`Dijana: ${nowStr}`, 196, 19, { align: 'right' });
  doc.text(`Versi: ${dataVersion}`, 196, 25, { align: 'right' });

  let cursorY = 44;

  // Identity + Optional Photo
  if (photoDataUrl) {
    try {
      doc.addImage(photoDataUrl, 'PNG', 162, cursorY, 34, 34);
      doc.setDrawColor(198, 151, 56);
      doc.setLineWidth(0.4);
      doc.rect(162, cursorY, 34, 34);
    } catch {
      // Skip image if unreadable
    }
  }

  const gradeText = [
    profile.grade ? `Hakiki: ${profile.grade}` : '',
    profile.kupGrade && profile.kupGrade !== 'TIDAK BERKENAAN' ? `KUP: ${profile.kupGrade}` : '',
  ]
    .filter(Boolean)
    .join(' / ');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(profile.fullName || 'Tiada nama direkodkan', 14, cursorY + 6, { maxWidth: 142 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `${profile.position || 'Jawatan belum diisi'}${gradeText ? ` (${gradeText})` : ''}`,
    14,
    cursorY + 14,
    { maxWidth: 142 }
  );
  doc.text(profile.departmentName || 'Jabatan belum diisi', 14, cursorY + 20, { maxWidth: 142 });
  doc.text(profile.centerName || 'Pusat belum diisi', 14, cursorY + 26, { maxWidth: 142 });
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text(`Emel Rasmi: ${profile.officialEmail || '-'}`, 14, cursorY + 32);

  cursorY += 42;

  const compItems = competencies?.items || [];
  const appSummary = compItems
    .filter((i) => i.skillType === 'aplikasi')
    .map((i) => `${i.categoryName} (${i.level}, ${i.years} thn)`);
  const knowSummary = compItems
    .filter((i) => i.skillType !== 'aplikasi')
    .map((i) => `${i.categoryName} (${i.level}, ${i.years} thn)`);

  const iabCertsAda = (iabCompetencies?.certifications || []).filter((c) => c.status === 'Ada');
  const iabModulesList = iabCompetencies?.modules || [];

  if (templateType === 'ringkas') {
    const digitalRingkas =
      compItems.length > 0
        ? [
            appSummary.length ? `Aplikasi: ${appSummary.join(', ')}` : '',
            knowSummary.length ? `Pengetahuan: ${knowSummary.join(', ')}` : '',
          ]
            .filter(Boolean)
            .join('\n')
        : profile.digitalCompetencies?.length
        ? profile.digitalCompetencies.join(', ')
        : 'Tiada rekod';

    const iabRingkas =
      iabCertsAda.length > 0 || iabModulesList.length > 0
        ? [
            iabCertsAda.length
              ? `Pensijilan: ${iabCertsAda.map((c) => `${getIabCertDisplayLabel(c.key, c.label)}${c.passYear ? ` (${c.passYear})` : ''}`).join(', ')}`
              : '',
            iabModulesList.length
              ? `Modul IAB: ${iabModulesList.map((m) => `${m.moduleName} (${m.contribution}, ${m.year})`).join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'Tiada rekod';

    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59], cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } },
      head: [['Ringkasan Profil Eksekutif', 'Butiran Rekod Rasmi']],
      body: [
        [
          'Jawatan & Gred',
          `${profile.position || '-'} (Hakiki: ${profile.grade || '-'} | KUP: ${
            profile.kupGrade || 'TIDAK BERKENAAN'
          })`,
        ],
        ['Pusat / Jabatan', `${profile.centerName || '-'} / ${profile.departmentName || '-'}`],
        [
          'Kelayakan Akademik Tertinggi',
          sortedQualifications[0]
            ? `${sortedQualifications[0].level} — ${sortedQualifications[0].fieldOfStudy} (${sortedQualifications[0].institution}, ${sortedQualifications[0].graduationYear})`
            : profile.highestQualification || 'Belum diisi',
        ],
        ['Kepakaran Utama', profile.primaryExpertise || 'Belum diisi'],
        ['Kepakaran Kedua', profile.secondaryExpertise || 'Tiada rekod'],
        ['Kompetensi Digital & AI', digitalRingkas],
        ['Kompetensi IAB', iabRingkas],
        [
          'Pengalaman Profesional',
          expertise?.professionalExp || expertise?.teachingExp || 'Tiada rekod pengalaman profesional.',
        ],
      ],
    });
  } else {
    // PROFIL LENGKAP
    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.6 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] } },
      head: [['A, B & C: Biodata, Perkhidmatan & Organisasi', 'Maklumat Direkodkan']],
      body: [
        ['Nama Penuh', profile.fullName || '-'],
        ['ID Staf / Emel Rasmi', `${profile.staffId} · ${profile.officialEmail || '-'}`],
        ['Telefon / Hubungan', pii?.phone || 'Terhad / Belum diisi'],
        [
          'Jawatan / Gred / Skim',
          `${profile.position || '-'} (Hakiki: ${profile.grade || '-'} | KUP: ${
            profile.kupGrade || 'TIDAK BERKENAAN'
          }) · ${profile.scheme || '-'}`,
        ],
        ['Status & Tempoh Perkhidmatan', `${pii?.serviceStatus || '-'} (${pii?.yearsOfService ?? 0} tahun)`],
        ['Pusat / Jabatan / Unit', `${profile.centerName || '-'} / ${profile.departmentName || '-'} / ${profile.unit || '-'}`],
        ['Ketua Pusat / Ketua Jabatan', `${profile.headOfCenter || 'TIADA MAKLUMAT'} / ${profile.headOfDepartment || 'TIADA MAKLUMAT'}`],
      ],
    });

    const nextY1 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY1,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['D. Bil.', 'Tahap', 'Institusi', 'Bidang Pengajian', 'Tahun Tamat']],
      body:
        sortedQualifications.length > 0
          ? sortedQualifications.map((q, idx) => [
              `${idx + 1}.`,
              q.level,
              q.institution,
              q.fieldOfStudy,
              q.graduationYear,
            ])
          : [['-', '-', 'Tiada kelayakan akademik direkodkan', '-', '-']],
    });

    const nextY2 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY2,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 52, fillColor: [248, 250, 252] } },
      head: [['E & G: Kepakaran & Pengalaman', 'Butiran']],
      body: [
        ['Kepakaran Utama', expertise?.primaryExpertise || profile.primaryExpertise || 'Belum diisi'],
        ['Kepakaran Kedua', expertise?.secondaryExpertise || profile.secondaryExpertise || 'Tiada rekod'],
        ['Bidang Penyelidikan', expertise?.researchAreas?.join(', ') || 'Tiada rekod'],
        ['Bidang Latihan / Pengajaran', expertise?.trainingAreas?.join(', ') || expertise?.teachingAreas?.join(', ') || 'Tiada rekod'],
        ['Pengalaman Mengajar & Pengurusan', [expertise?.teachingExp, expertise?.managementExp].filter(Boolean).join(' | ') || 'Tiada rekod'],
        ['Fasilitator, Penceramah & Jurulatih', [expertise?.facilitatorExp, expertise?.speakerExp, expertise?.coachExp].filter(Boolean).join(' | ') || 'Tiada rekod'],
        ['Projek & Profesional', [expertise?.projectExp, expertise?.professionalExp].filter(Boolean).join(' | ') || 'Tiada rekod'],
      ],
    });

    const nextY3 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY3,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['F. Kompetensi Digital & AI', 'Kategori', 'Tahap', 'Pengalaman', 'Sijil Kursus', 'Sah Laku']],
      body:
        compItems.length > 0
          ? compItems.map((c) => [
              c.categoryName,
              c.skillType === 'aplikasi' ? 'Kemahiran Aplikasi' : 'Kemahiran Pengetahuan',
              c.level,
              `${c.years} tahun`,
              c.certificateDriveFileId ? 'Ada' : c.hasCertificate ? 'Ada (Belum Muat Naik)' : 'Tiada',
              c.skillType === 'aplikasi'
                ? c.hasValidityPeriod && c.certificateStartDate && c.certificateEndDate
                  ? `${c.certificateValidityDuration || ''} (${c.certificateStartDate} - ${c.certificateEndDate})`.trim()
                  : 'TIDAK BERKENAAN'
                : '-',
            ])
          : [['Tiada kompetensi digital/AI direkodkan', '-', '-', '-', '-', '-']],
    });

    const nextY4 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY4,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['H. Bil.', 'Kategori', 'Tajuk', 'Tahun', 'Pencapaian', 'Penerbit / Platform']],
      body:
        sortedPublications.length > 0
          ? sortedPublications.map((p, idx) => [
              `${idx + 1}.`,
              p.type,
              p.title,
              p.year,
              p.achievement || 'Tidak Berkenaan',
              p.publisherOrVenue || '-',
            ])
          : [['-', '-', 'Tiada penerbitan atau penyelidikan direkodkan', '-', '-', '-']],
    });

    if (iabCompetencies) {
      const nextY4b = (doc as any).lastAutoTable.finalY + 6;
      autoTable(doc, {
        startY: nextY4b,
        theme: 'grid',
        headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
        bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
        head: [['Kompetensi IAB — Bahagian A (Pensijilan)', 'Status', 'Tahun Lulus']],
        body:
          iabCompetencies.certifications.length > 0
            ? iabCompetencies.certifications.map((c) => [
                getIabCertDisplayLabel(c.key, c.label),
                c.status,
                c.status === 'Ada' ? c.passYear || '-' : '-',
              ])
            : [['Tiada rekod pensijilan IAB', '-', '-']],
      });

      const nextY4c = (doc as any).lastAutoTable.finalY + 6;
      autoTable(doc, {
        startY: nextY4c,
        theme: 'grid',
        headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
        bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
        head: [['Kompetensi IAB — Bahagian B (Modul / CPD)', 'Tahun', 'Sumbangan', 'Status']],
        body:
          iabModulesList.length > 0
            ? iabModulesList.map((m) => [m.moduleName, m.year, m.contribution, m.activeStatus])
            : [['Tiada sumbangan modul/CPD direkodkan', '-', '-', '-']],
      });
    }

    const nextY5 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY5,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['J. Nama Sijil / Dokumen', 'Kategori', 'Rujukan Storan Terkawal']],
      body:
        certificates.length > 0
          ? certificates.map((c) => [c.title, c.category, `Portal IAB /api/drive/file/${c.driveFileId}`])
          : [['Tiada sijil dimuat naik', '-', '-']],
    });
  }

  // Footer page numbering
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `Dokumen Rasmi Dalaman — Sistem Pengurusan Modal Insan dan Kepakaran IAB | Halaman ${i} daripada ${pageCount}`,
      14,
      289
    );
  }

  const safeName = buildSafeDriveFilePrefix(profile.fullName, profile.officialEmail, profile.staffId);
  const fileName = `Profil_${templateType === 'ringkas' ? 'Ringkas' : 'Lengkap'}_${safeName}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName, dataVersion };
}
