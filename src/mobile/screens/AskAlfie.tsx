/**
 * Ask Alfie (board "Ask Alfie"): a full-screen sheet from the centre button. Start (starters from
 * what Alfie knows about you), answers (rig table to save to your boat, race cards, take-me-there,
 * read aloud, copy), past conversations, talking to Alfie, and drawing a situation.
 * Conversations are the same ones the old app kept (the `ask-alfie` function).
 */
import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMobile } from '../MobileContext';
import { Icon, AlfieSails } from '../icons';
import { fmtDay } from '../ui';
import { daysUntil, myResultFor, todayISO } from '../data';
import {
  type AlfieConversation, type AlfieMsg, type Block, type Inline, type RaceCard, type RigOffer,
  Speaker, ask, blocks, deleteConversation, loadConversations, loadHistory, loadQuota, navPath, photoToDataUrl, plainText, rigRows, saveRig, visibleText,
} from '../alfie';
import { listen, speechKind, type Listening } from '../speech';
import type { Wind, Water } from '../me';
import { WIND_LABEL, WATER_LABEL } from '../me';

const RaceScenarioCanvas = lazy(() => import('../../components/ask-alfie/RaceScenarioCanvas').then(m => ({ default: m.RaceScenarioCanvas })));

type View = 'chat' | 'history' | 'voice' | 'draw';

/* ─────────────── Pieces ─────────────── */

const Orb: React.FC<{ size: number; glow?: boolean; light?: boolean }> = ({ size, glow, light }) => (
  <span className="m-al-orb" style={{ width: size, height: size, boxShadow: glow ? `0 0 ${Math.round(size * 0.65)}px rgba(46,123,255,.5)` : undefined }}>
    <span>{size >= 40 && <AlfieSails size={Math.round(size * 0.42)} light={light} />}</span>
  </span>
);

const InlineText: React.FC<{ parts: Inline[] }> = ({ parts }) => (
  <>
    {parts.map((p, i) => p.t === 'b' ? <b key={i}>{p.s}</b> : p.t === 'i' ? <i key={i}>{p.s}</i> : p.t === 'a' ? <a key={i} href={p.href} target="_blank" rel="noreferrer">{p.s}</a> : <React.Fragment key={i}>{p.s}</React.Fragment>)}
  </>
);

const Answer: React.FC<{ text: string }> = ({ text }) => {
  const bs = useMemo<Block[]>(() => blocks(text), [text]);
  return (
    <div className="m-al-ab">
      {bs.map((b, i) => {
        if ('items' in b) {
          const items = b.items.map((it, j) => <li key={j}><InlineText parts={it} /></li>);
          return b.t === 'ul' ? <ul key={i}>{items}</ul> : <ol key={i}>{items}</ol>;
        }
        return <p key={i} className={b.t === 'h' ? 'm-al-h' : undefined}><InlineText parts={b.c} /></p>;
      })}
    </div>
  );
};

const RigTable: React.FC<{ offer: RigOffer }> = ({ offer }) => {
  const rows = rigRows(offer);
  if (!rows.length) return null;
  return (
    <div className="m-card m-al-rig">
      <div className="m-al-kv m-al-kv-h"><span>Setting</span><span>{offer.rig_name}</span></div>
      {rows.map(r => <div key={r.label} className="m-al-kv"><span className="m-al-mut">{r.label}</span><b>{r.value}</b></div>)}
    </div>
  );
};

const RaceCards: React.FC<{ races: RaceCard[]; found?: number; onAll: () => void }> = ({ races, found, onAll }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
    {races.slice(0, 5).map(r => (
      <div key={`${r.id}-${r.date}`} className="m-card" style={{ padding: '11px 13px' }}>
        <div style={{ fontWeight: 600, fontSize: 14.5 }}>{r.title}</div>
        <div className="m-al-mut" style={{ fontSize: 12.5, marginTop: 3 }}>
          {fmtDay(r.date.slice(0, 10), { weekday: 'short', day: 'numeric', month: 'short' })} · {[r.venue || r.club_name, r.race_class].filter(Boolean).join(' · ')}
        </div>
      </div>
    ))}
    <button className="m-al-chip-btn" onClick={onAll}>{found && found > 5 ? `All ${found} in Find racing` : 'Open Find racing'}</button>
  </div>
);

