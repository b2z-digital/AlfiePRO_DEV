import React, { useState } from 'react';
import { Download, Upload, AlertTriangle, CheckCircle, X, FileJson, Info, Building2 } from 'lucide-react';
import { exportClubBackup, downloadBackup, importClubBackup, validateBackupFile, ClubBackupData } from '../../utils/backupRestore';
import { useAuth } from '../../contexts/AuthContext';
import { ClubSwitcher } from '../ClubSwitcher';

interface BackupRestoreSectionProps {
  darkMode: boolean;
}

interface ImportSelection {
  members: boolean;
  boats: boolean;
  races: boolean;
  raceSeries: boolean;
  venues: boolean;
  meetings: boolean;
  tasks: boolean;
  articles: boolean;
  transactions: boolean;
  invoices: boolean;
}

interface ImportProgress {
  members: 'pending' | 'importing' | 'completed' | 'error';
  boats: 'pending' | 'importing' | 'completed' | 'error';
  races: 'pending' | 'importing' | 'completed' | 'error';
  raceSeries: 'pending' | 'importing' | 'completed' | 'error';
  venues: 'pending' | 'importing' | 'completed' | 'error';
  meetings: 'pending' | 'importing' | 'completed' | 'error';
  tasks: 'pending' | 'importing' | 'completed' | 'error';
  articles: 'pending' | 'importing' | 'completed' | 'error';
  transactions: 'pending' | 'importing' | 'completed' | 'error';
  invoices: 'pending' | 'importing' | 'completed' | 'error';
}

