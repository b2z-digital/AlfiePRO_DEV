import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { LogOut } from 'lucide-react';

interface Props {
  article: {
    id: string;
    title: string;
    content: string;
    excerpt?: string;
    cover_image?: string;
    published_at?: string;
  };
  isOpen: boolean;
  onClose: () => void;
  darkMode?: boolean;
}

export const ArticleDetailModal: React.FC<Props> = ({ article, isOpen, onClose, darkMode = false }) => {
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const publishedDate = article.published_at
    ? new Date(article.published_at).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })
    : '';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0 }}>
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      />

      <div className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto rounded-lg shadow-2xl bg-white">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full transition-colors z-10 bg-white/90 hover:bg-white text-slate-900 shadow-lg"
        >
          <LogOut className="w-5 h-5" />
        </button>

        {article.cover_image && (
          <div className="w-full aspect-video overflow-hidden rounded-t-lg">
            <img
              src={article.cover_image}
              alt={article.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        <div className="p-8">
          {publishedDate && (
            <p className="text-sm mb-3 text-slate-600">
              {publishedDate}
            </p>
          )}

          <h1 className="text-3xl font-bold mb-6 text-slate-900">
            {article.title}
          </h1>

          <div
            className="prose prose-lg max-w-none prose-slate"
            dangerouslySetInnerHTML={{ __html: article.content }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};
