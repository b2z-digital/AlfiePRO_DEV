import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader as Loader2, Trash2, ArrowLeft, Clock } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';

const AlfieLogo: React.FC<{ size?: number; className?: string }> = ({ size = 16, className = '' }) => (
  <svg viewBox="0 0 129.34 201.37" width={size} height={size * 1.56} className={className}>
    <path fill="#0066b4" d="M92.55,0s-33.42,35.95-46.9,76.95-17.97,123.01-17.97,123.01c53.92-26.12,87.06-5.06,101.66,1.42C75.98,145.19,92.55,0,92.55,0Z"/>
    <path fill="#01a2e9" d="M45.37,35.39s-23.87,31.11-37.35,61.22c-13.48,30.11-5.9,88.18-5.9,88.18,22.19-23.87,68.8-19.1,68.8-19.1C33.86,122.72,45.37,35.39,45.37,35.39Z"/>
  </svg>
);

const MiniOrb: React.FC<{ size?: number }> = ({ size = 48 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width = size * 2;
    canvas.height = size * 2;
    ctx.scale(2, 2);
    let time = 0;

    const draw = () => {
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const radius = size / 2 - 2;

      const gradient = ctx.createRadialGradient(
        cx - 3 + Math.sin(time * 0.8) * 1.5,
        cy - 4 + Math.cos(time * 0.6) * 1.5,
        1,
        cx, cy, radius + 1
      );
      gradient.addColorStop(0, 'rgba(180, 230, 255, 0.95)');
      gradient.addColorStop(0.3, 'rgba(56, 189, 248, 0.9)');
      gradient.addColorStop(0.6, 'rgba(14, 165, 233, 0.85)');
      gradient.addColorStop(1, 'rgba(2, 132, 199, 0.8)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = gradient;
      ctx.fill();

      const shineGrad = ctx.createRadialGradient(
        cx - 4 + Math.sin(time * 0.5) * 2,
        cy - 5 + Math.cos(time * 0.7) * 1.5,
        1, cx - 3, cy - 4, 10
      );
      shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.55)');
      shineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.12)');
      shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius - 1, 0, Math.PI * 2);
      ctx.fillStyle = shineGrad;
      ctx.fill();

      time += 0.03;
      animRef.current = requestAnimationFrame(draw);
    };

    draw();
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); };
  }, [size]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: size, height: size, imageRendering: 'auto' }}
    />
  );
};

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
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    loadUserProfile();
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const container = messagesContainerRef.current;
      if (container) {
        container.scrollTop = container.scrollHeight;
      }
    } else if (lastMsg.role === 'assistant' && messages.length > prevMessageCountRef.current) {
      requestAnimationFrame(() => {
        lastAssistantRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    }
    prevMessageCountRef.current = messages.length;
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

    if (showHistory) setShowHistory(false);

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

  const clearConversation = useCallback(() => {
    setMessages([]);
    setShowHistory(false);
    sessionStorage.removeItem('askAlfie_messages');
  }, []);

  const handleViewHistory = () => {
    const saved = sessionStorage.getItem('askAlfie_messages');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        const restored = parsed.map((m: any) => ({ ...m, timestamp: new Date(m.timestamp) }));
        if (restored.length > 0) {
          setMessages(restored);
          setShowHistory(true);
        }
      } catch {}
    }
  };

  const hasHistory = (() => {
    try {
      const saved = sessionStorage.getItem('askAlfie_messages');
      if (!saved) return false;
      const parsed = JSON.parse(saved);
      return parsed.length > 0;
    } catch { return false; }
  })();

  useEffect(() => {
    if (messages.length > 0) {
      sessionStorage.setItem('askAlfie_messages', JSON.stringify(messages));
    }
  }, [messages]);

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

  const isDark = embedded && darkMode;

  return (
    <div className={`${containerClass} ${!embedded ? 'bg-white border-slate-200' : ''}`}>
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-cyan-700/30 bg-gradient-to-br from-cyan-600 via-cyan-700 to-blue-800 relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-500/20 to-transparent" />
          <div className="flex items-center gap-3 relative z-10">
            {showHistory ? (
              <button onClick={() => { setShowHistory(false); setMessages([]); }} className="text-white/70 hover:text-white">
                <ArrowLeft size={18} />
              </button>
            ) : (
              <div className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center">
                <AlfieLogo size={18} />
              </div>
            )}
            <div>
              <h3 className="text-sm font-semibold text-white">Ask Alfie</h3>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[11px] text-white/70">Online</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1 relative z-10">
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="p-1.5 rounded-lg text-white/60 hover:text-red-300 hover:bg-white/10 transition-colors"
                title="Clear conversation"
              >
                <Trash2 size={14} />
              </button>
            )}
          </div>
        </div>
      )}

      <div ref={messagesContainerRef} className={`flex-1 overflow-y-auto p-4 space-y-4 ${
        isDark ? 'bg-slate-800/50' : embedded ? '' : 'bg-white'
      }`} style={!embedded ? { maxHeight: '420px' } : undefined}>
        {messages.length === 0 && !showHistory ? (
          <div className="flex flex-col items-center pt-4">
            <div className="mb-3">
              <MiniOrb size={52} />
            </div>
            <p className={`text-sm font-medium mb-1 ${isDark ? 'text-white' : 'text-slate-900'}`}>
              {userName ? `Hi ${userName}!` : 'Hi there!'}
            </p>
            <p className={`text-xs text-center mb-5 ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
              I'm Alfie. Ask me anything about using AlfiePRO.
            </p>
            <div className="w-full space-y-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-colors border ${
                    isDark
                      ? 'bg-slate-700/50 text-slate-300 hover:bg-slate-700 hover:text-cyan-400 border-slate-600'
                      : 'bg-slate-50 text-slate-600 hover:bg-sky-50 hover:text-sky-600 border-slate-200'
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isLastAssistant = msg.role === 'assistant' && (
              idx === messages.length - 1 ||
              !messages.slice(idx + 1).some(m => m.role === 'assistant')
            );
            return (
              <div
                key={msg.id}
                ref={isLastAssistant ? lastAssistantRef : undefined}
                className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {msg.role === 'assistant' && (
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0 ${
                    isDark ? 'bg-slate-700' : 'bg-slate-100'
                  }`}>
                    <AlfieLogo size={14} />
                  </div>
                )}
                <div
                  className={`max-w-[80%] px-3 py-2 rounded-xl text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-cyan-600 text-white rounded-br-sm'
                      : isDark
                        ? 'bg-slate-700 text-slate-200 border border-slate-600 rounded-bl-sm'
                        : 'bg-slate-50 text-slate-700 border border-slate-200 rounded-bl-sm'
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
            );
          })
        )}

        {isLoading && (
          <div className="flex items-start gap-2">
            <div className={`w-6 h-6 rounded-full flex items-center justify-center flex-shrink-0 ${
              isDark ? 'bg-slate-700' : 'bg-slate-100'
            }`}>
              <AlfieLogo size={14} />
            </div>
            <div className={`px-3 py-2 rounded-xl rounded-bl-sm border ${
              isDark ? 'bg-slate-700 border-slate-600' : 'bg-slate-50 border-slate-200'
            }`}>
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      <div className={`px-3 pt-2 pb-3 border-t ${
        isDark ? 'bg-slate-800/80 border-slate-700' : 'bg-white border-slate-100'
      }`}>
        {messages.length === 0 && !showHistory && hasHistory && (
          <button
            onClick={handleViewHistory}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 text-xs text-slate-400 hover:text-cyan-500 transition-colors"
          >
            <Clock size={12} />
            View conversation history
          </button>
        )}
        {showHistory && messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setShowHistory(false); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 text-xs text-slate-400 hover:text-cyan-500 transition-colors"
          >
            <ArrowLeft size={12} />
            Start new conversation
          </button>
        )}
        <div
          className="rounded-xl p-[1.5px]"
          style={{
            background: isDark
              ? 'linear-gradient(135deg, rgba(56,189,248,0.35), rgba(14,165,233,0.2), rgba(6,182,212,0.35), rgba(56,189,248,0.2))'
              : 'linear-gradient(135deg, rgba(56,189,248,0.5), rgba(14,165,233,0.3), rgba(6,182,212,0.5), rgba(56,189,248,0.3))',
          }}
        >
          <div className={`flex items-center gap-2 px-3 py-2.5 rounded-[10px] ${
            isDark ? 'bg-slate-800' : 'bg-slate-50'
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
                isDark ? 'text-white placeholder-slate-500' : 'text-slate-900 placeholder-slate-400'
              }`}
            />
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isLoading}
              className={`p-1.5 rounded-lg transition-all ${
                input.trim() && !isLoading
                  ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                  : isDark ? 'text-slate-500 cursor-not-allowed' : 'text-slate-300 cursor-not-allowed'
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
    </div>
  );
};
