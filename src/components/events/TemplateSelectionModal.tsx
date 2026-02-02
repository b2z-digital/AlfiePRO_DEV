import React, { useState, useEffect } from 'react';
import { X, Search, BookTemplate, Loader2, Grid, List, Check, FileText, Eye, Calendar } from 'lucide-react';
import { getAvailableTemplates, applyTemplateToEventWebsite } from '../../utils/eventWebsiteTemplateStorage';
import type { EventWebsiteTemplate } from '../../utils/eventWebsiteTemplateStorage';

interface TemplateSelectionModalProps {
  eventWebsiteId: string;
  onClose: () => void;
  onTemplateApplied?: () => void;
  darkMode?: boolean;
}

export const TemplateSelectionModal: React.FC<TemplateSelectionModalProps> = ({
  eventWebsiteId,
  onClose,
  onTemplateApplied,
  darkMode = true
}) => {
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [templates, setTemplates] = useState<EventWebsiteTemplate[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'single_event' | 'multi_event'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  useEffect(() => {
    loadTemplates();
  }, [selectedType]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const filters = selectedType !== 'all' ? { template_type: selectedType } : undefined;
      const { templates: data, error } = await getAvailableTemplates(filters);

      if (error) throw error;
      setTemplates(data || []);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async (templateId: string) => {
    try {
      setApplying(true);
      const { success, error } = await applyTemplateToEventWebsite(templateId, eventWebsiteId);

      if (error) throw error;

      if (success) {
        onTemplateApplied?.();
        onClose();
      }
    } catch (error) {
      console.error('Error applying template:', error);
    } finally {
      setApplying(false);
    }
  };

  const filteredTemplates = templates.filter(template =>
    template.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    template.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[60] flex items-center justify-center p-4">
      <div className={`w-full max-w-6xl max-h-[90vh] flex flex-col rounded-xl shadow-2xl ${
        darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
      }`}>
        {/* Header */}
        <div className={`flex items-center justify-between p-6 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-3">
            <BookTemplate className={darkMode ? 'text-purple-400' : 'text-purple-600'} size={24} />
            <div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Choose a Template
              </h2>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Start with a pre-configured event website template
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={applying}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'hover:bg-slate-700 text-slate-400 hover:text-white'
                : 'hover:bg-slate-100 text-slate-600 hover:text-slate-900'
            }`}
          >
            <X size={20} />
          </button>
        </div>

        {/* Filters and Search */}
        <div className={`p-6 border-b space-y-4 ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`} size={20} />
              <input
                type="text"
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className={`w-full pl-10 pr-4 py-2 rounded-lg border ${
                  darkMode
                    ? 'bg-slate-900/50 border-slate-700 text-white placeholder-slate-500'
                    : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400'
                } focus:outline-none focus:ring-2 focus:ring-purple-500`}
              />
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setViewMode('grid')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'grid'
                    ? darkMode ? 'bg-purple-600 text-white' : 'bg-purple-600 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <Grid size={18} />
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`p-2 rounded-lg transition-colors ${
                  viewMode === 'list'
                    ? darkMode ? 'bg-purple-600 text-white' : 'bg-purple-600 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-400 hover:text-white' : 'bg-slate-100 text-slate-600 hover:text-slate-900'
                }`}
              >
                <List size={18} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedType('all')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'all'
                  ? 'bg-purple-600 text-white'
                  : darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              All Templates
            </button>
            <button
              onClick={() => setSelectedType('single_event')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'single_event'
                  ? 'bg-purple-600 text-white'
                  : darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Single Event
            </button>
            <button
              onClick={() => setSelectedType('multi_event')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedType === 'multi_event'
                  ? 'bg-purple-600 text-white'
                  : darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Multi-Event
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className={`animate-spin ${darkMode ? 'text-purple-400' : 'text-purple-600'}`} size={32} />
            </div>
          ) : filteredTemplates.length === 0 ? (
            <div className="text-center py-12">
              <BookTemplate className={`mx-auto mb-4 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={48} />
              <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                No templates found
              </h3>
              <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                {searchTerm ? 'Try adjusting your search' : 'No templates available yet'}
              </p>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedTemplate === template.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : darkMode
                        ? 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  {template.preview_image ? (
                    <img
                      src={template.preview_image}
                      alt={template.name}
                      className="w-full h-40 object-cover rounded-lg mb-3"
                    />
                  ) : (
                    <div className={`w-full h-40 rounded-lg mb-3 flex items-center justify-center ${
                      darkMode ? 'bg-slate-800' : 'bg-slate-100'
                    }`}>
                      <FileText className={darkMode ? 'text-slate-600' : 'text-slate-400'} size={48} />
                    </div>
                  )}

                  <div className="flex items-start justify-between mb-2">
                    <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      {template.name}
                    </h3>
                    {selectedTemplate === template.id && (
                      <Check className="text-purple-400 flex-shrink-0" size={20} />
                    )}
                  </div>

                  {template.description && (
                    <p className={`text-sm mb-3 line-clamp-2 ${
                      darkMode ? 'text-slate-400' : 'text-slate-600'
                    }`}>
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`px-2 py-1 rounded text-xs font-medium ${
                      darkMode
                        ? 'bg-purple-500/20 text-purple-400'
                        : 'bg-purple-100 text-purple-600'
                    }`}>
                      {template.template_type === 'multi_event' ? 'Multi-Event' : 'Single Event'}
                    </span>
                    {template.category && (
                      <span className={`px-2 py-1 rounded text-xs ${
                        darkMode
                          ? 'bg-slate-700 text-slate-300'
                          : 'bg-slate-100 text-slate-600'
                      }`}>
                        {template.category}
                      </span>
                    )}
                    <span className={`px-2 py-1 rounded text-xs ${
                      darkMode
                        ? 'bg-slate-700 text-slate-400'
                        : 'bg-slate-100 text-slate-500'
                    }`}>
                      <Eye size={12} className="inline mr-1" />
                      {template.use_count} uses
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredTemplates.map((template) => (
                <div
                  key={template.id}
                  onClick={() => setSelectedTemplate(template.id)}
                  className={`p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    selectedTemplate === template.id
                      ? 'border-purple-500 bg-purple-500/10'
                      : darkMode
                        ? 'border-slate-700 bg-slate-900/50 hover:border-slate-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {template.preview_image ? (
                      <img
                        src={template.preview_image}
                        alt={template.name}
                        className="w-32 h-24 object-cover rounded-lg flex-shrink-0"
                      />
                    ) : (
                      <div className={`w-32 h-24 rounded-lg flex items-center justify-center flex-shrink-0 ${
                        darkMode ? 'bg-slate-800' : 'bg-slate-100'
                      }`}>
                        <FileText className={darkMode ? 'text-slate-600' : 'text-slate-400'} size={32} />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between mb-2">
                        <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {template.name}
                        </h3>
                        {selectedTemplate === template.id && (
                          <Check className="text-purple-400 flex-shrink-0 ml-2" size={20} />
                        )}
                      </div>

                      {template.description && (
                        <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {template.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`px-2 py-1 rounded text-xs font-medium ${
                          darkMode
                            ? 'bg-purple-500/20 text-purple-400'
                            : 'bg-purple-100 text-purple-600'
                        }`}>
                          {template.template_type === 'multi_event' ? 'Multi-Event' : 'Single Event'}
                        </span>
                        {template.category && (
                          <span className={`px-2 py-1 rounded text-xs ${
                            darkMode
                              ? 'bg-slate-700 text-slate-300'
                              : 'bg-slate-100 text-slate-600'
                          }`}>
                            {template.category}
                          </span>
                        )}
                        <span className={`px-2 py-1 rounded text-xs ${
                          darkMode
                            ? 'bg-slate-700 text-slate-400'
                            : 'bg-slate-100 text-slate-500'
                        }`}>
                          <Eye size={12} className="inline mr-1" />
                          {template.use_count} uses
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`flex items-center justify-between p-6 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <button
            onClick={onClose}
            disabled={applying}
            className={`px-6 py-3 rounded-lg font-medium transition-colors ${
              darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-white'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
            }`}
          >
            Start from Scratch
          </button>
          <button
            onClick={() => selectedTemplate && handleApplyTemplate(selectedTemplate)}
            disabled={!selectedTemplate || applying}
            className="px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {applying ? (
              <>
                <Loader2 className="animate-spin" size={18} />
                Applying Template...
              </>
            ) : (
              <>
                <Check size={18} />
                Use Selected Template
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
