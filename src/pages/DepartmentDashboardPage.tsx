import React, { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronDown,
  ChevronRight,
  Download,
  Eye,
  Search,
  X,
} from 'lucide-react';
import { DriveImage } from '../components/DriveImage';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  IAB_CERT_SHORT_CODES,
  QUALIFICATION_LEVEL_RANK,
  computePercentage,
  isCountableStaff,
} from '../lib/constants';
import { getGenderMapForProfiles } from '../services/firestoreService';
import { exportStaffProfilesToExcel } from '../utils/excelExport';
import type {
  CompetencyItem,
  CompetencyRecord,
  Department,
  IabCertKey,
  IabCompetencyRecord,
  QualificationLevel,
  StaffProfile,
  SystemSetting,
} from '../types/iab';

interface DepartmentDashboardPageProps {
  profiles: StaffProfile[];
  competencyRecords?: CompetencyRecord[];
  iabCompetencyRecords?: IabCompetencyRecord[];
  sysSettings?: SystemSetting | null;
  departments: Department[];
  onInspectProfile: (staffId: string) => void;
}

type SectionKey = 'A' | 'B' | 'C';

type SortKey =
  | 'fullName'
  | 'gender'
  | 'position'
  | 'primaryExpertise'
  | 'digitalComp'
  | 'iabComp'
  | 'completion';

type PageSizeOption = 5 | 10 | 15 | 20 | 25 | 30 | 'ALL';

type IabFilterOption =
  | 'ALL'
  | 'certifiedCoach'
  | 'certifiedTrainer'
  | 'certifiedMasterCoach'
  | 'certifiedMasterTrainer'
  | 'certifiedAccessor'
  | 'konsultanIab'
  | 'ANY'
  | 'NONE';

interface GenderBreakdown {
  total: number;
  male: number;
  female: number;
  unknown: number;
}

interface FlashcardMetric {
  id: string;
  numberLabel: string;
  title: string;
  subtitle?: string;
  displayValue: string;
  genderText: string;
  mode: 'staff_count' | 'ratio_with_status';
  matchedProfiles: StaffProfile[];
  scopeProfiles: StaffProfile[];
  certKey?: IabCertKey;
}

interface ActiveModalState {
  title: string;
  subtitle: string;
  mode: 'staff_count' | 'ratio_with_status';
  certKey?: IabCertKey;
  matchedIds: Set<string>;
  scopeProfiles: StaffProfile[];
}

const COLORS = ['#0B1F3B', '#C69738', '#1D4ED8', '#0F766E', '#64748B', '#9D741E'];

const IAB_CERT_DISPLAY_ORDER: IabCertKey[] = [
  'certifiedCoach',
  'certifiedTrainer',
  'certifiedMasterCoach',
  'certifiedMasterTrainer',
  'certifiedAccessor',
  'konsultanIab',
];

function computeGenderBreakdown(
  list: StaffProfile[],
  genderMap: Record<string, 'L' | 'P' | ''>
): GenderBreakdown {
  let male = 0;
  let female = 0;
  let unknown = 0;
  for (const p of list) {
    const g = genderMap[p.staffId] || '';
    if (g === 'L') male += 1;
    else if (g === 'P') female += 1;
    else unknown += 1;
  }
  return { total: list.length, male, female, unknown };
}

function hasIabCert(record: IabCompetencyRecord | undefined, key: IabCertKey): boolean {
  if (!record?.certifications?.length) return false;
  return record.certifications.some((c) => c.key === key && c.status === 'Ada');
}

function getIabCertPassYear(record: IabCompetencyRecord | undefined, key: IabCertKey): string {
  const item = record?.certifications?.find((c) => c.key === key && c.status === 'Ada');
  return item?.passYear?.trim() || '-';
}

function getIabCertCodesForStaff(record: IabCompetencyRecord | undefined): string[] {
  if (!record?.certifications?.length) return [];
  return IAB_CERT_DISPLAY_ORDER.filter((key) => hasIabCert(record, key)).map(
    (key) => IAB_CERT_SHORT_CODES[key]
  );
}

function isProfileAndIabComplete(
  profile: StaffProfile,
  iabMap: Map<string, IabCompetencyRecord>
): boolean {
  return (profile.completionPercent || 0) >= 80 && iabMap.has(profile.staffId);
}

