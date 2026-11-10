import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile, Appearance } from '../MobileContext';
import { Icon, IconName } from '../icons';
import { Avatar, OfflineBanner } from '../ui';
import { setMobilePreview } from '../preview';
import { isNative } from '../../lib/native/platform';
import { MBoat, MMembership, computeStats, isCurrent, loadBoats, loadMembership } from '../me';
import { useSimulatorAccess } from '../simulator';

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
  const { user, currentClub, currentOrganization, userClubs, signOut } = useAuth();
  const { profile, light, memberIds, calendar, appearance, setAppearance } = useMobile();
  const name = `${profile.firstName} ${profile.lastName}`.trim() || 'Me';
  const [membership, setMembership] = useState<MMembership | null>(null);
  const [boats, setBoats] = useState<MBoat[]>([]);
  useEffect(() => { loadMembership(user?.id, currentClub?.clubId).then(setMembership).catch(() => {}); }, [user?.id, currentClub?.clubId]);
  useEffect(() => { if (memberIds.length) loadBoats(memberIds).then(setBoats).catch(() => {}); }, [memberIds]);
  const stats = useMemo(() => computeStats(calendar, memberIds, name, new Date().getFullYear()), [calendar, memberIds, name]);
  const rigs = boats.reduce((t, b) => t + b.rigCount, 0);
  const current = membership ? isCurrent(membership) : false;
  const until = membership?.renewalDate ? new Date(membership.renewalDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const simulator = useSimulatorAccess().allowed;
  const where = currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.name : currentClub?.club?.name;

  return (
    <div className="m-stack">
      <header className="m-top" style={{ minHeight: 76, gap: 12 }}>
        <button className="m-ibtn" aria-label="Back" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}><Icon name="back" /></button>
        <Avatar name={name} url={profile.avatarUrl} size={50} ring />
        <div className="m-top-title" style={{ textAlign: 'left', alignItems: 'flex-start', minWidth: 0 }}>
          <div className="m-disp m-ell" style={{ fontSize: 21, fontWeight: 700, maxWidth: '100%' }}>{name}</div>
          <button onClick={() => navigate('/choose-club')} style={{ background: 'none', border: 0, padding: 0, fontSize: 13, fontWeight: 600, color: 'var(--m-blue-ink)', display: 'inline-flex', alignItems: 'center', gap: 4, textAlign: 'left', maxWidth: '100%', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
            {where || 'Choose a club'}{userClubs.length > 1 && <Icon name="down" size={14} />}
          </button>
        </div>
        <button className="m-ibtn" aria-label="My details" onClick={() => navigate('/me/details')}><Icon name="edit" size={18} /></button>
      </header>
      <OfflineBanner />

      <button className="m-card m-spec" onClick={() => navigate('/my-membership')} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left',
        background: light ? undefined : 'linear-gradient(150deg,#0B3E86,#0F1726 75%) padding-box, var(--m-spectrum) border-box' }}>
        <span className="m-tile" style={{ background: 'rgba(255,255,255,.12)' }}><Icon name="doc" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>Membership card</div>
          <div className="m-mut m-ell" style={{ fontSize: 13 }}>{membership ? `${membership.level}${until ? ` · current to ${until}` : ''}` : 'Card, renewals and payments'}</div>
        </div>
        {membership && (
          <span style={{ height: 24, padding: '0 9px', borderRadius: 999, background: current ? 'rgba(52,199,89,.2)' : 'rgba(255,159,10,.2)', color: current ? (light ? '#178A3E' : '#7DE39A') : (light ? '#B26A00' : '#FFC062'), fontSize: 11.5, fontWeight: 700, display: 'flex', alignItems: 'center' }}>
            {current ? 'ACTIVE' : 'DUE'}
          </span>
        )}
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10 }}>
        <Tile icon="sail" bg="rgba(52,199,89,.14)" fg="#5FD47F" title="Boat shed" sub={boats.length ? `${boats.length} ${boats.length === 1 ? 'boat' : 'boats'} · ${rigs} ${rigs === 1 ? 'rig' : 'rigs'}` : 'Boats, rigs, care'} to="/my-garage" />
        <Tile icon="trophy" bg="rgba(255,138,43,.15)" fg="#FFA65C" title="My stats" sub={stats.races ? `${stats.races} races this year` : 'Your season in numbers'} to="/my-stats" />
        <Tile icon="timer" bg="rgba(255,159,10,.15)" fg="#FFC062" title="Race Timer" sub="Start sequences" to="/race-timer" />
        <Tile icon="wind" bg="rgba(56,189,248,.15)" fg="#6CCBF5" title="Wind & tides" sub="Your venues" to="/weather" />
      </div>

      {simulator && (
        <button className="m-card" onClick={() => navigate('/race-simulator')} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
          <span className="m-tile" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(138,77,255,.16)', color: '#B89BFF' }}><Icon name="simulator" size={20} /></span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>Race Simulator</div>
            <div className="m-dim" style={{ fontSize: 12.5 }}>Race AI skippers and members, with Alfie coaching</div>
          </div>
          <Icon name="chevron" size={17} className="m-dim" />
        </button>
      )}

      <button className="m-card" onClick={() => navigate('/shops')} style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left' }}>
        <span className="m-tile" style={{ width: 40, height: 40, borderRadius: 12, background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="bag" size={20} /></span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: 15 }}>Shops</div>
          <div className="m-dim" style={{ fontSize: 12.5 }}>Parts, sails and gear from suppliers</div>
        </div>
        <Icon name="chevron" size={17} className="m-dim" />
      </button>

      <div className="m-card">
        <button className="m-li" onClick={() => navigate('/me/details')}><span className="m-tile" style={{ width: 36, height: 36, background: 'rgba(255,62,154,.14)', color: '#FF7DB8' }}><Icon name="heart" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>My details</span><span className="m-dim" style={{ fontSize: 13 }}>Contact, emergency</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={() => navigate('/tasks')}><span className="m-tile" style={{ width: 36, height: 36, background: 'rgba(10,132,255,.14)', color: 'var(--m-blue-ink)' }}><Icon name="tasks" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>My tasks</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={() => navigate('/notifications')}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="bell" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Notifications</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={() => navigate('/settings')}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="me" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Privacy &amp; account</span><Icon name="chevron" size={17} className="m-dim" /></button>
        <button className="m-li" onClick={() => setAppearanceOpen(true)}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="clock" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Appearance</span><span className="m-dim" style={{ fontSize: 14 }}>{appearance === 'system' ? `Match phone · ${light ? 'Light' : 'Dark'}` : light ? 'Light' : 'Dark'}</span></button>
        {!isNative && (
          <button className="m-li" onClick={() => { setMobilePreview(false); window.location.reload(); }}><span className="m-tile" style={{ width: 36, height: 36, background: 'var(--m-fill)' }}><Icon name="tv" size={18} /></span><span style={{ flex: 1, fontSize: 15 }}>Leave the phone preview</span></button>
        )}
      </div>
      <button className="m-btn m-btn-g" style={{ color: '#FF8C82' }} onClick={() => signOut()}>Sign out</button>
      {appearanceOpen && (
        <>
          <div className="m-veil" onClick={() => setAppearanceOpen(false)} />
          <div className="m-sheet" role="dialog" aria-label="Appearance">
            <span className="m-grab" />
            <div className="m-disp" style={{ fontSize: 21, fontWeight: 700, marginBottom: 10 }}>Appearance</div>
            <div className="m-card">
              {(['system', 'light', 'dark'] as Appearance[]).map(a => (
                <button key={a} className="m-li" onClick={() => { setAppearance(a); setAppearanceOpen(false); }}>
                  <span style={{ flex: 1 }}>{a === 'system' ? 'Match my phone' : a === 'light' ? 'Light' : 'Dark'}</span>
                  {appearance === a && <Icon name="check" className="m-dim" />}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};
