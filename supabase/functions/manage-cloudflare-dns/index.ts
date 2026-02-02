import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface CloudflareConfig {
  zone_id: string;
  api_token: string;
  base_domain: string;
}

interface DNSRecordRequest {
  action: 'create' | 'delete' | 'verify' | 'list';
  record_type: 'club_website' | 'event_website';
  entity_id: string;
  subdomain?: string;
  custom_domain?: string;
  dns_record_id?: string;
}

const CLOUDFLARE_ZONE_ID = '24a931869593b5979f71b71b58782faf';
const CLOUDFLARE_API_TOKEN = 'VePIZnC5YLpDMa6TxkYSSzw1gX-wgKe0cgwOKOa_';
const BASE_DOMAIN = 'alfiepro.com.au';
const CLOUDFRONT_TARGET = 'd205ctqm5i025u.cloudfront.net';

Deno.serve(async (req: Request) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 200,
        headers: corsHeaders,
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const requestData: DNSRecordRequest = await req.json();
    const { action, record_type, entity_id, subdomain, custom_domain, dns_record_id } = requestData;

    console.log('Received request:', { action, record_type, entity_id, subdomain, custom_domain });

    const cloudflareConfig: CloudflareConfig = {
      zone_id: CLOUDFLARE_ZONE_ID,
      api_token: CLOUDFLARE_API_TOKEN,
      base_domain: BASE_DOMAIN
    };

    let result;
    switch (action) {
      case 'create':
        result = await createDNSRecord(supabase, cloudflareConfig, {
          record_type,
          entity_id,
          subdomain: subdomain || '',
          custom_domain,
          user_id: user.id
        });
        break;

      case 'delete':
        result = await deleteDNSRecord(supabase, cloudflareConfig, dns_record_id || '', entity_id);
        break;

      case 'verify':
        result = await verifyDNSRecord(supabase, cloudflareConfig, entity_id, subdomain || '');
        break;

      case 'list':
        result = await listDNSRecords(supabase, entity_id, record_type);
        break;

      default:
        throw new Error(`Invalid action: ${action}`);
    }

    return new Response(
      JSON.stringify({ success: true, data: result }),
      {
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Error in manage-cloudflare-dns:', error);
    console.error('Error stack:', error.stack);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || 'Unknown error occurred',
        details: error.stack
      }),
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

async function createDNSRecord(
  supabase: any,
  config: CloudflareConfig,
  params: {
    record_type: string;
    entity_id: string;
    subdomain: string;
    custom_domain?: string;
    user_id: string;
  }
) {
  const { record_type, entity_id, subdomain, custom_domain, user_id } = params;

  if (!custom_domain && !subdomain) {
    throw new Error('Either subdomain or custom_domain is required');
  }

  const full_domain = custom_domain || `${subdomain}.${config.base_domain}`;

  const { data: existingRecord } = await supabase
    .from('dns_records')
    .select('*')
    .eq('entity_id', entity_id)
    .eq('record_type', record_type)
    .maybeSingle();

  if (existingRecord && existingRecord.status === 'active') {
    return { message: 'DNS record already exists', record: existingRecord };
  }

  if (custom_domain) {
    return await handleCustomFullDomain(supabase, {
      domain_name: custom_domain,
      entity_id,
      record_type,
      user_id,
    });
  }

  let cloudflareRecordId = null;

  if (!custom_domain) {
    try {
      console.log('Creating Cloudflare DNS record:', { subdomain, target: CLOUDFRONT_TARGET });

      const cloudflareResponse = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${config.zone_id}/dns_records`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.api_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            type: 'CNAME',
            name: subdomain,
            content: CLOUDFRONT_TARGET,
            ttl: 1,
            proxied: true,
          }),
        }
      );

      const result = await cloudflareResponse.json();

      if (!result.success) {
        console.error('Cloudflare API error:', JSON.stringify(result, null, 2));
        const errorMsg = result.errors?.[0]?.message || 'Failed to create DNS record in Cloudflare';
        const errorCode = result.errors?.[0]?.code || 'UNKNOWN';

        if (errorMsg.includes('already exists')) {
          console.log('DNS record already exists, fetching existing record...');

          const listResponse = await fetch(
            `https://api.cloudflare.com/client/v4/zones/${config.zone_id}/dns_records?name=${subdomain}.${config.base_domain}`,
            {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${config.api_token}`,
                'Content-Type': 'application/json',
              },
            }
          );

          const listResult = await listResponse.json();
          if (listResult.success && listResult.result.length > 0) {
            cloudflareRecordId = listResult.result[0].id;
            console.log('Found existing DNS record:', cloudflareRecordId);
          } else {
            throw new Error(`DNS record exists but could not be retrieved`);
          }
        } else if (errorCode === 9109 || errorMsg.includes('not found')) {
          throw new Error(`Zone not found. DNS nameservers may not have propagated yet. Please wait 24-48 hours after updating nameservers at your registrar.`);
        } else if (errorCode === 10000 || errorMsg.includes('Authentication')) {
          throw new Error(`Authentication failed. Please check your Cloudflare API token permissions.`);
        } else {
          throw new Error(`Cloudflare error (${errorCode}): ${errorMsg}`);
        }
      } else {
        cloudflareRecordId = result.result.id;
        console.log('Successfully created DNS record:', cloudflareRecordId);
      }
    } catch (error) {
      console.error('Cloudflare API error:', error);

      if (error.message) {
        throw error;
      }
      
      const { data: dnsRecord } = await supabase
        .from('dns_records')
        .insert([{
          record_type,
          entity_id,
          subdomain,
          full_domain,
          dns_type: 'CNAME',
          dns_target: CLOUDFRONT_TARGET,
          status: 'failed',
          error_message: error.message,
          created_by: user_id
        }])
        .select()
        .single();

      return { message: 'Failed to create DNS record', error: error.message, record: dnsRecord };
    }
  }

  const { data: dnsRecord, error: dbError } = await supabase
    .from('dns_records')
    .upsert([{
      record_type,
      entity_id,
      subdomain: subdomain,
      full_domain,
      cloudflare_record_id: cloudflareRecordId,
      dns_type: 'CNAME',
      dns_target: CLOUDFRONT_TARGET,
      status: 'active',
      verified_at: new Date().toISOString(),
      ssl_status: 'active',
      ssl_verified_at: new Date().toISOString(),
      created_by: user_id
    }], {
      onConflict: 'entity_id,record_type'
    })
    .select()
    .single();

  if (dbError) {
    console.error('Database error:', dbError);
    console.error('Database error details:', JSON.stringify(dbError, null, 2));
    throw new Error(`Failed to save DNS record to database: ${dbError.message || JSON.stringify(dbError)}`);
  }

  const table = record_type === 'club_website' ? 'clubs' : 'event_websites';
  await supabase
    .from(table)
    .update({
      subdomain_slug: subdomain,
      domain_status: 'active',
      dns_verified_at: new Date().toISOString(),
      website_published: true
    })
    .eq('id', entity_id);

  return {
    message: 'DNS record created successfully',
    record: dnsRecord
  };
}

async function deleteDNSRecord(
  supabase: any,
  config: CloudflareConfig,
  recordId: string,
  entityId: string
) {
  const { data: dnsRecord, error: fetchError } = await supabase
    .from('dns_records')
    .select('*')
    .eq('id', recordId)
    .single();

  if (fetchError || !dnsRecord) {
    throw new Error('DNS record not found');
  }

  if (dnsRecord.cloudflare_record_id) {
    try {
      const response = await fetch(
        `https://api.cloudflare.com/client/v4/zones/${config.zone_id}/dns_records/${dnsRecord.cloudflare_record_id}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${config.api_token}`,
          },
        }
      );
      
      const result = await response.json();
      if (!result.success) {
        console.error('Failed to delete from Cloudflare:', result);
      }
    } catch (error) {
      console.error('Failed to delete from Cloudflare:', error);
    }
  }

  await supabase
    .from('dns_records')
    .delete()
    .eq('id', recordId);

  const table = dnsRecord.record_type === 'club_website' ? 'clubs' : 'event_websites';
  await supabase
    .from(table)
    .update({
      subdomain_slug: null,
      custom_domain: null,
      domain_status: 'pending',
      dns_verified_at: null,
      website_published: false
    })
    .eq('id', entityId);

  return { message: 'DNS record deleted successfully' };
}

