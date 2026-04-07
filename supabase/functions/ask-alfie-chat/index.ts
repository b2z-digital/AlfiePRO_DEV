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

    let systemPrompt = buildSystemPrompt(aiInstructions, relevantFaqs, corrections, knowledgeChunks, firstName);

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
  relevantFaqs: FaqMatch[],
  corrections: Array<{ scenario: string; correct_information: string; topic: string }>,
  knowledgeChunks: Array<{ content: string; source_name: string }>,
  firstName: string
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
