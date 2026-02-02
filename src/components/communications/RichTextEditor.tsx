import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import Link from '@tiptap/extension-link';
import {
  Bold,
  Italic,
  List,
  ListOrdered,
  Link as LinkIcon,
  Smile,
  X
} from 'lucide-react';

interface RichTextEditorProps {
  content: string;
  onChange: (content: string) => void;
  placeholder?: string;
  darkMode?: boolean;
  onEmojiClick?: () => void;
  editorRef?: React.MutableRefObject<any>;
  emojiButtonRef?: React.RefObject<HTMLButtonElement>;
}

interface LinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (url: string) => void;
  darkMode: boolean;
}

const LinkModal: React.FC<LinkModalProps> = ({ isOpen, onClose, onSubmit, darkMode }) => {
  const [url, setUrl] = React.useState('');

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (url.trim()) {
      onSubmit(url);
      setUrl('');
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div
        className={`w-full max-w-md p-6 rounded-lg shadow-xl ${
          darkMode ? 'bg-slate-800 border border-slate-700' : 'bg-white border border-slate-200'
        }`}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className={`text-lg font-semibold ${
            darkMode ? 'text-white' : 'text-slate-900'
          }`}>
            Insert Link
          </h3>
          <button
            onClick={onClose}
            className={`p-1 rounded hover:bg-slate-700 transition-colors ${
              darkMode ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            <X size={20} />
          </button>
        </div>
        <form onSubmit={handleSubmit}>
          <input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://example.com"
            className={`w-full px-3 py-2 rounded-lg border ${
              darkMode
                ? 'bg-slate-700 border-slate-600 text-white placeholder-slate-400'
                : 'bg-white border-slate-300 text-slate-900 placeholder-slate-500'
            } focus:outline-none focus:ring-2 focus:ring-blue-500`}
            autoFocus
          />
          <div className="flex justify-end gap-2 mt-4">
            <button
              type="button"
              onClick={onClose}
              className={`px-4 py-2 rounded-lg ${
                darkMode
                  ? 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              } transition-colors`}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  content,
  onChange,
  placeholder = 'Write your message...',
  darkMode = true,
  onEmojiClick,
  editorRef,
  emojiButtonRef
}) => {
  const [showLinkModal, setShowLinkModal] = React.useState(false);
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder,
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          class: 'text-blue-400 hover:text-blue-300 underline',
        },
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: `prose prose-sm max-w-none focus:outline-none ${
          darkMode ? 'prose-invert text-slate-200' : 'text-slate-900'
        } min-h-[150px] p-3`,
      },
    },
  });

  useEffect(() => {
    if (editor && editorRef) {
      editorRef.current = editor;
    }
  }, [editor, editorRef]);

  // Sync content when it changes externally
  useEffect(() => {
    if (editor && content !== editor.getHTML()) {
      editor.commands.setContent(content);
    }
  }, [content, editor]);

  if (!editor) {
    return null;
  }

  const setLink = (url: string) => {
    if (url) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  };

  return (
    <div
      className={`border rounded-lg ${
        darkMode ? 'border-slate-600 bg-slate-700' : 'border-slate-300 bg-white'
      }`}
    >
      {/* Toolbar */}
      <div
        className={`flex items-center gap-1 p-2 border-b ${
          darkMode ? 'border-slate-600' : 'border-slate-200'
        }`}
      >
        <button
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBold().run();
          }}
          className={`p-2 rounded hover:bg-slate-600 transition-colors ${
            editor.isActive('bold') ? 'bg-slate-600 text-blue-400' : 'text-slate-400'
          }`}
          title="Bold (Ctrl+B)"
          type="button"
        >
          <Bold size={18} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleItalic().run();
          }}
          className={`p-2 rounded hover:bg-slate-600 transition-colors ${
            editor.isActive('italic') ? 'bg-slate-600 text-blue-400' : 'text-slate-400'
          }`}
          title="Italic (Ctrl+I)"
          type="button"
        >
          <Italic size={18} />
        </button>
        <div className="w-px h-6 bg-slate-600 mx-1" />
        <button
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleBulletList().run();
          }}
          className={`p-2 rounded hover:bg-slate-600 transition-colors ${
            editor.isActive('bulletList') ? 'bg-slate-600 text-blue-400' : 'text-slate-400'
          }`}
          title="Bullet List"
          type="button"
        >
          <List size={18} />
        </button>
        <button
          onClick={(e) => {
            e.preventDefault();
            editor.chain().focus().toggleOrderedList().run();
          }}
          className={`p-2 rounded hover:bg-slate-600 transition-colors ${
            editor.isActive('orderedList') ? 'bg-slate-600 text-blue-400' : 'text-slate-400'
          }`}
          title="Numbered List"
          type="button"
        >
          <ListOrdered size={18} />
        </button>
        <div className="w-px h-6 bg-slate-600 mx-1" />
        <button
          onClick={(e) => {
            e.preventDefault();
            setShowLinkModal(true);
          }}
          className={`p-2 rounded hover:bg-slate-600 transition-colors ${
            editor.isActive('link') ? 'bg-slate-600 text-blue-400' : 'text-slate-400'
          }`}
          title="Insert Link"
          type="button"
        >
          <LinkIcon size={18} />
        </button>
        {onEmojiClick && (
          <>
            <div className="w-px h-6 bg-slate-600 mx-1" />
            <button
              ref={emojiButtonRef}
              onClick={(e) => {
                e.preventDefault();
                onEmojiClick();
              }}
              className="p-2 rounded hover:bg-slate-600 transition-colors text-slate-400"
              title="Insert Emoji"
              type="button"
            >
              <Smile size={18} />
            </button>
          </>
        )}
      </div>

      {/* Editor Content */}
      <div className="tiptap-editor-content">
        <EditorContent editor={editor} />
      </div>

      <style>{`
        .tiptap-editor-content ul {
          list-style-type: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .tiptap-editor-content ol {
          list-style-type: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .tiptap-editor-content li {
          margin: 0.25rem 0;
        }
        .tiptap-editor-content li p {
          margin: 0;
        }
      `}</style>

      {/* Link Modal */}
      <LinkModal
        isOpen={showLinkModal}
        onClose={() => setShowLinkModal(false)}
        onSubmit={setLink}
        darkMode={darkMode}
      />
    </div>
  );
};
