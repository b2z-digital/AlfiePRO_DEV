// academy.alfiepro.com.au: what the Sailing Academy is, what it looks like, who it's for, and the
// way in (a free week, or a free sail). From the design board's "Website · Home".
import { type ReactNode, useEffect, useState } from 'react';
import { ArrowRight, Clock, Keyboard, Monitor, Play, X } from 'lucide-react';
import { Logo } from '../../Logo';
import { PRICES, money, yearSaving } from '../plans';
import { BODY, Button, Check, DISPLAY, Eyebrow, Footer, H2, Header, INK, Page, Wrap } from './Shell';

/** The clips: a real recording at /academy/clips/<id>.mp4 plays when it's there; until then, the still. */
const CLIPS = [
  { id: 'transmitter', img: 'transmitter', title: 'Your own transmitter', line: 'Plug your radio in with its USB cable. A quick stick check makes sure left is left and the winch pulls in. Then your thumbs know what to do.' },
  { id: 'drills', img: 'drill', title: 'Train with Alfie', line: 'Short drills with a picture of what to do and which way to push the sticks: find the favoured end, hold your spot, tack on the shifts.' },
  { id: 'circuit', img: 'circuit', title: 'The AlfiePRO Circuit', line: 'Race days, a season and a championship, scored with drops the way your club scores. Win a title and step up a level.' },
  { id: 'sails', img: 'sails', title: 'Sails you can hear', line: 'Luff up and the film cracks and flogs. Sheet on and it goes quiet and drives. Sound up on this one.' },
  { id: 'broadcast', img: 'broadcast', title: 'Watch it back like TV', line: 'Replay your race with a leaderboard and the camera on the action. Save the highlights as a video to send to your mates.' },
  { id: 'venues', img: 'venue', title: 'Your own water', line: 'Real club venues in 3D, with their banks, trees and local breezes. Learn where the shifts come from before Sunday.' },
  { id: 'yacht', img: 'yacht', title: 'Design your yacht', line: 'Your hull colours, your sail number, your country. Class-legal, just like the boat in your shed.' },
  { id: 'race-officer', img: 'heats', title: 'Be the race officer', line: 'Set a square line, call the boats over early, score the heats and hear a protest. Practise the job nobody else wants.' },
  { id: 'clubs', img: 'clubs', title: 'Club against club', line: 'Every race you sail scores for your club on the world boards. Bragging rights at the next club day.' },
];

