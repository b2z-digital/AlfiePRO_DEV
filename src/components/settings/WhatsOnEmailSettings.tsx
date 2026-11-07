import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { AlfieIcon } from '../brand/AlfieIcon';
import { ASwitch, avatarColour, initialsOf } from '../alfie/Kit';

/* ─────────────────────────────────────────────────────────────────────────────
   Settings → Membership → Email templates.
   Left: the club's email templates. What's On is edited here; the others open the
   existing template editor. Middle: What's On settings. Right: live preview + stats.
   Everything is read and written through the whats_on_* RPCs.
   ───────────────────────────────────────────────────────────────────────────── */

type Freq = 'weekly' | 'fortnightly' | 'monthly';

export interface WhatsOnForm {
  enabled: boolean;
  frequency: Freq;
  send_day: number;
  send_time: string;
  timezone: string;
  covers_days: number;
  skip_empty: boolean;
  audience: 'class' | 'all';
  include_unactivated: boolean;
  include_unfinancial: boolean;
  show_rsvp: boolean;
  show_details: boolean;
  show_docs: boolean;
  show_other: boolean;
  show_next_week: boolean;
  show_alfie_panel: boolean;
  help_enabled: boolean;
  help_member_id: string | null;
  help_title: string | null;
  help_show_phone: boolean;
  help_show_email: boolean;
  help_email: string | null;
  subject: string | null;
  intro: string | null;
}

interface ServerSettings extends Partial<WhatsOnForm> {
  saved?: boolean;
  last_run_key?: string | null;
  last_scheduled_at?: string | null;
}

interface LastSend {
  sent_at: string;
  kind: string;
  recipients: number;
  skipped: number;
  unactivated: number;
  answers: number;
  activated_since: number;
}

interface Audience {
  total: number;
  activated: number;
  unactivated: number;
  this_week: number;
  members: { member_id: string; name: string; email: string; activated: boolean; classes: string[]; this_week: number }[];
}

interface Preview {
  subject: string;
  html: string;
  my_count: number;
  member_name: string;
  member_classes: string[];
  activated: boolean;
  sample: boolean;
}

interface ContactOption {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  email: string | null;
  title: string | null;
}

const FORM_KEYS: (keyof WhatsOnForm)[] = [
  'enabled', 'frequency', 'send_day', 'send_time', 'timezone', 'covers_days', 'skip_empty', 'audience',
  'include_unactivated', 'include_unfinancial', 'show_rsvp', 'show_details', 'show_docs', 'show_other',
  'show_next_week', 'show_alfie_panel', 'help_enabled', 'help_member_id', 'help_title', 'help_show_phone',
  'help_show_email', 'help_email', 'subject', 'intro',
];

const DEFAULT_FORM: WhatsOnForm = {
  enabled: false, frequency: 'weekly', send_day: 1, send_time: '08:00', timezone: 'Australia/Sydney', covers_days: 7,
  skip_empty: true, audience: 'class', include_unactivated: true, include_unfinancial: false, show_rsvp: true,
  show_details: true, show_docs: true, show_other: true, show_next_week: true, show_alfie_panel: true,
  help_enabled: false, help_member_id: null, help_title: null, help_show_phone: true, help_show_email: true,
  help_email: null, subject: null, intro: null,
};

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const TIMEZONES = [
  'Australia/Sydney', 'Australia/Melbourne', 'Australia/Brisbane', 'Australia/Adelaide', 'Australia/Perth',
  'Australia/Hobart', 'Australia/Darwin', 'Pacific/Auckland',
];
const TIMES = Array.from({ length: 34 }, (_, i) => {
  const mins = 5 * 60 + i * 30;
  return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
});
const MERGE_TAGS = ['{first_name}', '{club_name}', '{week_range}', '{event_count}', '{classes}'];

const toForm = (s: ServerSettings | null | undefined): WhatsOnForm => {
  const f = { ...DEFAULT_FORM } as any;
  if (s) FORM_KEYS.forEach(k => { if ((s as any)[k] !== undefined) f[k] = (s as any)[k]; });
  f.send_day = Number(f.send_day);
  f.covers_days = Number(f.covers_days);
  f.send_time = String(f.send_time || '08:00').slice(0, 5);
  return f;
};

const sameForm = (a: WhatsOnForm, b: WhatsOnForm) =>
  FORM_KEYS.every(k => ((a as any)[k] ?? null) === ((b as any)[k] ?? null));

