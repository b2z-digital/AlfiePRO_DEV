import React, { useState, useCallback, useRef } from 'react';
import { X, Upload, FileSpreadsheet, CheckCircle, AlertCircle, Download, ArrowRight, ChevronLeft } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../../utils/supabase';
import { useNotifications } from '../../contexts/NotificationContext';

interface TransactionImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImportComplete: () => void;
  darkMode: boolean;
  clubId?: string;
  associationId?: string;
  associationType?: 'state' | 'national';
}

type ImportStep = 'upload' | 'mapping' | 'preview' | 'importing' | 'complete';

interface ColumnMapping {
  csvColumn: string;
  alfieField: string;
}

interface ValidationError {
  row: number;
  field: string;
  error: string;
}

const ALFIE_FIELDS = [
  { value: 'date', label: 'Date *', required: true },
  { value: 'description', label: 'Description *', required: true },
  { value: 'amount', label: 'Amount *', required: true },
  { value: 'type', label: 'Type (income/expense) *', required: true },
  { value: 'category', label: 'Category', required: false },
  { value: 'payment_method', label: 'Payment Method', required: false },
  { value: 'reference', label: 'Reference', required: false },
  { value: 'notes', label: 'Notes', required: false },
  { value: '__ignore__', label: '--- Ignore Column ---', required: false }
];

