import React, { useState } from 'react';
import { ArrowLeft, Upload, FileSpreadsheet, CircleCheck as CheckCircle, Download, Info } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { HMSFileUploader } from '../components/hms-validator/HMSFileUploader';
import { HMSDataPreview } from '../components/hms-validator/HMSDataPreview';
import { HMSFieldMapper } from '../components/hms-validator/HMSFieldMapper';
import { HMSValidationResults } from '../components/hms-validator/HMSValidationResults';
import { ParsedHMSData, ValidationResult, ValidationDiscrepancy } from '../types/hmsValidator';
import { calculateLetterScorePoints, letterScoreDefinitions, LetterScore } from '../types/letterScores';

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

  const computeDropsAllowed = (completedRaces: number): number => {
    if (completedRaces >= 1 && completedRaces <= 3) return 0;
    if (completedRaces >= 4 && completedRaces <= 7) return 1;
    if (completedRaces >= 8 && completedRaces <= 15) return 2;
    if (completedRaces >= 16 && completedRaces <= 23) return 3;
    if (completedRaces >= 24 && completedRaces <= 31) return 4;
    if (completedRaces >= 32 && completedRaces <= 39) return 5;
    if (completedRaces >= 40) return 6;
    return 0;
  };

  const isRedressFixed = (comment?: string): boolean => {
    if (!comment) return false;
    const upper = comment.toUpperCase();
    return upper === 'RDGFIX' || upper === 'RDG FIX' || upper === 'RDGF';
  };

  const isRedressAverage = (comment?: string): boolean => {
    if (!comment) return false;
    const upper = comment.toUpperCase();
    return upper === 'RDGAVE' || upper === 'RDG AVE' || upper === 'RDGA';
  };

  const isRedressComment = (comment?: string): boolean => {
    return isRedressFixed(comment) || isRedressAverage(comment);
  };

  const isValidLetterScore = (code: string): code is LetterScore => {
    return letterScoreDefinitions.some(def => def.code === code);
  };

  const runValidation = (data: ParsedHMSData): ValidationResult => {
    const { skippers, results, hasHeats } = data;
    const completedRaceNumbers = [...new Set(results.map(r => r.raceNumber))].sort((a, b) => a - b);
    const completedRaces = completedRaceNumbers.length;
    const dropsAllowed = computeDropsAllowed(completedRaces);
    const totalEntrants = skippers.length;
    const discrepancies: ValidationDiscrepancy[] = [];

    const computedEntries: { sailNumber: string; name: string; racePoints: Record<number, number>; totalScore: number; netScore: number; droppedRaces: number[] }[] = [];

    for (const skipper of skippers) {
      const racePoints: Record<number, number> = {};
      const raceIsNonDiscardable: Record<number, boolean> = {};

      for (const race of completedRaceNumbers) {
        const raceResults = results.filter(r => r.raceNumber === race);
        if (raceResults.length === 0) continue;

        const skipperResult = raceResults.find(r => r.sailNumber === skipper.sailNumber);
        if (!skipperResult) continue;

        if (isRedressFixed(skipperResult.comment)) {
          racePoints[race] = skipperResult.points;
          continue;
        }

        if (isRedressAverage(skipperResult.comment)) {
          racePoints[race] = -1;
          continue;
        }

        if (skipperResult.letterScore) {
          const code = skipperResult.letterScore.toUpperCase();

          if (isValidLetterScore(code)) {
            const def = letterScoreDefinitions.find(d => d.code === code);
            if (def && !def.isDiscardable) {
              raceIsNonDiscardable[race] = true;
            }

            if (hasHeats) {
              const raceHeats = [...new Set(raceResults.filter(r => r.heat).map(r => r.heat!))].sort();
              const isSeeding = race === 1 && raceHeats.length > 1;

              if (isSeeding) {
                const heatResults = raceResults.filter(r => r.heat === skipperResult.heat);
                const heatFinishers = heatResults.filter(r => !r.letterScore && r.position !== null && !isRedressComment(r.comment)).length;
                racePoints[race] = calculateLetterScorePoints(code, heatFinishers, skipperResult.points || undefined, totalEntrants);
              } else {
                const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null && !isRedressComment(r.comment)).length;
                racePoints[race] = calculateLetterScorePoints(code, totalFinishers, skipperResult.points || undefined, totalEntrants);
              }
            } else {
              const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null && !isRedressComment(r.comment)).length;
              racePoints[race] = calculateLetterScorePoints(code, totalFinishers, skipperResult.points || undefined, totalEntrants);
            }
          } else {
            const totalFinishers = raceResults.filter(r => !r.letterScore && r.position !== null && !isRedressComment(r.comment)).length;
            racePoints[race] = totalFinishers + 1;
          }
          continue;
        }

        if (hasHeats) {
          const raceHeats = [...new Set(raceResults.filter(r => r.heat).map(r => r.heat!))].sort();
          const isSeeding = race === 1 && raceHeats.length > 1;

          if (isSeeding) {
            racePoints[race] = skipperResult.position || 0;
          } else {
            let overallPosition = 0;
            let found = false;

            for (const heat of raceHeats) {
              const heatResults = raceResults
                .filter(r => r.heat === heat)
                .sort((a, b) => (a.position || 999) - (b.position || 999));

              for (const result of heatResults) {
                if (result.letterScore || isRedressComment(result.comment)) continue;
                overallPosition++;
                if (result.sailNumber === skipper.sailNumber) {
                  racePoints[race] = overallPosition;
                  found = true;
                  break;
                }
              }
              if (found) break;
            }

            if (!found && !skipperResult.letterScore) {
              racePoints[race] = skipperResult.position || 0;
            }
          }
        } else {
          racePoints[race] = skipperResult.position || 0;
        }
      }

      for (const [raceStr, pts] of Object.entries(racePoints)) {
        if (pts === -1) {
          const raceNum = parseInt(raceStr);
          const otherScores = Object.entries(racePoints)
            .filter(([rn, v]) => parseInt(rn) !== raceNum && parseInt(rn) >= 2 && v !== -1)
            .map(([, v]) => v);
          if (otherScores.length > 0) {
            const avg = otherScores.reduce((s, v) => s + v, 0) / otherScores.length;
            racePoints[raceNum] = Math.round(avg * 10) / 10;
          } else {
            const skipperResult = results.find(
              r => r.raceNumber === raceNum && r.sailNumber === skipper.sailNumber
            );
            racePoints[raceNum] = skipperResult?.points || 0;
          }
        }
      }

      const raceNums = Object.keys(racePoints).map(Number);
      const scores = raceNums.map(rn => racePoints[rn]);
      const totalScore = scores.reduce((sum, s) => sum + s, 0);

      const discardableRaces = raceNums.filter(rn => !raceIsNonDiscardable[rn]);
      const discardableScores = discardableRaces
        .map(rn => ({ raceNum: rn, score: racePoints[rn] }))
        .sort((a, b) => b.score - a.score);

      const droppedRaces: number[] = [];
      let droppedTotal = 0;
      for (let i = 0; i < dropsAllowed && i < discardableScores.length; i++) {
        droppedRaces.push(discardableScores[i].raceNum);
        droppedTotal += discardableScores[i].score;
      }

      computedEntries.push({ sailNumber: skipper.sailNumber, name: skipper.name, racePoints, totalScore, netScore: totalScore - droppedTotal, droppedRaces });
    }

    computedEntries.sort((a, b) => {
      if (Math.abs(a.netScore - b.netScore) >= 0.01) {
        return a.netScore - b.netScore;
      }

      const aScores = completedRaceNumbers
        .map(rn => a.racePoints[rn])
        .filter(s => s !== undefined)
        .sort((x, y) => y - x);
      const bScores = completedRaceNumbers
        .map(rn => b.racePoints[rn])
        .filter(s => s !== undefined)
        .sort((x, y) => y - x);

      const maxLen = Math.max(aScores.length, bScores.length);
      for (let i = 0; i < maxLen; i++) {
        const aVal = i < aScores.length ? aScores[i] : 999;
        const bVal = i < bScores.length ? bScores[i] : 999;
        if (Math.abs(aVal - bVal) >= 0.01) return aVal - bVal;
      }

      const reverseRaces = [...completedRaceNumbers].reverse();
      for (const rn of reverseRaces) {
        const aPos = a.racePoints[rn] ?? 999;
        const bPos = b.racePoints[rn] ?? 999;
        if (Math.abs(aPos - bPos) >= 0.01) return aPos - bPos;
      }

      return 0;
    });

    let totalComparisons = 0;
    let matches = 0;

    for (const entry of computedEntries) {
      const hmsSkipper = skippers.find(s => s.sailNumber === entry.sailNumber);
      if (!hmsSkipper) continue;

      if (hmsSkipper.totalScore !== undefined) {
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
            reason: `HMS net ${hmsSkipper.totalScore} vs computed net ${entry.netScore.toFixed(1)}`
          });
        }
      }

      for (const raceNum of completedRaceNumbers) {
        const hmsRaceScore = hmsSkipper.raceScores[raceNum.toString()];
        const computedPts = entry.racePoints[raceNum];

        if (hmsRaceScore !== undefined && computedPts !== undefined) {
          const hmsVal = typeof hmsRaceScore === 'number' ? hmsRaceScore : parseFloat(String(hmsRaceScore));
          if (!isNaN(hmsVal)) {
            totalComparisons++;
            if (Math.abs(hmsVal - computedPts) < 0.5) {
              matches++;
            } else {
              discrepancies.push({
                sailNumber: entry.sailNumber,
                skipperName: entry.name,
                raceNumber: raceNum,
                field: 'Race Points',
                hmsValue: hmsVal,
                alfiePROValue: computedPts,
                reason: `Race ${raceNum}: HMS ${hmsVal} vs computed ${computedPts.toFixed(1)}`
              });
            }
          }
        }
      }
    }

    const computedPositions = computedEntries.map((e, idx) => ({ ...e, computedPosition: idx + 1 }));
    for (const cp of computedPositions) {
      const hmsSkipper = skippers.find(s => s.sailNumber === cp.sailNumber);
      if (!hmsSkipper) continue;

      totalComparisons++;
      if (hmsSkipper.position === cp.computedPosition) {
        matches++;
      } else {
        discrepancies.push({
          sailNumber: cp.sailNumber,
          skipperName: cp.name,
          raceNumber: 0,
          field: 'Overall Position',
          hmsValue: hmsSkipper.position,
          alfiePROValue: cp.computedPosition,
          reason: `HMS pos ${hmsSkipper.position} vs computed pos ${cp.computedPosition}`
        });
      }
    }

    const raceValidations = completedRaceNumbers.map(raceNumber => {
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
      racesValidated: completedRaces,
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
