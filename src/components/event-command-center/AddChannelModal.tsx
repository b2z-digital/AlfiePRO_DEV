import React, { useState } from 'react';
import { X, Hash, Lock } from 'lucide-react';

interface AddChannelModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, type: string, isPrivate: boolean) => void;
  darkMode: boolean;
}

export const AddChannelModal: React.FC<AddChannelModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  darkMode,
}) => {
  const [channelName, setChannelName] = useState('');
  const [channelType, setChannelType] = useState('general');
  const [isPrivate, setIsPrivate] = useState(false);

  const channelTypes = [
    { id: 'general', name: 'General', description: 'General discussions' },
    { id: 'logistics', name: 'Logistics', description: 'Event logistics and coordination' },
    { id: 'marketing', name: 'Marketing', description: 'Marketing and promotion' },
    { id: 'race_management', name: 'Race Management', description: 'Race operations' },
    { id: 'social', name: 'Social', description: 'Social events and activities' },
  ];

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (channelName.trim()) {
      onSubmit(channelName.trim(), channelType, isPrivate);
      setChannelName('');
      setChannelType('general');
      setIsPrivate(false);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div
        className={`
          w-full max-w-md rounded-xl shadow-2xl
          ${darkMode ? 'bg-gray-800' : 'bg-white'}
        `}
      >
        <div className={`flex items-center justify-between p-6 border-b ${darkMode ? 'border-gray-700' : 'border-gray-200'}`}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-blue-600 flex items-center justify-center">
              <Hash className="w-5 h-5 text-white" />
            </div>
            <h2 className={`text-xl font-bold ${darkMode ? 'text-white' : 'text-gray-900'}`}>
              Create Chat Channel
            </h2>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-lg transition-colors ${
              darkMode ? 'hover:bg-gray-700 text-gray-400' : 'hover:bg-gray-100 text-gray-600'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Channel Name
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="e.g., event-planning"
              autoFocus
              className={`
                w-full px-4 py-2 rounded-lg border
                ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-white border-gray-300 text-gray-900'}
                focus:outline-none focus:ring-2 focus:ring-blue-500
              `}
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-3 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
              Channel Type
            </label>
            <div className="space-y-2">
              {channelTypes.map((type) => (
                <button
                  key={type.id}
                  type="button"
                  onClick={() => setChannelType(type.id)}
                  className={`
                    w-full p-3 rounded-lg text-left transition-all
                    ${
                      channelType === type.id
                        ? 'bg-blue-600 text-white'
                        : darkMode
                        ? 'bg-gray-700 text-gray-200 hover:bg-gray-600'
                        : 'bg-gray-50 text-gray-900 hover:bg-gray-100'
                    }
                  `}
                >
                  <div className="font-medium">{type.name}</div>
                  <div className={`text-xs mt-1 ${channelType === type.id ? 'text-blue-100' : 'text-gray-500'}`}>
                    {type.description}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPrivate}
                onChange={(e) => setIsPrivate(e.target.checked)}
                className="w-5 h-5 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <div>
                <div className={`font-medium flex items-center gap-2 ${darkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                  <Lock className="w-4 h-4" />
                  Private Channel
                </div>
                <div className={`text-xs ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Only invited members can see this channel
                </div>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className={`
                flex-1 px-4 py-2 rounded-lg font-medium transition-colors
                ${darkMode ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}
              `}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!channelName.trim()}
              className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Create Channel
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
