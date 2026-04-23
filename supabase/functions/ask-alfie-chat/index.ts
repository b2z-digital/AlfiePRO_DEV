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

interface RequestPayload {
  message: string;
  conversationHistory?: ChatMessage[];
  clubId?: string;
  source?: string;
  image_url?: string;
  course_mode?: boolean;
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
        match_count: 5,
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

    let systemPrompt = buildSystemPrompt(
      aiInstructions,
      relevantFaqs,
      corrections,
      knowledgeChunks,
      firstName,
      hasImage,
      course_mode || false
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

    // Use gpt-4o for image analysis, gpt-4o-mini for text-only
    const model = hasImage ? "gpt-4o" : "gpt-4o-mini";
    const temperature = hasImage ? 0.3 : 0.7;
    const maxTokens = hasImage ? 2500 : 1500;

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
    const inputRate = hasImage ? 0.0025 / 1000 : 0.00015 / 1000;
    const outputRate = hasImage ? 0.01 / 1000 : 0.0006 / 1000;
    const inputCost = (usage.prompt_tokens || 0) * inputRate;
    const outputCost = (usage.completion_tokens || 0) * outputRate;

    supabaseAdmin
      .from("askalfie_usage_logs")
      .insert({
        user_id: user.id,
        club_id: clubId || null,
        session_id: crypto.randomUUID(),
        question_preview: message.substring(0, 200),
        category: hasImage ? (course_mode ? "course_analysis" : "race_scenario") : "platform_help",
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
  knowledgeChunks: Array<{ content: string; source_name: string }>,
  firstName: string,
  hasImage: boolean,
  courseMode: boolean
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
    prompt += "\nRelevant knowledge from uploaded documents:\n";
    for (const chunk of knowledgeChunks) {
      prompt += `[${chunk.source_name}]: ${chunk.content.substring(0, 400)}\n\n`;
    }
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
