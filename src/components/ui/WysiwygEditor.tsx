import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

let _counter = 0;

interface ImageToolbarState {
  visible: boolean;
  top: number;
  left: number;
  img: HTMLImageElement | null;
}

const SIZE_OPTIONS = [
  { label: 'S', title: 'Small (25%)', width: '25%' },
  { label: 'M', title: 'Medium (50%)', width: '50%' },
  { label: 'L', title: 'Large (75%)', width: '75%' },
  { label: 'Full', title: 'Full width (100%)', width: '100%' },
];

const ALIGN_OPTIONS = [
  { label: '←', title: 'Align left', float: 'left', margin: '0 1em 0.5em 0', display: 'inline' },
  { label: '↔', title: 'Center', float: 'none', margin: '0.75em auto', display: 'block' },
  { label: '→', title: 'Align right', float: 'right', margin: '0 0 0.5em 1em', display: 'inline' },
];

export const WysiwygEditor: React.FC<WysiwygEditorProps> = ({
  value,
  onChange,
  darkMode = false,
  height,
  minHeight,
  placeholder = 'Start typing...',
  className = '',
  disabled = false,
  onImageUpload,
}) => {
  const id = useRef(`wysiwyg-${_counter++}`).current;
  const effectiveHeight = height || 300;
  const quillRef = useRef<ReactQuill>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [toolbar, setToolbar] = useState<ImageToolbarState>({ visible: false, top: 0, left: 0, img: null });

  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;

  // ── Image click handler ──────────────────────────────────────────────────
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const onClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName !== 'IMG') {
        setToolbar(t => ({ ...t, visible: false, img: null }));
        return;
      }
      const img = target as HTMLImageElement;
      const rect = img.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      setToolbar({
        visible: true,
        top: rect.top - containerRect.top - 44,
        left: rect.left - containerRect.left,
        img,
      });
    };

    container.addEventListener('click', onClick);
    return () => container.removeEventListener('click', onClick);
  }, []);

  const applySize = useCallback((width: string) => {
    if (!toolbar.img) return;
    toolbar.img.style.width = width;
    toolbar.img.style.maxWidth = '100%';
    toolbar.img.style.height = 'auto';
    setToolbar(t => ({ ...t, visible: true }));
  }, [toolbar.img]);

  const applyAlign = useCallback((opt: typeof ALIGN_OPTIONS[0]) => {
    if (!toolbar.img) return;
    toolbar.img.style.float = opt.float;
    toolbar.img.style.margin = opt.margin;
    toolbar.img.style.display = opt.display;
    setToolbar(t => ({ ...t, visible: true }));
  }, [toolbar.img]);

  const addCaption = useCallback(() => {
    if (!toolbar.img) return;
    const existing = toolbar.img.getAttribute('data-caption') || '';
    const caption = window.prompt('Image caption (leave blank to remove):', existing);
    if (caption === null) return;
    if (caption.trim() === '') {
      toolbar.img.removeAttribute('data-caption');
      toolbar.img.removeAttribute('alt');
      // Remove sibling figcaption if any
      const fig = toolbar.img.closest('figure');
      if (fig) {
        const cap = fig.querySelector('figcaption');
        if (cap) cap.remove();
      }
    } else {
      toolbar.img.setAttribute('data-caption', caption);
      toolbar.img.setAttribute('alt', caption);
      // Insert or update figcaption
      let fig = toolbar.img.closest('figure') as HTMLElement | null;
      if (!fig) {
        fig = document.createElement('figure');
        fig.style.cssText = 'margin: 1em 0; display: block;';
        toolbar.img.parentNode?.insertBefore(fig, toolbar.img);
        fig.appendChild(toolbar.img);
      }
      let cap = fig.querySelector('figcaption') as HTMLElement | null;
      if (!cap) {
        cap = document.createElement('figcaption');
        cap.style.cssText = 'text-align: center; font-size: 0.85em; color: #94a3b8; margin-top: 0.4em; font-style: italic;';
        fig.appendChild(cap);
      }
      cap.textContent = caption;
    }
    setToolbar(t => ({ ...t, visible: true }));
  }, [toolbar.img]);

  // ── File upload ──────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUploadRef.current) return;
    try {
      const url = await onImageUploadRef.current(file);
      const quill = quillRef.current?.getEditor();
      if (quill) {
        const range = quill.getSelection(true);
        quill.insertEmbed(range.index, 'image', url);
        quill.setSelection(range.index + 1, 0);
      }
    } catch (err) {
      console.error('Image upload failed:', err);
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, []);

  const handleImageInsert = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // ── Quill modules (stable — empty deps) ─────────────────────────────────
  const hasImageUpload = !!onImageUpload;
  const modules = useMemo(() => {
    const toolbarOptions = [
      [{ header: [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ list: 'ordered' }, { list: 'bullet' }],
      [{ indent: '-1' }, { indent: '+1' }],
      ['link'],
      ...(hasImageUpload ? [['image']] : []),
      ['clean'],
    ];
    return {
      toolbar: {
        container: toolbarOptions,
        ...(hasImageUpload ? { handlers: { image: handleImageInsert } } : {}),
      },
      keyboard: {
        bindings: {
          linebreak: {
            key: 13,
            shiftKey: true,
            handler(this: any, range: any) {
              this.quill.insertText(range.index, '\n', 'user');
              this.quill.setSelection(range.index + 1, 'silent');
              return false;
            },
          },
        },
      },
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const formats = useMemo(() => [
    'header', 'bold', 'italic', 'underline', 'strike',
    'list', 'bullet', 'indent', 'link', 'image',
  ], []);

  // ── Derived style values ─────────────────────────────────────────────────
  const editorMinHeight = minHeight ? `calc(${minHeight} - 42px)` : `${effectiveHeight - 42}px`;
  const toolbarBg    = darkMode ? 'rgba(51,65,85,0.6)'  : '#f9fafb';
  const containerBg  = darkMode ? 'rgba(30,41,59,0.6)'  : '#ffffff';
  const borderColor  = darkMode ? 'rgba(51,65,85,0.5)'  : '#e5e7eb';
  const textColor    = darkMode ? '#ffffff'             : '#1e293b';
  const phColor      = darkMode ? '#64748b'             : '#9ca3af';
  const iconColor    = darkMode ? '#94a3b8'             : '#64748b';
  const pickerColor  = darkMode ? '#e2e8f0'             : '#1e293b';
  const pickerOptBg  = darkMode ? 'rgba(30,41,59,0.95)' : '#ffffff';

  const btnBase = 'px-2 py-0.5 rounded text-xs font-medium transition-colors border';
  const btnStyle = 'bg-slate-700 text-white border-slate-600 hover:bg-slate-600';
  const btnActive = 'bg-blue-600 text-white border-blue-500';

  return (
    <div ref={containerRef} className={`${id} ${className} relative`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Floating image toolbar */}
      {toolbar.visible && toolbar.img && (
        <div
          className="absolute z-50 flex items-center gap-1 px-2 py-1.5 rounded-lg shadow-xl border"
          style={{
            top: Math.max(4, toolbar.top),
            left: toolbar.left,
            background: darkMode ? 'rgba(15,23,42,0.97)' : '#ffffff',
            borderColor: darkMode ? 'rgba(51,65,85,0.8)' : '#e5e7eb',
          }}
          onMouseDown={e => e.preventDefault()}
        >
          <span className="text-xs text-slate-400 mr-1 select-none">Size:</span>
          {SIZE_OPTIONS.map(s => (
            <button
              key={s.width}
              title={s.title}
              className={`${btnBase} ${toolbar.img?.style.width === s.width ? btnActive : btnStyle}`}
              onClick={() => applySize(s.width)}
            >
              {s.label}
            </button>
          ))}
          <div className="w-px h-5 bg-slate-600 mx-1" />
          <span className="text-xs text-slate-400 mr-1 select-none">Align:</span>
          {ALIGN_OPTIONS.map(a => (
            <button
              key={a.float}
              title={a.title}
              className={`${btnBase} ${toolbar.img?.style.float === a.float ? btnActive : btnStyle}`}
              onClick={() => applyAlign(a)}
            >
              {a.label}
            </button>
          ))}
          <div className="w-px h-5 bg-slate-600 mx-1" />
          <button
            title="Add / edit caption"
            className={`${btnBase} ${btnStyle}`}
            onClick={addCaption}
          >
            Caption
          </button>
        </div>
      )}

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
        }
        .${id} .ql-editor.ql-blank::before {
          color: ${phColor};
          font-style: normal;
        }
        .${id} .ql-stroke { stroke: ${iconColor}; }
        .${id} .ql-fill   { fill:   ${iconColor}; }
        .${id} .ql-picker  { color: ${pickerColor}; }
        .${id} .ql-picker-options {
          background-color: ${pickerOptBg};
          border-color: ${borderColor};
        }
        .${id} .ql-editor p            { margin-bottom: 0.75em; }
        .${id} .ql-editor h1,
        .${id} .ql-editor h2,
        .${id} .ql-editor h3           { margin-top: 1.5em; margin-bottom: 0.5em; }
        .${id} .ql-editor ul,
        .${id} .ql-editor ol           { margin-bottom: 1em; padding-left: 1.5em; }
        .${id} .ql-editor li           { line-height: 1.5; }
        .${id} .ql-editor a            { color: #3b82f6; text-decoration: underline; }
        .${id} .ql-editor img {
          max-width: 100%;
          height: auto;
          border-radius: 0.5rem;
          margin: 0.75em 0;
          display: block;
          cursor: pointer;
          transition: outline 0.15s;
        }
        .${id} .ql-editor img:hover    { outline: 2px solid #3b82f6; outline-offset: 2px; }
        .${id} .ql-editor figure       { margin: 1em 0; display: block; }
        .${id} .ql-editor figcaption   { text-align: center; font-size: 0.85em; color: #94a3b8; margin-top: 0.4em; font-style: italic; }

        .article-content p             { margin-bottom: 1em; white-space: pre-wrap; }
        .article-content h1,
        .article-content h2,
        .article-content h3            { margin-top: 1.5em; margin-bottom: 0.5em; }
        .article-content ul,
        .article-content ol            { margin-bottom: 1em; padding-left: 1.5em; }
        .article-content li            { line-height: 1.5; }
        .article-content a             { color: #3b82f6; text-decoration: underline; }
        .article-content img           { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1em 0; display: block; }
        .article-content figure        { margin: 1em 0; }
        .article-content figcaption    { text-align: center; font-size: 0.85em; color: #94a3b8; margin-top: 0.4em; font-style: italic; }
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
