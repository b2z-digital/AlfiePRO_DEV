import React, { useState } from 'react';
import { X, Upload, Download, Users, CheckCircle, AlertCircle, Info } from 'lucide-react';
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

    // Fetch unclaimed members count
    const unclaimed = await getUnclaimedMembers(associationId, associationType);
    setUnclaimedCount(unclaimed.length);

    setStep('complete');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold">Import Association Members</h2>
            <p className="text-sm text-blue-100 mt-1">{associationName}</p>
          </div>
          <button
            onClick={onClose}
            className="text-white hover:bg-white/20 p-2 rounded-lg transition"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Info Banner */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
            <div className="flex items-start gap-3">
              <Info size={20} className="text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">How Member Import Works</p>
                <ul className="list-disc list-inside space-y-1 text-blue-800">
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
              <div className="text-center py-8">
                <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                <h3 className="text-lg font-semibold text-gray-900 mb-2">
                  Upload Member List
                </h3>
                <p className="text-gray-600 mb-6">
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
                    <div className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg font-medium transition">
                      Select CSV File
                    </div>
                  </label>

                  <button
                    onClick={downloadTemplate}
                    className="text-blue-600 hover:text-blue-700 flex items-center gap-2 text-sm"
                  >
                    <Download size={16} />
                    Download CSV Template
                  </button>
                </div>
              </div>

              <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                <h4 className="font-semibold text-gray-900 mb-3">Required Columns:</h4>
                <ul className="space-y-2 text-sm text-gray-700">
                  <li><span className="font-medium">email</span> - Member's email address (required)</li>
                  <li><span className="font-medium">full_name</span> - Member's full name (required)</li>
                  <li><span className="font-medium">date_of_birth</span> - Date of birth (optional, format: YYYY-MM-DD)</li>
                  <li><span className="font-medium">phone</span> - Phone number (optional)</li>
                  <li><span className="font-medium">member_number</span> - Existing member number (optional)</li>
                </ul>
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900">
                    Review Members
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">
                    {members.length} members ready to import
                  </p>
                </div>
                <button
                  onClick={() => setStep('upload')}
                  className="text-gray-600 hover:text-gray-800 text-sm"
                >
                  Upload Different File
                </button>
              </div>

              <div className="border border-gray-200 rounded-lg overflow-hidden">
                <div className="max-h-96 overflow-y-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50 sticky top-0">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Name
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Email
                        </th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Member #
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {members.map((member, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm text-gray-900">
                            {member.full_name}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
                            {member.email}
                          </td>
                          <td className="px-4 py-3 text-sm text-gray-600">
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
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleImport}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium flex items-center gap-2"
                >
                  <Users size={18} />
                  Import {members.length} Members
                </button>
              </div>
            </div>
          )}

          {step === 'importing' && (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-600 border-t-transparent mx-auto mb-4"></div>
              <h3 className="text-lg font-semibold text-gray-900 mb-2">
                Importing Members...
              </h3>
              <p className="text-gray-600">
                This may take a few moments
              </p>
            </div>
          )}

          {step === 'complete' && importResult && (
            <div className="space-y-6">
              <div className="text-center py-8">
                <div className="bg-green-100 rounded-full p-4 w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <CheckCircle size={40} className="text-green-600" />
                </div>
                <h3 className="text-xl font-bold text-gray-900 mb-2">
                  Import Complete!
                </h3>
                <p className="text-gray-600">
                  Members have been added to the AlfiePro platform
                </p>
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600 mb-1">
                    {importResult.created}
                  </div>
                  <div className="text-sm text-green-700">New Members</div>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-blue-600 mb-1">
                    {importResult.existing}
                  </div>
                  <div className="text-sm text-blue-700">Already Existed</div>
                </div>
                {importResult.errors > 0 && (
                  <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-center">
                    <div className="text-3xl font-bold text-red-600 mb-1">
                      {importResult.errors}
                    </div>
                    <div className="text-sm text-red-700">Errors</div>
                  </div>
                )}
              </div>

              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertCircle size={20} className="text-yellow-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-900">
                    <p className="font-semibold mb-1">Next Steps</p>
                    <p>
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
                  className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
                >
                  Import More
                </button>
                <button
                  onClick={onClose}
                  className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium"
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
