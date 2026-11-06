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
        // Standalone race officers: show all active boat classes
        data = await getBoatClasses();
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
      <div className="flex flex-col gap-[22px] p-4 sm:p-6 lg:pt-9 lg:pr-12 lg:pb-24 lg:pl-9">
        {/* Header */}
        <div className="flex items-center gap-4">
          <span className="a-tile a-tile-rim" style={{ width: 52, height: 52 }}><Sailboat size={24} /></span>
          <div>
            <h1 className="a-display a-ink m-0 text-[30px] font-bold leading-[1.1]">Yacht Classes</h1>
            <p className="a-mute mt-1 text-[14.5px]">
              {currentOrganization
                ? 'Explore all yacht classes in the system'
                : 'Explore the different classes sailed at our club'
              }
            </p>
          </div>
        </div>

        {/* Classes Grid */}
        {boatClasses.length === 0 ? (
          <div className="a-card a-empty text-center py-20">
            <span className="a-tile mx-auto" style={{ width: 48, height: 48 }}><Sailboat size={22} /></span>
            <p className="a-ink text-[16px] font-semibold mt-2">No yacht classes yet</p>
            <p className="a-dim text-[13.5px]">{currentClub ? 'Contact your club administrator to add yacht classes.' : 'No yacht classes have been added to the system yet.'}</p>
          </div>
        ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {boatClasses.map(boatClass => {
            const photos = (boatClass.gallery_images || []).length + (boatClass.class_image && !(boatClass.gallery_images || []).includes(boatClass.class_image) ? 1 : 0);
            return (
            <button
              key={boatClass.id}
              onClick={() => setSelectedClass(boatClass)}
              className="a-cc text-left w-full"
            >
              <div className="a-cc-img">
                {boatClass.class_image ? (
                  <img src={boatClass.class_image} alt={boatClass.name} />
                ) : (
                  <div className="w-full h-full flex items-center justify-center"><Sailboat size={48} className="a-dim" /></div>
                )}
                {photos > 1 && <span className="a-glass absolute left-3.5 top-3.5 z-[1]">{photos} photos</span>}
              </div>
              <div className="flex flex-col gap-2" style={{ padding: '16px 18px 18px' }}>
                <div className="a-display a-ink text-[19px] font-semibold">{boatClass.name}</div>
                {boatClass.description && (
                  <p className="a-mute text-[13px] leading-[1.5] line-clamp-2">
                    {boatClass.description}
                  </p>
                )}
                <span className="a-txt-b inline-flex items-center gap-1.5 mt-1 text-[13px] font-semibold">Learn more<ChevronRight size={15} /></span>
              </div>
            </button>
            );
          })}
        </div>
      )}

      {/* Detail Modal */}
      {selectedClass && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedClass(null)}
        >
          <div
            className="a-sheet w-full max-w-[640px] max-h-[90vh] overflow-y-auto overflow-x-hidden"
            onClick={e => e.stopPropagation()}
          >
            {/* Header Image */}
            <div className="a-sheet-hero relative" style={{ height: 250 }}>
              {selectedClass.class_image ? (
                <img
                  src={selectedClass.class_image}
                  alt={selectedClass.name}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => selectedClass.class_image && openLightbox(selectedClass, 0)}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Sailboat size={64} className="a-dim" />
                </div>
              )}

              {/* Close Button */}
              <button
                onClick={() => setSelectedClass(null)}
                className="a-gb absolute top-3.5 right-3.5 z-[2]"
                style={{ width: 38, height: 38 }}
                aria-label="Close"
              >
                <X size={18} />
              </button>

              {/* Title Overlay */}
              <div className="absolute left-6 bottom-[18px] right-6 z-[1] pointer-events-none">
                <span className="a-glass"><Sailboat size={13} />Yacht class</span>
                <h2 className="a-display a-ink text-[30px] font-bold mt-2.5">
                  {selectedClass.name}
                </h2>
              </div>
            </div>

            {/* Content */}
            <div style={{ padding: '6px 24px 24px' }}>
              {/* Description */}
              {selectedClass.description && (
                <div className="mb-6">
                  <p className="text-[14px] leading-[1.6] whitespace-pre-wrap a-mute">
                    {selectedClass.description}
                  </p>
                </div>
              )}

              {/* Gallery */}
              {selectedClass.gallery_images && selectedClass.gallery_images.length > 0 && (
                <div>
                  <p className="a-cap mb-2.5">Gallery</p>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2.5">
                    {selectedClass.gallery_images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => openLightbox(selectedClass, index + (selectedClass.class_image ? 1 : 0))}
                        className="relative aspect-video rounded-[14px] overflow-hidden group cursor-pointer"
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
