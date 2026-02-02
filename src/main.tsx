import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { NotificationProvider } from './contexts/NotificationContext';
import App from './App';
import MobileStreamPage from './pages/MobileStreamPage';
import { registerServiceWorker } from './utils/registerServiceWorker';

import './index.css';
import './styles/animations.css';
import './styles/article.css';

window.addEventListener('beforeunload', () => {
  const now = new Date().toISOString();
  sessionStorage.setItem('lastReload', now);
});

const lastReload = sessionStorage.getItem('lastReload');
if (lastReload) {
  const timeSinceReload = Date.now() - new Date(lastReload).getTime();
  console.log('[Main] Time since last reload:', Math.round(timeSinceReload / 1000), 'seconds');
}

if ('serviceWorker' in navigator) {
  registerServiceWorker();
}

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
    <AuthProvider>
      <NotificationProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </NotificationProvider>
    </AuthProvider>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>
);
