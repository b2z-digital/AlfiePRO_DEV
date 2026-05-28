import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Users, Plus, Search, Trash2, Pencil, X, Upload, Download, Sailboat, Phone, Mail, Building, Flag, MapPin, FileText, ChevronDown, ChevronUp, Save, Loader as Loader2, CircleAlert as AlertCircle } from 'lucide-react';
import {
  getRaceOfficerContacts,
  addRaceOfficerContact,
  updateRaceOfficerContact,
  deleteRaceOfficerContact,
  bulkAddRaceOfficerContacts,
  RaceOfficerContact,
  RaceOfficerContactInput
} from '../../utils/raceOfficerContactsStorage';
import { useNotifications } from '../../contexts/NotificationContext';

interface RaceOfficerContactsPageProps {
  darkMode: boolean;
}

const EMPTY_FORM: Partial<RaceOfficerContactInput> = {
  name: '',
  sail_number: '',
  boat_class: '',
  boat_name: '',
  club_name: '',
  email: '',
  phone: '',
  notes: '',
  country: '',
  state: '',
};

export const RaceOfficerContactsPage: React.FC<RaceOfficerContactsPageProps> = ({ darkMode }) => {
  const { addNotification } = useNotifications();
  const [contacts, setContacts] = useState<RaceOfficerContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<RaceOfficerContactInput>>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [sortField, setSortField] = useState<'name' | 'sail_number' | 'boat_class' | 'club_name'>('name');
  const [sortAsc, setSortAsc] = useState(true);
  const [showImport, setShowImport] = useState(false);
  const [importText, setImportText] = useState('');
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    setLoading(true);
    const data = await getRaceOfficerContacts();
    setContacts(data);
    setLoading(false);
  };

  const filteredContacts = useMemo(() => {
    let result = contacts;
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(c =>
        c.name.toLowerCase().includes(term) ||
        c.sail_number.toLowerCase().includes(term) ||
        c.boat_class.toLowerCase().includes(term) ||
        c.club_name.toLowerCase().includes(term) ||
        c.email.toLowerCase().includes(term)
      );
    }
    result.sort((a, b) => {
      const aVal = (a[sortField] || '').toLowerCase();
      const bVal = (b[sortField] || '').toLowerCase();
      return sortAsc ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
    });
    return result;
  }, [contacts, searchTerm, sortField, sortAsc]);

  const boatClasses = useMemo(() => {
    const classes = new Set(contacts.map(c => c.boat_class).filter(Boolean));
    return Array.from(classes).sort();
  }, [contacts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name?.trim()) return;

    setSaving(true);
    try {
      if (editingId) {
        const updated = await updateRaceOfficerContact(editingId, formData);
        if (updated) {
          setContacts(prev => prev.map(c => c.id === editingId ? updated : c));
          addNotification('success', 'Contact updated');
        }
      } else {
        const created = await addRaceOfficerContact(formData);
        if (created) {
          setContacts(prev => [...prev, created]);
          addNotification('success', 'Contact added');
        }
      }
      resetForm();
    } catch {
      addNotification('error', 'Failed to save contact');
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (contact: RaceOfficerContact) => {
    setEditingId(contact.id);
    setFormData({
      name: contact.name,
      sail_number: contact.sail_number,
      boat_class: contact.boat_class,
      boat_name: contact.boat_name,
      club_name: contact.club_name,
      email: contact.email,
      phone: contact.phone,
      notes: contact.notes,
      country: contact.country,
      state: contact.state,
    });
    setShowForm(true);
  };

  const handleDelete = async (id: string) => {
    const success = await deleteRaceOfficerContact(id);
    if (success) {
      setContacts(prev => prev.filter(c => c.id !== id));
      addNotification('success', 'Contact deleted');
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

  const handleCsvImport = async () => {
    if (!importText.trim()) return;
    setImporting(true);
    try {
      const lines = importText.trim().split('\n');
      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('name') || header.includes('sail');
      const dataLines = hasHeader ? lines.slice(1) : lines;

      const parsed: Partial<RaceOfficerContactInput>[] = dataLines
        .filter(line => line.trim())
        .map(line => {
          const cols = line.split(',').map(c => c.trim().replace(/^"|"$/g, ''));
          return {
            name: cols[0] || '',
            sail_number: cols[1] || '',
            boat_class: cols[2] || '',
            boat_name: cols[3] || '',
            club_name: cols[4] || '',
            email: cols[5] || '',
            phone: cols[6] || '',
          };
        })
        .filter(c => c.name);

      if (parsed.length === 0) {
        addNotification('error', 'No valid contacts found in CSV');
        return;
      }

      const created = await bulkAddRaceOfficerContacts(parsed);
      setContacts(prev => [...prev, ...created]);
      addNotification('success', `Imported ${created.length} contact${created.length !== 1 ? 's' : ''}`);
      setShowImport(false);
      setImportText('');
    } catch {
      addNotification('error', 'Failed to import contacts');
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
    const header = 'Name,Sail Number,Boat Class,Boat Name,Club,Email,Phone';
    const rows = contacts.map(c =>
      [c.name, c.sail_number, c.boat_class, c.boat_name, c.club_name, c.email, c.phone]
        .map(v => `"${(v || '').replace(/"/g, '""')}"`)
        .join(',')
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `race_officer_contacts_${new Date().toISOString().slice(0, 10)}.csv`;
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
              {contacts.length} skipper{contacts.length !== 1 ? 's' : ''} saved
              {boatClasses.length > 0 && ` across ${boatClasses.length} class${boatClasses.length !== 1 ? 'es' : ''}`}
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

      {showImport && (
        <div className={`rounded-xl border p-5 ${
          darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-3">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Import Contacts from CSV
            </h3>
            <button onClick={() => { setShowImport(false); setImportText(''); }}>
              <X size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            </button>
          </div>
          <p className={`text-sm mb-3 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Format: Name, Sail Number, Boat Class, Boat Name, Club, Email, Phone (one per line)
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
            placeholder={`John Smith, AUS 123, IOM, Speedy, Lake Sailing Club, john@email.com, 0412345678\nJane Doe, AUS 456, DF65, Wind Rider, Bay Club, jane@email.com, 0498765432`}
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

      {showForm && (
        <div className={`rounded-xl border p-5 ${
          darkMode ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <div className="flex items-center justify-between mb-4">
            <h3 className={`font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {editingId ? 'Edit Contact' : 'New Contact'}
            </h3>
            <button onClick={resetForm}>
              <X size={18} className={darkMode ? 'text-slate-400' : 'text-slate-500'} />
            </button>
          </div>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Name *
                </label>
                <input
                  type="text"
                  required
                  value={formData.name || ''}
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
                  Sail Number
                </label>
                <input
                  type="text"
                  value={formData.sail_number || ''}
                  onChange={e => setFormData(prev => ({ ...prev, sail_number: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="AUS 123"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Boat Class
                </label>
                <input
                  type="text"
                  value={formData.boat_class || ''}
                  onChange={e => setFormData(prev => ({ ...prev, boat_class: e.target.value }))}
                  list="boat-class-options"
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="IOM"
                />
                {boatClasses.length > 0 && (
                  <datalist id="boat-class-options">
                    {boatClasses.map(bc => <option key={bc} value={bc} />)}
                  </datalist>
                )}
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Boat Name
                </label>
                <input
                  type="text"
                  value={formData.boat_name || ''}
                  onChange={e => setFormData(prev => ({ ...prev, boat_name: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="Lightning"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Club
                </label>
                <input
                  type="text"
                  value={formData.club_name || ''}
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
                  Email
                </label>
                <input
                  type="email"
                  value={formData.email || ''}
                  onChange={e => setFormData(prev => ({ ...prev, email: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="john@email.com"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Phone
                </label>
                <input
                  type="text"
                  value={formData.phone || ''}
                  onChange={e => setFormData(prev => ({ ...prev, phone: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="04XX XXX XXX"
                />
              </div>
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Country
                </label>
                <input
                  type="text"
                  value={formData.country || ''}
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
                  State
                </label>
                <input
                  type="text"
                  value={formData.state || ''}
                  onChange={e => setFormData(prev => ({ ...prev, state: e.target.value }))}
                  className={`w-full rounded-lg px-3 py-2 text-sm border ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-white'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                  placeholder="NSW"
                />
              </div>
            </div>
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Notes
              </label>
              <textarea
                value={formData.notes || ''}
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
                disabled={saving || !formData.name?.trim()}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
                {editingId ? 'Update' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}

      {contacts.length > 0 && (
        <div className="relative">
          <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${
            darkMode ? 'text-slate-500' : 'text-slate-400'
          }`} />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search contacts by name, sail number, class, club or email..."
            className={`w-full pl-9 pr-4 py-2.5 rounded-xl text-sm border ${
              darkMode
                ? 'bg-slate-800/80 border-slate-700 text-white placeholder-slate-500'
                : 'bg-white border-slate-200 text-slate-900 placeholder-slate-400'
            }`}
          />
        </div>
      )}

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
                    <button onClick={() => handleSort('sail_number')} className={`flex items-center gap-1 font-semibold ${
                      darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      Sail # <SortIcon field="sail_number" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3">
                    <button onClick={() => handleSort('boat_class')} className={`flex items-center gap-1 font-semibold ${
                      darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      Class <SortIcon field="boat_class" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">
                    <button onClick={() => handleSort('club_name')} className={`flex items-center gap-1 font-semibold ${
                      darkMode ? 'text-slate-300' : 'text-slate-700'
                    }`}>
                      Club <SortIcon field="club_name" />
                    </button>
                  </th>
                  <th className="text-left px-4 py-3 hidden xl:table-cell">
                    <span className={`font-semibold ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>Contact</span>
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
                      {contact.boat_name && (
                        <div className={`text-xs mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          {contact.boat_name}
                        </div>
                      )}
                    </td>
                    <td className={`px-4 py-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      {contact.sail_number || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {contact.boat_class ? (
                        <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                          darkMode ? 'bg-sky-500/20 text-sky-300' : 'bg-sky-50 text-sky-700'
                        }`}>
                          {contact.boat_class}
                        </span>
                      ) : '-'}
                    </td>
                    <td className={`px-4 py-3 hidden lg:table-cell ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {contact.club_name || '-'}
                    </td>
                    <td className="px-4 py-3 hidden xl:table-cell">
                      <div className="flex items-center gap-3">
                        {contact.email && (
                          <a href={`mailto:${contact.email}`} className="text-blue-500 hover:text-blue-400" title={contact.email}>
                            <Mail size={14} />
                          </a>
                        )}
                        {contact.phone && (
                          <a href={`tel:${contact.phone}`} className="text-green-500 hover:text-green-400" title={contact.phone}>
                            <Phone size={14} />
                          </a>
                        )}
                        {!contact.email && !contact.phone && (
                          <span className={`text-xs ${darkMode ? 'text-slate-600' : 'text-slate-300'}`}>-</span>
                        )}
                      </div>
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
            No contacts match "{searchTerm}"
          </p>
        </div>
      ) : (
        <div className={`text-center py-16 rounded-xl border ${
          darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-slate-200'
        }`}>
          <Flag size={48} className={`mx-auto mb-4 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
          <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
            No Contacts Yet
          </h3>
          <p className={`text-sm mb-6 max-w-md mx-auto ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
            Build your address book of skippers and participants. Add them manually, import from CSV, or save them when importing race entries.
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
