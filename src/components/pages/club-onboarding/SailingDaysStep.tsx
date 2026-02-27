import React, { useState, useEffect } from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { StepProps, SailingDayEntry } from './types';
import { supabase } from '../../../utils/supabase';

interface BoatClass {
  id: string;
  name: string;
}

export const SailingDaysStep: React.FC<StepProps> = ({ formData, updateFormData, darkMode }) => {
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);

  useEffect(() => {
    if (formData.selectedBoatClassIds.length > 0) {
      loadBoatClasses();
    }
  }, [formData.selectedBoatClassIds]);

  const loadBoatClasses = async () => {
    try {
      const { data, error } = await supabase
        .from('boat_classes')
        .select('id, name')
        .in('id', formData.selectedBoatClassIds);

      if (error) throw error;
      setBoatClasses(data || []);
    } catch (err) {
      console.error('Error loading boat classes:', err);
    }
  };

  const addSailingDay = () => {
    const newDay: SailingDayEntry = {
      day_of_week: 'Saturday',
      start_time: '12:00',
      end_time: '16:00',
      boat_class_id: null,
      description: '',
      is_active: true
    };
    updateFormData({
      sailingDays: [...formData.sailingDays, newDay]
    });
  };

  const updateSailingDay = (index: number, field: keyof SailingDayEntry, value: any) => {
    const updated = [...formData.sailingDays];
    updated[index] = { ...updated[index], [field]: value };
    updateFormData({ sailingDays: updated });
  };

  const removeSailingDay = (index: number) => {
    updateFormData({
      sailingDays: formData.sailingDays.filter((_, i) => i !== index)
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Define your regular sailing schedule (optional)
          </p>
        </div>
        <button
          type="button"
          onClick={addSailingDay}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
        >
          <Plus size={18} />
          Add Sailing Day
        </button>
      </div>

      {formData.sailingDays.length === 0 ? (
        <div className={`p-8 text-center rounded-lg border-2 border-dashed ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-300 bg-slate-50'}`}>
          <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
            No sailing days defined yet. Click "Add Sailing Day" to get started.
          </p>
          <p className={`text-sm mt-2 ${darkMode ? 'text-slate-500' : 'text-slate-500'}`}>
            This step is optional and can be configured later in your club settings.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {formData.sailingDays.map((day, index) => (
            <div
              key={index}
              className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'}`}
            >
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                {/* Day of Week */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Day
                  </label>
                  <select
                    value={day.day_of_week}
                    onChange={(e) => updateSailingDay(index, 'day_of_week', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="Monday">Monday</option>
                    <option value="Tuesday">Tuesday</option>
                    <option value="Wednesday">Wednesday</option>
                    <option value="Thursday">Thursday</option>
                    <option value="Friday">Friday</option>
                    <option value="Saturday">Saturday</option>
                    <option value="Sunday">Sunday</option>
                  </select>
                </div>

                {/* Start Time */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Start Time
                  </label>
                  <input
                    type="time"
                    value={day.start_time}
                    onChange={(e) => updateSailingDay(index, 'start_time', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                {/* End Time */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    End Time
                  </label>
                  <input
                    type="time"
                    value={day.end_time}
                    onChange={(e) => updateSailingDay(index, 'end_time', e.target.value)}
                    className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  />
                </div>

                {/* Boat Class */}
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Boat Class
                  </label>
                  <select
                    value={day.boat_class_id || ''}
                    onChange={(e) => updateSailingDay(index, 'boat_class_id', e.target.value || null)}
                    className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                  >
                    <option value="">All Classes</option>
                    {boatClasses.map((boatClass) => (
                      <option key={boatClass.id} value={boatClass.id}>
                        {boatClass.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Description */}
              <div className="mt-4">
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Description (Optional)
                </label>
                <input
                  type="text"
                  value={day.description || ''}
                  onChange={(e) => updateSailingDay(index, 'description', e.target.value)}
                  placeholder="e.g., Club Championship Series"
                  className={`w-full px-3 py-2 rounded-lg border ${darkMode ? 'bg-slate-800 border-slate-600 text-white placeholder-slate-400' : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'} focus:outline-none focus:ring-2 focus:ring-blue-500`}
                />
              </div>

              {/* Remove Button */}
              <div className="flex justify-end mt-4">
                <button
                  type="button"
                  onClick={() => removeSailingDay(index)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors text-sm"
                >
                  <Trash2 size={16} />
                  Remove
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
