import React, { useState, useRef } from 'react';
import { X, Send, Users, ChevronRight, Search, Paperclip, FileText, ListChecks, Mail, Sparkles } from 'lucide-react';
import { RichTextEditor } from '../communications/RichTextEditor';
import EmojiPicker from 'emoji-picker-react';

interface Member {
  id: string;
  user_id: string | null;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

interface MarketingList {
  id: string;
  name: string;
  total_contacts: number;
  active_subscriber_count: number;
}

interface Attachment {
  name: string;
  url: string;
  size: number;
  type: string;
}

interface ComposeForm {
  recipients: string[];
  externalEmails: string[];
  subject: string;
  body: string;
  scheduled_send_at: string | null;
  notification_type: string;
  send_email: boolean;
}

interface NonMemberProfile {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  avatar_url?: string;
}

interface ComposeModalProps {
  composeForm: ComposeForm;
  onComposeFormChange: (form: ComposeForm) => void;
  members: Member[];
  marketingLists: MarketingList[];
  nonMemberRecipients: Map<string, NonMemberProfile>;
  onNonMemberRemove: (id: string) => void;
  selectedListIds: string[];
  onToggleList: (listId: string) => void;
  attachments: Attachment[];
  onAttachFile: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onRemoveAttachment: (index: number) => void;
  uploadingAttachment: boolean;
  sending: boolean;
  replyMode: 'reply' | 'forward' | null;
  onSend: () => void;
  onClose: () => void;
  darkMode: boolean;
  useRichText: boolean;
  onToggleRichText: () => void;
  editorRef: React.RefObject<any>;
}

const UserAvatar = ({ name, avatarUrl, size = 32 }: { name: string; avatarUrl?: string; size?: number }) => {
  const initials = name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
  const colors = [
    'from-blue-500 to-cyan-500',
    'from-emerald-500 to-teal-500',
    'from-amber-500 to-orange-500',
    'from-rose-500 to-pink-500',
    'from-sky-500 to-blue-500',
    'from-green-500 to-emerald-500',
  ];
  const colorIdx = name.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % colors.length;

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }

  return (
    <div
      className={`rounded-full flex items-center justify-center text-white font-semibold bg-gradient-to-br ${colors[colorIdx]}`}
      style={{ width: size, height: size, fontSize: size * 0.38 }}
    >
      {initials || '?'}
    </div>
  );
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const ComposeModal: React.FC<ComposeModalProps> = ({
  composeForm,
  onComposeFormChange,
  members,
  marketingLists,
  nonMemberRecipients,
  onNonMemberRemove,
  selectedListIds,
  onToggleList,
  attachments,
  onAttachFile,
  onRemoveAttachment,
  uploadingAttachment,
  sending,
  replyMode,
  onSend,
  onClose,
  darkMode,
  useRichText,
  onToggleRichText,
  editorRef,
}) => {
  const [showMembersList, setShowMembersList] = useState(false);
  const [showMarketingLists, setShowMarketingLists] = useState(false);
  const [externalEmailInput, setExternalEmailInput] = useState('');
  const [memberSearchTerm, setMemberSearchTerm] = useState('');
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const emojiPickerRef = useRef<HTMLDivElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);

  const addExternalEmail = () => {
    const email = externalEmailInput.trim();
    if (email && !composeForm.externalEmails.includes(email)) {
      onComposeFormChange({
        ...composeForm,
        externalEmails: [...composeForm.externalEmails, email],
      });
      setExternalEmailInput('');
    }
  };

