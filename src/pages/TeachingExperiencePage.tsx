import React, { useEffect, useState } from 'react';
import {
  BookOpen,
  Briefcase,
  Building2,
  Edit3,
  Loader2,
  Plus,
  Save,
  School,
  Trash2,
  Users,
  X,
} from 'lucide-react';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  EXTERNAL_TEACHING_TYPES,
  IAB_TEACHING_TYPES,
  computeProfileCompletion,
} from '../lib/constants';
import {
  getStaffProfileBundle,
  makeRecordId,
  saveStaffExpertise,
} from '../services/firestoreService';
import type {
  Certificate,
  CompetencyItem,
  ExpertiseRecord,
  ProfilePhoto,
  Publication,
  Qualification,
  StaffPrivatePII,
  StaffProfile,
  SystemSetting,
  TeachingExternalEntry,
  TeachingIabEntry,
  TeachingSchoolEntry,
  UserAccount,
} from '../types/iab';

interface TeachingExperiencePageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
}

export const TeachingExperiencePage: React.FC<TeachingExperiencePageProps> = ({
  userAccount,
  profiles,
}) => {
  const { showToast } = useToast();
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [bundleProfile, setBundleProfile] = useState<StaffProfile | null>(null);
  const [bundlePii, setBundlePii] = useState<StaffPrivatePII | null>(null);
  const [bundleQuals, setBundleQuals] = useState<Qualification[]>([]);
  const [bundleExpertise, setBundleExpertise] = useState<ExpertiseRecord | null>(null);
  const [bundleComps, setBundleComps] = useState<CompetencyItem[]>([]);
  const [bundlePubs, setBundlePubs] = useState<Publication[]>([]);
  const [bundleCerts, setBundleCerts] = useState<Certificate[]>([]);
  const [bundlePhoto, setBundlePhoto] = useState<ProfilePhoto | null>(null);

  const [iabList, setIabList] = useState<TeachingIabEntry[]>([]);
  const [schoolList, setSchoolList] = useState<TeachingSchoolEntry[]>([]);
  const [externalList, setExternalList] = useState<TeachingExternalEntry[]>([]);

  // Modal A: Di IAB
  const [iabModalOpen, setIabModalOpen] = useState(false);
  const [editingIabId, setEditingIabId] = useState<string | null>(null);
  const [iabModule, setIabModule] = useState('');
  const [iabType, setIabType] = useState<string>(IAB_TEACHING_TYPES[0]);
  const [iabYears, setIabYears] = useState<number>(1);

  // Modal B: Di Sekolah
  const [schoolModalOpen, setSchoolModalOpen] = useState(false);
  const [editingSchoolId, setEditingSchoolId] = useState<string | null>(null);
  const [schoolSubject, setSchoolSubject] = useState('');
  const [schoolYears, setSchoolYears] = useState<number>(1);

  // Modal C: Selain Di IAB & Sekolah
  const [extModalOpen, setExtModalOpen] = useState(false);
  const [editingExtId, setEditingExtId] = useState<string | null>(null);
  const [extInstitution, setExtInstitution] = useState('');
  const [extModule, setExtModule] = useState('');
  const [extType, setExtType] = useState<string>(EXTERNAL_TEACHING_TYPES[0]);
  const [extYears, setExtYears] = useState<number>(1);

  // Confirm delete
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    title: string;
    message: string;
    onConfirm: () => Promise<void> | void;
  }>({
    open: false,
    title: '',
    message: '',
    onConfirm: () => {},
  });

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile =
    profiles.find((p) => p.staffId === selectedStaffId) || bundleProfile;
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  const loadData = async (staffIdToLoad: string) => {
    if (!staffIdToLoad) return;
    setLoading(true);
    try {
      const bundle = await getStaffProfileBundle(staffIdToLoad, userAccount);
      setBundleProfile(bundle.profile);
      setBundlePii(bundle.pii);
      setBundleQuals(bundle.qualifications);
      setBundleExpertise(bundle.expertise);
      setBundleComps(bundle.competencies?.items || []);
      setBundlePubs(bundle.publications);
      setBundleCerts(bundle.certificates);
      setBundlePhoto(bundle.photo);

      setIabList(bundle.expertise?.iabTeachingList || []);
      setSchoolList(bundle.expertise?.schoolTeachingList || []);
      setExternalList(bundle.expertise?.externalTeachingList || []);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Gagal memuatkan rekod pengalaman mengajar.';
      showToast('error', message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedStaffId) {
      loadData(selectedStaffId);
    }
  }, [selectedStaffId]);

  const persistTeachingLists = async (next: {
    iabTeachingList: TeachingIabEntry[];
    schoolTeachingList: TeachingSchoolEntry[];
    externalTeachingList: TeachingExternalEntry[];
  }) => {
    if (!selectedStaffId) return;
    const targetUid = activeProfile?.uid || (isOwnRecord ? userAccount.uid : '');
    const centerId = activeProfile?.centerId || userAccount.centerId || '';
    const departmentId = activeProfile?.departmentId || userAccount.departmentId || '';

    const prevExp = bundleExpertise;
    const preservedPrimary = prevExp?.primaryExpertise || activeProfile?.primaryExpertise || '';
    const preservedSecondary =
      prevExp?.secondaryExpertise || activeProfile?.secondaryExpertise || '';

    const nextCompletion = computeProfileCompletion({
      profile: {
        fullName: activeProfile?.fullName || (isOwnRecord ? userAccount.displayName : ''),
        officialEmail: activeProfile?.officialEmail || (isOwnRecord ? userAccount.email : ''),
        position: activeProfile?.position || '',
        grade: activeProfile?.grade || '',
        scheme: activeProfile?.scheme || '',
        centerId,
        departmentId,
        highestQualification: activeProfile?.highestQualification || '',
        primaryExpertise: preservedPrimary,
        digitalCompetencies: bundleComps.map((i) => i.categoryName),
        hasPhoto: Boolean(bundlePhoto || activeProfile?.hasPhoto),
      },
      pii: bundlePii,
      qualificationsCount: bundleQuals.length,
      expertise: {
        primaryExpertise: preservedPrimary,
        teachingExp: prevExp?.teachingExp || '',
        managementExp: prevExp?.managementExp || '',
        facilitatorExp: prevExp?.facilitatorExp || '',
        speakerExp: prevExp?.speakerExp || '',
        coachExp: prevExp?.coachExp || '',
        projectExp: prevExp?.projectExp || '',
        professionalExp: prevExp?.professionalExp || '',
        iabTeachingList: next.iabTeachingList,
        schoolTeachingList: next.schoolTeachingList,
        externalTeachingList: next.externalTeachingList,
      },
      competencies: { items: bundleComps },
      publicationsCount: bundlePubs.length,
      certificatesCount: bundleCerts.length,
    });

    const saved = await saveStaffExpertise({
      expertise: {
        id: selectedStaffId,
        staffId: selectedStaffId,
        uid: targetUid,
        centerId,
        departmentId,
        primaryExpertise: preservedPrimary,
        secondaryExpertise: preservedSecondary,
        specializations: prevExp?.specializations || [],
        researchAreas: prevExp?.researchAreas || [],
        teachingAreas: prevExp?.teachingAreas || [],
        trainingAreas: prevExp?.trainingAreas || [],
        keywords: prevExp?.keywords || activeProfile?.expertiseKeywords || [],
        teachingExp: prevExp?.teachingExp || '',
        managementExp: prevExp?.managementExp || '',
        facilitatorExp: prevExp?.facilitatorExp || '',
        speakerExp: prevExp?.speakerExp || '',
        coachExp: prevExp?.coachExp || '',
        projectExp: prevExp?.projectExp || '',
        professionalExp: prevExp?.professionalExp || '',
        iabTeachingList: next.iabTeachingList,
        schoolTeachingList: next.schoolTeachingList,
        externalTeachingList: next.externalTeachingList,
        status: 'active',
      },
      completion: nextCompletion,
    });

    setBundleExpertise(saved);
    setIabList(saved.iabTeachingList || next.iabTeachingList);
    setSchoolList(saved.schoolTeachingList || next.schoolTeachingList);
    setExternalList(saved.externalTeachingList || next.externalTeachingList);
  };

  // =========================================================
  // BAHAGIAN A: DI IAB
  // =========================================================
  const openAddIab = () => {
    setEditingIabId(null);
    setIabModule('');
    setIabType(IAB_TEACHING_TYPES[0]);
    setIabYears(1);
    setIabModalOpen(true);
  };

  const openEditIab = (entry: TeachingIabEntry) => {
    setEditingIabId(entry.id);
    setIabModule(entry.moduleOrField);
    setIabType(entry.teachingType || IAB_TEACHING_TYPES[0]);
    setIabYears(entry.years);
    setIabModalOpen(true);
  };

  const handleSaveIab = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!iabModule.trim()) return;
    setSaving(true);
    try {
      const nextEntry: TeachingIabEntry = {
        id: editingIabId || makeRecordId('TIAB'),
        moduleOrField: iabModule.trim(),
        teachingType: iabType,
        years: Math.max(0, Math.min(60, Number(iabYears) || 0)),
      };
      const nextIab = editingIabId
        ? iabList.map((i) => (i.id === editingIabId ? nextEntry : i))
        : [...iabList, nextEntry];

      await persistTeachingLists({
        iabTeachingList: nextIab,
        schoolTeachingList: schoolList,
        externalTeachingList: externalList,
      });
      setIabModalOpen(false);
      showToast('success', 'Pengalaman mengajar di IAB berjaya disimpan.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod.';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // BAHAGIAN B: DI SEKOLAH
  // =========================================================
  const openAddSchool = () => {
    setEditingSchoolId(null);
    setSchoolSubject('');
    setSchoolYears(1);
    setSchoolModalOpen(true);
  };

  const openEditSchool = (entry: TeachingSchoolEntry) => {
    setEditingSchoolId(entry.id);
    setSchoolSubject(entry.subject);
    setSchoolYears(entry.years);
    setSchoolModalOpen(true);
  };

  const handleSaveSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolSubject.trim()) return;
    setSaving(true);
    try {
      const nextEntry: TeachingSchoolEntry = {
        id: editingSchoolId || makeRecordId('TSCH'),
        subject: schoolSubject.trim(),
        years: Math.max(0, Math.min(60, Number(schoolYears) || 0)),
      };
      const nextSchool = editingSchoolId
        ? schoolList.map((i) => (i.id === editingSchoolId ? nextEntry : i))
        : [...schoolList, nextEntry];

      await persistTeachingLists({
        iabTeachingList: iabList,
        schoolTeachingList: nextSchool,
        externalTeachingList: externalList,
      });
      setSchoolModalOpen(false);
      showToast('success', 'Pengalaman mengajar di sekolah berjaya disimpan.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod.';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  // =========================================================
  // BAHAGIAN C: SELAIN DI IAB & SEKOLAH
  // =========================================================
  const openAddExternal = () => {
    setEditingExtId(null);
    setExtInstitution('');
    setExtModule('');
    setExtType(EXTERNAL_TEACHING_TYPES[0]);
    setExtYears(1);
    setExtModalOpen(true);
  };

  const openEditExternal = (entry: TeachingExternalEntry) => {
    setEditingExtId(entry.id);
    setExtInstitution(entry.institution);
    setExtModule(entry.moduleOrField);
    setExtType(entry.teachingType || EXTERNAL_TEACHING_TYPES[0]);
    setExtYears(entry.years);
    setExtModalOpen(true);
  };

  const handleSaveExternal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!extInstitution.trim() || !extModule.trim()) return;
    setSaving(true);
    try {
      const nextEntry: TeachingExternalEntry = {
        id: editingExtId || makeRecordId('TEXT'),
        institution: extInstitution.trim(),
        moduleOrField: extModule.trim(),
        teachingType: extType,
        years: Math.max(0, Math.min(60, Number(extYears) || 0)),
      };
      const nextExternal = editingExtId
        ? externalList.map((i) => (i.id === editingExtId ? nextEntry : i))
        : [...externalList, nextEntry];

      await persistTeachingLists({
        iabTeachingList: iabList,
        schoolTeachingList: schoolList,
        externalTeachingList: nextExternal,
      });
      setExtModalOpen(false);
      showToast('success', 'Pengalaman mengajar luar berjaya disimpan.');
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Gagal menyimpan rekod.';
      showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (
    section: 'iab' | 'school' | 'external',
    id: string,
    label: string
  ) => {
    setConfirmState({
      open: true,
      title: 'Padam Pengalaman Mengajar',
      message: `Adakah anda pasti mahu memadam rekod "${label}"?`,
      onConfirm: async () => {
        setSaving(true);
        try {
          await persistTeachingLists({
            iabTeachingList:
              section === 'iab' ? iabList.filter((i) => i.id !== id) : iabList,
            schoolTeachingList:
              section === 'school' ? schoolList.filter((i) => i.id !== id) : schoolList,
            externalTeachingList:
              section === 'external' ? externalList.filter((i) => i.id !== id) : externalList,
          });
          showToast('success', 'Rekod pengalaman mengajar berjaya dipadamkan.');
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : 'Gagal memadam rekod.';
          showToast('error', message);
        } finally {
          setSaving(false);
        }
      },
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <Briefcase className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Pengalaman Mengajar</h1>
            <p className="text-xs text-slate-500 mt-1">
              Rekod pengalaman pengajaran di Institut Aminuddin Baki (IAB), sekolah serta institusi atau organisasi luar.
            </p>
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
              {!profiles.some((p) => p.staffId === userAccount.staffId) &&
                userAccount.staffId && (
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
          <p className="text-xs text-slate-500">Memuatkan rekod pengalaman mengajar...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* BAHAGIAN A: DI IAB */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <BookOpen className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN A: PENGALAMAN MENGAJAR DI IAB
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Senarai bidang, modul dan jenis pengajaran yang dikendalikan di IAB.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddIab}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Bidang / Modul</th>
                    <th className="py-3 px-4">Jenis Pengajaran</th>
                    <th className="py-3 px-4 w-40">Tahun Pengalaman</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {iabList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 5 : 4}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada pengalaman mengajar di IAB direkodkan.
                      </td>
                    </tr>
                  ) : (
                    iabList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4 font-semibold text-[#0B1F3B]">
                          {item.moduleOrField}
                        </td>
                        <td className="py-3 px-4 text-slate-700">{item.teachingType}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {item.years} tahun
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditIab(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete('iab', item.id, item.moduleOrField)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          </section>

          {/* BAHAGIAN B: DI SEKOLAH */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <School className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN B: PENGALAMAN MENGAJAR DI SEKOLAH
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod mata pelajaran yang pernah diajar semasa berkhidmat di sekolah.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddSchool}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Mata Pelajaran</th>
                    <th className="py-3 px-4 w-40">Tahun Pengalaman</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {schoolList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 4 : 3}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada pengalaman mengajar di sekolah direkodkan.
                      </td>
                    </tr>
                  ) : (
                    schoolList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4 font-semibold text-[#0B1F3B]">{item.subject}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {item.years} tahun
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditSchool(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => requestDelete('school', item.id, item.subject)}
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          </section>

          {/* BAHAGIAN C: SELAIN DI IAB & SEKOLAH */}
          <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <Building2 className="w-5 h-5 text-[#C69738] shrink-0 mt-0.5" />
                <div>
                  <h2 className="text-sm font-bold text-[#0B1F3B] uppercase tracking-wide">
                    BAHAGIAN C: PENGALAMAN MENGAJAR SELAIN DI IAB & SEKOLAH
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Rekod pengalaman mengajar atau mengendalikan latihan di institusi pengajian tinggi, agensi atau organisasi luar.
                  </p>
                </div>
              </div>
              {canEdit && (
                <button
                  type="button"
                  onClick={openAddExternal}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Tambah
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 uppercase tracking-wider">
                    <th className="py-3 px-4 w-12">Bil.</th>
                    <th className="py-3 px-4">Institusi / Organisasi</th>
                    <th className="py-3 px-4">Bidang / Modul</th>
                    <th className="py-3 px-4">Jenis Pengajaran</th>
                    <th className="py-3 px-4 w-40">Tahun Pengalaman</th>
                    {canEdit && <th className="py-3 px-4 text-right w-24">Tindakan</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {externalList.length === 0 ? (
                    <tr>
                      <td
                        colSpan={canEdit ? 6 : 5}
                        className="py-8 px-4 text-center text-slate-500"
                      >
                        Tiada pengalaman mengajar selain di IAB & sekolah direkodkan.
                      </td>
                    </tr>
                  ) : (
                    externalList.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/60">
                        <td className="py-3 px-4 font-mono-tabular text-slate-500">{idx + 1}.</td>
                        <td className="py-3 px-4 font-semibold text-[#0B1F3B]">
                          {item.institution}
                        </td>
                        <td className="py-3 px-4 text-slate-800">{item.moduleOrField}</td>
                        <td className="py-3 px-4 text-slate-700">{item.teachingType}</td>
                        <td className="py-3 px-4 font-mono-tabular text-slate-700">
                          {item.years} tahun
                        </td>
                        {canEdit && (
                          <td className="py-3 px-4 text-right">
                            <div className="inline-flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => openEditExternal(item)}
                                className="p-1 text-slate-500 hover:text-[#0B1F3B]"
                                title="Edit"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  requestDelete(
                                    'external',
                                    item.id,
                                    `${item.institution} — ${item.moduleOrField}`
                                  )
                                }
                                className="p-1 text-red-600 hover:text-red-800"
                                title="Padam"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
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
          </section>
        </div>
      )}

      {/* MODAL BAHAGIAN A: DI IAB */}
      {iabModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingIabId
                  ? 'Edit Pengalaman Mengajar di IAB'
                  : 'Tambah Pengalaman Mengajar di IAB'}
              </h3>
              <button
                type="button"
                onClick={() => setIabModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveIab} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bidang / Modul *</label>
                <input
                  type="text"
                  required
                  value={iabModule}
                  onChange={(e) => setIabModule(e.target.value)}
                  placeholder="Contoh: Kepimpinan Instruksional / Modul AI"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jenis Pengajaran *
                </label>
                <select
                  value={iabType}
                  onChange={(e) => setIabType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {IAB_TEACHING_TYPES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tahun Pengalaman *
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  required
                  value={iabYears}
                  onChange={(e) => setIabYears(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setIabModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
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
        </div>
      )}

      {/* MODAL BAHAGIAN B: DI SEKOLAH */}
      {schoolModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingSchoolId
                  ? 'Edit Pengalaman Mengajar di Sekolah'
                  : 'Tambah Pengalaman Mengajar di Sekolah'}
              </h3>
              <button
                type="button"
                onClick={() => setSchoolModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveSchool} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mata Pelajaran *
                </label>
                <input
                  type="text"
                  required
                  value={schoolSubject}
                  onChange={(e) => setSchoolSubject(e.target.value)}
                  placeholder="Contoh: Sains"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tahun Pengalaman *
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  required
                  value={schoolYears}
                  onChange={(e) => setSchoolYears(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setSchoolModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
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
        </div>
      )}

      {/* MODAL BAHAGIAN C: SELAIN DI IAB & SEKOLAH */}
      {extModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4"
          role="dialog"
          aria-modal="true"
        >
          <div className="bg-white rounded-xl border border-slate-200 max-w-md w-full overflow-hidden shadow-xl">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                {editingExtId
                  ? 'Edit Pengalaman Mengajar Luar'
                  : 'Tambah Pengalaman Mengajar Selain Di IAB & Sekolah'}
              </h3>
              <button
                type="button"
                onClick={() => setExtModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveExternal} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Institusi / Organisasi *
                </label>
                <input
                  type="text"
                  required
                  value={extInstitution}
                  onChange={(e) => setExtInstitution(e.target.value)}
                  placeholder="Contoh: Universiti Putra Malaysia / INTAN"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Bidang / Modul *</label>
                <input
                  type="text"
                  required
                  value={extModule}
                  onChange={(e) => setExtModule(e.target.value)}
                  placeholder="Contoh: Pengurusan Organisasi & Data"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Jenis Pengajaran *
                </label>
                <select
                  value={extType}
                  onChange={(e) => setExtType(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg bg-white"
                >
                  {EXTERNAL_TEACHING_TYPES.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tahun Pengalaman *
                </label>
                <input
                  type="number"
                  min={0}
                  max={60}
                  step="0.5"
                  required
                  value={extYears}
                  onChange={(e) => setExtYears(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg font-mono-tabular"
                />
              </div>
              <div className="pt-2 flex justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={saving}
                  onClick={() => setExtModalOpen(false)}
                  className="px-4 py-2 text-xs text-slate-600 hover:text-slate-900"
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
        </div>
      )}

      <ConfirmDialog
        open={confirmState.open}
        title={confirmState.title}
        description={confirmState.message}
        confirmLabel="Padam"
        variant="danger"
        onCancel={() => setConfirmState((s) => ({ ...s, open: false }))}
        onConfirm={async () => {
          const fn = confirmState.onConfirm;
          setConfirmState((s) => ({ ...s, open: false }));
          await fn();
        }}
      />
    </div>
  );
};
