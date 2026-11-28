import React, { useEffect, useMemo, useState } from 'react';
import {
  BookMarked,
  ClipboardCheck,
  Edit3,
  Handshake,
  Lightbulb,
  Loader2,
  Plus,
  Save,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  CONSULTATION_TYPES,
  DEFAULT_IAB_MODULES,
  DEFAULT_PUBLICATION_YEARS,
  PROGRAM_EVALUATION_CENTERS,
  PROGRAM_MANAGEMENT_ROLES,
  THINK_TANK_LEVELS,
  THINK_TANK_ROLES,
  TRAINING_ROLES,
  getProgramEvaluationRating,
} from '../lib/constants';
import { getStaffFunctions, makeRecordId, saveStaffFunctions } from '../services/firestoreService';
import type {
  ConsultationRecord,
  Department,
  NpqelSupervisionRecord,
  OrganizationCenter,
  ProgramEvaluationRecord,
  ProgramManagementRecord,
  StaffFunctionsRecord,
  StaffProfile,
  SystemSetting,
  ThinkTankRecord,
  TrainingRecord,
  UserAccount,
} from '../types/iab';

interface StaffFunctionsPageProps {
  activeSection: 'latihan' | 'konsultasi' | 'pentaksiran' | 'pemikir';
  userAccount: UserAccount;
  profiles: StaffProfile[];
  organizations: OrganizationCenter[];
  departments: Department[];
  sysSettings: SystemSetting | null;
}

const SECTION_META: Record<
  StaffFunctionsPageProps['activeSection'],
  {
    title: string;
    description: string;
    icon: React.ComponentType<{ className?: string }>;
  }
> = {
  latihan: {
    title: 'Fungsi 1: Latihan dan Pembangunan',
    description:
      'Latihan dan Pembangunan – Melaksanakan kursus dan program pembangunan kepimpinan serta pengurusan pendidikan untuk pengetua, guru besar, pemimpin sekolah, dan warga KPM.',
    icon: BookMarked,
  },
  konsultasi: {
    title: 'Fungsi 2: Khidmat Pembangunan Organisasi (Konsultasi)',
    description:
      'Khidmat Pembangunan Organisasi (Konsultasi) – Memberi khidmat nasihat, bimbingan, dan sokongan transformasi untuk meningkatkan keberkesanan organisasi pendidikan.',
    icon: Handshake,
  },
  pentaksiran: {
    title: 'Fungsi 5: Pentaksiran',
    description:
      'Pentaksiran – Melaksanakan penilaian dan pentaksiran kompetensi serta kesediaan kepimpinan pendidikan.',
    icon: ClipboardCheck,
  },
  pemikir: {
    title: 'Fungsi 6: Pasukan Pemikir',
    description:
      'Pasukan Pemikir – Menganggotai jawatankuasa pemikir, kumpulan pakar rujuk, dan perancangan strategik pendidikan di peringkat institut, KPM, kebangsaan, atau antarabangsa.',
    icon: Lightbulb,
  },
};

