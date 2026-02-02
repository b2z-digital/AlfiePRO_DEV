import React, { useState, useEffect } from 'react';
import { X, Upload, FileUp, Check, AlertCircle, Users } from 'lucide-react';
import Papa from 'papaparse';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

interface ImportRegistrationsModalProps {
  isOpen: boolean;
  onClose: () => void;
  websiteId: string;
  events: { id: string; name: string; is_primary: boolean }[];
  onImportComplete: () => void;
}

interface ImportMapping {
  [csvColumn: string]: string;
}

export const ImportRegistrationsModal: React.FC<ImportRegistrationsModalProps> = ({
  isOpen,
  onClose,
  websiteId,
  events: propEvents,
  onImportComplete
}) => {
  const { currentClub } = useAuth();
  const [events, setEvents] = useState(propEvents);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importData, setImportData] = useState<any[]>([]);
  const [importHeaders, setImportHeaders] = useState<string[]>([]);
  const [importMappings, setImportMappings] = useState<ImportMapping>({});
  const [importStep, setImportStep] = useState<'select' | 'upload' | 'mapping' | 'importing' | 'complete'>('select');
  const [error, setError] = useState<string | null>(null);
  const [importedCount, setImportedCount] = useState(0);
  const [duplicateCount, setDuplicateCount] = useState(0);
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Fetch events if not provided or if modal opens with empty events
  useEffect(() => {
    const fetchEvents = async () => {
      if (!isOpen || !websiteId) return;

      console.log('Import Modal: Checking events...', { propEvents, eventsLength: propEvents.length });

      // If we have events from props, use them
      if (propEvents.length > 0) {
        console.log('Using events from props:', propEvents);
        setEvents(propEvents);
        return;
      }

      // Otherwise, fetch them ourselves
      console.log('Fetching events for website:', websiteId);
      setLoadingEvents(true);
      setError(null);

      try {
        // Use the event_website_all_events view which returns all events in a JSONB array
        const { data: eventWebsiteData, error: fetchError } = await supabase
          .from('event_website_all_events')
          .select('all_events')
          .eq('event_website_id', websiteId)
          .maybeSingle();

        if (fetchError) throw fetchError;

        console.log('Fetched event_website_all_events:', eventWebsiteData);

        // Extract events from the all_events JSONB array
        const allEvents = eventWebsiteData?.all_events || [];
        const eventsData = allEvents.map((evt: any) => ({
          id: evt.id,
          name: evt.event_name,
          is_primary: evt.is_primary,
          display_order: evt.display_order
        }));

        console.log('Processed events:', eventsData);
        setEvents(eventsData);
      } catch (err) {
        console.error('Error fetching events:', err);
        setError('Failed to load events. Please try again.');
      } finally {
        setLoadingEvents(false);
      }
    };

    fetchEvents();
  }, [isOpen, websiteId, propEvents]);

  // Initialize modal state when events are loaded
  useEffect(() => {
    if (isOpen && !loadingEvents) {
      console.log('Import Modal: Initializing with events:', events);

      if (events.length > 0) {
        const primaryEvent = events.find(e => e.is_primary);
        const defaultEventId = primaryEvent?.id || events[0]?.id;
        setSelectedEventId(defaultEventId);

        // If there's only one event, skip the selection step
        if (events.length === 1) {
          setImportStep('upload');
        } else {
          setImportStep('select');
        }
      } else {
        // If no events, show error
        setImportStep('select');
        setError('No events found. Please ensure events are linked to this website.');
      }
    }
  }, [isOpen, events, loadingEvents]);

  // Reset state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedEventId('');
      setImportFile(null);
      setImportData([]);
      setImportHeaders([]);
      setImportMappings({});
      setImportStep('select');
      setError(null);
      setImportedCount(0);
      setDuplicateCount(0);
    }
  }, [isOpen]);

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImportFile(file);
    const reader = new FileReader();

    reader.onload = (e) => {
      const text = e.target?.result as string;
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: (results) => {
          setImportData(results.data);
          setImportHeaders(results.meta.fields || []);
          setImportStep('mapping');

          // Auto-detect mappings
          const autoMappings: ImportMapping = {};
          results.meta.fields?.forEach(header => {
            const normalized = header.toLowerCase().trim();
            if (normalized.includes('first') && normalized.includes('name')) autoMappings[header] = 'first_name';
            else if (normalized.includes('last') && normalized.includes('name')) autoMappings[header] = 'last_name';
            else if (normalized.includes('club')) autoMappings[header] = 'club';
            else if (normalized.includes('sail') || normalized.includes('number')) autoMappings[header] = 'sail_number';
            else if (normalized.includes('boat') && (normalized.includes('name') || normalized.includes('hull'))) autoMappings[header] = 'boat_name';
            else if (normalized.includes('boat') && (normalized.includes('class') || normalized.includes('type'))) autoMappings[header] = 'boat_class';
            else if (normalized.includes('state')) autoMappings[header] = 'state';
            else if (normalized.includes('country')) autoMappings[header] = 'country';
          });
          setImportMappings(autoMappings);
        },
        error: (error) => {
          setError(`Failed to parse CSV: ${error.message}`);
        }
      });
    };

    reader.onerror = () => {
      setError('Failed to read file');
    };

    reader.readAsText(file);
  };

  const handleImport = async () => {
    if (!currentClub?.clubId || !selectedEventId) {
      setError('Missing club or event information');
      return;
    }

    setImportStep('importing');
    setError(null);

    try {
      // Reverse the mapping: field -> CSV column
      const fieldToColumn: Record<string, string> = {};
      Object.entries(importMappings).forEach(([csvColumn, field]) => {
        fieldToColumn[field] = csvColumn;
      });

      let imported = 0;
      let duplicates = 0;

      // Check for existing registrations by sail number
      const { data: existingRegistrations } = await supabase
        .from('event_registrations')
        .select('sail_number')
        .eq('event_id', selectedEventId);

      const existingSailNumbers = new Set(existingRegistrations?.map(r => r.sail_number) || []);

      // Process each row silently - only valid rows will be imported
      for (const row of importData) {
        const firstName = (row[fieldToColumn['first_name']] || '').toString().trim();
        const lastName = (row[fieldToColumn['last_name']] || '').toString().trim();
        const sailNumber = (row[fieldToColumn['sail_number']] || '').toString().trim();

        // Skip silently if missing required fields
        if (!firstName || !lastName || !sailNumber) continue;

        // Skip silently if duplicate
        if (existingSailNumbers.has(sailNumber)) {
          duplicates++;
          continue;
        }

        const club = (row[fieldToColumn['club']] || '').toString().trim();
        const boatName = (row[fieldToColumn['boat_name']] || '').toString().trim();
        const boatClass = (row[fieldToColumn['boat_class']] || '').toString().trim();
        const state = (row[fieldToColumn['state']] || '').toString().trim();
        const country = (row[fieldToColumn['country']] || '').toString().trim() || 'Australia';

        // Insert into event_registrations table
        const { error: insertError } = await supabase
          .from('event_registrations')
          .insert({
            event_id: selectedEventId,
            club_id: currentClub.clubId,
            guest_first_name: firstName,
            guest_last_name: lastName,
            guest_club_name: club || null,
            guest_state: state || null,
            guest_country: country,
            sail_number: sailNumber,
            boat_name: boatName || null,
            boat_class: boatClass || null,
            status: 'confirmed',
            payment_status: 'pending',
            amount_paid: 0,
            entry_fee_amount: 0
          });

        if (insertError) {
          console.error(`Error inserting registration for ${firstName} ${lastName}:`, insertError);
          continue;
        }

        imported++;
        existingSailNumbers.add(sailNumber);
      }

      console.log('Import complete:', { imported, duplicates });

      setImportedCount(imported);
      setDuplicateCount(duplicates);
      setImportStep('complete');
    } catch (err) {
      console.error('Error importing registrations:', err);
      setError(err instanceof Error ? err.message : 'Failed to import registrations');
      setImportStep('mapping');
    }
  };

  const handleClose = () => {
    if (importStep === 'complete' && importedCount > 0) {
      onImportComplete();
    }
    onClose();
  };

  const isRequiredFieldMapped = (field: string) => {
    return Object.values(importMappings).includes(field);
  };

  const canProceedWithMapping = () => {
    return isRequiredFieldMapped('first_name') &&
           isRequiredFieldMapped('last_name') &&
           isRequiredFieldMapped('sail_number');
  };

  const handleBackFromUpload = () => {
    // Only go back to event selection if there are multiple events
    if (events.length > 1) {
      setImportStep('select');
    } else {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="w-full max-w-3xl rounded-xl shadow-xl overflow-hidden backdrop-blur-sm bg-slate-800/95 border border-slate-700 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <Upload className="text-cyan-400" size={24} />
            <div>
              <h2 className="text-xl font-semibold text-slate-100">
                Import Registrations
              </h2>
              <p className="text-sm text-slate-400">
                Import competitor registrations from CSV file
              </p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="text-slate-400 hover:text-slate-200 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading State */}
          {loadingEvents && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4"></div>
              <p className="text-slate-300">Loading events...</p>
            </div>
          )}

          {/* Error Message */}
          {error && !loadingEvents && (
            <div className="mb-4 p-4 bg-red-500/10 border border-red-500/50 rounded-lg flex items-start gap-3">
              <AlertCircle className="text-red-400 flex-shrink-0 mt-0.5" size={20} />
              <div>
                <p className="text-red-400 font-medium">Error</p>
                <p className="text-red-300 text-sm">{error}</p>
              </div>
            </div>
          )}

          {/* Step 1: Select Event */}
          {!loadingEvents && importStep === 'select' && (
            <div className="space-y-4">
              <div className="bg-slate-900/50 rounded-lg p-6">
                <h3 className="text-lg font-medium text-slate-200 mb-4">Select Event</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Choose which event to import registrations into:
                </p>
                {events.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-slate-400">No events found for this event website.</p>
                    <p className="text-slate-500 text-sm mt-2">Please check that events are properly linked to this website.</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {events.map((event) => (
                      <button
                        key={event.id}
                        onClick={() => setSelectedEventId(event.id)}
                        className={`w-full px-4 py-3 rounded-lg border text-left transition-colors ${
                          selectedEventId === event.id
                            ? 'bg-cyan-500/20 border-cyan-500 text-white'
                            : 'bg-slate-700 border-slate-600 text-slate-300 hover:border-slate-500'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{event.name}</span>
                          {event.is_primary && (
                            <span className="text-xs px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded">
                              Primary
                            </span>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <button
                onClick={() => setImportStep('upload')}
                disabled={!selectedEventId || events.length === 0}
                className="w-full px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
              >
                Continue
              </button>
            </div>
          )}

          {/* Step 2: Upload File */}
          {!loadingEvents && importStep === 'upload' && (
            <div className="space-y-4">
              {/* Show selected event */}
              {selectedEventId && events.length > 0 && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 rounded-lg p-4">
                  <p className="text-sm text-slate-400">Importing registrations for:</p>
                  <p className="text-lg font-semibold text-cyan-400 mt-1">
                    {events.find(e => e.id === selectedEventId)?.name || 'Selected Event'}
                  </p>
                </div>
              )}

              <div className="border-2 border-dashed border-slate-600 rounded-lg p-12 text-center">
                <FileUp className="mx-auto mb-4 text-slate-500" size={48} />
                <h3 className="text-lg font-medium text-slate-200 mb-2">Upload CSV File</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Your CSV should include columns for: First Name, Last Name, Sail Number
                  <br />
                  Optional: Club, Boat Name, Boat Class, State, Country
                </p>
                <label className="inline-block px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium cursor-pointer transition-colors">
                  Choose File
                  <input
                    type="file"
                    accept=".csv"
                    onChange={handleFileUpload}
                    className="hidden"
                  />
                </label>
              </div>

              <button
                onClick={handleBackFromUpload}
                className="w-full px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
              >
                {events.length > 1 ? 'Back' : 'Cancel'}
              </button>
            </div>
          )}

          {/* Step 3: Map Columns */}
          {!loadingEvents && importStep === 'mapping' && (
            <div className="space-y-4">
              {/* Debug Info */}
              <div className="bg-slate-900 border border-slate-700 rounded-lg p-4 text-xs font-mono">
                <div className="text-slate-400 mb-2">Debug Info:</div>
                <div className="text-slate-300">CSV Headers: {JSON.stringify(importHeaders)}</div>
                <div className="text-slate-300 mt-1">Current Mappings: {JSON.stringify(importMappings)}</div>
                <div className="text-slate-300 mt-1">First Row Sample: {JSON.stringify(importData[0])}</div>
              </div>

              <div className="bg-slate-900/50 rounded-lg p-4">
                <h3 className="text-lg font-medium text-slate-200 mb-4">Map Your Columns</h3>
                <p className="text-sm text-slate-400 mb-4">
                  Found {importData.length} rows. Map your CSV columns to the required fields:
                </p>
                <div className="space-y-3">
                  {[
                    { field: 'first_name', label: 'First Name', required: true },
                    { field: 'last_name', label: 'Last Name', required: true },
                    { field: 'sail_number', label: 'Sail Number', required: true },
                    { field: 'club', label: 'Club', required: false },
                    { field: 'boat_name', label: 'Boat Name', required: false },
                    { field: 'boat_class', label: 'Boat Class', required: false },
                    { field: 'state', label: 'State', required: false },
                    { field: 'country', label: 'Country', required: false }
                  ].map(({ field, label, required }) => {
                    const isMapped = isRequiredFieldMapped(field);
                    return (
                      <div key={field} className="flex items-center gap-4">
                        <label className="w-36 text-sm font-medium text-slate-300 flex items-center gap-2">
                          {label}
                          {required && <span className="text-red-400">*</span>}
                          {isMapped && <Check className="text-green-400" size={16} />}
                        </label>
                        <select
                          value={Object.keys(importMappings).find(k => importMappings[k] === field) || ''}
                          onChange={(e) => {
                            const newMappings = { ...importMappings };
                            // Remove any existing mapping for this field
                            Object.keys(newMappings).forEach(k => {
                              if (newMappings[k] === field) delete newMappings[k];
                            });
                            // Add new mapping if a column was selected
                            if (e.target.value) newMappings[e.target.value] = field;
                            setImportMappings(newMappings);
                          }}
                          className={`flex-1 px-3 py-2 rounded-lg border text-slate-100 focus:outline-none focus:ring-2 focus:ring-cyan-500 ${
                            isMapped
                              ? 'bg-slate-700 border-green-500/50'
                              : 'bg-slate-700 border-slate-600'
                          }`}
                        >
                          <option value="">Select column...</option>
                          {importHeaders.map(header => (
                            <option key={header} value={header}>
                              {header}
                            </option>
                          ))}
                        </select>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setImportStep('upload')}
                  className="flex-1 px-6 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={!canProceedWithMapping()}
                  className="flex-1 px-6 py-3 bg-cyan-600 hover:bg-cyan-700 disabled:bg-slate-700 disabled:text-slate-500 text-white rounded-lg font-medium transition-colors"
                >
                  Import Registrations
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Importing */}
          {!loadingEvents && importStep === 'importing' && (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mb-4"></div>
              <p className="text-slate-300">Importing registrations...</p>
            </div>
          )}

          {/* Step 5: Complete */}
          {!loadingEvents && importStep === 'complete' && (
            <div className="text-center py-12">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-green-500/20 mb-6">
                <Check className="text-green-400" size={32} />
              </div>
              <h3 className="text-xl font-semibold text-slate-100 mb-2">Import Complete!</h3>
              <div className="space-y-2 mb-6">
                <p className="text-slate-300">
                  Successfully imported <span className="font-semibold text-cyan-400">{importedCount}</span> registrations
                </p>
                {duplicateCount > 0 && (
                  <p className="text-slate-400 text-sm">
                    {duplicateCount} {duplicateCount === 1 ? 'duplicate was' : 'duplicates were'} skipped
                  </p>
                )}
              </div>
              <button
                onClick={handleClose}
                className="px-6 py-3 bg-cyan-600 hover:bg-cyan-700 text-white rounded-lg font-medium transition-colors"
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
