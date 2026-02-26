import React, { useEffect, useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { supabase } from '../utils/supabase';
import { SubdomainProvider } from '../contexts/SubdomainContext';
import { PublicClubHomepageNew } from './public/PublicClubHomepageNew';
import { PublicNewsPage } from './public/PublicNewsPage';
import { PublicArticleDetailPage } from './public/PublicArticleDetailPage';
import { PublicVenuesPage } from './public/PublicVenuesPage';
import { PublicClassifiedsPage } from './public/PublicClassifiedsPage';
import { PublicContactPage } from './public/PublicContactPage';
import { PublicYachtClassesPage } from './public/PublicYachtClassesPage';
import { PublicRaceCalendarPage } from './public/PublicRaceCalendarPage';
import { PublicResultsPage } from './public/PublicResultsPage';
import { PublicResultsListPage } from './public/PublicResultsListPage';
import { PublicEventWebsitePage } from './public/PublicEventWebsitePage';

interface SubdomainPublicSiteProps {
  subdomain: string;
}

export const SubdomainPublicSite: React.FC<SubdomainPublicSiteProps> = ({ subdomain }) => {
  const [clubId, setClubId] = useState<string | null>(null);
  const [eventWebsiteId, setEventWebsiteId] = useState<string | null>(null);
  const [siteType, setSiteType] = useState<'club' | 'event' | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadClubBySubdomain();
  }, [subdomain]);

  const loadClubBySubdomain = async () => {
    try {
      setLoading(true);
      setError(null);

      // Check if subdomain contains a dot (custom domain) or is a simple subdomain slug
      const isCustomDomain = subdomain.includes('.');

      // First, try to find a club
      let clubQuery = supabase
        .from('clubs')
        .select('id');

      if (isCustomDomain) {
        clubQuery = clubQuery.eq('custom_domain', subdomain);
      } else {
        clubQuery = clubQuery.eq('subdomain_slug', subdomain);
      }

      const { data: club, error: clubError } = await clubQuery
        .in('domain_status', ['active', 'custom'])
        .maybeSingle();

      if (clubError) {
        console.error('Error loading club:', clubError);
      }

      if (club) {
        setClubId(club.id);
        setSiteType('club');
        return;
      }

      // If no club found, try to find an event website
      let eventQuery = supabase
        .from('event_websites')
        .select('id');

      if (isCustomDomain) {
        eventQuery = eventQuery.eq('custom_domain', subdomain);
      } else {
        eventQuery = eventQuery.eq('subdomain_slug', subdomain);
      }

      const { data: eventWebsite, error: eventError } = await eventQuery
        .eq('enabled', true)
        .eq('website_published', true)
        .maybeSingle();

      if (eventError) {
        console.error('Error loading event website:', eventError);
      }

      if (eventWebsite) {
        setEventWebsiteId(eventWebsite.id);
        setSiteType('event');
        return;
      }

      // Neither found
      setError(`Website not found for this ${isCustomDomain ? 'domain' : 'subdomain'}`);
    } catch (err) {
      console.error('Error loading website by subdomain/domain:', err);
      setError('Failed to load website');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error || (!clubId && !eventWebsiteId)) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-white mb-4">Website Not Found</h1>
          <p className="text-slate-400 mb-6">
            {error || 'This website is not available'}
          </p>
          <p className="text-sm text-slate-500">
            Subdomain: {subdomain}.alfiepro.com.au
          </p>
        </div>
      </div>
    );
  }

  // Render event website if found
  if (siteType === 'event' && eventWebsiteId) {
    return <PublicEventWebsitePage eventWebsiteId={eventWebsiteId} />;
  }

  // Render club website with Routes wrapped in SubdomainProvider
  if (siteType === 'club' && clubId) {
    return (
      <SubdomainProvider clubId={clubId} isSubdomainMode={true}>
        <Routes>
          <Route path="/" element={<PublicClubHomepageNew clubIdOverride={clubId} />} />
          <Route path="/news" element={<PublicNewsPage />} />
          <Route path="/news/:articleId" element={<PublicArticleDetailPage />} />
          <Route path="/venues" element={<PublicVenuesPage />} />
          <Route path="/classifieds" element={<PublicClassifiedsPage />} />
          <Route path="/contact" element={<PublicContactPage />} />
          <Route path="/yacht-classes" element={<PublicYachtClassesPage />} />
          <Route path="/race-calendar" element={<PublicRaceCalendarPage />} />
          <Route path="/results" element={<PublicResultsListPage />} />
          <Route path="/results/:eventId" element={<PublicResultsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </SubdomainProvider>
    );
  }

  return null;
};
