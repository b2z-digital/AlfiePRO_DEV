import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';
import { Plus, Workflow, Play, Pause, Archive, MoreVertical, Users, Mail, Clock, TrendingUp, Edit, Trash2, X } from 'lucide-react';
import {
  getMarketingAutomationFlows,
  createMarketingAutomationFlow,
  updateMarketingAutomationFlow,
  deleteMarketingAutomationFlow
} from '../utils/marketingStorage';
import type { MarketingAutomationFlow } from '../types/marketing';

interface MarketingAutomationFlowsPageProps {
  darkMode?: boolean;
}

export default function MarketingAutomationFlowsPage({ darkMode = true }: MarketingAutomationFlowsPageProps) {
  const { currentClub } = useAuth();
  const navigate = useNavigate();
  const [flows, setFlows] = useState<MarketingAutomationFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [flowToDelete, setFlowToDelete] = useState<string | null>(null);
  const [newFlowName, setNewFlowName] = useState('');
  const [newFlowDescription, setNewFlowDescription] = useState('');
  const [newFlowTrigger, setNewFlowTrigger] = useState<string>('manual');

  useEffect(() => {
    loadFlows();
  }, [currentClub]);

  async function loadFlows() {
    if (!currentClub) return;

    try {
      setLoading(true);
      const data = await getMarketingAutomationFlows(currentClub.clubId);
      setFlows(data);
    } catch (error) {
      console.error('Error loading flows:', error);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateFlow() {
    if (!currentClub || !newFlowName.trim()) return;

    try {
      const newFlow = await createMarketingAutomationFlow({
        name: newFlowName,
        description: newFlowDescription || null,
        club_id: currentClub.clubId,
        trigger_type: newFlowTrigger as any,
        trigger_config: {},
        status: 'draft',
        canvas_layout: {
          nodes: [],
          zoom: 1,
          pan: { x: 0, y: 0 }
        }
      });

      setNewFlowName('');
      setNewFlowDescription('');
      setNewFlowTrigger('manual');
      setShowCreateModal(false);

      // Navigate to flow editor
      navigate(`/marketing/flows/${newFlow.id}`);
    } catch (error) {
      console.error('Error creating flow:', error);
      alert('Failed to create flow');
    }
  }

  async function handleToggleStatus(flow: MarketingAutomationFlow) {
    try {
      let newStatus: string;

      // If draft, activate it
      if (flow.status === 'draft') {
        newStatus = 'active';
      } else if (flow.status === 'active') {
        newStatus = 'paused';
      } else {
        newStatus = 'active';
      }

      await updateMarketingAutomationFlow(flow.id, {
        status: newStatus,
        activated_at: newStatus === 'active' ? new Date().toISOString() : undefined
      });
      loadFlows();
    } catch (error) {
      console.error('Error updating flow:', error);
      alert('Failed to update flow status');
    }
  }

  function handleDeleteFlow(id: string) {
    setFlowToDelete(id);
    setShowDeleteModal(true);
  }

  async function confirmDeleteFlow() {
    if (!flowToDelete) return;

    try {
      await deleteMarketingAutomationFlow(flowToDelete);
      setShowDeleteModal(false);
      setFlowToDelete(null);
      loadFlows();
    } catch (error) {
      console.error('Error deleting flow:', error);
      alert('Failed to delete flow');
    }
  }

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'text-green-400 bg-green-500/20';
      case 'paused':
        return 'text-yellow-400 bg-yellow-500/20';
      case 'draft':
        return 'text-gray-400 bg-gray-500/20';
      case 'archived':
        return 'text-slate-400 bg-slate-500/20';
      default:
        return 'text-gray-400 bg-gray-500/20';
    }
  };

  const getTriggerLabel = (trigger: string) => {
    const labels: Record<string, string> = {
      'event_registration': 'Event Registration',
      'time_based': 'Time Based',
      'form_submission': 'Form Submission',
      'manual': 'Manual',
      'membership_renewal': 'Membership Renewal',
      'event_published': 'Event Published'
    };
    return labels[trigger] || trigger;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="p-16 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
            <Workflow className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Automation Flows
            </h1>
            <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
              Create automated email sequences triggered by member actions
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors"
          >
            <Plus className="w-5 h-5" />
            New Flow
          </button>
          <button
            onClick={() => navigate('/marketing')}
            className={`p-2 rounded-lg transition-colors ${
              darkMode
                ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-800/50'
                : 'text-gray-400 hover:text-gray-600 hover:bg-gray-100'
            }`}
            title="Back to Marketing"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Flows Grid */}
      {flows.length > 0 ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {flows.map((flow) => (
            <div
              key={flow.id}
              className={`rounded-xl p-6 transition-shadow cursor-pointer ${
                darkMode
                  ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50 hover:bg-slate-800/70'
                  : 'bg-white shadow-sm border border-gray-200 hover:shadow-md'
              }`}
              onClick={() => navigate(`/marketing/flows/${flow.id}`)}
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      {flow.name}
                    </h3>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusColor(flow.status)}`}>
                      {flow.status}
                    </span>
                  </div>
                  {flow.description && (
                    <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      {flow.description}
                    </p>
                  )}
                  <p className={`text-xs mt-2 ${darkMode ? 'text-slate-500' : 'text-gray-500'}`}>
                    Trigger: {getTriggerLabel(flow.trigger_type)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleStatus(flow);
                    }}
                    className={`p-2 rounded-lg transition-colors ${
                      darkMode ? 'hover:bg-slate-700/50' : 'hover:bg-gray-100'
                    }`}
                    title={flow.status === 'active' ? 'Pause Flow' : flow.status === 'draft' ? 'Activate Flow' : 'Resume Flow'}
                  >
                    {flow.status === 'active' ? (
                      <Pause className={`w-5 h-5 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`} />
                    ) : (
                      <Play className={`w-5 h-5 ${darkMode ? 'text-green-400' : 'text-green-600'}`} />
                    )}
                  </button>
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-4 py-4 border-t border-b" style={{
                borderColor: darkMode ? '#334155' : '#e5e7eb'
              }}>
                <div className="text-center">
                  <Users className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                  <div className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {flow.total_enrolled}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Enrolled</div>
                </div>
                <div className="text-center">
                  <Clock className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                  <div className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {flow.currently_active}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Active</div>
                </div>
                <div className="text-center">
                  <TrendingUp className={`w-4 h-4 mx-auto mb-1 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`} />
                  <div className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                    {flow.total_completed}
                  </div>
                  <div className={`text-xs ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>Completed</div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-2 mt-4">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    navigate(`/marketing/flows/${flow.id}`);
                  }}
                  className={`flex-1 px-4 py-2 rounded-lg transition-colors text-sm font-medium ${
                    darkMode
                      ? 'bg-blue-500/20 text-blue-400 hover:bg-blue-500/30'
                      : 'bg-blue-50 text-blue-600 hover:bg-blue-100'
                  }`}
                >
                  <Edit className="w-4 h-4 inline mr-2" />
                  Edit Flow
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDeleteFlow(flow.id);
                  }}
                  className={`px-4 py-2 rounded-lg transition-colors ${
                    darkMode
                      ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                      : 'bg-red-50 text-red-600 hover:bg-red-100'
                  }`}
                  title="Delete"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={`rounded-xl p-12 text-center ${
          darkMode
            ? 'bg-slate-800/50 backdrop-blur-sm border border-slate-700/50'
            : 'bg-white shadow-sm border border-gray-200'
        }`}>
          <Workflow className={`w-16 h-16 mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-gray-400'}`} />
          <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
            No automation flows yet
          </h3>
          <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
            Create your first automation flow to send targeted email sequences based on member actions
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Create Flow
          </button>
        </div>
      )}

      {/* Create Flow Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
              Create Automation Flow
            </h2>

            <div className="space-y-4">
              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Flow Name
                </label>
                <input
                  type="text"
                  value={newFlowName}
                  onChange={(e) => setNewFlowName(e.target.value)}
                  placeholder="e.g., Welcome Series"
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Description (Optional)
                </label>
                <textarea
                  value={newFlowDescription}
                  onChange={(e) => setNewFlowDescription(e.target.value)}
                  placeholder="Describe this flow..."
                  rows={3}
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              <div>
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Trigger Type
                </label>
                <select
                  value={newFlowTrigger}
                  onChange={(e) => setNewFlowTrigger(e.target.value)}
                  className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100'
                      : 'bg-white border-gray-300 text-gray-900'
                  }`}
                >
                  <option value="manual">Manual Trigger</option>
                  <option value="event_registration">Event Registration</option>
                  <option value="membership_renewal">Membership Renewal</option>
                  <option value="event_published">Event Published</option>
                  <option value="form_submission">Form Submission</option>
                  <option value="time_based">Time Based</option>
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setNewFlowName('');
                  setNewFlowDescription('');
                  setNewFlowTrigger('manual');
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCreateFlow}
                disabled={!newFlowName.trim()}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Create Flow
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {showDeleteModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className={`rounded-xl max-w-md w-full p-6 ${
            darkMode
              ? 'bg-slate-800 border border-slate-700'
              : 'bg-white'
          }`}>
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-full bg-red-500/20 flex items-center justify-center">
                <Trash2 className="w-5 h-5 text-red-500" />
              </div>
              <h2 className={`text-xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Delete Flow
              </h2>
            </div>

            <p className={`mb-6 ${darkMode ? 'text-slate-300' : 'text-gray-600'}`}>
              Are you sure you want to delete this flow? This action cannot be undone and will permanently remove the flow and all its steps.
            </p>

            <div className="flex justify-end gap-3">
              <button
                onClick={() => {
                  setShowDeleteModal(false);
                  setFlowToDelete(null);
                }}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-700/50'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={confirmDeleteFlow}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Delete Flow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
