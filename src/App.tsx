import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { DashboardLayout } from './components/DashboardLayout';
import { YachtRaceManager } from './components/YachtRaceManager';
import { ModalProvider } from './contexts/ModalContext';
import { RaceEvent } from './types/race';
import { Login } from './components/auth/Login';
import { Register } from './components/auth/Register';
import { ForgotPassword } from './components/auth/ForgotPassword';
import { ResetPassword } from './components/auth/ResetPassword';
import { useAuth } from './contexts/AuthContext';
import { SubscriptionSelection } from './pages/SubscriptionSelection';
import { SubscriptionSuccess } from './pages/SubscriptionSuccess';
import { CreateOrganization } from './pages/CreateOrganization';
import { MinuteTakingPage } from './components/meetings/MinuteTakingPage';
import { YouTubeCallback } from './components/auth/YouTubeCallback';
import { NotificationSystem } from './components/NotificationSystem';
import { useNotifications } from './contexts/NotificationContext';
import { InvitationSignup } from './pages/InvitationSignup';
import { OnboardingRouter } from './components/onboarding/OnboardingRouter';
import { ApplicationPendingScreen } from './components/onboarding/ApplicationPendingScreen';
import { ClubSelfRegistration } from './components/auth/ClubSelfRegistration';
import { ClubApplicationPendingScreen } from './components/auth/ClubApplicationPendingScreen';
import { PublicClubHomepageNew } from './components/public/PublicClubHomepageNew';
import { PublicStateAssociationHomepage } from './components/public/PublicStateAssociationHomepage';
import { PublicNationalAssociationHomepage } from './components/public/PublicNationalAssociationHomepage';
import { PublicResultsPage } from './components/public/PublicResultsPage';
import { PublicResultsListPage } from './components/public/PublicResultsListPage';
import { PublicYachtClassesPage } from './components/public/PublicYachtClassesPage';
import { PublicRaceCalendarPage } from './components/public/PublicRaceCalendarPage';
import { PublicNewsPage } from './components/public/PublicNewsPage';
import { PublicArticleDetailPage } from './components/public/PublicArticleDetailPage';
import { PublicVenuesPage } from './components/public/PublicVenuesPage';
import { PublicClassifiedsPage } from './components/public/PublicClassifiedsPage';
import { PublicContactPage } from './components/public/PublicContactPage';
import { PublicPrivacyPolicyPage } from './components/public/PublicPrivacyPolicyPage';
import { PublicTermsOfServicePage } from './components/public/PublicTermsOfServicePage';
import { PublicEventWebsitePage } from './components/public/PublicEventWebsitePage';
import LegalPagesEditorPage from './pages/LegalPagesEditorPage';
import { PublicNorGenerator } from './components/public/PublicNorGenerator';
import LiveTrackingPage from './pages/LiveTrackingPage';
import LiveDashboardPage from './pages/LiveDashboardPage';
import ProBroadcastView from './components/live-tracking/ProBroadcastView';
import MobileStreamPage from './pages/MobileStreamPage';
import { EventWebsitesPage } from './pages/EventWebsitesPage';
import { EventWebsiteDashboardPage } from './pages/EventWebsiteDashboardPage';
import { EventCommandCenterPage } from './pages/EventCommandCenterPage';
import { ConnectionMonitor } from './components/ConnectionMonitor';
import PWAInstallPrompt from './components/PWAInstallPrompt';
import { useDataPreloader } from './hooks/useDataPreloader';
import { SubdomainPublicSite } from './components/SubdomainPublicSite';
import { SubdomainProvider } from './contexts/SubdomainContext';
import AlfieTVPage from './pages/AlfieTVPage';
import StripeOAuthCallback from './components/StripeOAuthCallback';
import { HMSValidatorPage } from './pages/HMSValidatorPage';
import { MobileAppComingSoon } from './components/MobileAppComingSoon';
import './styles/index.css';

function useIsMobilePhone() {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const width = window.innerWidth;
      const isMobileWidth = width < 768;
      const hasTouchScreen = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobile(isMobileWidth && hasTouchScreen);
    };
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  return isMobile;
}