const SaveRigSheet: React.FC<{ offer: RigOffer; onClose: () => void; onSaved: (msg: string) => void }> = ({ offer, onClose, onSaved }) => {
  const [wind, setWind] = useState<Wind>('medium');
  const [water, setWater] = useState<Water>('flat');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async () => {
    setBusy(true); setErr(null);
    try {
      const r = await saveRig(offer, wind, water);
      onSaved(`${r.was_update ? 'Updated' : 'Saved'} ${r.rig} on your ${r.boat}`);
    } catch (e: any) { setErr(e?.message || 'Couldn\'t save those settings.'); setBusy(false); }
  };
  return (
    <>
      <div className="m-veil" style={{ zIndex: 90 }} onClick={onClose} />
      <div className="m-sheet" style={{ zIndex: 91 }} role="dialog" aria-label="Save rig settings">
        <span className="m-grab" />
        <p style={{ margin: '4px 0 2px', fontSize: 19, fontWeight: 700 }}>Save {offer.rig_name}</p>
        <p className="m-al-mut" style={{ margin: '0 0 14px', fontSize: 14 }}>To your {offer.design_name || offer.boat_type}, for these conditions:</p>
        <p className="m-al-cap">Wind</p>
        <div className="m-al-seg">{(['light', 'medium', 'strong'] as Wind[]).map(w => <button key={w} className={w === wind ? 'on' : ''} aria-pressed={w === wind} onClick={() => setWind(w)}>{WIND_LABEL[w]}</button>)}</div>
        <p className="m-al-cap">Water</p>
        <div className="m-al-seg">{(['flat', 'moderate', 'rough'] as Water[]).map(w => <button key={w} className={w === water ? 'on' : ''} aria-pressed={w === water} onClick={() => setWater(w)}>{WATER_LABEL[w]}</button>)}</div>
        {err && <p style={{ color: 'var(--m-red-ink)', fontSize: 14, margin: '12px 0 0' }}>{err}</p>}
        <button className="m-al-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save to my boat'}</button>
      </div>
    </>
  );
};

const AssistantMsg: React.FC<{
  m: AlfieMsg; light: boolean; speaking: boolean; onSpeak: () => void; onCopy: () => void; onSave: () => void; saved: boolean; onGo: (path: string) => void;
}> = ({ m, light, speaking, onSpeak, onCopy, onSave, saved, onGo }) => {
  const nav = m.nav ? navPath(m.nav) : null;
  return (
    <div style={{ display: 'flex', gap: 10 }}>
      <Orb size={30} light={light} />
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
        {m.content ? <Answer text={m.content} /> : <div className="m-al-typing" aria-label="Alfie is thinking"><span /><span /><span /></div>}
        {m.rig && <RigTable offer={m.rig} />}
        {m.races && (m.races.length ? <RaceCards races={m.races} found={m.racesFound} onAll={() => onGo('/find-racing')} /> : <p className="m-al-mut" style={{ margin: 0, fontSize: 14 }}>No races matched that.</p>)}
        {(m.rig?.source_guide) && <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}><span className="m-al-src">{m.rig.source_guide}</span></div>}
        {!m.streaming && m.content && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="m-cb" aria-label={speaking ? 'Stop reading' : 'Read aloud'} aria-pressed={speaking} onClick={onSpeak}><Icon name={speaking ? 'pause' : 'sound'} size={19} /></button>
            <button className="m-cb" aria-label="Copy" onClick={onCopy}><Icon name="copy" size={18} /></button>
            {m.rig && <button className="m-al-pill" onClick={onSave} disabled={saved}><Icon name={saved ? 'check' : 'sail'} size={17} />{saved ? 'Saved' : `Save to my ${m.rig.design_name || m.rig.boat_type}`}</button>}
            {nav && m.nav && <button className="m-al-pill" onClick={() => onGo(nav)}><Icon name="chevron" size={17} />{m.nav.label}</button>}
          </div>
        )}
      </div>
    </div>
  );
};

