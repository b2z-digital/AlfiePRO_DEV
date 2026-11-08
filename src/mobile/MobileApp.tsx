import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAlfieTheme } from '../hooks/useAlfieTheme';
import { MobileProvider, useMobile } from './MobileContext';
import { TabBar } from './ui';
import { Icon } from './icons';
import { Home } from './screens/Home';
import { CalendarScreen, ResultsScreen } from './screens/Racing';
import { EventDetail } from './screens/EventDetail';
import { Notifications } from './screens/Notifications';
import { Me } from './screens/Me';
import { Soon } from './screens/Soon';
import '../styles/alfie-mobile.css';

const AskAlfieChatPanel = lazy(() => import('../components/ask-alfie/AskAlfieChatPanel').then(m => ({ default: m.AskAlfieChatPanel })));

/** Screens that sit outside the tab bar (pushed full screen). */
const NO_TABS = [/^\/notifications/];

const AlfieSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { light } = useMobile();
  useEffect(() => {
    const onBack = (e: Event) => { e.preventDefault(); onClose(); };
    window.addEventListener('alfie-native-back', onBack);
    return () => window.removeEventListener('alfie-native-back', onBack);
  }, [onClose]);
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80, background: light ? '#F3F6FB' : '#060B16', display: 'flex', flexDirection: 'column', paddingTop: 'var(--m-safe-top)', paddingBottom: 'var(--m-safe-bottom)', animation: 'm-up .24s cubic-bezier(.2,.8,.2,1)' }}>
      <div style={{ display: 'flex', alignItems: 'center', padding: '6px 12px' }}>
        <button className="m-ibtn" aria-label="Close Ask Alfie" onClick={onClose}><Icon name="close" /></button>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <Suspense fallback={null}>
          <AskAlfieChatPanel darkMode={!light} onClose={onClose} embedded />
        </Suspense>
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { pathname } = useLocation();
  const { light } = useMobile();
  const [alfieOpen, setAlfieOpen] = useState(false);
  useAlfieTheme(true, light ? 'light' : 'dark');
  const hideTabs = NO_TABS.some(r => r.test(pathname));

  // Each screen starts at the top
  useEffect(() => { document.querySelector('.m-scroll')?.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <div className={`m-app ${light ? 'm-light' : ''}`}>
      <main className={`m-scroll ${hideTabs ? 'm-no-tabs' : ''}`} style={{ position: 'relative' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/calendar" element={<CalendarScreen />} />
          <Route path="/calendar/event/:key" element={<EventDetail />} />
          <Route path="/results" element={<ResultsScreen />} />
          <Route path="/my-results" element={<ResultsScreen mineOnly />} />
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/me" element={<Me />} />
          <Route path="/ask-alfie" element={<AskAlfieRoute onOpen={() => setAlfieOpen(true)} />} />

          <Route path="/find-racing" element={<Soon title="Find racing" what="A map of racing near you from every club and association on AlfiePRO." />} />
          <Route path="/race-desk/*" element={<Soon title="Race desk" what="Sign on, StartBox, finish calling and scoring for Scratch, Handicap, HMS and SHRS, built from the Race Management board." />} />
          <Route path="/calendar/meeting/:id" element={<Soon title="Meeting" what="Agenda, join link and your attendance answer." />} />
          <Route path="/club" element={<Soon title="Club" what="The community feed, groups, classifieds, news and media in one place." />} />
          <Route path="/comms/*" element={<Soon title="Chats" what="Direct messages, group chats and classifieds questions in one inbox." />} />
          <Route path="/community/*" element={<Navigate to="/club" replace />} />
          <Route path="/news/*" element={<Soon title="News" what="Club, state and national news with a calm reader." />} />
          <Route path="/classifieds/*" element={<Soon title="Classifieds" what="Buy and sell boats, rigs and parts." />} />
          <Route path="/media/*" element={<Soon title="Media" what="Every photo and video by month or event." />} />
          <Route path="/my-membership" element={<Soon title="Membership" what="Your membership card, renewals and payments." />} />
          <Route path="/my-garage/*" element={<Soon title="Boat shed" what="Boats, rigs, maintenance and performance." />} />
          <Route path="/race-timer" element={<Soon title="Race Timer" what="Your club's start sequences, with sounds, buzzes and the screen kept awake." />} />
          <Route path="/weather" element={<Soon title="Wind & tides" what="Wind, temperature and tide forecasts for your venues." />} />
          <Route path="/tasks" element={<Soon title="Tasks" what="Jobs from the club and your own, ticked off as you go." />} />
          <Route path="/settings/*" element={<Soon title="Profile & settings" what="Your details, notifications and privacy." />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideTabs && <TabBar onAlfie={() => setAlfieOpen(true)} />}
      {alfieOpen && <AlfieSheet onClose={() => setAlfieOpen(false)} />}
    </div>
  );
};

/** /ask-alfie (links from results and old notifications) opens the sheet over Home. */
const AskAlfieRoute: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  useEffect(() => { onOpen(); }, [onOpen]);
  return <Home />;
};

export const MobileApp: React.FC = () => (
  <MobileProvider>
    <Shell />
  </MobileProvider>
);

export default MobileApp;
