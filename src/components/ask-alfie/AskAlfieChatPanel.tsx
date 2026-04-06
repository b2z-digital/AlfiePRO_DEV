import React, { useState, useRef, useEffect } from 'react';
import { Send, Loader as Loader2, Trash2, ArrowLeft } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

const AlfieLogo: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg viewBox="0 0 129.34 201.37" width={size} height={size * 1.56} className={className}>
    <path fill="#0066b4" d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"/>
    <path fill="#01a2e9" d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"/>
  </svg>
);

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AskAlfieChatPanelProps {
  darkMode: boolean;
  onClose: () => void;
  embedded?: boolean;
}

const QUICK_QUESTIONS = [
  'How do I create a race series?',
  'How do I add a new member?',
  'How do I set up a committee meeting?',
  'How do I manage membership fees?',
  'How do I create an event website?',
  'How do I import race results?',
];

export const AskAlfieChatPanel: React.FC<AskAlfieChatPanelProps> = ({
  darkMode,
  onClose,
  embedded = false,
}) => {
  const { user, currentClub } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadUserProfile();
    const saved = sessionStorage.getItem('askAlfie_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setMessages(parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) })));
      } catch {}
    }
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('askAlfie_messages', JSON.stringify(messages));
    }
  }, [messages]);

  const loadUserProfile = async () => {
    if (!user) return;
    const { data } = await supabase
      .from('profiles')
      .select('full_name, first_name, avatar_url')
      .eq('id', user.id)
      .maybeSingle();
    if (data) {
      setUserName(data.first_name || data.full_name?.split(' ')[0] || '');
      setUserAvatar(data.avatar_url || null);
      const first = (data.first_name || data.full_name?.split(' ')[0] || '').charAt(0).toUpperCase();
      const last = data.full_name?.split(' ').pop()?.charAt(0).toUpperCase() || '';
      setUserInitials(first + last || '?');
    }
  };

  const sendMessage = async (text?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const conversationHistory = messages.slice(-10).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/ask-alfie-chat`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${session.access_token}`,
            'Content-Type': 'application/json',
            Apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            message: messageText,
            conversationHistory,
            clubId: currentClub?.clubId || null,
            source: 'web_platform',
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      const assistantMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: data.message,
        timestamp: new Date(),
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('AskAlfie error:', error);
      const errorMessage: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'assistant',
        content: "Sorry, I'm having trouble connecting right now. Please try again in a moment.",
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const clearConversation = () => {
    setMessages([]);
    sessionStorage.removeItem('askAlfie_messages');
  };

  const formatMessageContent = (content: string) => {
    const parts = content.split(/(\*\*.*?\*\*|\n)/g);
    return parts.map((part, i) => {
      if (part === '\n') return <br key={i} />;
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong>;
      }
      return <span key={i}>{part}</span>;
    });
  };

  const containerClass = embedded
    ? 'w-full h-full flex flex-col'
    : 'fixed bottom-24 right-6 z-[9989] w-[400px] max-h-[600px] flex flex-col rounded-2xl shadow-2xl border overflow-hidden';

  const bgClass = darkMode
    ? 'bg-slate-800 border-slate-700'
    : 'bg-white border-slate-200';

  return (
    <div className={`${containerClass} ${!embedded ? bgClass : ''}`}>
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/50 bg-gradient-to-r from-slate-800 to-slate-900">
          <div className="flex items-center gap-3">
            {showHistory ? (
              <button onClick={() => setShowHistory(false)} className="text-slate-400 hover:text-white">
                <ArrowLeft size={18} />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center">
                <AlfieLogo size={18} />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-white">Ask Alfie</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-slate-400">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-400 hover:bg-slate-700/50 transition-colors"
                title="Clear conversation"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <div className={`flex-1 overflow-y-auto p-4 space-y-4 ${
        embedded ? '' : darkMode ? 'bg-slate-800/50' : 'bg-slate-50'
      }`} style={!embedded ? { maxHeight: '420px' } : undefined}>
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-sky-100 to-blue-100 flex items-center justify-center mb-3">
              <AlfieLogo size={24} />
            </div>
            <p className={`text-sm font-medium mb-1 ${darkMode ? 'text-white' : 'text-slate-900'}`}>
              {userName ? `G'day ${userName}!` : "G'day!"}
            </p>
            <p className={`text-xs text-center mb-5 ${darkMode ? 'text-slate-400' : 'text-slate-500'}`}>
              I'm your platform assistant. Ask me anything about using AlfiePRO.
            </p>
            <div className="w-full space-y-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors ${
                    darkMode
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-cyan-300 border border-slate-600/50'
                      : 'bg-white text-slate-600 hover:bg-sky-50 hover:text-sky-600 border border-slate-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map(msg => (
            <div
              key={msg.id}
              className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              {msg.role === 'assistant' && (
                <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center mr-2 mt-1 flex-shrink-0">
                  <AlfieLogo size={14} />
                </div>
              )}
              <div
                className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                  msg.role === 'user'
                    ? 'bg-cyan-600 text-white rounded-br-sm'
                    : darkMode
                      ? 'bg-slate-700 text-slate-200 border border-slate-600/50 rounded-bl-sm'
                      : 'bg-white text-slate-700 border border-slate-200 rounded-bl-sm shadow-sm'
                }`}
              >
                {formatMessageContent(msg.content)}
              </div>
              {msg.role === 'user' && (
                <div className="w-6 h-6 rounded-full flex items-center justify-center ml-2 mt-1 flex-shrink-0 overflow-hidden">
                  {userAvatar ? (
                    <img src={userAvatar} alt="" className="w-full h-full object-cover rounded-full" />
                  ) : (
                    <div className="w-full h-full rounded-full bg-gradient-to-br from-blue-500 to-cyan-600 flex items-center justify-center text-white text-[10px] font-semibold">
                      {userInitials}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className="w-6 h-6 rounded-full bg-white/10 flex items-center justify-center flex-shrink-0">
              <AlfieLogo size={14} />
            </div>
            <div className={`px-3 py-2 rounded-xl rounded-bl-sm ${
              darkMode ? 'bg-slate-700 border border-slate-600/50' : 'bg-white border border-slate-200 shadow-sm'
            }`}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className={`p-3 border-t ${
        darkMode ? 'border-slate-700 bg-slate-800' : 'border-slate-200 bg-white'
      }`}>
        <div className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-colors ${
          darkMode
            ? 'bg-slate-700/50 border-slate-600 focus-within:border-cyan-500'
            : 'bg-slate-50 border-slate-200 focus-within:border-sky-400'
        }`}>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask Alfie..."
            disabled={isLoading}
            className={`flex-1 bg-transparent text-sm outline-none ${
              darkMode ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
            }`}
          />
          <button
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className={`p-1.5 rounded-lg transition-all ${
              input.trim() && !isLoading
                ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                : darkMode
                  ? 'text-slate-600 cursor-not-allowed'
                  : 'text-slate-300 cursor-not-allowed'
            }`}
          >
            {isLoading ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Send size={16} />
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
