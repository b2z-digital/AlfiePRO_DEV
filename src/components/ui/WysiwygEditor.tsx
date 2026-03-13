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

interface SelectedImage {
  img: HTMLImageElement;
  top: number;
  left: number;
}

interface CaptionModalState {
  open: boolean;
  value: string;
}

const SIZE_OPTIONS = [
  { label: 'S',    title: 'Small (25%)',       width: '25%'  },
  { label: 'M',    title: 'Medium (50%)',      width: '50%'  },
  { label: 'L',    title: 'Large (75%)',       width: '75%'  },
  { label: 'Full', title: 'Full width (100%)', width: '100%' },
];

const ALIGN_OPTIONS = [
  { label: '⬅', title: 'Float left',  float: 'left',  margin: '0 1em 0.5em 0', display: 'inline' },
  { label: '⬛', title: 'Center',      float: 'none',  margin: '0.75em auto',   display: 'block'  },
  { label: '➡', title: 'Float right', float: 'right', margin: '0 0 0.5em 1em', display: 'inline' },
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
  const id              = useRef(`wysiwyg-${_counter++}`).current;
  const effectiveHeight = height || 300;
  const quillRef        = useRef<ReactQuill>(null);
  const fileInputRef    = useRef<HTMLInputElement>(null);
  const containerRef    = useRef<HTMLDivElement>(null);
  const floatingRef     = useRef<HTMLDivElement>(null);
  const captionInputRef = useRef<HTMLInputElement>(null);

  const selectedImgRef = useRef<HTMLImageElement | null>(null);
  const [selected, setSelected]           = useState<SelectedImage | null>(null);
  const [captionModal, setCaptionModal]   = useState<CaptionModalState>({ open: false, value: '' });

  const onImageUploadRef = useRef(onImageUpload);
  onImageUploadRef.current = onImageUpload;

  // ── Reposition toolbar ───────────────────────────────────────────────────
  const refreshToolbarPos = useCallback((img: HTMLImageElement) => {
    const container = containerRef.current;
    if (!container) return;
    const imgRect       = img.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    setSelected({
      img,
      top:  imgRect.top  - containerRect.top  - 48,
      left: imgRect.left - containerRect.left,
    });
  }, []);

  // ── Attach mousedown listener to Quill root after mount ──────────────────
  useEffect(() => {
    let removeListener: (() => void) | undefined;
    let attempts = 0;

    const tryAttach = () => {
      const quill = quillRef.current?.getEditor();
      if (!quill) {
        if (attempts++ < 30) setTimeout(tryAttach, 100);
        return;
      }
      const root = quill.root as HTMLElement;
      const onMouseDown = (e: MouseEvent) => {
        const target = e.target as HTMLElement;
        if (target.tagName === 'IMG') {
          const img = target as HTMLImageElement;
          selectedImgRef.current = img;
          refreshToolbarPos(img);
          e.stopPropagation();
        }
      };
      root.addEventListener('mousedown', onMouseDown);
      removeListener = () => root.removeEventListener('mousedown', onMouseDown);
    };

    tryAttach();
    return () => removeListener?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Click outside → deselect (skip if inside toolbar or caption modal) ───
  useEffect(() => {
    const onDocMouseDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (floatingRef.current?.contains(target)) return;
      if ((target as HTMLElement).tagName === 'IMG') return;
      if ((target as HTMLElement).closest?.('[data-caption-modal]')) return;
      selectedImgRef.current = null;
      setSelected(null);
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  // ── Apply size ────────────────────────────────────────────────────────────
  const applySize = (width: string) => {
    const img = selectedImgRef.current;
    if (!img) return;
    img.style.width    = width;
    img.style.maxWidth = '100%';
    img.style.height   = 'auto';
    refreshToolbarPos(img);
  };

  // ── Apply alignment ───────────────────────────────────────────────────────
  const applyAlign = (opt: typeof ALIGN_OPTIONS[0]) => {
    const img = selectedImgRef.current;
    if (!img) return;
    img.style.float   = opt.float;
    img.style.margin  = opt.margin;
    img.style.display = opt.display;
    refreshToolbarPos(img);
  };

  // ── Open caption modal ────────────────────────────────────────────────────
  const openCaption = () => {
    const img = selectedImgRef.current;
    if (!img) return;
    const existing = img.getAttribute('data-caption') || '';
    setCaptionModal({ open: true, value: existing });
    setTimeout(() => captionInputRef.current?.focus(), 50);
  };

  // ── Confirm caption ───────────────────────────────────────────────────────
  const confirmCaption = () => {
    const img = selectedImgRef.current;
    if (!img) { setCaptionModal({ open: false, value: '' }); return; }
    const caption = captionModal.value.trim();

    try {
      if (caption === '') {
        img.removeAttribute('data-caption');
        img.removeAttribute('alt');
        // Unwrap from figure if present
        const fig = img.closest('figure');
        if (fig) {
          fig.querySelector('figcaption')?.remove();
          fig.parentNode?.insertBefore(img, fig);
          fig.parentNode?.removeChild(fig);
        }
      } else {
        img.setAttribute('data-caption', caption);
        img.setAttribute('alt', caption);

        // Find or create wrapping figure
        let fig = img.closest('figure') as HTMLElement | null;
        if (!fig) {
          fig = document.createElement('figure');
          fig.style.cssText = 'margin:1em 0;display:block;';
          img.parentNode?.insertBefore(fig, img);
          fig.appendChild(img);
        }

        // Find or create figcaption
        let cap = fig.querySelector('figcaption') as HTMLElement | null;
        if (!cap) {
          cap = document.createElement('figcaption');
          cap.style.cssText =
            'text-align:center;font-size:0.85em;color:#94a3b8;margin-top:0.4em;font-style:italic;';
          fig.appendChild(cap);
        }
        cap.textContent = caption;
      }

      refreshToolbarPos(img);
    } catch (err) {
      console.error('Caption error:', err);
    }

    setCaptionModal({ open: false, value: '' });
  };

  const cancelCaption = () => setCaptionModal({ open: false, value: '' });

  // ── File upload ───────────────────────────────────────────────────────────
  const handleFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !onImageUploadRef.current) return;
    try {
      const url   = await onImageUploadRef.current(file);
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

  const handleImageInsert = useCallback(() => { fileInputRef.current?.click(); }, []);

  // ── Quill modules (stable ref) ────────────────────────────────────────────
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
            key: 13, shiftKey: true,
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

  // ── Styles ────────────────────────────────────────────────────────────────
  const editorMinHeight = minHeight ? `calc(${minHeight} - 42px)` : `${effectiveHeight - 42}px`;
  const toolbarBg   = darkMode ? 'rgba(51,65,85,0.6)'  : '#f9fafb';
  const containerBg = darkMode ? 'rgba(30,41,59,0.6)'  : '#ffffff';
  const borderColor = darkMode ? 'rgba(51,65,85,0.5)'  : '#e5e7eb';
  const textColor   = darkMode ? '#ffffff'             : '#1e293b';
  const phColor     = darkMode ? '#64748b'             : '#9ca3af';
  const iconColor   = darkMode ? '#94a3b8'             : '#64748b';
  const pickerColor = darkMode ? '#e2e8f0'             : '#1e293b';
  const pickerOptBg = darkMode ? 'rgba(30,41,59,0.95)' : '#ffffff';

  const btnBase   = 'px-2 py-1 rounded text-xs font-semibold transition-colors border cursor-pointer';
  const btnNormal = 'bg-slate-700 text-slate-200 border-slate-600 hover:bg-slate-500';
  const btnActive = 'bg-blue-600 text-white border-blue-500';

  const currentWidth = selected?.img.style.width ?? '';
  const currentFloat = selected?.img.style.float ?? '';

  return (
    <div ref={containerRef} className={`${id} ${className} relative`}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* ── Floating image controls ── */}
      {selected && (
        <div
          ref={floatingRef}
          className="absolute z-50 flex flex-wrap items-center gap-1 px-2 py-1.5 rounded-lg shadow-2xl border select-none"
          style={{
            top:           Math.max(4, selected.top),
            left:          selected.left,
            background:    darkMode ? 'rgba(15,23,42,0.97)' : '#f8fafc',
            borderColor:   darkMode ? 'rgba(71,85,105,0.9)' : '#cbd5e1',
            pointerEvents: 'auto',
          }}
          onMouseDown={e => e.stopPropagation()}
        >
          <span className="text-xs text-slate-400 font-medium pr-0.5">Size:</span>
          {SIZE_OPTIONS.map(s => (
            <button
              key={s.width}
              type="button"
              title={s.title}
              className={`${btnBase} ${currentWidth === s.width ? btnActive : btnNormal}`}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); applySize(s.width); }}
            >
              {s.label}
            </button>
          ))}

          <div className="w-px h-5 bg-slate-600 mx-1" />

          <span className="text-xs text-slate-400 font-medium pr-0.5">Align:</span>
          {ALIGN_OPTIONS.map(a => (
            <button
              key={a.float}
              type="button"
              title={a.title}
              className={`${btnBase} ${currentFloat === a.float ? btnActive : btnNormal}`}
              onMouseDown={e => { e.preventDefault(); e.stopPropagation(); applyAlign(a); }}
            >
              {a.label}
            </button>
          ))}

          <div className="w-px h-5 bg-slate-600 mx-1" />

          <button
            type="button"
            title="Add / edit caption"
            className={`${btnBase} ${btnNormal}`}
            onMouseDown={e => { e.preventDefault(); e.stopPropagation(); openCaption(); }}
          >
            Caption
          </button>
        </div>
      )}

      {/* ── In-app caption modal ── */}
      {captionModal.open && (
        <div
          data-caption-modal="true"
          className="fixed inset-0 z-[200] flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.55)' }}
          onMouseDown={e => e.stopPropagation()}
        >
          <div
            className="rounded-xl shadow-2xl border p-6 w-full max-w-sm"
            style={{
              background:   darkMode ? '#1e293b' : '#ffffff',
              borderColor:  darkMode ? 'rgba(71,85,105,0.8)' : '#e2e8f0',
            }}
          >
            <h3
              className="text-base font-semibold mb-4"
              style={{ color: textColor }}
            >
              Image Caption
            </h3>
            <input
              ref={captionInputRef}
              type="text"
              value={captionModal.value}
              onChange={e => setCaptionModal(m => ({ ...m, value: e.target.value }))}
              onKeyDown={e => { if (e.key === 'Enter') confirmCaption(); if (e.key === 'Escape') cancelCaption(); }}
              placeholder="Enter caption (leave blank to remove)"
              className="w-full rounded-lg px-3 py-2 text-sm border outline-none focus:ring-2 focus:ring-blue-500 mb-5"
              style={{
                background:  darkMode ? 'rgba(30,41,59,0.8)' : '#f8fafc',
                borderColor: darkMode ? 'rgba(71,85,105,0.8)' : '#cbd5e1',
                color:       textColor,
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={cancelCaption}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-colors"
                style={{
                  background:  darkMode ? 'rgba(51,65,85,0.6)' : '#f1f5f9',
                  borderColor: darkMode ? 'rgba(71,85,105,0.6)' : '#cbd5e1',
                  color:       darkMode ? '#cbd5e1' : '#475569',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmCaption}
                className="px-4 py-2 rounded-lg text-sm font-medium bg-blue-600 hover:bg-blue-700 text-white border border-blue-500 transition-colors"
              >
                Apply
              </button>
            </div>
          </div>
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
        .${id} .ql-editor.ql-blank::before { color: ${phColor}; font-style: normal; }
        .${id} .ql-stroke  { stroke: ${iconColor}; }
        .${id} .ql-fill    { fill:   ${iconColor}; }
        .${id} .ql-picker  { color:  ${pickerColor}; }
        .${id} .ql-picker-options { background-color: ${pickerOptBg}; border-color: ${borderColor}; }
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
