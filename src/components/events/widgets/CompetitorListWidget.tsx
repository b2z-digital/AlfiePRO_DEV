import React, { useState, useEffect } from 'react';
import { Users } from 'lucide-react';

interface CompetitorData {
  id: string;
  entry_number: number;
  name: string;
  country: string;
  country_code: string;
  club: string;
  sail_number: string;
  boat_class: string;
}

interface CompetitorListWidgetProps {
  websiteId?: string;
  settings: {
    title?: string;
    event_ids?: string[];
    show_boat_class?: boolean;
  };
}

// Helper function to convert country names to codes
const getCountryCode = (countryName: string): string => {
  if (!countryName) return '';

  const countryMap: Record<string, string> = {
    'australia': 'AUS',
    'united states': 'USA',
    'usa': 'USA',
    'united kingdom': 'GBR',
    'uk': 'GBR',
    'great britain': 'GBR',
    'new zealand': 'NZL',
    'canada': 'CAN',
    'france': 'FRA',
    'germany': 'DEU',
    'italy': 'ITA',
    'spain': 'ESP',
    'netherlands': 'NED',
    'belgium': 'BEL',
    'switzerland': 'SUI',
    'austria': 'AUT',
    'denmark': 'DEN',
    'sweden': 'SWE',
    'norway': 'NOR',
    'finland': 'FIN',
    'poland': 'POL',
    'croatia': 'CRO',
    'argentina': 'ARG',
    'brazil': 'BRA',
    'chile': 'CHI',
    'china': 'CHN',
    'japan': 'JPN',
    'south korea': 'KOR',
    'mexico': 'MEX',
    'south africa': 'RSA',
    'bermuda': 'BER',
    'bahamas': 'BAH',
    'ireland': 'IRL',
    'portugal': 'POR',
    'greece': 'GRE',
    'turkey': 'TUR',
    'russia': 'RUS',
    'singapore': 'SIN',
    'hong kong': 'HKG',
    'india': 'IND',
    'thailand': 'THA',
    'malaysia': 'MAS',
    'philippines': 'PHI',
  };

  const normalized = countryName.toLowerCase().trim();
  return countryMap[normalized] || countryName.substring(0, 3).toUpperCase();
};

