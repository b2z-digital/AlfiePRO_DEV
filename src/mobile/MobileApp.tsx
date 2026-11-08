import React, { Suspense, lazy, useEffect, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { isNative } from '../lib/native/platform';
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
import { DeskEventScreen, RaceDeskScreen, SeasonScreen } from './screens/RaceDesk';
import { HeatsScreen, RaceSettingsScreen, SignOnScreen, SkippersScreen } from './screens/RaceSetup';
import { RaceScreen } from './screens/RaceDay';
import { FinishPadScreen } from './screens/FinishPad';
import { ConfirmRaceScreen } from './screens/ConfirmRace';
import { SyncScreen } from './screens/Sync';
import { startOutbox } from './outbox';
import { ClubHub } from './screens/Club';
import { ChatsInbox, ChatThread } from './screens/Chats';
import { SkipperProfile } from './screens/Skipper';
import { ClassifiedsScreen, ListingScreen } from './screens/Classifieds';
import { NewsScreen, ArticleScreen } from './screens/News';
import { MediaScreen } from './screens/Media';
import { TVScreen } from './screens/TV';
import { MembershipScreen } from './screens/Membership';
import { BoatShedScreen, BoatScreen } from './screens/BoatShed';
import { StatsScreen } from './screens/Stats';
import { MeetingScreen } from './screens/Meeting';
import { RaceTimerScreen } from './screens/RaceTimer';
import { WeatherScreen } from './screens/Weather';
import { TasksScreen } from './screens/Tasks';
import { FindRacingScreen } from './screens/FindRacing';
import { ChooseClubScreen, NotificationsPromptScreen, MembershipDueScreen, FIRST_RUN, flag, loadMyAssociations } from './screens/FirstRun';
import { SettingsScreen } from './screens/Settings';
import { hostFor } from './scoreTogether';
import '../styles/alfie-mobile.css';

const AskAlfieChatPanel = lazy(() => import('../components/ask-alfie/AskAlfieChatPanel').then(m => ({ default: m.AskAlfieChatPanel })));

/** Screens that sit outside the tab bar (pushed full screen). */
const FIRST_RUN_PATHS = ['/choose-club', '/welcome-notifications', '/membership-due'];
const NO_TABS = [/^\/(choose-club|welcome-notifications|membership-due)/, /^\/notifications/, /^\/race-timer/, /^\/race-desk\/event\/[^/]+\/(race|finish|confirm)$/, /^\/comms\/chat\//, /^\/classifieds\/[^/]+/, /^\/news\/[^/]+/];

const AlfieSheet: React.FC<{ onClose: () => void; message?: string }> = ({ onClose, message }) => {
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
          <AskAlfieChatPanel darkMode={!light} onClose={onClose} embedded initialMessage={message} />
        </Suspense>
      </div>
    </div>
  );
};

const Shell: React.FC = () => {
  const { pathname } = useLocation();
  const { light } = useMobile();
  const [alfieOpen, setAlfieOpen] = useState(false);
  const [alfieMessage, setAlfieMessage] = useState<string | undefined>();
  useEffect(() => {
    const on = (e: Event) => { setAlfieMessage((e as CustomEvent).detail || undefined); setAlfieOpen(true); };
    window.addEventListener('m-ask-alfie', on);
    return () => window.removeEventListener('m-ask-alfie', on);
  }, []);
  useAlfieTheme(true, light ? 'light' : 'dark');
  // Results confirmed with no signal send themselves when it's back
  useEffect(() => startOutbox(), []);
  // Score together keeps running for events this phone is scoring with spotters
  useEffect(() => {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith('alfie-m-together:')) hostFor(k.slice('alfie-m-together:'.length));
      }
    } catch { /* private mode */ }
  }, []);
  const hideTabs = NO_TABS.some(r => r.test(pathname));
  useFirstRun(pathname);

  // Each screen starts at the top
  useEffect(() => { document.querySelector('.m-scroll')?.scrollTo({ top: 0 }); }, [pathname]);

  return (
    <div className={`m-app ${light && !pathname.startsWith('/alfie-tv') && !pathname.startsWith('/race-timer') ? 'm-light' : ''}`}>
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

          <Route path="/race-desk" element={<RaceDeskScreen />} />
          <Route path="/race-desk/event/:key" element={<DeskEventScreen />} />
          <Route path="/race-desk/season" element={<SeasonScreen />} />
          <Route path="/race-desk/event/:key/sign-on" element={<SignOnScreen />} />
          <Route path="/race-desk/event/:key/skippers" element={<SkippersScreen />} />
          <Route path="/race-desk/event/:key/heats" element={<HeatsScreen />} />
          <Route path="/race-desk/event/:key/settings" element={<RaceSettingsScreen />} />
          <Route path="/race-desk/event/:key/race" element={<RaceScreen />} />
          <Route path="/race-desk/event/:key/finish" element={<FinishPadScreen />} />
          <Route path="/race-desk/event/:key/confirm" element={<ConfirmRaceScreen />} />
          <Route path="/race-desk/sync" element={<SyncScreen />} />
          <Route path="/club" element={<ClubHub />} />
          <Route path="/community/*" element={<Navigate to="/club" replace />} />
          <Route path="/comms" element={<ChatsInbox />} />
          <Route path="/comms/chat/:userId" element={<ChatThread />} />
          <Route path="/comms/*" element={<Navigate to="/comms" replace />} />
          <Route path="/skipper/:id" element={<SkipperProfile />} />
          <Route path="/classifieds" element={<ClassifiedsScreen />} />
          <Route path="/classifieds/:id" element={<ListingScreen />} />
          <Route path="/news" element={<NewsScreen />} />
          <Route path="/news/:id" element={<ArticleScreen />} />
          <Route path="/media" element={<MediaScreen />} />
          <Route path="/alfie-tv/*" element={<TVScreen />} />
          <Route path="/my-membership" element={<MembershipScreen />} />
          <Route path="/my-garage" element={<BoatShedScreen />} />
          <Route path="/my-garage/:boatId" element={<BoatScreen />} />
          <Route path="/my-stats" element={<StatsScreen />} />
          <Route path="/calendar/meeting/:id" element={<MeetingScreen />} />
          <Route path="/find-racing" element={<FindRacingScreen />} />
          <Route path="/race-timer" element={<RaceTimerScreen />} />
          <Route path="/weather" element={<WeatherScreen />} />
          <Route path="/tasks" element={<TasksScreen />} />
          <Route path="/settings/*" element={<SettingsScreen />} />
          <Route path="/choose-club" element={<ChooseClubScreen />} />
          <Route path="/welcome-notifications" element={<NotificationsPromptScreen />} />
          <Route path="/membership-due" element={<MembershipDueScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      {!hideTabs && <TabBar onAlfie={() => setAlfieOpen(true)} />}
      {alfieOpen && <AlfieSheet message={alfieMessage} onClose={() => { setAlfieOpen(false); setAlfieMessage(undefined); }} />}
    </div>
  );
};

