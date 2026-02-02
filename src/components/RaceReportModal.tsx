import React, { useState } from 'react';
import { X, Loader, FileText, Edit, Save, Send, Sparkles, CheckCircle2, Clock } from 'lucide-react';
import { supabase } from '../utils/supabase';

interface RaceReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  eventId: string;
  eventType: 'quick_race' | 'race_series' | 'public_event';
  clubId: string;
  eventData: {
    title: string;
    date: string;
    venue: string;
    raceClass: string;
    raceFormat: string;
  };
  raceResults: any[];
  skippers: any[];
  existingReport?: {
    id: string;
    report_content: string;
    weather_conditions?: string;
    key_highlights?: string;
    people_to_congratulate?: string;
    is_published?: boolean;
  };
  onReportGenerated?: () => void;
}

export const RaceReportModal: React.FC<RaceReportModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  eventId,
  eventType,
  clubId,
  eventData,
  raceResults,
  skippers,
  existingReport,
  onReportGenerated
}) => {
  const [weatherConditions, setWeatherConditions] = useState(existingReport?.weather_conditions || '');
  const [keyHighlights, setKeyHighlights] = useState(existingReport?.key_highlights || '');
  const [peopleToCongratulate, setPeopleToCongratulate] = useState(existingReport?.people_to_congratulate || '');
  const [draftReport, setDraftReport] = useState(existingReport?.report_content || '');
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedReport, setEditedReport] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isPublished, setIsPublished] = useState(existingReport?.is_published || false);
  const [showInputs, setShowInputs] = useState(true);

  if (!isOpen) return null;

  const handleGenerateDraft = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      console.log('=== Starting Race Report Generation ===');
      console.log('Invoking edge function with data:', {
        eventId,
        eventType,
        clubId,
        eventData,
        raceResultsCount: raceResults?.length || 0,
        skippersCount: skippers?.length || 0,
        weatherConditions,
        keyHighlights,
        peopleToCongratulate
      });

      const { data: session } = await supabase.auth.getSession();
      console.log('Auth session exists:', !!session?.session);

      const response = await supabase.functions.invoke('generate-race-report', {
        body: {
          eventData,
          raceResults,
          skippers,
          weatherConditions,
          keyHighlights,
          peopleToCongratulate
        }
      });

      console.log('Edge function response:', response);

      if (response.error) {
        console.error('Function error:', response.error);
        const errorMsg = response.error.message || JSON.stringify(response.error);
        throw new Error(`Edge function error: ${errorMsg}`);
      }

      if (response.data?.report) {
        const generatedReport = response.data.report;
        setDraftReport(generatedReport);
        setIsEditing(false);
        setShowInputs(false);

        // Store the report in the database
        const { data: existingReportData } = await supabase
          .from('race_reports')
          .select('id')
          .eq('event_id', eventId)
          .eq('event_type', eventType)
          .maybeSingle();

        if (existingReportData) {
          await supabase
            .from('race_reports')
            .update({
              report_content: generatedReport,
              weather_conditions: weatherConditions,
              key_highlights: keyHighlights,
              people_to_congratulate: peopleToCongratulate,
              is_published: false,
              updated_at: new Date().toISOString()
            })
            .eq('id', existingReportData.id);
        } else {
          await supabase
            .from('race_reports')
            .insert({
              event_id: eventId,
              event_type: eventType,
              club_id: clubId,
              report_content: generatedReport,
              event_data: eventData,
              weather_conditions: weatherConditions,
              key_highlights: keyHighlights,
              people_to_congratulate: peopleToCongratulate,
              is_published: false
            });
        }

        if (onReportGenerated) onReportGenerated();
      } else {
        console.error('No report in response data:', response.data);
        throw new Error('No report data received from edge function');
      }
    } catch (err: any) {
      console.error('Error generating race report:', err);
      setError(err.message || 'Failed to generate race report. Check console for details.');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleEdit = () => {
    setIsEditing(true);
    setEditedReport(draftReport);
  };

  const handleSaveDraft = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      const { data: existingReportData } = await supabase
        .from('race_reports')
        .select('id')
        .eq('event_id', eventId)
        .eq('event_type', eventType)
        .maybeSingle();

      if (existingReportData) {
        const { error: updateError } = await supabase
          .from('race_reports')
          .update({
            report_content: isEditing ? editedReport : draftReport,
            weather_conditions: weatherConditions,
            key_highlights: keyHighlights,
            people_to_congratulate: peopleToCongratulate,
            is_published: false,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReportData.id);

        if (updateError) throw updateError;
      }

      if (isEditing) {
        setDraftReport(editedReport);
      }
      setIsEditing(false);
      if (onReportGenerated) onReportGenerated();
    } catch (err: any) {
      console.error('Error saving draft:', err);
      setError(err.message || 'Failed to save draft');
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    setError(null);

    try {
      const reportContent = isEditing ? editedReport : draftReport;

      const { data: existingReportData } = await supabase
        .from('race_reports')
        .select('id')
        .eq('event_id', eventId)
        .eq('event_type', eventType)
        .maybeSingle();

      if (existingReportData) {
        const { error: updateError } = await supabase
          .from('race_reports')
          .update({
            report_content: reportContent,
            weather_conditions: weatherConditions,
            key_highlights: keyHighlights,
            people_to_congratulate: peopleToCongratulate,
            is_published: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReportData.id);

        if (updateError) throw updateError;
      }

      setDraftReport(reportContent);
      setIsPublished(true);
      setIsEditing(false);
      if (onReportGenerated) onReportGenerated();
    } catch (err: any) {
      console.error('Error publishing report:', err);
      setError(err.message || 'Failed to publish report');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditing(false);
    setEditedReport('');
  };

  const handleSaveEdit = async () => {
    setIsGenerating(true);
    setError(null);

    try {
      // Update the existing report
      const { error: updateError } = await supabase
        .from('race_reports')
        .update({
          report_content: editedReport,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingReport?.id);

      if (updateError) throw updateError;

      // Update local state
      setDraftReport(editedReport);
      setIsEditing(false);
      setEditedReport('');

      // Notify parent component
      if (onReportGenerated) onReportGenerated();
    } catch (err: any) {
      console.error('Error saving edited report:', err);
      setError(err.message || 'Failed to save changes');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      {/* Prominent Loading Overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60]">
          <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-2xl p-8 shadow-2xl max-w-md mx-4">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white" size={32} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-2">Alfie is Writing...</h3>
                <p className="text-cyan-100 text-sm">
                  Generating your professional race report
                </p>
              </div>
              <div className="flex gap-1 mt-2">
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                <div className="w-2 h-2 bg-white rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
              </div>
            </div>
          </div>
        </div>
      )}

      <div
        className={`
          w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
          ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
        `}
      >
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <FileText className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Race Report Generation</h2>
              <div className="flex items-center gap-2 mt-0.5">
                <p className="text-cyan-100 text-sm">{eventData.title}</p>
                {isPublished && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-500/90 text-white">
                    <CheckCircle2 size={12} />
                    Published
                  </span>
                )}
                {draftReport && !isPublished && (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-500/90 text-white">
                    <Clock size={12} />
                    Draft
                  </span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          <div className={`grid grid-cols-1 gap-6 p-6 ${isPublished ? 'lg:grid-cols-1' : 'lg:grid-cols-5'}`}>
            {/* Left Column - Input Details (2 columns) - Hide when editing published report */}
            {!isPublished && (
            <div className="lg:col-span-2 space-y-6">
              {/* Event Info Card */}
              <div className={`p-4 rounded-xl border ${darkMode ? 'bg-slate-700/30 border-slate-600/50' : 'bg-slate-50 border-slate-200'}`}>
                <h3 className={`font-semibold mb-3 flex items-center gap-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                  <FileText size={16} />
                  Event Details
                </h3>
                <div className={`text-sm space-y-2 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                  <div className="flex justify-between">
                    <span className="font-medium">Date:</span>
                    <span>{eventData.date}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Venue:</span>
                    <span>{eventData.venue}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Class:</span>
                    <span>{eventData.raceClass}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Format:</span>
                    <span>{eventData.raceFormat}</span>
                  </div>
                </div>
              </div>

              {/* Ask Alfie Prominent Card */}
              {!draftReport && (
                <div className={`p-6 rounded-xl border-2 ${darkMode ? 'bg-gradient-to-br from-cyan-900/40 to-blue-900/40 border-cyan-500/50' : 'bg-gradient-to-br from-cyan-50 to-blue-50 border-cyan-300'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-lg ${darkMode ? 'bg-cyan-500/20' : 'bg-cyan-100'}`}>
                        <Sparkles className={darkMode ? 'text-cyan-400' : 'text-cyan-600'} size={24} />
                      </div>
                      <div>
                        <h3 className={`font-bold text-lg ${darkMode ? 'text-cyan-200' : 'text-cyan-900'}`}>
                          Ask Alfie to Write
                        </h3>
                        <p className={`text-sm ${darkMode ? 'text-cyan-300/80' : 'text-cyan-700/80'}`}>
                          AI-powered race report generation
                        </p>
                      </div>
                    </div>
                    {!showInputs && (
                      <button
                        onClick={() => setShowInputs(true)}
                        className={`text-sm px-3 py-1.5 rounded-lg transition-colors ${darkMode ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'}`}
                      >
                        Show Options
                      </button>
                    )}
                  </div>

                  {showInputs && (
                    <>
                      <p className={`text-sm mb-4 ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                        Provide optional context below and Alfie will generate a professional race report based on the results and your inputs.
                      </p>

                      <div className="space-y-4">
                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Weather Conditions
                      </label>
                      <textarea
                        value={weatherConditions}
                        onChange={(e) => setWeatherConditions(e.target.value)}
                        placeholder="E.g., Light to moderate south-easterly, 8-12 knots, sunny conditions..."
                        className={`
                          w-full px-4 py-2.5 rounded-lg border resize-none transition-all
                          ${darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-400'
                          } focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                        `}
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Key Highlights
                      </label>
                      <textarea
                        value={keyHighlights}
                        onChange={(e) => setKeyHighlights(e.target.value)}
                        placeholder="E.g., Close battles, tactical moves, mechanical issues..."
                        className={`
                          w-full px-4 py-2.5 rounded-lg border resize-none transition-all
                          ${darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-400'
                          } focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                        `}
                        rows={3}
                      />
                    </div>

                    <div>
                      <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        People to Congratulate
                      </label>
                      <textarea
                        value={peopleToCongratulate}
                        onChange={(e) => setPeopleToCongratulate(e.target.value)}
                        placeholder="E.g., Race officials, helpers, returning sailors..."
                        className={`
                          w-full px-4 py-2.5 rounded-lg border resize-none transition-all
                          ${darkMode
                            ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400 focus:border-cyan-500'
                            : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-400'
                          } focus:outline-none focus:ring-2 focus:ring-cyan-500/20
                        `}
                        rows={2}
                      />
                    </div>

                        <button
                          onClick={handleGenerateDraft}
                          disabled={isGenerating}
                          className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-lg font-medium transition-all bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          {isGenerating ? (
                            <>
                              <Loader className="animate-spin" size={20} />
                              Generating with Alfie...
                            </>
                          ) : (
                            <>
                              <Sparkles size={20} />
                              Generate Report with Alfie
                            </>
                          )}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
            )}

            {/* Right Column - Report Display (3 columns) */}
            <div className={`space-y-4 ${isPublished ? 'lg:col-span-1' : 'lg:col-span-3'}`}>
              {draftReport ? (
                <>
                  <div className="flex items-center justify-between">
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                      {isPublished ? 'Published Report' : 'Generated Report'}
                    </h3>
                    <div className="flex gap-2">
                      {!isEditing && (
                        <button
                          onClick={handleEdit}
                          className={`
                            flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                            ${darkMode
                              ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                              : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                            }
                          `}
                        >
                          <Edit size={16} />
                          Edit Report
                        </button>
                      )}
                      {isEditing && (
                        <>
                          <button
                            onClick={handleSaveEdit}
                            className={`
                              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                              ${darkMode
                                ? 'bg-green-700 hover:bg-green-600 text-white'
                                : 'bg-green-600 hover:bg-green-700 text-white'
                              }
                            `}
                          >
                            <Save size={16} />
                            Save Changes
                          </button>
                          <button
                            onClick={handleCancelEdit}
                            className={`
                              flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all
                              ${darkMode
                                ? 'bg-slate-700 hover:bg-slate-600 text-slate-200'
                                : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                              }
                            `}
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  <div className={`rounded-xl border overflow-hidden ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                    {isEditing ? (
                      <textarea
                        value={editedReport}
                        onChange={(e) => setEditedReport(e.target.value)}
                        className={`
                          w-full px-6 py-4 resize-none font-mono text-sm leading-relaxed
                          ${darkMode
                            ? 'bg-slate-700 text-white'
                            : 'bg-white text-slate-900'
                          } focus:outline-none
                        `}
                        rows={20}
                      />
                    ) : (
                      <div
                        className={`
                          px-6 py-4 whitespace-pre-wrap text-sm leading-relaxed
                          ${darkMode
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-white text-slate-900'
                          }
                        `}
                        style={{ minHeight: '500px' }}
                      >
                        {draftReport}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className={`flex flex-col items-center justify-center py-20 rounded-xl border-2 border-dashed ${darkMode ? 'border-slate-600 bg-slate-700/20' : 'border-slate-300 bg-slate-50'}`}>
                  <div className={`p-4 rounded-full mb-4 ${darkMode ? 'bg-slate-700' : 'bg-slate-100'}`}>
                    <FileText className={darkMode ? 'text-slate-400' : 'text-slate-500'} size={48} />
                  </div>
                  <h3 className={`text-lg font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    No Report Generated Yet
                  </h3>
                  <p className={`text-sm text-center max-w-md ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                    Fill in the optional context fields and click "Generate Report with Alfie" to create an AI-powered race report.
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="px-6 pb-6">
              <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-red-500 text-sm">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className={`p-6 border-t flex justify-between gap-3 ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}`}>
          <button
            onClick={onClose}
            className={`
              px-6 py-2.5 rounded-lg font-medium transition-all
              ${darkMode
                ? 'bg-slate-700 hover:bg-slate-600 text-slate-300'
                : 'bg-slate-200 hover:bg-slate-300 text-slate-700'
              }
            `}
          >
            Close
          </button>

          <div className="flex gap-3">
            {/* For unpublished reports being edited, show footer buttons */}
            {isEditing && !isPublished && (
              <>
                <button
                  onClick={handleCancelEdit}
                  className={`
                    px-6 py-2.5 rounded-lg font-medium transition-all
                    ${darkMode
                      ? 'bg-slate-700 hover:bg-slate-600 text-white'
                      : 'bg-slate-200 hover:bg-slate-300 text-slate-900'
                    }
                  `}
                  disabled={isGenerating}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={isGenerating}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all bg-gradient-to-r from-blue-600 to-cyan-700 hover:from-blue-700 hover:to-cyan-800 text-white shadow-lg hover:shadow-xl disabled:opacity-50"
                >
                  {isGenerating ? (
                    <>
                      <Loader className="animate-spin" size={18} />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Save size={18} />
                      Save Draft
                    </>
                  )}
                </button>
              </>
            )}

            {!isEditing && draftReport && !isPublished && (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center gap-2 px-6 py-2.5 rounded-lg font-medium transition-all bg-gradient-to-r from-green-600 to-emerald-700 hover:from-green-700 hover:to-emerald-800 text-white shadow-lg hover:shadow-xl disabled:opacity-50"
              >
                {isPublishing ? (
                  <>
                    <Loader className="animate-spin" size={18} />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    Publish Report
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
