import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { Shield } from 'lucide-react';
import { getLegalPage } from '../../utils/legalPagesStorage';

export const PublicPrivacyPolicyPage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const [title, setTitle] = useState('Privacy Policy');
  const [content, setContent] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPrivacyPolicy = async () => {
      try {
        const legalPage = await getLegalPage('privacy_policy');

        if (legalPage) {
          setTitle(legalPage.title);
          setContent(legalPage.html_content);
          setLastUpdated(new Date(legalPage.last_updated).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }));
        } else {
          setContent('<p>Privacy Policy content not available. Please contact the administrator.</p>');
        }
      } catch (error) {
        console.error('Error loading privacy policy:', error);
        setContent('<p>Error loading privacy policy. Please try again later.</p>');
      } finally {
        setLoading(false);
      }
    };

    loadPrivacyPolicy();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white">
      <PublicHeader clubId={clubId} />

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Shield className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900">
              {title}
            </h1>
          </div>
          {lastUpdated && (
            <p className="text-gray-600">
              Last Updated: {lastUpdated}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-8">
          <style>{`
            .legal-content h1 { font-size: 1.875rem; font-weight: 700; color: #111827; margin-bottom: 1rem; }
            .legal-content h2 { font-size: 1.5rem; font-weight: 700; color: #111827; margin-top: 2rem; margin-bottom: 0.75rem; }
            .legal-content h3 { font-size: 1.25rem; font-weight: 600; color: #111827; margin-top: 1.75rem; margin-bottom: 0.5rem; }
            .legal-content h4 { font-size: 1rem; font-weight: 600; color: #111827; margin-top: 1.25rem; margin-bottom: 0.5rem; }
            .legal-content p { color: #374151; line-height: 1.75; margin-bottom: 1rem; }
            .legal-content ul { list-style-type: disc; padding-left: 1.5rem; margin-bottom: 1rem; }
            .legal-content ol { list-style-type: decimal; padding-left: 1.5rem; margin-bottom: 1rem; }
            .legal-content li { color: #374151; line-height: 1.75; margin-bottom: 0.375rem; }
            .legal-content strong { font-weight: 600; color: #111827; }
            .legal-content a { color: #2563eb; text-decoration: underline; }
            .legal-content a:hover { color: #1d4ed8; }
          `}</style>
          <div
            className="legal-content"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>

        {/* Back Link */}
        <div className="mt-8 text-center">
          <Link
            to={clubId ? `/club/${clubId}/public` : '/'}
            className="text-blue-600 hover:text-blue-700 font-medium"
          >
            &larr; Back to Homepage
          </Link>
        </div>
      </div>

      <PublicFooter clubId={clubId} />
    </div>
  );
};
