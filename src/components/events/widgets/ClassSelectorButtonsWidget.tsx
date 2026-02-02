import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../utils/supabase';
import { FileText, UserPlus, X, ChevronRight } from 'lucide-react';

interface YachtClass {
  id: string;
  class_name: string;
  event_id: string;
  event_name: string;
}

// Alfie Sails Logo Component
const AlfieSailsLogo: React.FC<{ className?: string }> = ({ className = "w-7 h-7" }) => (
  <svg
    viewBox="0 0 129.43 201.4"
    className={className}
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M92.63.1s-33.4,35.9-46.9,76.9-18,123-18,123c53.9-26.1,87.1-5.1,101.7,1.4C76.03,145.2,92.63,0,92.63,0v.1Z"
      fill="currentColor"
      opacity="0.85"
    />
    <path
      d="M45.43,35.4s-23.9,31.1-37.4,61.2-5.9,88.2-5.9,88.2c22.2-23.9,68.8-19.1,68.8-19.1C33.83,122.7,45.33,35.4,45.33,35.4h.1Z"
      fill="currentColor"
    />
  </svg>
);

interface ClassSelectorButtonsWidgetProps {
  settings: {
    nor_button_text?: string;
    register_button_text?: string;
    nor_button_color?: string;
    register_button_color?: string;
    text_color?: string;
    alignment?: 'left' | 'center' | 'right';
    button_style?: 'solid' | 'outline';
    size?: 'sm' | 'md' | 'lg';
  };
  eventWebsiteId: string;
  onRegisterClick?: (eventId: string, className: string) => void;
}