export const BackupRestoreSection: React.FC<BackupRestoreSectionProps> = ({ darkMode }) => {
  const { currentClub, userClubs, setCurrentClub } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [importErrors, setImportErrors] = useState<string[]>([]);
  const [showImportModal, setShowImportModal] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [backupData, setBackupData] = useState<ClubBackupData | null>(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [importSelection, setImportSelection] = useState<ImportSelection>({
    members: true,
    boats: true,
    races: true,
    raceSeries: true,
    venues: true,
    meetings: true,
    tasks: true,
    articles: true,
    transactions: true,
    invoices: true,
  });
  const [importProgress, setImportProgress] = useState<ImportProgress>({
    members: 'pending',
    boats: 'pending',
    races: 'pending',
    raceSeries: 'pending',
    venues: 'pending',
    meetings: 'pending',
    tasks: 'pending',
    articles: 'pending',
    transactions: 'pending',
    invoices: 'pending',
  });
  const [isImporting, setIsImporting] = useState(false);

  const handleExportBackup = async () => {
    console.log('Current club:', currentClub);

    if (!currentClub) {
      setError('No club selected. Please select a club from the club switcher.');
      return;
    }

    if (!currentClub.clubId) {
      setError('Invalid club ID. Please try switching clubs and try again.');
      console.error('Current club object:', currentClub);
      return;
    }

    setLoading(true);
    setError(null);
    setSuccess(null);

    try {
      console.log('Attempting to export backup for club ID:', currentClub.clubId);
      const backup = await exportClubBackup(currentClub.clubId);
      const clubName = currentClub.club?.name || 'club';
      downloadBackup(backup, clubName);
      setSuccess('Backup downloaded successfully!');
    } catch (err) {
      console.error('Error exporting backup:', err);
      setError(err instanceof Error ? err.message : 'Failed to export backup');
    } finally {
      setLoading(false);
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.json')) {
      setError('Please select a valid JSON backup file');
      return;
    }

    setSelectedFile(file);
    setError(null);

    // Read and validate the file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target?.result as string);
        const validation = validateBackupFile(data);

        if (!validation.valid) {
          setError(`Invalid backup file: ${validation.errors.join(', ')}`);
          setSelectedFile(null);
          return;
        }

        setBackupData(data);
        setShowImportModal(true);
      } catch (err) {
        setError('Failed to read backup file. Please ensure it is a valid JSON file.');
        setSelectedFile(null);
      }
    };

    reader.readAsText(file);
  };

  const handleImportBackup = async () => {
    if (!currentClub || !backupData) {
      setError('Missing required data for import');
      return;
    }

    if (!currentClub.clubId) {
      setError('Invalid club ID. Please try switching clubs and try again.');
      return;
    }

    setIsImporting(true);
    setError(null);
    setSuccess(null);
    setImportErrors([]);

    // Reset progress for selected items
    const resetProgress: ImportProgress = {
      members: 'pending',
      boats: 'pending',
      races: 'pending',
      raceSeries: 'pending',
      venues: 'pending',
      meetings: 'pending',
      tasks: 'pending',
      articles: 'pending',
      transactions: 'pending',
      invoices: 'pending',
    };
    setImportProgress(resetProgress);

    // Create a filtered backup with only selected items
    const filteredBackup: ClubBackupData = {
      ...backupData,
      members: importSelection.members ? backupData.members : [],
      boats: importSelection.boats ? backupData.boats : [],
      races: importSelection.races ? backupData.races : [],
      race_series: importSelection.raceSeries ? backupData.race_series : [],
      venues: importSelection.venues ? backupData.venues : [],
      meetings: importSelection.meetings ? backupData.meetings : [],
      tasks: importSelection.tasks ? backupData.tasks : [],
      articles: importSelection.articles ? backupData.articles : [],
      finance_transactions: importSelection.transactions ? backupData.finance_transactions : [],
      finance_invoices: importSelection.invoices ? backupData.finance_invoices : [],
    };

    try {
      const result = await importClubBackup(
        currentClub.clubId,
        filteredBackup,
        importSelection,
        setImportProgress
      );

      if (result.success) {
        setSuccess('Backup imported successfully! Please refresh the page to see the imported data.');
        setTimeout(() => {
          setShowImportModal(false);
          setSelectedFile(null);
          setBackupData(null);
          setIsImporting(false);
        }, 2000);
      } else {
        setImportErrors(result.errors);
        if (result.errors.length > 0) {
          setError(`Import completed with ${result.errors.length} errors. See details below.`);
        }
        setIsImporting(false);
      }
    } catch (err) {
      console.error('Error importing backup:', err);
      setError(err instanceof Error ? err.message : 'Failed to import backup');
      setIsImporting(false);
    }
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    setSelectedFile(null);
    setBackupData(null);
    setImportErrors([]);
  };

  return (
    <>
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-medium text-white mb-2">Backup & Restore</h3>
        <p className="text-sm text-slate-400">
          Export your club data as a backup file or import data from a previous backup.
        </p>
      </div>

      {/* Active Club Indicator */}
      {currentClub && (
        <div className="bg-blue-900/20 border border-blue-900/30 rounded-xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Building2 className="text-blue-400" size={20} />
              <div>
                <p className="text-sm font-medium text-white">
                  Active Club: {currentClub.club?.name || 'Unknown Club'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  Backups will include data from this club only
                </p>
              </div>
            </div>
            {userClubs.length > 1 && (
              <ClubSwitcher
                currentClubId={currentClub?.clubId || null}
                onClubChange={(clubId) => {
                  const selectedClub = userClubs.find(c => c.clubId === clubId);
                  if (selectedClub) {
                    setCurrentClub(selectedClub);
                  }
                }}
              />
            )}
          </div>
        </div>
      )}

      {!currentClub && (
        <div className="bg-amber-900/20 border border-amber-900/30 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="text-sm font-medium text-amber-300">No Club Selected</p>
              <p className="text-xs text-slate-400 mt-1">
                Please select a club from the club switcher to enable backup and restore features.
              </p>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-lg bg-red-900/20 border border-red-900/30">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-red-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-red-300">{error}</p>
              {importErrors.length > 0 && (
                <div className="mt-2 max-h-40 overflow-y-auto">
                  <p className="text-xs text-red-400 font-medium mb-1">Import Errors:</p>
                  <ul className="text-xs text-red-300 space-y-1 list-disc list-inside">
                    {importErrors.slice(0, 10).map((err, idx) => (
                      <li key={idx}>{err}</li>
                    ))}
                    {importErrors.length > 10 && (
                      <li>... and {importErrors.length - 10} more errors</li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {success && (
        <div className="p-4 rounded-lg bg-green-900/20 border border-green-900/30">
          <div className="flex items-start gap-3">
            <CheckCircle className="h-5 w-5 text-green-400 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-green-300">{success}</p>
          </div>
        </div>
      )}

      <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
        <div className="flex items-start gap-3 mb-4">
          <Info className="h-5 w-5 text-blue-400 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-slate-300">
            <p className="font-medium mb-1">Important Information:</p>
            <ul className="list-disc list-inside space-y-1 text-slate-400">
              <li>Backups include all club data: members, races, events, venues, finances, and settings</li>
              <li>Media files (images/videos) are not included and must be re-uploaded manually</li>
              <li>When importing, new IDs will be generated to avoid conflicts</li>
              <li>Importing does not delete existing data - it adds to your current club data</li>
              <li>Backups can be imported into any club subscription</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Export Section */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Download className="text-blue-400" size={24} />
            <h4 className="text-lg font-medium text-white">Export Backup</h4>
          </div>

          <p className="text-sm text-slate-400 mb-6">
            Download a complete backup of all your club data as a JSON file. This file can be imported into any club subscription.
          </p>

          <button
            onClick={handleExportBackup}
            disabled={loading || !currentClub}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                <span>Exporting...</span>
              </>
            ) : (
              <>
                <Download size={20} />
                <span>Download Backup</span>
              </>
            )}
          </button>
        </div>

        {/* Import Section */}
        <div className="bg-slate-800/50 backdrop-blur-sm rounded-xl border border-slate-700/50 p-6">
          <div className="flex items-center gap-3 mb-4">
            <Upload className="text-green-400" size={24} />
            <h4 className="text-lg font-medium text-white">Import Backup</h4>
          </div>

          <p className="text-sm text-slate-400 mb-6">
            Upload a backup file to import data into this club. The imported data will be added to your existing club data.
          </p>

          <label className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 cursor-pointer">
            <Upload size={20} />
            <span>Select Backup File</span>
            <input
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
              disabled={loading || !currentClub}
            />
          </label>

          {selectedFile && (
            <div className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <FileJson size={16} className="text-green-400" />
              <span>{selectedFile.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Import Modal - Positioned to cover full screen */}
      {showImportModal && backupData && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-[9999] p-4">
          <div className="bg-slate-800 rounded-xl border border-slate-700 max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl">
            <div className="p-6 border-b border-slate-700">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-white">Confirm Backup Import</h3>
                <button
                  onClick={closeImportModal}
                  disabled={isImporting}
                  className="p-2 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/50 transition-colors disabled:opacity-50"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-700/50 rounded-lg p-4">
                <h4 className="text-sm font-medium text-white mb-2">Backup Information</h4>
                <div className="space-y-1 text-sm text-slate-300">
                  <p><span className="text-slate-400">Club Name:</span> {backupData.club.name}</p>
                  <p><span className="text-slate-400">Created:</span> {new Date(backupData.timestamp).toLocaleString()}</p>
                  <p><span className="text-slate-400">Version:</span> {backupData.version}</p>
                </div>
              </div>

              <div className="bg-slate-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-medium text-white">Data to be imported:</h4>
                  {!isImporting && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setImportSelection({
                          members: true,
                          boats: true,
                          races: true,
                          raceSeries: true,
                          venues: true,
                          meetings: true,
                          tasks: true,
                          articles: true,
                          transactions: true,
                          invoices: true,
                        })}
                        className="text-xs px-2 py-1 bg-blue-600/20 text-blue-400 rounded hover:bg-blue-600/30 transition-colors"
                      >
                        Select All
                      </button>
                      <button
                        onClick={() => setImportSelection({
                          members: false,
                          boats: false,
                          races: false,
                          raceSeries: false,
                          venues: false,
                          meetings: false,
                          tasks: false,
                          articles: false,
                          transactions: false,
                          invoices: false,
                        })}
                        className="text-xs px-2 py-1 bg-slate-600/20 text-slate-400 rounded hover:bg-slate-600/30 transition-colors"
                      >
                        Deselect All
                      </button>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { key: 'members', label: 'Members', count: backupData.members.length },
                    { key: 'boats', label: 'Boats', count: backupData.boats.length },
                    { key: 'races', label: 'Races', count: backupData.races.length },
                    { key: 'raceSeries', label: 'Race Series', count: backupData.race_series.length },
                    { key: 'venues', label: 'Venues', count: backupData.venues.length },
                    { key: 'meetings', label: 'Meetings', count: backupData.meetings.length },
                    { key: 'tasks', label: 'Tasks', count: backupData.tasks.length },
                    { key: 'articles', label: 'Articles', count: backupData.articles.length },
                    { key: 'transactions', label: 'Transactions', count: backupData.finance_transactions.length },
                    { key: 'invoices', label: 'Invoices', count: backupData.finance_invoices.length },
                  ].map(({ key, label, count }) => {
                    const progressState = importProgress[key as keyof ImportProgress];
                    return (
                      <div key={key} className="flex items-center justify-between gap-3 p-2 rounded-lg bg-slate-800/50">
                        <label className="flex items-center gap-2 flex-1 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={importSelection[key as keyof ImportSelection]}
                            onChange={(e) => setImportSelection(prev => ({
                              ...prev,
                              [key]: e.target.checked
                            }))}
                            disabled={isImporting}
                            className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-500 focus:ring-offset-slate-800 disabled:opacity-50"
                          />
                          <span className={`text-slate-300 ${!importSelection[key as keyof ImportSelection] ? 'opacity-50' : ''}`}>
                            {label}:
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <span className={`font-medium ${!importSelection[key as keyof ImportSelection] ? 'text-slate-500' : 'text-white'}`}>
                            {count}
                          </span>
                          {isImporting && importSelection[key as keyof ImportSelection] && (
                            <>
                              {progressState === 'importing' && (
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-400 border-t-transparent"></div>
                              )}
                              {progressState === 'completed' && (
                                <CheckCircle size={16} className="text-green-400" />
                              )}
                              {progressState === 'error' && (
                                <X size={16} className="text-red-400" />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="bg-yellow-900/20 border border-yellow-900/30 rounded-lg p-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-yellow-400 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-yellow-200">
                    <p className="font-medium mb-1">Important:</p>
                    <ul className="list-disc list-inside space-y-1 text-yellow-300/90">
                      <li>This will add all the data from the backup to your current club</li>
                      <li>Existing data will not be deleted or modified</li>
                      <li>New IDs will be generated to avoid conflicts</li>
                      <li>This action cannot be undone</li>
                    </ul>
                  </div>
                </div>
              </div>

              {!showConfirmation ? (
                <div className="flex justify-end gap-3 pt-4">
                  <button
                    onClick={closeImportModal}
                    disabled={isImporting}
                    className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => setShowConfirmation(true)}
                    disabled={isImporting || !Object.values(importSelection).some(v => v)}
                    className="px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isImporting ? 'Importing...' : 'Continue'}
                  </button>
                </div>
              ) : (
                <div className="space-y-4 pt-4">
                  <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
                    <p className="text-sm text-red-200 font-medium mb-2">
                      Are you absolutely sure you want to import this backup?
                    </p>
                    <p className="text-sm text-red-300">
                      Type <span className="font-mono bg-red-900/40 px-1">IMPORT</span> to confirm:
                    </p>
                    <input
                      type="text"
                      id="confirmInput"
                      className="mt-2 w-full px-3 py-2 bg-slate-700 text-slate-200 rounded-lg border border-slate-600 focus:outline-none focus:ring-2 focus:ring-green-500"
                      placeholder="Type IMPORT to confirm"
                      autoComplete="off"
                      disabled={isImporting}
                    />
                  </div>
                  <div className="flex justify-end gap-3">
                    <button
                      onClick={() => setShowConfirmation(false)}
                      disabled={isImporting}
                      className="px-4 py-2 bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Back
                    </button>
                    <button
                      onClick={() => {
                        const input = document.getElementById('confirmInput') as HTMLInputElement;
                        if (input?.value === 'IMPORT') {
                          handleImportBackup();
                        }
                      }}
                      disabled={isImporting}
                      className="flex items-center gap-2 px-6 py-2 bg-gradient-to-r from-green-600 to-emerald-600 text-white rounded-lg hover:shadow-lg hover:shadow-green-500/20 hover:scale-105 font-medium transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isImporting ? (
                        <>
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          <span>Importing...</span>
                        </>
                      ) : (
                        <>
                          <Upload size={18} />
                          <span>Import Backup</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
    </>
  );
};
