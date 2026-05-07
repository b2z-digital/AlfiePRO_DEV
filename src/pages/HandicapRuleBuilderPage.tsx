import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ArrowLeft, Plus, Trash2, CreditCard as Edit3, Play, Save, Wand as Wand2, ChevronRight, ChevronDown, GripVertical, Settings2, Zap, Target, TrendingUp, TrendingDown, Minus, Equal, CircleAlert as AlertCircle, CircleCheck as CheckCircle2, RotateCcw, Copy, Send, Loader as Loader2, MessageSquare, X, Mic, MicOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../utils/supabase';

interface HandicapRuleset {
  id: string;
  club_id: string | null;
  name: string;
  description: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
}

interface SeedingRule {
  id: string;
  ruleset_id: string;
  method: 'position_based' | 'fixed_value' | 'fleet_average';
  base_value: number;
  increment_per_position: number;
  description: string;
}

interface AdjustmentRule {
  id: string;
  ruleset_id: string;
  priority: number;
  name: string;
  condition_type: string;
  condition_value: Record<string, any>;
  action: 'add' | 'subtract' | 'set' | 'no_change';
  action_value: number;
  applies_to: 'self' | 'all_others' | 'non_scratch' | 'scratch_only';
  description: string;
}

interface RulesetConfig {
  id: string;
  ruleset_id: string;
  cap_limit: number;
  last_place_bonus_enabled: boolean;
  last_place_bonus_value: number;
  scratch_boat_win_bonus: number;
  scratch_streak_threshold: number;
  scratch_streak_bonus: number;
}

interface SimulationBoat {
  name: string;
  startHcap: number;
  position: number | null;
}

interface SimulationResult {
  name: string;
  startHcap: number;
  position: number | null;
  adjustment: number;
  newHcap: number;
  rulesApplied: string[];
}

interface AlfieMessage {
  role: 'user' | 'assistant';
  content: string;
}

const DEFAULT_RULES: AdjustmentRule[] = [
  { id: 'default-1', ruleset_id: '', priority: 1, name: 'Winner adjustment', condition_type: 'position', condition_value: { position: 1 }, action: 'subtract', action_value: 30, applies_to: 'self', description: '1st place loses 30 seconds from their handicap' },
  { id: 'default-2', ruleset_id: '', priority: 2, name: 'Second place adjustment', condition_type: 'position', condition_value: { position: 2 }, action: 'subtract', action_value: 20, applies_to: 'self', description: '2nd place loses 20 seconds from their handicap' },
  { id: 'default-3', ruleset_id: '', priority: 3, name: 'Third place adjustment', condition_type: 'position', condition_value: { position: 3 }, action: 'subtract', action_value: 10, applies_to: 'self', description: '3rd place loses 10 seconds from their handicap' },
  { id: 'default-4', ruleset_id: '', priority: 4, name: 'Scratch boat wins bonus', condition_type: 'scratch_boat_wins', condition_value: {}, action: 'add', action_value: 30, applies_to: 'all_others', description: 'When scratch boat wins, all other boats get 30 seconds added' },
  { id: 'default-5', ruleset_id: '', priority: 5, name: 'Scratch boat streak', condition_type: 'streak', condition_value: { streak_position: 'last', streak_count: 3 }, action: 'add', action_value: 30, applies_to: 'scratch_only', description: 'Scratch boat finishing last 3 times in a row gets 30 seconds added' },
];

const CONDITION_TYPES = [
  { value: 'position', label: 'Finishing Position', description: 'Triggers for a specific finishing position' },
  { value: 'position_range', label: 'Position Range', description: 'Triggers for a range of positions (e.g. top 3, bottom half)' },
  { value: 'last_place', label: 'Last Place', description: 'Triggers for the last finishing boat' },
  { value: 'scratch_boat_wins', label: 'Scratch Boat Wins', description: 'Triggers when a boat on 0 handicap wins' },
  { value: 'scratch_boat', label: 'Is Scratch Boat', description: 'Applies only to boats on 0 handicap' },
  { value: 'streak', label: 'Consecutive Streak', description: 'Triggers after finishing in the same position for N consecutive races' },
  { value: 'mid_fleet', label: 'Mid Fleet', description: 'Applies to boats not in top 3 and not last' },
];

const ACTION_TYPES = [
  { value: 'add', label: 'Add seconds', icon: TrendingUp },
  { value: 'subtract', label: 'Remove seconds', icon: TrendingDown },
  { value: 'set', label: 'Set to value', icon: Equal },
  { value: 'no_change', label: 'No change', icon: Minus },
];

const APPLIES_TO_OPTIONS = [
  { value: 'self', label: 'The skipper themselves' },
  { value: 'all_others', label: 'All other skippers' },
  { value: 'non_scratch', label: 'Non-scratch boats only' },
  { value: 'scratch_only', label: 'Scratch boats only' },
];

interface Props {
  darkMode?: boolean;
}

