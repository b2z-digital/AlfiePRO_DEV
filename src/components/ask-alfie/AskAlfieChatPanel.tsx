import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader as Loader2, Trash2, ArrowLeft, Clock, Pencil, Circle as HelpCircle, Volume2, VolumeX, Share2, ImagePlus, Camera, Image as ImageIcon, X as XIcon, Mic, MicOff, TriangleAlert as AlertTriangle, Trophy, Scale } from 'lucide-react';
import { supabase } from '../../utils/supabase';
import { useAuth } from '../../contexts/AuthContext';
import { useScoringContext } from '../../contexts/ScoringContext';
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

export interface ProtestFilingData {
  ruling: string;
  rulesCited: string;
  confidence: string;
  diagramImage: string | null;
  incidentDescription: string;
}

interface AskAlfieChatPanelProps {
  darkMode: boolean;
  onClose: () => void;
  embedded?: boolean;
  courseMode?: boolean;
  initialMessage?: string;
  onFileProtest?: (data: ProtestFilingData) => void;
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

function getScoringQuickQuestions(ctx: import('../../contexts/ScoringContext').ScoringContextData | null | undefined): string[] {
  if (!ctx?.isActive) return QUICK_QUESTIONS;

  const questions: string[] = [];

  if (ctx.raceType === 'handicap') {
    questions.push('How are the handicaps being calculated for this race?');
    questions.push('Explain how the adjusted handicap is determined after each race');
    if (ctx.skippers.length > 0) {
      questions.push('Who has had the biggest handicap change so far?');
    }
  }

  if (ctx.scoringSystem === 'hms') {
    questions.push('How does the HMS heat promotion and relegation work?');
    questions.push('Explain how tie-breaks are resolved in HMS scoring');
    if (ctx.heatInfo) {
      questions.push(`How are skippers assigned to heats in round ${ctx.heatInfo.currentRound}?`);
      questions.push('What determines which skippers get promoted to a higher heat?');
    }
  } else if (ctx.scoringSystem === 'shrs') {
    questions.push('How does the SHRS qualifying and finals system work?');
    questions.push('Explain the SHRS tie-break procedure');
    if (ctx.heatInfo?.currentRound) {
      questions.push('How are the fleet assignments determined for this round?');
    }
  }

  if (ctx.raceType === 'scratch') {
    questions.push('How are the standings calculated in scratch racing?');
    questions.push('Explain how drop races work with the current drop rules');
  }

  if (ctx.lastCompletedRace > 0) {
    questions.push(`Explain the current standings after race ${ctx.lastCompletedRace}`);
  }

  questions.push('What does each letter score (DNS, DNF, DSQ, OCS) mean for points?');

  if (ctx.dropRules) {
    questions.push('How do the drop rules apply with the current race count?');
  }

  return questions.slice(0, 6);
}

export const AskAlfieChatPanel: React.FC<AskAlfieChatPanelProps> = ({
  darkMode,
  onClose,
  embedded = false,
  courseMode = false,
  initialMessage,
  onFileProtest,
}) => {
  const { user, currentClub } = useAuth();
  const { scoringContext, getScoringSnapshot } = useScoringContext();
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
  const [previewImage, setPreviewImage] = useState<string | null>(null);
  const [editingImage, setEditingImage] = useState<string | null>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const scoringSnapshot = scoringContext.isActive ? scoringContext : null;
  const activeQuestions = getScoringQuickQuestions(scoringSnapshot);
  const lastAssistantRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const prevMessageCountRef = useRef(0);

  // Voice input state (Speech-to-Text)
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const lastInputWasVoiceRef = useRef(false);

  // Text-to-Speech state
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const synthRef = useRef(typeof window !== 'undefined' ? window.speechSynthesis : null);

  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const hasSpeechSynthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const initialMessageSentRef = useRef(false);

  useEffect(() => {
    loadUserProfile();
  }, []);

  useEffect(() => {
    if (initialMessage && !initialMessageSentRef.current && messages.length === 0) {
      initialMessageSentRef.current = true;
      setViewMode('chat');
      setTimeout(() => sendMessage(initialMessage), 300);
    }
  }, [initialMessage]);

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

  // Voice input (Speech-to-Text)
  const pendingVoiceSubmitRef = useRef<string | null>(null);

  const startListening = useCallback(() => {
    if (!hasSpeechRecognition || isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    setInput('');
    setInterimTranscript('');

    recognition.onresult = (event: any) => {
      let interim = '';
      let final = '';
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          final += result[0].transcript;
        } else {
          interim += result[0].transcript;
        }
      }
      if (final) {
        setInput(final);
        setInterimTranscript('');
        pendingVoiceSubmitRef.current = final;
      } else {
        setInterimTranscript(interim);
      }
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
      const textToSubmit = pendingVoiceSubmitRef.current;
      pendingVoiceSubmitRef.current = null;
      if (textToSubmit?.trim()) {
        lastInputWasVoiceRef.current = true;
        setTimeout(() => {
          sendMessage(textToSubmit.trim());
        }, 100);
      }
    };

    recognition.onerror = () => {
      setIsListening(false);
      setInterimTranscript('');
      recognitionRef.current = null;
      pendingVoiceSubmitRef.current = null;
    };

    recognitionRef.current = recognition;
    recognition.start();
    setIsListening(true);
  }, [hasSpeechRecognition, isListening]);

