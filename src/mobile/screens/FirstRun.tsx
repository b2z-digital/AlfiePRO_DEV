import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { isNative, nativePushEnabled } from '../../lib/native/platform';
import {
  BankDetails, MidCycleCredit, PendingRenewalPayment, RenewalType, effectiveRenewalAmount, getClubBankDetails, getPendingRenewalPayment, getRenewalOptions, submitRenewal,
} from '../../utils/membershipRenewal';
import { useMobile } from '../MobileContext';
import { Icon, AlfieSails } from '../icons';
import { Skeleton } from '../ui';
import { money } from '../club';

/* ─────────────── Remembered first-run choices ─────────────── */

export const FIRST_RUN = {
  club: 'alfie-m-club-chosen',
  push: 'alfie-m-push-asked',
  dueSnooze: 'alfie-m-due-snoozed-until',
};
export const flag = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
export const setFlag = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* ignore */ } };

const ROLE_LABEL: Record<string, string> = {
  admin: 'Admin', editor: 'Editor', member: 'Member', race_scorer: 'Race scorer', viewer: 'Viewer', owner: 'Owner',
  state_admin: 'Admin', national_admin: 'Admin', committee: 'Committee',
};
const initialsOf = (s: string) => s.split(/\s+/).filter(w => /^[A-Za-z]/.test(w)).map(w => w[0]).join('').slice(0, 3).toUpperCase();
const TILE = ['#0B4FA8', '#0F7A5A', '#5B2BB5', '#C25A0A', '#0A6F8A'];

export interface MAssoc { id: string; type: 'state' | 'national'; name: string; role: string; logo?: string | null }

export async function loadMyAssociations(userId: string | undefined): Promise<MAssoc[]> {
  if (!userId) return [];
  const [st, na] = await Promise.all([
    supabase.from('user_state_associations').select('role, state_associations(id, name, short_name, logo_url)').eq('user_id', userId),
    supabase.from('user_national_associations').select('role, national_associations(id, name, short_name, logo_url)').eq('user_id', userId),
  ]);
  return [
    ...(st.data || []).filter((r: any) => r.state_associations).map((r: any) => ({ id: r.state_associations.id, type: 'state' as const, name: r.state_associations.name, role: r.role, logo: r.state_associations.logo_url, short: r.state_associations.short_name })),
    ...(na.data || []).filter((r: any) => r.national_associations).map((r: any) => ({ id: r.national_associations.id, type: 'national' as const, name: r.national_associations.name, role: r.role, logo: r.national_associations.logo_url, short: r.national_associations.short_name })),
  ].map(({ short, ...a }: any) => ({ ...a, shortName: short }));
}

/* ─────────────── Choose your club ─────────────── */

