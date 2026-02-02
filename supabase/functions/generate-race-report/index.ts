/*
  # Generate Race Report Edge Function

  This function uses OpenAI to generate a race report based on race results and additional context.
  It accepts race results, event data, and additional context like weather conditions and highlights.
*/

import { createClient } from 'npm:@supabase/supabase-js@2'
import OpenAI from 'npm:openai@4.28.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-client-info, apikey'
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    })
  }

  try {
    // Check if OpenAI API key is configured
    const openaiApiKey = Deno.env.get('OPENAI_API_KEY')
    if (!openaiApiKey) {
      console.error('OPENAI_API_KEY environment variable is not set')
      return new Response(
        JSON.stringify({ 
          error: 'OpenAI API key not configured. Please contact your administrator to set up the OPENAI_API_KEY environment variable in Supabase Edge Functions settings.',
          code: 'MISSING_API_KEY'
        }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 500,
        }
      )
    }

    // Create a Supabase client with the Auth context of the logged in user
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    )

    // Get the current user
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

    // Get the request body
    const { 
      eventData, 
      raceResults, 
      skippers, 
      weatherConditions, 
      keyHighlights, 
      peopleToCongratulate 
    } = await req.json()

    if (!eventData || !raceResults || !skippers) {
      return new Response(
        JSON.stringify({ error: 'Missing required parameters: eventData, raceResults, and skippers are required' }),
        {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400,
        }
      )
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey: openaiApiKey,
    })

    // Prepare race results data for the prompt
    const resultsData = raceResults.map((result: any) => {
      const skipper = skippers[result.skipperIndex]
      return {
        position: result.position,
        skipperName: skipper?.name || 'Unknown',
        sailNo: skipper?.sailNo || 'Unknown',
        letterScore: result.letterScore,
        club: skipper?.club || 'Unknown',
        hull: skipper?.hull || 'Unknown',
      }
    }).sort((a: any, b: any) => {
      // Sort by position (null positions or letter scores go to the end)
      if (a.position === null && b.position === null) return 0
      if (a.position === null) return 1
      if (b.position === null) return -1
      return a.position - b.position
    })

    // Create a prompt for OpenAI with the new rules
    const prompt = `
# EVENT DETAILS
- Event Name: ${eventData.title}
- Date: ${eventData.date}
- Venue: ${eventData.venue}
- Club: ${eventData.clubName || 'Not specified'}
- Boat Class: ${eventData.raceClass}
- Race Format: ${eventData.raceFormat}

IMPORTANT: Use the EXACT venue name provided above ("${eventData.venue}") when writing the report. Do NOT substitute or assume a different location name.

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
You are an experienced and respected radio-controlled (RC) sailing Race Officer, tasked with overseeing events, scoring races, and writing professional race summaries. You are deeply familiar with sailing terminology, event structure, class distinctions (e.g. 10R, IOM, A-Class), and the nuances of both scratch and handicap formats.

# TONE & STYLE
- Write in a casual, conversational tone like you're chatting with club members at the lake.
- Keep it simple and straightforward — avoid flowery or dramatic language.
- AVOID words like: thrilling, climax, shimmering, tactical brilliance, undisputed, exemplified, invaluable, testament, unparalleled, strategic acumen, sun-drenched, dynamic nature, competitive spirit.
- Use natural sailing language where appropriate (e.g. "bullet" for race win, "shifty conditions", "got a win").
- Keep sentences short and direct — no long, complex sentences.
- Use full names on first reference (e.g. Stephen Walsh), then surnames after.
- Write like a club member would talk, not like a sports commentator or novelist.

# STRUCTURE & CONTENT PRIORITY
Include in this general order:
1. Event Summary
   - Location and club (e.g. "Cockle Creek, Teralba").
   - Race series context (e.g. "Round 1 of the 10R Handicap Pointscore").
   - Weather and wind overview, including direction, strength, and variability.
   - Setup or launch notes if relevant (e.g. "Thanks to Greg for rescue boat duty").
2. Race Highlights & Performance
   - Who won overall and how (mention consistency, comeback, key races, etc.).
   - Podium placements and notable performances across the fleet.
   - Name skippers and occasionally reference boat designs if appropriate.
   - Highlight individual race wins (bullets) or key tactical moves.
   - Mention comebacks, mechanical issues, or learning moments if appropriate.
3. Human Elements
   - Any good spirit, camaraderie, club effort, or notable events (e.g. someone returning to the fleet, helping out, new boats on the water).
4. Closing Note
   - Short positive sign-off with thanks or encouragement (e.g. "Great start to the season", "Well done to all skippers", etc.).

# EXAMPLES OF GOOD LANGUAGE (casual and natural)
- "Phil Page had a solid day, staying in the top spots most races."
- "The wind was shifty — sometimes the left side paid off, sometimes it didn't."
- "Good to see Nathan back on the water, he had some good pace in the last few races."
- "Ian Craig got a bullet in Race 9 which was well earned."
- "Stephen Walsh was consistent all day, picking up a bunch of second places."
- "The northwest wind kept everyone on their toes with the shifts."

# DO NOT INCLUDE
- Pirate/nautical language or dad jokes
- Speculation about how someone felt
- Overly technical rule interpretations — focus on race summary, not rule disputes
- Repetition of generic praise ("everyone tried hard" — keep it specific)

Please write a 2-3 paragraph race report following these guidelines.
`

    // Call OpenAI API with error handling
    let completion
    try {
      completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [
          { role: "system", content: "You are a club member writing a simple, casual race report for your fellow sailors. Keep it natural and conversational, like you're chatting at the lake. Avoid flowery or dramatic language." },
          { role: "user", content: prompt }
        ],
        temperature: 0.7,
        max_tokens: 1000,
      })
    } catch (openaiError: any) {
      console.error('OpenAI API error:', openaiError)
      
      // Handle specific OpenAI errors
      if (openaiError.status === 401) {
        return new Response(
          JSON.stringify({ 
            error: 'Invalid OpenAI API key. Please contact your administrator to update the API key.',
            code: 'INVALID_API_KEY'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 500,
          }
        )
      } else if (openaiError.status === 429) {
        return new Response(
          JSON.stringify({ 
            error: 'OpenAI API rate limit exceeded. Please try again later.',
            code: 'RATE_LIMIT'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 429,
          }
        )
      } else {
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
    }

    // Extract the generated text
    const generatedReport = completion.choices[0]?.message?.content || 'Failed to generate report'

    // Return the generated report
    return new Response(
      JSON.stringify({ report: generatedReport }),
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