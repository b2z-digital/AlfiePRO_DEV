import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, Building, Sailboat, X, FileText, CalendarRange, Upload, DollarSign, Users, Plus, Globe, Clock, AlertTriangle } from 'lucide-react';
import { RaceType, BoatType } from '../types';
import { RaceEvent } from '../types/race';
import { storeRaceEvent, setCurrentEvent } from '../utils/raceStorage';
import { getStoredClubs } from '../utils/clubStorage';
import { getStoredVenues } from '../utils/venueStorage';
import { Club } from '../types/club';
import { Venue } from '../types/venue';
import { supabase } from '../utils/supabase';
import { useAuth } from '../contexts/AuthContext';

interface OneOffRaceProps {
  darkMode: boolean;
  onRaceSetup: (type: RaceType) => void;
  onClose: () => void;
  editingEvent?: RaceEvent | null;
}

export const OneOffRace: React.FC<OneOffRaceProps> = ({
  darkMode,
  onRaceSetup,
  onClose,
  editingEvent
}) => {
  const { currentClub } = useAuth();
  const [formData, setFormData] = useState({
    eventName: '',
    clubName: '',
    raceDate: '',
    endDate: '', // For multi-day events
    raceVenue: '',
    raceClass: '' as BoatType,
    raceFormat: 'handicap' as RaceType,
    isMultiDay: false,
    numberOfDays: 1,
    isPaid: false,
    entryFee: '',
    noticeOfRaceFile: null as File | null,
    noticeOfRaceUrl: '',
    sailingInstructionsFile: null as File | null,
    sailingInstructionsUrl: '',
    isInterclub: false,
    otherClubId: '',
    otherClubName: '',
    manualOtherClub: false,
    manualOtherClubName: ''
  });

  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [uploadWarning, setUploadWarning] = useState<string | null>(null);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [fetchedClubs, fetchedVenues] = await Promise.all([
        getStoredClubs(),
        getStoredVenues()
      ]);
      setClubs(fetchedClubs);
      setVenues(fetchedVenues);

      // Fetch all clubs from the database
      const { data: allClubsData, error: allClubsError } = await supabase
        .from('clubs')
        .select('id, name, abbreviation');
      
      if (allClubsError) {
        console.error('Error fetching all clubs:', allClubsError);
      } else {
        setAllClubs(allClubsData || []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (editingEvent) {
      const isMultiDay = editingEvent.endDate !== undefined && editingEvent.endDate !== editingEvent.date;
      
      setFormData({
        eventName: editingEvent.eventName || editingEvent.clubName,
        clubName: editingEvent.clubName,
        raceDate: editingEvent.date,
        endDate: editingEvent.endDate || editingEvent.date,
        raceVenue: editingEvent.venue,
        raceClass: editingEvent.raceClass,
        raceFormat: editingEvent.raceFormat,
        isMultiDay: isMultiDay,
        numberOfDays: isMultiDay ? calculateDaysBetween(editingEvent.date, editingEvent.endDate || editingEvent.date) : 1,
        isPaid: editingEvent.isPaid || false,
        entryFee: editingEvent.entryFee ? editingEvent.entryFee.toString() : '',
        noticeOfRaceFile: null,
        noticeOfRaceUrl: editingEvent.noticeOfRaceUrl || '',
        sailingInstructionsFile: null,
        sailingInstructionsUrl: editingEvent.sailingInstructionsUrl || '',
        isInterclub: editingEvent.isInterclub || false,
        otherClubId: editingEvent.otherClubId || '',
        otherClubName: editingEvent.otherClubName || '',
        manualOtherClub: false,
        manualOtherClubName: ''
      });
    }
  }, [editingEvent]);

  // Calculate days between two dates
  const calculateDaysBetween = (startDate: string, endDate: string): number => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end days
  };

  // Calculate end date based on start date and number of days
  const calculateEndDate = (startDate: string, days: number): string => {
    if (!startDate) return '';
    const date = new Date(startDate);
    date.setDate(date.getDate() + days - 1); // -1 because we count the start date as day 1
    return date.toISOString().split('T')[0];
  };

  // Update end date when start date or number of days changes
  useEffect(() => {
    if (formData.isMultiDay && formData.raceDate) {
      const endDate = calculateEndDate(formData.raceDate, formData.numberOfDays);
      setFormData(prev => ({ ...prev, endDate }));
    }
  }, [formData.raceDate, formData.numberOfDays, formData.isMultiDay]);

  const handleFileUpload = async (file: File, type: 'nor' | 'si'): Promise<string> => {
    if (!file) return '';
    
    try {
      setUploading(true);
      setUploadWarning(null);
      setError(null);
      
      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `event-documents/${fileName}`;
      
      // Upload to Supabase Storage with explicit content type
      const { data, error } = await supabase.storage
        .from('event-media')
        .upload(filePath, file, {
          contentType: file.type || 'application/pdf',
          upsert: false
        });
      
      if (error) {
        // Handle specific PDF MIME type error
        if (error.message.includes('mime type') && (error.message.includes('not supported') || error.message.includes('application/pdf'))) {
          const warningMessage = `PDF file uploads are currently disabled in your Supabase storage configuration. To enable PDF uploads:\n\n1. Go to your Supabase project dashboard\n2. Navigate to Storage → event-media bucket\n3. Go to Configuration → Allowed MIME types\n4. Add "application/pdf" to the allowed types\n\nAlternatively, you can provide a direct URL to your document using the URL field below.`;
          setUploadWarning(warningMessage);
          
          // Clear the file input since upload failed
          if (type === 'nor') {
            setFormData(prev => ({ ...prev, noticeOfRaceFile: null }));
          } else {
            setFormData(prev => ({ ...prev, sailingInstructionsFile: null }));
          }
          
          return '';
        }
        throw error;
      }
      
      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('event-media')
        .getPublicUrl(filePath);
      
      return publicUrl;
    } catch (error) {
      console.error(`Error uploading ${type} file:`, error);
      const errorMessage = error instanceof Error ? error.message : `Failed to upload ${type === 'nor' ? 'Notice of Race' : 'Sailing Instructions'} file`;
      setError(errorMessage);
      
      // Clear the file input since upload failed
      if (type === 'nor') {
        setFormData(prev => ({ ...prev, noticeOfRaceFile: null }));
      } else {
        setFormData(prev => ({ ...prev, sailingInstructionsFile: null }));
      }
      
      return '';
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setUploadWarning(null);
    
    try {
      // Get current club ID
      const clubId = currentClub?.clubId;
      if (!clubId) {
        throw new Error('No club selected');
      }
      
      // Upload files if selected
      let noticeOfRaceUrl = formData.noticeOfRaceUrl;
      let sailingInstructionsUrl = formData.sailingInstructionsUrl;
      
      if (formData.noticeOfRaceFile) {
        const url = await handleFileUpload(formData.noticeOfRaceFile, 'nor');
        if (url) {
          noticeOfRaceUrl = url;
        }
        // If upload failed, the error/warning is already handled in handleFileUpload
      }
      
      if (formData.sailingInstructionsFile) {
        const url = await handleFileUpload(formData.sailingInstructionsFile, 'si');
        if (url) {
          sailingInstructionsUrl = url;
        }
        // If upload failed, the error/warning is already handled in handleFileUpload
      }
      
      // Don't proceed if there are upload warnings and no URLs provided
      if (uploadWarning && !noticeOfRaceUrl && !sailingInstructionsUrl && (formData.noticeOfRaceFile || formData.sailingInstructionsFile)) {
        // Let user see the warning and decide whether to continue with URL input or fix configuration
        return;
      }
      
      // Get other club name if interclub event
      let otherClubName = formData.otherClubName;
      let otherClubId = formData.otherClubId;
      
      if (formData.isInterclub) {
        if (formData.manualOtherClub && formData.manualOtherClubName) {
          // Use manually entered club name
          otherClubName = formData.manualOtherClubName;
          otherClubId = '';
        } else if (formData.otherClubId) {
          // Use selected club from dropdown
          const selectedOtherClub = allClubs.find(c => c.id === formData.otherClubId);
          if (selectedOtherClub) {
            otherClubName = selectedOtherClub.name;
          }
        }
      }
      
      const event: RaceEvent = {
        id: editingEvent?.id || crypto.randomUUID(),
        eventName: formData.eventName,
        clubName: formData.clubName,
        date: formData.raceDate,
        endDate: formData.isMultiDay ? formData.endDate : undefined,
        venue: formData.raceVenue,
        raceClass: formData.raceClass,
        raceFormat: formData.raceFormat,
        multiDay: formData.isMultiDay,
        numberOfDays: formData.isMultiDay ? formData.numberOfDays : 1,
        currentDay: editingEvent?.currentDay || 1,
        // Preserve existing data if editing
        raceResults: editingEvent?.raceResults || [],
        skippers: editingEvent?.skippers || [],
        lastCompletedRace: editingEvent?.lastCompletedRace || 0,
        hasDeterminedInitialHcaps: editingEvent?.hasDeterminedInitialHcaps || false,
        isManualHandicaps: editingEvent?.isManualHandicaps || false,
        dayResults: editingEvent?.dayResults || {},
        // Add new fields
        isPaid: formData.isPaid,
        entryFee: formData.isPaid ? parseFloat(formData.entryFee) : undefined,
        noticeOfRaceUrl,
        sailingInstructionsUrl,
        // Add interclub fields
        isInterclub: formData.isInterclub,
        otherClubId: formData.isInterclub ? otherClubId : undefined,
        otherClubName: formData.isInterclub ? otherClubName : undefined,
        // Add club ID for filtering
        clubId
      };

      await storeRaceEvent(event);
      setCurrentEvent(event);
      onRaceSetup(formData.raceFormat);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (loading) {
    return (
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-center p-6
          ${darkMode ? 'text-slate-300' : 'text-slate-600'}
        `}>
          Loading...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={`
        w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-center p-6 text-red-500
        `}>
          {error}
        </div>
      </div>
    );
  }

  return (
    <div className={`
      w-full max-w-2xl rounded-xl shadow-xl overflow-hidden flex flex-col
      ${darkMode ? 'bg-slate-800' : 'bg-white'}
    `}>
      <div className={`
        flex items-center justify-between p-6 border-b
        ${darkMode ? 'border-slate-700' : 'border-slate-200'}
      `}>
        <div className="flex items-center gap-3">
          <Trophy className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
          <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
            {editingEvent ? 'Edit Single Event' : 'Create Single Event'}
          </h2>
        </div>
        <button
          onClick={onClose}
          className={`
            rounded-full p-2 transition-colors
            ${darkMode 
              ? 'text-slate-400 hover:text-slate-300 hover:bg-slate-700' 
              : 'text-slate-400 hover:text-slate-600 hover:bg-slate-100'}
          `}
        >
          <X size={20} />
        </button>
      </div>

      <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
        {error && (
          <div className="bg-red-900/20 border border-red-900/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-red-400 mt-0.5" size={18} />
              <div>
                <p className="text-red-300 text-sm font-medium mb-1">Upload Error</p>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          </div>
        )}

        {uploadWarning && (
          <div className="bg-amber-900/20 border border-amber-900/30 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="text-amber-400 mt-0.5 flex-shrink-0" size={18} />
              <div>
                <p className="text-amber-300 text-sm font-medium mb-2">PDF Upload Configuration Required</p>
                <div className="text-amber-300 text-sm whitespace-pre-line">{uploadWarning}</div>
                <button
                  type="button"
                  onClick={() => setUploadWarning(null)}
                  className="mt-3 px-3 py-1 bg-amber-600 text-white text-xs rounded hover:bg-amber-700 transition-colors"
                >
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}
        
        <div className="space-y-4">
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Event Name *
            </label>
            <div className="relative">
              <FileText 
                size={18} 
                className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
              <input
                type="text"
                required
                value={formData.eventName}
                onChange={(e) => setFormData(prev => ({ ...prev, eventName: e.target.value }))}
                className={`
                  w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
                placeholder="Enter event name"
              />
            </div>
          </div>

          {/* Event Type Options */}
          <div className="grid grid-cols-2 gap-4 mb-4">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, isInterclub: !prev.isInterclub }))}
              className={`
                relative p-4 rounded-lg border transition-all text-left
                ${formData.isInterclub 
                  ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                  : darkMode 
                    ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                    : 'bg-white border-slate-200 hover:bg-slate-50'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`
                  p-2 rounded-lg
                  ${formData.isInterclub 
                    ? 'bg-blue-600 text-white' 
                    : darkMode 
                      ? 'bg-slate-600 text-slate-300' 
                      : 'bg-slate-100 text-slate-700'}
                `}>
                  <Globe size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Interclub Event
                  </h3>
                </div>
              </div>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Event between two or more clubs with members from both clubs participating
              </p>
              <div className="absolute top-3 right-3">
                <div className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${formData.isInterclub 
                    ? 'border-blue-500 bg-blue-500' 
                    : 'border-slate-400'}
                `}>
                  {formData.isInterclub && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setFormData(prev => ({ 
                ...prev, 
                isMultiDay: !prev.isMultiDay,
                endDate: !prev.isMultiDay ? calculateEndDate(prev.raceDate, prev.numberOfDays) : prev.raceDate
              }))}
              className={`
                relative p-4 rounded-lg border transition-all text-left
                ${formData.isMultiDay 
                  ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                  : darkMode 
                    ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                    : 'bg-white border-slate-200 hover:bg-slate-50'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`
                  p-2 rounded-lg
                  ${formData.isMultiDay 
                    ? 'bg-blue-600 text-white' 
                    : darkMode 
                      ? 'bg-slate-600 text-slate-300' 
                      : 'bg-slate-100 text-slate-700'}
                `}>
                  <Clock size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Multi-day Event
                  </h3>
                </div>
              </div>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Event spanning multiple days with combined scoring
              </p>
              <div className="absolute top-3 right-3">
                <div className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${formData.isMultiDay 
                    ? 'border-blue-500 bg-blue-500' 
                    : 'border-slate-400'}
                `}>
                  {formData.isMultiDay && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
              </div>
            </button>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              {formData.isInterclub ? 'Host Club *' : 'Club Name *'}
            </label>
            <div className="relative">
              <Building 
                size={18} 
                className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
              <select
                required
                value={formData.clubName}
                onChange={(e) => setFormData(prev => ({ ...prev, clubName: e.target.value }))}
                className={`
                  w-full pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
              >
                <option value="">Select {formData.isInterclub ? 'host club' : 'club'}</option>
                {clubs.map(club => (
                  <option key={club.id} value={club.name}>
                    {club.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {formData.isInterclub && (
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Other Club *
              </label>
              <div className="relative">
                <Users 
                  size={18} 
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                />
                {formData.manualOtherClub ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      required
                      value={formData.manualOtherClubName}
                      onChange={(e) => setFormData(prev => ({ 
                        ...prev, 
                        manualOtherClubName: e.target.value,
                        otherClubName: e.target.value
                      }))}
                      className={`
                        flex-1 pl-10 pr-4 py-2 rounded-lg transition-colors
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                      placeholder="Enter club name"
                    />
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ 
                        ...prev, 
                        manualOtherClub: false,
                        manualOtherClubName: '',
                        otherClubId: '',
                        otherClubName: ''
                      }))}
                      className={`
                        px-3 py-2 rounded-lg
                        ${darkMode 
                          ? 'bg-slate-600 text-slate-200 hover:bg-slate-500' 
                          : 'bg-slate-200 text-slate-700 hover:bg-slate-300'}
                      `}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      required={formData.isInterclub && !formData.manualOtherClub}
                      value={formData.otherClubId}
                      onChange={(e) => {
                        const selectedClub = allClubs.find(c => c.id === e.target.value);
                        setFormData(prev => ({ 
                          ...prev, 
                          otherClubId: e.target.value,
                          otherClubName: selectedClub ? selectedClub.name : ''
                        }));
                      }}
                      className={`
                        flex-1 pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                        ${darkMode 
                          ? 'bg-slate-700 text-slate-200' 
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                    >
                      <option value="">Select other club</option>
                      {allClubs
                        .filter(club => club.name !== formData.clubName)
                        .map(club => (
                          <option key={club.id} value={club.id}>
                            {club.name}
                          </option>
                        ))
                      }
                    </select>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ 
                        ...prev, 
                        manualOtherClub: true,
                        otherClubId: ''
                      }))}
                      className={`
                        flex items-center gap-1 px-3 py-2 rounded-lg
                        ${darkMode 
                          ? 'bg-blue-600 text-white hover:bg-blue-700' 
                          : 'bg-blue-600 text-white hover:bg-blue-700'}
                      `}
                      title="Add club manually"
                    >
                      <Plus size={16} />
                      Add Club
                    </button>
                  </div>
                )}
              </div>
              {!formData.manualOtherClub && (
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Select from existing clubs or click "Add Club" to enter manually
                </p>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                Start Date *
              </label>
              <div className="relative">
                <Calendar 
                  size={18} 
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                />
                <input
                  type="date"
                  required
                  value={formData.raceDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, raceDate: e.target.value }))}
                  className={`
                    w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                    ${darkMode 
                      ? 'bg-slate-700 text-slate-200' 
                      : 'bg-white text-slate-900 border border-slate-200'}
                  `}
                />
              </div>
            </div>

            {formData.isMultiDay && (
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Number of Days *
                </label>
                <div className="relative">
                  <CalendarRange 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <select
                    required
                    value={formData.numberOfDays}
                    onChange={(e) => setFormData(prev => ({ 
                      ...prev, 
                      numberOfDays: parseInt(e.target.value),
                      endDate: calculateEndDate(prev.raceDate, parseInt(e.target.value))
                    }))}
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                  >
                    {[1, 2, 3, 4, 5, 6, 7].map(days => (
                      <option key={days} value={days}>{days} day{days > 1 ? 's' : ''}</option>
                    ))}
                  </select>
                </div>
              </div>
            )}

            {formData.isMultiDay && (
              <div>
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  End Date
                </label>
                <div className="relative">
                  <Calendar 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="date"
                    disabled
                    value={formData.endDate}
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors cursor-not-allowed
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-400' 
                        : 'bg-slate-100 text-slate-500 border border-slate-200'}
                    `}
                  />
                </div>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  End date is calculated automatically
                </p>
              </div>
            )}
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Race Venue *
            </label>
            <select
              required
              value={formData.raceVenue}
              onChange={(e) => setFormData(prev => ({ ...prev, raceVenue: e.target.value }))}
              className={`
                w-full px-4 py-2 rounded-lg transition-colors appearance-none
                ${darkMode 
                  ? 'bg-slate-700 text-slate-200' 
                  : 'bg-white text-slate-900 border border-slate-200'}
              `}
            >
              <option value="">Select venue</option>
              {venues.map(venue => (
                <option key={venue.id} value={venue.name}>
                  {venue.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Race Class *
            </label>
            <div className="relative">
              <Sailboat 
                size={18} 
                className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
              />
              <select
                required
                value={formData.raceClass}
                onChange={(e) => setFormData(prev => ({ ...prev, raceClass: e.target.value as BoatType }))}
                className={`
                  w-full pl-10 pr-4 py-2 rounded-lg transition-colors appearance-none
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
              >
                <option value="">Select race class</option>
                <option value="DF65">Dragon Force 65</option>
                <option value="DF95">Dragon Force 95</option>
                <option value="10R">10 Rater</option>
                <option value="IOM">IOM</option>
                <option value="Marblehead">Marblehead</option>
                <option value="A Class">A Class</option>
                <option value="RC Laser">RC Laser</option>
              </select>
            </div>
          </div>

          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Race Format *
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, raceFormat: 'handicap' }))}
                className={`
                  p-3 rounded-lg text-sm font-medium transition-colors
                  ${formData.raceFormat === 'handicap'
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }
                `}
              >
                Handicap Racing
              </button>
              <button
                type="button"
                onClick={() => setFormData(prev => ({ ...prev, raceFormat: 'scratch' }))}
                className={`
                  p-3 rounded-lg text-sm font-medium transition-colors
                  ${formData.raceFormat === 'scratch'
                    ? 'bg-blue-600 text-white'
                    : darkMode
                      ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }
                `}
              >
                Scratch Racing
              </button>
            </div>
          </div>

          {/* Notice of Race Document Upload */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Notice of Race (PDF)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Upload 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormData(prev => ({ ...prev, noticeOfRaceFile: file }));
                        setUploadWarning(null); // Clear any previous warnings
                        setError(null); // Clear any previous errors
                      }
                    }}
                    className="hidden"
                    id="notice-of-race-upload"
                  />
                  <label
                    htmlFor="notice-of-race-upload"
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                        : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50'}
                    `}
                  >
                    {formData.noticeOfRaceFile ? formData.noticeOfRaceFile.name : 'Choose file'}
                  </label>
                </div>
              </div>
              {formData.noticeOfRaceUrl && (
                <a 
                  href={formData.noticeOfRaceUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-colors
                    ${darkMode 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'}
                  `}
                >
                  View
                </a>
              )}
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Upload the Notice of Race document or provide a URL below (optional)
            </p>
            
            {/* URL input as alternative */}
            <div className="mt-2">
              <input
                type="url"
                value={formData.noticeOfRaceUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, noticeOfRaceUrl: e.target.value }))}
                className={`
                  w-full px-4 py-2 rounded-lg transition-colors text-sm
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
                placeholder="Or enter direct URL to Notice of Race"
              />
            </div>
          </div>

          {/* Sailing Instructions Document Upload */}
          <div>
            <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Sailing Instructions (PDF)
            </label>
            <div className="flex items-center gap-3">
              <div className="flex-1">
                <div className="relative">
                  <Upload 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setFormData(prev => ({ ...prev, sailingInstructionsFile: file }));
                        setUploadWarning(null); // Clear any previous warnings
                        setError(null); // Clear any previous errors
                      }
                    }}
                    className="hidden"
                    id="sailing-instructions-upload"
                  />
                  <label
                    htmlFor="sailing-instructions-upload"
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors cursor-pointer flex items-center
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200 hover:bg-slate-600' 
                        : 'bg-white text-slate-900 border border-slate-200 hover:bg-slate-50'}
                    `}
                  >
                    {formData.sailingInstructionsFile ? formData.sailingInstructionsFile.name : 'Choose file'}
                  </label>
                </div>
              </div>
              {formData.sailingInstructionsUrl && (
                <a 
                  href={formData.sailingInstructionsUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-colors
                    ${darkMode 
                      ? 'bg-blue-600 text-white hover:bg-blue-700' 
                      : 'bg-blue-600 text-white hover:bg-blue-700'}
                  `}
                >
                  View
                </a>
              )}
            </div>
            <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              Upload the Sailing Instructions document or provide a URL below (optional)
            </p>
            
            {/* URL input as alternative */}
            <div className="mt-2">
              <input
                type="url"
                value={formData.sailingInstructionsUrl}
                onChange={(e) => setFormData(prev => ({ ...prev, sailingInstructionsUrl: e.target.value }))}
                className={`
                  w-full px-4 py-2 rounded-lg transition-colors text-sm
                  ${darkMode 
                    ? 'bg-slate-700 text-slate-200' 
                    : 'bg-white text-slate-900 border border-slate-200'}
                `}
                placeholder="Or enter direct URL to Sailing Instructions"
              />
            </div>
          </div>

          {/* Payment Options */}
          <div className="pt-2 border-t border-slate-700/50">
            <button
              type="button"
              onClick={() => setFormData(prev => ({ ...prev, isPaid: !prev.isPaid }))}
              className={`
                relative p-4 rounded-lg border transition-all text-left w-full
                ${formData.isPaid 
                  ? 'bg-blue-600/20 border-blue-500 ring-2 ring-blue-500 ring-opacity-50' 
                  : darkMode 
                    ? 'bg-slate-700/50 border-slate-600 hover:bg-slate-700' 
                    : 'bg-white border-slate-200 hover:bg-slate-50'}
              `}
            >
              <div className="flex items-center gap-3 mb-2">
                <div className={`
                  p-2 rounded-lg
                  ${formData.isPaid 
                    ? 'bg-blue-600 text-white' 
                    : darkMode 
                      ? 'bg-slate-600 text-slate-300' 
                      : 'bg-slate-100 text-slate-700'}
                `}>
                  <DollarSign size={20} />
                </div>
                <div>
                  <h3 className={`text-base font-medium ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                    Paid Event
                  </h3>
                </div>
              </div>
              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                Collect entry fees for this event
              </p>
              <div className="absolute top-3 right-3">
                <div className={`
                  w-5 h-5 rounded-full border-2 flex items-center justify-center
                  ${formData.isPaid 
                    ? 'border-blue-500 bg-blue-500' 
                    : 'border-slate-400'}
                `}>
                  {formData.isPaid && (
                    <div className="w-2 h-2 rounded-full bg-white"></div>
                  )}
                </div>
              </div>
            </button>

            {formData.isPaid && (
              <div className="mt-3">
                <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                  Entry Fee *
                </label>
                <div className="relative">
                  <DollarSign 
                    size={18} 
                    className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                  />
                  <input
                    type="number"
                    required={formData.isPaid}
                    value={formData.entryFee}
                    onChange={(e) => setFormData(prev => ({ ...prev, entryFee: e.target.value }))}
                    min="0"
                    step="0.01"
                    className={`
                      w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                      ${darkMode 
                        ? 'bg-slate-700 text-slate-200' 
                        : 'bg-white text-slate-900 border border-slate-200'}
                    `}
                    placeholder="0.00"
                  />
                </div>
                <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                  Payment will be collected on race day
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className={`
              px-4 py-2 rounded-lg font-medium transition-colors
              ${darkMode
                ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
            `}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={uploading}
            className={`
              px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors
              ${uploading ? 'opacity-70 cursor-not-allowed' : ''}
            `}
          >
            {uploading ? 'Uploading...' : (editingEvent ? 'Update Event' : 'Create Event')}
          </button>
        </div>
      </form>
    </div>
  );
};