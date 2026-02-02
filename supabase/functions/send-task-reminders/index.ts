import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

interface Task {
  id: string;
  title: string;
  description: string;
  due_date: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  club_id: string;
  event_id: string | null;
  task_type: string;
  contributors: any[];
  created_at: string;
}

interface Member {
  email: string;
  first_name: string;
  last_name: string;
}

interface Club {
  name: string;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    // Get Supabase client
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const { createClient } = await import("jsr:@supabase/supabase-js@2");
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get current date and calculate reminder dates
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const oneWeekFromNow = new Date(today);
    oneWeekFromNow.setDate(oneWeekFromNow.getDate() + 7);

    const threeDaysFromNow = new Date(today);
    threeDaysFromNow.setDate(threeDaysFromNow.getDate() + 3);

    // Find tasks that need reminders
    const { data: tasks, error: tasksError } = await supabase
      .from("club_tasks")
      .select(`
        id,
        title,
        description,
        due_date,
        status,
        priority,
        assignee_id,
        club_id,
        event_id,
        task_type,
        contributors,
        created_at,
        clubs!inner(name)
      `)
      .in("status", ["pending", "in_progress"])
      .eq("send_reminder", true)
      .like("task_type", "document_%")
      .not("due_date", "is", null);

    if (tasksError) {
      console.error("Error fetching tasks:", tasksError);
      throw tasksError;
    }

    if (!tasks || tasks.length === 0) {
      return new Response(
        JSON.stringify({ message: "No tasks requiring reminders" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    let emailsSent = 0;
    const errors: string[] = [];

    // Process each task
    for (const task of tasks) {
      try {
        const dueDate = new Date(task.due_date);
        const daysDiff = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

        let shouldSendReminder = false;
        let reminderType = "";

        // Check if we should send a reminder
        if (daysDiff === 7) {
          shouldSendReminder = true;
          reminderType = "1 week";
        } else if (daysDiff === 3) {
          shouldSendReminder = true;
          reminderType = "3 days";
        } else if (daysDiff === 0) {
          shouldSendReminder = true;
          reminderType = "due today";
        } else if (daysDiff < 0 && daysDiff >= -7) {
          // Overdue by up to 1 week
          shouldSendReminder = true;
          reminderType = `${Math.abs(daysDiff)} day${Math.abs(daysDiff) > 1 ? 's' : ''} overdue`;
        }

        if (!shouldSendReminder) continue;

        // Get assignee and contributors
        const recipientIds = new Set<string>();
        if (task.assignee_id) {
          recipientIds.add(task.assignee_id);
        }
        if (task.contributors && Array.isArray(task.contributors)) {
          task.contributors.forEach((id: string) => recipientIds.add(id));
        }

        if (recipientIds.size === 0) continue;

        // Fetch member details
        const { data: members, error: membersError } = await supabase
          .from("members")
          .select("email, first_name, last_name, user_id")
          .eq("club_id", task.club_id)
          .in("user_id", Array.from(recipientIds));

        if (membersError || !members || members.length === 0) {
          console.error(`No members found for task ${task.id}`);
          continue;
        }

        // Send email to each recipient
        for (const member of members) {
          try {
            const emailBody = generateEmailBody(task, member, reminderType, task.clubs?.name);

            // Send email using your email service
            // For now, we'll just log it
            console.log(`Would send email to ${member.email} for task ${task.id} (${reminderType})`);

            // TODO: Integrate with actual email service (SendGrid, Resend, etc.)
            // Example:
            // await fetch('https://api.sendgrid.com/v3/mail/send', {
            //   method: 'POST',
            //   headers: {
            //     'Authorization': `Bearer ${Deno.env.get('SENDGRID_API_KEY')}`,
            //     'Content-Type': 'application/json'
            //   },
            //   body: JSON.stringify({
            //     personalizations: [{ to: [{ email: member.email }] }],
            //     from: { email: 'noreply@alfie.app' },
            //     subject: emailBody.subject,
            //     content: [{ type: 'text/html', value: emailBody.html }]
            //   })
            // });

            emailsSent++;
          } catch (emailError) {
            console.error(`Error sending email to ${member.email}:`, emailError);
            errors.push(`Failed to send email to ${member.email}`);
          }
        }
      } catch (taskError) {
        console.error(`Error processing task ${task.id}:`, taskError);
        errors.push(`Failed to process task ${task.id}`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `Processed ${tasks.length} tasks, ${emailsSent} emails sent`,
        errors: errors.length > 0 ? errors : undefined,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in send-task-reminders function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});

function generateEmailBody(
  task: Task,
  member: Member,
  reminderType: string,
  clubName: string
): { subject: string; html: string } {
  const isOverdue = reminderType.includes("overdue");
  const urgencyColor = isOverdue ? "#dc2626" : reminderType.includes("today") ? "#f59e0b" : "#3b82f6";

  const subject = isOverdue
    ? `⚠️ OVERDUE: ${task.title}`
    : `⏰ Reminder: ${task.title} - ${reminderType}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${subject}</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: ${urgencyColor}; color: white; padding: 20px; border-radius: 8px 8px 0 0;">
    <h1 style="margin: 0; font-size: 24px;">${isOverdue ? "⚠️ Task Overdue" : "⏰ Task Reminder"}</h1>
  </div>

  <div style="background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 8px 8px;">
    <p style="margin-top: 0;">Hi ${member.first_name},</p>

    <p>This is a reminder about a task assigned to you in <strong>${clubName}</strong>:</p>

    <div style="background: white; padding: 20px; border-left: 4px solid ${urgencyColor}; margin: 20px 0; border-radius: 4px;">
      <h2 style="margin-top: 0; color: #1f2937; font-size: 18px;">${task.title}</h2>
      <p style="color: #6b7280; margin: 10px 0;">${task.description || "No description provided"}</p>

      <div style="margin-top: 15px; padding-top: 15px; border-top: 1px solid #e5e7eb;">
        <p style="margin: 5px 0;"><strong>Due Date:</strong> ${new Date(task.due_date).toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
        <p style="margin: 5px 0;"><strong>Priority:</strong> <span style="color: ${urgencyColor}; text-transform: uppercase; font-weight: bold;">${task.priority}</span></p>
        <p style="margin: 5px 0;"><strong>Status:</strong> ${reminderType}</p>
      </div>
    </div>

    ${isOverdue
      ? `<p style="color: #dc2626; font-weight: bold;">⚠️ This task is now overdue. Please complete it as soon as possible.</p>`
      : reminderType.includes("today")
        ? `<p style="color: #f59e0b; font-weight: bold;">⏰ This task is due today. Please complete it before end of day.</p>`
        : `<p>This task is due in ${reminderType}. Please ensure you have time allocated to complete it.</p>`
    }

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e5e7eb;">
      <a href="${Deno.env.get("SUPABASE_URL")}/tasks/${task.id}"
         style="display: inline-block; background: #3b82f6; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">
        View Task in Alfie
      </a>
    </div>

    <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
      You're receiving this email because you are assigned to or contributing to this task.
      If you have questions, please contact your club administrator.
    </p>
  </div>

  <div style="text-align: center; padding: 20px; color: #6b7280; font-size: 12px;">
    <p>© ${new Date().getFullYear()} Alfie - Yacht Race Management System</p>
  </div>
</body>
</html>
  `;

  return { subject, html };
}
