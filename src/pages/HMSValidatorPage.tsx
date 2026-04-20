import React, { useState } from 'react';
import { ArrowLeft, Upload, FileSpreadsheet, CircleCheck as CheckCircle, Download, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HMSFileUploader } from '../components/hms-validator/HMSFileUploader';
import { HMSDataPreview } from '../components/hms-validator/HMSDataPreview';
import { HMSFieldMapper } from '../components/hms-validator/HMSFieldMapper';
import { HMSValidationResults } from '../components/hms-validator/HMSValidationResults';
import { ParsedHMSData, ValidationResult, ValidationDiscrepancy } from '../types/hmsValidator';

type ValidationStep = 'upload' | 'preview' | 'mapping' | 'results';

export const HMSValidatorPage: React.FC = () => {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState<ValidationStep>('upload');
  const [parsedData, setParsedData] = useState<ParsedHMSData | null>(null);
  const [validationResults, setValidationResults] = useState<ValidationResult | null>(null);

  const handleFileUploaded = (data: ParsedHMSData) => {
    setParsedData(data);
    setCurrentStep('preview');
  };

  const handlePreviewConfirmed = () => {
    setCurrentStep('mapping');
  };

  const handleMappingComplete = () => {
    if (!parsedData) return;

    // Run validation - compare HMS data with AlfiePRO scoring
    const validation = runValidation(parsedData);
    setValidationResults(validation);
    setCurrentStep('results');
  };

  const computeDropsAllowed = (numRaces: number): number => {
    if (numRaces >= 1 && numRaces <= 3) return 0;
    if (numRaces >= 4 && numRaces <= 7) return 1;
    if (numRaces >= 8 && numRaces <= 15) return 2;
    if (numRaces >= 16 && numRaces <= 23) return 3;
    if (numRaces >= 24 && numRaces <= 31) return 4;
    if (numRaces >= 32 && numRaces <= 39) return 5;
    if (numRaces >= 40 && numRaces <= 47) return 6;
    if (numRaces >= 48) return Math.floor((numRaces - 24) / 8) + 3;
    return 0;
  };

  const runValidation = (data: ParsedHMSData): ValidationResult => {
    const { skippers, results, numRaces, hasHeats } = data;
    const dropsAllowed = computeDropsAllowed(numRaces);
    const discrepancies: ValidationDiscrepancy[] = [];

    const computedEntries: { sailNumber: string; name: string; racePoints: Record<number, number>; totalScore: number; netScore: number }[] = [];

    for (const skipper of skippers) {
      const racePoints: Record<number, number> = {};

      for (let race = 1; race <= numRaces; race++) {
        const raceResults = results.filter(r => r.raceNumber === race);

        if (hasHeats) {
          const raceHeats = [...new Set(raceResults.filter(r => r.heat).map(r => r.heat!))].sort();
          let overallPosition = 0;
          let found = false;

          for (const heat of raceHeats) {
            const heatResults = raceResults
              .filter(r => r.heat === heat)
              .sort((a, b) => (a.position || 999) - (b.position || 999));

            for (const result of heatResults) {
              if (result.letterScore) continue;
              overallPosition++;
              if (result.sailNumber === skipper.sailNumber) {
                racePoints[race] = overallPosition;
                found = true;
                break;
              }
            }
            if (found) break;
          }

          if (!found) {
            const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
            if (skipperResult?.letterScore) {
              const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null).length;
              racePoints[race] = totalFinishers + 1;
            }
          }
        } else {
          const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
          if (skipperResult) {
            if (skipperResult.letterScore) {
              const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null).length;
              racePoints[race] = totalFinishers + 1;
            } else {
              racePoints[race] = skipperResult.position || 0;
            }
          }
        }
      }

      const scores = Object.values(racePoints);
      const totalScore = scores.reduce((sum, s) => sum + s, 0);
      const sortedDesc = [...scores].sort((a, b) => b - a);
      const droppedTotal = sortedDesc.slice(0, dropsAllowed).reduce((sum, s) => sum + s, 0);
      const netScore = totalScore - droppedTotal;

      computedEntries.push({ sailNumber: skipper.sailNumber, name: skipper.name, racePoints, totalScore, netScore });
    }

    computedEntries.sort((a, b) => a.netScore - b.netScore);

    let totalComparisons = 0;
    let matches = 0;

    for (const entry of computedEntries) {
      const hmsSkipper = skippers.find(s => s.sailNumber === entry.sailNumber);
      if (!hmsSkipper || hmsSkipper.totalScore === undefined) continue;

      totalComparisons++;
      if (Math.abs(hmsSkipper.totalScore - entry.netScore) < 0.5) {
        matches++;
      } else {
        discrepancies.push({
          sailNumber: entry.sailNumber,
          skipperName: entry.name,
          raceNumber: 0,
          field: 'Net Score',
          hmsValue: hmsSkipper.totalScore,
          alfiePROValue: entry.netScore,
          reason: `HMS total ${hmsSkipper.totalScore} vs computed net ${entry.netScore}`
        });
      }
    }

    const raceValidations = Array.from({ length: numRaces }, (_, i) => {
      const raceNumber = i + 1;
      const raceDisc = discrepancies.filter(d => d.raceNumber === raceNumber);
      const raceComps = skippers.length;
      const raceMatches = raceComps - raceDisc.length;
      return {
        raceNumber,
        match: raceDisc.length === 0,
        matchPercentage: raceComps > 0 ? (raceMatches / raceComps) * 100 : 100,
        discrepancies: raceDisc
      };
    });

    const matchPercentage = totalComparisons > 0 ? (matches / totalComparisons) * 100 : 100;

    return {
      overallMatch: discrepancies.length === 0,
      matchPercentage,
      totalComparisons,
      matches,
      discrepancies,
      raceValidations,
      skippersValidated: skippers.length,
      racesValidated: numRaces,
      timestamp: new Date()
    };
  };

  const handleStartOver = () => {
    setParsedData(null);
    setValidationResults(null);
    setCurrentStep('upload');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#0f172a] via-[#131c31] to-[#0f172a]">
      {/* Header */}
      <div className="from-cyan-600 via-cyan-700 to-blue-800 border-b border-cyan-900/50 shadow-lg">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ArrowLeft size={20} className="text-white" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-white">HMS Compliance Validator</h1>
                <p className="text-sm text-blue-100">Validate AlfiePRO results against HMS scoring</p>
              </div>
            </div>

            {/* Info Badge + Close Button */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-4 py-2 bg-white/10 text-white rounded-lg border border-white/20 backdrop-blur-sm">
                <Info size={16} />
                <span className="text-sm font-medium">100% HMS Compliant</span>
              </div>
              <button
                onClick={() => navigate('/dashboard')}
                className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white"
                title="Close and return to dashboard"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="flex items-center justify-center gap-4">
          {[
            { key: 'upload', label: 'Upload File', icon: Upload },
            { key: 'preview', label: 'Preview Data', icon: FileSpreadsheet },
            { key: 'mapping', label: 'Map Fields', icon: CheckCircle },
            { key: 'results', label: 'View Results', icon: Download }
          ].map((step, index) => {
            const Icon = step.icon;
            const isActive = currentStep === step.key;
            const isComplete = ['upload', 'preview', 'mapping', 'results'].indexOf(currentStep) >
                              ['upload', 'preview', 'mapping', 'results'].indexOf(step.key);

            return (
              <React.Fragment key={step.key}>
                <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                  isActive
                    ? 'bg-blue-600 text-white shadow-lg scale-105'
                    : isComplete
                      ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                      : 'bg-slate-800/50 text-slate-500 border border-slate-700/50'
                }`}>
                  <Icon size={18} />
                  <span className="font-medium text-sm">{step.label}</span>
                </div>
                {index < 3 && (
                  <div className={`h-0.5 w-12 ${
                    isComplete ? 'bg-green-500' : 'bg-slate-700'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl shadow-2xl border border-slate-700/50 p-8">
          {currentStep === 'upload' && (
            <HMSFileUploader onFileUploaded={handleFileUploaded} />
          )}

          {currentStep === 'preview' && parsedData && (
            <HMSDataPreview
              data={parsedData}
              onConfirm={handlePreviewConfirmed}
              onBack={handleStartOver}
            />
          )}

          {currentStep === 'mapping' && parsedData && (
            <HMSFieldMapper
              data={parsedData}
              onComplete={handleMappingComplete}
              onBack={() => setCurrentStep('preview')}
            />
          )}

          {currentStep === 'results' && validationResults && (
            <HMSValidationResults
              results={validationResults}
              onStartOver={handleStartOver}
              parsedData={parsedData}
            />
          )}
        </div>
      </div>

      {/* Help Section */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-xl p-6 border border-slate-700/50">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-600/20 rounded-lg border border-blue-500/30">
              <Info size={24} className="text-blue-400" />
            </div>
            <div>
              <h3 className="font-semibold text-white mb-2">How to Use HMS Validator</h3>
              <ol className="list-decimal list-inside space-y-1 text-sm text-slate-300">
                <li>Export your HMS scoring file as Excel (.xls or .xlsx)</li>
                <li>Upload the file using the button above</li>
                <li>Review the detected skippers and race results</li>
                <li>Map any unmapped fields if needed</li>
                <li>View the validation report showing AlfiePRO vs HMS comparison</li>
              </ol>
              <p className="mt-3 text-sm text-slate-400">
                The validator will automatically detect worksheet structure, extract skippers from the Score Sheet tab,
                and race results from the scoring tabs. It will then run AlfiePRO's scoring engine and compare results.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
