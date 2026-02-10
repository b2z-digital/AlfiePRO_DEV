// Updated: 2025-11-19 - Enhanced styling with glassmorphism, better dropdowns, square selections
import React, { useState, useEffect } from 'react';
import { X, ChevronRight, ChevronLeft, FileText, CheckCircle, AlertCircle, Loader, Sparkles, ChevronDown } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { RaceFormWithFields, FormField } from '../../types/forms';
import { useAuth } from '../../contexts/AuthContext';
import { useNotifications } from '../../contexts/NotificationContext';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

interface DocumentGenerationWizardProps {
  templateId: string;
  eventId?: string;
  eventData?: any; // Accept form data directly for new events
  submissionId?: string; // Optional submission ID to load existing data for editing
  documentType: 'nor' | 'si' | 'amendment' | 'notice' | 'other';
  onClose: () => void;
  onComplete: (documentUrl: string) => void;
  darkMode: boolean;
}

interface FormPage {
  pageNumber: number;
  fields: FormField[];
}

export const DocumentGenerationWizard: React.FC<DocumentGenerationWizardProps> = ({
  templateId,
  eventId,
  eventData: providedEventData,
  submissionId,
  documentType,
  onClose,
  onComplete,
  darkMode
}) => {
  const { currentClub, user } = useAuth();
  const { addNotification } = useNotifications();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  const [formData, setFormData] = useState<Record<string, any>>({});
  const [formPages, setFormPages] = useState<FormPage[]>([]);
  const [template, setTemplate] = useState<any>(null);
  const [form, setForm] = useState<RaceFormWithFields | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clubs, setClubs] = useState<any[]>([]);
  const [venues, setVenues] = useState<any[]>([]);
  const [stateAssociations, setStateAssociations] = useState<any[]>([]);

  useEffect(() => {
    loadWizardData();
  }, [templateId]);

  const loadWizardData = async () => {
    try {
      setLoading(true);

      // Load template - prioritize HTML templates over structured templates
      const { data: templateData, error: templateError } = await supabase
        .from('document_templates')
        .select('*')
        .eq('id', templateId)
        .single();

      if (templateError) throw templateError;

      // If this is a structured template, check if there's an HTML version with the same name
      if (templateData && templateData.template_type === 'structured') {
        const { data: htmlTemplate } = await supabase
          .from('document_templates')
          .select('*')
          .eq('name', templateData.name)
          .eq('template_type', 'html')
          .maybeSingle();

        // Use HTML template if it exists
        if (htmlTemplate) {
          setTemplate(htmlTemplate);
        } else {
          setTemplate(templateData);
        }
      } else {
        setTemplate(templateData);
      }

      // Load event data from eventId or use provided eventData
      let eventData: any = providedEventData || null;

      if (eventId && !eventData) {
        const { data: event, error: eventError} = await supabase
          .from('quick_races')
          .select('*, venues(name), clubs(name)')
          .eq('id', eventId)
          .single();

        if (!eventError && event) {
          eventData = event;
        }
      }

      // Load form if linked
      if (templateData.linked_form_id) {
        const { data: formData, error: formError } = await supabase
          .from('race_forms')
          .select('*')
          .eq('id', templateData.linked_form_id)
          .single();

        if (formError) throw formError;

        const { data: fieldsData, error: fieldsError } = await supabase
          .from('form_fields')
          .select('*')
          .eq('form_id', templateData.linked_form_id)
          .order('field_order');

        if (fieldsError) throw fieldsError;

        const formWithFields: RaceFormWithFields = {
          ...formData,
          fields: fieldsData || []
        };

        setForm(formWithFields);

        // Pre-populate form data from event or placeholders
        const prePopulatedData: Record<string, any> = {};

        fieldsData?.forEach(field => {
          // First, set placeholder as default value for text fields (if available)
          if (field.placeholder && (field.field_type === 'text' || field.field_type === 'url' || field.field_type === 'textarea')) {
            prePopulatedData[field.field_name] = field.placeholder;
          }

          // Then override with event data if available using mapping_key
          if (eventData && field.mapping_key) {
            // Use mapping_key for stable field mapping
            switch (field.mapping_key) {
              case 'event_name':
                prePopulatedData[field.field_name] = eventData.eventName || eventData.event_name || '';
                break;

              case 'venue_name':
                prePopulatedData[field.field_name] = eventData.raceVenue || eventData.venueName || eventData.venues?.name || '';
                break;

              case 'event_start_date':
                const startDate = eventData.raceDate || eventData.race_date;
                if (startDate) {
                  if (field.field_type === 'date') {
                    prePopulatedData[field.field_name] = startDate;
                  } else {
                    prePopulatedData[field.field_name] = new Date(startDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  }
                }
                break;

              case 'event_end_date':
                const endDate = eventData.endDate || eventData.end_date;
                if (endDate) {
                  if (field.field_type === 'date') {
                    prePopulatedData[field.field_name] = endDate;
                  } else {
                    prePopulatedData[field.field_name] = new Date(endDate).toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                  }
                }
                break;

              case 'number_of_days':
                prePopulatedData[field.field_name] = eventData.numberOfDays || eventData.number_of_days || '';
                break;

              case 'event_day_2_date':
              case 'event_day_3_date':
              case 'event_day_4_date': {
                // Auto-calculate subsequent day dates based on start date
                const startDate = eventData.raceDate || eventData.race_date;
                if (startDate) {
                  const dayNumber = parseInt(field.mapping_key.match(/day[_\s]?(\d+)/i)?.[1] || '0');
                  if (dayNumber > 1) {
                    const date = new Date(startDate);
                    date.setDate(date.getDate() + (dayNumber - 1));

                    if (field.field_type === 'date') {
                      prePopulatedData[field.field_name] = date.toISOString().split('T')[0];
                    } else {
                      prePopulatedData[field.field_name] = date.toLocaleDateString('en-AU', { day: '2-digit', month: '2-digit', year: 'numeric' });
                    }
                  }
                }
                break;
              }

              case 'boat_class_name': {
                const classValue = eventData.raceClass || eventData.boatClassName || eventData.race_class || '';
                if (classValue && field.options && field.options.length > 0) {
                  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const norm = normalise(classValue);
                  const classAliases: Record<string, string[]> = {
                    '10r': ['internationaltengater', 'internationaltengater', 'international10rater', '10rater', 'tenrater', '10r'],
                    'df65': ['dragonforce65', 'df65', 'dragonflite65'],
                    'df95': ['dragonforce95', 'df95', 'dragonflite95'],
                    'iom': ['internationalonemétre', 'internationalonemetre', 'iom', 'iomusdollars'],
                    'marblehead': ['marblehead', 'm'],
                    'rg65': ['rg65'],
                  };
                  let matched = field.options.find(o => normalise(o.value) === norm || normalise(o.label) === norm);
                  if (!matched) {
                    const aliases = Object.entries(classAliases).find(([, vals]) => vals.includes(norm));
                    if (aliases) {
                      matched = field.options.find(o => {
                        const ov = normalise(o.value);
                        const ol = normalise(o.label);
                        return aliases[1].some(a => ov.includes(a) || ol.includes(a)) || ov.includes(aliases[0]) || ol.includes(aliases[0]);
                      });
                    }
                  }
                  if (!matched) {
                    matched = field.options.find(o => normalise(o.label).includes(norm) || normalise(o.value).includes(norm) || norm.includes(normalise(o.label)) || norm.includes(normalise(o.value)));
                  }
                  prePopulatedData[field.field_name] = matched ? matched.value : classValue;
                } else {
                  prePopulatedData[field.field_name] = classValue;
                }
                break;
              }

              case 'club_id':
                prePopulatedData[field.field_name] = eventData.clubId || eventData.club_id || '';
                break;

              case 'venue_id':
                prePopulatedData[field.field_name] = eventData.venueId || eventData.venue_id || '';
                break;

              case 'state_association_id':
                prePopulatedData[field.field_name] = eventData.stateAssociationId || eventData.state_association_id || '';
                break;
            }
          }
        });

        // If submissionId is provided, load the saved submission data (for editing)
        if (submissionId) {
          const { data: submission, error: submissionError } = await supabase
            .from('form_submissions')
            .select('form_data')
            .eq('id', submissionId)
            .single();

          if (!submissionError && submission?.form_data) {
            // Merge saved submission data over pre-populated data
            Object.assign(prePopulatedData, submission.form_data);
          }
        }

        setFormData(prePopulatedData);

        // Split into pages based on page_break fields (after prePopulatedData is complete)
        const pages = splitIntoPages(fieldsData || [], prePopulatedData);
        setFormPages(pages);
      }

      // Load clubs, venues, and state associations for dropdowns
      const { data: clubsData } = await supabase
        .from('clubs')
        .select('id, name')
        .order('name');
      setClubs(clubsData || []);

      const { data: venuesData } = await supabase
        .from('venues')
        .select('id, name')
        .eq('club_id', currentClub?.clubId)
        .order('name');
      setVenues(venuesData || []);

      const { data: stateAssocData } = await supabase
        .from('state_associations')
        .select('id, name, state')
        .order('name');
      setStateAssociations(stateAssocData || []);

    } catch (err) {
      console.error('Error loading wizard data:', err);
      addNotification('Failed to load form data', 'error');
    } finally {
      setLoading(false);
    }
  };

  const splitIntoPages = (fields: FormField[], currentFormData: Record<string, any> = {}): FormPage[] => {
    const pages: FormPage[] = [];
    let currentPageFields: FormField[] = [];
    let pageNumber = 0;

    // Detect number of days from event data or form data
    const numberOfDays = providedEventData?.numberOfDays ||
                        providedEventData?.number_of_days ||
                        currentFormData['number_of_racing_days'] ||
                        currentFormData['racing_days'] ||
                        currentFormData['how_many_racing_days_in_regatta'];

    fields.forEach(field => {
      if (field.field_type === 'page_break') {
        if (currentPageFields.length > 0) {
          pages.push({ pageNumber, fields: currentPageFields });
          pageNumber++;
          currentPageFields = [];
        }
      } else {
        // Skip "How many racing days" radio field if we already know the number from event data
        if (field.mapping_key === 'number_of_days' && field.field_type === 'radio' && numberOfDays) {
          // Skip this field - we already know the number of days
          return;
        }

        // Check if this is a Day 2+ field that should be conditionally shown
        const dayMatch = field.field_name.match(/day[_\s]?(\d+)/i);
        if (dayMatch && parseInt(dayMatch[1]) > 1) {
          const dayNumber = parseInt(dayMatch[1]);
          const actualDays = parseInt(numberOfDays || '1');

          // Only include this field if the event has enough days
          if (dayNumber > actualDays) {
            return; // Skip this field
          }
        }

        currentPageFields.push(field);
      }
    });

    // Add remaining fields as last page
    if (currentPageFields.length > 0) {
      pages.push({ pageNumber, fields: currentPageFields });
    }

    return pages;
  };

  const validateCurrentPage = (): boolean => {
    const currentPageFields = formPages[currentPage]?.fields || [];
    const pageErrors: Record<string, string> = {};

    currentPageFields.forEach(field => {
      if (field.is_required && !formData[field.field_name]) {
        pageErrors[field.field_name] = `${field.field_label} is required`;
      }
    });

    setErrors(pageErrors);
    return Object.keys(pageErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentPage()) {
      setCurrentPage(prev => Math.min(prev + 1, formPages.length));
      setErrors({});
    }
  };

  const handlePrevious = () => {
    setCurrentPage(prev => Math.max(prev - 1, 0));
    setErrors({});
  };

  const handleFieldChange = (fieldName: string, value: any) => {
    setFormData(prev => ({ ...prev, [fieldName]: value }));
    if (errors[fieldName]) {
      setErrors(prev => {
        const newErrors = { ...prev };
        delete newErrors[fieldName];
        return newErrors;
      });
    }

    // If the number of racing days changed, rebuild pages to show/hide Day 2, 3, 4+ fields
    if (fieldName === 'number_of_racing_days' || fieldName === 'racing_days' || fieldName === 'how_many_racing_days_in_regatta') {
      const updatedFormData = { ...formData, [fieldName]: value };
      setFormData(updatedFormData);

      // Rebuild pages with new day count
      if (form?.fields) {
        const pages = splitIntoPages(form.fields, updatedFormData);
        setFormPages(pages);
      }
    }
  };

  const handleGenerate = async () => {
    if (!validateCurrentPage()) return;

    try {
      setGenerating(true);

      // Save form submission
      const { data: submission, error: submissionError } = await supabase
        .from('form_submissions')
        .insert({
          form_id: form!.id,
          event_id: eventId || null,
          submitted_by: user?.id,
          form_data: formData
        })
        .select()
        .single();

      if (submissionError) throw submissionError;

      // Generate PDF client-side using jsPDF
      const pdf = await generatePDFDocument(formData, template, currentClub, { clubs, venues, stateAssociations }, form?.fields || []);

      // Convert PDF to blob
      const pdfBlob = pdf.output('blob');

      // Upload PDF to storage
      // Use event name for filename if available
      const eventName = formData.event_name || formData.name || 'document';
      const sanitizedName = eventName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const fileName = `${sanitizedName}_${documentType}.pdf`;
      const filePath = `${currentClub?.clubId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('race-documents')
        .upload(filePath, pdfBlob, {
          contentType: 'application/pdf',
          upsert: true  // Allow overwriting existing files
        });

      if (uploadError) throw uploadError;

      // Get signed URL
      const { data: signedUrlData } = await supabase.storage
        .from('race-documents')
        .createSignedUrl(filePath, 31536000);

      if (!signedUrlData) throw new Error('Failed to get signed URL');

      // Save document record
      await supabase.from('generated_documents').insert({
        template_id: templateId,
        form_submission_id: submission.id,
        event_id: eventId || null,
        club_id: currentClub?.clubId,
        document_type: documentType,
        title: `${documentType.toUpperCase()}`,
        file_url: signedUrlData.signedUrl,
        file_size: pdfBlob.size,
        generated_by: user?.id
      });

      addNotification('PDF generated successfully', 'success');
      onComplete(signedUrlData.signedUrl);
    } catch (err) {
      console.error('Error generating document:', err);
      addNotification('Failed to generate document', 'error');
    } finally {
      setGenerating(false);
    }
  };

  const getDocumentTypeLabel = () => {
    switch (documentType) {
      case 'nor': return 'Notice of Race';
      case 'si': return 'Sailing Instructions';
      case 'amendment': return 'Amendment';
      case 'notice': return 'Notice';
      default: return 'Document';
    }
  };

  const renderField = (field: FormField) => {
    // Handle special fields by name (even if type is 'select')
    if (field.field_name === 'state_association') {
      return (
        <div className="relative">
          <select
            value={formData[field.field_name] || ''}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            className={`w-full px-4 py-3 rounded-xl border transition-all duration-200 appearance-none cursor-pointer ${
              darkMode
                ? 'bg-slate-900/50 border-slate-600/50 text-slate-100 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
                : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
            } ${errors[field.field_name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} focus:outline-none pr-12`}
            required={field.is_required}
          >
            <option value="">Select an option</option>
            {stateAssociations.map(assoc => (
              <option key={assoc.id} value={assoc.id}>{assoc.name} ({assoc.state})</option>
            ))}
          </select>
          <ChevronDown
            className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
              darkMode ? 'text-slate-400' : 'text-slate-500'
            }`}
            size={20}
          />
        </div>
      );
    }

    const baseInputClass = `w-full px-4 py-3 rounded-xl border transition-all duration-200 ${
      darkMode
        ? 'bg-slate-900/50 border-slate-600/50 text-slate-100 placeholder-slate-500 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 [color-scheme:dark]'
        : 'bg-white border-slate-300 text-slate-900 placeholder-slate-400 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
    } ${errors[field.field_name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} focus:outline-none`;

    const selectClass = `w-full px-4 py-3 rounded-xl border transition-all duration-200 appearance-none cursor-pointer ${
      darkMode
        ? 'bg-slate-900/50 border-slate-600/50 text-slate-100 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
        : 'bg-white border-slate-300 text-slate-900 focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20'
    } ${errors[field.field_name] ? 'border-red-500 focus:border-red-500 focus:ring-red-500/20' : ''} focus:outline-none pr-12`;

    switch (field.field_type) {
      case 'textarea':
        return (
          <textarea
            value={formData[field.field_name] || ''}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            placeholder={field.placeholder || ''}
            className={`${baseInputClass} h-32 resize-none`}
            required={field.is_required}
          />
        );

      case 'select':
        return (
          <div className="relative">
            <select
              value={formData[field.field_name] || ''}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              className={selectClass}
              required={field.is_required}
            >
              <option value="">{field.placeholder || 'Select an option'}</option>
              {field.options?.map((option, i) => (
                <option key={i} value={option.value}>{option.label}</option>
              ))}
            </select>
            <ChevronDown
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
              size={20}
            />
          </div>
        );

      case 'clubs':
        return (
          <div className="relative">
            <select
              value={formData[field.field_name] || ''}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              className={selectClass}
              required={field.is_required}
            >
              <option value="">Select a club</option>
              {clubs.map(club => (
                <option key={club.id} value={club.id}>{club.name}</option>
              ))}
            </select>
            <ChevronDown
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
              size={20}
            />
          </div>
        );

      case 'venue':
        return (
          <div className="relative">
            <select
              value={formData[field.field_name] || ''}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              className={selectClass}
              required={field.is_required}
            >
              <option value="">Select a venue</option>
              {venues.map(venue => (
                <option key={venue.id} value={venue.id}>{venue.name}</option>
              ))}
            </select>
            <ChevronDown
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
              size={20}
            />
          </div>
        );

      case 'state_association':
        return (
          <div className="relative">
            <select
              value={formData[field.field_name] || ''}
              onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
              className={selectClass}
              required={field.is_required}
            >
              <option value="">Select an option</option>
              {stateAssociations.map(assoc => (
                <option key={assoc.id} value={assoc.id}>{assoc.name} ({assoc.state})</option>
              ))}
            </select>
            <ChevronDown
              className={`absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none ${
                darkMode ? 'text-slate-400' : 'text-slate-500'
              }`}
              size={20}
            />
          </div>
        );

      case 'radio':
        return (
          <div className="space-y-2">
            {field.options?.map((option, i) => {
              const isSelected = formData[field.field_name] === option.value;
              return (
                <label
                  key={i}
                  className={`flex items-center gap-3 cursor-pointer group px-4 py-3 rounded-xl border transition-all duration-200 ${
                    isSelected
                      ? darkMode
                        ? 'border-cyan-500/50 bg-cyan-500/10'
                        : 'border-cyan-500 bg-cyan-50'
                      : darkMode
                        ? 'border-slate-700/50 bg-slate-900/30 hover:border-slate-600'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all ${
                    isSelected
                      ? 'border-cyan-500 bg-cyan-500'
                      : darkMode
                        ? 'border-slate-500'
                        : 'border-slate-400'
                  }`}>
                    {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                  </div>
                  <input
                    type="radio"
                    name={field.field_name}
                    value={option.value}
                    checked={isSelected}
                    onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
                    className="sr-only"
                  />
                  <span className={`text-sm ${
                    isSelected
                      ? darkMode ? 'text-white font-medium' : 'text-slate-900 font-medium'
                      : darkMode ? 'text-slate-300' : 'text-slate-700'
                  } transition-colors`}>
                    {option.label}
                  </span>
                </label>
              );
            })}
          </div>
        );

      case 'checkbox':
        return (
          <label className="flex items-start gap-3 cursor-pointer group">
            <div className="relative flex items-center pt-0.5">
              <input
                type="checkbox"
                checked={formData[field.field_name] || false}
                onChange={(e) => handleFieldChange(field.field_name, e.target.checked)}
                className="w-5 h-5 text-green-600 border-slate-400 rounded-none focus:ring-2 focus:ring-green-500/20 cursor-pointer"
              />
            </div>
            <span className={`${darkMode ? 'text-slate-300 group-hover:text-slate-50' : 'text-slate-700 group-hover:text-slate-900'} transition-colors text-sm`}>
              {field.field_label}
            </span>
          </label>
        );

      default:
        return (
          <input
            type={field.field_type}
            value={formData[field.field_name] || ''}
            onChange={(e) => handleFieldChange(field.field_name, e.target.value)}
            placeholder={field.placeholder || ''}
            className={baseInputClass}
            required={field.is_required}
          />
        );
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4">
        <div className={`${darkMode ? 'bg-slate-800/90 backdrop-blur-xl border-slate-700' : 'bg-white/90 backdrop-blur-xl border-slate-200'} rounded-2xl p-8 border shadow-2xl`}>
          <div className="flex flex-col items-center gap-4">
            <Loader className="animate-spin text-cyan-500" size={40} />
            <p className={`font-medium ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>Loading form data...</p>
          </div>
        </div>
      </div>
    );
  }

  const isReviewPage = currentPage === formPages.length;
  const progress = ((currentPage + 1) / (formPages.length + 1)) * 100;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-md flex items-center justify-center z-50 p-4 overflow-y-auto">
      {generating && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-[60]">
          <div className="bg-gradient-to-br from-cyan-600 to-blue-700 rounded-2xl p-8 shadow-2xl max-w-md mx-4">
            <div className="flex flex-col items-center gap-4">
              <div className="relative">
                <div className="w-20 h-20 border-4 border-white/30 border-t-white rounded-full animate-spin"></div>
                <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-white" size={32} />
              </div>
              <div className="text-center">
                <h3 className="text-2xl font-bold text-white mb-2">Generating Document...</h3>
                <p className="text-cyan-100 text-sm">
                  Building your professional document with formatting and layout
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
      <div className={`w-full max-w-5xl my-8 rounded-2xl shadow-2xl overflow-hidden border ${
        darkMode ? 'bg-slate-800/80 backdrop-blur-2xl border-slate-700/50' : 'bg-white/95 backdrop-blur-2xl border-slate-200'
      }`}>
        <div className="relative px-8 py-6 border-b bg-gradient-to-r from-cyan-600 via-blue-600 to-cyan-600 border-blue-700/20">
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl shadow-lg bg-white/20 backdrop-blur-sm">
                <FileText className="text-white" size={28} />
              </div>
              <div>
                <h2 className="text-2xl font-bold mb-1 text-white">
                  Generate {getDocumentTypeLabel()}
                </h2>
                <p className="text-sm text-white/80">
                  {form?.name || 'Document Form'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              disabled={generating}
              className={`p-2.5 rounded-xl transition-all duration-200 hover:bg-white/20 text-white/80 hover:text-white ${generating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <X size={22} />
            </button>
          </div>

          {/* Enhanced Progress Bar */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-white">
                  {isReviewPage ? 'Review & Generate' : `Step ${currentPage + 1} of ${formPages.length}`}
                </span>
                {!isReviewPage && (
                  <span className="text-xs px-2 py-1 rounded-md bg-white/20 text-white">
                    {formPages[currentPage]?.fields.length} fields
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">
                  {Math.round(progress)}%
                </span>
                <Sparkles className="text-white" size={16} />
              </div>
            </div>
            <div className="relative w-full h-2 rounded-full overflow-hidden bg-white/20">
              <div
                className="h-full transition-all duration-700 ease-out rounded-full bg-gradient-to-r from-white via-cyan-200 to-white shadow-lg shadow-white/30"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </div>

        {/* Content Area */}
        <div className={`p-8 max-h-[calc(100vh-400px)] overflow-y-auto ${
          darkMode ? 'bg-slate-800/50' : 'bg-slate-50/50'
        }`}>
          {!isReviewPage ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-x-12 lg:gap-y-6">
              {formPages[currentPage]?.fields.map((field, index) => (
                <div key={index} className={`space-y-2.5 ${
                  field.field_type === 'textarea' || field.field_type === 'radio' ? 'lg:col-span-2' : ''
                }`}>
                  {field.field_type !== 'checkbox' && (
                    <label className={`block text-sm font-semibold ${darkMode ? 'text-slate-200' : 'text-slate-700'}`}>
                      {field.field_label}
                      {field.is_required && <span className="text-red-500 ml-1.5">*</span>}
                    </label>
                  )}
                  {field.placeholder && field.field_type !== 'checkbox' && field.field_type !== 'radio' && (
                    <p className={`text-xs ${darkMode ? 'text-slate-400' : 'text-slate-500'} mb-1`}>
                      {field.placeholder}
                    </p>
                  )}
                  {renderField(field)}
                  {errors[field.field_name] && (
                    <div className="flex items-center gap-2 text-red-500 text-sm font-medium mt-2">
                      <AlertCircle size={16} />
                      <span>{errors[field.field_name]}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-6 max-w-3xl mx-auto">
              {/* Success Banner */}
              <div className={`flex items-start gap-4 p-5 rounded-xl border shadow-lg ${
                darkMode
                  ? 'bg-gradient-to-r from-cyan-600/10 to-blue-600/10 border-cyan-600/30'
                  : 'bg-gradient-to-r from-cyan-50 to-blue-50 border-cyan-300'
              }`}>
                <div className={`p-2 rounded-lg ${
                  darkMode ? 'bg-cyan-600/20' : 'bg-cyan-500/20'
                }`}>
                  <CheckCircle className="text-cyan-500" size={28} />
                </div>
                <div className="flex-1">
                  <h3 className={`font-bold text-lg mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Ready to Generate Your Document
                  </h3>
                  <p className={`text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'}`}>
                    Review your information below and click the generate button to create your {getDocumentTypeLabel().toLowerCase()}
                  </p>
                </div>
              </div>

              {/* Review Card */}
              <div className={`rounded-xl border overflow-hidden shadow-lg ${
                darkMode ? 'border-slate-700 bg-slate-900/50' : 'border-slate-200 bg-white'
              }`}>
                <div className={`px-6 py-4 border-b ${
                  darkMode ? 'border-slate-700 bg-slate-800/50' : 'border-slate-200 bg-slate-50'
                }`}>
                  <h4 className={`font-bold text-base ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                    Submitted Information
                  </h4>
                </div>
                <div className="p-6">
                  <div className="grid gap-3">
                    {Object.entries(formData)
                      .filter(([key, value]) => {
                        // Skip empty values (except boolean false)
                        if (value === '' || value === null || value === undefined) return false;
                        // Only show field if it has a corresponding form field definition
                        const field = form?.fields.find(f => f.field_name === key);
                        return field && field.field_type !== 'page_break';
                      })
                      .map(([key, value]) => {
                        const field = form?.fields.find(f => f.field_name === key);
                        if (!field) return null;

                        // Format the display value
                        let displayValue = value;

                        // Handle boolean values
                        if (typeof value === 'boolean') {
                          displayValue = value ? 'Yes' : 'No';
                        }
                        // Handle club/venue/state association IDs - look up names
                        else if (field.field_type === 'clubs' || field.field_name.toLowerCase().includes('club')) {
                          const club = clubs.find(c => c.id === value);
                          displayValue = club?.name || value;
                        }
                        else if (field.field_type === 'venue' || field.field_name.toLowerCase().includes('venue')) {
                          const venue = venues.find(v => v.id === value);
                          displayValue = venue?.name || value;
                        }
                        else if (field.field_name.toLowerCase().includes('state') && field.field_name.toLowerCase().includes('association')) {
                          const stateAssoc = stateAssociations.find(s => s.id === value);
                          displayValue = stateAssoc ? `${stateAssoc.name} (${stateAssoc.state})` : value;
                        }
                        else if (field.options && field.options.length > 0) {
                          const opt = field.options.find(o => o.value === value);
                          if (opt) displayValue = opt.label;
                          else if (typeof displayValue === 'string') displayValue = displayValue.replace(/_/g, ' ');
                        }
                        else if (typeof displayValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(displayValue)) {
                          const [y, m, d] = displayValue.split('-');
                          displayValue = `${d}/${m}/${y.slice(2)}`;
                        }
                        else if (typeof displayValue === 'string' && displayValue.includes('_')) {
                          displayValue = displayValue.replace(/_/g, ' ');
                        }

                        return (
                          <div key={key} className={`flex justify-between items-start gap-6 py-3 px-4 rounded-lg ${
                            darkMode ? 'bg-slate-800/30' : 'bg-slate-50/50'
                          }`}>
                            <span className={`font-medium text-sm ${darkMode ? 'text-slate-300' : 'text-slate-600'} flex-shrink-0 min-w-[200px]`}>
                              {field.field_label}
                            </span>
                            <span className={`text-sm text-right font-medium break-words ${darkMode ? 'text-white' : 'text-slate-900'}`}>
                              {displayValue || '-'}
                            </span>
                          </div>
                        );
                      })}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer with Actions */}
        <div className={`px-8 py-6 border-t ${
          darkMode
            ? 'bg-slate-800/80 border-slate-700'
            : 'bg-white border-slate-200'
        }`}>
          <div className="flex justify-between items-center">
            <button
              onClick={handlePrevious}
              disabled={currentPage === 0 || generating}
              className={`flex items-center gap-2 px-6 py-3 rounded-xl font-semibold transition-all duration-200 ${
                currentPage === 0 || generating
                  ? 'opacity-40 cursor-not-allowed text-slate-500'
                  : darkMode
                  ? 'hover:bg-slate-700 text-slate-300 hover:text-white'
                  : 'hover:bg-slate-100 text-slate-700 hover:text-slate-900'
              }`}
            >
              <ChevronLeft size={20} className={darkMode ? 'text-slate-300' : 'text-slate-700'} />
              Previous
            </button>

            {!isReviewPage ? (
              <button
                onClick={handleNext}
                className="flex items-center gap-2 px-8 py-3 rounded-xl font-semibold transition-all duration-200 shadow-lg bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-cyan-500/20"
              >
                Next Step
                <ChevronRight size={20} />
              </button>
            ) : (
              <button
                onClick={handleGenerate}
                disabled={generating}
                className={`flex items-center gap-2 px-8 py-3 rounded-xl font-bold transition-all duration-200 shadow-lg bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-500 hover:to-green-500 text-white shadow-emerald-500/20 ${
                  generating ? 'opacity-60 cursor-not-allowed' : ''
                }`}
              >
                {generating ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                    Generating Document...
                  </>
                ) : (
                  <>
                    <Sparkles size={20} />
                    Generate Document
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

// Helper function to generate PDF using jsPDF
async function generatePDFDocument(
  formData: any,
  template: any,
  club: any,
  lookupData: { clubs: any[]; venues: any[]; stateAssociations: any[] },
  formFields: FormField[] = []
): Promise<jsPDF> {
  if (template.template_type === 'html' && template.html_content) {
    return await generatePDFFromHTML(formData, template, club, lookupData, formFields);
  }

  // Legacy structured template processing
  console.log('⚠️ Using LEGACY structured template generation');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const contentWidth = pageWidth - (2 * margin);
  let yPos = margin;

  // Helper to add page break if needed
  const checkPageBreak = (requiredSpace: number = 15) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = margin;
      return true;
    }
    return false;
  };

  // Process each section
  const sections = template.sections || [];
  for (const section of sections) {
    checkPageBreak();

    switch (section.type) {
      case 'header_section':
        // Add logo if available (as base64)
        if (section.showLogo && template.logo_url) {
          try {
            const logoSize = 30;
            const logoX = (pageWidth - logoSize) / 2;
            doc.addImage(template.logo_url, 'JPEG', logoX, yPos, logoSize, logoSize);
            yPos += logoSize + 5;
          } catch (err) {
            console.error('Error adding logo:', err);
          }
        }

        // Add regatta name right after logo (extra bold, 16pt - same as NOTICE OF RACE title)
        if (formData.regatta_name) {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text(formData.regatta_name.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
          yPos += 10;
        }

        // Add date range first (below logo)
        if (formData.event_start_date) {
          doc.setFontSize(10);
          doc.setFont('helvetica', 'normal');
          // Format dates as dd/mm/yyyy
          const formatDate = (dateStr: string) => {
            const date = new Date(dateStr);
            const day = String(date.getDate()).padStart(2, '0');
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const year = date.getFullYear();
            return `${day}/${month}/${year}`;
          };
          let dateText = formatDate(formData.event_start_date);
          if (formData.event_end_date && formData.event_end_date !== formData.event_start_date) {
            dateText += ' - ' + formatDate(formData.event_end_date);
          }
          doc.text(dateText, pageWidth / 2, yPos, { align: 'center' });
          yPos += 6;
        }

        // Static ARYA text instead of dynamic organizers
        doc.text('AUSTRALIAN RADIO YACHTING ASSOCIATION INCORPORATED', pageWidth / 2, yPos, { align: 'center' });
        yPos += 6;

        // Add venue
        if (formData.regatta_location_description_for_title_page) {
          doc.text(formData.regatta_location_description_for_title_page, pageWidth / 2, yPos, { align: 'center' });
          yPos += 6;
        }

        // Add ranking status
        if (section.showRankingStatus) {
          doc.setFontSize(9);
          doc.setFont('helvetica', 'italic');
          doc.text('This is an ARYA Ranking Event', pageWidth / 2, yPos, { align: 'center' });
          yPos += 8;
        }

        // Add event name (before NOTICE OF RACE title)
        if (formData.event_name) {
          doc.setFontSize(14);
          doc.setFont('helvetica', 'bold');
          doc.text(formData.event_name.toUpperCase(), pageWidth / 2, yPos, { align: 'center' });
          yPos += 10;
        }

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        break;

      case 'heading':
        checkPageBreak();
        doc.setFont('helvetica', 'bold');
        const fontSize = section.level === 1 ? 14 : section.level === 2 ? 12 : 11;
        doc.setFontSize(fontSize);
        const headingText = stripHTML(processPlaceholders(section.content, formData, club, lookupData));
        if (section.alignment === 'center') {
          doc.text(headingText, pageWidth / 2, yPos, { align: 'center' });
        } else {
          doc.text(headingText, margin, yPos);
        }
        yPos += (fontSize / 2) + 4;
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        break;

      case 'paragraph':
      case 'numbered_list':
        doc.setFontSize(10);
        doc.setFont('helvetica', 'normal');

        // Process HTML content
        let htmlContent = processPlaceholders(section.content, formData, club, lookupData);
        const textContent = convertHTMLToPDFText(htmlContent, doc, margin, contentWidth, checkPageBreak);

        // Render the processed text with proper formatting
        for (let i = 0; i < textContent.length; i++) {
          const line = textContent[i];
          const nextLine = textContent[i + 1];

          checkPageBreak(10);

          // Set font style
          if (line.bold) doc.setFont('helvetica', 'bold');
          else doc.setFont('helvetica', 'normal');

          // Calculate indentation
          const baseIndent = line.indent * 8; // Base indent from quill editor
          const numberWidth = 15; // Space for number/letter prefix
          const hangingIndent = line.isNumbered ? numberWidth : 0;

          if (line.isNumbered && line.numberPrefix) {
            // Render numbered/lettered item with hanging indent
            const numberX = margin + baseIndent;
            const textX = margin + baseIndent + numberWidth;
            const textWidth = contentWidth - baseIndent - numberWidth;

            // Render the number/letter
            doc.text(line.numberPrefix, numberX, yPos);

            // Wrap and render the text with hanging indent
            const wrappedLines = doc.splitTextToSize(line.text, textWidth);
            for (let j = 0; j < wrappedLines.length; j++) {
              if (j > 0) checkPageBreak();
              doc.text(wrappedLines[j], textX, yPos);
              yPos += 4.5;
            }

            // Add extra spacing after main section numbers
            if (line.isMainSection) {
              yPos += 2;
            }
          } else {
            // Render regular paragraph
            const xPos = margin + baseIndent;
            const textWidth = contentWidth - baseIndent;
            const wrappedLines = doc.splitTextToSize(line.text, textWidth);

            for (const wrapped of wrappedLines) {
              checkPageBreak();
              doc.text(wrapped, xPos, yPos);
              yPos += 4.5;
            }
          }

          // Add spacing between different section levels
          if (nextLine) {
            // More space before main sections
            if (nextLine.isMainSection) {
              yPos += 3;
            }
            // Normal spacing between items
            else if (line.isNumbered || nextLine.isNumbered) {
              yPos += 1;
            }
          } else {
            yPos += 2; // End of section
          }
        }
        break;
    }
  }

  return doc;
}

function stripHTML(html: string): string {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
}

function convertHTMLToPDFText(html: string, doc: any, margin: number, contentWidth: number, checkPageBreak: Function): Array<{
  text: string;
  bold: boolean;
  indent: number;
  numberPrefix?: string;
  isNumbered: boolean;
  isMainSection: boolean;
}> {
  const lines: Array<{
    text: string;
    bold: boolean;
    indent: number;
    numberPrefix?: string;
    isNumbered: boolean;
    isMainSection: boolean;
  }> = [];

  // Create a temporary div to parse HTML
  const div = document.createElement('div');
  div.innerHTML = html;

  // Process each paragraph
  const paragraphs = div.querySelectorAll('p');
  paragraphs.forEach((p) => {
    let text = p.textContent?.trim() || '';
    if (!text || text === '') return;

    // Detect numbered/lettered items and extract prefix
    let numberPrefix = '';
    let isNumbered = false;
    let bodyText = text;

    // Match patterns: "1 ", "2.1 ", "3.5.2 ", "(a) ", "i) ", "E3.1:"
    const patterns = [
      /^(\d+(?:\.\d+)*)\s+/,  // 1, 2.1, 2.1.1
      /^(\([a-z]\))\s+/,       // (a), (b), (c)
      /^([a-z]\.)\s+/,         // a., b., c.
      /^([ivxIVX]+\))\s+/,     // i), ii), iii)
      /^([A-Z]\d+(?:\.\d+)*:)\s+/, // E3.1:, E5.1(a):
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        numberPrefix = match[1];
        bodyText = text.substring(match[0].length);
        isNumbered = true;
        break;
      }
    }

    // Determine if paragraph has strong tags (for bold text like section titles)
    const strongTags = p.querySelectorAll('strong');
    const isBold = strongTags.length > 0;

    // Check if this is a main section number (single digit at start with uppercase letter)
    const isMainSection = /^\d+\s+[A-Z]/.test(text);

    // Determine base indentation level from quill classes
    const classList = p.className;
    let indent = 0;
    if (classList.includes('ql-indent-1')) indent = 1;
    else if (classList.includes('ql-indent-2')) indent = 2;
    else if (classList.includes('ql-indent-3')) indent = 3;

    lines.push({
      text: bodyText,
      bold: isBold || isMainSection,
      indent,
      numberPrefix,
      isNumbered,
      isMainSection
    });
  });

  return lines;
}

function processPlaceholders(
  text: string,
  formData: any,
  club: any,
  lookupData: { clubs: any[]; venues: any[]; stateAssociations: any[] }
): string {
  let processed = text;

  // Replace form data placeholders with proper lookups
  Object.keys(formData).forEach(key => {
    const placeholder = `{{${key}}}`;
    let value = formData[key] || '';

    // Look up names for ID fields
    if (key === 'state_association' && value) {
      const stateAssoc = lookupData.stateAssociations.find(s => s.id === value);
      value = stateAssoc ? stateAssoc.name : value;
    } else if (key === 'clubs' && value) {
      const selectedClub = lookupData.clubs.find(c => c.id === value);
      value = selectedClub ? selectedClub.name : value;
    } else if (key === 'venue_id' && value) {
      const venue = lookupData.venues.find(v => v.id === value);
      value = venue ? venue.name : value;
    }

    // Convert underscores to spaces and capitalize properly for readability
    if (typeof value === 'string') {
      value = value.replace(/_/g, ' ');
    }

    processed = processed.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), value);
  });

  // Replace club placeholders
  if (club) {
    processed = processed.replace(/{{club_name}}/g, club.name || '');
    processed = processed.replace(/{{club_email}}/g, club.email || '');
  }

  return processed;
}

function generateDaySchedule(formData: any): string {
  const dayFields = Object.keys(formData).filter(key => key.startsWith('day_') && key.endsWith('_date'));
  const numDays = dayFields.length;

  if (numDays === 0) return '';

  let schedule = '';

  if (formData.day_1_date) {
    schedule += `Day One: ${formData.day_1_date}\n`;
    if (formData.registration_start_and_end_times_type_over_to_chan) {
      schedule += `Registration: ${formData.registration_start_and_end_times_type_over_to_chan}\n`;
    }
    if (formData.day_1_briefing_start_time_type_over_to_change) {
      schedule += `Briefing: ${formData.day_1_briefing_start_time_type_over_to_change}\n`;
    }
    schedule += '\n';
  }

  for (let i = 2; i <= numDays; i++) {
    const dayDateKey = `day_${i}_date`;
    if (formData[dayDateKey]) {
      const dayLabel = i === 2 ? 'Day Two' : i === 3 ? 'Day Three' : 'Day Four';
      schedule += `${dayLabel}: ${formData[dayDateKey]}\n`;
      const briefingKey = `day_${i}_briefing_start_time`;
      if (formData[briefingKey]) {
        schedule += `Briefing: ${formData[briefingKey]}\n`;
      }
      schedule += '\n';
    }
  }

  return schedule;
}

// Helper function to generate PDF from HTML template using html2canvas
function resolveFieldDisplayValue(key: string, rawValue: string, formFields: FormField[], lookupData: { clubs: any[]; venues: any[]; stateAssociations: any[] }): string {
  if (!rawValue) return rawValue;

  if (key === 'state_association' || key === 'state_association_id') {
    const assoc = lookupData.stateAssociations.find(a => a.id === rawValue);
    if (assoc) return assoc.name + (assoc.state ? ` (${assoc.state})` : '');
  }
  if (key === 'clubs' || key === 'club' || key === 'club_id') {
    const c = lookupData.clubs.find(c => c.id === rawValue);
    if (c) return c.name;
  }
  if (key === 'venue' || key === 'venue_id') {
    const v = lookupData.venues.find(v => v.id === rawValue);
    if (v) return v.name;
  }

  const field = formFields.find(f => f.field_name === key);
  if (field && field.options && field.options.length > 0) {
    const option = field.options.find(o => o.value === rawValue);
    if (option) return option.label;
  }

  if (typeof rawValue === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    const [y, m, d] = rawValue.split('-');
    return `${d}/${m}/${y.slice(2)}`;
  }

  if (typeof rawValue === 'string' && rawValue.includes('_') && !/^\d{4}[-_]\d{2}[-_]\d{2}/.test(rawValue) && !rawValue.includes('://') && !rawValue.includes('@')) {
    return rawValue.replace(/_/g, ' ');
  }

  return rawValue;
}

async function generatePDFFromHTML(
  formData: any,
  template: any,
  club: any,
  lookupData: { clubs: any[]; venues: any[]; stateAssociations: any[] },
  formFields: FormField[] = []
): Promise<jsPDF> {
  let processedHTML = template.html_content;

  const resolvedFormData: Record<string, string> = {};
  Object.keys(formData).forEach((key) => {
    const value = formData[key] || "";
    resolvedFormData[key] = resolveFieldDisplayValue(key, value, formFields, lookupData);
  });

  Object.keys(resolvedFormData).forEach((key) => {
    const placeholder = `{{${key}}}`;
    const value = resolvedFormData[key];
    processedHTML = processedHTML.replace(new RegExp(placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), "g"), value);
  });

  if (club) {
    processedHTML = processedHTML.replace(/{{club_name}}/g, club.name || "");
    processedHTML = processedHTML.replace(/{{club_email}}/g, club.email || "");
    processedHTML = processedHTML.replace(/{{club_website}}/g, club.website || "");
  }

  processedHTML = processedHTML.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, (_match, y, m, d) => {
    return `${d}/${m}/${y.slice(2)}`;
  });

  processedHTML = processedHTML.replace(/{{[^}]+}}/g, '');

  let logoDataUrl = '';
  if (template.logo_url) {
    const logoUrl: string = template.logo_url;
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';

    if (supabaseUrl && logoUrl.includes(supabaseUrl)) {
      try {
        const pathMatch = logoUrl.match(/\/storage\/v1\/object\/(?:public|sign)\/([^?]+)/);
        if (pathMatch) {
          const fullPath = decodeURIComponent(pathMatch[1]);
          const slashIdx = fullPath.indexOf('/');
          const bucket = fullPath.substring(0, slashIdx);
          const filePath = fullPath.substring(slashIdx + 1);
          const { data } = await supabase.storage.from(bucket).download(filePath);
          if (data) {
            logoDataUrl = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onloadend = () => resolve(reader.result as string);
              reader.readAsDataURL(data);
            });
          }
        }
      } catch (e) {
        console.warn('Supabase storage download failed:', e);
      }
    }

    if (!logoDataUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        await new Promise<void>((resolve) => {
          img.onload = () => {
            try {
              const canvas = document.createElement('canvas');
              canvas.width = img.naturalWidth;
              canvas.height = img.naturalHeight;
              const ctx = canvas.getContext('2d');
              if (ctx) {
                ctx.drawImage(img, 0, 0);
                logoDataUrl = canvas.toDataURL('image/png');
              }
            } catch (_) {}
            resolve();
          };
          img.onerror = () => resolve();
          setTimeout(resolve, 5000);
          img.src = logoUrl;
        });
      } catch (_) {}
    }

    if (!logoDataUrl) {
      try {
        const resp = await fetch(logoUrl);
        if (resp.ok) {
          const blob = await resp.blob();
          logoDataUrl = await new Promise<string>((resolve) => {
            const reader = new FileReader();
            reader.onloadend = () => resolve(reader.result as string);
            reader.readAsDataURL(blob);
          });
        }
      } catch (_) {}
    }
  }

  const A4_WIDTH_PX = 794;
  const A4_HEIGHT_PX = 1123;
  const SCALE = 2;
  const MARGIN_MM = 20;
  const FOOTER_HEIGHT_MM = 12;
  const CONTENT_HEIGHT_MM = 297 - MARGIN_MM - MARGIN_MM - FOOTER_HEIGHT_MM;

  const documentStyles = `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html { background: white; }
    .pdf-page {
      width: ${A4_WIDTH_PX}px;
      background: white;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.6;
      color: #1a1a1a;
    }
    .pdf-content {
      white-space: pre-wrap;
      tab-size: 4;
    }
    .pdf-content h1 {
      font-size: 24px;
      font-weight: 700;
      margin-top: 1em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    .pdf-content h2 {
      font-size: 20px;
      font-weight: 700;
      margin-top: 1em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    .pdf-content h3 {
      font-size: 18px;
      font-weight: 700;
      margin-top: 0.75em;
      margin-bottom: 0.5em;
      line-height: 1.3;
    }
    .pdf-content p {
      margin-bottom: 1.25em;
      white-space: pre-wrap;
    }
    .pdf-content ol, .pdf-content ul {
      margin-left: 1.5em;
      margin-bottom: 1.25em;
    }
    .pdf-content li {
      margin-bottom: 0.25em;
      line-height: 1.6;
    }
    .pdf-content strong { font-weight: 700; }
    .pdf-content em { font-style: italic; }
    .pdf-content u { text-decoration: underline; }
    .pdf-content s { text-decoration: line-through; }
    .pdf-content .ql-align-center { text-align: center; }
    .pdf-content .ql-align-right { text-align: right; }
    .pdf-content .ql-align-justify { text-align: justify; }
    .pdf-content .ql-indent-1 { padding-left: 3em; }
    .pdf-content .ql-indent-2 { padding-left: 6em; }
    .pdf-content .ql-indent-3 { padding-left: 9em; }
    .pdf-content .hanging-indent { padding-left: 3em; text-indent: -3em; }
    .pdf-content a { color: #1a1a1a; text-decoration: underline; }
    .pdf-content img { max-width: 100%; height: auto; }
    .pdf-content br { display: inline; content: ''; }
    .pdf-logo { display: block; margin: 0 auto 24px; max-width: 120px; max-height: 120px; object-fit: contain; }
    .pdf-footer {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      text-align: center;
      font-size: 10px;
      color: #888;
      border-top: 1px solid #ddd;
      padding-top: 6px;
    }
  `;

  const paddingPx = Math.round((MARGIN_MM / 210) * A4_WIDTH_PX);

  const measuringContainer = document.createElement('div');
  measuringContainer.style.position = 'absolute';
  measuringContainer.style.left = '-9999px';
  measuringContainer.style.top = '0';

  const styleEl = document.createElement('style');
  styleEl.textContent = documentStyles;
  measuringContainer.appendChild(styleEl);

  const measurePage = document.createElement('div');
  measurePage.className = 'pdf-page';
  measurePage.style.padding = `${paddingPx}px`;

  let logoHTML = '';
  if (logoDataUrl || template.logo_url) {
    const logoSrc = logoDataUrl || template.logo_url;
    logoHTML = `<img class="pdf-logo" src="${logoSrc}" />`;
  }

  measurePage.innerHTML = `${logoHTML}<div class="pdf-content">${processedHTML}</div>`;
  measuringContainer.appendChild(measurePage);
  document.body.appendChild(measuringContainer);

  try {
    const images = measuringContainer.getElementsByTagName('img');
    await Promise.all(
      Array.from(images).map(img => {
        if (img.complete) return Promise.resolve();
        return new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => resolve();
          setTimeout(resolve, 5000);
        });
      })
    );

    const contentAreaHeightPx = Math.round((CONTENT_HEIGHT_MM / 297) * A4_HEIGHT_PX);

    const contentDiv = measurePage.querySelector('.pdf-content');
    const allBlockElements: HTMLElement[] = [];
    if (contentDiv) {
      const BLOCK_TAGS = /^(P|H[1-6]|DIV|BLOCKQUOTE|TABLE|HR|PRE|SECTION|ARTICLE|HEADER|FOOTER|NAV|ASIDE|FIGURE)$/;
      const collectLeafBlocks = (parent: Element) => {
        Array.from(parent.children).forEach(child => {
          const el = child as HTMLElement;
          if (!el.tagName) return;
          const tag = el.tagName.toUpperCase();
          const display = getComputedStyle(el).display;

          if (display === 'none') return;
          if (display === 'inline' || display === 'inline-block') return;

          if (tag === 'UL' || tag === 'OL') {
            Array.from(el.children).forEach(li => {
              const liEl = li as HTMLElement;
              if (liEl.tagName?.toUpperCase() === 'LI') {
                allBlockElements.push(liEl);
              }
            });
            return;
          }

          let hasBlockChildren = false;
          for (const ch of Array.from(el.children)) {
            const chEl = ch as HTMLElement;
            if (!chEl.tagName) continue;
            const chTag = chEl.tagName.toUpperCase();
            const chDisplay = getComputedStyle(chEl).display;
            if (chDisplay === 'block' || chDisplay === 'list-item' || chDisplay === 'flex' || chDisplay === 'grid' ||
                BLOCK_TAGS.test(chTag) || chTag === 'UL' || chTag === 'OL' || chTag === 'LI') {
              hasBlockChildren = true;
              break;
            }
          }

          if (hasBlockChildren) {
            collectLeafBlocks(el);
          } else if (display === 'block' || display === 'list-item' || BLOCK_TAGS.test(tag)) {
            allBlockElements.push(el);
          }
        });
      };
      collectLeafBlocks(contentDiv);
    }

    const measureRect = measurePage.getBoundingClientRect();
    const contentOrigin = measureRect.top + paddingPx;
    const breakOffsets: number[] = [0];
    let nextBoundary = contentAreaHeightPx;
    const SAFETY_MARGIN = 4;

    for (const el of allBlockElements) {
      const rect = el.getBoundingClientRect();
      const elTop = rect.top - contentOrigin;
      const elBottom = rect.bottom - contentOrigin;

      if (elBottom > nextBoundary - SAFETY_MARGIN && elTop > breakOffsets[breakOffsets.length - 1] + SAFETY_MARGIN) {
        breakOffsets.push(elTop);
        nextBoundary = elTop + contentAreaHeightPx;
      }

      if (el.offsetHeight > contentAreaHeightPx && elTop >= breakOffsets[breakOffsets.length - 1]) {
        const baseOffset = breakOffsets[breakOffsets.length - 1];
        let extra = baseOffset + contentAreaHeightPx;
        while (extra < elBottom) {
          breakOffsets.push(extra);
          extra += contentAreaHeightPx;
        }
        nextBoundary = extra;
      }
    }

    const totalPages = breakOffsets.length;

    document.body.removeChild(measuringContainer);

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
      compress: true
    });

    const footerText = template.footer_text || '';

    for (let pageNum = 0; pageNum < totalPages; pageNum++) {
      if (pageNum > 0) pdf.addPage();

      const pageOffset = breakOffsets[pageNum];

      const pageContainer = document.createElement('div');
      pageContainer.style.position = 'absolute';
      pageContainer.style.left = '-9999px';
      pageContainer.style.top = '0';

      const pageStyle = document.createElement('style');
      pageStyle.textContent = documentStyles;
      pageContainer.appendChild(pageStyle);

      const pageDiv = document.createElement('div');
      pageDiv.className = 'pdf-page';
      pageDiv.style.width = `${A4_WIDTH_PX}px`;
      pageDiv.style.height = `${A4_HEIGHT_PX}px`;
      pageDiv.style.padding = `${paddingPx}px`;
      pageDiv.style.position = 'relative';
      pageDiv.style.overflow = 'hidden';

      const contentWrapper = document.createElement('div');
      contentWrapper.style.position = 'relative';
      contentWrapper.style.top = `-${pageOffset}px`;
      contentWrapper.style.width = '100%';
      contentWrapper.innerHTML = `${logoHTML}<div class="pdf-content">${processedHTML}</div>`;

      const nextOffset = pageNum < totalPages - 1 ? breakOffsets[pageNum + 1] : pageOffset + contentAreaHeightPx;
      const clipHeight = Math.min(nextOffset - pageOffset, contentAreaHeightPx);

      const clipper = document.createElement('div');
      clipper.style.overflow = 'hidden';
      clipper.style.height = `${clipHeight}px`;
      clipper.appendChild(contentWrapper);
      pageDiv.appendChild(clipper);

      if (footerText) {
        const footer = document.createElement('div');
        footer.className = 'pdf-footer';
        footer.style.position = 'absolute';
        footer.style.bottom = `${paddingPx}px`;
        footer.style.left = `${paddingPx}px`;
        footer.style.right = `${paddingPx}px`;
        footer.textContent = footerText
          .replace(/\{page\}/g, String(pageNum + 1))
          .replace(/\{pages\}/g, String(totalPages));
        pageDiv.appendChild(footer);
      }

      pageContainer.appendChild(pageDiv);
      document.body.appendChild(pageContainer);

      const pageImages = pageContainer.getElementsByTagName('img');
      await Promise.all(
        Array.from(pageImages).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(resolve, 5000);
          });
        })
      );

      const canvas = await html2canvas(pageDiv, {
        scale: SCALE,
        useCORS: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: A4_WIDTH_PX,
        height: A4_HEIGHT_PX
      });

      const imgData = canvas.toDataURL('image/png');
      pdf.addImage(imgData, 'PNG', 0, 0, 210, 297, `page-${pageNum}`, 'FAST');

      document.body.removeChild(pageContainer);
    }

    return pdf;
  } catch (error) {
    console.error('Error generating PDF from HTML:', error);
    const leftover = document.querySelector('[style*="-9999px"]');
    if (leftover) leftover.remove();
    throw error;
  }
}
