import { useState, useRef } from 'react';
import { X, Upload, ClipboardPaste, ArrowRight, ArrowLeft, CheckCircle2, AlertTriangle, FileSpreadsheet } from 'lucide-react';
import Papa from 'papaparse';
import type { MarketingListMember } from '../../types/marketing';

interface ImportListMembersModalProps {
  darkMode: boolean;
  listName: string;
  listId: string;
  onImport: (members: Partial<MarketingListMember>[]) => Promise<void>;
  onClose: () => void;
}

interface FieldMapping {
  csvField: string;
  mappedTo: string | null;
  sampleData: string;
}

const TARGET_FIELDS = [
  { value: 'email', label: 'Email', required: true },
  { value: 'first_name', label: 'First Name' },
  { value: 'last_name', label: 'Last Name' },
  { value: 'skip', label: 'Skip (Do Not Import)' },
];

const AUTO_DETECT_MAP: Record<string, string> = {
  email: 'email',
  emailaddress: 'email',
  mail: 'email',
  firstname: 'first_name',
  fname: 'first_name',
  givenname: 'first_name',
  first: 'first_name',
  lastname: 'last_name',
  lname: 'last_name',
  surname: 'last_name',
  familyname: 'last_name',
  last: 'last_name',
};

function normalize(s: string): string {
  return s.toLowerCase().trim().replace(/[_\s\-\.]/g, '');
}

function autoDetect(header: string): string | null {
  const n = normalize(header);
  if (AUTO_DETECT_MAP[n]) return AUTO_DETECT_MAP[n];
  for (const [key, value] of Object.entries(AUTO_DETECT_MAP)) {
    if (n.includes(key) || key.includes(n)) return value;
  }
  return null;
}

function findHeaderRow(rows: string[][]): number {
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const row = rows[i];
    if (!row || row.length < 2) continue;
    const hasEmailCol = row.some(cell => {
      const n = normalize(cell);
      return n === 'email' || n === 'emailaddress' || n === 'mail';
    });
    const hasNameCol = row.some(cell => {
      const n = normalize(cell);
      return n.includes('name') || n.includes('surname') || n === 'first' || n === 'last';
    });
    if (hasEmailCol && hasNameCol) return i;
    if (hasEmailCol) return i;
  }
  return 0;
}

