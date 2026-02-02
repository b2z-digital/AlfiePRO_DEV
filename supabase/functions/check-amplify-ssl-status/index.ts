import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log('Checking AWS Amplify SSL status for pending domains...');

    const { data: pendingDomains, error: fetchError } = await supabase
      .from('amplify_custom_domains')
      .select('*')
      .in('domain_status', ['pending', 'in_progress', 'updating'])
      .or('certificate_status.in.(pending,in_progress)');

    if (fetchError) {
      throw new Error(`Failed to fetch pending domains: ${fetchError.message}`);
    }

    if (!pendingDomains || pendingDomains.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No pending domains to check', checked: 0 }),
        {
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    console.log(`Found ${pendingDomains.length} domains to check`);

    const results = [];

    for (const domain of pendingDomains) {
      try {
        const amplifyApiUrl = `${supabaseUrl}/functions/v1/manage-aws-amplify`;

        const response = await fetch(amplifyApiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            action: 'check_status',
            amplify_domain_id: domain.id,
          }),
        });

        if (!response.ok) {
          console.error(`Failed to check domain ${domain.domain_name}:`, response.status);
          continue;
        }

        const result = await response.json();

        if (result.success && result.data) {
          const statusData = result.data;

          if (statusData.is_ready) {
            await supabase
              .from('dns_records')
              .update({
                status: 'active',
                ssl_status: 'active',
                verified_at: new Date().toISOString(),
                ssl_verified_at: new Date().toISOString(),
              })
              .eq('amplify_domain_id', domain.id);

            const table = domain.record_type === 'club_website' ? 'clubs' : 'event_websites';
            await supabase
              .from(table)
              .update({
                domain_status: 'active',
                dns_verified_at: new Date().toISOString(),
              })
              .eq('id', domain.entity_id);

            results.push({
              domain: domain.domain_name,
              status: 'ready',
              message: 'Domain is now live with SSL'
            });
          } else {
            results.push({
              domain: domain.domain_name,
              status: 'pending',
              domain_status: statusData.domain_status,
              certificate_status: statusData.certificate_status
            });
          }
        }
      } catch (error) {
        console.error(`Error checking domain ${domain.domain_name}:`, error);
        results.push({
          domain: domain.domain_name,
          status: 'error',
          error: error.message
        });
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        checked: pendingDomains.length,
        results
      }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in check-amplify-ssl-status:', error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 400,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
