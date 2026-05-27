import React, { useState, useEffect } from 'react';
import { Building2, Plus, CreditCard as Edit2, Trash2, Search, Globe, Mail, X, Check, Loader as Loader2 } from 'lucide-react';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface ExternalOrganization {
  id: string;
  name: string;
  abbreviation: string;
  contact_email: string;
  website_url: string;
  description: string;
  created_at: string;
}

interface ExternalOrganizationsPageProps {
  darkMode: boolean;
}

export const ExternalOrganizationsPage: React.FC<ExternalOrganizationsPageProps> = ({ darkMode }) => {
  const { user } = useAuth();
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingOrg, setEditingOrg] = useState<ExternalOrganization | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    abbreviation: '',
    contact_email: '',
    website_url: '',
    description: '',
  });

  useEffect(() => {
    if (user) loadOrganizations();
  }, [user]);

  const loadOrganizations = async () => {
    try {
      const { data, error } = await supabase
        .from('external_organizations')
        .select('*')
        .eq('user_id', user!.id)
        .order('name', { ascending: true });

      if (error) throw error;
      setOrganizations(data || []);
    } catch (err) {
      console.error('Error loading organizations:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.name.trim()) return;
    setSaving(true);

    try {
      if (editingOrg) {
        const { error } = await supabase
          .from('external_organizations')
          .update({
            name: formData.name.trim(),
            abbreviation: formData.abbreviation.trim(),
            contact_email: formData.contact_email.trim(),
            website_url: formData.website_url.trim(),
            description: formData.description.trim(),
          })
          .eq('id', editingOrg.id);

        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('external_organizations')
          .insert({
            user_id: user!.id,
            name: formData.name.trim(),
            abbreviation: formData.abbreviation.trim(),
            contact_email: formData.contact_email.trim(),
            website_url: formData.website_url.trim(),
            description: formData.description.trim(),
          });

        if (error) throw error;
      }

      resetForm();
      loadOrganizations();
    } catch (err) {
      console.error('Error saving organization:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const { error } = await supabase
        .from('external_organizations')
        .delete()
        .eq('id', id);

      if (error) throw error;
      setOrganizations(prev => prev.filter(o => o.id !== id));
    } catch (err) {
      console.error('Error deleting organization:', err);
    } finally {
      setDeleting(null);
    }
  };

  const handleEdit = (org: ExternalOrganization) => {
    setEditingOrg(org);
    setFormData({
      name: org.name,
      abbreviation: org.abbreviation || '',
      contact_email: org.contact_email || '',
      website_url: org.website_url || '',
      description: org.description || '',
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setShowForm(false);
    setEditingOrg(null);
    setFormData({ name: '', abbreviation: '', contact_email: '', website_url: '', description: '' });
  };

  const filtered = organizations.filter(org =>
    org.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (org.abbreviation || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-10 max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-white">Organizations</h1>
            <p className="text-sm text-slate-400 mt-1">Manage organizations you share results with (e.g. ARYA, state associations)</p>
          </div>
          <button
            onClick={() => { resetForm(); setShowForm(true); }}
            className="bg-sky-600 hover:bg-sky-700 text-white px-4 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Organization
          </button>
        </div>

        {showForm && (
          <div className="bg-slate-800/80 border border-slate-700 rounded-xl p-6 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-white">
                {editingOrg ? 'Edit Organization' : 'New Organization'}
              </h2>
              <button onClick={resetForm} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g. Australian Radio Yacht Association"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Abbreviation</label>
                <input
                  type="text"
                  value={formData.abbreviation}
                  onChange={e => setFormData(prev => ({ ...prev, abbreviation: e.target.value }))}
                  placeholder="e.g. ARYA"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Contact Email</label>
                <input
                  type="email"
                  value={formData.contact_email}
                  onChange={e => setFormData(prev => ({ ...prev, contact_email: e.target.value }))}
                  placeholder="results@arya.org.au"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1">Website</label>
                <input
                  type="url"
                  value={formData.website_url}
                  onChange={e => setFormData(prev => ({ ...prev, website_url: e.target.value }))}
                  placeholder="https://arya.org.au"
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-300 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={e => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Brief description of this organization"
                  rows={2}
                  className="w-full px-3 py-2 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-4">
              <button onClick={resetForm} className="px-4 py-2 text-slate-300 hover:text-white transition-colors">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={!formData.name.trim() || saving}
                className="bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white px-5 py-2 rounded-lg font-medium flex items-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {editingOrg ? 'Update' : 'Save'}
              </button>
            </div>
          </div>
        )}

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search organizations..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>

        {loading ? (
          <div className="flex justify-center py-12">
            <div className="w-6 h-6 border-2 border-sky-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-slate-800/40 border border-slate-700 rounded-xl p-8 text-center">
            <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
            <h3 className="text-lg font-medium text-white mb-2">
              {searchTerm ? 'No matches found' : 'No organizations yet'}
            </h3>
            <p className="text-slate-400 text-sm mb-4">
              {searchTerm
                ? 'Try a different search term.'
                : 'Add organizations like ARYA or state associations to easily share your race results.'}
            </p>
            {!searchTerm && (
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="bg-sky-600 hover:bg-sky-700 text-white px-5 py-2.5 rounded-lg font-medium inline-flex items-center gap-2 transition-colors"
              >
                <Plus className="w-4 h-4" />
                Add Organization
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(org => (
              <div
                key={org.id}
                className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 flex items-center gap-4"
              >
                <div className="w-10 h-10 bg-slate-700 rounded-lg flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-slate-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-white font-medium truncate">{org.name}</p>
                    {org.abbreviation && (
                      <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded flex-shrink-0">
                        {org.abbreviation}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-slate-400 mt-0.5">
                    {org.contact_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {org.contact_email}
                      </span>
                    )}
                    {org.website_url && (
                      <span className="flex items-center gap-1">
                        <Globe className="w-3 h-3" /> {org.website_url.replace(/^https?:\/\//, '')}
                      </span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => handleEdit(org)}
                    className="p-2 text-slate-400 hover:text-white hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(org.id)}
                    disabled={deleting === org.id}
                    className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                  >
                    {deleting === org.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Trash2 className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
