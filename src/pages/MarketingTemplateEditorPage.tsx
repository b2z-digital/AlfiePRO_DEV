import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useNotification } from '../contexts/NotificationContext';
import { X, Save, Eye, Palette, CheckCircle } from 'lucide-react';
import {
  getMarketingEmailTemplate,
  updateMarketingEmailTemplate
} from '../utils/marketingStorage';
import type { MarketingEmailTemplate } from '../types/marketing';
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

interface MarketingTemplateEditorPageProps {
  darkMode?: boolean;
}

export default function MarketingTemplateEditorPage({ darkMode = true }: MarketingTemplateEditorPageProps) {
  const { id } = useParams<{ id: string }>();
  const { currentClub } = useAuth();
  const { addNotification } = useNotification();
  const navigate = useNavigate();

  const [template, setTemplate] = useState<MarketingEmailTemplate | null>(null);
  const [emailContent, setEmailContent] = useState<EmailRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (id) {
      loadTemplate();
    }
  }, [id]);

  async function loadTemplate() {
    if (!id) return;

    try {
      setLoading(true);
      const templateData = await getMarketingEmailTemplate(id);

      if (templateData) {
        setTemplate(templateData);

        // Parse email content
        if (templateData.email_content_json) {
          try {
            const parsedContent = typeof templateData.email_content_json === 'string'
              ? JSON.parse(templateData.email_content_json)
              : templateData.email_content_json;
            setEmailContent(parsedContent.rows || []);
          } catch {
            setEmailContent([]);
          }
        }
      }
    } catch (error) {
      console.error('Error loading template:', error);
      addNotification('Failed to load template', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleSave() {
    if (!id || !template) return;

    try {
      setSaving(true);

      await updateMarketingEmailTemplate(id, {
        email_content_json: { rows: emailContent } as any,
        email_content_html: JSON.stringify(emailContent)
      });

      addNotification('Template saved successfully', 'success');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (error) {
      console.error('Error saving template:', error);
      addNotification('Failed to save template', 'error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (!template) {
    return (
      <div className="p-16">
        <div className={`text-center ${darkMode ? 'text-slate-400' : 'text-gray-600'}`}>
          Template not found
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
              <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center">
                <Palette className="w-5 h-5 text-white" />
              </div>
              <div>
                <h1 className={`text-2xl font-bold ${darkMode ? 'text-slate-100' : 'text-gray-900'}`}>
                  {template.name}
                </h1>
                {template.description && (
                  <p className={darkMode ? 'text-slate-400' : 'text-gray-600'}>
                    {template.description}
                  </p>
                )}
              </div>
              <span className={`px-3 py-1 rounded-full text-xs font-medium ${
                darkMode ? 'bg-slate-700 text-slate-300' : 'bg-gray-100 text-gray-700'
              }`}>
                {template.category}
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
                    : 'bg-blue-600 text-white hover:bg-blue-700'
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
              <Link
                to="/marketing/templates"
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700/50 text-slate-400 hover:text-slate-200' : 'hover:bg-gray-100 text-gray-600 hover:text-gray-900'
                }`}
              >
                <X className="w-5 h-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        <EnhancedEmailPageBuilder
          content={emailContent}
          onChange={setEmailContent}
          darkMode={darkMode}
        />
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
                Template Preview
              </h3>
              <button
                onClick={() => setShowPreview(false)}
                className={`p-2 rounded-lg transition-colors ${
                  darkMode ? 'hover:bg-slate-700' : 'hover:bg-gray-100'
                }`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-auto max-h-[calc(90vh-80px)]">
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
                    No content yet - start building your template
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
