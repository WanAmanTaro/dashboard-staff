import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BookOpen,
  Check,
  Edit3,
  ExternalLink,
  FlaskConical,
  Loader2,
  Plus,
  Save,
  Settings,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  RESEARCH_PUBLICATION_TYPES,
  WRITING_PUBLICATION_TYPES,
  hasValidAchievement,
  sortPublicationsDefault,
} from '../lib/constants';
import {
  addOrUpdatePublication,
  deletePublication,
  getStaffProfileBundle,
  getSystemSettings,
  makeRecordId,
  saveSystemSettings,
} from '../services/firestoreService';
import type {
  Publication,
  PublicationType,
  StaffProfile,
  SystemSetting,
  UserAccount,
} from '../types/iab';

interface ResearchAndPublicationPageProps {
  mode: 'penyelidikan' | 'penerbitan';
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

export const ResearchAndPublicationPage: React.FC<ResearchAndPublicationPageProps> = ({
  mode,
  userAccount,
  profiles,
  sysSettings: initialSettings,
  onSystemSettingsUpdated,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(initialSettings);

  const [targetProfile, setTargetProfile] = useState<StaffProfile | null>(null);
  const [publications, setPublications] = useState<Publication[]>([]);

  const allowedTypes =
    mode === 'penyelidikan' ? RESEARCH_PUBLICATION_TYPES : WRITING_PUBLICATION_TYPES;

  const [pubSort, setPubSort] = useState<{
    key: 'default' | 'type' | 'title' | 'year' | 'achievement';
    dir: 'asc' | 'desc';
  }>({ key: 'default', dir: 'asc' });

  // Add/Edit Modal
  const [showPubForm, setShowPubForm] = useState(false);
  const [editingPubId, setEditingPubId] = useState<string | null>(null);
  const [pType, setPType] = useState<PublicationType>(allowedTypes[0]);
  const [pTitle, setPTitle] = useState('');
  const [pVenue, setPVenue] = useState('');
  const [pYear, setPYear] = useState('');
  const [pAchievement, setPAchievement] = useState('Tidak Berkenaan');
  const [pUrl, setPUrl] = useState('');
  const [pDesc, setPDesc] = useState('');
  const [savingPub, setSavingPub] = useState(false);
  const [deletingPub, setDeletingPub] = useState<Publication | null>(null);

  // Admin Years Modal
  const [yearsModalOpen, setYearsModalOpen] = useState(false);
  const [yearsDraft, setYearsDraft] = useState<string[]>([]);
  const [newYearText, setNewYearText] = useState('');
  const [editYearIdx, setEditYearIdx] = useState<number | null>(null);
  const [editYearText, setEditYearText] = useState('');
  const [savingYears, setSavingYears] = useState(false);

  useEffect(() => {
    setSysSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    setPType(allowedTypes[0]);
    setPubSort({ key: 'default', dir: 'asc' });
  }, [mode]);

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile =
    profiles.find((p) => p.staffId === selectedStaffId) || targetProfile;
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const pubYearOptions = useMemo(
    () =>
      sysSettings?.publicationYears?.length
        ? sysSettings.publicationYears
        : DEFAULT_PUBLICATION_YEARS,
    [sysSettings?.publicationYears]
  );

  const filteredPublications = useMemo(() => {
    const allowedSet = new Set<PublicationType>(allowedTypes);
    return publications.filter((p) => allowedSet.has(p.type));
  }, [publications, allowedTypes]);

  const sortedPublications = useMemo(() => {
    const base = sortPublicationsDefault(filteredPublications);
    if (pubSort.key === 'default') return base;
    const factor = pubSort.dir === 'asc' ? 1 : -1;
    return [...base].sort((a, b) => {
      if (pubSort.key === 'year') {
        const yrA = parseInt(String(a.year || '0'), 10) || 0;
        const yrB = parseInt(String(b.year || '0'), 10) || 0;
        return (yrA - yrB) * factor;
      }
      if (pubSort.key === 'achievement') {
        const aHas = hasValidAchievement(a.achievement) ? 1 : 0;
        const bHas = hasValidAchievement(b.achievement) ? 1 : 0;
        if (aHas !== bHas) return (aHas - bHas) * factor;
        return String(a.achievement || '').localeCompare(String(b.achievement || '')) * factor;
      }
      if (pubSort.key === 'type') {
        return a.type.localeCompare(b.type) * factor;
      }
      return a.title.localeCompare(b.title) * factor;
    });
  }, [filteredPublications, pubSort]);

  const loadData = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const bundle = await getStaffProfileBundle(staffIdToLoad, userAccount);
      setTargetProfile(bundle.profile);
      setPublications(bundle.publications);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuatkan rekod.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadData(selectedStaffId);
    }
  }, [selectedStaffId]);

  const handleSavePublication = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedStaffId) return;
    if (!pTitle.trim() || !pYear.trim()) {
      showToast('error', 'Sila lengkapkan Tajuk dan Tahun.');
      return;
    }

    setSavingPub(true);
    try {
      const targetUid = activeProfile?.uid || (isOwnRecord ? userAccount.uid : '') || '';
      const existingPub = editingPubId ? publications.find((p) => p.id === editingPubId) : null;
      await addOrUpdatePublication(
        {
          id: editingPubId || makeRecordId('PUB'),
          staffId: selectedStaffId,
          uid: targetUid,
          centerId: activeProfile?.centerId || userAccount.centerId || '',
          departmentId: activeProfile?.departmentId || userAccount.departmentId || '',
          type: pType,
          title: pTitle.trim(),
          publisherOrVenue: pVenue.trim(),
          year: pYear.trim(),
          achievement: pAchievement.trim() || 'Tidak Berkenaan',
          url: pUrl.trim(),
          description: pDesc.trim(),
          status: 'active',
        },
        !editingPubId,
        Boolean(existingPub && existingPub.uid === '' && targetUid)
      );
      showToast(
        'success',
        mode === 'penyelidikan'
          ? 'Rekod penyelidikan & inovasi berjaya disimpan.'
          : 'Rekod penerbitan berjaya disimpan.'
      );
      setShowPubForm(false);
      setEditingPubId(null);
      setPTitle('');
      setPVenue('');
      setPYear('');
      setPAchievement('Tidak Berkenaan');
      setPUrl('');
      setPDesc('');
      await loadData(selectedStaffId);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan rekod.');
    } finally {
      setSavingPub(false);
    }
  };

  const handleSaveYears = async () => {
    if (!userAccount.isAdmin) return;
    const cleaned = Array.from(new Set(yearsDraft.map((s) => s.trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      showToast('error', 'Senarai tahun mesti mengandungi sekurang-kurangnya satu item.');
      return;
    }
    setSavingYears(true);
    try {
      const appCats = sysSettings?.applicationSkillCategories?.length
        ? sysSettings.applicationSkillCategories
        : DEFAULT_APPLICATION_SKILL_CATEGORIES;
      const knowCats = sysSettings?.knowledgeSkillCategories?.length
        ? sysSettings.knowledgeSkillCategories
        : DEFAULT_KNOWLEDGE_SKILL_CATEGORIES;

      await saveSystemSettings({
        systemName:
          sysSettings?.systemName || 'Sistem Pengurusan Modal Insan dan Kepakaran IAB',
        institutionName:
          sysSettings?.institutionName ||
          'Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia',
        expertiseCategories: sysSettings?.expertiseCategories?.length
          ? sysSettings.expertiseCategories
          : DEFAULT_EXPERTISE_CATEGORIES,
        competencyCategories: Array.from(new Set([...appCats, ...knowCats])),
        applicationSkillCategories: appCats,
        knowledgeSkillCategories: knowCats,
        institutionCategories: sysSettings?.institutionCategories?.length
          ? sysSettings.institutionCategories
          : DEFAULT_INSTITUTION_CATEGORIES,
        publicationYears: cleaned,
        iabModules: sysSettings?.iabModules?.length
          ? sysSettings.iabModules
          : DEFAULT_IAB_MODULES,
      });
      const updated = await getSystemSettings().catch(() => null);
      if (updated) setSysSettings(updated);
      await onSystemSettingsUpdated?.();
      showToast('success', 'Senarai Tahun berjaya dikemas kini.');
      setYearsModalOpen(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan senarai tahun.');
    } finally {
      setSavingYears(false);
    }
  };

  const HeaderIcon = mode === 'penyelidikan' ? FlaskConical : BookOpen;
  const pageTitle =
    mode === 'penyelidikan' ? 'Fungsi 3: Penyelidikan' : 'Fungsi 4: Penerbitan';
  const pageDescription =
    mode === 'penyelidikan'
      ? 'Penyelidikan – Menjalankan kajian dan penyelidikan berkaitan kepimpinan serta pengurusan pendidikan bagi menyokong keputusan berasaskan data dan amalan terbaik.'
      : 'Penerbitan – Menerbitkan bahan ilmiah, jurnal, modul, dan sumber rujukan dalam bidang kepimpinan dan pengurusan pendidikan.';

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3 max-w-3xl">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <HeaderIcon className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">{pageTitle}</h1>
            <p className="text-xs text-slate-600 mt-1 leading-relaxed">{pageDescription}</p>
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

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0B1F3B]">
              {mode === 'penyelidikan'
                ? 'Rekod Penyelidikan, Inovasi & Pengiktirafan'
                : 'Rekod Penerbitan Bahan Ilmiah, Jurnal, Modul & Sumber Rujukan'}
              {activeProfile?.fullName ? ` — ${activeProfile.fullName}` : ''}
            </h2>
            <p className="text-xs text-slate-500">
              Rekod dengan Pencapaian dipaparkan di bahagian atas secara lalai. Klik tajuk lajur jadual untuk susunan.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {pubSort.key !== 'default' && (
              <button
                type="button"
                onClick={() => setPubSort({ key: 'default', dir: 'asc' })}
                className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg"
              >
                Reset Susunan Lalai
              </button>
            )}
            {userAccount.isAdmin && canEdit && (
              <button
                type="button"
                onClick={() => {
                  setYearsDraft([...pubYearOptions]);
                  setNewYearText('');
                  setEditYearIdx(null);
                  setEditYearText('');
                  setYearsModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
              >
                <Settings className="w-3.5 h-3.5" /> Edit Senarai Tahun (Admin)
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingPubId(null);
                  setPType(allowedTypes[0]);
                  setPTitle('');
                  setPVenue('');
                  setPYear(pubYearOptions[pubYearOptions.length - 1] || '2025');
                  setPAchievement('Tidak Berkenaan');
                  setPUrl('');
                  setPDesc('');
                  setShowPubForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Rekod
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-[#0B1F3B] animate-spin" />
            <p className="text-xs text-slate-500">Memuatkan rekod...</p>
          </div>
        ) : sortedPublications.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <HeaderIcon className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">
              {mode === 'penyelidikan'
                ? 'Tiada penyelidikan atau inovasi direkodkan'
                : 'Tiada penerbitan bahan ilmiah direkodkan'}
            </p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4 w-12">Bil.</th>
                    {(
                      [
                        ['type', 'Kategori'],
                        ['title', 'Tajuk'],
                        ['year', 'Tahun'],
                        ['achievement', 'Pencapaian'],
                      ] as const
                    ).map(([colKey, label]) => {
                      const active = pubSort.key === colKey;
                      const SortIcon = !active
                        ? ArrowUpDown
                        : pubSort.dir === 'asc'
                        ? ArrowUp
                        : ArrowDown;
                      return (
                        <th key={colKey} className="py-2.5 px-4">
                          <button
                            type="button"
                            onClick={() =>
                              setPubSort((prev) =>
                                prev.key === colKey
                                  ? { key: colKey, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
                                  : {
                                      key: colKey,
                                      dir:
                                        colKey === 'year' || colKey === 'achievement'
                                          ? 'desc'
                                          : 'asc',
                                    }
                              )
                            }
                            className={`inline-flex items-center gap-1 font-semibold uppercase tracking-wider hover:text-[#0B1F3B] ${
                              active ? 'text-[#0B1F3B]' : 'text-slate-500'
                            }`}
                          >
                            {label}
                            <SortIcon className="w-3 h-3" />
                          </button>
                        </th>
                      );
                    })}
                    <th className="py-2.5 px-4">
                      {mode === 'penyelidikan' ? 'Pautan (URL)' : 'Pautan Penerbitan (URL)'}
                    </th>
                    {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {sortedPublications.map((p, idx) => (
                    <tr key={p.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                        {idx + 1}.
                      </td>
                      <td className="py-3 px-4 font-semibold text-[#9D741E] whitespace-nowrap align-top">
                        {p.type}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="font-bold text-[#0B1F3B]">{p.title}</div>
                        {p.publisherOrVenue && (
                          <p className="text-[11px] text-slate-500 mt-0.5">{p.publisherOrVenue}</p>
                        )}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap align-top">
                        {p.year}
                      </td>
                      <td className="py-3 px-4 align-top">
                        {hasValidAchievement(p.achievement) ? (
                          <span className="font-semibold text-emerald-800">{p.achievement}</span>
                        ) : (
                          <span className="text-slate-500">Tidak Berkenaan</span>
                        )}
                      </td>
                      <td className="py-3 px-4 align-top">
                        {p.url ? (
                          <a
                            href={p.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#0B1F3B] underline hover:text-[#9D741E]"
                          >
                            Pautan <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-slate-500">Tidak Berkenaan</span>
                        )}
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right align-top">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingPubId(p.id);
                                setPType(p.type);
                                setPTitle(p.title);
                                setPVenue(p.publisherOrVenue || '');
                                setPYear(p.year);
                                setPAchievement(p.achievement || 'Tidak Berkenaan');
                                setPUrl(p.url || '');
                                setPDesc(p.description || '');
                                setShowPubForm(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingPub(p)}
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
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deletingPub)}
        title={mode === 'penyelidikan' ? 'Padam Rekod Penyelidikan' : 'Padam Rekod Penerbitan'}
        description={`Sahkan pemadaman rekod "${deletingPub?.title || ''}"?`}
        confirmLabel="Padam"
        onConfirm={async () => {
          if (!deletingPub) return;
          await deletePublication(deletingPub.id, selectedStaffId);
          showToast('success', 'Rekod dipadam.');
          setDeletingPub(null);
          await loadData(selectedStaffId);
        }}
        onCancel={() => setDeletingPub(null)}
      />

      {showPubForm && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingPub) setShowPubForm(false);
          }}
        >
          <form
            onSubmit={handleSavePublication}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-2xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingPubId
                  ? mode === 'penyelidikan'
                    ? 'Kemas Kini Rekod Penyelidikan'
                    : 'Kemas Kini Rekod Penerbitan'
                  : mode === 'penyelidikan'
                  ? 'Tambah Rekod Penyelidikan'
                  : 'Tambah Rekod Penerbitan'}
              </h4>
              <button
                type="button"
                disabled={savingPub}
                onClick={() => setShowPubForm(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Kategori *</label>
                  <select
                    value={pType}
                    onChange={(e) => setPType(e.target.value as PublicationType)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {allowedTypes.map((t) => (
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
                    value={pYear}
                    onChange={(e) => setPYear(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {pYear && !pubYearOptions.includes(pYear) && <option value={pYear}>{pYear}</option>}
                    {pubYearOptions.map((yr) => (
                      <option key={yr} value={yr}>
                        {yr}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tajuk *</label>
                  <input
                    type="text"
                    required
                    value={pTitle}
                    onChange={(e) => setPTitle(e.target.value)}
                    placeholder={
                      mode === 'penyelidikan'
                        ? 'cth: Kajian Impak Kepimpinan Digital di Sekolah'
                        : 'cth: Modul Pengurusan Kepimpinan Berasaskan AI'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Pencapaian</label>
                  <input
                    type="text"
                    value={pAchievement}
                    onChange={(e) => setPAchievement(e.target.value)}
                    placeholder="cth: Pingat Emas / Tidak Berkenaan"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {mode === 'penyelidikan' ? 'Penganjur / Geran' : 'Penerbit / Persidangan'}
                  </label>
                  <input
                    type="text"
                    value={pVenue}
                    onChange={(e) => setPVenue(e.target.value)}
                    placeholder={
                      mode === 'penyelidikan'
                        ? 'cth: IAB / KPM / Pertandingan Inovasi'
                        : 'cth: Jurnal IAB / Penerbit IAB'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {mode === 'penyelidikan' ? 'Pautan (URL)' : 'Pautan Penerbitan (URL)'}
                  </label>
                  <input
                    type="url"
                    value={pUrl}
                    onChange={(e) => setPUrl(e.target.value)}
                    placeholder="https://... (biarkan kosong jika Tidak Berkenaan)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingPub}
                onClick={() => setShowPubForm(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingPub}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingPub ? 'Menyimpan...' : 'Simpan Rekod'}
              </button>
            </div>
          </form>
        </div>
      )}

      {userAccount.isAdmin && yearsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingYears) setYearsModalOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3B]">
                  Urus Senarai Pilihan (Admin Sahaja) — SENARAI TAHUN
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Hanya pentadbir sistem dibenarkan menambah, mengubah atau memadam pilihan tahun.
                </p>
              </div>
              <button
                type="button"
                disabled={savingYears}
                onClick={() => setYearsModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup editor tahun"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newYearText}
                  onChange={(e) => setNewYearText(e.target.value)}
                  placeholder="Tambah tahun baharu (cth: 2031)..."
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = newYearText.trim();
                    if (!v || yearsDraft.includes(v)) return;
                    setYearsDraft([...yearsDraft, v]);
                    setNewYearText('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  Tambah Pilihan
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {yearsDraft.map((opt, i) => (
                  <div
                    key={`${opt}-${i}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {editYearIdx === i ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editYearText}
                          onChange={(e) => setEditYearText(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = editYearText.trim();
                            if (!v) return;
                            setYearsDraft(yearsDraft.map((x, idx) => (idx === i ? v : x)));
                            setEditYearIdx(null);
                          }}
                          className="p-1 text-emerald-700 hover:text-emerald-900"
                          title="Simpan"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <span className="font-medium text-slate-800">{opt}</span>
                    )}
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setEditYearIdx(i);
                          setEditYearText(opt);
                        }}
                        className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setYearsDraft(yearsDraft.filter((_, idx) => idx !== i))}
                        className="p-1 text-red-600 hover:text-red-800"
                        title="Padam"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingYears}
                onClick={() => setYearsModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={savingYears}
                onClick={handleSaveYears}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingYears ? 'Menyimpan...' : 'Simpan Senarai Pilihan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
