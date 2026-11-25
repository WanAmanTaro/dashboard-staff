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
import { exportStaffProfilesToExcel } from '../utils/excelExport';
import type { Department, OrganizationCenter, StaffProfile } from '../types/iab';

interface CenterDashboardPageProps {
  profiles: StaffProfile[];
  organizations: OrganizationCenter[];
  departments: Department[];
  onInspectProfile: (staffId: string) => void;
}

const NAVY_GOLD_PALETTE = ['#0B1F3B', '#C69738', '#1D4ED8', '#0F766E', '#64748B', '#9D741E'];

export const CenterDashboardPage: React.FC<CenterDashboardPageProps> = ({
  profiles,
  organizations,
  departments,
  onInspectProfile,
}) => {
  const { userAccount } = useAuth();
  const [selectedCenterId, setSelectedCenterId] = useState<string>(
    userAccount?.isAdmin ? 'ALL' : userAccount?.centerId || 'ALL'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('ALL');
  const [filterGrade, setFilterGrade] = useState('ALL');
  const [filterQual, setFilterQual] = useState('ALL');
  const [filterExpertise, setFilterExpertise] = useState('ALL');

  const centerProfiles = useMemo(() => {
    if (selectedCenterId === 'ALL') return profiles;
    return profiles.filter((p) => p.centerId === selectedCenterId);
  }, [profiles, selectedCenterId]);

  const filteredProfiles = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return centerProfiles.filter((p) => {
      if (filterDept !== 'ALL' && p.departmentId !== filterDept) return false;
      if (filterGrade !== 'ALL' && (p.grade || 'Belum Diisi') !== filterGrade) return false;
      if (filterQual !== 'ALL' && (p.highestQualification || 'Belum Diisi') !== filterQual)
        return false;
      if (filterExpertise !== 'ALL' && (p.primaryExpertise || 'Belum Diisi') !== filterExpertise)
        return false;
      if (!q) return true;
      return (
        p.fullName.toLowerCase().includes(q) ||
        p.staffId.toLowerCase().includes(q) ||
        (p.position || '').toLowerCase().includes(q) ||
        (p.primaryExpertise || '').toLowerCase().includes(q) ||
        (p.departmentName || '').toLowerCase().includes(q)
      );
    });
  }, [centerProfiles, searchQuery, filterDept, filterGrade, filterQual, filterExpertise]);

  // Metrics
  const stats = useMemo(() => {
    const total = centerProfiles.length;
    const lecturers = centerProfiles.filter((p) => p.isLecturer).length;
    const nonLecturers = total - lecturers;
    const avgCompletion =
      total > 0
        ? Math.round(centerProfiles.reduce((acc, p) => acc + (p.completionPercent || 0), 0) / total)
        : 0;
    const withPhoto = centerProfiles.filter((p) => p.hasPhoto).length;
    const withExpertise = centerProfiles.filter((p) => Boolean(p.primaryExpertise?.trim())).length;
    const totalCerts = centerProfiles.reduce((acc, p) => acc + (p.certificateCount || 0), 0);

    const aiGenAiCount = centerProfiles.filter((p) =>
      p.digitalCompetencies?.some((c) => /ai|genai|generative/i.test(c))
    ).length;
    const digitalTechCount = centerProfiles.filter((p) =>
      p.digitalCompetencies?.some((c) => /digital|technology|cyber|data/i.test(c))
    ).length;
    const eduLeadershipCount = centerProfiles.filter((p) =>
      /kepimpinan/i.test(`${p.primaryExpertise} ${p.secondaryExpertise}`)
    ).length;

    const deptSet = new Set(
      departments
        .filter((d) => selectedCenterId === 'ALL' || d.centerId === selectedCenterId)
        .map((d) => d.id)
    );

    return {
      total,
      lecturers,
      nonLecturers,
      deptCount: deptSet.size,
      avgCompletion,
      photoPercent: total > 0 ? Math.round((withPhoto / total) * 100) : 0,
      expertisePercent: total > 0 ? Math.round((withExpertise / total) * 100) : 0,
      totalCerts,
      aiGenAiCount,
      digitalTechCount,
      eduLeadershipCount,
    };
  }, [centerProfiles, departments, selectedCenterId]);

  const gradeChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of centerProfiles) {
      const k = p.grade?.trim() || 'Belum Diisi';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, jumlah]) => ({ name, jumlah }));
  }, [centerProfiles]);

  const qualChartData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of centerProfiles) {
      const k = p.highestQualification?.trim() || 'Belum Diisi';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries()).map(([name, value]) => ({ name, value }));
  }, [centerProfiles]);

  const expertiseRankingData = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of centerProfiles) {
      const k = p.primaryExpertise?.trim() || 'Belum Diisi';
      map.set(k, (map.get(k) || 0) + 1);
    }
    return Array.from(map.entries())
      .map(([name, jumlah]) => ({ name, jumlah }))
      .sort((a, b) => b.jumlah - a.jumlah)
      .slice(0, 8);
  }, [centerProfiles]);

  const deptDistributionData = useMemo(() => {
    const map = new Map<string, { name: string; lengkap: number; belumLengkap: number }>();
    for (const p of centerProfiles) {
      const dept = p.departmentName?.trim() || 'Belum Ditetapkan';
      const entry = map.get(dept) || { name: dept, lengkap: 0, belumLengkap: 0 };
      if ((p.completionPercent || 0) >= 80) entry.lengkap += 1;
      else entry.belumLengkap += 1;
      map.set(dept, entry);
    }
    return Array.from(map.values());
  }, [centerProfiles]);

  const uniqueGrades = Array.from(new Set(centerProfiles.map((p) => p.grade?.trim() || 'Belum Diisi')));
  const uniqueQuals = Array.from(
    new Set(centerProfiles.map((p) => p.highestQualification?.trim() || 'Belum Diisi'))
  );
  const uniqueExps = Array.from(
    new Set(centerProfiles.map((p) => p.primaryExpertise?.trim() || 'Belum Diisi'))
  );
  const centerDepts = departments.filter(
    (d) => selectedCenterId === 'ALL' || d.centerId === selectedCenterId
  );

  return (
    <div className="space-y-6">
      {/* Header Controls */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">Dashboard Eksekutif Pusat</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Statistik masa nyata daripada pangkalan data Firestore. Rekod yang belum diisi ditandakan berasingan daripada sifar.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {userAccount?.isAdmin && (
            <select
              value={selectedCenterId}
              onChange={(e) => {
                setSelectedCenterId(e.target.value);
                setFilterDept('ALL');
              }}
              className="px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg"
            >
              <option value="ALL">Semua Pusat IAB</option>
              {organizations.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => exportStaffProfilesToExcel(filteredProfiles, 'IAB_Dashboard_Pusat')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" />
            Eksport Excel (.xlsx)
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Jumlah Pegawai', value: stats.total, sub: `${stats.deptCount} Jabatan aktif` },
          {
            label: 'Pensyarah / Bukan Pensyarah',
            value: `${stats.lecturers} / ${stats.nonLecturers}`,
            sub: 'Pecahan kategori jawatan',
          },
          {
            label: 'Pakar AI & GenAI',
            value: stats.aiGenAiCount,
            sub: `${stats.digitalTechCount} teknologi digital`,
          },
          {
            label: 'Pakar Kepimpinan Pendidikan',
            value: stats.eduLeadershipCount,
            sub: `${stats.totalCerts} sijil dimuat naik`,
          },
          {
            label: 'Purata Kelengkapan Profil',
            value: `${stats.avgCompletion}%`,
            sub: 'Berdasarkan 10 seksyen',
          },
          {
            label: 'Gambar Profil Dimuat Naik',
            value: `${stats.photoPercent}%`,
            sub: 'Nisbah 1:1 dalam Drive',
          },
          {
            label: 'Maklumat Kepakaran Lengkap',
            value: `${stats.expertisePercent}%`,
            sub: 'Kepakaran utama diisi',
          },
          {
            label: 'Bilangan Sijil Direkod',
            value: stats.totalCerts,
            sub: 'Dokumen storan terkawal',
          },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-white border border-slate-200 rounded-xl p-4">
            <p className="text-xs font-medium text-slate-500">{kpi.label}</p>
            <p className="text-2xl font-extrabold text-[#0B1F3B] font-mono-tabular mt-1.5">
              {kpi.value}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">{kpi.sub}</p>
          </div>
        ))}
      </div>

      {/* Charts Grid */}
      {centerProfiles.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-10 text-center">
          <p className="text-sm font-semibold text-[#0B1F3B]">Tiada rekod pegawai ditemui dalam skop pusat ini</p>
          <p className="text-xs text-slate-500 mt-1">
            Statistik carta akan dijana secara automatik sebaik sahaja profil pegawai ditambah ke dalam pangkalan data.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Bar Chart: Gred Jawatan */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Statistik Pegawai Mengikut Gred</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={gradeChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Bar dataKey="jumlah" name="Bilangan Pegawai" fill="#0B1F3B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Donut Chart: Kelayakan Akademik */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Taburan Kelayakan Akademik Tertinggi</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={qualChartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={86}
                    paddingAngle={2}
                  >
                    {qualChartData.map((entry, idx) => (
                      <Cell key={entry.name} fill={NAVY_GOLD_PALETTE[idx % NAVY_GOLD_PALETTE.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Ranking Kepakaran */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Ranking Bidang Kepakaran Utama</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={expertiseRankingData} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} />
                  <Tooltip />
                  <Bar dataKey="jumlah" name="Bilangan Pakar" fill="#C69738" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Taburan Mengikut Jabatan */}
          <div className="bg-white border border-slate-200 rounded-xl p-5">
            <h3 className="text-sm font-bold text-[#0B1F3B] mb-4">Kelengkapan Profil Mengikut Jabatan</h3>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={deptDistributionData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="lengkap" name="Lengkap (≥80%)" stackId="a" fill="#0B1F3B" />
                  <Bar dataKey="belumLengkap" name="Perlu Kemas Kini (<80%)" stackId="a" fill="#D97706" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* Search, Filters & Staff Table */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <h3 className="text-sm font-bold text-[#0B1F3B]">
            Direktori Pegawai Pusat ({filteredProfiles.length})
          </h3>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Cari nama, ID, kepakaran..."
                className="pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
              />
            </div>
            <select
              value={filterDept}
              onChange={(e) => setFilterDept(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <option value="ALL">Semua Jabatan</option>
              {centerDepts.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              value={filterGrade}
              onChange={(e) => setFilterGrade(e.target.value)}
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
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg"
            >
              <option value="ALL">Semua Kepakaran</option>
              {uniqueExps.map((ex) => (
                <option key={ex} value={ex}>
                  {ex}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto border border-slate-200 rounded-lg">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 border-b border-slate-200">
              <tr>
                <th className="py-2.5 px-3 font-semibold">Pegawai</th>
                <th className="py-2.5 px-3 font-semibold">Jawatan & Gred</th>
                <th className="py-2.5 px-3 font-semibold">Jabatan</th>
                <th className="py-2.5 px-3 font-semibold">Kelayakan</th>
                <th className="py-2.5 px-3 font-semibold">Kepakaran Utama</th>
                <th className="py-2.5 px-3 font-semibold text-right">Kelengkapan</th>
                <th className="py-2.5 px-3 font-semibold text-right">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProfiles.map((p) => (
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
                        <p className="text-[11px] text-slate-500 font-mono-tabular">{p.staffId}</p>
                      </div>
                    </div>
                  </td>
                  <td className="py-2.5 px-3">
                    <span>{p.position || 'Belum Diisi'}</span>
                    <span className="text-slate-400"> · </span>
                    <span className="font-mono-tabular">{p.grade || '-'}</span>
                  </td>
                  <td className="py-2.5 px-3 text-slate-600">{p.departmentName || 'Belum Diisi'}</td>
                  <td className="py-2.5 px-3 text-slate-700">{p.highestQualification || 'Belum Diisi'}</td>
                  <td className="py-2.5 px-3 text-slate-700">{p.primaryExpertise || 'Belum Diisi'}</td>
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
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