const OrgRow: React.FC<{ id: string; name: string; sub: string; logo?: string | null; i: number; pick: string | null; setPick: (id: string) => void }> = ({ id, name, sub, logo, i, pick, setPick }) => (
  <button className="m-li" onClick={() => setPick(id)} aria-pressed={pick === id}>
    <span className="m-tile" style={{ background: logo ? '#fff' : TILE[i % TILE.length], color: '#fff', fontWeight: 700, fontSize: 12, overflow: 'hidden' }}>
      {logo ? <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : initialsOf(name)}
    </span>
    <span style={{ flex: 1, minWidth: 0 }}>
      <span className="m-ell" style={{ display: 'block', fontWeight: 600, fontSize: 15.5 }}>{name}</span>
      <span className="m-mut" style={{ display: 'block', fontSize: 13 }}>{sub}</span>
    </span>
    <span style={{ width: 24, height: 24, borderRadius: 999, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', ...(pick === id ? { background: 'var(--m-blue)', color: '#fff' } : { border: '1.5px solid var(--m-fill-b)' }) }}>
      {pick === id && <Icon name="check" size={14} strokeWidth={3} />}
    </span>
  </button>
);


export const ChooseClubScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user, userClubs, currentClub, currentOrganization, setCurrentClub, setCurrentOrganization } = useAuth();
  const { profile, tap } = useMobile();
  const [assocs, setAssocs] = useState<(MAssoc & { shortName?: string })[]>([]);
  const [pick, setPick] = useState<string | null>(currentOrganization && currentOrganization.type !== 'club' ? currentOrganization.id : currentClub?.clubId || null);
  const [remember, setRemember] = useState(true);
  useEffect(() => { loadMyAssociations(user?.id).then(setAssocs).catch(() => {}); }, [user?.id]);

  const go = () => {
    if (!pick) return;
    tap('success');
    const club = userClubs.find(c => c.clubId === pick);
    if (club) {
      setCurrentClub(club);
      setCurrentOrganization(null);
    } else {
      const a = assocs.find(x => x.id === pick);
      if (a) {
        setCurrentOrganization({ id: a.id, type: a.type, name: a.shortName || a.name, role: a.role });
        setCurrentClub(null);
      }
    }
    setFlag(FIRST_RUN.club, remember ? 'remember' : 'session');
    try { sessionStorage.setItem(FIRST_RUN.club, '1'); } catch { /* ignore */ }
    navigate('/', { replace: true });
  };

  const first = profile.firstName || 'there';
  const counts = [userClubs.length && `${userClubs.length} ${userClubs.length === 1 ? 'club' : 'clubs'}`, assocs.length && `${assocs.length} ${assocs.length === 1 ? 'association' : 'associations'}`].filter(Boolean).join(' and ');
  return (
    <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <div style={{ height: 44, display: 'flex', alignItems: 'center' }}>
        {window.history.length > 1 && <button className="m-ibtn" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>}
      </div>
      <h2 className="m-disp" style={{ margin: '6px 0 0', fontSize: 30, fontWeight: 700, lineHeight: 1.1 }}>Hi {first}.<br />Which club today?</h2>
      {counts && <p className="m-mut" style={{ margin: 0, fontSize: 15 }}>You're a member of {counts}.</p>}
      {userClubs.length > 0 && (
        <div className="m-card" style={{ marginTop: 6 }}>
          {userClubs.map((c, i) => <OrgRow key={c.clubId} id={c.clubId} name={c.club?.name || 'Club'} sub={ROLE_LABEL[c.role] || 'Member'} logo={c.club?.logo} i={i} pick={pick} setPick={setPick} />)}
        </div>
      )}
      {assocs.length > 0 && (
        <>
          <p className="m-lb m-mut" style={{ margin: '10px 0 0' }}>{assocs.length === 1 ? 'Association' : 'Associations'}</p>
          <div className="m-card">{assocs.map((a, i) => <OrgRow key={a.id} id={a.id} name={a.name} sub={ROLE_LABEL[a.role] || 'Committee'} logo={a.logo} i={i + 2} pick={pick} setPick={setPick} />)}</div>
        </>
      )}
      <div style={{ flex: 1 }} />
      <label className="m-row m-mut" style={{ gap: 10, fontSize: 14.5 }}>
        <input type="checkbox" checked={remember} onChange={e => setRemember(e.target.checked)} style={{ width: 20, height: 20, accentColor: '#0A84FF' }} />
        Remember my choice
      </label>
      <button className="m-btn m-btn-p" onClick={go} disabled={!pick}>Continue</button>
    </div>
  );
};

/* ─────────────── Turn on notifications ─────────────── */

export const NOTIFY_KINDS: { key: string; label: string; def: boolean }[] = [
  { key: 'notify_race_reminders', label: 'Race reminders', def: true },
  { key: 'notify_race_results', label: 'Results and standings', def: true },
  { key: 'notify_messages', label: 'Messages and replies', def: true },
  { key: 'notify_calendar_events', label: 'Live broadcasts and events', def: true },
  { key: 'notify_news', label: 'Club news', def: false },
];

export async function saveNotificationPrefs(userId: string, prefs: Record<string, boolean>) {
  const { error } = await supabase.from('user_notification_preferences').upsert({ user_id: userId, ...prefs, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });
  if (error) throw error;
}

export const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; label: string }> = ({ on, onChange, label }) => (
  <button role="switch" aria-checked={on} aria-label={label} className={`m-tg ${on ? 'm-tg-on' : ''}`} onClick={() => onChange(!on)} />
);

