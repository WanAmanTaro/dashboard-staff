import React from 'react';
import {
  ArrowRight,
  Award,
  BarChart3,
  FileText,
  Lock,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { IabCrest } from '../components/IabCrest';

interface WelcomePageProps {
  onGoToLogin: () => void;
}

export const WelcomePage: React.FC<WelcomePageProps> = ({ onGoToLogin }) => {
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* 3-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200 px-6 lg:px-10 h-16 flex items-center justify-between gap-8">
        <a
          href="#utama"
          className="text-base sm:text-lg font-bold tracking-tight text-[#0B1F3B] whitespace-nowrap shrink-0 flex items-center gap-2.5"
        >
          <IabCrest className="w-8 h-8 shrink-0" />
          <span>Modal Insan IAB</span>
        </a>

        <nav className="hidden md:flex items-center gap-7 text-sm font-medium text-slate-600">
          <a href="#pengenalan" className="hover:text-[#0B1F3B] transition-colors whitespace-nowrap shrink-0">
            Pengenalan
          </a>
          <a href="#keupayaan" className="hover:text-[#0B1F3B] transition-colors whitespace-nowrap shrink-0">
            Keupayaan
          </a>
          <a href="#tadbir-urus" className="hover:text-[#0B1F3B] transition-colors whitespace-nowrap shrink-0">
            Tadbir Urus
          </a>
          <a href="#keselamatan" className="hover:text-[#0B1F3B] transition-colors whitespace-nowrap shrink-0">
            Keselamatan
          </a>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={onGoToLogin}
            className="px-4 py-2 text-xs sm:text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg transition-colors whitespace-nowrap shrink-0"
          >
            Log Masuk
          </button>
        </div>
      </header>

      {/* Hero Section */}
      <main className="flex-1">
        <section id="pengenalan" className="bg-[#0B1F3B] text-white border-b-4 border-[#C69738]">
          <div className="max-w-6xl mx-auto px-6 lg:px-10 py-16 lg:py-24 grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7 space-y-6">
              <p className="text-xs font-semibold tracking-wider text-[#F5D076] uppercase">
                Institut Aminuddin Baki · Kementerian Pendidikan Malaysia
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold leading-tight tracking-tight text-white text-balance">
                Sistem Pengurusan Modal Insan dan Kepakaran IAB
              </h1>
              <p className="text-base text-slate-300 leading-relaxed max-w-2xl">
                Platform pangkalan data berpusat rasmi untuk mengurus biodata pegawai, maklumat perkhidmatan,
                kelayakan akademik, kepakaran instruksional, kompetensi digital dan kecerdasan buatan (AI),
                penerbitan serta analisis kapasiti organisasi secara bersepadu.
              </p>
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <button
                  type="button"
                  onClick={onGoToLogin}
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-bold text-[#0B1F3B] bg-[#C69738] hover:bg-[#d7a846] rounded-lg transition-colors whitespace-nowrap"
                >
                  Log Masuk Portal Rasmi
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Institutional Architecture Card (No PII exposed) */}
            <div className="lg:col-span-5 bg-[#14325C] border border-[#C69738]/35 rounded-xl p-6 sm:p-7 space-y-5">
              <div className="flex items-center gap-3 pb-4 border-b border-white/10">
                <IabCrest className="w-11 h-11 shrink-0" />
                <div>
                  <h2 className="text-sm font-bold text-white">Ringkasan Tadbir Urus Dalaman</h2>
                  <p className="text-xs text-slate-300">Paparan umum tanpa pendedahan data peribadi</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3.5 rounded-lg bg-[#0B1F3B]/70 border border-white/10">
                  <p className="text-xs text-slate-300">Tahap Kawalan Akses</p>
                  <p className="text-xl font-bold text-[#F5D076] font-mono-tabular mt-1">6 Peranan</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">RBAC L0 hingga L5</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[#0B1F3B]/70 border border-white/10">
                  <p className="text-xs text-slate-300">Bahagian Biodata</p>
                  <p className="text-xl font-bold text-[#F5D076] font-mono-tabular mt-1">10 Modul</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Seksyen A hingga J</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[#0B1F3B]/70 border border-white/10">
                  <p className="text-xs text-slate-300">Storan Dokumen</p>
                  <p className="text-xl font-bold text-white font-mono-tabular mt-1">7 Folder</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Drive Terkawal IAB</p>
                </div>
                <div className="p-3.5 rounded-lg bg-[#0B1F3B]/70 border border-white/10">
                  <p className="text-xs text-slate-300">Kompetensi Digital & AI</p>
                  <p className="text-xl font-bold text-white font-mono-tabular mt-1">20 Bidang</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">Aplikasi & Pengetahuan AI</p>
                </div>
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-300 pt-1">
                <Lock className="w-3.5 h-3.5 text-[#C69738] shrink-0" />
                <span>Biodata, gambar dan sijil pegawai hanya boleh diakses selepas log masuk yang disahkan.</span>
              </div>
            </div>
          </div>
        </section>

        {/* Core Capabilities */}
        <section id="keupayaan" className="max-w-6xl mx-auto px-6 lg:px-10 py-14 lg:py-16">
          <div className="max-w-2xl mb-10">
            <h2 className="text-2xl font-bold text-[#0B1F3B]">Keupayaan Utama Platform</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Dibangunkan khusus bagi menyokong pengurusan bakat, pencarian pakar rujuk, dan perancangan strategik IAB.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[
              {
                icon: Users,
                title: 'Profil Pegawai Berstruktur',
                desc: 'Pengurusan lengkap maklumat peribadi, perkhidmatan, organisasi, kelayakan akademik, pengalaman serta penerbitan dengan indikator kelengkapan masa nyata.',
              },
              {
                icon: Award,
                title: 'Direktori Kepakaran & AI',
                desc: 'Pencarian berbilang kriteria bagi mengenal pasti pensyarah, fasilitator, penceramah, jurulatih dan pakar kompetensi digital serta GenAI.',
              },
              {
                icon: BarChart3,
                title: 'Dashboard Pusat & Jabatan',
                desc: 'Visualisasi KPI, taburan gred, kelayakan, dan jurang kapasiti mengikut skop kuasa Ketua Pusat (L1) dan Ketua Jabatan (L2).',
              },
              {
                icon: FileText,
                title: 'Penjanaan Profil PDF Rasmi',
                desc: 'Menjana Profil Ringkas dan Profil Lengkap secara automatik daripada rekod sebenar pangkalan data dengan kawalan versi.',
              },
              {
                icon: ShieldCheck,
                title: 'Kawalan Akses & Jejak Audit',
                desc: 'Pengesahan identiti Firebase, kelulusan akaun oleh Pentadbir Sistem, pemisahan PII dan rekod audit kekal.',
              },
              {
                icon: Lock,
                title: 'Storan Berpusat Google Drive',
                desc: 'Penyimpanan gambar asal, gambar paparan 1:1 dan sijil pegawai dalam storan berpusat pemilik storan tanpa akses awam.',
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="bg-white border border-slate-200 rounded-xl p-6 space-y-3"
                >
                  <div className="w-10 h-10 rounded-lg bg-[#0B1F3B]/5 text-[#0B1F3B] flex items-center justify-center">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-base font-bold text-[#0B1F3B]">{item.title}</h3>
                  <p className="text-sm text-slate-600 leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Governance & Security Notice */}
        <section id="tadbir-urus" className="bg-white border-t border-slate-200">
          <div id="keselamatan" className="max-w-6xl mx-auto px-6 lg:px-10 py-12 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
            <div className="max-w-2xl space-y-2">
              <h2 className="text-lg font-bold text-[#0B1F3B]">Akses Terkawal Warga IAB</h2>
              <p className="text-sm text-slate-600 leading-relaxed">
                Setiap akaun baharu memerlukan pendaftaran atau kelulusan Pentadbir Sistem (Admin) sebelum
                kebenaran membaca atau mengemas kini rekod organisasi diberikan.
              </p>
            </div>
            <button
              type="button"
              onClick={onGoToLogin}
              className="px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg transition-colors whitespace-nowrap shrink-0"
            >
              Teruskan ke Log Masuk
            </button>
          </div>
        </section>
      </main>

      <footer className="bg-[#0B1F3B] text-slate-400 text-xs py-5 px-6 lg:px-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>© {new Date().getFullYear()} Institut Aminuddin Baki (IAB), Kementerian Pendidikan Malaysia</span>
          <span>Sistem Pengurusan Modal Insan dan Kepakaran</span>
        </div>
      </footer>
    </div>
  );
};
