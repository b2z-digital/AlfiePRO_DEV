import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

interface ScoringContext {
  isActive: boolean;
  raceType: string | null;
  scoringSystem: string | null;
  eventName: string | null;
  clubName: string | null;
  boatClass: string | null;
  currentDay: number;
  currentRace: number;
  totalRaces: number;
  lastCompletedRace: number;
  dropRules: number[] | string | null;
  skippers: Array<{
    index: number;
    name: string;
    sailNo: string;
    club: string;
    boatModel: string;
    startHcap: number;
    currentHcap?: number;
    withdrawn?: boolean;
  }>;
  raceResults: Array<{
    race: number;
    skipperIndex: number;
    skipperName: string;
    position: number | null;
    letterScore?: string;
    points?: number;
    hcapBefore?: number;
    hcapAfter?: number;
    heatDesignation?: string;
  }>;
  heatInfo: {
    scoringSystem: string;
    currentRound: number;
    totalRounds: number;
    currentHeat: string | null;
    numberOfHeats: number;
    promotionCount: number;
    heatAssignments: Array<{ heat: string; skipperNames: string[] }>;
    roundResults: Array<{ round: number; completed: boolean; heats: string[] }>;
    lastPromotion?: {
      promoted: string[];
      relegated: string[];
      fromHeat: string;
      toHeat: string;
    };
  } | null;
  standings: Array<{
    rank: number;
    skipperName: string;
    sailNo: string;
    totalPoints: number;
    netPoints: number;
    racePoints: number[];
    droppedRaces: number[];
    fleet?: string;
    heatPerRace?: string[];
    letterScores?: (string | undefined)[];
  }>;
}

interface RequestPayload {
  message: string;
  conversationHistory?: ChatMessage[];
  clubId?: string;
  source?: string;
  image_url?: string;
  course_mode?: boolean;
  scoring_context?: ScoringContext;
}

