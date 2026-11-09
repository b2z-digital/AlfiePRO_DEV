import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import { ImpersonationProvider } from './contexts/ImpersonationContext';
import { ScoringContextProvider } from './contexts/ScoringContext';
import { VoiceCallProvider } from './contexts/VoiceCallContext';
import { ErrorBoundary } from './components/ErrorBoundary';
import App from './App';
import MobileStreamPage from './pages/MobileStreamPage';
import { registerServiceWorker } from './utils/registerServiceWorker';
import { installBrokenImageFallback } from './lib/brokenImages';
import { initNative, hideNativeSplash } from './lib/native/bootstrap';

import './index.css';
import './styles/alfie-theme.css';
import './styles/alfie-ui.css';
import './styles/alfie-switcher.css';
import './styles/alfie-screens.css';
import './styles/alfie-news.css';
import './styles/alfie-media.css';
import './styles/alfie-shops.css';
import './styles/alfie-assoc.css';
import './styles/alfie-tv.css';
import './styles/alfie-live.css';
import './styles/animations.css';
import './styles/article.css';
import './styles/alfie-native.css';

window.addEventListener('beforeunload', () => {
  const now = new Date().toISOString();
  sessionStorage.setItem('lastReload', now);
});

const lastReload = sessionStorage.getItem('lastReload');
if (lastReload) {
  const timeSinceReload = Date.now() - new Date(lastReload).getTime();
  console.log('[Main] Time since last reload:', Math.round(timeSinceReload / 1000), 'seconds');
}

// Broken images: retry external ones without a referrer, then fall back to initials / hide
installBrokenImageFallback();

// Native apps: status bar, keyboard, deep links, back button (no-op in a browser)
void initNative();

// Register service worker only in supported environments (never in the native apps)
registerServiceWorker().catch(() => {
  // Silently handle any registration errors
});

function Root() {
  const isMobileStreamRoute = window.location.pathname.startsWith('/mobile-stream/');

  if (isMobileStreamRoute) {
    return (
      <BrowserRouter>
        <Routes>
          <Route path="/mobile-stream/:sessionId" element={<MobileStreamPage />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <ErrorBoundary>
      <AuthProvider>
        <ImpersonationProvider>
          <NotificationProvider>
            <VoiceCallProvider>
              <ScoringContextProvider>
                <BrowserRouter>
                  <App />
                </BrowserRouter>
              </ScoringContextProvider>
            </VoiceCallProvider>
          </NotificationProvider>
        </ImpersonationProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);

hideNativeSplash();
