// Setting up a club's own water (club admins): pick the club's saved venue, get the map round it
// from OpenStreetMap, check it's the right water and say where the skippers stand, then put the
// club's local knowledge in its own words: the winds it gets, what each does there, and a few tips.
// Saved as a draft only the club's admins see, or published for everyone to sail.
// Map data © OpenStreetMap contributors (ODbL).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { V2 } from '@/sim/math';
import type { WindCharacter } from '@/sim/wind';
import { CLASSES } from '@/sim/classes';
import { buildCourse } from '@/sim/course';
import { controlNear, cutEdge, pts, siteFor, type VenueDef, type VenueLook, type VenueWind } from '@/sim/venue';
import { buildVenue, featuresOf, type OsmElement } from '@/sim/venueBuild';
import { shapeOf } from '@/sim/venueJson';
import VenuePick from './VenuePick';
import { clubVenues, fetchMap, removeWater, saveWater, type SavedVenue, type Water } from './waters';
import { Btn, C, Cap, Chip, Seg, compassName, cx } from './ui';

type Geo = Pick<VenueDef, 'water' | 'islands' | 'features' | 'landmarks' | 'cut' | 'credit'>;

const POINTS = Array.from({ length: 16 }, (_, i) => i * 22.5);
const CHARACTER: { value: WindCharacter; label: string }[] = [{ value: 'steady', label: 'Steady' }, { value: 'oscillating', label: 'Shifty' }, { value: 'puffy', label: 'Gusty' }, { value: 'persistent', label: 'Swings one way' }];
const LOOKS: { key: string; label: string; look: VenueLook }[] = [
  { key: 'hilly', label: 'Hills and trees', look: { hills: 1, trees: 1, houses: 1 } },
  { key: 'suburb', label: 'Suburbs', look: { hills: 0.7, trees: 0.9, houses: 1 } },
  { key: 'gentle', label: 'Gentle and green', look: { hills: 0.35, trees: 0.7, houses: 0.4 } },
  { key: 'flat', label: 'Flat and open', look: { hills: 0, trees: 0.3, houses: 0.12 } },
];
const lookKey = (l: VenueLook | undefined) => {
  if (!l) return 'hilly';
  let best = LOOKS[0], bd = Infinity;
  for (const k of LOOKS) { const d = Math.abs(k.look.hills - l.hills) + Math.abs(k.look.trees - l.trees) + Math.abs(k.look.houses - l.houses); if (d < bd) { bd = d; best = k; } }
  return best.key;
};

const inp = 'h-10 w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.06] px-3 text-[14px] text-[#F1F4FA] placeholder:text-[rgba(235,240,255,0.4)] disabled:opacity-60';
const area = 'w-full min-w-0 rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-[14px] leading-snug text-[#F1F4FA] placeholder:text-[rgba(235,240,255,0.4)]';

function Field({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cx('flex min-w-0 flex-col gap-1', className)}>
      <span className="text-[12.5px] font-semibold" style={{ color: C.mute }}>{label}</span>
      {children}
      {hint && <span className="text-[12px] leading-snug" style={{ color: C.faint }}>{hint}</span>}
    </label>
  );
}

function Step({ n, title, text, children }: { n: number; title: string; text?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-4">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#2E7BFF] font-display text-[14px] font-bold text-white">{n}</span>
        <div className="min-w-0"><h3 className="m-0 font-display text-[17px] font-bold leading-tight">{title}</h3>{text && <p className="m-0 mt-0.5 text-[13px] leading-snug" style={{ color: C.mute }}>{text}</p>}</div>
      </div>
      {children}
    </section>
  );
}

