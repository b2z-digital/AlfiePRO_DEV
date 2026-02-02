import React, { useState, useRef } from 'react';
import { Upload, FileSpreadsheet, Loader, AlertCircle, Clipboard } from 'lucide-react';
import { ParsedHMSData } from '../../types/hmsValidator';
import { parseHMSFile, parseHMSAuto, parseHMSTwoStep } from '../../utils/hmsParser';

interface HMSFileUploaderProps {
  onFileUploaded: (data: ParsedHMSData) => void;
}

export const HMSFileUploader: React.FC<HMSFileUploaderProps> = ({ onFileUploaded }) => {
  const [isDragging, setIsDragging] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPasteArea, setShowPasteArea] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [skipperData, setSkipperData] = useState('');
  const [resultsData, setResultsData] = useState('');
  const [useTwoStepPaste, setUseTwoStepPaste] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    setError(null);
    setIsProcessing(true);

    try {
      // Validate file type
      const validTypes = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        '.xls',
        '.xlsx'
      ];

      const isValidType = validTypes.some(type =>
        file.name.toLowerCase().endsWith(type) || file.type === type
      );

      if (!isValidType) {
        throw new Error('Please upload a valid Excel file (.xls or .xlsx)');
      }

      // Parse the file
      const parsedData = await parseHMSFile(file);

      // Validate parsed data
      if (!parsedData.skippers || parsedData.skippers.length === 0) {
        throw new Error('No skippers found in the HMS file. Please check the file format.');
      }

      if (!parsedData.results || parsedData.results.length === 0) {
        throw new Error('No race results found in the HMS file. Please check the file format.');
      }

      onFileUploaded(parsedData);
    } catch (err) {
      console.error('Error parsing HMS file:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse HMS file');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFile(file);
    }
  };

  const handlePaste = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      if (!pasteText.trim()) {
        throw new Error('Please paste some data first');
      }

      const parsedData = parseHMSAuto(pasteText);

      if (!parsedData.skippers || parsedData.skippers.length === 0) {
        throw new Error('No skippers found. Please paste the Score Sheet data from HMS.');
      }

      onFileUploaded(parsedData);
    } catch (err) {
      console.error('Error parsing pasted data:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse pasted data');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleTwoStepPaste = async () => {
    setError(null);
    setIsProcessing(true);

    try {
      if (!skipperData.trim()) {
        throw new Error('Please paste skipper data first (Step 1)');
      }

      if (!resultsData.trim()) {
        throw new Error('Please paste results data (Step 2)');
      }

      // Parse the two datasets separately
      const parsedData = parseHMSTwoStep(skipperData, resultsData);

      if (!parsedData.skippers || parsedData.skippers.length === 0) {
        throw new Error('No skippers found. Please check your skipper data (Step 1).');
      }

      if (!parsedData.results || parsedData.results.length === 0) {
        throw new Error('No race results found. Please check your results data (Step 2).');
      }

      onFileUploaded(parsedData);
    } catch (err) {
      console.error('Error parsing pasted data:', err);
      setError(err instanceof Error ? err.message : 'Failed to parse pasted data');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-2xl font-bold text-white mb-2">Upload HMS Scoring File</h2>
        <p className="text-slate-300">
          Upload your HMS Excel file (.xls or .xlsx) to begin validation
        </p>
      </div>

      {/* Upload Area */}
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        className={`relative border-2 border-dashed rounded-xl p-12 transition-all ${
          isDragging
            ? 'border-blue-500 bg-blue-900/20'
            : 'border-slate-600 hover:border-blue-500 hover:bg-slate-800/50'
        }`}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xls,.xlsx,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          onChange={handleFileSelect}
          className="hidden"
        />

        <div className="flex flex-col items-center gap-4">
          {isProcessing ? (
            <>
              <div className="p-4 bg-blue-900/30 rounded-full border border-blue-500/50">
                <Loader size={32} className="text-blue-400 animate-spin" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-white">Processing HMS file...</p>
                <p className="text-sm text-slate-300">This may take a moment</p>
              </div>
            </>
          ) : (
            <>
              <div className="p-4 bg-slate-700 rounded-full">
                <FileSpreadsheet size={32} className="text-slate-300" />
              </div>
              <div className="text-center">
                <p className="font-semibold text-white mb-1">
                  Drop your HMS file here, or click to browse
                </p>
                <p className="text-sm text-slate-300">
                  Supports .xls and .xlsx files
                </p>
              </div>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2"
              >
                <Upload size={18} />
                Choose File
              </button>
            </>
          )}
        </div>
      </div>

      {/* Or Divider */}
      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-700" />
        </div>
        <div className="relative flex justify-center text-sm">
          <span className="px-4 bg-gradient-to-br from-slate-800 to-slate-900 text-slate-400 font-medium">OR</span>
        </div>
      </div>

      {/* Paste Option */}
      {!showPasteArea ? (
        <button
          onClick={() => setShowPasteArea(true)}
          className="w-full px-6 py-3 border-2 border-slate-600 text-slate-300 rounded-lg hover:border-blue-500 hover:bg-slate-800 transition-colors font-medium flex items-center justify-center gap-2"
        >
          <Clipboard size={18} />
          Paste from Excel/CSV
        </button>
      ) : (
        <div className="space-y-4">
          {/* Toggle between single and two-step paste */}
          <div className="flex items-center gap-4 p-3 bg-slate-900/50 border border-slate-700/50 rounded-lg">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={useTwoStepPaste}
                onChange={(e) => setUseTwoStepPaste(e.target.checked)}
                className="w-4 h-4 text-blue-600 border-slate-600 rounded focus:ring-blue-500"
              />
              <span className="text-sm font-medium text-slate-300">
                Paste skippers and results separately (recommended for multiple worksheets)
              </span>
            </label>
          </div>

          {useTwoStepPaste ? (
            /* Two-step paste interface */
            <div className="space-y-4">
              {/* Step 1: Skipper Data */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Step 1: Paste Skipper Information
                </label>
                <p className="text-xs text-slate-400">
                  Copy and paste from your "Score Sheet" or "Skippers" worksheet (include headers: Sail No, Helm/Crew names, Class, etc.)
                </p>
                <textarea
                  value={skipperData}
                  onChange={(e) => setSkipperData(e.target.value)}
                  placeholder="Sail No    Helm            Crew            Class&#10;97         John Smith      Jane Doe        Laser&#10;67         Bob Jones       Mary Wilson     470&#10;..."
                  className="w-full h-32 px-4 py-3 border border-slate-600 bg-slate-900 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none placeholder-slate-500"
                />
                {skipperData.trim() && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <span className="font-bold">✓</span>
                    Skipper data ready ({skipperData.split('\n').filter(l => l.trim()).length} lines)
                  </p>
                )}
              </div>

              {/* Step 2: Results Data */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-slate-300">
                  Step 2: Paste Race Results
                </label>
                <p className="text-xs text-slate-400">
                  <span className="font-semibold text-amber-400">Important:</span> Include the HEADER ROW with race identifiers (e.g., "Verify RO1", "RO2", "RO3"), plus the position column and all race data
                </p>
                <textarea
                  value={resultsData}
                  onChange={(e) => setResultsData(e.target.value)}
                  placeholder="          Verify RO1                    Verify RO2                    Verify RO3&#10;1st       97    OK    1     1         67    OK    1     1         97    OK    1     1&#10;2nd       67    OK    2     2         97    OK    2     2         67    OK    2     2&#10;3rd       86    OK    3     3         86    OK    3     3         86    OK    3     3&#10;..."
                  className="w-full h-32 px-4 py-3 border border-slate-600 bg-slate-900 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none placeholder-slate-500"
                />
                {resultsData.trim() && (
                  <p className="text-xs text-green-600 flex items-center gap-1">
                    <span className="font-bold">✓</span>
                    Results data ready ({resultsData.split('\n').filter(l => l.trim()).length} lines)
                  </p>
                )}
              </div>

              <div className="flex gap-2">
                <button
                  onClick={handleTwoStepPaste}
                  disabled={!skipperData.trim() || !resultsData.trim() || isProcessing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Parse Data
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowPasteArea(false);
                    setSkipperData('');
                    setResultsData('');
                    setUseTwoStepPaste(false);
                  }}
                  className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            /* Single-step paste interface */
            <div className="space-y-3">
              <label className="block text-sm font-medium text-slate-300">
                Paste All HMS Data (from Excel or CSV)
              </label>
              <p className="text-xs text-slate-400">
                Select all data from your HMS file (including skippers and results) and paste here
              </p>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder="Select cells in Excel and paste here (Ctrl+V / Cmd+V)&#10;&#10;Include headers and all data rows from all worksheets"
                className="w-full h-48 px-4 py-3 border border-slate-600 bg-slate-900 text-white rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm resize-none placeholder-slate-500"
              />
              <div className="flex gap-2">
                <button
                  onClick={handlePaste}
                  disabled={!pasteText.trim() || isProcessing}
                  className="flex-1 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader size={18} className="animate-spin" />
                      Processing...
                    </>
                  ) : (
                    <>
                      <Upload size={18} />
                      Parse Data
                    </>
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowPasteArea(false);
                    setPasteText('');
                  }}
                  className="px-6 py-3 border border-slate-600 text-slate-300 rounded-lg hover:bg-slate-800 transition-colors font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-red-900/30 border border-red-500/50 rounded-lg flex items-start gap-3">
          <AlertCircle size={20} className="text-red-400 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-300 mb-1">Processing Failed</p>
            <p className="text-sm text-red-300">{error}</p>
          </div>
        </div>
      )}

      {/* Instructions */}
      <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-6 space-y-3">
        <h3 className="font-semibold text-white flex items-center gap-2">
          <FileSpreadsheet size={18} />
          HMS File Requirements
        </h3>
        <ul className="space-y-2 text-sm text-slate-300">
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-bold">✓</span>
            <span>Excel file (.xls or .xlsx) from HMS scoring software</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-bold">✓</span>
            <span>Contains a "Score Sheet" tab with skipper details</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-bold">✓</span>
            <span>Contains scoring tabs with race results and positions</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-green-400 font-bold">✓</span>
            <span>Letter scores (DNF, DNS, DNC, etc.) in Comments column</span>
          </li>
        </ul>
      </div>
    </div>
  );
};
