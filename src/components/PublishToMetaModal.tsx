import React, { useState, useEffect, useRef } from 'react';
import { X, Facebook, Image, FileText, RefreshCw, Send, AlertTriangle, Check, Info, Sparkles, ImageIcon, Upload, Plus, Mail } from 'lucide-react';
import html2canvas from 'html2canvas';
import { supabase } from '../utils/supabase';
import { createRoot } from 'react-dom/client';
import EventResultsDisplay from './EventResultsDisplay';
import SeriesResultsDisplay from './SeriesResultsDisplay';
import { motion, AnimatePresence } from 'framer-motion';
import Lightbox from "yet-another-react-lightbox";
import "yet-another-react-lightbox/styles.css";
import Zoom from "yet-another-react-lightbox/plugins/zoom";
import Thumbnails from "yet-another-react-lightbox/plugins/thumbnails";
import "yet-another-react-lightbox/plugins/thumbnails.css";
import { useNotifications } from '../contexts/NotificationContext';
import { ShareRaceResultsModal } from './ShareRaceResultsModal';

interface EventData {
  title: string;
  date: string;
  venue: string;
  raceClass: string;
  raceFormat: string;
  imageUrl?: string;
  clubId?: string;
  eventId?: string;
}

interface PublishToMetaModalProps {
  isOpen: boolean;
  onClose: () => void;
  darkMode: boolean;
  pageName: string;
  pageId: string;
  eventData: EventData;
  resultsRef?: React.RefObject<HTMLDivElement>;
  eventResults?: any[];
  eventSkippers?: any[];
  eventMedia?: any[];
}

