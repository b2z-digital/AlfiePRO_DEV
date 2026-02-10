import React, { useState, useRef } from 'react';
import { X, Upload, Download, Users, CheckCircle, AlertCircle, Info, FileSpreadsheet, ArrowRight, ChevronDown, Zap, RotateCcw } from 'lucide-react';
import Papa from 'papaparse';
import { importAssociationMembersExtended, getUnclaimedMembers } from '../../utils/multiClubMembershipStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  associationId: string;
  associationType: 'state' | 'national';
  associationName: string;
  countryCode?: string;
}

interface FieldMapping {
  alfieField: string;
  label: string;
  required: boolean;
  csvColumn: string | null;
  autoDetected: boolean;
}

const ALFIE_FIELDS: Array<{ key: string; label: string; required: boolean; aliases: string[] }> = [
  {
    key: 'email',
    label: 'Email Address',
    required: true,
    aliases: ['email', 'contact email', 'e-mail', 'email address', 'mail', 'contact_email']
  },
  {
    key: 'first_name',
    label: 'First Name',
    required: true,
    aliases: ['first name', 'first_name', 'firstname', 'given name', 'given_name']
  },
  {
    key: 'last_name',
    label: 'Last Name',
    required: true,
    aliases: ['last name', 'last_name', 'lastname', 'surname', 'family name', 'family_name']
  },
  {
    key: 'phone',
    label: 'Phone',
    required: false,
    aliases: ['phone', 'mobile', 'mobile phone', 'mobile_phone', 'cell', 'telephone', 'contact phone', 'home phone', 'direct phone']
  },
  {
    key: 'street',
    label: 'Street Address',
    required: false,
    aliases: ['street', 'address', 'street address', 'address line 1', 'address_line_1']
  },
  {
    key: 'city',
    label: 'City / Suburb',
    required: false,
    aliases: ['city', 'suburb', 'town', 'locality']
  },
  {
    key: 'state',
    label: 'State',
    required: false,
    aliases: ['state', 'province', 'region']
  },
  {
    key: 'postcode',
    label: 'Postcode',
    required: false,
    aliases: ['postcode', 'zip', 'zip code', 'postal code', 'postal_code', 'zipcode']
  },
  {
    key: 'country',
    label: 'Country',
    required: false,
    aliases: ['country', 'nation', 'country code', 'country_code']
  },
  {
    key: 'membership_level',
    label: 'Membership Level',
    required: false,
    aliases: ['membership level', 'membership_level', 'membership type', 'membership_type', 'member type', 'level', 'type']
  },
  {
    key: 'date_joined',
    label: 'Date Joined',
    required: false,
    aliases: ['date joined', 'date_joined', 'join date', 'start date', 'start_date', 'registered', 'registration date']
  },
  {
    key: 'member_number',
    label: 'Member Number',
    required: false,
    aliases: ['member number', 'member_number', 'membership number', 'membership_number', 'member id', 'member_id', 'contact id', 'contact_id']
  },
  {
    key: 'nickname',
    label: 'Nickname',
    required: false,
    aliases: ['nickname', 'nick', 'preferred name', 'preferred_name', 'known as']
  }
];

function autoDetectMapping(csvHeaders: string[]): FieldMapping[] {
  return ALFIE_FIELDS.map(field => {
    const normalizedAliases = field.aliases.map(a => a.toLowerCase().trim());
    const matchedColumn = csvHeaders.find(header => {
      const normalizedHeader = header.toLowerCase().trim();
      return normalizedAliases.includes(normalizedHeader);
    });

    return {
      alfieField: field.key,
      label: field.label,
      required: field.required,
      csvColumn: matchedColumn || null,
      autoDetected: !!matchedColumn
    };
  });
}

