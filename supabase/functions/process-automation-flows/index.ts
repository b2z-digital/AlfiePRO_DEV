import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sendgridApiKey = Deno.env.get('SENDGRID_API_KEY');

    if (!sendgridApiKey) {
      throw new Error('SendGrid API key not configured');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get all active flows
    const { data: flows, error: flowsError } = await supabase
      .from('marketing_automation_flows')
      .select('*')
      .eq('status', 'active');

    if (flowsError) throw flowsError;

    console.log(`Processing ${flows?.length || 0} active flows`);

    const results = {
      processed: 0,
      errors: 0,
      emailsSent: 0,
    };

    // Process each flow
    for (const flow of flows || []) {
      try {
        await processFlow(supabase, flow, sendgridApiKey);
        results.processed++;
      } catch (error) {
        console.error(`Error processing flow ${flow.id}:`, error);
        results.errors++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...results,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error in process-automation-flows:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});

async function processFlow(supabase: any, flow: any, sendgridApiKey: string) {
  // Get all enrollments for this flow that are active
  const { data: enrollments, error: enrollmentsError } = await supabase
    .from('marketing_flow_enrollments')
    .select('*')
    .eq('flow_id', flow.id)
    .eq('status', 'active');

  if (enrollmentsError) throw enrollmentsError;

  // Process each enrollment
  for (const enrollment of enrollments || []) {
    try {
      await processEnrollment(supabase, flow, enrollment, sendgridApiKey);
    } catch (error) {
      console.error(`Error processing enrollment ${enrollment.id}:`, error);
    }
  }
}

async function processEnrollment(
  supabase: any,
  flow: any,
  enrollment: any,
  sendgridApiKey: string
) {
  // Get the current step or first step
  let currentStepId = enrollment.current_step_id;

  if (!currentStepId) {
    // Get the first step (no connections pointing to it)
    const { data: steps } = await supabase
      .from('marketing_flow_steps')
      .select('*')
      .eq('flow_id', flow.id)
      .order('created_at', { ascending: true });

    if (!steps || steps.length === 0) return;
    currentStepId = steps[0].id;
  }

  // Get the step details
  const { data: step, error: stepError } = await supabase
    .from('marketing_flow_steps')
    .select('*')
    .eq('id', currentStepId)
    .single();

  if (stepError) throw stepError;

  // Check if enrollment has completed this step
  const { data: completion } = await supabase
    .from('marketing_flow_step_completions')
    .select('*')
    .eq('enrollment_id', enrollment.id)
    .eq('step_id', step.id)
    .maybeSingle();

  if (completion) {
    // Already completed, move to next step
    await moveToNextStep(supabase, flow, enrollment, step);
    return;
  }

  // Process the step based on its type
  await executeStep(supabase, flow, enrollment, step, sendgridApiKey);
}

async function executeStep(
  supabase: any,
  flow: any,
  enrollment: any,
  step: any,
  sendgridApiKey: string
) {
  try {
    switch (step.step_type) {
      case 'send_email':
        await executeSendEmail(supabase, enrollment, step, sendgridApiKey);
        break;

      case 'wait':
        await executeWait(supabase, enrollment, step);
        break;

      case 'condition':
        await executeCondition(supabase, flow, enrollment, step);
        return; // Don't mark as complete yet

      case 'add_to_list':
        await executeAddToList(supabase, enrollment, step);
        break;

      case 'remove_from_list':
        await executeRemoveFromList(supabase, enrollment, step);
        break;

      default:
        console.log(`Unknown step type: ${step.step_type}`);
    }

    // Mark step as complete
    await supabase.from('marketing_flow_step_completions').insert({
      enrollment_id: enrollment.id,
      step_id: step.id,
      status: 'completed',
      completed_at: new Date().toISOString(),
    });

    // Update step statistics
    await supabase
      .from('marketing_flow_steps')
      .update({
        total_entered: (step.total_entered || 0) + 1,
        total_completed: (step.total_completed || 0) + 1,
      })
      .eq('id', step.id);

    // Move to next step
    await moveToNextStep(supabase, flow, enrollment, step);
  } catch (error) {
    if (error.message === 'WAIT_NOT_COMPLETE') {
      // Don't mark as error, just waiting
      return;
    }
    throw error;
  }
}

async function executeSendEmail(
  supabase: any,
  enrollment: any,
  step: any,
  sendgridApiKey: string
) {
  const emailContent = step.email_content_html || '';
  const subject = step.subject || 'Email from automation';

  // Get club info for from name
  const { data: flowData } = await supabase
    .from('marketing_automation_flows')
    .select('club_id, clubs(name)')
    .eq('id', step.flow_id)
    .single();

  const fromName = flowData?.clubs?.name || 'AlfiePRO';
  const fromEmail = 'noreply@alfiepro.com.au';

  // Create recipient record
  const { data: recipient } = await supabase
    .from('marketing_recipients')
    .insert({
      flow_enrollment_id: enrollment.id,
      flow_step_id: step.id,
      email: enrollment.email,
      first_name: enrollment.first_name,
      last_name: enrollment.last_name,
      member_id: enrollment.member_id,
      user_id: enrollment.user_id,
      personalization_data: enrollment.enrollment_data,
      status: 'pending',
    })
    .select()
    .single();

  // Send via SendGrid
  const sendgridResponse = await fetch('https://api.sendgrid.com/v3/mail/send', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${sendgridApiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: enrollment.email, name: `${enrollment.first_name || ''} ${enrollment.last_name || ''}`.trim() }],
          subject: subject,
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      content: [
        {
          type: 'text/html',
          value: emailContent,
        },
      ],
    }),
  });

  if (!sendgridResponse.ok) {
    const error = await sendgridResponse.text();
    console.error('SendGrid error:', error);

    await supabase
      .from('marketing_recipients')
      .update({ status: 'failed', bounced_at: new Date().toISOString(), bounce_reason: error })
      .eq('id', recipient.id);

    throw new Error(`Failed to send email: ${error}`);
  }

  // Update recipient status
  await supabase
    .from('marketing_recipients')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', recipient.id);

  console.log(`Email sent to ${enrollment.email} for step ${step.id}`);
}

