import React, { useState } from 'react';
import {
  Award,
  BarChart3,
  Building2,
  FileText,
  LayoutDashboard,
  LogOut,
  Menu,
  ShieldCheck,
  TrendingUp,
  UserCircle2,
  Users,
  X,
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { ROLE_SHORT_LABELS } from '../lib/constants';
import type { AppRoute } from '../types/iab';
import { IabCrest } from './IabCrest';

interface LayoutShellProps {
  activeRoute: AppRoute;
  onNavigate: (route: AppRoute) => void;
  children: React.ReactNode;
}

interface NavItem {
  id: AppRoute;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  visible: boolean;
}

const ROUTE_TITLES: Record<AppRoute, string> = {
  welcome: 'Laman Utama',
  login: 'Log Masuk',
  profile: 'Profil Pegawai',
  'kompetensi-iab': 'Kompetensi IAB',
  'center-dashboard': 'Dashboard Pusat',
  'department-dashboard': 'Dashboard Jabatan',
  'expertise-directory': 'Direktori Kepakaran',
  'professional-pdf': 'Profil Profesional',
  'capacity-analysis': 'Analisis Kapasiti Kepakaran',
  admin: 'Pentadbiran Sistem',
};

export const LayoutShell: React.FC<LayoutShellProps> = ({
  activeRoute,
  onNavigate,
  children,
}) => {
  const { userAccount, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  if (!userAccount) return null;

  const isAdmin = userAccount.isAdmin;
  const role = userAccount.role;

  const allNavItems: NavItem[] = [
    {
      id: 'profile',
      label: 'Profil Pegawai',
      icon: UserCircle2,
      visible: true,
    },
    {
      id: 'kompetensi-iab',
      label: 'Kompetensi IAB',
      icon: Award,
      visible: true,
    },
    {
      id: 'center-dashboard',
      label: 'Dashboard Pusat',
      icon: LayoutDashboard,
      visible: isAdmin || role === 'L1',
    },
    {
      id: 'department-dashboard',
      label: 'Dashboard Jabatan',
      icon: Building2,
      visible: isAdmin || role === 'L1' || role === 'L2',
    },
    {
      id: 'expertise-directory',
      label: 'Direktori Kepakaran',
      icon: Users,
      visible: isAdmin || role === 'L1' || role === 'L2' || role === 'L3' || role === 'L4',
    },
    {
      id: 'professional-pdf',
      label: 'Profil Profesional',
      icon: FileText,
      visible: true,
    },
    {
      id: 'capacity-analysis',
      label: 'Analisis Kapasiti Kepakaran',
      icon: TrendingUp,
      visible: isAdmin || role === 'L1' || role === 'L2',
    },
    {
      id: 'admin',
      label: 'Pentadbiran Sistem',
      icon: ShieldCheck,
      visible: isAdmin,
    },
  ];
  const navItems: NavItem[] = allNavItems.filter((item) => item.visible);

  const handleNav = (id: AppRoute) => {
    onNavigate(id);
    setMobileOpen(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:flex-col lg:w-[264px] lg:fixed lg:inset-y-0 bg-[#0B1F3B] text-white border-r border-[#14325C] z-30">
        <div className="px-5 py-5 border-b border-white/10 flex items-center gap-3">
          <IabCrest className="w-9 h-9 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold tracking-tight text-white truncate">
              Portal Modal Insan
            </p>
            <p className="text-xs text-[#F5D076] truncate">
              Institut Aminuddin Baki
            </p>
          </div>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto" aria-label="Navigasi utama">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeRoute === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => handleNav(item.id)}
                className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                  active
                    ? 'bg-[#14325C] text-[#F5D076] border border-[#C69738]/40'
                    : 'text-slate-300 hover:bg-white/5 hover:text-white'
                }`}
              >
                <Icon className={`w-4 h-4 shrink-0 ${active ? 'text-[#C69738]' : 'text-slate-400'}`} />
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 bg-[#08172D]">
          <div className="mb-3">
            <p className="text-xs font-semibold text-white truncate">{userAccount.displayName}</p>
            <p className="text-xs text-slate-400 truncate">
              {ROLE_SHORT_LABELS[userAccount.role]}
              {userAccount.isAdmin ? ' · Admin' : ''}
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium text-slate-200 bg-white/5 hover:bg-red-900/50 hover:text-white rounded-lg border border-white/10 transition-colors"
          >
            <LogOut className="w-3.5 h-3.5" />
            Log Keluar
          </button>
        </div>
      </aside>

      {/* Mobile Drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/60"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative w-72 max-w-[85vw] bg-[#0B1F3B] text-white flex flex-col h-full z-10">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <IabCrest className="w-8 h-8" />
                <span className="text-sm font-bold text-white">Modal Insan IAB</span>
              </div>
              <button
                type="button"
                onClick={() => setMobileOpen(false)}
                className="p-1.5 text-slate-300 hover:text-white"
                aria-label="Tutup menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = activeRoute === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleNav(item.id)}
                    className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors text-left ${
                      active
                        ? 'bg-[#14325C] text-[#F5D076] border border-[#C69738]/40'
                        : 'text-slate-300 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    <Icon className="w-4 h-4 shrink-0" />
                    <span className="truncate">{item.label}</span>
                  </button>
                );
              })}
            </nav>
            <div className="p-4 border-t border-white/10">
              <button
                type="button"
                onClick={() => logout()}
                className="w-full flex items-center justify-center gap-2 px-3 py-2.5 text-xs font-medium text-white bg-white/10 rounded-lg"
              >
                <LogOut className="w-4 h-4" />
                Log Keluar
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-[264px] flex flex-col min-w-0">
        <header className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileOpen(true)}
              className="lg:hidden p-2 -ml-2 text-slate-600 hover:text-[#0B1F3B] rounded-lg"
              aria-label="Buka menu navigasi"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm min-w-0">
              <span className="hidden sm:inline text-slate-500 whitespace-nowrap">
                Sistem Pengurusan Modal Insan IAB
              </span>
              <span className="hidden sm:inline text-slate-300">/</span>
              <h1 className="font-bold text-[#0B1F3B] truncate">
                {ROUTE_TITLES[activeRoute]}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-4 shrink-0">
            <div className="hidden md:flex items-center gap-2 text-xs text-slate-600">
              <BarChart3 className="w-3.5 h-3.5 text-[#C69738]" />
              <span className="font-mono-tabular">{userAccount.staffId || 'IAB'}</span>
              <span aria-hidden="true">·</span>
              <span>{ROLE_SHORT_LABELS[userAccount.role]}</span>
            </div>
            <button
              type="button"
              onClick={() => handleNav('profile')}
              className="px-3.5 py-2 text-xs font-semibold text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Profil Saya
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
