import React, { useEffect, useMemo, useState } from 'react';
import { FileText, Search, UserCheck } from 'lucide-react';
import { DriveImage } from '../components/DriveImage';
import { useAuth } from '../contexts/AuthContext';
import {
  DEFAULT_COMPETENCY_CATEGORIES,
  DEFAULT_EXPERTISE_CATEGORIES,
} from '../lib/constants';
import { getAllExpertiseForScope, getSystemSettings } from '../services/firestoreService';
import type { Department, ExpertiseRecord, StaffProfile, SystemSetting } from '../types/iab';

interface ExpertiseDirectoryPageProps {
  profiles: StaffProfile[];
  departments: Department[];
  onInspectProfile: (staffId: string) => void;
  onGeneratePdfFor: (staffId: string) => void;
}

export const ExpertiseDirectoryPage: React.FC<ExpertiseDirectoryPageProps> = ({
  profiles,
  departments,
  onInspectProfile,
  onGeneratePdfFor,
}) => {
  const { userAccount } = useAuth();
  const [expertiseMap, setExpertiseMap] = useState<Map<string, ExpertiseRecord>>(new Map());
  const [sysSettings, setSysSettings] = useState<SystemSetting | null>(null);

  const [queryText, setQueryText] = useState('');
  const [deptFilter, setDeptFilter] = useState('ALL');
  const [expertiseFilter, setExpertiseFilter] = useState('ALL');
  const [competencyFilter, setCompetencyFilter] = useState('ALL');
  const [roleExpFilter, setRoleExpFilter] = useState<'ALL' | 'facilitator' | 'speaker' | 'coach'>('ALL');

  useEffect(() => {
    if (!userAccount) return;
    getAllExpertiseForScope(userAccount)
      .then((list) => {
        const m = new Map<string, ExpertiseRecord>();
        for (const item of list) m.set(item.staffId, item);
        setExpertiseMap(m);
      })
      .catch(() => {});
    getSystemSettings().then(setSysSettings).catch(() => {});
  }, [userAccount?.uid]);

  const expertiseCategories = sysSettings?.expertiseCategories?.length
    ? sysSettings.expertiseCategories
    : DEFAULT_EXPERTISE_CATEGORIES;
  const competencyCategories = sysSettings?.competencyCategories?.length
    ? sysSettings.competencyCategories
    : DEFAULT_COMPETENCY_CATEGORIES;

  const filtered = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    return profiles.filter((p) => {
      const exp = expertiseMap.get(p.staffId);
      if (deptFilter !== 'ALL' && p.departmentId !== deptFilter) return false;
      if (
        expertiseFilter !== 'ALL' &&
        p.primaryExpertise !== expertiseFilter &&
        p.secondaryExpertise !== expertiseFilter
      ) {
        return false;
      }
      if (
        competencyFilter !== 'ALL' &&
        !p.digitalCompetencies?.includes(competencyFilter)
      ) {
        return false;
      }
      if (roleExpFilter === 'facilitator' && !exp?.facilitatorExp?.trim()) return false;
      if (roleExpFilter === 'speaker' && !exp?.speakerExp?.trim()) return false;
      if (roleExpFilter === 'coach' && !exp?.coachExp?.trim()) return false;

      if (!q) return true;
      const haystack = [
        p.fullName,
        p.staffId,
        p.position,
        p.departmentName,
        p.primaryExpertise,
        p.secondaryExpertise,
        ...(p.expertiseKeywords || []),
        ...(p.digitalCompetencies || []),
        ...(exp?.researchAreas || []),
        ...(exp?.specializations || []),
        exp?.facilitatorExp || '',
        exp?.speakerExp || '',
        exp?.coachExp || '',
      ]
        .join(' ')
        .toLowerCase();

      return haystack.includes(q);
    });
  }, [profiles, expertiseMap, queryText, deptFilter, expertiseFilter, competencyFilter, roleExpFilter]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
        <div>
          <h2 className="text-lg font-bold text-[#0B1F3B]">Direktori Kepakaran Organisasi IAB</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Carian berbilang kriteria menggunakan kategori piawai kawalan Admin untuk mengenal pasti tenaga pakar, fasilitator, penceramah dan jurulatih.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div className="relative lg:col-span-2">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder="Cari nama, kepakaran khusus, penyelidikan atau kata kunci..."
              className="w-full pl-9 pr-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
            />
          </div>

          <select
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">Semua Jabatan</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>

          <select
            value={expertiseFilter}
            onChange={(e) => setExpertiseFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">Semua Bidang Kepakaran</option>
            {expertiseCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>

          <select
            value={competencyFilter}
            onChange={(e) => setCompetencyFilter(e.target.value)}
            className="px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
          >
            <option value="ALL">Semua Kompetensi AI/Digital</option>
            {competencyCategories.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                ['ALL', 'Semua Peranan'],
                ['facilitator', 'Fasilitator'],
                ['speaker', 'Penceramah'],
                ['coach', 'Jurulatih / Coach'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setRoleExpFilter(k)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                  roleExpFilter === k
                    ? 'bg-white text-[#0B1F3B] shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-600 font-mono-tabular">
            Menunjukkan {filtered.length} daripada {profiles.length} pegawai
          </span>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center">
          <UserCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <p className="text-sm font-semibold text-[#0B1F3B]">Tiada pakar menepati kriteria carian</p>
          <p className="text-xs text-slate-500 mt-1">
            Cuba ubah atau kosongkan penapis carian anda.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((p) => {
            const exp = expertiseMap.get(p.staffId);
            const expSummary =
              exp?.facilitatorExp || exp?.speakerExp || exp?.coachExp || exp?.professionalExp || '';
            return (
              <div
                key={p.staffId}
                className="bg-white border border-slate-200 rounded-xl p-5 flex flex-col justify-between gap-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start gap-3.5">
                    <DriveImage
                      driveFileId={p.photoDisplayUrl}
                      fullName={p.fullName}
                      className="w-14 h-14 rounded-xl"
                    />
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-[#0B1F3B] truncate">{p.fullName}</h3>
                      <p className="text-xs text-slate-600 truncate">
                        {p.position || 'Jawatan belum diisi'}
                        {p.grade ? ` · ${p.grade}` : ''}
                      </p>
                      <p className="text-xs text-slate-500 truncate mt-0.5">
                        {p.departmentName || 'Jabatan belum ditetapkan'}
                      </p>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-100 space-y-1.5 text-xs">
                    <p className="text-slate-800">
                      <span className="font-semibold text-[#0B1F3B]">Kepakaran Utama:</span>{' '}
                      {p.primaryExpertise || 'Belum diisi'}
                    </p>
                    {p.digitalCompetencies?.length > 0 && (
                      <p className="text-slate-600">
                        <span className="font-semibold text-slate-700">Kompetensi AI/Digital:</span>{' '}
                        {p.digitalCompetencies.slice(0, 3).join(' · ')}
                      </p>
                    )}
                    {expSummary && (
                      <p className="text-slate-500 line-clamp-2">{expSummary}</p>
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 pt-3 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => onInspectProfile(p.staffId)}
                    className="flex-1 py-2 px-3 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                  >
                    Lihat Profil
                  </button>
                  <button
                    type="button"
                    onClick={() => onGeneratePdfFor(p.staffId)}
                    className="inline-flex items-center justify-center gap-1.5 py-2 px-3 text-xs font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg transition-colors"
                  >
                    <FileText className="w-3.5 h-3.5" />
                    PDF
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
