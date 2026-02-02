import React, { useState, useRef } from 'react';
import { X, Save, RotateCcw, Mail } from 'lucide-react';
import { WysiwygEditor } from './WysiwygEditor';

interface EmailTemplateEditorProps {
  isOpen: boolean;
  onClose: () => void;
  templateKey: string;
  initialSubject: string;
  initialBody: string;
  onSave: (templateKey: string, subject: string, body: string) => void;
  onRestoreDefault?: (templateKey: string) => void;
  onSendTest?: (templateKey: string, subject: string, body: string) => Promise<void>;
  darkMode: boolean;
}

export const EmailTemplateEditor: React.FC<EmailTemplateEditorProps> = ({
  isOpen,
  onClose,
  templateKey,
  initialSubject,
  initialBody,
  onSave,
  onRestoreDefault,
  onSendTest,
  darkMode
}) => {
  const [subject, setSubject] = useState(initialSubject);
  const [body, setBody] = useState(initialBody);
  const [saving, setSaving] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);

  if (!isOpen) return null;

  const getTemplateName = () => {
    switch (templateKey) {
      case 'welcome':
        return 'Welcome Email';
      case 'renewal':
        return 'Renewal Reminder';
      case 'event':
        return 'Event Invitation';
      default:
        return 'Email Template';
    }
  };

  const getTemplateDescription = () => {
    switch (templateKey) {
      case 'welcome':
        return 'Sent to new members when they join the club';
      case 'renewal':
        return 'Sent to members when their membership is about to expire';
      case 'event':
        return 'Sent to members when a new event is created';
      default:
        return '';
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(templateKey, subject, body);
      onClose();
    } catch (error) {
      console.error('Error saving template:', error);
    } finally {
      setSaving(false);
    }
  };

  const handleRestoreDefault = async () => {
    if (!onRestoreDefault) return;

    if (!confirm('Are you sure you want to restore the default template? This will remove all your customizations.')) {
      return;
    }

    setRestoring(true);
    try {
      await onRestoreDefault(templateKey);
      onClose();
    } catch (error) {
      console.error('Error restoring default template:', error);
    } finally {
      setRestoring(false);
    }
  };

  const handleSendTest = async () => {
    if (!onSendTest) return;

    setSendingTest(true);
    try {
      await onSendTest(templateKey, subject, body);
    } catch (error) {
      console.error('Error sending test email:', error);
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className={`
        w-full max-w-4xl rounded-xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]
        ${darkMode ? 'bg-slate-800' : 'bg-white'}
      `}>
        <div className={`
          flex items-center justify-between p-6 border-b
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div>
            <h2 className={`text-xl font-semibold ${darkMode ? 'text-slate-100' : 'text-slate-800'}`}>
              Edit {getTemplateName()}
            </h2>
            <p className={`text-sm ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              {getTemplateDescription()}
            </p>
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

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Subject Line
            </label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className={`
                w-full px-3 py-2 rounded-lg transition-colors
                ${darkMode 
                  ? 'bg-slate-700 text-slate-200 border border-slate-600' 
                  : 'bg-white text-slate-900 border border-slate-200'}
              `}
              placeholder="Enter email subject"
            />
          </div>

          <div>
            <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Email Body
            </label>
            <div className="bg-slate-700/50 rounded-lg border border-slate-600/50 p-1">
              <WysiwygEditor
                value={body}
                onChange={setBody}
                darkMode={darkMode}
                height={400}
                placeholder="Enter email content here..."
              />
            </div>
          </div>

          <div>
            <h3 className={`text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
              Available Variables
            </h3>
            <div className={`
              p-4 rounded-lg text-sm
              ${darkMode ? 'bg-slate-700/50 border border-slate-600/50' : 'bg-slate-50 border border-slate-200'}
            `}>
              <ul className={`space-y-1 ${darkMode ? 'text-slate-300' : 'text-slate-700'}`}>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{firstName}}'}</code> - Member's first name</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{lastName}}'}</code> - Member's last name</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{clubName}}'}</code> - Your club name</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{membershipType}}'}</code> - Membership type name</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{renewalDate}}'}</code> - Membership renewal date</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400 font-semibold">{'{{renewalLink}}'}</code> - Direct link to renewal page (for buttons)</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{eventName}}'}</code> - Event name (for event invitations)</li>
                <li><code className="bg-slate-800 px-1 py-0.5 rounded text-blue-400">{'{{eventDate}}'}</code> - Event date (for event invitations)</li>
              </ul>
            </div>
          </div>
        </div>

        <div className={`
          flex justify-between p-6 border-t
          ${darkMode ? 'border-slate-700' : 'border-slate-200'}
        `}>
          <div className="flex gap-3">
            {onRestoreDefault && (
              <button
                onClick={handleRestoreDefault}
                disabled={restoring || saving || sendingTest}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors
                  ${darkMode
                    ? 'text-amber-400 hover:text-amber-300 hover:bg-amber-900/20 border border-amber-800/50'
                    : 'text-amber-600 hover:text-amber-700 hover:bg-amber-50 border border-amber-200'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {restoring ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>Restoring...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw size={16} />
                    <span>Restore Default</span>
                  </>
                )}
              </button>
            )}
            {onSendTest && (
              <button
                onClick={handleSendTest}
                disabled={saving || restoring || sendingTest}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors border
                  ${darkMode
                    ? 'text-blue-400 hover:text-blue-300 hover:bg-blue-900/20 border-blue-800/50'
                    : 'text-blue-600 hover:text-blue-700 hover:bg-blue-50 border-blue-200'}
                  disabled:opacity-50 disabled:cursor-not-allowed
                `}
              >
                {sendingTest ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current"></div>
                    <span>Sending...</span>
                  </>
                ) : (
                  <>
                    <Mail size={16} />
                    <span>Test Email</span>
                  </>
                )}
              </button>
            )}
          </div>
          <div className="flex gap-3">
            <button
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
              onClick={handleSave}
              disabled={saving || restoring || sendingTest}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium transition-colors disabled:opacity-50"
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <Save size={16} />
                  <span>Save Template</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};