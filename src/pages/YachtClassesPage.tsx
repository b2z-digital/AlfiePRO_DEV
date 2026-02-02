import React, { useState, useEffect } from 'react';
import { Sailboat, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { BoatClass } from '../types/boatClass';
import { getClubBoatClasses, getBoatClasses } from '../utils/boatClassStorage';
import Lightbox from 'yet-another-react-lightbox';
import 'yet-another-react-lightbox/styles.css';

interface YachtClassesPageProps {
  darkMode: boolean;
}

export const YachtClassesPage: React.FC<YachtClassesPageProps> = ({ darkMode }) => {
  const { currentClub, currentOrganization } = useAuth();
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedClass, setSelectedClass] = useState<BoatClass | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    fetchBoatClasses();
  }, [currentClub, currentOrganization]);

  const fetchBoatClasses = async () => {
    try {
      setLoading(true);
      let data: BoatClass[];

      if (currentOrganization) {
        // For associations, show all boat classes
        data = await getBoatClasses();
      } else if (currentClub) {
        // For clubs, show only classes assigned to this club
        data = await getClubBoatClasses(currentClub.clubId);
      } else {
        data = [];
      }

      setBoatClasses(data);
    } catch (error) {
      console.error('Error fetching boat classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const openLightbox = (boatClass: BoatClass, index: number = 0) => {
    setSelectedClass(boatClass);
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  const getLightboxSlides = () => {
    if (!selectedClass) return [];

    const images = selectedClass.gallery_images || [];
    if (selectedClass.class_image && !images.includes(selectedClass.class_image)) {
      return [selectedClass.class_image, ...images].map(src => ({ src }));
    }
    return images.map(src => ({ src }));
  };

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-16">
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-16">
        {/* Header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500 to-purple-600">
            <Sailboat className="text-white" size={28} />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-white">Yacht Classes</h1>
            <p className="text-slate-400">
              {currentOrganization
                ? 'Explore all yacht classes in the system'
                : 'Explore the different classes sailed at our club'
              }
            </p>
          </div>
        </div>

        {/* Classes Grid */}
        {boatClasses.length === 0 ? (
          <div className="text-center py-20">
            <div className="inline-flex p-6 rounded-full bg-slate-800 mb-6">
              <Sailboat size={48} className="text-slate-500" />
            </div>
            <p className="text-xl text-slate-400 mb-2">No yacht classes yet</p>
            <p className="text-slate-500">Contact your club administrator to add yacht classes.</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {boatClasses.map(boatClass => (
            <button
              key={boatClass.id}
              onClick={() => setSelectedClass(boatClass)}
              className="group relative rounded-2xl overflow-hidden transition-all duration-500 transform hover:-translate-y-2 hover:shadow-2xl text-left w-full bg-slate-800/80 border border-slate-700 hover:border-blue-500/30"
            >
                {/* Image Section */}
                <div className="relative h-64 overflow-hidden">
                  {boatClass.class_image ? (
                    <img
                      src={boatClass.class_image}
                      alt={boatClass.name}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                      <Sailboat size={64} className="text-slate-500" />
                    </div>
                  )}

                  {/* Gradient Overlay */}
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent opacity-80" />

                  {/* Title Overlay */}
                  <div className="absolute bottom-0 left-0 right-0 p-6">
                    <h3 className="text-2xl font-bold text-white drop-shadow-lg">
                      {boatClass.name}
                    </h3>
                  </div>
                </div>

              {/* Content Section */}
              {boatClass.description && (
                <div className="p-5">
                  <p className="text-sm line-clamp-3 leading-relaxed text-slate-400">
                    {boatClass.description}
                  </p>
                </div>
              )}
            </button>
          ))}
        </div>
      )}

      {/* Detail Modal */}
      {selectedClass && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedClass(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto bg-slate-800/80 backdrop-blur-sm border border-slate-700"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Image */}
            <div className="relative h-96">
              {selectedClass.class_image ? (
                <img
                  src={selectedClass.class_image}
                  alt={selectedClass.name}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => selectedClass.class_image && openLightbox(selectedClass, 0)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-gradient-to-br from-slate-700 to-slate-800">
                  <Sailboat size={96} className="text-slate-500" />
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={() => setSelectedClass(null)}
                className="absolute top-4 right-4 p-3 bg-black/50 backdrop-blur-md text-white rounded-full hover:bg-black/70 transition-colors"
              >
                <X size={24} />
              </button>

              {/* Title Overlay */}
              <div className="absolute bottom-0 left-0 right-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent">
                <h2 className="text-4xl font-bold text-white drop-shadow-lg">
                  {selectedClass.name}
                </h2>
              </div>
            </div>

            {/* Content */}
            <div className="p-8">
              {/* Description */}
              {selectedClass.description && (
                <div className="mb-8">
                  <h3 className="text-xl font-bold mb-4 text-white">
                    About this Class
                  </h3>
                  <p className="text-base leading-relaxed whitespace-pre-wrap text-slate-300">
                    {selectedClass.description}
                  </p>
                </div>
              )}

              {/* Gallery */}
              {selectedClass.gallery_images && selectedClass.gallery_images.length > 0 && (
                <div>
                  <h3 className="text-xl font-bold mb-4 text-white">
                    Gallery
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {selectedClass.gallery_images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => openLightbox(selectedClass, index + (selectedClass.class_image ? 1 : 0))}
                        className="relative aspect-video rounded-lg overflow-hidden group cursor-pointer"
                      >
                        <img
                          src={image}
                          alt={`${selectedClass.name} ${index + 1}`}
                          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
                        />
                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors duration-300" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Lightbox */}
      {lightboxOpen && (
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          slides={getLightboxSlides()}
          index={lightboxIndex}
          styles={{
            container: { backgroundColor: 'rgba(0, 0, 0, 0.95)' }
          }}
        />
      )}
      </div>
    </div>
  );
};
