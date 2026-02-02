import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Calendar, Trophy, ChevronDown, Menu, X, ArrowRight, Users, Award, BookOpen } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';

interface UpcomingEvent {
  id: string;
  event_name: string;
  date: string;
  venue: string;
  race_class: string;
}

interface LatestResult {
  id: string;
  event_name: string;
  date: string;
  winner?: string;
}

interface NewsArticle {
  id: string;
  title: string;
  excerpt: string;
  cover_image?: string;
  published_at: string;
}

export const PublicClubHomepage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const navigate = useNavigate();
  const [club, setClub] = useState<Club | null>(null);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [latestResults, setLatestResults] = useState<LatestResult[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    loadClubData();
  }, [clubId]);

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

      const today = new Date().toISOString();
      const { data: eventsData, error: eventsError } = await supabase
        .from('public_events')
        .select('id, event_name, date, venue, race_class')
        .eq('club_id', clubId)
        .gte('date', today)
        .order('date', { ascending: true })
        .limit(4);

      if (eventsError) throw eventsError;
      setUpcomingEvents(eventsData || []);

      const { data: resultsData, error: resultsError } = await supabase
        .from('public_events')
        .select('id, event_name, date')
        .eq('club_id', clubId)
        .lt('date', today)
        .order('date', { ascending: false })
        .limit(4);

      if (resultsError) throw resultsError;
      setLatestResults(resultsData || []);

      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('id, title, excerpt, cover_image, published_at')
        .eq('club_id', clubId)
        .eq('is_published', true)
        .order('published_at', { ascending: false })
        .limit(3);

      if (articlesError) throw articlesError;
      setNewsArticles(articlesData || []);

    } catch (error) {
      console.error('Error loading club data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleJoinClub = () => {
    navigate(`/club/${clubId}/join`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  if (!club) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Club not found</div>
      </div>
    );
  }

  const clubFeatures = [
    {
      title: 'Club Membership',
      description: 'Join our community of passionate sailors',
      icon: <Users size={40} />,
      link: `/club/${clubId}/public/membership`,
      image: club.featured_image_url || 'https://images.pexels.com/photos/1277355/pexels-photo-1277355.jpeg?auto=compress&cs=tinysrgb&w=800'
    },
    {
      title: 'Racing',
      description: 'Experience competitive sailing at its finest',
      icon: <Trophy size={40} />,
      link: `/club/${clubId}/public/racing`,
      image: 'https://images.pexels.com/photos/1295036/pexels-photo-1295036.jpeg?auto=compress&cs=tinysrgb&w=800'
    },
    {
      title: 'Events',
      description: 'View our calendar of upcoming events',
      icon: <Calendar size={40} />,
      link: `/club/${clubId}/public/events`,
      image: 'https://images.pexels.com/photos/256948/pexels-photo-256948.jpeg?auto=compress&cs=tinysrgb&w=800'
    },
    {
      title: 'Results',
      description: 'Latest race results and standings',
      icon: <Award size={40} />,
      link: `/club/${clubId}/public/results`,
      image: 'https://images.pexels.com/photos/2007401/pexels-photo-2007401.jpeg?auto=compress&cs=tinysrgb&w=800'
    },
    {
      title: 'Training',
      description: 'Develop your sailing skills with our programs',
      icon: <BookOpen size={40} />,
      link: `/club/${clubId}/public/training`,
      image: 'https://images.pexels.com/photos/163236/luxury-yacht-boat-speed-water-163236.jpeg?auto=compress&cs=tinysrgb&w=800'
    },
    {
      title: 'Club History',
      description: 'Learn about our heritage and traditions',
      icon: <BookOpen size={40} />,
      link: `/club/${clubId}/public/history`,
      image: 'https://images.pexels.com/photos/583848/pexels-photo-583848.jpeg?auto=compress&cs=tinysrgb&w=800'
    }
  ];

  return (
    <div className="min-h-screen bg-white">
      {/* Top Navigation Bar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex justify-between items-center h-24">
            {/* Club Logo */}
            <Link to={`/club/${clubId}/public`} className="flex items-center">
              {club.logo ? (
                <img src={club.logo} alt={club.name} className="h-16 w-auto object-contain max-w-[200px]" />
              ) : (
                <div className="h-16 w-16 bg-blue-900 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-2xl">
                    {club.abbreviation || club.name.substring(0, 2).toUpperCase()}
                  </span>
                </div>
              )}
            </Link>

            {/* Desktop Navigation */}
            <div className="hidden lg:flex items-center space-x-8">
              <Link to={`/club/${clubId}/public/membership`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                Membership
              </Link>
              <Link to={`/club/${clubId}/public/racing`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                Racing
              </Link>
              <Link to={`/club/${clubId}/public/events`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                Events
              </Link>
              <Link to={`/club/${clubId}/public/results`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                Results
              </Link>
              <Link to={`/club/${clubId}/public/news`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                News
              </Link>
              <Link to={`/club/${clubId}/public/contact`} className="text-gray-700 hover:text-blue-900 font-medium transition-colors">
                Contact
              </Link>
              <button
                onClick={handleJoinClub}
                className="bg-blue-900 text-white px-8 py-3 rounded hover:bg-blue-800 transition-colors font-semibold"
              >
                JOIN NOW
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="lg:hidden p-2 text-gray-700"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden border-t border-gray-200 bg-white">
            <div className="px-6 py-4 space-y-3">
              <Link to={`/club/${clubId}/public/membership`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                Membership
              </Link>
              <Link to={`/club/${clubId}/public/racing`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                Racing
              </Link>
              <Link to={`/club/${clubId}/public/events`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                Events
              </Link>
              <Link to={`/club/${clubId}/public/results`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                Results
              </Link>
              <Link to={`/club/${clubId}/public/news`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                News
              </Link>
              <Link to={`/club/${clubId}/public/contact`} className="block text-gray-700 hover:text-blue-900 font-medium py-2">
                Contact
              </Link>
              <button
                onClick={handleJoinClub}
                className="w-full bg-blue-900 text-white px-8 py-3 rounded hover:bg-blue-800 transition-colors font-semibold"
              >
                JOIN NOW
              </button>
            </div>
          </div>
        )}
      </nav>

      {/* Hero Section with Cover Image */}
      {club.cover_image_url && (
        <div className="relative w-full h-[600px] overflow-hidden">
          <img
            src={club.cover_image_url}
            alt={club.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-transparent"></div>
        </div>
      )}

      {/* Introduction Section */}
      <div className="bg-white py-20">
        <div className="max-w-5xl mx-auto px-6 text-center">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-8 leading-tight">
            {club.name}
          </h1>
          {club.club_introduction && (
            <p className="text-xl text-gray-700 leading-relaxed max-w-4xl mx-auto">
              {club.club_introduction}
            </p>
          )}
        </div>
      </div>

      {/* Club Features Grid - Image-Driven Sections */}
      <div className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {clubFeatures.map((feature, index) => (
              <Link
                key={index}
                to={feature.link}
                className="group relative overflow-hidden rounded-lg shadow-md hover:shadow-2xl transition-all duration-300"
              >
                <div className="relative h-80 overflow-hidden">
                  <img
                    src={feature.image}
                    alt={feature.title}
                    className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent"></div>
                  <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
                    <div className="mb-3 opacity-90">
                      {feature.icon}
                    </div>
                    <h3 className="text-2xl font-bold mb-2">{feature.title}</h3>
                    <p className="text-gray-200 text-sm mb-3">{feature.description}</p>
                    <div className="flex items-center text-sm font-semibold group-hover:translate-x-2 transition-transform">
                      Learn More <ArrowRight size={16} className="ml-2" />
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {/* Latest News Section */}
      {newsArticles.length > 0 && (
        <div className="bg-white py-20">
          <div className="max-w-7xl mx-auto px-6">
            <div className="text-center mb-12">
              <h2 className="text-4xl font-bold text-gray-900 mb-4">Latest News</h2>
              <p className="text-gray-600 text-lg">Stay updated with the latest from our club</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {newsArticles.map((article) => (
                <Link
                  key={article.id}
                  to={`/club/${clubId}/public/news/${article.id}`}
                  className="group bg-white rounded-lg overflow-hidden shadow-md hover:shadow-2xl transition-all duration-300"
                >
                  {article.cover_image && (
                    <div className="h-64 overflow-hidden">
                      <img
                        src={article.cover_image}
                        alt={article.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <div className="text-xs text-gray-500 mb-3 uppercase tracking-wide">
                      {new Date(article.published_at).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric'
                      })}
                    </div>
                    <h3 className="font-bold text-gray-900 text-xl mb-3 line-clamp-2 group-hover:text-blue-900 transition-colors">
                      {article.title}
                    </h3>
                    <p className="text-gray-600 text-sm leading-relaxed line-clamp-3 mb-4">
                      {article.excerpt}
                    </p>
                    <div className="flex items-center text-blue-900 font-semibold text-sm group-hover:translate-x-2 transition-transform">
                      Read More <ArrowRight size={16} className="ml-2" />
                    </div>
                  </div>
                </Link>
              ))}
            </div>
            <div className="text-center mt-12">
              <Link
                to={`/club/${clubId}/public/news`}
                className="inline-block bg-blue-900 text-white px-8 py-3 rounded hover:bg-blue-800 transition-colors font-semibold"
              >
                View All News
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Upcoming Events & Results Section */}
      <div className="bg-gray-50 py-20">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
            {/* Upcoming Events */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Upcoming Events</h2>
              <div className="space-y-4">
                {upcomingEvents.length > 0 ? (
                  upcomingEvents.map((event) => (
                    <Link
                      key={event.id}
                      to={`/club/${clubId}/public/event/${event.id}`}
                      className="block bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all group"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <h4 className="font-bold text-gray-900 text-lg group-hover:text-blue-900 transition-colors">
                          {event.event_name}
                        </h4>
                        <span className="text-xs font-semibold text-blue-900 bg-blue-50 px-3 py-1 rounded-full">
                          {event.race_class}
                        </span>
                      </div>
                      <div className="text-sm text-gray-600 space-y-1">
                        <div className="flex items-center">
                          <Calendar size={14} className="mr-2" />
                          {new Date(event.date).toLocaleDateString('en-AU', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric'
                          })}
                        </div>
                        <div className="text-gray-500">
                          {event.venue}
                        </div>
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500 bg-white rounded-lg">
                    No upcoming events scheduled
                  </div>
                )}
              </div>
              <div className="mt-6">
                <Link
                  to={`/club/${clubId}/public/events`}
                  className="inline-block text-blue-900 font-semibold hover:underline"
                >
                  View All Events →
                </Link>
              </div>
            </div>

            {/* Latest Results */}
            <div>
              <h2 className="text-3xl font-bold text-gray-900 mb-8">Latest Results</h2>
              <div className="space-y-4">
                {latestResults.length > 0 ? (
                  latestResults.map((result) => (
                    <Link
                      key={result.id}
                      to={`/club/${clubId}/public/result/${result.id}`}
                      className="block bg-white p-6 rounded-lg shadow hover:shadow-lg transition-all group"
                    >
                      <h4 className="font-bold text-gray-900 text-lg mb-2 group-hover:text-blue-900 transition-colors">
                        {result.event_name}
                      </h4>
                      <div className="flex items-center text-sm text-gray-600">
                        <Calendar size={14} className="mr-2" />
                        {new Date(result.date).toLocaleDateString('en-AU', {
                          day: 'numeric',
                          month: 'long',
                          year: 'numeric'
                        })}
                      </div>
                    </Link>
                  ))
                ) : (
                  <div className="text-center py-12 text-gray-500 bg-white rounded-lg">
                    No results available yet
                  </div>
                )}
              </div>
              <div className="mt-6">
                <Link
                  to={`/club/${clubId}/public/results`}
                  className="inline-block text-blue-900 font-semibold hover:underline"
                >
                  View All Results →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
            <div className="md:col-span-2">
              <h3 className="text-2xl font-bold mb-4">{club.name}</h3>
              <p className="text-gray-400 leading-relaxed mb-6">
                {club.club_introduction?.substring(0, 200)}...
              </p>
              <button
                onClick={handleJoinClub}
                className="bg-blue-600 text-white px-6 py-3 rounded hover:bg-blue-700 transition-colors font-semibold"
              >
                Become a Member
              </button>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Quick Links</h4>
              <ul className="space-y-2 text-gray-400">
                <li><Link to={`/club/${clubId}/public/membership`} className="hover:text-white transition-colors">Membership</Link></li>
                <li><Link to={`/club/${clubId}/public/racing`} className="hover:text-white transition-colors">Racing</Link></li>
                <li><Link to={`/club/${clubId}/public/events`} className="hover:text-white transition-colors">Events</Link></li>
                <li><Link to={`/club/${clubId}/public/results`} className="hover:text-white transition-colors">Results</Link></li>
                <li><Link to={`/club/${clubId}/public/news`} className="hover:text-white transition-colors">News</Link></li>
              </ul>
            </div>
            <div>
              <h4 className="font-bold text-lg mb-4">Contact</h4>
              <ul className="space-y-2 text-gray-400 text-sm">
                {club.committeePositions.slice(0, 2).map((position) => (
                  <li key={position.id}>
                    <div className="font-semibold text-white">{position.title}</div>
                    <div>{position.name}</div>
                    {position.email && <div>{position.email}</div>}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 pt-8 text-center text-sm text-gray-400">
            <p>&copy; {new Date().getFullYear()} {club.name}. All rights reserved. Powered by Alfie.</p>
          </div>
        </div>
      </footer>
    </div>
  );
};
