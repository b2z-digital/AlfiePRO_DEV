import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Plus, Search, Trash2, Pencil, X, Upload, Download, Flag, ChevronDown, ChevronUp, Save, Loader as Loader2, Sailboat } from 'lucide-react';
import {
  getRaceOfficerContacts,
  addRaceOfficerContact,
  updateRaceOfficerContact,
  deleteRaceOfficerContact,
  bulkAddRaceOfficerContacts,
  getBoatClasses,
  RaceOfficerContact,
  RaceOfficerContactInput,
  SkipperBoat
} from '../../utils/raceOfficerContactsStorage';
import { useNotifications } from '../../contexts/NotificationContext';

interface RaceOfficerContactsPageProps {
  darkMode: boolean;
}

const DIVISIONS = ['Junior', 'Open', 'Masters', 'Grand Masters'];

const EMPTY_BOAT: SkipperBoat = { class: '', sail_number: '', design: '' };

interface SkipperFormData {
  name: string;
  club_name: string;
  country: string;
  division: string;
  boats: SkipperBoat[];
  notes: string;
}

const EMPTY_FORM: SkipperFormData = {
  name: '',
  club_name: '',
  country: '',
  division: '',
  boats: [{ ...EMPTY_BOAT }],
  notes: '',
};

export const RaceOfficerContactsPage: React.FC<RaceOfficerContactsPageProps> = ({ darkMode }) => {
  const { addNotification } = useNotifications();
  const [contacts, setContacts] = useState<RaceOfficerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<SkipperFormData>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'club_name' | 'division'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const [boatClassOptions, setBoatClassOptions] = useState<{ id: string; name: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadContacts();
    loadBoatClasses();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const data = await getRaceOfficerContacts();
    setContacts(data);
    setLoading(false);
  };

  const loadBoatClasses = async () => {
    const classes = await getBoatClasses();
    setBoatClassOptions(classes);
  };

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.club_name.toLowerCase().includes(term) ||
        c.division?.toLowerCase().includes(term) ||
        c.boats.some(b =>
          b.class.toLowerCase().includes(term) ||
          b.sail_number.toLowerCase().includes(term) ||
          b.design.toLowerCase().includes(term)
        )
      );
    }
    result.sort((a, b) => {
      const aVal = ((a as any)[sortField] || '').toLowerCase();
      const bVal = ((b as any)[sortField] || '').toLowerCase();
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return result;
  }, [contacts, searchTerm, sortField, sortAsc]);

  const totalBoats = useMemo(() => {
    return contacts.reduce((sum, c) => sum + c.boats.length, 0);
  }, [contacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    setSaving(true);
    try {
      const payload: Partial<RaceOfficerContactInput> = {
        name: formData.name,
        club_name: formData.club_name,
        country: formData.country,
        division: formData.division,
        boats: formData.boats.filter(b => b.class || b.sail_number || b.design),
        notes: formData.notes,
      };

      if (editingId) {
        const updated = await updateRaceOfficerContact(editingId, payload);
        if (updated) {
          setContacts(prev => prev.map(c => c.id === editingId ? updated : c));
          addNotification('success', 'Skipper updated');
        }
      } else {
        const created = await addRaceOfficerContact(payload);
        if (created) {
          setContacts(prev => [...prev, created]);
          addNotification('success', 'Skipper added');
        }
      }
      resetForm();
    } catch {
      addNotification('error', 'Failed to save skipper');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact: RaceOfficerContact) => {
    setEditingId(contact.id);
    setFormData({
      name: contact.name,
      club_name: contact.club_name,
      country: contact.country || '',
      division: contact.division || '',
      boats: contact.boats.length > 0 ? [...contact.boats] : [{ ...EMPTY_BOAT }],
      notes: contact.notes || '',
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const success = await deleteRaceOfficerContact(id);
    if (success) {
      setContacts(prev => prev.filter(c => c.id !== id));
      addNotification('success', 'Skipper deleted');
    }
    setDeleteConfirm(null);
  };

  const resetForm = () => {
    setFormData(EMPTY_FORM);
    setEditingId(null);
    setShowForm(false);
  };

  const handleSort = (field: typeof sortField) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
  };

  const addBoat = () => {
    setFormData(prev => ({ ...prev, boats: [...prev.boats, { ...EMPTY_BOAT }] }));
  };

  const removeBoat = (index: number) => {
    setFormData(prev => ({
      ...prev,
      boats: prev.boats.length > 1 ? prev.boats.filter((_, i) => i !== index) : [{ ...EMPTY_BOAT }],
    }));
  };

  const updateBoat = (index: number, field: keyof SkipperBoat, value: string) => {
    setFormData(prev => ({
      ...prev,
      boats: prev.boats.map((b, i) => i === index ? { ...b, [field]: value } : b),
    }));
  };

  const handleCsvImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const lines = importText.trim().split('\n');
      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('name') || header.includes('sail') || header.includes('class');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const parsed: Partial<RaceOfficerContactInput>[] = dataLines
        .filter(line => line.trim())
        .map(line => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          const boats: SkipperBoat[] = [];
          if (cols[3] || cols[4] || cols[5]) {
            boats.push({ class: cols[3] || '', sail_number: cols[4] || '', design: cols[5] || '' });
          }
          return {
            name: cols[0] || '',
            club_name: cols[1] || '',
            country: cols[2] || '',
            boats,
          };
        })
        .filter(c => c.name);

      if (parsed.length === 0) {
        addNotification('error', 'No valid skippers found in CSV');
        return;
      }

      const created = await bulkAddRaceOfficerContacts(parsed);
      setContacts(prev => [...prev, ...created]);
      addNotification('success', `Imported ${created.length} skipper${created.length !== 1 ? 's' : ''}`);
      setShowImport(false);
      setImportText('');
    } catch {
      addNotification('error', 'Failed to import skippers');
    } finally {
      setImporting(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportText(ev.target?.result as string || '');
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const exportContacts = () => {
    const header = 'Name,Club,Country,Division,Class,Sail Number,Design';
    const rows: string[] = [];
    contacts.forEach(c => {
      if (c.boats.length === 0) {
        rows.push([c.name, c.club_name, c.country, c.division, '', '', '']
          .map(v => `"${(v || '').replace(/"/g, '""')}"`)
          .join(','));
      } else {
        c.boats.forEach((boat, i) => {
          rows.push([
            i === 0 ? c.name : '',
            i === 0 ? c.club_name : '',
            i === 0 ? c.country : '',
            i === 0 ? c.division : '',
            boat.class,
            boat.sail_number,
            boat.design,
          ].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(','));
        });
      }
    });
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `skippers_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortIcon = ({ field }: { field: typeof sortField }) => {
    if (sortField !== field) return <ChevronDown size={14} className="opacity-30" />;
    return sortAsc ? <ChevronUp size={14} /> : <ChevronDown size={14} />;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-500" size={32} />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto">
      <div className="p-6 sm:p-8 lg:p-16 space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-gradient-to-br from-sky-500 to-blue-600">
              <Users className="text-white" size={24} />
            </div>
            <div>
              <h1 className={`text-2xl font-bold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Skippers
              </h1>
              <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                {contacts.length} skipper{contacts.length !== 1 ? 's' : ''}
                {totalBoats > 0 && ` | ${totalBoats} boat${totalBoats !== 1 ? 's' : ''} registered`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowImport(true)}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Upload size={16} />
              Import
            </button>
            {contacts.length > 0 && (
              <button
                onClick={exportContacts}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Download size={16} />
                Export
              </button>
            )}
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Add Skipper
            </button>
          </div>
        </div>

        {/* Import Panel */}
        {showImport && (
          <div className={`rounded-xl border p-5 ${
            darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                Import Skippers from CSV
              </h3>
              <button onClick={() => { setShowImport(false); setImportText(''); }}>
                <X size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              </button>
            </div>
            <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Format: Name, Club, Country, Class, Sail Number, Design (one per line)
            </p>
            <div className="flex gap-2 mb-3">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,.txt"
                onChange={handleFileUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm ${
                  darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Upload size={14} />
                Choose File
              </button>
            </div>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder={`John Smith, Lake Sailing Club, Australia, IOM, AUS 123, Kantun 2\nJane Doe, Bay Club, Australia, 10R, AUS 456, Ikon`}
              rows={6}
              className={`w-full rounded-lg p-3 text-sm font-mono border ${
                darkMode
                  ? 'bg-slate-900/50 border-slate-600 text-white placeholder-slate-500'
                  : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
            <div className="flex justify-end gap-2 mt-3">
              <button
                onClick={() => { setShowImport(false); setImportText(''); }}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-700'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleCsvImport}
                disabled={importing || !importText.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing ? <Loader2 size={16} className="animate-spin" /> : <Upload size={16} />}
                Import
              </button>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        {showForm && (
          <div className={`rounded-xl border p-5 ${
            darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="flex items-center justify-between mb-4">
              <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                {editingId ? 'Edit Skipper' : 'New Skipper'}
              </h3>
              <button onClick={resetForm}>
                <X size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
              </button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Skipper Details */}
              <div>
                <h4 className={`text-xs font-semibold uppercase tracking-wider mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Skipper Details
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={formData.name}
                      onChange={e => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 text-sm border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                      placeholder="John Smith"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Club
                    </label>
                    <input
                      type="text"
                      value={formData.club_name}
                      onChange={e => setFormData(prev => ({ ...prev, club_name: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 text-sm border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                      placeholder="Lake Sailing Club"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Country
                    </label>
                    <input
                      type="text"
                      value={formData.country}
                      onChange={e => setFormData(prev => ({ ...prev, country: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 text-sm border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                      placeholder="Australia"
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Division
                    </label>
                    <select
                      value={formData.division}
                      onChange={e => setFormData(prev => ({ ...prev, division: e.target.value }))}
                      className={`w-full rounded-lg px-3 py-2 text-sm border ${
                        darkMode
                          ? 'bg-slate-900/50 border-slate-600 text-white'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="">-- None --</option>
                      {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              {/* Boats Section */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className={`text-xs font-semibold uppercase tracking-wider ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                    Boats
                  </h4>
                  <button
                    type="button"
                    onClick={addBoat}
                    className="flex items-center gap-1 text-xs font-medium text-blue-500 hover:text-blue-400 transition-colors"
                  >
                    <Plus size={14} />
                    Add Boat
                  </button>
                </div>
                <div className="space-y-3">
                  {formData.boats.map((boat, index) => (
                    <div
                      key={index}
                      className={`flex items-start gap-3 p-3 rounded-lg border ${
                        darkMode ? 'bg-slate-900/30 border-slate-700' : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <Sailboat size={16} className={`mt-2 flex-shrink-0 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`} />
                      <div className="flex-1 grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Class
                          </label>
                          <select
                            value={boat.class}
                            onChange={e => updateBoat(index, 'class', e.target.value)}
                            className={`w-full rounded-lg px-3 py-2 text-sm border ${
                              darkMode
                                ? 'bg-slate-800 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            }`}
                          >
                            <option value="">Select class...</option>
                            {boatClassOptions.map(bc => (
                              <option key={bc.id} value={bc.name}>{bc.name}</option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Sail Number
                          </label>
                          <input
                            type="text"
                            value={boat.sail_number}
                            onChange={e => updateBoat(index, 'sail_number', e.target.value)}
                            className={`w-full rounded-lg px-3 py-2 text-sm border ${
                              darkMode
                                ? 'bg-slate-800 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            }`}
                            placeholder="AUS 123"
                          />
                        </div>
                        <div>
                          <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                            Design
                          </label>
                          <input
                            type="text"
                            value={boat.design}
                            onChange={e => updateBoat(index, 'design', e.target.value)}
                            className={`w-full rounded-lg px-3 py-2 text-sm border ${
                              darkMode
                                ? 'bg-slate-800 border-slate-600 text-white'
                                : 'bg-white border-slate-300 text-slate-900'
                            }`}
                            placeholder="Kantun 2"
                          />
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeBoat(index)}
                        className={`mt-6 p-1.5 rounded-lg transition-colors ${
                          darkMode ? 'hover:bg-slate-700 text-slate-500 hover:text-red-400' : 'hover:bg-slate-200 text-slate-400 hover:text-red-500'
                        }`}
                        title="Remove boat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={e => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  rows={2}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="Any additional notes..."
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-700'
                  }`}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving || !formData.name.trim()}
                  className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                  {editingId ? 'Update' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Search */}
        {contacts.length > 0 && (
          <div className="relative">
            <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${
              darkMode ? 'text-slate-500' : 'text-slate-400'
            }`} />
            <input
              type="text"
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              placeholder="Search by name, club, class, sail number or division..."
              className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border ${
                darkMode
                  ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500'
                  : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
              }`}
            />
          </div>
        )}

        {/* Table */}
        {filteredContacts.length > 0 ? (
          <div className={`rounded-xl border overflow-hidden ${
            darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={darkMode ? 'bg-slate-800' : 'bg-slate-50'}>
                    <th className="text-left px-4 py-3">
                      <button onClick={() => handleSort('name')} className={`flex items-center gap-1 font-semibold ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Name <SortIcon field="name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3">
                      <button onClick={() => handleSort('club_name')} className={`flex items-center gap-1 font-semibold ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Club <SortIcon field="club_name" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 hidden md:table-cell">
                      <button onClick={() => handleSort('division')} className={`flex items-center gap-1 font-semibold ${
                        darkMode ? 'text-slate-300' : 'text-slate-700'
                      }`}>
                        Division <SortIcon field="division" />
                      </button>
                    </th>
                    <th className="text-left px-4 py-3 hidden lg:table-cell">
                      <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Boats</span>
                    </th>
                    <th className="text-right px-4 py-3">
                      <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className={`divide-y ${darkMode ? 'divide-slate-700/50' : 'divide-slate-100'}`}>
                  {filteredContacts.map(contact => (
                    <tr key={contact.id} className={`transition-colors ${
                      darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'
                    }`}>
                      <td className="px-4 py-3">
                        <div className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                          {contact.name}
                        </div>
                        {contact.country && (
                          <div className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            {contact.country}
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        {contact.club_name || '-'}
                      </td>
                      <td className={`px-4 py-3 hidden md:table-cell`}>
                        {contact.division ? (
                          <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                            darkMode ? 'bg-teal-500/20 text-teal-300' : 'bg-teal-50 text-teal-700'
                          }`}>
                            {contact.division}
                          </span>
                        ) : (
                          <span className={darkMode ? 'text-slate-600' : 'text-slate-300'}>-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell">
                        {contact.boats.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {contact.boats.map((boat, i) => (
                              <span
                                key={i}
                                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium ${
                                  darkMode ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-50 text-sky-700'
                                }`}
                                title={[boat.class, boat.sail_number, boat.design].filter(Boolean).join(' - ')}
                              >
                                {boat.class || 'Unknown'}
                                {boat.sail_number && (
                                  <span className={`${darkMode ? 'text-sky-400/70' : 'text-sky-500/70'}`}>
                                    {boat.sail_number}
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className={darkMode ? 'text-slate-600' : 'text-slate-300'}>-</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleEdit(contact)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-white' : 'hover:bg-slate-100 text-slate-400 hover:text-slate-700'
                            }`}
                            title="Edit"
                          >
                            <Pencil size={14} />
                          </button>
                          {deleteConfirm === contact.id ? (
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleDelete(contact.id)}
                                className="p-1.5 rounded-lg bg-red-600 text-white hover:bg-red-700 transition-colors"
                                title="Confirm delete"
                              >
                                <Trash2 size={14} />
                              </button>
                              <button
                                onClick={() => setDeleteConfirm(null)}
                                className={`p-1.5 rounded-lg transition-colors ${
                                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-400'
                                }`}
                                title="Cancel"
                              >
                                <X size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setDeleteConfirm(contact.id)}
                              className={`p-1.5 rounded-lg transition-colors ${
                                darkMode ? 'hover:bg-slate-700 text-slate-400 hover:text-red-400' : 'hover:bg-slate-100 text-slate-400 hover:text-red-500'
                              }`}
                              title="Delete"
                            >
                              <Trash2 size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : contacts.length > 0 && searchTerm ? (
          <div className={`text-center py-12 rounded-xl border ${
            darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <Search size={40} className={`mx-auto mb-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <p className={`font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              No skippers match "{searchTerm}"
            </p>
          </div>
        ) : (
          <div className={`text-center py-16 rounded-xl border ${
            darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <Flag size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
            <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              No Skippers Yet
            </h3>
            <p className={`text-sm mb-6 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Build your address book of skippers and their boats. Add them manually, import from CSV, or save them when importing race entries.
            </p>
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setShowImport(true)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium ${
                  darkMode
                    ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                <Upload size={16} />
                Import CSV
              </button>
              <button
                onClick={() => { resetForm(); setShowForm(true); }}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                <Plus size={16} />
                Add Skipper
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
