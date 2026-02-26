import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Menu, X, MapPin, ChevronLeft, ChevronRight, Calendar, Clock, Award } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { formatDate } from '../../utils/date';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';

interface HomepageSlide {
  id: string;
  title: string;
  subtitle: string;
  image_url: string;
  button_text: string;
  button_url: string;
  display_order: number;
}

interface HomepageTile {
  id: string;
  title: string;
  description: string;
  image_url: string;
  link_url: string;
  display_order: number;
}

interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  cover_image?: string;
  published_at: string;
}

interface UpcomingEvent {
  id: string;
  name: string;
  date: string;
  venue: string;
  race_class: string;
  type: 'quick_race' | 'series_round';
}

interface LatestResult {
  id: string;
  name: string;
  date: string;
  winner: string;
  race_class: string;
  type: 'quick_race' | 'series';
}

const DEFAULT_TILES = [
  {
    id: 'default-1',
    title: 'Membership',
    description: 'Join our club and become part of our sailing community',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706687369-3py4vakmj.png',
    link_url: 'https://alfiepro.com.au/register'
  },
  {
    id: 'default-2',
    title: 'Race Program',
    description: 'View our racing schedule and upcoming events',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688368-eecpmijqz.png',
    link_url: '/race-calendar'
  },
  {
    id: 'default-3',
    title: 'Classes',
    description: 'Explore the yacht classes competing at our club',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761706688951-pbg18pkgm.png',
    link_url: '/yacht-classes'
  },
  {
    id: 'default-4',
    title: 'Venue',
    description: 'Learn about our facilities and location',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714334371_dgngg6.jpg',
    link_url: '/venues'
  },
  {
    id: 'default-5',
    title: 'News',
    description: 'Stay up to date with club news and announcements',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761799093766_43j26l.jpg',
    link_url: '/news'
  },
  {
    id: 'default-6',
    title: 'Classifieds',
    description: 'Browse boats and equipment for sale',
    image_url: 'https://ehgbpdqbsykhepuwdgrj.supabase.co/storage/v1/object/public/event-media/bafdff76-ebe7-4890-b7fa-20aa9bb37491/1761714523155_j2g5fj.jpg',
    link_url: '/classifieds'
  }
];

const getClubInitials = (clubName: string): string => {
  return clubName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 6);
};

interface PublicClubHomepageNewProps {
  clubIdOverride?: string;
}

