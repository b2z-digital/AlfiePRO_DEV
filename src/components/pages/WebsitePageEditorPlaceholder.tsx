import React from 'react';
import { ArrowLeft, Construction } from 'lucide-react';

interface WebsitePageEditorPlaceholderProps {
  onBack: () => void;
}

const WebsitePageEditorPlaceholder: React.FC<WebsitePageEditorPlaceholderProps> = ({ onBack }) => {
  return (
    <div className="h-full flex flex-col bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-slate-800 border-b border-slate-700">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-white transition-colors"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <h1 className="text-xl font-semibold text-white">Page Editor</h1>
        <div className="w-20"></div>
      </div>

      {/* Content */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          <Construction size={64} className="mx-auto mb-4 text-slate-600" />
          <h2 className="text-2xl font-bold text-white mb-2">Page Editor Under Construction</h2>
          <p className="text-slate-400">
            The advanced page editor is currently being updated. Please check back soon!
          </p>
        </div>
      </div>
    </div>
  );
};

export default WebsitePageEditorPlaceholder;