export const NotificationsPromptScreen: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { tap, toast } = useMobile();
  const [prefs, setPrefs] = useState<Record<string, boolean>>(() => Object.fromEntries(NOTIFY_KINDS.map(k => [k.key, k.def])));
  const [busy, setBusy] = useState(false);

  const done = () => { setFlag(FIRST_RUN.push, new Date().toISOString()); navigate('/', { replace: true }); };
  const turnOn = async () => {
    setBusy(true);
    try {
      if (user?.id) await saveNotificationPrefs(user.id, { ...prefs, push_notifications: true });
      if (isNative && nativePushEnabled) {
        const { requestAndRegister } = await import('../../lib/native/push');
        const ok = await requestAndRegister();
        if (!ok) toast('You can turn notifications on later in Settings.');
      }
      tap('success');
    } catch { /* preferences are optional */ } finally {
      setBusy(false);
      done();
    }
  };

  const samples = [
    { t: 'Racing tomorrow', b: 'Your next race is tomorrow. Are you going?', s: 1, o: 1 },
    { t: 'Results are in', b: 'See where you finished in the latest round.', s: .97, o: .8 },
    { t: 'Live on AlfieTV', b: 'A broadcast from your club has started.', s: .94, o: .55 },
  ];
  return (
    <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <div className="m-stack" style={{ gap: 8, marginTop: 26 }} aria-hidden="true">
        {samples.map(n => (
          <div key={n.t} className="m-push" style={{ opacity: n.o, transform: `scale(${n.s})` }}>
            <span className="m-appi"><AlfieSails size={18} light={false} /></span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="m-row" style={{ fontSize: 13.5, fontWeight: 600 }}>{n.t}{n.s === 1 && <span className="m-mut" style={{ marginLeft: 'auto', fontWeight: 400, fontSize: 12 }}>now</span>}</div>
              <div className="m-mut" style={{ fontSize: 13 }}>{n.b}</div>
            </div>
          </div>
        ))}
      </div>
      <h2 className="m-disp" style={{ margin: '14px 0 0', fontSize: 28, fontWeight: 700, lineHeight: 1.1 }}>Never miss a start</h2>
      <p className="m-mut" style={{ margin: 0, fontSize: 15, lineHeight: 1.45 }}>Choose what Alfie tells you about. You can change this later in Me › Settings.</p>
      <div className="m-card">
        {NOTIFY_KINDS.map(k => (
          <div key={k.key} className="m-li">
            <span style={{ flex: 1, fontSize: 15 }}>{k.label}</span>
            <Toggle on={prefs[k.key]} label={k.label} onChange={v => setPrefs(p => ({ ...p, [k.key]: v }))} />
          </div>
        ))}
      </div>
      <div style={{ flex: 1 }} />
      <button className="m-btn m-btn-p" onClick={turnOn} disabled={busy}>{busy ? 'One moment…' : 'Turn on notifications'}</button>
      <button className="m-btn" style={{ background: 'none', color: 'var(--m-mut)' }} onClick={done}>Not now</button>
    </div>
  );
};

/* ─────────────── Membership due (softened gate) ─────────────── */

