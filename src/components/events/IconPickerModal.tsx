import React, { useState, useMemo } from 'react';
import * as Icons from 'lucide-react';
import { X, Search } from 'lucide-react';

interface IconPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (iconName: string) => void;
  currentIcon?: string;
  darkMode?: boolean;
}

export const IconPickerModal: React.FC<IconPickerModalProps> = ({
  isOpen,
  onClose,
  onSelect,
  currentIcon = 'Link',
  darkMode = false
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  const iconNames = useMemo(() => {
    const allIcons = Object.keys(Icons)
      .filter(key => {
        // Exclude known non-component exports
        if (key === 'default' || key === 'createLucideIcon') return false;

        const icon = (Icons as any)[key];

        // Must be a function/object (React components)
        if (typeof icon !== 'function' && typeof icon !== 'object') return false;

        // Exclude if it starts with lowercase (not a component name)
        if (key[0] === key[0].toLowerCase()) return false;

        return true;
      });

    // Remove duplicates - prefer names without "Icon" suffix
    const uniqueIcons = new Set<string>();
    const iconsToRemove = new Set<string>();

    allIcons.forEach(key => {
      if (key.endsWith('Icon')) {
        const baseKey = key.slice(0, -4); // Remove "Icon" suffix
        if (allIcons.includes(baseKey)) {
          // Both versions exist, mark the "Icon" suffix version for removal
          iconsToRemove.add(key);
        } else {
          uniqueIcons.add(key);
        }
      } else {
        uniqueIcons.add(key);
      }
    });

    return Array.from(uniqueIcons).sort();
  }, []);

  const filteredIcons = useMemo(() => {
    if (!searchTerm) return iconNames;
    const lowerSearch = searchTerm.toLowerCase();
    return iconNames.filter(name => name.toLowerCase().includes(lowerSearch));
  }, [iconNames, searchTerm]);

  const handleSelect = (iconName: string) => {
    onSelect(iconName);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      <div
        className={`relative w-full max-w-4xl max-h-[80vh] rounded-xl shadow-2xl ${
          darkMode ? 'bg-slate-900 border border-slate-700' : 'bg-white border border-slate-200'
        } flex flex-col`}
      >
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Choose an Icon
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Select from {filteredIcons.length} available icons
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-800 text-slate-400 hover:text-white'
                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Search */}
        <div className={`p-4 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="relative">
            <Search
              size={20}
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                darkMode ? 'text-slate-500' : 'text-slate-400'
              }`}
            />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search icons..."
              className={`w-full pl-10 pr-4 py-2.5 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
              } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              autoFocus
            />
          </div>
        </div>

        {/* Icon Grid */}
        <div className="flex-1 overflow-y-auto p-4">
          {filteredIcons.length === 0 ? (
            <div className="text-center py-12">
              <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No icons found matching "{searchTerm}"
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-6 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12 gap-2">
              {filteredIcons.map((iconName, index) => {
                const IconComponent = (Icons as any)[iconName];
                const isSelected = iconName === currentIcon;

                // React components can be functions or objects (forwardRef, memo, etc.)
                // Just try to render them - React will handle it
                if (!IconComponent) {
                  return null;
                }

                return (
                  <button
                    key={iconName}
                    onClick={() => handleSelect(iconName)}
                    className={`group relative aspect-square rounded-lg flex flex-col items-center justify-center p-3 transition-all ${
                      isSelected
                        ? darkMode
                          ? 'bg-cyan-500/20 border-2 border-cyan-500'
                          : 'bg-cyan-50 border-2 border-cyan-500'
                        : darkMode
                        ? 'hover:bg-slate-800 border-2 border-transparent'
                        : 'hover:bg-slate-100 border-2 border-transparent'
                    }`}
                    title={iconName}
                  >
                    <IconComponent
                      size={24}
                      className={`${
                        isSelected
                          ? 'text-cyan-500'
                          : darkMode
                          ? 'text-slate-400 group-hover:text-white'
                          : 'text-slate-600 group-hover:text-slate-900'
                      }`}
                    />

                    {/* Icon name tooltip on hover */}
                    <div className={`absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none ${
                      darkMode ? 'bg-slate-800 text-white' : 'bg-slate-900 text-white'
                    }`}>
                      {iconName}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-4 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            Current: <span className="font-medium">{currentIcon}</span>
          </p>
          <button
            onClick={onClose}
            className={`px-4 py-2 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-800 hover:bg-slate-700 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};
