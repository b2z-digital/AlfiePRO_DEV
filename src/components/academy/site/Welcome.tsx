// You're in: one big button into the Academy, how to sail on an iPad, and (back from Stripe) the
// free week, plainly. Stripe tells us about the plan a moment after you land, so we look again a few
// times before saying anything about it.
import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import type { AcademyPlan } from '../usePlan';
import { Brand, Button, Check, DISPLAY, INK, Page, Wrap } from './Shell';

export default function AcademyWelcome({ base, plan, firstName, sailTo }: { base: string; plan: AcademyPlan; firstName: string | null; sailTo: string }) {
  const q = new URLSearchParams(useLocation().search);
  const fromStripe = !!q.get('session_id');
  const free = q.get('free') === '1';
  const [waited, setWaited] = useState(0);

  // Back from Stripe: the webhook lands a moment later. Look every two seconds, for up to 20.
  useEffect(() => {
    if (!fromStripe || plan.tier === 'academy' || waited >= 10) return;
    const t = window.setTimeout(() => { plan.refresh(); setWaited(w => w + 1); }, 2000);
    return () => window.clearTimeout(t);
  }, [fromStripe, plan, waited]);

  const academy = plan.tier === 'academy';
  const days = plan.daysLeft;
  const host = window.location.host;

  return (
    <Page>
      <div className="relative min-h-screen overflow-hidden">
        <img src="/academy/gums.jpg" alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-cover" />
        <div aria-hidden="true" className="absolute inset-0" style={{ background: 'rgba(6,11,22,.84)' }} />
        <Wrap className="relative flex flex-col gap-10 pb-16 pt-8">
          <Brand to={base || '/'} />
          <div className="flex max-w-[760px] flex-col gap-4">
            <h1 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 'clamp(42px, 6vw, 64px)', fontWeight: 700, lineHeight: 1, letterSpacing: '-.03em' }}>You're in{firstName ? `, ${firstName}` : ''}.</h1>
            <p className="m-0 text-[21px]" style={{ color: 'rgba(255,255,255,.88)' }}>
              {academy ? (days != null ? `Your free week has started: ${days} day${days === 1 ? '' : 's'} of everything.` : 'Academy is yours. Everything is open.')
                : fromStripe && waited < 10 ? 'Just confirming your free week with the bank…'
                : free ? 'Free is ready: Club skippers, two starter lessons, and a race on your own transmitter.'
                : 'You’re set up. Where would you like to sail?'}
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="here-h" className="flex flex-col gap-4 rounded-[26px] p-9" style={{ background: 'rgba(14,30,61,.94)', border: `2px solid ${INK.blue}` }}>
              <span className="self-start rounded-full px-3 py-1 text-[13px] font-extrabold tracking-[0.04em]" style={{ background: INK.orange, color: INK.bg }}>BEST WITH A TRANSMITTER</span>
              <h2 id="here-h" className="m-0" style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>On this computer</h2>
              <p className="m-0" style={{ color: INK.mute }}>It opens right here in your browser. Plug your transmitter in first if it's handy.</p>
              <div className="mt-auto [&>*]:w-full"><Button to={sailTo} big>Open the Sailing Academy <ArrowRight size={22} aria-hidden="true" /></Button></div>
            </section>
            <section aria-labelledby="ipad-h" className="flex flex-col gap-4 rounded-[26px] p-9" style={{ background: 'rgba(7,13,27,.92)', border: '1px solid rgba(255,255,255,.12)' }}>
              <h2 id="ipad-h" className="m-0" style={{ fontFamily: DISPLAY, fontSize: 32, fontWeight: 700 }}>On an iPad</h2>
              <ol className="m-0 flex flex-col gap-2 pl-6" style={{ color: 'rgba(235,240,255,.88)' }}>
                <li>Open Safari and go to <strong className="text-white">{host}</strong></li>
                <li>Press <strong className="text-white">Sign in</strong> and type this email</li>
                <li>Type the code we email you</li>
              </ol>
              <p className="m-0 text-[15px]" style={{ color: INK.mute }}>We've also emailed you the link, so you can open it on any device.</p>
            </section>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            <section aria-labelledby="need-h" className="rounded-[22px] px-8 py-7" style={{ background: 'rgba(7,13,27,.9)', border: `1px solid ${INK.line}` }}>
              <h2 id="need-h" className="m-0 mb-3.5 text-[19px] font-bold">What you'll need</h2>
              <ul className="m-0 flex list-none flex-col gap-2.5 p-0" style={{ color: 'rgba(235,240,255,.86)' }}>
                <Check>A computer or iPad with Chrome, Edge or Safari</Check>
                <Check>Your transmitter and its USB cable (if you have one)</Check>
                <Check>Sound on, so you can hear Alfie and the sails</Check>
              </ul>
            </section>
            {academy && days != null && (
              <section aria-labelledby="days-h" className="rounded-[22px] px-8 py-7" style={{ background: 'rgba(7,13,27,.9)', border: `1px solid ${INK.line}` }}>
                <h2 id="days-h" className="m-0 mb-3.5 text-[19px] font-bold">Your free week, plainly</h2>
                <ol className="m-0 grid list-none grid-cols-3 gap-3 p-0">
                  {[['Today', 'Everything unlocked', INK.blue], ['Day 5', 'We email a reminder', INK.blue], ['Day 8', 'Your plan starts, unless you stop it', 'rgba(255,255,255,.25)']].map(([d, l, c]) => (
                    <li key={d} className="flex flex-col gap-1"><span className="h-1.5 rounded" style={{ background: c }} /><strong className="mt-1.5">{d}</strong><span className="text-[15px]" style={{ color: INK.mute }}>{l}</span></li>
                  ))}
                </ol>
              </section>
            )}
          </div>
        </Wrap>
      </div>
    </Page>
  );
}
