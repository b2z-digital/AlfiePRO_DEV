import React, { useState } from 'react';
import { Timer, ArrowRight, ArrowLeft, Upload, Check, Loader as Loader2 } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { Logo } from '../Logo';
import Papa from 'papaparse';

interface RaceManagementOnboardingProps {
  onComplete: () => void;
  onBack: () => void;
}

export const RaceManagementOnboarding: React.FC<RaceManagementOnboardingProps> = ({
  onComplete,
  onBack,
}) => {
  const [step, setStep] = useState(1);
  const [displayName, setDisplayName] = useState('');
  const [preferredClass, setPreferredClass] = useState('');
  const [saving, setSaving] = useState(false);
  const [importedCount, setImportedCount] = useState(0);
  const [importing, setImporting] = useState(false);

  const handleActivate = async () => {
    if (!displayName.trim()) return;
    setSaving(true);
    try {
      await supabase.rpc('activate_race_officer_mode', {
        p_display_name: displayName.trim(),
      });
      setStep(2);
    } catch (err) {
      console.error('Activation error:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleFileImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const { data: { user } } = await supabase.auth.getUser();
          if (!user) return;

          const contacts = results.data
            .map((row: any) => ({
              user_id: user.id,
              first_name: (row['First Name'] || row['first_name'] || row['FirstName'] || '').trim(),
              last_name: (row['Last Name'] || row['last_name'] || row['LastName'] || '').trim(),
              sail_number: (row['Sail Number'] || row['sail_number'] || row['SailNo'] || row['Sail'] || '').trim(),
              club: (row['Club'] || row['club'] || '').trim(),
              boat_class: preferredClass || (row['Class'] || row['boat_class'] || '').trim(),
              email: (row['Email'] || row['email'] || '').trim(),
            }))
            .filter((c: any) => c.first_name || c.last_name);

          if (contacts.length > 0) {
            const { error } = await supabase
              .from('race_officer_contacts')
              .insert(contacts);

            if (!error) {
              setImportedCount(contacts.length);
            }
          }
        } catch (err) {
          console.error('Import error:', err);
        } finally {
          setImporting(false);
        }
      },
      error: () => setImporting(false),
    });
  };

  const handleFinish = () => {
    window.location.href = '/';
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a] flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        <div className="flex items-center justify-center mb-6">
          <div className="flex items-center gap-3">
            <Logo size="large" />
            <h1 className="text-2xl text-white tracking-wide">
              <span className="font-thin">Alfie</span><span className="font-bold">PRO</span>
            </h1>
          </div>
        </div>

        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-sky-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Timer className="w-7 h-7 text-sky-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-1">Race Scoring Setup</h2>
          <p className="text-slate-400 text-sm">Step {step} of 2</p>
        </div>

        {step === 1 && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Your Name *</label>
                <input
                  type="text"
                  value={displayName}
                  onChange={e => setDisplayName(e.target.value)}
                  placeholder="e.g. John Smith"
                  className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Primary Boat Class (optional)</label>
                <input
                  type="text"
                  value={preferredClass}
                  onChange={e => setPreferredClass(e.target.value)}
                  placeholder="e.g. IOM, DF65, Marblehead"
                  className="w-full px-3 py-2.5 bg-slate-900/50 border border-slate-600 rounded-lg text-white text-sm placeholder:text-slate-500 focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={onBack}
                className="px-4 py-2.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-700 transition-colors flex items-center gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
              <button
                onClick={handleActivate}
                disabled={!displayName.trim() || saving}
                className="flex-1 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                Continue
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="bg-slate-800/60 border border-slate-700 rounded-2xl p-6">
            <h3 className="text-white font-medium mb-2">Import Your Skippers (Optional)</h3>
            <p className="text-slate-400 text-sm mb-4">
              Upload a CSV file with skipper details. You can also add them later.
            </p>

            <p className="text-xs text-slate-500 mb-3">
              CSV columns: First Name, Last Name, Sail Number, Club, Class, Email
            </p>

            {importedCount > 0 ? (
              <div className="bg-green-900/30 border border-green-700 rounded-lg p-4 text-center mb-4">
                <Check className="w-6 h-6 text-green-400 mx-auto mb-1" />
                <p className="text-green-300 font-medium">{importedCount} contacts imported</p>
              </div>
            ) : (
              <label className="block cursor-pointer mb-4">
                <div className="border-2 border-dashed border-slate-600 hover:border-sky-500 rounded-lg p-6 text-center transition-colors">
                  {importing ? (
                    <Loader2 className="w-6 h-6 text-sky-400 animate-spin mx-auto" />
                  ) : (
                    <>
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-sm text-slate-300">Click to upload CSV</p>
                    </>
                  )}
                </div>
                <input
                  type="file"
                  accept=".csv"
                  onChange={handleFileImport}
                  className="hidden"
                />
              </label>
            )}

            <button
              onClick={handleFinish}
              className="w-full bg-sky-600 hover:bg-sky-700 text-white py-2.5 rounded-lg font-medium flex items-center justify-center gap-2 transition-colors"
            >
              {importedCount > 0 ? 'Go to Dashboard' : 'Skip & Go to Dashboard'}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
