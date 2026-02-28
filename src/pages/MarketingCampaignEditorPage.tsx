import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import {
  X, Save, Send, Eye, Users, Calendar, Mail, SendHorizonal,
  Settings, Layout, CheckCircle
} from 'lucide-react';
import {
  getMarketingCampaign,
  updateMarketingCampaign,
  getCampaignContent,
  saveCampaignContent,
  getMarketingSubscriberLists,
  getMarketingEmailTemplates
} from '../utils/marketingStorage';
import { supabase } from '../utils/supabase';
import type { MarketingCampaign, MarketingSubscriberList, MarketingEmailTemplate } from '../types/marketing';
import EnhancedEmailPageBuilder from '../components/marketing/EnhancedEmailPageBuilder';
import CampaignCreationWizard from '../components/marketing/CampaignCreationWizard';

interface EmailRow {
  id: string;
  backgroundColor?: string;
  paddingTop?: number;
  paddingBottom?: number;
  paddingLeft?: number;
  paddingRight?: number;
  marginTop?: number;
  marginBottom?: number;
  fullWidth?: boolean;
  blocks: any[];
}

interface MarketingCampaignEditorPageProps {
  darkMode?: boolean;
}

function renderPreviewBlock(block: any, row: EmailRow) {
  const config = block.config || {};

  const rowPaddingLeft = row.paddingLeft || 0;
  const rowPaddingRight = row.paddingRight || 0;
  const totalHorizontalPadding = rowPaddingLeft + rowPaddingRight;

  switch (block.type) {
    case 'heading': {
      const Tag = (config.level || 'h2') as keyof JSX.IntrinsicElements;
      return (
        <Tag
          style={{
            fontSize: config.fontSize || '24px',
            fontWeight: config.fontWeight || 'bold',
            color: config.color || '#1f2937',
            textAlign: config.align || 'left',
            fontFamily: config.fontFamily,
            lineHeight: config.lineHeight || '1.3',
            paddingTop: config.paddingTop || 0,
            paddingBottom: config.paddingBottom || 0,
            margin: 0,
          }}
          dangerouslySetInnerHTML={{ __html: config.content || '' }}
        />
      );
    }
    case 'text':
      return (
        <div
          style={{
            fontSize: config.fontSize || '16px',
            color: config.color || '#374151',
            lineHeight: config.lineHeight || '1.6',
            textAlign: config.align || 'left',
            fontFamily: config.fontFamily,
            paddingTop: config.paddingTop || 0,
            paddingBottom: config.paddingBottom || 0,
          }}
          dangerouslySetInnerHTML={{ __html: config.content || '' }}
        />
      );
    case 'image':
      if (!config.src) return null;
      return (
        <div
          style={{
            textAlign: config.align || 'center',
            paddingTop: config.paddingTop || 0,
            paddingBottom: config.paddingBottom || 0,
            ...(config.fullWidth && totalHorizontalPadding > 0 ? {
              marginLeft: `-${rowPaddingLeft}px`,
              marginRight: `-${rowPaddingRight}px`,
            } : {}),
          }}
        >
          <img
            src={config.src}
            alt={config.alt || ''}
            style={{
              width: config.fullWidth ? '100%' : (config.width || '100%'),
              maxWidth: '100%',
              height: 'auto',
              display: 'block',
            }}
          />
        </div>
      );
    case 'button':
      return (
        <div
          style={{
            textAlign: config.align || 'center',
            paddingTop: config.paddingTop || 10,
            paddingBottom: config.paddingBottom || 10,
          }}
        >
          <a
            href={config.url || '#'}
            style={{
              display: config.fullWidth ? 'block' : 'inline-block',
              backgroundColor: config.backgroundColor || '#2563eb',
              color: config.textColor || '#ffffff',
              padding: `${config.paddingTop || 12}px ${config.paddingLeft || 24}px`,
              borderRadius: `${config.borderRadius || 6}px`,
              textDecoration: 'none',
              fontSize: config.fontSize || '16px',
              fontWeight: '600',
              textAlign: 'center',
            }}
          >
            {config.text || 'Button'}
          </a>
        </div>
      );
    case 'divider':
      return (
        <div style={{
          paddingTop: config.paddingTop || 10,
          paddingBottom: config.paddingBottom || 10,
          textAlign: config.align || 'center',
        }}>
          <hr style={{
            border: 'none',
            borderTop: `${config.height || 1}px ${config.style || 'solid'} ${config.color || '#e5e7eb'}`,
            width: config.width || '100%',
            margin: '0 auto',
          }} />
        </div>
      );
    case 'spacer':
      return <div style={{ height: config.height || 20 }} />;
    case 'video':
      if (!config.embedUrl) return null;
      return (
        <div style={{
          textAlign: config.align || 'center',
          paddingTop: config.paddingTop || 0,
          paddingBottom: config.paddingBottom || 0,
        }}>
          <div style={{ position: 'relative', paddingBottom: '56.25%', height: 0, overflow: 'hidden' }}>
            <iframe
              src={config.embedUrl}
              style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', border: 'none' }}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      );
    case 'social':
      return (
        <div style={{
          textAlign: config.align || 'center',
          paddingTop: config.paddingTop || 10,
          paddingBottom: config.paddingBottom || 10,
        }}>
          {(config.links || []).map((link: any, idx: number) => (
            <a
              key={idx}
              href={link.url || '#'}
              style={{
                display: 'inline-block',
                margin: '0 6px',
                width: 36,
                height: 36,
                lineHeight: '36px',
                borderRadius: '50%',
                backgroundColor: config.iconBackgroundColor || '#1f2937',
                color: config.iconColor || '#ffffff',
                textAlign: 'center',
                textDecoration: 'none',
                fontSize: 14,
                fontWeight: 'bold',
              }}
            >
              {(link.platform || '?')[0].toUpperCase()}
            </a>
          ))}
        </div>
      );
    case 'menu':
      return (
        <div style={{
          textAlign: config.align || 'center',
          paddingTop: config.paddingTop || 10,
          paddingBottom: config.paddingBottom || 10,
        }}>
          {(config.items || []).map((item: any, idx: number) => (
            <a
              key={idx}
              href={item.url || '#'}
              style={{
                color: config.linkColor || '#2563eb',
                fontSize: config.fontSize || '14px',
                textDecoration: 'none',
                margin: '0 12px',
              }}
            >
              {item.label}
            </a>
          ))}
        </div>
      );
    case 'html':
      return (
        <div
          style={{
            paddingTop: config.paddingTop || 0,
            paddingBottom: config.paddingBottom || 0,
          }}
          dangerouslySetInnerHTML={{ __html: config.html || '' }}
        />
      );
    default:
      return null;
  }
}

export default function MarketingCampaignEditorPage({ darkMode = true }: MarketingCampaignEditorPageProps) {
  const { id } = useParams<{ id: string }>();
  const { currentClub, user } = useAuth();
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
  const [showSendTest, setShowSendTest] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testSent, setTestSent] = useState(false);

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
      if (id !== 'new') {
        loadCampaign();
      } else {
        setLoading(false);
      }
      loadLists();
      loadTemplates();
    }
  }, [id, currentClub]);

  useEffect(() => {
    if (user?.email && !testEmail) {
      setTestEmail(user.email);
    }
  }, [user]);

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

  function buildEmailHtml(): string {
    if (!campaign) return '';
    let bodyHtml = '';
    for (const row of emailContent) {
      const bgColor = row.backgroundColor ? `background-color:${row.backgroundColor};` : '';
      const padding = `padding:${row.paddingTop || 0}px ${row.paddingRight || 0}px ${row.paddingBottom || 0}px ${row.paddingLeft || 0}px;`;
      const margin = `margin-top:${row.marginTop || 0}px;margin-bottom:${row.marginBottom || 0}px;`;

      let blocksHtml = '';
      if (row.blocks.length > 1) {
        const colWidth = Math.floor(100 / row.blocks.length);
        let cols = '';
        for (const block of row.blocks) {
          cols += `<td style="width:${colWidth}%;vertical-align:top;padding:0 4px">${renderBlockToHtml(block, row)}</td>`;
        }
        blocksHtml = `<table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${cols}</tr></table>`;
      } else {
        for (const block of row.blocks) {
          blocksHtml += renderBlockToHtml(block, row);
        }
      }

      bodyHtml += `<div style="${bgColor}${padding}${margin}">${blocksHtml}</div>`;
    }
    return bodyHtml;
  }

  function renderBlockToHtml(block: any, row: EmailRow): string {
    const c = block.config || {};
    switch (block.type) {
      case 'heading':
        return `<${c.level || 'h2'} style="font-size:${c.fontSize || '24px'};font-weight:${c.fontWeight || 'bold'};color:${c.color || '#1f2937'};text-align:${c.align || 'left'};margin:0;padding:${c.paddingTop || 0}px 0 ${c.paddingBottom || 0}px;line-height:${c.lineHeight || '1.3'}">${c.content || ''}</${c.level || 'h2'}>`;
      case 'text':
        return `<div style="font-size:${c.fontSize || '16px'};color:${c.color || '#374151'};line-height:${c.lineHeight || '1.6'};text-align:${c.align || 'left'};padding:${c.paddingTop || 0}px 0 ${c.paddingBottom || 0}px">${c.content || ''}</div>`;
      case 'image': {
        if (!c.src) return '';
        const fw = c.fullWidth;
        const ml = fw ? `margin-left:-${row.paddingLeft || 0}px;` : '';
        const mr = fw ? `margin-right:-${row.paddingRight || 0}px;` : '';
        return `<div style="text-align:${c.align || 'center'};padding:${c.paddingTop || 0}px 0 ${c.paddingBottom || 0}px;${ml}${mr}"><img src="${c.src}" alt="${c.alt || ''}" style="width:${fw ? '100%' : (c.width || '100%')};max-width:100%;height:auto;display:block" /></div>`;
      }
      case 'button':
        return `<div style="text-align:${c.align || 'center'};padding:${c.paddingTop || 10}px 0 ${c.paddingBottom || 10}px"><a href="${c.url || '#'}" style="display:${c.fullWidth ? 'block' : 'inline-block'};background-color:${c.backgroundColor || '#2563eb'};color:${c.textColor || '#ffffff'};padding:${c.paddingTop || 12}px ${c.paddingLeft || 24}px;border-radius:${c.borderRadius || 6}px;text-decoration:none;font-size:${c.fontSize || '16px'};font-weight:600;text-align:center">${c.text || 'Button'}</a></div>`;
      case 'divider':
        return `<div style="padding:${c.paddingTop || 10}px 0 ${c.paddingBottom || 10}px;text-align:${c.align || 'center'}"><hr style="border:none;border-top:${c.height || 1}px ${c.style || 'solid'} ${c.color || '#e5e7eb'};width:${c.width || '100%'};margin:0 auto" /></div>`;
      case 'spacer':
        return `<div style="height:${c.height || 20}px"></div>`;
      case 'html':
        return c.html || '';
      default:
        return '';
    }
  }

  async function handleSendTest() {
    if (!testEmail.trim() || !campaign) return;
    setSendingTest(true);
    setTestSent(false);

    try {
      await handleSave();

      const emailHtml = buildEmailHtml();

      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const apiUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/send-notification`;

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({
          recipients: [{ email: testEmail.trim(), name: 'Test Recipient' }],
          subject: `[TEST] ${campaign.subject}`,
          body: emailHtml || '<p>No email content designed yet.</p>',
          type: 'campaign_test',
          club_id: currentClub?.clubId,
          send_email: true,
          skip_notifications: true,
          sender_name: campaign.from_name || currentClub?.club?.abbreviation || 'Campaign Test',
          club_name: campaign.from_name || currentClub?.club?.abbreviation || '',
          club_logo: currentClub?.club?.logo,
        }),
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to send test email');
      }

      setTestSent(true);
      showNotification(`Test email sent to ${testEmail}`, 'success');
      setTimeout(() => {
        setTestSent(false);
      }, 3000);
    } catch (error: any) {
      console.error('Error sending test email:', error);
      showNotification(error?.message || 'Failed to send test email', 'error');
    } finally {
      setSendingTest(false);
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

  if (id === 'new') {
    return <CampaignCreationWizard darkMode={darkMode} />;
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setShowSendTest(true)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors ${
                  darkMode
                    ? 'bg-slate-700 text-slate-200 hover:bg-slate-600'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                <SendHorizonal className="w-4 h-4" />
                Send Test
              </button>
              <button
                onClick={() => setShowPreview(!showPreview)}
                className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors ${
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
                className={`px-3 py-2 rounded-lg flex items-center gap-2 text-sm transition-colors ${
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
                  className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2 text-sm transition-colors disabled:opacity-50"
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
                      {(list as any).subscriber_count || list.active_subscriber_count || list.total_contacts} subscribers
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

      {/* Send Test Modal */}
      {showSendTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className={`max-w-md w-full rounded-2xl overflow-hidden ${
            darkMode ? 'bg-slate-800' : 'bg-white'
          }`}>
            <div className={`px-6 py-4 border-b flex items-center justify-between ${
              darkMode ? 'border-slate-700' : 'border-gray-200'
            }`}>
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-blue-500/15 flex items-center justify-center">
                  <SendHorizonal className="w-4 h-4 text-blue-500" />
                </div>
                <h3 className={`text-lg font-semibold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  Send Test Email
                </h3>
              </div>
              <button
                onClick={() => setShowSendTest(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-6">
              <p className={`text-sm mb-4 ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
                Send a preview of this campaign to your email address. The subject line will be prefixed with [TEST].
              </p>
              <div className="mb-4">
                <label className={`block text-sm font-medium mb-1.5 ${darkMode ? 'text-slate-300' : 'text-gray-700'}`}>
                  Email Address
                </label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="your@email.com"
                  className={`w-full px-4 py-2.5 rounded-xl border focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-colors ${
                    darkMode
                      ? 'bg-slate-900/50 border-slate-600 text-slate-100 placeholder-slate-500'
                      : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400'
                  }`}
                />
              </div>

              {testSent && (
                <div className={`mb-4 p-3 rounded-xl text-sm flex items-center gap-2 ${
                  darkMode ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-green-50 text-green-700 border border-green-100'
                }`}>
                  <CheckCircle className="w-4 h-4 flex-shrink-0" />
                  Test email sent successfully! Check your inbox.
                </div>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowSendTest(false)}
                  className={`px-4 py-2 rounded-xl text-sm font-medium transition-colors ${
                    darkMode ? 'text-slate-300 hover:bg-slate-700' : 'text-gray-700 hover:bg-gray-100'
                  }`}
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendTest}
                  disabled={!testEmail.trim() || sendingTest}
                  className="px-5 py-2 bg-blue-600 text-white rounded-xl hover:bg-blue-700 text-sm font-medium flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {sendingTest ? (
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Send className="w-4 h-4" />
                  )}
                  {sendingTest ? 'Sending...' : 'Send Test'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  darkMode ? 'hover:bg-slate-700 text-slate-400' : 'hover:bg-gray-100 text-gray-500'
                }`}
              >
                <X className="w-4 h-4" />
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
              <div className="rounded-lg overflow-hidden bg-white">
                {emailContent.length > 0 ? (
                  emailContent.map((row) => (
                    <div
                      key={row.id}
                      style={{
                        backgroundColor: row.backgroundColor,
                        padding: `${row.paddingTop || 0}px ${row.paddingRight || 0}px ${row.paddingBottom || 0}px ${row.paddingLeft || 0}px`,
                        marginTop: row.marginTop || 0,
                        marginBottom: row.marginBottom || 0,
                      }}
                    >
                      {row.blocks.length > 1 ? (
                        <div
                          style={{
                            display: 'grid',
                            gridTemplateColumns: `repeat(${row.blocks.length}, 1fr)`,
                            gap: '8px',
                          }}
                        >
                          {row.blocks.map((block: any) => (
                            <div key={block.id}>
                              {renderPreviewBlock(block, row)}
                            </div>
                          ))}
                        </div>
                      ) : (
                        row.blocks.map((block: any) => (
                          <div key={block.id}>
                            {renderPreviewBlock(block, row)}
                          </div>
                        ))
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-center py-8 text-gray-500">
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
