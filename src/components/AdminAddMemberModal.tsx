import React, { useState, useEffect, useCallback } from 'react';
import { X, User, Mail, Phone, Home, Sailboat, Plus, Trash2, AlertTriangle, Check, Search, UserPlus, Globe, Award, Upload, FileUp, Loader, ChevronDown, ChevronUp, CheckCircle, AlertCircle } from 'lucide-react';
import { BoatType, MemberFormData, Member } from '../types/member';
import { addAdminMember } from '../utils/storage';
import { supabase } from '../utils/supabase';
import { getClubMemberClaims, acceptMemberClaim } from '../utils/multiClubMembershipStorage';
import { useAuth } from '../contexts/AuthContext';
import { SAILING_NATIONS, getCountryFlag } from '../utils/countryFlags';
import Papa from 'papaparse';

interface AdminAddMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  clubId: string;
  darkMode: boolean;
  onSuccess: () => void;
  members?: Member[];
}

type TabType = 'new' | 'claim' | 'import';

interface CSVFieldMapping {
  csvField: string;
  mappedTo: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  sampleData?: string;
}

type ImportStep = 'upload' | 'mapping' | 'importing' | 'complete';

const FIELD_OPTIONS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'country', label: 'Country' },
  { value: 'country_code', label: 'Country Code' },
  { value: 'category', label: 'Category (Junior/Open/Master etc.)' },
  { value: 'street', label: 'Street' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'date_joined', label: 'Date Joined' },
  { value: 'membership_level', label: 'Membership Level' },
  { value: 'membership_level_custom', label: 'Custom Membership Type' },
  { value: 'is_financial', label: 'Financial Status' },
  { value: 'amount_paid', label: 'Amount Paid' },
  { value: 'renewal_date', label: 'Renewal Date' },
  { value: 'boat_type', label: 'Boat Type' },
  { value: 'sail_number', label: 'Sail Number' },
  { value: 'hull', label: 'Hull' },
  { value: 'handicap', label: 'Handicap' },
  { value: 'emergency_contact_name', label: 'Emergency Contact Name' },
  { value: 'emergency_contact_phone', label: 'Emergency Contact Phone' },
  { value: 'emergency_contact_relationship', label: 'Emergency Contact Relationship' },
  { value: 'ignore', label: 'Ignore (Do Not Import)' }
];

const HIGH_CONFIDENCE_MATCHES: Record<string, string> = {
  'firstname': 'first_name',
  'fname': 'first_name',
  'givenname': 'first_name',
  'lastname': 'last_name',
  'lname': 'last_name',
  'surname': 'last_name',
  'familyname': 'last_name',
  'email': 'email',
  'emailaddress': 'email',
  'phone': 'phone',
  'phonenumber': 'phone',
  'mobile': 'phone',
  'contact': 'phone',
  'street': 'street',
  'address': 'street',
  'streetaddress': 'street',
  'city': 'city',
  'town': 'city',
  'suburb': 'city',
  'state': 'state',
  'postcode': 'postcode',
  'zip': 'postcode',
  'zipcode': 'postcode',
  'postal': 'postcode',
  'datejoined': 'date_joined',
  'joindate': 'date_joined',
  'membershipdate': 'date_joined',
  'membershiplevel': 'membership_level',
  'membertype': 'membership_level',
  'membershiptype': 'membership_level',
  'financial': 'is_financial',
  'isfinancial': 'is_financial',
  'amountpaid': 'amount_paid',
  'amount': 'amount_paid',
  'paid': 'amount_paid',
  'renewaldate': 'renewal_date',
  'boattype': 'boat_type',
  'boat': 'boat_type',
  'class': 'boat_type',
  'sailnumber': 'sail_number',
  'sail': 'sail_number',
  'number': 'sail_number',
  'hull': 'hull',
  'hullnumber': 'hull',
  'handicap': 'handicap',
  'emergencycontact': 'emergency_contact_name',
  'emergencyname': 'emergency_contact_name',
  'emergencyphone': 'emergency_contact_phone',
  'emergencyrelationship': 'emergency_contact_relationship',
  'country': 'country',
  'nation': 'country',
  'nationality': 'country',
  'countrycode': 'country_code',
  'countryiso': 'country_code',
  'isocode': 'country_code',
  'category': 'category',
  'competitorcategory': 'category',
  'agecategory': 'category',
  'agegroup': 'category',
  'division': 'category',
  'membershiplevelcustom': 'membership_level_custom',
  'custommembership': 'membership_level_custom',
  'membershipcustom': 'membership_level_custom',
};