function App() {
  // Use lightMode from localStorage to match the rest of the app
  const [darkMode, setDarkMode] = useState(() => {
    const savedLightMode = localStorage.getItem('lightMode');
    return savedLightMode !== 'true'; // darkMode is the inverse of lightMode
  });

  // Listen for lightMode changes from localStorage
  useEffect(() => {
    const handleStorageChange = () => {
      const savedLightMode = localStorage.getItem('lightMode');
      setDarkMode(savedLightMode !== 'true');
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);
  const [showScoring, setShowScoring] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<RaceEvent | null>(null);
  const { user, loading, clubsLoaded, isLoggingOut, onboardingCompleted, hasPendingApplication, hasPendingClubApplication, userClubs } = useAuth();
  const { notifications, removeNotification } = useNotifications();

  const isMobilePhone = useIsMobilePhone();

  useDataPreloader();

  // Detect if we're on a subdomain or custom domain (for public club websites)
  const hostname = window.location.hostname;
  const isAlfieproDomain = hostname.includes('.alfiepro.com.au') || hostname === 'alfiepro.com.au';
  const isMainDomain = hostname === 'alfiepro.com.au' || hostname === 'www.alfiepro.com.au';
  const isSubdomain = isAlfieproDomain &&
                      !isMainDomain &&
                      !hostname.startsWith('www.');

  // Exclude development/internal domains from custom domain detection
  const isDevelopmentDomain = hostname === 'localhost' ||
                              hostname.match(/^\d+\.\d+\.\d+\.\d+$/) || // IP address
                              hostname.includes('webcontainer') || // StackBlitz/WebContainer
                              hostname.includes('bolt.new') ||
                              hostname.includes('stackblitz.io') ||
                              hostname.includes('amplifyapp.com');

  const isCustomDomain = !isAlfieproDomain && !isDevelopmentDomain;
  const subdomain = isSubdomain ? hostname.split('.')[0] : (isCustomDomain ? hostname : null);

  const handleEventSelect = (event: RaceEvent) => {
    setSelectedEvent(event);
  };

  const handleStartScoring = () => {
    setShowScoring(true);
  };

  const handleExitScoring = () => {
    console.log('🔴🔴🔴 handleExitScoring called in App.tsx - User will return to dashboard');
    console.log('Stack trace:', new Error().stack);
    setShowScoring(false);
  };

  const handleClearSelectedEvent = () => {
    setSelectedEvent(null);
  };

  // Check if user is authenticated
  const isAuthenticated = !!user;

  // Allow OAuth callbacks and public routes to work even during loading
  const isPublicRoute = window.location.pathname.startsWith('/stripe-oauth-callback') ||
                        window.location.pathname.startsWith('/auth/callback/youtube') ||
                        window.location.pathname.startsWith('/mobile-stream');

  console.log('🔍 App.tsx auth check:', {
    loading,
    isPublicRoute,
    pathname: window.location.pathname,
    willShowLoading: loading && !isPublicRoute
  });

  // Show loading state while checking authentication (but not for public routes)
  if ((loading && !isPublicRoute) || isLoggingOut) {
    console.log('⏳ Showing loading screen');
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
          <div className="text-white text-xl">{isLoggingOut ? 'Signing out...' : 'Loading...'}</div>
        </div>
      </div>
    );
  }

  if (showScoring) {
    return (
      <ModalProvider>
        <NotificationSystem
          notifications={notifications}
          onRemove={removeNotification}
          darkMode={darkMode}
        />
        <YachtRaceManager onExitScoring={handleExitScoring} darkMode={darkMode} />
      </ModalProvider>
    );
  }

  // If we're on a subdomain or custom domain, render public club website directly
  if ((isSubdomain || isCustomDomain) && subdomain) {
    return (
      <ModalProvider>
        <NotificationSystem
          notifications={notifications}
          onRemove={removeNotification}
          darkMode={darkMode}
        />
        <SubdomainPublicSite subdomain={subdomain} />
      </ModalProvider>
    );
  }

  return (
    <ModalProvider>
      <ConnectionMonitor />
      <PWAInstallPrompt />
      <NotificationSystem
        notifications={notifications}
        onRemove={removeNotification}
        darkMode={darkMode}
      />
      <SubdomainProvider clubId={null} isSubdomainMode={false}>
        <Routes>
          {/* Public Club Website Routes */}
          <Route path="/club/:clubId/public" element={<PublicClubHomepageNew />} />
          <Route path="/club/:clubId/public/news" element={<PublicNewsPage />} />

          {/* Public State Association Website Routes */}
          <Route path="/state-association/:associationId/public" element={<PublicStateAssociationHomepage />} />

          {/* Public National Association Website Routes */}
          <Route path="/national-association/:associationId/public" element={<PublicNationalAssociationHomepage />} />
          <Route path="/club/:clubId/public/news/:articleId" element={<PublicArticleDetailPage />} />
          <Route path="/club/:clubId/public/venues" element={<PublicVenuesPage />} />
          <Route path="/club/:clubId/public/classifieds" element={<PublicClassifiedsPage />} />
          <Route path="/club/:clubId/public/contact" element={<PublicContactPage />} />
          <Route path="/club/:clubId/public/privacy" element={<PublicPrivacyPolicyPage />} />
          <Route path="/club/:clubId/public/terms" element={<PublicTermsOfServicePage />} />
          <Route path="/club/:clubId/public/yacht-classes" element={<PublicYachtClassesPage />} />
          <Route path="/club/:clubId/public/race-calendar" element={<PublicRaceCalendarPage />} />
          <Route path="/club/:clubId/public/results" element={<PublicResultsListPage />} />
          <Route path="/club/:clubId/public/results/:eventId" element={<PublicResultsPage />} />

        {/* Public Event Website Routes */}
        <Route path="/events/:slug/*" element={<PublicEventWebsitePage />} />

        {/* Public NOR Generator Route */}
        <Route path="/nor/:slug" element={<PublicNorGenerator />} />

        {/* Live Tracking Routes (Public) */}
        <Route path="/t/:token" element={<LiveTrackingPage />} />
        <Route path="/live/:token" element={<LiveTrackingPage />} />
        <Route path="/live/:token/dashboard" element={<LiveDashboardPage />} />
        <Route path="/live/:token/pro-broadcast" element={<ProBroadcastView />} />

        {/* Mobile Livestream Route (Public) */}
        <Route path="/mobile-stream/:sessionId" element={<MobileStreamPage />} />

        {/* AlfieTV Full-Screen Route */}
        <Route path="/alfie-tv" element={
          isAuthenticated ? <AlfieTVPage darkMode={darkMode} /> : <Navigate to="/login" />
        } />

        {/* Event Command Center Route */}
        <Route path="/event-command-center/:eventId" element={
          isAuthenticated ? <EventCommandCenterPage /> : <Navigate to="/login" />
        } />

        {/* HMS Validator Route - Super Admin Only */}
        <Route path="/hms-validator" element={
          isAuthenticated && user?.user_metadata?.is_super_admin ? <HMSValidatorPage /> : <Navigate to="/" />
        } />

        {/* Legal Pages Editor Routes - Super Admin Only - MUST be before catch-all */}
        <Route path="/legal/privacy-policy/edit" element={
          isAuthenticated && user?.user_metadata?.is_super_admin ? (
            <LegalPagesEditorPage pageType="privacy_policy" />
          ) : (
            <Navigate to="/" />
          )
        } />
        <Route path="/legal/terms-of-service/edit" element={
          isAuthenticated && user?.user_metadata?.is_super_admin ? (
            <LegalPagesEditorPage pageType="terms_of_service" />
          ) : (
            <Navigate to="/" />
          )
        } />

        <Route path="/login" element={isAuthenticated ? <Navigate to="/" /> : <Login />} />
        <Route path="/register" element={isAuthenticated ? <Navigate to="/" /> : <Register />} />
        <Route path="/register-club" element={
          isAuthenticated ? <ClubSelfRegistration darkMode={darkMode} /> : <Navigate to="/login" />
        } />
        <Route path="/club-application-pending" element={
          isAuthenticated ? <ClubApplicationPendingScreen darkMode={darkMode} /> : <Navigate to="/login" />
        } />
        <Route path="/forgot-password" element={isAuthenticated ? <Navigate to="/" /> : <ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/invite/:token" element={<InvitationSignup />} />
        {/* OAuth callback - allow even when not authenticated, component handles auth internally */}
        <Route path="/stripe-oauth-callback" element={<StripeOAuthCallback />} />
        <Route path="/onboarding" element={
          isAuthenticated ? (
            hasPendingApplication ? <Navigate to="/application-pending" /> :
            (clubsLoaded && userClubs.length > 0 && onboardingCompleted) ? <Navigate to="/" /> :
            <OnboardingRouter darkMode={darkMode} />
          ) : <Navigate to="/login" />
        } />
        <Route path="/application-pending" element={
          isAuthenticated ? <ApplicationPendingScreen darkMode={darkMode} /> : <Navigate to="/login" />
        } />
        <Route path="/onboarding/subscribe" element={<SubscriptionSelection />} />
        <Route path="/onboarding/success" element={<SubscriptionSuccess />} />
        <Route path="/onboarding/create-organization" element={
          isAuthenticated ? <CreateOrganization /> : <Navigate to="/login" />
        } />
        <Route 
          path="/auth/callback/youtube" 
          element={
            isAuthenticated ? (
              <YouTubeCallback />
            ) : (
              <Navigate to="/login" />
            )
          } 
        />
        <Route
          path="/meetings/:meetingId/minutes"
          element={
            isAuthenticated ? (
              <MinuteTakingPage darkMode={darkMode} />
            ) : (
              <Navigate to="/login" />
            )
          }
        />

        {/* Event Website Management Routes - Now handled in DashboardLayout */}

        <Route
          path="/*"
          element={
            !isAuthenticated ? (
              <Navigate to="/login" />
            ) : hasPendingApplication ? (
              <Navigate to="/application-pending" />
            ) : hasPendingClubApplication ? (
              <Navigate to="/club-application-pending" />
            ) : !clubsLoaded ? (
              <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
                  <div className="text-white text-xl">Loading...</div>
                </div>
              </div>
            ) : userClubs.length === 0 && !onboardingCompleted ? (
              <Navigate to="/onboarding" />
            ) : isMobilePhone ? (
              <MobileAppComingSoon />
            ) : (
              <DashboardLayout
                darkMode={darkMode}
                selectedEvent={selectedEvent}
                onEventSelect={handleEventSelect}
                onStartScoring={handleStartScoring}
                onClearSelectedEvent={handleClearSelectedEvent}
              />
            )
          }
        />
        </Routes>
      </SubdomainProvider>
    </ModalProvider>
  );
}

export default App;