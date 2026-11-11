/**
 * The Race Simulator in the app, opened from Me: the website's simulator, full screen, always dark,
 * with a close button to come back to the app. It turns with the phone (racing is best sideways) and
 * keeps the screen on while it's open. Races, live races, drills and the debrief are the same code
 * as on the website, so a phone races a desktop or an iPad in step.
 */
import React from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import RaceSimulatorPage from '../../components/race-simulator/RaceSimulatorPage';
import { Icon } from '../icons';
import { useAllowLandscape } from '../orientation';
import { useKeepAwake } from '../startBoxParts';
import { useSimulatorAccess } from '../simulator';

export const RaceSimulatorScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, currentClub, isSuperAdmin } = useAuth();
  const { allowed, loading } = useSimulatorAccess();
  useAllowLandscape();
  useKeepAwake(allowed);
  if (!allowed) return loading ? <div className="m-sim" /> : <Navigate to="/me" replace />;
  const close = () => (window.history.length > 1 ? navigate(-1) : navigate('/me'));
  return (
    <div className="m-sim">
      <div className="m-sim-bar">
        <button className="m-ibtn" aria-label="Close the Sailing Academy" onClick={close}><Icon name="close" size={18} /></button>
      </div>
      <div className="m-sim-body">
        <RaceSimulatorPage
          darkMode
          account={user ? { userId: user.id, clubId: currentClub?.clubId ?? null, admin: currentClub?.role === 'admin', superAdmin: isSuperAdmin } : null}
        />
      </div>
    </div>
  );
};
