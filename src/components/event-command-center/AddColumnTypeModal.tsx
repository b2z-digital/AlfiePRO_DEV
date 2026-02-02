import React, { useState } from 'react';
import { X, Search, CheckSquare, Type, User, Calendar, Hash, ChevronDown, FileText, Clock } from 'lucide-react';

interface AddColumnTypeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, type: string, settings: any) => void;
  darkMode: boolean;
}

const columnTypes = [
  {
    id: 'status',
    name: 'Status',
    icon: CheckSquare,
    color: '#10B981',
    category: 'Essentials',
    description: 'Track progress with colored labels',
    defaultSettings: {
      status_options: [
        { id: '1', label: 'Not Started', color: '#9CA3AF' },
        { id: '2', label: 'In Progress', color: '#F59E0B' },
        { id: '3', label: 'Done', color: '#10B981' },
      ],
    },
  },
  {
    id: 'text',
    name: 'Text',
    icon: Type,
    color: '#F59E0B',
    category: 'Essentials',
    description: 'Add any type of text',
  },
  {
    id: 'person',
    name: 'Person',
    icon: User,
    color: '#3B82F6',
    category: 'Essentials',
    description: 'Assign tasks to people',
  },
  {
    id: 'date',
    name: 'Date',
    icon: Calendar,
    color: '#8B5CF6',
    category: 'Essentials',
    description: 'Add dates and deadlines',
  },
  {
    id: 'number',
    name: 'Numbers',
    icon: Hash,
    color: '#14B8A6',
    category: 'Essentials',
    description: 'Add numeric values',
  },
  {
    id: 'dropdown',
    name: 'Dropdown',
    icon: ChevronDown,
    color: '#10B981',
    category: 'Super useful',
    description: 'Select from predefined options',
  },
  {
    id: 'checkbox',
    name: 'Checkbox',
    icon: CheckSquare,
    color: '#EF4444',
    category: 'Super useful',
    description: 'Simple yes/no checkbox',
  },
  {
    id: 'timeline',
    name: 'Timeline',
    icon: Clock,
    color: '#EC4899',
    category: 'Super useful',
    description: 'Date range for planning',
  },
  {
    id: 'files',
    name: 'Files',
    icon: FileText,
    color: '#6366F1',
    category: 'Super useful',
    description: 'Attach files and documents',
  },
];

export const AddColumnTypeModal: React.FC<AddColumnTypeModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  darkMode,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [columnName, setColumnName] = useState('');

  const filteredTypes = columnTypes.filter((type) =>
    type.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    type.description.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const essentials = filteredTypes.filter((t) => t.category === 'Essentials');
  const superUseful = filteredTypes.filter((t) => t.category === 'Super useful');

  const handleSubmit = () => {
    if (!selectedType || !columnName.trim()) return;

    const type = columnTypes.find((t) => t.id === selectedType);
    onSubmit(columnName.trim(), selectedType, type?.defaultSettings || {});

    // Reset
    setColumnName('');
    setSelectedType(null);
    setSearchTerm('');
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`
          w-full max-w-2xl rounded-xl shadow-2xl max-h-[90vh] flex flex-col
          ${darkMode ? 'bg-gray-800' : 'bg-white'}
        `}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
            Pick a column type
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search */}
        <div className="p-6 pb-4">
          <div className="relative">
            <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${darkMode ? 'text-gray-500' : 'text-gray-400'}`} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search or describe your column"
              autoFocus
              className={`
                w-full pl-12 pr-4 py-3 rounded-lg border text-base
                ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>
        </div>

        {/* Column Types */}
        <div className="flex-1 overflow-y-auto p-6 pt-0">
          {/* Essentials */}
          <div className="mb-6">
            <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Essentials
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {essentials.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`
                      flex items-start gap-3 p-4 rounded-lg text-left transition-all
                      ${
                        selectedType === type.id
                          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : darkMode
                          ? 'bg-gray-700 hover:bg-gray-600'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }
                    `}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${type.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: type.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {type.name}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {type.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Super Useful */}
          <div>
            <h3 className={`text-sm font-semibold mb-3 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              Super useful
            </h3>
            <div className="grid grid-cols-2 gap-3">
              {superUseful.map((type) => {
                const Icon = type.icon;
                return (
                  <button
                    key={type.id}
                    onClick={() => setSelectedType(type.id)}
                    className={`
                      flex items-start gap-3 p-4 rounded-lg text-left transition-all
                      ${
                        selectedType === type.id
                          ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : darkMode
                          ? 'bg-gray-700 hover:bg-gray-600'
                          : 'bg-gray-50 hover:bg-gray-100'
                      }
                    `}
                  >
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ backgroundColor: `${type.color}20` }}
                    >
                      <Icon className="w-5 h-5" style={{ color: type.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`font-semibold text-sm mb-1 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                        {type.name}
                      </div>
                      <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {type.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Footer - Column Name Input */}
        {selectedType && (
          <div className={`p-6 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Column Name
            </label>
            <div className="flex gap-3">
              <input
                type="text"
                value={columnName}
                onChange={(e) => setColumnName(e.target.value)}
                placeholder={`e.g., ${columnTypes.find((t) => t.id === selectedType)?.name}`}
                className={`
                  flex-1 px-4 py-2 rounded-lg border
                  ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
                  focus:outline-none focus:ring-2 focus:ring-blue-500
                `}
              />
              <button
                onClick={handleSubmit}
                disabled={!columnName.trim()}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Add Column
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
