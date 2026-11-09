import { useEffect, useRef, useState } from 'react';
import { Wallet, ChevronDown, ChevronUp, Settings2 } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useNotification } from '../../contexts/NotificationContext';
import {
  adjustCredit, confirmTopUps, estimateCents, money, saveCreditSettings, startTopUp,
  type CreditSettings, type CreditSummary,
} from '../../utils/livestreamCredit';

/**
 * Livestream credit card (broadcasts board, right column): balance, prices, top-up packs through
 * Stripe and recent charges. Super admins also get the price settings and manual adjustments.
 */
export function LivestreamCreditCard({ clubId, credit, onChange }: { clubId: string; credit: CreditSummary | null; onChange: () => void }) {
  const { isSuperAdmin } = useAuth();
  const { addNotification } = useNotification();
  const [busy, setBusy] = useState<number | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const confirmedRef = useRef(false);

  // Back from Stripe (or any visit): credit paid checkouts, once per mount
  useEffect(() => {
    if (confirmedRef.current || !credit) return;
    confirmedRef.current = true;
    const params = new URLSearchParams(window.location.search);
    const returned = params.get('credit');
    if (returned) {
      params.delete('credit'); params.delete('checkout');
      const q = params.toString();
      window.history.replaceState(null, '', window.location.pathname + (q ? `?${q}` : '') + window.location.hash);
    }
    if (returned === 'cancelled') addNotification('info', 'Top-up cancelled. Nothing was charged.', 4000);
    confirmTopUps(clubId)
      .then(({ credited }) => {
        if (credited > 0) { addNotification('success', `${money(credited)} livestream credit added`, 5000); onChange(); }
        else if (returned === 'done') addNotification('info', 'Payment received. The credit will show in a moment.', 5000);
      })
      .catch(() => { if (returned === 'done') addNotification('warning', 'Could not confirm the payment yet. Refresh in a minute.', 6000); });
  }, [clubId, credit, addNotification, onChange]);

  if (!credit) return null;
  const s = credit.settings;
  const low = credit.balance_cents < s.low_balance_cents;
  const testLeft = Math.max(0, Math.round(s.free_test_minutes - credit.test_minutes_used));

  const topUp = async (cents: number) => {
    setBusy(cents);
    try { await startTopUp(clubId, cents); }
    catch (e) { addNotification('error', e instanceof Error ? e.message : 'Could not open the payment page'); setBusy(null); }
  };

  return (
    <div className="alv-card" style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span className="alv-dot" style={{ background: 'rgba(42,147,255,0.14)' }}><Wallet size={17} color="#8CC4FF" aria-hidden="true" /></span>
        <span className="alv-disp" style={{ fontSize: 18, fontWeight: 700, flex: 1 }}>Livestream credit</span>
        {isSuperAdmin && (
          <button type="button" className="alv-ib" onClick={() => setShowAdmin(v => !v)} aria-expanded={showAdmin} aria-label="Credit settings" title="Credit settings (super admin)">
            <Settings2 size={16} />
          </button>
        )}
      </div>

      {credit.exempt ? (
        <span className="alv-mute" style={{ fontSize: 13.5 }}>This club isn't charged for livestreams.</span>
      ) : (
        <>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span className="alv-disp" style={{ fontSize: 30, fontWeight: 700, color: credit.balance_cents < 0 ? '#FF8796' : undefined }}>{money(credit.balance_cents)}</span>
            {low && s.enforce && <span className="alv-chip is-test" style={{ height: 22 }}>Low</span>}
          </div>
          <span className="alv-mute" style={{ fontSize: 13, lineHeight: 1.5 }}>
            Recording races is free. Going live in AlfieTV costs {money(s.device_hour_cents)} an hour
            ({money(s.cloud_hour_cents)} for cloud production) plus {money(s.viewer_unit_cents)} per {s.viewer_unit_minutes.toLocaleString()} viewer minutes.
            A 3-hour club day with 20 viewers is about {money(estimateCents(s, 3, 20))}.
            {testLeft > 0 ? ` ${testLeft} free test minutes left this month.` : ''}
          </span>
          {!s.enforce && (
            <span className="alv-mute" style={{ fontSize: 12.5 }}>Charging hasn't started yet, so livestreams are free for now.</span>
          )}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {s.packs_cents.map(c => (
              <button key={c} type="button" className="alv-btn is-small alv-btn-p" disabled={busy !== null} onClick={() => topUp(c)}>
                {busy === c ? 'Opening…' : `Add ${money(c)}`}
              </button>
            ))}
          </div>
        </>
      )}

      {credit.history.length > 0 && (
        <div>
          <button type="button" className="alv-btn is-small" onClick={() => setShowHistory(v => !v)} aria-expanded={showHistory}>
            {showHistory ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
            History
          </button>
          {showHistory && (
            <ul style={{ listStyle: 'none', margin: '10px 0 0', padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
              {credit.history.map(h => (
                <li key={h.id} style={{ display: 'flex', gap: 10, fontSize: 13 }}>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{h.description || (h.kind === 'topup' ? 'Top-up' : 'Adjustment')}</span>
                    <span className="alv-mute" style={{ fontSize: 12 }}>
                      {[new Date(h.created_at).toLocaleDateString([], { day: 'numeric', month: 'short' }),
                        h.kind === 'usage' && h.live_minutes != null ? `${Math.round(Number(h.live_minutes))} min live` : null,
                        h.kind === 'usage' && h.viewer_minutes ? `${h.viewer_minutes.toLocaleString()} viewer min` : null].filter(Boolean).join(' · ')}
                    </span>
                  </span>
                  <span className="alv-mono" style={{ color: h.amount_cents > 0 ? '#5BD69A' : undefined }}>{h.amount_cents > 0 ? '+' : ''}{money(h.amount_cents)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {isSuperAdmin && showAdmin && <CreditAdmin clubId={clubId} settings={s} onSaved={onChange} />}
    </div>
  );
}

function CreditAdmin({ clubId, settings, onSaved }: { clubId: string; settings: CreditSettings; onSaved: () => void }) {
  const { addNotification } = useNotification();
  const [form, setForm] = useState({
    enforce: settings.enforce,
    device: settings.device_hour_cents / 100,
    cloud: settings.cloud_hour_cents / 100,
    viewer: settings.viewer_unit_cents / 100,
    freeTest: settings.free_test_minutes,
    min: settings.min_balance_cents / 100,
    packs: settings.packs_cents.map(c => c / 100).join(', '),
  });
  const [adjust, setAdjust] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const cents = (v: number) => Math.round(Number(v) * 100);

  const save = async () => {
    const packs = form.packs.split(/[,\s]+/).map(Number).filter(n => n >= 10 && n <= 1000).map(cents);
    setSaving(true);
    try {
      await saveCreditSettings({
        enforce: form.enforce,
        device_hour_cents: cents(form.device), cloud_hour_cents: cents(form.cloud),
        viewer_unit_cents: cents(form.viewer), free_test_minutes: Math.round(form.freeTest),
        min_balance_cents: cents(form.min), packs_cents: packs.length ? packs : settings.packs_cents,
      });
      addNotification('success', 'Livestream prices saved (all clubs)', 3000);
      onSaved();
    } catch (e) {
      addNotification('error', e instanceof Error ? e.message : 'Could not save');
    } finally { setSaving(false); }
  };

  const doAdjust = async () => {
    const value = cents(Number(adjust));
    if (!value) return;
    setSaving(true);
    try {
      const balance = await adjustCredit(clubId, value, note);
      addNotification('success', `Balance is now ${money(balance)}`, 3000);
      setAdjust(''); setNote('');
      onSaved();
    } catch (e) {
      addNotification('error', e instanceof Error ? e.message : 'Could not adjust');
    } finally { setSaving(false); }
  };

  const field = (label: string, key: 'device' | 'cloud' | 'viewer' | 'freeTest' | 'min', suffix: string) => (
    <label style={{ display: 'grid', gridTemplateColumns: '1fr 92px', alignItems: 'center', gap: 8, fontSize: 13 }}>
      <span>{label} <span className="alv-mute">{suffix}</span></span>
      <input type="number" min={0} step={key === 'freeTest' ? 10 : 0.5} className="alv-input" style={{ height: 34 }}
        value={form[key]} onChange={e => setForm(f => ({ ...f, [key]: Number(e.target.value) }))} />
    </label>
  );

  return (
    <div style={{ borderTop: '1px solid var(--alv-line)', paddingTop: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <span className="alv-eyebrow">Super admin · all clubs</span>
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13.5 }}>
        <input type="checkbox" checked={form.enforce} onChange={e => setForm(f => ({ ...f, enforce: e.target.checked }))} />
        Charge clubs for livestreams (blocks going live without credit)
      </label>
      {field('Device / encoder', 'device', '$ per hour')}
      {field('Cloud production', 'cloud', '$ per hour')}
      {field('Viewers', 'viewer', `$ per ${settings.viewer_unit_minutes} min`)}
      {field('Free test minutes', 'freeTest', 'per month')}
      {field('Credit needed to go live', 'min', '$')}
      <label style={{ display: 'grid', gridTemplateColumns: '1fr 140px', alignItems: 'center', gap: 8, fontSize: 13 }}>
        <span>Top-up packs <span className="alv-mute">$</span></span>
        <input className="alv-input" style={{ height: 34 }} value={form.packs} onChange={e => setForm(f => ({ ...f, packs: e.target.value }))} />
      </label>
      <button type="button" className="alv-btn is-small alv-btn-p" onClick={save} disabled={saving}>Save prices</button>

      <span className="alv-eyebrow" style={{ marginTop: 6 }}>Adjust this club's balance</span>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <input type="number" step={1} placeholder="Amount $" title="Use a minus sign to deduct" className="alv-input" style={{ height: 34, width: 120 }} value={adjust} onChange={e => setAdjust(e.target.value)} />
        <input placeholder="Note" className="alv-input" style={{ height: 34, flex: 1, minWidth: 120 }} value={note} onChange={e => setNote(e.target.value)} maxLength={200} />
        <button type="button" className="alv-btn is-small" onClick={doAdjust} disabled={saving || !Number(adjust)}>Apply</button>
      </div>
    </div>
  );
}
