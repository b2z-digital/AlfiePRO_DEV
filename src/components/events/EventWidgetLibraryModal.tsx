import React, { useState } from 'react';
import { X, Search, Image, Clock, Info, FileText, Calendar, Trophy, MapPin, Users, Camera, Video, Newspaper, Cloud, Map, Type, Square, MousePointer, Layout, Minus, Mail, Phone, MessageSquare, Award, Sparkles } from 'lucide-react';
import { EVENT_WIDGET_REGISTRY } from '../../constants/eventWidgetRegistry';
import type { EventWidgetType } from '../../types/eventWidgets';

const iconMap: Record<string, React.ComponentType<any>> = {
  'Image': Image,
  'Clock': Clock,
  'Info': Info,
  'FileText': FileText,
  'Calendar': Calendar,
  'Trophy': Trophy,
  'MapPin': MapPin,
  'Users': Users,
  'Camera': Camera,
  'Video': Video,
  'Newspaper': Newspaper,
  'Cloud': Cloud,
  'Map': Map,
  'Type': Type,
  'Square': Square,
  'MousePointer': MousePointer,
  'Layout': Layout,
  'Minus': Minus,
  'Mail': Mail,
  'Phone': Phone,
  'MessageSquare': MessageSquare,
  'Award': Award,
  'Sparkles': Sparkles
};

const getIcon = (iconName: string) => {
  return iconMap[iconName] || Square;
};

interface Props {
  onSelectWidget: (widgetType: EventWidgetType) => void;
  onClose: () => void;
  darkMode?: boolean;
}

export const EventWidgetLibraryModal: React.FC<Props> = ({ onSelectWidget, onClose, darkMode = false }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  const categories = ['all', 'event', 'content', 'media', 'engagement', 'layout'];

  const filteredWidgets = EVENT_WIDGET_REGISTRY.filter(widget => {
    const matchesSearch = widget.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         widget.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || widget.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-4xl max-h-[80vh] rounded-2xl shadow-2xl flex flex-col ${
        darkMode ? 'bg-slate-900' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Widget Library
            </h2>
            <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Choose a widget to add to your page
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-800 text-slate-400'
                : 'hover:bg-slate-100 text-slate-600'
            }`}
          >
            <X size={24} />
          </button>
        </div>

        {/* Search and Filters */}
        <div className={`p-6 border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                darkMode ? 'text-slate-500' : 'text-slate-400'
              }`} size={20} />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search widgets..."
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:ring-2 focus:ring-cyan-500 focus:border-transparent`}
              />
            </div>
          </div>

          {/* Category Filters */}
          <div className="flex gap-2 mt-4 flex-wrap">
            {categories.map((category) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors capitalize ${
                  selectedCategory === category
                    ? 'bg-cyan-600 text-white'
                    : darkMode
                    ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {category}
              </button>
            ))}
          </div>
        </div>

        {/* Widget Grid */}
        <div className="flex-1 overflow-y-auto p-6">
          {filteredWidgets.length === 0 ? (
            <div className="text-center py-12">
              <p className={`text-lg ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                No widgets found
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredWidgets.map((widget) => {
                const IconComponent = getIcon(widget.icon);
                return (
                  <button
                    key={widget.type}
                    onClick={() => onSelectWidget(widget.type)}
                    className={`p-5 rounded-xl border-2 text-left transition-all hover:scale-[1.02] hover:shadow-lg group ${
                      darkMode
                        ? 'bg-slate-800 border-slate-700 hover:border-cyan-500'
                        : 'bg-white border-slate-200 hover:border-cyan-500 hover:shadow-cyan-500/20'
                    }`}
                  >
                    <div className="flex items-start gap-3 mb-3">
                      <div className={`p-2.5 rounded-lg ${
                        darkMode ? 'bg-cyan-500/10' : 'bg-cyan-50'
                      } transition-colors group-hover:bg-cyan-500/20`}>
                        <IconComponent size={24} className="text-cyan-500" />
                      </div>
                      <div className="flex-1">
                        <div className={`font-semibold mb-1 ${
                          darkMode ? 'text-white' : 'text-slate-900'
                        }`}>
                          {widget.name}
                        </div>
                        <div className={`text-xs font-medium uppercase tracking-wide ${
                          darkMode ? 'text-slate-500' : 'text-slate-500'
                        }`}>
                          {widget.category}
                        </div>
                      </div>
                    </div>
                    <div className={`text-sm leading-relaxed ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      {widget.description}
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
