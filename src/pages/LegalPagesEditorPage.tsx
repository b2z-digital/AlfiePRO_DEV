import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, FileText, Shield, Clock } from 'lucide-react';
import { WysiwygEditor } from '../components/ui/WysiwygEditor';
import {
  getLegalPage,
  updateLegalPage,
  type LegalPageType,
  getLegalPageTitle,
} from '../utils/legalPagesStorage';
import { useAuth } from '../contexts/AuthContext';

interface LegalPagesEditorPageProps {
  pageType: LegalPageType;
}

export default function LegalPagesEditorPage({ pageType }: LegalPagesEditorPageProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const isSuperAdmin = user?.user_metadata?.is_super_admin === true;

  useEffect(() => {
    if (!isSuperAdmin) {
      navigate('/');
      return;
    }
    loadLegalPage();
  }, [pageType, isSuperAdmin, navigate]);

  const loadLegalPage = async () => {
    setLoading(true);
    setError(null);

    const page = await getLegalPage(pageType);

    if (page) {
      setTitle(page.title);
      setContent(page.html_content);
      setLastUpdated(page.last_updated);
    } else {
      setTitle(getLegalPageTitle(pageType));
      setContent('');
    }

    setLoading(false);
  };

  const handleSave = async () => {
    if (!title.trim()) {
      setError('Please enter a title');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccessMessage(null);

    const result = await updateLegalPage(pageType, {
      title: title.trim(),
      html_content: content,
      content: content.replace(/<[^>]*>/g, ''),
    });

    if (result.success) {
      setSuccessMessage('Legal page updated successfully!');
      await loadLegalPage();
      setTimeout(() => setSuccessMessage(null), 3000);
    } else {
      setError(result.error || 'Failed to update legal page');
    }

    setSaving(false);
  };

  if (!isSuperAdmin) {
    return null;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-4"></div>
          <p className="text-gray-600">Loading legal page...</p>
        </div>
      </div>
    );
  }

  const pageIcon = pageType === 'privacy_policy' ? Shield : FileText;
  const PageIcon = pageIcon;

  return (
    <div className="h-screen bg-gray-50 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-4">
              <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="h-5 w-5" />
                <span>Back to Settings</span>
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <div className="flex items-center gap-2">
                <PageIcon className="h-5 w-5 text-blue-600" />
                <h1 className="text-xl font-semibold text-gray-900">
                  Edit {getLegalPageTitle(pageType)}
                </h1>
              </div>
            </div>
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>

      {/* Main Content Area - Scrollable */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          {/* Messages */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {error}
            </div>
          )}

          {successMessage && (
            <div className="mb-6 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
              {successMessage}
            </div>
          )}

          {/* Last Updated Info */}
          {lastUpdated && (
            <div className="mb-6 flex items-center gap-2 text-sm text-gray-600">
              <Clock className="h-4 w-4" />
              <span>
                Last updated: {new Date(lastUpdated).toLocaleString('en-AU', {
                  dateStyle: 'long',
                  timeStyle: 'short',
                })}
              </span>
            </div>
          )}

          {/* Title Input */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Page Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={`Enter ${getLegalPageTitle(pageType)} title`}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* WYSIWYG Editor - Now takes up more space */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden mb-6">
            <WysiwygEditor
              value={content}
              onChange={setContent}
              placeholder={`Enter your ${getLegalPageTitle(pageType).toLowerCase()} content here...`}
              minHeight="calc(100vh - 450px)"
            />
          </div>

          {/* Helper Text */}
          <div className="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
            <h3 className="text-sm font-medium text-blue-900 mb-2">
              Important Information
            </h3>
            <ul className="text-sm text-blue-800 space-y-1">
              <li>• This content is displayed globally across all clubs on alfiePRO</li>
              <li>• Changes take effect immediately after saving</li>
              <li>• Consider consulting with legal professionals before making significant changes</li>
              <li>• Ensure compliance with Australian privacy and consumer protection laws</li>
              {pageType === 'privacy_policy' && (
                <li>• Required for Google AdSense and other advertising programs</li>
              )}
            </ul>
          </div>

          {/* Preview Link */}
          <div className="mb-6 text-center">
            <a
              href={pageType === 'privacy_policy' ? '/privacy' : '/terms'}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 text-blue-600 hover:text-blue-700 text-sm font-medium"
            >
              <FileText className="h-4 w-4" />
              Preview Public Page
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
