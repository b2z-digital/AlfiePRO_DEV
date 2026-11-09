/**
 * Race Management · No signal (board: "Scoring carries on"): what's saved on this phone and
 * waiting to send, and the bar the race screens show while anything waits.
 */
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Icon } from '../icons';
import { flushOutbox, useOutbox } from '../outbox';
import { useMobile } from '../MobileContext';

const timeOf = (ms: number) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

/** "Scoring offline · 3 changes saved on this phone" (only while there's no signal or something waits). */
export const OfflineBar: React.FC = () => {
  const navigate = useNavigate();
  const { items, online } = useOutbox();
  if (online && !items.length) return null;
  return (
    <button className="m-offline-bar" onClick={() => navigate('/race-desk/sync')}>
      <Icon name="cloud" size={16} />
      <span style={{ flex: 1 }}>{online ? `Sending ${items.length} change${items.length === 1 ? '' : 's'}…` : items.length ? `Scoring offline · ${items.length} change${items.length === 1 ? '' : 's'} saved on this phone` : 'Scoring offline · everything you do is saved on this phone'}</span>
      <Icon name="chevron" size={14} />
    </button>
  );
};

export const SyncScreen: React.FC = () => {
  const navigate = useNavigate();
  const { toast } = useMobile();
  const { items, online } = useOutbox();
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (online && items.length) void flushOutbox(); }, [online]); // eslint-disable-line react-hooks/exhaustive-deps
  const title = !online ? 'Scoring offline' : items.length ? 'Sending…' : 'Everything is sent';
  return (
    <div className="m-stack">
      <header className="m-top">
        <button className="m-ibtn" aria-label="Back" onClick={() => navigate(-1)}><Icon name="back" /></button>
        <div className="m-disp" style={{ flex: 1, fontSize: 21, fontWeight: 700 }}>Sync</div>
        <span className={online ? 'm-dot-on' : 'm-sync-dot'} aria-label={online ? 'Online' : 'Offline'} />
      </header>
      <div className="m-card" style={{ padding: 20, textAlign: 'center' }}>
        <span className="m-tile" style={{ margin: '0 auto', width: 52, height: 52, borderRadius: 16, background: online && !items.length ? 'rgba(52,199,89,.16)' : 'rgba(255,159,10,.14)', color: online && !items.length ? 'var(--m-green-ink)' : 'var(--m-amber-ink)' }}>
          <Icon name={online && !items.length ? 'check' : 'cloud'} size={26} />
        </span>
        <div className="m-disp" style={{ fontSize: 20, fontWeight: 700, marginTop: 10 }}>{title}</div>
        <div className="m-mut" style={{ fontSize: 14, marginTop: 4, lineHeight: 1.45 }}>
          {items.length ? <>{items.length} change{items.length === 1 ? '' : 's'} saved on this phone.<br />{online ? 'Sending them now, oldest first.' : "They'll send by themselves when you're back online."}</> : 'Finishes, marks and the finish order are always kept on this phone while you score.'}
        </div>
      </div>
      {items.length > 0 && (
        <>
          <p className="m-lb m-dim" style={{ margin: '4px 2px 0' }}>Waiting to send</p>
          <div className="m-card" style={{ overflow: 'hidden' }}>
            {items.map(it => (
              <div key={it.id} className="m-li m-sync-row">
                <span className="m-sync-dot" />
                <span style={{ flex: 1, minWidth: 0, fontSize: 14.5 }}>{it.label}{it.tries ? <span className="m-dim"> · retrying</span> : null}</span>
                <span className="m-dim m-num" style={{ fontSize: 12.5 }}>{timeOf(it.at)}</span>
              </div>
            ))}
          </div>
          {online && <button className="m-btn m-btn-p" disabled={busy} onClick={async () => { setBusy(true); const n = await flushOutbox(); setBusy(false); toast(n ? `Sent ${n}` : 'Still waiting for a good connection'); }}>{busy ? 'Sending…' : 'Send now'}</button>}
        </>
      )}
      <div className="m-card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="check" size={16} style={{ flexShrink: 0, marginTop: 2, color: 'var(--m-green-ink)' }} />
        <span className="m-mut" style={{ fontSize: 13 }}>Publishing waits for signal. Members get the results as soon as it's back, in the order you confirmed them.</span>
      </div>
      <div className="m-card" style={{ padding: '12px 14px', display: 'flex', gap: 10, alignItems: 'flex-start' }}>
        <Icon name="people" size={16} style={{ flexShrink: 0, marginTop: 2 }} />
        <span className="m-mut" style={{ fontSize: 13 }}>Spotters need signal to call finishes with you; your own taps never do.</span>
      </div>
    </div>
  );
};
