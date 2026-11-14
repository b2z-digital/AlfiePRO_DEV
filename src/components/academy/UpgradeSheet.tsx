// "Part of Academy": shown at the moment a free skipper reaches for something Academy has, never
// mid-race. It says what they'd get, the price that applies to them (the member price when their
// AlfiePRO club membership earns it), and offers the free week if they haven't had one. Always with
// a way to carry on free.
import { type CSSProperties, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { type Feature, type Interval, SELL, money } from './plans';
import { type AcademyPlan, type Quote, fallbackQuote } from './usePlan';

const IMAGE: Partial<Record<Feature, string>> = {
  level: 'race', venue: 'gums', class: 'sails', transmitter: 'transmitter', lesson: 'drill', circuit: 'circuit',
  programme: 'drill', lab: 'topview', trainer: 'start-line', playbook: 'drill', judge: 'topview', ro: 'heats',
  replay: 'broadcast', year: 'circuit', world: 'clubs', yacht: 'yacht', events: 'heats', challenge: 'race', host: 'race', rehearse: 'venue', all: 'hero',
};

const DISPLAY = "'Bricolage Grotesque', 'Instrument Sans', system-ui, sans-serif";

export interface UpgradeSheetProps {
  feature: Feature;
  plan: AcademyPlan;
  /** A free way to carry on, when there is one (e.g. "Race on the keyboard instead"). */
  alt?: { label: string; onClick: () => void } | null;
  onClose: () => void;
}

export default function UpgradeSheet({ feature, plan, alt = null, onClose }: UpgradeSheetProps) {
  const sell = SELL[feature];
  const [quote, setQuote] = useState<Quote | null>(null);
  const [interval, setIv] = useState<Interval>('year');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    void plan.quote().then(q => { if (live) setQuote(q ?? fallbackQuote()); });
    return () => { live = false; };
  }, [plan]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = quote ?? fallbackQuote();
  const price = money(q.prices[interval]);
  const saving = money(Math.max(0, Math.floor((q.prices.month * 12 - q.prices.year) / 100) * 100));
  const go = async () => {
    setBusy(true); setErr(null);
    const e = await plan.checkout(interval);
    if (e) { setErr(e); setBusy(false); }
  };

  return (
    <div role="presentation" onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 80, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, background: 'rgba(3,7,16,.78)', backdropFilter: 'blur(6px)' }}>
      <section role="dialog" aria-modal="true" aria-labelledby="up-title" onClick={e => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 940, maxHeight: 'calc(100vh - 48px)', overflow: 'auto', display: 'flex', flexWrap: 'wrap', borderRadius: 26, background: '#0A1324', border: '1px solid rgba(255,255,255,.12)', boxShadow: '0 30px 80px rgba(0,0,0,.55)', color: '#F1F4FA', fontFamily: "'Instrument Sans', system-ui, sans-serif" }}>
        <div style={{ position: 'relative', flex: '1 1 340px', minHeight: 280 }}>
          <img src={`/academy/${IMAGE[feature] ?? 'race'}.jpg`} alt="" aria-hidden="true" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: IMAGE[feature] === 'hero' ? '80% center' : 'center' }} />
        </div>
        <div style={{ flex: '1 1 400px', boxSizing: 'border-box', padding: '30px 34px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
            <span style={{ padding: '5px 12px', borderRadius: 999, background: 'rgba(77,163,255,.14)', color: '#9CCBFF', fontSize: 13, fontWeight: 700, letterSpacing: '.06em' }}>PART OF ACADEMY</span>
            <button type="button" aria-label="Close" onClick={onClose} style={{ display: 'grid', placeItems: 'center', width: 44, height: 44, margin: '-8px -8px 0 0', borderRadius: 999, border: 0, background: 'transparent', color: '#F1F4FA', cursor: 'pointer' }}><X size={20} aria-hidden="true" /></button>
          </div>
          <h2 id="up-title" style={{ margin: 0, fontFamily: DISPLAY, fontSize: 32, fontWeight: 700, lineHeight: 1.08, letterSpacing: '-.02em' }}>{sell.title}</h2>
          <p style={{ margin: 0, color: 'rgba(235,240,255,.84)', fontSize: 17, lineHeight: 1.5 }}>{sell.line}</p>
          {q.club && <p style={{ margin: 0, fontSize: 15, color: '#FFCB96', fontWeight: 600 }}>Member price, through {q.club.name}.</p>}

          <fieldset style={{ margin: 0, padding: 0, border: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <legend style={{ padding: 0, marginBottom: 10, fontSize: 15, fontWeight: 700, color: 'rgba(235,240,255,.86)' }}>{q.trial ? `After your free week` : 'Your price'}</legend>
            {(['year', 'month'] as const).map(iv => (
              <label key={iv} style={{ display: 'flex', alignItems: 'center', gap: 14, minHeight: 60, padding: '0 18px', borderRadius: 16, border: `2px solid ${interval === iv ? '#4DA3FF' : 'rgba(255,255,255,.14)'}`, background: interval === iv ? '#0E1E3D' : 'transparent', cursor: 'pointer' }}>
                <input type="radio" name="academy-interval" checked={interval === iv} onChange={() => setIv(iv)} style={{ width: 22, height: 22, accentColor: '#4DA3FF' }} />
                <span style={{ flex: 1 }}><strong style={{ fontSize: 17 }}>{iv === 'year' ? 'Yearly' : 'Monthly'}</strong>
                  {iv === 'year' && <span style={{ marginLeft: 8, padding: '2px 8px', borderRadius: 999, background: '#FF9F43', color: '#060B16', fontSize: 12, fontWeight: 800 }}>SAVE {saving}</span>}</span>
                <strong style={{ fontSize: 17 }}>{money(q.prices[iv])}</strong>
              </label>
            ))}
          </fieldset>

          <button type="button" onClick={() => void go()} disabled={busy}
            style={{ minHeight: 60, borderRadius: 999, border: 0, background: '#1A66DB', color: '#fff', fontSize: 18, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.7 : 1 }}>
            {busy ? 'Opening secure payment…' : q.trial ? 'Start my free week' : `Join Academy for ${price} a ${interval}`}
          </button>
          <p style={{ margin: '-4px 0 0', textAlign: 'center', fontSize: 14, color: 'rgba(235,240,255,.78)' }}>
            {q.trial ? `Nothing charged for ${q.trialDays} days, then ${price} a ${interval}. Stop any time in two taps.` : 'Apple Pay, Google Pay or card. Stop any time in two taps.'}
          </p>
          {err && <p role="alert" style={{ margin: 0, textAlign: 'center', fontSize: 15, color: '#FCA5A5' }}>{err}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', fontSize: 15 }}>
            {alt ? <button type="button" onClick={alt.onClick} style={linkBtn}>{alt.label}</button> : <span />}
            <button type="button" onClick={onClose} style={{ ...linkBtn, color: '#F1F4FA', fontWeight: 600 }}>Not now, keep sailing free</button>
          </div>
        </div>
      </section>
    </div>
  );
}

const linkBtn: CSSProperties = { minHeight: 44, padding: 0, border: 0, background: 'transparent', color: '#9CCBFF', font: 'inherit', cursor: 'pointer', textDecoration: 'underline', textUnderlineOffset: 3 };
