// Your plan: what you have, what it costs and when it renews, the club that earns the member price,
// and Stripe's page to change card, see receipts, or stop.
import { useEffect, useState } from 'react';
import { Logo } from '../../Logo';
import { PRICES, money } from '../plans';
import type { AcademyPlan } from '../usePlan';
import { Brand, Button, DISPLAY, INK, Page, Wrap } from './Shell';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' }) : '');

export default function AcademyPlanPage({ base, plan, clubName }: { base: string; plan: AcademyPlan; clubName: string | null }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { document.title = 'Your plan · AlfiePRO Sailing Academy'; }, []);
  const r = plan.row;
  const academy = plan.tier === 'academy';
  const price = r?.plan && r.billing_interval ? money(PRICES[r.plan][r.billing_interval]) : null;
  const manage = async () => { setBusy(true); setErr(null); const e = await plan.manage(); if (e) { setErr(e); setBusy(false); } };

  return (
    <Page>
      <Wrap className="flex max-w-[1000px] flex-col gap-6 pb-16 pt-8">
        <Brand to={base || '/'} />
        <h1 className="m-0 mt-6" style={{ fontFamily: DISPLAY, fontSize: 44, fontWeight: 700, letterSpacing: '-.025em', lineHeight: 1 }}>Your plan</h1>
        {!plan.loaded ? <p style={{ color: INK.mute }}>Loading…</p> : !r || !academy ? (
          <section className="flex flex-col gap-4 rounded-[22px] px-8 py-7" style={{ background: INK.panel, border: `1px solid ${INK.line}` }}>
            <h2 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700 }}>Free</h2>
            <p className="m-0" style={{ color: INK.mute }}>Quick races against Club skippers, two starter lessons, and one race on your own transmitter. Academy opens everything.</p>
            {r?.status === 'canceled' && <p className="m-0 text-[15px]" style={{ color: INK.faint }}>Your Academy plan has ended. Your results, yacht and season are kept for when you come back.</p>}
            <div className="flex flex-wrap gap-3">
              <Button to={`${base}/free-week`}>{r?.status === 'canceled' ? 'Rejoin the Academy' : 'Start your free week'}</Button>
              {r && r.status !== 'none' && <Button kind="ghost" onClick={() => void manage()} disabled={busy}>Receipts and card</Button>}
            </div>
          </section>
        ) : (
          <>
            <section className="flex flex-wrap justify-between gap-6 rounded-[22px] px-8 py-7" style={{ background: 'rgba(10,19,36,.94)', border: `1px solid ${INK.line}` }}>
              <div className="flex flex-col gap-1.5">
                <h2 className="m-0" style={{ fontFamily: DISPLAY, fontSize: 28, fontWeight: 700 }}>Academy{r.plan === 'member' ? ' · member price' : ''}</h2>
                {price && <p className="m-0 text-[20px]"><strong>{price} a {r.billing_interval}</strong></p>}
                <p className="m-0" style={{ color: INK.mute }}>
                  {r.status === 'trialing' && r.trial_end ? `Free until ${when(r.trial_end)}${r.cancel_at_period_end ? ', then it stops.' : `, then ${price ?? 'your plan'} a ${r.billing_interval ?? 'year'}.`}`
                    : r.cancel_at_period_end ? `Stops on ${when(r.current_period_end)}. You keep everything until then.`
                    : r.status === 'past_due' ? 'Your last payment didn’t go through. Please check your card.'
                    : `Renews on ${when(r.current_period_end)}.`}
                </p>
              </div>
              <div className="flex min-w-[240px] flex-col gap-2.5">
                <Button onClick={() => void manage()} disabled={busy}>{busy ? 'Opening…' : 'Manage or stop my plan'}</Button>
                <p className="m-0 text-center text-[14px]" style={{ color: INK.faint }}>Change card, see receipts, or stop</p>
              </div>
            </section>
            {r.plan === 'member' && (
              <section className="flex items-start gap-4 rounded-[20px] px-7 py-6" style={{ background: '#0B1A33', border: '1px solid rgba(77,163,255,.35)' }}>
                <Logo className="!h-8 !w-6 shrink-0" />
                <div>
                  <h2 className="m-0 mb-1 text-[18px] font-bold">Member price{clubName ? `, through ${clubName}` : ''}</h2>
                  <p className="m-0" style={{ color: INK.mute }}>You keep this price while your club membership is current. Your Academy races score for your club on the world boards.</p>
                </div>
              </section>
            )}
          </>
        )}
        {err && <p role="alert" className="m-0" style={{ color: '#FCA5A5' }}>{err}</p>}
        <div><Button kind="ghost" to={`${base}/sail`}>Back to the Academy</Button></div>
      </Wrap>
    </Page>
  );
}
