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
    const { message, conversationHistory = [], clubId, source = "web_platform" } = payload;

    if (!message || !message.trim()) {
      return new Response(
        JSON.stringify({ error: "Message is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const startTime = Date.now();

    const [
      aiInstructionsResult,
      faqResult,
      correctionsResult,
      knowledgeResult,
    ] = await Promise.all([
      supabaseAdmin
        .from("alfie_ai_instructions")
        .select("category, instruction_text, priority")
        .eq("is_active", true)
        .order("priority", { ascending: false }),
      supabaseAdmin
        .from("support_faqs")
        .select("question, answer")
        .eq("is_published", true)
        .limit(50),
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
    const faqs = faqResult.data || [];
    const corrections = correctionsResult.data || [];
    const knowledgeChunks = knowledgeResult.data || [];

    let systemPrompt = buildSystemPrompt(aiInstructions, faqs, corrections, knowledgeChunks);

    const { data: profileData } = await supabaseAdmin
      .from("profiles")
      .select("full_name, first_name")
      .eq("id", user.id)
      .maybeSingle();

    const userName = profileData?.full_name || profileData?.first_name || "there";

    const messages = [
      { role: "system", content: systemPrompt },
      ...conversationHistory.slice(-10).map((msg: ChatMessage) => ({
        role: msg.role,
        content: msg.content,
      })),
      { role: "user", content: message },
    ];

    const openaiResponse = await fetch(
      "https://api.openai.com/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${openaiApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          messages,
          max_tokens: 1500,
          temperature: 0.7,
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

    const inputCost = (usage.prompt_tokens || 0) * (0.00015 / 1000);
    const outputCost = (usage.completion_tokens || 0) * (0.0006 / 1000);

    supabaseAdmin
      .from("askalfie_usage_logs")
      .insert({
        user_id: user.id,
        club_id: clubId || null,
        session_id: crypto.randomUUID(),
        question_preview: message.substring(0, 200),
        category: "platform_help",
        model_id: "gpt-4o-mini",
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
  faqs: Array<{ question: string; answer: string }>,
  corrections: Array<{ scenario: string; correct_information: string; topic: string }>,
  knowledgeChunks: Array<{ content: string; source_name: string }>
): string {
  let prompt = `You are Alfie, the AI assistant for AlfiePRO - a comprehensive yacht racing club management platform. You help club administrators and editors use the platform effectively.

Your personality:
- Friendly and approachable Australian sailing assistant
- Use "G'day" occasionally but don't overdo the slang
- Be concise and helpful - get straight to the answer
- Use step-by-step instructions when explaining how to do things
- Reference specific menu paths and button names in the platform
- If you don't know something specific, suggest checking the Help & Support section or contacting support

Key platform areas you help with:
- Race Management (creating events, series, scoring, results, HMS heat racing, touch mode)
- Membership Management (adding members, applications, renewals, fees, remittances)
- Club Settings & Website (setup, branding, domain, pages)
- Communications (conversations, marketing campaigns, notifications)
- Finances (transactions, invoices, budgets, Stripe integration)
- Events (event websites, registrations, command center)
- Media & News (articles, AlfieTV, media library)
- Meetings (scheduling, agendas, minutes, attendance)
- Tasks (assignment, tracking, comments)
- Live Tracking (real-time race tracking)
- Livestreaming (setting up streams for events)
- Venues (managing race venues)
- Yacht Classes (boat class management)
- Documents (NOR generation, race documents)
- Community & Social features
- Classifieds marketplace

Navigation guide for AlfiePRO platform:
- Left sidebar contains all main navigation sections
- "Race Management" section includes race events, series, scoring
- "Membership" section handles member management, applications, fees
- "Settings" cog at bottom of sidebar for club/profile settings
- "Support" in sidebar links to Help & Support resources
`;

  if (aiInstructions.length > 0) {
    prompt += "\n\nAdditional AI behavioral instructions:\n";
    for (const inst of aiInstructions) {
      prompt += `[${inst.category}]: ${inst.instruction_text}\n`;
    }
  }

  if (corrections.length > 0) {
    prompt += "\n\nKnowledge corrections (use these to avoid past mistakes):\n";
    for (const corr of corrections.slice(0, 10)) {
      prompt += `- Topic: ${corr.topic} | Scenario: ${corr.scenario} | Correct info: ${corr.correct_information}\n`;
    }
  }

  if (faqs.length > 0) {
    prompt += "\n\nPlatform FAQ knowledge (reference these when answering platform questions):\n";
    for (const faq of faqs) {
      prompt += `Q: ${faq.question}\nA: ${faq.answer.substring(0, 500)}\n\n`;
    }
  }

  if (knowledgeChunks.length > 0) {
    prompt += "\n\nRelevant knowledge from documents:\n";
    for (const chunk of knowledgeChunks) {
      prompt += `[${chunk.source_name}]: ${chunk.content.substring(0, 400)}\n\n`;
    }
  }

  return prompt;
}