  const stopListening = useCallback(() => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, []);

  // Text-to-Speech
  const speakText = useCallback((text: string, messageId: string) => {
    if (!hasSpeechSynthesis || !synthRef.current) return;
    synthRef.current.cancel();

    if (speakingMessageId === messageId && isSpeaking) {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
      return;
    }

    const clean = text.replace(/\*\*/g, '').replace(/\n{2,}/g, '. ').replace(/\n/g, '. ');
    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;

    const voices = synthRef.current.getVoices();
    const britishMale = voices.find(v =>
      v.lang.startsWith('en-GB') && v.name.toLowerCase().includes('male')
    ) || voices.find(v =>
      v.lang.startsWith('en-GB') && (v.name.includes('Daniel') || v.name.includes('George') || v.name.includes('James'))
    ) || voices.find(v => v.lang.startsWith('en-GB'));
    if (britishMale) utterance.voice = britishMale;

    utterance.onend = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };
    utterance.onerror = () => {
      setIsSpeaking(false);
      setSpeakingMessageId(null);
    };

    synthRef.current.speak(utterance);
    setIsSpeaking(true);
    setSpeakingMessageId(messageId);
  }, [hasSpeechSynthesis, isSpeaking, speakingMessageId]);

  // Auto-read AI response when last input was voice
  useEffect(() => {
    if (messages.length < 2) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === 'assistant' && lastInputWasVoiceRef.current && !isLoading) {
      lastInputWasVoiceRef.current = false;
      setTimeout(() => speakText(lastMsg.content, lastMsg.id), 300);
    }
  }, [messages, isLoading, speakText]);

  // Stop speech on unmount
  useEffect(() => {
    return () => {
      synthRef.current?.cancel();
      recognitionRef.current?.abort();
    };
  }, []);

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
            scoring_context: getScoringSnapshot().isActive ? getScoringSnapshot() : undefined,
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

  // Listening overlay — animated screen matching mobile app
  const ListeningOverlay = () => {
    const waveCanvasRef = useRef<HTMLCanvasElement>(null);
    const waveAnimRef = useRef<number>(0);

    useEffect(() => {
      const canvas = waveCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d')!;
      const w = 200;
      const h = 60;
      canvas.width = w * 2;
      canvas.height = h * 2;
      ctx.scale(2, 2);
      let time = 0;

      const draw = () => {
        ctx.clearRect(0, 0, w, h);
        const bars = 9;
        const barWidth = 4;
        const gap = 12;
        const totalWidth = bars * barWidth + (bars - 1) * gap;
        const startX = (w - totalWidth) / 2;
        const centerY = h / 2;

        for (let i = 0; i < bars; i++) {
          const phase = (i / bars) * Math.PI * 2;
          const height = 8 + Math.abs(Math.sin(time * 3 + phase)) * 22;
          const x = startX + i * (barWidth + gap);

          const gradient = ctx.createLinearGradient(x, centerY - height / 2, x, centerY + height / 2);
          gradient.addColorStop(0, 'rgba(56, 189, 248, 0.9)');
          gradient.addColorStop(0.5, 'rgba(34, 211, 238, 1)');
          gradient.addColorStop(1, 'rgba(56, 189, 248, 0.9)');

          const y = centerY - height / 2;
          const r = 2;
          ctx.beginPath();
          if (ctx.roundRect) {
            ctx.roundRect(x, y, barWidth, height, r);
          } else {
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + barWidth - r, y);
            ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + r);
            ctx.lineTo(x + barWidth, y + height - r);
            ctx.quadraticCurveTo(x + barWidth, y + height, x + barWidth - r, y + height);
            ctx.lineTo(x + r, y + height);
            ctx.quadraticCurveTo(x, y + height, x, y + height - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
          }
          ctx.fillStyle = gradient;
          ctx.fill();
        }

        time += 0.02;
        waveAnimRef.current = requestAnimationFrame(draw);
      };

      draw();
      return () => { if (waveAnimRef.current) cancelAnimationFrame(waveAnimRef.current); };
    }, []);

    return (
      <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-[#0b1120]/95 backdrop-blur-sm">
        <div className="mb-6 opacity-60">
          <MiniOrb size={80} />
        </div>

        <h3 className="text-xl font-bold text-white mb-2">Listening...</h3>
        <p className="text-sm text-slate-400 mb-8">Stops automatically when you pause</p>

        <canvas
          ref={waveCanvasRef}
          className="mb-10"
          style={{ width: 200, height: 60, imageRendering: 'auto' }}
        />

        {interimTranscript && (
          <div className="px-6 mb-8 max-w-[90%]">
            <p className="text-sm text-cyan-300/80 text-center italic">"{interimTranscript}"</p>
          </div>
        )}

        <button
          onClick={stopListening}
          className="w-16 h-16 rounded-full bg-cyan-500 hover:bg-cyan-600 flex items-center justify-center shadow-lg shadow-cyan-500/30 transition-all hover:scale-105"
        >
          <Mic className="w-7 h-7 text-white" />
        </button>
        <p className="text-xs text-slate-500 mt-3">Listening... tap to stop early</p>
      </div>
    );
  };

  const handleFileAsProtest = () => {
    if (!onFileProtest || messages.length === 0) return;
    const assistantMessages = messages.filter(m => m.role === 'assistant');
    const userMessages = messages.filter(m => m.role === 'user');
    if (assistantMessages.length === 0) return;

    const lastRuling = assistantMessages[assistantMessages.length - 1].content;
    const firstUserMessage = userMessages[0]?.content || '';

    // Extract rule references - matches patterns like "Rule 10", "Rule 18.2(a)", "RRS 11", "rules 10, 11 and 18.2"
    const rulesMatch = lastRuling.match(/(?:RRS|rule|rules?)\s*[\d]+(?:\.[\d]+)?(?:\([a-z]\))?/gi);
    const uniqueRules = rulesMatch
      ? [...new Set(rulesMatch.map(r => r.replace(/^rules?\s*/i, 'Rule ').replace(/^RRS\s*/i, 'Rule ')))].join(', ')
      : '';

    let confidence = 'medium';
    const lower = lastRuling.toLowerCase();
    if (lower.includes('clearly') || lower.includes('definite') || lower.includes('without doubt') || lower.includes('must')) {
      confidence = 'high';
    } else if (lower.includes('unclear') || lower.includes('difficult to determine') || lower.includes('depends on') || lower.includes('might')) {
      confidence = 'low';
    }

    const userDrawing = userMessages.find(m => m.drawingImage)?.drawingImage || null;

    // Build a comprehensive incident description from all user messages
    const incidentDescription = userMessages
      .map(m => m.content)
      .filter(c => c && c.length > 5)
      .join(' | ');

    onFileProtest({
      ruling: lastRuling,
      rulesCited: uniqueRules,
      confidence,
      diagramImage: userDrawing || attachedDrawing,
      incidentDescription,
    });
  };

  const handleEditDrawingSave = (imageData: string, _elements: any[]) => {
    setEditingImage(null);
    setPreviewImage(null);
    setAttachedDrawing(imageData);
    setViewMode('chat');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  // Drawing edit mode (re-open existing image for editing)
  if (editingImage) {
    return (
      <div className={`${embedded ? 'w-full h-full' : 'fixed bottom-24 right-6 z-[9989] w-[480px] h-[700px] max-h-[85vh] rounded-2xl shadow-2xl border border-slate-700/50 overflow-hidden'}`}>
        <RaceScenarioCanvas
          onSave={handleEditDrawingSave}
          onClose={() => { setEditingImage(null); }}
          darkMode
          initialImage={editingImage}
        />
      </div>
    );
  }

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
        {isListening && <ListeningOverlay />}
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
          <p className="text-sm text-slate-400 text-center mb-4 leading-relaxed">
            {scoringSnapshot?.isActive
              ? <>I can see your live scoring session.<br />Ask me about results, handicaps, or rules</>
              : <>I'm your sailing assistant for racing rules,<br />rig tuning, app help, and more</>
            }
          </p>

          {scoringSnapshot?.isActive && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-6">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
              <span className="text-[11px] text-cyan-300 font-medium">
                Live: {scoringSnapshot.eventName || 'Race in progress'} — {
                  scoringSnapshot.scoringSystem === 'hms' ? 'HMS Heat Scoring' :
                  scoringSnapshot.scoringSystem === 'shrs' ? 'SHRS Heat Scoring' :
                  scoringSnapshot.raceType === 'handicap' ? 'Handicap Racing' : 'Scratch Racing'
                }
              </span>
            </div>
          )}

          {/* Action tiles — contextual to scoring mode */}
          {scoringSnapshot?.isActive ? (
            <div className="grid grid-cols-3 gap-3 w-full mb-6">
              <button
                onClick={() => { setDrawingCourseMode(false); setViewMode('drawing'); }}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-amber-600/40 bg-amber-500/5 hover:bg-amber-500/10 hover:border-amber-500/60 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center group-hover:bg-amber-500/20 transition-colors">
                  <AlertTriangle className="w-5 h-5 text-amber-400" />
                </div>
                <span className="text-xs font-medium text-white text-center leading-tight">
                  Draw<br />Protest
                </span>
              </button>
              <button
                onClick={() => {
                  setViewMode('chat');
                  setTimeout(() => sendMessage('Explain the current standings and any close battles'), 50);
                }}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-600/40 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                  <Trophy className="w-5 h-5 text-cyan-400" />
                </div>
                <span className="text-xs font-medium text-white text-center leading-tight">
                  Explain<br />Standings
                </span>
              </button>
              <button
                onClick={() => {
                  setViewMode('chat');
                  setTimeout(() => sendMessage('Are there any tie-breaks in the current results? Show me the details.'), 50);
                }}
                className="flex flex-col items-center gap-2.5 p-4 rounded-xl border border-slate-700/60 bg-slate-800/30 hover:bg-slate-800/60 hover:border-cyan-600/40 transition-all group"
              >
                <div className="w-10 h-10 rounded-xl bg-slate-700/50 flex items-center justify-center group-hover:bg-cyan-500/15 transition-colors">
                  <Scale className="w-5 h-5 text-cyan-400" />
                </div>
                <span className="text-xs font-medium text-white text-center leading-tight">
                  Check<br />Tie-breaks
                </span>
              </button>
            </div>
          ) : (
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
          )}

          {/* Quick questions */}
          <div className="w-full space-y-2">
            {activeQuestions.slice(0, 4).map((q, i) => (
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
                placeholder={isListening ? 'Listening...' : 'Tap here to chat with Alfie'}
                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
              />
              {hasSpeechRecognition && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`p-1.5 rounded-lg transition-all ${
                    isListening
                      ? 'bg-red-500/20 text-red-400 animate-pulse'
                      : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <button
                onClick={() => {
                  if (input.trim()) {
                    if (isListening) stopListening();
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
      {isListening && <ListeningOverlay />}
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
            <p className="text-xs text-center mb-3 text-slate-400">
              {scoringSnapshot?.isActive
                ? 'I can see your live scoring session. Ask me about results, handicaps, or rules.'
                : 'I\'m Alfie. Ask me anything about racing rules or using AlfiePRO.'}
            </p>
            {scoringSnapshot?.isActive && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 mb-3">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                <span className="text-[10px] text-cyan-300 font-medium">
                  Live: {scoringSnapshot.eventName || 'Race in progress'} — {
                    scoringSnapshot.scoringSystem === 'hms' ? 'HMS Heat Scoring' :
                    scoringSnapshot.scoringSystem === 'shrs' ? 'SHRS Heat Scoring' :
                    scoringSnapshot.raceType === 'handicap' ? 'Handicap Racing' : 'Scratch Racing'
                  }
                </span>
              </div>
            )}
            <div className="w-full space-y-2">
              {activeQuestions.map((q, i) => (
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
                    <div
                      className="mb-1.5 rounded-lg overflow-hidden border border-slate-600/50 cursor-pointer group/img relative"
                      onClick={() => setPreviewImage(msg.drawingImage!)}
                    >
                      <img src={msg.drawingImage} alt="Race scenario" className="w-full max-h-48 object-contain bg-[#0f1729]" />
                      <div className="absolute inset-0 bg-black/0 group-hover/img:bg-black/30 transition-colors flex items-center justify-center opacity-0 group-hover/img:opacity-100">
                        <span className="text-xs text-white font-medium bg-black/50 px-2.5 py-1 rounded-full backdrop-blur-sm">
                          Tap to view / edit
                        </span>
                      </div>
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
                      {hasSpeechSynthesis && (
                        <button
                          onClick={() => speakText(msg.content, msg.id)}
                          className={`flex items-center gap-1 text-[10px] transition-colors ${
                            speakingMessageId === msg.id && isSpeaking
                              ? 'text-cyan-400'
                              : 'text-slate-500 hover:text-cyan-400'
                          }`}
                        >
                          {speakingMessageId === msg.id && isSpeaking ? (
                            <><VolumeX size={11} /> Stop</>
                          ) : (
                            <><Volume2 size={11} /> Listen</>
                          )}
                        </button>
                      )}
                      <button className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-cyan-400 transition-colors">
                        <Share2 size={11} />
                        Share
                      </button>
                      {onFileProtest && messages.length >= 2 && (
                        <button
                          onClick={handleFileAsProtest}
                          className="flex items-center gap-1 text-[10px] text-amber-500 hover:text-amber-400 transition-colors font-medium"
                        >
                          <AlertTriangle size={11} />
                          File as Protest
                        </button>
                      )}
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
            <div
              className="w-10 h-10 rounded-lg overflow-hidden bg-[#0f1729] cursor-pointer flex-shrink-0"
              onClick={() => setPreviewImage(attachedDrawing)}
            >
              <img src={attachedDrawing} alt="Attached" className="w-full h-full object-cover" />
            </div>
            <span
              className="text-xs text-slate-300 flex-1 cursor-pointer hover:text-cyan-400 transition-colors"
              onClick={() => setPreviewImage(attachedDrawing)}
            >
              {attachedDrawing.startsWith('data:image/png') ? 'Drawing attached — tap to view' : 'Photo attached — tap to view'}
            </span>
            <button
              onClick={() => setEditingImage(attachedDrawing)}
              className="text-xs font-medium text-cyan-400 hover:text-cyan-300 transition-colors"
            >
              Edit
            </button>
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
                placeholder={isListening ? 'Listening...' : 'Ask Alfie...'}
                disabled={isLoading}
                className="flex-1 bg-transparent text-sm outline-none text-white placeholder-slate-500"
              />
              {hasSpeechRecognition && !isLoading && (
                <button
                  onClick={isListening ? stopListening : startListening}
                  className={`p-1.5 rounded-lg transition-all ${
                    isListening
                      ? 'bg-red-500/20 text-red-400 animate-pulse'
                      : 'text-slate-400 hover:text-cyan-400 hover:bg-slate-700/50'
                  }`}
                  title={isListening ? 'Stop listening' : 'Voice input'}
                >
                  {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                </button>
              )}
              <button
                onClick={() => {
                  if (isListening) stopListening();
                  sendMessage();
                }}
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

      {/* Image preview lightbox */}
      {previewImage && (
        <div
          className="absolute inset-0 z-50 flex flex-col bg-[#0b1120]/98 backdrop-blur-sm"
          onClick={(e) => { if (e.target === e.currentTarget) setPreviewImage(null); }}
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700/30">
            <span className="text-sm font-semibold text-white">Scenario Drawing</span>
            <button
              onClick={() => setPreviewImage(null)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
            >
              <XIcon size={16} />
            </button>
          </div>
          <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
            <img
              src={previewImage}
              alt="Race scenario"
              className="max-w-full max-h-full rounded-lg border border-slate-700/50 object-contain"
            />
          </div>
          <div className="flex items-center justify-center gap-3 px-4 py-3 border-t border-slate-700/30">
            <button
              onClick={() => {
                setEditingImage(previewImage);
              }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-600 text-white text-sm font-medium transition-colors"
            >
              <Pencil size={14} />
              Edit Drawing
            </button>
            <button
              onClick={() => setPreviewImage(null)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-slate-700 hover:bg-slate-600 text-white text-sm font-medium transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
