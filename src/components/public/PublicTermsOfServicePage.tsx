import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { PublicHeader } from './PublicHeader';
import { PublicFooter } from './PublicFooter';
import { FileText } from 'lucide-react';
import { getLegalPage } from '../../utils/legalPagesStorage';

export const PublicTermsOfServicePage: React.FC = () => {
  const { clubId } = useParams<{ clubId: string }>();
  const [title, setTitle] = useState('Terms of Service');
  const [content, setContent] = useState('');
  const [lastUpdated, setLastUpdated] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadTermsOfService = async () => {
      try {
        const legalPage = await getLegalPage('terms_of_service');

        if (legalPage) {
          setTitle(legalPage.title);
          setContent(legalPage.html_content);
          setLastUpdated(new Date(legalPage.last_updated).toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
          }));
        } else {
          setContent('<p>Terms of Service content not available. Please contact the administrator.</p>');
        }
      } catch (error) {
        console.error('Error loading terms of service:', error);
        setContent('<p>Error loading terms of service. Please try again later.</p>');
      } finally {
        setLoading(false);
      }
    };

    loadTermsOfService();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <div className="text-gray-600 dark:text-gray-400">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <PublicHeader clubId={clubId} />

      <div className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <FileText className="w-10 h-10 text-blue-600" />
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              {title}
            </h1>
          </div>
          {lastUpdated && (
            <p className="text-gray-600 dark:text-gray-400">
              Last Updated: {lastUpdated}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
          <div
            className="prose dark:prose-invert max-w-none prose-headings:text-gray-900 dark:prose-headings:text-white prose-p:text-gray-700 dark:prose-p:text-gray-300 prose-li:text-gray-700 dark:prose-li:text-gray-300 prose-strong:text-gray-900 dark:prose-strong:text-white"
            dangerouslySetInnerHTML={{ __html: content }}
          />
        </div>

        {/* Back Link */}
        <div className="mt-8 text-center">
          <Link
            to={clubId ? `/club/${clubId}/public` : '/'}
            className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
          >
            ← Back to Homepage
          </Link>
        </div>
      </div>

      <PublicFooter clubId={clubId} />
    </div>
  );
};