export const PublicClubHomepageNew: React.FC<PublicClubHomepageNewProps> = ({ clubIdOverride }) => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const clubId = clubIdOverride || paramClubId;
  const { buildPublicUrl } = usePublicNavigation();
  const [club, setClub] = useState<Club | null>(null);
  const [slides, setSlides] = useState<HomepageSlide[]>([]);
  const [tiles, setTiles] = useState<HomepageTile[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [latestResults, setLatestResults] = useState<LatestResult[]>([]);
  const [defaultVenueAddress, setDefaultVenueAddress] = useState<string>('');
  const [defaultVenueCoords, setDefaultVenueCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    loadClubData();
  }, [clubId]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [slides.length]);

  const loadClubData = async () => {
    if (!clubId) return;

    try {
      setLoading(true);

      const { data: clubData, error: clubError } = await supabase
        .from('clubs')
        .select('*')
        .eq('id', clubId)
        .maybeSingle();

      if (clubError) throw clubError;
      if (clubData) {
        setClub({
          ...clubData,
          committeePositions: clubData.committee_positions || []
        } as Club);
      }

      const { data: slidesData, error: slidesError } = await supabase
        .from('homepage_slides')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('display_order');

      if (slidesError) throw slidesError;

      if (!slidesData || slidesData.length === 0) {
        if (clubData?.cover_image_url) {
          setSlides([{
            id: 'default',
            title: '',
            subtitle: '',
            image_url: clubData.cover_image_url,
            button_text: '',
            button_url: '',
            display_order: 0
          }]);
        }
      } else {
        setSlides(slidesData);
      }

      const { data: tilesData, error: tilesError } = await supabase
        .from('homepage_tiles')
        .select('*')
        .eq('club_id', clubId)
        .eq('is_active', true)
        .order('display_order');

      if (tilesError) throw tilesError;
      // Limit to 6 tiles maximum
      setTiles(tilesData ? tilesData.slice(0, 6) : []);

      let newsFilter = `club_id.eq.${clubId}`;
      if (clubData?.state_association_id) {
        newsFilter += `,state_association_id.eq.${clubData.state_association_id}`;
        const { data: stAssoc } = await supabase
          .from('state_associations')
          .select('national_association_id')
          .eq('id', clubData.state_association_id)
          .maybeSingle();
        if (stAssoc?.national_association_id) {
          newsFilter += `,national_association_id.eq.${stAssoc.national_association_id}`;
        }
      }

      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('id, title, excerpt, cover_image, published_at')
        .or(newsFilter)
        .eq('status', 'published')
        .order('published_at', { ascending: false })
        .limit(3);

      if (articlesError) throw articlesError;
      setNewsArticles(articlesData || []);

      // Load default venue address and coordinates
      const { data: venueData, error: venueError } = await supabase
        .from('venues')
        .select('address, latitude, longitude')
        .eq('club_id', clubId)
        .eq('is_default', true)
        .maybeSingle();

      if (!venueError && venueData) {
        setDefaultVenueAddress(venueData.address || '');
        if (venueData.latitude && venueData.longitude) {
          setDefaultVenueCoords({ lat: venueData.latitude, lng: venueData.longitude });
        }
      } else if (clubData?.address) {
        setDefaultVenueAddress(clubData.address);
      }

      // Load upcoming events (next 4) - from both quick races and series rounds
      const today = new Date().toISOString().split('T')[0]; // Get YYYY-MM-DD format

      // Get upcoming quick races (not completed)
      const { data: upcomingQuickRaces, error: quickRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_venue, race_class, completed')
        .eq('club_id', clubId)
        .gte('race_date', today)
        .neq('completed', true)
        .order('race_date', { ascending: true });

      if (quickRacesError) {
        console.error('Error loading quick races:', quickRacesError);
      } else {
        console.log('Quick races loaded:', upcomingQuickRaces);
        console.log('Quick races with completed status:', upcomingQuickRaces?.map(r => ({ name: r.event_name, completed: r.completed })));
      }

      // Get all race series and extract upcoming rounds from JSONB
      const { data: allSeries, error: seriesError } = await supabase
        .from('race_series')
        .select('id, series_name, rounds, race_class, skippers')
        .eq('club_id', clubId);

      if (seriesError) {
        console.error('Error loading series:', seriesError);
      }

      // Extract upcoming rounds from all series
      const upcomingSeriesRounds: any[] = [];
      (allSeries || []).forEach((series: any) => {
        if (series.rounds && Array.isArray(series.rounds)) {
          series.rounds.forEach((round: any) => {
            const roundDate = round.date;
            const isUpcoming = roundDate >= today;
            const isNotCompleted = !round.completed;
            const isNotCancelled = !round.cancelled;

            if (isUpcoming && isNotCompleted && isNotCancelled) {
              upcomingSeriesRounds.push({
                id: `${series.id}-${round.name}`,
                round_name: round.name,
                date: roundDate,
                venue: round.venue,
                race_class: series.race_class,
                series_name: series.series_name
              });
            }
          });
        }
      });

      console.log('Series rounds extracted:', upcomingSeriesRounds);

      // Fetch state/national association public events
      const associationEventItems: UpcomingEvent[] = [];
      const associationResultItems: LatestResult[] = [];
      if (clubData?.state_association_id) {
        const stateId = clubData.state_association_id;
        const { data: stateAssoc } = await supabase
          .from('state_associations')
          .select('national_association_id')
          .eq('id', stateId)
          .maybeSingle();

        const associationIds = [stateId];
        if (stateAssoc?.national_association_id) {
          associationIds.push(stateAssoc.national_association_id);
        }

        const { data: publicEvents } = await supabase
          .from('public_events')
          .select('id, event_name, date, end_date, venue, race_class, state_association_id, national_association_id, approval_status, archived')
          .or(associationIds.map(id => `state_association_id.eq.${id},national_association_id.eq.${id}`).join(','))
          .eq('approval_status', 'approved')
          .neq('archived', true)
          .order('date', { ascending: true });

        if (publicEvents) {
          for (const pe of publicEvents) {
            const eventDate = pe.date || '';
            if (eventDate >= today) {
              associationEventItems.push({
                id: pe.id,
                name: pe.event_name || 'Event',
                date: eventDate,
                venue: pe.venue || '',
                race_class: pe.race_class || '',
                type: 'quick_race' as const
              });
            } else if (eventDate < today) {
              associationResultItems.push({
                id: pe.id,
                name: pe.event_name || 'Event',
                date: eventDate,
                winner: '',
                race_class: pe.race_class || '',
                type: 'quick_race' as const
              });
            }
          }
        }
      }

      // Combine and sort all upcoming events
      const allUpcomingEvents: UpcomingEvent[] = [
        ...(upcomingQuickRaces || [])
          .map(event => ({
            id: event.id,
            name: event.event_name || `Race - ${event.race_class || 'Multi-Class'}`,
            date: event.race_date,
            venue: event.race_venue || '',
            race_class: event.race_class || '',
            type: 'quick_race' as const
          })),
        ...(upcomingSeriesRounds || [])
          .map((round: any) => ({
            id: round.id,
            name: `${round.round_name} - ${round.series_name}`,
            date: round.date,
            venue: round.venue || '',
            race_class: round.race_class || '',
            type: 'series_round' as const
          })),
        ...associationEventItems
      ];

      // Sort by date and take first 4
      allUpcomingEvents.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
      setUpcomingEvents(allUpcomingEvents.slice(0, 4));

      const { data: completedQuickRaces, error: completedRacesError } = await supabase
        .from('quick_races')
        .select('id, event_name, race_date, race_class, race_results, skippers, completed')
        .eq('club_id', clubId)
        .eq('completed', true)
        .lt('race_date', today)
        .order('race_date', { ascending: false })
        .limit(20);

      if (completedRacesError) {
        console.error('Error loading completed races:', completedRacesError);
      }

      const { data: completedRoundsData } = await supabase
        .from('race_series_rounds')
        .select('id, round_name, date, race_class, race_results, skippers, completed, race_series!inner(series_name)')
        .eq('club_id', clubId)
        .eq('completed', true)
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(20);

      const completedSeriesRounds = (completedRoundsData || []).map((round: any) => ({
        id: round.id,
        round_name: round.round_name,
        date: round.date,
        series_name: round.race_series?.series_name || '',
        race_class: round.race_class || '',
        race_results: round.race_results || [],
        skippers: round.skippers || []
      }));

      const quickRaceResults: LatestResult[] = (completedQuickRaces || [])
        .map(event => {
          let winner = 'No results';
          const skippers = event.skippers || [];
          if (event.race_results && Array.isArray(event.race_results) && event.race_results.length > 0) {
            const firstPlace = event.race_results.find((r: any) => r.position === 1);
            if (firstPlace) {
              if (firstPlace.skipperName) {
                winner = firstPlace.skipperName;
              } else if (firstPlace.skipperIndex !== undefined && skippers[firstPlace.skipperIndex]) {
                winner = skippers[firstPlace.skipperIndex].name || 'Unknown';
              }
            }
          }
          return {
            id: event.id,
            name: event.event_name || `Race - ${event.race_class || 'Multi-Class'}`,
            date: event.race_date,
            winner,
            race_class: event.race_class || '',
            type: 'quick_race' as const
          };
        });

      const seriesResults: LatestResult[] = completedSeriesRounds.map((round: any) => {
        let winner = 'No results';

        const raceResults = round.race_results || [];
        const skippers = round.skippers || [];
        if (raceResults.length > 0 && skippers.length > 0) {
          const skipperScores: Record<number, number> = {};
          raceResults.forEach((result: any) => {
            const skipperIdx = result.skipperIndex;
            if (skipperIdx !== undefined) {
              if (!skipperScores[skipperIdx]) {
                skipperScores[skipperIdx] = 0;
              }
              if (result.position) {
                skipperScores[skipperIdx] += result.position;
              }
            }
          });

          let lowestScore = Infinity;
          let winnerIdx = -1;
          Object.entries(skipperScores).forEach(([idx, score]) => {
            if (score < lowestScore) {
              lowestScore = score;
              winnerIdx = parseInt(idx);
            }
          });

          if (winnerIdx >= 0 && skippers[winnerIdx]) {
            winner = skippers[winnerIdx].name || 'Unknown';
          }
        }

        return {
          id: round.id,
          name: `${round.round_name} - ${round.series_name}`,
          date: round.date,
          winner,
          race_class: round.race_class || '',
          type: 'series' as const
        };
      });

      // Combine and sort all results
      const allResults = [...quickRaceResults, ...seriesResults, ...associationResultItems];
      allResults.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setLatestResults(allResults.slice(0, 4));

    } catch (error) {
      console.error('Error loading club data:', error);
    } finally {
      setLoading(false);
    }
  };

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev + 1) % slides.length);
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev - 1 + slides.length) % slides.length);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Club not found</div>
      </div>
    );
  }

  // Limit to 6 tiles maximum
  const displayTiles = tiles.length > 0 ? tiles.slice(0, 6) : DEFAULT_TILES;
  const clubInitials = getClubInitials(club.name);

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club.google_analytics_id} />
      {/* Navigation Bar */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white shadow-md">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="flex flex-col items-center gap-0.5 p-2 rounded-lg hover:bg-gray-100 transition-colors"
              aria-label="Menu"
            >
              {mobileMenuOpen ? (
                <X className="w-6 h-6 text-gray-700" />
              ) : (
                <>
                  <Menu className="w-6 h-6 text-gray-700" />
                  <span className="text-[10px] text-gray-700 font-semibold tracking-wider">MENU</span>
                </>
              )}
            </button>

            <div className="absolute left-1/2 transform -translate-x-1/2 flex flex-col items-center">
              {club.logo ? (
                <img
                  src={club.logo}
                  alt={club.name}
                  className="h-14 w-auto object-contain"
                />
              ) : (
                <div className="flex flex-col items-center">
                  <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center shadow-lg">
                    <span className="text-white font-bold text-sm">{clubInitials}</span>
                  </div>
                  <span className="text-xs text-gray-600 mt-1 font-medium">{club.abbreviation || clubInitials}</span>
                </div>
              )}
            </div>

            <a
              href="https://alfiepro.com.au"
              target="_blank"
              rel="noopener noreferrer"
              className="px-6 py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg transition-colors text-sm tracking-wide"
            >
              MEMBERS
            </a>
          </div>
        </div>

        {/* Mobile Menu Overlay */}
        {mobileMenuOpen && (
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Slide-out Mobile Menu */}
        <div
          className={`fixed top-0 left-0 h-full w-[420px] bg-white shadow-2xl z-50 transform transition-transform duration-300 ease-in-out ${
            mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="bg-gray-100 px-6 py-7">
            <button
              onClick={() => setMobileMenuOpen(false)}
              className="w-full text-center text-gray-900 font-semibold text-sm tracking-[0.2em] hover:text-gray-600 transition-colors"
            >
              CLOSE MENU
            </button>
          </div>

          <nav className="space-y-0">
            <a
              href="#"
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              HOME
            </a>
            <a
              href="#membership"
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              MEMBERSHIP
            </a>
            <Link
              to={buildPublicUrl('/race-calendar')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              RACE CALENDAR
            </Link>
            <Link
              to={buildPublicUrl('/yacht-classes')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              YACHT CLASSES
            </Link>
            <a
              href="#results"
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              RESULTS
            </a>
            <Link
              to={buildPublicUrl('/venues')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              VENUES
            </Link>
            <Link
              to={buildPublicUrl('/news')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              LATEST NEWS
            </Link>
            <Link
              to={buildPublicUrl('/classifieds')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              CLASSIFIEDS
            </Link>
            <Link
              to={buildPublicUrl('/contact')}
              className="block py-4 text-center text-gray-900 font-medium text-sm tracking-[0.15em] hover:text-gray-600 transition-colors border-b border-gray-200"
              onClick={() => setMobileMenuOpen(false)}
            >
              CONTACT US
            </Link>
          </nav>
        </div>
      </nav>

      <div className="pt-20">
        {/* Hero Carousel */}
        {slides.length > 0 && (
          <section className="relative h-[320px] md:h-[400px] lg:h-[500px] overflow-hidden">
            {slides.map((slide, index) => (
              <div
                key={slide.id}
                className={`absolute inset-0 transition-opacity duration-1000 ${
                  index === currentSlide ? 'opacity-100 z-10' : 'opacity-0 z-0 pointer-events-none'
                }`}
              >
                <img
                  src={slide.image_url}
                  alt={slide.title}
                  className="w-full h-full object-cover"
                />
                {(slide.title || slide.subtitle || slide.button_text) && (
                  <div className="absolute inset-0 bg-black bg-opacity-30 flex items-center justify-center">
                    <div className="text-center text-white px-4">
                      {slide.title && (
                        <h1 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-3">
                          {slide.title}
                        </h1>
                      )}
                      {slide.subtitle && (
                        <p className="text-base md:text-lg lg:text-xl mb-4 max-w-2xl mx-auto">
                          {slide.subtitle}
                        </p>
                      )}
                      {slide.button_text && slide.button_url && (
                        slide.button_url.startsWith('/') ? (
                          <Link
                            to={buildPublicUrl(slide.button_url)}
                            className="inline-block px-6 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            {slide.button_text}
                          </Link>
                        ) : (
                          <a
                            href={slide.button_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-block px-6 py-2.5 bg-white text-gray-900 font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            {slide.button_text}
                          </a>
                        )
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {slides.length > 1 && (
              <>
                <button
                  onClick={prevSlide}
                  className="absolute left-4 top-1/2 -translate-y-1/2 p-2 bg-white bg-opacity-50 hover:bg-opacity-75 rounded-full transition-all"
                >
                  <ChevronLeft className="w-6 h-6 text-gray-900" />
                </button>
                <button
                  onClick={nextSlide}
                  className="absolute right-4 top-1/2 -translate-y-1/2 p-2 bg-white bg-opacity-50 hover:bg-opacity-75 rounded-full transition-all"
                >
                  <ChevronRight className="w-6 h-6 text-gray-900" />
                </button>

                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
                  {slides.map((_, index) => (
                    <button
                      key={index}
                      onClick={() => setCurrentSlide(index)}
                      className={`h-2 rounded-full transition-all ${
                        index === currentSlide
                          ? 'bg-white w-6'
                          : 'bg-white bg-opacity-50 hover:bg-opacity-75 w-2'
                      }`}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {/* Welcome Section */}
        <section id="about" className="py-16 px-4 bg-white">
          <div className="max-w-5xl mx-auto">
            <h2 className="text-2xl md:text-3xl text-gray-900 mb-6 text-center" style={{ fontSize: '2rem' }}>
              <span className="font-extrabold">Welcome to </span>
              <span className="font-normal">{club.name}</span>
            </h2>
            <div
              className="text-base md:text-lg text-gray-700 leading-relaxed prose prose-lg max-w-none whitespace-pre-wrap text-center"
              dangerouslySetInnerHTML={{
                __html: (club.club_introduction || club.description || `Welcome to ${club.name}. Join us for an amazing experience.`).replace(/\n/g, '<br>')
              }}
            />
          </div>
        </section>

        {/* Quick Link Tiles */}
        <section className="py-8 bg-gray-50">
          <div className="max-w-7xl mx-auto px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {displayTiles.map((tile) => {
                const isInternal = tile.link_url.startsWith('/');
                const tileContent = (
                  <>
                    <img
                      src={tile.image_url}
                      alt={tile.title}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent" />
                    <div className="absolute inset-0 flex flex-col justify-end p-6">
                      <h3 className="text-white text-2xl font-bold mb-2">
                        {tile.title}
                      </h3>
                      {tile.description && (
                        <p className="text-white/90 text-sm mb-4">
                          {tile.description}
                        </p>
                      )}
                      <div className="flex items-center text-white text-sm font-semibold">
                        Learn More
                        <svg className="w-4 h-4 ml-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                      </div>
                    </div>
                  </>
                );
                return isInternal ? (
                  <Link
                    key={tile.id}
                    to={buildPublicUrl(tile.link_url)}
                    className="group relative h-72 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300"
                  >
                    {tileContent}
                  </Link>
                ) : (
                  <a
                    key={tile.id}
                    href={tile.link_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative h-72 rounded-lg overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300"
                  >
                    {tileContent}
                  </a>
                );
              })}
            </div>
          </div>
        </section>

        {/* Upcoming Events & Latest Results */}
        <section className="py-16 px-4 bg-white">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">

              {/* Upcoming Events */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Upcoming Events</h2>
                {upcomingEvents.length > 0 ? (
                  <div className="space-y-3">
                    {upcomingEvents.map((event) => (
                      <div
                        key={event.id}
                        className="bg-gray-50 rounded-lg p-3 hover:shadow-md transition-shadow min-h-[110px] flex flex-col"
                      >
                        <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{event.name}</h3>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <Calendar className="w-3.5 h-3.5" />
                            <span>{formatDate(event.date)}</span>
                          </div>
                          {event.venue && (
                            <div className="flex items-center gap-2">
                              <MapPin className="w-3.5 h-3.5" />
                              <span>{event.venue}</span>
                            </div>
                          )}
                          {event.race_class && (
                            <div className="text-gray-500">
                              Class: {event.race_class}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-12 text-center">
                    <Calendar className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-500">No upcoming events scheduled</p>
                  </div>
                )}
              </div>

              {/* Latest Results */}
              <div>
                <h2 className="text-2xl font-bold text-gray-900 mb-6">Latest Results</h2>
                {latestResults.length > 0 ? (
                  <div className="space-y-3">
                    {latestResults.map((result) => (
                      <Link
                        key={result.id}
                        to={buildPublicUrl(`/results/${result.id}`)}
                        className="block bg-gray-50 rounded-lg p-3 hover:shadow-md hover:bg-gray-100 transition-all min-h-[110px] flex flex-col"
                      >
                        <h3 className="font-semibold text-gray-900 mb-1.5 text-sm">{result.name}</h3>
                        <div className="space-y-1 text-xs text-gray-600">
                          <div className="flex items-center gap-2">
                            <Clock className="w-3.5 h-3.5" />
                            <span>{formatDate(result.date)}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Award className="w-3.5 h-3.5 text-yellow-600" />
                            <span className="font-medium">Winner: {result.winner}</span>
                          </div>
                          {result.race_class && (
                            <div className="flex items-center justify-between">
                              <div className="text-gray-500">
                                Class: {result.race_class}
                              </div>
                              <div className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                View Full Results
                                <ChevronRight className="w-3.5 h-3.5" />
                              </div>
                            </div>
                          )}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : (
                  <div className="bg-gray-50 rounded-lg p-12 text-center">
                    <Award className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-gray-500">No results available yet</p>
                  </div>
                )}
              </div>

            </div>
          </div>
        </section>

        {/* Latest News */}
        {newsArticles.length > 0 && (
          <section id="news" className="py-16 px-4 bg-gray-50">
            <div className="max-w-7xl mx-auto">
              <h2 className="text-2xl md:text-3xl font-bold text-gray-900 mb-10 text-center tracking-wider">
                LATEST NEWS
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {newsArticles.map((article) => (
                  <div
                    key={article.id}
                    className="bg-white rounded-sm overflow-hidden shadow-md hover:shadow-xl transition-shadow"
                  >
                    <div className="relative h-56 overflow-hidden">
                      <img
                        src={article.cover_image || '/RC-Yachts-image-custom_crop.jpg'}
                        alt={article.title}
                        className="w-full h-full object-cover hover:scale-105 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-6">
                      <h3 className="text-lg font-bold text-gray-900 mb-3 uppercase tracking-wide line-clamp-2">
                        {article.title}
                      </h3>
                      <p className="text-gray-600 text-sm mb-4 line-clamp-3">
                        {article.excerpt}
                      </p>
                      <Link
                        to={buildPublicUrl(`/news/${article.id}`)}
                        className="inline-block px-5 py-2 bg-black text-white text-xs font-semibold rounded hover:bg-gray-800 transition-colors uppercase tracking-wider"
                      >
                        Read More
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* Map Section */}
        {defaultVenueAddress && (
          <section id="contact" className="bg-white">
            <div className="w-full">
              <div className="h-[500px] bg-gray-300 overflow-hidden relative">
                <iframe
                  width="100%"
                  height="100%"
                  frameBorder="0"
                  style={{ border: 0, filter: 'grayscale(100%) contrast(1.2) brightness(0.95)' }}
                  src={defaultVenueCoords
                    ? `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${defaultVenueCoords.lat},${defaultVenueCoords.lng}&zoom=14`
                    : `https://www.google.com/maps/embed/v1/place?key=${import.meta.env.VITE_GOOGLE_MAPS_API_KEY}&q=${encodeURIComponent(
                        defaultVenueAddress
                      )}&zoom=14`
                  }
                  allowFullScreen
                  title="Club Location"
                />
              </div>
            </div>
          </section>
        )}

        {/* Footer */}
        <footer className="bg-gray-900 text-white py-12 px-4">
          <div className="max-w-7xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-8">
              <div>
                <h3 className="text-lg font-bold mb-4">{club.name}</h3>
                <p className="text-gray-400 text-sm mb-4 line-clamp-3">
                  {club.club_introduction || club.description}
                </p>
                <a
                  href="https://alfiepro.com.au"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded transition-colors text-sm"
                >
                  Become a Member
                </a>
              </div>

              <div>
                <h3 className="text-lg font-bold mb-4">Quick Links</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  <li><a href="https://alfiepro.com.au/register" target="_blank" rel="noopener noreferrer" className="hover:text-white transition-colors">Membership</a></li>
                  <li><Link to={buildPublicUrl('/race-calendar')} className="hover:text-white transition-colors">Racing</Link></li>
                  <li><Link to={buildPublicUrl('/news')} className="hover:text-white transition-colors">News</Link></li>
                  <li><Link to={buildPublicUrl('/contact')} className="hover:text-white transition-colors">Contact</Link></li>
                </ul>
              </div>

              <div>
                <h3 className="text-lg font-bold mb-4">Contact</h3>
                <ul className="space-y-2 text-gray-400 text-sm">
                  {defaultVenueAddress && (
                    <li className="flex items-start gap-2">
                      <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      <span>{defaultVenueAddress}</span>
                    </li>
                  )}
                  {club.contact_email && (
                    <li>
                      <a href={`mailto:${club.contact_email}`} className="hover:text-white transition-colors">
                        {club.contact_email}
                      </a>
                    </li>
                  )}
                  {club.contact_phone && (
                    <li>
                      <a href={`tel:${club.contact_phone}`} className="hover:text-white transition-colors">
                        {club.contact_phone}
                      </a>
                    </li>
                  )}
                </ul>
              </div>
            </div>

            <div className="pt-8 border-t border-gray-800 text-center text-gray-400 text-xs">
              <p>
                © {new Date().getFullYear()} {club.name}. All rights reserved. Powered by AlfiePRO
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};
