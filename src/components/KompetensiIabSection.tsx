import React, { useEffect, useState } from 'react';
import {
  Award,
  BookOpen,
  CheckCircle2,
  Edit3,
  Lock,
  Plus,
  Save,
  Settings,
  Trash2,
  X,
} from 'lucide-react';
import { ConfirmDialog } from './ConfirmDialog';
import { useToast } from './Toast';
import {
  DEFAULT_IAB_MODULES,
  DEFAULT_PUBLICATION_YEARS,
  IAB_CERT_DEFINITIONS,
  IAB_MODULE_CONTRIBUTIONS,
} from '../lib/constants';
import {
  makeRecordId,
  saveIabCompetencies,
  saveSystemSettings,
} from '../services/firestoreService';
import type {
  IabCertItem,
  IabCertKey,
  IabCertStatus,
  IabCompetencyRecord,
  IabModuleContribution,
  IabModuleContributionRole,
  SystemSetting,
} from '../types/iab';

interface KompetensiIabSectionProps {
  staffId: string;
  uid: string;
  centerId: string;
  departmentId: string;
  staffName: string;
  record: IabCompetencyRecord | null;
  canEdit: boolean;
  isAdmin: boolean;
  sysSettings: SystemSetting | null;
  onRecordSaved: (next: IabCompetencyRecord) => void;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

function buildDefaultCerts(existing?: IabCertItem[]): IabCertItem[] {
  const byKey = new Map((existing || []).map((c) => [c.key, c]));
  return IAB_CERT_DEFINITIONS.map((def) => {
    const found = byKey.get(def.key);
    return {
      key: def.key,
      label: def.label,
      status: found?.status === 'Ada' ? 'Ada' : 'Tiada',
      passYear: found?.status === 'Ada' ? String(found?.passYear || '') : '',
    };
  });
}

export const KompetensiIabSection: React.FC<KompetensiIabSectionProps> = ({
  staffId,
  uid,
  centerId,
  departmentId,
  staffName,
  record,
  canEdit,
  isAdmin,
  sysSettings,
  onRecordSaved,
  onSystemSettingsUpdated,
}) => {
  const { showToast } = useToast();

  const [certs, setCerts] = useState<IabCertItem[]>(() => buildDefaultCerts(record?.certifications));
  const [modules, setModules] = useState<IabModuleContribution[]>(() => record?.modules || []);
  const [saving, setSaving] = useState(false);

  // Module popup modal state
  const [showModModal, setShowModModal] = useState(false);
  const [editingModId, setEditingModId] = useState<string | null>(null);
  const [modName, setModName] = useState('');
  const [modYear, setModYear] = useState('');
  const [modContribution, setModContribution] = useState<IabModuleContributionRole>('Ahli');
  const [modActiveStatus, setModActiveStatus] = useState<'Aktif' | 'Tidak Aktif'>('Aktif');

  // Delete confirm
  const [deleteTarget, setDeleteTarget] = useState<IabModuleContribution | null>(null);

  // Admin module list editor modal
  const [showAdminListModal, setShowAdminListModal] = useState(false);
  const [newAdminModule, setNewAdminModule] = useState('');
  const [savingAdminList, setSavingAdminList] = useState(false);

  useEffect(() => {
    setCerts(buildDefaultCerts(record?.certifications));
    setModules(record?.modules || []);
  }, [record, staffId]);

  const moduleOptions =
    sysSettings?.iabModules && sysSettings.iabModules.length > 0
      ? sysSettings.iabModules
      : DEFAULT_IAB_MODULES;
  const yearOptions =
    sysSettings?.publicationYears && sysSettings.publicationYears.length > 0
      ? sysSettings.publicationYears
      : DEFAULT_PUBLICATION_YEARS;

  const isPrerequisiteMet = (key: IabCertKey, list: IabCertItem[]): boolean => {
    const def = IAB_CERT_DEFINITIONS.find((d) => d.key === key);
    if (!def?.requires || def.requires.length === 0) return true;
    const statusByKey = new Map(list.map((c) => [c.key, c.status]));
    return def.requires.every((reqKey) => statusByKey.get(reqKey) === 'Ada');
  };

  const applyCertCascade = (nextList: IabCertItem[]): IabCertItem[] => {
    const clone = nextList.map((c) => ({ ...c }));
    const getStatus = (k: IabCertKey) => clone.find((c) => c.key === k)?.status === 'Ada';
    const clearItem = (k: IabCertKey) => {
      const target = clone.find((c) => c.key === k);
      if (target) {
        target.status = 'Tiada';
        target.passYear = '';
      }
    };
    if (!getStatus('certifiedCoach')) clearItem('certifiedMasterCoach');
    if (!getStatus('certifiedTrainer')) clearItem('certifiedMasterTrainer');
    const allFive =
      getStatus('certifiedCoach') &&
      getStatus('certifiedMasterCoach') &&
      getStatus('certifiedTrainer') &&
      getStatus('certifiedMasterTrainer') &&
      getStatus('certifiedAccessor');
    if (!allFive) clearItem('konsultanIab');
    return clone;
  };

  const handleCertStatusChange = (key: IabCertKey, status: IabCertStatus) => {
    if (!canEdit) return;
    if (status === 'Ada' && !isPrerequisiteMet(key, certs)) {
      const def = IAB_CERT_DEFINITIONS.find((d) => d.key === key);
      showToast('error', `Prasyarat tidak dipenuhi untuk ${def?.label || key}.`);
      return;
    }
    const updated = certs.map((c) =>
      c.key === key
        ? {
            ...c,
            status,
            passYear: status === 'Ada' ? c.passYear || yearOptions[yearOptions.length - 1] || '2025' : '',
          }
        : c
    );
    setCerts(applyCertCascade(updated));
  };

  const handleCertYearChange = (key: IabCertKey, passYear: string) => {
    if (!canEdit) return;
    setCerts((prev) => prev.map((c) => (c.key === key ? { ...c, passYear } : c)));
  };

  const persistRecord = async (nextCerts: IabCertItem[], nextModules: IabModuleContribution[], toastMsg: string) => {
    setSaving(true);
    try {
      const saved = await saveIabCompetencies({
        staffId,
        uid,
        centerId,
        departmentId,
        certifications: nextCerts,
        modules: nextModules,
      });
      onRecordSaved(saved);
      showToast('success', toastMsg);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan rekod Kompetensi IAB.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePartA = async () => {
    await persistRecord(certs, modules, 'Rekod Bahagian A (Pensijilan IAB) berjaya disimpan.');
  };

  const openAddModModal = () => {
    setEditingModId(null);
    setModName(moduleOptions[0] || '');
    setModYear(yearOptions.includes(String(new Date().getFullYear())) ? String(new Date().getFullYear()) : yearOptions[yearOptions.length - 1] || '2025');
    setModContribution('Ahli');
    setModActiveStatus('Aktif');
    setShowModModal(true);
  };

  const openEditModModal = (m: IabModuleContribution) => {
    setEditingModId(m.id);
    setModName(m.moduleName);
    setModYear(m.year);
    setModContribution(m.contribution);
    setModActiveStatus(m.activeStatus);
    setShowModModal(true);
  };

  const handleSaveModuleModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!modName.trim() || !modYear.trim()) {
      showToast('error', 'Sila lengkapkan Nama Modul dan Tahun.');
      return;
    }
    const nextItem: IabModuleContribution = {
      id: editingModId || makeRecordId('MOD'),
      moduleName: modName.trim(),
      year: modYear.trim(),
      contribution: modContribution,
      activeStatus: modActiveStatus,
    };
    const nextModules = editingModId
      ? modules.map((m) => (m.id === editingModId ? nextItem : m))
      : [...modules, nextItem];
    setModules(nextModules);
    setShowModModal(false);
    await persistRecord(
      certs,
      nextModules,
      editingModId ? 'Rekod modul dikemas kini.' : 'Rekod modul baharu ditambah.'
    );
  };

  const handleConfirmDeleteModule = async () => {
    if (!deleteTarget) return;
    const nextModules = modules.filter((m) => m.id !== deleteTarget.id);
    setModules(nextModules);
    setDeleteTarget(null);
    await persistRecord(certs, nextModules, 'Rekod modul telah dipadam.');
  };

  const handleUpdateAdminModules = async (updatedList: string[]) => {
    if (!isAdmin || !sysSettings) return;
    setSavingAdminList(true);
    try {
      await saveSystemSettings({
        systemName: sysSettings.systemName,
        institutionName: sysSettings.institutionName,
        expertiseCategories: sysSettings.expertiseCategories || [],
        competencyCategories: sysSettings.competencyCategories || [],
        applicationSkillCategories: sysSettings.applicationSkillCategories,
        knowledgeSkillCategories: sysSettings.knowledgeSkillCategories,
        institutionCategories: sysSettings.institutionCategories,
        publicationYears: sysSettings.publicationYears,
        iabModules: updatedList,
      });
      await onSystemSettingsUpdated?.();
      showToast('success', 'Senarai Modul IAB berjaya dikemas kini.');
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal mengemas kini senarai Modul IAB.');
    } finally {
      setSavingAdminList(false);
    }
  };

  const certGroups: Array<{ title: string; group: 'Coach' | 'Trainer' | 'Assessor' | 'Konsultan' }> = [
    { title: '1. Laluan Kejurulatihan (Coach)', group: 'Coach' },
    { title: '2. Laluan Latihan (Trainer)', group: 'Trainer' },
    { title: '3. Laluan Penilaian (Assessor)', group: 'Assessor' },
    { title: '4. Laluan Perundingan (Konsultan)', group: 'Konsultan' },
  ];

  const adaCount = certs.filter((c) => c.status === 'Ada').length;

  return (
    <div className="space-y-6">
      {/* BAHAGIAN A */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#C69738]">
              Kompetensi IAB · {staffName}
            </p>
            <h2 className="text-base font-bold text-[#0B1F3B] mt-0.5 flex items-center gap-2">
              <Award className="w-5 h-5 text-[#0B1F3B]" />
              BAHAGIAN A: Pensijilan Profesional IAB &amp; Prasyarat
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Status pensijilan dan tahun lulus bagi laluan Coach, Trainer, Accessor dan Konsultan IAB ({adaCount}/6 diperakui).
            </p>
          </div>
          {canEdit && (
            <button
              type="button"
              onClick={handleSavePartA}
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg whitespace-nowrap disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              {saving ? 'Menyimpan...' : 'Simpan Bahagian A'}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {certGroups.map((grp) => {
            const defs = IAB_CERT_DEFINITIONS.filter((d) => d.group === grp.group);
            return (
              <div key={grp.group} className="border border-slate-200 rounded-xl overflow-hidden bg-slate-50/40">
                <div className="px-4 py-2.5 bg-slate-100/80 border-b border-slate-200 flex items-center justify-between">
                  <h3 className="text-xs font-bold text-[#0B1F3B] uppercase tracking-wide">{grp.title}</h3>
                </div>
                <div className="divide-y divide-slate-200 bg-white">
                  {defs.map((def, idx) => {
                    const item = certs.find((c) => c.key === def.key) || {
                      key: def.key,
                      label: def.label,
                      status: 'Tiada' as const,
                      passYear: '',
                    };
                    const prereqOk = isPrerequisiteMet(def.key, certs);
                    return (
                      <div key={def.key} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-slate-400 tabular-nums">{idx + 1}.</span>
                            <span className="text-sm font-semibold text-[#0B1F3B]">{def.label}</span>
                            {item.status === 'Ada' && (
                              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                            )}
                            {!prereqOk && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-700">
                                <Lock className="w-3 h-3" />
                                Perlu prasyarat
                              </span>
                            )}
                          </div>
                          {def.prerequisiteLabel && (
                            <p className="text-[11px] text-slate-500 mt-0.5 italic">
                              ({def.prerequisiteLabel})
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div>
                            <label className="sr-only">Status {def.label}</label>
                            <select
                              disabled={!canEdit || (!prereqOk && item.status !== 'Ada')}
                              value={item.status}
                              onChange={(e) =>
                                handleCertStatusChange(def.key, e.target.value as IabCertStatus)
                              }
                              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-lg bg-white text-[#0B1F3B] disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="Tiada">Tiada</option>
                              <option value="Ada" disabled={!prereqOk}>
                                Ada
                              </option>
                            </select>
                          </div>

                          <div className="w-28">
                            <label className="sr-only">Tahun Lulus {def.label}</label>
                            <select
                              disabled={!canEdit || item.status !== 'Ada'}
                              value={item.status === 'Ada' ? item.passYear : ''}
                              onChange={(e) => handleCertYearChange(def.key, e.target.value)}
                              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                            >
                              <option value="">{item.status === 'Ada' ? 'Tahun Lulus' : '—'}</option>
                              {item.passYear && !yearOptions.includes(item.passYear) && (
                                <option value={item.passYear}>{item.passYear}</option>
                              )}
                              {yearOptions.map((y) => (
                                <option key={y} value={y}>
                                  {y}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* BAHAGIAN B */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0B1F3B] flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-[#0B1F3B]" />
              BAHAGIAN B: PENGGUBAL / PEMBANGUN MODUL / CPD
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Senarai sumbangan pembangunan modul latihan dan program CPD IAB.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {isAdmin && (
              <button
                type="button"
                onClick={() => setShowAdminListModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-amber-50 border border-amber-200 hover:bg-amber-100 rounded-lg whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5" />
                Edit Senarai Modul (Admin)
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={openAddModModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg whitespace-nowrap"
              >
                <Plus className="w-4 h-4" />
                Tambah
              </button>
            )}
          </div>
        </div>

        <div className="border border-slate-200 rounded-xl overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-4 py-3 font-bold w-14">Bil.</th>
                <th className="px-4 py-3 font-bold">Nama Modul</th>
                <th className="px-4 py-3 font-bold w-24">Tahun</th>
                <th className="px-4 py-3 font-bold">Sumbangan</th>
                <th className="px-4 py-3 font-bold w-32">Status Aktif</th>
                {canEdit && <th className="px-4 py-3 font-bold text-right w-36">Tindakan</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {modules.length === 0 ? (
                <tr>
                  <td colSpan={canEdit ? 6 : 5} className="px-4 py-8 text-center text-xs text-slate-500">
                    Tiada rekod penggubal/pembangun modul direkodkan lagi.
                  </td>
                </tr>
              ) : (
                modules.map((m, idx) => (
                  <tr key={m.id} className="hover:bg-slate-50/70">
                    <td className="px-4 py-3 text-slate-500 font-semibold tabular-nums">{idx + 1}.</td>
                    <td className="px-4 py-3 font-semibold text-[#0B1F3B]">{m.moduleName}</td>
                    <td className="px-4 py-3 text-slate-700 tabular-nums">{m.year}</td>
                    <td className="px-4 py-3 text-slate-800 font-medium">{m.contribution}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`text-xs font-semibold ${
                          m.activeStatus === 'Aktif' ? 'text-emerald-700' : 'text-slate-500'
                        }`}
                      >
                        {m.activeStatus}
                      </span>
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => openEditModModal(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-[#0B1F3B] bg-white border border-slate-200 hover:bg-slate-50 rounded-md"
                          >
                            <Edit3 className="w-3 h-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(m)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-red-700 bg-red-50 border border-red-200 hover:bg-red-100 rounded-md"
                          >
                            <Trash2 className="w-3 h-3" />
                            Delete
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Module Popup Modal */}
      {showModModal && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-lg w-full bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-6 py-4 bg-[#0B1F3B] text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">
                {editingModId ? 'Kemaskini Rekod Modul / CPD' : 'Tambah Penggubal / Pembangun Modul / CPD'}
              </h3>
              <button
                type="button"
                onClick={() => setShowModModal(false)}
                className="p-1 text-slate-300 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveModuleModal} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Modul *</label>
                <select
                  required
                  value={modName}
                  onChange={(e) => setModName(e.target.value)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  <option value="">-- Pilih Nama Modul --</option>
                  {modName && !moduleOptions.includes(modName) && (
                    <option value={modName}>{modName}</option>
                  )}
                  {moduleOptions.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun *</label>
                  <select
                    required
                    value={modYear}
                    onChange={(e) => setModYear(e.target.value)}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white tabular-nums"
                  >
                    <option value="">-- Pilih Tahun --</option>
                    {modYear && !yearOptions.includes(modYear) && (
                      <option value={modYear}>{modYear}</option>
                    )}
                    {yearOptions.map((y) => (
                      <option key={y} value={y}>
                        {y}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Status Aktif *</label>
                  <select
                    value={modActiveStatus}
                    onChange={(e) => setModActiveStatus(e.target.value as 'Aktif' | 'Tidak Aktif')}
                    className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                  >
                    <option value="Aktif">Aktif</option>
                    <option value="Tidak Aktif">Tidak Aktif</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Sumbangan *</label>
                <select
                  required
                  value={modContribution}
                  onChange={(e) => setModContribution(e.target.value as IabModuleContributionRole)}
                  className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {IAB_MODULE_CONTRIBUTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  {saving ? 'Menyimpan...' : 'Simpan'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Admin Module List Popup Modal */}
      {showAdminListModal && isAdmin && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-w-md w-full bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            <div className="px-5 py-4 bg-[#0B1F3B] text-white flex items-center justify-between">
              <h3 className="text-sm font-bold">Urus Senarai Modul IAB (Admin)</h3>
              <button
                type="button"
                onClick={() => setShowAdminListModal(false)}
                className="p-1 text-slate-300 hover:text-white rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newAdminModule}
                  onChange={(e) => setNewAdminModule(e.target.value)}
                  placeholder="Nama modul baharu (cth: Modul AI)"
                  className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  disabled={savingAdminList || !newAdminModule.trim()}
                  onClick={async () => {
                    const val = newAdminModule.trim();
                    if (!val) return;
                    const next = Array.from(new Set([...moduleOptions, val]));
                    await handleUpdateAdminModules(next);
                    setNewAdminModule('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                >
                  Tambah
                </button>
              </div>

              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                {moduleOptions.map((item) => (
                  <div key={item} className="px-3 py-2 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-800">{item}</span>
                    <button
                      type="button"
                      disabled={savingAdminList}
                      onClick={() => handleUpdateAdminModules(moduleOptions.filter((x) => x !== item))}
                      className="text-red-600 hover:text-red-800 font-semibold"
                    >
                      Padam
                    </button>
                  </div>
                ))}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setShowAdminListModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 rounded-lg"
                >
                  Tutup
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="Padam Rekod Modul?"
        description={`Adakah anda pasti mahu memadam rekod modul "${deleteTarget?.moduleName || ''}" (${deleteTarget?.year || ''})?`}
        confirmLabel="Ya, Padam"
        variant="danger"
        onConfirm={handleConfirmDeleteModule}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
