import React, { useState, useRef } from 'react';
import { X, Send, ChevronRight, Search, Paperclip, FileText, ListChecks, Mail, Sparkles, ArrowLeft, Check, Reply, Forward } from 'lucide-react';
import { AAvatar, ASwitch } from '../alfie/Kit';
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
  const [first, ...rest] = (name || '?').split(' ');
  return <AAvatar url={avatarUrl} first={first} last={rest.join(' ')} size={size} />;
};

const formatFileSize = (bytes: number) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

type ComposeStep = 'people-picker' | 'compose';

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
  const [step, setStep] = useState<ComposeStep>(replyMode ? 'compose' : 'people-picker');
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

  const toggleMember = (recipientKey: string) => {
    const isSelected = composeForm.recipients.includes(recipientKey);
    const newRecipients = isSelected
      ? composeForm.recipients.filter(id => id !== recipientKey)
      : [...composeForm.recipients, recipientKey];
    onComposeFormChange({ ...composeForm, recipients: newRecipients });
  };

  const selectedCount = composeForm.recipients.length + composeForm.externalEmails.length;

  const filteredMembers = members.filter(m => {
    if (!memberSearchTerm) return true;
    const term = memberSearchTerm.toLowerCase();
    return (
      (m.first_name || '').toLowerCase().includes(term) ||
      (m.last_name || '').toLowerCase().includes(term) ||
      (m.email || '').toLowerCase().includes(term)
    );
  });

  const isPicker = step === 'people-picker' && !replyMode;
  const title = replyMode === 'reply' ? 'Reply' : replyMode === 'forward' ? 'Forward' : isPicker ? 'New message' : 'Compose message';

  const sortedMembers = [...filteredMembers].sort((a, b) => `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`));
  let lastLetter = '';

  const chips = selectedCount > 0 && (
    <div className="flex gap-1.5 flex-wrap">
      {composeForm.recipients.map(recipientKey => {
        const member = members.find(m => (m.user_id ? m.user_id : `email:${m.id}`) === recipientKey);
        const nonMember = nonMemberRecipients.get(recipientKey);
        const profile = member || nonMember;
        if (!profile) return null;
        const fullName = `${profile.first_name} ${profile.last_name}`.trim();
        return (
          <span key={recipientKey} className="a-rchip">
            <UserAvatar name={fullName} avatarUrl={profile.avatar_url} size={26} />
            <span className="a-ink">{fullName}</span>
            <button
              onClick={() => onComposeFormChange({ ...composeForm, recipients: composeForm.recipients.filter(r => r !== recipientKey) })}
              className="a-dim flex"
              aria-label={`Remove ${fullName}`}
            >
              <X size={14} />
            </button>
          </span>
        );
      })}
      {composeForm.externalEmails.map((email, index) => (
        <span key={index} className="a-rchip a-rchip-e">
          <span className="a-tile" style={{ width: 26, height: 26, borderRadius: 999 }}><Mail size={13} /></span>
          <span className="a-ink">{email}</span>
          <button
            onClick={() => onComposeFormChange({ ...composeForm, externalEmails: composeForm.externalEmails.filter((_, i) => i !== index) })}
            className="a-dim flex"
            aria-label={`Remove ${email}`}
          >
            <X size={14} />
          </button>
        </span>
      ))}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <section className={`a-sheet w-full ${isPicker ? 'max-w-[420px]' : 'max-w-[640px]'} max-h-[90vh] flex flex-col`} role="dialog" aria-label={title}>

        <div className="flex items-center gap-3" style={{ padding: '20px 18px 12px 22px' }}>
          {step === 'compose' && !replyMode && (
            <button onClick={() => setStep('people-picker')} className="a-ib" aria-label="Back to recipients">
              <ArrowLeft size={18} />
            </button>
          )}
          <span className="a-tile a-tile-rim" style={{ width: 40, height: 40 }}>
            {replyMode === 'reply' ? <Reply size={18} /> : replyMode === 'forward' ? <Forward size={18} /> : <Send size={18} />}
          </span>
          <h2 className="a-display a-ink flex-1 m-0 text-[20px] font-semibold">{title}</h2>
          <button onClick={onClose} className="a-ib" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        {isPicker ? (
          <>
            <div className="flex flex-col gap-2.5" style={{ padding: '0 18px 10px' }}>
              <label className="a-field">
                <Search size={16} />
                <input
                  type="text"
                  value={memberSearchTerm}
                  onChange={(e) => setMemberSearchTerm(e.target.value)}
                  placeholder="Search members"
                  autoFocus
                />
              </label>
              {chips}
            </div>

            <div className="flex-1 overflow-y-auto" style={{ padding: '0 8px 10px' }}>
              {members.length > 0 && sortedMembers.map(member => {
                const recipientKey = member.user_id ? member.user_id : `email:${member.id}`;
                const isSelected = composeForm.recipients.includes(recipientKey);
                const fullName = `${member.first_name} ${member.last_name}`.trim();
                const letter = (fullName[0] || '#').toUpperCase();
                const showLetter = letter !== lastLetter;
                lastLetter = letter;
                return (
                  <React.Fragment key={member.id}>
                    {showLetter && <div className="a-ghd" style={{ padding: '10px 10px 4px' }}>{letter}</div>}
                    <button
                      onClick={() => toggleMember(recipientKey)}
                      className={`a-pr ${isSelected ? 'a-pr-on' : ''}`}
                      role="checkbox"
                      aria-checked={isSelected}
                    >
                      <UserAvatar name={fullName} avatarUrl={member.avatar_url} size={36} />
                      <div className="flex-1 min-w-0 text-left">
                        <div className="a-ink text-[14px] font-medium truncate">{fullName}</div>
                        {!member.user_id && <div className="a-txt-a text-[12px] mt-px">Email only · not on the app</div>}
                      </div>
                      <span className={`a-chk ${isSelected ? 'a-chk-on' : ''}`} style={{ borderRadius: 999 }}>
                        {isSelected && <Check size={13} strokeWidth={3} />}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
              {filteredMembers.length === 0 && memberSearchTerm && (
                <p className="a-dim text-[13.5px] text-center py-6">No members match your search</p>
              )}

              {marketingLists.length > 0 && (
                <>
                  <button
                    onClick={() => setShowMarketingLists(!showMarketingLists)}
                    className="a-ghd w-full flex items-center gap-2 text-left"
                    style={{ padding: '14px 10px 4px' }}
                  >
                    <ListChecks size={13} />
                    <span className="flex-1">Subscriber lists</span>
                    {selectedListIds.length > 0 && <span className="a-txt-g normal-case tracking-normal">{selectedListIds.length} selected</span>}
                    <ChevronRight size={14} className={`transition-transform ${showMarketingLists ? 'rotate-90' : ''}`} />
                  </button>
                  {showMarketingLists && marketingLists.map(list => {
                    const on = selectedListIds.includes(list.id);
                    return (
                      <button key={list.id} onClick={() => onToggleList(list.id)} className={`a-pr ${on ? 'a-pr-on' : ''}`} role="checkbox" aria-checked={on}>
                        <span className="a-tile" style={{ width: 36, height: 36, borderRadius: 999 }}><ListChecks size={16} /></span>
                        <div className="flex-1 min-w-0 text-left">
                          <div className="a-ink text-[14px] font-medium truncate">{list.name}</div>
                          <div className="a-dim text-[12px] mt-px">{list.active_subscriber_count || list.total_contacts || 0} subscribers</div>
                        </div>
                        <span className={`a-chk ${on ? 'a-chk-on' : ''}`}>{on && <Check size={13} strokeWidth={3} />}</span>
                      </button>
                    );
                  })}
                </>
              )}

              <div className="a-ghd flex items-center gap-2" style={{ padding: '14px 10px 6px' }}><Mail size={13} />Or add by email</div>
              <div className="flex gap-2" style={{ padding: '0 10px' }}>
                <label className="a-field flex-1">
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
                    placeholder="name@example.com"
                  />
                </label>
                <button onClick={addExternalEmail} className="a-btn">Add</button>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto flex flex-col gap-4" style={{ padding: '0 22px 18px' }}>
            {chips}

            <div>
              <label className="a-flab">Subject</label>
              <input
                type="text"
                value={composeForm.subject}
                onChange={(e) => onComposeFormChange({ ...composeForm, subject: e.target.value })}
                className="a-inp w-full"
                placeholder="What is this about?"
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <label className="a-flab">Message</label>
                <button onClick={onToggleRichText} className="a-txt-b text-[12px] font-semibold flex items-center gap-1 mb-1.5">
                  <Sparkles size={13} />
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
                  className="a-inp a-ta w-full"
                  placeholder="Type your message"
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
                className="a-btn a-btn-q disabled:opacity-50"
              >
                <Paperclip size={16} />
                {uploadingAttachment ? 'Uploading…' : 'Attach files'}
                <span className="a-dim font-normal text-[12px]">Max 10MB</span>
              </button>
              {attachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {attachments.map((att, idx) => (
                    <span key={idx} className="a-rchip a-rchip-e">
                      <FileText size={14} className="a-dim ml-1.5" />
                      <span className="a-ink truncate max-w-[160px]">{att.name}</span>
                      <span className="a-dim text-[11.5px]">{formatFileSize(att.size)}</span>
                      <button onClick={() => onRemoveAttachment(idx)} className="a-dim flex" aria-label={`Remove ${att.name}`}>
                        <X size={14} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            {composeForm.recipients.length > 0 && (
              <div className="a-grp">
                <div className="a-ir">
                  <span className="a-ink text-[14px] font-medium flex-1">Type</span>
                  <select
                    value={composeForm.notification_type}
                    onChange={(e) => onComposeFormChange({ ...composeForm, notification_type: e.target.value })}
                    className="a-inp a-inp-sel"
                    style={{ height: 36, width: 200 }}
                  >
                    <option value="message">General message</option>
                    <option value="club_news">Club news</option>
                    <option value="race_results">Race results</option>
                    <option value="membership">Membership</option>
                    <option value="alert">Alert</option>
                  </select>
                </div>
                <div className="a-ir">
                  <span className="a-ink text-[14px] font-medium flex-1">Also send as email</span>
                  <ASwitch
                    checked={composeForm.send_email}
                    onChange={(v) => onComposeFormChange({ ...composeForm, send_email: v })}
                    label="Also send as email"
                  />
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2.5 border-t a-bd" style={{ padding: '14px 18px' }}>
          <button onClick={onClose} className="a-btn" style={{ flex: 1 }}>
            Cancel
          </button>

          {isPicker ? (
            <button
              onClick={() => setStep('compose')}
              disabled={selectedCount === 0 && selectedListIds.length === 0}
              className="a-btn a-btn-p disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ flex: 1.4 }}
            >
              Next{selectedCount + selectedListIds.length > 0 ? ` · ${selectedCount + selectedListIds.length} selected` : ''}
            </button>
          ) : (
            <button
              onClick={onSend}
              disabled={sending || !composeForm.subject || !composeForm.body || (composeForm.recipients.length === 0 && composeForm.externalEmails.length === 0 && selectedListIds.length === 0)}
              className="a-btn a-btn-p disabled:opacity-45 disabled:cursor-not-allowed"
              style={{ flex: 1.4 }}
            >
              {sending ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Sending…
                </>
              ) : (
                <>
                  <Send size={16} />
                  Send
                </>
              )}
            </button>
          )}
        </div>
      </section>
    </div>
  );
};

export default ComposeModal;