interface FaqMatch {
  question: string;
  answer: string;
  category_name: string;
  parent_category_name: string | null;
  relevance_score: number;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const openaiApiKey = Deno.env.get("OPENAI_API_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseUser = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const payload: RequestPayload = await req.json();
    const {
      message,
      conversationHistory = [],
      clubId,
      source = "web_platform",
      image_url,
      course_mode,
      scoring_context,
    } = payload;

    if (!message || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const hasImage = !!image_url;
    const startTime = Date.now();

    const [
      aiInstructionsResult,
      relevantFaqsResult,
      correctionsResult,
      knowledgeResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("alfie_ai_instructions")
        .select("category, instruction_text, priority")
        .eq("is_active", true)
        .order("priority", { ascending: false }),
      supabaseAdmin.rpc("search_faqs_by_relevance", {
        search_query: message,
        match_count: 15,
      }),
      supabaseAdmin
        .from("alfie_knowledge_corrections")
        .select("scenario, correct_information, topic")
        .eq("status", "active")
        .limit(30),
      supabaseAdmin.rpc("search_knowledge_text", {
        search_query: message,
        match_count: 15,
      }),
    ]);

    const aiInstructions = aiInstructionsResult.data || [];
    const relevantFaqs: FaqMatch[] = relevantFaqsResult.data || [];
    const corrections = correctionsResult.data || [];
    const knowledgeChunks = knowledgeResult.data || [];

    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("full_name, first_name")
      .eq("id", user.id)
      .maybeSingle();

    const firstName = profileData?.first_name || profileData?.full_name?.split(" ")[0] || "";
    const userName = profileData?.full_name || profileData?.first_name || "there";

    const hasScoringContext = scoring_context?.isActive === true;

    let systemPrompt = buildSystemPrompt(
      aiInstructions,
      relevantFaqs,
      corrections,
      knowledgeChunks,
      firstName,
      hasImage,
      course_mode || false,
      hasScoringContext ? scoring_context : undefined
    );

    // Build user message content - multi-content array when image present
    let userContent: any;
    if (hasImage) {
      userContent = [
        { type: "text", text: message },
        { type: "image_url", image_url: { url: image_url, detail: "high" } },
      ];
    } else {
      userContent = message;
    }

    const messages: any[] = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10).map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: userContent },
    ];

    // Use gpt-4o for image analysis or scoring context (needs reasoning), gpt-4o-mini for general text
    const useAdvancedModel = hasImage || hasScoringContext;
    const model = useAdvancedModel ? "gpt-4o" : "gpt-4o-mini";
    const temperature = hasImage ? 0.3 : hasScoringContext ? 0.4 : 0.7;
    const maxTokens = hasImage ? 2500 : hasScoringContext ? 3000 : 1500;

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: maxTokens,
          temperature,
        }),
      }
    );

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text();
      console.error("OpenAI error:", errText);
      return new Response(
        JSON.stringify({ error: "AI service error", details: errText }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const openaiData = await openaiResponse.json();
    const assistantMessage =
      openaiData.choices?.[0]?.message?.content || "Sorry, I couldn't generate a response.";
    const usage = openaiData.usage || {};
    const responseTimeMs = Date.now() - startTime;

    // Cost calculation - different rates for gpt-4o vs gpt-4o-mini
    const inputRate = useAdvancedModel ? 0.0025 / 1000 : 0.00015 / 1000;
    const outputRate = useAdvancedModel ? 0.01 / 1000 : 0.0006 / 1000;
    const inputCost = (usage.prompt_tokens || 0) * inputRate;
    const outputCost = (usage.completion_tokens || 0) * outputRate;

    supabaseAdmin
      .from("askalfie_usage_logs")
      .insert({
        user_id: user.id,
        club_id: clubId || null,
        session_id: crypto.randomUUID(),
        question_preview: message.substring(0, 200),
        category: hasImage ? (course_mode ? "course_analysis" : "race_scenario") : hasScoringContext ? "live_scoring" : "platform_help",
        model_id: model,
        input_tokens: usage.prompt_tokens || 0,
        output_tokens: usage.completion_tokens || 0,
        input_cost_usd: inputCost,
        output_cost_usd: outputCost,
        response_time_ms: responseTimeMs,
        success: true,
        source_platform: source,
      })
      .then(() => {});

    return new Response(
      JSON.stringify({
        message: assistantMessage,
        userName,
        usage: {
          inputTokens: usage.prompt_tokens || 0,
          outputTokens: usage.completion_tokens || 0,
          responseTimeMs,
        },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("AskAlfie chat error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error", details: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildSystemPrompt(
  aiInstructions: Array<{ category: string; instruction_text: string; priority: number }>,
  relevantFaqs: FaqMatch[],
  corrections: Array<{ scenario: string; correct_information: string; topic: string }>,
  knowledgeChunks: Array<{ content: string; source_name: string; similarity: number }>,
  firstName: string,
  hasImage: boolean,
  courseMode: boolean,
  scoringContext?: ScoringContext
): string {
  let prompt = "";

  if (aiInstructions.length > 0) {
    for (const inst of aiInstructions) {
      prompt += `[${inst.category}]: ${inst.instruction_text}\n\n`;
    }
  } else {
    prompt = `You are Alfie, the AI assistant for AlfiePRO - a comprehensive yacht racing club management platform. You help club administrators and editors use the platform effectively. Be friendly, concise, and use step-by-step instructions when explaining how to do things.\n\n`;
  }

  prompt += `\nWeb platform context: This user is on the AlfiePRO web platform (not mobile app). Navigation is via the left sidebar. Key sections include Race Management, Membership, Finances, Communications, Events, Media, Meetings, Tasks, Settings, and Support.\n`;

  prompt += `\nIMPORTANT greeting rule: The user's first name is "${firstName || "there"}". When this is the first message in a conversation (no prior conversation history), greet them with "Hi ${firstName || "there"}" — NOT "Hey mate", NOT "G'day mate", NOT "I'm Alfie". Just "Hi ${firstName || "there"}" followed by your helpful response. For follow-up messages, do NOT re-greet — just answer directly.\n`;

  // Add image analysis rules when an image is present
  if (hasImage) {
    prompt += buildImageAnalysisPrompt(courseMode);
  }

  // Add live scoring context when user is actively scoring
  if (scoringContext?.isActive) {
    prompt += buildScoringContextPrompt(scoringContext);
  }

  if (corrections.length > 0) {
    prompt += "\nKnowledge corrections (use these to avoid past mistakes):\n";
    for (const corr of corrections.slice(0, 10)) {
      prompt += `- Topic: ${corr.topic} | Scenario: ${corr.scenario} | Correct info: ${corr.correct_information}\n`;
    }
  }

  if (relevantFaqs.length > 0) {
    prompt += `\n--- ALFIEPRO KNOWLEDGE BASE ---\n`;
    prompt += `The following FAQ entries are from the official AlfiePRO knowledge base and are directly relevant to the user's question. USE this information as your PRIMARY source of truth when answering platform-related questions.\n\n`;
    prompt += `IMPORTANT RULES for using this knowledge:\n`;
    prompt += `- Base your answer on the FAQ content below — it is accurate and up to date.\n`;
    prompt += `- Do NOT just copy-paste the FAQ text. Rephrase it in your own conversational, friendly voice.\n`;
    prompt += `- Present step-by-step instructions naturally, as if you're walking a friend through it.\n`;
    prompt += `- If multiple FAQs are relevant, synthesise the information into one cohesive answer.\n`;
    prompt += `- Add helpful context or tips where appropriate (e.g., "A handy trick is..." or "You'll find this under...").\n`;
    prompt += `- If the FAQ gives numbered steps, you can keep that structure but make it feel personal.\n`;
    prompt += `- Keep answers focused and avoid overwhelming the user with information they didn't ask for.\n\n`;

    const groupedBySection: Record<string, FaqMatch[]> = {};
    for (const faq of relevantFaqs) {
      const section = faq.parent_category_name
        ? `${faq.parent_category_name} > ${faq.category_name}`
        : faq.category_name;
      if (!groupedBySection[section]) groupedBySection[section] = [];
      groupedBySection[section].push(faq);
    }

    for (const [section, faqs] of Object.entries(groupedBySection)) {
      prompt += `[Section: ${section}]\n`;
      for (const faq of faqs) {
        prompt += `Q: ${faq.question}\nA: ${faq.answer}\n\n`;
      }
    }

    prompt += `--- END KNOWLEDGE BASE ---\n`;
  }

  if (knowledgeChunks.length > 0) {
    prompt += `\n--- EXPERT KNOWLEDGE BASE ---\n`;
    prompt += `The following knowledge chunks are from expert-curated documents uploaded by administrators. These contain authoritative information about scoring systems (HMS, SHRS), sailing rules, race management, and other specialist topics.\n\n`;
    prompt += `CRITICAL RULES for using this knowledge:\n`;
    prompt += `- When the user asks about a specific scoring system (e.g. SHRS, HMS), ONLY use knowledge chunks from that system's documents. Do NOT mix information from different scoring systems.\n`;
    prompt += `- These chunks are the PRIMARY source of truth for scoring rules, tie-breaking procedures, heat structures, and race management topics.\n`;
    prompt += `- Use the FULL content of each chunk — do not summarise or skip details.\n`;
    prompt += `- If a chunk directly answers the user's question, base your answer on that chunk's content.\n\n`;

    for (const chunk of knowledgeChunks) {
      const name = chunk.source_name || 'Knowledge Document';
      prompt += `[${name}]:\n${chunk.content}\n\n`;
    }

    prompt += `--- END EXPERT KNOWLEDGE BASE ---\n`;
  }

  return prompt;
}

function buildImageAnalysisPrompt(courseMode: boolean): string {
  let prompt = `\n--- VISUAL ANALYSIS MODE ---\n`;
  prompt += `An image has been attached to this message. You MUST analyze the visual content carefully.\n\n`;

  if (courseMode) {
    prompt += buildCourseAnalysisPrompt();
  } else {
    prompt += buildRaceScenarioAnalysisPrompt();
  }

  prompt += buildSailingFlagIdentificationPrompt();
  prompt += `\n--- END VISUAL ANALYSIS MODE ---\n`;

  return prompt;
}

function buildRaceScenarioAnalysisPrompt(): string {
  return `## RACE SCENARIO ANALYSIS

You are analyzing a race scenario drawing or photo. Your role is to act as an expert sailing umpire and rules advisor. Analyze the image methodically.

### VISUAL ELEMENT IDENTIFICATION

Identify these elements in the drawing:
- **Boats**: Labeled circles (A, B, C, etc.) with distinct colors. The color and label identify each boat uniquely.
- **Marks/Buoys**: Numbered circles (1, 2, 3, etc.) with borders. Marks with the same pair color (1&2, 3&4) are related course marks.
- **Wind direction**: Cyan arrow with "WIND" label. This is critical for determining tack and windward/leeward positions.
- **Lines**: Thin lines between elements showing paths, approaches, or boundaries.
- **Arrows**: Lines with arrowheads showing boat headings, approach directions, or movement paths.
- **Freehand annotations**: Colored pen strokes the user has drawn to highlight areas of concern.
- **Photos**: If a real photograph rather than a drawing, identify boat positions, marks, and the racing situation from the photo.

### TACK DETERMINATION PROCESS

This is critical - always determine tack correctly:
1. Look at the WIND arrow direction (cyan arrow labeled "WIND")
2. Determine which side of each boat the wind is coming from
3. **Port tack**: Wind coming over the PORT (left) side of the boat
4. **Starboard tack**: Wind coming over the STARBOARD (right) side of the boat
5. The boom is on the opposite side to where the wind comes from
6. A boat sailing downwind with the boom on the starboard side is on PORT tack (wind from port)

### SPATIAL LAYOUT RULES

When analyzing positions:
- **Windward boat**: The boat closer to the wind source (closer to where the wind arrow points FROM)
- **Leeward boat**: The boat further from the wind source
- **Clear ahead/astern**: One boat's hull entirely past the other's hull in the direction of the course
- **Overlap**: Neither boat is clear ahead or astern - their hulls overlap when projected perpendicular to the course
- **Inside/Outside at mark**: The boat nearer to the mark is the "inside" boat
- **Zone**: Approximately 3 boat-lengths from a mark (look at the scale of boats vs marks in the drawing)

### COMMON SCENARIO PATTERNS

Recognize and analyze these patterns:
1. **Port/Starboard crossing**: Two boats converging on opposite tacks - starboard has right of way (Rule 10)
2. **Windward/Leeward overlap**: Same tack boats overlapped - windward keeps clear (Rule 11)
3. **Mark rounding with overlap**: Check if overlap was established before the zone (Rule 18)
4. **Tacking too close**: Boat tacking must keep clear until on new close-hauled course (Rule 13)
5. **Room to pass obstruction**: Boats passing an obstruction together (Rule 19)
6. **Starting line situations**: Boats approaching the start line - leeward/windward rules apply
7. **Protest situation**: If boats are drawn in very close proximity, analyze if there is a potential foul

### KEY RACING RULES REFERENCE

Always cite the specific RRS (Racing Rules of Sailing) rule number:
- **Rule 10**: Port/Starboard - port tack boat keeps clear of starboard tack boat
- **Rule 11**: Windward/Leeward - windward boat keeps clear when on same tack overlapped
- **Rule 12**: Same tack not overlapped - boat clear astern keeps clear
- **Rule 13**: While tacking - a boat is subject to this rule from the moment she passes head to wind until she is on a close-hauled course
- **Rule 14**: Avoiding contact - every boat shall avoid contact if reasonably possible
- **Rule 15**: Acquiring right of way - give the other boat room to keep clear
- **Rule 16**: Changing course - right-of-way boat shall give the other boat room to keep clear
- **Rule 17**: Same tack proper course - if a boat clear astern becomes overlapped within two lengths to leeward, she shall not sail above proper course
- **Rule 18**: Mark room - inside overlapped boat is entitled to mark room. Overlap must be established before zone entry.
- **Rule 19**: Room to pass an obstruction
- **Rule 20**: Room to tack at an obstruction

### RESPONSE FORMAT FOR RACE SCENARIOS

Structure your response as follows:
1. **Situation Summary**: Briefly describe what you see (boats, positions, wind, marks)
2. **Tack Analysis**: State each boat's tack clearly
3. **Right of Way**: Identify which boat has right of way and why
4. **Applicable Rules**: List specific rules with numbers
5. **Ruling/Advice**: Clear determination of who must keep clear or what should happen
6. **Tips**: Practical advice for the situation

Use bold for rule numbers and key determinations. Be authoritative but friendly.
`;
}

function buildCourseAnalysisPrompt(): string {
  return `## COURSE SETUP ANALYSIS MODE

You are acting as an experienced Race Officer advisor. The user has drawn a course layout and wants advice on course setup.

### COURSE ELEMENT IDENTIFICATION

- **Marks/Buoys**: Numbered marks showing the course layout. Paired colors (1&2, 3&4) indicate related marks.
- **Wind direction**: The cyan wind arrow shows the prevailing wind direction.
- **Lines**: May show start/finish lines or course boundaries.
- **Arrows**: May show the intended course direction or leg headings.

### COURSE ANALYSIS CHECKLIST

Evaluate the course for:
1. **Course shape**: Identify the type (windward-leeward, triangle, trapezoid, etc.)
2. **Wind alignment**: Is the windward mark correctly upwind? Are reaching legs at appropriate angles?
3. **Start line**: Is the start line roughly perpendicular to the wind? Is it biased?
4. **Mark spacing**: Are marks appropriately spaced for the expected fleet size?
5. **Safety**: Any concerns about shore proximity, current effects, or traffic?
6. **Fairness**: Is the course fair for both port and starboard approaches?

### COURSE SETUP RECOMMENDATIONS

Provide advice on:
- Optimal mark positions relative to wind
- Start line angle and length recommendations (1.0-1.5x fleet width)
- Suggested course adjustments for better racing
- Wind shift considerations and when to shorten or adjust
- Gate vs. single mark rounding benefits

### RESPONSE FORMAT FOR COURSE ANALYSIS

Structure your response as:
1. **Course Type**: Identify the course configuration
2. **Wind Assessment**: How well the course aligns with the wind
3. **Mark Positions**: Analysis of each mark's placement
4. **Start Line**: Assessment and suggestions
5. **Recommendations**: Specific improvements
6. **Race Officer Tips**: Practical setup advice

Be encouraging but constructive. Frame suggestions as improvements rather than criticisms.
`;
}

function buildScoringContextPrompt(ctx: ScoringContext): string {
  let p = `\n--- LIVE SCORING SESSION ---\n`;
  p += `IMPORTANT: The user is CURRENTLY scoring a live race event. You have access to the real-time scoring data below. When the user asks about results, handicaps, standings, heat assignments, or calculations, use THIS DATA as your primary source of truth. Reference specific skipper names, sail numbers, and actual values from the data.\n\n`;

  // Event overview
  p += `## Event Details\n`;
  p += `- Event: ${ctx.eventName || "Unnamed event"}\n`;
  if (ctx.clubName) p += `- Club: ${ctx.clubName}\n`;
  if (ctx.boatClass) p += `- Class: ${ctx.boatClass}\n`;
  p += `- Race Type: ${ctx.raceType || "unknown"}\n`;
  p += `- Scoring System: ${ctx.scoringSystem === "hms" ? "HMS (Heat Management System)" : ctx.scoringSystem === "shrs" ? "SHRS (Single Handed Racing Series)" : ctx.raceType === "handicap" ? "Standard Handicap" : "Scratch (no handicaps)"}\n`;
  p += `- Day: ${ctx.currentDay}\n`;
  p += `- Races: ${ctx.lastCompletedRace} completed out of ${ctx.totalRaces} scheduled\n`;
  if (ctx.dropRules) {
    p += `- Drop Rules: ${Array.isArray(ctx.dropRules) ? ctx.dropRules.join(", ") : ctx.dropRules}\n`;
  }
  p += `\n`;

  // Skippers
  if (ctx.skippers.length > 0) {
    p += `## Competitors (${ctx.skippers.length} skippers)\n`;
    for (const s of ctx.skippers) {
      let line = `- ${s.name} (Sail: ${s.sailNo})`;
      if (s.club) line += ` [${s.club}]`;
      if (s.boatModel) line += ` - ${s.boatModel}`;
      if (ctx.raceType === "handicap") {
        line += ` | Start Hcap: ${s.startHcap}`;
        if (s.currentHcap !== undefined && s.currentHcap !== s.startHcap) {
          line += ` → Current: ${s.currentHcap}`;
        }
      }
      if (s.withdrawn) line += ` [WITHDRAWN]`;
      p += line + `\n`;
    }
    p += `\n`;
  }

  // Race results
  if (ctx.raceResults.length > 0) {
    p += `## Race Results\n`;
    const raceGroups: Record<number, typeof ctx.raceResults> = {};
    for (const r of ctx.raceResults) {
      if (!raceGroups[r.race]) raceGroups[r.race] = [];
      raceGroups[r.race].push(r);
    }
    for (const [raceNum, results] of Object.entries(raceGroups)) {
      const sorted = results.sort((a, b) => {
        if (a.letterScore && !b.letterScore) return 1;
        if (!a.letterScore && b.letterScore) return -1;
        if (a.position === null) return 1;
        if (b.position === null) return -1;
        return a.position - b.position;
      });
      p += `### Race ${raceNum}${sorted[0]?.heatDesignation ? ` (Heat ${sorted[0].heatDesignation})` : ""}\n`;
      for (const r of sorted) {
        let line = `  ${r.position !== null ? `${r.position}.` : "-"} ${r.skipperName}`;
        if (r.letterScore) line += ` (${r.letterScore})`;
        if (r.points !== undefined) line += ` → ${r.points} pts`;
        if (ctx.raceType === "handicap" && r.hcapBefore !== undefined && r.hcapAfter !== undefined) {
          const change = r.hcapAfter - r.hcapBefore;
          line += ` | Hcap: ${r.hcapBefore} → ${r.hcapAfter} (${change >= 0 ? "+" : ""}${change})`;
        }
        p += line + `\n`;
      }
    }
    p += `\n`;
  }

  // Heat information
  if (ctx.heatInfo) {
    const h = ctx.heatInfo;
    p += `## Heat Racing Details\n`;
    p += `- System: ${h.scoringSystem === "hms" ? "HMS" : "SHRS"}\n`;
    p += `- Current Round: ${h.currentRound} of ${h.totalRounds}\n`;
    p += `- Number of Heats: ${h.numberOfHeats}\n`;
    p += `- Promotion Count: ${h.promotionCount} skippers per round\n`;
    if (h.currentHeat) p += `- Currently Scoring: Heat ${h.currentHeat}\n`;
    p += `\n`;

    if (h.heatAssignments.length > 0) {
      p += `### Current Heat Assignments\n`;
      for (const ha of h.heatAssignments) {
        p += `- Heat ${ha.heat}: ${ha.skipperNames.join(", ")}\n`;
      }
      p += `\n`;
    }

    if (h.lastPromotion) {
      p += `### Last Promotion/Relegation\n`;
      if (h.lastPromotion.promoted.length > 0) {
        p += `- Promoted (${h.lastPromotion.fromHeat} → ${h.lastPromotion.toHeat}): ${h.lastPromotion.promoted.join(", ")}\n`;
      }
      if (h.lastPromotion.relegated.length > 0) {
        p += `- Relegated: ${h.lastPromotion.relegated.join(", ")}\n`;
      }
      p += `\n`;
    }

    if (h.roundResults.length > 0) {
      p += `### Round Progress\n`;
      for (const rr of h.roundResults) {
        p += `- Round ${rr.round}: ${rr.completed ? "Complete" : "In Progress"} (Heats: ${rr.heats.join(", ")})\n`;
      }
      p += `\n`;
    }
  }

  // Standings
  if (ctx.standings.length > 0) {
    p += `## Current Standings (ranked by FINAL/Net points — lowest wins)\n`;
    p += `IMPORTANT: The "Final" column = Net points (after discards). This is what determines finishing positions. The "Total" column = Gross points (before discards) and is NOT used for ranking.\n`;
    const hasFleets = ctx.standings.some(s => s.fleet);
    let currentFleet = '';
    for (const s of ctx.standings) {
      if (hasFleets && s.fleet && s.fleet !== currentFleet) {
        currentFleet = s.fleet;
        p += `\n### ${currentFleet} Fleet\n`;
      }
      let line = `${s.rank}. ${s.skipperName} (${s.sailNo})`;
      if (s.fleet) line += ` [${s.fleet}]`;
      line += ` — FINAL: ${s.netPoints} pts`;
      if (s.totalPoints !== s.netPoints) line += ` (Total/Gross: ${s.totalPoints})`;
      if (s.racePoints.length > 0) {
        const raceStr = s.racePoints.map((pts, i) => {
          const isDropped = s.droppedRaces.includes(i + 1);
          const letterScore = s.letterScores?.[i];
          let display = letterScore && letterScore !== 'RDGfix' ? `${letterScore}(${pts})` : `${pts}`;
          if (isDropped) display = `[${display}]`;
          return display;
        }).join(", ");
        line += ` | Races: ${raceStr}`;
      }
      if (s.heatPerRace && s.heatPerRace.length > 0) {
        line += ` | Heats: ${s.heatPerRace.join(", ")}`;
      }
      p += line + `\n`;
    }
    p += `\n`;
  }

  // Add handicap calculation rules when in handicap mode
  if (ctx.raceType === "handicap") {
    p += `## AlfiePRO Handicap Calculation Rules\n`;
    p += `These are the EXACT rules used by AlfiePRO to calculate handicaps. Use these when explaining how handicaps were calculated.\n\n`;
    p += `### Race 1 Seeding (All Boats on Scratch)\n`;
    p += `When ALL boats start Race 1 with handicap 0 (scratch) and handicaps are NOT set manually:\n`;
    p += `- Race 1 is a "seeding race" — finishing positions set initial handicaps\n`;
    p += `- 1st place → handicap remains 0 (stays on scratch)\n`;
    p += `- 2nd place → handicap set to 10\n`;
    p += `- 3rd place → handicap set to 20\n`;
    p += `- 4th place → handicap set to 30\n`;
    p += `- Formula: (finishing_position - 1) × 10\n`;
    p += `- Letter scores (DNS, DNF, etc.) → handicap set to 0\n\n`;
    p += `### Standard Handicap Adjustments (Race 2+)\n`;
    p += `Position-based adjustments applied to each skipper's current handicap:\n`;
    p += `- 1st place: -30 seconds (handicap decreases)\n`;
    p += `- 2nd place: -20 seconds (handicap decreases)\n`;
    p += `- 3rd place: -10 seconds (handicap decreases)\n`;
    p += `- 4th place and below: 0 (no change from position alone)\n\n`;
    p += `### Scratch Boat Bonus (+30 seconds)\n`;
    p += `When a boat sailing on scratch (handicap = 0) WINS the race (finishes 1st):\n`;
    p += `- ALL other boats receive +30 seconds added to their handicap adjustment\n`;
    p += `- The scratch boat winner ALSO gets +30 (which offsets their -30 for 1st, resulting in net 0 change)\n`;
    p += `- Other scratch boats in 2nd/3rd also get the +30 bonus added to their position adjustment\n`;
    p += `- This bonus does NOT apply when ALL boats are on scratch\n`;
    p += `- This bonus does NOT apply when the race winner is NOT a scratch boat\n\n`;
    p += `### Combined Calculation\n`;
    p += `For each skipper: new_handicap = current_handicap + position_adjustment + scratch_boat_bonus\n`;
    p += `- The result is clamped: minimum 0, maximum = cap limit\n\n`;
    p += `### Letter Score Handling\n`;
    p += `- DNS, DNF, RET, DNC, DSQ, OCS, BFD, DNE, NSC: No position-based adjustment (0)\n`;
    p += `- If scratch boat bonus is active, non-withdrawn letter scores still receive the +30 bonus\n`;
    p += `- WDN (withdrawn): receives 0 adjustment, even if scratch boat bonus is active\n`;
    p += `- RDGfix: treated as a normal finishing position for handicap calculation\n\n`;
    p += `### Last Place Rules\n`;
    p += `- Non-scratch boat finishing last: gets +30 bonus (if last place bonus is enabled for the event)\n`;
    p += `- Scratch boat finishing last: tracked for "streak" — 3 consecutive last-place finishes awards +30\n\n`;
    p += `### WORKED EXAMPLE INSTRUCTION\n`;
    p += `When explaining handicap calculations, you MUST show the worked calculation for EACH skipper using their actual data from the race results above. Format each as:\n`;
    p += `"[Skipper Name] (Sail [X]): finished [position] — [current_hcap] + ([position_adj]) + ([bonus]) = [new_hcap]"\n`;
    p += `For example: "John Smith (Sail 42): finished 2nd — 30 + (-20) + (0) = 10"\n`;
    p += `Always identify whether a scratch boat won the race first, as this determines if the +30 bonus applies.\n\n`;
  }

  // Add SHRS/HMS-specific scoring rules
  if (ctx.scoringSystem === 'shrs' || ctx.scoringSystem === 'hms') {
    p += `## ${ctx.scoringSystem === 'shrs' ? 'SHRS' : 'HMS'} Scoring Rules (Used by This Event)\n\n`;
    p += `### Scoring Method\n`;
    p += `- Points = finishing position within each heat (1st=1pt, 2nd=2pts, etc.)\n`;
    p += `- Low-point scoring: lowest total wins\n`;
    p += `- Penalty scores for non-finishers are based on the number of boats in the LARGEST heat (not total fleet)\n\n`;
    if (ctx.scoringSystem === 'shrs') {
      p += `### SHRS Discard Schedule\n`;
      p += `- Qualifying series: drop 1 after 4 races, drop 2 after 8, then +1 per 8 additional races\n`;
      p += `- Finals series: drop 1 if 4 or more finals races, otherwise 0 drops\n`;
      p += `- Discards are applied SEPARATELY to qualifying and finals\n\n`;
      p += `### SHRS Tie-Breaking (Rule 5.6) — CRITICAL\n`;
      p += `This is the EXACT tie-break procedure used by AlfiePRO for SHRS events:\n\n`;
      p += `**Step 1: Did the tied boats ever sail in the SAME heat?**\n`;
      p += `Look at the "Heats" data in each skipper's standings line. For each round/race, check if both skippers have the same heat letter.\n\n`;
      p += `**Step 2a: If they DID sail in the same heat (at least once):**\n`;
      p += `- Collect ONLY the race scores from rounds where both boats were in the SAME heat\n`;
      p += `- Compare using countback WITH NO DROPS (all same-heat scores count, even if normally discarded)\n`;
      p += `- Countback: sort scores best-to-worst, compare position by position, first difference wins\n`;
      p += `- If STILL tied after same-heat countback: fall back to surname alphabetical order, then first name, then sail number\n\n`;
      p += `**Step 2b: If they NEVER sailed in the same heat:**\n`;
      p += `- Use standard RRS A8.1 countback on ALL their race scores (with normal drops applied)\n`;
      p += `- Sort non-dropped scores best to worst, compare position by position\n`;
      p += `- If still tied: surname → first name → sail number\n\n`;
      p += `### WORKED TIE-BREAK INSTRUCTION\n`;
      p += `When explaining an SHRS tie-break, you MUST:\n`;
      p += `1. Find both skippers in the Standings data above\n`;
      p += `2. Show their ACTUAL race-by-race scores and heats from the data\n`;
      p += `3. Identify which rounds they were in the SAME heat (compare heat letters round by round)\n`;
      p += `4. List the same-heat scores for each skipper\n`;
      p += `5. Sort those scores best-to-worst and compare position by position\n`;
      p += `6. Show the EXACT point where the tie breaks\n`;
      p += `Example: "Round 3 — both in Heat B: Dave scored 3, Roger scored 5. Round 7 — both in Heat A: Dave scored 2, Roger scored 8..."\n`;
      p += `Then: "Same-heat scores sorted: Dave [2,3] vs Roger [5,8] → Dave wins at first comparison (2 vs 5)."\n\n`;
    }
  }

  // Scoring-specific instructions — CRITICAL DATA-DRIVEN RESPONSE RULES
  p += `## CRITICAL: How You MUST Answer Scoring Questions\n\n`;
  p += `### Golden Rule: ALWAYS use the actual race data above\n`;
  p += `You have the REAL scoring data for this event. NEVER give a generic or theoretical explanation. ALWAYS look up the specific skippers mentioned in the question, find their actual race-by-race scores in the Race Results and Standings sections above, and walk through the calculation using their real numbers.\n\n`;

  p += `### For tie-break questions:\n`;
  p += `IMPORTANT: Ties are determined by the FINAL column (net points after discards), NOT the Total column (gross points). Two skippers are only "tied" if their FINAL/net points are equal. If their FINAL points differ, there is no tie — the lower FINAL score wins.\n\n`;
  if (ctx.scoringSystem === 'shrs') {
    p += `**THIS IS AN SHRS EVENT — use SHRS Rule 5.6 tie-breaking (see above).**\n`;
    p += `1. Find both skippers in the Standings data above — copy their ACTUAL race scores and heat assignments\n`;
    p += `2. Confirm they have equal FINAL/net points (show the actual number). If their FINAL points differ, state clearly that there is NO tie and the lower score wins.\n`;
    p += `3. Compare their heat assignments round by round to find races where they were in the SAME heat\n`;
    p += `4. List the same-heat scores for each skipper (if any)\n`;
    p += `5. Compare same-heat scores using countback (sorted best-to-worst, NO drops)\n`;
    p += `6. Show the EXACT point where the scores differ and who wins\n`;
    p += `7. If no same-heat races exist, fall back to full RRS A8.1 countback with normal drops\n\n`;
  } else {
    p += `1. Find both skippers in the Standings data above\n`;
    p += `2. Confirm they have equal FINAL/net points (show the actual number). If their FINAL points differ, state clearly that there is NO tie.\n`;
    p += `3. List EACH skipper's race-by-race scores from the data, identifying which are dropped (in brackets)\n`;
    p += `4. Compare their non-dropped scores from best to worst, side by side\n`;
    p += `5. Show the EXACT point where the scores differ and who wins the tie-break\n\n`;
  }

  p += `### For "why is X in position Y" questions:\n`;
  p += `1. Find the skipper in the Standings data\n`;
  p += `2. Show their race-by-race scores, identifying drops (in brackets)\n`;
  p += `3. Show FINAL/net points (sum of non-dropped scores) — this determines their ranking position\n`;
  p += `4. Compare FINAL/net points with skippers above and below them in the standings\n`;
  p += `5. If tied on FINAL/net points, show the tie-break comparison\n\n`;

  p += `### For handicap questions:\n`;
  p += `- ALWAYS show the worked calculation for each skipper using the Handicap Calculation Rules and actual race data\n`;
  p += `- Use format: "[Name] ([Sail]): finished [pos] — [current_hcap] + ([adj]) + ([bonus]) = [new_hcap]"\n\n`;

  p += `### For HMS/SHRS questions:\n`;
  p += `- Reference the actual heat assignments and round results from the data above\n`;
  p += `- Explain how points are calculated within heats using the real positions\n`;
  p += `- For promotion/relegation questions, show which skippers moved between heats using the actual data\n\n`;

  p += `### For letter scores (DNS, DNF, DSQ, OCS, etc.):\n`;
  p += `- DNF/RET = number of finishers in that race + 1\n`;
  p += `- DNS/DNC/NSC/WDN = total competitors + 1\n`;
  p += `- DSQ/DNE = total competitors + 2\n`;
  p += `- OCS/BFD = total competitors + 1\n`;
  p += `- Show the actual point value calculated from the real fleet size\n\n`;

  p += `### For drop rule questions:\n`;
  p += `- Show which races are dropped (shown in brackets in standings) using the real data\n`;
  p += `- Explain how gross minus drops equals net\n`;
  p += `- Calculate using actual numbers\n\n`;

  p += `### ABSOLUTELY FORBIDDEN RESPONSES:\n`;
  p += `- NEVER use placeholder text like "[List of scores and heat assignments]" or "[Check each round]". You MUST write out the ACTUAL numbers from the Standings data above.\n`;
  p += `- NEVER say "Check each round for heat assignments and scores" — YOU must do the checking and show the results.\n`;
  p += `- NEVER tell the user to look something up themselves. YOU have the data — present it.\n`;
  p += `- NEVER just explain the rule and stop. You MUST then APPLY it to the specific data.\n`;
  p += `- NEVER say "you would compare their scores" — actually compare them using the real numbers.\n`;
  p += `- NEVER give a generic example when you have the real data available.\n`;
  p += `- NEVER leave out the step-by-step working. Show ALL the numbers.\n`;
  p += `- If you cannot find a skipper's data in the Standings above, say "I don't have data for that skipper" — do NOT use placeholders or make up numbers.\n`;
  p += `\nRemember: The Standings section above contains each skipper's race-by-race scores (in "Races:" field), dropped races (in brackets), and heat assignments (in "Heats:" field). Copy these actual values into your response.\n`;
  p += `--- END LIVE SCORING SESSION ---\n\n`;

  return p;
}

function buildSailingFlagIdentificationPrompt(): string {
  return `\n### SAILING FLAG IDENTIFICATION

If the image contains sailing flags or signal flags, identify them:

**Common racing signal flags:**
- **Flag P (Blue Peter)**: Preparatory signal (4 min before start)
- **Flag I**: Round-an-end rule in effect
- **Flag Z**: 20% penalty rule
- **Flag U**: UFD - boats in triangle OCS are disqualified
- **Flag Black**: Black flag rule - boats in triangle are DSQ for entire series
- **Code Flag AP**: Postponement
- **Code Flag N**: Abandonment
- **Code Flag S**: Shortened course
- **Code Flag L**: Come within hail or follow me
- **Numeral Pennants 1-9**: Class flags, course designators
- **Code Flag X**: Individual recall (with one sound signal)
- **First Substitute**: General recall (with two sound signals)

If you see flags in a photo, identify each flag and explain what it signals in a racing context.
`;
}