export default function AssociationMemberImportModal({
  isOpen,
  onClose,
  associationId,
  associationType,
  associationName,
  countryCode = 'AUS'
}: Props) {
  const [step, setStep] = useState<'upload' | 'mapping' | 'preview' | 'importing' | 'complete'>('upload');
  const [rawData, setRawData] = useState<Record<string, string>[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; existing: number; errors: number } | null>(null);
  const [unclaimedCount, setUnclaimedCount] = useState<number>(0);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setFileName(file.name);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const data = results.data as Record<string, string>[];
        const headers = results.meta.fields || [];
        setRawData(data);
        setCsvHeaders(headers);
        const mappings = autoDetectMapping(headers);
        setFieldMappings(mappings);
        setStep('mapping');
      },
      error: (error) => {
        console.error('CSV parse error:', error);
        alert('Error parsing CSV file. Please check the format.');
      }
    });
  };

  const downloadTemplate = () => {
    const template = 'email,first_name,last_name,phone,street,city,state,postcode,country,membership_level,member_number\njohn@example.com,John,Smith,0412345678,45 Main St,Sydney,NSW,2000,AU,Senior,AUS-00001\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'member_import_template.csv';
    a.click();
  };

  const updateMapping = (alfieField: string, csvColumn: string | null) => {
    setFieldMappings(prev => prev.map(m =>
      m.alfieField === alfieField
        ? { ...m, csvColumn, autoDetected: false }
        : m
    ));
  };

  const getMappedMembers = () => {
    return rawData.map(row => {
      const member: Record<string, string> = {};
      fieldMappings.forEach(mapping => {
        if (mapping.csvColumn) {
          member[mapping.alfieField] = row[mapping.csvColumn] || '';
        }
      });

      if (!member.first_name && !member.last_name) {
        const contactCol = csvHeaders.find(h => h.toLowerCase() === 'contact' || h.toLowerCase() === 'full_name' || h.toLowerCase() === 'name');
        if (contactCol && row[contactCol]) {
          const parts = row[contactCol].trim().split(/\s+/);
          member.first_name = parts[0] || '';
          member.last_name = parts.slice(1).join(' ') || '';
        }
      }

      return member;
    }).filter(m => m.email || (m.first_name && m.last_name));
  };

  const mappedCount = fieldMappings.filter(m => m.csvColumn).length;
  const requiredMapped = fieldMappings.filter(m => m.required && m.csvColumn).length;
  const requiredTotal = fieldMappings.filter(m => m.required).length;
  const canProceed = requiredMapped === requiredTotal;

  const handleImport = async () => {
    setStep('importing');
    const members = getMappedMembers();

    const result = await importAssociationMembersExtended(
      members,
      associationId,
      associationType,
      countryCode
    );

    setImportResult(result);

    const unclaimed = await getUnclaimedMembers(associationId, associationType);
    setUnclaimedCount(unclaimed.length);

    setStep('complete');
  };

  const resetState = () => {
    setStep('upload');
    setRawData([]);
    setCsvHeaders([]);
    setFieldMappings([]);
    setImportResult(null);
    setFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  if (!isOpen) return null;

  const mappedMembers = step === 'preview' ? getMappedMembers() : [];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700/50">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/15 rounded-xl">
              <Users size={22} className="text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Import Association Members</h2>
              <p className="text-sm text-blue-100 mt-0.5">{associationName}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white hover:bg-white/15 p-2 rounded-xl transition"
          >
            <X size={20} />
          </button>
        </div>

        {(step === 'upload' || step === 'mapping' || step === 'preview') && (
          <div className="flex items-center gap-0 px-6 pt-5 pb-2">
            {['upload', 'mapping', 'preview'].map((s, i) => {
              const labels = ['Upload', 'Map Fields', 'Review'];
              const stepIndex = ['upload', 'mapping', 'preview'].indexOf(step);
              const isActive = i === stepIndex;
              const isComplete = i < stepIndex;
              return (
                <React.Fragment key={s}>
                  <div className="flex items-center gap-2">
                    <div className={`
                      w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-all
                      ${isComplete ? 'bg-emerald-500 text-white' : isActive ? 'bg-blue-500 text-white' : 'bg-slate-700 text-slate-400'}
                    `}>
                      {isComplete ? <CheckCircle size={14} /> : i + 1}
                    </div>
                    <span className={`text-sm font-medium ${isActive ? 'text-white' : isComplete ? 'text-emerald-400' : 'text-slate-500'}`}>
                      {labels[i]}
                    </span>
                  </div>
                  {i < 2 && (
                    <div className={`flex-1 h-px mx-3 ${i < stepIndex ? 'bg-emerald-500/50' : 'bg-slate-700'}`} />
                  )}
                </React.Fragment>
              );
            })}
          </div>
        )}

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-160px)]">
          {step === 'upload' && (
            <div className="space-y-6">
              <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold mb-1.5 text-blue-300">Smart Import</p>
                    <p className="text-blue-200/80">
                      Upload a CSV from any platform (TidyClubs, TidyHQ, spreadsheets, etc.) and we will automatically detect and map the columns to AlfiePro fields.
                    </p>
                  </div>
                </div>
              </div>

              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">Upload Member List</h3>
                <p className="text-slate-400 mb-6">
                  Upload a CSV file from any membership platform
                </p>

                <div className="flex flex-col items-center gap-4">
                  <label className="cursor-pointer">
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".csv"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                    <div className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-xl font-medium transition-colors flex items-center gap-2">
                      <FileSpreadsheet size={18} />
                      Select CSV File
                    </div>
                  </label>

                  <button
                    onClick={downloadTemplate}
                    className="text-blue-400 hover:text-blue-300 flex items-center gap-2 text-sm transition-colors"
                  >
                    <Download size={16} />
                    Download AlfiePro Template
                  </button>
                </div>
              </div>
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Map Your Fields</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {rawData.length} rows detected from <span className="text-slate-300">{fileName}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 text-sm">
                    <Zap size={14} className="text-emerald-400" />
                    <span className="text-emerald-400 font-medium">
                      {fieldMappings.filter(m => m.autoDetected && m.csvColumn).length} auto-detected
                    </span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-800/60 rounded-xl border border-slate-700/50 overflow-hidden">
                <div className="grid grid-cols-[1fr,40px,1fr,40px] items-center gap-0 px-4 py-3 bg-slate-800/80 border-b border-slate-700/50">
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">AlfiePro Field</span>
                  <span />
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Your CSV Column</span>
                  <span className="text-xs font-semibold uppercase tracking-wider text-slate-400 text-center">Status</span>
                </div>
                <div className="divide-y divide-slate-700/30">
                  {fieldMappings.map((mapping) => (
                    <div
                      key={mapping.alfieField}
                      className="grid grid-cols-[1fr,40px,1fr,40px] items-center gap-0 px-4 py-3 hover:bg-slate-800/40 transition-colors"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-200">{mapping.label}</span>
                        {mapping.required && (
                          <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/20">
                            Required
                          </span>
                        )}
                      </div>

                      <div className="flex justify-center">
                        <ArrowRight size={14} className="text-slate-600" />
                      </div>

                      <div className="relative">
                        <select
                          value={mapping.csvColumn || ''}
                          onChange={(e) => updateMapping(mapping.alfieField, e.target.value || null)}
                          className="w-full px-4 py-2.5 rounded-xl text-sm bg-slate-800/80 border border-slate-700/60 text-slate-200 appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500/50 transition-all"
                        >
                          <option value="">-- Skip this field --</option>
                          {csvHeaders.map(header => (
                            <option key={header} value={header}>{header}</option>
                          ))}
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                      </div>

                      <div className="flex justify-center">
                        {mapping.csvColumn ? (
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center ${mapping.autoDetected ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                            <CheckCircle size={14} className={mapping.autoDetected ? 'text-emerald-400' : 'text-blue-400'} />
                          </div>
                        ) : mapping.required ? (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-red-500/20">
                            <AlertCircle size={14} className="text-red-400" />
                          </div>
                        ) : (
                          <div className="w-6 h-6 rounded-full flex items-center justify-center bg-slate-700/50">
                            <span className="text-slate-600 text-xs">-</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-sm">
                      <span className="text-slate-400">Mapped: </span>
                      <span className="text-white font-medium">{mappedCount}/{fieldMappings.length}</span>
                    </div>
                    <div className="text-sm">
                      <span className="text-slate-400">Required: </span>
                      <span className={`font-medium ${canProceed ? 'text-emerald-400' : 'text-red-400'}`}>
                        {requiredMapped}/{requiredTotal}
                      </span>
                    </div>
                  </div>
                  <div className="text-xs text-slate-500">
                    {csvHeaders.length} columns in your CSV
                  </div>
                </div>
              </div>

              {!canProceed && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4">
                  <div className="flex items-center gap-2 text-sm text-red-300">
                    <AlertCircle size={16} className="text-red-400 flex-shrink-0" />
                    Please map all required fields before continuing. Missing:{' '}
                    {fieldMappings.filter(m => m.required && !m.csvColumn).map(m => m.label).join(', ')}
                  </div>
                </div>
              )}

              <div className="flex justify-between">
                <button
                  onClick={resetState}
                  className="px-4 py-2.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium flex items-center gap-2"
                >
                  <RotateCcw size={16} />
                  Upload Different File
                </button>
                <button
                  onClick={() => setStep('preview')}
                  disabled={!canProceed}
                  className={`
                    px-6 py-2.5 rounded-xl font-medium flex items-center gap-2 transition-colors
                    ${canProceed
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-slate-700 text-slate-500 cursor-not-allowed'}
                  `}
                >
                  Review Import
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">Review Members</h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {mappedMembers.length} members ready to import
                  </p>
                </div>
                <button
                  onClick={() => setStep('mapping')}
                  className="text-slate-400 hover:text-slate-300 text-sm transition-colors flex items-center gap-1.5"
                >
                  <RotateCcw size={14} />
                  Adjust Mapping
                </button>
              </div>

              <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="max-h-80 overflow-auto">
                  <table className="min-w-full divide-y divide-slate-700/50">
                    <thead className="bg-slate-800/80 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Name</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Email</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Phone</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Location</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/50">
                      {mappedMembers.slice(0, 50).map((member, index) => (
                        <tr key={index} className="hover:bg-slate-800/30 transition-colors">
                          <td className="px-4 py-2.5 text-sm text-slate-200 whitespace-nowrap">
                            {member.first_name} {member.last_name}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400 whitespace-nowrap">
                            {member.email || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400 whitespace-nowrap">
                            {member.phone || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400 whitespace-nowrap">
                            {[member.city, member.state].filter(Boolean).join(', ') || '-'}
                          </td>
                          <td className="px-4 py-2.5 text-sm text-slate-400 whitespace-nowrap">
                            {member.membership_level || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {mappedMembers.length > 50 && (
                  <div className="px-4 py-2 bg-slate-800/50 text-xs text-slate-500 text-center border-t border-slate-700/50">
                    Showing first 50 of {mappedMembers.length} members
                  </div>
                )}
              </div>

              <div className="flex items-center gap-3 bg-slate-800/40 rounded-xl p-4 border border-slate-700/30">
                <div className="flex flex-wrap gap-3 text-sm">
                  {fieldMappings.filter(m => m.csvColumn).map(m => (
                    <span key={m.alfieField} className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-medium">
                      {m.label}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex justify-between">
                <button
                  onClick={() => setStep('mapping')}
                  className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  <Users size={18} />
                  Import {mappedMembers.length} Members
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-white mb-2">Importing Members...</h3>
              <p className="text-slate-400">This may take a few moments</p>
            </div>
          )}

          {step === 'complete' && importResult && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="bg-emerald-500/15 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <CheckCircle size={40} className="text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Import Complete!</h3>
                <p className="text-slate-400">Members have been added to the AlfiePro platform</p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">{importResult.created}</div>
                  <div className="text-sm text-emerald-300/80">New Members</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-1">{importResult.existing}</div>
                  <div className="text-sm text-blue-300/80">Already Existed</div>
                </div>
                {importResult.errors > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-red-400 mb-1">{importResult.errors}</div>
                    <div className="text-sm text-red-300/80">Errors</div>
                  </div>
                )}
              </div>

              <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-semibold mb-1 text-amber-300">Next Steps</p>
                    <p className="text-amber-200/80">
                      {unclaimedCount} members are now in the system and ready to be claimed by clubs.
                      Clubs will see a notification to review and claim their members.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={resetState}
                  className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium"
                >
                  Import More
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
