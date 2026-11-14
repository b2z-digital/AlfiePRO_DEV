// Your details: a first name and an email. We email a 6-digit code (and a link); typing the code
// here signs you in without leaving the page. Nothing about who's in which club is said until the
// email is proved: then, if it's a member's email at an AlfiePRO club, AlfiePRO's own sign-up links
// the club membership and the next page shows the member price.
import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { supabase } from '../../../utils/supabase';
import { Brand, Button, Check, DISPLAY, INK, Page } from './Shell';

const field = { minHeight: 60, padding: '0 18px', borderRadius: 14, border: '2px solid rgba(255,255,255,.18)', background: INK.panel, color: '#fff', font: "500 19px 'Instrument Sans', system-ui, sans-serif" } as const;

export function Steps({ at }: { at: 1 | 2 | 3 }) {
  const names = ['Your details', 'Your free week', 'Sail'];
  return (
    <ol aria-label={`Step ${at} of 3`} className="m-0 flex list-none flex-wrap items-center gap-2.5 p-0 text-[15px] font-semibold">
      {names.map((n, k) => (
        <li key={n} className="flex items-center gap-2.5" style={{ color: k + 1 === at ? '#fff' : k + 1 < at ? 'rgba(235,240,255,.8)' : 'rgba(235,240,255,.7)' }}>
          {k > 0 && <span aria-hidden="true" className="h-0.5 w-7" style={{ background: k + 1 <= at ? INK.green : 'rgba(255,255,255,.18)' }} />}
          <span className="grid h-7 w-7 place-items-center rounded-full text-[14px] font-extrabold" style={k + 1 < at ? { background: INK.green, color: INK.bg } : k + 1 === at ? { background: INK.button } : { border: '2px solid rgba(255,255,255,.3)' }}>{k + 1 < at ? '✓' : k + 1}</span>
          {n}
        </li>
      ))}
    </ol>
  );
}

/** The left half of the join pages: the start line, then what you get, on plain dark. */
export function JoinSide({ base, children }: { base: string; children: ReactNode }) {
  return (
    <aside className="flex flex-[1_1_480px] flex-col" style={{ borderRight: '1px solid rgba(255,255,255,.06)' }}>
      <div className="px-8 pb-6 pt-8 md:px-12"><Brand to={base || '/'} /></div>
      <img src="/academy/start-line.jpg" alt="Twelve IOMs lined up for a start in front of a tree-lined shore" className="block w-full object-cover" style={{ aspectRatio: '1400 / 1148' }} />
      <div className="flex max-w-[600px] flex-col gap-4 px-8 pb-11 pt-2 md:px-12">{children}</div>
    </aside>
  );
}