export const AdminAddMemberModal: React.FC<AdminAddMemberModalProps> = ({
  isOpen,
  onClose,
  clubId,
  darkMode,
  onSuccess,
  members = []
}) => {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('new');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clubName, setClubName] = useState<string>('');

  const [pendingClaims, setPendingClaims] = useState<any[]>([]);
  const [loadingClaims, setLoadingClaims] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [fieldMappings, setFieldMappings] = useState<CSVFieldMapping[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState('');
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [showAllMappings, setShowAllMappings] = useState(false);
  const [duplicateConflict, setDuplicateConflict] = useState<{ existing: Member; incoming: any; field: string } | null>(null);

  const [formData, setFormData] = useState<MemberFormData>({
    first_name: '',
    last_name: '',
    email: '',
    phone: '',
    street: '',
    city: '',
    state: '',
    postcode: '',
    emergency_contact_name: '',
    emergency_contact_phone: '',
    emergency_contact_relationship: '',
    boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }],
    country: 'Australia',
    country_code: 'AU',
    category: '',
    club: '',
    date_joined: new Date().toISOString().split('T')[0],
    membership_level: null,
    membership_level_custom: null,
    is_financial: true,
    amount_paid: null
  });

  useEffect(() => {
    if (isOpen && clubId) {
      fetchClubName();
      loadClaims();
    }
    if (!isOpen) {
      setImportStep('upload');
      setCsvData([]);
      setFieldMappings([]);
      setImportProgress(0);
      setImportedCount(0);
      setSkippedCount(0);
      setImportStatus('');
      setDuplicateConflict(null);
    }
  }, [isOpen, clubId]);

  const fetchClubName = async () => {
    try {
      const { data, error } = await supabase
        .from('clubs')
        .select('name')
        .eq('id', clubId)
        .single();
      if (error) throw error;
      if (data) {
        setClubName(data.name);
        setFormData(prev => ({
          ...prev,
          club: data.name,
          country: prev.country || 'Australia',
          country_code: prev.country_code || 'AU'
        }));
      }
    } catch (err) {
      console.error('Error fetching club name:', err);
    }
  };

  const loadClaims = async () => {
    setLoadingClaims(true);
    try {
      const claims = await getClubMemberClaims(clubId);
      setPendingClaims(claims);
    } catch (err) {
      console.error('Error loading claims:', err);
    }
    setLoadingClaims(false);
  };

  const handleClaimMember = async (claim: any) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    const claimSuccess = await acceptMemberClaim(claim.id, user.id);
    if (claimSuccess) {
      setSuccess(true);
      setPendingClaims(prev => prev.filter(c => c.id !== claim.id));
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } else {
      setError('Failed to claim member. They may need to register an account first.');
    }
    setSubmitting(false);
  };

  const filteredClaims = pendingClaims.filter(claim => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    const fullName = claim.profiles?.full_name || claim.full_name || '';
    const email = claim.profiles?.email || claim.email || '';
    const memberNumber = claim.profiles?.member_number || '';
    return fullName.toLowerCase().includes(query) || email.toLowerCase().includes(query) || memberNumber.toLowerCase().includes(query);
  });

  if (!isOpen) return null;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleBoatChange = (index: number, field: keyof typeof formData.boats[0], value: string) => {
    setFormData(prev => {
      const updatedBoats = [...prev.boats];
      updatedBoats[index] = { ...updatedBoats[index], [field]: value };
      return { ...prev, boats: updatedBoats };
    });
  };

  const handleAddBoat = () => {
    setFormData(prev => ({
      ...prev,
      boats: [...prev.boats, { boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }]
    }));
  };

  const handleRemoveBoat = (index: number) => {
    if (formData.boats.length <= 1) return;
    setFormData(prev => ({ ...prev, boats: prev.boats.filter((_, i) => i !== index) }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(false);
    try {
      const { data: existingMember, error: checkError } = await supabase
        .from('members')
        .select('id')
        .eq('club_id', clubId)
        .eq('email', formData.email)
        .maybeSingle();
      if (checkError && checkError.code !== 'PGRST116') throw checkError;
      if (existingMember) { setError('A member with this email already exists in this club.'); return; }
      if (!formData.first_name || !formData.last_name) throw new Error('First name and last name are required');
      const newMember = await addAdminMember(formData, clubId);
      if (!newMember) throw new Error('Failed to create member record. Please check your connection and try again.');
      setSuccess(true);
      setFormData({
        first_name: '', last_name: '', email: '', phone: '', street: '', city: '', state: '', postcode: '',
        emergency_contact_name: '', emergency_contact_phone: '', emergency_contact_relationship: '',
        boats: [{ boat_type: '' as BoatType, sail_number: '', hull: '', handicap: null }],
        country: 'Australia', country_code: 'AU', category: '', club: clubName,
        date_joined: new Date().toISOString().split('T')[0], membership_level: null,
        membership_level_custom: null, is_financial: true, amount_paid: null
      });
      setTimeout(() => { onSuccess(); onClose(); }, 2000);
    } catch (err) {
      console.error('Error adding member:', err);
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const autoDetectField = (csvField: string): { mappedTo: string | null; confidence: 'high' | 'medium' | 'low' | 'none' } => {
    const normalized = csvField.toLowerCase().trim().replace(/[_\s-]/g, '');
    if (HIGH_CONFIDENCE_MATCHES[normalized]) {
      return { mappedTo: HIGH_CONFIDENCE_MATCHES[normalized], confidence: 'high' };
    }
    for (const [key, value] of Object.entries(HIGH_CONFIDENCE_MATCHES)) {
      if (normalized.includes(key) || key.includes(normalized)) {
        return { mappedTo: value, confidence: 'medium' };
      }
    }
    return { mappedTo: null, confidence: 'none' };
  };

  const handleFileUpload = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data && results.data.length > 0) {
          const headers = Object.keys(results.data[0] as any);
          setCsvData(results.data);
          const mappings: CSVFieldMapping[] = headers.map(header => {
            const detection = autoDetectField(header);
            return {
              csvField: header,
              mappedTo: detection.confidence === 'high' ? detection.mappedTo : null,
              confidence: detection.confidence,
              sampleData: (results.data[0] as any)[header]?.toString() || ''
            };
          });
          setFieldMappings(mappings);
          setImportStep('mapping');
        }
      },
      error: (err) => { console.error('CSV parse error:', err); }
    });
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files[0];
    if (file && (file.type === 'text/csv' || file.name.endsWith('.csv'))) handleFileUpload(file);
  }, []);

  const processImport = async () => {
    setImportStep('importing');
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);

    const validMappings = fieldMappings.filter(m => m.mappedTo && m.mappedTo !== 'ignore');

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      setImportStatus(`Processing member ${i + 1} of ${csvData.length}...`);
      setImportProgress(((i + 1) / csvData.length) * 100);

      const memberData: any = { club_id: clubId, club: clubName };
      let boatData: any = {};

      validMappings.forEach(mapping => {
        const value = row[mapping.csvField];
        if (!value || value.toString().trim() === '') return;
        const field = mapping.mappedTo!;
        if (['boat_type', 'sail_number', 'hull', 'handicap'].includes(field)) {
          boatData[field] = field === 'handicap' ? (parseFloat(value) || null) : value;
        } else if (field === 'is_financial') {
          memberData[field] = ['yes', 'true', '1', 'y'].includes(value.toString().toLowerCase());
        } else if (field === 'amount_paid') {
          memberData[field] = parseFloat(value.toString().replace(/[$,]/g, '')) || null;
        } else {
          memberData[field] = value;
        }
      });

      if (!memberData.first_name || !memberData.last_name) {
        setSkippedCount(prev => prev + 1);
        continue;
      }

      const existingMember = members.find(m => {
        if (memberData.email && m.email && memberData.email.toLowerCase() === m.email.toLowerCase()) return true;
        if (memberData.first_name && m.first_name && memberData.last_name && m.last_name &&
            memberData.first_name.toLowerCase() === m.first_name.toLowerCase() &&
            memberData.last_name.toLowerCase() === m.last_name.toLowerCase()) return true;
        return false;
      });

      if (existingMember) {
        setDuplicateConflict({ existing: existingMember, incoming: memberData, field: 'email' });
        const resolution = await new Promise<'overwrite' | 'skip'>((resolve) => {
          (window as any).__conflictResolutionCallback = resolve;
        });
        setDuplicateConflict(null);
        delete (window as any).__conflictResolutionCallback;
        if (resolution === 'skip') { setSkippedCount(prev => prev + 1); continue; }
        memberData.id = existingMember.id;
      }

      try {
        const { data: insertedMember, error: memberError } = await supabase
          .from('members').upsert(memberData).select().single();
        if (memberError) throw memberError;
        if (Object.keys(boatData).length > 0 && boatData.boat_type) {
          boatData.member_id = insertedMember.id;
          await supabase.from('member_boats').insert(boatData);
        }
        setImportedCount(prev => prev + 1);
      } catch (err) {
        console.error('Error importing member:', err);
        setSkippedCount(prev => prev + 1);
      }
    }

    setImportStep('complete');
    setImportStatus('Import complete!');
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-orange-500';
      default: return 'text-slate-500';
    }
  };

  const renderImportTab = () => {
    if (importStep === 'upload') {
      return (
        <div className="space-y-6">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragActive(true); }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
              dragActive ? 'border-blue-500 bg-blue-500/10' : 'border-slate-600 hover:border-slate-500'
            }`}
          >
            <FileUp className="w-12 h-12 mx-auto mb-4 text-slate-400" />
            <p className="text-lg font-medium text-slate-200 mb-1">Drag and drop your CSV file</p>
            <p className="text-sm text-slate-400 mb-4">or click to browse</p>
            <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg cursor-pointer hover:bg-blue-700 transition-colors font-medium">
              <Upload size={18} />
              Choose File
              <input
                type="file"
                accept=".csv"
                className="hidden"
                onChange={(e) => { if (e.target.files?.[0]) handleFileUpload(e.target.files[0]); }}
              />
            </label>
          </div>

          <div className="text-sm text-slate-400 space-y-1">
            <p className="font-semibold text-slate-300">CSV Format Guidelines:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>First row should contain column headers</li>
              <li>We'll auto-detect and map your fields</li>
              <li>Supports: name, email, phone, country, category, address, boats, emergency contacts</li>
              <li>Duplicates will be detected and you can choose to overwrite or skip</li>
            </ul>
          </div>
        </div>
      );
    }

    if (importStep === 'mapping') {
      const mappingsToShow = showAllMappings ? fieldMappings : fieldMappings.slice(0, 8);
      return (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-slate-300">{csvData.length} rows found. Map your CSV columns to member fields:</p>
            </div>
            <button
              onClick={() => { setImportStep('upload'); setCsvData([]); setFieldMappings([]); }}
              className="text-sm text-blue-400 hover:text-blue-300"
            >
              Re-upload
            </button>
          </div>

          <div className="space-y-2 max-h-[40vh] overflow-y-auto pr-1">
            {mappingsToShow.map((mapping, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2.5 bg-slate-700/50 rounded-lg border border-slate-600/50">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{mapping.csvField}</p>
                  {mapping.sampleData && (
                    <p className="text-xs text-slate-500 truncate">e.g. {mapping.sampleData}</p>
                  )}
                </div>
                <span className="text-slate-500">→</span>
                <select
                  value={mapping.mappedTo || ''}
                  onChange={(e) => {
                    setFieldMappings(prev => prev.map((m, i) =>
                      i === idx ? { ...m, mappedTo: e.target.value || null } : m
                    ));
                  }}
                  className="flex-1 px-2 py-1.5 bg-slate-700 text-slate-200 rounded border border-slate-600 text-sm focus:ring-1 focus:ring-blue-500"
                >
                  <option value="">-- Skip --</option>
                  {FIELD_OPTIONS.map(opt => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
                <span className={`text-xs font-medium ${getConfidenceColor(mapping.confidence)}`}>
                  {mapping.confidence === 'high' ? 'Auto' : mapping.confidence === 'medium' ? 'Likely' : ''}
                </span>
              </div>
            ))}
          </div>

          {fieldMappings.length > 8 && (
            <button
              onClick={() => setShowAllMappings(!showAllMappings)}
              className="flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
            >
              {showAllMappings ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
              {showAllMappings ? 'Show fewer' : `Show all ${fieldMappings.length} columns`}
            </button>
          )}

          <div className="flex justify-end gap-3 pt-2">
            <button
              onClick={() => { setImportStep('upload'); setCsvData([]); setFieldMappings([]); }}
              className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={processImport}
              disabled={!fieldMappings.some(m => m.mappedTo === 'first_name') || !fieldMappings.some(m => m.mappedTo === 'last_name')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed font-medium"
            >
              Import {csvData.length} Members
            </button>
          </div>
        </div>
      );
    }

    if (importStep === 'importing') {
      return (
        <div className="space-y-6 py-8">
          {duplicateConflict ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2 text-yellow-400">
                <AlertCircle size={20} />
                <span className="font-medium">Duplicate Member Found</span>
              </div>
              <div className="bg-slate-700/50 rounded-lg p-4 border border-slate-600">
                <p className="text-slate-300 text-sm mb-3">
                  <strong className="text-white">{duplicateConflict.incoming.first_name} {duplicateConflict.incoming.last_name}</strong> already exists in your club.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={() => (window as any).__conflictResolutionCallback?.('overwrite')}
                    className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors text-sm font-medium"
                  >
                    Overwrite
                  </button>
                  <button
                    onClick={() => (window as any).__conflictResolutionCallback?.('skip')}
                    className="px-4 py-2 bg-slate-600 text-slate-200 rounded-lg hover:bg-slate-500 transition-colors text-sm font-medium"
                  >
                    Skip
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-center gap-3">
                <Loader className="w-6 h-6 text-blue-400 animate-spin" />
                <span className="text-slate-300 font-medium">{importStatus}</span>
              </div>
              <div className="w-full bg-slate-700 rounded-full h-3">
                <div
                  className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <div className="flex justify-center gap-6 text-sm">
                <span className="text-green-400">{importedCount} imported</span>
                <span className="text-yellow-400">{skippedCount} skipped</span>
              </div>
            </>
          )}
        </div>
      );
    }

    if (importStep === 'complete') {
      return (
        <div className="text-center py-8 space-y-4">
          <CheckCircle className="w-16 h-16 text-green-400 mx-auto" />
          <h3 className="text-xl font-bold text-white">Import Complete</h3>
          <div className="flex justify-center gap-6 text-sm">
            <span className="text-green-400 font-medium">{importedCount} members imported</span>
            {skippedCount > 0 && <span className="text-yellow-400 font-medium">{skippedCount} skipped</span>}
          </div>
          <button
            onClick={() => { onSuccess(); onClose(); }}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium mt-4"
          >
            Done
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <UserPlus className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Add Member</h2>
              <p className="text-cyan-100 text-sm mt-0.5">{clubName || 'Club Member Management'}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className={`flex border-b ${darkMode ? 'border-slate-700' : 'border-slate-200'}`}>
          {(['new', 'claim', 'import'] as TabType[]).map((tab) => {
            const tabConfig = {
              new: { icon: UserPlus, label: 'Add New Member', badge: 0 },
              claim: { icon: Search, label: 'Claim Existing', badge: pendingClaims.length },
              import: { icon: Upload, label: 'Import CSV', badge: 0 },
            };
            const cfg = tabConfig[tab];
            const Icon = cfg.icon;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`flex-1 px-4 py-3 font-medium transition-colors ${
                  activeTab === tab
                    ? darkMode
                      ? 'text-blue-400 border-b-2 border-blue-400 bg-slate-700/50'
                      : 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                    : darkMode
                    ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700/30'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-center gap-2">
                  <Icon size={18} />
                  <span className="text-sm">{cfg.label}</span>
                  {cfg.badge > 0 && (
                    <span className="bg-blue-600 text-white text-xs px-2 py-0.5 rounded-full">{cfg.badge}</span>
                  )}
                </div>
              </button>
            );
          })}
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
              <div className="flex">
                <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0" />
                <div className="ml-3"><h3 className="text-sm font-medium text-red-300">{error}</h3></div>
              </div>
            </div>
          )}

          {success && activeTab !== 'import' && (
            <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
              <div className="flex">
                <Check className="h-5 w-5 text-green-400 flex-shrink-0" />
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-300">
                    {activeTab === 'new' ? 'Member added successfully!' : 'Member claimed successfully!'}
                  </h3>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'import' && renderImportTab()}

          {activeTab === 'claim' && (
            <div className="space-y-4">
              <div className="relative">
                <Search size={18} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search by name, email, or member number..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-3 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {loadingClaims ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-4 border-blue-600 border-t-transparent mx-auto"></div>
                  <p className="text-slate-400 mt-4">Loading members...</p>
                </div>
              ) : filteredClaims.length === 0 ? (
                <div className="text-center py-12">
                  <User size={48} className="mx-auto text-slate-500 mb-4" />
                  <p className="text-slate-400">
                    {searchQuery ? `No members found matching "${searchQuery}"` : 'No members available to claim'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredClaims.map((claim) => (
                    <div key={claim.id} className="bg-slate-700/50 border border-slate-600 rounded-lg p-4 hover:bg-slate-700 transition">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 mb-2">
                            <h4 className="font-semibold text-slate-100">{claim.profiles?.full_name || claim.full_name || 'Unknown Name'}</h4>
                            {claim.match_confidence && claim.match_confidence > 0.8 && (
                              <span className="bg-green-900/30 text-green-400 text-xs px-2 py-1 rounded-full font-medium border border-green-800">
                                {Math.round(claim.match_confidence * 100)}% Match
                              </span>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
                            <div className="text-slate-400"><span className="font-medium text-slate-300">Email:</span> {claim.profiles?.email || claim.email || 'N/A'}</div>
                            <div className="text-slate-400"><span className="font-medium text-slate-300">Member #:</span> {claim.profiles?.member_number || 'Not assigned'}</div>
                            {(claim.profiles?.date_of_birth || claim.date_of_birth) && (
                              <div className="text-slate-400"><span className="font-medium text-slate-300">DOB:</span> {new Date(claim.profiles?.date_of_birth || claim.date_of_birth).toLocaleDateString()}</div>
                            )}
                            {claim.phone && <div className="text-slate-400"><span className="font-medium text-slate-300">Phone:</span> {claim.phone}</div>}
                          </div>
                          {claim.match_reasons && claim.match_reasons.length > 0 && (
                            <div className="mt-2">
                              <p className="text-xs text-slate-500 mb-1">Match reasons:</p>
                              <div className="flex flex-wrap gap-1">
                                {claim.match_reasons.map((reason: string, idx: number) => (
                                  <span key={idx} className="bg-slate-600 text-slate-300 text-xs px-2 py-0.5 rounded">{reason}</span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleClaimMember(claim)}
                          disabled={submitting}
                          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition disabled:opacity-50 flex items-center gap-2"
                        >
                          <Check size={18} />
                          Claim
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'new' && (
            <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <User size={20} className="text-blue-400" />
                Personal Information
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">First Name *</label>
                  <input type="text" required name="first_name" value={formData.first_name} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter first name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Last Name *</label>
                  <input type="text" required name="last_name" value={formData.last_name} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter last name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Email Address</label>
                  <div className="relative">
                    <Mail size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="email" name="email" value={formData.email} onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="you@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Phone Number</label>
                  <div className="relative">
                    <Phone size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="tel" name="phone" value={formData.phone} onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter phone number" />
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Country <span className="text-red-400">*</span></label>
                  <div className="relative">
                    <Globe size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10" />
                    <div className="absolute left-10 top-1/2 -translate-y-1/2 text-2xl z-10 pointer-events-none">
                      {formData.country_code && getCountryFlag(formData.country_code)}
                    </div>
                    <select required value={formData.country_code || 'AU'}
                      onChange={(e) => {
                        const country = SAILING_NATIONS.find(c => c.code === e.target.value);
                        setFormData(prev => ({ ...prev, country_code: e.target.value, country: country?.name || e.target.value }));
                      }}
                      className="w-full pl-20 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      {SAILING_NATIONS.map((country) => (
                        <option key={country.code} value={country.code}>{country.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Category</label>
                  <div className="relative">
                    <Award size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <select name="category" value={formData.category || ''} onChange={handleInputChange}
                      className="w-full pl-10 pr-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                      <option value="">Select Category</option>
                      <option value="Junior">Junior</option>
                      <option value="Open">Open</option>
                      <option value="Master">Master</option>
                      <option value="Grand Master">Grand Master</option>
                      <option value="Legend">Legend</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Home size={20} className="text-blue-400" />
                Address
              </h3>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Street Address</label>
                  <input type="text" name="street" value={formData.street} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter street address" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">City/Suburb</label>
                    <input type="text" name="city" value={formData.city} onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter city" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">State</label>
                    <input type="text" name="state" value={formData.state} onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter state" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1">Postcode</label>
                    <input type="text" name="postcode" value={formData.postcode} onChange={handleInputChange}
                      className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter postcode" />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-lg font-medium text-white mb-4 flex items-center gap-2">
                <Phone size={20} className="text-blue-400" />
                Emergency Contact
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Contact Name</label>
                  <input type="text" name="emergency_contact_name" value={formData.emergency_contact_name} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Emergency contact name" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Contact Phone</label>
                  <input type="tel" name="emergency_contact_phone" value={formData.emergency_contact_phone} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Emergency contact phone" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1">Relationship</label>
                  <input type="text" name="emergency_contact_relationship" value={formData.emergency_contact_relationship} onChange={handleInputChange}
                    className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="e.g., Spouse, Parent" />
                </div>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-medium text-white flex items-center gap-2">
                  <Sailboat size={20} className="text-blue-400" />
                  Member Boats
                </h3>
                <button type="button" onClick={handleAddBoat}
                  className="flex items-center gap-2 px-3 py-1 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm transition-colors">
                  <Plus size={16} /> Add Boat
                </button>
              </div>
              <div className="space-y-4">
                {formData.boats.length === 0 ? (
                  <div className="text-center py-6 bg-slate-700/30 rounded-lg border border-slate-600/50">
                    <Sailboat size={32} className="mx-auto mb-2 text-slate-500" />
                    <p className="text-slate-400">No boats added yet</p>
                  </div>
                ) : (
                  formData.boats.map((boat, index) => (
                    <div key={index} className="p-4 rounded-lg bg-slate-700/50 border border-slate-600/50 relative">
                      <button type="button" onClick={() => handleRemoveBoat(index)}
                        className="absolute top-2 right-2 p-1 rounded-full text-slate-400 hover:text-slate-300 hover:bg-slate-600/50">
                        <X size={16} />
                      </button>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Boat Type</label>
                          <select value={boat.boat_type || ''} onChange={(e) => handleBoatChange(index, 'boat_type', e.target.value as BoatType)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500">
                            <option value="">Select boat type</option>
                            <option value="DF65">Dragon Force 65</option>
                            <option value="DF95">Dragon Force 95</option>
                            <option value="10R">10 Rater</option>
                            <option value="IOM">IOM</option>
                            <option value="Marblehead">Marblehead</option>
                            <option value="A Class">A Class</option>
                            <option value="RC Laser">RC Laser</option>
                          </select>
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Sail Number</label>
                          <input type="text" value={boat.sail_number} onChange={(e) => handleBoatChange(index, 'sail_number', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter sail number" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-slate-300 mb-1">Hull</label>
                          <input type="text" value={boat.hull} onChange={(e) => handleBoatChange(index, 'hull', e.target.value)}
                            className="w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter hull details" />
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-4">
              <button type="button" onClick={onClose}
                className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors">
                Cancel
              </button>
              <button type="submit" disabled={submitting || success}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                {submitting ? 'Adding Member...' : 'Add Member'}
              </button>
            </div>
          </form>
          )}
        </div>
      </div>
    </div>
  );
};
