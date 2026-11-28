import type {
  CertificateCategory,
  CompetencyRecord,
  ExpertiseRecord,
  IabCertKey,
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
  L0: 'L0 — Admin',
  L1: 'L1 — Ketua Pusat',
  L2: 'L2 — Ketua Jabatan',
  L3: 'L3 — Pensyarah',
  L4: 'L4 — Bukan Pensyarah (Pegawai)',
  L5: 'L5 — Bukan Pensyarah (Bukan Pegawai)',
};

export const ROLE_SHORT_LABELS: Record<UserRole, string> = {
  L0: 'Admin (L0)',
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

export const DEFAULT_APPLICATION_SKILL_CATEGORIES: string[] = [
  'Canva AI',
  'Gemini Notebook',
  'Adobe Express',
  'Google Gemini',
  'NotebookLM',
  'ChatGPT / OpenAI',
  'Microsoft Copilot',
  'Google Workspace AI',
];

export const DEFAULT_KNOWLEDGE_SKILL_CATEGORIES: string[] = [
  'Digital Leadership',
  'Digital Citizenship',
  'Generative AI',
  'AI Governance',
  'AI Ethics and Safety',
  'Data Analytics',
  'Data-Driven Decision Making',
  'Digital Transformation',
  'Educational Technology',
  'Vibe Programming',
  'Digital Content Development',
  'Cybersecurity Awareness',
];

export const DEFAULT_COMPETENCY_CATEGORIES: string[] = [
  ...DEFAULT_APPLICATION_SKILL_CATEGORIES,
  ...DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
];

export const QUALIFICATION_LEVELS: QualificationLevel[] = [
  'PhD',
  'Sarjana',
  'Sarjana Muda',
  'Diploma',
  'Kelayakan Lain',
];

export const WRITING_PUBLICATION_TYPES: PublicationType[] = [
  'Buku',
  'Artikel Jurnal',
  'Prosiding',
  'Modul',
  'Sumber Rujukan',
];

export const RESEARCH_PUBLICATION_TYPES: PublicationType[] = [
  'Penyelidikan',
  'Inovasi',
  'Pengiktirafan',
];

export const PUBLICATION_TYPES: PublicationType[] = [
  ...WRITING_PUBLICATION_TYPES,
  ...RESEARCH_PUBLICATION_TYPES,
];

export const TRAINING_ROLES: string[] = [
  'Tenaga Pengajar',
  'Fasilitator',
  'Penceramah',
  'Penyelaras',
  'Pembimbing',
];

export const PROGRAM_MANAGEMENT_ROLES: string[] = [
  'Pengurus',
  'Pengurus Bersama',
  'Penyelaras',
  'Urusetia',
];

export const CONSULTATION_TYPES: string[] = [
  'Khidmat Nasihat',
  'Bimbingan & Pementoran',
  'Sokongan Transformasi',
  'Penilaian & Audit Organisasi',
  'Intervensi Kepimpinan',
];

export const THINK_TANK_LEVELS: string[] = [
  'IAB / Institut',
  'Kementerian Pendidikan Malaysia (KPM)',
  'Kebangsaan',
  'Antarabangsa',
];

export const THINK_TANK_ROLES: string[] = [
  'Pengerusi',
  'Ketua Kumpulan',
  'Ahli Teras',
  'Ahli',
  'Pakar Rujuk',
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

export const SERVICE_POSITIONS: string[] = [
  'Ketua Pusat',
  'Ketua Jabatan',
  'Pensyarah Kanan',
  'Pegawai Teknologi Maklumat Kanan',
  'Pegawai Teknologi Maklumat',
  'Pen. Peg. Teknologi Maklumat Kanan',
  'Pen. Peg. Teknologi Maklumat',
  'Juruteknik',
  'Pembantu Tadbir',
  'Lain-lain',
];

export const SERVICE_GRADES_HAKIKI: string[] = [
  'JUSA B',
  'JUSA C',
  'DG14',
  'DG13',
  'DG12',
  'DG10',
  'DG9',
  'F13',
  'F12',
  'F10',
  'F9',
  'F6',
  'F5',
  'N5',
  'N4',
  'N3',
  'N2',
  'N1',
];

export const SERVICE_GRADES_KUP: string[] = [
  ...SERVICE_GRADES_HAKIKI,
  'TIDAK BERKENAAN',
];

export const COMMON_GRADES = SERVICE_GRADES_HAKIKI;

export const DEFAULT_INSTITUTION_CATEGORIES: string[] = [
  'UM',
  'UKM',
  'UPM',
  'USM',
  'UTM',
  'UIAM',
  'UPSI',
  'UUM',
  'UiTM',
  'UNIMAS',
  'UMS',
  'UMT',
  'UTHM',
  'UMP',
  'UniMAP',
  'UTeM',
  'UPNM',
  'OUM',
  'UTAR',
  'MMU',
  'Lain-lain',
];

export const DEFAULT_PUBLICATION_YEARS: string[] = Array.from(
  { length: 2030 - 2015 + 1 },
  (_, i) => String(2015 + i)
);

export const DEFAULT_IAB_MODULES: string[] = [
  'Modul AI',
  'NPQEL',
  'Modul Kepimpinan Instruksional',
  'Modul Pengurusan Organisasi',
  'Modul Analitik Data',
];

export const IAB_MODULE_CONTRIBUTIONS = [
  'KETUA PAKAR RUJUK (KPR)',
  'PAKAR RUJUK UTAMA (PRU)',
  'Ahli',
] as const;

export interface IabCertDefinition {
  key: IabCertKey;
  group: 'Coach' | 'Trainer' | 'Assessor' | 'Konsultan';
  label: string;
  prerequisiteLabel?: string;
  requires?: IabCertKey[];
}

export const IAB_CERT_DEFINITIONS: IabCertDefinition[] = [
  {
    key: 'certifiedCoach',
    group: 'Coach',
    label: 'Certified Coach (CC)',
  },
  {
    key: 'certifiedMasterCoach',
    group: 'Coach',
    label: 'Certified Master Coach (CMC)',
    prerequisiteLabel: 'prasyarat: Certified Coach (CC)',
    requires: ['certifiedCoach'],
  },
  {
    key: 'certifiedTrainer',
    group: 'Trainer',
    label: 'Certified Trainer (CT)',
  },
  {
    key: 'certifiedMasterTrainer',
    group: 'Trainer',
    label: 'Certified Master Trainer (CMT)',
    prerequisiteLabel: 'prasyarat: Certified Trainer (CT)',
    requires: ['certifiedTrainer'],
  },
  {
    key: 'certifiedAccessor',
    group: 'Assessor',
    label: 'Certified Accessor',
  },
  {
    key: 'konsultanIab',
    group: 'Konsultan',
    label: 'Konsultan IAB',
    prerequisiteLabel: 'Prasyarat: Semua 5 certified di atas',
    requires: [
      'certifiedCoach',
      'certifiedMasterCoach',
      'certifiedTrainer',
      'certifiedMasterTrainer',
      'certifiedAccessor',
    ],
  },
];

export const IAB_CERT_SHORT_CODES: Record<IabCertKey, string> = {
  certifiedCoach: 'CC',
  certifiedMasterCoach: 'CMC',
  certifiedTrainer: 'CT',
  certifiedMasterTrainer: 'CMT',
  certifiedAccessor: 'CA',
  konsultanIab: 'Konsultan IAB',
};

export function getIabCertDisplayLabel(key: IabCertKey, fallbackLabel?: string): string {
  return IAB_CERT_DEFINITIONS.find((d) => d.key === key)?.label || fallbackLabel || key;
}

export function buildSafeDriveFilePrefix(
  staffName?: string,
  staffEmail?: string,
  fallbackId?: string
): string {
  const raw = (staffName || '').trim() || (staffEmail || '').trim() || (fallbackId || 'Pegawai').trim();
  const cleaned = raw
    .replace(/[\\/:*?"<>|]+/g, ' ')
    .replace(/\s+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64);
  return cleaned || 'Pegawai';
}

export function normalizeGenderShort(raw?: string): 'L' | 'P' | '' {
  const val = String(raw || '').trim().toLowerCase();
  if (!val) return '';
  if (val === 'l' || val.startsWith('lelaki') || val === 'male' || val === 'm') return 'L';
  if (val === 'p' || val.startsWith('perempuan') || val === 'wanita' || val === 'female' || val === 'f') {
    return 'P';
  }
  return '';
}

export function isCountableStaff(p: Partial<StaffProfile> | null | undefined): boolean {
  if (!p) return false;
  return p.role !== 'L0';
}

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

export const QUALIFICATION_LEVEL_RANK: Record<QualificationLevel, number> = {
  PhD: 5,
  Sarjana: 4,
  'Sarjana Muda': 3,
  Diploma: 2,
  'Kelayakan Lain': 1,
};

export function getHighestQualificationFromList(list: Qualification[]): string {
  let best = '';
  let bestRank = 0;
  for (const q of list) {
    if (q.status !== 'active') continue;
    const r = QUALIFICATION_LEVEL_RANK[q.level] || 0;
    if (r > bestRank) {
      bestRank = r;
      best = q.level;
    }
  }
  return best;
}

export function sortQualificationsHighestFirst(list: Qualification[]): Qualification[] {
  return [...list].sort((a, b) => {
    const rankDiff = (QUALIFICATION_LEVEL_RANK[b.level] || 0) - (QUALIFICATION_LEVEL_RANK[a.level] || 0);
    if (rankDiff !== 0) return rankDiff;
    const yrB = parseInt(String(b.graduationYear || '0'), 10) || 0;
    const yrA = parseInt(String(a.graduationYear || '0'), 10) || 0;
    return yrB - yrA;
  });
}

export function hasValidAchievement(val?: string): boolean {
  const cleaned = String(val || '').trim();
  return cleaned !== '' && cleaned.toLowerCase() !== 'tidak berkenaan';
}

export function sortPublicationsDefault(list: Publication[]): Publication[] {
  return [...list].sort((a, b) => {
    const aHas = hasValidAchievement(a.achievement) ? 1 : 0;
    const bHas = hasValidAchievement(b.achievement) ? 1 : 0;
    if (bHas !== aHas) return bHas - aHas;
    const yrB = parseInt(String(b.year || '0'), 10) || 0;
    const yrA = parseInt(String(a.year || '0'), 10) || 0;
    if (yrB !== yrA) return yrB - yrA;
    return a.title.localeCompare(b.title);
  });
}

export function computeYearsOfService(appointmentDate?: string): number {
  const raw = String(appointmentDate || '').trim();
  if (!raw) return 0;
  const parts = raw.split('-').map((n) => Number(n));
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  const [y, m, d] = parts;
  if (y < 1940 || m < 1 || m > 12 || d < 1 || d > 31) return 0;
  const now = new Date();
  let years = now.getFullYear() - y;
  const currentMonth = now.getMonth() + 1;
  const currentDay = now.getDate();
  if (currentMonth < m || (currentMonth === m && currentDay < d)) {
    years -= 1;
  }
  return Math.max(0, Math.min(80, years));
}

export function getProgramEvaluationRating(score: number): string {
  const val = Number(score);
  if (!Number.isFinite(val)) return '-';
  if (val >= 90) return 'Cemerlang';
  if (val >= 80) return 'Sangat Baik';
  if (val >= 70) return 'Baik';
  if (val >= 60) return 'Memuaskan';
  return 'Perlu Penambahbaikan';
}

export function computePercentage(part: number, total: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(part) || part <= 0) return 0;
  return Math.round((part / total) * 100);
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}