export default function AcademyStart({ base, signedIn }: { base: string; signedIn: boolean }) {
  const nav = useNavigate();
  const q = new URLSearchParams(useLocation().search);
  const freeSail = q.get('free') === '1';
  const signIn = q.get('signin') === '1';
  const next = freeSail ? `${base}/welcome?free=1` : signIn ? `${base}/sail` : `${base}/free-week`;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (signedIn) nav(next, { replace: true }); }, [signedIn]); // eslint-disable-line react-hooks/exhaustive-deps

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const m = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m)) { setErr('Please check your email address.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: m,
      options: { shouldCreateUser: true, emailRedirectTo: `${window.location.origin}${next}`, data: { first_name: name.trim(), signup_source: 'academy' } },
    });
    setBusy(false);
    if (error) { setErr(error.message.includes('rate') ? 'Please wait a minute before asking for another email.' : 'We couldn’t send the email. Please try again.'); return; }
    setEmail(m); setSent(true);
  };

  const verify = async (e: FormEvent) => {
    e.preventDefault();
    const t = code.replace(/\D/g, '');
    if (t.length < 6) { setErr('The code is 6 numbers.'); return; }
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.verifyOtp({ email, token: t, type: 'email' });
    setBusy(false);
    if (error) { setErr('That code didn’t work. Check the latest email, or tap its link instead.'); return; }
    nav(next, { replace: true });
  };

  return (
    <Page>
      <div className="flex min-h-screen flex-wrap">
        <JoinSide base={base}>
          <h2 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 40, fontWeight: 700, lineHeight: 1.04, letterSpacing: '-.02em' }}>{freeSail ? 'A free sail, no card.' : 'A week of everything, free.'}</h2>
          <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[18px]">
            {freeSail
              ? <><Check>Quick races against Club skippers</Check><Check>Two starter lessons with Alfie</Check><Check>Try your own transmitter for a race</Check></>
              : <><Check>Sail with your own transmitter</Check><Check>Every level, the Circuit and Alfie's coaching</Check><Check>Nothing charged for 7 days. Stop in two taps.</Check></>}
          </ul>
          <p className="m-0 mt-0.5 text-[15px]" style={{ color: INK.mute }}>In an AlfiePRO club? Use the email your club has for you and the member price applies.</p>
        </JoinSide>

        <main className="box-border flex flex-[1_1_520px] flex-col justify-center px-8 py-14 md:px-16">
          <div className="flex w-full max-w-[480px] flex-col gap-6">
            {!signIn && !freeSail && <Steps at={1} />}
            <h1 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 46, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-.025em' }}>{signIn ? 'Welcome back.' : 'Let’s get you sailing.'}</h1>
            {!sent ? (
              <form onSubmit={e => void send(e)} className="flex flex-col gap-5">
                {!signIn && (
                  <label className="flex flex-col gap-2 text-[17px] font-semibold">Your first name
                    <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Sam" autoComplete="given-name" style={field} />
                  </label>
                )}
                <label className="flex flex-col gap-2 text-[17px] font-semibold">Your email
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required style={{ ...field, borderColor: INK.blue }} />
                  <span className="text-[15px] font-normal" style={{ color: 'rgba(235,240,255,.76)' }}>We email you a 6-digit code. No password to remember.</span>
                </label>
                <Button type="submit" big disabled={busy}>{busy ? 'Sending…' : <>Email me my code <ArrowRight size={20} aria-hidden="true" /></>}</Button>
              </form>
            ) : (
              <form onSubmit={e => void verify(e)} className="flex flex-col gap-5">
                <p className="m-0 text-[18px]" style={{ color: INK.mute }}>We've emailed a code to <strong className="text-white">{email}</strong>. Type it here, or tap the link in the email.</p>
                <label className="flex flex-col gap-2 text-[17px] font-semibold">Your 6-digit code
                  <input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={e => setCode(e.target.value)} placeholder="123456" maxLength={8} autoFocus style={{ ...field, borderColor: INK.blue, letterSpacing: '.3em', fontSize: 26 }} />
                </label>
                <Button type="submit" big disabled={busy}>{busy ? 'Checking…' : 'Continue'}</Button>
                <button type="button" onClick={() => { setSent(false); setCode(''); }} className="cursor-pointer border-0 bg-transparent p-0 text-left text-[15px] underline" style={{ color: '#9CCBFF', minHeight: 44 }}>Use a different email, or send it again</button>
              </form>
            )}
            {err && <p role="alert" className="m-0 text-[15px]" style={{ color: '#FCA5A5' }}>{err}</p>}
            {!sent && !signIn && !freeSail && <p className="m-0 text-[15px]" style={{ color: INK.mute }}>Just want a look first? <a href={`${base}/start?free=1`} style={{ color: '#9CCBFF' }}>Have a free sail</a>, no card needed.</p>}
            {!sent && !signIn && <p className="m-0 text-[15px]" style={{ color: INK.mute }}>Already signed up? <a href={`${base}/start?signin=1`} style={{ color: '#9CCBFF' }}>Sign in</a>.</p>}
            <p className="m-0 text-[14px]" style={{ color: 'rgba(235,240,255,.72)' }}>By starting you agree to the <a href="https://app.alfiepro.com.au/terms-of-service" style={{ color: '#9CCBFF' }}>terms</a> and <a href="https://app.alfiepro.com.au/privacy-policy" style={{ color: '#9CCBFF' }}>privacy policy</a>.</p>
          </div>
        </main>
      </div>
    </Page>
  );
}
