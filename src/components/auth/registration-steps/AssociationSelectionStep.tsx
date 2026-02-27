import React, { useState, useEffect } from 'react';
import { Globe, Search, Building, CheckCircle } from 'lucide-react';
import { supabase } from '../../../utils/supabase';

interface Association {
  id: string;
  name: string;
  abbreviation: string | null;
  logo: string | null;
  state: string | null;
}

interface AssociationSelectionStepProps {
  selectedAssociationId: string;
  selectedAssociationName: string;
  onSelect: (id: string, name: string) => void;
  darkMode: boolean;
}

export const AssociationSelectionStep: React.FC<AssociationSelectionStepProps> = ({
  selectedAssociationId,
  onSelect,
  darkMode
}) => {
  const [associations, setAssociations] = useState<Association[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadAssociations();
  }, []);

  const loadAssociations = async () => {
    try {
      const { data, error } = await supabase
        .from('state_associations')
        .select('id, name, abbreviation, logo, state')
        .order('name', { ascending: true });

      if (error) throw error;
      setAssociations(data || []);
    } catch (error) {
      console.error('Error loading associations:', error);
    } finally {
      setLoading(false);
    }
  };

  const filtered = associations.filter(a =>
    a.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.abbreviation?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    a.state?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="text-center mb-6">
        <div className={`w-16 h-16 mx-auto rounded-2xl flex items-center justify-center mb-4 ${
          darkMode ? 'bg-sky-500/20' : 'bg-sky-50'
        }`}>
          <Globe className="text-sky-500" size={28} />
        </div>
        <h3 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
          Select Your Association
        </h3>
        <p className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Choose the state or national association your club belongs to
        </p>
      </div>

      <div className="relative">
        <Search className={`absolute left-3 top-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} size={18} />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search associations..."
          className={`w-full pl-10 pr-4 py-3 rounded-xl border transition-all duration-200 ${
            darkMode
              ? 'bg-slate-700/50 border-slate-600 text-white placeholder-slate-500 focus:bg-slate-700 focus:border-emerald-500'
              : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-emerald-500'
          } focus:outline-none focus:ring-2 focus:ring-emerald-500/20`}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12">
          <Building size={48} className={darkMode ? 'text-slate-600 mx-auto mb-3' : 'text-slate-300 mx-auto mb-3'} />
          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
            {searchQuery ? 'No associations found matching your search' : 'No associations available'}
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
          {filtered.map((assoc) => {
            const isSelected = selectedAssociationId === assoc.id;
            return (
              <button
                key={assoc.id}
                onClick={() => onSelect(assoc.id, assoc.name)}
                className={`w-full flex items-center gap-4 p-4 rounded-xl border transition-all duration-200 text-left ${
                  isSelected
                    ? darkMode
                      ? 'bg-emerald-500/15 border-emerald-500/50 ring-1 ring-emerald-500/30'
                      : 'bg-emerald-50 border-emerald-300 ring-1 ring-emerald-300'
                    : darkMode
                      ? 'bg-slate-700/30 border-slate-600/50 hover:bg-slate-700/50 hover:border-slate-500'
                      : 'bg-white border-slate-200 hover:bg-slate-50 hover:border-slate-300'
                }`}
              >
                {assoc.logo ? (
                  <img src={assoc.logo} alt={assoc.name} className="w-12 h-12 rounded-lg object-cover flex-shrink-0" />
                ) : (
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center flex-shrink-0 ${
                    darkMode ? 'bg-slate-600/50' : 'bg-slate-100'
                  }`}>
                    <Building className={darkMode ? 'text-slate-400' : 'text-slate-500'} size={20} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <div className={`font-semibold truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    {assoc.name}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    {assoc.abbreviation && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        darkMode ? 'bg-slate-600/50 text-slate-400' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {assoc.abbreviation}
                      </span>
                    )}
                    {assoc.state && (
                      <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                        {assoc.state}
                      </span>
                    )}
                  </div>
                </div>
                {isSelected && (
                  <CheckCircle className="text-emerald-500 flex-shrink-0" size={22} />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className={`p-4 rounded-xl border ${
        darkMode ? 'bg-slate-700/20 border-slate-600/30' : 'bg-blue-50 border-blue-200'
      }`}>
        <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
          Your club registration will be submitted to the selected association for approval. An association administrator will review and approve your application.
        </p>
      </div>
    </div>
  );
};
