import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { supabase } from '../../utils/supabase';
import { PUBLIC_CLUB_COLUMNS } from '../../utils/publicClubColumns';
import { Club } from '../../types/club';
import type { EventPageRow } from '../../types/eventWidgets';
import { useSubdomain } from '../../contexts/SubdomainContext';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { PublicPageRows } from './PublicPageRows';
import { GoogleAnalytics } from '../GoogleAnalytics';

interface PageData {
  id: string;
  page_title: string;
  page_slug: string;
  rows: EventPageRow[];
  meta_title?: string | null;
  meta_description?: string | null;
}

/** A page a club built in the page builder, at /<slug> on its website. */
export const PublicClubPage: React.FC = () => {
  const { clubId: routeClubId, pageSlug } = useParams<{ clubId: string; pageSlug: string }>();
  const { clubId: contextClubId } = useSubdomain();
  const clubId = contextClubId || routeClubId;
  const { buildPublicUrl } = usePublicNavigation();
  const [club, setClub] = useState<Club | null>(null);
  const [page, setPage] = useState<PageData | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!clubId || !pageSlug) { setState('missing'); return; }
      setState('loading');
      const [{ data: c }, { data: p }] = await Promise.all([
        supabase.from('clubs').select(PUBLIC_CLUB_COLUMNS).eq('id', clubId).maybeSingle(),
        supabase.from('organization_page_layouts')
          .select('id, page_title, page_slug, rows, meta_title, meta_description')
          .eq('club_id', clubId).eq('page_slug', pageSlug).eq('is_published', true).maybeSingle(),
      ]);
      if (!alive) return;
      if (c) setClub({ ...(c as any), committeePositions: [] } as Club);
      setPage((p as PageData) || null);
      setState(p ? 'ready' : 'missing');
    })();
    return () => { alive = false; };
  }, [clubId, pageSlug]);

  useEffect(() => {
    if (!page || !club) return;
    const prev = document.title;
    document.title = page.meta_title || `${page.page_title} | ${club.name}`;
    return () => { document.title = prev; };
  }, [page, club]);

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {club && <GoogleAnalytics measurementId={club.google_analytics_id} />}
      <PublicHeader club={club} activePage={pageSlug ? `page:${pageSlug}` : ''} />
      <main className="pt-20 flex-1">
        {state === 'loading' && <div className="py-32 text-center text-gray-500">Loading…</div>}
        {state === 'missing' && (
          <div className="max-w-xl mx-auto px-4 py-32 text-center">
            <h1 className="text-2xl font-bold text-gray-900 mb-3">Page not found</h1>
            <p className="text-gray-600 mb-6">This page has moved or isn’t published yet.</p>
            <Link to={buildPublicUrl('/')} className="site-btn site-btn-p inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm">Go to the homepage</Link>
          </div>
        )}
        {state === 'ready' && page && (
          page.rows?.length ? (
            <PublicPageRows rows={page.rows} websiteId={clubId as string} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-24 text-center">
              <h1 className="text-3xl font-bold text-gray-900">{page.page_title}</h1>
            </div>
          )
        )}
      </main>
      {club && <PublicFooter club={club} clubId={clubId} />}
    </div>
  );
};
