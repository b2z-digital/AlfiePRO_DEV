// The AlfiePRO Sailing Academy's own site: academy.alfiepro.com.au (base ''), and the same pages at
// /academy inside the app (base '/academy'). Home, the way in (your details, your free week,
// you're in), your plan, and the Academy itself for skippers who aren't in an AlfiePRO club.
import { type ReactNode, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { useAuth } from '../../../contexts/AuthContext';
import { supabase } from '../../../utils/supabase';
import RaceSimulatorPage from '../../race-simulator/RaceSimulatorPage';
import { onAcademySite, useAcademyPlan } from '../usePlan';
import AcademyHome from './Home';
import AcademyStart from './Start';
import AcademyFreeWeek from './FreeWeek';
import AcademyWelcome from './Welcome';
import AcademyPlanPage from './PlanPage';
import { INK, Page } from './Shell';

function Loading() {
  return <Page><div role="status" className="grid min-h-screen place-items-center" style={{ color: INK.mute }}>Loading…</div></Page>;
}

export default function AcademySite({ base }: { base: string }) {
  const { user, loading, isSuperAdmin, userClubs } = useAuth();
  const plan = useAcademyPlan(user?.id, isSuperAdmin);
  const nav = useNavigate();
  const [club, setClub] = useState<{ club_id: string; club_name: string } | null>(null);

  useEffect(() => {
    let live = true;
    if (!user) { setClub(null); return; }
    void supabase.rpc('academy_my_membership').then(({ data }) => {
      if (live) setClub(Array.isArray(data) && data.length ? data[0] as { club_id: string; club_name: string } : null);
    });
    return () => { live = false; };
  }, [user]);

  const firstName = (user?.user_metadata?.first_name as string | undefined)?.trim() || null;
  // Club members on the app's own domain sail in the app; everyone else sails here.
  const sailTo = !onAcademySite() && userClubs.length ? '/race-simulator' : `${base}/sail`;
  const needUser = (page: ReactNode) => (loading ? <Loading /> : user ? page : <Navigate to={`${base}/start?signin=1`} replace />);

  return (
    <Routes>
      <Route index element={<AcademyHome base={base} signedIn={!!user} />} />
      <Route path="start" element={loading ? <Loading /> : <AcademyStart base={base} signedIn={!!user} />} />
      <Route path="free-week" element={needUser(<AcademyFreeWeek base={base} plan={plan} firstName={firstName} />)} />
      <Route path="welcome" element={needUser(<AcademyWelcome base={base} plan={plan} firstName={firstName} sailTo={sailTo} />)} />
      <Route path="plan" element={needUser(<AcademyPlanPage base={base} plan={plan} clubName={club?.club_name ?? null} />)} />
      <Route path="sail" element={needUser(
        <div className="fixed inset-0 overflow-hidden" style={{ background: INK.bg, ['--alfie-rail' as string]: '0px' }}>
          <RaceSimulatorPage darkMode onExit={() => nav(base || '/')} plan={plan}
            account={user ? { userId: user.id, clubId: club?.club_id ?? userClubs[0]?.clubId ?? null, admin: false, superAdmin: isSuperAdmin } : null} />
        </div>,
      )} />
      <Route path="*" element={<Navigate to={base || '/'} replace />} />
    </Routes>
  );
}