const Starters: React.FC<{ name: string; light: boolean; suggestions: string[]; onRules: () => void; onSend: (t: string) => void; onDraw: () => void }> = ({ name, light, suggestions, onRules, onSend, onDraw }) => (
  <>
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, paddingTop: 8 }}>
      <Orb size={92} glow light={light} />
      <div className="m-al-disp" style={{ fontSize: 26, fontWeight: 700, textAlign: 'center', lineHeight: 1.15 }}>Hi {name || 'there'},<br />what are we working on?</div>
    </div>
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 10, marginTop: 4 }}>
      <button className="m-card m-al-at" onClick={onRules}><span className="m-al-tile" style={{ background: 'rgba(10,132,255,.16)', color: 'var(--m-blue-ink)' }}><Icon name="book" size={20} /></span>A rules question</button>
      <button className="m-card m-al-at" onClick={() => onSend('Help me set up my rig for my next race.')}><span className="m-al-tile" style={{ background: 'rgba(52,199,89,.14)', color: 'var(--m-green-ink)' }}><Icon name="sail" size={20} /></span>Set up my rig</button>
      <button className="m-card m-al-at" onClick={() => onSend('Review my recent racing. What should I work on?')}><span className="m-al-tile" style={{ background: 'rgba(255,138,43,.15)', color: 'var(--m-amber-ink)' }}><Icon name="trophy" size={20} /></span>Review my racing</button>
      <button className="m-card m-al-at" onClick={onDraw}><span className="m-al-tile" style={{ background: 'rgba(255,62,154,.14)', color: 'var(--m-pink-ink)' }}><Icon name="edit" size={20} /></span>Draw a situation</button>
    </div>
    <div className="m-card" style={{ marginTop: 2 }}>
      {suggestions.map((s, i) => <button key={s} className="m-al-sug" style={i ? { borderTop: '1px solid var(--m-line)' } : undefined} onClick={() => onSend(s)}><span className="m-al-dim">↗</span>{s}</button>)}
    </div>
  </>
);

const History: React.FC<{ items: AlfieConversation[] | null; current: string | null; onOpen: (c: AlfieConversation) => void; onDelete: (c: AlfieConversation) => void }> = ({ items, current, onOpen, onDelete }) => {
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!items) return <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{[0, 1, 2, 3].map(i => <div key={i} className="m-skel" style={{ height: 58 }} />)}</div>;
  if (!items.length) return <p className="m-empty">No conversations yet. Ask Alfie anything and it'll be kept here.</p>;
  return (
    <div className="m-card" style={{ overflow: 'hidden' }}>
      {items.map((c, i) => (
        <div key={c.id} className="m-al-hrow" style={i ? { borderTop: '1px solid var(--m-line)' } : undefined}>
          {confirm === c.id ? (
            <>
              <span style={{ flex: 1, fontSize: 14.5 }}>Delete this conversation?</span>
              <button className="m-al-pill" onClick={() => setConfirm(null)}>Keep</button>
              <button className="m-al-pill m-al-danger" onClick={() => { setConfirm(null); onDelete(c); }}>Delete</button>
            </>
          ) : (
            <>
              <button className="m-al-hopen" onClick={() => onOpen(c)} aria-current={c.id === current ? 'true' : undefined}>
                <span className="m-ell" style={{ fontWeight: 600, fontSize: 14.5 }}>{c.title || 'Conversation'}</span>
                <span className="m-al-dim" style={{ fontSize: 12.5 }}>{fmtDay((c.updated_at || c.created_at).slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </button>
              <button className="m-cb" aria-label={`Delete ${c.title || 'conversation'}`} onClick={() => setConfirm(c.id)}><Icon name="trash" size={18} /></button>
            </>
          )}
        </div>
      ))}
    </div>
  );
};

const VoiceView: React.FC<{ text: string; status: string; error: string | null; onClose: () => void; onStop: () => void; onType: () => void; onDraw: () => void }> = ({ text, status, error, onClose, onStop, onType, onDraw }) => (
  <div className="m-al-voice" role="dialog" aria-label="Talking to Alfie">
    <div className="m-al-top" style={{ justifyContent: 'space-between' }}>
      <button className="m-ibtn m-ibtn-d" aria-label="Close" onClick={onClose}><Icon name="close" /></button>
      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'rgba(235,240,255,.66)' }} aria-live="polite">{status}</span>
      <span style={{ width: 40 }} />
    </div>
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 30, padding: '0 20px' }}>
      <div style={{ position: 'relative', width: 200, height: 200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span className="m-al-ring" style={{ inset: 0, borderColor: 'rgba(77,163,255,.25)' }} />
        <span className="m-al-ring" style={{ inset: 22, borderColor: 'rgba(138,77,255,.35)', animationDelay: '.6s' }} />
        <span className="m-al-orb" style={{ width: 124, height: 124, boxShadow: '0 0 80px rgba(46,123,255,.6)' }}><span style={{ background: 'radial-gradient(circle at 35% 30%,#16233C,#0A1020 70%)' }}><AlfieSails size={52} /></span></span>
      </div>
      <div className="m-al-bars" aria-hidden="true">{[12, 24, 36, 20, 30, 40, 22, 14, 28, 18, 10].map((h, i) => <span key={i} style={{ height: h, animationDelay: `${(i % 5) * 0.12}s` }} />)}</div>
      <p className="m-al-disp" style={{ margin: 0, fontSize: 22, fontWeight: 600, lineHeight: 1.3, maxWidth: 300, textAlign: 'center', color: error ? '#FF8C82' : '#EEF1F8' }}>
        {error || (text ? `“${text}”` : 'Ask me anything. I\'ll answer out loud.')}
      </p>
    </div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 28, paddingBottom: 'calc(var(--m-safe-bottom) + 40px)' }}>
      <button className="m-cb m-al-vb" aria-label="Type instead" onClick={onType}><Icon name="edit" size={20} /></button>
      <button className="m-al-stop" aria-label={text ? 'Stop and ask' : 'Stop'} onClick={onStop}><span /></button>
      <button className="m-cb m-al-vb" aria-label="Draw it" onClick={onDraw}><Icon name="image" size={20} /></button>
    </div>
  </div>
);

