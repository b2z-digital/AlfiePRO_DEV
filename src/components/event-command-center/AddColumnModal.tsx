import React, { useState } from 'react';
import { X, Columns } from 'lucide-react';

interface AddColumnModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, color: string) => void;
  darkMode: boolean;
}

export const AddColumnModal: React.FC<AddColumnModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  darkMode,
}) => {
  const [columnName, setColumnName] = useState('');
  const [selectedColor, setSelectedColor] = useState('#3B82F6');

  const colors = [
    { name: 'Blue', value: '#3B82F6' },
    { name: 'Purple', value: '#8B5CF6' },
    { name: 'Green', value: '#10B981' },
    { name: 'Orange', value: '#F59E0B' },
    { name: 'Red', value: '#EF4444' },
    { name: 'Pink', value: '#EC4899' },
    { name: 'Teal', value: '#14B8A6' },
    { name: 'Gray', value: '#6B7280' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (columnName.trim()) {
      onSubmit(columnName.trim(), selectedColor);
      setColumnName('');
      setSelectedColor('#3B82F6');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`
          w-full max-w-md rounded-xl shadow-2xl
          ${darkMode ? 'bg-gray-800' : 'bg-white'}
        `}
      >
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Columns className="w-5 h-5 text-white" />
            </div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Add Status Column
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Column Name
            </label>
            <input
              type="text"
              value={columnName}
              onChange={(e) => setColumnName(e.target.value)}
              placeholder="e.g., To Do, In Progress, Done"
              autoFocus
              className={`
                w-full px-4 py-2 rounded-lg border
                ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Column Color
            </label>
            <div className="grid grid-cols-4 gap-3">
              {colors.map((color) => (
                <button
                  key={color.value}
                  type="button"
                  onClick={() => setSelectedColor(color.value)}
                  className={`
                    relative w-full aspect-square rounded-lg transition-all
                    ${selectedColor === color.value ? 'ring-2 ring-offset-2 ring-blue-500 scale-110' : 'hover:scale-105'}
                  `}
                  style={{ backgroundColor: color.value }}
                  title={color.name}
                >
                  {selectedColor === color.value && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-white/90 flex items-center justify-center">
                        <svg className="w-4 h-4 text-gray-900" fill="currentColor" viewBox="0 0 20 20">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!columnName.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Add Column
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
