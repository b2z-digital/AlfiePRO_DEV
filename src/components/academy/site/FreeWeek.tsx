// Your free week: the price that applies to you (the member price when your AlfiePRO club
// membership earns it, said by name now that your email is proved), the plain timeline, and off to
// Stripe's secure checkout (Apple Pay, Google Pay or card).
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from '../../Logo';
import { type Interval, money } from '../plans';
import { type AcademyPlan, type Quote, fallbackQuote } from '../usePlan';
import { Button, DISPLAY, INK, Page } from './Shell';
import { JoinSide, Steps } from './Start';

export default function AcademyFreeWeek({ base, plan, firstName }: { base: string; plan: AcademyPlan; firstName: string | null }) {
  const nav = useNavigate();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [failed, setFailed] = useState(false);
  const [iv, setIv] = useState<Interval>('year');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => { if (plan.loaded && plan.tier === 'academy') nav(`${base}/welcome`, { replace: true }); }, [plan.loaded, plan.tier]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    let live = true;
    void plan.quote().then(q => { if (!live) return; if (q) setQuote(q); else { setFailed(true); setQuote(fallbackQuote()); } });
    return () => { live = false; };
  }, [plan]);

  const q = quote;
  const day8 = new Date(Date.now() + 7 * 86400000).toLocaleDateString('en-AU', { day: 'numeric', month: 'long' });
  const go = async () => {
    setBusy(true); setErr(null);
    const e = await plan.checkout(iv);
    if (e) { setErr(e); setBusy(false); }
  };

  return (
    <Page>
      <div className="flex min-h-screen flex-wrap">
        <JoinSide base={base}>
          <h2 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 34, fontWeight: 700, lineHeight: 1.05, letterSpacing: '-.02em' }}>{q && !q.trial ? 'Your plan, plainly' : 'Your free week, plainly'}</h2>
          {(!q || q.trial) ? (
            <ol className="m-0 grid list-none grid-cols-3 gap-3.5 p-0">
              {[['Today', 'Everything opens. A$0 charged.', INK.green], ['Day 5', 'We email you a reminder.', INK.blue], ['Day 8', 'Your plan starts, unless you stop it.', INK.orange]].map(([d, l, c]) => (
                <li key={d} className="flex flex-col gap-1"><span className="h-1.5 rounded" style={{ background: c }} /><strong className="mt-2 text-[18px]">{d}</strong><span className="text-[15px]" style={{ color: INK.mute }}>{l}</span></li>
              ))}
            </ol>
          ) : <p className="m-0 text-[17px]" style={{ color: INK.mute }}>You've had your free week on this account, card or device, so your plan starts today.</p>}
          <p className="m-0 mt-1 text-[15px]" style={{ color: INK.mute }}>Stopping takes two taps: Your plan, then Manage or stop. One free week per skipper.</p>
        </JoinSide>

        <main className="box-border flex flex-[1_1_520px] flex-col justify-center px-8 py-14 md:px-16">
          <div className="flex w-full max-w-[480px] flex-col gap-6">
            <Steps at={2} />
            <h1 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 42, fontWeight: 700, lineHeight: 1.02, letterSpacing: '-.025em' }}>
              {q && !q.trial ? `Join the Academy${firstName ? `, ${firstName}` : ''}.` : `Nothing to pay today${firstName ? `, ${firstName}` : ''}.`}
            </h1>
            {q?.club && (
              <div role="status" className="flex items-start gap-3.5 rounded-2xl px-5 py-4" style={{ background: '#0B1A33', border: '1px solid rgba(77,163,255,.45)' }}>
                <Logo className="!h-8 !w-6 shrink-0" />
                <span><strong className="block">You're a member of {q.club.name}.</strong><span className="text-[15px]" style={{ color: INK.mute }}>Member price applies, and your Academy races count for your club.</span></span>
              </div>
            )}
            {!q ? <p className="m-0" style={{ color: INK.mute }}>Getting your price…</p> : (
              <fieldset className="m-0 flex flex-col gap-2.5 border-0 p-0">
                <legend className="mb-2.5 p-0 text-[17px] font-semibold">{q.trial ? 'After your free week' : 'Your price'}</legend>
                {(['year', 'month'] as const).map(x => (
                  <label key={x} className="flex min-h-[64px] cursor-pointer items-center gap-3.5 rounded-2xl px-[18px]" style={{ border: `2px solid ${iv === x ? INK.blue : 'rgba(255,255,255,.14)'}`, background: iv === x ? INK.panel2 : 'transparent' }}>
                    <input type="radio" name="iv" checked={iv === x} onChange={() => setIv(x)} style={{ width: 22, height: 22, accentColor: INK.blue }} />
                    <span className="flex-1"><strong className="text-[18px]">{x === 'year' ? 'Yearly' : 'Monthly'}</strong>
                      {x === 'year' && <span className="ml-2 rounded-full px-2 py-0.5 text-[12px] font-extrabold" style={{ background: INK.orange, color: INK.bg }}>SAVE {money(Math.floor((q.prices.month * 12 - q.prices.year) / 100) * 100)}</span>}</span>
                    <strong className="text-[18px]">{money(q.prices[x])}</strong>
                  </label>
                ))}
              </fieldset>
            )}
            <Button onClick={() => void go()} big disabled={busy || !q}>{busy ? 'Opening secure payment…' : q && !q.trial ? `Join for ${money(q.prices[iv])} a ${iv}` : 'Continue to secure payment'}</Button>
            {q && <p className="-mt-2 m-0 text-center text-[15px]" style={{ color: INK.mute }}>{q.trial ? `A$0 today. ${money(q.prices[iv])} on ${day8} unless you stop before then.` : 'Apple Pay, Google Pay or card.'}</p>}
            {err && <p role="alert" className="m-0 text-[15px]" style={{ color: '#FCA5A5' }}>{err}</p>}
            {failed && <p className="m-0 text-[14px]" style={{ color: INK.faint }}>We couldn't check your price just now. If you're in an AlfiePRO club, the member price is applied at payment.</p>}
            <p className="m-0 text-[14px]" style={{ color: 'rgba(235,240,255,.72)' }}>Payments are handled securely by Stripe. <a href={`${base}/welcome?free=1`} style={{ color: '#9CCBFF' }}>Skip, I'll just have a free sail</a></p>
          </div>
        </main>
      </div>
    </Page>
  );
}