/* ─────────────── The sheet ─────────────── */

/** Starters that use what Alfie knows about you: your next race and your last result. */
function useSuggestions(): string[] {
  const { calendar, memberIds, profile, myClasses } = useMobile();
  return useMemo(() => {
    const today = todayISO();
    const out: string[] = [];
    const next = calendar.filter(c => c.kind === 'race' && !c.cancelled && c.date >= today && (!myClasses.length || !c.raceClass || myClasses.includes(c.raceClass))).sort((a, b) => a.date.localeCompare(b.date))[0];
    if (next) {
      const d = daysUntil(next.date);
      out.push(d === 0 ? 'What rig for today\'s forecast?' : d === 1 ? 'What rig for tomorrow\'s forecast?'
        : d < 7 ? `What rig for ${fmtDay(next.date, { weekday: 'long' })}'s forecast?` : `What rig for ${next.title}?`);
    }
    const full = `${profile.firstName} ${profile.lastName}`.trim();
    const last = calendar.filter(c => c.kind === 'race' && c.completed && c.date <= today).sort((a, b) => b.date.localeCompare(a.date))
      .map(c => myResultFor(c, memberIds, full)).find(Boolean);
    if (last) out.push(`What cost me places at ${last.item.title}?`);
    out.push('Rule 18 at the windward mark');
    if (out.length < 3) out.push('How do I start better on a crowded line?');
    return out.slice(0, 3);
  }, [calendar, memberIds, profile.firstName, profile.lastName, myClasses]);
}

