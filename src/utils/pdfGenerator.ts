import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  buildSafeDriveFilePrefix,
  getIabCertDisplayLabel,
  getProgramEvaluationRating,
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
  StaffAchievementsRecord,
  StaffFunctionsRecord,
  StaffPrivatePII,
  StaffProfile,
  TeachingExperienceRecord,
} from '../types/iab';

export interface ProfilePdfBundle {
  profile: StaffProfile;
  pii: StaffPrivatePII | null;
  qualifications: Qualification[];
  expertise: ExpertiseRecord | null;
  competencies: CompetencyRecord | null;
  iabCompetencies?: IabCompetencyRecord | null;
  staffFunctions?: StaffFunctionsRecord | null;
  staffAchievements?: StaffAchievementsRecord | null;
  teachingExperience?: TeachingExperienceRecord | null;
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
    staffFunctions,
    staffAchievements,
    teachingExperience,
    publications,
    certificates,
    photoDataUrl,
  } = bundle;

  const sortedQualifications = sortQualificationsHighestFirst(qualifications);
  const sortedPublications = sortPublicationsDefault(publications);
  const researchPubs = sortedPublications.filter((p) => p.type === 'Penyelidikan');
  const publishingPubs = sortedPublications.filter((p) => p.type !== 'Penyelidikan');

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
  const iabTeaching = teachingExperience?.iabTeachingList || expertise?.iabTeachingList || [];
  const schoolTeaching =
    teachingExperience?.schoolTeachingList || expertise?.schoolTeachingList || [];
  const extTeaching =
    teachingExperience?.externalTeachingList || expertise?.externalTeachingList || [];

  const apcAwards = staffAchievements?.apcAwards || [];
  const innovations = staffAchievements?.innovations || [];
  const achResearch = staffAchievements?.researchOutputs || [];
  const otherAch = staffAchievements?.otherAchievements || [];

  const getLastY = () => ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || cursorY) + 6;

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
              ? `Pensijilan: ${iabCertsAda
                  .map((c) => `${getIabCertDisplayLabel(c.key, c.label)}${c.passYear ? ` (${c.passYear})` : ''}`)
                  .join(', ')}`
              : '',
            iabModulesList.length
              ? `Modul IAB: ${iabModulesList
                  .map((m) => `${m.moduleName} (${m.contribution}, ${m.year})`)
                  .join(', ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : 'Tiada rekod';

    const teachingRingkas =
      iabTeaching.length + schoolTeaching.length + extTeaching.length > 0
        ? [
            iabTeaching.length
              ? `Di IAB: ${iabTeaching.map((t) => `${t.moduleOrField} (${t.teachingType}, ${t.years} thn)`).join('; ')}`
              : '',
            schoolTeaching.length
              ? `Di Sekolah: ${schoolTeaching.map((s) => `${s.subject} (${s.years} thn)`).join('; ')}`
              : '',
            extTeaching.length
              ? `Luar: ${extTeaching.map((e) => `${e.institution} - ${e.moduleOrField} (${e.years} thn)`).join('; ')}`
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : expertise?.professionalExp || expertise?.teachingExp || 'Tiada rekod pengalaman mengajar.';

    const achRingkas =
      apcAwards.length + innovations.length + achResearch.length + otherAch.length > 0
        ? [
            apcAwards.length ? `APC: ${apcAwards.map((a) => `${a.awardName} (${a.year})`).join(', ')}` : '',
            innovations.length ? `Inovasi: ${innovations.length} rekod` : '',
            achResearch.length ? `Penulisan/Kajian: ${achResearch.length} rekod` : '',
            otherAch.length ? `Pengiktirafan Lain: ${otherAch.length} rekod` : '',
          ]
            .filter(Boolean)
            .join(' | ')
        : 'Tiada rekod pencapaian.';

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
        ['Pengalaman Mengajar', teachingRingkas],
        ['Kompetensi Digital & AI', digitalRingkas],
        ['Kompetensi IAB', iabRingkas],
        ['Ringkasan Pencapaian', achRingkas],
      ],
    });
  } else {
    // =========================================================
    // PROFIL LENGKAP (ALL PAGES)
    // =========================================================

    // 1. Profil Perkhidmatan & Organisasi
    autoTable(doc, {
      startY: cursorY,
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.6, textColor: [30, 41, 59], cellPadding: 2.5 },
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 54, fillColor: [248, 250, 252] } },
      head: [['1. Profil Pegawai (Biodata, Perkhidmatan & Organisasi)', 'Maklumat Direkodkan']],
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
        [
          'Tarikh Lantikan & Tempoh',
          `${pii?.appointmentDate || '-'} (${pii?.yearsOfService ?? 0} tahun · ${
            pii?.serviceStatus || '-'
          })`,
        ],
        [
          'Pusat / Jabatan / Unit',
          `${profile.centerName || '-'} / ${profile.departmentName || '-'} / ${profile.unit || '-'}`,
        ],
        [
          'Ketua Pusat / Ketua Jabatan',
          `${profile.headOfCenter || 'TIADA MAKLUMAT'} / ${
            profile.headOfDepartment || 'TIADA MAKLUMAT'
          }`,
        ],
      ],
    });

    // 2. Kelulusan Akademik
    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.6, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['2. Kelulusan Akademik (Bil.)', 'Tahap', 'Institusi', 'Bidang Pengajian', 'Tahun Tamat']],
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

    // 3. Pengalaman Mengajar (Di IAB, Di Sekolah, Luar)
    const teachingRows: string[][] = [
      ...iabTeaching.map((t, i) => [
        `${i + 1}.`,
        'Di IAB',
        t.moduleOrField,
        t.teachingType,
        `${t.years} tahun`,
      ]),
      ...schoolTeaching.map((s, i) => [
        `${i + 1}.`,
        'Di Sekolah',
        s.subject,
        'Mata Pelajaran Sekolah',
        `${s.years} tahun`,
      ]),
      ...extTeaching.map((e, i) => [
        `${i + 1}.`,
        `Luar (${e.institution})`,
        e.moduleOrField,
        e.teachingType,
        `${e.years} tahun`,
      ]),
    ];

    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.5, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['3. Pengalaman Mengajar', 'Kategori', 'Bidang / Modul / Subjek', 'Jenis Pengajaran', 'Tempoh']],
      body:
        teachingRows.length > 0
          ? teachingRows
          : [['-', '-', 'Tiada rekod pengalaman mengajar didaftarkan', '-', '-']],
    });

    // 4. Fungsi Teras IAB (Fungsi 1 - 6)
    const f1Trainings = staffFunctions?.trainings || [];
    const f1Programs = staffFunctions?.programManagements || [];
    const f2Consults = staffFunctions?.consultations || [];
    const f5Npqel = staffFunctions?.npqelSupervisions || [];
    const f5Evals = staffFunctions?.programEvaluations || [];
    const f6Think = staffFunctions?.thinkTankEntries || [];

    const functionSummaryRows: string[][] = [
      ...f1Trainings.map((t) => ['Fungsi 1 (Latihan)', t.moduleName, t.role, t.year]),
      ...f1Programs.map((p) => [
        'Fungsi 1 (Pengurusan Program)',
        `${p.programName} (${p.centerName}${p.departmentName ? ` / ${p.departmentName}` : ''})`,
        p.role,
        p.year,
      ]),
      ...f2Consults.map((c) => [
        'Fungsi 2 (Konsultasi)',
        `${c.title} — ${c.organization}`,
        `${c.consultationType} (${c.role})`,
        c.year,
      ]),
      ...researchPubs.map((r) => [
        'Fungsi 3 (Penyelidikan)',
        r.title,
        r.achievement || r.publisherOrVenue || 'Penyelidik',
        r.year,
      ]),
      ...publishingPubs.map((p) => [
        `Fungsi 4 (${p.type})`,
        p.title,
        p.publisherOrVenue || p.achievement || '-',
        p.year,
      ]),
      ...f5Npqel.map((n) => [
        'Fungsi 5 (Penyeliaan NPQEL)',
        `${n.participantName} (${n.participantClass})`,
        'Penyelia',
        n.year,
      ]),
      ...f5Evals.map((e) => [
        'Fungsi 5 (Penilaian Program)',
        `${e.programName} (${e.centerName})`,
        `${e.role} · Skor ${e.score}% (${getProgramEvaluationRating(e.score)})`,
        e.year,
      ]),
      ...f6Think.map((tk) => [
        'Fungsi 6 (Pasukan Pemikir)',
        `${tk.committeeName} [${tk.level}]`,
        `${tk.role} (${tk.activeStatus})`,
        tk.year,
      ]),
    ];

    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['4. Penglibatan 6 Fungsi Teras IAB', 'Program / Tajuk / Jawatankuasa', 'Peranan / Butiran', 'Tahun']],
      body:
        functionSummaryRows.length > 0
          ? functionSummaryRows
          : [['-', 'Tiada penglibatan fungsi teras IAB direkodkan', '-', '-']],
    });

    // 5. Kompetensi IAB & Kompetensi Digital dan AI
    if (iabCompetencies) {
      autoTable(doc, {
        startY: getLastY(),
        theme: 'grid',
        headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
        bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
        head: [['5A. Kompetensi IAB — Pensijilan', 'Status', 'Tahun Lulus']],
        body:
          iabCompetencies.certifications.length > 0
            ? iabCompetencies.certifications.map((c) => [
                getIabCertDisplayLabel(c.key, c.label),
                c.status,
                c.status === 'Ada' ? c.passYear || '-' : '-',
              ])
            : [['Tiada rekod pensijilan IAB', '-', '-']],
      });

      autoTable(doc, {
        startY: getLastY(),
        theme: 'grid',
        headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
        bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
        head: [['5B. Kompetensi IAB — Modul / CPD', 'Tahun', 'Sumbangan', 'Status']],
        body:
          iabModulesList.length > 0
            ? iabModulesList.map((m) => [m.moduleName, m.year, m.contribution, m.activeStatus])
            : [['Tiada sumbangan modul/CPD direkodkan', '-', '-', '-']],
      });
    }

    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['5C. Kompetensi Digital & AI', 'Kategori', 'Tahap', 'Pengalaman', 'Sijil Kursus', 'Sah Laku']],
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

    // 6. Rekod Pencapaian & Pengiktirafan
    const achievementRows: string[][] = [
      ...apcAwards.map((a) => [
        'A. Anugerah APC',
        a.awardName,
        a.certificateDriveFileId ? 'Sijil Ada' : 'Tiada',
        a.year,
      ]),
      ...innovations.map((inv) => [
        `B. Inovasi (${inv.innovationType})`,
        inv.projectName,
        `${inv.role} · ${inv.level}${inv.recognition ? ` · ${inv.recognition}` : ''}`,
        inv.year,
      ]),
      ...achResearch.map((r) => [
        `C. ${r.outputType}`,
        r.title,
        `${r.role} · ${r.publisherOrJournal || '-'} (${r.indexing})`,
        r.year,
      ]),
      ...otherAch.map((o) => [
        `D. ${o.achievementType}`,
        o.title,
        `${o.role} · ${o.organization || '-'} (${o.level})`,
        o.dateOrYear,
      ]),
    ];

    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['6. Rekod Pencapaian', 'Nama / Tajuk', 'Peranan & Pengiktirafan / Butiran', 'Tahun / Tarikh']],
      body:
        achievementRows.length > 0
          ? achievementRows
          : [['-', 'Tiada rekod pencapaian didaftarkan', '-', '-']],
    });

    // 7. Senarai Sijil & Dokumen Terkawal
    autoTable(doc, {
      startY: getLastY(),
      theme: 'grid',
      headStyles: { fillColor: [11, 31, 59], textColor: 255, fontSize: 9.5 },
      bodyStyles: { fontSize: 8.4, textColor: [30, 41, 59], cellPadding: 2.4 },
      head: [['7. Nama Sijil / Dokumen', 'Kategori', 'Rujukan Storan Terkawal']],
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