export const fmtTime = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  const ap = h >= 12 ? 'pm' : 'am';
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, '0')} ${ap}`;
};

const tzLabel = (tz: string) => {
  const city = tz.split('/').pop()?.replace(/_/g, ' ') || tz;
  try {
    const abbr = new Intl.DateTimeFormat('en-AU', { timeZone: tz, timeZoneName: 'short' })
      .formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value;
    return abbr ? `${city} (${abbr})` : city;
  } catch {
    return city;
  }
};

/** The local calendar date and time in a time zone, as plain numbers. */
const localNow = (tz: string) => {
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date());
    const get = (t: string) => Number(parts.find(p => p.type === t)?.value);
    return { y: get('year'), m: get('month'), d: get('day'), mins: get('hour') * 60 + get('minute') };
  } catch {
    const n = new Date();
    return { y: n.getFullYear(), m: n.getMonth() + 1, d: n.getDate(), mins: n.getHours() * 60 + n.getMinutes() };
  }
};

/** Mirrors whats_on_run_due(): the next time this club's email will go out. */
export const nextSend = (f: WhatsOnForm, meta?: { last_run_key?: string | null; last_scheduled_at?: string | null }) => {
  const now = localNow(f.timezone);
  const base = Date.UTC(now.y, now.m - 1, now.d);
  const [h, m] = f.send_time.split(':').map(Number);
  const sendMins = h * 60 + m;
  const lastSched = meta?.last_scheduled_at ? new Date(meta.last_scheduled_at) : null;
  for (let i = 0; i < 70; i++) {
    const d = new Date(base + i * 86400000);
    if (d.getUTCDay() !== f.send_day) continue;
    const key = d.toISOString().slice(0, 10);
    if (i === 0 && (now.mins >= sendMins + 180 || meta?.last_run_key === key)) continue;
    if (f.frequency === 'monthly' && d.getUTCDate() > 7) continue;
    if (f.frequency === 'fortnightly' && lastSched && (d.getTime() - lastSched.getTime()) / 86400000 < 12.5) continue;
    return d;
  }
  return null;
};

const fmtDay = (d: Date) => `${DAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;

const scheduleSummary = (f: WhatsOnForm) => {
  const day = DAY_NAMES[f.send_day];
  const when = f.frequency === 'weekly' ? `Weekly · ${day}s` : f.frequency === 'fortnightly' ? `Fortnightly · ${day}s` : `Monthly · first ${day}`;
  return `${when} ${fmtTime(f.send_time)}`;
};

const isMissingRpc = (err: any) =>
  !!err && (err.code === 'PGRST202' || err.code === '42883' || /Could not find the function|does not exist/i.test(err.message || ''));

/* ─────────────────────────── Small building blocks ─────────────────────────── */

const Group: React.FC<{ dot: string; title: string; right?: React.ReactNode; desc?: React.ReactNode; children?: React.ReactNode }> = ({ dot, title, right, desc, children }) => (
  <section className="a-wo-card">
    <div className="a-wo-gh">
      <span className="a-sgh-dot" style={{ background: dot }} />
      <h3>{title}</h3>
      {right}
    </div>
    {desc && <p className="a-wo-gdesc">{desc}</p>}
    {children}
  </section>
);

const Row: React.FC<{ label: React.ReactNode; hint?: React.ReactNode; children?: React.ReactNode; stack?: boolean }> = ({ label, hint, children, stack }) => (
  <div className={`a-wo-fr ${stack ? 'a-wo-fr-stack' : ''}`}>
    <div className="a-wo-fl">{label}{hint && <small>{hint}</small>}</div>
    <div className="a-wo-fc">{children}</div>
  </div>
);

const ToggleRow: React.FC<{ label: string; hint?: React.ReactNode; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }> = ({ label, hint, checked, onChange, disabled }) => (
  <div className="a-wo-tr">
    <div className="a-wo-trl"><div className="a-wo-trt">{label}</div>{hint && <div className="a-wo-trh">{hint}</div>}</div>
    <ASwitch checked={checked} onChange={onChange} label={label} disabled={disabled} />
  </div>
);

function Seg<T extends string | number>({ value, options, onChange, label, disabled }: {
  value: T; options: { v: T; label: string }[]; onChange: (v: T) => void; label: string; disabled?: boolean;
}) {
  return (
    <div className="a-seg a-wo-seg" role="radiogroup" aria-label={label}>
      {options.map(o => (
        <button key={String(o.v)} type="button" role="radio" aria-checked={value === o.v} disabled={disabled}
          className={`a-seg-i ${value === o.v ? 'a-seg-on' : ''}`} onClick={() => onChange(o.v)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/* ─────────────────────────────── Preview frame ─────────────────────────────── */

const PreviewFrame: React.FC<{ html: string; mode: 'desktop' | 'phone' }> = ({ html, mode }) => {
  const boxRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [boxW, setBoxW] = useState(320);
  const [docH, setDocH] = useState(900);
  const width = mode === 'desktop' ? 680 : 375;
  const scale = Math.min(1, boxW / width);

  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setBoxW(el.clientWidth));
    ro.observe(el);
    setBoxW(el.clientWidth);
    return () => ro.disconnect();
  }, []);

  const measure = () => {
    try {
      const doc = frameRef.current?.contentDocument;
      if (doc) setDocH(Math.max(400, doc.documentElement.scrollHeight));
    } catch { /* cross-origin: keep the default height */ }
  };

  return (
    <div ref={boxRef} className="a-wo-pvbox">
      <div style={{ height: docH * scale, position: 'relative', overflow: 'hidden' }}>
        <iframe
          ref={frameRef}
          title="What's On email preview"
          srcDoc={html}
          sandbox="allow-same-origin"
          scrolling="no"
          onLoad={() => { measure(); setTimeout(measure, 400); }}
          style={{ width, height: docH, border: 0, transform: `scale(${scale})`, transformOrigin: 'top left', position: 'absolute', left: 0, top: 0, background: '#EEF2F7' }}
        />
      </div>
    </div>
  );
};

/* ───────────────────────────── What's On editor ───────────────────────────── */

const WhatsOnEditor: React.FC<{ clubId: string; clubAbbr: string; onSummary: (s: { enabled: boolean; label: string } | null) => void }> = ({ clubId, clubAbbr, onSummary }) => {
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [server, setServer] = useState<ServerSettings | null>(null);
  const [form, setForm] = useState<WhatsOnForm>(DEFAULT_FORM);
  const [lastSend, setLastSend] = useState<LastSend | null>(null);
  const [audience, setAudience] = useState<Audience | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'phone'>('phone');
  const [previewAs, setPreviewAs] = useState<string>('');
  const [showList, setShowList] = useState(false);
  const [contacts, setContacts] = useState<ContactOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [sendingNow, setSendingNow] = useState(false);
  const [confirmNow, setConfirmNow] = useState(false);
  const [editHelpEmail, setEditHelpEmail] = useState(false);
  const subjectRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLTextAreaElement>(null);
  const lastField = useRef<'subject' | 'intro'>('intro');

  const saved = useMemo(() => toForm(server), [server]);
  const dirty = !sameForm(form, saved);
  const set = <K extends keyof WhatsOnForm>(k: K, v: WhatsOnForm[K]) => setForm(f => ({ ...f, [k]: v }));

  const applyResult = useCallback((r: any) => {
    setServer(r?.settings || null);
    setForm(toForm(r?.settings));
    setLastSend(r?.last_send || null);
  }, []);

  // Load settings
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('whats_on_settings_get', { p_club: clubId });
      if (!alive) return;
      if (error) {
        if (isMissingRpc(error)) setMissing(true);
        else setLoadError(error.message || 'Could not load What\'s On settings');
      } else {
        applyResult(data);
      }
      setLoading(false);
    })();
    return () => { alive = false; };
  }, [clubId, applyResult]);

  // Committee first, then everyone else, for the help contact
  useEffect(() => {
    let alive = true;
    (async () => {
      const [{ data: members }, { data: positions }] = await Promise.all([
        supabase.from('members').select('id, first_name, last_name, phone, email').eq('club_id', clubId).order('first_name'),
        supabase.from('committee_positions').select('member_id, position_title').eq('club_id', clubId),
      ]);
      if (!alive) return;
      const titles = new Map<string, string>();
      (positions || []).forEach((p: any) => { if (p.member_id && p.position_title && !titles.has(p.member_id)) titles.set(p.member_id, p.position_title); });
      setContacts((members || []).map((m: any) => ({ ...m, title: titles.get(m.id) || null })));
    })();
    return () => { alive = false; };
  }, [clubId]);

  // Summary for the template list
  useEffect(() => {
    if (missing || loading) { onSummary(null); return; }
    onSummary({ enabled: saved.enabled, label: saved.enabled ? scheduleSummary(saved) : 'Off' });
  }, [saved, missing, loading, onSummary]);

  // Live preview and audience, from the unsaved form
  const formKey = JSON.stringify(form);
  useEffect(() => {
    if (loading || missing) return;
    const t = setTimeout(async () => {
      const [pv, au] = await Promise.all([
        supabase.rpc('whats_on_preview', { p_club: clubId, p_settings: form, p_member: previewAs || null, p_variant: 'auto' }),
        supabase.rpc('whats_on_audience', { p_club: clubId, p_settings: form }),
      ]);
      if (!pv.error && pv.data) setPreview(pv.data as Preview);
      if (!au.error && au.data) setAudience(au.data as Audience);
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formKey, previewAs, loading, missing, clubId]);

  const helpContact = contacts.find(c => c.id === form.help_member_id) || null;

  const save = async () => {
    setSaving(true);
    const { data, error } = await supabase.rpc('whats_on_settings_save', { p_club: clubId, p_settings: form });
    setSaving(false);
    if (error) { addNotification('error', error.message || 'Could not save What\'s On settings'); return; }
    applyResult(data);
    addNotification('success', form.enabled ? 'What\'s On saved. It will go out automatically.' : 'What\'s On saved');
  };

  const sendTest = async () => {
    setTesting(true);
    const { data, error } = await supabase.rpc('whats_on_send_test', { p_club: clubId, p_settings: form, p_variant: 'auto' });
    setTesting(false);
    if (error) { addNotification('error', error.message || 'Could not send the test'); return; }
    addNotification('success', `Test sent to ${(data as any)?.to || 'your email'}`);
  };

  const sendNow = async () => {
    setSendingNow(true);
    const { data, error } = await supabase.rpc('whats_on_send_now', { p_club: clubId });
    setSendingNow(false);
    setConfirmNow(false);
    if (error) { addNotification('error', error.message || 'Could not send What\'s On'); return; }
    const r = data as any;
    addNotification('success', `What's On sent to ${r?.sent ?? 0} member${r?.sent === 1 ? '' : 's'}${r?.skipped ? ` (${r.skipped} had nothing on)` : ''}`);
    const { data: fresh } = await supabase.rpc('whats_on_settings_get', { p_club: clubId });
    if (fresh) { setLastSend((fresh as any).last_send || null); setServer((fresh as any).settings || null); }
  };

  const insertTag = (tag: string) => {
    const which = lastField.current;
    const el = which === 'subject' ? subjectRef.current : introRef.current;
    const cur = (which === 'subject' ? form.subject : form.intro) || '';
    const start = el?.selectionStart ?? cur.length;
    const end = el?.selectionEnd ?? cur.length;
    const next = cur.slice(0, start) + tag + cur.slice(end);
    set(which, next);
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + tag.length, start + tag.length); });
  };

  if (loading) {
    return <div className="a-wo-card a-wo-pad a-mute">Loading What's On…</div>;
  }
  if (missing) {
    return (
      <div className="a-wo-card a-wo-pad">
        <div className="a-wo-gh"><span className="a-sgh-dot" style={{ background: '#FFB340' }} /><h3>What's On is almost ready</h3></div>
        <p className="a-wo-gdesc">It needs a one-off database update before it can be turned on. Nothing is sent until then, and the other email templates work as normal.</p>
      </div>
    );
  }
  if (loadError) {
    return <div className="a-wo-card a-wo-pad" style={{ color: '#FF8A8A' }}>{loadError}</div>;
  }

  const next = nextSend(form, { last_run_key: server?.last_run_key, last_scheduled_at: server?.last_scheduled_at });
  const period = form.covers_days === 14 ? 'in the next two weeks' : 'this week';
  const dayName = DAY_NAMES[form.send_day];

  return (
    <div className="a-wo-cols">
      {/* ── Middle: settings ── */}
      <div className="a-wo-main">
        <section className="a-wo-card a-wo-hero">
          <div className="a-wo-hero-t">
            <h2 className="a-display">What's On</h2>
            <p className="a-mute">A weekly round-up of racing for each member's classes, with Going and Can't make it buttons.</p>
            <div className="a-wo-status">
              <span className={`a-light ${form.enabled ? 'a-light-g' : ''}`} />
              {form.enabled
                ? <span>On · {next ? <>next send {fmtDay(next)} at {fmtTime(form.send_time)}</> : 'no send date in the next few weeks'}</span>
                : <span>Off · turn on Send automatically to start</span>}
              {dirty && <span className="a-wo-unsaved">Unsaved changes</span>}
            </div>
          </div>
          <label className="a-wo-hero-sw">
            <span>Send automatically</span>
            <ASwitch checked={form.enabled} onChange={v => set('enabled', v)} label="Send What's On automatically" />
          </label>
        </section>

        <Group dot="#0A84FF" title="When it goes out">
          <Row label="How often">
            <Seg label="How often" value={form.frequency} onChange={v => set('frequency', v)}
              options={[{ v: 'weekly', label: 'Weekly' }, { v: 'fortnightly', label: 'Fortnightly' }, { v: 'monthly', label: 'Monthly' }]} />
          </Row>
          <Row label="Send on" hint={form.frequency === 'monthly' ? `First ${dayName} of the month` : undefined}>
            <Seg label="Send on" value={form.send_day} onChange={v => set('send_day', v)}
              options={DAY_ORDER.map(d => ({ v: d, label: DAYS[d] }))} />
          </Row>
          <Row label="At" hint="Club time zone">
            <div className="a-wo-at">
              <span className="a-wo-pick">
                <AlfieIcon glyph="clock" size={17} />
                <span>{fmtTime(form.send_time)}</span>
                <AlfieIcon glyph="chev" size={16} className="a-wo-pick-chev" />
                <select aria-label="Send time" value={form.send_time} onChange={e => set('send_time', e.target.value)}>
                  {TIMES.map(t => <option key={t} value={t}>{fmtTime(t)}</option>)}
                </select>
              </span>
              <span className="a-wo-tz">
                {tzLabel(form.timezone)}
                <AlfieIcon glyph="chev" size={14} />
                <select aria-label="Club time zone" value={form.timezone} onChange={e => set('timezone', e.target.value)}>
                  {(TIMEZONES.includes(form.timezone) ? TIMEZONES : [form.timezone, ...TIMEZONES]).map(tz => <option key={tz} value={tz}>{tzLabel(tz)}</option>)}
                </select>
              </span>
            </div>
          </Row>
          <Row label="Covers" hint="Events included">
            <Seg label="Covers" value={form.covers_days} onChange={v => set('covers_days', v)}
              options={[{ v: 7, label: 'Next 7 days' }, { v: 14, label: 'Next 14 days' }]} />
          </Row>
          <Row label="Quiet weeks" hint="No racing for a member">
            <div className="a-wo-inline">
              <span>Don't send an email when nothing's on</span>
              <ASwitch checked={form.skip_empty} onChange={v => set('skip_empty', v)} label="Skip quiet weeks" />
            </div>
          </Row>
        </Group>

        <Group dot="#8A4DFF" title="Who gets it">
          <div className="a-wo-opts" role="radiogroup" aria-label="Who gets it">
            <button type="button" role="radio" aria-checked={form.audience === 'class'} className={`a-wo-opt ${form.audience === 'class' ? 'a-wo-opt-on' : ''}`} onClick={() => set('audience', 'class')}>
              <span className={`a-wo-rad ${form.audience === 'class' ? 'a-wo-rad-on' : ''}`} />
              <span className="a-wo-opt-b">
                <span className="a-wo-opt-t">Members with a boat in the class <em>Recommended</em></span>
                <span className="a-wo-opt-d">Each member only sees racing for the classes in their boat shed</span>
              </span>
            </button>
            <button type="button" role="radio" aria-checked={form.audience === 'all'} className={`a-wo-opt ${form.audience === 'all' ? 'a-wo-opt-on' : ''}`} onClick={() => set('audience', 'all')}>
              <span className={`a-wo-rad ${form.audience === 'all' ? 'a-wo-rad-on' : ''}`} />
              <span className="a-wo-opt-b">
                <span className="a-wo-opt-t">All members</span>
                <span className="a-wo-opt-d">Everyone gets every event, whatever they sail</span>
              </span>
            </button>
          </div>
          <ToggleRow label="Include members who haven't activated AlfiePRO" hint="Sent to the email on their membership record"
            checked={form.include_unactivated} onChange={v => set('include_unactivated', v)} />
          <ToggleRow label="Include unfinancial members" hint="Members whose renewal is overdue"
            checked={form.include_unfinancial} onChange={v => set('include_unfinancial', v)} />
          <div className="a-wo-aud">
            <AlfieIcon glyph="team" size={17} />
            <span className="a-wo-aud-t">
              {audience ? <>
                <strong>{audience.total}</strong> member{audience.total === 1 ? '' : 's'} get What's On
                <span className="a-dim"> · {audience.activated} on AlfiePRO, {audience.unactivated} not yet · {audience.this_week} with racing {period}</span>
              </> : 'Counting members…'}
            </span>
            {audience && audience.total > 0 && (
              <button type="button" className="a-wo-link" onClick={() => setShowList(s => !s)}>{showList ? 'Hide list' : 'See list'}</button>
            )}
          </div>
          {showList && audience && (
            <div className="a-wo-list-members">
              {audience.members.map(m => {
                const [first, ...rest] = m.name.split(' ');
                return (
                  <div key={m.member_id} className="a-wo-mrow">
                    <span className="a-av a-av-sm" style={{ background: avatarColour(m.name) }}>{initialsOf(first, rest.join(' '))}</span>
                    <span className="a-wo-mrow-n">{m.name}<small>{m.classes.length ? m.classes.join(', ') : 'No boats'}</small></span>
                    <span className="a-wo-mrow-s">{m.this_week > 0 ? `${m.this_week} ${m.this_week === 1 ? 'race' : 'races'}` : 'Nothing on'}</span>
                    <span className={`a-st ${m.activated ? '' : 'a-dim'}`}><span className={`a-light ${m.activated ? 'a-light-g' : ''}`} />{m.activated ? 'On AlfiePRO' : 'Not yet'}</span>
                  </div>
                );
              })}
              {audience.total > audience.members.length && <div className="a-wo-mrow a-dim">and {audience.total - audience.members.length} more</div>}
            </div>
          )}
        </Group>

        <Group dot="#FF8A2B" title="What's in it">
          <ToggleRow label="Going / Can't make it buttons" hint="Answers show on the event's attendees, the same as answering in AlfiePRO"
            checked={form.show_rsvp} onChange={v => set('show_rsvp', v)} />
          <ToggleRow label="PRO, start times and venue map" checked={form.show_details} onChange={v => set('show_details', v)} />
          <ToggleRow label="Race documents (NOR, SI)" checked={form.show_docs} onChange={v => set('show_docs', v)} />
          <ToggleRow label="Other racing and meetings at the club" checked={form.show_other} onChange={v => set('show_other', v)} />
          <ToggleRow label={form.covers_days === 14 ? 'The week after' : "Next week's racing"} checked={form.show_next_week} onChange={v => set('show_next_week', v)} />
          <ToggleRow label="AlfiePRO panel" hint="Activate my login for members not yet on AlfiePRO · Log in and Forgot password for everyone else"
            checked={form.show_alfie_panel} onChange={v => set('show_alfie_panel', v)} />
        </Group>

        <Group dot="#FF3E9A" title="Help contact"
          right={<label className="a-wo-gh-sw"><span>Show in the email</span><ASwitch checked={form.help_enabled} onChange={v => set('help_enabled', v)} label="Show help contact in the email" /></label>}
          desc="Shown under the AlfiePRO panel so members can get help activating or logging in. Turn it off and the panel shows the login buttons only.">
          <Row label="Contact person">
            <span className="a-wo-pick a-wo-pick-wide">
              {helpContact ? (
                <>
                  <span className="a-av a-av-sm" style={{ background: avatarColour(`${helpContact.first_name} ${helpContact.last_name}`) }}>{initialsOf(helpContact.first_name, helpContact.last_name)}</span>
                  <span className="a-wo-pick-two"><b>{helpContact.first_name} {helpContact.last_name}</b><small>{helpContact.title ? `${helpContact.title} · committee` : 'Member'}</small></span>
                </>
              ) : <span className="a-dim">Choose someone</span>}
              <AlfieIcon glyph="chev" size={16} className="a-wo-pick-chev" />
              <select aria-label="Contact person" value={form.help_member_id || ''} onChange={e => {
                const c = contacts.find(x => x.id === e.target.value);
                setForm(f => ({ ...f, help_member_id: c?.id || null, help_title: c?.title || null, help_enabled: c ? true : f.help_enabled }));
              }}>
                <option value="">Choose someone</option>
                {contacts.some(c => c.title) && (
                  <optgroup label="Committee">
                    {contacts.filter(c => c.title).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name} · {c.title}</option>)}
                  </optgroup>
                )}
                <optgroup label="Members">
                  {contacts.filter(c => !c.title).map(c => <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>)}
                </optgroup>
              </select>
            </span>
          </Row>
          <ToggleRow label="Show phone number"
            hint={helpContact ? (helpContact.phone ? `${helpContact.phone} · from their member profile` : 'No phone number on their member profile') : undefined}
            checked={form.help_show_phone} onChange={v => set('help_show_phone', v)} />
          <div className="a-wo-tr">
            <div className="a-wo-trl">
              <div className="a-wo-trt">Show email address</div>
              {editHelpEmail ? (
                <input className="a-inp a-wo-inp-sm" type="email" autoFocus placeholder={helpContact?.email || 'name@club.org.au'}
                  value={form.help_email || ''} onChange={e => set('help_email', e.target.value || null)} onBlur={() => setEditHelpEmail(false)} />
              ) : (
                <div className="a-wo-trh">
                  {(form.help_email || helpContact?.email) ? <>{form.help_email || helpContact?.email} · {form.help_email ? 'club address' : 'from their member profile'} · </> : null}
                  <button type="button" className="a-wo-link" onClick={() => setEditHelpEmail(true)}>{form.help_email ? 'Change' : 'Use a club address'}</button>
                </div>
              )}
            </div>
            <ASwitch checked={form.help_show_email} onChange={v => set('help_show_email', v)} label="Show email address" />
          </div>
        </Group>

        <Group dot="#30D158" title="Wording">
          <div className="a-wo-word">
            <label className="a-wo-flab" htmlFor="wo-subject">Subject</label>
            <input id="wo-subject" ref={subjectRef} className="a-inp" maxLength={200}
              placeholder={form.audience === 'all' ? `{event_count} races at ${clubAbbr} ${period}` : `{event_count} races ${period} for your {classes}`}
              value={form.subject || ''} onFocus={() => { lastField.current = 'subject'; }}
              onChange={e => set('subject', e.target.value || null)} />
            <label className="a-wo-flab" htmlFor="wo-intro">Opening line</label>
            <textarea id="wo-intro" ref={introRef} className="a-inp a-wo-ta" rows={3} maxLength={1000}
              placeholder={`Hi {first_name}, here's what's on at the club ${period}${form.audience === 'all' ? '.' : ' for your boats.'}${form.show_rsvp ? " Tap Going or Can't make it so the PRO can plan the starts." : ''}`}
              value={form.intro || ''} onFocus={() => { lastField.current = 'intro'; }}
              onChange={e => set('intro', e.target.value || null)} />
            <div className="a-wo-tags">
              <span className="a-dim">Insert</span>
              {MERGE_TAGS.map(t => <button key={t} type="button" className="a-wo-tag" onClick={() => insertTag(t)}>{t}</button>)}
            </div>
            <p className="a-wo-note">Leave these empty to use the wording shown, which adjusts to each member's boats and the number of races.</p>
          </div>
        </Group>

        <div className="a-wo-foot">
          <button type="button" className="a-btn a-btn-q" onClick={() => setForm(f => ({ ...f, subject: null, intro: null }))} disabled={!form.subject && !form.intro}>Restore default wording</button>
          <span style={{ flex: 1 }} />
          <button type="button" className="a-btn" onClick={() => setForm(saved)} disabled={!dirty || saving}>Cancel</button>
          <button type="button" className="a-btn a-btn-p" onClick={save} disabled={saving || (!dirty && !!server?.saved)}>
            <AlfieIcon glyph="check" size={17} strokeWidth={2.2} />{saving ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </div>

      {/* ── Right: preview and stats ── */}
      <aside className="a-wo-side">
        <section className="a-wo-card a-wo-pv">
          <div className="a-wo-pvh">
            <h3>Preview</h3>
            <Seg label="Preview size" value={previewMode} onChange={setPreviewMode}
              options={[{ v: 'desktop', label: 'Desktop' }, { v: 'phone', label: 'Phone' }]} />
          </div>
          <span className="a-wo-pick a-wo-pick-wide a-wo-as">
            <AlfieIcon glyph="user" size={15} />
            <span className="a-wo-as-t">As {preview?.sample ? 'a sample member' : preview?.member_name || '…'}{preview?.member_classes?.length ? ` · ${preview.member_classes.join(', ')}` : ''}</span>
            <AlfieIcon glyph="chev" size={15} className="a-wo-pick-chev" />
            <select aria-label="Preview as" value={previewAs} onChange={e => setPreviewAs(e.target.value)}>
              <option value="">You (or a sample member)</option>
              {(audience?.members || []).map(m => <option key={m.member_id} value={m.member_id}>{m.name}{m.activated ? '' : ' · not on AlfiePRO'}</option>)}
            </select>
          </span>
          {preview ? (
            <>
              <div className="a-wo-subj"><span className="a-dim">Subject</span> {preview.subject}</div>
              <PreviewFrame html={preview.html} mode={previewMode} />
            </>
          ) : <div className="a-wo-pvbox a-wo-pvempty a-dim">Building preview…</div>}
          <div className="a-wo-pvact">
            <button type="button" className="a-btn" onClick={sendTest} disabled={testing}>
              <AlfieIcon glyph="send" size={16} />{testing ? 'Sending…' : 'Send a test to me'}
            </button>
            {confirmNow ? (
              <span className="a-wo-confirm">
                <button type="button" className="a-btn a-btn-p" onClick={sendNow} disabled={sendingNow}>{sendingNow ? 'Sending…' : `Send to ${audience?.this_week ?? ''} now`}</button>
                <button type="button" className="a-btn a-btn-q" onClick={() => setConfirmNow(false)}>Cancel</button>
              </span>
            ) : (
              <button type="button" className="a-btn" onClick={() => setConfirmNow(true)} disabled={dirty || !server?.saved}
                title={dirty || !server?.saved ? 'Save your changes first' : undefined}>
                Send this week now
              </button>
            )}
          </div>
        </section>

        <section className="a-wo-card a-wo-stats">
          <p className="a-cap">{lastSend ? `Last sent · ${new Date(lastSend.sent_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })}` : 'Not sent yet'}</p>
          {lastSend ? (
            <>
              <div className="a-wo-stat"><span><i style={{ background: '#0A84FF' }} />Sent to</span><b className="a-num">{lastSend.recipients}</b></div>
              <div className="a-wo-stat"><span><i style={{ background: '#8A4DFF' }} />Not on AlfiePRO yet</span><b className="a-num">{lastSend.unactivated}</b></div>
              <div className="a-wo-stat"><span><i style={{ background: '#FFB340' }} />Answered Going / Can't</span><b className="a-num">{lastSend.answers}</b></div>
              <div className="a-wo-stat"><span><i style={{ background: '#30D158' }} />Activated since</span><b className="a-num">{lastSend.activated_since}</b></div>
            </>
          ) : (
            <p className="a-wo-note" style={{ margin: '8px 0 0' }}>Turn on Send automatically and save. The first email goes out {next ? `${fmtDay(next)} at ${fmtTime(form.send_time)}` : 'on the next send day'}.</p>
          )}
        </section>
      </aside>
    </div>
  );
};