export default function HandicapRuleBuilderPage({ darkMode = true }: Props) {
  const { user } = useAuth();
  const [rulesets, setRulesets] = useState<HandicapRuleset[]>([]);
  const [selectedRuleset, setSelectedRuleset] = useState<HandicapRuleset | null>(null);
  const [seedingRule, setSeedingRule] = useState<SeedingRule | null>(null);
  const [adjustmentRules, setAdjustmentRules] = useState<AdjustmentRule[]>(DEFAULT_RULES);
  const [config, setConfig] = useState<RulesetConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'rules' | 'simulate' | 'alfie'>('rules');
  const [editingRule, setEditingRule] = useState<AdjustmentRule | null>(null);
  const [showNewRuleModal, setShowNewRuleModal] = useState(false);
  const [clubId, setClubId] = useState<string | null>(null);

  // Simulation state
  const [simMode, setSimMode] = useState<'seeding' | 'handicap'>('handicap');
  const [simBoats, setSimBoats] = useState<SimulationBoat[]>([
    { name: 'Boat A', startHcap: 0, position: 1 },
    { name: 'Boat B', startHcap: 20, position: 2 },
    { name: 'Boat C', startHcap: 40, position: 3 },
    { name: 'Boat D', startHcap: 60, position: 4 },
    { name: 'Boat E', startHcap: 80, position: 5 },
    { name: 'Boat F', startHcap: 100, position: 6 },
  ]);
  const [simResults, setSimResults] = useState<SimulationResult[]>([]);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Alfie chat state
  const [alfieMessages, setAlfieMessages] = useState<AlfieMessage[]>([
    { role: 'assistant', content: 'Hi! I can help you build custom handicap rules for your club. Tell me how your club calculates handicaps after each race - describe it however feels natural. For example:\n\n"First place gets 10 seconds added, last place gets 20 seconds removed, and everyone else stays the same."\n\nOr ask me questions about how different rules would work!' }
  ]);
  const alfieMessagesEndRef = useRef<HTMLDivElement>(null);

  // Voice input state
  const [isListening, setIsListening] = useState(false);
  const [interimTranscript, setInterimTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const pendingVoiceSubmitRef = useRef<string | null>(null);
  const hasSpeechRecognition = typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);
  const [alfieInput, setAlfieInput] = useState('');
  const [alfieLoading, setAlfieLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    alfieMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [alfieMessages, alfieLoading]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Get user's club
      const { data: userClubs } = await supabase
        .from('user_clubs')
        .select('club_id, role')
        .eq('user_id', user?.id || '')
        .in('role', ['admin', 'editor'])
        .limit(1)
        .maybeSingle();

      if (userClubs) {
        setClubId(userClubs.club_id);
      }

      // Load rulesets
      const { data: rulesetsData } = await supabase
        .from('handicap_rulesets')
        .select('*')
        .order('is_default', { ascending: false })
        .order('created_at', { ascending: false });

      if (rulesetsData) {
        setRulesets(rulesetsData);
      }
    } catch (err) {
      console.error('Error loading rulesets:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadRuleset = async (ruleset: HandicapRuleset) => {
    setSelectedRuleset(ruleset);

    const [seedingRes, adjustmentRes, configRes] = await Promise.all([
      supabase.from('handicap_seeding_rules').select('*').eq('ruleset_id', ruleset.id).maybeSingle(),
      supabase.from('handicap_adjustment_rules').select('*').eq('ruleset_id', ruleset.id).order('priority'),
      supabase.from('handicap_ruleset_config').select('*').eq('ruleset_id', ruleset.id).maybeSingle(),
    ]);

    if (seedingRes.data) setSeedingRule(seedingRes.data);
    else setSeedingRule({ id: '', ruleset_id: ruleset.id, method: 'position_based', base_value: 0, increment_per_position: 10, description: 'Seeded from first race positions' });

    if (adjustmentRes.data && adjustmentRes.data.length > 0) setAdjustmentRules(adjustmentRes.data);
    else setAdjustmentRules(DEFAULT_RULES.map(r => ({ ...r, ruleset_id: ruleset.id })));

    if (configRes.data) setConfig(configRes.data);
    else setConfig({ id: '', ruleset_id: ruleset.id, cap_limit: 150, last_place_bonus_enabled: false, last_place_bonus_value: 30, scratch_boat_win_bonus: 30, scratch_streak_threshold: 3, scratch_streak_bonus: 30 });
  };

  const createNewRuleset = async () => {
    if (!clubId) return;

    const { data, error } = await supabase
      .from('handicap_rulesets')
      .insert({
        club_id: clubId,
        name: 'New Custom Rule Set',
        description: '',
        is_default: false,
        is_active: true,
        created_by: user?.id,
      })
      .select()
      .single();

    if (data && !error) {
      // Create config with sensible defaults but NO pre-populated rules
      await supabase.from('handicap_ruleset_config').insert({
        ruleset_id: data.id,
        cap_limit: 150,
        last_place_bonus_enabled: false,
        last_place_bonus_value: 30,
        scratch_boat_win_bonus: 30,
        scratch_streak_threshold: 3,
        scratch_streak_bonus: 30,
      });

      // Create default seeding rule (needed as a baseline)
      await supabase.from('handicap_seeding_rules').insert({
        ruleset_id: data.id,
        method: 'position_based',
        base_value: 0,
        increment_per_position: 10,
        description: 'First race seeds handicaps from positions (1st=0, 2nd=10, 3rd=20...)',
      });

      // NO adjustment rules pre-populated - start empty
      setRulesets(prev => [data, ...prev]);
      setSelectedRuleset(data);
      setAdjustmentRules([]);
      setSeedingRule({ id: '', ruleset_id: data.id, method: 'position_based', base_value: 0, increment_per_position: 10, description: 'First race seeds handicaps from positions (1st=0, 2nd=10, 3rd=20...)' });
      setConfig({ id: '', ruleset_id: data.id, cap_limit: 150, last_place_bonus_enabled: false, last_place_bonus_value: 30, scratch_boat_win_bonus: 30, scratch_streak_threshold: 3, scratch_streak_bonus: 30 });
      setActiveTab('rules');
    }
  };

  const saveRuleset = async () => {
    if (!selectedRuleset) return;
    setSaving(true);
    setSaveSuccess(false);

    try {
      const { error: updateError } = await supabase
        .from('handicap_rulesets')
        .update({ name: selectedRuleset.name, description: selectedRuleset.description, updated_at: new Date().toISOString() })
        .eq('id', selectedRuleset.id);

      if (updateError) throw updateError;

      if (config) {
        if (config.id) {
          const { error } = await supabase.from('handicap_ruleset_config').update({
            cap_limit: config.cap_limit,
            last_place_bonus_enabled: config.last_place_bonus_enabled,
            last_place_bonus_value: config.last_place_bonus_value,
            scratch_boat_win_bonus: config.scratch_boat_win_bonus,
            scratch_streak_threshold: config.scratch_streak_threshold,
            scratch_streak_bonus: config.scratch_streak_bonus,
          }).eq('id', config.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('handicap_ruleset_config').insert({ ...config, ruleset_id: selectedRuleset.id });
          if (error) throw error;
        }
      }

      if (seedingRule) {
        if (seedingRule.id) {
          const { error } = await supabase.from('handicap_seeding_rules').update({
            method: seedingRule.method,
            base_value: seedingRule.base_value,
            increment_per_position: seedingRule.increment_per_position,
            description: seedingRule.description,
          }).eq('id', seedingRule.id);
          if (error) throw error;
        } else {
          const { error } = await supabase.from('handicap_seeding_rules').insert({ ...seedingRule, ruleset_id: selectedRuleset.id });
          if (error) throw error;
        }
      }

      const { error: deleteError } = await supabase.from('handicap_adjustment_rules').delete().eq('ruleset_id', selectedRuleset.id);
      if (deleteError) throw deleteError;

      if (adjustmentRules.length > 0) {
        const { error: insertError } = await supabase.from('handicap_adjustment_rules').insert(
          adjustmentRules.map((r, i) => ({
            ruleset_id: selectedRuleset.id,
            priority: i + 1,
            name: r.name,
            condition_type: r.condition_type,
            condition_value: r.condition_value,
            action: r.action,
            action_value: r.action_value,
            applies_to: r.applies_to,
            description: r.description,
          }))
        );
        if (insertError) throw insertError;
      }

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Error saving ruleset:', err);
      alert('Failed to save ruleset. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const deleteRuleset = async (id: string) => {
    await supabase.from('handicap_rulesets').delete().eq('id', id);
    setRulesets(prev => prev.filter(r => r.id !== id));
    if (selectedRuleset?.id === id) {
      setSelectedRuleset(null);
      setAdjustmentRules(DEFAULT_RULES);
    }
  };

  const duplicateRuleset = async (source: HandicapRuleset) => {
    if (!clubId) return;

    const { data: newRuleset, error } = await supabase
      .from('handicap_rulesets')
      .insert({
        club_id: clubId,
        name: `${source.name} (Copy)`,
        description: source.description,
        is_default: false,
        is_active: true,
        created_by: user?.id,
      })
      .select()
      .single();

    if (!newRuleset || error) return;

    // Copy config
    const { data: srcConfig } = await supabase.from('handicap_ruleset_config').select('*').eq('ruleset_id', source.id).maybeSingle();
    if (srcConfig) {
      await supabase.from('handicap_ruleset_config').insert({
        ruleset_id: newRuleset.id,
        cap_limit: srcConfig.cap_limit,
        last_place_bonus_enabled: srcConfig.last_place_bonus_enabled,
        last_place_bonus_value: srcConfig.last_place_bonus_value,
        scratch_boat_win_bonus: srcConfig.scratch_boat_win_bonus,
        scratch_streak_threshold: srcConfig.scratch_streak_threshold,
        scratch_streak_bonus: srcConfig.scratch_streak_bonus,
      });
    }

    // Copy seeding rules
    const { data: srcSeeding } = await supabase.from('handicap_seeding_rules').select('*').eq('ruleset_id', source.id);
    if (srcSeeding && srcSeeding.length > 0) {
      await supabase.from('handicap_seeding_rules').insert(
        srcSeeding.map(s => ({ ruleset_id: newRuleset.id, method: s.method, base_value: s.base_value, increment_per_position: s.increment_per_position, description: s.description }))
      );
    }

    // Copy adjustment rules
    const { data: srcAdj } = await supabase.from('handicap_adjustment_rules').select('*').eq('ruleset_id', source.id).order('priority');
    if (srcAdj && srcAdj.length > 0) {
      await supabase.from('handicap_adjustment_rules').insert(
        srcAdj.map(r => ({ ruleset_id: newRuleset.id, priority: r.priority, name: r.name, condition_type: r.condition_type, condition_value: r.condition_value, action: r.action, action_value: r.action_value, applies_to: r.applies_to, description: r.description }))
      );
    }

    setRulesets(prev => [newRuleset, ...prev]);
    loadRuleset(newRuleset);
  };

  const runSimulation = useCallback(() => {
    const capLimit = config?.cap_limit ?? 150;
    const results: SimulationResult[] = [];

    if (simMode === 'seeding') {
      const baseValue = seedingRule?.base_value ?? 0;
      const increment = seedingRule?.increment_per_position ?? 10;

      const finishers = simBoats.filter(b => b.position !== null).sort((a, b) => (a.position || 0) - (b.position || 0));

      for (const boat of simBoats) {
        if (boat.position === null) {
          results.push({ ...boat, adjustment: 0, newHcap: 0, rulesApplied: ['No result'] });
          continue;
        }
        const seedHcap = baseValue + ((boat.position - 1) * increment);
        const cappedHcap = Math.min(capLimit, seedHcap);
        results.push({
          ...boat,
          startHcap: 0,
          adjustment: cappedHcap,
          newHcap: cappedHcap,
          rulesApplied: [`Seeding: pos ${boat.position} = ${baseValue} + ${(boat.position - 1)} x ${increment}`],
        });
      }
    } else {
      const finishers = simBoats.filter(b => b.position !== null).sort((a, b) => (a.position || 0) - (b.position || 0));
      const maxPosition = Math.max(...finishers.map(b => b.position || 0));
      const scratchBoatWins = finishers.length > 0 && finishers[0].startHcap === 0;

      for (const boat of simBoats) {
        let totalAdj = 0;
        const rulesApplied: string[] = [];

        if (boat.position === null) {
          results.push({ ...boat, adjustment: 0, newHcap: boat.startHcap, rulesApplied: ['No result'] });
          continue;
        }

        for (const rule of adjustmentRules) {
          let applies = false;

          if (rule.applies_to === 'scratch_only' && boat.startHcap !== 0) continue;
          if (rule.applies_to === 'non_scratch' && boat.startHcap === 0) continue;

          switch (rule.condition_type) {
            case 'position':
              applies = boat.position === rule.condition_value.position;
              break;
            case 'position_range':
              applies = boat.position >= (rule.condition_value.from || 1) && boat.position <= (rule.condition_value.to || maxPosition);
              break;
            case 'last_place':
              applies = boat.position === maxPosition;
              break;
            case 'scratch_boat_wins':
              applies = scratchBoatWins && boat.startHcap !== 0;
              break;
            case 'scratch_boat':
              applies = boat.startHcap === 0;
              break;
            case 'mid_fleet':
              applies = boat.position > 3 && boat.position < maxPosition;
              break;
            case 'streak':
              applies = false;
              break;
          }

          if (applies) {
            switch (rule.action) {
              case 'add':
                totalAdj += rule.action_value;
                break;
              case 'subtract':
                totalAdj -= rule.action_value;
                break;
              case 'set':
                totalAdj = rule.action_value - boat.startHcap;
                break;
            }
            rulesApplied.push(rule.name);
          }
        }

        const newHcap = Math.max(0, Math.min(capLimit, boat.startHcap + totalAdj));
        results.push({ ...boat, adjustment: totalAdj, newHcap, rulesApplied });
      }
    }

    setSimResults(results);
  }, [simBoats, adjustmentRules, config, simMode, seedingRule]);

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

  const parseRulesFromResponse = (message: string): AdjustmentRule[] | null => {
    const jsonMatch = message.match(/```json\s*([\s\S]*?)```/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[1]);
      if (!Array.isArray(parsed)) return null;
      return parsed.map((rule: any, i: number) => ({
        id: `alfie-${Date.now()}-${i}`,
        ruleset_id: selectedRuleset?.id || '',
        priority: i + 1,
        name: rule.name || `Rule ${i + 1}`,
        condition_type: rule.condition_type || 'position',
        condition_value: rule.condition_value || {},
        action: rule.action || 'add',
        action_value: Number(rule.action_value) || 0,
        applies_to: rule.applies_to || 'self',
        description: rule.description || '',
      }));
    } catch {
      return null;
    }
  };

  const sendAlfieMessage = async (overrideText?: string) => {
    const messageText = overrideText || alfieInput.trim();
    if (!messageText || alfieLoading) return;

    if (!overrideText) setAlfieInput('');
    setAlfieMessages(prev => [...prev, { role: 'user', content: messageText }]);
    setAlfieLoading(true);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error('Not authenticated');

      const handicapContext = `[HANDICAP RULE BUILDER CONTEXT]
You are helping the user build custom handicap rules for their yacht racing club. You are in the Handicap Rule Builder section of AlfiePRO.

BACKGROUND: The default AlfiePRO handicap system works as follows:
- Seeding race: 1st place = 0s, 2nd = 10s, 3rd = 20s, etc.
- Per-race adjustments: 1st = -30s, 2nd = -20s, 3rd = -10s, last = +30s
- Scratch boat wins: all others get +30s bonus
- Consecutive last place (3 times in a row): +30s
- Cap at 150s maximum handicap

YOUR ROLE: Help the user describe and build their own custom rules in plain conversational English.

FORMATTING RULES - CRITICAL:
- NEVER use markdown formatting (no ** symbols, no ## headers)
- Write in plain conversational English
- Use simple numbered lists when listing rules
- Keep it clean, professional and easy to read

FLOW:
1. Ask what rules they want (or listen to their description)
2. Summarise the rules back in plain English for confirmation
3. When the user confirms (says yes, looks good, that's right, no changes, etc.) — output the rules as a JSON code block that the system will parse automatically. Format:

\`\`\`json
[
  {"name": "Rule Name", "condition_type": "position|position_range|streak|scratch|dnf|all", "condition_value": {}, "action": "add|subtract|set|no_change", "action_value": 30, "applies_to": "self|all_others|non_scratch|scratch_only", "description": "Plain English description"}
]
\`\`\`

condition_type options:
- "position" with condition_value: {"position": 1} for specific position
- "position_range" with condition_value: {"from": 1, "to": 3} for a range
- "streak" with condition_value: {"streak_position": "last", "streak_count": 3}
- "scratch" (no condition_value needed — triggers for scratch/0s boat)
- "dnf" (no condition_value needed — triggers for DNF/DNS)
- "all" (applies every race to everyone)

IMPORTANT: When the user says "no" to further changes, or confirms the rules, you MUST output the JSON block immediately. Do NOT repeat the rules in plain text again. Just say something brief like "Done! I've created those rules for you." followed by the JSON block.`;

      const conversationHistory = alfieMessages.slice(-10).map(m => ({
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
            message: `${handicapContext}\n\nUser message: ${messageText}`,
            conversationHistory,
            clubId: clubId || null,
            source: 'handicap_rule_builder',
          }),
        }
      );

      if (!response.ok) throw new Error(`API error: ${response.status}`);

      const data = await response.json();

      if (data?.message) {
        const parsedRules = parseRulesFromResponse(data.message);
        const cleanMessage = data.message.replace(/```json[\s\S]*?```/g, '').trim();

        if (parsedRules && parsedRules.length > 0) {
          setAdjustmentRules(parsedRules);
          setAlfieMessages(prev => [...prev, {
            role: 'assistant',
            content: cleanMessage || `Done! I've created ${parsedRules.length} rules for you. Switch to the "Rules & Flow" tab to review and fine-tune them.`
          }]);
          setTimeout(() => setActiveTab('rules'), 1500);
        } else {
          setAlfieMessages(prev => [...prev, { role: 'assistant', content: data.message }]);
        }
      } else {
        setAlfieMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I had trouble processing that. Could you try rephrasing your question?' }]);
      }
    } catch (err) {
      console.error('Alfie handicap chat error:', err);
      setAlfieMessages(prev => [...prev, { role: 'assistant', content: 'Sorry, I encountered an error. Please try again.' }]);
    } finally {
      setAlfieLoading(false);
    }
  };

  const startListening = useCallback(() => {
    if (!hasSpeechRecognition || isListening) return;
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    recognition.lang = 'en-AU';
    recognition.interimResults = true;
    recognition.continuous = false;
    recognition.maxAlternatives = 1;

    setAlfieInput('');
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
        setAlfieInput(final);
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
        setTimeout(() => {
          sendAlfieMessage(textToSubmit.trim());
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

  const addNewRule = (rule: Partial<AdjustmentRule>) => {
    const newRule: AdjustmentRule = {
      id: `new-${Date.now()}`,
      ruleset_id: selectedRuleset?.id || '',
      priority: adjustmentRules.length + 1,
      name: rule.name || 'New Rule',
      condition_type: rule.condition_type || 'position',
      condition_value: rule.condition_value || {},
      action: rule.action || 'add',
      action_value: rule.action_value || 0,
      applies_to: rule.applies_to || 'self',
      description: rule.description || '',
    };
    setAdjustmentRules(prev => [...prev, newRule]);
    setShowNewRuleModal(false);
  };

  const updateRule = (index: number, updates: Partial<AdjustmentRule>) => {
    setAdjustmentRules(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  };

  const removeRule = (index: number) => {
    setAdjustmentRules(prev => prev.filter((_, i) => i !== index));
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-blue-400" size={32} />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2.5 bg-blue-500/20 rounded-xl">
            <Settings2 className="text-blue-400" size={24} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-white">Handicap Rule Builder</h1>
            <p className="text-sm text-slate-400">Create and test custom handicap calculation rules for your club</p>
          </div>
        </div>
        <div className="mt-3 px-4 py-2.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <p className="text-xs text-amber-300">
            <AlertCircle className="inline mr-1.5" size={14} />
            Standalone testing environment - these rules are NOT yet connected to live race scoring
          </p>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Left sidebar - Rule Sets list */}
        <div className="col-span-12 lg:col-span-3">
          <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-slate-300">Rule Sets</h3>
              <button
                onClick={createNewRuleset}
                className="p-1.5 rounded-lg bg-blue-500/20 text-blue-400 hover:bg-blue-500/30 transition-colors"
                title="Create new rule set"
              >
                <Plus size={16} />
              </button>
            </div>

            <div className="space-y-2">
              {/* System default */}
              <button
                onClick={() => {
                  setSelectedRuleset(null);
                  setAdjustmentRules(DEFAULT_RULES);
                  setSeedingRule({ id: '', ruleset_id: '', method: 'position_based', base_value: 0, increment_per_position: 10, description: 'Seeded from first race positions' });
                  setConfig({ id: '', ruleset_id: '', cap_limit: 150, last_place_bonus_enabled: false, last_place_bonus_value: 30, scratch_boat_win_bonus: 30, scratch_streak_threshold: 3, scratch_streak_bonus: 30 });
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors ${
                  !selectedRuleset ? 'bg-blue-500/20 border border-blue-500/40' : 'hover:bg-slate-700/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <Zap size={14} className="text-blue-400" />
                  <span className="text-sm font-medium text-white">AlfiePRO Default</span>
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Standard handicap rules (system)</p>
              </button>

              {rulesets.filter(r => !r.is_default).map(ruleset => (
                <div
                  key={ruleset.id}
                  onClick={() => loadRuleset(ruleset)}
                  className={`w-full text-left p-3 rounded-lg transition-colors group cursor-pointer ${
                    selectedRuleset?.id === ruleset.id ? 'bg-blue-500/20 border border-blue-500/40' : 'hover:bg-slate-700/50'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-white truncate">{ruleset.name}</span>
                    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                      <button
                        onClick={(e) => { e.stopPropagation(); duplicateRuleset(ruleset); }}
                        className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-white transition-colors"
                        title="Duplicate"
                      >
                        <Copy size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); loadRuleset(ruleset); }}
                        className="p-1 rounded hover:bg-slate-600/50 text-slate-400 hover:text-white transition-colors"
                        title="Edit"
                      >
                        <Edit3 size={12} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); deleteRuleset(ruleset.id); }}
                        className="p-1 rounded hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors"
                        title="Delete"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 truncate">{ruleset.description || 'Custom rule set'}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Main content */}
        <div className="col-span-12 lg:col-span-9">
          {/* Tabs */}
          <div className="flex items-center gap-1 mb-6 bg-slate-800/30 rounded-xl p-1 border border-slate-700/50">
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'rules' ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Target size={16} />
              Rules & Flow
            </button>
            <button
              onClick={() => setActiveTab('simulate')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'simulate' ? 'bg-green-500/20 text-green-300 border border-green-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Play size={16} />
              Test Simulation
            </button>
            <button
              onClick={() => setActiveTab('alfie')}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                activeTab === 'alfie' ? 'bg-teal-500/20 text-teal-300 border border-teal-500/30' : 'text-slate-400 hover:text-white'
              }`}
            >
              <Wand2 size={16} />
              Build with Alfie
            </button>
          </div>

          {/* Rules Tab */}
          {activeTab === 'rules' && (
            <div className="space-y-6">
              {/* Ruleset name (editable) */}
              {selectedRuleset && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-4">
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Ruleset Name</label>
                  <input
                    type="text"
                    value={selectedRuleset.name}
                    onChange={(e) => setSelectedRuleset({ ...selectedRuleset, name: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                  />
                  <label className="text-xs font-medium text-slate-400 mb-1 mt-3 block">Description</label>
                  <input
                    type="text"
                    value={selectedRuleset.description}
                    onChange={(e) => setSelectedRuleset({ ...selectedRuleset, description: e.target.value })}
                    className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
                    placeholder="Describe how these rules work..."
                  />
                </div>
              )}

              {/* Seeding Rules */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Target size={16} className="text-blue-400" />
                  Seeding (First Race)
                </h3>
                <p className="text-xs text-slate-400 mb-4">How initial handicaps are assigned when all boats start from scratch.</p>

                {seedingRule && (
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Method</label>
                      <select
                        value={seedingRule.method}
                        onChange={(e) => setSeedingRule({ ...seedingRule, method: e.target.value as any })}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!selectedRuleset}
                      >
                        <option value="position_based">Based on finishing position</option>
                        <option value="fixed_value">Fixed starting value</option>
                        <option value="fleet_average">Fleet average</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Base Value (1st place)</label>
                      <input
                        type="number"
                        value={seedingRule.base_value}
                        onChange={(e) => setSeedingRule({ ...seedingRule, base_value: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!selectedRuleset}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Increment per position (sec)</label>
                      <input
                        type="number"
                        value={seedingRule.increment_per_position}
                        onChange={(e) => setSeedingRule({ ...seedingRule, increment_per_position: parseInt(e.target.value) || 0 })}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!selectedRuleset}
                      />
                    </div>
                  </div>
                )}

                <div className="mt-3 p-3 bg-slate-900/30 rounded-lg">
                  <p className="text-xs text-slate-300">
                    Preview: 1st = {seedingRule?.base_value || 0}s,
                    2nd = {(seedingRule?.base_value || 0) + (seedingRule?.increment_per_position || 10)}s,
                    3rd = {(seedingRule?.base_value || 0) + (seedingRule?.increment_per_position || 10) * 2}s,
                    4th = {(seedingRule?.base_value || 0) + (seedingRule?.increment_per_position || 10) * 3}s...
                  </p>
                </div>
              </div>

              {/* Global Config */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                  <Settings2 size={16} className="text-slate-300" />
                  Global Settings
                </h3>

                {config && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Handicap Cap (max seconds)</label>
                      <input
                        type="number"
                        value={config.cap_limit}
                        onChange={(e) => setConfig({ ...config, cap_limit: parseInt(e.target.value) || 150 })}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!selectedRuleset}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-slate-400 mb-1 block">Scratch Boat Win Bonus (sec)</label>
                      <input
                        type="number"
                        value={config.scratch_boat_win_bonus}
                        onChange={(e) => setConfig({ ...config, scratch_boat_win_bonus: parseInt(e.target.value) || 30 })}
                        className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        disabled={!selectedRuleset}
                      />
                    </div>
                    <div className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={config.last_place_bonus_enabled}
                        onChange={(e) => setConfig({ ...config, last_place_bonus_enabled: e.target.checked })}
                        className="rounded border-slate-600"
                        disabled={!selectedRuleset}
                      />
                      <label className="text-xs text-slate-300">Enable last place bonus for non-scratch boats</label>
                    </div>
                    {config.last_place_bonus_enabled && (
                      <div>
                        <label className="text-xs text-slate-400 mb-1 block">Last Place Bonus Value (sec)</label>
                        <input
                          type="number"
                          value={config.last_place_bonus_value}
                          onChange={(e) => setConfig({ ...config, last_place_bonus_value: parseInt(e.target.value) || 30 })}
                          className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                          disabled={!selectedRuleset}
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Adjustment Rules - Visual Flow */}
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Zap size={16} className="text-amber-400" />
                    Post-Race Adjustment Rules
                  </h3>
                  {selectedRuleset && (
                    <button
                      onClick={() => setShowNewRuleModal(true)}
                      className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-500/20 text-blue-300 rounded-lg text-xs font-medium hover:bg-blue-500/30 transition-colors"
                    >
                      <Plus size={14} />
                      Add Rule
                    </button>
                  )}
                </div>
                {adjustmentRules.length > 0 && (
                  <p className="text-xs text-slate-400 mb-4">Rules are evaluated in order from top to bottom. Multiple rules can apply to the same skipper.</p>
                )}

                {/* Empty state for new rule sets */}
                {adjustmentRules.length === 0 && selectedRuleset && (
                  <div className="border-2 border-dashed border-slate-600/50 rounded-xl p-8 text-center">
                    <div className="max-w-md mx-auto">
                      <div className="w-12 h-12 rounded-full bg-slate-700/50 flex items-center justify-center mx-auto mb-4">
                        <Zap size={24} className="text-slate-400" />
                      </div>
                      <h4 className="text-white font-medium mb-2">No rules yet</h4>
                      <p className="text-sm text-slate-400 mb-6">
                        Start building your custom handicap rules. Choose how you'd like to get started:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <button
                          onClick={() => setActiveTab('alfie')}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-teal-500/30 bg-teal-500/10 hover:bg-teal-500/20 transition-colors group"
                        >
                          <Wand2 size={20} className="text-teal-400" />
                          <span className="text-sm font-medium text-teal-300">Build with Alfie</span>
                          <span className="text-[11px] text-slate-400">Describe your rules in plain English and let AI build them</span>
                        </button>
                        <button
                          onClick={() => setShowNewRuleModal(true)}
                          className="flex flex-col items-center gap-2 p-4 rounded-xl border border-blue-500/30 bg-blue-500/10 hover:bg-blue-500/20 transition-colors group"
                        >
                          <Plus size={20} className="text-blue-400" />
                          <span className="text-sm font-medium text-blue-300">Build Manually</span>
                          <span className="text-[11px] text-slate-400">Add rules one at a time using the rule builder</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Empty state when viewing default (read-only) and no custom selected */}
                {adjustmentRules.length === 0 && !selectedRuleset && (
                  <p className="text-xs text-slate-400 mb-4">Select or create a rule set to get started.</p>
                )}

                <div className="space-y-3">
                  {adjustmentRules.map((rule, index) => (
                    <RuleCard
                      key={rule.id || index}
                      rule={rule}
                      index={index}
                      editable={!!selectedRuleset}
                      onUpdate={(updates) => updateRule(index, updates)}
                      onDelete={() => removeRule(index)}
                      onEdit={() => setEditingRule(rule)}
                    />
                  ))}
                </div>
              </div>

              {/* Save button */}
              {selectedRuleset && (
                <div className="flex items-center justify-end gap-3">
                  {saveSuccess && (
                    <span className="flex items-center gap-1.5 text-xs text-green-400">
                      <CheckCircle2 size={14} />
                      Saved successfully
                    </span>
                  )}
                  <button
                    onClick={saveRuleset}
                    disabled={saving}
                    className={`flex items-center gap-2 px-5 py-2.5 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${
                      saveSuccess ? 'bg-green-600 hover:bg-green-500' : 'bg-blue-600 hover:bg-blue-500'
                    }`}
                  >
                    {saving ? <Loader2 size={16} className="animate-spin" /> : saveSuccess ? <CheckCircle2 size={16} /> : <Save size={16} />}
                    {saving ? 'Saving...' : saveSuccess ? 'Saved' : 'Save Ruleset'}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Simulation Tab */}
          {activeTab === 'simulate' && (
            <div className="space-y-6">
              <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                    <Play size={16} className="text-green-400" />
                    Race Simulation
                  </h3>
                  <div className="flex items-center bg-slate-900/50 rounded-lg border border-slate-600/50 p-0.5">
                    <button
                      onClick={() => { setSimMode('seeding'); setSimResults([]); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        simMode === 'seeding' ? 'bg-teal-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Seeding Round
                    </button>
                    <button
                      onClick={() => { setSimMode('handicap'); setSimResults([]); }}
                      className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        simMode === 'handicap' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Handicap Race
                    </button>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mb-4">
                  {simMode === 'seeding'
                    ? 'Simulate a seeding round to see how initial handicaps are assigned based on finishing position.'
                    : 'Set up a test race scenario and see how your rules calculate handicap adjustments.'
                  }
                </p>

                {/* Boat setup */}
                <div className="space-y-2 mb-4">
                  <div className="grid grid-cols-12 gap-2 text-xs font-medium text-slate-400 px-2">
                    <div className="col-span-3">Boat Name</div>
                    <div className="col-span-3">{simMode === 'seeding' ? 'Starting Hcap (ignored)' : 'Starting Handicap (sec)'}</div>
                    <div className="col-span-3">Finishing Position</div>
                    <div className="col-span-3"></div>
                  </div>
                  {simBoats.map((boat, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-center">
                      <div className="col-span-3">
                        <input
                          type="text"
                          value={boat.name}
                          onChange={(e) => setSimBoats(prev => prev.map((b, idx) => idx === i ? { ...b, name: e.target.value } : b))}
                          className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={boat.startHcap}
                          onChange={(e) => setSimBoats(prev => prev.map((b, idx) => idx === i ? { ...b, startHcap: parseInt(e.target.value) || 0 } : b))}
                          className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                        />
                      </div>
                      <div className="col-span-3">
                        <input
                          type="number"
                          value={boat.position || ''}
                          onChange={(e) => setSimBoats(prev => prev.map((b, idx) => idx === i ? { ...b, position: parseInt(e.target.value) || null } : b))}
                          className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                          placeholder="DNF"
                        />
                      </div>
                      <div className="col-span-3 flex items-center gap-2">
                        <button
                          onClick={() => setSimBoats(prev => prev.filter((_, idx) => idx !== i))}
                          className="p-1.5 rounded-lg text-red-400 hover:bg-red-500/20 transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setSimBoats(prev => [...prev, { name: `Boat ${String.fromCharCode(65 + prev.length)}`, startHcap: prev.length * 20, position: prev.length + 1 }])}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-700/50 text-slate-300 rounded-lg text-xs hover:bg-slate-700 transition-colors"
                  >
                    <Plus size={14} />
                    Add Boat
                  </button>
                  <button
                    onClick={runSimulation}
                    className="flex items-center gap-1.5 px-4 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-500 transition-colors"
                  >
                    <Play size={14} />
                    Run Simulation
                  </button>
                </div>
              </div>

              {/* Results */}
              {simResults.length > 0 && (
                <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 p-5">
                  <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
                    <CheckCircle2 size={16} className="text-green-400" />
                    Simulation Results
                  </h3>

                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-slate-700/50">
                          <th className="text-left py-2 px-3 text-slate-400 font-medium">Boat</th>
                          <th className="text-center py-2 px-3 text-slate-400 font-medium">Position</th>
                          {simMode === 'handicap' && <th className="text-center py-2 px-3 text-slate-400 font-medium">Start Hcap</th>}
                          <th className="text-center py-2 px-3 text-slate-400 font-medium">{simMode === 'seeding' ? 'Calculation' : 'Adjustment'}</th>
                          <th className="text-center py-2 px-3 text-slate-400 font-medium">{simMode === 'seeding' ? 'Assigned Hcap' : 'New Hcap'}</th>
                          <th className="text-left py-2 px-3 text-slate-400 font-medium">{simMode === 'seeding' ? 'Formula' : 'Rules Applied'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {simResults.map((result, i) => (
                          <tr key={i} className="border-b border-slate-700/30">
                            <td className="py-2.5 px-3 text-white font-medium">{result.name}</td>
                            <td className="py-2.5 px-3 text-center text-slate-300">{result.position || 'DNF'}</td>
                            {simMode === 'handicap' && <td className="py-2.5 px-3 text-center text-slate-300">{result.startHcap}s</td>}
                            <td className={`py-2.5 px-3 text-center font-medium ${
                              simMode === 'seeding' ? 'text-teal-400' : result.adjustment > 0 ? 'text-green-400' : result.adjustment < 0 ? 'text-red-400' : 'text-slate-400'
                            }`}>
                              {simMode === 'seeding' ? `${result.newHcap}s` : `${result.adjustment > 0 ? '+' : ''}${result.adjustment}s`}
                            </td>
                            <td className="py-2.5 px-3 text-center text-white font-medium">{result.newHcap}s</td>
                            <td className="py-2.5 px-3">
                              <div className="flex flex-wrap gap-1">
                                {result.rulesApplied.map((rule, ri) => (
                                  <span key={ri} className={`px-2 py-0.5 rounded text-[10px] ${simMode === 'seeding' ? 'bg-teal-500/20 text-teal-300' : 'bg-blue-500/20 text-blue-300'}`}>{rule}</span>
                                ))}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Alfie Tab */}
          {activeTab === 'alfie' && (
            <div className="bg-slate-800/50 rounded-xl border border-slate-700/50 overflow-hidden flex flex-col" style={{ height: '600px' }}>
              <div className="p-4 border-b border-slate-700/50 bg-slate-800/80">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-teal-500/20 rounded-lg">
                    <Wand2 size={16} className="text-teal-400" />
                  </div>
                  <div>
                    <h3 className="text-sm font-semibold text-white">Build Rules with Alfie</h3>
                    <p className="text-[11px] text-slate-400">Describe your handicap rules in plain English</p>
                  </div>
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {alfieMessages.map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] px-4 py-3 rounded-xl text-sm leading-relaxed ${
                      msg.role === 'user'
                        ? 'bg-blue-600/30 text-white border border-blue-500/30'
                        : 'bg-slate-700/50 text-slate-200 border border-slate-600/30'
                    }`}>
                      <div>{formatMessageContent(msg.content)}</div>
                    </div>
                  </div>
                ))}
                {alfieLoading && (
                  <div className="flex justify-start">
                    <div className="bg-slate-700/50 px-4 py-3 rounded-xl border border-slate-600/30">
                      <Loader2 size={16} className="animate-spin text-teal-400" />
                    </div>
                  </div>
                )}
                <div ref={alfieMessagesEndRef} />
              </div>

              {/* Input */}
              <div className="p-4 border-t border-slate-700/50 bg-slate-800/80">
                {isListening && (
                  <div className="mb-2 flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-xs text-red-300">Listening...</span>
                    {interimTranscript && (
                      <span className="text-xs text-slate-400 italic truncate flex-1">{interimTranscript}</span>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={alfieInput}
                    onChange={(e) => setAlfieInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && sendAlfieMessage()}
                    placeholder={isListening ? 'Listening...' : 'Describe your handicap rules...'}
                    className="flex-1 bg-slate-900/50 border border-slate-600/50 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-teal-500 placeholder-slate-500"
                  />
                  {hasSpeechRecognition && (
                    <button
                      onClick={isListening ? stopListening : startListening}
                      className={`p-2.5 rounded-lg transition-colors ${
                        isListening
                          ? 'bg-red-600 text-white hover:bg-red-500 animate-pulse'
                          : 'bg-slate-700 text-slate-300 hover:bg-slate-600 hover:text-white'
                      }`}
                      title={isListening ? 'Stop listening' : 'Voice input'}
                    >
                      {isListening ? <MicOff size={16} /> : <Mic size={16} />}
                    </button>
                  )}
                  <button
                    onClick={() => sendAlfieMessage()}
                    disabled={!alfieInput.trim() || alfieLoading}
                    className="p-2.5 bg-teal-600 text-white rounded-lg hover:bg-teal-500 transition-colors disabled:opacity-50"
                  >
                    <Send size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* New Rule Modal */}
      {showNewRuleModal && (
        <NewRuleModal
          onClose={() => setShowNewRuleModal(false)}
          onAdd={addNewRule}
        />
      )}

      {/* Edit Rule Modal */}
      {editingRule && (
        <EditRuleModal
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSave={(updated) => {
            const idx = adjustmentRules.findIndex(r => r.id === updated.id);
            if (idx !== -1) updateRule(idx, updated);
            setEditingRule(null);
          }}
        />
      )}
    </div>
  );
}

function RuleCard({ rule, index, editable, onUpdate, onDelete, onEdit }: {
  rule: AdjustmentRule;
  index: number;
  editable: boolean;
  onUpdate: (updates: Partial<AdjustmentRule>) => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const actionColor = rule.action === 'add' ? 'text-green-400 bg-green-500/10'
    : rule.action === 'subtract' ? 'text-red-400 bg-red-500/10'
    : rule.action === 'set' ? 'text-blue-400 bg-blue-500/10'
    : 'text-slate-400 bg-slate-500/10';

  const actionIcon = rule.action === 'add' ? TrendingUp
    : rule.action === 'subtract' ? TrendingDown
    : rule.action === 'set' ? Equal : Minus;
  const ActionIcon = actionIcon;

  return (
    <div className="flex items-center gap-3 p-3 bg-slate-900/40 rounded-lg border border-slate-700/30 group hover:border-slate-600/50 transition-colors">
      <div className="text-slate-500">
        <GripVertical size={16} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-slate-300">{index + 1}.</span>
          <span className="text-sm font-medium text-white">{rule.name}</span>
        </div>
        <p className="text-xs text-slate-400 mt-0.5">{rule.description}</p>
      </div>

      <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg ${actionColor}`}>
        <ActionIcon size={14} />
        <span className="text-xs font-medium">
          {rule.action === 'no_change' ? 'No change' : `${rule.action === 'subtract' ? '-' : '+'}${rule.action_value}s`}
        </span>
      </div>

      {editable && (
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onEdit} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors">
            <Edit3 size={14} />
          </button>
          <button onClick={onDelete} className="p-1.5 rounded-lg hover:bg-red-500/20 text-slate-400 hover:text-red-400 transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

function NewRuleModal({ onClose, onAdd }: { onClose: () => void; onAdd: (rule: Partial<AdjustmentRule>) => void }) {
  const [name, setName] = useState('');
  const [conditionType, setConditionType] = useState('position');
  const [conditionValue, setConditionValue] = useState<Record<string, any>>({ position: 1 });
  const [action, setAction] = useState<'add' | 'subtract' | 'set' | 'no_change'>('add');
  const [actionValue, setActionValue] = useState(10);
  const [appliesTo, setAppliesTo] = useState<'self' | 'all_others' | 'non_scratch' | 'scratch_only'>('self');
  const [description, setDescription] = useState('');

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Add Adjustment Rule</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Rule Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Last place gets 30 seconds added"
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">When does this trigger?</label>
            <select
              value={conditionType}
              onChange={(e) => {
                setConditionType(e.target.value);
                if (e.target.value === 'position') setConditionValue({ position: 1 });
                else if (e.target.value === 'position_range') setConditionValue({ from: 1, to: 3 });
                else if (e.target.value === 'streak') setConditionValue({ streak_position: 'last', streak_count: 3 });
                else setConditionValue({});
              }}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            >
              {CONDITION_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label} - {ct.description}</option>
              ))}
            </select>
          </div>

          {conditionType === 'position' && (
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Position</label>
              <input
                type="number"
                value={conditionValue.position || 1}
                onChange={(e) => setConditionValue({ position: parseInt(e.target.value) || 1 })}
                className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                min={1}
              />
            </div>
          )}

          {conditionType === 'position_range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">From Position</label>
                <input
                  type="number"
                  value={conditionValue.from || 1}
                  onChange={(e) => setConditionValue({ ...conditionValue, from: parseInt(e.target.value) || 1 })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">To Position</label>
                <input
                  type="number"
                  value={conditionValue.to || 3}
                  onChange={(e) => setConditionValue({ ...conditionValue, to: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={1}
                />
              </div>
            </div>
          )}

          {conditionType === 'streak' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Streak Position (what triggers)</label>
                <select
                  value={conditionValue.streak_position || 'last'}
                  onChange={(e) => setConditionValue({ ...conditionValue, streak_position: e.target.value, ...(e.target.value === 'specific' ? { specific_position: conditionValue.specific_position || 1 } : {}) })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="last">Last place</option>
                  <option value="first">First place</option>
                  <option value="specific">Specific position</option>
                </select>
              </div>
              {conditionValue.streak_position === 'specific' && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Position number</label>
                  <input
                    type="number"
                    value={conditionValue.specific_position || 1}
                    onChange={(e) => setConditionValue({ ...conditionValue, specific_position: parseInt(e.target.value) || 1 })}
                    className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                    min={1}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Consecutive count (how many times in a row)</label>
                <input
                  type="number"
                  value={conditionValue.streak_count || 3}
                  onChange={(e) => setConditionValue({ ...conditionValue, streak_count: parseInt(e.target.value) || 3 })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={2}
                />
              </div>
              <p className="text-xs text-slate-500">
                e.g. "If boat finishes {conditionValue.streak_position === 'specific' ? `in position ${conditionValue.specific_position || 1}` : conditionValue.streak_position === 'first' ? 'first' : 'last'} for {conditionValue.streak_count || 3} consecutive races, THEN apply the action"
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Action</label>
              <select
                value={action}
                onChange={(e) => setAction(e.target.value as any)}
                className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
              >
                {ACTION_TYPES.map(at => (
                  <option key={at.value} value={at.value}>{at.label}</option>
                ))}
              </select>
            </div>
            {action !== 'no_change' && (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Value (seconds)</label>
                <input
                  type="number"
                  value={actionValue}
                  onChange={(e) => setActionValue(parseInt(e.target.value) || 0)}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={0}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Applies to</label>
            <select
              value={appliesTo}
              onChange={(e) => setAppliesTo(e.target.value as any)}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            >
              {APPLIES_TO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Description (plain English)</label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Last finishing boat gets 30 seconds added to their handicap"
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => onAdd({ name, condition_type: conditionType, condition_value: conditionValue, action, action_value: actionValue, applies_to: appliesTo, description })}
            disabled={!name.trim()}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors disabled:opacity-50"
          >
            Add Rule
          </button>
        </div>
      </div>
    </div>
  );
}

function EditRuleModal({ rule, onClose, onSave }: { rule: AdjustmentRule; onClose: () => void; onSave: (rule: AdjustmentRule) => void }) {
  const [editedRule, setEditedRule] = useState<AdjustmentRule>({ ...rule });

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-slate-800 rounded-xl border border-slate-700 w-full max-w-lg p-6">
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-white">Edit Rule</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400">
            <X size={18} />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Rule Name</label>
            <input
              type="text"
              value={editedRule.name}
              onChange={(e) => setEditedRule({ ...editedRule, name: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Condition Type</label>
            <select
              value={editedRule.condition_type}
              onChange={(e) => setEditedRule({ ...editedRule, condition_type: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            >
              {CONDITION_TYPES.map(ct => (
                <option key={ct.value} value={ct.value}>{ct.label}</option>
              ))}
            </select>
          </div>

          {editedRule.condition_type === 'position' && (
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Position</label>
              <input
                type="number"
                value={editedRule.condition_value.position || 1}
                onChange={(e) => setEditedRule({ ...editedRule, condition_value: { position: parseInt(e.target.value) || 1 } })}
                className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                min={1}
              />
            </div>
          )}

          {editedRule.condition_type === 'position_range' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">From Position</label>
                <input
                  type="number"
                  value={editedRule.condition_value.from || 1}
                  onChange={(e) => setEditedRule({ ...editedRule, condition_value: { ...editedRule.condition_value, from: parseInt(e.target.value) || 1 } })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={1}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">To Position</label>
                <input
                  type="number"
                  value={editedRule.condition_value.to || 3}
                  onChange={(e) => setEditedRule({ ...editedRule, condition_value: { ...editedRule.condition_value, to: parseInt(e.target.value) || 3 } })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={1}
                />
              </div>
            </div>
          )}

          {editedRule.condition_type === 'streak' && (
            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Streak Position (what triggers)</label>
                <select
                  value={editedRule.condition_value.streak_position || 'last'}
                  onChange={(e) => setEditedRule({ ...editedRule, condition_value: { ...editedRule.condition_value, streak_position: e.target.value, ...(e.target.value === 'specific' ? { specific_position: editedRule.condition_value.specific_position || 1 } : {}) } })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                >
                  <option value="last">Last place</option>
                  <option value="first">First place</option>
                  <option value="specific">Specific position</option>
                </select>
              </div>
              {(editedRule.condition_value.streak_position === 'specific') && (
                <div>
                  <label className="text-xs font-medium text-slate-400 mb-1 block">Position number</label>
                  <input
                    type="number"
                    value={editedRule.condition_value.specific_position || 1}
                    onChange={(e) => setEditedRule({ ...editedRule, condition_value: { ...editedRule.condition_value, specific_position: parseInt(e.target.value) || 1 } })}
                    className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                    min={1}
                  />
                </div>
              )}
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Consecutive count (how many times in a row)</label>
                <input
                  type="number"
                  value={editedRule.condition_value.streak_count || editedRule.condition_value.consecutive_last || 3}
                  onChange={(e) => setEditedRule({ ...editedRule, condition_value: { ...editedRule.condition_value, streak_count: parseInt(e.target.value) || 3 } })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={2}
                />
              </div>
              <p className="text-xs text-slate-500">
                e.g. "If boat finishes {editedRule.condition_value.streak_position === 'specific' ? `in position ${editedRule.condition_value.specific_position || 1}` : (editedRule.condition_value.streak_position || 'last') === 'first' ? 'first' : 'last'} for {editedRule.condition_value.streak_count || editedRule.condition_value.consecutive_last || 3} consecutive races, THEN apply the action"
              </p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-slate-400 mb-1 block">Action</label>
              <select
                value={editedRule.action}
                onChange={(e) => setEditedRule({ ...editedRule, action: e.target.value as any })}
                className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
              >
                {ACTION_TYPES.map(at => (
                  <option key={at.value} value={at.value}>{at.label}</option>
                ))}
              </select>
            </div>
            {editedRule.action !== 'no_change' && (
              <div>
                <label className="text-xs font-medium text-slate-400 mb-1 block">Value (seconds)</label>
                <input
                  type="number"
                  value={editedRule.action_value}
                  onChange={(e) => setEditedRule({ ...editedRule, action_value: parseInt(e.target.value) || 0 })}
                  className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
                  min={0}
                />
              </div>
            )}
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Applies to</label>
            <select
              value={editedRule.applies_to}
              onChange={(e) => setEditedRule({ ...editedRule, applies_to: e.target.value as any })}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            >
              {APPLIES_TO_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-slate-400 mb-1 block">Description</label>
            <input
              type="text"
              value={editedRule.description}
              onChange={(e) => setEditedRule({ ...editedRule, description: e.target.value })}
              className="w-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-white text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">Cancel</button>
          <button
            onClick={() => onSave(editedRule)}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-500 transition-colors"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );
}
