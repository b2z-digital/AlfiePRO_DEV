import React, { useState, useMemo, useEffect } from 'react';
import { LogOut, Search, Calendar, DollarSign, Users, LayoutGrid, Sparkles, Save, Edit2 } from 'lucide-react';
import { WIDGET_REGISTRY, getAllCategories, getWidgetsByCategory } from './WidgetRegistry';
import { WidgetConfig, DashboardLayout } from '../../types/dashboard';
import { DASHBOARD_TEMPLATES } from '../../constants/dashboardTemplates';
import { getTemplates, SavedDashboardTemplate, updateTemplate } from '../../utils/dashboardTemplateStorage';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';

interface WidgetLibraryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddWidget: (widgetType: string) => void;
  onApplyTemplate?: (templateId: string) => void;
  onEditSystemTemplate?: (templateId: string) => void;
  existingWidgets: WidgetConfig[];
  currentLayout?: DashboardLayout;
}

export const WidgetLibraryModal: React.FC<WidgetLibraryModalProps> = ({
  isOpen,
  onClose,
  onAddWidget,
  onApplyTemplate,
  onEditSystemTemplate,
  existingWidgets,
  currentLayout
}) => {
  const { currentClub, user } = useAuth();
  const { addNotification } = useNotifications();
  const [activeTab, setActiveTab] = useState<'templates' | 'widgets'>('widgets');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [pendingTemplateId, setPendingTemplateId] = useState<string | null>(null);
  const [previewWidget, setPreviewWidget] = useState<any>(null);
  const [savedTemplates, setSavedTemplates] = useState<SavedDashboardTemplate[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const categories = getAllCategories();

  const isSuperAdmin = user?.is_super_admin || false;

  useEffect(() => {
    if (isOpen && activeTab === 'templates') {
      loadSavedTemplates();
    }
  }, [isOpen, activeTab, currentClub]);

  const loadSavedTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const templates = await getTemplates(currentClub?.clubId);
      setSavedTemplates(templates);
    } catch (error) {
      console.error('Error loading templates:', error);
    } finally {
      setLoadingTemplates(false);
    }
  };

  const categoryLabels: Record<string, string> = {
    all: 'All Widgets',
    overview: 'Overview',
    finance: 'Financial',
    membership: 'Membership',
    race: 'Race Management',
    communication: 'Communications',
    analytics: 'Analytics'
  };

  const handleTemplateClick = (templateId: string) => {
    if (!onApplyTemplate) return;

    if (existingWidgets.length > 0) {
      setPendingTemplateId(templateId);
      setShowConfirmation(true);
    } else {
      onApplyTemplate(templateId);
      onClose();
    }
  };

  const handleConfirmApply = () => {
    if (pendingTemplateId && onApplyTemplate) {
      onApplyTemplate(pendingTemplateId);
      setShowConfirmation(false);
      setPendingTemplateId(null);
      onClose();
    }
  };

  const handleCancelApply = () => {
    setShowConfirmation(false);
    setPendingTemplateId(null);
  };

  const handleUpdateDefaultTemplate = async (templateId: string) => {
    if (!isSuperAdmin || !currentLayout) return;

    if (!confirm('Update this default template with your current dashboard layout? This will affect all users who use this template.')) {
      return;
    }

    const success = await updateTemplate(templateId, {
      template_data: currentLayout
    });

    if (success) {
      addNotification('success', 'Default template updated successfully!');
      loadSavedTemplates();
    } else {
      addNotification('error', 'Failed to update template');
    }
  };

  const handleApplySavedTemplate = (template: SavedDashboardTemplate) => {
    if (!onApplyTemplate) return;

    // Create a temporary template ID from the saved template
    const tempId = `saved-${template.id}`;

    // Convert saved template to dashboard layout format
    const layout = template.template_data;

    if (existingWidgets.length > 0) {
      if (confirm('Applying this template will replace your current dashboard. Continue?')) {
        // Apply the template directly
        if (layout.widgets && layout.rows) {
          window.location.reload(); // Reload to apply saved template
        }
      }
    } else {
      window.location.reload();
    }
  };

  const filteredWidgets = useMemo(() => {
    let widgets = selectedCategory === 'all'
      ? WIDGET_REGISTRY
      : getWidgetsByCategory(selectedCategory);

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      widgets = widgets.filter(w =>
        w.name.toLowerCase().includes(query) ||
        w.description.toLowerCase().includes(query)
      );
    }

    return widgets;
  }, [selectedCategory, searchQuery]);

  // Group widgets by size
  const smallWidgets = filteredWidgets.filter(w => w.defaultSize === '1x1');
  const mediumWidgets = filteredWidgets.filter(w => w.defaultSize === '2x1' || w.defaultSize === '1x2');
  const largeWidgets = filteredWidgets.filter(w => !['1x1', '2x1', '1x2'].includes(w.defaultSize));

  if (!isOpen) return null;

  const getSizeLabel = (size: string) => {
    switch (size) {
      case '1x1': return 'Small';
      case '2x1': return 'Medium';
      case '1x2': return 'Medium';
      case '2x2': return 'Large';
      case '3x1': return 'Wide';
      default: return size;
    }
  };

  const WidgetCard: React.FC<{ widget: any; size: 'small' | 'medium' | 'large' }> = ({ widget, size }) => {
    const Icon = widget.icon;

    return (
      <div
        className={`
          relative bg-slate-700/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl
          hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20
          transition-all duration-200 cursor-pointer group overflow-hidden
          ${size === 'small' ? 'p-4' : size === 'medium' ? 'p-5' : 'p-6'}
        `}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <div className="flex items-start justify-between mb-3 relative">
          <div className={`p-2.5 rounded-xl bg-gradient-to-br ${
            widget.category === 'finance' ? 'from-green-500/20 to-emerald-500/20' :
            widget.category === 'membership' ? 'from-blue-500/20 to-cyan-500/20' :
            widget.category === 'race' ? 'from-purple-500/20 to-pink-500/20' :
            widget.category === 'communication' ? 'from-cyan-500/20 to-blue-500/20' :
            widget.category === 'analytics' ? 'from-orange-500/20 to-yellow-500/20' :
            'from-slate-500/20 to-slate-600/20'
          }`}>
            <Icon className={`${
              widget.category === 'finance' ? 'text-green-400' :
              widget.category === 'membership' ? 'text-blue-400' :
              widget.category === 'race' ? 'text-purple-400' :
              widget.category === 'communication' ? 'text-cyan-400' :
              widget.category === 'analytics' ? 'text-orange-400' :
              'text-slate-400'
            }`} size={size === 'small' ? 20 : 24} />
          </div>
          <div className="flex flex-col gap-1 items-end">
            <span className={`text-xs font-medium px-2 py-0.5 rounded-md ${
              widget.category === 'finance' ? 'bg-green-500/20 text-green-400' :
              widget.category === 'membership' ? 'bg-blue-500/20 text-blue-400' :
              widget.category === 'race' ? 'bg-purple-500/20 text-purple-400' :
              widget.category === 'communication' ? 'bg-cyan-500/20 text-cyan-400' :
              widget.category === 'analytics' ? 'bg-orange-500/20 text-orange-400' :
              'bg-slate-500/20 text-slate-400'
            }`}>
              {categoryLabels[widget.category] || widget.category}
            </span>
            <span className="text-xs font-medium text-slate-500 bg-slate-800/50 px-2 py-0.5 rounded-md">
              {getSizeLabel(widget.defaultSize)}
            </span>
          </div>
        </div>

        <h3 className={`font-semibold text-white mb-1 relative ${size === 'small' ? 'text-sm' : 'text-base'}`}>
          {widget.name}
        </h3>
        <p className={`text-slate-400 line-clamp-2 relative ${size === 'small' ? 'text-xs' : 'text-sm'}`}>
          {widget.description}
        </p>

        <div className="absolute inset-0 flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900/80 backdrop-blur-sm rounded-2xl">
          <button
            onClick={(e) => {
              e.stopPropagation();
              setPreviewWidget(widget);
            }}
            className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
          >
            Preview
          </button>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onAddWidget(widget.type);
            }}
            className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
          >
            Add Widget
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
      <div className="bg-slate-900/95 backdrop-blur-xl rounded-3xl shadow-2xl w-full max-w-7xl max-h-[85vh] overflow-hidden flex border border-slate-700/50">

        {/* Sidebar */}
        <div className="w-72 bg-slate-800/50 border-r border-slate-700/50 flex flex-col">
          {/* Search */}
          <div className="p-4 border-b border-slate-700/50">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-500" size={18} />
              <input
                type="text"
                placeholder="Search Widgets"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-slate-900/50 border border-slate-700 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500/50 transition-colors"
              />
            </div>
          </div>

          {/* Categories */}
          <div className="flex-1 overflow-y-auto p-3">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-all ${
                selectedCategory === 'all'
                  ? 'bg-slate-700 text-white shadow-md'
                  : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
              }`}
            >
              <div className="font-medium">All Widgets</div>
              <div className="text-xs text-slate-500 mt-0.5">{WIDGET_REGISTRY.length} widgets</div>
            </button>

            {categories.map((category) => {
              const count = getWidgetsByCategory(category).length;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`w-full text-left px-4 py-3 rounded-xl mb-1 transition-all ${
                    selectedCategory === category
                      ? 'bg-slate-700 text-white shadow-md'
                      : 'text-slate-400 hover:bg-slate-800/50 hover:text-white'
                  }`}
                >
                  <div className="font-medium">{categoryLabels[category] || category}</div>
                  <div className="text-xs text-slate-500 mt-0.5">{count} widget{count !== 1 ? 's' : ''}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 flex flex-col">
          {/* Header */}
          <div className="p-6 border-b border-slate-700/50">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-2xl font-bold text-white mb-1">
                  {activeTab === 'templates' ? 'Dashboard Templates' : categoryLabels[selectedCategory] || 'Widgets'}
                </h2>
                <p className="text-sm text-slate-400">
                  {activeTab === 'templates'
                    ? 'Start with a pre-configured layout designed for your role'
                    : `${filteredWidgets.length} widget${filteredWidgets.length !== 1 ? 's' : ''} available`
                  }
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <LogOut className="text-slate-400" size={24} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('templates')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'templates'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800/50 text-slate-400 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Sparkles size={16} />
                  Templates
                </div>
              </button>
              <button
                onClick={() => setActiveTab('widgets')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  activeTab === 'widgets'
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-800/50 text-slate-400 hover:text-white'
                }`}
              >
                Individual Widgets
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-6">
            {activeTab === 'templates' ? (
              <div className="space-y-6 max-w-4xl mx-auto">
                {/* Default Templates */}
                <div>
                  <h3 className="text-white font-semibold text-lg mb-4">Default Templates</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {DASHBOARD_TEMPLATES.map((template) => {
                      const IconComponent = template.icon === 'Calendar' ? Calendar :
                                           template.icon === 'DollarSign' ? DollarSign :
                                           template.icon === 'Users' ? Users :
                                           LayoutGrid;

                      return (
                        <div
                          key={template.id}
                          className="relative bg-slate-700/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl p-6 hover:border-blue-500/50 hover:shadow-lg hover:shadow-blue-500/20 transition-all duration-200 group overflow-hidden"
                        >
                          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                          <div className="flex items-start gap-4 mb-4 relative">
                            <div className="p-3 rounded-xl bg-gradient-to-br from-blue-500/20 to-purple-500/20">
                              <IconComponent className="text-blue-400" size={28} />
                            </div>
                            <div className="flex-1">
                              <h3 className="font-semibold text-white text-lg mb-1">{template.name}</h3>
                              <p className="text-sm text-slate-400">{template.description}</p>
                            </div>
                          </div>

                          <div className="relative mb-4">
                            <div className="text-xs text-slate-500 mb-2">Includes:</div>
                            <div className="flex flex-wrap gap-2">
                              {template.defaultLayouts.lg.slice(0, 5).map((widget, idx) => (
                                <span
                                  key={idx}
                                  className="text-xs px-2 py-1 bg-slate-800/50 text-slate-400 rounded"
                                >
                                  {WIDGET_REGISTRY.find(w => w.type === widget.type)?.name || widget.type}
                                </span>
                              ))}
                              {template.defaultLayouts.lg.length > 5 && (
                                <span className="text-xs px-2 py-1 bg-slate-800/50 text-slate-400 rounded">
                                  +{template.defaultLayouts.lg.length - 5} more
                                </span>
                              )}
                        </div>
                      </div>

                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleTemplateClick(template.id);
                              }}
                              className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium transition-colors"
                            >
                              Apply Template
                            </button>
                            {isSuperAdmin && onEditSystemTemplate && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onEditSystemTemplate(template.id);
                                  onClose();
                                }}
                                className="px-4 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium transition-colors flex items-center gap-2"
                                title="Edit this default template (Super Admin only)"
                              >
                                <Edit2 size={14} />
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Saved Templates */}
                {savedTemplates.filter(t => !t.is_default && (t.club_id === currentClub?.clubId || t.is_public)).length > 0 && (
                  <div>
                    <h3 className="text-white font-semibold text-lg mb-4">Your Templates</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {savedTemplates
                        .filter(t => !t.is_default && (t.club_id === currentClub?.clubId || t.is_public))
                        .map((template) => {
                          const IconComponent = LayoutGrid;

                          return (
                            <div
                              key={template.id}
                              onClick={() => handleApplySavedTemplate(template)}
                              className="relative bg-slate-700/40 backdrop-blur-sm border border-slate-600/50 rounded-2xl p-6 hover:border-green-500/50 hover:shadow-lg hover:shadow-green-500/20 transition-all duration-200 cursor-pointer group overflow-hidden"
                            >
                              <div className="absolute inset-0 bg-gradient-to-br from-green-500/5 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                              <div className="flex items-start gap-4 mb-4 relative">
                                <div className="p-3 rounded-xl bg-gradient-to-br from-green-500/20 to-blue-500/20">
                                  <IconComponent className="text-green-400" size={28} />
                                </div>
                                <div className="flex-1">
                                  <h3 className="font-semibold text-white text-lg mb-1">{template.name}</h3>
                                  {template.description && (
                                    <p className="text-sm text-slate-400">{template.description}</p>
                                  )}
                                  {template.is_public && (
                                    <span className="text-xs px-2 py-1 bg-blue-500/20 text-blue-400 rounded mt-2 inline-block">
                                      Public
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex gap-2 justify-end">
                                <button className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-medium transition-colors">
                                  Apply Template
                                </button>
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}
              </div>
            ) : filteredWidgets.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full">
                <div className="text-center">
                  <p className="text-slate-400 text-lg mb-2">No widgets found</p>
                  <p className="text-slate-500 text-sm">Try adjusting your search or category filter</p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                {/* Small Widgets */}
                {smallWidgets.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      Compact Widgets
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {smallWidgets.map((widget) => (
                        <WidgetCard key={widget.id} widget={widget} size="small" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Medium Widgets */}
                {mediumWidgets.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      Medium Widgets
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                      {mediumWidgets.map((widget) => (
                        <WidgetCard key={widget.id} widget={widget} size="medium" />
                      ))}
                    </div>
                  </div>
                )}

                {/* Large Widgets */}
                {largeWidgets.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-slate-400 uppercase tracking-wider mb-4">
                      Large Widgets
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {largeWidgets.map((widget) => (
                        <WidgetCard key={widget.id} widget={widget} size="large" />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-700/50 bg-slate-800/30">
            <p className="text-xs text-slate-500 text-center">
              Click a widget to add it to your dashboard • Drag rows to reorder • Click empty slots to add widgets
            </p>
          </div>
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirmation && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <div className="bg-slate-800 rounded-2xl shadow-2xl max-w-md w-full mx-4 border border-slate-700">
            <div className="p-6">
              <h3 className="text-lg font-semibold text-white mb-2">
                Replace Current Dashboard?
              </h3>
              <p className="text-slate-400 text-sm mb-6">
                Applying a template will replace your current dashboard. Continue?
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={handleCancelApply}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleConfirmApply}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
                >
                  OK
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Widget Preview Modal */}
      {previewWidget && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-900 rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden border border-slate-700">
            <div className="p-6 border-b border-slate-700/50 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-semibold text-white mb-1">
                  {previewWidget.name}
                </h3>
                <p className="text-sm text-slate-400">
                  {previewWidget.description}
                </p>
              </div>
              <button
                onClick={() => setPreviewWidget(null)}
                className="p-2 hover:bg-slate-800 rounded-xl transition-colors"
              >
                <LogOut className="text-slate-400" size={24} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-200px)]">
              <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30">
                {React.createElement(previewWidget.component, {
                  widgetId: 'preview',
                  isEditMode: false,
                  onRemove: () => {},
                  settings: {},
                  colorTheme: 'default'
                })}
              </div>
            </div>
            <div className="p-4 border-t border-slate-700/50 flex gap-3 justify-end">
              <button
                onClick={() => setPreviewWidget(null)}
                className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors font-medium"
              >
                Close
              </button>
              <button
                onClick={() => {
                  onAddWidget(previewWidget.type);
                  setPreviewWidget(null);
                }}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors font-medium"
              >
                Add to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
