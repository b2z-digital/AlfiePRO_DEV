import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ExternalLink, Filter, Loader2, Mail, MousePointerClick, Plus, Search, Send, Trash2, UserRound, Users, X } from 'lucide-react';
import { useNotifications } from '../../contexts/NotificationContext';
import { supabase } from '../../utils/supabase';
import { avatarColour, initialsOf } from '../alfie/Kit';
import { useStudio } from './studioData';
import {
  BUILTINS, ago, audienceCount, createCampaign, deleteSegment, fmtDate, homeData, memberActivity, orgClubIds, saveSegment, searchMembers,
  type AudienceCount, type HomeData, type MemberLite, type SegmentRow, type SegmentRule,
} from './api';
import { Confirm } from './ui';
import { toneStyle } from './StudioHome';
import { emptyDoc } from '../../lib/emailStudio/catalog';

/* ── Rule definitions (match email_studio_rule_ids in SQL) ───────────────── */
interface OpDef { label: string; set: SegmentRule; is: (r: SegmentRule) => boolean; days?: string; choice?: 'level' | 'class' }
interface FieldDef { key: string; label: string; ops: OpDef[] }
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const val = (field: string, label: string, value: unknown): OpDef => ({ label, set: { field, value }, is: r => same(r.value, value) });
const days = (field: string, label: string, op: string, d: number, unit: string): OpDef => ({ label, set: { field, op, value: d }, is: r => (r.op || 'within') === op, days: unit });

const FIELDS: FieldDef[] = [
  { key: 'status', label: 'Membership', ops: [val('status', 'is current', ['active']), val('status', 'has lapsed', ['expired']), val('status', 'is current or lapsed', ['active', 'expired'])] },
  { key: 'financial', label: 'Paid up', ops: [val('financial', 'yes', true), val('financial', 'no', false)] },
  { key: 'level', label: 'Membership type', ops: [{ label: 'is', set: { field: 'level', value: [] }, is: () => true, choice: 'level' }] },
  { key: 'renews', label: 'Renewal', ops: [days('renews', 'is due in the next', 'within', 30, 'days'), { label: 'is overdue', set: { field: 'renews', op: 'overdue' }, is: r => r.op === 'overdue' }] },
  { key: 'joined', label: 'Joined', ops: [days('joined', 'in the last', 'within', 365, 'days'), days('joined', 'more than', 'before', 365, 'days ago')] },
  { key: 'boat_class', label: 'Boat class', ops: [{ label: 'is', set: { field: 'boat_class', value: [] }, is: () => true, choice: 'class' }] },
  { key: 'has_boat', label: 'Boats', ops: [val('has_boat', 'has a boat listed', true), val('has_boat', 'has no boat listed', false)] },
  { key: 'signed_in', label: 'AlfiePRO', ops: [val('signed_in', 'has signed in', true), val('signed_in', 'has never signed in', false)] },
  { key: 'opened', label: 'Opened an email', ops: [days('opened', 'in the last', 'within', 90, 'days'), days('opened', 'not in the last', 'not_within', 90, 'days')] },
  { key: 'clicked', label: 'Clicked an email', ops: [days('clicked', 'in the last', 'within', 90, 'days'), days('clicked', 'not in the last', 'not_within', 90, 'days')] },
  { key: 'going', label: 'Said they’re going', ops: [days('going', 'to an event in the last', 'within', 90, 'days')] },
];
const fieldOf = (r: SegmentRule) => FIELDS.find(f => f.key === r.field) || FIELDS[0];
const opOf = (r: SegmentRule) => { const f = fieldOf(r); return Math.max(0, f.ops.findIndex(o => o.is(r))); };

export function describeRules(def: { match?: 'all' | 'any'; rules?: SegmentRule[] } | null) {
  const rules = def?.rules || [];
  if (!rules.length) return 'All current members';
  return rules.map(r => {
    const f = fieldOf(r); const o = f.ops[opOf(r)];
    const v = o.days ? ` ${r.value ?? ''} ${o.days}` : o.choice ? ` ${(Array.isArray(r.value) ? r.value : []).join(' or ') || '…'}` : '';
    return `${f.label} ${o.label}${v}`;
  }).join(def?.match === 'any' ? ', or ' : ', and ');
}

interface Draft { id?: string; name: string; match: 'all' | 'any'; rules: SegmentRule[] }
const NEW_DRAFT = (): Draft => ({ name: '', match: 'all', rules: [{ field: 'status', value: ['active'] }] });