async function executeWait(supabase: any, enrollment: any, step: any) {
  const config = step.config || {};
  const waitType = config.wait_type || 'fixed';
  const delayValue = config.delay_value || 1;
  const delayUnit = config.delay_unit || 'days';

  // Calculate wait until time
  let waitUntil: Date;

  if (waitType === 'event_relative' && config.event_id) {
    // Get event date
    const { data: event } = await supabase
      .from('quick_races')
      .select('date')
      .eq('id', config.event_id)
      .single();

    if (!event) {
      console.error('Event not found for wait step');
      return;
    }

    const eventDate = new Date(event.date);
    waitUntil = new Date(eventDate);

    // Apply offset
    const multiplier = config.event_timing === 'after' ? 1 : -1;
    const offset = delayValue * multiplier;

    switch (delayUnit) {
      case 'minutes':
        waitUntil.setMinutes(waitUntil.getMinutes() + offset);
        break;
      case 'hours':
        waitUntil.setHours(waitUntil.getHours() + offset);
        break;
      case 'days':
        waitUntil.setDate(waitUntil.getDate() + offset);
        break;
      case 'weeks':
        waitUntil.setDate(waitUntil.getDate() + offset * 7);
        break;
    }
  } else {
    // Fixed delay from enrollment time
    const enrolledAt = new Date(enrollment.enrolled_at);
    waitUntil = new Date(enrolledAt);

    switch (delayUnit) {
      case 'minutes':
        waitUntil.setMinutes(waitUntil.getMinutes() + delayValue);
        break;
      case 'hours':
        waitUntil.setHours(waitUntil.getHours() + delayValue);
        break;
      case 'days':
        waitUntil.setDate(waitUntil.getDate() + delayValue);
        break;
      case 'weeks':
        waitUntil.setDate(waitUntil.getDate() + delayValue * 7);
        break;
    }
  }

  // Check if wait period is over
  const now = new Date();
  if (now < waitUntil) {
    // Still waiting, don't mark as complete
    console.log(`Enrollment ${enrollment.id} waiting until ${waitUntil.toISOString()}`);
    throw new Error('WAIT_NOT_COMPLETE');
  }
}

