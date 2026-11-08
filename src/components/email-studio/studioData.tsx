import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../utils/supabase';
import { brandFor, topicsFor, type StudioSettingsRow } from '../../lib/emailStudio/brand';
import { sampleFeed, sampleReader } from '../../lib/emailStudio/render';
import type { Brand, Feed, Reader } from '../../lib/emailStudio/types';
import { fetchFeed, getSettings, listLists, listSegments, type FeedResponse, type SegmentRow } from './api';

export interface StudioClub {
  id: string;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  address: string | null;
  contact_email: string | null;
  website_theme: Record<string, unknown> | null;
}

interface Studio {
  clubId: string;
  club: StudioClub | null;
  settings: StudioSettingsRow | null;
  brand: Brand;
  topics: { key: string; label: string; note?: string }[];
  feed: Feed;
  reader: Reader;
  feedReady: boolean;
  feedError: string | null;
  app: string;
  defaults: FeedResponse['defaults'];
  segments: SegmentRow[];
  lists: SegmentRow[];
  loadFeed: (force?: boolean) => Promise<void>;
  readerFor: (memberId: string | null) => Promise<Reader>;
  reload: (what?: ('settings' | 'segments' | 'lists' | 'club')[]) => Promise<void>;
  setSettings: (s: StudioSettingsRow | null) => void;
}

const Ctx = createContext<Studio | null>(null);
export const useStudio = () => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useStudio outside StudioProvider');
  return c;
};

export const StudioProvider: React.FC<{ clubId: string; children: React.ReactNode }> = ({ clubId, children }) => {
  const [club, setClub] = useState<StudioClub | null>(null);
  const [settings, setSettings] = useState<StudioSettingsRow | null>(null);
  const [segments, setSegments] = useState<SegmentRow[]>([]);
  const [lists, setLists] = useState<SegmentRow[]>([]);
  const [live, setLive] = useState<FeedResponse | null>(null);
  const [feedError, setFeedError] = useState<string | null>(null);
  const feedLoading = useRef<Promise<void> | null>(null);
  const readers = useRef<Record<string, Reader>>({});

  const loadClub = useCallback(async () => {
    const { data } = await supabase.from('clubs').select('id, name, abbreviation, logo, address, contact_email, website_theme').eq('id', clubId).maybeSingle();
    setClub((data as StudioClub) || null);
  }, [clubId]);

  const reload = useCallback(async (what: ('settings' | 'segments' | 'lists' | 'club')[] = ['settings', 'segments', 'lists', 'club']) => {
    await Promise.all([
      what.includes('club') ? loadClub() : null,
      what.includes('settings') ? getSettings(clubId).then(setSettings) : null,
      what.includes('segments') ? listSegments(clubId).then(setSegments) : null,
      what.includes('lists') ? listLists(clubId).then(setLists) : null,
    ]);
  }, [clubId, loadClub]);

  useEffect(() => { reload(); }, [reload]);

  const loadFeed = useCallback(async (force = false) => {
    if (live && !force) return;
    if (feedLoading.current && !force) return feedLoading.current;
    const p = fetchFeed(clubId).then(r => { setLive(r); setFeedError(null); }).catch(e => setFeedError((e as Error).message || 'Could not load club content'));
    feedLoading.current = p.finally(() => { feedLoading.current = null; });
    return feedLoading.current;
  }, [clubId, live]);

  const readerFor = useCallback(async (memberId: string | null) => {
    if (!memberId) return live?.reader || sampleReader();
    if (readers.current[memberId]) return readers.current[memberId];
    const r = await fetchFeed(clubId, memberId);
    readers.current[memberId] = r.reader;
    return r.reader;
  }, [clubId, live]);

  const value = useMemo<Studio>(() => {
    const name = club?.name || 'Your club';
    const brand = live?.brand && !settings ? live.brand : brandFor({ name, logo: club?.logo, website_theme: club?.website_theme }, settings);
    return {
      clubId,
      club,
      settings,
      brand,
      topics: topicsFor(settings),
      feed: live?.feed || sampleFeed(clubId, name),
      reader: live?.reader || sampleReader(),
      feedReady: !!live,
      feedError,
      app: live?.app || 'https://app.alfiepro.com.au',
      defaults: live?.defaults || { from_name: settings?.from_name || name, reply_to: settings?.reply_to || club?.contact_email || null, footer_address: settings?.footer_address || club?.address || null },
      segments,
      lists,
      loadFeed,
      readerFor,
      reload,
      setSettings,
    };
  }, [clubId, club, settings, live, feedError, segments, lists, loadFeed, readerFor, reload]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
};