export const TransactionImportModal: React.FC<TransactionImportModalProps> = ({
  isOpen,
  onClose,
  onImportComplete,
  darkMode,
  clubId,
  associationId,
  associationType
}) => {
  const { addNotification } = useNotifications();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<ImportStep>('upload');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvData, setCsvData] = useState<any[]>([]);
  const [csvHeaders, setCsvHeaders] = useState<string[]>([]);
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [importProgress, setImportProgress] = useState({ current: 0, total: 0, errors: 0 });
  const [isDragging, setIsDragging] = useState(false);

  const isAssociation = !!associationId && !!associationType;

  // Auto-detect column mappings using intelligent pattern matching
  const autoDetectMapping = useCallback((headers: string[]): ColumnMapping[] => {
    const mappings: ColumnMapping[] = [];

    const patterns: Record<string, RegExp[]> = {
      date: [/date/i, /when/i, /timestamp/i, /time/i],
      description: [/description/i, /detail/i, /particulars/i, /memo/i, /narrative/i],
      amount: [/amount/i, /value/i, /sum/i, /total/i, /price/i, /\$/],
      type: [/type/i, /kind/i, /category_type/i, /transaction_type/i],
      category: [/category/i, /class/i, /group/i],
      payment_method: [/payment/i, /method/i, /mode/i, /how/i],
      reference: [/reference/i, /ref/i, /number/i, /id/i, /invoice/i],
      notes: [/notes/i, /comment/i, /remark/i]
    };

    headers.forEach(header => {
      let matched = false;

      for (const [field, regexList] of Object.entries(patterns)) {
        if (regexList.some(regex => regex.test(header))) {
          mappings.push({ csvColumn: header, alfieField: field });
          matched = true;
          break;
        }
      }

      if (!matched) {
        mappings.push({ csvColumn: header, alfieField: '__ignore__' });
      }
    });

    return mappings;
  }, []);

  // Load categories
  const loadCategories = useCallback(async () => {
    try {
      if (isAssociation) {
        const { data, error } = await supabase
          .from('association_budget_categories')
          .select('*')
          .eq('association_id', associationId)
          .eq('association_type', associationType)
          .eq('is_active', true)
          .order('name');

        if (!error && data) {
          setCategories(data);
        }
      } else if (clubId) {
        const { data, error } = await supabase
          .from('budget_categories')
          .select('*')
          .eq('club_id', clubId)
          .eq('is_active', true)
          .order('name');

        if (!error && data) {
          setCategories(data);
        }
      }
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  }, [clubId, associationId, associationType, isAssociation]);

  // Handle file selection
  const handleFileSelect = useCallback((file: File) => {
    if (!file.name.endsWith('.csv')) {
      addNotification('error', 'Please select a CSV file');
      return;
    }

    setCsvFile(file);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length === 0) {
          addNotification('error', 'CSV file is empty');
          return;
        }

        const headers = Object.keys(results.data[0]);
        setCsvHeaders(headers);
        setCsvData(results.data);

        const autoMappings = autoDetectMapping(headers);
        setColumnMappings(autoMappings);

        loadCategories();
        setStep('mapping');
      },
      error: (error) => {
        addNotification('error', `Error parsing CSV: ${error.message}`);
      }
    });
  }, [addNotification, autoDetectMapping, loadCategories]);

  // Handle drag and drop
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFileSelect(files[0]);
    }
  }, [handleFileSelect]);

  // Update column mapping
  const updateMapping = (csvColumn: string, alfieField: string) => {
    setColumnMappings(prev =>
      prev.map(m => m.csvColumn === csvColumn ? { ...m, alfieField } : m)
    );
  };

  // Validate data before import
  const validateData = useCallback((): boolean => {
    const errors: ValidationError[] = [];
    const requiredFields = ALFIE_FIELDS.filter(f => f.required).map(f => f.value);

    // Check if all required fields are mapped
    const mappedFields = columnMappings
      .filter(m => m.alfieField !== '__ignore__')
      .map(m => m.alfieField);

    const missingRequired = requiredFields.filter(f => !mappedFields.includes(f));
    if (missingRequired.length > 0) {
      addNotification('error', `Missing required fields: ${missingRequired.join(', ')}`);
      return false;
    }

    // Validate each row
    csvData.forEach((row, index) => {
      columnMappings.forEach(mapping => {
        if (mapping.alfieField === '__ignore__') return;

        const value = row[mapping.csvColumn];

        // Check required fields
        if (ALFIE_FIELDS.find(f => f.value === mapping.alfieField)?.required) {
          if (!value || value.toString().trim() === '') {
            errors.push({
              row: index + 1,
              field: mapping.alfieField,
              error: 'Required field is empty'
            });
          }
        }

        // Validate amount
        if (mapping.alfieField === 'amount' && value) {
          const numValue = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
          if (isNaN(numValue) || numValue <= 0) {
            errors.push({
              row: index + 1,
              field: 'amount',
              error: 'Invalid amount value'
            });
          }
        }

        // Validate type
        if (mapping.alfieField === 'type' && value) {
          const normalizedType = value.toString().toLowerCase().trim();
          if (!['income', 'expense', 'in', 'out', 'debit', 'credit'].includes(normalizedType)) {
            errors.push({
              row: index + 1,
              field: 'type',
              error: 'Type must be "income" or "expense"'
            });
          }
        }

        // Validate date
        if (mapping.alfieField === 'date' && value) {
          const dateValue = new Date(value);
          if (isNaN(dateValue.getTime())) {
            errors.push({
              row: index + 1,
              field: 'date',
              error: 'Invalid date format'
            });
          }
        }
      });
    });

    setValidationErrors(errors);

    if (errors.length > 0) {
      addNotification('warning', `Found ${errors.length} validation errors. Please review before importing.`);
    }

    return errors.length === 0;
  }, [csvData, columnMappings, addNotification]);

  // Preview data with mapping
  const getPreviewData = useCallback(() => {
    return csvData.slice(0, 10).map(row => {
      const mapped: any = {};
      columnMappings.forEach(mapping => {
        if (mapping.alfieField !== '__ignore__') {
          mapped[mapping.alfieField] = row[mapping.csvColumn];
        }
      });
      return mapped;
    });
  }, [csvData, columnMappings]);

  // Import transactions
  const importTransactions = useCallback(async () => {
    setStep('importing');
    setImportProgress({ current: 0, total: csvData.length, errors: 0 });

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < csvData.length; i++) {
      try {
        const row = csvData[i];
        const transaction: any = {};

        // Map columns
        columnMappings.forEach(mapping => {
          if (mapping.alfieField !== '__ignore__') {
            let value = row[mapping.csvColumn];

            // Transform values
            if (mapping.alfieField === 'amount') {
              value = parseFloat(value.toString().replace(/[^0-9.-]/g, ''));
            } else if (mapping.alfieField === 'type') {
              const normalizedType = value.toString().toLowerCase().trim();
              value = ['income', 'in', 'credit'].includes(normalizedType) ? 'income' : 'expense';
            } else if (mapping.alfieField === 'date') {
              value = new Date(value).toISOString().split('T')[0];
            } else if (mapping.alfieField === 'category') {
              // Try to match category by name
              const matchedCategory = categories.find(c =>
                c.name.toLowerCase() === value.toString().toLowerCase()
              );
              if (matchedCategory) {
                transaction.category_id = matchedCategory.id;
              }
              value = undefined; // Don't set category as a direct field
            }

            if (value !== undefined && mapping.alfieField !== 'category') {
              transaction[mapping.alfieField] = value;
            }
          }
        });

        // Add organization context
        if (isAssociation) {
          transaction.association_id = associationId;
          transaction.association_type = associationType;
          transaction.payment_status = 'completed';
        } else {
          transaction.club_id = clubId;
          transaction.payment_status = 'completed';
        }

        // Insert transaction
        const tableName = isAssociation ? 'association_transactions' : 'transactions';
        const { error } = await supabase
          .from(tableName)
          .insert(transaction);

        if (error) {
          console.error(`Error importing row ${i + 1}:`, error);
          errorCount++;
        } else {
          successCount++;
        }
      } catch (err) {
        console.error(`Error processing row ${i + 1}:`, err);
        errorCount++;
      }

      setImportProgress({ current: i + 1, total: csvData.length, errors: errorCount });
    }

    setStep('complete');

    if (successCount > 0) {
      addNotification('success', `Successfully imported ${successCount} transactions`);
      if (errorCount > 0) {
        addNotification('warning', `${errorCount} transactions failed to import`);
      }
      onImportComplete();
    } else {
      addNotification('error', 'Failed to import transactions');
    }
  }, [csvData, columnMappings, categories, clubId, associationId, associationType, isAssociation, addNotification, onImportComplete]);

  // Download template
  const downloadTemplate = () => {
    const template = 'Date,Description,Amount,Type,Category,Payment Method,Reference,Notes\n' +
      '2024-01-15,Membership Fee,100.00,income,Membership,card,INV-001,\n' +
      '2024-01-16,Office Supplies,45.50,expense,Supplies,cash,REF-002,\n' +
      '2024-01-17,Event Registration,250.00,income,Events,bank_transfer,REG-003,';

    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'alfie_transactions_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleClose = () => {
    setStep('upload');
    setCsvFile(null);
    setCsvData([]);
    setCsvHeaders([]);
    setColumnMappings([]);
    setValidationErrors([]);
    setImportProgress({ current: 0, total: 0, errors: 0 });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-xl shadow-xl border ${darkMode ? 'bg-slate-800 text-white border-slate-700' : 'bg-white text-gray-900 border-slate-200'}`}>
        {/* Header */}
        <div className={`p-6 border-b sticky top-0 z-10 ${darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'}`}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
                <FileSpreadsheet className="text-blue-600 dark:text-blue-400" size={20} />
              </div>
              <div>
                <h2 className={`text-xl font-semibold ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Import Transactions
                </h2>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {step === 'upload' && 'Upload your CSV file'}
                  {step === 'mapping' && 'Map CSV columns to AlfiePRO fields'}
                  {step === 'preview' && 'Review data before import'}
                  {step === 'importing' && 'Importing transactions...'}
                  {step === 'complete' && 'Import complete'}
                </p>
              </div>
            </div>
            <button
              onClick={handleClose}
              className={`rounded-full p-2 transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}`}
            >
              <X size={20} />
            </button>
          </div>

          {/* Progress Steps */}
          <div className="flex items-center gap-2 mt-6">
            {['upload', 'mapping', 'preview', 'importing'].map((s, idx) => (
              <React.Fragment key={s}>
                <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                  step === s
                    ? 'bg-blue-500 text-white'
                    : ['upload', 'mapping', 'preview', 'importing'].indexOf(step) > idx
                      ? darkMode ? 'bg-green-900/30 text-green-400' : 'bg-green-100 text-green-700'
                      : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-100 text-slate-600'
                }`}>
                  <span>{idx + 1}</span>
                  <span className="capitalize">{s}</span>
                </div>
                {idx < 3 && <ArrowRight size={14} className={darkMode ? 'text-slate-600' : 'text-slate-400'} />}
              </React.Fragment>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="p-6">
          {/* Upload Step */}
          {step === 'upload' && (
            <div className="space-y-4">
              <div
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                className={`
                  border-2 border-dashed rounded-xl p-12 text-center transition-all cursor-pointer
                  ${isDragging
                    ? 'border-blue-500 bg-blue-500/10'
                    : darkMode
                      ? 'border-slate-600 hover:border-slate-500 bg-slate-700/30'
                      : 'border-slate-300 hover:border-slate-400 bg-slate-50'}
                `}
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className={`mx-auto mb-4 ${isDragging ? 'text-blue-500' : darkMode ? 'text-slate-400' : 'text-slate-500'}`} size={48} />
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  {isDragging ? 'Drop your CSV file here' : 'Drag and drop your CSV file'}
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  or click to browse files
                </p>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                  className="hidden"
                />
              </div>

              <div className="flex items-center gap-4 pt-4">
                <button
                  onClick={downloadTemplate}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${darkMode ? 'border-slate-600 hover:bg-slate-700 text-slate-300' : 'border-slate-300 hover:bg-slate-50 text-slate-700'}`}
                >
                  <Download size={16} />
                  Download Template
                </button>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Use our template to format your data correctly
                </p>
              </div>
            </div>
          )}

          {/* Mapping Step */}
          {step === 'mapping' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-blue-900/20 border border-blue-800' : 'bg-blue-50 border border-blue-200'}`}>
                <p className={`text-sm ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                  We've automatically detected some column mappings. Please review and adjust as needed.
                </p>
              </div>

              <div className="space-y-3">
                {columnMappings.map((mapping, idx) => (
                  <div key={idx} className={`flex items-center gap-4 p-3 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                    <div className="flex-1">
                      <label className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        CSV Column
                      </label>
                      <div className={`mt-1 px-3 py-2 rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}>
                        {mapping.csvColumn}
                      </div>
                    </div>
                    <ArrowRight size={16} className={darkMode ? 'text-slate-500' : 'text-slate-400'} />
                    <div className="flex-1">
                      <label className={`text-xs font-medium ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        AlfiePRO Field
                      </label>
                      <select
                        value={mapping.alfieField}
                        onChange={(e) => updateMapping(mapping.csvColumn, e.target.value)}
                        className={`mt-1 w-full px-3 py-2 rounded border ${darkMode ? 'bg-slate-700 border-slate-600 text-white' : 'bg-white border-slate-300 text-slate-900'}`}
                      >
                        {ALFIE_FIELDS.map(field => (
                          <option key={field.value} value={field.value}>
                            {field.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>

              <div className="flex justify-between gap-3 pt-4">
                <button
                  onClick={() => setStep('upload')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <ChevronLeft size={16} />
                  Back
                </button>
                <button
                  onClick={() => {
                    if (validateData()) {
                      setStep('preview');
                    }
                  }}
                  className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
                >
                  Continue to Preview
                </button>
              </div>
            </div>
          )}

          {/* Preview Step */}
          {step === 'preview' && (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-slate-50'}`}>
                <div className="flex items-center justify-between mb-2">
                  <p className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Preview (first 10 rows)
                  </p>
                  <span className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Total: {csvData.length} transactions
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className={`w-full text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  <thead>
                    <tr className={darkMode ? 'bg-slate-700' : 'bg-slate-100'}>
                      {ALFIE_FIELDS.filter(f => f.value !== '__ignore__' && columnMappings.some(m => m.alfieField === f.value)).map(field => (
                        <th key={field.value} className="px-3 py-2 text-left text-xs font-medium">
                          {field.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className={darkMode ? 'divide-y divide-slate-700' : 'divide-y divide-slate-200'}>
                    {getPreviewData().map((row, idx) => (
                      <tr key={idx} className={darkMode ? 'hover:bg-slate-700/30' : 'hover:bg-slate-50'}>
                        {ALFIE_FIELDS.filter(f => f.value !== '__ignore__' && columnMappings.some(m => m.alfieField === f.value)).map(field => (
                          <td key={field.value} className="px-3 py-2">
                            {row[field.value] || '-'}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {validationErrors.length > 0 && (
                <div className={`p-4 rounded-lg ${darkMode ? 'bg-amber-900/20 border border-amber-800' : 'bg-amber-50 border border-amber-200'}`}>
                  <p className={`text-sm font-medium mb-2 ${darkMode ? 'text-amber-300' : 'text-amber-700'}`}>
                    {validationErrors.length} Validation Errors Found
                  </p>
                  <div className="space-y-1 max-h-40 overflow-y-auto">
                    {validationErrors.slice(0, 10).map((error, idx) => (
                      <p key={idx} className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        Row {error.row}: {error.field} - {error.error}
                      </p>
                    ))}
                    {validationErrors.length > 10 && (
                      <p className={`text-xs ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                        ... and {validationErrors.length - 10} more errors
                      </p>
                    )}
                  </div>
                </div>
              )}

              <div className="flex justify-between gap-3 pt-4">
                <button
                  onClick={() => setStep('mapping')}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-slate-600 hover:bg-slate-100'}`}
                >
                  <ChevronLeft size={16} />
                  Back to Mapping
                </button>
                <button
                  onClick={importTransactions}
                  disabled={validationErrors.length > 0}
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Import {csvData.length} Transactions
                </button>
              </div>
            </div>
          )}

          {/* Importing Step */}
          {step === 'importing' && (
            <div className="space-y-6 py-8 text-center">
              <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto"></div>
              <div>
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Importing Transactions...
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  {importProgress.current} of {importProgress.total} transactions processed
                </p>
              </div>
              <div className="w-full max-w-md mx-auto">
                <div className={`h-2 rounded-full overflow-hidden ${darkMode ? 'bg-slate-700' : 'bg-slate-200'}`}>
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${(importProgress.current / importProgress.total) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Complete Step */}
          {step === 'complete' && (
            <div className="space-y-6 py-8 text-center">
              <div className="mx-auto w-16 h-16 rounded-full bg-green-500/20 flex items-center justify-center">
                <CheckCircle className="text-green-500" size={32} />
              </div>
              <div>
                <p className={`text-lg font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  Import Complete!
                </p>
                <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                  Successfully imported {importProgress.current - importProgress.errors} transactions
                </p>
                {importProgress.errors > 0 && (
                  <p className={`text-sm mt-2 ${darkMode ? 'text-amber-400' : 'text-amber-600'}`}>
                    {importProgress.errors} transactions failed to import
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors"
              >
                Done
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