export const StaffFunctionsPage: React.FC<StaffFunctionsPageProps> = ({
  activeSection,
  userAccount,
  profiles,
  organizations,
  departments,
  sysSettings,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [record, setRecord] = useState<StaffFunctionsRecord | null>(null);

  // Popup modal states
  const [trainingModalOpen, setTrainingModalOpen] = useState(false);
  const [editingTrainingId, setEditingTrainingId] = useState<string | null>(null);
  const [trModule, setTrModule] = useState('');
  const [trRole, setTrRole] = useState(TRAINING_ROLES[0]);
  const [trYear, setTrYear] = useState('');

  const [programModalOpen, setProgramModalOpen] = useState(false);
  const [editingProgramId, setEditingProgramId] = useState<string | null>(null);
  const [pgName, setPgName] = useState('');
  const [pgCenterId, setPgCenterId] = useState('');
  const [pgDeptId, setPgDeptId] = useState('');
  const [pgRole, setPgRole] = useState(PROGRAM_MANAGEMENT_ROLES[0]);
  const [pgYear, setPgYear] = useState('');

  const [consultModalOpen, setConsultModalOpen] = useState(false);
  const [editingConsultId, setEditingConsultId] = useState<string | null>(null);
  const [coTitle, setCoTitle] = useState('');
  const [coOrg, setCoOrg] = useState('');
  const [coType, setCoType] = useState(CONSULTATION_TYPES[0]);
  const [coRole, setCoRole] = useState('');
  const [coYear, setCoYear] = useState('');
  const [coImpact, setCoImpact] = useState('');

  const [npqelModalOpen, setNpqelModalOpen] = useState(false);
  const [editingNpqelId, setEditingNpqelId] = useState<string | null>(null);
  const [nqName, setNqName] = useState('');
  const [nqClass, setNqClass] = useState('');
  const [nqYear, setNqYear] = useState('');

  const [evalModalOpen, setEvalModalOpen] = useState(false);
  const [editingEvalId, setEditingEvalId] = useState<string | null>(null);
  const [evName, setEvName] = useState('');
  const [evCenterName, setEvCenterName] = useState(PROGRAM_EVALUATION_CENTERS[0]);
  const [evRole, setEvRole] = useState(PROGRAM_MANAGEMENT_ROLES[0]);
  const [evYear, setEvYear] = useState('');
  const [evScore, setEvScore] = useState('98.4');

  const [thinkModalOpen, setThinkModalOpen] = useState(false);
  const [editingThinkId, setEditingThinkId] = useState<string | null>(null);
  const [thCommittee, setThCommittee] = useState('');
  const [thLevel, setThLevel] = useState(THINK_TANK_LEVELS[0]);
  const [thRole, setThRole] = useState(THINK_TANK_ROLES[0]);
  const [thFocus, setThFocus] = useState('');
  const [thYear, setThYear] = useState('');
  const [thStatus, setThStatus] = useState<'Aktif' | 'Tamat'>('Aktif');

  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'training' | 'program' | 'consultation' | 'npqel' | 'evaluation' | 'thinktank';
    id: string;
    label: string;
  } | null>(null);

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile = profiles.find((p) => p.staffId === selectedStaffId);
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const yearOptions = useMemo(
    () =>
      sysSettings?.publicationYears?.length
        ? sysSettings.publicationYears
        : DEFAULT_PUBLICATION_YEARS,
    [sysSettings?.publicationYears]
  );

  const moduleOptions = useMemo(
    () => (sysSettings?.iabModules?.length ? sysSettings.iabModules : DEFAULT_IAB_MODULES),
    [sysSettings?.iabModules]
  );

  const loadFunctions = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const res = await getStaffFunctions(staffIdToLoad);
      setRecord(res);
    } catch {
      setRecord(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadFunctions(selectedStaffId);
    }
  }, [selectedStaffId]);

  const trainings = record?.trainings || [];
  const programManagements = record?.programManagements || [];
  const consultations = record?.consultations || [];
  const npqelSupervisions = record?.npqelSupervisions || [];
  const programEvaluations = record?.programEvaluations || [];
  const thinkTankEntries = record?.thinkTankEntries || [];

  const persistAll = async (partial: Partial<StaffFunctionsRecord>) => {
    if (!selectedStaffId) return;
    setSaving(true);
    try {
      const saved = await saveStaffFunctions({
        staffId: selectedStaffId,
        uid: isOwnRecord ? userAccount.uid : activeProfile?.uid || '',
        centerId: activeProfile?.centerId || userAccount.centerId || '',
        departmentId: activeProfile?.departmentId || userAccount.departmentId || '',
        trainings: partial.trainings ?? trainings,
        programManagements: partial.programManagements ?? programManagements,
        consultations: partial.consultations ?? consultations,
        npqelSupervisions: partial.npqelSupervisions ?? npqelSupervisions,
        programEvaluations: partial.programEvaluations ?? programEvaluations,
        thinkTankEntries: partial.thinkTankEntries ?? thinkTankEntries,
      });
      setRecord(saved);
      showToast('success', 'Rekod fungsi pegawai berjaya disimpan.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan rekod fungsi pegawai.');
      throw err;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveTraining = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!trModule.trim() || !trYear.trim()) return;
    const nextItem: TrainingRecord = {
      id: editingTrainingId || makeRecordId('TRN'),
      moduleName: trModule.trim(),
      role: trRole.trim(),
      year: trYear.trim(),
    };
    const nextList = editingTrainingId
      ? trainings.map((x) => (x.id === editingTrainingId ? nextItem : x))
      : [...trainings, nextItem];
    await persistAll({ trainings: nextList });
    setTrainingModalOpen(false);
  };

  const handleSaveProgram = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pgName.trim() || !pgYear.trim()) return;
    const center = organizations.find((c) => c.id === pgCenterId);
    const dept = departments.find((d) => d.id === pgDeptId);
    const nextItem: ProgramManagementRecord = {
      id: editingProgramId || makeRecordId('PRG'),
      programName: pgName.trim(),
      centerId: pgCenterId,
      centerName: center?.name || '',
      departmentId: pgDeptId,
      departmentName: dept?.name || '',
      role: pgRole.trim(),
      year: pgYear.trim(),
    };
    const nextList = editingProgramId
      ? programManagements.map((x) => (x.id === editingProgramId ? nextItem : x))
      : [...programManagements, nextItem];
    await persistAll({ programManagements: nextList });
    setProgramModalOpen(false);
  };

  const handleSaveConsultation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coTitle.trim() || !coYear.trim()) return;
    const nextItem: ConsultationRecord = {
      id: editingConsultId || makeRecordId('CON'),
      title: coTitle.trim(),
      organization: coOrg.trim(),
      consultationType: coType.trim(),
      role: coRole.trim() || 'Perunding',
      year: coYear.trim(),
      impact: coImpact.trim(),
    };
    const nextList = editingConsultId
      ? consultations.map((x) => (x.id === editingConsultId ? nextItem : x))
      : [...consultations, nextItem];
    await persistAll({ consultations: nextList });
    setConsultModalOpen(false);
  };

  const handleSaveNpqel = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nqName.trim() || !nqClass.trim() || !nqYear.trim()) return;
    const nextItem: NpqelSupervisionRecord = {
      id: editingNpqelId || makeRecordId('NPQ'),
      participantName: nqName.trim(),
      participantClass: nqClass.trim(),
      year: nqYear.trim(),
    };
    const nextList = editingNpqelId
      ? npqelSupervisions.map((x) => (x.id === editingNpqelId ? nextItem : x))
      : [...npqelSupervisions, nextItem];
    await persistAll({ npqelSupervisions: nextList });
    setNpqelModalOpen(false);
  };

  const handleSaveEvaluation = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericScore = Number(evScore);
    if (!evName.trim() || !evCenterName.trim() || !evRole.trim() || !evYear.trim() || !Number.isFinite(numericScore)) {
      return;
    }
    if (numericScore < 0 || numericScore > 100) {
      showToast('error', 'Nilai penilaian program mestilah antara 0 hingga 100.');
      return;
    }
    const nextItem: ProgramEvaluationRecord = {
      id: editingEvalId || makeRecordId('EVA'),
      programName: evName.trim(),
      centerName: evCenterName.trim(),
      role: evRole.trim(),
      year: evYear.trim(),
      score: Math.round(numericScore * 10) / 10,
    };
    const nextList = editingEvalId
      ? programEvaluations.map((x) => (x.id === editingEvalId ? nextItem : x))
      : [...programEvaluations, nextItem];
    await persistAll({ programEvaluations: nextList });
    setEvalModalOpen(false);
  };

  const handleSaveThinkTank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!thCommittee.trim() || !thYear.trim()) return;
    const nextItem: ThinkTankRecord = {
      id: editingThinkId || makeRecordId('THK'),
      committeeName: thCommittee.trim(),
      level: thLevel.trim(),
      role: thRole.trim(),
      focusArea: thFocus.trim(),
      year: thYear.trim(),
      activeStatus: thStatus,
    };
    const nextList = editingThinkId
      ? thinkTankEntries.map((x) => (x.id === editingThinkId ? nextItem : x))
      : [...thinkTankEntries, nextItem];
    await persistAll({ thinkTankEntries: nextList });
    setThinkModalOpen(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === 'training') {
      await persistAll({ trainings: trainings.filter((x) => x.id !== deleteTarget.id) });
    } else if (deleteTarget.kind === 'program') {
      await persistAll({
        programManagements: programManagements.filter((x) => x.id !== deleteTarget.id),
      });
    } else if (deleteTarget.kind === 'consultation') {
      await persistAll({
        consultations: consultations.filter((x) => x.id !== deleteTarget.id),
      });
    } else if (deleteTarget.kind === 'npqel') {
      await persistAll({
        npqelSupervisions: npqelSupervisions.filter((x) => x.id !== deleteTarget.id),
      });
    } else if (deleteTarget.kind === 'evaluation') {
      await persistAll({
        programEvaluations: programEvaluations.filter((x) => x.id !== deleteTarget.id),
      });
    } else if (deleteTarget.kind === 'thinktank') {
      await persistAll({
        thinkTankEntries: thinkTankEntries.filter((x) => x.id !== deleteTarget.id),
      });
    }
    setDeleteTarget(null);
  };

  const meta = SECTION_META[activeSection];
  const HeaderIcon = meta.icon;
  const pgFilteredDepts = departments.filter((d) => !pgCenterId || d.centerId === pgCenterId);
  const defaultYear = yearOptions[yearOptions.length - 1] || String(new Date().getFullYear());

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 max-w-3xl">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <HeaderIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">{meta.title}</h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{meta.description}</p>
          </div>
        </div>

        {canSwitchStaff && profiles.length > 0 && (
          <div className="flex items-center gap-2 min-w-[260px]">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
              aria-label="Pilih Pegawai"
              className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-[#0B1F3B]"
            >
              {!profiles.some((p) => p.staffId === userAccount.staffId) && userAccount.staffId && (
                <option value={userAccount.staffId}>
                  {userAccount.displayName} (Rekod Saya)
                </option>
              )}
              {profiles.map((p) => (
                <option key={p.staffId} value={p.staffId}>
                  {p.fullName} ({p.staffId})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {loading ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-6 h-6 text-[#0B1F3B] animate-spin" />
          <p className="text-xs text-slate-500">Memuatkan rekod fungsi pegawai...</p>
        </div>
      ) : (
        <>
          {/* FUNGSI 1: LATIHAN DAN PEMBANGUNAN */}
          {activeSection === 'latihan' && (
            <div className="space-y-6">
              {/* BAHAGIAN LATIHAN */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                      BAHAGIAN LATIHAN
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rekod pengendalian modul latihan sebagai Tenaga Pengajar, Fasilitator atau Penceramah.
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingTrainingId(null);
                        setTrModule(moduleOptions[0] || 'Modul AI');
                        setTrRole(TRAINING_ROLES[0]);
                        setTrYear(defaultYear);
                        setTrainingModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  )}
                </div>

                {trainings.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tiada rekod pengendalian modul latihan direkodkan lagi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4 w-14">Bil.</th>
                          <th className="py-2.5 px-4">Modul</th>
                          <th className="py-2.5 px-4">Peranan</th>
                          <th className="py-2.5 px-4 w-28">Tahun</th>
                          {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                        {trainings.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500">
                              {idx + 1}.
                            </td>
                            <td className="py-3 px-4 font-semibold text-[#0B1F3B]">{item.moduleName}</td>
                            <td className="py-3 px-4 text-slate-700">{item.role}</td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">{item.year}</td>
                            {canEdit && (
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingTrainingId(item.id);
                                      setTrModule(item.moduleName);
                                      setTrRole(item.role);
                                      setTrYear(item.year);
                                      setTrainingModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: 'training',
                                        id: item.id,
                                        label: item.moduleName,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" /> Padam
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BAHAGIAN PENGURUSAN PROGRAM */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                      BAHAGIAN PENGURUSAN PROGRAM
                    </h2>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Rekod pengurusan program mengikut Pusat, Jabatan, Peranan dan Tahun pelaksanaan.
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        const defaultCid =
                          activeProfile?.centerId ||
                          userAccount.centerId ||
                          organizations[0]?.id ||
                          '';
                        const defaultDid =
                          activeProfile?.departmentId ||
                          departments.find((d) => d.centerId === defaultCid)?.id ||
                          '';
                        setEditingProgramId(null);
                        setPgName('');
                        setPgCenterId(defaultCid);
                        setPgDeptId(defaultDid);
                        setPgRole(PROGRAM_MANAGEMENT_ROLES[0]);
                        setPgYear(defaultYear);
                        setProgramModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  )}
                </div>

                {programManagements.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tiada rekod pengurusan program direkodkan lagi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4 w-14">Bil.</th>
                          <th className="py-2.5 px-4">Nama Program</th>
                          <th className="py-2.5 px-4">Pusat</th>
                          <th className="py-2.5 px-4">Jabatan</th>
                          <th className="py-2.5 px-4">Peranan</th>
                          <th className="py-2.5 px-4 w-24">Tahun</th>
                          {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                        {programManagements.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500">
                              {idx + 1}.
                            </td>
                            <td className="py-3 px-4 font-semibold text-[#0B1F3B]">{item.programName}</td>
                            <td className="py-3 px-4 text-slate-700">{item.centerName || '-'}</td>
                            <td className="py-3 px-4 text-slate-700">{item.departmentName || '-'}</td>
                            <td className="py-3 px-4 text-slate-700">{item.role}</td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">{item.year}</td>
                            {canEdit && (
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingProgramId(item.id);
                                      setPgName(item.programName);
                                      setPgCenterId(item.centerId);
                                      setPgDeptId(item.departmentId);
                                      setPgRole(item.role);
                                      setPgYear(item.year);
                                      setProgramModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: 'program',
                                        id: item.id,
                                        label: item.programName,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" /> Padam
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FUNGSI 2: KONSULTASI */}
          {activeSection === 'konsultasi' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    REKOD KHIDMAT PEMBANGUNAN ORGANISASI (KONSULTASI)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Khidmat nasihat, bimbingan transformasi, dan sokongan keberkesanan organisasi pendidikan.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingConsultId(null);
                      setCoTitle('');
                      setCoOrg('');
                      setCoType(CONSULTATION_TYPES[0]);
                      setCoRole('Ketua Perunding');
                      setCoYear(defaultYear);
                      setCoImpact('');
                      setConsultModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Rekod
                  </button>
                )}
              </div>

              {consultations.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Tiada rekod konsultasi organisasi direkodkan lagi.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-4 w-14">Bil.</th>
                        <th className="py-2.5 px-4">Tajuk / Program Konsultasi</th>
                        <th className="py-2.5 px-4">Organisasi / Klien</th>
                        <th className="py-2.5 px-4">Jenis Khidmat</th>
                        <th className="py-2.5 px-4">Peranan</th>
                        <th className="py-2.5 px-4 w-24">Tahun</th>
                        <th className="py-2.5 px-4">Impak / Hasil</th>
                        {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                      {consultations.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                            {idx + 1}.
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#0B1F3B] align-top">
                            {item.title}
                          </td>
                          <td className="py-3 px-4 text-slate-700 align-top">
                            {item.organization || '-'}
                          </td>
                          <td className="py-3 px-4 text-slate-700 align-top">
                            {item.consultationType}
                          </td>
                          <td className="py-3 px-4 text-slate-700 align-top">{item.role || '-'}</td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-700 align-top">
                            {item.year}
                          </td>
                          <td className="py-3 px-4 text-slate-600 align-top">
                            {item.impact || '-'}
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingConsultId(item.id);
                                    setCoTitle(item.title);
                                    setCoOrg(item.organization);
                                    setCoType(item.consultationType);
                                    setCoRole(item.role);
                                    setCoYear(item.year);
                                    setCoImpact(item.impact);
                                    setConsultModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'consultation',
                                      id: item.id,
                                      label: item.title,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-3 h-3" /> Padam
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* FUNGSI 5: PENTAKSIRAN */}
          {activeSection === 'pentaksiran' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-sm font-extrabold text-[#0B1F3B] uppercase tracking-wider">
                  REKOD PENTAKSIRAN:
                </h2>
              </div>

              {/* BAHAGIAN A: PENYELIAAN PESERTA NPQEL */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                      BAHAGIAN A: PENYELIAAN PESERTA NPQEL
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Senarai penyeliaan peserta NPQEL mengikut kelas peserta dan tahun.
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingNpqelId(null);
                        setNqName('');
                        setNqClass('');
                        setNqYear(defaultYear);
                        setNpqelModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  )}
                </div>

                {npqelSupervisions.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tiada rekod penyeliaan peserta NPQEL direkodkan lagi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4 w-14">Bil.</th>
                          <th className="py-2.5 px-4">Nama Peserta</th>
                          <th className="py-2.5 px-4">Kelas Peserta</th>
                          <th className="py-2.5 px-4 w-28">Tahun</th>
                          {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                        {npqelSupervisions.map((item, idx) => (
                          <tr key={item.id} className="hover:bg-slate-50/70">
                            <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500">
                              {idx + 1}.
                            </td>
                            <td className="py-3 px-4 font-semibold text-[#0B1F3B]">
                              {item.participantName}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">
                              {item.participantClass}
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-slate-700">
                              {item.year}
                            </td>
                            {canEdit && (
                              <td className="py-3 px-4 text-right">
                                <div className="inline-flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingNpqelId(item.id);
                                      setNqName(item.participantName);
                                      setNqClass(item.participantClass);
                                      setNqYear(item.year);
                                      setNpqelModalOpen(true);
                                    }}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                  >
                                    <Edit3 className="w-3 h-3" /> Edit
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setDeleteTarget({
                                        kind: 'npqel',
                                        id: item.id,
                                        label: item.participantName,
                                      })
                                    }
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                  >
                                    <Trash2 className="w-3 h-3" /> Padam
                                  </button>
                                </div>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* BAHAGIAN B: PENILAIAN PROGRAM */}
              <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                      BAHAGIAN B: PENILAIAN PROGRAM
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Masukkan nilai penilaian program; markah 90% dan ke atas dikategorikan sebagai Cemerlang.
                    </p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingEvalId(null);
                        setEvName('');
                        setEvCenterName(PROGRAM_EVALUATION_CENTERS[0]);
                        setEvRole(PROGRAM_MANAGEMENT_ROLES[0]);
                        setEvYear(defaultYear);
                        setEvScore('');
                        setEvalModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tambah
                    </button>
                  )}
                </div>

                {programEvaluations.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-500">
                    Tiada rekod penilaian program direkodkan lagi.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4 w-14">Bil.</th>
                          <th className="py-2.5 px-4">Nama Program</th>
                          <th className="py-2.5 px-4">Pusat</th>
                          <th className="py-2.5 px-4">Peranan</th>
                          <th className="py-2.5 px-4 w-24">Tahun</th>
                          <th className="py-2.5 px-4 w-48">Penilaian Program</th>
                          {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                        {programEvaluations.map((item, idx) => {
                          const rating = getProgramEvaluationRating(item.score);
                          return (
                            <tr key={item.id} className="hover:bg-slate-50/70">
                              <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500">
                                {idx + 1}.
                              </td>
                              <td className="py-3 px-4 font-semibold text-[#0B1F3B]">
                                {item.programName}
                              </td>
                              <td className="py-3 px-4 text-slate-700">{item.centerName || '-'}</td>
                              <td className="py-3 px-4 text-slate-700">{item.role}</td>
                              <td className="py-3 px-4 font-mono-tabular text-slate-700">
                                {item.year}
                              </td>
                              <td className="py-3 px-4 font-mono-tabular font-semibold text-[#0B1F3B]">
                                {item.score}%{' '}
                                <span
                                  className={
                                    item.score >= 90 ? 'text-emerald-700' : 'text-slate-600'
                                  }
                                >
                                  ({rating})
                                </span>
                              </td>
                              {canEdit && (
                                <td className="py-3 px-4 text-right">
                                  <div className="inline-flex items-center justify-end gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingEvalId(item.id);
                                        setEvName(item.programName);
                                        setEvCenterName(item.centerName || PROGRAM_EVALUATION_CENTERS[0]);
                                        setEvRole(item.role);
                                        setEvYear(item.year);
                                        setEvScore(String(item.score));
                                        setEvalModalOpen(true);
                                      }}
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                    >
                                      <Edit3 className="w-3 h-3" /> Edit
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setDeleteTarget({
                                          kind: 'evaluation',
                                          id: item.id,
                                          label: item.programName,
                                        })
                                      }
                                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                    >
                                      <Trash2 className="w-3 h-3" /> Padam
                                    </button>
                                  </div>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* FUNGSI 6: PASUKAN PEMIKIR */}
          {activeSection === 'pemikir' && (
            <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    REKOD KEANGGOTAAN PASUKAN PEMIKIR
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Senarai jawatankuasa pemikir, peringkat penglibatan, peranan serta bidang fokus strategik.
                  </p>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingThinkId(null);
                      setThCommittee('');
                      setThLevel(THINK_TANK_LEVELS[0]);
                      setThRole(THINK_TANK_ROLES[0]);
                      setThFocus('');
                      setThYear(defaultYear);
                      setThStatus('Aktif');
                      setThinkModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                  >
                    <Plus className="w-3.5 h-3.5" /> Tambah Rekod
                  </button>
                )}
              </div>

              {thinkTankEntries.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-500">
                  Tiada rekod keanggotaan pasukan pemikir direkodkan lagi.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-slate-50/70 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        <th className="py-2.5 px-4 w-14">Bil.</th>
                        <th className="py-2.5 px-4">Nama Jawatankuasa / Pasukan</th>
                        <th className="py-2.5 px-4">Peringkat</th>
                        <th className="py-2.5 px-4">Peranan</th>
                        <th className="py-2.5 px-4">Bidang Fokus</th>
                        <th className="py-2.5 px-4 w-24">Tahun</th>
                        <th className="py-2.5 px-4 w-24">Status</th>
                        {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                      {thinkTankEntries.map((item, idx) => (
                        <tr key={item.id} className="hover:bg-slate-50/70">
                          <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                            {idx + 1}.
                          </td>
                          <td className="py-3 px-4 font-semibold text-[#0B1F3B] align-top">
                            {item.committeeName}
                          </td>
                          <td className="py-3 px-4 text-slate-700 align-top">{item.level}</td>
                          <td className="py-3 px-4 text-slate-700 align-top">{item.role}</td>
                          <td className="py-3 px-4 text-slate-600 align-top">
                            {item.focusArea || '-'}
                          </td>
                          <td className="py-3 px-4 font-mono-tabular text-slate-700 align-top">
                            {item.year}
                          </td>
                          <td className="py-3 px-4 align-top">
                            <span
                              className={`font-semibold ${
                                item.activeStatus === 'Aktif' ? 'text-emerald-700' : 'text-slate-500'
                              }`}
                            >
                              {item.activeStatus}
                            </span>
                          </td>
                          {canEdit && (
                            <td className="py-3 px-4 text-right align-top">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditingThinkId(item.id);
                                    setThCommittee(item.committeeName);
                                    setThLevel(item.level);
                                    setThRole(item.role);
                                    setThFocus(item.focusArea);
                                    setThYear(item.year);
                                    setThStatus(item.activeStatus);
                                    setThinkModalOpen(true);
                                  }}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                                >
                                  <Edit3 className="w-3 h-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'thinktank',
                                      id: item.id,
                                      label: item.committeeName,
                                    })
                                  }
                                  className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded"
                                >
                                  <Trash2 className="w-3 h-3" /> Padam
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {/* Confirm Delete Dialog */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Padam Rekod"
        description={`Sahkan pemadaman rekod "${deleteTarget?.label || ''}"?`}
        confirmLabel="Padam"
        onConfirm={handleConfirmDelete}
        onCancel={() => setDeleteTarget(null)}
      />

      {/* Modal: Bahagian Latihan */}
      {trainingModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setTrainingModalOpen(false)}
        >
          <form
            onSubmit={handleSaveTraining}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingTrainingId ? 'Kemas Kini Rekod Latihan' : 'Tambah Rekod Latihan'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setTrainingModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Modul / Kursus *
                </label>
                <input
                  type="text"
                  required
                  list="iab-training-module-suggestions"
                  value={trModule}
                  onChange={(e) => setTrModule(e.target.value)}
                  placeholder="cth: Modul AI / Modul Pentaksiran / Modul Kecergasan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
                <datalist id="iab-training-module-suggestions">
                  {moduleOptions.map((m) => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan *</label>
                  <select
                    value={trRole}
                    onChange={(e) => setTrRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {trRole && !TRAINING_ROLES.includes(trRole) && (
                      <option value={trRole}>{trRole}</option>
                    )}
                    {TRAINING_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={trYear}
                    onChange={(e) => setTrYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {trYear && !yearOptions.includes(trYear) && <option value={trYear}>{trYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setTrainingModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Bahagian Pengurusan Program */}
      {programModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setProgramModalOpen(false)}
        >
          <form
            onSubmit={handleSaveProgram}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingProgramId ? 'Kemas Kini Pengurusan Program' : 'Tambah Pengurusan Program'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setProgramModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Program *
                </label>
                <input
                  type="text"
                  required
                  value={pgName}
                  onChange={(e) => setPgName(e.target.value)}
                  placeholder="cth: Program AI Kepimpinan Pendidikan"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat *</label>
                  <select
                    required
                    value={pgCenterId}
                    onChange={(e) => {
                      const nextCid = e.target.value;
                      setPgCenterId(nextCid);
                      setPgDeptId('');
                    }}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Pilih Pusat --</option>
                    {organizations.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Jabatan *</label>
                  <select
                    required
                    value={pgDeptId}
                    onChange={(e) => setPgDeptId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Pilih Jabatan --</option>
                    {pgFilteredDepts.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan *</label>
                  <select
                    value={pgRole}
                    onChange={(e) => setPgRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {pgRole && !PROGRAM_MANAGEMENT_ROLES.includes(pgRole) && (
                      <option value={pgRole}>{pgRole}</option>
                    )}
                    {PROGRAM_MANAGEMENT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={pgYear}
                    onChange={(e) => setPgYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {pgYear && !yearOptions.includes(pgYear) && <option value={pgYear}>{pgYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setProgramModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Konsultasi */}
      {consultModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setConsultModalOpen(false)}
        >
          <form
            onSubmit={handleSaveConsultation}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingConsultId ? 'Kemas Kini Rekod Konsultasi' : 'Tambah Rekod Konsultasi'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setConsultModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tajuk / Program Konsultasi *
                  </label>
                  <input
                    type="text"
                    required
                    value={coTitle}
                    onChange={(e) => setCoTitle(e.target.value)}
                    placeholder="cth: Bimbingan Transformasi Sekolah TS25"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Organisasi / Klien *
                  </label>
                  <input
                    type="text"
                    required
                    value={coOrg}
                    onChange={(e) => setCoOrg(e.target.value)}
                    placeholder="cth: JPN / PPD / Sekolah Kluster"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Jenis Khidmat *
                  </label>
                  <select
                    value={coType}
                    onChange={(e) => setCoType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {coType && !CONSULTATION_TYPES.includes(coType) && (
                      <option value={coType}>{coType}</option>
                    )}
                    {CONSULTATION_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={coYear}
                    onChange={(e) => setCoYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {coYear && !yearOptions.includes(coYear) && <option value={coYear}>{coYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan</label>
                  <input
                    type="text"
                    value={coRole}
                    onChange={(e) => setCoRole(e.target.value)}
                    placeholder="cth: Ketua Perunding / Pembimbing"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Impak / Hasil
                  </label>
                  <input
                    type="text"
                    value={coImpact}
                    onChange={(e) => setCoImpact(e.target.value)}
                    placeholder="cth: Peningkatan skor kepimpinan organisasi"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setConsultModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: NPQEL */}
      {npqelModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setNpqelModalOpen(false)}
        >
          <form
            onSubmit={handleSaveNpqel}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-lg w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingNpqelId
                  ? 'Kemas Kini Penyeliaan Peserta NPQEL'
                  : 'Tambah Penyeliaan Peserta NPQEL'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setNpqelModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Peserta *
                </label>
                <input
                  type="text"
                  required
                  value={nqName}
                  onChange={(e) => setNqName(e.target.value)}
                  placeholder="cth: Jamal"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Kelas Peserta *
                  </label>
                  <input
                    type="text"
                    required
                    value={nqClass}
                    onChange={(e) => setNqClass(e.target.value)}
                    placeholder="cth: SRBE1"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={nqYear}
                    onChange={(e) => setNqYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {nqYear && !yearOptions.includes(nqYear) && <option value={nqYear}>{nqYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setNpqelModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Penilaian Program */}
      {evalModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setEvalModalOpen(false)}
        >
          <form
            onSubmit={handleSaveEvaluation}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingEvalId ? 'Kemas Kini Penilaian Program' : 'Tambah Penilaian Program'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setEvalModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Nama Program *
                </label>
                <input
                  type="text"
                  required
                  value={evName}
                  onChange={(e) => setEvName(e.target.value)}
                  placeholder="cth: Modul AI"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Pusat *</label>
                <select
                  required
                  value={evCenterName}
                  onChange={(e) => setEvCenterName(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                >
                  <option value="">-- Pilih Pusat --</option>
                  {evCenterName && !PROGRAM_EVALUATION_CENTERS.includes(evCenterName) && (
                    <option value={evCenterName}>{evCenterName}</option>
                  )}
                  {PROGRAM_EVALUATION_CENTERS.map((center) => (
                    <option key={center} value={center}>
                      {center}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan *</label>
                  <select
                    required
                    value={evRole}
                    onChange={(e) => setEvRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {evRole && !PROGRAM_MANAGEMENT_ROLES.includes(evRole) && (
                      <option value={evRole}>{evRole}</option>
                    )}
                    {PROGRAM_MANAGEMENT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={evYear}
                    onChange={(e) => setEvYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {evYear && !yearOptions.includes(evYear) && <option value={evYear}>{evYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Penilaian Program (%) *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    min={0}
                    max={100}
                    required
                    value={evScore}
                    onChange={(e) => setEvScore(e.target.value)}
                    placeholder="cth: 98.4"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Paparan Penilaian Program
                  </label>
                  <div className="px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg font-mono-tabular font-semibold text-[#0B1F3B]">
                    {evScore.trim() !== '' && Number.isFinite(Number(evScore))
                      ? `${Number(evScore)}% (${getProgramEvaluationRating(Number(evScore))})`
                      : '-'}
                  </div>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setEvalModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal: Pasukan Pemikir */}
      {thinkModalOpen && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => !saving && setThinkModalOpen(false)}
        >
          <form
            onSubmit={handleSaveThinkTank}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingThinkId ? 'Kemas Kini Pasukan Pemikir' : 'Tambah Pasukan Pemikir'}
              </h4>
              <button
                type="button"
                disabled={saving}
                onClick={() => setThinkModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nama Jawatankuasa / Pasukan *
                  </label>
                  <input
                    type="text"
                    required
                    value={thCommittee}
                    onChange={(e) => setThCommittee(e.target.value)}
                    placeholder="cth: Jawatankuasa Pemikir Dasar Digital & AI KPM"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Peringkat *
                  </label>
                  <select
                    value={thLevel}
                    onChange={(e) => setThLevel(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {thLevel && !THINK_TANK_LEVELS.includes(thLevel) && (
                      <option value={thLevel}>{thLevel}</option>
                    )}
                    {THINK_TANK_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Peranan *</label>
                  <select
                    value={thRole}
                    onChange={(e) => setThRole(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {thRole && !THINK_TANK_ROLES.includes(thRole) && (
                      <option value={thRole}>{thRole}</option>
                    )}
                    {THINK_TANK_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Bidang Fokus *
                  </label>
                  <input
                    type="text"
                    required
                    value={thFocus}
                    onChange={(e) => setThFocus(e.target.value)}
                    placeholder="cth: Kepimpinan AI, Analitik Data & Transformasi Pendidikan"
                    className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={thYear}
                    onChange={(e) => setThYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {thYear && !yearOptions.includes(thYear) && <option value={thYear}>{thYear}</option>}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status *</label>
                  <select
                    value={thStatus}
                    onChange={(e) => setThStatus(e.target.value as 'Aktif' | 'Tamat')}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Tamat">Tamat</option>
                  </select>
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={saving}
                onClick={() => setThinkModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Menyimpan...' : 'Simpan'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