export const AskAlfieSheet: React.FC<{ onClose: () => void; message?: string; voice?: boolean }> = ({ onClose, message, voice }) => {
  const navigate = useNavigate();
  const { light, profile, toast, tap, online } = useMobile();
  const [view, setView] = useState<View>(voice ? 'voice' : 'chat');
  const [msgs, setMsgs] = useState<AlfieMsg[]>([]);
  const [convId, setConvId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [input, setInput] = useState('');
  const [attach, setAttach] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ used: number; limit: number } | null>(null);
  const [convs, setConvs] = useState<AlfieConversation[] | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [saving, setSaving] = useState<RigOffer | null>(null);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [addMenu, setAddMenu] = useState(false);
  const [placeholder, setPlaceholder] = useState('Ask Alfie anything');
  const [heard, setHeard] = useState('');
  const [voiceStatus, setVoiceStatus] = useState('Listening…');
  const [voiceErr, setVoiceErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const speakerRef = useRef<Speaker | null>(null);
  const listeningRef = useRef<Listening | null>(null);
  const silenceRef = useRef<ReturnType<typeof setTimeout>>();
  const heardRef = useRef('');
  const sentFirst = useRef(false);
  const suggestions = useSuggestions();

  const stopSpeaking = useCallback(() => { speakerRef.current?.stop(); speakerRef.current = null; setSpeakingId(null); }, []);
  const stopListening = useCallback(() => { clearTimeout(silenceRef.current); listeningRef.current?.stop(); listeningRef.current = null; }, []);
  useEffect(() => () => { abortRef.current?.abort(); speakerRef.current?.stop(); listeningRef.current?.stop(); clearTimeout(silenceRef.current); }, []);
  useEffect(() => { void loadQuota().then(q => q && setQuota({ used: q.used, limit: q.limit })); }, []);

  const toBottom = () => requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; });

  const send = useCallback(async (text: string, opts?: { speak?: boolean }) => {
    const message = text.trim() || (attach ? 'What do you make of this?' : '');
    if (!message || busy) return;
    if (!online) { setError('No signal. Alfie needs a connection.'); return; }
    stopSpeaking();
    setError(null);
    setView('chat');
    const image = attach;
    const now = Date.now();
    const userMsg: AlfieMsg = { id: `u-${now}`, role: 'user', content: message, image_url: image };
    const replyId = `a-${now}`;
    setMsgs(m => [...m, userMsg, { id: replyId, role: 'assistant', content: '', streaming: true }]);
    if (!convId) setTitle(message.length > 60 ? `${message.slice(0, 57)}...` : message);
    setInput(''); setAttach(null); setPlaceholder('Reply to Alfie'); setBusy(true);
    toBottom();
    let speaker: Speaker | null = null;
    if (opts?.speak) {
      speaker = new Speaker(() => { if (speakerRef.current === speaker) { speakerRef.current = null; setSpeakingId(null); } });
      speakerRef.current = speaker;
      setSpeakingId(replyId);
    }
    const ac = new AbortController();
    abortRef.current = ac;
    await ask({ message, conversationId: convId, imageUrl: image }, {
      onToken: raw => {
        setMsgs(m => m.map(x => x.id === replyId ? { ...x, content: visibleText(raw) } : x));
        speaker?.feed(raw);
        toBottom();
      },
      onDone: d => {
        setConvId(d.conversation_id);
        setQuota(d.quota);
        setMsgs(m => m.map(x => x.id === replyId ? {
          ...x, content: d.message, streaming: false, nav: d.navigation, rig: d.rig_settings_offer,
          races: d.race_results ?? null, racesFound: d.race_search_meta?.total_found,
        } : x));
        speaker?.finish();
        setConvs(null);
        toBottom();
      },
      onError: msg => {
        speaker?.stop();
        if (speakerRef.current === speaker) { speakerRef.current = null; setSpeakingId(null); }
        setMsgs(m => m.filter(x => x.id !== replyId || x.content).map(x => x.id === replyId ? { ...x, streaming: false } : x));
        setError(msg);
      },
    }, ac.signal);
    setBusy(false);
  }, [attach, busy, convId, online, stopSpeaking]);

  // A question handed over from elsewhere ("Ask Alfie about this race") is sent straight away
  useEffect(() => {
    if (message && !sentFirst.current) { sentFirst.current = true; void send(message); }
  }, [message, send]);

  /* Voice */
  const startVoice = useCallback(async () => {
    stopSpeaking();
    setView('voice'); setHeard(''); heardRef.current = ''; setVoiceErr(null); setVoiceStatus('Listening…');
    const kind = await speechKind();
    if (!kind) { setVoiceErr('Voice isn\'t available on this phone. Type instead.'); setVoiceStatus(''); return; }
    const finish = () => {
      stopListening();
      const t = heardRef.current.trim();
      if (t) void send(t, { speak: true });
      else setVoiceStatus('');
    };
    listeningRef.current = await listen(kind, [], {
      onText: (t, done) => {
        heardRef.current = t; setHeard(t);
        clearTimeout(silenceRef.current);
        // A pause ends the question (the phone's recogniser says when it's done; the browser one doesn't)
        silenceRef.current = setTimeout(finish, done ? 700 : 1800);
      },
      onEnd: () => { if (listeningRef.current) finish(); },
      onError: msg => { setVoiceErr(msg); setVoiceStatus(''); },
    });
  }, [send, stopListening, stopSpeaking]);
  useEffect(() => { if (voice) void startVoice(); }, [voice]); // eslint-disable-line react-hooks/exhaustive-deps

  const voiceStop = () => {
    const t = heardRef.current.trim();
    stopListening();
    if (t) void send(t, { speak: true });
    else setView('chat');
  };

  /* History */
  const openHistory = async () => {
    setView('history');
    if (!convs) setConvs(await loadConversations().catch(() => []));
  };
  const openConv = async (c: AlfieConversation) => {
    stopSpeaking(); abortRef.current?.abort();
    setView('chat'); setConvId(c.id); setTitle(c.title); setMsgs([]); setBusy(true); setError(null); setPlaceholder('Reply to Alfie');
    const h = await loadHistory(c.id).catch(() => []);
    setMsgs(h); setBusy(false); toBottom();
  };
  const removeConv = async (c: AlfieConversation) => {
    if (await deleteConversation(c.id)) {
      setConvs(cs => (cs || []).filter(x => x.id !== c.id));
      if (c.id === convId) newConversation();
      toast('Conversation deleted');
    } else toast('Couldn\'t delete that. Try again.');
  };
  const newConversation = () => {
    stopSpeaking(); abortRef.current?.abort();
    setMsgs([]); setConvId(null); setTitle(''); setError(null); setBusy(false); setPlaceholder('Ask Alfie anything'); setView('chat');
  };

  const speak = (m: AlfieMsg) => {
    if (speakingId === m.id) { stopSpeaking(); return; }
    stopSpeaking();
    const s = new Speaker(() => { if (speakerRef.current === s) { speakerRef.current = null; setSpeakingId(null); } });
    speakerRef.current = s; setSpeakingId(m.id);
    s.feed(m.content); s.finish();
  };
  const copy = async (m: AlfieMsg) => {
    try { await navigator.clipboard.writeText(plainText(m.content)); toast('Copied'); } catch { toast('Couldn\'t copy'); }
  };
  const go = (path: string) => { onClose(); navigate(path); };

  const pickPhoto = async (f?: File) => {
    if (!f) return;
    try { setAttach(await photoToDataUrl(f)); inputRef.current?.focus(); } catch (e: any) { toast(e?.message || 'That photo couldn\'t be opened.'); }
  };

  const empty = !msgs.length && !busy;
  const hasText = !!input.trim() || !!attach;
  const remaining = quota ? Math.max(0, quota.limit - quota.used) : null;

  // Android back: close the drawing / history / voice first, then the sheet
  useEffect(() => {
    const onBack = (e: Event) => {
      e.preventDefault();
      if (view === 'voice') { stopListening(); setView('chat'); } else if (view !== 'chat') setView('chat'); else onClose();
    };
    window.addEventListener('alfie-native-back', onBack);
    return () => window.removeEventListener('alfie-native-back', onBack);
  }, [view, onClose, stopListening]);

  return (
    <div className={`m-al ${light ? 'm-al-light' : ''}`} role="dialog" aria-label="Ask Alfie">
      <div className="m-al-top">
        {view === 'history' ? (
          <>
            <button className="m-ibtn" aria-label="Back" onClick={() => setView('chat')}><Icon name="back" /></button>
            <div className="m-al-title">Past conversations</div>
            <button className="m-ibtn" aria-label="New conversation" onClick={newConversation}><Icon name="plus" /></button>
          </>
        ) : (
          <>
            <button className="m-ibtn" aria-label="Close Ask Alfie" onClick={onClose}><Icon name="close" /></button>
            <div className="m-al-title m-ell">{empty ? '' : title}</div>
            {empty
              ? <button className="m-ibtn" aria-label="Past conversations" onClick={() => void openHistory()}><Icon name="clock" /></button>
              : <button className="m-ibtn" aria-label="New conversation" onClick={newConversation}><Icon name="plus" /></button>}
          </>
        )}
      </div>

      <div ref={scrollRef} className="m-al-body">
        {view === 'history' ? <History items={convs} current={convId} onOpen={c => void openConv(c)} onDelete={c => void removeConv(c)} />
          : empty ? <Starters name={profile.firstName} light={light} suggestions={suggestions} onRules={() => { setPlaceholder('Describe what happened on the water'); inputRef.current?.focus(); }} onSend={t => void send(t)} onDraw={() => setView('draw')} />
            : (
              <>
                {busy && !msgs.length && <div className="m-skel" style={{ height: 80 }} />}
                {msgs.map(m => m.role === 'user' ? (
                  <div key={m.id} className="m-al-ub">
                    {m.image_url && <img src={m.image_url} alt="" className="m-al-img" />}
                    {m.content}
                  </div>
                ) : (
                  <AssistantMsg key={m.id} m={m} light={light} speaking={speakingId === m.id} onSpeak={() => speak(m)} onCopy={() => void copy(m)}
                    onSave={() => m.rig && setSaving(m.rig)} saved={savedIds.has(m.id)} onGo={go} />
                ))}
              </>
            )}
        {error && view !== 'history' && <p role="alert" className="m-al-err">{error}</p>}
        {remaining !== null && remaining <= 3 && view === 'chat' && <p className="m-al-dim" style={{ textAlign: 'center', fontSize: 12.5, margin: 0 }}>{remaining === 0 ? 'No questions left this month' : `${remaining} question${remaining === 1 ? '' : 's'} left this month`}</p>}
      </div>

      {view !== 'history' && (
        <div className="m-al-compwrap">
          {attach && (
            <div className="m-al-attach">
              <img src={attach} alt="Attached" />
              <button className="m-cb" aria-label="Remove picture" onClick={() => setAttach(null)}><Icon name="close" size={16} /></button>
            </div>
          )}
          {addMenu && (
            <div className="m-card m-al-menu" role="menu">
              <button role="menuitem" onClick={() => { setAddMenu(false); fileRef.current?.click(); }}><Icon name="camera" size={19} />Photo</button>
              <button role="menuitem" style={{ borderTop: '1px solid var(--m-line)' }} onClick={() => { setAddMenu(false); setView('draw'); }}><Icon name="edit" size={19} />Draw a situation</button>
            </div>
          )}
          <form className="m-al-comp" onSubmit={e => { e.preventDefault(); void send(input); }}>
            <button type="button" className="m-cb" aria-label="Add photo or drawing" aria-expanded={addMenu} onClick={() => setAddMenu(v => !v)}><Icon name="plus" size={20} /></button>
            <label style={{ flex: 1, display: 'flex', minWidth: 0 }}>
              <span className="m-sr">Message</span>
              <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)} placeholder={placeholder} enterKeyHint="send" />
            </label>
            {hasText
              ? <button type="submit" className="m-cb m-cb-p" aria-label="Send" disabled={busy}><Icon name="send" size={20} /></button>
              : <button type="button" className="m-cb m-al-talk" aria-label="Talk to Alfie" onClick={() => { tap('medium'); void startVoice(); }}><Icon name="mic" size={20} /></button>}
          </form>
          <input ref={fileRef} type="file" accept="image/*" hidden onChange={e => { void pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />
        </div>
      )}

      {view === 'voice' && (
        <VoiceView text={heard} status={voiceStatus} error={voiceErr}
          onClose={() => { stopListening(); setView('chat'); }}
          onStop={voiceStop}
          onType={() => { stopListening(); setView('chat'); setInput(heardRef.current); setTimeout(() => inputRef.current?.focus(), 50); }}
          onDraw={() => { stopListening(); setView('draw'); }} />
      )}

      {view === 'draw' && (
        <div className="m-al-draw">
          <Suspense fallback={null}>
            <RaceScenarioCanvas darkMode fill onClose={() => setView('chat')} onSave={img => { setAttach(img); setView('chat'); setPlaceholder('What happened here?'); setTimeout(() => inputRef.current?.focus(), 80); }} />
          </Suspense>
        </div>
      )}

      {saving && (
        <SaveRigSheet offer={saving} onClose={() => setSaving(null)} onSaved={msg => {
          const id = msgs.find(m => m.rig === saving)?.id;
          if (id) setSavedIds(s => new Set(s).add(id));
          setSaving(null); tap('success'); toast(msg);
        }} />
      )}
    </div>
  );
};
