import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import type {
  Certificate,
  CompetencyRecord,
  ExpertiseRecord,
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
  publications: Publication[];
  certificates: Certificate[];
  photoDataUrl?: string | null;
}

export function generateProfessionalProfilePdf(
  bundle: ProfilePdfBundle,
  templateType: 'ringkas' | 'lengkap'
): { blob: Blob; fileName: string; dataVersion: string } {
  const { profile, pii, qualifications, expertise, competencies, publications, certificates, photoDataUrl } = bundle;
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

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(15);
  doc.text(profile.fullName || 'Tiada nama direkodkan', 14, cursorY + 6, { maxWidth: 142 });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(10.5);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `${profile.position || 'Jawatan belum diisi'}${profile.grade ? ` (${profile.grade})` : ''}`,
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

  if (templateType === 'ringkas') {
    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 9, textColor: [30, 41, 59], cellPadding: 3 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 55, fillColor: [248, 250, 252] } },
      head: [['Ringkasan Profil Eksekutif', 'Butiran Rekod Rasmi']],
      body: [
        ['Jawatan & Gred', `${profile.position || '-'} (${profile.grade || '-'})`],
        ['Pusat / Jabatan', `${profile.centerName || '-'} / ${profile.departmentName || '-'}`],
        ['Kelayakan Akademik Tertinggi', profile.highestQualification || 'Belum diisi'],
        ['Kepakaran Utama', profile.primaryExpertise || 'Belum diisi'],
        ['Kepakaran Kedua', profile.secondaryExpertise || 'Tiada rekod'],
        [
          'Kompetensi Digital & AI',
          profile.digitalCompetencies?.length
            ? profile.digitalCompetencies.join(', ')
            : 'Tiada rekod',
        ],
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
        ['Jawatan / Gred / Skim', `${profile.position || '-'} (${profile.grade || '-'}) · ${profile.scheme || '-'}`],
        ['Status & Tempoh Perkhidmatan', `${pii?.serviceStatus || '-'} (${pii?.yearsOfService ?? 0} tahun)`],
        ['Pusat / Jabatan / Unit', `${profile.centerName || '-'} / ${profile.departmentName || '-'} / ${profile.unit || '-'}`],
        ['Ketua Pusat / Ketua Jabatan', `${profile.headOfCenter || '-'} / ${profile.headOfDepartment || '-'}`],
      ],
    });

    const nextY1 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY1,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['D. Tahap', 'Institusi', 'Bidang Pengajian', 'Tahun']],
      body:
        qualifications.length > 0
          ? qualifications.map((q) => [q.level, q.institution, q.fieldOfStudy, q.graduationYear])
          : [['-', 'Tiada kelayakan akademik direkodkan', '-', '-']],
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
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['F. Kompetensi Digital & AI', 'Tahap', 'Tahun Pengalaman']],
      body:
        competencies?.items && competencies.items.length > 0
          ? competencies.items.map((c) => [c.categoryName, c.level, `${c.years} tahun`])
          : [['Tiada kompetensi digital/AI direkodkan', '-', '-']],
    });

    const nextY4 = (doc as any).lastAutoTable.finalY + 6;
    autoTable(doc, {
      startY: nextY4,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.8, textColor: [30, 41, 59], cellPadding: 2.5 },
      head: [['H. Jenis Penerbitan', 'Tajuk', 'Penerbit / Platform', 'Tahun']],
      body:
        publications.length > 0
          ? publications.map((p) => [p.type, p.title, p.publisherOrVenue || '-', p.year])
          : [['-', 'Tiada penerbitan atau penyelidikan direkodkan', '-', '-']],
    });

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

  const safeName = (profile.fullName || profile.staffId).replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Profil_${templateType === 'ringkas' ? 'Ringkas' : 'Lengkap'}_${profile.staffId}_${safeName}.pdf`;
  const blob = doc.output('blob');
  return { blob, fileName, dataVersion };
}
