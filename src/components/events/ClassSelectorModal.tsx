import React from 'react';
import { X, FileText, UserPlus, ChevronRight } from 'lucide-react';

interface YachtClass {
  id: string;
  class_name: string;
  event_id: string;
  event_name: string;
}

interface ClassSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
  classes: YachtClass[];
  onSelect: (yachtClass: YachtClass) => void;
  type: 'nor' | 'register';
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

export const ClassSelectorModal: React.FC<ClassSelectorModalProps> = ({
  isOpen,
  onClose,
  classes,
  onSelect,
  type
}) => {
  if (!isOpen) return null;

  const getHeaderConfig = () => {
    if (type === 'nor') {
      return {
        title: 'Select Your Class',
        subtitle: 'View Notice of Race',
        gradient: 'from-slate-600 to-slate-800',
        icon: <FileText className="w-6 h-6" />
      };
    }
    return {
      title: 'Select Your Class',
      subtitle: 'Complete Registration',
      gradient: 'from-blue-600 to-blue-800',
      icon: <UserPlus className="w-6 h-6" />
    };
  };

  const config = getHeaderConfig();

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-lg w-full overflow-hidden transform animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modern Header with Gradient */}
        <div className={`relative bg-gradient-to-br ${config.gradient} px-8 py-8 text-white overflow-hidden`}>
          <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGRlZnM+PHBhdHRlcm4gaWQ9ImdyaWQiIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgcGF0dGVyblVuaXRzPSJ1c2VyU3BhY2VPblVzZSI+PHBhdGggZD0iTSAwIDEwIEwgNDAgMTAgTSAxMCAwIEwgMTAgNDAgTSAwIDIwIEwgNDAgMjAgTSAyMCAwIEwgMjAgNDAgTSAwIDMwIEwgNDAgMzAgTSAzMCAwIEwgMzAgNDAiIGZpbGw9Im5vbmUiIHN0cm9rZT0id2hpdGUiIHN0cm9rZS1vcGFjaXR5PSIwLjAzIiBzdHJva2Utd2lkdGg9IjEiLz48L3BhdHRlcm4+PC9kZWZzPjxyZWN0IHdpZHRoPSIxMDAlIiBoZWlnaHQ9IjEwMCUiIGZpbGw9InVybCgjZ3JpZCkiLz48L3N2Zz4=')] opacity-40"></div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            className="absolute top-4 right-4 p-3 rounded-full bg-white/10 hover:bg-white/20 backdrop-blur-sm transition-all duration-200 group z-20"
            aria-label="Close modal"
          >
            <X size={20} className="text-white group-hover:rotate-90 transition-transform duration-200" />
          </button>

          <div className="relative flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center shadow-lg">
              {config.icon}
            </div>
            <div className="flex-1">
              <h3 className="text-2xl font-bold tracking-tight">
                {config.title}
              </h3>
              <p className="text-white/90 mt-1 font-medium">
                {config.subtitle}
              </p>
            </div>
          </div>
        </div>

        {/* Class Options */}
        <div className="p-6 space-y-3 bg-gradient-to-b from-slate-50 to-white max-h-[60vh] overflow-y-auto">
          {classes.map((yachtClass, index) => (
            <button
              key={`${yachtClass.id}-${yachtClass.class_name}`}
              onClick={() => onSelect(yachtClass)}
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
                        {type === 'nor' ? 'View' : 'Register'}
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
};
