import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Menu, X, Sailboat } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Club } from '../../types/club';
import { BoatClass } from '../../types/boatClass';
import { usePublicNavigation } from '../../hooks/usePublicNavigation';
import { GoogleAnalytics } from '../GoogleAnalytics';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';

const getClubInitials = (clubName: string): string => {
  return clubName
    .split(' ')
    .map(word => word[0])
    .join('')
    .toUpperCase()
    .slice(0, 6);
};

export const PublicYachtClassesPage: React.FC = () => {
  const { clubId: paramClubId } = useParams<{ clubId: string }>();
  const { clubId: contextClubId } = usePublicNavigation();
  const clubId = contextClubId || paramClubId;
  const [club, setClub] = useState<Club | null>(null);
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);
  const [loading, setLoading] = useState(true);

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

        const { data: clubBoatClasses, error: classesError } = await supabase
          .from('club_boat_classes')
          .select(`
            boat_class_id,
            boat_classes (*)
          `)
          .eq('club_id', clubId);

        if (classesError) throw classesError;

        const classes = clubBoatClasses?.map(item => (item as any).boat_classes).filter(Boolean) || [];
        setBoatClasses(classes);
      }
    } catch (error) {
      console.error('Error loading club data:', error);
    } finally {
      setLoading(false);
    }
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
      <div className="min-h-screen flex items-center justify-center bg-white">
        <div className="text-gray-600">Club not found</div>
      </div>
    );
  }

  const clubInitials = getClubInitials(club.name);

  return (
    <div className="min-h-screen bg-white">
      <GoogleAnalytics measurementId={club?.google_analytics_id} />
      <PublicHeader club={club} activePage="yacht-classes" />

      {/* Main Content - Full Width Alternating Layout */}
      <div className="w-full pt-20">
        {/* Hero Section */}
        <div className="relative h-64 bg-gradient-to-br from-blue-900 to-blue-700">
          <div className="absolute inset-0 bg-black/30"></div>
          <div className="relative h-full flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-4xl md:text-5xl font-bold text-white mb-2 tracking-wider">YACHT CLASSES</h1>
              <p className="text-gray-200 text-lg">Explore our racing fleets</p>
            </div>
          </div>
        </div>

        {boatClasses.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 px-6">
            <Sailboat size={64} className="text-gray-300 mb-4" />
            <h2 className="text-2xl font-bold text-gray-900 mb-2">No Yacht Classes</h2>
            <p className="text-gray-600">This club hasn't configured their yacht classes yet.</p>
          </div>
        ) : (
          <>
            {boatClasses.map((boatClass, index) => {
              const isEven = index % 2 === 0;

              return (
                <div
                  key={boatClass.id}
                  className="grid grid-cols-1 lg:grid-cols-2 min-h-[600px]"
                >
                  {/* Image Column */}
                  <div
                    className={`relative ${isEven ? 'lg:order-1' : 'lg:order-2'}`}
                    style={{
                      backgroundImage: boatClass.class_image
                        ? `url(${boatClass.class_image})`
                        : 'none',
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                      backgroundColor: boatClass.class_image ? 'transparent' : '#e5e7eb'
                    }}
                  >
                    {!boatClass.class_image && (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <Sailboat size={80} className="text-gray-400 mx-auto mb-4" />
                          <span className="text-gray-500 text-2xl font-semibold">IMAGE</span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Content Column */}
                  <div
                    className={`flex items-center justify-center px-8 sm:px-12 lg:px-16 xl:px-24 py-16 ${
                      isEven ? 'lg:order-2' : 'lg:order-1'
                    }`}
                  >
                    <div className="max-w-xl">
                      <h2 className="text-4xl lg:text-5xl font-bold text-gray-900 mb-6">
                        {boatClass.name}
                      </h2>
                      <div className="text-lg text-gray-700 leading-relaxed whitespace-pre-wrap">
                        {boatClass.description || 'No description available for this yacht class.'}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <PublicFooter club={club} clubId={clubId} />
    </div>
  );
};
