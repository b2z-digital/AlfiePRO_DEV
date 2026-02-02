import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  X, Save, Send, Eye, Users, Calendar, Mail,
  Settings, Image, Type, Layout, ChevronDown, CheckCircle, AlertCircle
} from 'lucide-react';
import {
  getMarketingCampaign,
  updateMarketingCampaign,
  getCampaignContent,
  saveCampaignContent,
  getMarketingSubscriberLists,
  getMarketingEmailTemplates
} from '../utils/marketingStorage';
import type { MarketingCampaign, MarketingSubscriberList, MarketingEmailTemplate } from '../types/marketing';
import EnhancedEmailPageBuilder from '../components/marketing/EnhancedEmailPageBuilder';

interface EmailRow {
  id: string;
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  fullWidth?: boolean;
  blocks: any[];
}

interface MarketingCampaignEditorPageProps {
  darkMode?: boolean;
}

export default function MarketingCampaignEditorPage({ darkMode = true }: MarketingCampaignEditorPageProps) {
  const { id } = useParams<{ id: string }>();
  const { currentClub } = useAuth();
  const notification = useNotification();
  const navigate = useNavigate();

  const [campaign, setCampaign] = useState<MarketingCampaign | null>(null);
  const [emailContent, setEmailContent] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'design' | 'recipients' | 'settings'>('design');
  const [lists, setLists] = useState<MarketingSubscriberList[]>([]);
  const [templates, setTemplates] = useState<MarketingEmailTemplate[]>([]);
  const [selectedLists, setSelectedLists] = useState<string[]>([]);
  const [showPreview, setShowPreview] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  const showNotification = (message: string, type: 'success' | 'error') => {
    if (notification?.showNotification) {
      notification.showNotification(message, type);
    } else {
      console.log(`[${type.toUpperCase()}] ${message}`);
      if (type === 'success') {
        setSaveSuccess(true);
        setTimeout(() => setSaveSuccess(false), 3000);
      }
    }
  };

  useEffect(() => {
    if (id && currentClub) {
      loadCampaign();
      loadLists();
      loadTemplates();
    }
  }, [id, currentClub]);

  async function loadCampaign() {
    if (!id) return;

    try {
      setLoading(true);
      const [campaignData, contentData] = await Promise.all([
        getMarketingCampaign(id),
        getCampaignContent(id)
      ]);

      if (campaignData) {
        setCampaign(campaignData);
        setSelectedLists(campaignData.list_ids || []);
      }

      if (contentData && contentData.html_content) {
        try {
          const parsedContent = JSON.parse(contentData.html_content);
          setEmailContent(parsedContent);
        } catch {
          setEmailContent([]);
        }
      }
    } catch (error) {
      console.error('Error loading campaign:', error);
    } finally {
      setLoading(false);
    }
  }

  async function loadLists() {
    if (!currentClub) return;

    try {
      const data = await getMarketingSubscriberLists(currentClub.clubId);
      setLists(data);
    } catch (error) {
      console.error('Error loading lists:', error);
    }
  }

  async function loadTemplates() {
    try {
      const data = await getMarketingEmailTemplates(currentClub?.clubId);
      setTemplates(data);
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  }

  async function handleSave() {
    if (!id || !campaign) return;

    try {
      setSaving(true);

      await Promise.all([
        updateMarketingCampaign(id, {
          list_ids: selectedLists
        }),
        saveCampaignContent({
          campaign_id: id,
          html_content: JSON.stringify(emailContent)
        })
      ]);

      showNotification('Campaign saved successfully', 'success');
    } catch (error) {
      console.error('Error saving campaign:', error);
      showNotification('Failed to save campaign', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function handleSend() {
    if (!id || !campaign) return;

    if (emailContent.length === 0) {
      showNotification('Please design your email content first', 'error');
      return;
    }

    if (selectedLists.length === 0) {
      showNotification('Please select at least one subscriber list', 'error');
      return;
    }

    const confirmSend = window.confirm('Are you sure you want to send this campaign? This action cannot be undone.');
    if (!confirmSend) {
      return;
    }

    try {
      setSaving(true);

      await handleSave();
      await updateMarketingCampaign(id, {
        status: 'sending',
        sent_at: new Date().toISOString()
      });

      showNotification('Campaign is being sent!', 'success');
      navigate('/marketing/campaigns');
    } catch (error) {
      console.error('Error sending campaign:', error);
      showNotification('Failed to send campaign', 'error');
    } finally {
      setSaving(false);
    }
  }

  const toggleList = (listId: string) => {
    setSelectedLists(prev =>
      prev.includes(listId)
        ? prev.filter(id => id !== listId)
        : [...prev, listId]
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="p-16">
        <div className={`text-center ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
          Campaign not found
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className={`border-b ${darkMode ? 'bg-slate-800/50 border-slate-700' : 'bg-white border-gray-200'}`}>
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  {campaign.name}
                </h1>
                <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
                  {campaign.subject}
                </p>
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                campaign.status === 'draft' ? 'bg-gray-100 text-gray-700' :
                campaign.status === 'sent' ? 'bg-green-100 text-green-700' :
                'bg-blue-100 text-blue-700'
              }`}>
                {campaign.status}
              </span>
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <Eye className="w-4 h-4" />
                Preview
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className={`px-4 py-2 rounded-lg flex items-center gap-2 transition-colors ${
                  saveSuccess
                    ? 'bg-green-600 text-white'
                    : darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                } disabled:opacity-50`}
              >
                {saveSuccess ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Saved!
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save'}
                  </>
                )}
              </button>
              {campaign.status === 'draft' && (
                <button
                  onClick={handleSend}
                  disabled={saving}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Send className="w-4 h-4" />
                  Send Campaign
                </button>
              )}
              <Link
                to="/marketing/campaigns"
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700/50 text-slate-400 hover:text-slate-200' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <X className="w-5 h-5" />
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            <button
              onClick={() => setActiveTab('design')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'design'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Layout className="w-4 h-4 inline mr-2" />
              Design
            </button>
            <button
              onClick={() => setActiveTab('recipients')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'recipients'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Recipients ({selectedLists.length})
            </button>
            <button
              onClick={() => setActiveTab('settings')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                activeTab === 'settings'
                  ? darkMode
                    ? 'bg-slate-700 text-slate-100'
                    : 'bg-gray-100 text-gray-900'
                  : darkMode
                    ? 'text-slate-400 hover:text-slate-200'
                    : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Settings className="w-4 h-4 inline mr-2" />
              Settings
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'design' && (
          <div className="h-full">
            <EnhancedEmailPageBuilder
              content={emailContent}
              onChange={setEmailContent}
              darkMode={darkMode}
            />
          </div>
        )}

        {activeTab === 'recipients' && (
          <div className="p-6 overflow-auto h-full">
            <div className={`max-w-4xl mx-auto rounded-xl p-6 ${
              darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white shadow-sm border border-gray-200'
            }`}>
              <h2 className={`text-xl font-bold mb-4 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Select Subscriber Lists
              </h2>
              <p className={`mb-6 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Choose which subscriber lists will receive this campaign
              </p>

              <div className="space-y-3">
                {lists.map((list) => (
                  <label
                    key={list.id}
                    className={`flex items-center gap-3 p-4 rounded-lg cursor-pointer transition-colors ${
                      darkMode
                        ? 'bg-slate-900/50 hover:bg-slate-900/70 border border-slate-700'
                        : 'bg-gray-50 hover:bg-gray-100 border border-gray-200'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedLists.includes(list.id)}
                      onChange={() => toggleList(list.id)}
                      className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                    />
                    <div className="flex-1">
                      <div className={`font-medium ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                        {list.name}
                      </div>
                      {list.description && (
                        <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                          {list.description}
                        </div>
                      )}
                    </div>
                    <div className={`text-sm ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                      {list.subscriber_count} subscribers
                    </div>
                  </label>
                ))}

                {lists.length === 0 && (
                  <div className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p className="mb-4">No subscriber lists found</p>
                    <Link
                      to="/marketing/subscribers"
                      className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                      Create Subscriber List
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'settings' && (
          <div className="p-6 overflow-auto h-full">
            <div className={`max-w-4xl mx-auto rounded-xl p-6 ${
              darkMode
                ? 'bg-slate-800/50 border border-slate-700/50'
                : 'bg-white shadow-sm border border-gray-200'
            }`}>
              <h2 className={`text-xl font-bold mb-6 ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Campaign Settings
              </h2>

              <div className="space-y-6">
                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Campaign Name
                  </label>
                  <input
                    type="text"
                    value={campaign.name}
                    onChange={(e) => setCampaign({ ...campaign, name: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Email Subject
                  </label>
                  <input
                    type="text"
                    value={campaign.subject}
                    onChange={(e) => setCampaign({ ...campaign, subject: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Preview Text
                  </label>
                  <input
                    type="text"
                    value={campaign.preview_text || ''}
                    onChange={(e) => setCampaign({ ...campaign, preview_text: e.target.value })}
                    placeholder="Text shown in email client preview"
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    From Name
                  </label>
                  <input
                    type="text"
                    value={campaign.from_name}
                    onChange={(e) => setCampaign({ ...campaign, from_name: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    From Email
                  </label>
                  <input
                    type="email"
                    value={campaign.from_email}
                    onChange={(e) => setCampaign({ ...campaign, from_email: e.target.value })}
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>

                <div>
                  <label className={`block text-sm font-medium mb-2 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                    Reply To Email (Optional)
                  </label>
                  <input
                    type="email"
                    value={campaign.reply_to || ''}
                    onChange={(e) => setCampaign({ ...campaign, reply_to: e.target.value })}
                    placeholder="Email address for replies"
                    className={`w-full px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
                      darkMode
                        ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-400'
                        : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                    }`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {showPreview && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`max-w-3xl w-full max-h-[90vh] rounded-xl overflow-hidden ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                Email Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <span className="sr-only">Close</span>
                ✕
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
              <div className={`mb-4 p-4 rounded-lg ${darkMode ? 'bg-slate-900/50' : 'bg-gray-50'}`}>
                <div className={`text-sm font-medium ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  From: {campaign.from_name} &lt;{campaign.from_email}&gt;
                </div>
                <div className={`text-sm font-medium mt-1 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Subject: {campaign.subject}
                </div>
                {campaign.preview_text && (
                  <div className={`text-sm mt-1 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                    {campaign.preview_text}
                  </div>
                )}
              </div>
              <div className={`rounded-lg overflow-hidden ${darkMode ? 'bg-slate-900' : 'bg-white'}`}>
                {emailContent.length > 0 ? (
                  emailContent.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        backgroundColor: row.backgroundColor,
                        padding: `${row.paddingTop}px ${row.paddingRight}px ${row.paddingBottom}px ${row.paddingLeft}px`
                      }}
                    >
                      {row.blocks.map((block: any) => (
                        <div key={block.id} className="mb-2">
                          {block.type === 'text' && (
                            <div
                              style={{
                                fontSize: block.config.fontSize,
                                color: block.config.color,
                                textAlign: block.config.align
                              }}
                              dangerouslySetInnerHTML={{ __html: block.config.content }}
                            />
                          )}
                          {block.type === 'image' && block.config.src && (
                            <div style={{ textAlign: block.config.align }}>
                              <img
                                src={block.config.src}
                                alt={block.config.alt}
                                style={{ width: block.config.width, maxWidth: '100%' }}
                              />
                            </div>
                          )}
                          {block.type === 'button' && (
                            <div style={{ textAlign: block.config.align }}>
                              <a
                                href={block.config.url}
                                style={{
                                  display: block.config.fullWidth ? 'block' : 'inline-block',
                                  backgroundColor: block.config.backgroundColor,
                                  color: block.config.textColor,
                                  padding: `${block.config.paddingTop}px ${block.config.paddingLeft}px`,
                                  borderRadius: `${block.config.borderRadius}px`,
                                  textDecoration: 'none'
                                }}
                              >
                                {block.config.text}
                              </a>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))
                ) : (
                  <p className={`text-center py-8 ${darkMode ? 'text-slate-400' : 'text-gray-500'}`}>
                    No content yet - start building your email in the Design tab
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
