import React, { useEffect, useMemo, useState } from 'react';
import { Edit3, GraduationCap, Loader2, Plus, Save, Settings, Trash2, Users, X, Check } from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  DEFAULT_APPLICATION_SKILL_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
  DEFAULT_IAB_MODULES,
  DEFAULT_INSTITUTION_CATEGORIES,
  DEFAULT_KNOWLEDGE_SKILL_CATEGORIES,
  DEFAULT_PUBLICATION_YEARS,
  QUALIFICATION_LEVELS,
  sortQualificationsHighestFirst,
} from '../lib/constants';
import {
  addOrUpdateQualification,
  deleteQualification,
  getStaffProfileBundle,
  getSystemSettings,
  makeRecordId,
  saveSystemSettings,
} from '../services/firestoreService';
import type {
  Qualification,
  QualificationLevel,
  StaffProfile,
  SystemSetting,
  UserAccount,
} from '../types/iab';

interface AcademicQualificationsPageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

export const AcademicQualificationsPage: React.FC<AcademicQualificationsPageProps> = ({
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
  const [qualifications, setQualifications] = useState<Qualification[]>([]);

  // Modal Add/Edit Qualification
  const [showQualForm, setShowQualForm] = useState(false);
  const [editingQualId, setEditingQualId] = useState<string | null>(null);
  const [qLevel, setQLevel] = useState<QualificationLevel>('PhD');
  const [qInst, setQInst] = useState('');
  const [qField, setQField] = useState('');
  const [qYear, setQYear] = useState('');
  const [qNotes, setQNotes] = useState('');
  const [savingQual, setSavingQual] = useState(false);
  const [deletingQual, setDeletingQual] = useState<Qualification | null>(null);

  // Admin Institution Catalog Modal
  const [instModalOpen, setInstModalOpen] = useState(false);
  const [instDraft, setInstDraft] = useState<string[]>([]);
  const [newInstText, setNewInstText] = useState('');
  const [editInstIdx, setEditInstIdx] = useState<number | null>(null);
  const [editInstText, setEditInstText] = useState('');
  const [savingInstList, setSavingInstList] = useState(false);

  useEffect(() => {
    setSysSettings(initialSettings);
  }, [initialSettings]);

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile =
    profiles.find((p) => p.staffId === selectedStaffId) || targetProfile;
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const institutionOptions = useMemo(
    () =>
      sysSettings?.institutionCategories?.length
        ? sysSettings.institutionCategories
        : DEFAULT_INSTITUTION_CATEGORIES,
    [sysSettings?.institutionCategories]
  );

  const sortedQualifications = useMemo(
    () => sortQualificationsHighestFirst(qualifications),
    [qualifications]
  );

  const loadRecords = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const bundle = await getStaffProfileBundle(staffIdToLoad, userAccount);
      setTargetProfile(bundle.profile);
      setQualifications(bundle.qualifications);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal memuatkan kelayakan akademik.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadRecords(selectedStaffId);
    }
  }, [selectedStaffId]);

  const handleSaveQualification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit || !selectedStaffId) return;
    if (!qInst.trim() || !qField.trim() || !qYear.trim()) {
      showToast('error', 'Sila lengkapkan Tahap, Institusi, Bidang Pengajian dan Tahun Tamat.');
      return;
    }

    setSavingQual(true);
    try {
      const targetUid =
        activeProfile?.uid || (isOwnRecord ? userAccount.uid : '') || '';
      const existingQual = editingQualId
        ? qualifications.find((q) => q.id === editingQualId)
        : null;
      await addOrUpdateQualification(
        {
          id: editingQualId || makeRecordId('QUAL'),
          staffId: selectedStaffId,
          uid: targetUid,
          centerId: activeProfile?.centerId || userAccount.centerId || '',
          departmentId: activeProfile?.departmentId || userAccount.departmentId || '',
          level: qLevel,
          institution: qInst.trim(),
          fieldOfStudy: qField.trim(),
          graduationYear: qYear.trim(),
          notes: qNotes.trim(),
          status: 'active',
        },
        !editingQualId,
        Boolean(existingQual && existingQual.uid === '' && targetUid)
      );
      showToast('success', 'Kelayakan akademik berjaya disimpan.');
      setShowQualForm(false);
      setEditingQualId(null);
      setQInst('');
      setQField('');
      setQYear('');
      setQNotes('');
      await loadRecords(selectedStaffId);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan kelayakan akademik.');
    } finally {
      setSavingQual(false);
    }
  };

  const openInstitutionEditor = () => {
    if (!userAccount.isAdmin) return;
    setInstDraft([...institutionOptions]);
    setNewInstText('');
    setEditInstIdx(null);
    setEditInstText('');
    setInstModalOpen(true);
  };

  const handleSaveInstitutionList = async () => {
    if (!userAccount.isAdmin) return;
    const cleaned = Array.from(new Set(instDraft.map((s) => s.trim()).filter(Boolean)));
    if (cleaned.length === 0) {
      showToast('error', 'Senarai institusi mesti mengandungi sekurang-kurangnya satu pilihan.');
      return;
    }
    setSavingInstList(true);
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
        institutionCategories: cleaned,
        publicationYears: sysSettings?.publicationYears?.length
          ? sysSettings.publicationYears
          : DEFAULT_PUBLICATION_YEARS,
        iabModules: sysSettings?.iabModules?.length
          ? sysSettings.iabModules
          : DEFAULT_IAB_MODULES,
      });
      const updated = await getSystemSettings().catch(() => null);
      if (updated) setSysSettings(updated);
      await onSystemSettingsUpdated?.();
      showToast('success', 'Senarai Institusi berjaya dikemas kini.');
      setInstModalOpen(false);
    } catch (err: any) {
      showToast('error', err?.message || 'Gagal menyimpan senarai institusi.');
    } finally {
      setSavingInstList(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Kelulusan Akademik</h1>
            <p className="text-xs text-slate-500 mt-1">
              Disusun bermula daripada kelayakan akademik tertinggi (PhD ke Diploma / Kelayakan Lain).
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
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
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#0B1F3B]">
              Senarai Kelayakan Akademik{' '}
              {activeProfile?.fullName ? `— ${activeProfile.fullName}` : ''}
            </h2>
            <p className="text-xs text-slate-500">
              Rekod kelayakan akademik rasmi pegawai mengikut susunan kelayakan tertinggi di atas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {userAccount.isAdmin && canEdit && (
              <button
                type="button"
                onClick={openInstitutionEditor}
                className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-100 rounded-lg"
              >
                <Settings className="w-3.5 h-3.5" /> Edit Senarai Institusi (Admin)
              </button>
            )}
            {canEdit && (
              <button
                type="button"
                onClick={() => {
                  setEditingQualId(null);
                  setQLevel('PhD');
                  setQInst(institutionOptions[0] || '');
                  setQField('');
                  setQYear('');
                  setQNotes('');
                  setShowQualForm(true);
                }}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
              >
                <Plus className="w-3.5 h-3.5" /> Tambah Kelayakan
              </button>
            )}
          </div>
        </div>

        {loading ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-[#0B1F3B] animate-spin" />
            <p className="text-xs text-slate-500">Memuatkan rekod kelayakan akademik...</p>
          </div>
        ) : sortedQualifications.length === 0 ? (
          <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-300 rounded-xl">
            <GraduationCap className="w-8 h-8 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-medium text-slate-700">Tiada kelayakan akademik direkodkan</p>
          </div>
        ) : (
          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="py-2.5 px-4 w-14">Bil.</th>
                    <th className="py-2.5 px-4 w-36">TAHAP</th>
                    <th className="py-2.5 px-4">INSTITUSI</th>
                    <th className="py-2.5 px-4">BIDANG PENGAJIAN</th>
                    <th className="py-2.5 px-4 w-32">TAHUN TAMAT</th>
                    {canEdit && <th className="py-2.5 px-4 text-right w-32">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
                  {sortedQualifications.map((q, idx) => (
                    <tr key={q.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4 font-mono-tabular font-semibold text-slate-500 align-top">
                        {idx + 1}.
                      </td>
                      <td className="py-3 px-4 font-bold text-[#0B1F3B] whitespace-nowrap align-top">
                        {q.level}
                      </td>
                      <td className="py-3 px-4 text-slate-800 font-medium align-top">
                        {q.institution}
                      </td>
                      <td className="py-3 px-4 align-top">
                        <div className="text-slate-800 font-medium">{q.fieldOfStudy}</div>
                        {q.notes && <p className="text-[11px] text-slate-500 mt-0.5">{q.notes}</p>}
                      </td>
                      <td className="py-3 px-4 font-mono-tabular text-slate-700 whitespace-nowrap align-top">
                        {q.graduationYear}
                      </td>
                      {canEdit && (
                        <td className="py-3 px-4 text-right align-top">
                          <div className="inline-flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingQualId(q.id);
                                setQLevel(q.level);
                                setQInst(q.institution);
                                setQField(q.fieldOfStudy);
                                setQYear(q.graduationYear);
                                setQNotes(q.notes || '');
                                setShowQualForm(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded"
                            >
                              <Edit3 className="w-3 h-3" /> Edit
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeletingQual(q)}
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
        open={Boolean(deletingQual)}
        title="Padam Kelayakan Akademik"
        description={`Sahkan pemadaman rekod "${deletingQual?.level || ''} — ${deletingQual?.fieldOfStudy || ''}"?`}
        confirmLabel="Padam"
        onConfirm={async () => {
          if (!deletingQual) return;
          await deleteQualification(deletingQual.id, selectedStaffId);
          showToast('success', 'Kelayakan akademik dipadam.');
          setDeletingQual(null);
          await loadRecords(selectedStaffId);
        }}
        onCancel={() => setDeletingQual(null)}
      />

      {showQualForm && canEdit && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingQual) setShowQualForm(false);
          }}
        >
          <form
            onSubmit={handleSaveQualification}
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2">
              <h4 className="text-sm font-bold text-[#0B1F3B]">
                {editingQualId ? 'Kemas Kini Kelayakan Akademik' : 'Tambah Kelayakan Akademik'}
              </h4>
              <button
                type="button"
                disabled={savingQual}
                onClick={() => setShowQualForm(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup borang kelayakan"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahap *</label>
                  <select
                    value={qLevel}
                    onChange={(e) => setQLevel(e.target.value as QualificationLevel)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    {QUALIFICATION_LEVELS.map((l) => (
                      <option key={l} value={l}>
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tahun Tamat *</label>
                  <input
                    type="text"
                    required
                    value={qYear}
                    onChange={(e) => setQYear(e.target.value)}
                    placeholder="2020"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg font-mono-tabular"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Institusi *</label>
                  <select
                    required
                    value={qInst}
                    onChange={(e) => setQInst(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  >
                    <option value="">-- Pilih Institusi --</option>
                    {qInst && !institutionOptions.includes(qInst) && (
                      <option value={qInst}>{qInst}</option>
                    )}
                    {institutionOptions.map((inst) => (
                      <option key={inst} value={inst}>
                        {inst}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Bidang Pengajian *</label>
                  <input
                    type="text"
                    required
                    value={qField}
                    onChange={(e) => setQField(e.target.value)}
                    placeholder="SAINS KOMPUTER / KEPIMPINAN PENDIDIKAN"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Maklumat Berkaitan</label>
                  <input
                    type="text"
                    value={qNotes}
                    onChange={(e) => setQNotes(e.target.value)}
                    placeholder="Tajuk tesis atau pengkhususan (pilihan)"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
            </div>
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                disabled={savingQual}
                onClick={() => setShowQualForm(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={savingQual}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingQual ? 'Menyimpan...' : 'Simpan Kelayakan'}
              </button>
            </div>
          </form>
        </div>
      )}

      {userAccount.isAdmin && instModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
          onClick={() => {
            if (!savingInstList) setInstModalOpen(false);
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-xl max-w-xl w-full max-h-[85vh] flex flex-col overflow-hidden shadow-2xl border border-slate-200"
          >
            <div className="px-5 py-4 bg-amber-50/70 border-b border-amber-200 flex items-center justify-between gap-2">
              <div>
                <h4 className="text-sm font-bold text-[#0B1F3B]">
                  Urus Senarai Pilihan (Admin Sahaja) — SENARAI INSTITUSI
                </h4>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Hanya pentadbir sistem dibenarkan menambah, mengubah atau memadam pilihan institusi.
                </p>
              </div>
              <button
                type="button"
                disabled={savingInstList}
                onClick={() => setInstModalOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-900 rounded-lg"
                aria-label="Tutup editor institusi"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3">
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newInstText}
                  onChange={(e) => setNewInstText(e.target.value)}
                  placeholder="Tambah nama institusi baharu (cth: UMP / Universiti Luar Negara)..."
                  className="flex-1 px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                />
                <button
                  type="button"
                  onClick={() => {
                    const v = newInstText.trim();
                    if (!v || instDraft.includes(v)) return;
                    setInstDraft([...instDraft, v]);
                    setNewInstText('');
                  }}
                  className="px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  Tambah Pilihan
                </button>
              </div>

              <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
                {instDraft.map((opt, i) => (
                  <div
                    key={`${opt}-${i}`}
                    className="flex items-center justify-between gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    {editInstIdx === i ? (
                      <div className="flex-1 flex items-center gap-2">
                        <input
                          type="text"
                          value={editInstText}
                          onChange={(e) => setEditInstText(e.target.value)}
                          className="flex-1 px-2 py-1 text-xs bg-white border border-slate-300 rounded"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const v = editInstText.trim();
                            if (!v) return;
                            setInstDraft(instDraft.map((x, idx) => (idx === i ? v : x)));
                            setEditInstIdx(null);
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
                          setEditInstIdx(i);
                          setEditInstText(opt);
                        }}
                        className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                        title="Edit"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setInstDraft(instDraft.filter((_, idx) => idx !== i))}
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
                disabled={savingInstList}
                onClick={() => setInstModalOpen(false)}
                className="px-3.5 py-2 text-xs text-slate-600 hover:text-slate-900"
              >
                Tutup
              </button>
              <button
                type="button"
                disabled={savingInstList}
                onClick={handleSaveInstitutionList}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                {savingInstList ? 'Menyimpan...' : 'Simpan Senarai Pilihan'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