async function executeCondition(
  supabase: any,
  flow: any,
  enrollment: any,
  step: any
) {
  const config = step.config || {};
  const conditionType = config.condition_type;
  let conditionMet = false;

  switch (conditionType) {
    case 'event_registration':
      const { data: registration } = await supabase
        .from('event_registrations')
        .select('*')
        .eq('event_id', config.event_id)
        .eq('email', enrollment.email)
        .maybeSingle();
      conditionMet = !!registration;
      break;

    case 'email_opened':
      const { data: opens } = await supabase
        .from('marketing_events')
        .select('*')
        .eq('event_type', 'opened')
        .limit(1);
      conditionMet = opens && opens.length > 0;
      break;

    case 'email_clicked':
      const { data: clicks } = await supabase
        .from('marketing_events')
        .select('*')
        .eq('event_type', 'clicked')
        .limit(1);
      conditionMet = clicks && clicks.length > 0;
      break;

    case 'in_list':
      const { data: listMember } = await supabase
        .from('marketing_list_members')
        .select('*')
        .eq('list_id', config.list_id)
        .eq('email', enrollment.email)
        .eq('status', 'subscribed')
        .maybeSingle();
      conditionMet = !!listMember;
      break;

    case 'membership_status':
      const { data: member } = await supabase
        .from('members')
        .select('membership_status')
        .eq('email', enrollment.email)
        .maybeSingle();
      conditionMet = member?.membership_status === config.membership_status;
      break;
  }

  // Mark as complete with result
  await supabase.from('marketing_flow_step_completions').insert({
    enrollment_id: enrollment.id,
    step_id: step.id,
    status: 'completed',
    result_data: { condition_met: conditionMet },
    completed_at: new Date().toISOString(),
  });

  // If condition not met, exit flow
  if (!conditionMet) {
    await supabase
      .from('marketing_flow_enrollments')
      .update({
        status: 'exited',
        exited_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id);
  } else {
    // Move to next step if condition met
    await moveToNextStep(supabase, flow, enrollment, step);
  }
}

async function executeAddToList(supabase: any, enrollment: any, step: any) {
  const config = step.config || {};
  const listId = config.list_id;

  if (!listId) return;

  await supabase.from('marketing_list_members').upsert({
    list_id: listId,
    email: enrollment.email,
    first_name: enrollment.first_name,
    last_name: enrollment.last_name,
    member_id: enrollment.member_id,
    user_id: enrollment.user_id,
    status: 'subscribed',
    source: 'automation_flow',
  });

  console.log(`Added ${enrollment.email} to list ${listId}`);
}

async function executeRemoveFromList(supabase: any, enrollment: any, step: any) {
  const config = step.config || {};
  const listId = config.list_id;

  if (!listId) return;

  await supabase
    .from('marketing_list_members')
    .update({ status: 'unsubscribed', unsubscribed_at: new Date().toISOString() })
    .eq('list_id', listId)
    .eq('email', enrollment.email);

  console.log(`Removed ${enrollment.email} from list ${listId}`);
}

async function moveToNextStep(supabase: any, flow: any, enrollment: any, currentStep: any) {
  // Get next step connection
  const { data: connections } = await supabase
    .from('marketing_flow_connections')
    .select('*')
    .eq('flow_id', flow.id)
    .eq('from_step_id', currentStep.id);

  if (!connections || connections.length === 0) {
    // No more steps, mark as completed
    await supabase
      .from('marketing_flow_enrollments')
      .update({
        status: 'completed',
        completed_at: new Date().toISOString(),
      })
      .eq('id', enrollment.id);

    await supabase
      .from('marketing_automation_flows')
      .update({
        currently_active: flow.currently_active - 1,
        total_completed: (flow.total_completed || 0) + 1,
      })
      .eq('id', flow.id);

    console.log(`Enrollment ${enrollment.id} completed flow ${flow.id}`);
    return;
  }

  // Move to next step
  const nextStepId = connections[0].to_step_id;
  await supabase
    .from('marketing_flow_enrollments')
    .update({ current_step_id: nextStepId })
    .eq('id', enrollment.id);

  console.log(`Enrollment ${enrollment.id} moved to step ${nextStepId}`);
}
