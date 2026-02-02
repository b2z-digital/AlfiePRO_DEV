import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Menu, X, MapPin, ChevronLeft, ChevronRight, Calendar, Clock, Award, Building2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { formatDate } from '../../utils/date';

interface StateAssociation {
  id: string;
  name: string;
  state: string;
  logo_url: string | null;
  cover_image_url: string | null;
  email: string | null;
  website: string | null;
}

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
  event_name: string;
  date: string;
  venue: string;
  race_class: string;
}

const DEFAULT_TILES = [
  {
    id: 'default-1',
    title: 'Member Clubs',
    description: 'View all clubs affiliated with our association',
    image_url: 'https://images.unsplash.com/photo-1511367461989-f85a21fda167?w=800&h=600&fit=crop',
    link_url: '#clubs'
  },
  {
    id: 'default-2',
    title: 'State Championships',
    description: 'View our championship events and schedule',
    image_url: 'https://images.unsplash.com/photo-1473580044384-7ba9967e16a0?w=800&h=600&fit=crop',
    link_url: '#events'
  },
  {
    id: 'default-3',
    title: 'Yacht Classes',
    description: 'Explore the yacht classes in our state',
    image_url: 'https://images.unsplash.com/photo-1544551763-46a013bb70d5?w=800&h=600&fit=crop',
    link_url: '#classes'
  },
  {
    id: 'default-4',
    title: 'News',
    description: 'Stay up to date with association news',
    image_url: 'https://images.unsplash.com/photo-1504711434969-e33886168f5c?w=800&h=600&fit=crop',
    link_url: '#news'
  }
];

const getAssociationInitials = (name: string): string => {
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 6);
};

