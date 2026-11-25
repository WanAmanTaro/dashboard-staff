import React, { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { IabCrest } from './components/IabCrest';
import { LayoutShell } from './components/LayoutShell';
import { ToastProvider } from './components/Toast';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { testConnection } from './lib/firebase';
import { AdminPage } from './pages/AdminPage';
import { CapacityAnalysisPage } from './pages/CapacityAnalysisPage';
import { CenterDashboardPage } from './pages/CenterDashboardPage';
import { DepartmentDashboardPage } from './pages/DepartmentDashboardPage';
import { ExpertiseDirectoryPage } from './pages/ExpertiseDirectoryPage';
import { LoginPage } from './pages/LoginPage';
import { ProfessionalProfilePdfPage } from './pages/ProfessionalProfilePdfPage';
import { StaffProfilePage } from './pages/StaffProfilePage';
import { WelcomePage } from './pages/WelcomePage';
import {
  subscribeDepartments,
  subscribeOrganizations,
  subscribeScopedStaffProfiles,
} from './services/firestoreService';
import type {
  AppRoute,
  Department,
  OrganizationCenter,
  StaffProfile,
  UserAccount,
} from './types/iab';

function getDefaultRouteForUser(account: UserAccount): AppRoute {
  if (account.isAdmin || account.role === 'L1') return 'center-dashboard';
  if (account.role === 'L2') return 'department-dashboard';
  return 'profile';
}

function canAccessRoute(route: AppRoute, account: UserAccount): boolean {
  if (account.isAdmin) return true;
  switch (route) {
    case 'profile':
    case 'professional-pdf':
      return true;
    case 'center-dashboard':
      return account.role === 'L1';
    case 'department-dashboard':
    case 'capacity-analysis':
      return account.role === 'L1' || account.role === 'L2';
    case 'expertise-directory':
      return account.role === 'L1' || account.role === 'L2' || account.role === 'L3' || account.role === 'L4';
    case 'admin':
      return false;
    default:
      return false;
  }
}

const AppContent: React.FC = () => {
  const { firebaseUser, userAccount, loading } = useAuth();
  const [publicView, setPublicView] = useState<'welcome' | 'login'>('welcome');
  const [activeRoute, setActiveRoute] = useState<AppRoute>('profile');
  const [hasInitializedRoute, setHasInitializedRoute] = useState(false);

  const [organizations, setOrganizations] = useState<OrganizationCenter[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [profiles, setProfiles] = useState<StaffProfile[]>([]);

  const [inspectStaffId, setInspectStaffId] = useState<string | null>(null);
  const [pdfStaffId, setPdfStaffId] = useState<string | null>(null);

  useEffect(() => {
    testConnection();
  }, []);

  useEffect(() => {
    if (!userAccount || userAccount.status !== 'active') {
      setOrganizations([]);
      setDepartments([]);
      setProfiles([]);
      setHasInitializedRoute(false);
      return;
    }

    if (!hasInitializedRoute) {
      setActiveRoute(getDefaultRouteForUser(userAccount));
      setHasInitializedRoute(true);
    }

    const unsubOrgs = subscribeOrganizations(setOrganizations);
    const unsubDepts = subscribeDepartments(setDepartments);
    const unsubProfiles = subscribeScopedStaffProfiles(userAccount, setProfiles);

    return () => {
      unsubOrgs();
      unsubDepts();
      unsubProfiles();
    };
  }, [userAccount?.uid, userAccount?.status, userAccount?.role, userAccount?.isAdmin, userAccount?.centerId, userAccount?.departmentId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 gap-4">
        <IabCrest className="w-14 h-14 animate-pulse" />
        <div className="text-center space-y-1">
          <p className="text-sm font-bold text-[#0B1F3B]">
            Sistem Pengurusan Modal Insan dan Kepakaran IAB
          </p>
          <p className="text-xs text-slate-500">Menyediakan sesi pengesahan dan pangkalan data...</p>
        </div>
      </div>
    );
  }

  // Unauthenticated, unverified email, or non-active account
  if (!firebaseUser || !firebaseUser.emailVerified || !userAccount || userAccount.status !== 'active') {
    if (firebaseUser || publicView === 'login') {
      return <LoginPage onBackToWelcome={() => setPublicView('welcome')} />;
    }
    return <WelcomePage onGoToLogin={() => setPublicView('login')} />;
  }

  const resolvedRoute: AppRoute = canAccessRoute(activeRoute, userAccount)
    ? activeRoute
    : getDefaultRouteForUser(userAccount);

  const handleNavigate = (route: AppRoute) => {
    if (route === 'profile') {
      setInspectStaffId(null);
    }
    if (canAccessRoute(route, userAccount)) {
      setActiveRoute(route);
    }
  };

  const handleInspectProfile = (staffId: string) => {
    setInspectStaffId(staffId);
    setActiveRoute('profile');
  };

  const handleGeneratePdfFor = (staffId: string) => {
    setPdfStaffId(staffId);
    setActiveRoute('professional-pdf');
  };

  return (
    <LayoutShell activeRoute={resolvedRoute} onNavigate={handleNavigate}>
      {resolvedRoute === 'profile' && (
        <StaffProfilePage
          targetStaffId={inspectStaffId}
          organizations={organizations}
          departments={departments}
          onClearTarget={() => setInspectStaffId(null)}
        />
      )}

      {resolvedRoute === 'center-dashboard' && (
        <CenterDashboardPage
          profiles={profiles}
          organizations={organizations}
          departments={departments}
          onInspectProfile={handleInspectProfile}
        />
      )}

      {resolvedRoute === 'department-dashboard' && (
        <DepartmentDashboardPage
          profiles={profiles}
          departments={departments}
          onInspectProfile={handleInspectProfile}
        />
      )}

      {resolvedRoute === 'expertise-directory' && (
        <ExpertiseDirectoryPage
          profiles={profiles}
          departments={departments}
          onInspectProfile={handleInspectProfile}
          onGeneratePdfFor={handleGeneratePdfFor}
        />
      )}

      {resolvedRoute === 'professional-pdf' && (
        <ProfessionalProfilePdfPage profiles={profiles} initialStaffId={pdfStaffId} />
      )}

      {resolvedRoute === 'capacity-analysis' && (
        <CapacityAnalysisPage profiles={profiles} departments={departments} />
      )}

      {resolvedRoute === 'admin' && (
        <AdminPage
          profiles={profiles}
          organizations={organizations}
          departments={departments}
          onInspectProfile={handleInspectProfile}
        />
      )}
    </LayoutShell>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <ToastProvider>
        <AuthProvider>
          <AppContent />
        </AuthProvider>
      </ToastProvider>
    </ErrorBoundary>
  );
}
