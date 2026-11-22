import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LanguageProvider } from './context/LanguageContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import { LandingPage } from './pages/LandingPage';
import { PortalLoginPage } from './pages/PortalLoginPage';
import { PortalLayout, type PatientRoute, type PharmacistRoute } from './components/PortalLayout';
import { PatientDashboardPage } from './pages/patient/PatientDashboardPage';
import { MedicineScannerPage } from './pages/patient/MedicineScannerPage';
import { PrescriptionTrackerPage } from './pages/patient/PrescriptionTrackerPage';
import { SafetyRecallsPage } from './pages/patient/SafetyRecallsPage';
import { PatientSettingsPage } from './pages/patient/PatientSettingsPage';
import { DocumentVerificationPage } from './pages/shared/DocumentVerificationPage';
import { AiAssistantPage } from './pages/shared/AiAssistantPage';
import { PharmacyDashboardPage } from './pages/pharmacist/PharmacyDashboardPage';
import { InventoryManagementPage } from './pages/pharmacist/InventoryManagementPage';
import { BatchTraceabilityPage } from './pages/pharmacist/BatchTraceabilityPage';
import { VerificationReviewPage } from './pages/pharmacist/VerificationReviewPage';
import { AlertsReportsPage } from './pages/pharmacist/AlertsReportsPage';
import { AdminConsolePage } from './pages/pharmacist/AdminConsolePage';
import type { PortalRole } from './types';

type AppRoute =
  | { view: 'landing' }
  | { view: 'login'; role: PortalRole }
  | { view: 'patient'; page: PatientRoute }
  | { view: 'pharmacist'; page: PharmacistRoute };

const PATIENT_PAGES: PatientRoute[] = [
  'dashboard',
  'scanner',
  'prescriptions',
  'documents',
  'assistant',
  'alerts',
  'settings',
];

const PHARMACIST_PAGES: PharmacistRoute[] = [
  'dashboard',
  'inventory',
  'traceability',
  'review',
  'documents',
  'assistant',
  'reports',
  'admin',
];

function parsePathname(pathname: string): AppRoute {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/login/patient') return { view: 'login', role: 'patient' };
  if (clean === '/login/pharmacist') return { view: 'login', role: 'pharmacist' };

  if (clean.startsWith('/patient')) {
    const seg = clean.split('/')[2] as PatientRoute | undefined;
    return {
      view: 'patient',
      page: seg && PATIENT_PAGES.includes(seg) ? seg : 'dashboard',
    };
  }

  if (clean.startsWith('/pharmacist')) {
    const seg = clean.split('/')[2] as PharmacistRoute | undefined;
    return {
      view: 'pharmacist',
      page: seg && PHARMACIST_PAGES.includes(seg) ? seg : 'dashboard',
    };
  }

  return { view: 'landing' };
}

function routeToPath(route: AppRoute): string {
  if (route.view === 'landing') return '/';
  if (route.view === 'login') return `/login/${route.role}`;
  return `/${route.view}/${route.page}`;
}