const sessionFlag = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };

/**
 * First run, in order (board "Sign in & first run"): membership due (unless snoozed),
 * choose your club (only with more than one), then notifications (apps, once).
 */
function useFirstRun(pathname: string) {
  const navigate = useNavigate();
  const { user, userClubs, hasUnfinancialMember, unfinancialMemberData } = useAuth();
  const [assocs, setAssocs] = useState<number | null>(null);
  useEffect(() => { loadMyAssociations(user?.id).then(a => setAssocs(a.length)).catch(() => setAssocs(0)); }, [user?.id]);
  useEffect(() => {
    if (FIRST_RUN_PATHS.some(p => pathname.startsWith(p)) || assocs === null) return;
    if (hasUnfinancialMember && unfinancialMemberData && !sessionFlag(FIRST_RUN.dueSnooze) && Date.now() > Number(flag(FIRST_RUN.dueSnooze) || 0)) {
      navigate('/membership-due');
      return;
    }
    if (userClubs.length + assocs > 1 && flag(FIRST_RUN.club) !== 'remember' && !sessionFlag(FIRST_RUN.club)) {
      navigate('/choose-club');
      return;
    }
    if (isNative && !flag(FIRST_RUN.push)) navigate('/welcome-notifications');
  }, [pathname, assocs, hasUnfinancialMember, unfinancialMemberData, userClubs.length, navigate]);
}

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