export const PublishToMetaModal: React.FC<PublishToMetaModalProps> = ({
  isOpen,
  onClose,
  darkMode,
  pageName,
  pageId,
  eventData,
  resultsRef,
  eventResults,
  eventSkippers,
  eventMedia = []
}) => {
  const { addNotification } = useNotifications();
  const [message, setMessage] = useState(
    `📢 Race Results: ${eventData.title}\n\n` +
    `${eventData.raceClass} ${eventData.raceFormat} - ${eventData.venue}\n\n` +
    `Congratulations to all participants! Check out the full results below.`
  );
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [resultsImage, setResultsImage] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [selectedAdditionalImages, setSelectedAdditionalImages] = useState<string[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  
  // For lightbox
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);
  
  // OpenAI integration
  const [showOpenAIGenerator, setShowOpenAIGenerator] = useState(true);
  const [useManualEntry, setUseManualEntry] = useState(false);
  const [weatherConditions, setWeatherConditions] = useState('');
  const [keyHighlights, setKeyHighlights] = useState('');
  const [peopleToCongratulate, setPeopleToCongratulate] = useState('');
  const [generatingReport, setGeneratingReport] = useState(false);
  const [reportGenerationError, setReportGenerationError] = useState<string | null>(null);
  const [showExampleReport, setShowExampleReport] = useState(false);
  const [showAIOptions, setShowAIOptions] = useState(true);

  // Image upload states
  const [uploadingImages, setUploadingImages] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [newlyUploadedImages, setNewlyUploadedImages] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);

  // Example race report
  const exampleRaceReport = `The 10R Handicap Racing Round 1 Pointscore kicked off at Cockle Creek, Teralba, under the watchful eye of Jeff, who helped Phil and I with scoring duties, and with much-appreciated help from Greg Mence and Baz assisting with the rescue boat. While the forecast teased us with an easterly breeze of 5–15 knots, the reality at the creek was a far cry from ideal, with fluky winds swirling unpredictably from every direction and ranging from a whisper to 8 knots. The challenging conditions demanded tactical skills and patience from all skippers, making for an entertaining day of light and tricky sailing.

Stephen Walsh emerged victorious, showcasing consistent sailing despite the shifty gusts, narrowly beating Barry Jut, who had a few divine interventions propelling him through the fleet at critical moments. Phil Page secured a well-earned third place, rounding out the podium. Nathan Cant also impressed, notching a race win in the 6th and showing good speed throughout the day. Greg Mence started slow but built momentum as the afternoon breeze strengthened, while Ian Craig's performance in the 9th race earned him a bullet and applause from the fleet. It was also fantastic to see Frank Russell's A-Class yacht on the water – a stunning addition to the day – and Grant Waring making a comeback with his freshly painted 10 Rater. Despite the conditions, the camaraderie and competitive spirit made for a memorable opening to the 2025 handicap season! Well done guys!`;

  useEffect(() => {
    if (isOpen) {
      captureResults();
    }
  }, [isOpen]);

  useEffect(() => {
    // Set the results image as selected by default
    if (resultsImage) {
      setSelectedImage(resultsImage);
    }
  }, [resultsImage]);

  const captureResults = async () => {
    try {
      // Create a temporary div for the export version
      const tempDiv = document.createElement('div');
      tempDiv.className = 'results-export-container';
      document.body.appendChild(tempDiv);
      
      // Render the appropriate component with isExportMode=true
      const rootElement = document.createElement('div');
      tempDiv.appendChild(rootElement);

      let root: any = null;

      // Use createRoot (React 18) instead of ReactDOM.render
      if (eventResults && eventSkippers) {
        // Create a mock event object with the necessary data
        const mockEvent = {
          eventName: eventData.title,
          raceClass: eventData.raceClass,
          raceFormat: eventData.raceFormat,
          date: eventData.date,
          venue: eventData.venue,
          raceResults: eventResults,
          skippers: eventSkippers
        };

        root = createRoot(rootElement);
        root.render(
          <EventResultsDisplay event={mockEvent} darkMode={false} isExportMode={true} />
        );
      } else if (resultsRef?.current) {
        // If we don't have direct access to results and skippers, use the resultsRef
        // This is a fallback and might not produce the ideal light-themed export
        const canvas = await html2canvas(resultsRef.current, {
          scale: 2,
          backgroundColor: '#ffffff',
          logging: false,
          useCORS: true
        });

        setResultsImage(canvas.toDataURL('image/jpeg', 0.9));

        // Clean up
        document.body.removeChild(tempDiv);
        return;
      } else {
        // No results available
        document.body.removeChild(tempDiv);
        return;
      }

      // Wait for rendering to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      // Capture as image
      const canvas = await html2canvas(tempDiv, {
        scale: 2,
        backgroundColor: '#ffffff',
        logging: false,
        useCORS: true
      });

      setResultsImage(canvas.toDataURL('image/jpeg', 0.9));

      // Clean up React root and remove temporary element
      if (root) {
        root.unmount();
      }
      document.body.removeChild(tempDiv);
    } catch (error) {
      console.error('Error capturing results:', error);
    }
  };

  const handlePublish = async () => {
    try {
      setPublishing(true);
      setError(null);
      
      // Use selected image or results image
      const imageToUse = selectedImage || resultsImage;
      
      if (!imageToUse) {
        setError('Please select an image or generate results image');
        setPublishing(false);
        return;
      }
      
      // Collect all images to be sent
      const imagesToPublish = [imageToUse];
      
      // Add additional selected images (up to 6)
      if (selectedAdditionalImages.length > 0) {
        imagesToPublish.push(...selectedAdditionalImages);
      }
      
      // Call the Supabase Edge Function to publish to Facebook
      const { data, error } = await supabase.functions.invoke('publish-to-facebook', {
        body: {
          club_id: eventData.clubId,
          page_id: pageId,
          message: message,
          image_urls: imagesToPublish
        }
      });
      
      if (error) throw error;
      
      // Set success state
      setSuccess(true);
      
      // Close modal after a delay
      setTimeout(() => {
        onClose();
      }, 2000);
    } catch (err) {
      console.error('Error publishing to Facebook:', err);
      setError(err instanceof Error ? err.message : 'Failed to publish to Facebook');
    } finally {
      setPublishing(false);
    }
  };

  const generateRaceReport = async () => {
    try {
      setGeneratingReport(true);
      setReportGenerationError(null);
      
      // Validate required data
      if (!eventResults || !eventSkippers) {
        throw new Error('Race results and skippers data are required to generate a report');
      }
      
      // Call the Supabase Edge Function to generate a race report
      const { data, error } = await supabase.functions.invoke('generate-race-report', {
        body: {
          eventData,
          raceResults: eventResults,
          skippers: eventSkippers,
          weatherConditions,
          keyHighlights,
          peopleToCongratulate
        }
      });
      
      if (error) {
        console.error('Edge function error:', error);
        
        // Handle specific OpenAI errors
        if (error.message?.includes('MISSING_API_KEY') || error.message?.includes('OpenAI API key not configured')) {
          throw new Error('AI race report generation is not available. The OpenAI API key needs to be configured by your administrator.');
        } else if (error.message?.includes('INVALID_API_KEY')) {
          throw new Error('AI race report generation is temporarily unavailable due to an invalid API key. Please contact your administrator.');
        } else if (error.message?.includes('RATE_LIMIT')) {
          throw new Error('AI service is temporarily busy. Please try again in a few minutes.');
        } else {
          throw new Error(error.message || 'Failed to generate race report');
        }
      }
      
      if (data?.report) {
        setMessage(data.report);
        setShowAIOptions(false);
        setUseManualEntry(true);
      } else {
        throw new Error('No report was generated');
      }
    } catch (err) {
      console.error('Error generating race report:', err);
      setReportGenerationError(err instanceof Error ? err.message : 'Failed to generate race report');
    } finally {
      setGeneratingReport(false);
    }
  };

  // Handle publish to website - save race report to database
  const handlePublishToWebsite = async () => {
    if (!eventData.clubId || !eventData.eventId) {
      addNotification('error', 'Missing required event information');
      return;
    }

    if (!message.trim()) {
      addNotification('error', 'Please write a race report first');
      return;
    }

    setPublishing(true);
    try {
      // Get the current user
      const { data: { user } } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('You must be logged in to publish reports');
      }

      // Check if report already exists
      const { data: existingReport } = await supabase
        .from('race_reports')
        .select('id')
        .eq('event_id', eventData.eventId)
        .eq('club_id', eventData.clubId)
        .maybeSingle();

      if (existingReport) {
        // Update existing report
        const { error: updateError } = await supabase
          .from('race_reports')
          .update({
            report_content: message,
            results_image_url: resultsImage,
            is_published: true,
            updated_at: new Date().toISOString()
          })
          .eq('id', existingReport.id);

        if (updateError) throw updateError;
        addNotification('success', 'Race report updated successfully!');
      } else {
        // Insert new report
        const { error: insertError } = await supabase
          .from('race_reports')
          .insert({
            event_id: eventData.eventId,
            event_type: 'quick_race',
            club_id: eventData.clubId,
            report_content: message,
            results_image_url: resultsImage,
            is_published: true,
            generated_by: user.id
          });

        if (insertError) throw insertError;
        addNotification('success', 'Race report published successfully!');
      }

      // Close the modal after a brief delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (err) {
      console.error('Error publishing to website:', err);
      addNotification('error', err instanceof Error ? err.message : 'Failed to publish race report');
    } finally {
      setPublishing(false);
    }
  };

  // Check if required data is available for AI generation
  const hasRequiredDataForAI = eventResults && eventResults.length > 0 && eventSkippers && eventSkippers.length > 0;

  // Toggle image selection for additional images
  const toggleImageSelection = (imageUrl: string) => {
    // If this is the main selected image, don't allow deselection
    if (imageUrl === selectedImage) {
      return;
    }
    
    // Check if image is already selected
    if (selectedAdditionalImages.includes(imageUrl)) {
      // Remove from selection
      setSelectedAdditionalImages(prev => prev.filter(url => url !== imageUrl));
    } else {
      // Check if we've reached the maximum of 6 additional images
      if (selectedAdditionalImages.length >= 6) {
        setError('Maximum of 6 additional images can be selected');
        setTimeout(() => setError(null), 3000);
        return;
      }
      
      // Add to selection
      setSelectedAdditionalImages(prev => [...prev, imageUrl]);
    }
  };

  // Handle file upload
  const handleFileSelect = async (files: FileList | null) => {
    console.log('handleFileSelect called', { files, clubId: eventData.clubId, eventId: eventData.eventId });

    if (!files || files.length === 0) {
      console.log('No files selected');
      return;
    }

    if (!eventData.clubId) {
      console.error('No clubId available');
      addNotification('error', 'Club ID is missing. Please try again.');
      return;
    }

    setUploadingImages(true);
    console.log('Starting upload process...');
    const uploadedUrls: string[] = [];
    let successCount = 0;
    let errorCount = 0;

    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        console.log(`Processing file ${i + 1}/${files.length}:`, file.name, file.type);

        if (!file.type.startsWith('image/')) {
          console.log('Skipping non-image file:', file.name);
          continue;
        }

        try {
          const fileExt = file.name.split('.').pop();
          const fileName = `${eventData.clubId}/${Date.now()}-${Math.random().toString(36).substr(2, 9)}.${fileExt}`;

          console.log('Uploading to storage:', fileName);
          const { data, error: uploadError } = await supabase.storage
            .from('event-media')
            .upload(fileName, file, {
              cacheControl: '3600',
              upsert: false
            });

          if (uploadError) {
            console.error('Storage upload error:', uploadError);
            throw uploadError;
          }

          console.log('Storage upload successful:', data);

          const { data: { publicUrl } } = supabase.storage
            .from('event-media')
            .getPublicUrl(data.path);

          console.log('Public URL:', publicUrl);

          // Check if eventId is a valid UUID (rounds have composite IDs like "uuid-round-9")
          const isValidUUID = eventData.eventId && !eventData.eventId.includes('-round-');
          console.log('Event ID validation:', { eventId: eventData.eventId, isValidUUID });

          const { error: dbError } = await supabase
            .from('event_media')
            .insert({
              club_id: eventData.clubId,
              url: publicUrl,
              media_type: 'image',
              title: file.name,
              event_name: eventData.title,
              event_ref_id: isValidUUID ? eventData.eventId : null,
              event_ref_type: isValidUUID ? 'quick_race' : null,
              race_class: eventData.raceClass,
              is_homepage_media: false,
            });

          if (dbError) {
            console.error('Database insert error:', dbError);
            throw dbError;
          }

          console.log('Image uploaded successfully:', file.name);
          uploadedUrls.push(publicUrl);
          setNewlyUploadedImages(prev => [...prev, { url: publicUrl, title: file.name }]);
          successCount++;
        } catch (fileError) {
          console.error(`Error uploading ${file.name}:`, fileError);
          errorCount++;
        }
      }

      if (uploadedUrls.length > 0) {
        console.log('Auto-selecting uploaded images');
        // Auto-select newly uploaded images if space available
        const availableSlots = 6 - selectedAdditionalImages.length;
        const imagesToAdd = uploadedUrls.slice(0, availableSlots);
        setSelectedAdditionalImages(prev => [...prev, ...imagesToAdd]);
      }

      if (successCount > 0) {
        addNotification('success', `Successfully uploaded ${successCount} image(s)`);
      }
      if (errorCount > 0) {
        addNotification('error', `Failed to upload ${errorCount} image(s)`);
      }
    } catch (error) {
      console.error('Error uploading images:', error);
      addNotification('error', 'Failed to upload images. Please try again.');
    } finally {
      console.log('Upload process complete, resetting uploadingImages state');
      setUploadingImages(false);
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    console.log('handleDrop called', e.dataTransfer.files);
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      console.log('Files detected in drop, calling handleFileSelect');
      handleFileSelect(e.dataTransfer.files);
    } else {
      console.log('No files in drop event');
    }
  };

  // Open lightbox for a specific image
  const openLightbox = (index: number) => {
    setLightboxIndex(index);
    setLightboxOpen(true);
  };

  // Prepare slides for lightbox
  const slides = eventMedia
    .filter(item => item.type === 'image')
    .map(item => ({ src: item.url, alt: item.title || 'Image' }));

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      {/* Prominent Loading Overlay */}
      {generatingReport && (
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

      <div className={`
        w-full max-w-6xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-cyan-600 via-cyan-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              <Facebook className="text-white drop-shadow-lg" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">Share & Publish Results</h2>
              <p className="text-cyan-100 text-sm mt-0.5">Multiple sharing and export options</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="mb-6 p-4 rounded-lg bg-red-900/20 border border-red-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <AlertTriangle className="h-5 w-5 text-red-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-300">
                    {error}
                  </h3>
                </div>
              </div>
            </div>
          )}
          
          {success && (
            <div className="mb-6 p-4 rounded-lg bg-green-900/20 border border-green-900/30">
              <div className="flex">
                <div className="flex-shrink-0">
                  <Check className="h-5 w-5 text-green-400" aria-hidden="true" />
                </div>
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-green-300">
                    Results published successfully to Facebook!
                  </h3>
                </div>
              </div>
            </div>
          )}
          
          <div className="space-y-6">
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className={`block text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Message
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setUseManualEntry(!useManualEntry)}
                    className={`
                      flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all shadow-md
                      ${useManualEntry
                        ? 'bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white'
                        : 'bg-slate-600 hover:bg-slate-700 text-white'}
                    `}
                  >
                    {useManualEntry ? (
                      <>
                        <Sparkles size={14} />
                        Use Alfie
                      </>
                    ) : (
                      'Write Manually'
                    )}
                  </button>
                  
                  <button
                    type="button"
                    onClick={() => setShowExampleReport(!showExampleReport)}
                    className={`
                      p-1 rounded transition-colors
                      ${darkMode 
                        ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
                    `}
                    title="View example report"
                  >
                    <Info size={16} />
                  </button>
                </div>
              </div>
              
              {showExampleReport && (
                <div className={`
                  p-4 mb-4 rounded-lg border text-sm
                  ${darkMode ? 'bg-slate-700/50 border-slate-600/50 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}
                `}>
                  <h4 className={`text-sm font-medium mb-2 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Example Race Report
                  </h4>
                  <p className="whitespace-pre-line">{exampleRaceReport}</p>
                </div>
              )}
              
              {!useManualEntry && !showAIOptions && (
                <button
                  onClick={() => setShowAIOptions(true)}
                  className={`mb-4 text-sm px-4 py-2 rounded-lg transition-all flex items-center gap-2 ${darkMode ? 'bg-cyan-500/20 text-cyan-300 hover:bg-cyan-500/30' : 'bg-cyan-100 text-cyan-700 hover:bg-cyan-200'}`}
                >
                  <Sparkles size={14} />
                  Show AI Options
                </button>
              )}

              {!useManualEntry && showAIOptions && (
                <div className={`
                  p-4 mb-4 rounded-lg border-2 border-dashed
                  ${darkMode ? 'bg-slate-700/50 border-blue-500/50' : 'bg-blue-50/50 border-blue-400/50'}
                `}>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                      AI Race Report Generator
                    </h4>
                    <button
                      onClick={() => setShowAIOptions(false)}
                      className={`text-xs px-2 py-1 rounded transition-colors ${darkMode ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-600' : 'text-slate-600 hover:text-slate-700 hover:bg-slate-200'}`}
                    >
                      Hide
                    </button>
                  </div>
                  
                  {!hasRequiredDataForAI && (
                    <div className="mb-4 p-3 rounded-lg bg-amber-900/20 border border-amber-900/30">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <Info className="h-4 w-4 text-amber-400" aria-hidden="true" />
                        </div>
                        <div className="ml-3">
                          <p className="text-xs text-amber-300">
                            AI race report generation requires completed race results and skipper data. Please complete the race first to use this feature.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  {reportGenerationError && (
                    <div className="mb-4 p-3 rounded-lg bg-red-900/20 border border-red-900/30">
                      <div className="flex">
                        <div className="flex-shrink-0">
                          <AlertTriangle className="h-4 w-4 text-red-400" aria-hidden="true" />
                        </div>
                        <div className="ml-3">
                          <p className="text-xs text-red-300">
                            {reportGenerationError}
                          </p>
                        </div>
                      </div>
                    </div>
                  )}
                  
                  <div className="space-y-3">
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Weather Conditions
                      </label>
                      <textarea
                        value={weatherConditions}
                        onChange={(e) => setWeatherConditions(e.target.value)}
                        rows={2}
                        disabled={!hasRequiredDataForAI}
                        className={`
                          w-full px-3 py-2 rounded-lg transition-colors text-sm
                          ${darkMode 
                            ? 'bg-slate-800 text-slate-200 border border-slate-600' 
                            : 'bg-white text-slate-900 border border-slate-200'}
                          ${!hasRequiredDataForAI ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        placeholder="e.g., Easterly breeze 5-15 knots, sunny, 25 degrees C"
                      />
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Key Highlights
                      </label>
                      <textarea
                        value={keyHighlights}
                        onChange={(e) => setKeyHighlights(e.target.value)}
                        rows={2}
                        disabled={!hasRequiredDataForAI}
                        className={`
                          w-full px-3 py-2 rounded-lg transition-colors text-sm
                          ${darkMode 
                            ? 'bg-slate-800 text-slate-200 border border-slate-600' 
                            : 'bg-white text-slate-900 border border-slate-200'}
                          ${!hasRequiredDataForAI ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        placeholder="e.g., Close racing, Nathan won race 6, Ian had a great comeback"
                      />
                    </div>
                    
                    <div>
                      <label className={`block text-xs font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        People to Congratulate
                      </label>
                      <textarea
                        value={peopleToCongratulate}
                        onChange={(e) => setPeopleToCongratulate(e.target.value)}
                        rows={2}
                        disabled={!hasRequiredDataForAI}
                        className={`
                          w-full px-3 py-2 rounded-lg transition-colors text-sm
                          ${darkMode 
                            ? 'bg-slate-800 text-slate-200 border border-slate-600' 
                            : 'bg-white text-slate-900 border border-slate-200'}
                          ${!hasRequiredDataForAI ? 'opacity-50 cursor-not-allowed' : ''}
                        `}
                        placeholder="e.g., Jeff for scoring, Greg and Baz for rescue boat"
                      />
                    </div>
                    
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={generateRaceReport}
                        disabled={generatingReport || !hasRequiredDataForAI}
                        className={`
                          flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all
                          bg-gradient-to-r from-cyan-600 to-blue-700 hover:from-cyan-700 hover:to-blue-800 text-white shadow-lg hover:shadow-xl
                          disabled:opacity-50 disabled:cursor-not-allowed
                        `}
                      >
                        {generatingReport ? (
                          <>
                            <RefreshCw size={14} className="animate-spin" />
                            Generating...
                          </>
                        ) : (
                          <>
                            <Sparkles size={14} />
                            Ask Alfie To Generate Draft
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              )}
              
              {useManualEntry && (
                <div className="relative">
                  <div className="absolute top-0 left-0 px-2 py-1 bg-slate-700 text-xs font-medium text-white rounded-tl-lg rounded-br-lg z-10">
                    Draft
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={20}
                    className={`
                      w-full px-3 py-2 pt-8 rounded-lg transition-colors
                      ${darkMode
                        ? 'bg-slate-700 text-slate-200 border border-slate-600'
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="Write something about these results..."
                  />
                </div>
              )}
            </div>
            
            <div>
              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Race Results
              </label>
              
              <div className="mb-4">
                {/* Results image */}
                {resultsImage && (
                  <div 
                    className={`
                      relative rounded-lg overflow-hidden border
                      ${darkMode ? 'border-slate-700' : 'border-slate-200'}
                    `}
                  >
                    <img 
                      src={resultsImage} 
                      alt="Race Results" 
                      className="w-full h-auto"
                    />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
                      Results Image
                    </div>
                  </div>
                )}
              </div>

              <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Additional Images (Select up to 6)
              </label>
              
              {eventMedia && eventMedia.filter(item => item.type === 'image').length > 0 ? (
                <div className="overflow-x-auto pb-2">
                  <div className="flex gap-3 min-w-max">
                    {eventMedia
                      .filter(item => item.type === 'image')
                      .map((item, index) => (
                        <div 
                          key={item.id}
                          className={`
                            relative rounded-lg overflow-hidden w-24 h-24 flex-shrink-0 cursor-pointer
                            ${selectedAdditionalImages.includes(item.url) ? 'ring-2 ring-green-500' : ''}
                            ${selectedImage === item.url ? 'opacity-50' : ''}
                            transition-all hover:scale-105
                          `}
                          onClick={() => {
                            if (selectedImage !== item.url) {
                              toggleImageSelection(item.url);
                            }
                          }}
                          onDoubleClick={() => openLightbox(index)}
                        >
                          <img 
                            src={item.url} 
                            alt={item.title || 'Event image'} 
                            className="w-full h-full object-cover"
                          />
                          {selectedAdditionalImages.includes(item.url) && (
                            <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                              <Check size={14} className="text-white" />
                            </div>
                          )}
                          {selectedImage === item.url && (
                            <div className="absolute inset-0 flex items-center justify-center">
                              <div className="px-2 py-1 bg-blue-600 text-white text-xs rounded">Primary</div>
                            </div>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              ) : (
                <div className={`
                  text-center py-4 rounded-lg border
                  ${darkMode
                    ? 'bg-slate-700/50 border-slate-600/50 text-slate-400'
                    : 'bg-slate-50 border-slate-200 text-slate-500'}
                `}>
                  <ImageIcon className="mx-auto mb-2 opacity-20" size={24} />
                  <p className="text-sm">No additional images available</p>
                </div>
              )}

              {/* Upload New Images Section */}
              <div className="mt-4">
                <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Or Upload New Images
                </label>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/*"
                  onChange={(e) => handleFileSelect(e.target.files)}
                  className="hidden"
                />
                <div
                  onDragEnter={handleDrag}
                  onDragLeave={handleDrag}
                  onDragOver={handleDrag}
                  onDrop={handleDrop}
                  onClick={(e) => {
                    e.stopPropagation();
                    console.log('Upload area clicked');
                    fileInputRef.current?.click();
                  }}
                  className={`
                    relative cursor-pointer rounded-lg border-2 border-dashed p-6 text-center transition-all
                    ${dragActive
                      ? 'border-green-500 bg-green-500/10'
                      : darkMode
                        ? 'border-green-500/50 bg-slate-700/30 hover:border-green-500 hover:bg-slate-700/50'
                        : 'border-green-400/50 bg-slate-50 hover:border-green-400 hover:bg-slate-100'}
                    ${uploadingImages ? 'pointer-events-none opacity-50' : ''}
                  `}
                >
                  {uploadingImages ? (
                    <>
                      <RefreshCw className="mx-auto mb-2 animate-spin text-blue-500" size={32} />
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Uploading images...
                      </p>
                    </>
                  ) : (
                    <>
                      <Upload className={`mx-auto mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} size={32} />
                      <p className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        Drop images here or click to upload
                      </p>
                      <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                        Supports multiple images • JPG, PNG, GIF
                      </p>
                    </>
                  )}
                </div>

                {/* Display newly uploaded images */}
                {newlyUploadedImages.length > 0 && (
                  <div className="mt-3">
                    <p className={`text-xs mb-2 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Newly uploaded ({newlyUploadedImages.length})
                    </p>
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {newlyUploadedImages.map((img, index) => (
                        <div
                          key={index}
                          className={`
                            relative rounded-lg overflow-hidden w-20 h-20 flex-shrink-0 cursor-pointer
                            ${selectedAdditionalImages.includes(img.url) ? 'ring-2 ring-green-500' : ''}
                            transition-all hover:scale-105
                          `}
                          onClick={() => toggleImageSelection(img.url)}
                        >
                          <img
                            src={img.url}
                            alt={img.title}
                            className="w-full h-full object-cover"
                          />
                          {selectedAdditionalImages.includes(img.url) && (
                            <div className="absolute top-1 right-1 bg-green-500 rounded-full p-0.5">
                              <Check size={12} className="text-white" />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className={`
          p-6 border-t space-y-4
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          {/* Publish Options */}
          <div>
            <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Publish To
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={handlePublish}
                disabled={publishing || success || (!selectedImage && !resultsImage)}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
              >
                {publishing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Publishing...
                  </>
                ) : success ? (
                  <>
                    <Check size={16} />
                    Published
                  </>
                ) : (
                  <>
                    <Facebook size={16} />
                    Facebook
                  </>
                )}
              </button>

              <button
                onClick={() => alert('Instagram publishing coming soon!')}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-br from-purple-600 via-pink-600 to-orange-500 text-white rounded-lg hover:opacity-90 font-medium transition-opacity"
              >
                <ImageIcon size={16} />
                Instagram
              </button>

              <button
                onClick={() => setShowEmailModal(true)}
                disabled={!message.trim()}
                className="flex items-center justify-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Mail size={16} />
                Email
              </button>
            </div>
          </div>

          {/* Export Options */}
          <div>
            <h3 className={`text-sm font-medium mb-3 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Download As
            </h3>
            <div className="grid grid-cols-3 gap-3">
              <button
                onClick={() => {
                  if (resultsImage) {
                    const link = document.createElement('a');
                    link.download = `${eventData.title}-results.jpg`;
                    link.href = resultsImage;
                    link.click();
                  }
                }}
                disabled={!resultsImage}
                className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg font-medium transition-colors ${
                  !resultsImage
                    ? 'bg-slate-600 text-slate-400 cursor-not-allowed'
                    : 'bg-slate-700 text-white hover:bg-slate-600'
                }`}
              >
                <Image size={16} />
                JPG
              </button>

              <button
                onClick={() => alert('PDF export coming soon!')}
                className="flex items-center justify-center gap-2 px-3 py-2.5 bg-slate-700 text-white rounded-lg hover:bg-slate-600 font-medium transition-colors"
              >
                <FileText size={16} />
                PDF
              </button>

              <button
                onClick={handlePublishToWebsite}
                disabled={publishing}
                className="flex items-center justify-center gap-2 px-3 py-2.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {publishing ? (
                  <>
                    <RefreshCw size={16} className="animate-spin" />
                    Publishing...
                  </>
                ) : (
                  <>
                    <Send size={16} />
                    Website
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Cancel Button */}
          <div className="flex justify-end pt-2">
            <button
              onClick={onClose}
              className={`
                px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode
                  ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                  : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
              `}
            >
              Close
            </button>
          </div>
        </div>

        {/* Lightbox for viewing images */}
        <Lightbox
          open={lightboxOpen}
          close={() => setLightboxOpen(false)}
          index={lightboxIndex}
          slides={slides}
          plugins={[Zoom, Thumbnails]}
          carousel={{
            finite: slides.length <= 1
          }}
          thumbnails={{
            position: "bottom",
            width: 120,
            height: 80,
            border: 2,
            borderRadius: 4,
            padding: 4,
            gap: 16
          }}
          zoom={{
            scrollToZoom: true,
            maxZoomPixelRatio: 3
          }}
          styles={{
            container: { backgroundColor: "rgba(0, 0, 0, .9)" },
            thumbnailsContainer: { backgroundColor: "rgba(0, 0, 0, .8)" },
            thumbnail: { backgroundColor: "rgba(30, 41, 59, .8)" }
          }}
        />
      </div>

      {/* Share Race Results via Email Modal */}
      <ShareRaceResultsModal
        isOpen={showEmailModal}
        onClose={() => setShowEmailModal(false)}
        eventData={eventData}
        raceReport={message}
        resultsImage={resultsImage}
        darkMode={darkMode}
      />
    </div>
  );
};