const RuleRow: React.FC<{ i: number; rule: SegmentRule; match: 'all' | 'any'; choices: Record<'level' | 'class', string[]>; onChange: (r: SegmentRule) => void; onRemove: () => void }> = ({ i, rule, match, choices, onChange, onRemove }) => {
  const f = fieldOf(rule);
  const oi = opOf(rule);
  const o = f.ops[oi];
  return (
    <div className="es-cond">
      <span className={`es-cj${i === 0 ? ' w' : ''}`}>{i === 0 ? 'WHERE' : match === 'any' ? 'OR' : 'AND'}</span>
      <select className="es-sel" aria-label="Field" value={f.key} onChange={e => { const nf = FIELDS.find(x => x.key === e.target.value)!; onChange({ ...nf.ops[0].set }); }}>
        {FIELDS.map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
      </select>
      <select className="es-sel" aria-label="Condition" value={oi} onChange={e => onChange({ ...f.ops[Number(e.target.value)].set })}>
        {f.ops.map((x, j) => <option key={j} value={j}>{x.label}</option>)}
      </select>
      {o.days ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input className="es-sel" type="number" min={1} max={3650} style={{ width: 90 }} aria-label="Number of days" value={Number(rule.value ?? 30)}
            onChange={e => onChange({ ...rule, op: o.set.op, value: Math.max(1, Math.min(3650, Number(e.target.value) || 1)) })} />
          <span className="es-dim" style={{ fontSize: 12.5 }}>{o.days}</span>
        </div>
      ) : o.choice ? (
        <select className="es-sel" aria-label={f.label} value={(Array.isArray(rule.value) ? (rule.value as string[])[0] : '') || ''} onChange={e => onChange({ ...rule, value: e.target.value ? [e.target.value] : [] })}>
          <option value="">Choose…</option>
          {choices[o.choice].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      ) : <div />}
      <button type="button" className="a-ib" aria-label="Remove this condition" onClick={onRemove}><X size={16} /></button>
    </div>
  );
};

const Avatars: React.FC<{ sample: { name: string; member_id: string | null }[] }> = ({ sample }) => (
  <span className="es-avs" aria-hidden>
    {sample.slice(0, 5).map((p, i) => { const [a, ...b] = p.name.split(' '); return <span key={i} style={{ background: avatarColour(p.member_id || p.name) }}>{initialsOf(a, b.join(' '))}</span>; })}
  </span>
);

/* ── Profile drawer ──────────────────────────────────────────────────────── */
const Profile: React.FC<{ m: MemberLite; onClose: () => void }> = ({ m, onClose }) => {
  const s = useStudio();
  const [a, setA] = useState<Awaited<ReturnType<typeof memberActivity>> | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => { if (m.email) memberActivity(s.clubId, m.email).then(setA).catch(() => setErr(true)); }, [m.email, s.clubId]);
  const name = `${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email || 'Member';
  const emails = a?.emails || [];
  const opened = emails.filter(e => e.opened_at).length;
  const clicked = emails.filter(e => e.clicked_at).length;
  return (
    <div className="a-dlg" role="dialog" aria-modal="true" aria-label={name} style={{ justifyContent: 'flex-end', alignItems: 'stretch', padding: 0 }} onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <aside className="a-sheet es-root es-prof" style={{ maxWidth: 440, width: '100%', height: '100%', borderRadius: 0, padding: 0, gap: 0, overflowY: 'auto' }}>
        <div className="es-prof-top">
          <span className="es-prof-av" style={m.avatar_url ? undefined : { background: avatarColour(m.id) }}>{m.avatar_url ? <img src={m.avatar_url} alt="" /> : initialsOf(m.first_name, m.last_name)}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="a-display es-ink" style={{ fontSize: 19, fontWeight: 600 }}>{name}</div>
            <div className="es-dim" style={{ fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email || 'No email address'}</div>
            <div className="es-chips" style={{ marginTop: 8, gap: 6 }}>
              <span className={`es-pill ${m.membership_status === 'active' ? 'es-live' : 'es-draft'}`}>{m.membership_status === 'active' ? 'Current member' : m.membership_status === 'expired' ? 'Lapsed' : m.membership_status || 'Member'}</span>
              {m.membership_level && <span className="es-pill">{m.membership_level}</span>}
              <span className={`es-pill ${m.user_id ? 'es-auto' : ''}`}>{m.user_id ? 'Uses AlfiePRO' : 'Not signed in yet'}</span>
            </div>
          </div>
          <button className="a-ib" onClick={onClose} aria-label="Close" style={{ alignSelf: 'flex-start' }}><X size={18} /></button>
        </div>
        <div className="es-prof-sec">
          <p className="a-cap m-0">Emails from the club</p>
          <div className="es-mini3"><div><b>{emails.length}</b><span>Received</span></div><div><b>{opened}</b><span>Opened</span></div><div><b>{clicked}</b><span>Clicked</span></div></div>
        </div>
        <div className="es-prof-sec">
          <p className="a-cap m-0">Preferences</p>
          {a?.prefs?.unsubscribed
            ? <div className="es-hint" style={{ marginTop: 8 }}><span className="es-warn">Unsubscribed from club emails.</span> They still get important notices such as renewals and receipts.</div>
            : <div className="es-hint" style={{ marginTop: 8 }}>{a?.prefs?.topics_off?.length ? <>Gets everything except <b>{a.prefs.topics_off.map(k => a.topics.find(t => t.key === k)?.label || k).join(', ')}</b>.</> : 'Gets every type of club email.'}</div>}
          {m.renewal_date && <div className="es-hint" style={{ marginTop: 6 }}>Membership renews {fmtDate(m.renewal_date, { day: 'numeric', month: 'short', year: 'numeric' })}.</div>}
        </div>
        <div className="es-prof-sec">
          <p className="a-cap m-0">Recent emails</p>
          {!a && !err && <div className="es-empty"><Loader2 size={16} className="es-spin" /></div>}
          {err && <div className="es-empty">Could not load activity.</div>}
          {a && !emails.length && <div className="es-empty">Nothing sent to {m.first_name || 'them'} from Email studio yet.</div>}
          <ul className="es-act">
            {emails.slice(0, 20).map((e, i) => (
              <li key={i}>
                <span className="dot" style={e.clicked_at ? toneStyle('p') : e.opened_at ? toneStyle('b') : undefined}>{e.clicked_at ? <MousePointerClick size={14} /> : e.opened_at ? <Check size={14} /> : <Mail size={14} />}</span>
                <span className="tx">{e.subject || e.campaign || 'Email'}<small>{e.status !== 'sent' ? (e.status === 'failed' ? 'Couldn’t be delivered' : 'Waiting to send') : e.clicked_at ? `Clicked ${ago(e.clicked_at)}` : e.opened_at ? `Opened ${ago(e.opened_at)}` : `Sent ${ago(e.sent_at)}, not opened yet`}</small></span>
              </li>
            ))}
          </ul>
        </div>
      </aside>
    </div>
  );
};

/* ── Email studio › Audience ─────────────────────────────────────────────── */
export const StudioAudience: React.FC = () => {
  const s = useStudio();
  const navigate = useNavigate();
  const { addNotification } = useNotifications();
  const [home, setHome] = useState<HomeData | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [draft, setDraft] = useState<Draft>(NEW_DRAFT);
  const [live, setLive] = useState<AudienceCount | null>(null);
  const [counting, setCounting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<SegmentRow | null>(null);
  const [choices, setChoices] = useState<Record<'level' | 'class', string[]>>({ level: [], class: [] });
  const [q, setQ] = useState('');
  const [people, setPeople] = useState<MemberLite[] | null>(null);
  const [open, setOpen] = useState<MemberLite | null>(null);

  useEffect(() => {
    homeData(s.clubId).then(setHome).catch(() => setHome(null));
    orgClubIds(s.clubId).then(clubs => {
      if (!clubs.length) return;
      supabase.from('members').select('membership_level').in('club_id', clubs).is('archived_at', null).limit(5000).then(({ data }) => {
        const lv = Array.from(new Set((data || []).map(r => String(r.membership_level || '').trim()).filter(Boolean))).sort();
        setChoices(c => ({ ...c, level: lv }));
      });
      supabase.from('member_boats').select('boat_type, members!inner(club_id)').in('members.club_id', clubs).limit(5000).then(({ data }) => {
        const cl = Array.from(new Set((data || []).map(r => String((r as { boat_type?: string }).boat_type || '').trim()).filter(Boolean))).sort();
        setChoices(c => ({ ...c, class: cl }));
      });
    });
    BUILTINS.forEach(b => audienceCount(s.clubId, { include: [{ kind: 'builtin', key: b.key }], exclude: [] }).then(r => setCounts(c => ({ ...c, [b.key]: r.count }))).catch(() => undefined));
  }, [s.clubId]);

  useEffect(() => {
    s.segments.forEach(g => audienceCount(s.clubId, { include: [{ kind: 'segment', id: g.id }], exclude: [] }).then(r => setCounts(c => ({ ...c, [g.id]: r.count }))).catch(() => undefined));
  }, [s.segments, s.clubId]);

  // Live count for the segment being built
  useEffect(() => {
    let off = false;
    setCounting(true);
    const t = setTimeout(() => {
      audienceCount(s.clubId, { include: [{ kind: 'rules', def: { match: draft.match, rules: draft.rules } }], exclude: [] })
        .then(r => { if (!off) setLive(r); }).catch(() => { if (!off) setLive(null); }).finally(() => { if (!off) setCounting(false); });
    }, 350);
    return () => { off = true; clearTimeout(t); };
  }, [draft.match, draft.rules, s.clubId]);

  useEffect(() => {
    let off = false;
    const t = setTimeout(() => searchMembers(s.clubId, q, 60).then(r => { if (!off) setPeople(r); }), 200);
    return () => { off = true; clearTimeout(t); };
  }, [q, s.clubId]);

  const setRule = (i: number, r: SegmentRule) => setDraft(d => ({ ...d, rules: d.rules.map((x, j) => (j === i ? r : x)) }));
  const valid = draft.rules.every(r => { const o = fieldOf(r).ops[opOf(r)]; return !o.choice || (Array.isArray(r.value) && r.value.length > 0); });

  const save = async (asNew = false) => {
    if (!draft.name.trim()) { addNotification('error', 'Give the segment a name'); return; }
    setSaving(true);
    try {
      const id = await saveSegment(s.clubId, { id: asNew ? undefined : draft.id, name: draft.name.trim(), description: describeRules(draft), def: { match: draft.match, rules: draft.rules }, count: live?.count });
      await s.reload(['segments']);
      setDraft(d => ({ ...d, id }));
      addNotification('success', 'Segment saved. It updates by itself as members change.');
    } catch (e) { addNotification('error', (e as Error).message); } finally { setSaving(false); }
  };

  const sendTo = async () => {
    setSaving(true);
    try {
      let id = draft.id;
      if (!id) {
        id = await saveSegment(s.clubId, { name: draft.name.trim() || 'New segment', description: describeRules(draft), def: { match: draft.match, rules: draft.rules }, count: live?.count });
        await s.reload(['segments']);
      }
      const cid = await createCampaign(s.clubId, {
        name: `Email to ${draft.name.trim() || 'New segment'}`, doc: emptyDoc(), fromName: s.defaults.from_name, replyTo: s.defaults.reply_to,
        audience: { include: [{ kind: 'segment', id, label: draft.name.trim() || 'New segment' }], exclude: [] },
      });
      navigate(`/email-studio/campaigns/${cid}`);
    } catch (e) { addNotification('error', (e as Error).message); setSaving(false); }
  };

  const c = home?.counts;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <section className="es-kpis" aria-label="Your audience">
        <div className="a-card es-kpi"><p className="a-cap m-0">People you can email</p><div className="v es-num">{counts.everyone ?? '…'}</div><div className="d">Current and lapsed members with an email address</div></div>
        <div className="a-card es-kpi"><p className="a-cap m-0">Current members</p><div className="v es-num">{counts.all ?? '…'}</div><div className="d">{counts.financial != null ? `${counts.financial} paid up` : ' '}</div></div>
        <div className="a-card es-kpi hero"><p className="a-cap m-0">Using AlfiePRO</p><div className="v es-num">{counts.signed_in ?? '…'}</div><div className="d">{counts.not_signed_in != null ? `${counts.not_signed_in} haven’t signed in yet` : ' '}</div></div>
        <div className="a-card es-kpi"><p className="a-cap m-0">Unsubscribed</p><div className="v es-num">{c?.unsubscribed ?? '…'}</div><div className="d">Still get renewals, receipts and important notices</div></div>
      </section>

      <div className="es-split-w">
        <section className="a-card" aria-label="Build a segment">
          <div className="es-ch">
            <span className="a-tile" style={toneStyle('v')}><Filter size={17} /></span>
            <div><h3 className="a-display">{draft.id ? 'Edit segment' : 'Build a segment'}</h3><div className="sub">Segments update by themselves as members join, renew and sail</div></div>
            <div className="r">{draft.id && <button className="a-btn a-btn-sm" onClick={() => setDraft(NEW_DRAFT())}><Plus size={14} />New</button>}</div>
          </div>
          <div className="es-cb">
            <div>
              <div className="es-lbl">Name</div>
              <div className="a-field"><input value={draft.name} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} placeholder="For example, IOM sailors who haven’t renewed" aria-label="Segment name" /></div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <span className="es-hint">Members who match</span>
              <div className="esb-tog">
                <button type="button" className={draft.match === 'all' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, match: 'all' }))}>all of these</button>
                <button type="button" className={draft.match === 'any' ? 'on' : ''} onClick={() => setDraft(d => ({ ...d, match: 'any' }))}>any of these</button>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {draft.rules.map((r, i) => <RuleRow key={i} i={i} rule={r} match={draft.match} choices={choices} onChange={nr => setRule(i, nr)} onRemove={() => setDraft(d => ({ ...d, rules: d.rules.filter((_x, j) => j !== i) }))} />)}
              <button type="button" className="es-chip add" style={{ alignSelf: 'flex-start' }} onClick={() => setDraft(d => ({ ...d, rules: [...d.rules, { field: 'renews', op: 'within', value: 30 }] }))}><Plus size={13} />Add a condition</button>
            </div>
            <div className="es-match" aria-live="polite">
              <b className="es-num">{counting && !live ? '…' : live?.count ?? 0}</b>
              <div style={{ flex: '1 1 180px', minWidth: 0 }}>
                <div className="es-ink" style={{ fontSize: 13.5, fontWeight: 600 }}>{live?.count === 1 ? 'person matches' : 'people match'} right now{counting && <Loader2 size={13} className="es-spin" style={{ marginLeft: 6, verticalAlign: -2 }} />}</div>
                <div className="es-dim" style={{ fontSize: 12, marginTop: 2 }}>{live?.sample?.length ? live.sample.slice(0, 3).map(p => p.name).join(', ') + (live.count > 3 ? ` and ${live.count - 3} more` : '') : 'Nobody yet'}{live?.left_out ? ` · ${live.left_out} left out because they unsubscribed` : ''}</div>
              </div>
              {live?.sample && <Avatars sample={live.sample} />}
            </div>
            {!valid && <div className="es-hint es-warn">Choose a value for each condition.</div>}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="a-btn a-btn-p" disabled={saving || !valid} onClick={() => save(false)}>{saving ? <Loader2 size={16} className="es-spin" /> : <Check size={16} />}{draft.id ? 'Save changes' : 'Save segment'}</button>
              {draft.id && <button className="a-btn" disabled={saving || !valid} onClick={() => save(true)}>Save as a new segment</button>}
              <button className="a-btn" disabled={saving || !valid || !live?.count} onClick={sendTo}><Send size={16} />Email them</button>
            </div>
          </div>
        </section>

        <section className="a-card" aria-label="People">
          <div className="es-ch">
            <span className="a-tile" style={toneStyle('b')}><UserRound size={17} /></span>
            <div><h3 className="a-display">People</h3><div className="sub">See what each member gets and opens</div></div>
          </div>
          <div style={{ padding: '14px 20px 6px' }}>
            <div className="a-field"><Search size={15} /><input value={q} onChange={e => setQ(e.target.value)} placeholder="Search by name or email" aria-label="Search members" /></div>
          </div>
          <div className="es-people">
            {people === null ? <div className="es-empty"><Loader2 size={16} className="es-spin" /></div> : !people.length ? <div className="es-empty">No members found.</div> : people.map(m => (
              <button key={m.id} type="button" className="es-person" onClick={() => setOpen(m)}>
                <span className="es-av" style={{ background: avatarColour(m.id) }}>{initialsOf(m.first_name, m.last_name)}</span>
                <span style={{ flex: 1, minWidth: 0 }}>{`${m.first_name || ''} ${m.last_name || ''}`.trim() || m.email}<small style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.email || 'No email address'}</small></span>
                {!m.email ? <span className="es-pill es-bad">No email</span> : m.membership_status === 'active' ? null : <span className="es-pill es-draft">{m.membership_status === 'expired' ? 'Lapsed' : m.membership_status}</span>}
                {m.user_id && <span className="es-pill es-auto">AlfiePRO</span>}
              </button>
            ))}
          </div>
        </section>
      </div>

      <section className="a-card" aria-label="Segments">
        <div className="es-ch">
          <span className="a-tile" style={toneStyle('g')}><Users size={17} /></span>
          <div><h3 className="a-display">Segments</h3><div className="sub">Ready-made groups, plus the ones you build. Pick one to open it.</div></div>
        </div>
        <div className="es-sgs">
          {s.segments.map(g => (
            <div key={g.id} className={`es-sg${draft.id === g.id ? ' on' : ''}`} style={{ position: 'relative' }} role="button" tabIndex={0}
              onClick={() => setDraft({ id: g.id, name: g.name, match: g.filter_criteria?.match || 'all', rules: g.filter_criteria?.rules || [] })}
              onKeyDown={e => { if (e.key === 'Enter') setDraft({ id: g.id, name: g.name, match: g.filter_criteria?.match || 'all', rules: g.filter_criteria?.rules || [] }); }}>
              <span className="es-by es-by-c" style={{ alignSelf: 'flex-start' }}>Your segment</span>
              <span className="t">{g.name}</span>
              <span className="n es-num">{counts[g.id] ?? '…'}</span>
              <span className="f">{describeRules(g.filter_criteria)}</span>
              <button type="button" className="a-ib" style={{ position: 'absolute', top: 8, right: 8, width: 30, height: 30 }} aria-label={`Delete ${g.name}`} onClick={e => { e.stopPropagation(); setDel(g); }}><Trash2 size={14} /></button>
            </div>
          ))}
          {BUILTINS.map(b => (
            <button key={b.key} type="button" className="es-sg" onClick={() => {
              const def = BUILTIN_DEFS[b.key] || BUILTIN_DEFS.all;
              setDraft({ name: b.label, match: 'all', rules: def.map(r => ({ ...r })) });
            }}>
              <span className="es-by es-by-a" style={{ alignSelf: 'flex-start' }}>Ready-made</span>
              <span className="t">{b.label}</span>
              <span className="n es-num">{counts[b.key] ?? '…'}</span>
              <span className="f">{b.note}</span>
            </button>
          ))}
        </div>
      </section>

      {s.lists.length > 0 && (
        <section className="a-card" aria-label="Lists">
          <div className="es-ch">
            <span className="a-tile"><Mail size={17} /></span>
            <div><h3 className="a-display">Lists</h3><div className="sub">People you added by hand or imported, including people who aren’t members</div></div>
            <div className="r"><button className="a-btn a-btn-sm" onClick={() => navigate('/marketing/subscribers')}><ExternalLink size={14} />Manage lists</button></div>
          </div>
          <div className="es-sgs">
            {s.lists.map(l => (
              <div key={l.id} className="es-sg" style={{ cursor: 'default' }}>
                <span className="t">{l.name}</span>
                <span className="n es-num">{l.total_contacts ?? 0}</span>
                <span className="f">{l.description || `Updated ${ago(l.updated_at)}`}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {open && <Profile m={open} onClose={() => setOpen(null)} />}
      {del && (
        <Confirm title="Delete this segment?" danger confirm="Delete" busy={saving}
          body={<>“{del.name}” will be removed. Campaigns already sent to it keep their numbers. Scheduled campaigns that use it will skip it.</>}
          onClose={() => setDel(null)}
          onConfirm={async () => {
            setSaving(true);
            try { await deleteSegment(del.id); await s.reload(['segments']); if (draft.id === del.id) setDraft(NEW_DRAFT()); setDel(null); }
            catch (e) { addNotification('error', (e as Error).message); } finally { setSaving(false); }
          }} />
      )}
    </div>
  );
};

/** Same definitions as email_studio_builtin_def in SQL, so a ready-made group can be copied and changed. */
const BUILTIN_DEFS: Record<string, SegmentRule[]> = {
  all: [{ field: 'status', value: ['active'] }],
  everyone: [{ field: 'status', value: ['active', 'expired'] }],
  financial: [{ field: 'status', value: ['active'] }, { field: 'financial', value: true }],
  lapsed: [{ field: 'status', value: ['expired'] }],
  new: [{ field: 'status', value: ['active'] }, { field: 'joined', op: 'within', value: 365 }],
  renewing: [{ field: 'status', value: ['active'] }, { field: 'renews', op: 'within', value: 30 }],
  signed_in: [{ field: 'status', value: ['active'] }, { field: 'signed_in', value: true }],
  not_signed_in: [{ field: 'status', value: ['active'] }, { field: 'signed_in', value: false }],
  quiet: [{ field: 'status', value: ['active'] }, { field: 'opened', op: 'not_within', value: 90 }],
};