export const PublicStateAssociationHomepage: React.FC = () => {
  const { associationId } = useParams<{ associationId: string }>();
  const [association, setAssociation] = useState<StateAssociation | null>(null);
  const [slides, setSlides] = useState<HomepageSlide[]>([]);
  const [tiles, setTiles] = useState<HomepageTile[]>([]);
  const [newsArticles, setNewsArticles] = useState<NewsArticle[]>([]);
  const [upcomingEvents, setUpcomingEvents] = useState<UpcomingEvent[]>([]);
  const [clubs, setClubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [currentSlide, setCurrentSlide] = useState(0);

  useEffect(() => {
    loadAssociationData();
  }, [associationId]);

  useEffect(() => {
    if (slides.length <= 1) return;

    const timer = setInterval(() => {
      setCurrentSlide((prev) => (prev + 1) % slides.length);
    }, 5000);

    return () => clearInterval(timer);
  }, [slides.length]);

  const loadAssociationData = async () => {
    if (!associationId) return;

    try {
      setLoading(true);

      const { data: associationData, error: associationError } = await supabase
        .from('state_associations')
        .select('*')
        .eq('id', associationId)
        .maybeSingle();

      if (associationError) throw associationError;
      if (associationData) {
        setAssociation(associationData as StateAssociation);
      }

      // Load homepage slides
      const { data: slidesData, error: slidesError } = await supabase
        .from('homepage_slides')
        .select('*')
        .eq('state_association_id', associationId)
        .eq('is_active', true)
        .order('display_order');

      if (slidesError) throw slidesError;

      if (!slidesData || slidesData.length === 0) {
        if (associationData?.cover_image_url) {
          setSlides([{
            id: 'default',
            title: '',
            subtitle: '',
            image_url: associationData.cover_image_url,
            button_text: '',
            button_url: '',
            display_order: 0
          }]);
        }
      } else {
        setSlides(slidesData);
      }

      // Load homepage tiles
      const { data: tilesData, error: tilesError } = await supabase
        .from('homepage_tiles')
        .select('*')
        .eq('state_association_id', associationId)
        .eq('is_active', true)
        .order('display_order');

      if (tilesError) throw tilesError;
      setTiles(tilesData && tilesData.length > 0 ? tilesData.slice(0, 6) : DEFAULT_TILES);

      const { data: articlesData, error: articlesError } = await supabase
        .from('articles')
        .select('id, title, excerpt, cover_image, published_at')
        .eq('state_association_id', associationId)
        .eq('published', true)
        .order('published_at', { ascending: false })
        .limit(3);

      if (articlesError) throw articlesError;
      setNewsArticles(articlesData || []);

      const { data: eventsData, error: eventsError } = await supabase
        .from('public_events')
        .select('id, event_name, date, venue, race_class')
        .eq('state_association_id', associationId)
        .eq('approval_status', 'approved')
        .gte('date', new Date().toISOString().split('T')[0])
        .order('date')
        .limit(3);

      if (eventsError) throw eventsError;
      setUpcomingEvents(eventsData || []);

      const { data: clubsData, error: clubsError } = await supabase
        .from('clubs')
        .select('id, name, logo_url')
        .eq('state_association_id', associationId)
        .order('name')
        .limit(6);

      if (clubsError) throw clubsError;
      setClubs(clubsData || []);

    } catch (error) {
      console.error('Error loading state association data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (!association) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-white text-xl">State Association not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-white">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-900/95 backdrop-blur-sm border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-20">
            <div className="flex items-center gap-3">
              {association.logo_url ? (
                <img
                  src={association.logo_url}
                  alt={association.name}
                  className="w-12 h-12 object-contain rounded"
                />
              ) : (
                <div className="w-12 h-12 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold">
                  {getAssociationInitials(association.name)}
                </div>
              )}
              <div>
                <h1 className="text-xl font-bold">{association.name}</h1>
                <p className="text-sm text-slate-400">{association.state}</p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <a href="#home" className="text-slate-300 hover:text-white transition-colors">Home</a>
              <a href="#clubs" className="text-slate-300 hover:text-white transition-colors">Clubs</a>
              <a href="#events" className="text-slate-300 hover:text-white transition-colors">Events</a>
              <a href="#news" className="text-slate-300 hover:text-white transition-colors">News</a>
              <a href="#contact" className="text-slate-300 hover:text-white transition-colors">Contact</a>
            </nav>

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden p-2 text-slate-400 hover:text-white"
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-800 bg-slate-900">
            <nav className="flex flex-col p-4 space-y-2">
              <a href="#home" className="p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Home</a>
              <a href="#clubs" className="p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Clubs</a>
              <a href="#events" className="p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Events</a>
              <a href="#news" className="p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">News</a>
              <a href="#contact" className="p-3 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">Contact</a>
            </nav>
          </div>
        )}
      </header>

      {/* Hero Slider */}
      {slides.length > 0 && (
        <section id="home" className="relative h-[500px] overflow-hidden">
          {slides.map((slide, index) => (
            <div
              key={slide.id}
              className={`absolute inset-0 transition-opacity duration-1000 ${
                index === currentSlide ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: `url(${slide.image_url})` }}
              >
                <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/50 to-transparent" />
              </div>
              <div className="relative h-full flex items-center justify-center text-center px-4">
                <div className="max-w-3xl">
                  {slide.title && (
                    <h2 className="text-4xl md:text-6xl font-bold mb-4">{slide.title}</h2>
                  )}
                  {slide.subtitle && (
                    <p className="text-xl md:text-2xl text-slate-300 mb-8">{slide.subtitle}</p>
                  )}
                  {slide.button_text && slide.button_url && (
                    <a
                      href={slide.button_url}
                      className="inline-block px-8 py-3 bg-blue-600 hover:bg-blue-700 rounded-lg font-semibold transition-colors"
                    >
                      {slide.button_text}
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
          {slides.length > 1 && (
            <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex gap-2">
              {slides.map((_, index) => (
                <button
                  key={index}
                  onClick={() => setCurrentSlide(index)}
                  className={`w-3 h-3 rounded-full transition-all ${
                    index === currentSlide ? 'bg-white w-8' : 'bg-white/50'
                  }`}
                />
              ))}
            </div>
          )}
        </section>
      )}

      {/* Quick Links Tiles */}
      <section className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {tiles.map((tile) => (
              <a
                key={tile.id}
                href={tile.link_url}
                className="group relative overflow-hidden rounded-xl h-64 cursor-pointer"
              >
                <div
                  className="absolute inset-0 bg-cover bg-center transition-transform duration-300 group-hover:scale-110"
                  style={{ backgroundImage: `url(${tile.image_url})` }}
                >
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/80 to-transparent" />
                </div>
                <div className="relative h-full flex flex-col justify-end p-6">
                  <h3 className="text-2xl font-bold mb-2">{tile.title}</h3>
                  <p className="text-slate-300">{tile.description}</p>
                </div>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* Member Clubs Section */}
      {clubs.length > 0 && (
        <section id="clubs" className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Member Clubs</h2>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6">
              {clubs.map((club) => (
                <div
                  key={club.id}
                  className="bg-slate-800/80 rounded-lg p-4 flex flex-col items-center text-center hover:bg-slate-700/70 hover:shadow-lg hover:shadow-slate-900/30 transition-all border border-slate-700/50 backdrop-blur-sm"
                >
                  {club.logo_url ? (
                    <img
                      src={club.logo_url}
                      alt={club.name}
                      className="w-16 h-16 object-contain rounded mb-3"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-bold mb-3">
                      <Building2 size={32} />
                    </div>
                  )}
                  <h3 className="text-sm font-semibold">{club.name}</h3>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Upcoming Events Section */}
      {upcomingEvents.length > 0 && (
        <section id="events" className="py-16 px-4 sm:px-6 lg:px-8">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Upcoming Events</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {upcomingEvents.map((event) => (
                <div
                  key={event.id}
                  className="bg-slate-800/80 rounded-xl border border-slate-700 p-6 hover:border-blue-500/70 hover:shadow-xl hover:shadow-blue-500/10 transition-all backdrop-blur-sm"
                >
                  <div className="flex items-start gap-3 mb-4">
                    <div className="p-2 bg-blue-500/20 rounded-lg">
                      <Calendar className="text-blue-400" size={20} />
                    </div>
                    <div className="flex-1">
                      <h3 className="font-semibold mb-1">{event.event_name}</h3>
                      <p className="text-sm text-slate-400">{formatDate(event.date)}</p>
                    </div>
                  </div>
                  {event.venue && (
                    <div className="flex items-center gap-2 text-sm text-slate-400 mb-2">
                      <MapPin size={14} />
                      <span>{event.venue}</span>
                    </div>
                  )}
                  {event.race_class && (
                    <div className="inline-flex items-center px-2 py-1 rounded-md text-xs font-bold bg-gradient-to-r from-rose-500 to-pink-500 text-white">
                      {event.race_class}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* News Section */}
      {newsArticles.length > 0 && (
        <section id="news" className="py-16 px-4 sm:px-6 lg:px-8 bg-slate-800/30">
          <div className="max-w-7xl mx-auto">
            <h2 className="text-3xl font-bold mb-8">Latest News</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {newsArticles.map((article) => (
                <div
                  key={article.id}
                  className="bg-slate-800/80 rounded-xl overflow-hidden hover:transform hover:scale-105 hover:shadow-xl hover:shadow-slate-900/50 transition-all cursor-pointer border border-slate-700 backdrop-blur-sm"
                >
                  {article.cover_image && (
                    <div className="h-48 bg-slate-700">
                      <img
                        src={article.cover_image}
                        alt={article.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                  )}
                  <div className="p-6">
                    <h3 className="font-semibold mb-2 line-clamp-2">{article.title}</h3>
                    <p className="text-sm text-slate-400 mb-4 line-clamp-3">{article.excerpt}</p>
                    <div className="flex items-center gap-2 text-xs text-slate-500">
                      <Clock size={14} />
                      <span>{formatDate(article.published_at)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Contact Section */}
      <section id="contact" className="py-16 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-8">Contact Us</h2>
          <div className="bg-slate-800/80 rounded-xl border border-slate-700 p-8 backdrop-blur-sm shadow-lg">
            {association.email && (
              <div className="mb-4">
                <p className="text-slate-400 mb-2">Email</p>
                <a href={`mailto:${association.email}`} className="text-blue-400 hover:text-blue-300">
                  {association.email}
                </a>
              </div>
            )}
            {association.website && (
              <div>
                <p className="text-slate-400 mb-2">Website</p>
                <a
                  href={association.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-400 hover:text-blue-300"
                >
                  {association.website}
                </a>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-800 py-8 px-4">
        <div className="max-w-7xl mx-auto text-center text-slate-400">
          <p>&copy; {new Date().getFullYear()} {association.name}. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};