/** Which clips have a recording on the server (a missing file comes back as the app's page, not a video). */
function useRecorded(ids: string[]): Set<string> {
  const [have, setHave] = useState<Set<string>>(new Set());
  useEffect(() => {
    let live = true;
    void Promise.all(ids.map(async id => {
      try {
        const r = await fetch(`/academy/clips/${id}.mp4`, { method: 'HEAD' });
        return r.ok && (r.headers.get('content-type') ?? '').startsWith('video/') ? id : null;
      } catch { return null; }
    })).then(found => { if (live) setHave(new Set(found.filter((x): x is string => !!x))); });
    return () => { live = false; };
  }, [ids.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  return have;
}

function PlayDot({ size = 52 }: { size?: number }) {
  return <span aria-hidden="true" className="grid place-items-center rounded-full bg-white" style={{ width: size, height: size, boxShadow: '0 10px 30px rgba(0,0,0,.4)' }}><Play size={size * 0.38} fill={INK.bg} color={INK.bg} /></span>;
}

function ClipFrame({ id, img, alt, playable, onPlay, ratio = '16 / 10', big = false, children }: { id: string; img: string; alt: string; playable: boolean; onPlay: (id: string) => void; ratio?: string; big?: boolean; children?: ReactNode }) {
  const inner = (
    <>
      <img src={`/academy/${img}.jpg`} alt={alt} className="block h-full w-full object-cover" loading="lazy" />
      {playable && (big
        ? <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"><PlayDot size={104} /></span>
        : <span className="absolute bottom-4 left-4"><PlayDot /></span>)}
      {children}
    </>
  );
  const style = { aspectRatio: ratio, background: INK.panel, border: `1px solid ${INK.line}` };
  return playable
    ? <button type="button" onClick={() => onPlay(id)} aria-label={`Play: ${alt}`} className="relative block w-full cursor-pointer overflow-hidden rounded-2xl p-0" style={style}>{inner}</button>
    : <div className="relative overflow-hidden rounded-2xl" style={style}>{inner}</div>;
}

export default function AcademyHome({ base, signedIn }: { base: string; signedIn: boolean }) {
  const [yearly, setYearly] = useState(true);
  const [playing, setPlaying] = useState<string | null>(null);
  const recorded = useRecorded(['film', ...CLIPS.map(c => c.id)]);
  const per = yearly ? 'a year' : 'a month';
  const iv = yearly ? 'year' : 'month';
  const start = `${base}/start`;

  useEffect(() => { document.title = 'AlfiePRO Sailing Academy: race RC yachts any time'; }, []);
  useEffect(() => {
    if (!playing) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') setPlaying(null); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [playing]);

  return (
    <Page>
      <header>
        <Header base={base} signedIn={signedIn} />
        <Wrap className="flex flex-col items-center pb-[72px] pt-14 text-center md:pt-24">
          <p className="m-0 inline-flex items-center rounded-full px-4 py-2 text-[15px] font-semibold" style={{ background: 'rgba(255,159,67,.08)', border: '1px solid rgba(255,255,255,.14)', color: INK.peach }}>IOM · Marblehead · 10 Rater · DF95 · DF65</p>
          <h1 className="m-0 mt-8 max-w-[980px]" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(44px, 6.4vw, 80px)', lineHeight: 0.98, letterSpacing: '-.03em', color: '#fff' }}>Race RC yachts any time of the week.</h1>
          <p className="m-0 mt-8 max-w-[760px]" style={{ fontSize: 22, lineHeight: 1.55, color: 'rgba(235,240,255,.88)' }}>The fastest way to get better at radio sailing. Plug in your own transmitter and race a full fleet that starts, rounds and covers like real skippers. Alfie coaches every race, picks your training and moves you up from Club to World.</p>
          <ul aria-label="Who it's for" className="m-0 mt-12 grid w-full max-w-[1040px] list-none gap-5 p-0 text-left md:grid-cols-3">
            {[
              { tag: 'Brand new', tint: '#7FA6CF', head: 'Learn to steer, trim and start, with nobody watching.', line: 'Step-by-step lessons show you which way to push the sticks. Turn up to your first club day ready.' },
              { tag: 'Club racer', tint: '#F5A54A', head: 'Find where you lose places, and fix it.', line: 'Alfie spots it in your starts, shifts and roundings, then sets the drills to sort it out.' },
              { tag: 'Top of the fleet', tint: '#9B7BFF', head: 'Keep your hours on the sticks and stay dialled in.', line: 'Race National and World-level fleets between regattas, in any weather you choose.' },
            ].map(c => (
              <li key={c.tag} className="flex flex-col gap-2 rounded-[20px] p-7" style={{ background: INK.panel, border: '1px solid rgba(255,255,255,.08)' }}>
                <span className="text-[13px] font-bold uppercase tracking-[0.14em]" style={{ color: c.tint }}>{c.tag}</span>
                <strong className="text-[19px] leading-snug">{c.head}</strong>
                <span className="text-[16px]" style={{ color: 'rgba(235,240,255,.78)' }}>{c.line}</span>
              </li>
            ))}
          </ul>
          <div className="mt-11 flex flex-wrap items-center justify-center gap-4">
            <Button to={start} big>Start your free week <ArrowRight size={20} aria-hidden="true" /></Button>
            {recorded.has('film') && <button type="button" onClick={() => setPlaying('film')} className="inline-flex min-h-[62px] cursor-pointer items-center gap-3 rounded-full pl-3 pr-6 text-[18px] font-semibold text-white" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,.22)' }}><PlayDot size={40} />Watch the 90-second film</button>}
          </div>
          <p className="m-0 mt-6 max-w-[680px] text-[15px]" style={{ color: INK.mute }}>7 days free, then {money(PRICES.academy.year)} a year. Stop any time. Runs in your browser, nothing to install. <a href={`${start}?free=1`} style={{ color: '#fff' }}>Or have a free sail first</a>.</p>
        </Wrap>
        <Wrap className="pb-24">
          <figure className="relative m-0 overflow-hidden rounded-[28px]" style={{ border: `1px solid ${INK.line}`, boxShadow: '0 40px 100px rgba(0,0,0,.5)' }}>
            <img src="/academy/hero.jpg" alt="IOMs racing past tall gum trees on a real club's water" className="block w-full object-cover" style={{ aspectRatio: '1720 / 790' }} />
            <figcaption className="absolute bottom-6 left-6 hidden flex-wrap gap-2.5 sm:flex">
              <span className="rounded-xl px-3.5 py-2 text-[15px] font-semibold text-white" style={{ background: 'rgba(6,11,22,.86)' }}>Real club water, built in 3D</span>
              <span className="rounded-xl px-3.5 py-2 text-[15px] font-semibold text-white" style={{ background: 'rgba(6,11,22,.86)' }}>Recorded in the Academy</span>
            </figcaption>
          </figure>
        </Wrap>
      </header>

      <section aria-label="What you need" style={{ borderTop: `1px solid ${INK.line}`, borderBottom: `1px solid ${INK.line}`, background: '#081022' }}>
        <Wrap className="grid gap-x-10 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: <TransmitterIcon />, head: 'Your own transmitter', line: 'USB cable, a 20-second stick check' },
            { icon: <Keyboard size={32} color={INK.blue} aria-hidden="true" />, head: 'Or keyboard and touch', line: 'Arrow keys, or drag on an iPad' },
            { icon: <Monitor size={32} color={INK.blue} aria-hidden="true" />, head: 'Mac, PC, Chromebook, iPad', line: 'Open it in the browser you already use' },
            { icon: <Clock size={32} color={INK.blue} aria-hidden="true" />, head: 'A race in 5 minutes', line: 'Fits before dinner, after work' },
          ].map(x => (
            <div key={x.head} className="flex items-center gap-4 py-6 lg:py-10">
              {x.icon}
              <div><strong className="block text-[16px]">{x.head}</strong><span className="text-[15px]" style={{ color: 'rgba(235,240,255,.74)' }}>{x.line}</span></div>
            </div>
          ))}
        </Wrap>
      </section>

      <section id="see-it" className="pb-20 pt-40">
        <Wrap>
          <Eyebrow>See it in action</Eyebrow>
          <H2>It sails like the pond. It races like your club.</H2>
          <p className="m-0 mt-6 max-w-[680px] text-[19px]" style={{ color: 'rgba(235,240,255,.78)' }}>Every picture here is the real Academy, recorded as it runs.</p>
          <div className="mt-16">
            <ClipFrame id="film" img="race" alt="A race at Booragul: wind, clock, course and the fleet rounding the first mark" playable={recorded.has('film')} onPlay={setPlaying} ratio="16 / 10" big>
              <span className="absolute bottom-5 left-6 right-6 flex items-end justify-between gap-4 text-left">
                <span className="flex flex-col gap-1 rounded-2xl px-4 py-3" style={{ background: 'rgba(6,11,22,.86)' }}>
                  <strong className="text-white" style={{ fontFamily: DISPLAY, fontSize: 24 }}>One race, start to finish</strong>
                  <span className="text-[15px]" style={{ color: 'rgba(235,240,255,.82)' }}>Booragul, 10 boats, National skippers, Alfie coaching</span>
                </span>
              </span>
            </ClipFrame>
          </div>
          <div className="mt-[88px] grid gap-x-10 gap-y-[72px] md:grid-cols-2 lg:grid-cols-3">
            {CLIPS.map(c => (
              <article key={c.id} className="flex flex-col gap-4">
                <ClipFrame id={c.id} img={c.img} alt={c.title} playable={recorded.has(c.id)} onPlay={setPlaying} />
                <h3 className="m-0 mt-2.5" style={{ fontFamily: DISPLAY, fontSize: 24, fontWeight: 700 }}>{c.title}</h3>
                <p className="m-0" style={{ color: 'rgba(235,240,255,.78)' }}>{c.line}</p>
              </article>
            ))}
          </div>
        </Wrap>
      </section>

      <section aria-labelledby="levels-h" className="py-[120px]">
        <Wrap>
          <div className="relative overflow-hidden rounded-[28px]" style={{ border: `1px solid ${INK.line}` }}>
            <img src="/academy/topview.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
            <div aria-hidden="true" className="absolute inset-0" style={{ background: 'rgba(6,11,22,.82)' }} />
            <div className="relative flex flex-wrap items-center gap-16 px-8 py-16 md:px-20 md:py-[88px]">
              <div className="flex-[1_1_380px]">
                <Eyebrow>Climb the levels</Eyebrow>
                <H2 id="levels-h">Skippers who get sharper as you do.</H2>
                <p className="m-0 mt-5 text-[19px]" style={{ color: 'rgba(235,240,255,.82)' }}>At Club they're friendly. By National they fight for the favoured end, hold their gaps on a packed line and cover you up the beat. Earn your licence to move up.</p>
              </div>
              <ol className="m-0 flex flex-[1_1_380px] list-none flex-col gap-3 p-0">
                {[['Club', '#7FA6CF', 'Learn the starts and the marks'], ['State', '#F5A54A', 'Shifts, laylines, clean air'], ['National', '#5B8DEF', 'A fight for every end of the line'], ['World', '#9B7BFF', 'No mistakes go unpunished']].map(([n, c, l]) => (
                  <li key={n} className="flex items-center gap-4 rounded-2xl px-6 py-5" style={{ background: 'rgba(7,13,27,.86)', border: '1px solid rgba(255,255,255,.1)' }}>
                    <span className="h-3.5 w-3.5 rounded-full" style={{ background: c }} />
                    <strong className="w-28 text-[18px]">{n}</strong>
                    <span style={{ color: 'rgba(235,240,255,.8)' }}>{l}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Wrap>
      </section>

      <section id="how" aria-labelledby="how-h" className="pb-40 pt-[120px]">
        <Wrap>
          <Eyebrow>How it works</Eyebrow>
          <H2 id="how-h">Sailing in four steps. No fiddling.</H2>
          <ol className="m-0 mt-16 grid list-none gap-7 p-0 sm:grid-cols-2 lg:grid-cols-4">
            {[
              ['Your email, then a card', 'Apple Pay or Google Pay works. Nothing is charged for 7 days, and there’s no password to remember.'],
              ['Press “Open the Academy”', 'It opens in your browser. We email you the link too, for next time.'],
              ['Plug in your transmitter', 'Wiggle the sticks when asked. Two taps confirm left, right, in and out.'],
              ['Race, with Alfie talking you through', 'A short first race against friendly skippers. Alfie tells you what to do next.'],
            ].map(([h, l], k) => (
              <li key={h} className="flex flex-col gap-4 rounded-[20px] px-8 py-9" style={{ background: INK.panel, border: '1px solid rgba(255,255,255,.08)' }}>
                <span className="grid h-12 w-12 place-items-center rounded-full text-[22px] font-bold text-white" style={{ background: INK.button, fontFamily: DISPLAY }}>{k + 1}</span>
                <strong className="text-[21px] leading-snug">{h}</strong>
                <span style={{ color: 'rgba(235,240,255,.78)' }}>{l}</span>
              </li>
            ))}
          </ol>
        </Wrap>
      </section>

      <section id="clubs" aria-labelledby="clubs-h" className="pb-40">
        <Wrap>
          <div className="flex flex-wrap items-center gap-16 rounded-[28px] px-8 py-14 md:px-[72px] md:py-20" style={{ background: '#0B1A33', border: '1px solid rgba(77,163,255,.3)' }}>
            <div className="flex-[1_1_420px]">
              <p className="m-0 inline-flex items-center gap-2.5 text-[14px] font-bold uppercase tracking-[0.18em]" style={{ color: '#9CCBFF' }}><Logo className="!h-6 !w-6" />Member of an AlfiePRO club?</p>
              <H2 id="clubs-h">Your club membership gets you the Academy for less.</H2>
              <p className="m-0 mt-5 text-[19px]" style={{ color: 'rgba(235,240,255,.82)' }}>Sign up with the email your club has for you. We'll see your membership and take a third off, straight away.</p>
              <div className="mt-7"><Button to={start} kind="light">Get the member price</Button></div>
            </div>
            <div className="flex flex-[0_1_360px] flex-col gap-2.5 rounded-[22px] p-7" style={{ background: INK.bg, border: `1px solid ${INK.line}` }}>
              <span className="text-[15px] font-semibold" style={{ color: 'rgba(235,240,255,.78)' }}>Academy, member price</span>
              <span style={{ fontFamily: DISPLAY, fontSize: 56, fontWeight: 700, lineHeight: 1 }}>{money(PRICES.member.year)}<span className="text-[20px] font-semibold" style={{ color: 'rgba(235,240,255,.78)' }}> a year</span></span>
              <span className="text-[16px]" style={{ color: 'rgba(235,240,255,.82)' }}>or {money(PRICES.member.month)} a month. Everyone else pays {money(PRICES.academy.year)}.</span>
              <span className="mt-2 border-t pt-3.5 text-[15px]" style={{ borderColor: INK.line, color: 'rgba(235,240,255,.78)' }}>Your Academy races count for your club on the world boards.</span>
            </div>
          </div>
        </Wrap>
      </section>

      <section id="pricing" aria-labelledby="price-h" className="pb-40 pt-10">
        <Wrap>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div>
              <Eyebrow>Pricing</Eyebrow>
              <H2 id="price-h">Try everything free for a week.</H2>
              <p className="m-0 mt-3.5 text-[19px]" style={{ color: INK.mute }}>Then your plan starts. Stop in two taps before day 8 and you pay nothing.</p>
            </div>
            <div role="group" aria-label="How often to pay" className="inline-flex rounded-full p-1.5" style={{ background: INK.panel, border: '1px solid rgba(255,255,255,.12)' }}>
              {([['Monthly', false], [`Yearly · save ${yearSaving('academy')}`, true]] as const).map(([l, y]) => (
                <button key={l} type="button" aria-pressed={yearly === y} onClick={() => setYearly(y)} className="min-h-[44px] cursor-pointer rounded-full border-0 px-5 text-[15px]"
                  style={{ background: yearly === y ? '#fff' : 'transparent', color: yearly === y ? INK.bg : INK.text, fontWeight: yearly === y ? 700 : 600, fontFamily: BODY }}>{l}</button>
              ))}
            </div>
          </div>
          <div className="mt-[72px] grid items-stretch gap-8 lg:grid-cols-3">
            <PriceCard title="Free" line="A taste of the Academy. No card." price="A$0" items={['Quick races against Club skippers, one venue', 'Keyboard or touch, plus one race on your transmitter', 'Two starter lessons']} cta={<Button to={`${start}?free=1`} kind="ghost">Have a free sail</Button>} />
            <PriceCard featured title="Academy" line="Everything. Every level, every lesson, every venue." price={money(PRICES.academy[iv])} per={per}
              note={yearly ? `Save ${yearSaving('academy')} on monthly` : `Or ${money(PRICES.academy.year)} a year and save ${yearSaving('academy')}`}
              items={['Sail with your own transmitter', 'State, National and World skippers', 'The AlfiePRO Circuit, seasons and titles', 'Your weekly training programme with Alfie', 'Your rating, licences and world boards', 'Race officer duties, replays and highlight videos', 'Every venue, every class, your own yacht design']}
              cta={<Button to={start} big>Start your free week</Button>} />
            <PriceCard title="AlfiePRO member" line="The full Academy, for members of an AlfiePRO club." price={money(PRICES.member[iv])} per={per}
              note={yearly ? 'A third off, for club members' : `Or ${money(PRICES.member.year)} a year`}
              items={['Everything in Academy', 'Your club’s water and your real sail number', 'One sign-in for your club and the Academy']}
              cta={<Button to={start} kind="light">Get the member price</Button>} />
          </div>
          <p className="m-0 mt-8 text-[15px]" style={{ color: 'rgba(235,240,255,.74)' }}>Prices in Australian dollars, GST included. The free week needs a card (Apple Pay and Google Pay work). We email you on day 5, and nothing is charged before day 8. One free week per skipper.</p>
        </Wrap>
      </section>

      <section aria-labelledby="faq-h" className="pb-40 pt-5">
        <Wrap className="flex flex-wrap gap-16">
          <h2 id="faq-h" className="m-0 flex-[1_1_280px]" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 44, lineHeight: 1.05, letterSpacing: '-.02em' }}>Good questions</h2>
          <div className="flex flex-[2_1_560px] flex-col">
            {[
              ['Do I need a transmitter?', 'No. Your own radio feels the most natural and comes with Academy and your free week. The arrow keys or a finger on an iPad work on every plan.'],
              ['Which radios work?', 'Any radio that shows up as a joystick over USB. Most EdgeTX and OpenTX radios do, such as RadioMaster and Jumper. The stick check takes 20 seconds.'],
              ['What happens after the free week?', 'Your plan starts on day 8 and keeps everything you’ve built: your yacht, your rating and your season. We remind you on day 5. If you stop before day 8 you pay nothing and drop to Free.'],
              ['I’m already in an AlfiePRO club. Do I sign up again?', 'Use the email your club has for you. We’ll recognise your membership, link it, and the member price applies automatically.'],
              ['Does it touch my real club results?', 'Never. Academy racing lives in the Academy. Your club’s results, entries and handicaps aren’t changed by anything you do here.'],
              ['Can I stop any time?', 'Yes. Your plan, then Manage or stop. It runs to the end of what you’ve paid for, then you’re back on Free.'],
            ].map(([q, a], k) => (
              <details key={q} open={k === 0} className="py-7" style={{ borderTop: `1px solid ${INK.line}`, borderBottom: k === 5 ? `1px solid ${INK.line}` : undefined }}>
                <summary className="cursor-pointer text-[20px] font-semibold">{q}</summary>
                <p className="m-0 mt-3" style={{ color: INK.mute }}>{a}</p>
              </details>
            ))}
          </div>
        </Wrap>
      </section>

      <section aria-label="Start" className="relative overflow-hidden py-[180px]">
        <img src="/academy/venue.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'rgba(6,11,22,.74)' }} />
        <Wrap className="relative flex flex-col items-center text-center">
          <h2 className="m-0 max-w-[760px]" style={{ fontFamily: DISPLAY, fontWeight: 700, fontSize: 'clamp(38px, 5vw, 60px)', lineHeight: 1, letterSpacing: '-.03em' }}>Your next race starts in five minutes.</h2>
          <div className="mt-9"><Button to={start} big>Start your free week</Button></div>
          <p className="m-0 mt-4 text-[16px]" style={{ color: 'rgba(255,255,255,.86)' }}>A week free. Nothing to install. Stop in two taps.</p>
        </Wrap>
      </section>

      <Footer />

      {playing && (
        <div role="dialog" aria-modal="true" aria-label="Video" onClick={() => setPlaying(null)} className="fixed inset-0 z-50 flex items-center justify-center p-6" style={{ background: 'rgba(3,7,16,.9)' }}>
          <button type="button" aria-label="Close" onClick={() => setPlaying(null)} className="absolute right-5 top-5 grid h-12 w-12 cursor-pointer place-items-center rounded-full border-0 bg-white/10 text-white"><X size={22} aria-hidden="true" /></button>
          <video src={`/academy/clips/${playing}.mp4`} controls autoPlay playsInline onClick={e => e.stopPropagation()} className="max-h-full w-full max-w-[1200px] rounded-2xl" />
        </div>
      )}
    </Page>
  );
}

function PriceCard({ title, line, price, per, note, items, cta, featured = false }: { title: string; line: string; price: string; per?: string; note?: string; items: string[]; cta: ReactNode; featured?: boolean }) {
  return (
    <article className="relative flex flex-col gap-5 rounded-3xl px-10 py-11" style={{ background: featured ? INK.panel2 : INK.panel, border: featured ? `2px solid ${INK.blue}` : '1px solid rgba(255,255,255,.08)' }}>
      {featured && <span className="absolute -top-4 left-10 rounded-full px-3 py-1 text-[13px] font-extrabold tracking-[0.04em]" style={{ background: INK.orange, color: INK.bg }}>MOST SKIPPERS PICK THIS</span>}
      <h3 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 26, fontWeight: 700 }}>{title}</h3>
      <p className="m-0" style={{ color: 'rgba(235,240,255,.8)' }}>{line}</p>
      <p className="m-0" style={{ fontFamily: DISPLAY, fontSize: 52, fontWeight: 700, lineHeight: 1 }}>{price}{per && <span className="text-[18px] font-semibold" style={{ color: 'rgba(235,240,255,.78)' }}> {per}</span>}</p>
      {note && <p className="-mt-2 m-0 text-[15px] font-semibold" style={{ color: INK.peach }}>{note}</p>}
      <ul className="m-0 flex flex-1 list-none flex-col gap-3 p-0">{items.map(i => <Check key={i}>{i}</Check>)}</ul>
      <div className="[&>*]:w-full">{cta}</div>
    </article>
  );
}

function TransmitterIcon() {
  return <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={INK.blue} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="8" width="18" height="12" rx="3" /><path d="M8 8V3M16 8V5" /><circle cx="8" cy="14" r="2" /><circle cx="16" cy="14" r="2" /></svg>;
}
