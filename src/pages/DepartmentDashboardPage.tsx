import React, { useMemo, useState } from 'react';
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
import { Download, Eye, Search } from 'lucide-react';
import { DriveImage } from '../components/DriveImage';
import { useAuth } from '../contexts/AuthContext';
import { isCountableStaff } from '../lib/constants';
import { exportStaffProfilesToExcel } from '../utils/excelExport';
import type { CompetencyItem, CompetencyRecord, Department, StaffProfile } from '../types/iab';

interface DepartmentDashboardPageProps {
  profiles: StaffProfile[];
  competencyRecords?: CompetencyRecord[];
  departments: Department[];
  onInspectProfile: (staffId: string) => void;
}

const COLORS = ['#0B1F3B', '#C69738', '#1E40AF', '#0F766E', '#64748B'];

export const DepartmentDashboardPage: React.FC<DepartmentDashboardPageProps> = ({
  profiles,
  competencyRecords = [],
  departments,
  onInspectProfile,
}) => {
  const { userAccount } = useAuth();
  const isL2Locked = userAccount?.role === 'L2' && !userAccount?.isAdmin;

  const accessibleDepts = useMemo(() => {
    if (userAccount?.isAdmin) return departments;
    if (userAccount?.role === 'L1') {
      return departments.filter((d) => d.centerId === userAccount.centerId);
    }
    return departments.filter((d) => d.id === userAccount?.departmentId);
  }, [departments, userAccount]);

  const [selectedDeptId, setSelectedDeptId] = useState<string>(
    userAccount?.departmentId || accessibleDepts[0]?.id || ''
  );
  const [searchQuery, setSearchQuery] = useState('');

  const activeDeptId = isL2Locked ? userAccount?.departmentId || '' : selectedDeptId || accessibleDepts[0]?.id || '';
  const activeDept = departments.find((d) => d.id === activeDeptId);

  const compMap = useMemo(() => {
    const m = new Map<string, CompetencyItem[]>();
    for (const rec of competencyRecords) {
      m.set(rec.staffId, rec.items || []);
    }
    return m;
  }, [competencyRecords]);

  const deptProfiles = useMemo(() => {
    return profiles.filter((p) => isCountableStaff(p) && p.departmentId === activeDeptId);
  }, [profiles, activeDeptId]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return deptProfiles;
    return deptProfiles.filter((p) => {
      const items = compMap.get(p.staffId) || [];
      const compText = items.map((i) => `${i.categoryName} ${i.level}`).join(' ').toLowerCase();
      return (
        p.fullName.toLowerCase().includes(q) ||
        (p.primaryExpertise || '').toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q) ||
        compText.includes(q)
      );
    });
  }, [deptProfiles, compMap, searchQuery]);

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

  const avgCompletion =
    deptProfiles.length > 0
      ? Math.round(
          deptProfiles.reduce((acc, p) => acc + (p.completionPercent || 0), 0) / deptProfiles.length
        )
      : 0;

  const digitalStats = useMemo(() => {
    let staffWithComp = 0;
    let appSkills = 0;
    let knowSkills = 0;
    for (const p of deptProfiles) {
      const items = compMap.get(p.staffId) || [];
      if (items.length > 0 || (p.digitalCompetencies?.length || 0) > 0) staffWithComp += 1;
      appSkills += items.filter((i) => i.skillType === 'aplikasi').length;
      knowSkills += items.filter((i) => i.skillType === 'pengetahuan').length;
    }
    return { staffWithComp, appSkills, knowSkills };
  }, [deptProfiles, compMap]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">
            {activeDept?.name || 'Dashboard Jabatan'}
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Ketua Jabatan: <strong className="text-slate-700">{activeDept?.headName || 'Belum ditetapkan'}</strong>
            {isL2Locked && ' · Akses terhad kepada jabatan sendiri (RBAC L2)'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {!isL2Locked && accessibleDepts.length > 0 && (
            <select
              value={activeDeptId}
              onChange={(e) => setSelectedDeptId(e.target.value)}
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
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
          >
            <Download className="w-3.5 h-3.5" />
            Eksport Jabatan (.xlsx)
          </button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Jumlah Pegawai Jabatan</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {deptProfiles.length}
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Purata Kelengkapan Profil</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {avgCompletion}%
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Kompetensi Digital & AI</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {digitalStats.staffWithComp}
          </p>
          <p className="text-[11px] text-slate-500 mt-1">
            {digitalStats.appSkills} Aplikasi · {digitalStats.knowSkills} Pengetahuan
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Bidang Kepakaran Aktif</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {expertiseGroups.filter(([k]) => k !== 'Belum Diisi').length}
          </p>
        </div>
      </div>

      {deptProfiles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm font-semibold text-[#0B1F3B]">Tiada pegawai didaftarkan di bawah jabatan ini lagi</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-white border border-slate-200 rounded-xl p-5">
              <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Statistik Jawatan & Gred</h3>
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
              <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Kelayakan Akademik Jabatan</h3>
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
          </div>

          {/* Senarai Pakar Mengikut Bidang */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <h3 className="text-sm font-bold text-[#0B1F3B]">Senarai Pakar Mengikut Bidang</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {expertiseGroups.map(([field, list]) => (
                <div key={field} className="p-4 border border-slate-200 rounded-lg bg-slate-50/50">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-[#0B1F3B]">{field}</h4>
                    <span className="text-xs font-mono-tabular text-slate-600">{list.length} orang</span>
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

          {/* Direktori Pegawai Jabatan */}
          <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <h3 className="text-sm font-bold text-[#0B1F3B]">
                Direktori Pegawai Jabatan ({filteredProfiles.length})
              </h3>
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Cari pegawai jabatan..."
                  className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg"
                />
              </div>
            </div>

            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Nama Pegawai</th>
                    <th className="py-2.5 px-3 font-semibold">Jawatan / Gred</th>
                    <th className="py-2.5 px-3 font-semibold">Kepakaran Utama</th>
                    <th className="py-2.5 px-3 font-semibold">Kompetensi Digital & AI</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Kelengkapan</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Tindakan</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredProfiles.map((p) => {
                    const items = compMap.get(p.staffId) || [];
                    const compSummary =
                      items.length > 0
                        ? items
                            .slice(0, 3)
                            .map((i) => `${i.categoryName} (${i.level})`)
                            .join(', ') + (items.length > 3 ? ` +${items.length - 3}` : '')
                        : p.digitalCompetencies?.slice(0, 3).join(', ') || 'Belum Diisi';
                    return (
                      <tr key={p.staffId}>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <DriveImage
                              driveFileId={p.photoDisplayUrl}
                              fullName={p.fullName}
                              className="w-7 h-7 rounded-md"
                            />
                            <span className="font-semibold text-[#0B1F3B]">{p.fullName}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          {p.position || '-'} · <span className="font-mono-tabular">{p.grade || '-'}</span>
                        </td>
                        <td className="py-2.5 px-3">{p.primaryExpertise || 'Belum Diisi'}</td>
                        <td className="py-2.5 px-3 text-slate-600">{compSummary}</td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-semibold">
                          {p.completionPercent}%
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onInspectProfile(p.staffId)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-[#0B1F3B] rounded-md"
                          >
                            <Eye className="w-3 h-3" /> Lihat
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
