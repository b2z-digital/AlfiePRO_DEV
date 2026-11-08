import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Avatar } from '../ui';
import { setMobilePreview } from '../preview';
import { isNative } from '../../lib/native/platform';

const Tile: React.FC<{ icon: IconName; bg: string; fg: string; title: string; sub: string; to: string }> = ({ icon, bg, fg, title, sub, to }) => {
  const navigate = useNavigate();
  return (
    <button className="m-card" onClick={() => navigate(to)} style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'left' }}>
      <span className="m-tile" style={{ width: 36, height: 36, borderRadius: 11, background: bg, color: fg }}><Icon name={icon} size={19} /></span>
      <div><div style={{ fontWeight: 600, fontSize: 14.5 }}>{title}</div><div className="m-dim" style={{ fontSize: 12.5 }}>{sub}</div></div>
    </button>
  );
};

export const Me: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub, userClubs, signOut } = useAuth();
  const { profile, light } = useMobile();
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';

  const toggleLight = () => {
    try { localStorage.setItem('lightMode', light ? 'false' : 'true'); } catch { /* ignore */ }
    window.location.reload();
  };

  return (
    <div className="m-stack">
      <header className="m-top" style={{ minHeight: 76, gap: 12 }}>
        <Avatar name={name} url={profile.avatarUrl} size={58} ring />
        <div className="m-top-title">
          <div className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{name}</div>
          <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--m-blue-ink)' }}>{currentClub?.club?.name || 'No club selected'}{userClubs.length > 1 ? ` · ${userClubs.length} clubs` : ''}</div>
        </div>
        <button className="m-ibtn" aria-label="Edit profile" onClick={() => navigate('/settings')}><Icon name="doc" size={18} /></button>
      </header>

      <button className="m-card m-spec" onClick={() => navigate('/my-membership')} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        background: light ? undefined : 'linear-gradient(150deg,#0B3E86,#0F1726 75%) padding-box, var(--m-spectrum) border-box' }}>
        <span className="m-tile" style={{ background: 'rgba(255,255,255,.12)' }}><Icon name="doc" size={20} /></span>
        <div style={{ flex: 1 }}><div style={{ fontWeight: 700, fontSize: 15 }}>Membership</div><div className="m-mut" style={{ fontSize: 13 }}>Card, renewals and payments</div></div>
        <Icon name="chevron" size={18} className="m-dim" />
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Tile icon="sail" bg="rgba(52,199,89,.14)" fg="#5FD47F" title="Boat shed" sub="Boats, rigs, care" to="/my-garage" />
        <Tile icon="trophy" bg="rgba(255,138,43,.15)" fg="#FFA65C" title="My results" sub="Every race you've sailed" to="/my-results" />
        <Tile icon="timer" bg="rgba(255,159,10,.15)" fg="#FFC062" title="Race Timer" sub="Start sequences" to="/race-timer" />
        <Tile icon="wind" bg="rgba(56,189,248,.15)" fg="#6CCBF5" title="Wind & tides" sub="Your venues" to="/weather" />
      </div>

      <div className="m-card">
        <button className="m-li" onClick={() => navigate('/tasks')}><span className="m-tile" style={{ width: 36, height: 36, background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="tasks" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>My tasks</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={() => navigate('/notifications')}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="bell" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Notifications</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={toggleLight}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="clock" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Appearance</span><span className="m-dim" style={{ fontSize: 14 }}>{light ? 'Light' : 'Dark'}</span></button>
        {!isNative && (
          <button className="m-li" onClick={() => { setMobilePreview(false); window.location.reload(); }}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="tv" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Leave the phone preview</span></button>
        )}
      </div>
      <button className="m-btn m-btn-g" style={{ color: '#FF8C82' }} onClick={() => signOut()}>Sign out</button>
    </div>
  );
};
