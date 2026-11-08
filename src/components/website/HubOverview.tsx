import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, AlertTriangle, ArrowRight, ArrowUp, ArrowDown, CheckCircle2, FileText, History, Image as ImageIcon, Lock, Monitor, Palette, Plus, Search, Smartphone, Tablet, Trophy, Globe } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useHub, timeAgo } from './hubData';
import { HUB_ROUTES, draftsToPublish } from './WebsiteHub';
import { SitePreviewFrame, PreviewDevice } from './SitePreviewFrame';
import { PageThumb } from './PageThumb';
import { areaPath, dailySeries, EMPTY_STATS, fetchSiteStats, pageName, pctChange, periods, SiteStats } from './stats';
import { countMenuItems, hasTheme, resolveMenu } from '../../utils/publicSite';

interface Check { id: string; done: boolean; title: string; sub: string; icon: React.ReactNode; action?: { label: string; to: string } }

const WORDS = ['No things', 'One thing', 'Two things', 'Three things', 'Four things', 'Five things', 'Six things'];

const ACTION_WORD: Record<string, string> = { created: 'created', updated: 'edited', published: 'published', deleted: 'deleted', unpublished: 'unpublished', saved: 'saved' };

export const HubOverview: React.FC = () => {
  const navigate = useNavigate();
  const { currentClub } = useAuth();
  const { club, pages, addresses, activity, slideCount, previewPath, liveHost } = useHub();
  const [device, setDevice] = useState<PreviewDevice>('desktop');
  const [stats, setStats] = useState<{ now: SiteStats; prev: SiteStats } | null>(null);
  const [events, setEvents] = useState<any[] | null>(null);
  const clubId = club!.id;

  useEffect(() => {
    const { start, end, prevStart } = periods(30);
    Promise.all([fetchSiteStats(clubId, start, end), fetchSiteStats(clubId, prevStart, start)])
      .then(([now, prev]) => setStats({ now, prev }))
      .catch(() => setStats({ now: EMPTY_STATS, prev: EMPTY_STATS }));
  }, [clubId]);

  useEffect(() => {
    (async () => {
      const { data: sites } = await supabase.from('event_websites')
        .select('id, event_id, website_name, slug, custom_domain, enabled, hero_image_url, logo_url')
        .order('created_at', { ascending: false }).limit(4);
      if (!sites?.length) { setEvents([]); return; }
      const { data: evs } = await supabase.from('public_events').select('id, event_name, date').in('id', sites.map(s => s.event_id));
      setEvents(sites.map(s => ({ ...s, event: evs?.find(e => e.id === s.event_id) || null })));
    })().catch(() => setEvents([]));
  }, [clubId, currentClub?.clubId]);

  const checks = useMemo<Check[]>(() => {
    const c = club!;
    const out: Check[] = [];
    const problem = addresses.find(a => a.state === 'problem');
    const pending = addresses.find(a => a.state === 'pending');
    if (problem) out.push({ id: 'addr', done: false, icon: <AlertTriangle size={17} />, title: `${problem.host} isn’t working`, sub: problem.kind === 'custom' ? 'Its DNS settings need checking' : 'The Alfie address needs checking', action: { label: 'Fix', to: HUB_ROUTES.domain } });
    else if (pending) out.push({ id: 'addr', done: false, icon: <Globe size={17} />, title: `${pending.host} is still being set up`, sub: 'This can take up to a day after DNS changes', action: { label: 'Check', to: HUB_ROUTES.domain } });
    else if (!liveHost) out.push({ id: 'addr', done: false, icon: <Globe size={17} />, title: 'Your site has no web address yet', sub: 'Pick a free Alfie address or connect your own', action: { label: 'Set up', to: HUB_ROUTES.domain } });
    else out.push({ id: 'addr', done: true, icon: <Lock size={17} />, title: 'Web address working and secure', sub: liveHost });

    const shareIsLogo = !c.default_share_image || c.default_share_image === c.logo;
    out.push(shareIsLogo
      ? { id: 'share', done: false, icon: <ImageIcon size={17} />, title: 'Shared links only show your logo', sub: 'Add a racing photo so links look great on Facebook', action: { label: 'Add photo', to: HUB_ROUTES.domain } }
      : { id: 'share', done: true, icon: <ImageIcon size={17} />, title: 'Share photo set', sub: '' });

    out.push(slideCount > 0
      ? { id: 'slides', done: true, icon: <ImageIcon size={17} />, title: `${slideCount} homepage slide${slideCount === 1 ? '' : 's'}`, sub: '' }
      : { id: 'slides', done: false, icon: <ImageIcon size={17} />, title: 'Add a homepage slide', sub: 'A big photo makes the first impression', action: { label: 'Add', to: HUB_ROUTES.homepage } });

    out.push(c.seo_description && c.seo_description.trim().length >= 50
      ? { id: 'seo', done: true, icon: <Search size={17} />, title: 'Search title and text', sub: '' }
      : { id: 'seo', done: false, icon: <Search size={17} />, title: 'Tell Google what your club does', sub: 'A good description helps people find you', action: { label: 'Write it', to: HUB_ROUTES.domain } });

    out.push(hasTheme(c.website_theme)
      ? { id: 'look', done: true, icon: <Palette size={17} />, title: 'Club colours and fonts', sub: '' }
      : { id: 'look', done: false, icon: <Palette size={17} />, title: 'Make the site look like your club', sub: 'Pick your colours and fonts in Design', action: { label: 'Design', to: HUB_ROUTES.design } });

    out.push({ id: 'menu', done: true, icon: <FileText size={17} />, title: `Menu, ${countMenuItems(resolveMenu(c.website_menu))} items`, sub: '' });
    out.push({ id: 'visits', done: true, icon: <Activity size={17} />, title: 'Visitor counting', sub: '' });
    return out;
  }, [club, addresses, slideCount, liveHost]);

  const todo = checks.filter(c => !c.done);
  const done = checks.filter(c => c.done);
  const ratio = done.length / checks.length;
  const R = 30, C = 2 * Math.PI * R;

  const drafts = draftsToPublish(pages as any);
  const recentPages = [...pages].sort((a, b) => new Date(b.updated_at || 0).getTime() - new Date(a.updated_at || 0).getTime()).slice(0, 4);

  // Visitors
  const { start } = periods(30);
  const series = stats ? dailySeries(stats.now, start, 30) : [];
  const chart = series.length ? areaPath(series.map(s => s.value), 360, 92) : null;
  const trend = stats ? pctChange(stats.now.visitors, stats.prev.visitors) : null;
  const titles = Object.fromEntries(pages.map(p => [p.page_slug, p.page_title]));
  const topPages = stats ? stats.now.pages.slice(0, 3) : [];
  const topMax = topPages[0]?.views || 1;

  return (
    <>
      <div className="wh-ov-top">
        <section className="a-card wh-bf" aria-label="Live preview">
          <div className="wh-bf-bar">
            <span className="wh-bf-dots"><i style={{ background: '#FF6B6B' }} /><i style={{ background: '#FFB340' }} /><i style={{ background: '#30D158' }} /></span>
            <span className="wh-bf-url"><Lock size={12} />{liveHost || `Preview of ${club!.name}`}</span>
            <div className="a-seg" role="group" aria-label="Preview size">
              <button className={`a-seg-i ${device === 'desktop' ? 'a-seg-on' : ''}`} onClick={() => setDevice('desktop')} aria-label="Desktop"><Monitor size={15} /></button>
              <button className={`a-seg-i ${device === 'tablet' ? 'a-seg-on' : ''}`} onClick={() => setDevice('tablet')} aria-label="Tablet"><Tablet size={15} /></button>
              <button className={`a-seg-i ${device === 'phone' ? 'a-seg-on' : ''}`} onClick={() => setDevice('phone')} aria-label="Phone"><Smartphone size={15} /></button>
            </div>
          </div>
          <SitePreviewFrame path={previewPath} device={device} height={376} />
          <div className="wh-pfoot">
            {drafts.length > 0 ? (
              <>
                <span className="chg"><i />{drafts.length} page{drafts.length === 1 ? '' : 's'} not on your site yet</span>
                <span className="wh-dim">{drafts.slice(0, 3).map((d: any) => d.page_title).join(', ')}</span>
                <button className="a-btn" style={{ height: 34, marginLeft: 'auto' }} onClick={() => navigate(HUB_ROUTES.pages)}>Review pages</button>
              </>
            ) : (
              <>
                <span className="chg"><i className="ok" />Everything is live</span>
                <span className="wh-dim">Changes you save show on your site straight away</span>
              </>
            )}
          </div>
        </section>

        <section className="a-card wh-nx" aria-label="Site health">
          <div className="wh-nx-h">
            <span className="wh-ring">
              <svg width="74" height="74" viewBox="0 0 74 74" aria-hidden="true">
                <defs><linearGradient id="w-ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#2E7BFF" /><stop offset=".45" stopColor="#8A4DFF" /><stop offset=".8" stopColor="#FF3E9A" /><stop offset="1" stopColor="#FF8A2B" /></linearGradient></defs>
                <circle cx="37" cy="37" r={R} fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth="7" />
                <circle cx="37" cy="37" r={R} fill="none" stroke="url(#w-ring-g)" strokeWidth="7" strokeLinecap="round" strokeDasharray={`${(C * ratio).toFixed(1)} ${C.toFixed(1)}`} transform="rotate(-90 37 37)" />
              </svg>
              <b>{done.length}<small>/{checks.length}</small></b>
            </span>
            <div>
              <p className="a-cap">Site health</p>
              <h2 className="a-display">{todo.length === 0 ? 'Your site is in great shape' : `${WORDS[todo.length] || `${todo.length} things`} need${todo.length === 1 ? 's' : ''} you`}</h2>
              <div className="wh-dim text-[12.5px]">{todo.length === 0 ? 'Everything is set up and working.' : 'Everything else is set up and working.'}</div>
            </div>
          </div>
          {todo.map(c => (
            <div key={c.id} className="wh-nx-i">
              <span className={`a-tile ${c.id === 'look' ? 'wh-t-v' : 'wh-t-warn'}`}>{c.icon}</span>
              <div className="min-w-0"><div className="tt">{c.title}</div>{c.sub && <div className="ss">{c.sub}</div>}</div>
              {c.action && <button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => navigate(c.action!.to)}>{c.action.label}</button>}
            </div>
          ))}
          <div className="wh-nx-done">
            {done.map(c => <span key={c.id}><CheckCircle2 size={15} />{c.title}</span>)}
          </div>
        </section>
      </div>

      <div className="wh-ov-mid">
        <section className="a-card" aria-label="Visitors">
          <div className="wh-ch"><span className="a-tile a-tile-sm"><Activity size={17} /></span><div><h3 className="a-display">Visitors</h3><div className="sub">Last 30 days</div></div></div>
          {!stats ? (
            <div className="wh-empty">Loading…</div>
          ) : stats.now.views === 0 ? (
            <div className="wh-empty" style={{ textAlign: 'left', padding: '16px 20px' }}>
              <div className="wh-ink" style={{ fontWeight: 600, marginBottom: 4 }}>No visits counted yet</div>
              Visits to your public pages are counted from now on. Check back in a few days.
            </div>
          ) : (
            <>
              <div className="wh-big">
                <b className="wh-num">{stats.now.visitors.toLocaleString()}</b>
                {trend !== null && <span className={`wh-trend${trend < 0 ? ' down' : ''}`}>{trend < 0 ? <ArrowDown size={13} /> : <ArrowUp size={13} />}{Math.abs(trend)}%</span>}
                <span className="wh-dim text-[12.5px]">{stats.now.views.toLocaleString()} page views</span>
              </div>
              {chart && (
                <div style={{ padding: '10px 16px 4px' }}>
                  <svg width="100%" height="92" viewBox="0 0 360 92" preserveAspectRatio="none" role="img" aria-label="Visitors each day for the last 30 days">
                    <defs><linearGradient id="w-ov-g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#3987e5" stopOpacity=".32" /><stop offset="1" stopColor="#3987e5" stopOpacity="0" /></linearGradient></defs>
                    <path d="M0 91.5 H360" stroke="currentColor" strokeOpacity=".1" />
                    <path d={chart.fill} fill="url(#w-ov-g)" />
                    <path d={chart.line} fill="none" stroke="#3987e5" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
                  </svg>
                </div>
              )}
              <div className="wh-dim" style={{ display: 'flex', justifyContent: 'space-between', padding: '0 20px 10px', fontSize: 11 }}>
                <span>{series[0]?.date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span><span>Today</span>
              </div>
              <div style={{ padding: '2px 20px 12px' }}>
                {topPages.map(p => (
                  <div key={p.path} className="wh-tp">
                    <span>{pageName(p.path, titles)}</span>
                    <span className="bar" style={{ width: `${Math.max(3, (p.views / topMax) * 100)}%` }} />
                    <span className="v">{Math.round((p.views / Math.max(1, stats.now.views)) * 100)}%</span>
                  </div>
                ))}
              </div>
            </>
          )}
          <div className="wh-cfoot"><button className="wh-link" onClick={() => navigate(HUB_ROUTES.analytics)}>Open analytics<ArrowRight size={14} /></button></div>
        </section>

        <section className="a-card" aria-label="Pages">
          <div className="wh-ch">
            <span className="a-tile a-tile-sm"><FileText size={17} /></span>
            <div><h3 className="a-display">Pages</h3><div className="sub">{pages.length} page{pages.length === 1 ? '' : 's'}{pages.filter(p => !p.is_published).length ? ` · ${pages.filter(p => !p.is_published).length} draft${pages.filter(p => !p.is_published).length === 1 ? '' : 's'}` : ''}</div></div>
            <div className="r"><button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => navigate(`${HUB_ROUTES.pages}?new=1`)}><Plus size={15} />New page</button></div>
          </div>
          <div style={{ paddingTop: 10 }}>
            <button className="wh-prow" onClick={() => navigate(HUB_ROUTES.homepage)}>
              <span className="wh-pth" style={{ width: 58, height: 40 }}>
                {club!.cover_image_url ? <img src={club!.cover_image_url} alt="" style={{ width: '100%', height: '55%', objectFit: 'cover', borderRadius: 3 }} /> : <span><i style={{ height: 14, background: '#1E293B' }} /></span>}
                <span style={{ gridTemplateColumns: '1fr 1fr 1fr' }}><i style={{ height: 8 }} /><i style={{ height: 8 }} /><i style={{ height: 8 }} /></span>
              </span>
              <div className="min-w-0"><div className="nm">Home<span className="wh-pill wh-auto" style={{ height: 20, fontSize: 11 }}>Homepage</span></div><div className="ed">Slides, quick links and sections</div></div>
              <span className="r wh-pill wh-live">Live</span>
            </button>
            {recentPages.map(p => (
              <button key={p.id} className="wh-prow" onClick={() => navigate(`/website/pages/edit/${p.page_slug}`)}>
                <PageThumb rows={p.rows as any} />
                <div className="min-w-0"><div className="nm" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.page_title}</div><div className="ed">Edited {timeAgo(p.updated_at || p.created_at || new Date().toISOString())}</div></div>
                <span className={`r wh-pill ${p.is_published ? 'wh-live' : 'wh-draft'}`}>{p.is_published ? 'Live' : 'Draft'}</span>
              </button>
            ))}
          </div>
          <div className="wh-cfoot"><button className="wh-link" onClick={() => navigate(HUB_ROUTES.pages)}>All pages and the menu<ArrowRight size={14} /></button></div>
        </section>

        <section className="a-card" aria-label="Recent changes">
          <div className="wh-ch"><span className="a-tile a-tile-sm"><History size={17} /></span><div><h3 className="a-display">Recent changes</h3><div className="sub">Who changed what</div></div></div>
          <div style={{ paddingTop: 10 }}>
            {activity.length === 0 ? (
              <p className="wh-empty">No website changes yet.</p>
            ) : activity.slice(0, 5).map((a, i, arr) => {
              const ini = a.who.split(' ').map(x => x[0]).join('').slice(0, 2).toUpperCase();
              return (
                <div key={a.id} className="wh-tl">
                  {i < arr.length - 1 && <span className="wh-tl-line" />}
                  <span className="wh-av">{a.avatar ? <img src={a.avatar} alt="" /> : ini}</span>
                  <div className="min-w-0">
                    <div className="tx"><b>{a.who}</b> {ACTION_WORD[a.action] || a.action} {a.entity_type ? <span className="wh-mute">{a.entity_type}</span> : null} {a.entity_name && <b>“{a.entity_name}”</b>}</div>
                    <div className="tm">{timeAgo(a.created_at)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>

      <section className="a-card" aria-label="Event websites">
        <div className="wh-ch">
          <span className="a-tile a-tile-sm"><Trophy size={17} /></span>
          <div><h3 className="a-display">Event websites</h3><div className="sub">Give a regatta or championship its own site</div></div>
          <div className="r"><button className="a-btn" style={{ height: 32, padding: '0 12px', fontSize: 12.5 }} onClick={() => navigate(HUB_ROUTES.events)}><Plus size={15} />New event website</button></div>
        </div>
        <div className="wh-evs">
          {events === null ? <div className="wh-empty">Loading…</div> : events.length === 0 ? (
            <div className="wh-ev wh-ev-new">
              <span className="a-tile a-tile-lg wh-t-v"><Trophy size={19} /></span>
              <div className="min-w-0 flex-1"><div className="tt">No event websites yet</div><div className="wh-dim text-[12.5px] mt-1">Create one with the entry form, notice of race and results built in.</div></div>
              <button className="a-btn" style={{ height: 34 }} onClick={() => navigate(HUB_ROUTES.events)}>Create</button>
            </div>
          ) : events.map(ev => {
            const host = ev.custom_domain || (ev.slug ? `/events/${ev.slug}` : null);
            const img = ev.hero_image_url || ev.logo_url;
            const date = ev.event?.date ? new Date(ev.event.date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : null;
            return (
              <div key={ev.id} className="wh-ev">
                <span className="th">{img ? <img src={img} alt="" /> : <Trophy size={20} />}</span>
                <div className="min-w-0 flex-1">
                  <div className="tt truncate">{ev.website_name || ev.event?.event_name || 'Event website'}</div>
                  {host && <div className="wh-dim text-[12.5px] mt-0.5 truncate">{host}</div>}
                  <div className="mm">
                    {ev.enabled ? <span className="wh-pill wh-live"><span className="d" />Live</span> : <span className="wh-pill wh-draft">Draft</span>}
                    {date && <span className="wh-pill">{date}</span>}
                  </div>
                </div>
                <button className="a-btn" style={{ height: 34 }} onClick={() => navigate(`/website/event-websites/${ev.id}`)}>Manage</button>
              </div>
            );
          })}
        </div>
      </section>
    </>
  );
};