export const CompetitorListWidget: React.FC<CompetitorListWidgetProps> = ({
  websiteId,
  settings
}) => {
  const [competitors, setCompetitors] = useState<CompetitorData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const title = settings.title || 'Competitors';
  const showBoatClass = settings.show_boat_class !== false;

  useEffect(() => {
    const loadCompetitors = async () => {
      if (!websiteId) {
        setLoading(false);
        return;
      }

      try {
        const { supabase } = await import('../../../utils/supabase');

        // First get the basic event website info
        const { data: website, error: websiteError } = await supabase
          .from('event_websites')
          .select('event_id')
          .eq('id', websiteId)
          .maybeSingle();

        if (websiteError || !website) {
          console.error('Error loading event website:', websiteError);
          setError('Unable to load event data');
          setLoading(false);
          return;
        }

        // Determine which events to query
        let eventIdsToQuery: string[] = [];

        // Check if specific event_ids are selected in widget settings
        if (settings.event_ids && settings.event_ids.length > 0) {
          eventIdsToQuery = settings.event_ids;
        } else {
          // Try to get all events from the multi-event view
          const { data: allEventsData } = await supabase
            .from('event_website_all_events')
            .select('all_events')
            .eq('event_website_id', websiteId)
            .maybeSingle();

          if (allEventsData?.all_events && Array.isArray(allEventsData.all_events)) {
            // Multi-event website
            eventIdsToQuery = allEventsData.all_events.map((e: any) => e.id);
          } else if (website.event_id) {
            // Single event website
            eventIdsToQuery = [website.event_id];
          }
        }

        if (eventIdsToQuery.length === 0) {
          setError('No events configured');
          setLoading(false);
          return;
        }

        console.log('[CompetitorListWidget] Querying event IDs:', eventIdsToQuery);

        // First, let's see ALL registrations to debug
        const { data: allRegs } = await supabase
          .from('event_registrations')
          .select('id, event_id, guest_first_name, guest_last_name, boat_class, sail_number')
          .limit(10);

        console.log('[CompetitorListWidget] ALL registrations (first 10):', allRegs);
        if (allRegs && allRegs.length > 0) {
          console.log('[CompetitorListWidget] Registration event_ids found in DB:', allRegs.map(r => r.event_id));
          console.log('[CompetitorListWidget] Do they match?', allRegs.map(r => ({
            event_id: r.event_id,
            matches: eventIdsToQuery.includes(r.event_id),
            name: `${r.guest_first_name} ${r.guest_last_name}`
          })));
        }

        // Fetch registrations from event_registrations table
        const { data: registrations, error: regError } = await supabase
          .from('event_registrations')
          .select(`
            id,
            event_id,
            guest_first_name,
            guest_last_name,
            guest_country,
            guest_club_name,
            sail_number,
            boat_class,
            payment_status,
            created_at,
            user_id
          `)
          .in('event_id', eventIdsToQuery)
          .order('created_at', { ascending: true });

        console.log('[CompetitorListWidget] Registrations fetched:', registrations);
        console.log('[CompetitorListWidget] Registration count:', registrations?.length || 0);
        if (registrations && registrations.length > 0) {
          console.log('[CompetitorListWidget] First registration event_id:', registrations[0].event_id);
        }

        if (regError) {
          console.error('Error loading registrations:', regError);
          setError('Unable to load competitors');
          setLoading(false);
          return;
        }

        // Get unique user IDs that need profile data
        const userIds = (registrations || [])
          .filter(reg => reg.user_id)
          .map(reg => reg.user_id);

        let profilesMap: Record<string, any> = {};
        let membersMap: Record<string, any> = {};

        if (userIds.length > 0) {
          // Fetch profiles for registered users
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, first_name, last_name, full_name, default_club_id')
            .in('id', userIds);

          if (profiles) {
            profilesMap = profiles.reduce((acc, profile) => {
              acc[profile.id] = profile;
              return acc;
            }, {} as Record<string, any>);

            // Get club IDs to fetch club info
            const clubIds = profiles
              .filter(p => p.default_club_id)
              .map(p => p.default_club_id);

            if (clubIds.length > 0) {
              // Fetch club information
              const { data: clubs } = await supabase
                .from('clubs')
                .select('id, name, abbreviation')
                .in('id', clubIds);

              if (clubs) {
                // Create a map of club_id to club data
                const clubsMap = clubs.reduce((acc, club) => {
                  acc[club.id] = club;
                  return acc;
                }, {} as Record<string, any>);

                // Add club info to profiles
                profiles.forEach(profile => {
                  if (profile.default_club_id && clubsMap[profile.default_club_id]) {
                    profilesMap[profile.id].club = clubsMap[profile.default_club_id];
                  }
                });
              }
            }

            // Also fetch member data to get club info for users
            const { data: members } = await supabase
              .from('members')
              .select('user_id, club_id, club_name')
              .in('user_id', userIds);

            if (members) {
              membersMap = members.reduce((acc, member) => {
                acc[member.user_id] = member;
                return acc;
              }, {} as Record<string, any>);
            }
          }
        }

        // Fetch club data for members to get abbreviations
        const memberClubIds = Object.values(membersMap)
          .filter((m: any) => m.club_id)
          .map((m: any) => m.club_id);

        let clubAbbreviationsMap: Record<string, string> = {};

        if (memberClubIds.length > 0) {
          const { data: clubs } = await supabase
            .from('clubs')
            .select('id, abbreviation, name')
            .in('id', memberClubIds);

          if (clubs) {
            clubAbbreviationsMap = clubs.reduce((acc, club) => {
              acc[club.id] = club.abbreviation || club.name;
              return acc;
            }, {} as Record<string, string>);
          }
        }

        // Transform data into competitor list format
        const competitorList: CompetitorData[] = (registrations || []).map((reg, index) => {
          // Get name from profile or guest fields
          let fullName = '';
          let clubName = '';
          let countryName = reg.guest_country || '';

          if (reg.user_id && profilesMap[reg.user_id]) {
            // Logged-in Alfie member
            const profile = profilesMap[reg.user_id];
            fullName = profile.full_name || `${profile.first_name || ''} ${profile.last_name || ''}`.trim();

            // For logged-in members, ALWAYS use club abbreviation from their member profile
            if (membersMap[reg.user_id]) {
              const member = membersMap[reg.user_id];
              if (member.club_id && clubAbbreviationsMap[member.club_id]) {
                clubName = clubAbbreviationsMap[member.club_id];
              } else if (member.club_name) {
                clubName = member.club_name;
              }
            }

            // Only use guest_club_name if member club is not found
            if (!clubName) {
              clubName = reg.guest_club_name || '';
            }
          } else {
            // Guest registration (no user_id) - use the club name they entered
            fullName = `${reg.guest_first_name || ''} ${reg.guest_last_name || ''}`.trim();
            clubName = reg.guest_club_name || '';
          }

          return {
            id: reg.id,
            entry_number: index + 1,
            name: fullName || 'Unknown',
            country: countryName,
            country_code: getCountryCode(countryName),
            club: clubName,
            sail_number: reg.sail_number || '',
            boat_class: reg.boat_class || ''
          };
        });

        setCompetitors(competitorList);
        setError(null);
      } catch (err) {
        console.error('Error in loadCompetitors:', err);
        setError('An unexpected error occurred');
      } finally {
        setLoading(false);
      }
    };

    loadCompetitors();
  }, [websiteId, settings.event_ids]);

  if (loading) {
    return (
      <div className="bg-white">
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-900"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white">
        <div className="text-center py-8 text-slate-600">
          {error}
        </div>
      </div>
    );
  }

  // Check if there are multiple unique countries (to determine if we should show the Country column)
  const uniqueCountries = new Set(
    competitors
      .map(c => c.country_code)
      .filter(code => code && code.length > 0)
  );
  const showCountry = uniqueCountries.size > 1;

  return (
    <div className="bg-white">
      {competitors.length === 0 ? (
        <div className="text-center py-12 bg-slate-50">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-sm text-slate-600">
            No registered competitors yet
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr className="bg-slate-200">
                <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                  Entry
                </th>
                <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                  Name
                </th>
                <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                  Club
                </th>
                {showCountry && (
                  <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                    Country
                  </th>
                )}
                <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                  Sail No
                </th>
                {showBoatClass && (
                  <th className="text-left py-3 px-4 font-bold uppercase text-xs text-black">
                    Design
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {competitors.map((competitor, index) => (
                <tr
                  key={competitor.id}
                  className={index % 2 === 0 ? 'bg-white' : 'bg-slate-100'}
                >
                  <td className="py-3 px-4 text-sm text-black">
                    {competitor.entry_number}
                  </td>
                  <td className="py-3 px-4 text-sm text-black">
                    {competitor.name}
                  </td>
                  <td className="py-3 px-4 text-sm text-black">
                    {competitor.club}
                  </td>
                  {showCountry && (
                    <td className="py-3 px-4 text-sm text-black">
                      {competitor.country_code}
                    </td>
                  )}
                  <td className="py-3 px-4 text-sm text-black">
                    {competitor.sail_number}
                  </td>
                  {showBoatClass && (
                    <td className="py-3 px-4 text-sm text-black">
                      {competitor.boat_class}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
