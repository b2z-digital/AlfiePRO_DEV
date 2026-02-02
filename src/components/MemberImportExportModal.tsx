import React, { useState, useCallback } from 'react';
import { LogOut, Upload, Download, FileUp, CheckCircle, AlertCircle, Loader, ChevronDown, ChevronUp } from 'lucide-react';
import Papa from 'papaparse';
import { Member, MemberBoat, BoatType, MembershipLevel } from '../types/member';
import { supabase } from '../utils/supabase';

interface MemberImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  members: Member[];
  onImportComplete: () => void;
  currentClubId: string;
}

interface CSVFieldMapping {
  csvField: string;
  mappedTo: string | null;
  confidence: 'high' | 'medium' | 'low' | 'none';
  sampleData?: string;
}

interface DuplicateConflict {
  existing: Member;
  incoming: any;
  field: string;
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

const FIELD_OPTIONS = [
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'street', label: 'Street' },
  { value: 'city', label: 'City' },
  { value: 'state', label: 'State' },
  { value: 'postcode', label: 'Postcode' },
  { value: 'date_joined', label: 'Date Joined' },
  { value: 'membership_level', label: 'Membership Level' },
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

export const MemberImportExportModal: React.FC<MemberImportExportModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  members,
  onImportComplete,
  currentClubId
}) => {
  const [mode, setMode] = useState<'select' | 'import' | 'export'>('select');
  const [importStep, setImportStep] = useState<ImportStep>('upload');
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<CSVFieldMapping[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importStatus, setImportStatus] = useState<string>('');
  const [duplicateConflict, setDuplicateConflict] = useState<DuplicateConflict | null>(null);
  const [conflictResolution, setConflictResolution] = useState<'overwrite' | 'skip' | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [expandedMappings, setExpandedMappings] = useState(true);

  // Reset modal state when it closes
  const resetModalState = () => {
    setMode('select');
    setImportStep('upload');
    setCsvData([]);
    setCsvHeaders([]);
    setFieldMappings([]);
    setDragActive(false);
    setImportProgress(0);
    setImportStatus('');
    setDuplicateConflict(null);
    setConflictResolution(null);
    setImportedCount(0);
    setSkippedCount(0);
    setExpandedMappings(true);
  };

  // Reset state when modal closes
  React.useEffect(() => {
    if (!isOpen) {
      resetModalState();
    }
  }, [isOpen]);

  const autoDetectField = (csvField: string): { mappedTo: string | null; confidence: 'high' | 'medium' | 'low' | 'none' } => {
    const normalized = csvField.toLowerCase().trim().replace(/[_\s-]/g, '');

    const highConfidenceMatches: Record<string, string> = {
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
      'emergencyrelationship': 'emergency_contact_relationship'
    };

    if (highConfidenceMatches[normalized]) {
      return { mappedTo: highConfidenceMatches[normalized], confidence: 'high' };
    }

    for (const [key, value] of Object.entries(highConfidenceMatches)) {
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
          const headers = Object.keys(results.data[0]);
          setCsvHeaders(headers);
          setCsvData(results.data);

          const mappings = headers.map(header => {
            const detection = autoDetectField(header);
            return {
              csvField: header,
              mappedTo: detection.confidence === 'high' ? detection.mappedTo : null,
              confidence: detection.confidence,
              sampleData: results.data[0][header]
            };
          });

          setFieldMappings(mappings);
          setImportStep('mapping');
        }
      },
      error: (error) => {
        console.error('Error parsing CSV:', error);
        alert('Error parsing CSV file. Please check the file format.');
      }
    });
  };

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  }, []);

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
  };

  const updateFieldMapping = (csvField: string, newMapping: string | null) => {
    setFieldMappings(prev =>
      prev.map(m =>
        m.csvField === csvField
          ? { ...m, mappedTo: newMapping, confidence: newMapping ? 'high' : 'none' }
          : m
      )
    );
  };

  const exportToCSV = () => {
    const exportData = members.flatMap(member => {
      if (member.boats && member.boats.length > 0) {
        return member.boats.map(boat => ({
          'First Name': member.first_name,
          'Last Name': member.last_name,
          'Email': member.email || '',
          'Phone': member.phone || '',
          'Street': member.street || '',
          'City': member.city || '',
          'State': member.state || '',
          'Postcode': member.postcode || '',
          'Date Joined': member.date_joined || '',
          'Membership Level': member.membership_level || member.membership_level_custom || '',
          'Financial': member.is_financial ? 'Yes' : 'No',
          'Amount Paid': member.amount_paid || '',
          'Renewal Date': member.renewal_date || '',
          'Boat Type': boat.boat_type || '',
          'Sail Number': boat.sail_number || '',
          'Hull': boat.hull || '',
          'Handicap': boat.handicap || '',
          'Emergency Contact Name': member.emergency_contact_name || '',
          'Emergency Contact Phone': member.emergency_contact_phone || '',
          'Emergency Contact Relationship': member.emergency_contact_relationship || ''
        }));
      } else {
        return [{
          'First Name': member.first_name,
          'Last Name': member.last_name,
          'Email': member.email || '',
          'Phone': member.phone || '',
          'Street': member.street || '',
          'City': member.city || '',
          'State': member.state || '',
          'Postcode': member.postcode || '',
          'Date Joined': member.date_joined || '',
          'Membership Level': member.membership_level || member.membership_level_custom || '',
          'Financial': member.is_financial ? 'Yes' : 'No',
          'Amount Paid': member.amount_paid || '',
          'Renewal Date': member.renewal_date || '',
          'Boat Type': '',
          'Sail Number': '',
          'Hull': '',
          'Handicap': '',
          'Emergency Contact Name': member.emergency_contact_name || '',
          'Emergency Contact Phone': member.emergency_contact_phone || '',
          'Emergency Contact Relationship': member.emergency_contact_relationship || ''
        }];
      }
    });

    const csv = Papa.unparse(exportData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `members_export_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    onClose();
  };

  const processImport = async () => {
    setImportStep('importing');
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);

    console.log('=== STARTING IMPORT ===');
    console.log('Total existing members:', members.length);
    console.log('Total CSV rows to import:', csvData.length);
    console.log('Existing member names:', members.map(m => `${m.first_name} ${m.last_name}`));

    // Fetch club name for the current club
    const { data: clubData } = await supabase
      .from('clubs')
      .select('name')
      .eq('id', currentClubId)
      .single();

    const clubName = clubData?.name || '';

    const validMappings = fieldMappings.filter(m => m.mappedTo && m.mappedTo !== 'ignore');
    let currentResolution: 'overwrite' | 'skip' | null = null;

    for (let i = 0; i < csvData.length; i++) {
      const row = csvData[i];
      setImportStatus(`Processing member ${i + 1} of ${csvData.length}...`);
      setImportProgress(((i + 1) / csvData.length) * 100);

      const memberData: any = {
        club_id: currentClubId,
        club: clubName
      };

      let boatData: any = {};

      validMappings.forEach(mapping => {
        const value = row[mapping.csvField];
        if (!value || value.toString().trim() === '') return;

        const field = mapping.mappedTo!;

        if (['boat_type', 'sail_number', 'hull', 'handicap'].includes(field)) {
          if (field === 'handicap') {
            boatData[field] = parseFloat(value) || null;
          } else {
            boatData[field] = value;
          }
        } else if (field === 'is_financial') {
          memberData[field] = ['yes', 'true', '1', 'y'].includes(value.toString().toLowerCase());
        } else if (field === 'amount_paid') {
          memberData[field] = parseFloat(value.toString().replace(/[$,]/g, '')) || null;
        } else {
          memberData[field] = value;
        }
      });

      console.log(`\n--- Processing row ${i + 1} ---`);
      console.log('Member data built:', memberData);

      // Skip if no first name or last name (required fields)
      if (!memberData.first_name || !memberData.last_name) {
        console.log('❌ Skipping row - missing required fields');
        setSkippedCount(prev => prev + 1);
        continue;
      }

      console.log(`Checking for duplicate: ${memberData.first_name} ${memberData.last_name} (${memberData.email || 'no email'})`);

      const existingMember = members.find(m => {
        // Check email match if both have emails
        if (memberData.email && m.email &&
            memberData.email.toLowerCase() === m.email.toLowerCase()) {
          return true;
        }

        // Check name match if both have first and last names
        if (memberData.first_name && m.first_name &&
            memberData.last_name && m.last_name &&
            memberData.first_name.toLowerCase() === m.first_name.toLowerCase() &&
            memberData.last_name.toLowerCase() === m.last_name.toLowerCase()) {
          return true;
        }

        return false;
      });

      if (existingMember) {
        console.log(`🔄 DUPLICATE FOUND: ${memberData.first_name} ${memberData.last_name} matches existing member ID ${existingMember.id}`);
        console.log('Existing member:', existingMember);
        setDuplicateConflict({
          existing: existingMember,
          incoming: memberData,
          field: 'email'
        });

        currentResolution = await new Promise<'overwrite' | 'skip'>((resolve) => {
          const resolutionListener = (resolution: 'overwrite' | 'skip') => {
            resolve(resolution);
          };

          (window as any).__conflictResolutionCallback = resolutionListener;
        });

        setDuplicateConflict(null);
        delete (window as any).__conflictResolutionCallback;

        if (currentResolution === 'skip') {
          console.log(`⏭️  User SKIPPED: ${memberData.first_name} ${memberData.last_name}`);
          setSkippedCount(prev => prev + 1);
          currentResolution = null;
          continue;
        }
        console.log(`✏️  User chose OVERWRITE for: ${memberData.first_name} ${memberData.last_name}`);
      } else {
        console.log(`✅ NO DUPLICATE - Will import: ${memberData.first_name} ${memberData.last_name}`);
      }

      try {
        if (existingMember && currentResolution === 'overwrite') {
          memberData.id = existingMember.id;
        }

        console.log('Attempting to insert/update member:', memberData);

        const { data: insertedMember, error: memberError } = await supabase
          .from('members')
          .upsert(memberData)
          .select()
          .single();

        if (memberError) throw memberError;

        console.log('Successfully inserted member:', insertedMember);

        if (Object.keys(boatData).length > 0 && boatData.boat_type) {
          boatData.member_id = insertedMember.id;
          const { error: boatError } = await supabase
            .from('member_boats')
            .insert(boatData);

          if (boatError) console.error('Error inserting boat:', boatError);
        }

        setImportedCount(prev => prev + 1);
        console.log('Import count increased');
      } catch (error) {
        console.error('Error importing member:', error);
        setSkippedCount(prev => prev + 1);
      }

      currentResolution = null;
    }

    setImportStep('complete');
    setImportStatus('Import complete!');
  };

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case 'high': return 'text-green-500';
      case 'medium': return 'text-yellow-500';
      case 'low': return 'text-orange-500';
      default: return 'text-gray-400';
    }
  };

  const getConfidenceIcon = (confidence: string) => {
    if (confidence === 'high') return <CheckCircle className="w-4 h-4" />;
    if (confidence === 'medium' || confidence === 'low') return <AlertCircle className="w-4 h-4" />;
    return null;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} rounded-2xl shadow-2xl w-full max-w-7xl max-h-[95vh] overflow-hidden flex flex-col`}>
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-2xl font-bold">
            {mode === 'select' && 'Import / Export Members'}
            {mode === 'import' && 'Import Members'}
            {mode === 'export' && 'Export Members'}
          </h2>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
            }`}
          >
            <LogOut className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {mode === 'select' && (
            <div className="grid grid-cols-2 gap-6">
              <button
                onClick={() => setMode('import')}
                className={`p-8 rounded-xl border-2 transition-all hover:scale-105 ${
                  darkMode
                    ? 'border-gray-700 hover:border-blue-500 bg-gray-750'
                    : 'border-gray-200 hover:border-blue-500 bg-gray-50'
                }`}
              >
                <Upload className="w-12 h-12 mx-auto mb-4 text-blue-500" />
                <h3 className="text-xl font-semibold mb-2">Import Members</h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Upload a CSV file to import members and their boats
                </p>
              </button>

              <button
                onClick={() => {
                  setMode('export');
                  exportToCSV();
                }}
                className={`p-8 rounded-xl border-2 transition-all hover:scale-105 ${
                  darkMode
                    ? 'border-gray-700 hover:border-green-500 bg-gray-750'
                    : 'border-gray-200 hover:border-green-500 bg-gray-50'
                }`}
              >
                <Download className="w-12 h-12 mx-auto mb-4 text-green-500" />
                <h3 className="text-xl font-semibold mb-2">Export Members</h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Download all members and their boats as CSV
                </p>
              </button>
            </div>
          )}

          {mode === 'import' && importStep === 'upload' && (
            <div className="space-y-6">
              <div
                onDragEnter={handleDrag}
                onDragLeave={handleDrag}
                onDragOver={handleDrag}
                onDrop={handleDrop}
                className={`border-2 border-dashed rounded-xl p-12 text-center transition-colors ${
                  dragActive
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                    : darkMode
                    ? 'border-gray-700 hover:border-gray-600'
                    : 'border-gray-300 hover:border-gray-400'
                }`}
              >
                <FileUp className={`w-16 h-16 mx-auto mb-4 ${dragActive ? 'text-blue-500' : 'text-gray-400'}`} />
                <h3 className="text-xl font-semibold mb-2">
                  {dragActive ? 'Drop your CSV file here' : 'Drag and drop your CSV file'}
                </h3>
                <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  or click to browse
                </p>
                <label className="inline-flex items-center gap-2 px-6 py-3 bg-blue-500 text-white rounded-lg cursor-pointer hover:bg-blue-600 transition-colors">
                  <Upload className="w-5 h-5" />
                  Choose File
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileInput}
                    className="hidden"
                  />
                </label>
              </div>

              <div className={`p-4 rounded-lg ${darkMode ? 'bg-gray-750' : 'bg-gray-50'}`}>
                <h4 className="font-semibold mb-2">CSV Format Guidelines:</h4>
                <ul className={`text-sm space-y-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  <li>• First row should contain column headers</li>
                  <li>• We'll auto-detect and map your fields</li>
                  <li>• Multiple boats per member should be on separate rows</li>
                  <li>• Duplicates will be detected and you can choose to overwrite or skip</li>
                </ul>
              </div>
            </div>
          )}

          {mode === 'import' && importStep === 'mapping' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold">Field Mapping</h3>
                  <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {csvData.length} rows detected. Review and adjust field mappings below.
                  </p>
                </div>
                <button
                  onClick={() => setExpandedMappings(!expandedMappings)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg ${
                    darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100'
                  }`}
                >
                  {expandedMappings ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                  {expandedMappings ? 'Collapse' : 'Expand'} All
                </button>
              </div>

              {expandedMappings && (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-h-[55vh] overflow-y-auto pr-2">
                  {fieldMappings.map((mapping, index) => (
                    <div
                      key={index}
                      className={`p-4 rounded-lg border transition-all ${
                        darkMode ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'
                      } ${mapping.mappedTo ? 'ring-2 ring-green-500/20' : ''}`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{mapping.csvField}</span>
                              {mapping.confidence !== 'none' && (
                                <span className={`flex items-center gap-1 text-xs whitespace-nowrap ${getConfidenceColor(mapping.confidence)}`}>
                                  {getConfidenceIcon(mapping.confidence)}
                                  {mapping.confidence}
                                </span>
                              )}
                            </div>
                            {mapping.sampleData && (
                              <p className={`text-xs truncate ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                                Sample: {mapping.sampleData}
                              </p>
                            )}
                          </div>
                        </div>
                        <select
                          value={mapping.mappedTo || ''}
                          onChange={(e) => updateFieldMapping(mapping.csvField, e.target.value || null)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-gray-800 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="">Skip this field</option>
                          {FIELD_OPTIONS.map(option => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={() => setImportStep('upload')}
                  className={`px-6 py-3 rounded-lg font-medium ${
                    darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={processImport}
                  disabled={!fieldMappings.some(m => m.mappedTo && m.mappedTo !== 'ignore')}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Start Import
                </button>
              </div>
            </div>
          )}

          {mode === 'import' && importStep === 'importing' && (
            <div className="space-y-6 text-center py-8">
              <Loader className="w-16 h-16 mx-auto text-blue-500 animate-spin" />
              <div>
                <h3 className="text-xl font-semibold mb-2">Importing Members...</h3>
                <p className={`text-sm mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {importStatus}
                </p>
                <div className={`w-full h-2 rounded-full overflow-hidden ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${importProgress}%` }}
                  />
                </div>
                <p className="text-sm mt-2 font-medium">{Math.round(importProgress)}%</p>
              </div>
            </div>
          )}

          {mode === 'import' && importStep === 'complete' && (
            <div className="space-y-6 text-center py-8">
              <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
              <div>
                <h3 className="text-xl font-semibold mb-2">Import Complete!</h3>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Successfully imported {importedCount} member(s)
                  {skippedCount > 0 && ` • Skipped ${skippedCount} duplicate(s)`}
                </p>
              </div>
              <button
                onClick={() => {
                  onImportComplete();
                  onClose();
                }}
                className="px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Duplicate Conflict Modal */}
      {duplicateConflict && (
        <div className="fixed inset-0 z-60 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <div className={`${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-900'} rounded-xl shadow-2xl p-6 max-w-md w-full mx-4`}>
            <div className="flex items-center gap-3 mb-4">
              <AlertCircle className="w-6 h-6 text-yellow-500" />
              <h3 className="text-lg font-semibold">Duplicate Member Found</h3>
            </div>
            <p className={`mb-4 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
              <strong>{duplicateConflict.existing.first_name} {duplicateConflict.existing.last_name}</strong> is already a member of this club.
            </p>
            <p className={`mb-6 text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
              Would you like to overwrite the existing record or skip this import?
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => {
                  if ((window as any).__conflictResolutionCallback) {
                    (window as any).__conflictResolutionCallback('skip');
                  }
                }}
                className={`flex-1 px-4 py-2 rounded-lg font-medium ${
                  darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                }`}
              >
                Skip
              </button>
              <button
                onClick={() => {
                  if ((window as any).__conflictResolutionCallback) {
                    (window as any).__conflictResolutionCallback('overwrite');
                  }
                }}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600"
              >
                Overwrite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
