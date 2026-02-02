import React, { useEffect, useMemo } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import 'react-quill/dist/quill.bubble.css';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  darkMode?: boolean;
  height?: number;
  minHeight?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  value,
  onChange,
  darkMode = false,
  height,
  minHeight,
  placeholder = 'Start typing...',
  className = '',
  disabled = false
}) => {
  const effectiveHeight = height || 300;
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['link'],
      ['clean']
    ],
    keyboard: {
      bindings: {
        linebreak: {
          key: 13,
          shiftKey: true,
          handler: function(range: any) {
            this.quill.insertText(range.index, '\n', 'user');
            this.quill.setSelection(range.index + 1, 'silent');
            return false;
          }
        }
      }
    }
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'link'
  ];

  // Add custom CSS to preserve whitespace and formatting
  useEffect(() => {
    const style = document.createElement('style');
    style.innerHTML = `
      .ql-editor p {
        margin-bottom: 1em;
      }
      .ql-editor h1, .ql-editor h2, .ql-editor h3 {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      .ql-editor ul, .ql-editor ol {
        margin-bottom: 1em;
        padding-left: 1.5em;
      }
      .ql-editor li {
        margin-bottom: 0;
        line-height: 1.5;
      }
      .ql-editor li + li {
        margin-top: 0.2em;
      }
      .ql-editor a {
        color: #3b82f6;
        text-decoration: underline;
      }
      .ql-editor a:hover {
        color: #2563eb;
      }
      .ql-editor br {
        display: block;
        content: "";
        margin-top: 0;
      }

      /* Article content styles */
      .article-content p {
        margin-bottom: 1em;
        white-space: pre-wrap;
      }
      .article-content h1, .article-content h2, .article-content h3 {
        margin-top: 1.5em;
        margin-bottom: 0.5em;
      }
      .article-content ul, .article-content ol {
        margin-bottom: 1em;
        padding-left: 1.5em;
      }
      .article-content li {
        margin-bottom: 0;
        line-height: 1.5;
      }
      .article-content li + li {
        margin-top: 0.2em;
      }
      .article-content a {
        color: #3b82f6;
        text-decoration: underline;
      }
      .article-content a:hover {
        color: #2563eb;
      }
      .article-content br {
        display: block;
        content: "";
        margin-top: 0;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.head.removeChild(style);
    };
  }, []);

  return (
    <div className={`wysiwyg-editor ${className}`}>
      <style jsx>{`
        .wysiwyg-editor .ql-container {
          font-size: 14px;
          ${minHeight ? `min-height: calc(${minHeight} - 42px);` : `height: ${effectiveHeight - 42}px;`}
          border-bottom-left-radius: 0.375rem;
          border-bottom-right-radius: 0.375rem;
          background-color: ${darkMode ? 'rgba(30, 41, 59, 0.6)' : '#ffffff'};
          color: ${darkMode ? '#ffffff' : '#1e293b'};
          border-color: ${darkMode ? 'rgba(51, 65, 85, 0.5)' : '#e5e7eb'};
        }

        .wysiwyg-editor .ql-toolbar {
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
          background-color: ${darkMode ? 'rgba(51, 65, 85, 0.6)' : '#f9fafb'};
          color: ${darkMode ? '#e2e8f0' : '#1e293b'};
          border-color: ${darkMode ? 'rgba(51, 65, 85, 0.5)' : '#e5e7eb'};
        }

        .wysiwyg-editor .ql-editor {
          ${minHeight ? `min-height: calc(${minHeight} - 42px);` : `min-height: ${effectiveHeight - 42}px;`}
          color: ${darkMode ? 'white' : '#1e293b'};
          font-size: 16px;
          line-height: 1.6;
        }

        .wysiwyg-editor .ql-editor.ql-blank::before {
          color: ${darkMode ? '#64748b' : '#9ca3af'};
          opacity: 1;
          font-style: normal;
        }

        .wysiwyg-editor .ql-stroke {
          stroke: ${darkMode ? '#94a3b8' : '#64748b'};
        }

        .wysiwyg-editor .ql-fill {
          fill: ${darkMode ? '#94a3b8' : '#64748b'};
        }

        .wysiwyg-editor .ql-picker {
          color: ${darkMode ? '#e2e8f0' : '#1e293b'};
        }

        .wysiwyg-editor .ql-picker-options {
          background-color: ${darkMode ? 'rgba(30, 41, 59, 0.95)' : '#ffffff'};
          border-color: ${darkMode ? 'rgba(51, 65, 85, 0.5)' : '#e5e7eb'};
        }

        /* Preserve whitespace in editor */
        .wysiwyg-editor .ql-editor p {
          white-space: pre-wrap;
        }

        .wysiwyg-editor .ql-editor ol li,
        .wysiwyg-editor .ql-editor ul li {
          margin-bottom: 0;
          line-height: 1.5;
        }

        .wysiwyg-editor .ql-editor ol li + li,
        .wysiwyg-editor .ql-editor ul li + li {
          margin-top: 0.2em;
        }
      `}</style>
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        readOnly={disabled}
      />
    </div>
  );
};