/* ─────────────────────────── Email templates board ─────────────────────────── */

const TEMPLATES: { key: string; title: string; desc: string; glyph: string }[] = [
  { key: 'welcome', title: 'Welcome to the club', desc: 'When a new member joins', glyph: 'heart' },
  { key: 'renewal', title: 'Renewal reminder', desc: 'Before a membership expires', glyph: 'renew' },
  { key: 'renewal_reminder_unregistered', title: 'Renewal reminder (not on AlfiePRO)', desc: 'With bank details for direct payment', glyph: 'bank' },
  { key: 'payment_confirmation', title: 'Renewal receipt', desc: 'When a renewal payment is confirmed', glyph: 'receipt' },
  { key: 'event', title: 'Event invitation', desc: 'When a new event is created', glyph: 'send' },
];

export const EmailTemplatesBoard: React.FC<{ onEditTemplate: (key: string) => void }> = ({ onEditTemplate }) => {
  const { currentClub } = useAuth();
  const clubId = currentClub?.clubId;
  const abbr = (currentClub as any)?.club?.abbreviation || (currentClub as any)?.club?.name || 'Your club';
  const [summary, setSummary] = useState<{ enabled: boolean; label: string } | null>(null);
  const onSummary = useCallback((s: { enabled: boolean; label: string } | null) => setSummary(s), []);

  return (
    <div className="a-wo">
      <div className="a-wo-head">
        <span className="a-tile a-tile-rim" style={{ width: 48, height: 48 }}><AlfieIcon glyph="mail" size={22} /></span>
        <div>
          <h2 className="a-display a-ink">Email templates</h2>
          <p className="a-mute">Emails {abbr} sends to members: wording, on or off, and when they go</p>
        </div>
      </div>

      <div className="a-wo-grid">
        <nav className="a-wo-card a-wo-tl" aria-label="Email templates">
          <p className="a-cap">Automatic</p>
          <button type="button" className="a-wo-tli a-wo-tli-on" aria-current="page">
            <span className="a-tile a-tile-sm"><AlfieIcon glyph="cal" size={18} /></span>
            <span className="a-wo-tli-b"><span className="a-wo-tli-t">What's On <span className="a-wo-new">NEW</span></span><span className="a-wo-tli-d">{summary?.label || 'Weekly round-up of racing'}</span></span>
            <span className={`a-light ${summary?.enabled ? 'a-light-g' : ''}`} />
          </button>
          {TEMPLATES.map(t => (
            <button key={t.key} type="button" className="a-wo-tli" onClick={() => onEditTemplate(t.key)}>
              <span className="a-tile a-tile-sm"><AlfieIcon glyph={t.glyph} size={18} /></span>
              <span className="a-wo-tli-b"><span className="a-wo-tli-t">{t.title}</span><span className="a-wo-tli-d">{t.desc}</span></span>
              <AlfieIcon glyph="edit" size={16} className="a-dim" />
            </button>
          ))}
        </nav>

        {clubId ? (
          <WhatsOnEditor clubId={clubId} clubAbbr={abbr} onSummary={onSummary} />
        ) : (
          <div className="a-wo-card a-wo-pad a-mute">Choose a club to manage its emails.</div>
        )}
      </div>
    </div>
  );
};

export default EmailTemplatesBoard;
