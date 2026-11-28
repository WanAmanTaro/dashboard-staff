import React, { useEffect, useState } from 'react';
import { Award, Loader2, Users } from 'lucide-react';
import { KompetensiIabSection } from '../components/KompetensiIabSection';
import { getIabCompetency } from '../services/firestoreService';
import type { IabCompetencyRecord, StaffProfile, SystemSetting, UserAccount } from '../types/iab';

interface KompetensiIabPageProps {
  userAccount: UserAccount;
  profiles: StaffProfile[];
  sysSettings: SystemSetting | null;
  onSystemSettingsUpdated?: () => Promise<void> | void;
}

export const KompetensiIabPage: React.FC<KompetensiIabPageProps> = ({
  userAccount,
  profiles,
  sysSettings,
  onSystemSettingsUpdated,
}) => {
  const canSwitchStaff =
    userAccount.isAdmin || userAccount.role === 'L1' || userAccount.role === 'L2';
  const [selectedStaffId, setSelectedStaffId] = useState(userAccount.staffId);
  const [record, setRecord] = useState<IabCompetencyRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!selectedStaffId && userAccount.staffId) {
      setSelectedStaffId(userAccount.staffId);
    }
  }, [userAccount.staffId, selectedStaffId]);

  const activeProfile = profiles.find((p) => p.staffId === selectedStaffId);
  const isOwnRecord = selectedStaffId === userAccount.staffId;
  const canEdit = userAccount.isAdmin || isOwnRecord;

  useEffect(() => {
    if (!selectedStaffId) return;
    let cancelled = false;
    setLoading(true);
    getIabCompetency(selectedStaffId)
      .then((res) => {
        if (!cancelled) setRecord(res);
      })
      .catch(() => {
        if (!cancelled) setRecord(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedStaffId]);

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#0B1F3B] text-[#F5D076] flex items-center justify-center shrink-0">
            <Award className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-extrabold text-[#0B1F3B]">Kompetensi IAB</h1>
            <p className="text-xs text-slate-500 mt-1">
              Pengurusan pensijilan kejurulatihan, latihan, penilaian, perundingan serta penggubalan modul IAB.
            </p>
          </div>
        </div>

        {canSwitchStaff && profiles.length > 0 && (
          <div className="flex items-center gap-2 min-w-[260px]">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <select
              value={selectedStaffId}
              onChange={(e) => setSelectedStaffId(e.target.value)}
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
          <p className="text-xs text-slate-500">Memuatkan rekod Kompetensi IAB...</p>
        </div>
      ) : (
        <KompetensiIabSection
          staffId={selectedStaffId || userAccount.staffId}
          uid={isOwnRecord ? userAccount.uid : activeProfile?.uid || ''}
          centerId={activeProfile?.centerId || userAccount.centerId}
          departmentId={activeProfile?.departmentId || userAccount.departmentId}
          staffName={activeProfile?.fullName || userAccount.displayName}
          record={record}
          canEdit={canEdit}
          isAdmin={userAccount.isAdmin}
          sysSettings={sysSettings}
          onRecordSaved={(next) => setRecord(next)}
          onSystemSettingsUpdated={onSystemSettingsUpdated}
        />
      )}
    </div>
  );
};
