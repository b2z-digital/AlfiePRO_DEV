import React, { useMemo, useRef } from 'react';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';

interface WysiwygEditorProps {
  value: string;
  onChange: (value: string) => void;
  darkMode?: boolean;
  height?: number;
  minHeight?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  onImageUpload?: (file: File) => Promise<string>;
}

let editorCounter = 0;

export const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  value,
  onChange,
  darkMode = false,
  height,
  minHeight,
  placeholder = 'Start typing...',
  className = '',
  disabled = false,
  onImageUpload
}) => {
  const instanceId = useRef(`wysiwyg-${++editorCounter}`);
  const effectiveHeight = height || 300;
  const quillRef = useRef<ReactQuill>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageInsert = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUpload) return;

    try {
      const url = await onImageUpload(file);
      const quill = quillRef.current?.getEditor();
      if (quill) {
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', url);
        quill.setSelection(range.index + 1, 0);
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const modules = useMemo(() => {
    const toolbarOptions = [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      ['link'],
      ...(onImageUpload ? [['image']] : []),
      ['clean']
    ];

    const mod: any = {
      toolbar: {
        container: toolbarOptions,
        ...(onImageUpload ? {
          handlers: {
            image: handleImageInsert
          }
        } : {})
      },
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
    };

    return mod;
  }, [onImageUpload]);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent',
    'link',
    'image'
  ];

  const id = instanceId.current;
  const containerHeight = minHeight ? 'auto' : `${effectiveHeight}px`;
  const editorMinHeight = minHeight ? `calc(${minHeight} - 42px)` : `${effectiveHeight - 42}px`;
  const toolbarBg = darkMode ? 'rgba(51, 65, 85, 0.6)' : '#f9fafb';
  const containerBg = darkMode ? 'rgba(30, 41, 59, 0.6)' : '#ffffff';
  const borderColor = darkMode ? 'rgba(51, 65, 85, 0.5)' : '#e5e7eb';
  const textColor = darkMode ? '#ffffff' : '#1e293b';
  const placeholderColor = darkMode ? '#64748b' : '#9ca3af';
  const iconColor = darkMode ? '#94a3b8' : '#64748b';
  const pickerColor = darkMode ? '#e2e8f0' : '#1e293b';
  const pickerOptionsBg = darkMode ? 'rgba(30, 41, 59, 0.95)' : '#ffffff';

  return (
    <div className={`${id} ${className}`} style={{ minHeight: containerHeight }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />
      <style>{`
        .${id} .ql-toolbar {
          border-top-left-radius: 0.375rem;
          border-top-right-radius: 0.375rem;
          background-color: ${toolbarBg};
          border-color: ${borderColor};
        }
        .${id} .ql-container {
          font-size: 14px;
          border-bottom-left-radius: 0.375rem;
          border-bottom-right-radius: 0.375rem;
          background-color: ${containerBg};
          color: ${textColor};
          border-color: ${borderColor};
        }
        .${id} .ql-editor {
          min-height: ${editorMinHeight};
          color: ${textColor};
          font-size: 16px;
          line-height: 1.6;
          white-space: pre-wrap;
        }
        .${id} .ql-editor.ql-blank::before {
          color: ${placeholderColor};
          font-style: normal;
        }
        .${id} .ql-stroke {
          stroke: ${iconColor};
        }
        .${id} .ql-fill {
          fill: ${iconColor};
        }
        .${id} .ql-picker {
          color: ${pickerColor};
        }
        .${id} .ql-picker-options {
          background-color: ${pickerOptionsBg};
          border-color: ${borderColor};
        }
        .${id} .ql-editor p {
          margin-bottom: 0.75em;
        }
        .${id} .ql-editor h1,
        .${id} .ql-editor h2,
        .${id} .ql-editor h3 {
          margin-top: 1.5em;
          margin-bottom: 0.5em;
        }
        .${id} .ql-editor ul,
        .${id} .ql-editor ol {
          margin-bottom: 1em;
          padding-left: 1.5em;
        }
        .${id} .ql-editor li {
          line-height: 1.5;
        }
        .${id} .ql-editor a {
          color: #3b82f6;
          text-decoration: underline;
        }
        .${id} .ql-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.75em 0;
          display: block;
        }

        /* Article content display styles */
        .article-content p { margin-bottom: 1em; white-space: pre-wrap; }
        .article-content h1, .article-content h2, .article-content h3 { margin-top: 1.5em; margin-bottom: 0.5em; }
        .article-content ul, .article-content ol { margin-bottom: 1em; padding-left: 1.5em; }
        .article-content li { line-height: 1.5; }
        .article-content a { color: #3b82f6; text-decoration: underline; }
        .article-content img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1em 0; display: block; }
      `}</style>
      <ReactQuill
        ref={quillRef}
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
