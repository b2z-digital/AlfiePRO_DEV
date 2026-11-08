// Email studio tracking. Public (no sign-in): every link in a sent email comes through here.
//   ?o=<recipient>                         open pixel
//   ?c=<recipient>&u=<url>&b=<block>&s=<sig>  click, then on to the link
//   ?x=<recipient>&s=<sig>                 unsubscribe (POST = one-click from the mail app, GET = preferences page)
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GIF = Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'), ch => ch.charCodeAt(0));

let key: CryptoKey | null = null;
async function sign(s: string) {
  if (!key) key = await crypto.subtle.importKey('raw', new TextEncoder().encode(`email-studio:${SERVICE_KEY}`), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(s));
  return Array.from(new Uint8Array(sig).slice(0, 12)).map(b => b.toString(16).padStart(2, '0')).join('');
}
const same = (a: string, b: string) => a.length === b.length && [...a].reduce((d, ch, i) => d | (ch.charCodeAt(0) ^ b.charCodeAt(i)), 0) === 0;

let appUrlCache: string | null = null;
async function appUrl() {
  if (appUrlCache) return appUrlCache;
  const { data } = await db.rpc('whats_on_app_url');
  appUrlCache = typeof data === 'string' && /^https?:\/\//.test(data) ? data.replace(/\/$/, '') : 'https://app.alfiepro.com.au';
  return appUrlCache;
}

const isApp = (u: string) => {
  try {
    const h = new URL(u).hostname.toLowerCase();
    return h === 'alfiepro.com.au' || h.endsWith('.alfiepro.com.au');
  } catch {
    return false;
  }
};

const text = (msg: string, status = 200) => new Response(msg, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

Deno.serve(async req => {
  const q = new URL(req.url).searchParams;
  const now = new Date().toISOString();
  const ua = (req.headers.get('user-agent') || '').slice(0, 300);

  // Open
  const o = q.get('o');
  if (o) {
    if (UUID.test(o)) {
      try {
        const { data: r } = await db.from('marketing_recipients').select('id, campaign_id, opened_at, open_count').eq('id', o).maybeSingle();
        if (r) {
          await db.from('marketing_recipients').update({ opened_at: r.opened_at || now, open_count: (r.open_count || 0) + 1 }).eq('id', o);
          if ((r.open_count || 0) < 3) await db.from('marketing_events').insert({ recipient_id: o, campaign_id: r.campaign_id, event_type: 'open', user_agent: ua });
        }
      } catch (e) {
        console.error('open', e);
      }
    }
    return new Response(GIF, { headers: { 'Content-Type': 'image/gif', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' } });
  }

  // Click
  const c = q.get('c');
  if (c) {
    const url = q.get('u') || '';
    const block = (q.get('b') || '').slice(0, 40);
    if (!UUID.test(c) || !/^https?:\/\//i.test(url) || !same(q.get('s') || '', await sign(`${c}|${url}`))) {
      return text('This link is not recognised.', 400);
    }
    try {
      const { data: r } = await db.from('marketing_recipients').select('id, campaign_id, opened_at, first_clicked_at, click_count, app_clicked').eq('id', c).maybeSingle();
      if (r) {
        const app = isApp(url);
        await db.from('marketing_recipients').update({
          opened_at: r.opened_at || now, first_clicked_at: r.first_clicked_at || now,
          click_count: (r.click_count || 0) + 1, app_clicked: r.app_clicked || app,
        }).eq('id', c);
        await db.from('marketing_events').insert({ recipient_id: c, campaign_id: r.campaign_id, event_type: 'click', event_data: { url, block, app }, user_agent: ua });
      }
    } catch (e) {
      console.error('click', e);
    }
    return new Response(null, { status: 302, headers: { Location: url, 'Cache-Control': 'no-store' } });
  }

  // Unsubscribe
  const x = q.get('x');
  if (x) {
    if (!UUID.test(x) || !same(q.get('s') || '', await sign(`${x}|unsub`))) return text('This link is not recognised.', 400);
    if (req.method === 'POST') {
      try {
        const { data: r } = await db.from('marketing_recipients').select('id, campaign_id, club_id, email, member_id, unsubscribed_at').eq('id', x).maybeSingle();
        if (r?.club_id) {
          const email = String(r.email).trim().toLowerCase();
          const { data: cur } = await db.from('email_studio_prefs').select('topics_off').eq('club_id', r.club_id).eq('email', email).maybeSingle();
          await db.from('email_studio_prefs').upsert({ club_id: r.club_id, email, member_id: r.member_id, unsubscribed: true, topics_off: cur?.topics_off || [], updated_at: now });
          if (!r.unsubscribed_at) {
            await db.from('marketing_recipients').update({ unsubscribed_at: now }).eq('id', x);
            await db.from('marketing_events').insert({ recipient_id: x, campaign_id: r.campaign_id, event_type: 'unsubscribe', event_data: { via: 'one-click' } });
          }
        }
      } catch (e) {
        console.error('unsubscribe', e);
      }
      return text('You have been unsubscribed.');
    }
    return new Response(null, { status: 302, headers: { Location: `${await appUrl()}/email/preferences?t=${x}&unsub=1`, 'Cache-Control': 'no-store' } });
  }

  return text('Not found', 404);
});
