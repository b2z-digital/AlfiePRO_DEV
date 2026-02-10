import React, { useState } from 'react';
import { X, Upload, Download, Users, CheckCircle, AlertCircle, Info, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import { importAssociationMembers, getUnclaimedMembers } from '../../utils/multiClubMembershipStorage';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  associationId: string;
  associationType: 'state' | 'national';
  associationName: string;
  countryCode?: string;
}

interface ImportMember {
  email: string;
  full_name: string;
  date_of_birth?: string;
  phone?: string;
  member_number?: string;
}

export default function AssociationMemberImportModal({
  isOpen,
  onClose,
  associationId,
  associationType,
  associationName,
  countryCode = 'AUS'
}: Props) {
  const [step, setStep] = useState<'upload' | 'preview' | 'importing' | 'complete'>('upload');
  const [members, setMembers] = useState<ImportMember[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; existing: number; errors: number } | null>(null);
  const [unclaimedCount, setUnclaimedCount] = useState<number>(0);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        const parsedMembers = results.data.map((row: any) => ({
          email: row.email || row.Email || '',
          full_name: row.full_name || row.name || row.Name || `${row.first_name || ''} ${row.last_name || ''}`.trim(),
          date_of_birth: row.date_of_birth || row.dob || row.DOB || '',
          phone: row.phone || row.Phone || '',
          member_number: row.member_number || row.membership_number || ''
        })).filter((m: ImportMember) => m.email && m.full_name);

        setMembers(parsedMembers);
        setStep('preview');
      },
      error: (error) => {
        console.error('CSV parse error:', error);
        alert('Error parsing CSV file. Please check the format.');
      }
    });
  };

  const downloadTemplate = () => {
    const template = 'email,full_name,date_of_birth,phone,member_number\njohn.smith@example.com,John Smith,1980-05-15,0412345678,AUS-00001\n';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'member_import_template.csv';
    a.click();
  };

  const handleImport = async () => {
    setStep('importing');

    const result = await importAssociationMembers(
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden border border-slate-700/50">
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

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-88px)]">
          <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info size={20} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-semibold mb-1.5 text-blue-300">How Member Import Works</p>
                <ul className="list-disc list-inside space-y-1 text-blue-200/80">
                  <li>Members are added to the AlfiePro platform without requiring them to sign up</li>
                  <li>Clubs can then claim their members from the imported list</li>
                  <li>No emails are sent to members during import - admins handle everything</li>
                  <li>Members can access their accounts once a club claims them and sets up their membership</li>
                </ul>
              </div>
            </div>
          </div>

          {step === 'upload' && (
            <div className="space-y-6">
              <div className="text-center py-10">
                <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                  <Upload size={28} className="text-slate-400" />
                </div>
                <h3 className="text-lg font-semibold text-white mb-2">
                  Upload Member List
                </h3>
                <p className="text-slate-400 mb-6">
                  Upload a CSV file containing your member information
                </p>

                <div className="flex flex-col items-center gap-4">
                  <label className="cursor-pointer">
                    <input
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
                    Download CSV Template
                  </button>
                </div>
              </div>

              <div className="bg-slate-800/80 rounded-xl p-5 border border-slate-700/50">
                <h4 className="font-semibold text-slate-200 mb-3">Required Columns:</h4>
                <ul className="space-y-2.5 text-sm text-slate-400">
                  <li><span className="font-medium text-slate-300">email</span> - Member's email address (required)</li>
                  <li><span className="font-medium text-slate-300">full_name</span> - Member's full name (required)</li>
                  <li><span className="font-medium text-slate-300">date_of_birth</span> - Date of birth (optional, format: YYYY-MM-DD)</li>
                  <li><span className="font-medium text-slate-300">phone</span> - Phone number (optional)</li>
                  <li><span className="font-medium text-slate-300">member_number</span> - Existing member number (optional)</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-white">
                    Review Members
                  </h3>
                  <p className="text-sm text-slate-400 mt-1">
                    {members.length} members ready to import
                  </p>
                </div>
                <button
                  onClick={() => setStep('upload')}
                  className="text-slate-400 hover:text-slate-300 text-sm transition-colors"
                >
                  Upload Different File
                </button>
              </div>

              <div className="border border-slate-700/50 rounded-xl overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-slate-700/50">
                    <thead className="bg-slate-800/80 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-slate-400 uppercase tracking-wider">
                          Member #
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {members.map((member, index) => (
                        <tr key={index} className="hover:bg-slate-800/50 transition-colors">
                          <td className="px-4 py-3 text-sm text-slate-200">
                            {member.full_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {member.email}
                          </td>
                          <td className="px-4 py-3 text-sm text-slate-400">
                            {member.member_number || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={onClose}
                  className="px-4 py-2.5 text-slate-300 hover:text-white hover:bg-slate-800 rounded-xl transition-colors font-medium"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-medium flex items-center gap-2 transition-colors"
                >
                  <Users size={18} />
                  Import {members.length} Members
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-white mb-2">
                Importing Members...
              </h3>
              <p className="text-slate-400">
                This may take a few moments
              </p>
            </div>
          )}

          {step === 'complete' && importResult && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="bg-emerald-500/15 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <CheckCircle size={40} className="text-emerald-400" />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">
                  Import Complete!
                </h3>
                <p className="text-slate-400">
                  Members have been added to the AlfiePro platform
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-emerald-400 mb-1">
                    {importResult.created}
                  </div>
                  <div className="text-sm text-emerald-300/80">New Members</div>
                </div>
                <div className="bg-blue-500/10 border border-blue-500/20 rounded-xl p-4 text-center">
                  <div className="text-3xl font-bold text-blue-400 mb-1">
                    {importResult.existing}
                  </div>
                  <div className="text-sm text-blue-300/80">Already Existed</div>
                </div>
                {importResult.errors > 0 && (
                  <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-4 text-center">
                    <div className="text-3xl font-bold text-red-400 mb-1">
                      {importResult.errors}
                    </div>
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
                  onClick={() => {
                    setStep('upload');
                    setMembers([]);
                    setImportResult(null);
                  }}
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
