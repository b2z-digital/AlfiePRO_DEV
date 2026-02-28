import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  Mail, Users, Calendar, Send, ChevronRight, ChevronLeft, Check,
  Clock, Zap, FileText, Sparkles, ArrowLeft
} from 'lucide-react';
import { createMarketingCampaign, getMarketingSubscriberLists } from '../../utils/marketingStorage';
import type { MarketingSubscriberList } from '../../types/marketing';

interface CampaignCreationWizardProps {
  darkMode?: boolean;
}

type WizardStep = 'details' | 'audience' | 'schedule' | 'review';

const STEPS: { key: WizardStep; label: string; icon: any }[] = [
  { key: 'details', label: 'Campaign Details', icon: FileText },
  { key: 'audience', label: 'Audience', icon: Users },
  { key: 'schedule', label: 'Delivery', icon: Calendar },
  { key: 'review', label: 'Review & Create', icon: Check },
];

export default function CampaignCreationWizard({ darkMode = true }: CampaignCreationWizardProps) {
  const navigate = useNavigate();
  const { currentClub } = useAuth();

  const [currentStep, setCurrentStep] = useState<WizardStep>('details');
  const [lists, setLists] = useState<MarketingSubscriberList[]>([]);
  const [loadingLists, setLoadingLists] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const [campaignName, setCampaignName] = useState('');
  const [subject, setSubject] = useState('');
  const [previewText, setPreviewText] = useState('');
  const [fromName, setFromName] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [replyTo, setReplyTo] = useState('');

  const [selectedLists, setSelectedLists] = useState<string[]>([]);

  const [deliveryMode, setDeliveryMode] = useState<'now' | 'schedule'>('now');
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('09:00');

  useEffect(() => {
    if (currentClub) {
      setFromName(currentClub.club?.abbreviation || currentClub.club?.name || '');
      loadLists();
    }
  }, [currentClub]);

  async function loadLists() {
    if (!currentClub) return;
    try {
      setLoadingLists(true);
      const data = await getMarketingSubscriberLists(currentClub.clubId);
      setLists(data);
    } catch (err) {
      console.error('Error loading lists:', err);
    } finally {
      setLoadingLists(false);
    }
  }

  const currentStepIndex = STEPS.findIndex(s => s.key === currentStep);

  function canProceed(): boolean {
    switch (currentStep) {
      case 'details':
        return !!campaignName.trim() && !!subject.trim();
      case 'audience':
        return selectedLists.length > 0;
      case 'schedule':
        return deliveryMode === 'now' || (!!scheduledDate && !!scheduledTime);
      case 'review':
        return true;
      default:
        return false;
    }
  }

  function nextStep() {
    const idx = currentStepIndex;
    if (idx < STEPS.length - 1) {
      setCurrentStep(STEPS[idx + 1].key);
    }
  }

  function prevStep() {
    const idx = currentStepIndex;
    if (idx > 0) {
      setCurrentStep(STEPS[idx - 1].key);
    }
  }

  function toggleList(listId: string) {
    setSelectedLists(prev =>
      prev.includes(listId)
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
  }

  function getTotalRecipients(): number {
    return lists
      .filter(l => selectedLists.includes(l.id))
      .reduce((sum, l) => sum + (l.active_subscriber_count || l.total_contacts || 0), 0);
  }

  function getSelectedListNames(): string[] {
    return lists
      .filter(l => selectedLists.includes(l.id))
      .map(l => l.list_type === 'all_members' ? 'Club Members' : l.name);
  }

  async function handleCreate() {
    if (!currentClub) return;
    setCreating(true);
    setError('');

    try {
      let sendAt: string | null = null;
      let status: 'draft' | 'scheduled' = 'draft';

      if (deliveryMode === 'schedule' && scheduledDate && scheduledTime) {
        sendAt = new Date(`${scheduledDate}T${scheduledTime}`).toISOString();
        status = 'scheduled';
      }

      const created = await createMarketingCampaign({
        club_id: currentClub.clubId,
        name: campaignName.trim(),
        subject: subject.trim(),
        preview_text: previewText.trim() || null,
        from_name: fromName.trim() || currentClub.club?.name || '',
        from_email: fromEmail.trim() || '',
        reply_to: replyTo.trim() || null,
        status,
        send_at: sendAt,
        list_ids: selectedLists,
        campaign_type: 'regular',
        total_recipients: getTotalRecipients(),
        total_sent: 0,
        total_delivered: 0,
        total_opened: 0,
        total_clicked: 0,
        total_bounced: 0,
        total_unsubscribed: 0,
      });

      navigate(`/marketing/campaigns/${created.id}`, { replace: true });
    } catch (err: any) {
      setError(err?.message || 'Failed to create campaign');
      setCreating(false);
    }
  }

  const cardClass = darkMode
    ? 'bg-slate-800/60 backdrop-blur-sm border border-slate-700/50'
    : 'bg-white shadow-sm border border-gray-200';

  const inputClass = darkMode
    ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-500 focus:border-blue-500'
    : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400 focus:border-blue-500';

  const labelClass = darkMode ? 'text-slate-300' : 'text-gray-700';
  const mutedClass = darkMode ? 'text-slate-400' : 'text-gray-500';

  return (
    <div className="min-h-screen flex flex-col">
      <div className={`border-b ${darkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-6 py-5">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <Link
                to="/marketing/campaigns"
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-800 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Create Campaign
                </h1>
                <p className={`text-sm mt-0.5 ${mutedClass}`}>
                  Set up your email campaign in a few steps
                </p>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {STEPS.map((step, idx) => {
              const isActive = step.key === currentStep;
              const isCompleted = idx < currentStepIndex;
              const Icon = step.icon;
              return (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <button
                    onClick={() => {
                      if (isCompleted) setCurrentStep(step.key);
                    }}
                    className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl text-sm font-medium transition-all w-full ${
                      isActive
                        ? 'bg-blue-600 text-white shadow-lg shadow-blue-500/25'
                        : isCompleted
                          ? darkMode
                            ? 'bg-green-500/15 text-green-400 hover:bg-green-500/25 cursor-pointer'
                            : 'bg-green-50 text-green-700 hover:bg-green-100 cursor-pointer'
                          : darkMode
                            ? 'bg-slate-800/50 text-slate-500'
                            : 'bg-gray-100 text-gray-400'
                    }`}
                    disabled={!isCompleted && !isActive}
                  >
                    <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                      isActive
                        ? 'bg-white/20'
                        : isCompleted
                          ? darkMode ? 'bg-green-500/20' : 'bg-green-200'
                          : darkMode ? 'bg-slate-700' : 'bg-gray-200'
                    }`}>
                      {isCompleted ? (
                        <Check className="w-3.5 h-3.5" />
                      ) : (
                        <Icon className="w-3.5 h-3.5" />
                      )}
                    </div>
                    <span className="hidden sm:inline">{step.label}</span>
                  </button>
                  {idx < STEPS.length - 1 && (
                    <ChevronRight className={`w-4 h-4 flex-shrink-0 ${
                      darkMode ? 'text-slate-600' : 'text-gray-300'
                    }`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto px-6 py-8">

          {currentStep === 'details' && (
            <div className="space-y-6">
              <div className={`rounded-2xl p-6 ${cardClass}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <FileText className="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Campaign Information
                    </h2>
                    <p className={`text-sm ${mutedClass}`}>Give your campaign a name and subject line</p>
                  </div>
                </div>

                <div className="space-y-5">
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      Campaign Name <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={campaignName}
                      onChange={(e) => setCampaignName(e.target.value)}
                      placeholder="e.g. February Newsletter, Event Announcement"
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                    <p className={`text-xs mt-1.5 ${mutedClass}`}>
                      Internal name - recipients won't see this
                    </p>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      Email Subject Line <span className="text-red-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="e.g. What's new this month at the club"
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                    <div className="flex items-center justify-between mt-1.5">
                      <p className={`text-xs ${mutedClass}`}>
                        This is the first thing recipients see
                      </p>
                      <span className={`text-xs ${subject.length > 60 ? 'text-amber-400' : mutedClass}`}>
                        {subject.length}/60
                      </span>
                    </div>
                  </div>

                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      Preview Text
                    </label>
                    <input
                      type="text"
                      value={previewText}
                      onChange={(e) => setPreviewText(e.target.value)}
                      placeholder="Shown next to the subject in inboxes..."
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                    <p className={`text-xs mt-1.5 ${mutedClass}`}>
                      Appears after the subject line in most email clients
                    </p>
                  </div>
                </div>
              </div>

              <div className={`rounded-2xl p-6 ${cardClass}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <Mail className="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Sender Details
                    </h2>
                    <p className={`text-sm ${mutedClass}`}>Who should this email appear to be from?</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      From Name
                    </label>
                    <input
                      type="text"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      placeholder="Your club name"
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                  </div>
                  <div>
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      From Email
                    </label>
                    <input
                      type="email"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      placeholder="noreply@yourclub.com"
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                      Reply-To Email
                    </label>
                    <input
                      type="email"
                      value={replyTo}
                      onChange={(e) => setReplyTo(e.target.value)}
                      placeholder="replies@yourclub.com (optional)"
                      className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStep === 'audience' && (
            <div className="space-y-6">
              <div className={`rounded-2xl p-6 ${cardClass}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <Users className="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Choose Your Audience
                    </h2>
                    <p className={`text-sm ${mutedClass}`}>Select which subscriber lists will receive this campaign</p>
                  </div>
                </div>

                {loadingLists ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                  </div>
                ) : lists.length > 0 ? (
                  <div className="space-y-3">
                    {lists.map((list) => {
                      const isSelected = selectedLists.includes(list.id);
                      const displayName = list.list_type === 'all_members' ? 'Club Members' : list.name;
                      return (
                        <button
                          key={list.id}
                          onClick={() => toggleList(list.id)}
                          className={`w-full flex items-center gap-4 p-4 rounded-xl border-2 transition-all text-left ${
                            isSelected
                              ? 'border-blue-500 bg-blue-500/10'
                              : darkMode
                                ? 'border-slate-700 hover:border-slate-600 bg-slate-900/30 hover:bg-slate-900/50'
                                : 'border-gray-200 hover:border-gray-300 bg-gray-50 hover:bg-gray-100'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                            isSelected
                              ? 'bg-blue-500 text-white'
                              : darkMode
                                ? 'bg-slate-700 text-slate-400'
                                : 'bg-gray-200 text-gray-500'
                          }`}>
                            {isSelected ? (
                              <Check className="w-5 h-5" />
                            ) : (
                              <Users className="w-5 h-5" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                              {displayName}
                            </div>
                            {list.description && (
                              <div className={`text-sm truncate ${mutedClass}`}>
                                {list.description}
                              </div>
                            )}
                          </div>
                          <div className="text-right flex-shrink-0">
                            <div className={`text-lg font-bold ${isSelected ? 'text-blue-400' : darkMode ? 'text-slate-200' : 'text-gray-800'}`}>
                              {list.active_subscriber_count || list.total_contacts}
                            </div>
                            <div className={`text-xs ${mutedClass}`}>contacts</div>
                          </div>
                        </button>
                      );
                    })}

                    {selectedLists.length > 0 && (
                      <div className={`mt-4 p-4 rounded-xl ${
                        darkMode ? 'bg-blue-500/10 border border-blue-500/20' : 'bg-blue-50 border border-blue-100'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className={`text-sm font-medium ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                            {selectedLists.length} {selectedLists.length === 1 ? 'list' : 'lists'} selected
                          </span>
                          <span className={`text-lg font-bold ${darkMode ? 'text-blue-300' : 'text-blue-700'}`}>
                            ~{getTotalRecipients().toLocaleString()} recipients
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className={`text-center py-12 ${mutedClass}`}>
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-40" />
                    <p className="mb-4">No subscriber lists found</p>
                    <Link
                      to="/marketing/subscribers"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm"
                    >
                      Create a List First
                    </Link>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'schedule' && (
            <div className="space-y-6">
              <div className={`rounded-2xl p-6 ${cardClass}`}>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/15 flex items-center justify-center">
                    <Calendar className="w-4.5 h-4.5 text-blue-500" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      When should this be delivered?
                    </h2>
                    <p className={`text-sm ${mutedClass}`}>Choose to save as a draft or schedule for later</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <button
                    onClick={() => setDeliveryMode('now')}
                    className={`p-5 rounded-xl border-2 text-left transition-all ${
                      deliveryMode === 'now'
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode
                          ? 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
                          : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                      deliveryMode === 'now'
                        ? 'bg-blue-500 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-500'
                    }`}>
                      <Zap className="w-6 h-6" />
                    </div>
                    <h3 className={`font-semibold mb-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Save as Draft
                    </h3>
                    <p className={`text-sm ${mutedClass}`}>
                      Design your email first, then send when you're ready
                    </p>
                  </button>

                  <button
                    onClick={() => setDeliveryMode('schedule')}
                    className={`p-5 rounded-xl border-2 text-left transition-all ${
                      deliveryMode === 'schedule'
                        ? 'border-blue-500 bg-blue-500/10'
                        : darkMode
                          ? 'border-slate-700 hover:border-slate-600 bg-slate-900/30'
                          : 'border-gray-200 hover:border-gray-300 bg-gray-50'
                    }`}
                  >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-3 ${
                      deliveryMode === 'schedule'
                        ? 'bg-blue-500 text-white'
                        : darkMode ? 'bg-slate-700 text-slate-400' : 'bg-gray-200 text-gray-500'
                    }`}>
                      <Clock className="w-6 h-6" />
                    </div>
                    <h3 className={`font-semibold mb-1 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Schedule
                    </h3>
                    <p className={`text-sm ${mutedClass}`}>
                      Pick a specific date and time for delivery
                    </p>
                  </button>
                </div>

                {deliveryMode === 'schedule' && (
                  <div className={`mt-5 p-5 rounded-xl ${
                    darkMode ? 'bg-slate-900/40 border border-slate-700/50' : 'bg-gray-50 border border-gray-200'
                  }`}>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                          Date <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="date"
                          value={scheduledDate}
                          onChange={(e) => setScheduledDate(e.target.value)}
                          min={new Date().toISOString().split('T')[0]}
                          className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                        />
                      </div>
                      <div>
                        <label className={`block text-sm font-medium mb-1.5 ${labelClass}`}>
                          Time <span className="text-red-400">*</span>
                        </label>
                        <input
                          type="time"
                          value={scheduledTime}
                          onChange={(e) => setScheduledTime(e.target.value)}
                          className={`w-full px-4 py-3 rounded-xl border focus:ring-2 focus:ring-blue-500/20 transition-colors ${inputClass}`}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {currentStep === 'review' && (
            <div className="space-y-6">
              <div className={`rounded-2xl p-6 ${cardClass}`}>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-9 h-9 rounded-xl bg-green-500/15 flex items-center justify-center">
                    <Sparkles className="w-4.5 h-4.5 text-green-500" />
                  </div>
                  <div>
                    <h2 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                      Review Your Campaign
                    </h2>
                    <p className={`text-sm ${mutedClass}`}>Everything looks good? Hit create to start designing your email.</p>
                  </div>
                </div>

                <div className="space-y-4">
                  <ReviewRow
                    darkMode={darkMode}
                    label="Campaign Name"
                    value={campaignName}
                    onEdit={() => setCurrentStep('details')}
                  />
                  <ReviewRow
                    darkMode={darkMode}
                    label="Subject Line"
                    value={subject}
                    onEdit={() => setCurrentStep('details')}
                  />
                  {previewText && (
                    <ReviewRow
                      darkMode={darkMode}
                      label="Preview Text"
                      value={previewText}
                      onEdit={() => setCurrentStep('details')}
                    />
                  )}
                  <ReviewRow
                    darkMode={darkMode}
                    label="From"
                    value={`${fromName || '(not set)'}${fromEmail ? ` <${fromEmail}>` : ''}`}
                    onEdit={() => setCurrentStep('details')}
                  />
                  <ReviewRow
                    darkMode={darkMode}
                    label="Audience"
                    value={`${getSelectedListNames().join(', ')} (~${getTotalRecipients().toLocaleString()} recipients)`}
                    onEdit={() => setCurrentStep('audience')}
                  />
                  <ReviewRow
                    darkMode={darkMode}
                    label="Delivery"
                    value={
                      deliveryMode === 'now'
                        ? 'Draft - send manually when ready'
                        : `Scheduled for ${scheduledDate} at ${scheduledTime}`
                    }
                    onEdit={() => setCurrentStep('schedule')}
                  />
                </div>

                {error && (
                  <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-sm">
                    {error}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      <div className={`border-t ${darkMode ? 'border-slate-700/50' : 'border-gray-200'}`}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            {currentStepIndex > 0 ? (
              <button
                onClick={prevStep}
                className={`px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-800 border border-slate-700'
                    : 'text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>
            ) : (
              <Link
                to="/marketing/campaigns"
                className={`px-5 py-2.5 rounded-xl flex items-center gap-2 font-medium transition-colors ${
                  darkMode
                    ? 'text-slate-300 hover:bg-slate-800 border border-slate-700'
                    : 'text-gray-700 hover:bg-gray-100 border border-gray-300'
                }`}
              >
                Cancel
              </Link>
            )}
          </div>

          <div className="flex items-center gap-3">
            <span className={`text-sm ${mutedClass}`}>
              Step {currentStepIndex + 1} of {STEPS.length}
            </span>

            {currentStep === 'review' ? (
              <button
                onClick={handleCreate}
                disabled={creating}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-blue-500/25"
              >
                {creating ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                Create Campaign
              </button>
            ) : (
              <button
                onClick={nextStep}
                disabled={!canProceed()}
                className="px-6 py-2.5 bg-blue-600 text-white rounded-xl hover:bg-blue-700 font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Continue
                <ChevronRight className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function ReviewRow({ darkMode, label, value, onEdit }: {
  darkMode: boolean;
  label: string;
  value: string;
  onEdit: () => void;
}) {
  return (
    <div className={`flex items-start justify-between p-4 rounded-xl ${
      darkMode ? 'bg-slate-900/40' : 'bg-gray-50'
    }`}>
      <div className="flex-1 min-w-0">
        <div className={`text-xs font-medium uppercase tracking-wider mb-1 ${
          darkMode ? 'text-slate-500' : 'text-gray-400'
        }`}>
          {label}
        </div>
        <div className={`text-sm font-medium ${darkMode ? 'text-slate-200' : 'text-gray-900'}`}>
          {value}
        </div>
      </div>
      <button
        onClick={onEdit}
        className={`text-xs font-medium px-3 py-1 rounded-lg transition-colors flex-shrink-0 ml-3 ${
          darkMode
            ? 'text-blue-400 hover:bg-blue-500/15'
            : 'text-blue-600 hover:bg-blue-50'
        }`}
      >
        Edit
      </button>
    </div>
  );
}