export function ImportListMembersModal({ darkMode, listName, listId, onImport, onClose }: ImportListMembersModalProps) {
  const [step, setStep] = useState<'source' | 'mapping' | 'preview'>('source');
  const [inputMethod, setInputMethod] = useState<'file' | 'paste'>('file');
  const [pasteText, setPasteText] = useState('');
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [csvData, setCsvData] = useState<Record<string, string>[]>([]);
  const [fieldMappings, setFieldMappings] = useState<FieldMapping[]>([]);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  function processRawCsv(text: string) {
    setError('');
    const firstPass = Papa.parse(text, { header: false, skipEmptyLines: true });
    const allRows = firstPass.data as string[][];

    if (allRows.length < 2) {
      setError('CSV must have at least a header row and one data row.');
      return;
    }

    const headerIdx = findHeaderRow(allRows);
    const headers = allRows[headerIdx].map(h => (h || '').trim()).filter(Boolean);
    const dataRows = allRows.slice(headerIdx + 1);

    if (headers.length === 0) {
      setError('Could not detect column headers. Make sure your CSV has column labels.');
      return;
    }

    const parsed: Record<string, string>[] = [];
    for (const row of dataRows) {
      if (!row || row.every(c => !c?.trim())) continue;
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => {
        obj[h] = (row[i] || '').trim();
      });
      parsed.push(obj);
    }

    if (parsed.length === 0) {
      setError('No data rows found after the header.');
      return;
    }

    setCsvHeaders(headers);
    setCsvData(parsed);

    const mappings: FieldMapping[] = headers.map(h => ({
      csvField: h,
      mappedTo: autoDetect(h),
      sampleData: parsed[0]?.[h] || '',
    }));

    setFieldMappings(mappings);
    setStep('mapping');
  }

  function handleFileUpload(file: File) {
    setFileName(file.name);
    file.text().then(text => processRawCsv(text));
  }

  function handlePasteImport() {
    if (!pasteText.trim()) {
      setError('Please paste some data first.');
      return;
    }
    processRawCsv(pasteText);
  }

  function updateMapping(csvField: string, newValue: string | null) {
    setFieldMappings(prev =>
      prev.map(m =>
        m.csvField === csvField ? { ...m, mappedTo: newValue } : m
      )
    );
  }

  function hasEmailMapping(): boolean {
    return fieldMappings.some(m => m.mappedTo === 'email');
  }

  function getMappedPreview(): { email: string; first_name: string; last_name: string }[] {
    const emailField = fieldMappings.find(m => m.mappedTo === 'email')?.csvField;
    const firstNameField = fieldMappings.find(m => m.mappedTo === 'first_name')?.csvField;
    const lastNameField = fieldMappings.find(m => m.mappedTo === 'last_name')?.csvField;

    if (!emailField) return [];

    return csvData
      .filter(row => row[emailField]?.includes('@'))
      .map(row => ({
        email: row[emailField] || '',
        first_name: firstNameField ? (row[firstNameField] || '') : '',
        last_name: lastNameField ? (row[lastNameField] || '') : '',
      }));
  }

  async function handleImport() {
    const preview = getMappedPreview();
    if (preview.length === 0) {
      setError('No valid records to import. Make sure at least one row has a valid email.');
      return;
    }

    setImporting(true);
    setError('');
    try {
      const members: Partial<MarketingListMember>[] = preview.map(row => ({
        list_id: listId,
        email: row.email.trim(),
        first_name: row.first_name.trim() || null,
        last_name: row.last_name.trim() || null,
        status: 'subscribed' as const,
        source: 'import',
      }));

      await onImport(members);
    } catch (err: any) {
      setError(err?.message || 'Import failed');
      setImporting(false);
    }
  }

  const preview = step === 'preview' ? getMappedPreview() : [];
  const mappedCount = fieldMappings.filter(m => m.mappedTo && m.mappedTo !== 'skip').length;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`rounded-2xl w-full max-w-2xl max-h-[85vh] flex flex-col shadow-2xl ${
        darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white'
      }`}>
        <div className={`flex items-center justify-between px-6 py-4 border-b ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            <h2 className={`text-lg font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              Import Members to {listName}
            </h2>
            <div className="flex items-center gap-3 mt-1">
              {['source', 'mapping', 'preview'].map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium ${
                    step === s
                      ? 'bg-blue-600 text-white'
                      : ['source', 'mapping', 'preview'].indexOf(step) > i
                        ? darkMode ? 'bg-green-500/20 text-green-400' : 'bg-green-100 text-green-600'
                        : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-500'
                  }`}>
                    {['source', 'mapping', 'preview'].indexOf(step) > i ? <CheckCircle2 className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className={`text-xs ${
                    step === s
                      ? darkMode ? 'text-white' : 'text-slate-900'
                      : darkMode ? 'text-slate-500' : 'text-slate-400'
                  }`}>
                    {s === 'source' ? 'Source' : s === 'mapping' ? 'Map Fields' : 'Preview'}
                  </span>
                  {i < 2 && <ArrowRight className={`w-3 h-3 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />}
                </div>
              ))}
            </div>
          </div>
          <button onClick={onClose} className={`p-2 rounded-lg transition-colors ${
            darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-100 text-slate-500'
          }`}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className={`flex items-start gap-2 p-3 rounded-lg mb-4 ${
              darkMode ? 'bg-red-500/10 border border-red-500/20' : 'bg-red-50 border border-red-200'
            }`}>
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{error}</p>
            </div>
          )}

          {step === 'source' && (
            <div className="space-y-5">
              <div className="flex gap-2">
                <button
                  onClick={() => setInputMethod('file')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    inputMethod === 'file'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : darkMode ? 'border-slate-700 text-slate-400 hover:border-slate-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Upload CSV File
                </button>
                <button
                  onClick={() => setInputMethod('paste')}
                  className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 rounded-xl border text-sm font-medium transition-all ${
                    inputMethod === 'paste'
                      ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                      : darkMode ? 'border-slate-700 text-slate-400 hover:border-slate-600' : 'border-slate-200 text-slate-500 hover:border-slate-300'
                  }`}
                >
                  <ClipboardPaste className="w-4 h-4" />
                  Paste Data
                </button>
              </div>

              {inputMethod === 'file' && (
                <div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt,.tsv"
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleFileUpload(f);
                    }}
                    className="hidden"
                  />
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className={`w-full px-6 py-8 rounded-xl border-2 border-dashed transition-colors ${
                      darkMode
                        ? 'border-slate-600 hover:border-slate-500 text-slate-300 hover:bg-slate-700/30'
                        : 'border-slate-300 hover:border-slate-400 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Upload className="w-8 h-8 opacity-50" />
                      {fileName ? (
                        <span className="text-sm font-medium">{fileName}</span>
                      ) : (
                        <>
                          <span className="text-sm font-medium">Choose CSV file</span>
                          <span className={`text-xs ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                            Supports .csv, .tsv, and .txt files
                          </span>
                        </>
                      )}
                    </div>
                  </button>
                  <p className={`text-xs mt-3 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                    The importer will automatically detect header rows, even if your file has title rows above the column headers.
                  </p>
                </div>
              )}

              {inputMethod === 'paste' && (
                <div>
                  <textarea
                    value={pasteText}
                    onChange={e => setPasteText(e.target.value)}
                    placeholder={"Paste CSV data here...\n\nExample:\nEmail, First Name, Last Name\njohn@example.com, John, Smith\njane@example.com, Jane, Doe"}
                    rows={10}
                    className={`w-full px-4 py-3 rounded-xl border text-sm font-mono resize-none ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-200 placeholder-slate-600'
                        : 'bg-slate-50 border-slate-300 text-slate-800 placeholder-slate-400'
                    } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                  />
                  <div className="flex justify-end mt-3">
                    <button
                      onClick={handlePasteImport}
                      disabled={!pasteText.trim()}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                    >
                      <ArrowRight className="w-4 h-4" />
                      Detect Columns
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 'mapping' && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg text-sm ${
                darkMode ? 'bg-slate-900/50 text-slate-300' : 'bg-slate-50 text-slate-600'
              }`}>
                Detected <strong>{csvHeaders.length}</strong> columns and <strong>{csvData.length}</strong> data rows. Map the columns below to the correct fields.
                {!hasEmailMapping() && (
                  <span className="text-red-400 font-medium ml-1">Email mapping is required.</span>
                )}
              </div>

              <div className="space-y-2">
                {fieldMappings.map((mapping) => (
                  <div
                    key={mapping.csvField}
                    className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                      mapping.mappedTo && mapping.mappedTo !== 'skip'
                        ? darkMode
                          ? 'border-green-500/30 bg-green-500/5'
                          : 'border-green-300 bg-green-50'
                        : darkMode
                          ? 'border-slate-700 bg-slate-800/50'
                          : 'border-slate-200 bg-white'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium truncate ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                        {mapping.csvField}
                      </p>
                      {mapping.sampleData && (
                        <p className={`text-xs truncate mt-0.5 ${darkMode ? 'text-slate-500' : 'text-slate-400'}`}>
                          e.g. {mapping.sampleData}
                        </p>
                      )}
                    </div>
                    <ArrowRight className={`w-4 h-4 flex-shrink-0 ${darkMode ? 'text-slate-600' : 'text-slate-300'}`} />
                    <select
                      value={mapping.mappedTo || 'skip'}
                      onChange={(e) => updateMapping(mapping.csvField, e.target.value === 'skip' ? 'skip' : e.target.value)}
                      className={`w-44 px-3 py-2 rounded-lg border text-sm ${
                        darkMode
                          ? 'bg-slate-700 border-slate-600 text-slate-200'
                          : 'bg-white border-slate-300 text-slate-800'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500/20`}
                    >
                      <option value="skip">Skip</option>
                      {TARGET_FIELDS.filter(f => f.value !== 'skip').map(f => (
                        <option key={f.value} value={f.value}>{f.label}{f.required ? ' *' : ''}</option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className={`p-3 rounded-lg text-sm ${
                darkMode ? 'bg-green-500/10 text-green-300 border border-green-500/20' : 'bg-green-50 text-green-700 border border-green-200'
              }`}>
                <strong>{preview.length}</strong> members ready to import.
              </div>

              <div className={`rounded-xl border overflow-hidden ${
                darkMode ? 'border-slate-700' : 'border-slate-200'
              }`}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className={darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}>
                      <th className={`px-4 py-2.5 text-left text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Email</th>
                      <th className={`px-4 py-2.5 text-left text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>First Name</th>
                      <th className={`px-4 py-2.5 text-left text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Last Name</th>
                    </tr>
                  </thead>
                  <tbody className={`divide-y ${darkMode ? 'divide-slate-700/50' : 'divide-slate-100'}`}>
                    {preview.slice(0, 50).map((row, i) => (
                      <tr key={i} className={darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
                        <td className={`px-4 py-2 ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>{row.email}</td>
                        <td className={`px-4 py-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.first_name || '-'}</td>
                        <td className={`px-4 py-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>{row.last_name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 50 && (
                  <div className={`px-4 py-2 text-xs text-center ${darkMode ? 'text-slate-500 bg-slate-700/30' : 'text-slate-400 bg-slate-50'}`}>
                    Showing first 50 of {preview.length} records
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <div className={`flex items-center justify-between px-6 py-4 border-t ${
          darkMode ? 'border-slate-700' : 'border-slate-200'
        }`}>
          <div>
            {step !== 'source' && (
              <button
                onClick={() => setStep(step === 'preview' ? 'mapping' : 'source')}
                disabled={importing}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-colors ${
                  darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              disabled={importing}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-800'
              }`}
            >
              Cancel
            </button>
            {step === 'mapping' && (
              <button
                onClick={() => {
                  if (!hasEmailMapping()) {
                    setError('You must map at least one column to Email.');
                    return;
                  }
                  setError('');
                  setStep('preview');
                }}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Preview
                <ArrowRight className="w-4 h-4" />
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                disabled={importing || preview.length === 0}
                className="flex items-center gap-2 px-5 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {importing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Importing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4" />
                    Import {preview.length} Members
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