function WindRow({ w, first, onChange, onRemove }: { w: VenueWind; first: boolean; onChange: (w: VenueWind) => void; onRemove: (() => void) | null }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-2xl border border-white/[0.08] bg-black/20 p-3">
      <div className="flex flex-wrap items-center gap-2">
        {first ? <Chip tone="blue">The usual breeze</Chip> : <Chip>Another wind</Chip>}
        {onRemove && <Btn small quiet className="ml-auto" onClick={onRemove}>Remove</Btn>}
      </div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-[130px_minmax(0,1fr)_minmax(0,1fr)]">
        <Field label="Blows from">
          <select className={inp} value={String(Math.round(w.from / 22.5) * 22.5 % 360)} onChange={e => onChange({ ...w, from: Number(e.target.value) })}>
            {POINTS.map(p => <option key={p} value={String(p)}>{compassName(p)} ({String(Math.round(p)).padStart(3, '0')}°)</option>)}
          </select>
        </Field>
        <Field label="What you call it"><input className={inp} maxLength={40} placeholder="NE sea breeze" value={w.name} onChange={e => onChange({ ...w, name: e.target.value })} /></Field>
        <Field label="When you get it" className="col-span-2 sm:col-span-1"><input className={inp} maxLength={60} placeholder="Summer afternoons" value={w.when ?? ''} onChange={e => onChange({ ...w, when: e.target.value })} /></Field>
      </div>
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2.5">
        <div className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold" style={{ color: C.mute }}>How it behaves</span><Seg size="sm" label="How it behaves" value={w.character} onChange={v => onChange({ ...w, character: v })} options={CHARACTER} /></div>
        <div className="flex flex-col gap-1"><span className="text-[12.5px] font-semibold" style={{ color: C.mute }}>Where the better breeze is</span>
          <Seg size="sm" label="Where the better breeze is" value={w.pays ?? 'none'} onChange={v => onChange({ ...w, pays: v === 'none' ? undefined : v })}
            options={[{ value: 'none', label: 'No side' }, { value: 'bank', label: 'Along our bank' }, { value: 'out', label: 'Out from our bank' }]} />
        </div>
      </div>
      <Field label="What it does on your water" hint="Alfie passes this on as the start sequence opens.">
        <textarea className={area} rows={2} maxLength={240} placeholder="Gusty and shifty off the trees. It often pays to run the shoreline." value={w.note ?? ''} onChange={e => onChange({ ...w, note: e.target.value })} />
      </Field>
    </div>
  );
}

interface Props {
  clubId: string;
  /** The club's water to change, or null to set one up. */
  existing: Water | null;
  /** A venue that came with the app for this club, to start from (its shape and a first reading of its winds). */
  startFrom: VenueDef | null;
  onClose: () => void;
  onSaved: (w: Water) => void;
  onRemoved: (rowId: string) => void;
}

let drafts = 0;

