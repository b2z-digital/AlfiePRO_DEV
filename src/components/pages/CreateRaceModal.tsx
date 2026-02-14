import React, { useState, useEffect, useRef } from 'react';
import { Trophy, Calendar, Building, Sailboat, Plus, Trash2, X, FileText, CalendarRange, Upload, DollarSign, Users, Globe, Clock, Map, ChevronDown, Wand2, Download, Edit, Radio, Video, Info, Link2 } from 'lucide-react';
import { RaceType, BoatType } from '../../types';
import { RaceEvent, RaceSeries } from '../../types/race';
import { storeRaceEvent, storeRaceSeries } from '../../utils/raceStorage';
import { createTask } from '../../utils/taskStorage';
import { addPublicEvent, updatePublicEvent, checkEventDateClashes, ClashingEvent } from '../../utils/publicEventStorage';
import { EventClashWarningModal } from '../events/EventClashWarningModal';
import { getStoredClubs } from '../../utils/clubStorage';
import { getStoredVenues } from '../../utils/venueStorage';
import { getClubBoatClasses } from '../../utils/boatClassStorage';
import { Club } from '../../types/club';
import { Venue } from '../../types/venue';
import { BoatClass } from '../../types/boatClass';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import { DocumentGenerationWizard } from '../documents/DocumentGenerationWizard';
import { ScheduleDocumentModal } from './ScheduleDocumentModal';

interface CreateRaceModalProps {
  type: 'quick' | 'series';
  darkMode: boolean;
  onClose: () => void;
  onSuccess: () => void;
  editingEvent?: RaceEvent;
  editingSeries?: RaceSeries;
}