async function verifyDNSRecord(
  supabase: any,
  config: CloudflareConfig,
  entityId: string,
  subdomain: string
) {
  const full_domain = `${subdomain}.${config.base_domain}`;
  
  try {
    const response = await fetch(`https://${full_domain}`, {
      method: 'HEAD',
      redirect: 'manual'
    });
    
    const verified = response.status < 500;
    
    if (verified) {
      await supabase
        .from('dns_records')
        .update({
          status: 'active',
          verified_at: new Date().toISOString()
        })
        .eq('entity_id', entityId);

      return { verified: true, message: 'Domain verified successfully' };
    }
    
    return { verified: false, message: 'Domain not yet accessible' };
  } catch (error) {
    return { verified: false, message: 'Domain verification pending', error: error.message };
  }
}

async function listDNSRecords(supabase: any, entityId: string, recordType: string) {
  const { data, error } = await supabase
    .from('dns_records')
    .select('*')
    .eq('entity_id', entityId)
    .eq('record_type', recordType);

  if (error) {
    throw new Error('Failed to fetch DNS records');
  }

  return data;
}

async function handleCustomFullDomain(
  supabase: any,
  params: {
    domain_name: string;
    entity_id: string;
    record_type: string;
    user_id: string;
  }
) {
  const { domain_name, entity_id, record_type, user_id } = params;

  console.log('Handling custom full domain via AWS Amplify:', domain_name);

  try {
    const amplifyApiUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/manage-aws-amplify`;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const response = await fetch(amplifyApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${serviceRoleKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'add_domain',
        domain_name,
        entity_id,
        record_type,
      }),
    });

    if (!response.ok) {
      throw new Error(`AWS Amplify API error: ${response.status}`);
    }

    const result = await response.json();

    if (!result.success) {
      throw new Error(result.error || 'Failed to add domain to AWS Amplify');
    }

    const amplifyDomain = result.data.domain;

    const { data: dnsRecord, error: dbError } = await supabase
      .from('dns_records')
      .upsert([{
        record_type,
        entity_id,
        subdomain: domain_name,
        full_domain: domain_name,
        cloudflare_record_id: null,
        dns_type: 'CNAME',
        dns_target: CLOUDFRONT_TARGET,
        status: 'pending',
        verified_at: null,
        ssl_status: 'pending',
        is_custom_full_domain: true,
        amplify_domain_id: amplifyDomain.id,
        created_by: user_id
      }], {
        onConflict: 'entity_id,record_type'
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to save DNS record to database');
    }

    const table = record_type === 'club_website' ? 'clubs' : 'event_websites';
    await supabase
      .from(table)
      .update({
        custom_domain: domain_name,
        domain_status: 'custom',
        website_published: true
      })
      .eq('id', entity_id);

    return {
      message: 'Custom domain added to AWS Amplify. SSL certificate provisioning has started.',
      record: dnsRecord,
      amplify_domain: amplifyDomain,
      dns_verification: result.data.dns_verification,
      instructions: result.data.instructions
    };
  } catch (error) {
    console.error('Error handling custom domain:', error);

    const { data: dnsRecord } = await supabase
      .from('dns_records')
      .insert([{
        record_type,
        entity_id,
        subdomain: domain_name,
        full_domain: domain_name,
        dns_type: 'CNAME',
        dns_target: CLOUDFRONT_TARGET,
        status: 'failed',
        error_message: error.message,
        is_custom_full_domain: true,
        created_by: user_id
      }])
      .select()
      .single();

    throw new Error(`Failed to configure custom domain: ${error.message}`);
  }
}