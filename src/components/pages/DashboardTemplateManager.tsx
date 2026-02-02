import React, { useState, useEffect } from 'react';
import { LayoutGrid, Plus, Edit2, Trash2, Save, X, Calendar, DollarSign, Users } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';
import { ClubDashboardTemplate } from '../../types/dashboardTemplates';
import { DASHBOARD_TEMPLATES } from '../../constants/dashboardTemplates';
// TODO: Update to use new dashboard_templates table
// import { loadTemplatesForClub, saveClubTemplate, deleteClubTemplate } from '../../utils/dashboardTemplateStorage';

// Temporary stubs for old API - will be replaced with new template system
const loadTemplatesForClub = async (clubId: string): Promise<ClubDashboardTemplate[]> => {
  return [];
};

const saveClubTemplate = async (template: Partial<ClubDashboardTemplate>): Promise<ClubDashboardTemplate | null> => {
  return null;
};

const deleteClubTemplate = async (templateId: string): Promise<boolean> => {
  return false;
};

interface PositionDefinition {
  id: string;
  position_name: string;
}

interface DashboardTemplateManagerProps {
  darkMode: boolean;
}

export const DashboardTemplateManager: React.FC<DashboardTemplateManagerProps> = ({ darkMode }) => {
  const { currentClub } = useAuth();
  const { addNotification } = useNotifications();
  const [templates, setTemplates] = useState<ClubDashboardTemplate[]>([]);
  const [positions, setPositions] = useState<PositionDefinition[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<ClubDashboardTemplate | null>(null);
  const [showForm, setShowForm] = useState(false);

  const isAdmin = currentClub?.role === 'admin';
  const isEditor = currentClub?.role === 'editor';
  const canManage = isAdmin || isEditor;

  useEffect(() => {
    if (currentClub) {
      fetchData();
    }
  }, [currentClub]);

  const fetchData = async () => {
    if (!currentClub) return;

    try {
      setLoading(true);

      const [templatesData, positionsData] = await Promise.all([
        loadTemplatesForClub(currentClub.clubId),
        supabase
          .from('committee_position_definitions')
          .select('id, position_name')
          .eq('club_id', currentClub.clubId)
          .order('display_order')
      ]);

      setTemplates(templatesData);
      setPositions(positionsData.data || []);
    } catch (error: any) {
      console.error('Error fetching template data:', error);
      addNotification('error', 'Failed to load template data');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (templateData: Partial<ClubDashboardTemplate>) => {
    if (!currentClub) return;

    try {
      const saved = await saveClubTemplate({
        ...templateData,
        club_id: currentClub.clubId
      });

      if (saved) {
        addNotification('success', editingTemplate ? 'Template updated successfully' : 'Template created successfully');
        setShowForm(false);
        setEditingTemplate(null);
        fetchData();
      }
    } catch (error: any) {
      console.error('Error saving template:', error);
      addNotification('error', 'Failed to save template');
    }
  };

  const handleDeleteTemplate = async (templateId: string) => {
    if (!confirm('Are you sure you want to delete this template?')) return;

    try {
      const success = await deleteClubTemplate(templateId);
      if (success) {
        addNotification('success', 'Template deleted successfully');
        fetchData();
      }
    } catch (error: any) {
      console.error('Error deleting template:', error);
      addNotification('error', 'Failed to delete template');
    }
  };

  const handleCreateFromBase = (baseTemplateId: string) => {
    const baseTemplate = DASHBOARD_TEMPLATES.find(t => t.id === baseTemplateId);
    if (!baseTemplate || !currentClub) return;

    setEditingTemplate({
      id: '',
      club_id: currentClub.clubId,
      template_id: baseTemplate.id,
      name: `${baseTemplate.name} (Custom)`,
      description: baseTemplate.description,
      layouts: baseTemplate.defaultLayouts,
      assigned_roles: [],
      is_default: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    setShowForm(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-slate-400">Loading dashboard templates...</div>
      </div>
    );
  }

  if (!canManage) {
    return (
      <div className="text-center py-12">
        <p className="text-slate-400">You don't have permission to manage dashboard templates.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white">Dashboard Templates</h2>
          <p className="text-slate-400 mt-1">Configure dashboard layouts for different committee roles</p>
        </div>
        {!showForm && (
          <button
            onClick={() => {
              setEditingTemplate(null);
              setShowForm(true);
            }}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
          >
            <Plus size={16} />
            Create Template
          </button>
        )}
      </div>

      {showForm ? (
        <TemplateForm
          template={editingTemplate}
          positions={positions}
          onSave={handleSaveTemplate}
          onCancel={() => {
            setShowForm(false);
            setEditingTemplate(null);
          }}
          onSelectBase={handleCreateFromBase}
        />
      ) : (
        <div className="grid gap-4">
          {templates.length === 0 ? (
            <div className="text-center py-12 bg-slate-800/30 rounded-lg border border-slate-700/50">
              <LayoutGrid className="mx-auto text-slate-500 mb-3" size={48} />
              <p className="text-slate-400 mb-4">No custom templates defined yet</p>
              <p className="text-sm text-slate-500 mb-4">Start by creating a template based on one of the defaults</p>
              <div className="flex gap-2 justify-center">
                {DASHBOARD_TEMPLATES.map(template => {
                  const IconComponent = template.icon === 'Calendar' ? Calendar :
                                       template.icon === 'DollarSign' ? DollarSign :
                                       template.icon === 'Users' ? Users :
                                       LayoutGrid;

                  return (
                    <button
                      key={template.id}
                      onClick={() => handleCreateFromBase(template.id)}
                      className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors flex items-center gap-2"
                    >
                      <IconComponent size={16} />
                      {template.name}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            templates.map(template => (
              <div
                key={template.id}
                className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-4"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <h3 className="font-semibold text-white">{template.name}</h3>
                      {template.is_default && (
                        <span className="text-xs px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded">
                          Default
                        </span>
                      )}
                    </div>
                    {template.description && (
                      <p className="text-sm text-slate-400 mb-3">{template.description}</p>
                    )}

                    {template.assigned_roles.length > 0 && (
                      <div>
                        <div className="text-xs text-slate-500 mb-1">Assigned to:</div>
                        <div className="flex flex-wrap gap-2">
                          {template.assigned_roles.map((role, idx) => (
                            <span
                              key={idx}
                              className="text-xs px-2 py-1 bg-slate-700 text-slate-300 rounded"
                            >
                              {role}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setEditingTemplate(template);
                        setShowForm(true);
                      }}
                      className="p-2 text-slate-400 hover:text-blue-400 transition-colors"
                      title="Edit template"
                    >
                      <Edit2 size={16} />
                    </button>
                    <button
                      onClick={() => handleDeleteTemplate(template.id)}
                      className="p-2 text-slate-400 hover:text-red-400 transition-colors"
                      title="Delete template"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

interface TemplateFormProps {
  template: ClubDashboardTemplate | null;
  positions: PositionDefinition[];
  onSave: (data: Partial<ClubDashboardTemplate>) => void;
  onCancel: () => void;
  onSelectBase: (baseId: string) => void;
}

const TemplateForm: React.FC<TemplateFormProps> = ({
  template,
  positions,
  onSave,
  onCancel,
  onSelectBase
}) => {
  const [formData, setFormData] = useState({
    name: template?.name || '',
    description: template?.description || '',
    assigned_roles: template?.assigned_roles || [] as string[],
    is_default: template?.is_default || false,
    template_id: template?.template_id || '',
    layouts: template?.layouts || { lg: [], md: [], sm: [] }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...template,
      ...formData
    });
  };

  const toggleRole = (roleName: string) => {
    setFormData({
      ...formData,
      assigned_roles: formData.assigned_roles.includes(roleName)
        ? formData.assigned_roles.filter(r => r !== roleName)
        : [...formData.assigned_roles, roleName]
    });
  };

  return (
    <form onSubmit={handleSubmit} className="bg-slate-800/30 rounded-lg border border-slate-700/50 p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">
          {template?.id ? 'Edit Template' : 'Create Template'}
        </h3>
        <button
          type="button"
          onClick={onCancel}
          className="p-2 text-slate-400 hover:text-white transition-colors"
        >
          <X size={20} />
        </button>
      </div>

      {!template?.id && !formData.template_id && (
        <div>
          <label className="block text-sm font-medium text-slate-300 mb-2">
            Start with a base template
          </label>
          <div className="grid grid-cols-2 gap-2">
            {DASHBOARD_TEMPLATES.map(baseTemplate => {
              const IconComponent = baseTemplate.icon === 'Calendar' ? Calendar :
                                   baseTemplate.icon === 'DollarSign' ? DollarSign :
                                   baseTemplate.icon === 'Users' ? Users :
                                   LayoutGrid;

              return (
                <button
                  key={baseTemplate.id}
                  type="button"
                  onClick={() => onSelectBase(baseTemplate.id)}
                  className="p-3 bg-slate-700 hover:bg-slate-600 rounded-lg transition-colors text-left"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <IconComponent size={16} className="text-blue-400" />
                    <span className="font-medium text-white">{baseTemplate.name}</span>
                  </div>
                  <p className="text-xs text-slate-400">{baseTemplate.description}</p>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {formData.template_id && (
        <>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Template Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              placeholder="e.g., Race Officer Dashboard"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">
              Description
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-white"
              placeholder="Brief description of this template"
              rows={2}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-300 mb-2">
              Assign to Committee Positions
            </label>
            <div className="grid grid-cols-2 gap-2">
              {positions.map(position => (
                <label
                  key={position.id}
                  className="flex items-center gap-2 p-2 bg-slate-700/50 rounded cursor-pointer hover:bg-slate-700"
                >
                  <input
                    type="checkbox"
                    checked={formData.assigned_roles.includes(position.position_name)}
                    onChange={() => toggleRole(position.position_name)}
                    className="w-4 h-4"
                  />
                  <span className="text-sm text-slate-300">{position.position_name}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_default"
              checked={formData.is_default}
              onChange={(e) => setFormData({ ...formData, is_default: e.target.checked })}
              className="w-4 h-4"
            />
            <label htmlFor="is_default" className="text-sm text-slate-300">
              Set as default template for members without assigned roles
            </label>
          </div>

          <div className="flex gap-2">
            <button
              type="submit"
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
            >
              <Save size={16} />
              Save Template
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg transition-colors"
            >
              Cancel
            </button>
          </div>
        </>
      )}
    </form>
  );
};