export default function VenueBuilder({ clubId, existing, startFrom, onClose, onSaved, onRemoved }: Props) {
  const from = existing?.def ?? startFrom;
  const [saved, setSaved] = useState<SavedVenue[] | null>(null);
  const [venueId, setVenueId] = useState<string | null>(existing?.venueId ?? startFrom?.venueId ?? null);
  const [at, setAt] = useState<{ lat: number; lon: number } | null>(from ? { lat: from.lat, lon: from.lon } : null);
  const [geo, setGeo] = useState<Geo | null>(from ? { water: from.water, islands: from.islands, features: from.features, landmarks: from.landmarks, cut: from.cut, credit: from.credit } : null);
  const [control, setControl] = useState<[V2, V2] | null>(from?.control ?? null);
  const [build, setBuild] = useState(() => ++drafts);
  const elements = useRef<OsmElement[] | null>(null);
  const [half, setHalf] = useState<900 | 1400>(from?.cut && from.cut > 1100 ? 1400 : 900);
  const [mode, setMode] = useState<'stand' | 'water'>('stand');
  const [busy, setBusy] = useState<'map' | 'save' | 'remove' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [mapNote, setMapNote] = useState<string | null>(null);
  const [name, setName] = useState(from?.name ?? '');
  const [short, setShort] = useState(from?.short ?? '');
  const [place, setPlace] = useState(from?.place ?? '');
  const [about, setAbout] = useState(from?.traits?.about ?? '');
  const [winds, setWinds] = useState<VenueWind[]>(from?.traits?.winds.length ? from.traits.winds : [{ from: from?.usualWind ?? 45, name: from?.usualWindName ?? '', character: 'oscillating' }]);
  const [notes, setNotes] = useState<string[]>(from?.traits?.notes.length ? from.traits.notes : ['']);
  const [look, setLook] = useState(lookKey(from?.look));
  const [sure, setSure] = useState(false);
  const stop = useRef<AbortController | null>(null);

  useEffect(() => {
    let live = true;
    void clubVenues(clubId).then(v => {
      if (!live) return;
      setSaved(v);
      // Nothing chosen yet: the club's main venue.
      if (!from && v.length) { setVenueId(v[0].id); setAt({ lat: v[0].lat, lon: v[0].lon }); setName(n => n || v[0].name); setShort(s => s || v[0].name.slice(0, 18)); }
    });
    return () => { live = false; stop.current?.abort(); };
  }, [clubId, from]);
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { window.removeEventListener('keydown', k); document.body.style.overflow = prev; };
  }, [onClose]);

  /** Work the venue out from the map: the water nearest the club, or the water pointed at. */
  const make = (els: OsmElement[], h: number, pick?: V2) => {
    if (!at) return false;
    const b = buildVenue(els, at.lat, at.lon, { half: h, pick });
    if (!b) { setMapNote(pick ? "There's no mapped water there. Tap on the water you sail on." : "The map has no water within 300 m of this venue's saved location. Check the venue's location, or tap the map where your water is."); return false; }
    setGeo({ water: pts(b.water), islands: b.islands.map(pts), features: featuresOf(b), landmarks: b.landmarks, cut: b.cut, credit: '© OpenStreetMap contributors' });
    setControl(b.control);
    setBuild(++drafts);
    setPlace(p => p || b.waterName);
    setMapNote(b.waterName ? `This is ${b.waterName}, from the map.` : 'This is the water nearest your venue, from the map.');
    return true;
  };
  const getMap = async (h: number = half) => {
    if (!at || busy) return;
    setBusy('map'); setErr(null); setMapNote(null);
    stop.current?.abort();
    stop.current = new AbortController();
    const r = await fetchMap(at.lat, at.lon, h, stop.current.signal);
    setBusy(null);
    if (typeof r === 'string') { if (r !== 'Stopped.') setMapNote(r); return; }
    elements.current = r;
    make(r, h);
  };
  const tap = (p: [number, number] | null) => {
    if (!p || !geo) return;
    const q = { x: p[0], y: p[1] };
    if (mode === 'water') {
      if (!elements.current) { setMapNote('Get the map again first, then tap your water.'); return; }
      if (make(elements.current, half, q)) setMode('stand');
      return;
    }
    const c = controlNear([geo.water, ...geo.islands], q, cutEdge({ water: geo.water, cut: geo.cut } as VenueDef));
    if (c) setControl(c);
  };

  // The venue as it stands, for the map (its names don't matter there, so typing them doesn't redraw it).
  const def = useMemo<VenueDef | null>(() => (geo && control && at ? {
    id: `draft-${build}`, name: 'Your water', short: 'Your water', place: '', lat: at.lat, lon: at.lon,
    usualWind: 0, usualWindName: 'usual breeze', control, ...geo,
  } : null), [geo, control, at, build]);

  // Does a course fit off where the skippers stand, wind by wind? (An IOM, at the usual length or
  // shorter.) Worked out a moment after the map has redrawn.
  const [fits, setFits] = useState<number[] | null>(null);
  useEffect(() => {
    setFits(null);
    if (!def) return;
    const id = window.setTimeout(() => {
      const L = CLASSES.IOM.loa;
      const courses = (['medium', 'short'] as const).map(len => buildCourse(0, L, { laps: 2, length: len, fleetSize: 8, lineBias: 0 }));
      setFits(POINTS.filter(p => !siteFor(def, p, null, courses)));
    }, 60);
    return () => window.clearTimeout(id);
  }, [def]);
  const badWinds = fits ? winds.filter(w => fits.some(p => Math.abs(((w.from - p + 540) % 360) - 180) < 12)) : [];

  const usable = winds.filter(w => w.name.trim());
  const problem = !geo || !control || !at ? 'Get the map first.'
    : name.trim().length < 2 ? 'Give the water a name.'
      : short.trim().length < 2 ? 'Give it a short name.'
        : !usable.length ? 'Name your usual breeze.' : null;
  const cantPublish = problem ?? (badWinds.length ? `A course won't fit where you stand in the ${badWinds.map(w => w.name || compassName(w.from)).join(' or ')}. Move along the bank on the map.` : null);

  const save = async (publish: boolean) => {
    if (problem || !geo || !control || !at || busy) return;
    setBusy('save'); setErr(null);
    const r = await saveWater({
      rowId: existing?.rowId ?? null, clubId, venueId, name, short, place, lat: at.lat, lon: at.lon,
      shape: shapeOf({ ...geo, control }),
      traits: { about: about.trim(), winds: usable.map(w => ({ ...w, name: w.name.trim(), when: w.when?.trim() || undefined, note: w.note?.trim() || undefined })), notes: notes.map(n => n.trim()).filter(Boolean) },
      look: LOOKS.find(k => k.key === look)!.look, published: publish,
    });
    setBusy(null);
    if (typeof r === 'string') setErr(r); else onSaved(r);
  };
  const remove = async () => {
    if (!existing || busy) return;
    setBusy('remove');
    const ok = await removeWater(existing.rowId);
    setBusy(null);
    if (ok) onRemoved(existing.rowId); else setErr("That didn't remove it. Try again.");
  };

  const chosen = saved?.find(v => v.id === venueId) ?? null;
  return (
    <div className="fixed inset-0 z-[9988] flex items-end justify-center sm:items-center sm:p-5" role="dialog" aria-modal="true" aria-label="Set up your club's water">
      <button type="button" aria-label="Close without saving" onClick={onClose} className="absolute inset-0 cursor-default border-0 bg-[rgba(3,7,16,0.78)] backdrop-blur-[6px]" />
      <div className="relative flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-[26px] border border-white/10 bg-[#0B1322] text-[#F1F4FA] shadow-[0_30px_80px_rgba(0,0,0,0.6)] sm:max-w-[820px] sm:rounded-[26px]" style={{ fontFamily: "'Instrument Sans', system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
        <div className="flex items-start gap-3 border-b border-white/[0.07] px-5 pb-4 pt-5">
          <div className="min-w-0 flex-1">
            <h2 className="m-0 font-display text-[21px] font-bold leading-tight">{existing ? "Your club's water" : "Set up your club's water"}</h2>
            <p className="m-0 mt-1 text-[13.5px] leading-snug" style={{ color: C.mute }}>Built from your venue's location and the map, with what your club knows about sailing there. {existing?.published ? 'Published: everyone can sail it.' : existing ? 'A draft: only your club\'s admins see it.' : ''}</p>
          </div>
          <Btn onClick={onClose}>Close</Btn>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto px-5 pb-5 pt-4">
          <Step n={1} title="The venue" text="The simulator draws the water round the location saved for this venue.">
            {saved === null ? <p className="m-0 text-[13px]" style={{ color: C.mute }}>Finding your club's venues…</p>
              : !saved.length && !at ? <p className="m-0 text-[13.5px]" style={{ color: '#FFCB96' }}>Your club has no venue with a location yet. Add one under Venues (with its address or a pin on the map), then come back.</p>
                : (
                  <div className="flex flex-wrap items-end gap-2.5">
                    <Field label="Venue" className="min-w-[220px] flex-1">
                      <select className={inp} value={venueId ?? ''} disabled={!!existing || busy === 'map'} onChange={e => { const v = saved.find(x => x.id === e.target.value); if (!v) return; setVenueId(v.id); setAt({ lat: v.lat, lon: v.lon }); setGeo(null); setControl(null); elements.current = null; setMapNote(null); if (!name) setName(v.name); }}>
                        {!chosen && venueId && <option value={venueId}>{from?.name ?? 'This venue'}</option>}
                        {saved.map(v => <option key={v.id} value={v.id}>{v.name}{v.address ? ` · ${v.address}` : ''}</option>)}
                      </select>
                    </Field>
                    <Btn primary={!geo} disabled={!at || busy !== null} onClick={() => void getMap()}>{busy === 'map' ? 'Getting the map…' : geo ? 'Get the map again' : 'Get the map'}</Btn>
                  </div>
                )}
            {busy === 'map' && <p className="m-0 text-[13px]" style={{ color: C.mute }}>Asking OpenStreetMap for the water, the banks and what's on them. This can take up to a minute.</p>}
            {mapNote && <p className="m-0 text-[13px]" role="status" style={{ color: C.mute }}>{mapNote}</p>}
          </Step>

          {def && (
            <Step n={2} title="Your water, and where you stand" text="Check this is the water you sail on, then tap the bank where your skippers stand. The marks show the course Alfie would lay there in your usual breeze.">
              <div className="flex flex-wrap items-center gap-2">
                <Seg size="sm" label="What a tap on the map does" value={mode} onChange={setMode} options={[{ value: 'stand', label: 'Set where we stand' }, { value: 'water', label: "That's not our water" }]} />
                <Seg size="sm" label="How much water to keep" value={String(half)} onChange={v => { const h = v === '1400' ? 1400 : 900; setHalf(h); if (elements.current) make(elements.current, h); else void getMap(h); }}
                  options={[{ value: '900', label: 'Near the club' }, { value: '1400', label: 'A wider view' }]} />
              </div>
              <VenuePick def={def} spot={null} onSpot={tap} windFrom={winds[0]?.from ?? 0} windName={winds[0]?.name || 'Usual breeze'} classId="IOM" length="medium" fleetSize={8} laps={2}
                caption={mode === 'water' ? 'Tap the water your club sails on, and the simulator will use that instead.' : 'Tap the map to move where your skippers stand: it goes to the nearest bank.'} />
              {fits && (fits.length === 0
                ? <p className="m-0 text-[13px]" style={{ color: '#A7F3D0' }}>A course fits off this bank whichever way the wind blows.</p>
                : <p className="m-0 text-[13px]" style={{ color: '#FFCB96' }}>No course fits off this bank with the wind from the {fits.map(compassName).join(', ')}. In those winds the race falls back to the practice pond, so try another stretch of bank.</p>)}
            </Step>
          )}

          {def && (
            <Step n={3} title="What it's called">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1.3fr)_minmax(0,0.8fr)]">
                <Field label="Name"><input className={inp} maxLength={80} placeholder="Lake Macquarie RYC" value={name} onChange={e => setName(e.target.value)} /></Field>
                <Field label="Short name" hint="Shown on the set-up tile: 18 letters or fewer reads best."><input className={inp} maxLength={30} placeholder="LMRYC · Booragul" value={short} onChange={e => setShort(e.target.value)} /></Field>
                <Field label="Where it is" className="sm:col-span-2"><input className={inp} maxLength={160} placeholder="Booragul foreshore, Lake Macquarie" value={place} onChange={e => setPlace(e.target.value)} /></Field>
                <Field label="About the place" hint="A line or two: what you look out on, and how it sails." className="sm:col-span-2"><textarea className={area} rows={2} maxLength={400} value={about} onChange={e => setAbout(e.target.value)} /></Field>
              </div>
              <div className="flex flex-col gap-1"><Cap>The country round it</Cap><Seg label="The country round it" value={look} onChange={setLook} options={LOOKS.map(k => ({ value: k.key, label: k.label }))} /></div>
            </Step>
          )}

          {def && (
            <Step n={4} title="Your winds" text="The winds your club races in, the usual one first. Skippers pick one, the wind behaves the way you say, and Alfie passes on what you write.">
              {winds.map((w, i) => (
                <WindRow key={i} w={w} first={i === 0} onChange={n => setWinds(ws => ws.map((x, k) => (k === i ? n : x)))} onRemove={winds.length > 1 ? () => setWinds(ws => ws.filter((_, k) => k !== i)) : null} />
              ))}
              {winds.length < 6 && <div><Btn small onClick={() => setWinds(ws => [...ws, { from: (ws[ws.length - 1].from + 180) % 360, name: '', character: 'puffy' }])}>Add a wind</Btn></div>}
            </Step>
          )}

          {def && (
            <Step n={5} title="Local tips" text="Short things every member knows about this water. Shown before the race.">
              {notes.map((n, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input className={inp} maxLength={200} aria-label={`Tip ${i + 1}`} placeholder="The far bank is in a wind shadow under the trees." value={n} onChange={e => setNotes(ns => ns.map((x, k) => (k === i ? e.target.value : x)))} />
                  {notes.length > 1 && <Btn small quiet aria-label={`Remove tip ${i + 1}`} onClick={() => setNotes(ns => ns.filter((_, k) => k !== i))}>Remove</Btn>}
                </div>
              ))}
              {notes.length < 6 && <div><Btn small onClick={() => setNotes(ns => [...ns, ''])}>Add a tip</Btn></div>}
            </Step>
          )}

          {existing && (
            <div className="flex flex-wrap items-center gap-2 text-[13px]" style={{ color: C.mute }}>
              {sure ? <><span>Remove this water for everyone? Challenges already set on it will fall back to the practice pond.</span><Btn small disabled={busy !== null} onClick={() => void remove()}>{busy === 'remove' ? 'Removing…' : 'Yes, remove it'}</Btn><Btn small quiet onClick={() => setSure(false)}>Keep it</Btn></>
                : <Btn small quiet onClick={() => setSure(true)}>Remove this water</Btn>}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 border-t border-white/[0.07] px-5 py-3.5">
          <p className="m-0 min-w-0 flex-1 basis-full text-[13px] leading-snug sm:basis-[220px]" role="status" style={{ color: err ? '#FCA5A5' : C.mute }}>
            {err ?? cantPublish ?? (existing?.published ? 'Changes go live for everyone when you publish.' : 'Save a draft to try it yourself, or publish it for everyone.')}
          </p>
          <Btn disabled={!!problem || busy !== null} onClick={() => void save(false)}>{busy === 'save' ? 'Saving…' : existing?.published ? 'Unpublish' : 'Save draft'}</Btn>
          <Btn primary disabled={!!cantPublish || busy !== null} onClick={() => void save(true)}>{existing?.published ? 'Publish changes' : 'Publish'}</Btn>
        </div>
      </div>
    </div>
  );
}
