import React, { useState, useEffect } from 'react';
import { Sailboat, Check } from 'lucide-react';
import { BoatClass } from '../types/boatClass';
import {
  getBoatClasses,
  getClubBoatClasses,
  addBoatClassToClub,
  removeBoatClassFromClub
} from '../utils/boatClassStorage';
import { useAuth } from '../contexts/AuthContext';
import { useNotifications } from '../contexts/NotificationContext';

interface ClubYachtClassesSelectorProps {
  darkMode: boolean;
}

export const ClubYachtClassesSelector: React.FC<ClubYachtClassesSelectorProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [allClasses, setAllClasses] = useState<BoatClass[]>([]);
  const [selectedClasses, setSelectedClasses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);

  useEffect(() => {
    if (currentClub) {
      fetchClasses();
    }
  }, [currentClub]);

  const fetchClasses = async () => {
    if (!currentClub) return;

    try {
      setLoading(true);
      const [all, clubClasses] = await Promise.all([
        getBoatClasses(),
        getClubBoatClasses(currentClub.clubId)
      ]);

      setAllClasses(all);
      setSelectedClasses(new Set(clubClasses.map(c => c.id)));
    } catch (error) {
      console.error('Error fetching yacht classes:', error);
      addNotification('error', 'Failed to load yacht classes');
    } finally {
      setLoading(false);
    }
  };

  const toggleClass = async (classId: string) => {
    if (!currentClub || toggling) return;

    try {
      setToggling(classId);
      const isSelected = selectedClasses.has(classId);

      if (isSelected) {
        await removeBoatClassFromClub(currentClub.clubId, classId);
        setSelectedClasses(prev => {
          const newSet = new Set(prev);
          newSet.delete(classId);
          return newSet;
        });
        addNotification('success', 'Class removed successfully');
      } else {
        await addBoatClassToClub(currentClub.clubId, classId);
        setSelectedClasses(prev => new Set([...prev, classId]));
        addNotification('success', 'Class added successfully');
      }
    } catch (error) {
      console.error('Error toggling yacht class:', error);
      addNotification('error', 'Failed to update yacht classes');
    } finally {
      setToggling(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (allClasses.length === 0) {
    return (
      <div className={`text-center py-12 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
        <Sailboat size={48} className="mx-auto mb-4 opacity-50" />
        <p>No yacht classes available yet.</p>
        <p className="text-sm mt-2">Contact your National or State Association to add classes.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h3 className={`text-xl font-bold mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
          Yacht Classes Sailed
        </h3>
        <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          Select the yacht classes sailed at your club. These will be displayed on your Yacht Classes page.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {allClasses.map(boatClass => {
          const isSelected = selectedClasses.has(boatClass.id);
          const isToggling = toggling === boatClass.id;

          return (
            <button
              key={boatClass.id}
              onClick={() => toggleClass(boatClass.id)}
              disabled={isToggling}
              className={`relative rounded-xl overflow-hidden transition-all duration-300 text-left ${
                isSelected
                  ? darkMode
                    ? 'bg-blue-600/20 border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                    : 'bg-blue-50 border-2 border-blue-500 shadow-lg shadow-blue-500/20'
                  : darkMode
                  ? 'bg-slate-800 border-2 border-slate-700 hover:border-slate-600'
                  : 'bg-white border-2 border-gray-200 hover:border-gray-300'
              } ${isToggling ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
            >
              {/* Image */}
              <div className="relative h-32 bg-gradient-to-br from-slate-700 to-slate-800">
                {boatClass.class_image ? (
                  <img
                    src={boatClass.class_image}
                    alt={boatClass.name}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <Sailboat size={40} className="text-slate-500" />
                  </div>
                )}

                {/* Gradient Overlay */}
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

                {/* Selected Badge */}
                {isSelected && (
                  <div className="absolute top-2 right-2 p-2 bg-blue-600 rounded-full shadow-lg">
                    <Check size={16} className="text-white" />
                  </div>
                )}

                {/* Title Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <h4 className="text-lg font-bold text-white drop-shadow-lg">
                    {boatClass.name}
                  </h4>
                </div>
              </div>

              {/* Description */}
              {boatClass.description && (
                <div className="p-3">
                  <p className={`text-xs line-clamp-2 ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    {boatClass.description}
                  </p>
                </div>
              )}
            </button>
          );
        })}
      </div>

      {selectedClasses.size > 0 && (
        <div className={`mt-6 p-4 rounded-lg ${
          darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'
        }`}>
          <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-800'}`}>
            {selectedClasses.size} {selectedClasses.size === 1 ? 'class' : 'classes'} selected
          </p>
        </div>
      )}
    </div>
  );
};
