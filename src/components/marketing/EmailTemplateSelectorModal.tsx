import { useState, useEffect } from 'react';
import { X, Search, Mail, Sparkles } from 'lucide-react';
import { getMarketingEmailTemplates } from '../../utils/marketingStorage';
import type { MarketingEmailTemplate } from '../../types/marketing';

interface EmailTemplateSelectorModalProps {
  onClose: () => void;
  onSelect: (template: MarketingEmailTemplate) => void;
  clubId?: string;
  darkMode?: boolean;
}

export default function EmailTemplateSelectorModal({
  onClose,
  onSelect,
  clubId,
  darkMode = true
}: EmailTemplateSelectorModalProps) {
  const [templates, setTemplates] = useState<MarketingEmailTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  useEffect(() => {
    loadTemplates();
  }, [clubId]);

  async function loadTemplates() {
    try {
      setLoading(true);
      const data = await getMarketingEmailTemplates(clubId);
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  }

  const filteredTemplates = templates.filter(template => {
    const matchesSearch = template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         template.description?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || template.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const categories = [
    { id: 'all', label: 'All Templates' },
    { id: 'welcome', label: 'Welcome' },
    { id: 'event', label: 'Event' },
    { id: 'newsletter', label: 'Newsletter' },
    { id: 'announcement', label: 'Announcement' },
    { id: 'reminder', label: 'Reminder' },
    { id: 'promotional', label: 'Promotional' }
  ];

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-5xl max-h-[90vh] rounded-xl overflow-hidden flex flex-col ${
        darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          darkMode ? 'border-slate-700' : 'border-gray-200'
        }`}>
          <div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Select Email Template
            </h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
              Choose a pre-designed template to get started quickly
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search and Filter */}
        <div className={`px-6 py-4 border-b ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex gap-4">
            <div className="flex-1 relative">
              <Search className={`absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 ${
                darkMode ? 'text-slate-400' : 'text-gray-400'
              }`} />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-500'
                }`}
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className={`px-4 py-2 rounded-lg border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                  : 'bg-white border-gray-300 text-gray-900'
              }`}
            >
              {categories.map(cat => (
                <option key={cat.id} value={cat.id}>{cat.label}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Templates Grid */}
        <div className="flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64">
              <Mail className={`w-16 h-16 mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                No templates found
              </h3>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                {searchQuery ? 'Try adjusting your search' : 'No templates available yet'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map(template => (
                <button
                  key={template.id}
                  onClick={() => onSelect(template)}
                  className={`text-left p-4 rounded-xl border-2 transition-all hover:scale-[1.02] ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-700 hover:border-blue-500 hover:bg-slate-900/70'
                      : 'bg-white border-gray-200 hover:border-blue-500 hover:shadow-lg'
                  }`}
                >
                  {/* Template Preview/Thumbnail */}
                  <div className={`aspect-[4/3] rounded-lg mb-3 flex items-center justify-center ${
                    darkMode ? 'bg-slate-800' : 'bg-gray-100'
                  }`}>
                    {template.thumbnail_url ? (
                      <img
                        src={template.thumbnail_url}
                        alt={template.name}
                        className="w-full h-full object-cover rounded-lg"
                      />
                    ) : (
                      <Mail className={`w-12 h-12 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
                    )}
                  </div>

                  {/* Template Info */}
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`font-semibold line-clamp-1 ${
                        darkMode ? 'text-slate-100' : 'text-gray-900'
                      }`}>
                        {template.name}
                      </h3>
                      {template.is_official && (
                        <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      )}
                    </div>

                    {template.description && (
                      <p className={`text-xs line-clamp-2 ${
                        darkMode ? 'text-slate-400' : 'text-gray-600'
                      }`}>
                        {template.description}
                      </p>
                    )}

                    {template.category && (
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${
                        darkMode
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-gray-100 text-gray-700'
                      }`}>
                        {template.category.charAt(0).toUpperCase() + template.category.slice(1)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`px-6 py-4 border-t ${darkMode ? 'border-slate-700' : 'border-gray-200'}`}>
          <div className="flex justify-end">
            <button
              onClick={onClose}
              className={`px-4 py-2 rounded-lg transition-colors ${
                darkMode
                  ? 'text-slate-300 hover:bg-slate-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
