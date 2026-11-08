import React, { useState, useEffect } from 'react';
import { Building2, Edit, Trash2, Plus, MapPin, Users, CheckCircle, Search } from 'lucide-react';
import { InlineLoading, KpiCard, OrgLogo, PageHead } from '../association/AssocUI';
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

  const getStatusBadge = (status?: string | null) => {
    const st = (status || 'active').toLowerCase();
    const tone = st === 'active' ? 'g' : st === 'pending' ? 'a' : '';
    return (
      <span className={`a-lb-fmt ${tone ? `a-txt-${tone}` : 'a-mute'}`}>
        <span className={`a-light ${tone ? `a-light-${tone}` : ''}`} />
        {st.charAt(0).toUpperCase() + st.slice(1)}
      </span>
    );
  };

  const filteredAssociations = associations.filter(assoc =>
    (assoc.name || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
    (assoc.state || '').toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalClubs = associations.reduce((sum, a) => sum + (a.club_count || 0), 0);
  const activeCount = associations.filter(a => (a.status || 'active') === 'active').length;

  if (loading) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="a-apage">
          <PageHead icon={<Building2 size={24} />} title="State associations" sub="Manage all state associations in your network" />
          <InlineLoading label="Loading associations…" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="a-apage">
        {/* Header */}
        <PageHead icon={<Building2 size={24} />} title="State associations" sub="Manage all state associations in your network">
          <label className="a-field" style={{ width: 280, maxWidth: '100%' }}>
            <Search size={16} />
            <input
              type="text"
              placeholder="Search associations"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search associations"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowAddAssociationModal(true)}
            className="a-btn a-btn-p"
          >
            <Plus size={16} />
            Add association
          </button>
        </PageHead>

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          <KpiCard cap="Associations" value={associations.length} sub="State associations in your network" icon={<Building2 size={18} />} />
          <KpiCard cap="Active" value={activeCount} sub={associations.length - activeCount > 0 ? `${associations.length - activeCount} not active` : 'All active'} icon={<CheckCircle size={18} />} tone={activeCount > 0 ? 'green' : undefined} />
          <KpiCard cap="Clubs" value={totalClubs} sub="Member clubs across all states" icon={<Users size={18} />} />
        </div>

        {/* Associations Grid */}
        {filteredAssociations.length === 0 ? (
          <div className="a-card a-empty py-16 px-6">
            <span className="a-tile" style={{ width: 60, height: 60 }}><Building2 size={26} /></span>
            <h3 className="a-ink text-lg font-semibold m-0">
              {searchQuery ? 'No associations found' : 'No associations yet'}
            </h3>
            <p className="a-mute text-sm m-0">
              {searchQuery ? 'Try a different search term' : 'Get started by adding your first state association'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
            {filteredAssociations.map((assoc) => (
              <article key={assoc.id} className="a-card a-clubcard">
                {/* Header with Logo */}
                <div className="flex items-start gap-3">
                  <OrgLogo src={assoc.logo_url} name={assoc.name} />
                  <div className="flex-1 min-w-0">
                    <h3 className="a-ink font-semibold text-[15.5px] leading-tight m-0">{assoc.name}</h3>
                    <div className="a-meta-row mt-1.5">
                      <span><MapPin size={13} />{assoc.state}</span>
                      <span><Users size={13} />{assoc.club_count || 0} club{(assoc.club_count || 0) === 1 ? '' : 's'}</span>
                    </div>
                  </div>
                  {getStatusBadge(assoc.status)}
                </div>

                {/* Actions */}
                <div className="flex gap-2 mt-auto">
                  <button
                    type="button"
                    onClick={() => setEditingAssociation(assoc)}
                    className="a-btn flex-1"
                  >
                    <Edit size={16} />
                    Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => handleDelete(assoc.id, assoc.name)}
                    className="a-btn a-btn-d a-btn-icon"
                    aria-label={`Delete ${assoc.name}`}
                    title="Delete"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
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
