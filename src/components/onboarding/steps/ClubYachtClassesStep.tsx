import React, { useState, useEffect } from 'react';
import { Sailboat, Check, ArrowRight, ArrowLeft } from 'lucide-react';
import { BoatClass } from '../../../types/boatClass';
import { getBoatClasses } from '../../../utils/boatClassStorage';

interface ClubYachtClassesStepProps {
  selectedIds: string[];
  onUpdate: (ids: string[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export const ClubYachtClassesStep: React.FC<ClubYachtClassesStepProps> = ({
  selectedIds,
  onUpdate,
  onNext,
  onBack,
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
    const isSelected = selectedIds.includes(classId);
    if (isSelected) {
      onUpdate(selectedIds.filter(id => id !== classId));
    } else {
      onUpdate([...selectedIds, classId]);
    }
  };

  const selectedSet = new Set(selectedIds);

  return (
    <div>
      <h2 className="text-2xl font-bold text-white mb-2">Yacht Classes</h2>
      <p className="text-slate-300 mb-6">
        Select the yacht classes sailed at your club. You can change these later in settings.
      </p>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-500"></div>
        </div>
      ) : allClasses.length === 0 ? (
        <div className="text-center py-12 rounded-xl border border-slate-700/50 bg-slate-800/50">
          <Sailboat size={48} className="mx-auto mb-4 text-slate-600" />
          <p className="font-medium text-slate-300">No yacht classes available yet</p>
          <p className="text-sm mt-2 text-slate-500">
            You can add yacht classes later from your club settings
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
                      ? 'ring-2 ring-green-500 shadow-lg shadow-green-500/20'
                      : 'border-2 border-slate-600/50 hover:border-slate-500'
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
                      <div className="absolute top-2 right-2 p-2 bg-green-500 rounded-full shadow-lg">
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
                      isSelected ? 'bg-green-500/10' : 'bg-slate-800'
                    }`}>
                      <p className="text-xs line-clamp-2 text-slate-400">
                        {boatClass.description}
                      </p>
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {selectedSet.size > 0 && (
            <div className="mt-6 p-4 rounded-xl bg-green-500/10 border border-green-500/30">
              <p className="text-sm font-medium text-green-400">
                {selectedSet.size} {selectedSet.size === 1 ? 'class' : 'classes'} selected
              </p>
            </div>
          )}
        </>
      )}

      <div className="flex justify-between mt-8">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-2 px-6 py-3 bg-slate-700/50 backdrop-blur-sm border border-slate-600/50 text-slate-300 rounded-xl font-semibold hover:bg-slate-700 hover:text-white transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={onNext}
          className="inline-flex items-center gap-2 px-8 py-4 bg-gradient-to-r from-green-500 to-green-600 text-white rounded-xl font-semibold hover:from-green-600 hover:to-green-700 transition-all transform hover:scale-105 shadow-lg"
        >
          Continue
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