export const DepartmentDashboardPage: React.FC<DepartmentDashboardPageProps> = ({
  profiles,
  competencyRecords = [],
  iabCompetencyRecords = [],
  sysSettings,
  departments,
  onInspectProfile,
}) => {
  const { userAccount } = useAuth();
  const isL2Locked = userAccount?.role === 'L2' && !userAccount?.isAdmin;

  const accessibleDepts = useMemo(() => {
    if (userAccount?.isAdmin) return [...departments].sort((a, b) => a.name.localeCompare(b.name));
    if (userAccount?.role === 'L1') {
      return departments
        .filter((d) => d.centerId === userAccount.centerId)
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    return departments.filter((d) => d.id === userAccount?.departmentId);
  }, [departments, userAccount]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    userAccount?.departmentId || accessibleDepts[0]?.id || ''
  );

  useEffect(() => {
    if (!selectedDeptId && accessibleDepts[0]?.id) {
      setSelectedDeptId(accessibleDepts[0].id);
    }
  }, [accessibleDepts, selectedDeptId]);

  const activeDeptId = isL2Locked
    ? userAccount?.departmentId || ''
    : selectedDeptId || accessibleDepts[0]?.id || '';
  const activeDept = departments.find((d) => d.id === activeDeptId);
  const activeDeptName = (activeDept?.name || 'JABATAN').toUpperCase();

  // Semua bahagian disembunyikan secara default kecuali Bahagian A
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>({
    A: true,
    B: false,
    C: false,
  });

  // Gender lookup from staff_profiles/{staffId}/private/pii
  const [genderMap, setGenderMap] = useState<Record<string, 'L' | 'P' | ''>>({});

  // Detail modal state when clicking flashcards
  const [activeModal, setActiveModal] = useState<ActiveModalState | null>(null);
  const [modalFilter, setModalFilter] = useState<'ALL' | 'MATCHED' | 'UNMATCHED' | 'L' | 'P'>('ALL');

  // Directory filters, sorting, pagination
  const [searchQuery, setSearchQuery] = useState('');
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [filterQual, setFilterQual] = useState('ALL');
  const [filterExpertise, setFilterExpertise] = useState('ALL');
  const [filterIabComp, setFilterIabComp] = useState<IabFilterOption>('ALL');
  const [sortKey, setSortKey] = useState<SortKey>('fullName');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [pageSize, setPageSize] = useState<PageSizeOption>(10);
  const [currentPage, setCurrentPage] = useState(1);

  const compMap = useMemo(() => {
    const m = new Map<string, CompetencyItem[]>();
    for (const rec of competencyRecords) {
      m.set(rec.staffId, rec.items || []);
    }
    return m;
  }, [competencyRecords]);

  const iabMap = useMemo(() => {
    const m = new Map<string, IabCompetencyRecord>();
    for (const rec of iabCompetencyRecords) {
      m.set(rec.staffId, rec);
    }
    return m;
  }, [iabCompetencyRecords]);

  const deptProfiles = useMemo(() => {
    return profiles.filter((p) => isCountableStaff(p) && p.departmentId === activeDeptId);
  }, [profiles, activeDeptId]);

  const profileIdsSignature = useMemo(
    () => deptProfiles.map((p) => p.staffId).sort().join('|'),
    [deptProfiles]
  );

  useEffect(() => {
    let cancelled = false;
    if (!userAccount || deptProfiles.length === 0) {
      setGenderMap({});
      return;
    }
    getGenderMapForProfiles(deptProfiles, userAccount).then((result) => {
      if (!cancelled) {
        setGenderMap(result);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [userAccount, profileIdsSignature]);

  // Bahagian A: 9 Flashcards
  const bahagianAMetrics: FlashcardMetric[] = useMemo(() => {
    const totalCount = deptProfiles.length;

    const lecturers = deptProfiles.filter((p) => p.isLecturer);
    const nonLecturers = deptProfiles.filter((p) => !p.isLecturer);
    const ccStaff = deptProfiles.filter((p) => hasIabCert(iabMap.get(p.staffId), 'certifiedCoach'));
    const ctStaff = deptProfiles.filter((p) => hasIabCert(iabMap.get(p.staffId), 'certifiedTrainer'));
    const cmcStaff = deptProfiles.filter((p) =>
      hasIabCert(iabMap.get(p.staffId), 'certifiedMasterCoach')
    );
    const cmtStaff = deptProfiles.filter((p) =>
      hasIabCert(iabMap.get(p.staffId), 'certifiedMasterTrainer')
    );
    const caStaff = deptProfiles.filter((p) =>
      hasIabCert(iabMap.get(p.staffId), 'certifiedAccessor')
    );
    const completeStaff = deptProfiles.filter((p) => isProfileAndIabComplete(p, iabMap));

    const gAll = computeGenderBreakdown(deptProfiles, genderMap);
    const gLec = computeGenderBreakdown(lecturers, genderMap);
    const gNonLec = computeGenderBreakdown(nonLecturers, genderMap);
    const gCc = computeGenderBreakdown(ccStaff, genderMap);
    const gCt = computeGenderBreakdown(ctStaff, genderMap);
    const gCmc = computeGenderBreakdown(cmcStaff, genderMap);
    const gCmt = computeGenderBreakdown(cmtStaff, genderMap);
    const gCa = computeGenderBreakdown(caStaff, genderMap);
    const gComp = computeGenderBreakdown(completeStaff, genderMap);

    const fmtGender = (g: GenderBreakdown, prefix = '') =>
      `${prefix}L: ${g.male} (${computePercentage(g.male, g.total)}%) | P: ${g.female} (${computePercentage(g.female, g.total)}%)`;

    const fmtRatio = (matchedCount: number) =>
      `${matchedCount} / ${totalCount} (${computePercentage(matchedCount, totalCount)}%)`;

    return [
      {
        id: 'dept-pegawai',
        numberLabel: '1.',
        title: 'Bil. Pegawai',
        displayValue: String(gAll.total),
        genderText: fmtGender(gAll),
        mode: 'staff_count',
        matchedProfiles: deptProfiles,
        scopeProfiles: deptProfiles,
      },
      {
        id: 'dept-pensyarah',
        numberLabel: '2.',
        title: 'Bil. Pensyarah',
        displayValue: fmtRatio(gLec.total),
        genderText: fmtGender(gLec),
        mode: 'staff_count',
        matchedProfiles: lecturers,
        scopeProfiles: deptProfiles,
      },
      {
        id: 'dept-bukan-pensyarah',
        numberLabel: '3.',
        title: 'Bil. Bukan Pensyarah',
        displayValue: fmtRatio(gNonLec.total),
        genderText: fmtGender(gNonLec),
        mode: 'staff_count',
        matchedProfiles: nonLecturers,
        scopeProfiles: deptProfiles,
      },
      {
        id: 'dept-cc',
        numberLabel: '4.',
        title: 'Bil. Ada CC',
        subtitle: 'Certified Coach (CC)',
        displayValue: fmtRatio(gCc.total),
        genderText: fmtGender(gCc),
        mode: 'ratio_with_status',
        matchedProfiles: ccStaff,
        scopeProfiles: deptProfiles,
        certKey: 'certifiedCoach',
      },
      {
        id: 'dept-ct',
        numberLabel: '5.',
        title: 'Bil. Ada CT',
        subtitle: 'Certified Trainer (CT)',
        displayValue: fmtRatio(gCt.total),
        genderText: fmtGender(gCt),
        mode: 'ratio_with_status',
        matchedProfiles: ctStaff,
        scopeProfiles: deptProfiles,
        certKey: 'certifiedTrainer',
      },
      {
        id: 'dept-cmc',
        numberLabel: '6.',
        title: 'Bil. Ada CMC',
        subtitle: 'Certified Master Coach (CMC)',
        displayValue: fmtRatio(gCmc.total),
        genderText: fmtGender(gCmc),
        mode: 'ratio_with_status',
        matchedProfiles: cmcStaff,
        scopeProfiles: deptProfiles,
        certKey: 'certifiedMasterCoach',
      },
      {
        id: 'dept-cmt',
        numberLabel: '7.',
        title: 'Bil. Ada CMT',
        subtitle: 'Certified Master Trainer (CMT)',
        displayValue: fmtRatio(gCmt.total),
        genderText: fmtGender(gCmt),
        mode: 'ratio_with_status',
        matchedProfiles: cmtStaff,
        scopeProfiles: deptProfiles,
        certKey: 'certifiedMasterTrainer',
      },
      {
        id: 'dept-ca',
        numberLabel: '8.',
        title: 'Bil. Ada CA',
        subtitle: 'Certified Accessor',
        displayValue: fmtRatio(gCa.total),
        genderText: fmtGender(gCa),
        mode: 'ratio_with_status',
        matchedProfiles: caStaff,
        scopeProfiles: deptProfiles,
        certKey: 'certifiedAccessor',
      },
      {
        id: 'dept-status-profil',
        numberLabel: '9.',
        title: 'Status Pengisian Profil',
        subtitle: 'Profil Pegawai & Kompetensi IAB',
        displayValue: fmtRatio(gComp.total),
        genderText: fmtGender(gComp, 'Lengkap '),
        mode: 'ratio_with_status',
        matchedProfiles: completeStaff,
        scopeProfiles: deptProfiles,
      },
    ];
  }, [deptProfiles, genderMap, iabMap]);

  // Directory filtering
  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return deptProfiles.filter((p) => {
      if (filterGrade !== 'ALL' && (p.grade || 'Belum Diisi') !== filterGrade) return false;
      if (filterQual !== 'ALL' && (p.highestQualification || 'Belum Diisi') !== filterQual)
        return false;
      if (filterExpertise !== 'ALL' && (p.primaryExpertise || 'Belum Diisi') !== filterExpertise)
        return false;

      if (filterIabComp !== 'ALL') {
        const rec = iabMap.get(p.staffId);
        const codes = getIabCertCodesForStaff(rec);
        if (filterIabComp === 'ANY') {
          if (codes.length === 0) return false;
        } else if (filterIabComp === 'NONE') {
          if (codes.length > 0) return false;
        } else {
          if (!hasIabCert(rec, filterIabComp)) return false;
        }
      }

      if (!q) return true;
      const items = compMap.get(p.staffId) || [];
      const compText = items.map((i) => `${i.categoryName} ${i.level}`).join(' ').toLowerCase();
      const iabCodes = getIabCertCodesForStaff(iabMap.get(p.staffId)).join(' ').toLowerCase();
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.staffId.toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q) ||
        (p.primaryExpertise || '').toLowerCase().includes(q) ||
        (p.highestQualification || '').toLowerCase().includes(q) ||
        compText.includes(q) ||
        iabCodes.includes(q)
      );
    });
  }, [
    deptProfiles,
    compMap,
    iabMap,
    searchQuery,
    filterGrade,
    filterQual,
    filterExpertise,
    filterIabComp,
  ]);

  // Directory sorting (all columns)
  const sortedProfiles = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filteredProfiles].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'fullName':
          cmp = a.fullName.localeCompare(b.fullName, 'ms');
          break;
        case 'gender': {
          const ga = genderMap[a.staffId] || 'ZZ';
          const gb = genderMap[b.staffId] || 'ZZ';
          cmp = ga.localeCompare(gb);
          break;
        }
        case 'position': {
          const pa = `${a.position || ''} ${a.grade || ''}`.trim();
          const pb = `${b.position || ''} ${b.grade || ''}`.trim();
          cmp = pa.localeCompare(pb, 'ms');
          break;
        }
        case 'primaryExpertise': {
          const ra = QUALIFICATION_LEVEL_RANK[a.highestQualification as QualificationLevel] || 0;
          const rb = QUALIFICATION_LEVEL_RANK[b.highestQualification as QualificationLevel] || 0;
          const ea = a.primaryExpertise || '';
          const eb = b.primaryExpertise || '';
          cmp = ea.localeCompare(eb, 'ms');
          if (cmp === 0) cmp = ra - rb;
          break;
        }
        case 'digitalComp': {
          const ca = compMap.get(a.staffId)?.length ?? a.digitalCompetencies?.length ?? 0;
          const cb = compMap.get(b.staffId)?.length ?? b.digitalCompetencies?.length ?? 0;
          if (ca !== cb) {
            cmp = ca - cb;
          } else {
            const ta = compMap.get(a.staffId)?.map((i) => i.categoryName).join(', ') || '';
            const tb = compMap.get(b.staffId)?.map((i) => i.categoryName).join(', ') || '';
            cmp = ta.localeCompare(tb, 'ms');
          }
          break;
        }
        case 'iabComp': {
          const ia = getIabCertCodesForStaff(iabMap.get(a.staffId));
          const ib = getIabCertCodesForStaff(iabMap.get(b.staffId));
          if (ia.length !== ib.length) cmp = ia.length - ib.length;
          else cmp = ia.join(',').localeCompare(ib.join(','));
          break;
        }
        case 'completion':
          cmp = (a.completionPercent || 0) - (b.completionPercent || 0);
          break;
        default:
          cmp = 0;
      }
      if (cmp !== 0) return cmp * dir;
      return a.fullName.localeCompare(b.fullName, 'ms');
    });
  }, [filteredProfiles, sortKey, sortDir, genderMap, compMap, iabMap]);

  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeDeptId,
    searchQuery,
    filterGrade,
    filterQual,
    filterExpertise,
    filterIabComp,
    sortKey,
    sortDir,
    pageSize,
  ]);

  const totalPages = useMemo(() => {
    if (pageSize === 'ALL') return 1;
    return Math.max(1, Math.ceil(sortedProfiles.length / pageSize));
  }, [sortedProfiles.length, pageSize]);

  const safeCurrentPage = Math.min(currentPage, totalPages);

  const paginatedProfiles = useMemo(() => {
    if (pageSize === 'ALL') return sortedProfiles;
    const start = (safeCurrentPage - 1) * pageSize;
    return sortedProfiles.slice(start, start + pageSize);
  }, [sortedProfiles, pageSize, safeCurrentPage]);

  // Analytics & Charts (Bahagian B)
  const gradeStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of deptProfiles) {
      const k = p.grade?.trim() || 'Belum Diisi';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, jumlah]) => ({ name, jumlah }));
  }, [deptProfiles]);

  const qualStats = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of deptProfiles) {
      const k = p.highestQualification?.trim() || 'Belum Diisi';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [deptProfiles]);

  const digitalSkillChartData = useMemo(() => {
    const appCats = sysSettings?.applicationSkillCategories?.length
      ? sysSettings.applicationSkillCategories
      : DEFAULT_APPLICATION_SKILL_CATEGORIES;
    const knowCats = sysSettings?.knowledgeSkillCategories?.length
      ? sysSettings.knowledgeSkillCategories
      : DEFAULT_KNOWLEDGE_SKILL_CATEGORIES;
    const counts = new Map<
      string,
      { name: string; aplikasi: number; pengetahuan: number; total: number }
    >();

    for (const name of appCats) {
      counts.set(name, { name, aplikasi: 0, pengetahuan: 0, total: 0 });
    }
    for (const name of knowCats) {
      if (!counts.has(name)) counts.set(name, { name, aplikasi: 0, pengetahuan: 0, total: 0 });
    }

    for (const p of deptProfiles) {
      const items = compMap.get(p.staffId) || [];
      if (items.length > 0) {
        const seenForStaff = new Set<string>();
        for (const item of items) {
          const key = `${item.skillType}:${item.categoryName}`;
          if (seenForStaff.has(key)) continue;
          seenForStaff.add(key);
          const entry = counts.get(item.categoryName) || {
            name: item.categoryName,
            aplikasi: 0,
            pengetahuan: 0,
            total: 0,
          };
          if (item.skillType === 'aplikasi') entry.aplikasi += 1;
          else entry.pengetahuan += 1;
          entry.total += 1;
          counts.set(item.categoryName, entry);
        }
      } else {
        for (const legacyName of p.digitalCompetencies || []) {
          const entry = counts.get(legacyName) || {
            name: legacyName,
            aplikasi: 0,
            pengetahuan: 0,
            total: 0,
          };
          if (appCats.includes(legacyName)) entry.aplikasi += 1;
          else entry.pengetahuan += 1;
          entry.total += 1;
          counts.set(legacyName, entry);
        }
      }
    }

    return Array.from(counts.values())
      .filter((x) => x.total > 0)
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [deptProfiles, compMap, sysSettings]);

  const expertiseGroups = useMemo(() => {
    const m = new Map<string, StaffProfile[]>();
    for (const p of deptProfiles) {
      const field = p.primaryExpertise?.trim() || 'Belum Diisi';
      const list = m.get(field) || [];
      list.push(p);
      m.set(field, list);
    }
    return Array.from(m.entries());
  }, [deptProfiles]);

  const uniqueGrades = Array.from(new Set(deptProfiles.map((p) => p.grade?.trim() || 'Belum Diisi')));
  const uniqueQuals = Array.from(
    new Set(deptProfiles.map((p) => p.highestQualification?.trim() || 'Belum Diisi'))
  );
  const uniqueExps = Array.from(
    new Set(deptProfiles.map((p) => p.primaryExpertise?.trim() || 'Belum Diisi'))
  );

  const toggleSection = (key: SectionKey) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'completion' ? 'desc' : 'asc');
    }
  };

  const openMetricModal = (card: FlashcardMetric) => {
    const matchedIds = new Set(card.matchedProfiles.map((p) => p.staffId));
    setModalFilter(card.mode === 'ratio_with_status' && card.certKey ? 'MATCHED' : 'ALL');
    setActiveModal({
      title: `${card.numberLabel} ${card.title}`,
      subtitle: `${activeDeptName} · ${card.displayValue} (${card.genderText})`,
      mode: card.mode,
      certKey: card.certKey,
      matchedIds,
      scopeProfiles: card.mode === 'staff_count' ? card.matchedProfiles : card.scopeProfiles,
    });
  };

  const modalDisplayRows = useMemo(() => {
    if (!activeModal) return [];
    return activeModal.scopeProfiles.filter((p) => {
      if (modalFilter === 'MATCHED') return activeModal.matchedIds.has(p.staffId);
      if (modalFilter === 'UNMATCHED') return !activeModal.matchedIds.has(p.staffId);
      if (modalFilter === 'L') return (genderMap[p.staffId] || '') === 'L';
      if (modalFilter === 'P') return (genderMap[p.staffId] || '') === 'P';
      return true;
    });
  }, [activeModal, modalFilter, genderMap]);

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ArrowUpDown className="w-3 h-3 text-slate-400 shrink-0" />;
    return sortDir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-[#0B1F3B] shrink-0" />
    ) : (
      <ArrowDown className="w-3 h-3 text-[#0B1F3B] shrink-0" />
    );
  };

  const rangeStart =
    sortedProfiles.length === 0
      ? 0
      : pageSize === 'ALL'
        ? 1
        : (safeCurrentPage - 1) * pageSize + 1;
  const rangeEnd =
    pageSize === 'ALL'
      ? sortedProfiles.length
      : Math.min(safeCurrentPage * pageSize, sortedProfiles.length);

  return (
    <div className="space-y-4">
      {/* Header Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">
            {activeDept?.name || 'Dashboard Jabatan'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ketua Jabatan:{' '}
            <strong className="text-slate-700">{activeDept?.headName?.trim() || 'TIADA MAKLUMAT'}</strong>
            {isL2Locked && ' · Akses terhad kepada jabatan sendiri (RBAC L2)'}
            {' · '}(Tidak termasuk Admin L0 dalam bilangan staf)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isL2Locked && accessibleDepts.length > 0 && (
            <select
              value={activeDeptId}
              onChange={(e) => {
                setSelectedDeptId(e.target.value);
                setFilterGrade('ALL');
                setFilterQual('ALL');
                setFilterExpertise('ALL');
                setFilterIabComp('ALL');
              }}
              aria-label="Pilih Jabatan"
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              {accessibleDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() =>
              exportStaffProfilesToExcel(deptProfiles, `IAB_Jabatan_${activeDept?.code || 'DEPT'}`, compMap)
            }
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Eksport Jabatan (.xlsx)
          </button>
        </div>
      </div>

      {/* BAHAGIAN A: INFO PEGAWAI DAN STAF DI [NAMA JABATAN] (Dibuka secara default) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('A')}
          aria-expanded={openSections.A}
          className="w-full px-5 py-4 flex items-center justify-between gap-4 bg-slate-50/80 hover:bg-slate-100/70 transition-colors text-left"
        >
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3B] tracking-tight">
              BAHAGIAN A: INFO PEGAWAI DAN STAF DI {activeDeptName}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Klik mana-mana kad di bawah untuk menyemak perincian senarai pegawai jabatan.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0B1F3B] shrink-0">
            <span>{openSections.A ? 'Sembunyi' : 'Papar'}</span>
            {openSections.A ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {openSections.A && (
          <div className="p-5 border-t border-slate-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {bahagianAMetrics.map((card) => (
                <button
                  key={card.id}
                  type="button"
                  onClick={() => openMetricModal(card)}
                  className="group bg-white border border-slate-200 hover:border-[#0B1F3B] hover:bg-slate-50/70 rounded-xl p-4 text-left transition-colors focus:outline-none focus:ring-2 focus:ring-[#0B1F3B]/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold text-[#0B1F3B]">
                        <span className="font-mono-tabular text-slate-400 mr-1">{card.numberLabel}</span>
                        {card.title}
                      </p>
                      {card.subtitle && (
                        <p className="text-[11px] text-slate-500 mt-0.5">{card.subtitle}</p>
                      )}
                    </div>
                    <span className="text-[11px] font-medium text-slate-400 group-hover:text-[#0B1F3B] shrink-0">
                      Perincian
                    </span>
                  </div>
                  <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-2.5">
                    {card.displayValue}
                  </p>
                  <p className="text-xs font-medium text-slate-600 font-mono-tabular mt-1">
                    {card.genderText}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* BAHAGIAN B: ANALITIK & CARTA STATISTIK JABATAN (Sembunyi secara default) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('B')}
          aria-expanded={openSections.B}
          className="w-full px-5 py-4 flex items-center justify-between gap-4 bg-slate-50/80 hover:bg-slate-100/70 transition-colors text-left"
        >
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3B] tracking-tight">
              BAHAGIAN B: ANALITIK & CARTA STATISTIK JABATAN
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Statistik gred, kelayakan akademik, kompetensi digital & AI serta senarai pakar mengikut bidang.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0B1F3B] shrink-0">
            <span>{openSections.B ? 'Sembunyi' : 'Papar'}</span>
            {openSections.B ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {openSections.B && (
          <div className="p-5 border-t border-slate-200 space-y-6">
            {deptProfiles.length === 0 ? (
              <div className="border border-slate-200 rounded-xl p-10 text-center text-sm font-semibold text-[#0B1F3B]">
                Tiada pegawai didaftarkan di bawah jabatan ini lagi
              </div>
            ) : (
              <>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-[#0B1F3B] mb-4">Statistik Jawatan & Gred</h4>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={gradeStats}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                          <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                          <Tooltip />
                          <Bar dataKey="jumlah" name="Pegawai" fill="#0B1F3B" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5">
                    <h4 className="text-sm font-bold text-[#0B1F3B] mb-4">Kelayakan Akademik Jabatan</h4>
                    <div className="h-60">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={qualStats}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={45}
                            outerRadius={78}
                            paddingAngle={2}
                          >
                            {qualStats.map((entry, idx) => (
                              <Cell key={entry.name} fill={COLORS[idx % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend wrapperStyle={{ fontSize: 11 }} />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl p-5 lg:col-span-2">
                    <h4 className="text-sm font-bold text-[#0B1F3B] mb-4">
                      Taburan Kompetensi Digital & AI (Aplikasi vs Pengetahuan)
                    </h4>
                    {digitalSkillChartData.length === 0 ? (
                      <div className="h-64 flex items-center justify-center text-xs text-slate-500">
                        Belum ada rekod Kompetensi Digital & AI diisi.
                      </div>
                    ) : (
                      <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={digitalSkillChartData} layout="vertical" margin={{ left: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                            <Tooltip />
                            <Legend wrapperStyle={{ fontSize: 11 }} />
                            <Bar dataKey="aplikasi" name="Kemahiran Aplikasi" stackId="s" fill="#0B1F3B" />
                            <Bar dataKey="pengetahuan" name="Kemahiran Pengetahuan" stackId="s" fill="#C69738" />
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    )}
                  </div>
                </div>

                {/* Senarai Pakar Mengikut Bidang */}
                <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
                  <h4 className="text-sm font-bold text-[#0B1F3B]">Senarai Pakar Mengikut Bidang</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {expertiseGroups.map(([field, list]) => (
                      <div key={field} className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                        <div className="flex items-center justify-between mb-2">
                          <h5 className="text-xs font-bold text-[#0B1F3B]">{field}</h5>
                          <span className="text-xs font-mono-tabular text-slate-600">
                            {list.length} orang ({computePercentage(list.length, deptProfiles.length)}%)
                          </span>
                        </div>
                        <ul className="space-y-1.5 text-xs text-slate-700">
                          {list.map((p) => (
                            <li key={p.staffId} className="flex items-center justify-between gap-2">
                              <span className="truncate">{p.fullName}</span>
                              <button
                                type="button"
                                onClick={() => onInspectProfile(p.staffId)}
                                className="text-[#0B1F3B] font-semibold hover:underline shrink-0"
                              >
                                Profil
                              </button>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* BAHAGIAN C: DIREKTORI PEGAWAI JABATAN (Sembunyi secara default) */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          type="button"
          onClick={() => toggleSection('C')}
          aria-expanded={openSections.C}
          className="w-full px-5 py-4 flex items-center justify-between gap-4 bg-slate-50/80 hover:bg-slate-100/70 transition-colors text-left"
        >
          <div>
            <h3 className="text-sm font-bold text-[#0B1F3B] tracking-tight">
              BAHAGIAN C: DIREKTORI PEGAWAI JABATAN ({filteredProfiles.length})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Carian, penapisan Kompetensi IAB, penyusunan setiap lajur dan kawalan paparan halaman.
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-semibold text-[#0B1F3B] shrink-0">
            <span>{openSections.C ? 'Sembunyi' : 'Papar'}</span>
            {openSections.C ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </div>
        </button>

        {openSections.C && (
          <div className="p-5 border-t border-slate-200 space-y-4">
            {/* Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari nama, ID, kepakaran, IAB, AI..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                />
              </div>
              <select
                value={filterGrade}
                onChange={(e) => setFilterGrade(e.target.value)}
                aria-label="Tapis Gred"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              >
                <option value="ALL">Semua Gred</option>
                {uniqueGrades.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>
              <select
                value={filterQual}
                onChange={(e) => setFilterQual(e.target.value)}
                aria-label="Tapis Kelayakan"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              >
                <option value="ALL">Semua Kelayakan</option>
                {uniqueQuals.map((q) => (
                  <option key={q} value={q}>
                    {q}
                  </option>
                ))}
              </select>
              <select
                value={filterExpertise}
                onChange={(e) => setFilterExpertise(e.target.value)}
                aria-label="Tapis Kepakaran"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              >
                <option value="ALL">Semua Kepakaran</option>
                {uniqueExps.map((ex) => (
                  <option key={ex} value={ex}>
                    {ex}
                  </option>
                ))}
              </select>
              <select
                value={filterIabComp}
                onChange={(e) => setFilterIabComp(e.target.value as IabFilterOption)}
                aria-label="Tapis Kompetensi IAB"
                className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
              >
                <option value="ALL">Semua Kompetensi IAB</option>
                <option value="certifiedCoach">Certified Coach (CC)</option>
                <option value="certifiedTrainer">Certified Trainer (CT)</option>
                <option value="certifiedMasterCoach">Certified Master Coach (CMC)</option>
                <option value="certifiedMasterTrainer">Certified Master Trainer (CMT)</option>
                <option value="certifiedAccessor">Certified Accessor (CA)</option>
                <option value="konsultanIab">Konsultan IAB</option>
                <option value="ANY">Ada Mana-mana Pensijilan IAB</option>
                <option value="NONE">Tiada Pensijilan IAB</option>
              </select>
            </div>

            {/* Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('fullName')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Pegawai</span>
                        {renderSortIcon('fullName')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('gender')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Jantina</span>
                        {renderSortIcon('gender')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('position')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Jawatan & Gred</span>
                        {renderSortIcon('position')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('primaryExpertise')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Kepakaran Utama</span>
                        {renderSortIcon('primaryExpertise')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('digitalComp')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Kompetensi Digital & AI</span>
                        {renderSortIcon('digitalComp')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold">
                      <button
                        type="button"
                        onClick={() => handleSort('iabComp')}
                        className="inline-flex items-center gap-1 hover:text-[#0B1F3B]"
                      >
                        <span>Kompetensi IAB</span>
                        {renderSortIcon('iabComp')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">
                      <button
                        type="button"
                        onClick={() => handleSort('completion')}
                        className="inline-flex items-center justify-end gap-1 hover:text-[#0B1F3B] ml-auto"
                      >
                        <span>Kelengkapan</span>
                        {renderSortIcon('completion')}
                      </button>
                    </th>
                    <th className="py-2.5 px-3 font-semibold text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {paginatedProfiles.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-8 text-center text-slate-500">
                        Tiada rekod pegawai yang sepadan dengan penapis yang dipilih.
                      </td>
                    </tr>
                  ) : (
                    paginatedProfiles.map((p) => {
                      const items = compMap.get(p.staffId) || [];
                      const compSummary =
                        items.length > 0
                          ? items
                              .slice(0, 2)
                              .map((i) => `${i.categoryName} (${i.level})`)
                              .join(', ') + (items.length > 2 ? ` +${items.length - 2}` : '')
                          : p.digitalCompetencies?.slice(0, 2).join(', ') || 'Belum Diisi';
                      const iabCodes = getIabCertCodesForStaff(iabMap.get(p.staffId));
                      const gCode = genderMap[p.staffId] || '-';
                      return (
                        <tr key={p.staffId} className="hover:bg-slate-50/70">
                          <td className="py-2.5 px-3">
                            <div className="flex items-center gap-2.5">
                              <DriveImage
                                driveFileId={p.photoDisplayUrl}
                                fullName={p.fullName}
                                className="w-8 h-8 rounded-md"
                              />
                              <div>
                                <p className="font-semibold text-[#0B1F3B]">{p.fullName}</p>
                                <p className="text-[11px] text-slate-500 font-mono-tabular">
                                  {p.staffId}
                                </p>
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5 px-3 font-mono-tabular font-semibold text-slate-700">
                            {gCode}
                          </td>
                          <td className="py-2.5 px-3">
                            <span>{p.position || 'Belum Diisi'}</span>
                            <span className="text-slate-400"> · </span>
                            <span className="font-mono-tabular">{p.grade || '-'}</span>
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {p.primaryExpertise || 'Belum Diisi'}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">{compSummary}</td>
                          <td className="py-2.5 px-3 text-slate-700 font-mono-tabular">
                            {iabCodes.length > 0 ? iabCodes.join(', ') : 'Tiada'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold text-[#0B1F3B]">
                            {p.completionPercent}%
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <button
                              type="button"
                              onClick={() => onInspectProfile(p.staffId)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-md"
                            >
                              <Eye className="w-3 h-3" /> Lihat
                            </button>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination & Page Size Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1 text-xs text-slate-600">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex items-center gap-2">
                  <span>Papar:</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      const val = e.target.value;
                      setPageSize(val === 'ALL' ? 'ALL' : (Number(val) as PageSizeOption));
                    }}
                    className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white font-mono-tabular"
                  >
                    <option value={5}>5</option>
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={20}>20</option>
                    <option value={25}>25</option>
                    <option value={30}>30</option>
                    <option value="ALL">Semua</option>
                  </select>
                </label>
                <span className="font-mono-tabular">
                  Menunjukkan {rangeStart}–{rangeEnd} daripada {sortedProfiles.length} pegawai
                </span>
              </div>

              {pageSize !== 'ALL' && totalPages > 1 && (
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    disabled={safeCurrentPage <= 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-2.5 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-100"
                  >
                    Sebelum
                  </button>
                  <span className="px-2 font-mono-tabular">
                    Halaman {safeCurrentPage} / {totalPages}
                  </span>
                  <button
                    type="button"
                    disabled={safeCurrentPage >= totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-2.5 py-1 border border-slate-300 rounded-md disabled:opacity-40 hover:bg-slate-100"
                  >
                    Seterusnya
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* Clickable Flashcard Detail Modal */}
      {activeModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white border border-slate-200 rounded-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-[#0B1F3B]">{activeModal.title}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{activeModal.subtitle}</p>
              </div>
              <button
                type="button"
                onClick={() => setActiveModal(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                aria-label="Tutup perincian"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center gap-2">
              {(
                [
                  {
                    key: 'ALL',
                    label: `Semua (${activeModal.scopeProfiles.length})`,
                    show: true,
                  },
                  {
                    key: 'MATCHED',
                    label: `${activeModal.certKey ? 'Ada' : 'Lengkap'} (${activeModal.matchedIds.size})`,
                    show: activeModal.mode === 'ratio_with_status',
                  },
                  {
                    key: 'UNMATCHED',
                    label: `${activeModal.certKey ? 'Tiada' : 'Belum Lengkap'} (${Math.max(
                      0,
                      activeModal.scopeProfiles.length - activeModal.matchedIds.size
                    )})`,
                    show: activeModal.mode === 'ratio_with_status',
                  },
                  {
                    key: 'L',
                    label: `Lelaki (${computeGenderBreakdown(activeModal.scopeProfiles, genderMap).male})`,
                    show: true,
                  },
                  {
                    key: 'P',
                    label: `Perempuan (${computeGenderBreakdown(activeModal.scopeProfiles, genderMap).female})`,
                    show: true,
                  },
                ] as const
              )
                .filter((t) => t.show)
                .map((tab) => (
                  <button
                    key={tab.key}
                    type="button"
                    onClick={() => setModalFilter(tab.key)}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors ${
                      modalFilter === tab.key
                        ? 'bg-[#0B1F3B] text-white border-[#0B1F3B]'
                        : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
            </div>

            <div className="p-5 overflow-y-auto">
              <div className="overflow-x-auto border border-slate-200 rounded-lg">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3 font-semibold">Bil.</th>
                      <th className="py-2.5 px-3 font-semibold">Pegawai</th>
                      <th className="py-2.5 px-3 font-semibold">Jantina</th>
                      <th className="py-2.5 px-3 font-semibold">Jawatan & Gred</th>
                      <th className="py-2.5 px-3 font-semibold">Kepakaran Utama</th>
                      <th className="py-2.5 px-3 font-semibold">Status Perincian</th>
                      <th className="py-2.5 px-3 font-semibold text-right">Tindakan</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {modalDisplayRows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-8 text-center text-slate-500">
                          Tiada rekod pegawai bagi pilihan ini.
                        </td>
                      </tr>
                    ) : (
                      modalDisplayRows.map((p, idx) => {
                        const iabRec = iabMap.get(p.staffId);
                        const certKey = activeModal.certKey;
                        let detailText = `Profil ${p.completionPercent}%`;
                        if (certKey) {
                          const hasCert = hasIabCert(iabRec, certKey);
                          const yr = getIabCertPassYear(iabRec, certKey);
                          detailText = hasCert ? `Ada (Tahun Lulus: ${yr})` : 'Tiada';
                        } else if (activeModal.mode === 'ratio_with_status') {
                          const iabFilled = iabMap.has(p.staffId);
                          detailText = `Profil: ${p.completionPercent}% · Kompetensi IAB: ${
                            iabFilled ? 'Sudah Diisi' : 'Belum Diisi'
                          }`;
                        } else {
                          detailText = p.isLecturer ? 'Pensyarah' : 'Bukan Pensyarah';
                        }

                        return (
                          <tr key={p.staffId} className="hover:bg-slate-50/70">
                            <td className="py-2.5 px-3 font-mono-tabular text-slate-500">
                              {idx + 1}.
                            </td>
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-[#0B1F3B]">{p.fullName}</p>
                              <p className="text-[11px] text-slate-500 font-mono-tabular">
                                {p.staffId}
                              </p>
                            </td>
                            <td className="py-2.5 px-3 font-mono-tabular font-semibold text-slate-700">
                              {genderMap[p.staffId] || '-'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">
                              {p.position || 'Belum Diisi'} ·{' '}
                              <span className="font-mono-tabular">{p.grade || '-'}</span>
                            </td>
                            <td className="py-2.5 px-3 text-slate-600">
                              {p.primaryExpertise || 'Belum Diisi'}
                            </td>
                            <td className="py-2.5 px-3 text-slate-700">{detailText}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => {
                                  setActiveModal(null);
                                  onInspectProfile(p.staffId);
                                }}
                                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-md"
                              >
                                <Eye className="w-3 h-3" /> Lihat Profil
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
