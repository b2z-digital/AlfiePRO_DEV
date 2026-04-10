import React, { useState, useCallback, useEffect } from 'react';
import { LogOut, Upload, Download, FileUp, CircleCheck as CheckCircle, CircleAlert as AlertCircle, Loader, ChevronDown, ChevronUp, ArrowRight, Link2, TriangleAlert as AlertTriangle, Info } from 'lucide-react';
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

interface MembershipTypeOption {
  id: string;
  name: string;
  amount: number;
}

interface MembershipTypeMapping {
  csvValue: string;
  count: number;
  mappedTypeId: string | null;
  mappedTypeName: string | null;
  financialStatus: 'keep_csv' | 'financial' | 'unfinancial';
}

interface ImportError {
  row: number;
  name: string;
  reason: string;
}

type ImportStep = 'upload' | 'mapping' | 'membership_mapping' | 'preview' | 'importing' | 'complete';

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
  const [errorCount, setErrorCount] = useState(0);
  const [expandedMappings, setExpandedMappings] = useState(true);
  const [clubMembershipTypes, setClubMembershipTypes] = useState<MembershipTypeOption[]>([]);
  const [membershipTypeMappings, setMembershipTypeMappings] = useState<MembershipTypeMapping[]>([]);
  const [importErrors, setImportErrors] = useState<ImportError[]>([]);
  const [showErrorDetails, setShowErrorDetails] = useState(false);

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
    setErrorCount(0);
    setExpandedMappings(true);
    setMembershipTypeMappings([]);
    setImportErrors([]);
    setShowErrorDetails(false);
  };

  React.useEffect(() => {
    if (!isOpen) {
      resetModalState();
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && currentClubId) {
      const fetchTypes = async () => {
        const { data } = await supabase
          .from('membership_types')
          .select('id, name, amount')
          .eq('club_id', currentClubId)
          .eq('is_active', true)
          .order('name');
        setClubMembershipTypes((data || []).map(t => ({ ...t, amount: t.amount || 0 })));
      };
      fetchTypes();
    }
  }, [isOpen, currentClubId]);

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
      'membershiptype': 'membership_level',
      'membershiplevelcustom': 'membership_level_custom',
      'custommembership': 'membership_level_custom',
      'membershipcustom': 'membership_level_custom'
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
    const maxBoats = Math.max(1, ...members.map(m => m.boats?.length || 0));

    const exportData = members.map(member => {
      const row: Record<string, string | number> = {
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
        'Emergency Contact Name': member.emergency_contact_name || '',
        'Emergency Contact Phone': member.emergency_contact_phone || '',
        'Emergency Contact Relationship': member.emergency_contact_relationship || ''
      };

      for (let i = 0; i < maxBoats; i++) {
        const boat = member.boats?.[i];
        const suffix = maxBoats === 1 ? '' : ` ${i + 1}`;
        row[`Boat Type${suffix}`] = boat?.boat_type || '';
        row[`Sail Number${suffix}`] = boat?.sail_number || '';
        row[`Hull${suffix}`] = boat?.hull || '';
        row[`Handicap${suffix}`] = boat?.handicap || '';
      }

      return row;
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

  const buildMembershipTypeMappings = () => {
    const membershipFieldMapping = fieldMappings.find(
      m => m.mappedTo === 'membership_level' || m.mappedTo === 'membership_level_custom'
    );

    if (!membershipFieldMapping) {
      return [];
    }

    const csvFieldName = membershipFieldMapping.csvField;
    const valueCounts: Record<string, number> = {};

    csvData.forEach(row => {
      const val = (row[csvFieldName] || '').toString().trim();
      if (val) {
        valueCounts[val] = (valueCounts[val] || 0) + 1;
      }
    });

    return Object.entries(valueCounts).map(([csvValue, count]) => {
      const normalizedCsv = csvValue.toLowerCase().trim();
      const autoMatch = clubMembershipTypes.find(
        t => t.name.toLowerCase().trim() === normalizedCsv
      );

      return {
        csvValue,
        count,
        mappedTypeId: autoMatch?.id || null,
        mappedTypeName: autoMatch?.name || null,
        financialStatus: 'keep_csv' as const,
      };
    });
  };

  const proceedToMembershipMapping = () => {
    const mappings = buildMembershipTypeMappings();
    if (mappings.length > 0) {
      setMembershipTypeMappings(mappings);
      setImportStep('membership_mapping');
    } else {
      processImport();
    }
  };

  const updateMembershipTypeMapping = (csvValue: string, typeId: string | null) => {
    const matchedType = typeId ? clubMembershipTypes.find(t => t.id === typeId) : null;
    setMembershipTypeMappings(prev =>
      prev.map(m =>
        m.csvValue === csvValue
          ? { ...m, mappedTypeId: typeId, mappedTypeName: matchedType?.name || null }
          : m
      )
    );
  };

  const updateMembershipFinancialStatus = (csvValue: string, status: MembershipTypeMapping['financialStatus']) => {
    setMembershipTypeMappings(prev =>
      prev.map(m =>
        m.csvValue === csvValue ? { ...m, financialStatus: status } : m
      )
    );
  };

  const getMembershipMappingForValue = (csvValue: string): MembershipTypeMapping | undefined => {
    return membershipTypeMappings.find(m => m.csvValue === csvValue);
  };

  const processImport = async () => {
    setImportStep('importing');
    setImportProgress(0);
    setImportedCount(0);
    setSkippedCount(0);
    setErrorCount(0);
    setImportErrors([]);
    setShowErrorDetails(false);

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

      if (membershipTypeMappings.length > 0) {
        const rawMembershipValue = (memberData.membership_level || memberData.membership_level_custom || '').toString().trim();
        if (rawMembershipValue) {
          const typeMapping = getMembershipMappingForValue(rawMembershipValue);
          if (typeMapping?.mappedTypeName) {
            memberData.membership_level = typeMapping.mappedTypeName;
            delete memberData.membership_level_custom;
          } else {
            memberData.membership_level_custom = rawMembershipValue;
            delete memberData.membership_level;
          }

          if (typeMapping?.financialStatus === 'financial') {
            memberData.is_financial = true;
          } else if (typeMapping?.financialStatus === 'unfinancial') {
            memberData.is_financial = false;
          }
        }
      }

      console.log(`\n--- Processing row ${i + 1} ---`);
      console.log('Member data built:', memberData);

      if (!memberData.first_name || !memberData.last_name) {
        console.log('Skipping row - missing required fields');
        const missingFields = [];
        if (!memberData.first_name) missingFields.push('First Name');
        if (!memberData.last_name) missingFields.push('Last Name');
        setImportErrors(prev => [...prev, {
          row: i + 1,
          name: `${memberData.first_name || ''} ${memberData.last_name || ''}`.trim() || `Row ${i + 1}`,
          reason: `Missing required field(s): ${missingFields.join(', ')}`
        }]);
        setErrorCount(prev => prev + 1);
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
      } catch (error: any) {
        console.error('Error importing member:', error);
        const memberName = `${memberData.first_name || ''} ${memberData.last_name || ''}`.trim();
        let reason = error?.message || 'Unknown error';
        if (reason.includes('duplicate key')) {
          reason = 'Duplicate entry - a member with this email already exists';
        } else if (reason.includes('violates check constraint')) {
          reason = 'Invalid data format for one or more fields';
        } else if (reason.includes('permission') || reason.includes('policy')) {
          reason = 'Permission denied - check your admin access to this club';
        }
        setImportErrors(prev => [...prev, { row: i + 1, name: memberName || `Row ${i + 1}`, reason }]);
        setErrorCount(prev => prev + 1);
        setImportStatus(`Error on row ${i + 1}: ${reason}`);
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
          <div>
            <h2 className="text-2xl font-bold">
              {mode === 'select' && 'Import / Export Members'}
              {mode === 'import' && 'Import Members'}
              {mode === 'export' && 'Export Members'}
            </h2>
            {mode === 'import' && importStep !== 'upload' && importStep !== 'complete' && (
              <div className="flex items-center gap-2 mt-2">
                {(['mapping', 'membership_mapping', 'importing'] as const).map((step, idx) => {
                  const labels = ['Field Mapping', 'Membership Types', 'Importing'];
                  const stepOrder = ['mapping', 'membership_mapping', 'importing'];
                  const currentIdx = stepOrder.indexOf(importStep);
                  const isActive = importStep === step;
                  const isComplete = currentIdx > idx;
                  return (
                    <React.Fragment key={step}>
                      {idx > 0 && <div className={`w-6 h-px ${isComplete || isActive ? 'bg-blue-500' : darkMode ? 'bg-gray-600' : 'bg-gray-300'}`} />}
                      <span className={`text-xs font-medium px-2 py-1 rounded ${
                        isActive ? 'bg-blue-500/20 text-blue-400' :
                        isComplete ? (darkMode ? 'text-green-400' : 'text-green-600') :
                        darkMode ? 'text-gray-500' : 'text-gray-400'
                      }`}>
                        {isComplete ? '✓ ' : `${idx + 1}. `}{labels[idx]}
                      </span>
                    </React.Fragment>
                  );
                })}
              </div>
            )}
          </div>
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
                <label className="btn-primary-green inline-flex items-center gap-2 px-6 py-3 rounded-lg cursor-pointer transition-all">
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
                  onClick={proceedToMembershipMapping}
                  disabled={!fieldMappings.some(m => m.mappedTo && m.mappedTo !== 'ignore')}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  Next: Review Membership Types
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {mode === 'import' && importStep === 'membership_mapping' && (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Link2 size={20} className="text-blue-400" />
                  Map Membership Types
                </h3>
                <p className={`text-sm mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  Match the membership types found in your CSV to your club's configured membership types.
                  This ensures imported members are correctly assigned.
                </p>
              </div>

              {clubMembershipTypes.length === 0 && (
                <div className={`p-4 rounded-lg border ${darkMode ? 'bg-yellow-900/20 border-yellow-700/50' : 'bg-yellow-50 border-yellow-200'}`}>
                  <div className="flex items-start gap-3">
                    <AlertTriangle size={18} className="text-yellow-500 mt-0.5 shrink-0" />
                    <div>
                      <p className={`text-sm font-medium ${darkMode ? 'text-yellow-300' : 'text-yellow-800'}`}>
                        No membership types configured
                      </p>
                      <p className={`text-sm mt-1 ${darkMode ? 'text-yellow-400/70' : 'text-yellow-700'}`}>
                        Your club has no membership types set up yet. The membership type labels from the CSV will be stored,
                        but you will need to manually assign proper membership types to each member after import.
                        You can configure membership types in Settings &gt; Membership.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {membershipTypeMappings.length > 0 && (
                <div className="space-y-3">
                  <div className={`grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium uppercase tracking-wider ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                    <div className="col-span-3">CSV Value</div>
                    <div className="col-span-1 text-center">Count</div>
                    <div className="col-span-4">Map To Membership Type</div>
                    <div className="col-span-4">Financial Status</div>
                  </div>

                  {membershipTypeMappings.map((mapping) => (
                    <div
                      key={mapping.csvValue}
                      className={`grid grid-cols-12 gap-4 items-center p-4 rounded-lg border transition-all ${
                        darkMode ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'
                      } ${mapping.mappedTypeId ? 'ring-2 ring-green-500/20' : ''}`}
                    >
                      <div className="col-span-3">
                        <span className={`inline-flex items-center px-3 py-1.5 rounded-full text-sm font-medium ${
                          darkMode ? 'bg-slate-700 text-slate-200' : 'bg-gray-200 text-gray-800'
                        }`}>
                          {mapping.csvValue}
                        </span>
                      </div>
                      <div className="col-span-1 text-center">
                        <span className={`text-sm font-medium ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {mapping.count}
                        </span>
                      </div>
                      <div className="col-span-4">
                        <select
                          value={mapping.mappedTypeId || ''}
                          onChange={(e) => updateMembershipTypeMapping(mapping.csvValue, e.target.value || null)}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-gray-800 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="">Do not assign (manual later)</option>
                          {clubMembershipTypes.map(type => (
                            <option key={type.id} value={type.id}>
                              {type.name} {type.amount > 0 ? `($${type.amount})` : '(Free)'}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div className="col-span-4">
                        <select
                          value={mapping.financialStatus}
                          onChange={(e) => updateMembershipFinancialStatus(mapping.csvValue, e.target.value as MembershipTypeMapping['financialStatus'])}
                          className={`w-full px-3 py-2 rounded-lg border text-sm ${
                            darkMode
                              ? 'bg-gray-800 border-gray-600 text-white'
                              : 'bg-white border-gray-300 text-gray-900'
                          }`}
                        >
                          <option value="keep_csv">Use CSV value (if mapped)</option>
                          <option value="financial">Set all as Financial</option>
                          <option value="unfinancial">Set all as Unfinancial</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {membershipTypeMappings.length === 0 && (
                <div className={`p-6 rounded-lg border text-center ${darkMode ? 'bg-gray-750 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Info size={18} className="text-blue-400" />
                    <p className={`text-sm font-medium ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      No membership type data found in CSV
                    </p>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-gray-500' : 'text-gray-500'}`}>
                    You can assign membership types to imported members individually after import.
                  </p>
                </div>
              )}

              <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/20 border-blue-700/40' : 'bg-blue-50 border-blue-200'}`}>
                <div className="flex items-start gap-3">
                  <Info size={18} className="text-blue-400 mt-0.5 shrink-0" />
                  <div className={`text-sm ${darkMode ? 'text-blue-300/80' : 'text-blue-700'}`}>
                    <p className="font-medium mb-1">How membership mapping works:</p>
                    <ul className="space-y-0.5 list-disc list-inside">
                      <li>Matched types will be assigned to members during import</li>
                      <li>Unmatched types will store the CSV label for you to assign manually later</li>
                      <li>Members imported from existing systems with paid memberships should use the financial status override to mark them correctly</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setImportStep('mapping')}
                  className={`px-6 py-3 rounded-lg font-medium ${
                    darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'
                  }`}
                >
                  Back
                </button>
                <button
                  onClick={processImport}
                  className="flex-1 px-6 py-3 bg-blue-500 text-white rounded-lg font-medium hover:bg-blue-600 flex items-center justify-center gap-2"
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
              {errorCount > 0 && importedCount === 0 ? (
                <AlertCircle className="w-16 h-16 mx-auto text-red-500" />
              ) : errorCount > 0 ? (
                <AlertCircle className="w-16 h-16 mx-auto text-yellow-500" />
              ) : (
                <CheckCircle className="w-16 h-16 mx-auto text-green-500" />
              )}
              <div>
                <h3 className="text-xl font-semibold mb-2">
                  {errorCount > 0 && importedCount === 0 ? 'Import Failed' : 'Import Complete!'}
                </h3>
                <div className="flex items-center justify-center gap-4 mt-3">
                  {importedCount > 0 && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                    }`}>
                      <CheckCircle size={14} />
                      {importedCount} imported
                    </span>
                  )}
                  {skippedCount > 0 && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      darkMode ? 'bg-gray-700 text-gray-300' : 'bg-gray-200 text-gray-700'
                    }`}>
                      {skippedCount} skipped
                    </span>
                  )}
                  {errorCount > 0 && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${
                      darkMode ? 'bg-red-900/30 text-red-400' : 'bg-red-100 text-red-700'
                    }`}>
                      <AlertCircle size={14} />
                      {errorCount} error{errorCount !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {importErrors.length > 0 && (
                <div className="text-left max-w-2xl mx-auto">
                  <button
                    onClick={() => setShowErrorDetails(!showErrorDetails)}
                    className={`flex items-center gap-2 text-sm font-medium mb-3 mx-auto ${
                      darkMode ? 'text-red-400 hover:text-red-300' : 'text-red-600 hover:text-red-500'
                    }`}
                  >
                    {showErrorDetails ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    {showErrorDetails ? 'Hide' : 'Show'} error details ({importErrors.length})
                  </button>

                  {showErrorDetails && (
                    <div className={`rounded-lg border overflow-hidden ${
                      darkMode ? 'border-gray-700' : 'border-gray-200'
                    }`}>
                      <div className={`grid grid-cols-12 gap-2 px-4 py-2 text-xs font-medium uppercase tracking-wider ${
                        darkMode ? 'bg-gray-750 text-gray-500' : 'bg-gray-50 text-gray-400'
                      }`}>
                        <div className="col-span-1">Row</div>
                        <div className="col-span-3">Name</div>
                        <div className="col-span-8">Reason</div>
                      </div>
                      <div className="max-h-48 overflow-y-auto">
                        {importErrors.map((err, idx) => (
                          <div
                            key={idx}
                            className={`grid grid-cols-12 gap-2 px-4 py-2.5 text-sm border-t ${
                              darkMode ? 'border-gray-700' : 'border-gray-100'
                            }`}
                          >
                            <div className={`col-span-1 font-mono ${darkMode ? 'text-gray-500' : 'text-gray-400'}`}>
                              {err.row}
                            </div>
                            <div className={`col-span-3 font-medium truncate ${darkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                              {err.name}
                            </div>
                            <div className={`col-span-8 ${darkMode ? 'text-red-400/80' : 'text-red-600'}`}>
                              {err.reason}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

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