function MediTrustRouter() {
  const { user, profile, authReady, profileLoading } = useAuth();
  const [route, setRoute] = useState<AppRoute>(() => parsePathname(window.location.pathname));

  const navigate = useCallback((next: AppRoute) => {
    const targetPath = routeToPath(next);
    if (window.location.pathname !== targetPath) {
      window.history.pushState({}, '', targetPath);
    }
    setRoute(next);
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(parsePathname(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Guard protected routes cleanly when signed out or profile incomplete
  if ((route.view === 'patient' || route.view === 'pharmacist') && (!authReady || profileLoading)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center">
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <RefreshCw className="w-4 h-4 animate-spin text-[#0D7377]" />
          <span>Verifying secure workspace session...</span>
        </div>
      </div>
    );
  }

  if (route.view === 'landing') {
    return (
      <LandingPage
        signedInRole={user && profile ? profile.portalRole : null}
        onNavigateLogin={(role) => navigate({ view: 'login', role })}
        onEnterWorkspace={() => {
          if (profile?.portalRole === 'pharmacist') {
            navigate({ view: 'pharmacist', page: 'dashboard' });
          } else {
            navigate({ view: 'patient', page: 'dashboard' });
          }
        }}
      />
    );
  }

  if (route.view === 'login') {
    return (
      <PortalLoginPage
        role={route.role}
        onBackHome={() => navigate({ view: 'landing' })}
        onSwitchRole={(nextRole) => navigate({ view: 'login', role: nextRole })}
        onSuccess={(role) =>
          navigate(
            role === 'pharmacist'
              ? { view: 'pharmacist', page: 'dashboard' }
              : { view: 'patient', page: 'dashboard' }
          )
        }
      />
    );
  }

  // If unauthenticated or profile incomplete on a protected workspace route, show dedicated role login
  if (!user || !profile || !profile.consentAccepted) {
    return (
      <PortalLoginPage
        role={route.view}
        onBackHome={() => navigate({ view: 'landing' })}
        onSwitchRole={(nextRole) => navigate({ view: 'login', role: nextRole })}
        onSuccess={(role) =>
          navigate(
            role === 'pharmacist'
              ? { view: 'pharmacist', page: 'dashboard' }
              : { view: 'patient', page: 'dashboard' }
          )
        }
      />
    );
  }

  if (route.view === 'pharmacist' && (!profile.pharmacyName || !profile.licenseNumber)) {
    return (
      <PortalLoginPage
        role="pharmacist"
        onBackHome={() => navigate({ view: 'landing' })}
        onSwitchRole={(nextRole) => navigate({ view: 'login', role: nextRole })}
        onSuccess={(role) =>
          navigate(
            role === 'pharmacist'
              ? { view: 'pharmacist', page: 'dashboard' }
              : { view: 'patient', page: 'dashboard' }
          )
        }
      />
    );
  }

  if (route.view === 'patient') {
    return (
      <PortalLayout
        role="patient"
        activePage={route.page}
        onNavigate={(page) => navigate({ view: 'patient', page: page as PatientRoute })}
        onSwitchPortal={(target) => navigate({ view: 'login', role: target })}
        onGoHome={() => navigate({ view: 'landing' })}
      >
        {route.page === 'dashboard' && (
          <PatientDashboardPage
            onNavigate={(page) => navigate({ view: 'patient', page: page as PatientRoute })}
          />
        )}
        {route.page === 'scanner' && (
          <MedicineScannerPage
            portalRole="patient"
            onOpenAssistant={() => navigate({ view: 'patient', page: 'assistant' })}
          />
        )}
        {route.page === 'prescriptions' && <PrescriptionTrackerPage />}
        {route.page === 'documents' && <DocumentVerificationPage portalRole="patient" />}
        {route.page === 'assistant' && <AiAssistantPage portalRole="patient" />}
        {route.page === 'alerts' && <SafetyRecallsPage />}
        {route.page === 'settings' && <PatientSettingsPage />}
      </PortalLayout>
    );
  }

  return (
    <PortalLayout
      role="pharmacist"
      activePage={route.page}
      onNavigate={(page) => navigate({ view: 'pharmacist', page: page as PharmacistRoute })}
      onSwitchPortal={(target) => navigate({ view: 'login', role: target })}
      onGoHome={() => navigate({ view: 'landing' })}
    >
      {route.page === 'dashboard' && (
        <PharmacyDashboardPage
          onNavigate={(page) => navigate({ view: 'pharmacist', page: page as PharmacistRoute })}
        />
      )}
      {route.page === 'inventory' && <InventoryManagementPage />}
      {route.page === 'traceability' && <BatchTraceabilityPage />}
      {route.page === 'review' && (
        <VerificationReviewPage
          onOpenAssistant={() => navigate({ view: 'pharmacist', page: 'assistant' })}
        />
      )}
      {route.page === 'documents' && <DocumentVerificationPage portalRole="pharmacist" />}
      {route.page === 'assistant' && <AiAssistantPage portalRole="pharmacist" />}
      {route.page === 'reports' && <AlertsReportsPage />}
      {route.page === 'admin' && <AdminConsolePage />}
    </PortalLayout>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <LanguageProvider>
        <AuthProvider>
          <MediTrustRouter />
        </AuthProvider>
      </LanguageProvider>
    </ErrorBoundary>
  );
}
