import { createClient } from "npm:@supabase/supabase-js@2";
import { createHmac } from "node:crypto";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface AmplifyRequest {
  action: 'add_domain' | 'check_status' | 'delete_domain' | 'list_domains';
  domain_name?: string;
  entity_id?: string;
  record_type?: 'club_website' | 'event_website';
  amplify_domain_id?: string;
}

const AWS_REGION = 'ap-southeast-2';
const AMPLIFY_APP_ID = 'd13roi0uyfa9j';

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

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      throw new Error("Missing authorization header");
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);

    if (userError || !user) {
      throw new Error("Unauthorized");
    }

    const awsAccessKeyId = Deno.env.get("AWS_ACCESS_KEY_ID");
    const awsSecretAccessKey = Deno.env.get("AWS_SECRET_ACCESS_KEY");

    if (!awsAccessKeyId || !awsSecretAccessKey) {
      throw new Error("AWS credentials not configured");
    }

    const requestData: AmplifyRequest = await req.json();
    const { action } = requestData;

    console.log('Received AWS Amplify request:', { action, ...requestData });

    let result;
    switch (action) {
      case 'add_domain':
        result = await addCustomDomain(supabase, {
          domain_name: requestData.domain_name!,
          entity_id: requestData.entity_id!,
          record_type: requestData.record_type!,
          user_id: user.id,
          aws_access_key_id: awsAccessKeyId,
          aws_secret_access_key: awsSecretAccessKey,
        });
        break;

      case 'check_status':
        result = await checkDomainStatus(supabase, {
          amplify_domain_id: requestData.amplify_domain_id!,
          aws_access_key_id: awsAccessKeyId,
          aws_secret_access_key: awsSecretAccessKey,
        });
        break;

      case 'delete_domain':
        result = await deleteCustomDomain(supabase, {
          amplify_domain_id: requestData.amplify_domain_id!,
          aws_access_key_id: awsAccessKeyId,
          aws_secret_access_key: awsSecretAccessKey,
        });
        break;

      case 'list_domains':
        result = await listCustomDomains(supabase, {
          entity_id: requestData.entity_id!,
          record_type: requestData.record_type!,
        });
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
    console.error('Error in manage-aws-amplify:', error);
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

async function addCustomDomain(
  supabase: any,
  params: {
    domain_name: string;
    entity_id: string;
    record_type: string;
    user_id: string;
    aws_access_key_id: string;
    aws_secret_access_key: string;
  }
) {
  const { domain_name, entity_id, record_type, user_id, aws_access_key_id, aws_secret_access_key } = params;

  const { data: existingDomain } = await supabase
    .from('amplify_custom_domains')
    .select('*')
    .eq('domain_name', domain_name)
    .maybeSingle();

  if (existingDomain) {
    return { message: 'Domain already exists in AWS Amplify', domain: existingDomain };
  }

  try {
    console.log('Creating custom domain in AWS Amplify:', domain_name);

    const domainConfig = {
      domainName: domain_name,
      enableAutoSubDomain: false,
      subDomainSettings: [
        {
          prefix: '',
          branchName: 'main'
        }
      ]
    };

    const response = await awsAmplifyRequest({
      method: 'POST',
      path: `/apps/${AMPLIFY_APP_ID}/domains`,
      body: domainConfig,
      aws_access_key_id,
      aws_secret_access_key,
    });

    console.log('AWS Amplify response:', response);

    const { data: amplifyDomain, error: dbError } = await supabase
      .from('amplify_custom_domains')
      .insert([{
        record_type,
        entity_id,
        domain_name,
        amplify_domain_association_arn: response.domainAssociation?.domainAssociationArn,
        domain_status: response.domainAssociation?.domainStatus || 'pending',
        certificate_status: response.domainAssociation?.certificateVerificationDNSRecord ? 'pending' : 'pending',
        certificate_verification_dns_record: response.domainAssociation?.certificateVerificationDNSRecord || null,
        domain_verification_status: 'pending',
        created_by: user_id
      }])
      .select()
      .single();

    if (dbError) {
      console.error('Database error:', dbError);
      throw new Error('Failed to save domain to database');
    }

    const table = record_type === 'club_website' ? 'clubs' : 'event_websites';
    await supabase
      .from(table)
      .update({
        custom_domain: domain_name,
        domain_status: 'custom',
      })
      .eq('id', entity_id);

    return {
      message: 'Custom domain added to AWS Amplify',
      domain: amplifyDomain,
      dns_verification: response.domainAssociation?.certificateVerificationDNSRecord || null,
      instructions: {
        step1: 'Add the following DNS records to your domain:',
        step2: `CNAME: _${response.domainAssociation?.certificateVerificationDNSRecord?.name || ''} → ${response.domainAssociation?.certificateVerificationDNSRecord?.value || ''}`,
        step3: 'SSL certificate will be automatically provisioned once DNS is verified',
        estimated_time: '5-30 minutes'
      }
    };
  } catch (error) {
    console.error('AWS Amplify API error:', error);

    const { data: amplifyDomain } = await supabase
      .from('amplify_custom_domains')
      .insert([{
        record_type,
        entity_id,
        domain_name,
        domain_status: 'failed',
        status_reason: error.message,
        created_by: user_id
      }])
      .select()
      .single();

    throw new Error(`Failed to add domain to AWS Amplify: ${error.message}`);
  }
}

async function checkDomainStatus(
  supabase: any,
  params: {
    amplify_domain_id: string;
    aws_access_key_id: string;
    aws_secret_access_key: string;
  }
) {
  const { amplify_domain_id, aws_access_key_id, aws_secret_access_key } = params;

  const { data: domainRecord, error: fetchError } = await supabase
    .from('amplify_custom_domains')
    .select('*')
    .eq('id', amplify_domain_id)
    .single();

  if (fetchError || !domainRecord) {
    throw new Error('Domain not found');
  }

  try {
    const response = await awsAmplifyRequest({
      method: 'GET',
      path: `/apps/${AMPLIFY_APP_ID}/domains/${domainRecord.domain_name}`,
      aws_access_key_id,
      aws_secret_access_key,
    });

    const domainAssociation = response.domainAssociation;

    await supabase
      .from('amplify_custom_domains')
      .update({
        domain_status: domainAssociation.domainStatus,
        certificate_status: domainAssociation.certificateVerificationDNSRecord ?
          (domainAssociation.domainStatus === 'AVAILABLE' ? 'issued' : 'in_progress') :
          'pending',
        status_reason: domainAssociation.statusReason || null,
        last_checked_at: new Date().toISOString(),
      })
      .eq('id', amplify_domain_id);

    return {
      domain_status: domainAssociation.domainStatus,
      certificate_status: domainAssociation.certificateVerificationDNSRecord ?
        (domainAssociation.domainStatus === 'AVAILABLE' ? 'issued' : 'in_progress') :
        'pending',
      is_ready: domainAssociation.domainStatus === 'AVAILABLE',
      status_reason: domainAssociation.statusReason,
    };
  } catch (error) {
    console.error('Failed to check domain status:', error);
    throw new Error(`Failed to check domain status: ${error.message}`);
  }
}

async function deleteCustomDomain(
  supabase: any,
  params: {
    amplify_domain_id: string;
    aws_access_key_id: string;
    aws_secret_access_key: string;
  }
) {
  const { amplify_domain_id, aws_access_key_id, aws_secret_access_key } = params;

  const { data: domainRecord, error: fetchError } = await supabase
    .from('amplify_custom_domains')
    .select('*')
    .eq('id', amplify_domain_id)
    .single();

  if (fetchError || !domainRecord) {
    throw new Error('Domain not found');
  }

  try {
    await awsAmplifyRequest({
      method: 'DELETE',
      path: `/apps/${AMPLIFY_APP_ID}/domains/${domainRecord.domain_name}`,
      aws_access_key_id,
      aws_secret_access_key,
    });

    await supabase
      .from('amplify_custom_domains')
      .delete()
      .eq('id', amplify_domain_id);

    const table = domainRecord.record_type === 'club_website' ? 'clubs' : 'event_websites';
    await supabase
      .from(table)
      .update({
        custom_domain: null,
        domain_status: 'pending',
      })
      .eq('id', domainRecord.entity_id);

    return { message: 'Domain deleted from AWS Amplify' };
  } catch (error) {
    console.error('Failed to delete domain:', error);
    throw new Error(`Failed to delete domain: ${error.message}`);
  }
}

async function listCustomDomains(
  supabase: any,
  params: {
    entity_id: string;
    record_type: string;
  }
) {
  const { entity_id, record_type } = params;

  const { data, error } = await supabase
    .from('amplify_custom_domains')
    .select('*')
    .eq('entity_id', entity_id)
    .eq('record_type', record_type);

  if (error) {
    throw new Error('Failed to fetch domains');
  }

  return data;
}

async function awsAmplifyRequest(params: {
  method: string;
  path: string;
  body?: any;
  aws_access_key_id: string;
  aws_secret_access_key: string;
}) {
  const { method, path, body, aws_access_key_id, aws_secret_access_key } = params;

  const host = `amplify.${AWS_REGION}.amazonaws.com`;
  const endpoint = `https://${host}${path}`;
  const service = 'amplify';

  const timestamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const date = timestamp.substring(0, 8);

  const bodyString = body ? JSON.stringify(body) : '';
  const headers = {
    'Host': host,
    'X-Amz-Date': timestamp,
    'Content-Type': 'application/json',
  };

  const canonicalHeaders = Object.entries(headers)
    .map(([key, value]) => `${key.toLowerCase()}:${value}\n`)
    .join('');

  const signedHeaders = Object.keys(headers)
    .map(key => key.toLowerCase())
    .join(';');

  const hashedPayload = await sha256(bodyString);

  const canonicalRequest = [
    method,
    path,
    '',
    canonicalHeaders,
    signedHeaders,
    hashedPayload,
  ].join('\n');

  const credentialScope = `${date}/${AWS_REGION}/${service}/aws4_request`;
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    timestamp,
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');

  const signingKey = await getSignatureKey(aws_secret_access_key, date, AWS_REGION, service);
  const signature = hmac(signingKey, stringToSign);

  const authorizationHeader = `AWS4-HMAC-SHA256 Credential=${aws_access_key_id}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(endpoint, {
    method,
    headers: {
      ...headers,
      'Authorization': authorizationHeader,
    },
    body: body ? bodyString : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('AWS API Error:', errorText);
    throw new Error(`AWS API error: ${response.status} - ${errorText}`);
  }

  return await response.json();
}

async function sha256(message: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(message);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

function hmac(key: Uint8Array, message: string): string {
  const hmacInstance = createHmac('sha256', key);
  hmacInstance.update(message);
  return hmacInstance.digest('hex');
}

async function getSignatureKey(
  key: string,
  dateStamp: string,
  regionName: string,
  serviceName: string
): Promise<Uint8Array> {
  const kDate = hmacBuffer(`AWS4${key}`, dateStamp);
  const kRegion = hmacBuffer(kDate, regionName);
  const kService = hmacBuffer(kRegion, serviceName);
  const kSigning = hmacBuffer(kService, 'aws4_request');
  return kSigning;
}

function hmacBuffer(key: string | Uint8Array, message: string): Uint8Array {
  const hmacInstance = createHmac('sha256', key);
  hmacInstance.update(message);
  return new Uint8Array(hmacInstance.digest());
}