export const CreateRaceModal: React.FC<CreateRaceModalProps> = ({
  type,
  darkMode,
  onClose,
  onSuccess,
  editingEvent,
  editingSeries
}) => {
  const { currentClub, currentOrganization, user } = useAuth();
  const { addNotification } = useNotifications();
  const isEditing = !!(editingEvent || editingSeries);
  const raceClassOptions = [
    { value: 'DF65', label: 'Dragon Force 65', keywords: ['dragon force 65', 'df65', 'dragonflite'] },
    { value: 'DF95', label: 'Dragon Force 95', keywords: ['dragon force 95', 'df95', 'dragonflite 95'] },
    { value: '10R', label: '10 Rater', keywords: ['10 rater', 'ten rater', '10r'] },
    { value: 'IOM', label: 'IOM', keywords: ['iom', 'international one metre'] },
    { value: 'Marblehead', label: 'Marblehead', keywords: ['marblehead'] },
    { value: 'A Class', label: 'A Class', keywords: ['a class'] },
    { value: 'RC Laser', label: 'RC Laser', keywords: ['rc laser'] },
  ];

  const findBoatClassForOption = (opt: typeof raceClassOptions[number]): BoatClass | undefined => {
    return boatClasses.find(bc => {
      const dbName = bc.name.toLowerCase();
      return opt.keywords.some(kw => dbName.includes(kw));
    });
  };
  const [formData, setFormData] = useState({
    eventName: '',
    clubName: '',
    clubId: '',
    raceDate: '',
    endDate: '', // For multi-day events
    raceVenue: '',
    venueId: '',
    venueName: '', // Store venue name for document generation
    raceClass: '' as BoatType,
    boatClassName: '', // Store full boat class name for document generation
    raceFormat: 'handicap' as RaceType,
    isMultiDay: false,
    numberOfDays: 1,
    isPaid: false,
    entryFee: '',
    // Extended payment settings
    acceptOnlineEntry: false,
    paymentByCard: false,
    lateEntryFee: '',
    entriesOpen: '',
    entriesClose: '',
    lateEntryUntil: '',
    // Results display settings
    showClubState: true,
    showDesign: false,
    showCategory: false,
    showCountry: false,
    showFlag: true,
    noticeOfRaceFile: null as File | null,
    noticeOfRaceUrl: '',
    sailingInstructionsFile: null as File | null,
    sailingInstructionsUrl: '',
    isInterclub: false,
    otherClubId: '',
    otherClubName: '',
    manualOtherClub: false,
    manualOtherClubName: '',
    eventLevel: 'club' as 'club' | 'state' | 'national',
    stateAssociationId: '',
    isRankingEvent: true, // Default to true for ranking events
    enableLiveTracking: false, // Live fleet board and skipper tracking
    enableLiveStream: false, // YouTube livestreaming
    // Series specific fields
    seriesName: '',
    rounds: [] as {
      name: string;
      date: string;
      venue: string;
      cancelled?: boolean;
      cancellationReason?: string;
      // Preserve existing round data for edits
      _originalData?: any;
    }[]
  });

  const [clubs, setClubs] = useState<Club[]>([]);
  const [venues, setVenues] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allClubs, setAllClubs] = useState<Club[]>([]);
  const [showDocumentWizard, setShowDocumentWizard] = useState(false);
  const [documentWizardType, setDocumentWizardType] = useState<'nor' | 'si'>('nor');
  const [availableTemplates, setAvailableTemplates] = useState<any[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [editingSubmissionId, setEditingSubmissionId] = useState<string | null>(null);
  const [stateAssociations, setStateAssociations] = useState<Array<{id: string; name: string; state: string; logo_url?: string}>>([]);
  const [showDocuments, setShowDocuments] = useState(false);
  const [currentStep, setCurrentStep] = useState<'details' | 'documents' | 'payments' | 'results'>('details');
  const [additionalDocuments, setAdditionalDocuments] = useState<Array<{name: string; file: File | null; url: string}>>([]);
  const roundRefs = useRef<{ [key: number]: HTMLInputElement | null }>({});
  const [showClubDropdown, setShowClubDropdown] = useState(false);
  const [showVenueDropdown, setShowVenueDropdown] = useState(false);
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [boatClasses, setBoatClasses] = useState<BoatClass[]>([]);
  const clubDropdownRef = useRef<HTMLDivElement>(null);
  const venueDropdownRef = useRef<HTMLDivElement>(null);
  const classDropdownRef = useRef<HTMLDivElement>(null);

  // Document scheduling state
  const [showScheduleDocumentModal, setShowScheduleDocumentModal] = useState(false);
  const [scheduleDocumentType, setScheduleDocumentType] = useState<'nor' | 'si'>('nor');
  const [scheduledDocuments, setScheduledDocuments] = useState<{
    nor?: { scheduled: boolean; contacts: string[]; dueDate?: string; memberIds?: string[]; existingTaskIds?: string[] };
    si?: { scheduled: boolean; contacts: string[]; dueDate?: string; memberIds?: string[]; existingTaskIds?: string[] };
  }>({});
  const [loadingScheduledDocs, setLoadingScheduledDocs] = useState(false);
  const [linkDocumentSchedules, setLinkDocumentSchedules] = useState(true);
  const [clashingEvents, setClashingEvents] = useState<ClashingEvent[]>([]);
  const [showClashWarning, setShowClashWarning] = useState(false);
  const [clashAcknowledged, setClashAcknowledged] = useState(false);

  useEffect(() => {
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
          .select('id, name, abbreviation, logo');

        if (allClubsError) {
          console.error('Error fetching all clubs:', allClubsError);
        } else {
          setAllClubs(allClubsData || []);
        }

        // Fetch all active state associations from the database
        const { data: stateAssocData, error: stateAssocError } = await supabase
          .from('state_associations')
          .select('id, name, state, logo_url')
          .eq('status', 'active')
          .order('name', { ascending: true });

        if (stateAssocError) {
          console.error('Error fetching state associations:', stateAssocError);
        } else {
          setStateAssociations(stateAssocData || []);
        }

        if (currentClub?.clubId) {
          try {
            const clubClasses = await getClubBoatClasses(currentClub.clubId);
            setBoatClasses(clubClasses);
          } catch (e) {
            console.error('Error fetching boat classes:', e);
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Set default club name, venue, race format, and event level on mount
  useEffect(() => {
    if (!isEditing && clubs.length > 0 && venues.length > 0) {
      // For associations, set event level based on organization type
      if (currentOrganization) {
        const eventLevel = currentOrganization.type === 'state' ? 'state' : currentOrganization.type === 'national' ? 'national' : 'club';
        setFormData(prev => ({
          ...prev,
          eventLevel,
          clubName: '', // Don't set club name for associations
          raceFormat: 'scratch' as RaceType
        }));
      } else if (currentClub) {
        // For clubs, set club name and default venue
        const defaultVenue = venues.find(v => v.club_id === currentClub.clubId && v.isDefault);
        setFormData(prev => ({
          ...prev,
          clubName: currentClub.club?.name || currentClub.name || '',
          clubId: currentClub.clubId || '',
          raceVenue: defaultVenue?.name || prev.raceVenue,
          venueId: defaultVenue?.id || '',
          raceFormat: 'scratch' as RaceType,
          eventLevel: 'club'
        }));
      }
    }
  }, [currentClub, currentOrganization, isEditing, clubs.length, venues.length]);

  // Load document templates
  useEffect(() => {
    const loadTemplates = async () => {
      if (!currentClub?.clubId) return;

      try {
        const { data, error } = await supabase
          .from('document_templates')
          .select('*')
          .eq('club_id', currentClub.clubId)
          .eq('is_active', true)
          .not('linked_form_id', 'is', null);

        if (error) throw error;
        setAvailableTemplates(data || []);

        // Auto-select first NOR template if available
        const norTemplate = data?.find(t => t.document_type === 'nor');
        if (norTemplate) {
          setSelectedTemplate(norTemplate.id);
        }
      } catch (err) {
        console.error('Error loading templates:', err);
      }
    };

    loadTemplates();
  }, [currentClub?.clubId]);

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (clubDropdownRef.current && !clubDropdownRef.current.contains(event.target as Node)) {
        setShowClubDropdown(false);
      }
      if (venueDropdownRef.current && !venueDropdownRef.current.contains(event.target as Node)) {
        setShowVenueDropdown(false);
      }
      if (classDropdownRef.current && !classDropdownRef.current.contains(event.target as Node)) {
        setShowClassDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Populate form when editing a single event
  useEffect(() => {
    if (editingEvent && clubs.length > 0 && venues.length > 0) {
      // Find the club by clubName or clubId
      const club = clubs.find(c =>
        c.id === editingEvent.clubId ||
        c.name === editingEvent.clubName ||
        c.abbreviation === editingEvent.clubName
      );

      setFormData({
        eventName: editingEvent.eventName || '',
        clubName: club?.name || editingEvent.clubName || '',
        clubId: club?.id || editingEvent.clubId || '',
        raceDate: editingEvent.date || '',
        endDate: editingEvent.endDate || '',
        raceVenue: editingEvent.venue || '',
        venueId: '',
        venueName: editingEvent.venue || '',
        raceClass: editingEvent.raceClass || ('' as BoatType),
        boatClassName: '',
        raceFormat: editingEvent.raceFormat || ('scratch' as RaceType),
        isMultiDay: editingEvent.multiDay || false,
        numberOfDays: editingEvent.numberOfDays || 1,
        isPaid: editingEvent.isPaid || false,
        entryFee: editingEvent.entryFee?.toString() || '',
        acceptOnlineEntry: (editingEvent as any).acceptOnlineEntry || false,
        paymentByCard: (editingEvent as any).paymentByCard || false,
        lateEntryFee: (editingEvent as any).lateEntryFee?.toString() || '',
        entriesOpen: (editingEvent as any).entriesOpen || '',
        entriesClose: (editingEvent as any).entriesClose || '',
        lateEntryUntil: (editingEvent as any).lateEntryUntil || '',
        showClubState: editingEvent.showClubState ?? false,
        showDesign: editingEvent.showDesign ?? false,
        showCategory: editingEvent.showCategory ?? false,
        showCountry: editingEvent.showCountry ?? true,
        showFlag: editingEvent.showFlag ?? true,
        noticeOfRaceFile: null,
        noticeOfRaceUrl: editingEvent.noticeOfRaceUrl || '',
        sailingInstructionsFile: null,
        sailingInstructionsUrl: editingEvent.sailingInstructionsUrl || '',
        isInterclub: editingEvent.isInterclub || false,
        otherClubId: editingEvent.otherClubId || '',
        otherClubName: editingEvent.otherClubName || '',
        manualOtherClub: !!(editingEvent.otherClubName && !editingEvent.otherClubId),
        manualOtherClubName: editingEvent.otherClubName || '',
        eventLevel: editingEvent.eventLevel || 'club',
        stateAssociationId: '',
        isRankingEvent: (editingEvent as any).isRankingEvent ?? true,
        enableLiveTracking: editingEvent.enableLiveTracking || false,
        enableLiveStream: editingEvent.enableLiveStream || false,
        seriesName: '',
        rounds: []
      });

      const loadScheduledDocuments = async () => {
        setLoadingScheduledDocs(true);
        try {
          const eventName = editingEvent.eventName || '';
          const clubId = editingEvent.clubId || currentClub?.clubId;

          const baseQuery = () => {
            let q = supabase
              .from('club_tasks')
              .select('id, title, due_date, assignee_id, status')
              .neq('status', 'completed');
            if (clubId) {
              q = q.eq('club_id', clubId);
            }
            return q;
          };

          const [norResult, siResult] = await Promise.all([
            baseQuery().ilike('title', `%Notice of Race%${eventName}%`),
            baseQuery().ilike('title', `%Sailing Instructions%${eventName}%`)
          ]);

          const schedules: any = {};

          if (!norResult.error && norResult.data && norResult.data.length > 0) {
            const norTasks = norResult.data;
            schedules.nor = {
              scheduled: true,
              contacts: norTasks.map(t => t.assignee_id).filter(Boolean),
              dueDate: norTasks[0].due_date?.substring(0, 10),
              memberIds: norTasks.map(t => t.assignee_id).filter(Boolean),
              existingTaskIds: norTasks.map(t => t.id)
            };
          }

          if (!siResult.error && siResult.data && siResult.data.length > 0) {
            const siTasks = siResult.data;
            schedules.si = {
              scheduled: true,
              contacts: siTasks.map(t => t.assignee_id).filter(Boolean),
              dueDate: siTasks[0].due_date?.substring(0, 10),
              memberIds: siTasks.map(t => t.assignee_id).filter(Boolean),
              existingTaskIds: siTasks.map(t => t.id)
            };
          }

          if (Object.keys(schedules).length > 0) {
            setScheduledDocuments(schedules);
          }
        } catch (err) {
          console.error('Error loading scheduled documents:', err);
        } finally {
          setLoadingScheduledDocs(false);
        }
      };

      loadScheduledDocuments();
    }
  }, [editingEvent, clubs, venues]);

  // Populate form when editing a series
  useEffect(() => {
    if (editingSeries && clubs.length > 0) {
      // Find the club by clubName or clubId
      const club = clubs.find(c =>
        c.id === editingSeries.clubId ||
        c.name === editingSeries.clubName ||
        c.abbreviation === editingSeries.clubName
      );

      setFormData({
        eventName: '',
        clubName: club?.name || editingSeries.clubName,
        clubId: club?.id || editingSeries.clubId || '',
        raceDate: '',
        endDate: '',
        raceVenue: '',
        venueId: '',
        venueName: '',
        raceClass: editingSeries.raceClass,
        boatClassName: '',
        raceFormat: editingSeries.raceFormat,
        isMultiDay: false,
        numberOfDays: 1,
        isPaid: editingSeries.isPaid || false,
        entryFee: editingSeries.entryFee?.toString() || '',
        acceptOnlineEntry: (editingSeries as any).acceptOnlineEntry || false,
        paymentByCard: (editingSeries as any).paymentByCard || false,
        lateEntryFee: (editingSeries as any).lateEntryFee?.toString() || '',
        entriesOpen: (editingSeries as any).entriesOpen || '',
        entriesClose: (editingSeries as any).entriesClose || '',
        lateEntryUntil: (editingSeries as any).lateEntryUntil || '',
        showClubState: (editingSeries as any).showClubState ?? false,
        showDesign: (editingSeries as any).showDesign ?? false,
        showCategory: (editingSeries as any).showCategory ?? false,
        showCountry: (editingSeries as any).showCountry ?? true,
        showFlag: (editingSeries as any).showFlag ?? true,
        noticeOfRaceFile: null,
        noticeOfRaceUrl: editingSeries.noticeOfRaceUrl || '',
        sailingInstructionsFile: null,
        sailingInstructionsUrl: editingSeries.sailingInstructionsUrl || '',
        isInterclub: false,
        otherClubId: '',
        otherClubName: '',
        manualOtherClub: false,
        manualOtherClubName: '',
        eventLevel: 'club',
        stateAssociationId: '',
        isRankingEvent: (editingSeries as any).isRankingEvent ?? true,
        enableLiveTracking: editingSeries.enableLiveTracking || false,
        enableLiveStream: editingSeries.enableLiveStream || false,
        seriesName: editingSeries.seriesName,
        rounds: editingSeries.rounds.map(round => ({
          name: round.name,
          date: round.date,
          venue: round.venue,
          cancelled: round.cancelled,
          cancellationReason: round.cancellationReason,
          // Store original round data to preserve when saving
          _originalData: round
        }))
      });
    }
  }, [editingSeries, clubs]);

  const handleAddRound = () => {
    const newIndex = formData.rounds.length;
    const roundNumber = newIndex + 1;

    // Get default venue for the club
    const selectedClub = clubs.find(c => c.name === formData.clubName);
    const defaultVenue = venues.find(v => v.club_id === selectedClub?.id && v.isDefault);
    const defaultVenueName = defaultVenue?.name || '';

    setFormData(prev => ({
      ...prev,
      rounds: [...prev.rounds, { name: `Round ${roundNumber}`, date: '', venue: defaultVenueName }]
    }));

    // Focus the date input of the new round
    setTimeout(() => {
      const dateInput = document.querySelector(`input[data-round-index="${newIndex}"][data-field="date"]`) as HTMLInputElement;
      if (dateInput) {
        dateInput.focus();
        dateInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 100);
  };

  const handleRemoveRound = (index: number) => {
    const roundToRemove = formData.rounds[index];

    // Check if the round has been completed and has scores
    if (roundToRemove._originalData?.completed ||
        (roundToRemove._originalData?.lastCompletedRace && roundToRemove._originalData.lastCompletedRace > 0)) {
      const confirmed = window.confirm(
        `Warning: "${roundToRemove.name}" has been completed with scores assigned.\n\n` +
        `Deleting this round will permanently remove all race results and scores.\n\n` +
        `This action cannot be undone.\n\nAre you sure you want to proceed?`
      );

      if (!confirmed) {
        return;
      }
    }

    setFormData(prev => ({
      ...prev,
      rounds: prev.rounds.filter((_, i) => i !== index)
    }));
  };

  const handleRoundChange = (index: number, field: keyof typeof formData.rounds[0], value: string | boolean) => {
    setFormData(prev => {
      const newRounds = [...prev.rounds];
      if (field === 'cancelled') {
        newRounds[index] = { 
          ...newRounds[index], 
          [field]: value,
          cancellationReason: value ? newRounds[index].cancellationReason || '' : undefined
        };
      } else {
        newRounds[index] = { ...newRounds[index], [field]: value };
      }
      return { ...prev, rounds: newRounds };
    });
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

      // Create a unique filename
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}-${Date.now()}.${fileExt}`;
      const filePath = `event-documents/${fileName}`;

      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from('event-media')
        .upload(filePath, file);

      if (error) throw error;

      // Get the public URL
      const { data: { publicUrl } } = supabase.storage
        .from('event-media')
        .getPublicUrl(filePath);

      return publicUrl;
    } catch (error) {
      console.error(`Error uploading ${type} file:`, error);
      setError(`Failed to upload ${type === 'nor' ? 'Notice of Race' : 'Sailing Instructions'} file`);
      return '';
    } finally {
      setUploading(false);
    }
  };

  const handleScheduleDocument = (type: 'nor' | 'si') => {
    // Validate that event date is set
    if (!formData.raceDate) {
      addNotification('error', 'Please set an event date first');
      return;
    }

    setScheduleDocumentType(type);
    setShowScheduleDocumentModal(true);
  };

  const handleDocumentScheduled = (documentType: 'nor' | 'si', contacts: string[], contactEmails: string[], dueDate?: string, memberIds?: string[]) => {
    if (linkDocumentSchedules) {
      setScheduledDocuments(prev => ({
        ...prev,
        nor: {
          scheduled: true,
          contacts: contacts,
          contactEmails: contactEmails,
          dueDate: dueDate,
          memberIds: memberIds,
          existingTaskIds: prev.nor?.existingTaskIds
        },
        si: {
          scheduled: true,
          contacts: contacts,
          contactEmails: contactEmails,
          dueDate: dueDate,
          memberIds: memberIds,
          existingTaskIds: prev.si?.existingTaskIds
        }
      }));

      addNotification(
        'success',
        'NOR & SI document reminders successfully scheduled'
      );
    } else {
      setScheduledDocuments(prev => ({
        ...prev,
        [documentType]: {
          scheduled: true,
          contacts: contacts,
          contactEmails: contactEmails,
          dueDate: dueDate,
          memberIds: memberIds,
          existingTaskIds: prev[documentType]?.existingTaskIds
        }
      }));

      addNotification(
        'success',
        `${documentType === 'nor' ? 'NOR' : 'SI'} document reminder successfully scheduled`
      );
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!clashAcknowledged && !isEditing) {
      const eventDate = type === 'quick' ? formData.raceDate : (formData.rounds[0]?.date || '');
      let eventEndDate: string | null = null;

      if (type === 'quick' && formData.isMultiDay && formData.endDate) {
        eventEndDate = formData.endDate;
      } else if (type === 'series' && formData.rounds.length > 0) {
        const allDates = formData.rounds.map(r => r.date).filter(Boolean).sort();
        eventEndDate = allDates[allDates.length - 1] || null;
      }

      if (eventDate) {
        const clashes = await checkEventDateClashes(eventDate, eventEndDate, undefined, formData.clubId || currentClub?.clubId);
        if (clashes.length > 0) {
          setClashingEvents(clashes);
          setShowClashWarning(true);
          return;
        }
      }
    }

    console.log('🚀 Form submission started');
    console.log('📋 Form data:', formData);

    try {
      // Upload files if selected
      let noticeOfRaceUrl = formData.noticeOfRaceUrl;
      let sailingInstructionsUrl = formData.sailingInstructionsUrl;

      console.log('📄 Document URLs:', { noticeOfRaceUrl, sailingInstructionsUrl });

      // Upload Notice of Race file if provided
      if (formData.noticeOfRaceFile) {
        console.log('📤 Uploading NOR file...');
        noticeOfRaceUrl = await handleFileUpload(formData.noticeOfRaceFile, 'nor');
        console.log('✅ NOR uploaded:', noticeOfRaceUrl);
      }

      // Upload Sailing Instructions file if provided
      if (formData.sailingInstructionsFile) {
        console.log('📤 Uploading SI file...');
        sailingInstructionsUrl = await handleFileUpload(formData.sailingInstructionsFile, 'si');
        console.log('✅ SI uploaded:', sailingInstructionsUrl);
      }

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

      if (type === 'quick') {
        // Check if this is a state/national event
        if (formData.eventLevel === 'state' || formData.eventLevel === 'national') {
          // Save to public_events table with approval workflow
          const selectedClub = clubs.find(c => c.name === formData.clubName);

          if (!selectedClub?.id) {
            throw new Error('Please select a club');
          }

          // Fetch the club's state association ID
          const { data: clubData, error: clubError } = await supabase
            .from('clubs')
            .select('state_association_id')
            .eq('id', selectedClub.id)
            .single();

          if (clubError) {
            console.error('Error fetching club data:', clubError);
            throw new Error('Failed to fetch club information');
          }

          let nationalAssociationId = null;

          // If we have a state association, fetch its national association
          if (clubData?.state_association_id) {
            const { data: stateData, error: stateError } = await supabase
              .from('state_associations')
              .select('national_association_id')
              .eq('id', clubData.state_association_id)
              .single();

            if (!stateError && stateData) {
              nationalAssociationId = stateData.national_association_id;
            }
          }

          // For state events, use the selected state association or the club's default
          const stateAssociationId = formData.stateAssociationId || clubData?.state_association_id;

          // Validate that we have the required association ID
          if (formData.eventLevel === 'state' && !stateAssociationId) {
            throw new Error('Please select a state association for this state event.');
          }

          if (formData.eventLevel === 'national' && !nationalAssociationId) {
            throw new Error('Your club is not associated with a national association. Please contact your administrator.');
          }

          // Determine initial approval status based on event type
          // National events and ranking state events need state approval first
          // BUT: Only set approval status for NEW events, not when editing existing ones
          const publicEventIdToUpdate = editingEvent?.public_event_id || editingEvent?.publicEventId;
          const isEditingExistingEvent = !!publicEventIdToUpdate;

          const needsStateApproval = formData.eventLevel === 'national' ||
                                     (formData.eventLevel === 'state' && formData.isRankingEvent);
          const initialApprovalStatus = needsStateApproval ? 'pending_state' : 'pending';

          const publicEventData: any = {
            event_name: formData.eventName,
            date: formData.raceDate,
            end_date: formData.isMultiDay ? formData.endDate : undefined,
            venue: formData.raceVenue,
            venue_id: formData.venueId || undefined,
            race_class: formData.raceClass,
            race_format: formData.raceFormat,
            multi_day: formData.isMultiDay,
            number_of_days: formData.isMultiDay ? formData.numberOfDays : 1,
            is_paid: formData.isPaid,
            entry_fee: formData.isPaid ? parseFloat(formData.entryFee) : undefined,
            accept_online_entry: formData.acceptOnlineEntry,
            payment_by_card: formData.paymentByCard,
            late_entry_fee: formData.lateEntryFee ? parseFloat(formData.lateEntryFee) : undefined,
            entries_open: formData.entriesOpen || undefined,
            entries_close: formData.entriesClose || undefined,
            late_entry_until: formData.lateEntryUntil || undefined,
            show_club_state: formData.showClubState,
            show_design: formData.showDesign,
            show_category: formData.showCategory,
            show_country: formData.showCountry,
            show_flag: formData.showFlag,
            notice_of_race_url: noticeOfRaceUrl || undefined,
            sailing_instructions_url: sailingInstructionsUrl || undefined,
            is_interclub: formData.isInterclub,
            other_club_name: formData.isInterclub ? otherClubName : undefined,
            club_id: selectedClub.id,
            media: [],
            event_level: formData.eventLevel,
            created_by_type: 'club' as const,
            created_by_id: selectedClub.id,
            created_by_user_id: user?.id || null,
            is_ranking_event: formData.isRankingEvent,
            // Note: enable_live_tracking is stored in quick_races, not public_events
            // Set the appropriate association IDs based on event level
            state_association_id: stateAssociationId || null,
            // National association ID is needed for:
            // 1. National events
            // 2. State ranking events (they need national approval)
            national_association_id: (formData.eventLevel === 'national' ||
                                     (formData.eventLevel === 'state' && formData.isRankingEvent))
                                     ? nationalAssociationId : null
          };

          // Only set approval status for NEW events, not when editing
          if (!isEditingExistingEvent) {
            publicEventData.approval_status = initialApprovalStatus as const;
          }

          // Add document scheduling information if documents are scheduled
          if (scheduledDocuments.nor?.scheduled || scheduledDocuments.si?.scheduled) {
            publicEventData.document_status = 'scheduled';
            const contacts = scheduledDocuments.nor?.contacts || scheduledDocuments.si?.contacts || [];
            publicEventData.document_contacts = contacts;
          }

          let result;
          // If editing an existing public event (rejected, pending, or approved), update it
          if (publicEventIdToUpdate) {
            result = await updatePublicEvent(publicEventIdToUpdate, publicEventData);
          } else {
            result = await addPublicEvent(publicEventData);
          }

          if (!result) {
            throw new Error('Failed to create event. Check the browser console for details.');
          }

          // If we're converting a club event to state/national (editingEvent exists but has no public_event_id),
          // link the quick_races record to this public_event to prevent duplicates
          if (editingEvent && !publicEventIdToUpdate && result?.id) {
            try {
              console.log('[CreateRaceModal] Linking quick_race', editingEvent.id, 'to public_event', result.id);
              await supabase
                .from('quick_races')
                .update({ public_event_id: result.id })
                .eq('id', editingEvent.id);
              console.log('[CreateRaceModal] Successfully linked quick_race to public_event');
            } catch (linkError) {
              console.error('[CreateRaceModal] Error linking quick_race:', linkError);
              // Don't throw - the event was created successfully, linking is just for preventing duplicates
            }
          }
        } else {
          // Regular club event - save to quick_races table
          const event: RaceEvent = {
            id: editingEvent?.id || crypto.randomUUID(),
            eventName: formData.eventName,
            clubName: formData.clubName,
            date: formData.raceDate,
            venue: formData.raceVenue,
            raceClass: formData.raceClass,
            raceFormat: formData.raceFormat,
            raceResults: editingEvent?.raceResults || [],
            skippers: editingEvent?.skippers || [],
            lastCompletedRace: editingEvent?.lastCompletedRace || 0,
            hasDeterminedInitialHcaps: editingEvent?.hasDeterminedInitialHcaps || false,
            isManualHandicaps: editingEvent?.isManualHandicaps || false,
            completed: editingEvent?.completed || false,
            // Multi-day event properties
            multiDay: formData.isMultiDay,
            numberOfDays: formData.isMultiDay ? formData.numberOfDays : 1,
            endDate: formData.isMultiDay ? formData.endDate : undefined,
            currentDay: editingEvent?.currentDay || 1,
            // Payment properties
            isPaid: formData.isPaid,
            entryFee: formData.isPaid ? parseFloat(formData.entryFee) : undefined,
            acceptOnlineEntry: formData.acceptOnlineEntry,
            paymentByCard: formData.paymentByCard,
            lateEntryFee: formData.lateEntryFee ? parseFloat(formData.lateEntryFee) : undefined,
            entriesOpen: formData.entriesOpen || undefined,
            entriesClose: formData.entriesClose || undefined,
            lateEntryUntil: formData.lateEntryUntil || undefined,
            // Results display properties
            showClubState: formData.showClubState,
            showDesign: formData.showDesign,
            showCategory: formData.showCategory,
            showCountry: formData.showCountry,
            showFlag: formData.showFlag,
            // Document URLs
            noticeOfRaceUrl,
            sailingInstructionsUrl,
            // Interclub properties
            isInterclub: formData.isInterclub,
            otherClubId: formData.isInterclub ? otherClubId : undefined,
            otherClubName: formData.isInterclub ? otherClubName : undefined,
            // Event level
            eventLevel: formData.eventLevel,
            // Live tracking
            enableLiveTracking: formData.enableLiveTracking,
            // Live streaming
            enableLiveStream: formData.enableLiveStream,
            // Default scoring system (RRS - Appendix A)
            dropRules: editingEvent?.dropRules || [4, 8, 16, 24, 32, 40],
            // Preserve other existing properties
            media: editingEvent?.media,
            livestreamUrl: editingEvent?.livestreamUrl,
            clubId: editingEvent?.clubId,
            isSeriesEvent: editingEvent?.isSeriesEvent,
            seriesId: editingEvent?.seriesId,
            dayResults: editingEvent?.dayResults,
            heatManagement: editingEvent?.heatManagement,
            numRaces: editingEvent?.numRaces,
            attendees: editingEvent?.attendees
          } as any;

          await storeRaceEvent(event);
        }
      } else {
        // Create series
        if (!formData.seriesName) {
          throw new Error('Series name is required');
        }
        
        if (formData.rounds.length === 0) {
          throw new Error('At least one round is required');
        }

        const selectedClub = clubs.find(c => c.name === formData.clubName);
        if (!selectedClub) {
          throw new Error('Club not found');
        }

        const series: RaceSeries = {
          id: editingSeries?.id || crypto.randomUUID(),
          clubName: selectedClub.abbreviation || selectedClub.name,
          seriesName: formData.seriesName,
          raceClass: formData.raceClass,
          raceFormat: formData.raceFormat,
          rounds: formData.rounds.map(round => {
            // If we have original data, preserve it and only update what changed
            if (round._originalData) {
              return {
                ...round._originalData,
                name: round.name,
                venue: round.venue,
                date: round.date,
                cancelled: round.cancelled || false,
                cancellationReason: round.cancellationReason
              };
            }
            // New round - use defaults
            return {
              name: round.name,
              venue: round.venue,
              date: round.date,
              cancelled: round.cancelled || false,
              cancellationReason: round.cancellationReason,
              results: [],
              completed: false,
              lastCompletedRace: 0,
              hasDeterminedInitialHcaps: false,
              isManualHandicaps: false
            };
          }),
          skippers: editingSeries?.skippers || [],
          results: editingSeries?.results || [],
          completed: editingSeries?.completed || false,
          lastCompletedRace: editingSeries?.lastCompletedRace || 0,
          hasDeterminedInitialHcaps: editingSeries?.hasDeterminedInitialHcaps || false,
          isManualHandicaps: editingSeries?.isManualHandicaps || false,
          media: editingSeries?.media || [],
          livestreamUrl: editingSeries?.livestreamUrl,
          // Payment properties
          isPaid: formData.isPaid,
          entryFee: formData.isPaid ? parseFloat(formData.entryFee) : undefined,
          acceptOnlineEntry: formData.acceptOnlineEntry,
          paymentByCard: formData.paymentByCard,
          lateEntryFee: formData.lateEntryFee ? parseFloat(formData.lateEntryFee) : undefined,
          entriesOpen: formData.entriesOpen || undefined,
          entriesClose: formData.entriesClose || undefined,
          lateEntryUntil: formData.lateEntryUntil || undefined,
          // Results display properties
          showClubState: formData.showClubState,
          showDesign: formData.showDesign,
          showCategory: formData.showCategory,
          showCountry: formData.showCountry,
          showFlag: formData.showFlag,
          // Document URLs
          noticeOfRaceUrl,
          sailingInstructionsUrl,
          // Live tracking
          enableLiveTracking: formData.enableLiveTracking,
          // Live streaming
          enableLiveStream: formData.enableLiveStream,
          // Default scoring system (RRS - Appendix A)
          dropRules: editingSeries?.dropRules || [4, 8, 16, 24, 32, 40],
          // Club ID for database storage
          clubId: selectedClub.id
        } as any;

        await storeRaceSeries(series);
      }

      console.log('✅ Event created successfully');

      // Show notification if event requires approval
      if ((formData.eventLevel === 'state' || formData.eventLevel === 'national') && !editingEvent) {
        const isRankingStateEvent = formData.eventLevel === 'state' && formData.isRankingEvent;
        const isNationalEvent = formData.eventLevel === 'national';

        let message = '';
        if (isNationalEvent || isRankingStateEvent) {
          message = `Your event "${formData.eventName}" has been submitted to your State Association for approval. Once approved by the state, it will be forwarded to the National Association for final approval.`;
        } else {
          message = `Your event "${formData.eventName}" has been submitted to your State Association for approval. You'll be notified once it's reviewed.`;
        }

        addNotification(
          'success',
          'Event Submitted for Approval',
          message
        );
      }

      if (currentClub?.clubId && user?.id) {
        const eventDateFormatted = new Date(formData.raceDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
        const docsToCreate: { type: 'nor' | 'si'; label: string }[] = [];
        if (scheduledDocuments.nor?.scheduled) docsToCreate.push({ type: 'nor', label: 'Notice of Race (NOR)' });
        if (scheduledDocuments.si?.scheduled) docsToCreate.push({ type: 'si', label: 'Sailing Instructions (SI)' });

        for (const docInfo of docsToCreate) {
          const doc = scheduledDocuments[docInfo.type];
          if (!doc?.memberIds?.length) continue;

          if (doc.existingTaskIds && doc.existingTaskIds.length > 0) {
            try {
              await supabase
                .from('club_tasks')
                .update({
                  due_date: doc.dueDate || null,
                  reminder_date: doc.dueDate || null
                })
                .in('id', doc.existingTaskIds);
            } catch (taskErr) {
              console.error(`Error updating ${docInfo.type} tasks:`, taskErr);
            }
          } else {
            for (const memberId of doc.memberIds) {
              try {
                await createTask(currentClub.clubId, user.id, {
                  title: `Prepare ${docInfo.label} - ${formData.eventName}`,
                  description: `Prepare and finalise the ${docInfo.label} for the event "${formData.eventName}" scheduled on ${eventDateFormatted}.`,
                  due_date: doc.dueDate || null,
                  priority: 'high',
                  assignee_id: memberId,
                  send_reminder: true,
                  reminder_type: 'both',
                  reminder_date: doc.dueDate || null,
                  followers: [user.id]
                });
              } catch (taskErr) {
                console.error(`Error creating ${docInfo.type} task for member ${memberId}:`, taskErr);
              }
            }
          }
        }
      }

      onSuccess();
    } catch (err) {
      console.error('❌ Error creating event:', err);
      console.error('Error stack:', err instanceof Error ? err.stack : 'No stack trace');
      setError(err instanceof Error ? err.message : 'An error occurred');
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
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
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-fadeIn">
      <div className={`
        w-full max-w-5xl rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] border animate-slideUp
        ${darkMode ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'}
      `}>
        {/* Modern Gradient Header */}
        <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-blue-800 p-6 flex items-center justify-between relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-blue-500/20 to-transparent"></div>
          <div className="flex items-center gap-3 relative z-10">
            <div className="p-2.5 bg-white/10 rounded-xl backdrop-blur-sm ring-1 ring-white/20 transform hover:scale-105 transition-transform">
              {type === 'quick' ? (
                <Trophy className="text-white drop-shadow-lg" size={24} />
              ) : (
                <Calendar className="text-white drop-shadow-lg" size={24} />
              )}
            </div>
            <div>
              <h2 className="text-2xl font-bold text-white drop-shadow-lg">
                {isEditing ? 'Edit' : 'Create'} {type === 'quick' ? 'Event' : 'Series'}
              </h2>
              <p className="text-blue-100 text-sm mt-0.5">Fill in the details below</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white rounded-xl p-2.5 hover:bg-white/10 transition-all hover:rotate-90 transform duration-300 relative z-10"
          >
            <X size={20} />
          </button>
        </div>

        {/* Step Navigation */}
        <div className={`border-b ${darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'}`}>
          <div className="flex px-8 items-center">
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                // Can always go back to details
                setCurrentStep('details');
              }}
              className={`
                px-6 py-4 font-medium text-sm transition-all relative flex items-center gap-2
                ${currentStep === 'details'
                  ? `${darkMode ? 'text-blue-400' : 'text-blue-600'}`
                  : `${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'}`
                }
              `}
            >
              <span className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                ${currentStep === 'details'
                  ? 'bg-blue-600 text-white'
                  : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                }
              `}>
                1
              </span>
              <span>Details</span>
              {currentStep === 'details' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${darkMode ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
              )}
            </button>
            <div className={`h-px w-8 ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                // Can only click if we're past this step
                const stepOrder = ['details', 'documents', 'payments', 'results'];
                const currentIndex = stepOrder.indexOf(currentStep);
                const targetIndex = stepOrder.indexOf('documents');
                if (currentIndex > targetIndex) {
                  setCurrentStep('documents');
                }
              }}
              disabled={currentStep === 'details'}
              className={`
                px-6 py-4 font-medium text-sm transition-all relative flex items-center gap-2
                ${currentStep === 'documents'
                  ? `${darkMode ? 'text-blue-400' : 'text-blue-600'}`
                  : currentStep === 'details'
                    ? `${darkMode ? 'text-slate-600' : 'text-slate-400'} cursor-not-allowed`
                    : `${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'} cursor-pointer`
                }
              `}
            >
              <span className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                ${currentStep === 'documents'
                  ? 'bg-blue-600 text-white'
                  : (formData.noticeOfRaceFile || formData.noticeOfRaceUrl || formData.sailingInstructionsFile || formData.sailingInstructionsUrl)
                    ? 'bg-green-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                }
              `}>
                {(formData.noticeOfRaceFile || formData.noticeOfRaceUrl || formData.sailingInstructionsFile || formData.sailingInstructionsUrl) && currentStep !== 'documents' ? '✓' : '2'}
              </span>
              <span>Documents</span>
              {currentStep === 'documents' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${darkMode ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
              )}
            </button>
            <div className={`h-px w-8 ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                // Can only click if we're past this step
                const stepOrder = ['details', 'documents', 'payments', 'results'];
                const currentIndex = stepOrder.indexOf(currentStep);
                const targetIndex = stepOrder.indexOf('payments');
                if (currentIndex > targetIndex) {
                  setCurrentStep('payments');
                }
              }}
              disabled={currentStep === 'details' || currentStep === 'documents'}
              className={`
                px-6 py-4 font-medium text-sm transition-all relative flex items-center gap-2
                ${currentStep === 'payments'
                  ? `${darkMode ? 'text-blue-400' : 'text-blue-600'}`
                  : (currentStep === 'details' || currentStep === 'documents')
                    ? `${darkMode ? 'text-slate-600' : 'text-slate-400'} cursor-not-allowed`
                    : `${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-600 hover:text-slate-900'} cursor-pointer`
                }
              `}
            >
              <span className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                ${currentStep === 'payments'
                  ? 'bg-blue-600 text-white'
                  : formData.isPaid
                    ? 'bg-green-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                }
              `}>
                {formData.isPaid && currentStep !== 'payments' ? '✓' : '3'}
              </span>
              <span>Payments</span>
              {currentStep === 'payments' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${darkMode ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
              )}
            </button>
            <div className={`h-px w-8 ${darkMode ? 'bg-slate-700' : 'bg-slate-300'}`}></div>
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                // Can only click if we're past this step (i.e., never since it's the last step)
              }}
              disabled={currentStep !== 'results'}
              className={`
                px-6 py-4 font-medium text-sm transition-all relative flex items-center gap-2
                ${currentStep === 'results'
                  ? `${darkMode ? 'text-blue-400' : 'text-blue-600'}`
                  : `${darkMode ? 'text-slate-600' : 'text-slate-400'} cursor-not-allowed`
                }
              `}
            >
              <span className={`
                flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold
                ${currentStep === 'results'
                  ? 'bg-blue-600 text-white'
                  : (formData.showClubState || formData.showDesign || formData.showCategory || formData.showCountry || formData.showFlag)
                    ? 'bg-green-500 text-white'
                    : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-slate-200 text-slate-600'
                }
              `}>
                {(formData.showClubState || formData.showDesign || formData.showCategory || formData.showCountry || formData.showFlag) && currentStep !== 'results' ? '✓' : '4'}
              </span>
              <span>Results Display</span>
              {currentStep === 'results' && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${darkMode ? 'bg-blue-400' : 'bg-blue-600'}`}></div>
              )}
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          <form onSubmit={handleSubmit} className="p-8 space-y-6">
            {currentStep === 'details' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {type === 'quick' ? (
                <div className="lg:col-span-2">
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Event Name *
                  </label>
                  <div className="relative">
                    <FileText
                      size={20}
                      className={`absolute left-4 top-1/2 -translate-y-1/2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                    />
                    <input
                      type="text"
                      required
                      value={formData.eventName}
                      onChange={(e) => setFormData(prev => ({ ...prev, eventName: e.target.value }))}
                      className={`
                        w-full pl-12 pr-4 py-3.5 rounded-xl transition-all text-lg font-medium
                        focus:ring-2 focus:ring-emerald-500/50 focus:outline-none
                        ${darkMode
                          ? 'bg-slate-700/80 text-white border border-slate-600 focus:border-emerald-500'
                          : 'bg-white text-slate-900 border-2 border-slate-200 focus:border-emerald-500'}
                      `}
                      placeholder="Enter event name"
                    />
                  </div>
                </div>
              ) : (
                <div className="lg:col-span-2">
                  <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                    Series Name *
                  </label>
                  <div className="relative">
                    <FileText
                      size={20}
                      className={`absolute left-4 top-1/2 -translate-y-1/2 ${darkMode ? 'text-emerald-400' : 'text-emerald-600'}`}
                    />
                    <input
                      type="text"
                      required
                      value={formData.seriesName}
                      onChange={(e) => setFormData(prev => ({ ...prev, seriesName: e.target.value }))}
                      className={`
                        w-full pl-12 pr-4 py-3.5 rounded-xl transition-all text-lg font-medium
                        focus:ring-2 focus:ring-emerald-500/50 focus:outline-none
                        ${darkMode
                          ? 'bg-slate-700/80 text-white border border-slate-600 focus:border-emerald-500'
                          : 'bg-white text-slate-900 border-2 border-slate-200 focus:border-emerald-500'}
                      `}
                      placeholder="Enter series name"
                    />
                  </div>
                </div>
              )}

              {/* Event Type Options - spans both columns */}
              <div className="lg:col-span-2 grid grid-cols-2 md:grid-cols-4 gap-3 animate-slideIn">
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, isInterclub: !prev.isInterclub }))}
                  className={`
                    group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                    ${formData.isInterclub
                      ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : darkMode
                        ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                  `}
                >
                  {formData.isInterclub && (
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/5 blur-xl"></div>
                  )}
                  <div className="flex items-center gap-3 mb-2 relative z-10">
                    <div className={`
                      p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                      ${formData.isInterclub
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                    `}>
                      <Globe size={20} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        Interclub Event
                      </h3>
                    </div>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                    Event between two or more clubs
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => { setFormData(prev => ({
                    ...prev,
                    isMultiDay: !prev.isMultiDay,
                    endDate: !prev.isMultiDay ? calculateEndDate(prev.raceDate, prev.numberOfDays) : prev.raceDate
                  })); setClashAcknowledged(false); }}
                  className={`
                    group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                    ${formData.isMultiDay
                      ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : darkMode
                        ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                  `}
                >
                  {formData.isMultiDay && (
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/5 blur-xl"></div>
                  )}
                  <div className="flex items-center gap-3 mb-2 relative z-10">
                    <div className={`
                      p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                      ${formData.isMultiDay
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                    `}>
                      <Clock size={20} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        Multi-day Event
                      </h3>
                    </div>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                    Event spanning multiple days
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, enableLiveTracking: !prev.enableLiveTracking }))}
                  className={`
                    group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                    ${formData.enableLiveTracking
                      ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500 shadow-lg shadow-emerald-500/20'
                      : darkMode
                        ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                  `}
                >
                  {formData.enableLiveTracking && (
                    <div className="absolute inset-0 rounded-xl bg-emerald-500/5 blur-xl"></div>
                  )}
                  <div className="flex items-center gap-3 mb-2 relative z-10">
                    <div className={`
                      p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                      ${formData.enableLiveTracking
                        ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                    `}>
                      <Radio size={20} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        Live Tracking
                      </h3>
                    </div>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                    Enable fleet board & skipper tracking
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, enableLiveStream: !prev.enableLiveStream }))}
                  className={`
                    group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                    ${formData.enableLiveStream
                      ? 'bg-gradient-to-br from-red-500/20 to-red-600/10 border-red-500 shadow-lg shadow-red-500/20'
                      : darkMode
                        ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                  `}
                >
                  {formData.enableLiveStream && (
                    <div className="absolute inset-0 rounded-xl bg-red-500/5 blur-xl"></div>
                  )}
                  <div className="flex items-center gap-3 mb-2 relative z-10">
                    <div className={`
                      p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                      ${formData.enableLiveStream
                        ? 'bg-red-600 text-white shadow-lg shadow-red-600/30'
                        : darkMode
                          ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                          : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                    `}>
                      <Video size={20} />
                    </div>
                    <div>
                      <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                        Live Stream
                      </h3>
                    </div>
                  </div>
                  <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                    Broadcast race to YouTube live
                  </p>
                </button>
              </div>

              {/* Event Level Selector - spans both columns */}
              {!currentOrganization && (
                <div className="lg:col-span-2">
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Event Level *
                  </label>
                  <div className="grid grid-cols-3 gap-3">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, eventLevel: 'club' }))}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors text-sm
                        ${formData.eventLevel === 'club'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : darkMode
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      Club Event
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, eventLevel: 'state' }))}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors text-sm
                        ${formData.eventLevel === 'state'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : darkMode
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      State Event
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, eventLevel: 'national' }))}
                      className={`
                        px-4 py-2 rounded-lg font-medium transition-colors text-sm
                        ${formData.eventLevel === 'national'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
                          : darkMode
                            ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                        }
                      `}
                    >
                      National Event
                    </button>
                  </div>
                </div>
              )}

              {/* State Association Selector (shown for State and National Events from Club context) */}
              {!currentOrganization && (formData.eventLevel === 'state' || formData.eventLevel === 'national') && (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                  <div className="md:col-span-9">
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      State Association *
                    </label>
                    <div className="relative">
                      <select
                        required
                        value={formData.stateAssociationId}
                        onChange={(e) => setFormData(prev => ({ ...prev, stateAssociationId: e.target.value }))}
                        className={`
                          w-full pl-12 pr-10 py-2 rounded-lg appearance-none cursor-pointer
                          ${darkMode ? 'bg-slate-700 text-white' : 'bg-white text-slate-900'}
                          border ${darkMode ? 'border-slate-600' : 'border-slate-300'}
                          focus:outline-none focus:ring-2 focus:ring-emerald-500
                        `}
                      >
                        <option value="">Select state association</option>
                        {stateAssociations.map((assoc) => (
                          <option key={assoc.id} value={assoc.id}>
                            {assoc.name} ({assoc.state})
                          </option>
                        ))}
                      </select>
                      {formData.stateAssociationId && stateAssociations.find(a => a.id === formData.stateAssociationId)?.logo_url && (
                        <img
                          src={stateAssociations.find(a => a.id === formData.stateAssociationId)?.logo_url}
                          alt=""
                          className="absolute left-3 top-1/2 transform -translate-y-1/2 w-6 h-6 rounded-full object-cover pointer-events-none"
                        />
                      )}
                      <Globe
                        size={18}
                        className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                          formData.stateAssociationId && stateAssociations.find(a => a.id === formData.stateAssociationId)?.logo_url
                            ? 'hidden'
                            : darkMode ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      />
                      <ChevronDown className="absolute right-3 top-1/2 transform -translate-y-1/2 pointer-events-none text-slate-400" size={20} />
                    </div>
                  </div>
                  <div className="md:col-span-3">
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      &nbsp;
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg cursor-pointer ${darkMode ? 'bg-slate-700 hover:bg-slate-600' : 'bg-slate-100 hover:bg-slate-200'} transition-colors`}>
                      <input
                        type="checkbox"
                        checked={formData.isRankingEvent}
                        onChange={(e) => setFormData(prev => ({ ...prev, isRankingEvent: e.target.checked }))}
                        className="w-4 h-4 rounded text-emerald-500 focus:ring-2 focus:ring-emerald-500"
                      />
                      <span className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                        Ranking Event
                      </span>
                    </label>
                  </div>
                </div>
              )}

              {/* Club Name and Race Venue Row */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div ref={clubDropdownRef}>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    {formData.isInterclub ? 'Host Club *' : 'Club Name *'}
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => !currentOrganization && setShowClubDropdown(!showClubDropdown)}
                      disabled={!!currentOrganization}
                      className={`
                        w-full pl-14 pr-10 py-2.5 rounded-lg transition-colors text-left
                        ${darkMode
                          ? 'bg-slate-700 text-slate-200'
                          : 'bg-white text-slate-900 border border-slate-200'}
                        ${currentOrganization ? 'opacity-50 cursor-not-allowed' : 'hover:border-blue-400'}
                      `}
                    >
                      {formData.clubName || `Select ${formData.isInterclub ? 'host club' : 'club'}`}
                    </button>
                    {formData.clubName && clubs.find(c => c.name === formData.clubName)?.logo ? (
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full overflow-hidden border-2 border-slate-600">
                        <img
                          src={clubs.find(c => c.name === formData.clubName)?.logo}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : (
                      <Building
                        size={18}
                        className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                      />
                    )}
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />

                    {/* Custom Dropdown */}
                    {showClubDropdown && (
                      <div className={`
                        absolute top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg shadow-xl z-50 border
                        ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}
                      `}>
                        {clubs.map(club => (
                          <button
                            key={club.id}
                            type="button"
                            onClick={() => {
                              setFormData(prev => ({ ...prev, clubName: club.name, clubId: club.id }));
                              setShowClubDropdown(false);
                            }}
                            className={`
                              w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-500/10 transition-colors
                              ${formData.clubName === club.name ? 'bg-blue-500/20' : ''}
                            `}
                          >
                            {club.logo ? (
                              <img src={club.logo} alt="" className="w-10 h-10 rounded-full object-cover flex-shrink-0 border-2 border-slate-600" />
                            ) : (
                              <div className="w-10 h-10 rounded-full bg-slate-600 flex items-center justify-center flex-shrink-0">
                                <Building size={20} className="text-slate-300" />
                              </div>
                            )}
                            <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {club.name}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {currentOrganization && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                      {currentOrganization.type === 'state' ? 'State' : 'National'} events don't require club selection
                    </p>
                  )}
                </div>

                {type === 'quick' && (
                  <div ref={venueDropdownRef}>
                    <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      Race Venue *
                    </label>
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => setShowVenueDropdown(!showVenueDropdown)}
                        className={`
                          w-full pl-14 pr-10 py-2.5 rounded-lg transition-colors text-left hover:border-blue-400
                          ${darkMode
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-white text-slate-900 border border-slate-200'}
                        `}
                      >
                        {formData.raceVenue || 'Select venue'}
                      </button>
                      {formData.raceVenue && venues.find(v => v.name === formData.raceVenue)?.image ? (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg overflow-hidden border-2 border-slate-600">
                          <img
                            src={venues.find(v => v.name === formData.raceVenue)?.image || ''}
                            alt=""
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ) : (
                        <Map
                          size={18}
                          className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}
                        />
                      )}
                      <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />

                      {/* Custom Dropdown */}
                      {showVenueDropdown && (
                        <div className={`
                          absolute top-full left-0 right-0 mt-1 max-h-60 overflow-auto rounded-lg shadow-xl z-50 border
                          ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}
                        `}>
                          {venues.map(venue => (
                            <button
                              key={venue.id}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  raceVenue: venue.name,
                                  venueId: venue.id,
                                  venueName: venue.name
                                }));
                                setShowVenueDropdown(false);
                              }}
                              className={`
                                w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-500/10 transition-colors
                                ${formData.raceVenue === venue.name ? 'bg-blue-500/20' : ''}
                              `}
                            >
                              {venue.image ? (
                                <img src={venue.image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border-2 border-slate-600" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center flex-shrink-0">
                                  <Map size={20} className="text-slate-300" />
                                </div>
                              )}
                              <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {venue.name}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
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

              {/* Date Fields Row - All 3 fields on one row */}
              {type === 'quick' && (
                <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-3 gap-4">
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
                        onChange={(e) => { setFormData(prev => ({ ...prev, raceDate: e.target.value })); setClashAcknowledged(false); }}
                        className={`
                          w-full pl-10 pr-4 py-2 rounded-lg transition-colors
                          ${darkMode
                            ? 'bg-slate-700 text-slate-200'
                            : 'bg-white text-slate-900 border border-slate-200'}
                        `}
                        style={{
                          colorScheme: darkMode ? 'dark' : 'light'
                        }}
                      />
                    </div>
                  </div>

                  {formData.isMultiDay && (
                    <>
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
                            onChange={(e) => { setFormData(prev => ({
                              ...prev,
                              numberOfDays: parseInt(e.target.value),
                              endDate: calculateEndDate(prev.raceDate, parseInt(e.target.value))
                            })); setClashAcknowledged(false); }}
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
                    </>
                  )}
                </div>
              )}

              {/* Race Class and Race Format Row */}
              <div className="lg:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div ref={classDropdownRef}>
                  <label className={`block text-sm font-medium mb-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                    Race Class *
                  </label>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setShowClassDropdown(!showClassDropdown)}
                      className={`
                        w-full pl-14 pr-10 py-2.5 rounded-lg transition-colors text-left hover:border-blue-400
                        ${darkMode
                          ? 'bg-slate-700 text-slate-200'
                          : 'bg-white text-slate-900 border border-slate-200'}
                      `}
                    >
                      {formData.raceClass
                        ? (raceClassOptions.find(o => o.value === formData.raceClass)?.label || formData.raceClass)
                        : 'Select race class'}
                    </button>
                    {(() => {
                      const opt = formData.raceClass ? raceClassOptions.find(o => o.value === formData.raceClass) : null;
                      const bc = opt ? findBoatClassForOption(opt) : null;
                      return bc?.class_image ? (
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg overflow-hidden border-2 border-slate-600">
                          <img src={bc.class_image} alt="" className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <Sailboat size={18} className={`absolute left-3 top-1/2 -translate-y-1/2 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`} />
                      );
                    })()}
                    <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400" />

                    {showClassDropdown && (
                      <div className={`
                        absolute bottom-full left-0 right-0 mb-1 max-h-60 overflow-auto rounded-lg shadow-xl z-50 border
                        ${darkMode ? 'bg-slate-700 border-slate-600' : 'bg-white border-slate-200'}
                      `}>
                        {raceClassOptions.map(opt => {
                          const bc = findBoatClassForOption(opt);
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => {
                                setFormData(prev => ({
                                  ...prev,
                                  raceClass: opt.value as BoatType,
                                  boatClassName: opt.label
                                }));
                                setShowClassDropdown(false);
                              }}
                              className={`
                                w-full flex items-center gap-3 px-3 py-2.5 hover:bg-blue-500/10 transition-colors
                                ${formData.raceClass === opt.value ? 'bg-blue-500/20' : ''}
                              `}
                            >
                              {bc?.class_image ? (
                                <img src={bc.class_image} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0 border-2 border-slate-600" />
                              ) : (
                                <div className="w-10 h-10 rounded-lg bg-slate-600 flex items-center justify-center flex-shrink-0">
                                  <Sailboat size={20} className="text-slate-300" />
                                </div>
                              )}
                              <span className={`text-sm font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                {opt.label}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
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
                        p-2.5 rounded-lg text-sm font-medium transition-colors
                        ${formData.raceFormat === 'handicap'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
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
                        p-2.5 rounded-lg text-sm font-medium transition-colors
                        ${formData.raceFormat === 'scratch'
                          ? 'bg-emerald-600 text-white hover:bg-emerald-700'
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
              </div>
            </div>
            )}

            {/* Step 2: Documents & Payment */}
            {currentStep === 'documents' && (
              <div className="space-y-8">
                {/* Race Documents Section */}
                <div className="space-y-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-blue-500/10 rounded-lg">
                      <FileText className="text-blue-600" size={20} />
                    </div>
                    <div>
                      <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                        Race Documents
                      </h3>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Upload or generate official race documents
                      </p>
                    </div>
                  </div>

                  {/* State/National Event Warning */}
                  {(formData.eventLevel === 'state' || formData.eventLevel === 'national') && (
                    <div className={`p-4 rounded-lg border ${darkMode ? 'bg-orange-900/20 border-orange-700/30' : 'bg-orange-50 border-orange-200'}`}>
                      <div className="flex items-start gap-3">
                        <Info className={darkMode ? 'text-orange-400' : 'text-orange-600'} size={20} />
                        <div>
                          <p className={`text-sm font-medium ${darkMode ? 'text-orange-400' : 'text-orange-700'}`}>
                            Documents Required for {formData.eventLevel === 'state' ? 'State' : 'National'} Event
                          </p>
                          <p className={`text-xs mt-1 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                            State and National events must have race documents (NOR/SI) uploaded or scheduled for creation at least 2 months before the event date.
                          </p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Link Document Schedules Option */}
                  <div className={`p-4 rounded-lg border ${darkMode ? 'bg-blue-900/20 border-blue-700/30' : 'bg-blue-50 border-blue-200'}`}>
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={linkDocumentSchedules}
                        onChange={(e) => setLinkDocumentSchedules(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-600 text-blue-600 focus:ring-blue-600 focus:ring-offset-slate-800"
                      />
                      <div className="flex-1">
                        <p className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                          Link NOR and SI Schedules
                        </p>
                        <p className={`text-xs mt-0.5 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                          {linkDocumentSchedules
                            ? 'Scheduling one document will automatically schedule both with the same settings'
                            : 'Schedule NOR and SI separately with different settings'}
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Notice of Race */}
                  <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className={`font-medium mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Notice of Race (NOR)
                    </h4>

                    {formData.noticeOfRaceUrl ? (
                      /* Show document with action buttons when document exists */
                      <div className="space-y-3">
                        <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700/50 border-slate-600' : 'bg-white border-slate-200'}`}>
                          <div className="flex items-center justify-between gap-4">
                            <div className="flex items-center gap-3 flex-1">
                              <FileText className={darkMode ? 'text-blue-400' : 'text-blue-600'} size={24} />
                              <div>
                                <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                  Notice of Race
                                </p>
                                <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                  PDF Document
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  try {
                                    console.log('Edit NOR clicked');
                                    const norTemplate = availableTemplates.find(t => t.document_type === 'nor' && t.linked_form_id);
                                    console.log('NOR Template:', norTemplate);
                                    if (!norTemplate) {
                                      addNotification('error', 'No NOR template found.');
                                      return;
                                    }

                                    // Find the form submission ID by looking up the generated document
                                    console.log('Searching for generated docs with:', { clubId: currentClub?.clubId, templateId: norTemplate.id });
                                    const { data: genDocs, error: genError } = await supabase
                                      .from('generated_documents')
                                      .select('form_submission_id')
                                      .eq('club_id', currentClub?.clubId)
                                      .eq('document_type', 'nor')
                                      .eq('template_id', norTemplate.id)
                                      .order('generated_at', { ascending: false })
                                      .limit(1);

                                    if (genError) {
                                      console.error('Error fetching generated docs:', genError);
                                    }
                                    console.log('Generated docs found:', genDocs);

                                    const submissionId = genDocs && genDocs.length > 0 ? genDocs[0].form_submission_id : null;
                                    console.log('Submission ID:', submissionId);

                                    setSelectedTemplate(norTemplate.id);
                                    setEditingSubmissionId(submissionId);
                                    setDocumentWizardType('nor');
                                    setShowDocumentWizard(true);
                                  } catch (err) {
                                    console.error('Error in Edit NOR handler:', err);
                                    addNotification('error', 'Failed to load document for editing');
                                  }
                                }}
                                className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                title="Edit NOR"
                              >
                                <Edit size={16} />
                              </button>
                              <a
                                href={formData.noticeOfRaceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                                title="View and Print NOR"
                                onClick={(e) => {
                                  e.stopPropagation();
                                }}
                              >
                                <Download size={16} />
                              </a>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData(prev => ({ ...prev, noticeOfRaceUrl: '', noticeOfRaceFile: null }));
                                }}
                                className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                                title="Delete NOR"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : scheduledDocuments.nor?.scheduled ? (
                      /* Show scheduled status */
                      <div className={`p-4 rounded-lg border ${darkMode ? 'bg-green-900/20 border-green-700/30' : 'bg-green-50 border-green-200'}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <Calendar className={darkMode ? 'text-green-400' : 'text-green-600'} size={24} />
                            <div>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                Document Creation Scheduled
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                {scheduledDocuments.nor?.existingTaskIds ? 'Task assigned' : 'Task will be created'} for {scheduledDocuments.nor?.memberIds?.length || scheduledDocuments.nor?.contacts?.length || 0} member(s)
                                {scheduledDocuments.nor?.dueDate && (
                                  <> - Due: {new Date(scheduledDocuments.nor.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleScheduleDocument('nor')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                              title="Edit Schedule"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setScheduledDocuments(prev => {
                                  const newState = { ...prev };
                                  delete newState.nor;
                                  return newState;
                                });
                              }}
                              className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                              title="Remove Schedule"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : loadingScheduledDocs && editingEvent ? (
                      <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading scheduled documents...</p>
                        </div>
                      </div>
                    ) : (
                      /* Show upload/generate/schedule options when no document exists */
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* Upload Option */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Upload PDF
                          </label>
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setFormData(prev => ({ ...prev, noticeOfRaceFile: file }));
                              }
                            }}
                            className="hidden"
                            id="notice-of-race-upload"
                          />
                          <label
                            htmlFor="notice-of-race-upload"
                            className={`
                              flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-all
                              ${formData.noticeOfRaceFile
                                ? darkMode ? 'border-green-500/50 bg-green-500/10' : 'border-green-500 bg-green-50'
                                : darkMode ? 'border-slate-600 hover:border-slate-500 bg-slate-700/30' : 'border-slate-300 hover:border-slate-400 bg-white'
                              }
                            `}
                          >
                            <Upload size={18} className={formData.noticeOfRaceFile ? 'text-green-600' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
                            <span className={`text-sm font-medium ${formData.noticeOfRaceFile ? 'text-green-600' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                              {formData.noticeOfRaceFile ? formData.noticeOfRaceFile.name : 'Choose PDF'}
                            </span>
                          </label>
                        </div>

                        {/* Generate Option */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Generate from Template
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              console.log('Generate NOR clicked');
                              console.log('Available templates:', availableTemplates);
                              if (availableTemplates.length === 0) {
                                addNotification('error', 'No document templates found. Create a template in Settings > Race Documents first.');
                                return;
                              }
                              const norTemplate = availableTemplates.find(t => t.document_type === 'nor' && t.linked_form_id);
                              console.log('Found NOR template:', norTemplate);
                              if (!norTemplate) {
                                addNotification('error', 'No NOR template found. Link a form to your NOR template in Settings > Race Documents.');
                                return;
                              }
                              setSelectedTemplate(norTemplate.id);
                              setDocumentWizardType('nor');
                              setShowDocumentWizard(true);
                            }}
                            className={`
                              w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all
                              ${darkMode
                                ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-2 border-blue-600/30'
                                : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-2 border-blue-200'}
                            `}
                          >
                            <Wand2 size={18} />
                            <span className="text-sm">Generate NOR</span>
                          </button>
                        </div>

                        {/* Schedule Option */}
                        <div>
                          <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            Schedule Document Creation
                          </label>
                          <button
                            type="button"
                            onClick={() => handleScheduleDocument('nor')}
                            className={`
                              w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all
                              ${darkMode
                                ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border-2 border-purple-600/30'
                                : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-2 border-purple-200'}
                            `}
                          >
                            <Calendar size={18} />
                            {linkDocumentSchedules && <Link2 size={14} className="opacity-70" />}
                            <span className="text-sm">Schedule{linkDocumentSchedules ? ' (Linked)' : ''}</span>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Sailing Instructions */}
                  <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className={`font-medium mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Sailing Instructions (SI)
                    </h4>

                    {scheduledDocuments.si?.scheduled ? (
                      /* Show scheduled status */
                      <div className={`p-4 rounded-lg border ${darkMode ? 'bg-green-900/20 border-green-700/30' : 'bg-green-50 border-green-200'}`}>
                        <div className="flex items-center justify-between gap-4">
                          <div className="flex items-center gap-3 flex-1">
                            <Calendar className={darkMode ? 'text-green-400' : 'text-green-600'} size={24} />
                            <div>
                              <p className={`font-medium ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                                Document Creation Scheduled
                              </p>
                              <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
                                {scheduledDocuments.si?.existingTaskIds ? 'Task assigned' : 'Task will be created'} for {scheduledDocuments.si?.memberIds?.length || scheduledDocuments.si?.contacts?.length || 0} member(s)
                                {scheduledDocuments.si?.dueDate && (
                                  <> - Due: {new Date(scheduledDocuments.si.dueDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</>
                                )}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => handleScheduleDocument('si')}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${darkMode ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                              title="Edit Schedule"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setScheduledDocuments(prev => {
                                  const newState = { ...prev };
                                  delete newState.si;
                                  return newState;
                                });
                              }}
                              className={`p-2 rounded-lg transition-colors ${darkMode ? 'bg-red-600/20 text-red-400 hover:bg-red-600/30' : 'bg-red-50 text-red-600 hover:bg-red-100'}`}
                              title="Remove Schedule"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : loadingScheduledDocs && editingEvent ? (
                      <div className={`p-4 rounded-lg border ${darkMode ? 'bg-slate-700/30 border-slate-600' : 'bg-slate-100 border-slate-200'}`}>
                        <div className="flex items-center gap-3">
                          <div className="animate-spin rounded-full h-5 w-5 border-2 border-blue-500 border-t-transparent" />
                          <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>Loading scheduled documents...</p>
                        </div>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      {/* Upload Option */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Upload PDF
                        </label>
                        <input
                          type="file"
                          accept=".pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setFormData(prev => ({ ...prev, sailingInstructionsFile: file }));
                            }
                          }}
                          className="hidden"
                          id="sailing-instructions-upload"
                        />
                        <label
                          htmlFor="sailing-instructions-upload"
                          className={`
                            flex items-center justify-center gap-2 px-4 py-3 rounded-lg border-2 border-dashed cursor-pointer transition-all
                            ${formData.sailingInstructionsFile
                              ? darkMode ? 'border-green-500/50 bg-green-500/10' : 'border-green-500 bg-green-50'
                              : darkMode ? 'border-slate-600 hover:border-slate-500 bg-slate-700/30' : 'border-slate-300 hover:border-slate-400 bg-white'
                            }
                          `}
                        >
                          <Upload size={18} className={formData.sailingInstructionsFile ? 'text-green-600' : darkMode ? 'text-slate-400' : 'text-slate-500'} />
                          <span className={`text-sm font-medium ${formData.sailingInstructionsFile ? 'text-green-600' : darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            {formData.sailingInstructionsFile ? formData.sailingInstructionsFile.name : 'Choose PDF'}
                          </span>
                        </label>
                      </div>

                      {/* Generate Option */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Generate from Template
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            if (availableTemplates.length === 0) {
                              addNotification('error', 'No document templates found. Create a template in Settings > Race Documents first.');
                              return;
                            }
                            const siTemplate = availableTemplates.find(t => t.document_type === 'si' && t.linked_form_id);
                            if (!siTemplate) {
                              addNotification('error', 'No SI template found. Link a form to your SI template in Settings > Race Documents.');
                              return;
                            }
                            setSelectedTemplate(siTemplate.id);
                            setDocumentWizardType('si');
                            setShowDocumentWizard(true);
                          }}
                          className={`
                            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all
                            ${darkMode
                              ? 'bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 border-2 border-blue-600/30'
                              : 'bg-blue-50 text-blue-700 hover:bg-blue-100 border-2 border-blue-200'}
                          `}
                        >
                          <Wand2 size={18} />
                          <span className="text-sm">Generate SI</span>
                        </button>
                      </div>

                      {/* Schedule Option */}
                      <div>
                        <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          Schedule Document Creation
                        </label>
                        <button
                          type="button"
                          onClick={() => handleScheduleDocument('si')}
                          className={`
                            w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg font-medium transition-all
                            ${darkMode
                              ? 'bg-purple-600/20 text-purple-400 hover:bg-purple-600/30 border-2 border-purple-600/30'
                              : 'bg-purple-50 text-purple-700 hover:bg-purple-100 border-2 border-purple-200'}
                          `}
                        >
                          <Calendar size={18} />
                          {linkDocumentSchedules && <Link2 size={14} className="opacity-70" />}
                          <span className="text-sm">Schedule{linkDocumentSchedules ? ' (Linked)' : ''}</span>
                        </button>
                      </div>
                    </div>
                    )}
                    {formData.sailingInstructionsUrl && (
                      <a
                        href={formData.sailingInstructionsUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                      >
                        <FileText size={16} />
                        View Generated SI
                      </a>
                    )}
                  </div>

                  {/* Additional Documents */}
                  <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                    <h4 className={`font-medium mb-4 ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Additional Documents
                    </h4>
                    <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Add any other race documents (e.g., Entry Form, Course Maps, Safety Plan)
                    </p>
                    <div className="space-y-3">
                      {additionalDocuments.map((doc, index) => (
                        <div key={index} className="flex items-center gap-3">
                          <input
                            type="text"
                            value={doc.name}
                            onChange={(e) => {
                              const newDocs = [...additionalDocuments];
                              newDocs[index].name = e.target.value;
                              setAdditionalDocuments(newDocs);
                            }}
                            placeholder="Document name"
                            className={`flex-1 px-3 py-2 rounded-lg ${darkMode ? 'bg-slate-700 text-slate-200' : 'bg-white text-slate-900 border border-slate-200'}`}
                          />
                          <input
                            type="file"
                            accept=".pdf"
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                const newDocs = [...additionalDocuments];
                                newDocs[index].file = file;
                                setAdditionalDocuments(newDocs);
                              }
                            }}
                            className="hidden"
                            id={`additional-doc-${index}`}
                          />
                          <label
                            htmlFor={`additional-doc-${index}`}
                            className={`px-4 py-2 rounded-lg cursor-pointer transition-colors text-sm font-medium ${
                              doc.file
                                ? 'bg-green-500/20 text-green-600'
                                : darkMode ? 'bg-slate-700 text-slate-300 hover:bg-slate-600' : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                            }`}
                          >
                            {doc.file ? 'Uploaded' : 'Choose PDF'}
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setAdditionalDocuments(additionalDocuments.filter((_, i) => i !== index));
                            }}
                            className={`p-2 rounded-lg transition-colors ${darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-slate-200 text-slate-600'}`}
                          >
                            <Trash2 size={18} />
                          </button>
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => setAdditionalDocuments([...additionalDocuments, { name: '', file: null, url: '' }])}
                        className={`w-full px-4 py-3 rounded-lg border-2 border-dashed transition-colors ${
                          darkMode ? 'border-slate-600 hover:border-slate-500 text-slate-400 hover:text-slate-300' : 'border-slate-300 hover:border-slate-400 text-slate-600 hover:text-slate-700'
                        }`}
                      >
                        <Plus size={18} className="mx-auto" />
                        <span className="text-sm">Add Document</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 3: Payments */}
            {currentStep === 'payments' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-emerald-500/10 rounded-lg">
                    <DollarSign className="text-emerald-600" size={20} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Payment Settings
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Configure entry fee collection
                    </p>
                  </div>
                </div>

                <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="grid grid-cols-2 gap-4">
                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, isPaid: false }))}
                      className={`
                        group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                        ${!formData.isPaid
                          ? 'bg-gradient-to-br from-blue-500/20 to-blue-600/10 border-blue-500 shadow-lg shadow-blue-500/20'
                          : darkMode
                            ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                      `}
                    >
                      {!formData.isPaid && (
                        <div className="absolute inset-0 rounded-xl bg-blue-500/5 blur-xl"></div>
                      )}
                      <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={`
                          p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                          ${!formData.isPaid
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                            : darkMode
                              ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                              : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                        `}>
                          <Users size={20} />
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                            Free Event
                          </h3>
                        </div>
                      </div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                        No entry fees required
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, isPaid: true }))}
                      className={`
                        group relative p-5 rounded-xl border-2 transition-all duration-300 text-left transform hover:scale-[1.02]
                        ${formData.isPaid
                          ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border-emerald-500 shadow-lg shadow-emerald-500/20'
                          : darkMode
                            ? 'bg-slate-700/30 border-slate-600 hover:border-slate-500 hover:bg-slate-700/50'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:shadow-md'}
                      `}
                    >
                      {formData.isPaid && (
                        <div className="absolute inset-0 rounded-xl bg-emerald-500/5 blur-xl"></div>
                      )}
                      <div className="flex items-center gap-3 mb-2 relative z-10">
                        <div className={`
                          p-2.5 rounded-xl transition-all duration-300 transform group-hover:scale-110
                          ${formData.isPaid
                            ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/30'
                            : darkMode
                              ? 'bg-slate-600 text-slate-300 group-hover:bg-slate-500'
                              : 'bg-slate-100 text-slate-700 group-hover:bg-slate-200'}
                        `}>
                          <DollarSign size={20} />
                        </div>
                        <div>
                          <h3 className={`text-base font-semibold ${darkMode ? 'text-white' : 'text-slate-800'}`}>
                            Paid Event
                          </h3>
                        </div>
                      </div>
                      <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'} relative z-10`}>
                        Collect entry fees from participants
                      </p>
                    </button>
                  </div>

                  {formData.isPaid && (
                    <div className="mt-4 space-y-6">
                      {/* Toggles Row */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Accept Online Entry Toggle */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            ACCEPT ONLINE ENTRY
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, acceptOnlineEntry: !prev.acceptOnlineEntry }))}
                            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                              formData.acceptOnlineEntry ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                formData.acceptOnlineEntry ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>

                        {/* Payment by C/Card Toggle */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            PAYMENT BY C/CARD
                          </label>
                          <button
                            type="button"
                            onClick={() => setFormData(prev => ({ ...prev, paymentByCard: !prev.paymentByCard }))}
                            className={`relative inline-flex h-8 w-16 items-center rounded-full transition-colors ${
                              formData.paymentByCard ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                            }`}
                          >
                            <span
                              className={`inline-block h-6 w-6 transform rounded-full bg-white transition-transform ${
                                formData.paymentByCard ? 'translate-x-9' : 'translate-x-1'
                              }`}
                            />
                          </button>
                        </div>
                      </div>

                      {/* Fee Amounts Row */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Entry Fee */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            ENTRY FEE
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={18}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                            />
                            <input
                              type="number"
                              required={formData.isPaid}
                              value={formData.entryFee}
                              onChange={(e) => setFormData(prev => ({ ...prev, entryFee: e.target.value }))}
                              min="0"
                              step="0.01"
                              className={`
                                w-full pl-10 pr-4 py-3 rounded-lg transition-colors
                                ${darkMode
                                  ? 'bg-slate-700 text-slate-200'
                                  : 'bg-white text-slate-900 border border-slate-200'}
                              `}
                              placeholder="0.00"
                            />
                          </div>
                        </div>

                        {/* Late Entry Fee */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            LATE ENTRY FEE
                          </label>
                          <div className="relative">
                            <DollarSign
                              size={18}
                              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
                            />
                            <input
                              type="number"
                              value={formData.lateEntryFee}
                              onChange={(e) => setFormData(prev => ({ ...prev, lateEntryFee: e.target.value }))}
                              min="0"
                              step="0.01"
                              className={`
                                w-full pl-10 pr-4 py-3 rounded-lg transition-colors
                                ${darkMode
                                  ? 'bg-slate-700 text-slate-200'
                                  : 'bg-white text-slate-900 border border-slate-200'}
                              `}
                              placeholder="0.00"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Date Fields Row 1 */}
                      <div className="grid grid-cols-2 gap-4">
                        {/* Entries Open */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            ENTRIES OPEN
                          </label>
                          <input
                            type="datetime-local"
                            value={formData.entriesOpen}
                            onChange={(e) => setFormData(prev => ({ ...prev, entriesOpen: e.target.value }))}
                            className={`
                              w-full px-4 py-3 rounded-lg transition-colors [color-scheme:light]
                              ${darkMode
                                ? 'bg-slate-700 text-slate-200'
                                : 'bg-white text-slate-900 border border-slate-200'}
                            `}
                          />
                        </div>

                        {/* Entries Close */}
                        <div>
                          <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                            ENTRIES CLOSE
                          </label>
                          <input
                            type="datetime-local"
                            value={formData.entriesClose}
                            onChange={(e) => setFormData(prev => ({ ...prev, entriesClose: e.target.value }))}
                            className={`
                              w-full px-4 py-3 rounded-lg transition-colors [color-scheme:light]
                              ${darkMode
                                ? 'bg-slate-700 text-slate-200'
                                : 'bg-white text-slate-900 border border-slate-200'}
                            `}
                          />
                        </div>
                      </div>

                      {/* Late Entry Until */}
                      <div>
                        <label className={`block text-sm font-semibold mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                          LATE ENTRY UNTIL
                        </label>
                        <input
                          type="datetime-local"
                          value={formData.lateEntryUntil}
                          onChange={(e) => setFormData(prev => ({ ...prev, lateEntryUntil: e.target.value }))}
                          className={`
                            w-full px-4 py-3 rounded-lg transition-colors [color-scheme:light]
                            ${darkMode
                              ? 'bg-slate-700 text-slate-200'
                              : 'bg-white text-slate-900 border border-slate-200'}
                          `}
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Step 3: Results Display */}
            {currentStep === 'results' && (
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-500/10 rounded-lg">
                    <Trophy className="text-purple-600" size={20} />
                  </div>
                  <div>
                    <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-900'}`}>
                      Results Display Options
                    </h3>
                    <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                      Configure which columns appear in results tables
                    </p>
                  </div>
                </div>

                <div className={`p-6 rounded-xl border ${darkMode ? 'bg-slate-800/30 border-slate-700' : 'bg-slate-50 border-slate-200'}`}>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Club/State Toggle */}
                    <div className={`p-5 rounded-lg border-2 transition-all flex flex-col items-center ${
                      formData.showClubState
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`block text-sm font-semibold mb-3 text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        CLUB/STATE
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, showClubState: !prev.showClubState }))}
                        className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                          formData.showClubState ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${
                            formData.showClubState ? 'translate-x-11' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <p className={`text-xs mt-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Show skipper's club and state
                      </p>
                    </div>

                    {/* Design Toggle */}
                    <div className={`p-5 rounded-lg border-2 transition-all flex flex-col items-center ${
                      formData.showDesign
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`block text-sm font-semibold mb-3 text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        DESIGN
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, showDesign: !prev.showDesign }))}
                        className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                          formData.showDesign ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${
                            formData.showDesign ? 'translate-x-11' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <p className={`text-xs mt-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Show hull design/model
                      </p>
                    </div>

                    {/* Category Toggle */}
                    <div className={`p-5 rounded-lg border-2 transition-all flex flex-col items-center ${
                      formData.showCategory
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`block text-sm font-semibold mb-3 text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        CATEGORY
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, showCategory: !prev.showCategory }))}
                        className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                          formData.showCategory ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${
                            formData.showCategory ? 'translate-x-11' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <p className={`text-xs mt-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Show competitor category
                      </p>
                    </div>

                    {/* Country Toggle */}
                    <div className={`p-5 rounded-lg border-2 transition-all flex flex-col items-center ${
                      formData.showCountry
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`block text-sm font-semibold mb-3 text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        COUNTRY
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, showCountry: !prev.showCountry }))}
                        className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                          formData.showCountry ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${
                            formData.showCountry ? 'translate-x-11' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <p className={`text-xs mt-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Show country name
                      </p>
                    </div>

                    {/* Show Flag Toggle */}
                    <div className={`p-5 rounded-lg border-2 transition-all flex flex-col items-center ${
                      formData.showFlag
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode ? 'border-slate-600 bg-slate-700/30' : 'border-slate-200 bg-white'
                    }`}>
                      <label className={`block text-sm font-semibold mb-3 text-center ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                        SHOW FLAG
                      </label>
                      <button
                        type="button"
                        onClick={() => setFormData(prev => ({ ...prev, showFlag: !prev.showFlag }))}
                        className={`relative inline-flex h-10 w-20 items-center rounded-full transition-colors ${
                          formData.showFlag ? 'bg-blue-600' : darkMode ? 'bg-slate-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-8 w-8 transform rounded-full bg-white transition-transform ${
                            formData.showFlag ? 'translate-x-11' : 'translate-x-1'
                          }`}
                        />
                      </button>
                      <p className={`text-xs mt-3 text-center ${darkMode ? 'text-slate-400' : 'text-slate-600'}`}>
                        Show national flag
                      </p>
                    </div>
                  </div>

                  <div className={`mt-6 p-4 rounded-lg ${darkMode ? 'bg-slate-700/50' : 'bg-blue-50'}`}>
                    <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                      <strong>Note:</strong> These settings will apply to all results tables for this event, including live tracking and published results.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {type === 'series' && currentStep === 'details' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className={`text-lg font-medium ${darkMode ? 'text-slate-200' : 'text-slate-800'}`}>
                    Rounds
                  </h3>
                  <button
                    type="button"
                    onClick={handleAddRound}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 font-medium transition-colors"
                  >
                    <Plus size={16} />
                    Add Round
                  </button>
                </div>

                {formData.rounds.length > 0 ? (
                  <div className={`rounded-lg border overflow-hidden ${darkMode ? 'border-slate-600' : 'border-slate-200'}`}>
                    {/* Table Header */}
                    <div className={`grid grid-cols-12 gap-3 px-4 py-3 border-b font-medium text-sm ${darkMode ? 'bg-slate-700/50 border-slate-600 text-slate-300' : 'bg-slate-50 border-slate-200 text-slate-700'}`}>
                      <div className="col-span-3">Round Name</div>
                      <div className="col-span-3">Date</div>
                      <div className="col-span-5">Venue</div>
                      <div className="col-span-1"></div>
                    </div>

                    {/* Table Body */}
                    <div className="max-h-[400px] overflow-y-auto">
                      {formData.rounds.map((round, index) => (
                        <div
                          key={index}
                          className={`grid grid-cols-12 gap-3 px-4 py-3 border-b items-center ${darkMode ? 'bg-slate-800/30 border-slate-700 hover:bg-slate-800/50' : 'bg-white border-slate-100 hover:bg-slate-50'} transition-colors`}
                        >
                          {/* Round Name */}
                          <div className="col-span-3">
                            <input
                              ref={(el) => roundRefs.current[index] = el}
                              type="text"
                              required
                              value={round.name}
                              onChange={(e) => handleRoundChange(index, 'name', e.target.value)}
                              className={`
                                w-full px-3 py-2 rounded-lg transition-colors text-sm
                                ${darkMode
                                  ? 'bg-slate-700 text-slate-200 border border-slate-600 focus:border-emerald-500'
                                  : 'bg-white text-slate-900 border border-slate-200 focus:border-emerald-500'}
                              `}
                              placeholder="Round 1"
                            />
                          </div>

                          {/* Date */}
                          <div className="col-span-3">
                            <input
                              type="date"
                              required
                              value={round.date}
                              onChange={(e) => handleRoundChange(index, 'date', e.target.value)}
                              data-round-index={index}
                              data-field="date"
                              className={`
                                w-full px-3 py-2 rounded-lg transition-colors text-sm
                                ${darkMode
                                  ? 'bg-slate-700 text-slate-200 border border-slate-600 focus:border-emerald-500'
                                  : 'bg-white text-slate-900 border border-slate-200 focus:border-emerald-500'}
                              `}
                              style={{
                                colorScheme: darkMode ? 'dark' : 'light'
                              }}
                            />
                          </div>

                          {/* Venue with Avatar */}
                          <div className="col-span-5 relative">
                            <select
                              required
                              value={round.venue}
                              onChange={(e) => handleRoundChange(index, 'venue', e.target.value)}
                              className={`
                                w-full py-2 pr-3 rounded-lg transition-colors text-sm appearance-none
                                ${round.venue && venues.find(v => v.name === round.venue)?.image ? 'pl-10' : 'pl-3'}
                                ${darkMode
                                  ? 'bg-slate-700 text-slate-200 border border-slate-600 focus:border-emerald-500'
                                  : 'bg-white text-slate-900 border border-slate-200 focus:border-emerald-500'}
                              `}
                              style={{
                                backgroundImage: `url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3e%3cpath stroke='%236b7280' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='M6 8l4 4 4-4'/%3e%3c/svg%3e")`,
                                backgroundPosition: 'right 0.5rem center',
                                backgroundRepeat: 'no-repeat',
                                backgroundSize: '1.5em 1.5em'
                              }}
                            >
                              <option value="">Select venue</option>
                              {venues.map(venue => (
                                <option key={venue.id} value={venue.name}>
                                  {venue.name}
                                </option>
                              ))}
                            </select>
                            {round.venue && venues.find(v => v.name === round.venue)?.image && (
                              <div className="absolute left-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full overflow-hidden border border-slate-600">
                                <img
                                  src={venues.find(v => v.name === round.venue)?.image || ''}
                                  alt=""
                                  className="w-full h-full object-cover"
                                />
                              </div>
                            )}
                          </div>

                          {/* Delete Button */}
                          <div className="col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() => handleRemoveRound(index)}
                              className={`p-1.5 rounded-lg transition-colors ${darkMode ? 'text-slate-400 hover:text-red-400 hover:bg-slate-700' : 'text-slate-400 hover:text-red-500 hover:bg-red-50'}`}
                              title="Remove round"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>

                          {/* Cancellation (Full Width Row Below if cancelled) */}
                          {round.cancelled && (
                            <div className="col-span-12 pt-2 pb-1">
                              <div className={`flex items-start gap-3 p-3 rounded-lg ${darkMode ? 'bg-red-900/20 border border-red-900/30' : 'bg-red-50 border border-red-200'}`}>
                                <input
                                  type="text"
                                  value={round.cancellationReason || ''}
                                  onChange={(e) => handleRoundChange(index, 'cancellationReason', e.target.value)}
                                  placeholder="Reason for cancellation"
                                  className={`
                                    flex-1 px-3 py-2 rounded-lg transition-colors text-sm
                                    ${darkMode
                                      ? 'bg-slate-800 text-slate-200 border border-slate-600'
                                      : 'bg-white text-slate-900 border border-slate-200'}
                                  `}
                                />
                              </div>
                            </div>
                          )}

                          {/* Cancelled Checkbox (Full Width Row Below) */}
                          <div className="col-span-12 -mt-1">
                            <label className={`flex items-center gap-2 cursor-pointer text-xs ${darkMode ? 'text-slate-400 hover:text-slate-300' : 'text-slate-500 hover:text-slate-700'}`}>
                              <input
                                type="checkbox"
                                checked={round.cancelled || false}
                                onChange={(e) => handleRoundChange(index, 'cancelled', e.target.checked)}
                                className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-slate-400"
                              />
                              <span>Mark as cancelled</span>
                            </label>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className={`
                    text-center py-8 rounded-lg border
                    ${darkMode
                      ? 'bg-slate-700/30 border-slate-600/50 text-slate-400'
                      : 'bg-slate-50 border-slate-200/50 text-slate-500'}
                  `}>
                    <CalendarRange size={32} className="mx-auto mb-3 opacity-50" />
                    <p className="text-sm font-medium">No rounds added yet</p>
                    <p className="text-xs mt-1">Click "Add Round" to start scheduling race rounds</p>
                  </div>
                )}
              </div>
            )}

            {error && (
              <div className="p-3 bg-red-900/10 text-red-500 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="flex justify-between items-center gap-3 pt-6 sticky bottom-0 bg-white dark:bg-slate-800 pb-4 -mb-4 border-t border-slate-200 dark:border-slate-700 mt-6">
              <button
                type="button"
                onClick={onClose}
                className={`
                  px-6 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105
                  ${darkMode
                    ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                    : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                `}
              >
                Cancel
              </button>
              <div className="flex gap-3">
                {(currentStep === 'documents' || currentStep === 'payments' || currentStep === 'results') && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      if (currentStep === 'documents') {
                        setCurrentStep('details');
                      } else if (currentStep === 'payments') {
                        setCurrentStep('documents');
                      } else if (currentStep === 'results') {
                        setCurrentStep('payments');
                      }
                    }}
                    className={`
                      px-6 py-2.5 rounded-xl font-medium transition-all flex items-center gap-2
                      ${darkMode
                        ? 'text-slate-300 hover:text-slate-100 hover:bg-slate-700'
                        : 'text-slate-600 hover:text-slate-800 hover:bg-slate-100'}
                    `}
                  >
                    <ChevronDown size={16} className="rotate-90" />
                    Back
                  </button>
                )}
                {currentStep === 'details' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentStep('documents');
                    }}
                    className="px-8 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30"
                  >
                    Next: Documents
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                ) : currentStep === 'documents' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();

                      // Validate documents for State/National events
                      if (formData.eventLevel === 'state' || formData.eventLevel === 'national') {
                        const hasNorDocument = formData.noticeOfRaceUrl || formData.noticeOfRaceFile || scheduledDocuments.nor?.scheduled;
                        const hasSiDocument = formData.sailingInstructionsUrl || formData.sailingInstructionsFile || scheduledDocuments.si?.scheduled;

                        if (!hasNorDocument && !hasSiDocument) {
                          addNotification(
                            'error',
                            `${formData.eventLevel === 'state' ? 'State' : 'National'} events require race documents. Please upload, generate, or schedule at least one document (NOR or SI).`
                          );
                          return;
                        }
                      }

                      setCurrentStep('payments');
                    }}
                    className="px-8 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30"
                  >
                    Next: Payments
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                ) : currentStep === 'payments' ? (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setCurrentStep('results');
                    }}
                    className="px-8 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2 bg-blue-600 text-white hover:bg-blue-700 shadow-lg shadow-blue-600/30"
                  >
                    Next: Results Display
                    <ChevronDown size={16} className="-rotate-90" />
                  </button>
                ) : (
                  <button
                    type="submit"
                    disabled={type === 'series' && formData.rounds.length === 0 || uploading}
                    className={`
                      px-8 py-2.5 rounded-xl font-medium transition-all transform hover:scale-105 flex items-center gap-2
                      ${(type !== 'series' || formData.rounds.length > 0) && !uploading
                        ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/30'
                        : 'bg-slate-400 text-white cursor-not-allowed'}
                    `}
                  >
                    {uploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                        Uploading...
                      </>
                    ) : (
                      `${isEditing ? 'Update' : 'Create'} ${type === 'quick' ? 'Event' : 'Series'}`
                    )}
                  </button>
                )}
              </div>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
          }
          to {
            opacity: 1;
          }
        }

        @keyframes slideUp {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        @keyframes scaleIn {
          from {
            opacity: 0;
            transform: scale(0);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.2s ease-out;
        }

        .animate-slideUp {
          animation: slideUp 0.3s ease-out;
        }

        .animate-slideIn {
          animation: slideIn 0.4s ease-out;
        }

        .animate-scaleIn {
          animation: scaleIn 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .animate-spin {
          animation: spin 1s linear infinite;
        }

        /* Smooth transitions for all interactive elements */
        button {
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
        }

        button:active {
          transform: scale(0.98);
        }

        /* Input focus styles */
        input:focus,
        select:focus,
        textarea:focus {
          outline: none;
          ring: 2px;
          ring-color: rgb(59 130 246);
          transition: all 0.2s ease;
        }
      `}</style>

      {/* Document Generation Wizard */}
      {showDocumentWizard && selectedTemplate ? (
        <DocumentGenerationWizard
          templateId={selectedTemplate}
          eventId={undefined}
          eventData={formData}
          submissionId={editingSubmissionId || undefined}
          documentType={documentWizardType}
          onClose={() => {
            setShowDocumentWizard(false);
            setSelectedTemplate(null);
            setEditingSubmissionId(null);
          }}
          onComplete={(documentUrl) => {
            if (documentWizardType === 'nor') {
              setFormData(prev => ({ ...prev, noticeOfRaceUrl: documentUrl }));
            } else {
              setFormData(prev => ({ ...prev, sailingInstructionsUrl: documentUrl }));
            }
            setShowDocumentWizard(false);
            setSelectedTemplate(null);
          }}
          darkMode={darkMode}
        />
      ) : null}

      {/* Schedule Document Modal */}
      <ScheduleDocumentModal
        isOpen={showScheduleDocumentModal}
        onClose={() => setShowScheduleDocumentModal(false)}
        darkMode={darkMode}
        documentType={scheduleDocumentType}
        eventDate={formData.raceDate}
        eventName={formData.eventName}
        isLinked={linkDocumentSchedules}
        initialDueDate={scheduledDocuments[scheduleDocumentType]?.dueDate}
        initialSelectedMembers={scheduledDocuments[scheduleDocumentType]?.memberIds}
        onSchedule={(contacts, contactEmails, dueDate, memberIds) => {
          handleDocumentScheduled(scheduleDocumentType, contacts, contactEmails, dueDate, memberIds);
          setShowScheduleDocumentModal(false);
        }}
      />

      {showClashWarning && clashingEvents.length > 0 && (
        <EventClashWarningModal
          darkMode={darkMode}
          clashingEvents={clashingEvents}
          eventName={formData.eventName || formData.seriesName || 'New Event'}
          onProceed={() => {
            setShowClashWarning(false);
            setClashAcknowledged(true);
            setTimeout(() => {
              const form = document.querySelector<HTMLFormElement>('form');
              if (form) form.requestSubmit();
            }, 0);
          }}
          onCancel={() => {
            setShowClashWarning(false);
            setClashingEvents([]);
          }}
        />
      )}
    </div>
  );
};