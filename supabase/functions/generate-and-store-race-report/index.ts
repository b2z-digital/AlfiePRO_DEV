/*
  # Generate and Store Race Report Edge Function

  This function generates a race report using OpenAI and stores it in the database.
  It accepts race results, event data, and additional context.
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4.28.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey'
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    })
  }

  try {
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY environment variable is not set')
      return new Response(
        JSON.stringify({
          error: 'OpenAI API key not configured.',
          code: 'MISSING_API_KEY'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    const {
      data: { user },
    } = await supabaseClient.auth.getUser()

    if (!user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 401,
        }
      )
    }

    const {
      eventId,
      eventType,
      clubId,
      eventData,
      raceResults,
      skippers,
      weatherConditions,
      keyHighlights,
      peopleToCongratulate,
      isPublished = false
    } = await req.json()

    if (!eventId || !eventType || !clubId || !eventData || !raceResults || !skippers) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    const resultsData = raceResults.map((result: any) => {
      // Handle both array-indexed and object-based skipper lookup
      const skipper = typeof result.skipperIndex === 'number'
        ? skippers[result.skipperIndex]
        : skippers.find((s: any) => s.id === result.skipperId || s.sailNo === result.sailNo)

      return {
        position: result.position,
        skipperName: skipper?.name || result.skipperName || 'Unknown',
        sailNo: skipper?.sailNo || result.sailNo || 'Unknown',
        letterScore: result.letterScore,
        club: skipper?.club || result.club || 'Unknown',
        hull: skipper?.hull || result.hull || 'Unknown',
      }
    }).sort((a: any, b: any) => {
      if (a.position === null && b.position === null) return 0
      if (a.position === null) return 1
      if (b.position === null) return -1
      return a.position - b.position
    })

    const prompt = `
# EVENT DETAILS
- Event Name: ${eventData.title}
- Date: ${eventData.date}
- Venue: ${eventData.venue}
- Boat Class: ${eventData.raceClass}
- Race Format: ${eventData.raceFormat}

# RACE RESULTS
${resultsData.map((r: any) =>
  `${r.position || 'DNF'}: ${r.skipperName} (${r.sailNo})${r.letterScore ? ` - ${r.letterScore}` : ''} - ${r.club} - ${r.hull}`
).join('\n')}

# WEATHER CONDITIONS
${weatherConditions || 'Not specified'}

# KEY HIGHLIGHTS
${keyHighlights || 'Not specified'}

# PEOPLE TO CONGRATULATE
${peopleToCongratulate || 'Not specified'}

# ROLE & PERSPECTIVE
You are an experienced and respected radio-controlled (RC) sailing Race Officer, tasked with writing professional race reports. You are deeply familiar with sailing terminology, event structure, class distinctions, and the nuances of both scratch and handicap formats.

# TONE & STYLE
- Write in a confident but humble tone — knowledgeable, observational, and friendly.
- Use authentic sailing language where appropriate (e.g. "bullet" for race win, "shifty conditions", "clean start", "overtook at the top mark").
- Avoid nautical clichés or novelty language.
- Strike a balance between informative and entertaining.
- Use full names on first reference, then surnames or first names sparingly after.

# STRUCTURE & CONTENT
Include in this order:
1. Event Summary
   - Location and club
   - Race series context
   - Weather and wind overview
   - Setup or launch notes if relevant

2. Race Highlights & Performance
   - Who won overall and how
   - Podium placements and notable performances
   - Name skippers and reference boat designs if appropriate
   - Highlight individual race wins or key tactical moves
   - Mention comebacks, mechanical issues, or learning moments

3. Human Elements
   - Good spirit, camaraderie, club effort, or notable events

4. Closing Note
   - Short positive sign-off with thanks or encouragement

Please write a comprehensive 3-5 paragraph race report following these guidelines.
`

    let completion
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are an expert sailing journalist who writes engaging race reports for radio-controlled yacht racing events." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1500,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      return new Response(
        JSON.stringify({
          error: `OpenAI API error: ${openaiError.message || 'Unknown error'}`,
          code: 'OPENAI_ERROR'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    const generatedReport = completion.choices[0]?.message?.content || 'Failed to generate report'

    // Check if a report already exists for this event
    const { data: existingReport } = await supabaseClient
      .from('race_reports')
      .select('id')
      .eq('event_id', eventId)
      .eq('event_type', eventType)
      .maybeSingle()

    let reportData
    if (existingReport) {
      // Update existing report
      const { data, error } = await supabaseClient
        .from('race_reports')
        .update({
          report_content: generatedReport,
          event_data: eventData,
          weather_conditions: weatherConditions,
          key_highlights: keyHighlights,
          people_to_congratulate: peopleToCongratulate,
          is_published: isPublished,
          updated_at: new Date().toISOString()
        })
        .eq('id', existingReport.id)
        .select()
        .single()

      if (error) throw error
      reportData = data
    } else {
      // Create new report
      const { data, error } = await supabaseClient
        .from('race_reports')
        .insert({
          event_id: eventId,
          event_type: eventType,
          club_id: clubId,
          report_content: generatedReport,
          event_data: eventData,
          weather_conditions: weatherConditions,
          key_highlights: keyHighlights,
          people_to_congratulate: peopleToCongratulate,
          is_published: isPublished,
          generated_by: user.id
        })
        .select()
        .single()

      if (error) throw error
      reportData = data
    }

    return new Response(
      JSON.stringify({
        report: generatedReport,
        reportData: reportData
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    )
  } catch (error: any) {
    console.error('Error generating race report:', error)

    return new Response(
      JSON.stringify({
        error: error.message || 'Failed to generate race report',
        details: error.toString(),
        code: 'GENERAL_ERROR'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    )
  }
})
