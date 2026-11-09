import React, { Suspense, lazy, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useMobile } from '../MobileContext';
import { Skeleton, SubHeader } from '../ui';
import { money } from '../club';
import { MMembership, isCurrent, loadMembership } from '../me';

const JoinAnotherClubModal = lazy(() => import('../../components/membership/JoinAnotherClubModal').then(m => ({ default: m.JoinAnotherClubModal })));

const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '');

/** The membership card itself: club, member, dates and a QR anyone can scan to read them. */
export const MemberCard: React.FC<{ m: MMembership }> = ({ m }) => {
  const [qr, setQr] = useState<string | null>(null);
  useEffect(() => {
    const text = [
      'AlfiePRO membership',
      m.name,
      m.club?.name,
      m.level,
      m.renewalDate ? `Current to ${fmtDate(m.renewalDate)}` : '',
      isCurrent(m) ? 'Financial' : 'Not financial',
      `Ref ${m.memberId}`,
    ].filter(Boolean).join('\n');
    import('qrcode').then(q => q.toDataURL(text, { margin: 0, width: 220, color: { dark: '#0A1020', light: '#FFFFFF' } })).then(setQr).catch(() => {});
  }, [m]);
  const abbr = m.club?.abbreviation || (m.club?.name || 'AP').split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div style={{
      borderRadius: 24, padding: 20, display: 'flex', flexDirection: 'column', gap: 18, color: '#fff',
      background: 'radial-gradient(260px 200px at 100% 0%, rgba(255,62,154,.35), transparent 70%), radial-gradient(260px 220px at 0% 100%, rgba(46,123,255,.45), transparent 70%), linear-gradient(150deg,#0B3E86,#1A1446)',
      boxShadow: '0 24px 50px rgba(0,0,0,.35), inset 0 0 0 1px rgba(255,255,255,.14)',
    }}>
      <div className="m-row" style={{ gap: 10 }}>
        <span className="m-tile" style={{ width: 40, height: 40, background: '#fff', color: '#0B4FA8', fontWeight: 700, fontSize: 12, overflow: 'hidden' }}>
          {m.club?.logo ? <img src={m.club.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : abbr}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="m-ell" style={{ fontWeight: 700, fontSize: 14.5 }}>{m.club?.name || 'AlfiePRO'}</div>
          {m.association && <div className="m-ell" style={{ fontSize: 12, color: 'rgba(255,255,255,.7)' }}>Member of {m.association}</div>}
        </div>
      </div>
      <div className="m-row" style={{ alignItems: 'flex-end', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)' }}>{m.level}</div>
          <div className="m-disp" style={{ fontSize: 24, fontWeight: 700 }}>{m.name}</div>
          <div className="m-row" style={{ gap: 18, marginTop: 10, fontSize: 12, color: 'rgba(255,255,255,.65)', alignItems: 'flex-start' }}>
            <div>Status<div style={{ fontSize: 14, fontWeight: 700, color: isCurrent(m) ? '#9BF0B4' : '#FFB3B3' }}>{isCurrent(m) ? 'Financial' : 'Renewal due'}</div></div>
            {m.renewalDate && <div>Current to<div style={{ fontSize: 14, fontWeight: 700, color: '#fff' }}>{fmtDate(m.renewalDate)}</div></div>}
          </div>
        </div>
        <span style={{ width: 92, height: 92, padding: 8, borderRadius: 12, background: '#fff', flexShrink: 0, display: 'flex' }} role="img" aria-label="Membership QR code">
          {qr && <img src={qr} alt="" style={{ width: '100%', height: '100%', imageRendering: 'pixelated' }} />}
        </span>
      </div>
    </div>
  );
};

export const MembershipScreen: React.FC = () => {
  const { user, currentClub } = useAuth();
  const { light } = useMobile();
  const [m, setM] = useState<MMembership | null | undefined>(undefined);
  const [joining, setJoining] = useState(false);
  useEffect(() => { loadMembership(user?.id, currentClub?.clubId).then(setM).catch(() => setM(null)); }, [user?.id, currentClub?.clubId]);

  return (
    <div className="m-stack">
      <SubHeader title="Membership" />
      {m === undefined ? <><Skeleton h={220} /><Skeleton h={140} /></> : m === null ? (
        <div className="m-card m-empty">You're not a member of a club on AlfiePRO yet.</div>
      ) : (
        <>
          <MemberCard m={m} />
          <div className="m-card">
            <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Type</span><b style={{ fontWeight: 600 }}>{m.level}</b></div>
            {m.classes.length > 0 && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Classes</span><b style={{ fontWeight: 600 }}>{m.classes.join(' · ')}</b></div>}
            {m.joined && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Member since</span><b style={{ fontWeight: 600 }}>{new Date(m.joined).getFullYear()}</b></div>}
          </div>
          {m.payments.length > 0 && (
            <>
              <p className="m-lb m-dim" style={{ margin: '2px 0 0' }}>Payments</p>
              <div className="m-card">
                {m.payments.map(p => (
                  <div key={p.id} className="m-li">
                    <span style={{ flex: 1, minWidth: 0 }}>
                      <span className="m-ell" style={{ display: 'block', fontSize: 14.5, fontWeight: 600 }}>{p.typeName || 'Membership'}</span>
                      <span className="m-dim" style={{ display: 'block', fontSize: 12.5 }}>
                        {p.status === 'succeeded' || p.status === 'paid' || p.status === 'completed' ? 'Paid' : p.status ? `${p.status[0].toUpperCase()}${p.status.slice(1)}` : ''} {fmtDate(p.date)}{p.method ? ` · ${p.method}` : ''}
                      </span>
                    </span>
                    <b style={{ fontWeight: 600 }}>{money(p.amount)}</b>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
      <button className="m-btn m-btn-g" onClick={() => setJoining(true)}>Join another club</button>
      {joining && (
        <Suspense fallback={null}>
          <JoinAnotherClubModal darkMode={!light} onClose={() => setJoining(false)} onSuccess={() => setJoining(false)} />
        </Suspense>
      )}
    </div>
  );
};

export default MembershipScreen;