export const ClassSelectorButtonsWidget: React.FC<ClassSelectorButtonsWidgetProps> = ({
  settings,
  eventWebsiteId,
  onRegisterClick
}) => {
  const [classes, setClasses] = useState<YachtClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [modalType, setModalType] = useState<'nor' | 'register' | null>(null);

  useEffect(() => {
    loadClasses();
  }, [eventWebsiteId]);

  const loadClasses = async () => {
    try {
      setLoading(true);

      // Get all events associated with this event website
      const { data: websiteEvents, error: eventsError } = await supabase
        .from('event_website_all_events')
        .select('all_events')
        .eq('event_website_id', eventWebsiteId)
        .single();

      if (eventsError) throw eventsError;

      if (!websiteEvents?.all_events || websiteEvents.all_events.length === 0) {
        setClasses([]);
        return;
      }

      const eventIds = websiteEvents.all_events.map((e: any) => e.id);

      // Get race classes for each event from public_events table
      const { data: eventsData, error: classesError } = await supabase
        .from('public_events')
        .select('id, event_name, race_class, date')
        .in('id', eventIds)
        .order('date', { ascending: true });

      if (classesError) throw classesError;

      // Extract unique classes with their associated events
      const classesMap = new Map<string, YachtClass>();
      eventsData?.forEach((event) => {
        if (event.race_class) {
          const key = `${event.race_class}-${event.id}`;
          classesMap.set(key, {
            id: event.id,
            class_name: event.race_class,
            event_id: event.id,
            event_name: event.event_name
          });
        }
      });

      // Convert to array and sort by event date
      const classesArray = Array.from(classesMap.values());
      classesArray.sort((a: any, b: any) => {
        const dateA = eventsData?.find((e) => e.id === a.id)?.date;
        const dateB = eventsData?.find((e) => e.id === b.id)?.date;
        if (!dateA || !dateB) return 0;
        return new Date(dateA).getTime() - new Date(dateB).getTime();
      });

      setClasses(classesArray);
    } catch (error) {
      console.error('Error loading classes:', error);
      setClasses([]);
    } finally {
      setLoading(false);
    }
  };

  const handleButtonClick = (type: 'nor' | 'register') => {
    if (classes.length === 0) {
      alert('No classes available');
      return;
    }

    if (classes.length === 1) {
      // If only one class, go directly to it
      handleClassSelect(classes[0], type);
    } else {
      // Show modal to select class
      setModalType(type);
      setShowModal(true);
    }
  };

  const handleClassSelect = async (yachtClass: YachtClass, type: 'nor' | 'register') => {
    setShowModal(false);

    if (type === 'nor') {
      try {
        console.log('[Widget NOR] Looking for NOR document:', {
          eventWebsiteId,
          className: yachtClass.class_name,
          eventId: yachtClass.event_id
        });

        // Query the event_website_documents table for NOR documents
        const { data: norDocuments, error: dbError } = await supabase
          .from('event_website_documents')
          .select('*')
          .eq('event_website_id', eventWebsiteId)
          .eq('document_type', 'nor')
          .eq('is_published', true)
          .order('created_at', { ascending: false });

        console.log('[Widget NOR] Documents from database:', norDocuments, 'Error:', dbError);

        if (!dbError && norDocuments && norDocuments.length > 0) {
          // First try: Find document with class name in title or filename
          let norDoc = norDocuments.find(doc => {
            const titleLower = (doc.title || '').toLowerCase();
            const urlLower = (doc.file_url || '').toLowerCase();
            const classLower = yachtClass.class_name.toLowerCase();

            return titleLower.includes(classLower) || urlLower.includes(classLower);
          });

          // If no class-specific document, use the most recent NOR
          if (!norDoc && norDocuments.length > 0) {
            norDoc = norDocuments[0];
            console.log('[Widget NOR] No class-specific NOR found, using general NOR:', norDoc.title);
          }

          if (norDoc) {
            console.log('[Widget NOR] Found NOR document:', norDoc.title, norDoc.file_url);
            window.open(norDoc.file_url, '_blank');
            return;
          }
        }

        // Fallback 2: Check the event's direct notice_of_race_url field
        console.log('[Widget NOR] No documents in database, checking event record...');
        const { data: eventData, error: eventError } = await supabase
          .from('public_events')
          .select('notice_of_race_url')
          .eq('id', yachtClass.event_id)
          .maybeSingle();

        if (!eventError && eventData?.notice_of_race_url) {
          console.log('[Widget NOR] Found NOR on event record:', eventData.notice_of_race_url);
          window.open(eventData.notice_of_race_url, '_blank');
          return;
        }

        // Fallback 3: Try checking storage directly for uploaded files
        console.log('[Widget NOR] Checking storage...');
        const { data: files, error: storageError } = await supabase.storage
          .from('event-documents')
          .list(eventWebsiteId);

        console.log('[Widget NOR] Files in storage:', files?.map(f => f.name));

        if (!storageError && files && files.length > 0) {
          // Look for NOR document in filenames
          const norFile = files.find(file => {
            const nameLower = file.name.toLowerCase();
            const hasNor = nameLower.includes('nor') || nameLower.includes('notice');
            const isPdf = nameLower.endsWith('.pdf');
            // Exclude non-race documents
            const isExcluded = nameLower.includes('membership') || nameLower.includes('application');

            return hasNor && isPdf && !isExcluded;
          });

          if (norFile) {
            const { data: urlData } = supabase.storage
              .from('event-documents')
              .getPublicUrl(`${eventWebsiteId}/${norFile.name}`);

            if (urlData?.publicUrl) {
              console.log('[Widget NOR] Found NOR in storage:', norFile.name);
              window.open(urlData.publicUrl, '_blank');
              return;
            }
          }
        }

        // If no document found, fallback to NOR generator
        console.warn('[Widget NOR] No NOR document found, using generator');
        window.open(`/nor-generator?event=${yachtClass.event_id}&class=${yachtClass.class_name}`, '_blank');
      } catch (err) {
        console.error('[Widget NOR] Error fetching NOR document:', err);
        // Fallback to generator on error
        window.open(`/nor-generator?event=${yachtClass.event_id}&class=${yachtClass.class_name}`, '_blank');
      }
    } else if (type === 'register') {
      // Trigger registration for this event
      if (onRegisterClick) {
        onRegisterClick(yachtClass.event_id, yachtClass.class_name);
      }
    }
  };

  const getAlignmentClass = () => {
    switch (settings.alignment) {
      case 'left': return 'justify-start';
      case 'right': return 'justify-end';
      case 'center':
      default: return 'justify-center';
    }
  };

  const getSizeClasses = () => {
    switch (settings.size) {
      case 'sm': return 'px-4 py-2 text-sm';
      case 'lg': return 'px-8 py-4 text-lg';
      case 'md':
      default: return 'px-6 py-3';
    }
  };

  const getButtonClasses = (bgColor: string) => {
    const baseClasses = `${getSizeClasses()} font-semibold transition-all duration-200 hover:scale-105 hover:shadow-lg flex items-center gap-2 rounded-lg`;

    if (settings.button_style === 'outline') {
      return `${baseClasses} border-2 bg-transparent`;
    }
    return `${baseClasses} shadow-md`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-cyan-500"></div>
      </div>
    );
  }

  if (classes.length === 0) {
    return (
      <div className="flex items-center justify-center py-8 px-4">
        <div className="text-center bg-blue-50 rounded-lg p-6 border-2 border-blue-200">
          <FileText className="mx-auto mb-3 text-blue-500" size={32} />
          <p className="text-blue-900 font-medium mb-1">No Classes Found</p>
          <p className="text-sm text-blue-700">
            Add events to this website or ensure events have yacht classes assigned
          </p>
        </div>
      </div>
    );
  }

  const norButtonText = settings.nor_button_text || 'Notice of Race';
  const registerButtonText = settings.register_button_text || 'Register';
  const norButtonColor = settings.nor_button_color || '#3b82f6';
  const registerButtonColor = settings.register_button_color || '#f97316';
  const textColor = settings.text_color || '#ffffff';

  const modalContent = showModal && (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in duration-200"
      style={{ zIndex: 9999 }}
      onClick={() => setShowModal(false)}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Header with Gradient */}
        <div className={`relative bg-gradient-to-br ${modalType === 'nor' ? 'from-slate-600 to-slate-800' : 'from-blue-600 to-blue-800'} px-8 py-8 text-white overflow-hidden`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              setShowModal(false);
            }}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 group z-20"
            aria-label="Close modal"
          >
            <X size={20} className="text-white group-hover:rotate-90 transition-transform duration-200" />
          </button>

          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              {modalType === 'nor' ? (
                <FileText className="w-6 h-6" />
              ) : (
                <UserPlus className="w-6 h-6" />
              )}
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold tracking-tight">
                Select Your Class
              </h3>
              <p className="text-white/90 mt-1 font-medium">
                {modalType === 'nor' ? 'View Notice of Race' : 'Complete Registration'}
              </p>
            </div>
          </div>
        </div>

        {/* Class Options */}
        <div className="p-6 space-y-3 bg-gradient-to-b from-slate-50 to-white max-h-[60vh] overflow-y-auto">
          {classes.map((yachtClass, index) => (
            <button
              key={`${yachtClass.id}-${yachtClass.class_name}`}
              onClick={() => handleClassSelect(yachtClass, modalType!)}
              className="w-full group relative"
              style={{
                animation: `fadeInUp 0.3s ease-out ${index * 0.05}s both`
              }}
            >
              <div className="relative bg-white rounded-xl p-5 shadow-sm border-2 border-slate-200 hover:border-blue-400 hover:shadow-lg transition-all duration-200 overflow-hidden">
                {/* Hover gradient effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-blue-50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200"></div>

                <div className="relative flex items-center justify-between">
                  <div className="flex items-center gap-4 flex-1">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-slate-100 to-slate-200 group-hover:from-blue-100 group-hover:to-blue-200 flex items-center justify-center shadow-sm transition-all duration-200">
                      <AlfieSailsLogo className="w-7 h-7 text-slate-600 group-hover:text-blue-600 transition-colors duration-200" />
                    </div>

                    <div className="flex-1 text-left">
                      <h4 className="text-xl font-bold text-slate-900 group-hover:text-blue-600 transition-colors duration-200">
                        {yachtClass.class_name}
                      </h4>
                      <p className="text-sm text-slate-600 mt-0.5 font-medium">
                        {yachtClass.event_name}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-100 group-hover:bg-blue-100 transition-colors duration-200">
                      <span className="text-xs font-semibold text-slate-600 group-hover:text-blue-600 transition-colors duration-200">
                        {modalType === 'nor' ? 'View' : 'Register'}
                      </span>
                    </div>
                    <ChevronRight className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200">
          <p className="text-xs text-center text-slate-500">
            Select a class to continue
          </p>
        </div>
      </div>

      <style>{`
        @keyframes fadeInUp {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );

  return (
    <>
      <div className={`flex flex-wrap ${getAlignmentClass()} gap-4 py-4`}>
        {/* Notice of Race Button */}
        <button
          onClick={() => handleButtonClick('nor')}
          className={getButtonClasses(norButtonColor)}
          style={{
            backgroundColor: settings.button_style === 'solid' ? norButtonColor : 'transparent',
            color: textColor,
            borderColor: settings.button_style === 'outline' ? norButtonColor : 'transparent'
          }}
        >
          <FileText size={20} />
          {norButtonText}
        </button>

        {/* Register Button */}
        <button
          onClick={() => handleButtonClick('register')}
          className={getButtonClasses(registerButtonColor)}
          style={{
            backgroundColor: settings.button_style === 'solid' ? registerButtonColor : 'transparent',
            color: textColor,
            borderColor: settings.button_style === 'outline' ? registerButtonColor : 'transparent'
          }}
        >
          <UserPlus size={20} />
          {registerButtonText}
        </button>
      </div>

      {/* Class Selection Modal - Rendered via Portal */}
      {showModal && typeof document !== 'undefined' && createPortal(
        modalContent,
        document.body
      )}
    </>
  );
};

// Widget configuration for the event widget registry
export const classSelectorButtonsWidgetConfig = {
  id: 'class-selector-buttons',
  name: 'Class Selector Buttons',
  icon: 'Target',
  category: 'interactive',
  description: 'NOR and Registration buttons with class selection for multi-class events',
  defaultSettings: {
    nor_button_text: 'Notice of Race',
    register_button_text: 'Register',
    nor_button_color: '#3b82f6',
    register_button_color: '#f97316',
    text_color: '#ffffff',
    alignment: 'center',
    button_style: 'solid',
    size: 'md'
  },
  settingsSchema: [
    {
      key: 'nor_button_text',
      label: 'NOR Button Text',
      type: 'text'
    },
    {
      key: 'register_button_text',
      label: 'Register Button Text',
      type: 'text'
    },
    {
      key: 'nor_button_color',
      label: 'NOR Button Color',
      type: 'color'
    },
    {
      key: 'register_button_color',
      label: 'Register Button Color',
      type: 'color'
    },
    {
      key: 'text_color',
      label: 'Text Color',
      type: 'color'
    },
    {
      key: 'alignment',
      label: 'Button Alignment',
      type: 'select',
      options: [
        { value: 'left', label: 'Left' },
        { value: 'center', label: 'Center' },
        { value: 'right', label: 'Right' }
      ]
    },
    {
      key: 'button_style',
      label: 'Button Style',
      type: 'select',
      options: [
        { value: 'solid', label: 'Solid' },
        { value: 'outline', label: 'Outline' }
      ]
    },
    {
      key: 'size',
      label: 'Button Size',
      type: 'select',
      options: [
        { value: 'sm', label: 'Small' },
        { value: 'md', label: 'Medium' },
        { value: 'lg', label: 'Large' }
      ]
    }
  ]
};
