import React, { useState, useEffect } from 'react';
import { Sailboat, Check } from 'lucide-react';
import { BoatClass } from '../../../types/boatClass';
import { getBoatClasses } from '../../../utils/boatClassStorage';
import { StepProps } from './types';

export const YachtClassesStep: React.FC<StepProps> = ({
  formData,
  updateFormData,
  darkMode
}) => {
  const [allClasses, setAllClasses] = useState<BoatClass[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchClasses();
  }, []);

  const fetchClasses = async () => {
    try {
      setLoading(true);
      const classes = await getBoatClasses();
      setAllClasses(classes);
    } catch (error) {
      console.error('Error fetching yacht classes:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleClass = (classId: string) => {
    const current = formData.selectedBoatClassIds || [];
    const isSelected = current.includes(classId);
    if (isSelected) {
      updateFormData({ selectedBoatClassIds: current.filter(id => id !== classId) });
    } else {
      updateFormData({ selectedBoatClassIds: [...current, classId] });
    }
  };

  const selectedSet = new Set(formData.selectedBoatClassIds || []);

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-sky-500/20' : 'bg-sky-50'
        }`}>
          <Sailboat className="text-sky-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Yacht Classes
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Select the yacht classes sailed at this club
        </p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-sky-500"></div>
        </div>
      ) : allClasses.length === 0 ? (
        <div className={`text-center py-12 rounded-xl border ${
          darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'
        }`}>
          <Sailboat size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
          <p className={`font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
            No yacht classes available yet
          </p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            You can add yacht classes later from the club settings
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {allClasses.map(boatClass => {
              const isSelected = selectedSet.has(boatClass.id);
              return (
                <button
                  key={boatClass.id}
                  type="button"
                  onClick={() => toggleClass(boatClass.id)}
                  className={`relative rounded-xl overflow-hidden transition-all duration-200 text-left ${
                    isSelected
                      ? darkMode
                        ? 'ring-2 ring-sky-500 shadow-lg shadow-sky-500/20'
                        : 'ring-2 ring-sky-500 shadow-lg shadow-sky-500/20'
                      : darkMode
                        ? 'border-2 border-slate-600/50 hover:border-slate-500'
                        : 'border-2 border-slate-200 hover:border-slate-300'
                  }`}
                >
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
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                    {isSelected && (
                      <div className="absolute top-2 right-2 p-2 bg-sky-500 rounded-full shadow-lg">
                        <Check size={16} className="text-white" />
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 p-3">
                      <h4 className="text-lg font-bold text-white drop-shadow-lg">
                        {boatClass.name}
                      </h4>
                    </div>
                  </div>
                  {boatClass.description && (
                    <div className={`p-3 ${
                      isSelected
                        ? darkMode ? 'bg-sky-500/10' : 'bg-sky-50'
                        : darkMode ? 'bg-slate-800' : 'bg-white'
                    }`}>
                      <p className={`text-xs line-clamp-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        {boatClass.description}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedSet.size > 0 && (
            <div className={`p-4 rounded-xl ${
              darkMode ? 'bg-sky-900/20 border border-sky-800' : 'bg-sky-50 border border-sky-200'
            }`}>
              <p className={`text-sm font-medium ${darkMode ? 'text-sky-300' : 'text-sky-800'}`}>
                {selectedSet.size} {selectedSet.size === 1 ? 'class' : 'classes'} selected
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
};