  const selectedCount = composeForm.recipients.length + composeForm.externalEmails.length;

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-900 rounded-2xl border border-slate-700/50 w-full max-w-3xl max-h-[90vh] flex flex-col shadow-2xl shadow-black/50">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-700/40">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-600 flex items-center justify-center">
              <Send size={14} className="text-white" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {replyMode === 'reply' ? 'Reply' : replyMode === 'forward' ? 'Forward' : 'New Conversation'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-all"
          >
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Recipients</label>

            {replyMode !== 'reply' && (
              <div className="mb-3">
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={externalEmailInput}
                    onChange={(e) => setExternalEmailInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addExternalEmail();
                      }
                    }}
                    placeholder="Add email address..."
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                  />
                  <button
                    onClick={addExternalEmail}
                    className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all text-sm font-medium"
                  >
                    Add
                  </button>
                </div>

                {composeForm.externalEmails.length > 0 && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {composeForm.externalEmails.map((email, index) => (
                      <div key={index} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 border border-slate-700/50 rounded-lg">
                        <Mail size={12} className="text-slate-400" />
                        <span className="text-white text-xs">{email}</span>
                        <button
                          onClick={() => {
                            onComposeFormChange({
                              ...composeForm,
                              externalEmails: composeForm.externalEmails.filter((_, i) => i !== index),
                            });
                          }}
                          className="p-0.5 text-slate-500 hover:text-white transition-colors"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <button
              onClick={() => setShowMembersList(!showMembersList)}
              className="flex items-center justify-between w-full px-4 py-3 bg-slate-800/60 hover:bg-slate-800 text-white rounded-xl transition-all border border-slate-700/40"
            >
              <div className="flex items-center gap-2">
                <Users size={16} className="text-slate-400" />
                <span className="text-sm font-medium">Club Members</span>
                {composeForm.recipients.length > 0 && (
                  <span className="text-xs text-blue-400 font-medium">
                    {composeForm.recipients.length} selected
                  </span>
                )}
              </div>
              <ChevronRight size={16} className={`text-slate-500 transition-transform ${showMembersList ? 'rotate-90' : ''}`} />
            </button>

            {showMembersList && (
              <div className="mt-2 border border-slate-700/40 rounded-xl bg-slate-800/40 overflow-hidden">
                <div className="p-3 border-b border-slate-700/30">
                  <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                      type="text"
                      value={memberSearchTerm}
                      onChange={(e) => setMemberSearchTerm(e.target.value)}
                      placeholder="Search members..."
                      className="w-full pl-8 pr-4 py-2 rounded-lg bg-slate-900/50 border border-slate-700/50 text-white placeholder-slate-500 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                    />
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => {
                        const allIds = members.map(m => m.user_id ? m.user_id : `email:${m.id}`);
                        onComposeFormChange({ ...composeForm, recipients: allIds });
                      }}
                      className="px-3 py-1.5 text-[11px] bg-blue-600 text-white rounded-lg hover:bg-blue-500 transition-colors font-medium"
                    >
                      Select All
                    </button>
                    <button
                      onClick={() => onComposeFormChange({ ...composeForm, recipients: [] })}
                      className="px-3 py-1.5 text-[11px] bg-slate-700 text-slate-300 rounded-lg hover:bg-slate-600 transition-colors"
                    >
                      Clear
                    </button>
                  </div>
                </div>

                <div className="max-h-52 overflow-y-auto p-2 space-y-0.5">
                  {Array.from(nonMemberRecipients.values()).map((profile) => (
                    <div
                      key={profile.id}
                      className="flex items-center gap-2.5 p-2 bg-blue-500/5 border border-blue-500/20 rounded-lg"
                    >
                      <UserAvatar name={`${profile.first_name || ''} ${profile.last_name || ''}`.trim() || 'Unknown'} avatarUrl={profile.avatar_url} size={28} />
                      <div className="flex-1 min-w-0">
                        <p className="text-white text-xs font-medium truncate">{`${profile.first_name || ''} ${profile.last_name || ''}`.trim() || profile.email}</p>
                        <p className="text-blue-400 text-[10px]">Pending</p>
                      </div>
                      <button
                        onClick={() => onNonMemberRemove(profile.id)}
                        className="p-1 text-slate-500 hover:text-white transition-colors"
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  {members
                    .filter(m => {
                      if (replyMode === 'reply') return !!m.user_id;
                      if (m.user_id && nonMemberRecipients.has(m.user_id)) return false;
                      if (!memberSearchTerm) return true;
                      const term = memberSearchTerm.toLowerCase();
                      return (
                        (m.first_name || '').toLowerCase().includes(term) ||
                        (m.last_name || '').toLowerCase().includes(term) ||
                        (m.email || '').toLowerCase().includes(term)
                      );
                    })
                    .map(member => {
                      const recipientKey = member.user_id ? member.user_id : `email:${member.id}`;
                      const isEmailOnly = !member.user_id;
                      return (
                        <label
                          key={member.id}
                          className="flex items-center gap-2.5 p-2 hover:bg-slate-700/30 cursor-pointer transition-colors rounded-lg"
                        >
                          <input
                            type="checkbox"
                            checked={composeForm.recipients.includes(recipientKey)}
                            onChange={(e) => {
                              const newRecipients = e.target.checked
                                ? [...composeForm.recipients, recipientKey]
                                : composeForm.recipients.filter(id => id !== recipientKey);
                              onComposeFormChange({ ...composeForm, recipients: newRecipients });
                            }}
                            className="w-3.5 h-3.5 text-blue-600 rounded flex-shrink-0 border-slate-600"
                          />
                          <UserAvatar name={`${member.first_name} ${member.last_name}`} avatarUrl={member.avatar_url} size={28} />
                          <div className="flex-1 min-w-0">
                            <p className="text-white text-xs font-medium truncate">{member.first_name} {member.last_name}</p>
                            <p className="text-slate-500 text-[10px] truncate">{member.email}</p>
                          </div>
                          {isEmailOnly && (
                            <span className="text-[10px] text-amber-400 font-medium px-1.5 py-0.5 bg-amber-400/10 rounded">Email</span>
                          )}
                        </label>
                      );
                    })}
                </div>
              </div>
            )}

            {marketingLists.length > 0 && (
              <>
                <button
                  onClick={() => setShowMarketingLists(!showMarketingLists)}
                  className="flex items-center justify-between w-full px-4 py-3 bg-slate-800/60 hover:bg-slate-800 text-white rounded-xl transition-all border border-slate-700/40 mt-2"
                >
                  <div className="flex items-center gap-2">
                    <ListChecks size={16} className="text-slate-400" />
                    <span className="text-sm font-medium">Subscriber Lists</span>
                    {selectedListIds.length > 0 && (
                      <span className="text-xs text-emerald-400 font-medium">{selectedListIds.length} selected</span>
                    )}
                  </div>
                  <ChevronRight size={16} className={`text-slate-500 transition-transform ${showMarketingLists ? 'rotate-90' : ''}`} />
                </button>

                {showMarketingLists && (
                  <div className="mt-2 border border-slate-700/40 rounded-xl bg-slate-800/40 max-h-40 overflow-y-auto p-2 space-y-0.5">
                    {marketingLists.map(list => (
                      <label
                        key={list.id}
                        className="flex items-center gap-2.5 p-2 hover:bg-slate-700/30 cursor-pointer transition-colors rounded-lg"
                      >
                        <input
                          type="checkbox"
                          checked={selectedListIds.includes(list.id)}
                          onChange={() => onToggleList(list.id)}
                          className="w-3.5 h-3.5 text-blue-600 rounded flex-shrink-0 border-slate-600"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-white text-xs font-medium truncate">{list.name}</p>
                          <p className="text-slate-500 text-[10px]">
                            {list.active_subscriber_count || list.total_contacts || 0} subscribers
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </>
            )}

            {selectedCount > 0 && (
              <p className="text-xs text-blue-400 mt-2 font-medium">{selectedCount} recipient(s) selected</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Subject</label>
            <input
              type="text"
              value={composeForm.subject}
              onChange={(e) => onComposeFormChange({ ...composeForm, subject: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
              placeholder="What is this about?"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Message</label>
              <button
                onClick={onToggleRichText}
                className="text-[11px] text-blue-400 hover:text-blue-300 transition-colors flex items-center gap-1"
              >
                <Sparkles size={12} />
                {useRichText ? 'Plain text' : 'Rich text'}
              </button>
            </div>

            {useRichText ? (
              <RichTextEditor
                content={composeForm.body}
                onChange={(content) => onComposeFormChange({ ...composeForm, body: content })}
                placeholder="Write your message..."
                darkMode={darkMode}
                onEmojiClick={() => setShowEmojiPicker(!showEmojiPicker)}
                editorRef={editorRef}
                emojiButtonRef={emojiButtonRef}
              />
            ) : (
              <textarea
                value={composeForm.body}
                onChange={(e) => onComposeFormChange({ ...composeForm, body: e.target.value })}
                rows={6}
                className="w-full px-4 py-3 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40 resize-none"
                placeholder="Type your message..."
              />
            )}

            {showEmojiPicker && (
              <div
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
                onClick={() => setShowEmojiPicker(false)}
              >
                <div ref={emojiPickerRef} onClick={(e) => e.stopPropagation()}>
                  <EmojiPicker
                    onEmojiClick={(emoji) => {
                      if (useRichText && editorRef.current) {
                        editorRef.current.chain().focus().insertContent(emoji.emoji).run();
                      } else {
                        onComposeFormChange({ ...composeForm, body: composeForm.body + emoji.emoji });
                      }
                      setShowEmojiPicker(false);
                    }}
                    theme={darkMode ? ('dark' as any) : ('light' as any)}
                  />
                </div>
              </div>
            )}
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              onChange={onAttachFile}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAttachment}
              className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400 hover:text-white bg-slate-800/60 hover:bg-slate-800 rounded-lg transition-all border border-slate-700/40 disabled:opacity-50"
            >
              <Paperclip size={14} />
              {uploadingAttachment ? 'Uploading...' : 'Attach Files'}
              <span className="text-slate-600">Max 10MB</span>
            </button>
            {attachments.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2">
                {attachments.map((att, idx) => (
                  <div key={idx} className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700/50 rounded-lg">
                    <FileText size={12} className="text-slate-400" />
                    <span className="text-xs text-white truncate max-w-[120px]">{att.name}</span>
                    <span className="text-[10px] text-slate-500">{formatFileSize(att.size)}</span>
                    <button onClick={() => onRemoveAttachment(idx)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {composeForm.recipients.length > 0 && (
            <div className="space-y-3 pt-2 border-t border-slate-700/30">
              <div>
                <label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Type</label>
                <select
                  value={composeForm.notification_type}
                  onChange={(e) => onComposeFormChange({ ...composeForm, notification_type: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl bg-slate-800/80 border border-slate-700/50 text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/40"
                >
                  <option value="message">General Message</option>
                  <option value="club_news">Club News</option>
                  <option value="race_results">Race Results</option>
                  <option value="membership">Membership</option>
                  <option value="alert">Alert</option>
                </select>
              </div>

              <label className="flex items-center gap-2.5 text-slate-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={composeForm.send_email}
                  onChange={(e) => onComposeFormChange({ ...composeForm, send_email: e.target.checked })}
                  className="rounded border-slate-600 text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                />
                <span className="text-xs">Also send as email</span>
              </label>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-700/40 bg-slate-900/80">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-500 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={onSend}
            disabled={sending || !composeForm.subject || !composeForm.body || (composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0)}
            className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-all hover:shadow-lg hover:shadow-blue-600/20 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:shadow-none font-medium text-sm"
          >
            {sending ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Sending...
              </>
            ) : (
              <>
                <Send size={15} />
                Send
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ComposeModal;
