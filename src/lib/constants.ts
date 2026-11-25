import type {
  CertificateCategory,
  CompetencyRecord,
  ExpertiseRecord,
  Publication,
  PublicationType,
  Qualification,
  QualificationLevel,
  StaffPrivatePII,
  StaffProfile,
  UserRole,
} from '../types/iab';

export const BOOTSTRAP_ADMIN_EMAIL = 'iab-1248@moe-dl.edu.my';

export const ROLE_LABELS: Record<UserRole, string> = {
  L1: 'L1 — Ketua Pusat',
  L2: 'L2 — Ketua Jabatan',
  L3: 'L3 — Pensyarah',
  L4: 'L4 — Bukan Pensyarah (Pegawai)',
  L5: 'L5 — Bukan Pensyarah (Bukan Pegawai)',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  L1: 'Ketua Pusat (L1)',
  L2: 'Ketua Jabatan (L2)',
  L3: 'Pensyarah (L3)',
  L4: 'Pegawai Bukan Pensyarah (L4)',
  L5: 'Staf Sokongan (L5)',
};

export const DEFAULT_EXPERTISE_CATEGORIES: string[] = [
  'Kepimpinan Pendidikan',
  'Pengurusan Organisasi Pendidikan',
  'Dasar dan Perancangan Pendidikan',
  'Pengurusan Kurikulum dan Instruksional',
  'Teknologi Pendidikan & Pembelajaran Digital',
  'Kecerdasan Buatan (AI) & GenAI dalam Pendidikan',
  'Analitik Data & Pembuatan Keputusan',
  'Pengurusan Bakat & Pembangunan Profesional',
  'Pengurusan Kewangan & Pentadbiran Awam',
  'Penyelidikan Pendidikan & Inovasi',
  'Kaunseling, Bimbingan & Pementoran',
  'Keselamatan Siber & Tadbir Urus Digital',
];

export const DEFAULT_COMPETENCY_CATEGORIES: string[] = [
  'Generative AI',
  'AI Governance',
  'AI Ethics and Safety',
  'Data Analytics',
  'Data-Driven Decision Making',
  'Digital Leadership',
  'Digital Transformation',
  'Educational Technology',
  'Vibe Programming',
  'Digital Content Development',
  'Cybersecurity Awareness',
  'Kompetensi Digital Lain',
];

export const QUALIFICATION_LEVELS: QualificationLevel[] = [
  'PhD',
  'Sarjana',
  'Sarjana Muda',
  'Diploma',
  'Kelayakan Lain',
];

export const PUBLICATION_TYPES: PublicationType[] = [
  'Buku',
  'Artikel Jurnal',
  'Prosiding',
  'Penyelidikan',
  'Inovasi',
  'Pengiktirafan',
];

export const CERTIFICATE_CATEGORIES: CertificateCategory[] = [
  'Sijil Akademik',
  'Sijil Profesional',
  'Sijil Kompetensi',
  'Sijil Latihan',
  'Sijil Pengiktirafan',
  'Dokumen Lain',
];

export const COMPETENCY_LEVELS = ['Asas', 'Pertengahan', 'Lanjutan', 'Pakar'] as const;

export const COMMON_GRADES = [
  'JUSA C',
  'DG54',
  'DG52',
  'DG48',
  'DG44',
  'DG41',
  'N48',
  'N44',
  'N41',
  'F48',
  'F44',
  'F41',
  'N32',
  'N29',
  'N22',
  'N19',
];

export function computeProfileCompletion(params: {
  profile: Partial<StaffProfile>;
  pii?: Partial<StaffPrivatePII> | null;
  qualificationsCount: number;
  expertise?: Partial<ExpertiseRecord> | null;
  competencies?: Partial<CompetencyRecord> | null;
  publicationsCount: number;
  certificatesCount: number;
}): { completionPercent: number; missingSections: string[] } {
  const missing: string[] = [];
  let score = 0;

  // A. Maklumat Peribadi (10%)
  const hasPersonal =
    Boolean(params.profile.fullName?.trim()) &&
    Boolean(params.profile.officialEmail?.trim()) &&
    Boolean(params.pii?.phone?.trim());
  if (hasPersonal) score += 10;
  else missing.push('A. Maklumat Peribadi');

  // B. Maklumat Perkhidmatan (10%)
  const hasService =
    Boolean(params.profile.position?.trim()) &&
    Boolean(params.profile.grade?.trim()) &&
    Boolean(params.profile.scheme?.trim());
  if (hasService) score += 10;
  else missing.push('B. Maklumat Perkhidmatan');

  // C. Maklumat Organisasi (10%)
  const hasOrg =
    Boolean(params.profile.centerId?.trim()) &&
    Boolean(params.profile.departmentId?.trim());
  if (hasOrg) score += 10;
  else missing.push('C. Maklumat Organisasi');

  // D. Kelayakan Akademik (15%)
  if (params.qualificationsCount > 0 || Boolean(params.profile.highestQualification?.trim())) {
    score += 15;
  } else {
    missing.push('D. Kelayakan Akademik');
  }

  // E. Kepakaran (15%)
  if (Boolean(params.profile.primaryExpertise?.trim()) || Boolean(params.expertise?.primaryExpertise?.trim())) {
    score += 15;
  } else {
    missing.push('E. Kepakaran');
  }

  // F. Kompetensi Digital dan AI (10%)
  if (
    (params.competencies?.items && params.competencies.items.length > 0) ||
    (params.profile.digitalCompetencies && params.profile.digitalCompetencies.length > 0)
  ) {
    score += 10;
  } else {
    missing.push('F. Kompetensi Digital & AI');
  }

  // G. Pengalaman dan Sumbangan (10%)
  const exp = params.expertise;
  const hasExp = Boolean(
    exp?.teachingExp?.trim() ||
      exp?.managementExp?.trim() ||
      exp?.facilitatorExp?.trim() ||
      exp?.speakerExp?.trim() ||
      exp?.coachExp?.trim() ||
      exp?.projectExp?.trim() ||
      exp?.professionalExp?.trim()
  );
  if (hasExp) score += 10;
  else missing.push('G. Pengalaman & Sumbangan');

  // H. Penerbitan dan Penyelidikan (5%)
  if (params.publicationsCount > 0) score += 5;
  else missing.push('H. Penerbitan & Penyelidikan');

  // I. Gambar Pegawai (10%)
  if (params.profile.hasPhoto) score += 10;
  else missing.push('I. Gambar Pegawai');

  // J. Sijil dan Dokumen (5%)
  if (params.certificatesCount > 0) score += 5;
  else missing.push('J. Sijil & Dokumen');

  return {
    completionPercent: Math.min(100, score),
    missingSections: missing,
  };
}

export function getHighestQualificationFromList(list: Qualification[]): string {
  const rank: Record<QualificationLevel, number> = {
    PhD: 5,
    Sarjana: 4,
    'Sarjana Muda': 3,
    Diploma: 2,
    'Kelayakan Lain': 1,
  };
  let best = '';
  let bestRank = 0;
  for (const q of list) {
    if (q.status !== 'active') continue;
    const r = rank[q.level] || 0;
    if (r > bestRank) {
      bestRank = r;
      best = q.level;
    }
  }
  return best;
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