export const MembershipDueScreen: React.FC = () => {
  const navigate = useNavigate();
  const { unfinancialMemberData: m, user } = useAuth();
  const { profile, toast, tap } = useMobile();
  const [opts, setOpts] = useState<{ types: RenewalType[]; clubHasStripe: boolean; credit: MidCycleCredit | null } | null>(null);
  const [type, setType] = useState<RenewalType | null>(null);
  const [pending, setPending] = useState<PendingRenewalPayment | null>(null);
  const [busy, setBusy] = useState(false);
  const [club, setClub] = useState<{ name: string; abbreviation?: string; logo?: string | null } | null>(null);
  const [bank, setBank] = useState<BankDetails | null>(null);

  useEffect(() => {
    if (!m) return;
    getRenewalOptions(m).then(o => { setOpts({ types: o.types, clubHasStripe: o.clubHasStripe, credit: o.midCycleCredit }); setType(o.preselected || o.types[0] || null); }).catch(() => setOpts({ types: [], clubHasStripe: false, credit: null }));
    getPendingRenewalPayment(m.member_id).then(setPending).catch(() => {});
    getClubBankDetails(m.club_id).then(setBank).catch(() => {});
    supabase.from('clubs').select('name, abbreviation, logo').eq('id', m.club_id).maybeSingle().then(({ data }) => setClub(data));
  }, [m?.member_id]); // eslint-disable-line react-hooks/exhaustive-deps

  const later = () => {
    setFlag(FIRST_RUN.dueSnooze, String(Date.now() + 24 * 3600e3));
    try { sessionStorage.setItem(FIRST_RUN.dueSnooze, '1'); } catch { /* ignore */ }
    navigate('/', { replace: true });
  };

  if (!m) {
    return (
      <div className="m-stack">
        <div className="m-card m-empty">Your membership is up to date.</div>
        <button className="m-btn m-btn-p" onClick={() => navigate('/', { replace: true })}>Continue</button>
      </div>
    );
  }

  const amount = effectiveRenewalAmount(type, opts?.credit || null);
  const pay = async (method: 'stripe' | 'bank_transfer') => {
    if (!type || !opts) return;
    setBusy(true);
    try {
      const back = isNative ? 'https://alfiepro.com.au' : window.location.origin;
      const r = await submitRenewal({ member: m, type, method, clubHasStripe: opts.clubHasStripe, midCycleCredit: opts.credit, successUrl: `${back}/?payment=success`, cancelUrl: `${back}/?payment=cancelled` });
      if (r.kind === 'redirect') {
        if (isNative) {
          const { Browser } = await import('@capacitor/browser');
          await Browser.open({ url: r.url });
          Browser.addListener('browserFinished', () => window.location.reload()).catch(() => {});
        } else window.location.href = r.url;
        return;
      }
      if (r.kind === 'completed') { tap('success'); toast("You're renewed"); setTimeout(() => window.location.reload(), 1200); }
      if (r.kind === 'pending') { tap('success'); setPending(r.pending); }
    } catch (e: any) {
      toast(e?.message || "Couldn't start the renewal. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const ended = m.renewal_date ? new Date(m.renewal_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' }) : null;
  const name = `${profile.firstName} ${profile.lastName}`.trim();
  const year = (() => { const n = new Date(); const y = n.getMonth() >= 6 ? n.getFullYear() : n.getFullYear() - 1; return `${y}–${String(y + 1).slice(2)}`; })();
  const abbr = club?.abbreviation || initialsOf(club?.name || m.club_name);

  return (
    <div className="m-stack" style={{ minHeight: 'calc(100dvh - var(--m-safe-top) - var(--m-safe-bottom) - 40px)' }}>
      <div style={{ height: 44 }} />
      <div className="m-card m-spec" style={{ padding: 22, borderRadius: 24, display: 'flex', flexDirection: 'column', gap: 16, color: '#fff', background: 'linear-gradient(160deg,#0B4FA8 0%,#0F1726 70%) padding-box, var(--m-spectrum) border-box' }}>
        <div className="m-row">
          <span className="m-tile" style={{ background: '#fff', color: '#0B4FA8', fontWeight: 700, fontSize: 12, overflow: 'hidden' }}>{club?.logo ? <img src={club.logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} /> : abbr}</span>
          <div style={{ flex: 1, minWidth: 0 }}><div className="m-ell" style={{ fontWeight: 600 }}>{club?.name || m.club_name}</div><div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{m.membership_level || 'Member'}</div></div>
          <span style={{ height: 24, padding: '0 9px', borderRadius: 999, background: pending ? 'rgba(52,199,89,.2)' : 'rgba(255,159,10,.2)', color: pending ? '#7DE39A' : '#FFC062', fontSize: 12, fontWeight: 700, display: 'flex', alignItems: 'center' }}>{pending ? 'SENT' : 'DUE'}</span>
        </div>
        <div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.7)' }}>{name}</div>
          <div className="m-disp" style={{ fontSize: 26, fontWeight: 700 }}>{m.is_new_member ? 'Complete your membership' : `Renew for ${year}`}</div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.75)', marginTop: 2 }}>
            {pending ? `Your ${pending.payment_method === 'bank_transfer' ? 'bank transfer' : 'payment'} of ${money(pending.amount)} is with the club to confirm.` : ended ? `Your membership ended on ${ended}.` : 'Your membership needs paying.'}
          </div>
        </div>
      </div>

      {!pending && (opts === null ? <Skeleton h={140} /> : opts.types.length === 0 ? (
        <div className="m-card m-empty">Your club hasn't set its membership fees in AlfiePRO yet. Contact the club to renew.</div>
      ) : (
        <div className="m-card">
          {opts.types.map(t => (
            <button key={t.id} className="m-li" onClick={() => setType(t)} aria-pressed={type?.id === t.id}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15 }}>{t.name}</span>
                {t.description && <span className="m-mut m-ell" style={{ display: 'block', fontSize: 13 }}>{t.description}</span>}
              </span>
              <span className="m-disp" style={{ fontSize: 20, fontWeight: 700 }}>{money(t.amount)}</span>
              <span style={{ width: 22, height: 22, borderRadius: 999, flexShrink: 0, ...(type?.id === t.id ? { background: 'var(--m-blue)' } : { border: '1.5px solid var(--m-fill-b)' }) }} />
            </button>
          ))}
          {opts.credit && type && (
            <div className="m-li"><span style={{ flex: 1, fontSize: 15 }}>Association fee already paid</span><span style={{ fontWeight: 600, color: '#7DE39A' }}>−{money(opts.credit.credit_amount)}</span></div>
          )}
          <div className="m-li"><span style={{ flex: 1, fontWeight: 600 }}>Total</span><span className="m-disp" style={{ fontSize: 22, fontWeight: 700 }}>{money(amount)}</span></div>
        </div>
      ))}

      {pending?.payment_method === 'bank_transfer' && bank && (
        <div className="m-card">
          <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Pay</span><b>{money(pending.amount)}</b></div>
          {bank.bank_name && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Bank</span><b>{bank.bank_name}</b></div>}
          {bank.bsb && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>BSB</span><b className="m-num">{bank.bsb}</b></div>}
          {bank.account_number && <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Account</span><b className="m-num">{bank.account_number}</b></div>}
          <div className="m-li"><span className="m-mut" style={{ flex: 1 }}>Reference</span><b>{profile.firstName} {profile.lastName}</b></div>
        </div>
      )}
      <p className="m-mut" style={{ margin: 0, fontSize: 13.5, lineHeight: 1.45 }}>
        Racing answers, chats and posting open again once you've renewed. Results, AlfieTV and Ask Alfie stay open.
      </p>
      <div style={{ flex: 1 }} />
      {!pending && type && (
        <>
          {opts?.clubHasStripe && amount > 0 && <button className="m-btn m-btn-p" onClick={() => pay('stripe')} disabled={busy}>{busy ? 'One moment…' : `Renew now · ${money(amount)}`}</button>}
          {amount === 0 && <button className="m-btn m-btn-p" onClick={() => pay('bank_transfer')} disabled={busy}>Renew now</button>}
          {amount > 0 && <button className="m-btn m-btn-g" onClick={() => pay('bank_transfer')} disabled={busy}>{opts?.clubHasStripe ? "I've paid the club directly" : `Renew by bank transfer · ${money(amount)}`}</button>}
        </>
      )}
      <button className="m-btn" style={{ background: 'none', color: 'var(--m-mut)' }} onClick={later}>{pending ? 'Continue' : 'Remind me later'}</button>
      {user && !pending && <div className="m-dim" style={{ fontSize: 12, textAlign: 'center' }}>Bank transfers are recorded as pending until the club confirms them.</div>}
    </div>
  );
};
