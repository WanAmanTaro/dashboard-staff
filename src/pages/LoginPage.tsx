import React, { useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  KeyRound,
  Link2,
  Lock,
  LogOut,
  Mail,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { IabCrest } from '../components/IabCrest';
import { useToast } from '../components/Toast';
import { useAuth } from '../contexts/AuthContext';

interface LoginPageProps {
  onBackToWelcome: () => void;
}

type LoginTab = 'login' | 'register' | 'forgot';

export const LoginPage: React.FC<LoginPageProps> = ({ onBackToWelcome }) => {
  const { showToast } = useToast();
  const {
    firebaseUser,
    userAccount,
    authError,
    pendingLink,
    clearAuthError,
    clearPendingLink,
    loginWithGoogle,
    loginWithEmail,
    registerWithEmail,
    completeAccountLinkWithPassword,
    sendResetPassword,
    resendVerificationEmail,
    refreshAuthUser,
    logout,
  } = useAuth();

  const [tab, setTab] = useState<LoginTab>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [linkPassword, setLinkPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await loginWithEmail(email, password);
    } catch {
      // Handled by authError
    } finally {
      setBusy(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await registerWithEmail(email, password, fullName);
      showToast(
        'success',
        'Pendaftaran dihantar. Sila semak emel anda untuk pengesahan dan tunggu kelulusan Admin.'
      );
    } catch {
      // Handled by authError
    } finally {
      setBusy(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setBusy(true);
    try {
      await sendResetPassword(email);
      showToast('success', 'Pautan tetapan semula kata laluan telah dihantar ke emel anda.');
      setTab('login');
    } catch {
      // Handled by authError
    } finally {
      setBusy(false);
    }
  };

  const handleCompleteLink = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await completeAccountLinkWithPassword(linkPassword);
      showToast('success', 'Akaun Google dan Emel/Kata Laluan berjaya dipautkan secara selamat.');
      setLinkPassword('');
    } catch {
      // Handled by authError
    } finally {
      setBusy(false);
    }
  };

  // Screen 1: Logged in with Email/Password but email not verified yet
  if (firebaseUser && !firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-7 shadow-sm space-y-5">
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
            <Mail className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3B]">Pengesahan Emel Diperlukan</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Pautan pengesahan telah dihantar ke <strong className="text-slate-900">{firebaseUser.email}</strong>.
              Sila klik pautan tersebut sebelum meneruskan akses ke sistem.
            </p>
          </div>
          {authError && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
              {authError}
            </div>
          )}
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={async () => {
                setBusy(true);
                await refreshAuthUser();
                setBusy(false);
              }}
              disabled={busy}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Saya Telah Sahkan Emel (Semak Semula)
            </button>
            <button
              type="button"
              onClick={async () => {
                await resendVerificationEmail();
                showToast('success', 'Emel pengesahan baharu telah dihantar.');
              }}
              className="w-full px-4 py-2.5 text-sm font-medium text-[#0B1F3B] bg-slate-100 hover:bg-slate-200 rounded-lg"
            >
              Hantar Semula Emel Pengesahan
            </button>
            <button
              type="button"
              onClick={() => logout()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium text-slate-600 hover:text-red-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Log Keluar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Verified Firebase user, awaiting Admin approval OR suspended/inactive
  if (firebaseUser && userAccount && userAccount.status !== 'active') {
    const isPending = userAccount.status === 'pending';
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-lg w-full bg-white border border-slate-200 rounded-xl p-8 shadow-sm space-y-5">
          <div
            className={`w-12 h-12 rounded-lg flex items-center justify-center ${
              isPending ? 'bg-amber-50 text-amber-700' : 'bg-red-50 text-red-700'
            }`}
          >
            {isPending ? <Clock className="w-6 h-6" /> : <ShieldAlert className="w-6 h-6" />}
          </div>
          <div>
            <h2 className="text-xl font-bold text-[#0B1F3B]">
              {isPending
                ? 'Akaun Menunggu Kelulusan Pentadbir'
                : 'Akaun Tidak Aktif atau Digantung'}
            </h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              {isPending
                ? `Akaun anda (${userAccount.email}) telah berjaya disahkan, namun pendaftaran baharu tidak diberikan akses automatik ke data organisasi. Sila hubungi Pentadbir Sistem IAB untuk meluluskan peranan (Role) dan jabatan anda.`
                : `Akaun anda (${userAccount.email}) kini berstatus "${userAccount.status}". Sila hubungi Pentadbir Sistem IAB untuk pengaktifan semula.`}
            </p>
          </div>
          <div className="p-4 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600 space-y-1">
            <p>
              <span className="font-semibold text-slate-800">UID Firebase:</span>{' '}
              <span className="font-mono-tabular">{userAccount.uid}</span>
            </p>
            <p>
              <span className="font-semibold text-slate-800">ID Staf Sementara:</span>{' '}
              <span className="font-mono-tabular">{userAccount.staffId || '-'}</span>
            </p>
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
          >
            <LogOut className="w-4 h-4" />
            Log Keluar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col lg:flex-row">
      {/* Left Institutional Brand Panel */}
      <div className="lg:w-[44%] bg-[#0B1F3B] text-white p-8 lg:p-14 flex flex-col justify-between border-b-4 lg:border-b-0 lg:border-r-4 border-[#C69738]">
        <div>
          <button
            type="button"
            onClick={onBackToWelcome}
            className="inline-flex items-center gap-2 text-xs font-medium text-slate-300 hover:text-white mb-10"
          >
            <ArrowLeft className="w-4 h-4" />
            Kembali ke Laman Utama
          </button>

          <div className="flex items-center gap-3.5 mb-8">
            <IabCrest className="w-12 h-12 shrink-0" />
            <div>
              <p className="text-xs font-semibold text-[#F5D076] uppercase tracking-wider">
                Institut Aminuddin Baki
              </p>
              <p className="text-sm text-slate-300">Kementerian Pendidikan Malaysia</p>
            </div>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight text-white mb-4">
            Portal Pengurusan Modal Insan dan Kepakaran
          </h1>
          <p className="text-sm text-slate-300 leading-relaxed max-w-md">
            Log masuk menggunakan akaun Google rasmi atau emel yang telah diluluskan oleh Pentadbir Sistem IAB.
          </p>
        </div>

        <div className="mt-10 pt-6 border-t border-white/10 space-y-2.5 text-xs text-slate-300">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#C69738] shrink-0" />
            <span>Pemautan akaun selamat berasaskan Firebase UID</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#C69738] shrink-0" />
            <span>Kawalan akses mengikut tahap peranan (L0–L5 & Admin)</span>
          </div>
        </div>
      </div>

      {/* Right Authentication Form Panel */}
      <div className="flex-1 flex items-center justify-center p-6 sm:p-10 lg:p-14">
        <div className="max-w-md w-full bg-white border border-slate-200 rounded-xl p-7 sm:p-8 shadow-sm space-y-6">
          {pendingLink ? (
            <form onSubmit={handleCompleteLink} className="space-y-4">
              <div className="w-11 h-11 rounded-lg bg-[#0B1F3B]/10 text-[#0B1F3B] flex items-center justify-center">
                <Link2 className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-[#0B1F3B]">Pautkan Akaun Google & Emel</h2>
              <p className="text-xs text-slate-600 leading-relaxed">{pendingLink.message}</p>
              {authError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800">
                  {authError}
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Laluan Akaun Sedia Ada</label>
                <input
                  type="password"
                  required
                  value={linkPassword}
                  onChange={(e) => setLinkPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                />
              </div>
              <div className="flex items-center gap-3 pt-2">
                <button
                  type="button"
                  onClick={clearPendingLink}
                  className="px-4 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 rounded-lg"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg"
                >
                  {busy ? 'Memautkan...' : 'Sahkan & Pautkan Akaun'}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold text-[#0B1F3B]">Log Masuk Sistem</h2>
                <p className="text-xs text-slate-500 mt-1">
                  Pilih kaedah pengesahan rasmi anda di bawah.
                </p>
              </div>

              {authError && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs text-red-800 leading-relaxed">
                  {authError}
                </div>
              )}

              {/* Google Sign-In */}
              <button
                type="button"
                onClick={() => {
                  clearAuthError();
                  loginWithGoogle();
                }}
                className="w-full flex items-center justify-center gap-3 px-4 py-2.5 text-sm font-semibold text-[#0B1F3B] bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    fill="#4285F4"
                    d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z"
                  />
                </svg>
                Log Masuk dengan Google
              </button>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-slate-200" />
                <span className="shrink mx-3 text-xs text-slate-400">atau Emel & Kata Laluan</span>
                <div className="flex-grow border-t border-slate-200" />
              </div>

              {/* Segmented Tabs */}
              <div className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg">
                {(
                  [
                    ['login', 'Log Masuk'],
                    ['register', 'Mohon Akaun'],
                    ['forgot', 'Lupa Kata Laluan'],
                  ] as const
                ).map(([k, label]) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => {
                      clearAuthError();
                      setTab(k);
                    }}
                    className={`py-1.5 px-2 text-xs font-semibold rounded-md transition-colors whitespace-nowrap ${
                      tab === k
                        ? 'bg-white text-[#0B1F3B] shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {tab === 'login' && (
                <form onSubmit={handleEmailLogin} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Emel Rasmi</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@iab.edu.my"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Laluan</label>
                    <input
                      type="password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    {busy ? 'Mengesahkan...' : 'Log Masuk'}
                  </button>
                </form>
              )}

              {tab === 'register' && (
                <form onSubmit={handleRegister} className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Permohonan akaun memerlukan pengesahan emel dan kelulusan Pentadbir Sistem sebelum akses diberikan.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Nama Penuh</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Dr. / En. / Pn. Nama Penuh"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Emel Rasmi</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="nama@iab.edu.my"
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Kata Laluan (Min. 6 aksara)</label>
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                  >
                    {busy ? 'Mendaftar...' : 'Hantar Permohonan Akaun'}
                  </button>
                </form>
              )}

              {tab === 'forgot' && (
                <form onSubmit={handleForgotPassword} className="space-y-4">
                  <p className="text-xs text-slate-500 leading-relaxed">
                    Masukkan alamat emel anda untuk menerima pautan tetapan semula kata laluan.
                  </p>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">Emel Berdaftar</label>
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      className="w-full px-3.5 py-2.5 text-sm border border-slate-300 rounded-lg focus:outline-none focus:border-[#0B1F3B]"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-white bg-[#0B1F3B] hover:bg-[#14325C] rounded-lg disabled:opacity-50"
                  >
                    <KeyRound className="w-4 h-4" />
                    {busy ? 'Menghantar...' : 'Hantar Pautan Tetapan Semula'}
                  </button>
                </form>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
