import React, { useState, useEffect } from 'react';
import { Building2, Edit, Trash2, Plus, MapPin, Users, CheckCircle, Clock, XCircle } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../utils/supabase';
import { AddStateAssociationModal } from './AddStateAssociationModal';

interface StateAssociation {
  id: string;
  name: string;
  short_name?: string | null;
  state: string;
  logo_url: string | null;
  status: string;
  created_at: string;
  club_count?: number;
}

interface AssociationsManagementPageProps {
  darkMode: boolean;
}

export const AssociationsManagementPage: React.FC<AssociationsManagementPageProps> = ({ darkMode }) => {
  const { currentOrganization } = useAuth();
  const [associations, setAssociations] = useState<StateAssociation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddAssociationModal, setShowAddAssociationModal] = useState(false);
  const [editingAssociation, setEditingAssociation] = useState<StateAssociation | null>(null);

  useEffect(() => {
    loadAssociations();
  }, [currentOrganization]);

  const loadAssociations = async () => {
    if (!currentOrganization) return;

    try {
      setLoading(true);

      const { data, error } = await supabase
        .from('state_associations')
        .select(`
          id,
          name,
          short_name,
          state,
          logo_url,
          status,
          created_at
        `)
        .eq('national_association_id', currentOrganization.id)
        .order('name', { ascending: true });

      if (error) throw error;

      // Load club counts for each state association
      const associationsWithCounts = await Promise.all(
        (data || []).map(async (assoc) => {
          const { count } = await supabase
            .from('clubs')
            .select('*', { count: 'exact', head: true })
            .eq('state_association_id', assoc.id);

          return {
            ...assoc,
            club_count: count || 0
          };
        })
      );

      setAssociations(associationsWithCounts);
    } catch (error) {
      console.error('Error loading associations:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete ${name}? This action cannot be undone.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('state_associations')
        .delete()
        .eq('id', id);

      if (error) throw error;

      await loadAssociations();
    } catch (error) {
      console.error('Error deleting association:', error);
      alert('Failed to delete association. It may have associated clubs.');
    }
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      active: {
        bg: 'bg-green-500/20',
        text: 'text-green-400',
        border: 'border-green-500/30',
        icon: CheckCircle
      },
      pending: {
        bg: 'bg-amber-500/20',
        text: 'text-amber-400',
        border: 'border-amber-500/30',
        icon: Clock
      },
      inactive: {
        bg: 'bg-slate-500/20',
        text: 'text-slate-400',
        border: 'border-slate-500/30',
        icon: XCircle
      }
    };

    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${config.bg} ${config.text} ${config.border}`}>
        <Icon size={12} />
        {status.charAt(0).toUpperCase() + status.slice(1)}
      </span>
    );
  };

  const filteredAssociations = associations.filter(assoc =>
    assoc.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    assoc.state.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 sm:p-6 lg:p-16">
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className={`mt-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
              Loading associations...
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-4 sm:p-6 lg:p-16">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 rounded-xl bg-blue-600/20">
              <Building2 className="text-blue-400" size={28} />
            </div>
            <div>
              <h1 className={`text-3xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                State Associations
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Manage all state associations in your network
              </p>
            </div>
          </div>

          {/* Search and Actions */}
          <div className="flex flex-wrap gap-4 items-center justify-between">
            <input
              type="text"
              placeholder="Search associations..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={`flex-1 min-w-[300px] px-4 py-2.5 rounded-lg border ${
                darkMode
                  ? 'bg-slate-800 border-slate-700 text-slate-100 placeholder-slate-500'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
              } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            />
            <button
              onClick={() => setShowAddAssociationModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus size={20} />
              Add Association
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-blue-600/20">
                <Building2 className="text-blue-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Associations
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {associations.length}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-green-600/20">
                <CheckCircle className="text-green-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Active
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {associations.filter(a => a.status === 'active').length}
                </p>
              </div>
            </div>
          </div>

          <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-purple-600/20">
                <Users className="text-purple-400" size={24} />
              </div>
              <div>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Total Clubs
                </p>
                <p className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                  {associations.reduce((sum, a) => sum + (a.club_count || 0), 0)}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Associations Grid */}
        {filteredAssociations.length === 0 ? (
          <div className={`text-center py-16 rounded-xl border ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
            <Building2 size={64} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h3 className={`text-xl font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {searchQuery ? 'No associations found' : 'No associations yet'}
            </h3>
            <p className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
              {searchQuery ? 'Try a different search term' : 'Get started by adding your first state association'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredAssociations.map((assoc) => (
              <div
                key={assoc.id}
                className={`group p-6 rounded-xl border transition-all hover:shadow-lg ${
                  darkMode
                    ? 'bg-slate-800 border-slate-700 hover:border-blue-500/50'
                    : 'bg-white border-slate-200 hover:border-blue-300'
                }`}
              >
                {/* Header with Logo */}
                <div className="flex items-start gap-3 mb-4">
                  {assoc.logo_url ? (
                    <img
                      src={assoc.logo_url}
                      alt={assoc.name}
                      className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
                    />
                  ) : (
                    <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                      darkMode ? 'bg-slate-700' : 'bg-slate-100'
                    }`}>
                      <Building2 className={darkMode ? 'text-slate-500' : 'text-slate-400'} size={24} />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h3 className={`font-semibold text-base leading-tight ${darkMode ? 'text-slate-100' : 'text-slate-900'}`}>
                        {assoc.name}
                      </h3>
                      {getStatusBadge(assoc.status)}
                    </div>
                    <div className="flex items-center gap-1.5 text-sm">
                      <MapPin size={14} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                      <span className={darkMode ? 'text-slate-400' : 'text-slate-600'}>
                        {assoc.state}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Stats */}
                <div className={`flex items-center gap-4 mb-4 p-3 rounded-lg ${
                  darkMode ? 'bg-slate-900/50' : 'bg-slate-50'
                }`}>
                  <div className="flex items-center gap-2">
                    <Users size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    <span className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {assoc.club_count || 0} clubs
                    </span>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setEditingAssociation(assoc)}
                    className={`flex-1 flex items-center justify-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    onClick={() => handleDelete(assoc.id, assoc.name)}
                    className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                      darkMode
                        ? 'bg-red-900/30 hover:bg-red-900/50 text-red-400'
                        : 'bg-red-50 hover:bg-red-100 text-red-600'
                    }`}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add/Edit State Association Modal */}
      <AddStateAssociationModal
        isOpen={showAddAssociationModal || !!editingAssociation}
        onClose={() => {
          setShowAddAssociationModal(false);
          setEditingAssociation(null);
        }}
        onSuccess={() => {
          loadAssociations();
          setShowAddAssociationModal(false);
          setEditingAssociation(null);
        }}
        nationalAssociationId={currentOrganization?.id || ''}
        editingAssociation={editingAssociation}
        darkMode={darkMode}
      />
    </div>
  );
};
