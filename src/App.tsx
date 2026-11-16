/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './auth/AuthContext';
import { ClinicDataProvider } from './hooks/useClinicData';
import { ErrorBoundary } from './components/ErrorBoundary';
import { AppShell } from './components/AppShell';
import { InstitutionalLockup } from './components/BrandIdentity';
import { InteractiveTour, TOUR_STORAGE_KEY } from './components/InteractiveTour';
import { InitialSetupPage } from './pages/InitialSetupPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { PatientsPage } from './pages/PatientsPage';
import { ScreeningPage } from './pages/ScreeningPage';
import { SchedulePage } from './pages/SchedulePage';
import { MedicalRecordsPage } from './pages/MedicalRecordsPage';
import { OdontogramPage } from './pages/OdontogramPage';
import { ReferralsPage } from './pages/ReferralsPage';
import { AcademicDirectoryPage } from './pages/AcademicDirectoryPage';
import { ReportsPage } from './pages/ReportsPage';
import { SystemAdminPage } from './pages/SystemAdminPage';
import { HelpCenterPage } from './pages/HelpCenterPage';
import { NavigationTab } from './types';
import { canUserAccessTab } from './utils/validation';

const MainRouter: React.FC = () => {
  const { systemUser, initializing, bootstrapStatus, permissionsMatrix } = useAuth();
  const [activeTab, setActiveTab] = useState<NavigationTab>('dashboard');
  const [tourOpen, setTourOpen] = useState<boolean>(false);
  const [showInitialSetup, setShowInitialSetup] = useState<boolean>(false);

  useEffect(() => {
    if (!bootstrapStatus.hasAdmin) {
      setShowInitialSetup(true);
    }
  }, [bootstrapStatus.hasAdmin]);

  // Ensure activeTab is always permitted when user switches RBAC profile
  useEffect(() => {
    if (systemUser && !canUserAccessTab(systemUser.role, activeTab, permissionsMatrix)) {
      setActiveTab('dashboard');
    }
  }, [systemUser, activeTab, permissionsMatrix]);

  // First-time onboarding tour (Section 13)
  useEffect(() => {
    if (systemUser && !initializing) {
      const completed = localStorage.getItem(TOUR_STORAGE_KEY);
      if (completed !== 'true') {
        setTourOpen(true);
      }
    }
  }, [systemUser, initializing]);

  // Section 3: During session verification show ONLY "Verificando acesso..." on a clean screen
  if (initializing) {
    return (
      <div className="min-h-screen bg-[#F1F5F9] flex items-center justify-center p-6">
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center max-w-sm w-full space-y-4">
          <div className="flex justify-center">
            <InstitutionalLockup size="md" />
          </div>
          <div className="w-6 h-6 border-2 border-[#00AEEF] border-t-transparent rounded-full animate-spin mx-auto" />
          <div className="text-sm font-medium text-[#003366]">Verificando acesso...</div>
        </div>
      </div>
    );
  }

  if (!systemUser) {
    if (!bootstrapStatus.hasAdmin || showInitialSetup) {
      return (
        <InitialSetupPage
          onSetupSuccess={() => setShowInitialSetup(false)}
          onGoToLogin={() => setShowInitialSetup(false)}
        />
      );
    }
    return <LoginPage onGoToSetup={() => setShowInitialSetup(true)} />;
  }

  return (
    <ClinicDataProvider>
      <AppShell
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        onStartTour={() => setTourOpen(true)}
      >
        {activeTab === 'dashboard' && <DashboardPage onNavigate={setActiveTab} />}
        {activeTab === 'patients' && <PatientsPage />}
        {activeTab === 'screening' && <ScreeningPage />}
        {activeTab === 'schedule' && <SchedulePage />}
        {activeTab === 'medical_records' && <MedicalRecordsPage />}
        {activeTab === 'odontogram' && <OdontogramPage />}
        {activeTab === 'referrals' && <ReferralsPage />}
        {activeTab === 'students' && <AcademicDirectoryPage mode="students" />}
        {activeTab === 'professors' && <AcademicDirectoryPage mode="professors" />}
        {activeTab === 'clinics_specialties' && (
          <AcademicDirectoryPage mode="clinics_specialties" />
        )}
        {activeTab === 'reports' && <ReportsPage />}
        {activeTab === 'users' && <SystemAdminPage mode="users" />}
        {activeTab === 'settings' && <SystemAdminPage mode="settings" />}
        {activeTab === 'audit' && <SystemAdminPage mode="audit" />}
        {activeTab === 'help' && (
          <HelpCenterPage onNavigate={setActiveTab} onStartTour={() => setTourOpen(true)} />
        )}

        <InteractiveTour
          open={tourOpen}
          onClose={() => setTourOpen(false)}
          onNavigate={setActiveTab}
        />
      </AppShell>
    </ClinicDataProvider>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <MainRouter />
      </AuthProvider>
    </ErrorBoundary>
  );
}
