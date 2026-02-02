import React, { useState, useEffect } from 'react';
import { X, Calendar, FileText, Award, Users, CheckCircle2, Sparkles } from 'lucide-react';
import { EventTaskTemplate } from '../../types/eventCommandCenter';
import { EventCommandCenterStorage } from '../../utils/eventCommandCenterStorage';
import { useNotifications } from '../../contexts/NotificationContext';

interface EventTemplateModalProps {
  isOpen: boolean;
  onClose: () => void;
  eventId: string;
  eventDate: Date;
  onTemplateApplied: () => void;
  darkMode: boolean;
}

export const EventTemplateModal: React.FC<EventTemplateModalProps> = ({
  isOpen,
  onClose,
  eventId,
  eventDate,
  onTemplateApplied,
  darkMode,
}) => {
  const [templates, setTemplates] = useState<EventTaskTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<EventTaskTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    if (isOpen) {
      loadTemplates();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      setLoading(true);
      const templatesData = await EventCommandCenterStorage.getTemplates({ is_public: true });
      setTemplates(templatesData);
    } catch (error) {
      console.error('Error loading templates:', error);
      addNotification('Failed to load templates', 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyTemplate = async () => {
    if (!selectedTemplate) return;

    try {
      setApplying(true);
      await EventCommandCenterStorage.applyTemplate(selectedTemplate.id, eventId, eventDate);
      addNotification('Template applied successfully!', 'success');
      onTemplateApplied();
      onClose();
    } catch (error) {
      console.error('Error applying template:', error);
      addNotification('Failed to apply template', 'error');
    } finally {
      setApplying(false);
    }
  };

  const getTemplateIcon = (eventType: string | null) => {
    switch (eventType) {
      case 'championship':
        return <Award className="w-5 h-5" />;
      case 'regatta':
        return <Calendar className="w-5 h-5" />;
      case 'social':
        return <Users className="w-5 h-5" />;
      case 'training':
        return <FileText className="w-5 h-5" />;
      default:
        return <Sparkles className="w-5 h-5" />;
    }
  };

  const getTemplateColor = (eventType: string | null) => {
    switch (eventType) {
      case 'championship':
        return 'bg-yellow-100 text-yellow-600 dark:bg-yellow-900/20 dark:text-yellow-400';
      case 'regatta':
        return 'bg-blue-100 text-blue-600 dark:bg-blue-900/20 dark:text-blue-400';
      case 'social':
        return 'bg-purple-100 text-purple-600 dark:bg-purple-900/20 dark:text-purple-400';
      case 'training':
        return 'bg-green-100 text-green-600 dark:bg-green-900/20 dark:text-green-400';
      default:
        return 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      <div className="flex min-h-screen items-center justify-center p-4">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black bg-opacity-50 transition-opacity" onClick={onClose} />

        {/* Modal */}
        <div
          className={`
            relative w-full max-w-4xl rounded-lg shadow-xl
            ${darkMode ? 'bg-gray-800' : 'bg-white'}
          `}
        >
          {/* Header */}
          <div className={`px-6 py-4 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
            <div className="flex items-center justify-between">
              <div>
                <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  Choose Event Template
                </h2>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Get started quickly with pre-built task workflows
                </p>
              </div>
              <button
                onClick={onClose}
                className={`p-2 rounded-lg ${
                  darkMode ? 'text-gray-400 hover:bg-gray-700' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <Sparkles className={`w-12 h-12 mx-auto mb-4 ${darkMode ? 'text-gray-600' : 'text-gray-400'}`} />
                <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                  No templates available
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                {templates.map((template) => (
                  <button
                    key={template.id}
                    onClick={() => setSelectedTemplate(template)}
                    className={`
                      relative text-left p-6 rounded-lg border-2 transition-all
                      ${
                        selectedTemplate?.id === template.id
                          ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                          : darkMode
                          ? 'border-gray-700 hover:border-gray-600 bg-gray-900'
                          : 'border-gray-200 hover:border-gray-300 bg-white'
                      }
                    `}
                  >
                    {/* Selected Indicator */}
                    {selectedTemplate?.id === template.id && (
                      <div className="absolute top-4 right-4">
                        <CheckCircle2 className="w-6 h-6 text-blue-500" />
                      </div>
                    )}

                    {/* Icon */}
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center mb-4 ${getTemplateColor(template.event_type)}`}>
                      {getTemplateIcon(template.event_type)}
                    </div>

                    {/* Name */}
                    <h3 className={`font-semibold text-lg mb-2 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                      {template.name}
                    </h3>

                    {/* Description */}
                    {template.description && (
                      <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        {template.description}
                      </p>
                    )}

                    {/* Stats */}
                    <div className="flex items-center gap-4 text-sm">
                      {template.event_duration_days && (
                        <div className="flex items-center gap-1">
                          <Calendar className="w-4 h-4 text-gray-400" />
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                            {template.event_duration_days} days
                          </span>
                        </div>
                      )}
                      {template.tasks && (
                        <div className="flex items-center gap-1">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className={darkMode ? 'text-gray-400' : 'text-gray-600'}>
                            {template.tasks.length} tasks
                          </span>
                        </div>
                      )}
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Selected Template Details */}
            {selectedTemplate && (
              <div
                className={`
                  mt-6 p-6 rounded-lg border
                  ${darkMode ? 'bg-gray-900 border-gray-700' : 'bg-gray-50 border-gray-200'}
                `}
              >
                <h4 className={`font-semibold mb-3 ${darkMode ? 'text-white' : 'text-gray-900'}`}>
                  What's Included
                </h4>

                <div className="space-y-2">
                  {selectedTemplate.tasks && selectedTemplate.tasks.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        {selectedTemplate.tasks.length} pre-configured tasks
                      </span>
                    </div>
                  )}

                  {selectedTemplate.default_lanes && selectedTemplate.default_lanes.length > 0 && (
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4 text-green-500" />
                      <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                        {selectedTemplate.default_lanes.length} workflow lanes
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      Automatic due date calculation
                    </span>
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <CheckCircle2 className="w-4 h-4 text-green-500" />
                    <span className={darkMode ? 'text-gray-300' : 'text-gray-700'}>
                      Task dependencies configured
                    </span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className={`px-6 py-4 border-t ${darkMode ? 'border-gray-700' : 'border-gray-200'} flex justify-end gap-3`}>
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg text-sm font-medium
                ${darkMode ? 'bg-gray-700 text-gray-300 hover:bg-gray-600' : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'}
              `}
            >
              Cancel
            </button>

            <button
              onClick={handleApplyTemplate}
              disabled={!selectedTemplate || applying}
              className={`
                px-6 py-2 rounded-lg text-sm font-medium
                ${
                  !selectedTemplate || applying
                    ? 'bg-gray-300 dark:bg-gray-700 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700'
                }
              `}
            >
              {applying ? 'Applying...' : 'Apply Template'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
