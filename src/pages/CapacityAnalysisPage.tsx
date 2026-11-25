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
import { AlertTriangle, Info } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_COMPETENCY_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
} from '../lib/constants';
import { getSystemSettings } from '../services/firestoreService';
import type { Department, StaffProfile, SystemSetting } from '../types/iab';

interface CapacityAnalysisPageProps {
  profiles: StaffProfile[];
  departments: Department[];
}

const CHART_COLORS = ['#0B1F3B', '#C69738', '#1E40AF', '#0F766E', '#64748B', '#B45309'];

export const CapacityAnalysisPage: React.FC<CapacityAnalysisPageProps> = ({
  profiles,
  departments,
}) => {
  const { userAccount } = useAuth();
  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(null);
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');

  useEffect(() => {
    getSystemSettings().then(setSysSettings).catch(() => {});
  }, []);

  const expertiseCategories = sysSettings?.expertiseCategories?.length
    ? sysSettings.expertiseCategories
    : DEFAULT_EXPERTISE_CATEGORIES;
  const competencyCategories = sysSettings?.competencyCategories?.length
    ? sysSettings.competencyCategories
    : DEFAULT_COMPETENCY_CATEGORIES;

  const scopedProfiles = useMemo(() => {
    return profiles.filter((p) => {
      if (deptFilter !== 'ALL' && p.departmentId !== deptFilter) return false;
      if (
        categoryFilter !== 'ALL' &&
        p.primaryExpertise !== categoryFilter &&
        p.secondaryExpertise !== categoryFilter
      ) {
        return false;
      }
      return true;
    });
  }, [profiles, deptFilter, categoryFilter]);

  const totalDenominator = scopedProfiles.length;
  const filledExpertiseCount = scopedProfiles.filter((p) => Boolean(p.primaryExpertise?.trim())).length;
  const unfilledExpertiseCount = totalDenominator - filledExpertiseCount;
  const filledCompCount = scopedProfiles.filter((p) => (p.digitalCompetencies?.length || 0) > 0).length;
  const incompleteProfilesCount = scopedProfiles.filter((p) => (p.completionPercent || 0) < 80).length;
  const avgCompletion =
    totalDenominator > 0
      ? Math.round(scopedProfiles.reduce((acc, p) => acc + (p.completionPercent || 0), 0) / totalDenominator)
      : 0;

  const dataSufficiencyWarning = avgCompletion < 75 || unfilledExpertiseCount > 0;

  // Competency AI & Digital bar chart
  const competencyData = useMemo(() => {
    return competencyCategories.map((cat) => {
      const count = scopedProfiles.filter((p) => p.digitalCompetencies?.includes(cat)).length;
      return { name: cat, jumlah: count };
    });
  }, [scopedProfiles, competencyCategories]);

  // Qualification Pie
  const qualPieData = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of scopedProfiles) {
      const k = p.highestQualification?.trim() || 'Belum Diisi';
      m.set(k, (m.get(k) || 0) + 1);
    }
    return Array.from(m.entries()).map(([name, value]) => ({ name, value }));
  }, [scopedProfiles]);

  // Lecturer vs Non-lecturer Donut
  const instructorDonutData = useMemo(() => {
    const lecturers = scopedProfiles.filter((p) => p.isLecturer).length;
    const nonLecturers = totalDenominator - lecturers;
    return [
      { name: 'Tenaga Pengajar / Pensyarah', value: lecturers },
      { name: 'Bukan Pensyarah', value: nonLecturers },
    ];
  }, [scopedProfiles, totalDenominator]);

  // Gap Analysis Table across all standard expertise categories
  const gapRows = useMemo(() => {
    return expertiseCategories
      .map((cat) => {
        const primaryCount = scopedProfiles.filter((p) => p.primaryExpertise === cat).length;
        const secondaryCount = scopedProfiles.filter((p) => p.secondaryExpertise === cat).length;
        const totalCapable = scopedProfiles.filter(
          (p) => p.primaryExpertise === cat || p.secondaryExpertise === cat
        ).length;
        const pct = filledExpertiseCount > 0 ? Math.round((totalCapable / filledExpertiseCount) * 100) : 0;

        let statusText = 'Kapasiti Mencukupi';
        if (totalCapable === 0) {
          statusText = dataSufficiencyWarning ? 'Tiada Rekod (Semak Kelengkapan Data)' : 'Jurang Kritikal (0 Pakar)';
        } else if (totalCapable === 1) {
          statusText = 'Risiko Kebergantungan Tunggal (1 Pakar)';
        }
        return {
          category: cat,
          primaryCount,
          secondaryCount,
          totalCapable,
          pct,
          statusText,
        };
      })
      .sort((a, b) => a.totalCapable - b.totalCapable);
  }, [scopedProfiles, expertiseCategories, filledExpertiseCount, dataSufficiencyWarning]);

  // Department x Expertise Heatmap Matrix
  const activeDepts = useMemo(() => {
    const ids = new Set(scopedProfiles.map((p) => p.departmentId).filter(Boolean));
    return departments.filter((d) => ids.has(d.id));
  }, [scopedProfiles, departments]);

  const topCategoriesForHeatmap = expertiseCategories.slice(0, 6);

  return (
    <div className="space-y-6">
      {/* Header & Methodology Notice */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-[#0B1F3B]">Analisis Kapasiti Kepakaran Organisasi</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Sokongan keputusan pengurusan berasaskan rekod pangkalan data sebenar. Bukan penilaian prestasi individu.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={deptFilter}
              onChange={(e) => setDeptFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">Semua Jabatan ({userAccount?.role === 'L2' ? 'Skop L2' : 'Organisasi'})</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
            >
              <option value="ALL">Semua Bidang Kepakaran</option>
              {expertiseCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Transparency & Denominator Banner */}
        <div className="p-3.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-[#0B1F3B] shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold text-[#0B1F3B]">Kaedah Pengiraan & Denominator:</span>{' '}
              Peratusan kepakaran dikira menggunakan denominator{' '}
              <span className="font-mono-tabular font-semibold">{filledExpertiseCount}</span> profil yang telah mengisi kepakaran daripada jumlah keseluruhan{' '}
              <span className="font-mono-tabular font-semibold">{totalDenominator}</span> rekod pegawai.
            </div>
          </div>
          <span className="text-[11px] text-slate-500 font-mono-tabular shrink-0">
            Dikemas kini: {new Date().toLocaleDateString('ms-MY')}
          </span>
        </div>

        {dataSufficiencyWarning && (
          <div className="p-3.5 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
            <div>
              <strong>Peringatan Kualiti Data:</strong> Terdapat{' '}
              <span className="font-mono-tabular font-semibold">{unfilledExpertiseCount}</span> profil belum mengisi kepakaran utama dan{' '}
              <span className="font-mono-tabular font-semibold">{incompleteProfilesCount}</span> profil berada di bawah 80% kelengkapan.
              Elakkan membuat kesimpulan muktamad kekurangan pakar selagi rekod belum dilengkapkan.
            </div>
          </div>
        )}
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Jumlah Rekod Pegawai (Denominator)</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">{totalDenominator}</p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Profil Mengisi Kepakaran</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {filledExpertiseCount} <span className="text-xs font-normal text-slate-500">({unfilledExpertiseCount} belum diisi)</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Profil Mengisi Kompetensi AI/Digital</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">
            {filledCompCount} <span className="text-xs font-normal text-slate-500">({totalDenominator - filledCompCount} belum diisi)</span>
          </p>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs text-slate-500">Purata Kelengkapan Profil</p>
          <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1">{avgCompletion}%</p>
        </div>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Kapasiti Kompetensi Digital & AI</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={competencyData} layout="vertical" margin={{ left: 30 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" width={165} tick={{ fontSize: 10 }} />
                <Tooltip />
                <Bar dataKey="jumlah" name="Bilangan Pegawai" fill="#0B1F3B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-3">Taburan Kelayakan Akademik</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={qualPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={72}>
                    {qualPieData.map((e, i) => (
                      <Cell key={e.name} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-3">Taburan Tenaga Pengajar</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={instructorDonutData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={42}
                    outerRadius={72}
                  >
                    <Cell fill="#0B1F3B" />
                    <Cell fill="#C69738" />
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </div>

      {/* Department x Expertise Heatmap Matrix */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0B1F3B]">Heatmap Kepakaran Mengikut Jabatan</h3>
          <p className="text-xs text-slate-500">
            Taburan bilangan pakar (kepakaran utama atau kedua) merentas jabatan dan bidang teras IAB.
          </p>
        </div>

        {activeDepts.length === 0 ? (
          <p className="text-xs text-slate-500 py-4">Tiada data jabatan mencukupi untuk paparan matriks.</p>
        ) : (
          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Jabatan</th>
                  {topCategoriesForHeatmap.map((cat) => (
                    <th key={cat} className="py-2.5 px-3 font-semibold text-center max-w-[140px]">
                      <span className="line-clamp-2">{cat}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {activeDepts.map((dept) => {
                  const deptStaff = scopedProfiles.filter((p) => p.departmentId === dept.id);
                  return (
                    <tr key={dept.id}>
                      <td className="py-2.5 px-3 font-semibold text-[#0B1F3B] whitespace-nowrap">
                        {dept.name}
                      </td>
                      {topCategoriesForHeatmap.map((cat) => {
                        const count = deptStaff.filter(
                          (p) => p.primaryExpertise === cat || p.secondaryExpertise === cat
                        ).length;
                        const cellBg =
                          count === 0
                            ? 'bg-slate-50 text-slate-400'
                            : count === 1
                            ? 'bg-[#C69738]/20 text-[#0B1F3B] font-semibold'
                            : 'bg-[#0B1F3B] text-white font-bold';
                        return (
                          <td key={cat} className={`py-2.5 px-3 text-center font-mono-tabular ${cellBg}`}>
                            {count}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Gap Analysis Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h3 className="text-sm font-bold text-[#0B1F3B]">Jadual Analisis Jurang Kepakaran</h3>
          <p className="text-xs text-slate-500">
            Mengenal pasti bidang kepakaran yang mempunyai kekurangan atau kebergantungan tunggal.
          </p>
        </div>
        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-xs text-left">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Bidang Kepakaran</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pakar Utama</th>
                <th className="py-2.5 px-3 font-semibold text-right">Pakar Kedua</th>
                <th className="py-2.5 px-3 font-semibold text-right">Jumlah Kapasiti</th>
                <th className="py-2.5 px-3 font-semibold text-right">% (drpd {filledExpertiseCount} diisi)</th>
                <th className="py-2.5 px-3 font-semibold">Status Analisis</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {gapRows.map((row) => (
                <tr key={row.category} className="hover:bg-slate-50/70">
                  <td className="py-2.5 px-3 font-semibold text-[#0B1F3B]">{row.category}</td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular">{row.primaryCount}</td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular">{row.secondaryCount}</td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular font-bold">{row.totalCapable}</td>
                  <td className="py-2.5 px-3 text-right font-mono-tabular">{row.pct}%</td>
                  <td className="py-2.5 px-3">
                    <span
                      className={`font-medium ${
                        row.totalCapable === 0
                          ? 'text-red-700'
                          : row.totalCapable === 1
                          ? 'text-amber-700'
                          : 'text-emerald-700'
                      }`}
                    >
                      {row.statusText}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
