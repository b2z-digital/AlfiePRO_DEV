import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader as Loader2, Trash2, ArrowLeft, Clock, Pencil, HelpCircle, Volume2, Share2, ImagePlus, Camera, Image as ImageIcon, X as XIcon } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { RaceScenarioCanvas } from './RaceScenarioCanvas';

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
        1, cx, cy, radius + 1
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
  drawingImage?: string;
}

type ViewMode = 'welcome' | 'chat' | 'drawing';

interface AskAlfieChatPanelProps {
  darkMode: boolean;
  onClose: () => void;
  embedded?: boolean;
  courseMode?: boolean;
}

const QUICK_ACTIONS = [
  { id: 'draw', icon: Pencil, label: 'Draw\nScenario', description: 'Sketch a race situation' },
  { id: 'rules', icon: HelpCircle, label: 'Racing\nRules', description: 'Ask about rules' },
];

const QUICK_QUESTIONS = [
  'What happens when two boats meet at a mark?',
  'Explain rule 18 - mark-room',
  'How does the protest process work?',
  'What are the starting penalties (OCS, BFD, UFD)?',
  'How do I set up a race series?',
  'How do I add a new member?',
];

export const AskAlfieChatPanel: React.FC<AskAlfieChatPanelProps> = ({
  darkMode,
  onClose,
  embedded = false,
  courseMode = false,
}) => {
  const { user, currentClub } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [userName, setUserName] = useState('');
  const [userAvatar, setUserAvatar] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>('welcome');
  const [attachedDrawing, setAttachedDrawing] = useState<string | null>(null);
  const [drawingCourseMode, setDrawingCourseMode] = useState(courseMode);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    loadUserProfile();
  }, []);

  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'user') {
      const container = messagesContainerRef.current;
      if (container) container.scrollTop = container.scrollHeight;
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

  const sendMessage = async (text?: string, imageData?: string) => {
    const messageText = text || input.trim();
    if (!messageText || isLoading) return;

    if (showHistory) setShowHistory(false);
    if (viewMode !== 'chat') setViewMode('chat');

    const image = imageData || attachedDrawing;

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: messageText,
      timestamp: new Date(),
      drawingImage: image || undefined,
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setAttachedDrawing(null);
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
            image_url: image || undefined,
            course_mode: drawingCourseMode || undefined,
          }),
        }
      );

      if (!response.ok) throw new Error(`API error: ${response.status}`);

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

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setAttachedDrawing(result);
      if (viewMode === 'welcome') setViewMode('chat');
      setTimeout(() => inputRef.current?.focus(), 100);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
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
    setAttachedDrawing(null);
    sessionStorage.removeItem('askAlfie_messages');
    setViewMode('welcome');
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
          setViewMode('chat');
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

  const handleDrawingSave = (imageData: string, _elements: any[]) => {
    setAttachedDrawing(imageData);
    setViewMode('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const handleQuickAction = (actionId: string) => {
    if (actionId === 'draw') {
      setViewMode('drawing');
    } else if (actionId === 'rules') {
      setViewMode('chat');
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  };

  const startChatFromWelcome = () => {
    setViewMode('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Drawing mode
  if (viewMode === 'drawing') {
    return (
      <div className={`${embedded ? 'w-full h-full' : 'fixed bottom-24 right-6 z-[9989] w-[480px] h-[700px] max-h-[85vh] rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden'}`}>
        <RaceScenarioCanvas
          onSave={handleDrawingSave}
          onClose={() => setViewMode(messages.length > 0 ? 'chat' : 'welcome')}
          darkMode
          courseMode={drawingCourseMode}
        />
      </div>
    );
  }

  const containerClass = embedded
    ? 'w-full h-full flex flex-col'
    : 'fixed bottom-24 right-6 z-[9989] w-[420px] max-h-[700px] flex flex-col rounded-2xl shadow-2xl border overflow-hidden';

  // Welcome screen
  if (viewMode === 'welcome' && messages.length === 0) {
    return (
      <div className={`${containerClass} bg-[#0b1120] ${!embedded ? 'border-slate-700/50' : ''}`}>
        {/* Header bar */}
        {!embedded && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/30">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-slate-800 flex items-center justify-center">
                <AlfieLogo size={16} />
              </div>
              <div>
                <span className="text-xs font-semibold text-white">Ask Alfie</span>
                <div className="flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] text-slate-500">Online</span>
                </div>
              </div>
            </div>
            {hasHistory && (
              <button
                onClick={handleViewHistory}
                className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
                title="View history"
              >
                <Clock size={14} />
              </button>
            )}
          </div>
        )}

        {/* Welcome content */}
        <div className="flex-1 overflow-y-auto flex flex-col items-center px-6 pt-8 pb-6">
          <div className="mb-3">
            <MiniOrb size={80} />
          </div>

          <div className="flex items-center gap-1.5 mb-3">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            <span className="text-xs text-slate-400">Ask Alfie</span>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Hi {userName || 'there'},
          </h2>
          <p className="text-sm text-slate-400 text-center mb-8 leading-relaxed">
            I'm your sailing assistant for racing rules,<br />
            rig tuning, app help, and more
          </p>

          {/* Action tiles */}
          <div className="grid grid-cols-3 gap-3 w-full mb-6">
            <button
              onClick={() => handleQuickAction('draw')}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-600/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                <Pencil className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-xs font-medium text-white text-center leading-tight">
                Draw<br />Scenario
              </span>
            </button>
            <button
              onClick={() => { setDrawingCourseMode(true); setViewMode('drawing'); }}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-600/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                <ImagePlus className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-xs font-medium text-white text-center leading-tight">
                Draw<br />Course
              </span>
            </button>
            <button
              onClick={() => {
                setViewMode('chat');
                setTimeout(() => {
                  sendMessage('What are the key racing rules I should know about?');
                }, 100);
              }}
              className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-600/40 transition-all group"
            >
              <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                <HelpCircle className="w-5 h-5 text-cyan-400" />
              </div>
              <span className="text-xs font-medium text-white text-center leading-tight">
                Racing<br />Rules
              </span>
            </button>
          </div>

          {/* Quick questions */}
          <div className="w-full space-y-2">
            {QUICK_QUESTIONS.slice(0, 4).map((q, i) => (
              <button
                key={i}
                onClick={() => {
                  setViewMode('chat');
                  setTimeout(() => sendMessage(q), 50);
                }}
                className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs text-slate-300 hover:text-cyan-400 transition-colors border border-slate-700/40 bg-slate-800/20 hover:bg-slate-800/50 hover:border-cyan-600/30"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* History link */}
        {hasHistory && (
          <div className="px-4 pb-2">
            <button
              onClick={handleViewHistory}
              className="w-full flex items-center justify-center gap-1.5 py-2 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
            >
              <Clock size={12} />
              View conversation history
            </button>
          </div>
        )}

        {/* Input bar */}
        <div className="px-3 pt-2 pb-3 border-t border-slate-700/30">
          <div
            className="rounded-xl p-[1.5px]"
            style={{
              background: 'linear-gradient(135deg, rgba(56,189,248,0.35), rgba(14,165,233,0.2), rgba(6,182,212,0.35), rgba(56,189,248,0.2))',
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-slate-800/90">
              <input
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    if (input.trim()) {
                      setViewMode('chat');
                      setTimeout(() => sendMessage(), 50);
                    }
                  }
                }}
                onFocus={startChatFromWelcome}
                placeholder="Tap here to chat with Alfie"
                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
              />
              <button
                onClick={() => {
                  if (input.trim()) {
                    setViewMode('chat');
                    setTimeout(() => sendMessage(), 50);
                  }
                }}
                disabled={!input.trim()}
                className={`p-1.5 rounded-lg transition-all ${
                  input.trim()
                    ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                    : 'text-slate-500 cursor-not-allowed'
                }`}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Chat view
  return (
    <div className={`${containerClass} ${!embedded ? 'bg-[#0b1120] border-slate-700/50' : ''}`}>
      {/* Chat header */}
      {!embedded && (
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/30 bg-[#0b1120]">
          <div className="flex items-center gap-3">
            <button
              onClick={() => {
                if (messages.length === 0) {
                  setViewMode('welcome');
                } else {
                  onClose();
                }
              }}
              className="p-1 text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={18} />
            </button>
            <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center">
              <AlfieLogo size={16} />
            </div>
            <div>
              <span className="text-sm font-semibold text-white">Ask Alfie</span>
              <div className="flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] text-slate-500">Ask Alfie</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearConversation}
                className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
                title="Clear conversation"
              >
                <Trash2 size={14} />
              </button>
            )}
            <button
              onClick={handleViewHistory}
              className="p-1.5 rounded-lg text-slate-500 hover:text-cyan-400 hover:bg-slate-800 transition-colors"
              title="History"
            >
              <Clock size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Messages */}
      <div
        ref={messagesContainerRef}
        className={`flex-1 overflow-y-auto p-4 space-y-4 ${embedded && darkMode ? 'bg-slate-800/50' : embedded ? '' : 'bg-[#0b1120]'}`}
        style={!embedded ? { maxHeight: '520px' } : undefined}
      >
        {messages.length === 0 ? (
          <div className="flex flex-col items-center pt-4">
            <div className="mb-3">
              <MiniOrb size={44} />
            </div>
            <p className="text-sm font-medium mb-1 text-white">
              {userName ? `Hi ${userName}!` : 'Hi there!'}
            </p>
            <p className="text-xs text-center mb-5 text-slate-400">
              I'm Alfie. Ask me anything about racing rules or using AlfiePRO.
            </p>
            <div className="w-full space-y-2">
              {QUICK_QUESTIONS.map((q, i) => (
                <button
                  key={i}
                  onClick={() => sendMessage(q)}
                  className="w-full text-left px-3.5 py-2.5 rounded-xl text-xs transition-colors border border-slate-700/40 bg-slate-800/20 text-slate-300 hover:bg-slate-800/50 hover:text-cyan-400 hover:border-cyan-600/30"
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
                  <div className="w-7 h-7 rounded-full flex items-center justify-center mr-2 mt-1 flex-shrink-0 bg-slate-800 border border-slate-700/50">
                    <AlfieLogo size={14} />
                  </div>
                )}
                <div className="max-w-[80%]">
                  {msg.drawingImage && (
                    <div className="mb-1.5 rounded-lg overflow-hidden border border-slate-600/50">
                      <img src={msg.drawingImage} alt="Race scenario" className="w-full max-h-48 object-contain bg-[#0f1729]" />
                    </div>
                  )}
                  <div
                    className={`px-3.5 py-2.5 rounded-2xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-cyan-600 text-white rounded-br-md'
                        : 'bg-slate-800/80 text-slate-200 border border-slate-700/50 rounded-bl-md'
                    }`}
                  >
                    {formatMessageContent(msg.content)}
                  </div>
                  {msg.role === 'assistant' && isLastAssistant && !isLoading && (
                    <div className="flex items-center gap-3 mt-1.5 ml-1">
                      <button className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors">
                        <Volume2 size={11} />
                        Listen
                      </button>
                      <button className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors">
                        <Share2 size={11} />
                        Share
                      </button>
                    </div>
                  )}
                </div>
                {msg.role === 'user' && (
                  <div className="w-7 h-7 rounded-full flex items-center justify-center ml-2 mt-1 flex-shrink-0 overflow-hidden">
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
            <div className="w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 bg-slate-800 border border-slate-700/50">
              <AlfieLogo size={14} />
            </div>
            <div className="px-3.5 py-2.5 rounded-2xl rounded-bl-md border bg-slate-800/80 border-slate-700/50">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Drawing/Photo attachment preview */}
      {attachedDrawing && (
        <div className="px-3 pt-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-xl border border-slate-700/50 bg-slate-800/60">
            <img src={attachedDrawing} alt="Attached" className="w-10 h-10 rounded-lg object-cover bg-[#0f1729]" />
            <span className="text-xs text-slate-300 flex-1">
              {attachedDrawing.startsWith('data:image/png') ? 'Drawing attached' : 'Photo attached'}
            </span>
            <button
              onClick={() => setAttachedDrawing(null)}
              className="text-xs font-medium text-red-400 hover:text-red-300 transition-colors"
            >
              Remove
            </button>
          </div>
        </div>
      )}

      {/* Hidden file input for photo upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoUpload}
        className="hidden"
      />

      {/* Input area */}
      <div className="px-3 pt-2 pb-3 border-t border-slate-700/30 bg-[#0b1120]">
        {showHistory && messages.length > 0 && (
          <button
            onClick={() => { setMessages([]); setShowHistory(false); setViewMode('welcome'); }}
            className="w-full flex items-center justify-center gap-1.5 py-1.5 mb-2 text-xs text-slate-500 hover:text-cyan-400 transition-colors"
          >
            <ArrowLeft size={12} />
            Start new conversation
          </button>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setDrawingCourseMode(false); setViewMode('drawing'); }}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors border border-slate-700/40"
            title="Draw scenario"
          >
            <Pencil size={18} />
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-xl text-slate-400 hover:text-cyan-400 hover:bg-slate-800 transition-colors border border-slate-700/40"
            title="Upload photo"
          >
            <Camera size={18} />
          </button>
          <div
            className="flex-1 rounded-xl p-[1.5px]"
            style={{
              background: 'linear-gradient(135deg, rgba(56,189,248,0.35), rgba(14,165,233,0.2), rgba(6,182,212,0.35), rgba(56,189,248,0.2))',
            }}
          >
            <div className="flex items-center gap-2 px-3 py-2.5 rounded-[10px] bg-slate-800/90">
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Ask Alfie..."
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
              />
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || isLoading}
                className={`p-1.5 rounded-lg transition-all ${
                  input.trim() && !isLoading
                    ? 'bg-cyan-500 text-white hover:bg-cyan-600 shadow-sm'
                    : 'text-slate-500 cursor-not-allowed'
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
    </div>
  );
};
