import { useState, useEffect } from 'react';
import {
  Youtube,
  DollarSign,
  Globe,
  Mail,
  Database,
  Plus,
  Trash2,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface Integration {
  id: string;
  platform: string;
  is_active: boolean;
  is_default: boolean;
  credentials: any;
  metadata: any;
  connected_at: string;
  last_synced_at: string | null;
}

interface PlatformIntegrationsTabProps {
  darkMode: boolean;
}

export function PlatformIntegrationsTab({ darkMode }: PlatformIntegrationsTabProps) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIntegration, setSelectedIntegration] = useState<Integration | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const { addNotification } = useNotifications();

  useEffect(() => {
    loadIntegrations();
  }, []);

  const loadIntegrations = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('integrations')
        .select('*')
        .is('club_id', null)
        .is('state_association_id', null)
        .is('national_association_id', null)
        .order('platform');

      if (error) throw error;
      setIntegrations(data || []);
    } catch (err: any) {
      console.error('Error loading platform integrations:', err);
      addNotification('error', 'Failed to load integrations');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleActive = async (integration: Integration) => {
    try {
      const { error } = await supabase
        .from('integrations')
        .update({ is_active: !integration.is_active })
        .eq('id', integration.id);

      if (error) throw error;

      addNotification('success', `${integration.platform} integration ${integration.is_active ? 'deactivated' : 'activated'}`);
      loadIntegrations();
    } catch (err: any) {
      console.error('Error toggling integration:', err);
      addNotification('error', 'Failed to update integration');
    }
  };

  const handleDelete = async (integration: Integration) => {
    if (!confirm(`Are you sure you want to delete the ${integration.platform} integration? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('integrations')
        .delete()
        .eq('id', integration.id);

      if (error) throw error;

      addNotification('success', `${integration.platform} integration deleted`);
      loadIntegrations();
    } catch (err: any) {
      console.error('Error deleting integration:', err);
      addNotification('error', 'Failed to delete integration');
    }
  };

  const handleReconnect = async (integration: Integration) => {
    addNotification('info', 'Reconnection functionality coming soon');
    // TODO: Implement reconnection flow based on platform
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform.toLowerCase()) {
      case 'youtube':
        return <Youtube size={24} className="text-red-500" />;
      case 'stripe':
        return <DollarSign size={24} className="text-blue-500" />;
      case 'google':
        return <Mail size={24} className="text-yellow-500" />;
      case 'facebook':
        return <Globe size={24} className="text-blue-600" />;
      case 'instagram':
        return <Globe size={24} className="text-pink-500" />;
      default:
        return <Database size={24} className="text-slate-400" />;
    }
  };

  const getPlatformName = (platform: string): string => {
    const names: Record<string, string> = {
      youtube: 'YouTube',
      stripe: 'Stripe',
      google: 'Google',
      facebook: 'Facebook',
      instagram: 'Instagram',
    };
    return names[platform.toLowerCase()] || platform;
  };

  const getIntegrationDescription = (integration: Integration): string => {
    switch (integration.platform.toLowerCase()) {
      case 'youtube':
        return integration.metadata?.name || 'Default YouTube integration for all organizations';
      case 'stripe':
        return 'Platform billing and payment processing';
      case 'google':
        return 'Google services integration (Drive, Meet, etc.)';
      case 'facebook':
        return 'Facebook integration for social sharing';
      case 'instagram':
        return 'Instagram integration for social sharing';
      default:
        return integration.metadata?.description || 'Platform integration';
    }
  };

  const getConnectionStatus = (integration: Integration) => {
    const hasCredentials = integration.credentials && Object.keys(integration.credentials).length > 0;
    const isActive = integration.is_active;

    if (isActive && hasCredentials) {
      return { status: 'connected', label: 'Connected', color: 'text-emerald-400', bgColor: 'bg-emerald-500/10', borderColor: 'border-emerald-500/20' };
    } else if (!isActive) {
      return { status: 'inactive', label: 'Inactive', color: 'text-amber-400', bgColor: 'bg-amber-500/10', borderColor: 'border-amber-500/20' };
    } else {
      return { status: 'disconnected', label: 'Not Connected', color: 'text-red-400', bgColor: 'bg-red-500/10', borderColor: 'border-red-500/20' };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="animate-spin text-slate-400" size={24} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-white mb-2">Platform Integrations</h2>
          <p className="text-sm text-slate-400">
            Manage AlfiePRO system-wide integrations for YouTube, Stripe, and other services
          </p>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="px-4 py-2 bg-gradient-to-r from-sky-500 to-cyan-600 text-white rounded-lg hover:from-sky-600 hover:to-cyan-700 transition-all flex items-center gap-2"
        >
          <Plus size={18} />
          Add Integration
        </button>
      </div>

      {/* Info Banner */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/10 backdrop-blur-sm p-4">
        <div className="flex items-start gap-3">
          <AlertCircle className="text-blue-400 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm text-blue-200 font-medium mb-1">Platform-Level Integrations</p>
            <p className="text-xs text-blue-300/80 leading-relaxed">
              These integrations are available system-wide. Default integrations (like YouTube) are used by organizations that haven't connected their own accounts.
            </p>
          </div>
        </div>
      </div>

      {/* Integrations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {integrations.map((integration) => {
          const status = getConnectionStatus(integration);
          return (
            <div
              key={integration.id}
              className="rounded-xl border border-slate-700/50 bg-slate-800/30 backdrop-blur-sm p-5 hover:border-slate-600/50 transition-all"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-slate-700/50">
                    {getPlatformIcon(integration.platform)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-white">
                      {getPlatformName(integration.platform)}
                    </h3>
                    {integration.is_default && (
                      <span className="text-xs text-sky-400 font-medium">Default</span>
                    )}
                  </div>
                </div>
              </div>

              <p className="text-sm text-slate-400 mb-4 line-clamp-2">
                {getIntegrationDescription(integration)}
              </p>

              {/* Status Badge */}
              <div className="mb-4">
                <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${status.bgColor} ${status.color} border ${status.borderColor}`}>
                  {status.status === 'connected' && <CheckCircle2 size={12} />}
                  {status.status === 'disconnected' && <XCircle size={12} />}
                  {status.label}
                </span>
              </div>

              {/* Connection Info */}
              {integration.connected_at && (
                <div className="text-xs text-slate-500 mb-4">
                  Connected {new Date(integration.connected_at).toLocaleDateString()}
                </div>
              )}

              {/* Actions */}
              <div className="flex items-center gap-2 pt-3 border-t border-slate-700/50">
                <button
                  onClick={() => handleToggleActive(integration)}
                  className={`flex-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    integration.is_active
                      ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20'
                      : 'bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 border border-emerald-500/20'
                  }`}
                >
                  {integration.is_active ? 'Deactivate' : 'Activate'}
                </button>
                <button
                  onClick={() => handleReconnect(integration)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 border border-blue-500/20 transition-colors"
                  title="Reconnect"
                >
                  <RefreshCw size={14} />
                </button>
                <button
                  onClick={() => handleDelete(integration)}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/10 text-red-400 hover:bg-red-500/20 border border-red-500/20 transition-colors"
                  title="Delete"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {integrations.length === 0 && (
        <div className="text-center py-12">
          <Database className="mx-auto mb-4 text-slate-600" size={48} />
          <h3 className="text-lg font-semibold text-slate-300 mb-2">No Integrations Yet</h3>
          <p className="text-sm text-slate-500 mb-6">
            Add your first platform integration to get started
          </p>
          <button
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2 bg-gradient-to-r from-sky-500 to-cyan-600 text-white rounded-lg hover:from-sky-600 hover:to-cyan-700 transition-all"
          >
            Add Integration
          </button>
        </div>
      )}

      {/* Add Integration Modal (placeholder) */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-6 max-w-md w-full">
            <h3 className="text-xl font-bold text-white mb-4">Add Platform Integration</h3>
            <p className="text-sm text-slate-400 mb-6">
              Integration setup is currently managed through the admin console. Please use the appropriate OAuth flow for each platform.
            </p>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAddModal(false)}
                className="px-4 py-2 bg-slate-700 text-white rounded-lg hover:bg-slate-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
