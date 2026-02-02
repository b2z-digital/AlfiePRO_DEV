import "jsr:@supabase/functions-js/edge-runtime.d.ts";
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
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    const url = new URL(req.url);
    const token = url.searchParams.get("token");
    const status = url.searchParams.get("status");

    if (!token || !status) {
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
<title>Invalid Request</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.container{background:white;border-radius:12px;padding:40px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.icon{font-size:64px;margin-bottom:20px}
h1{margin:0 0 10px 0;color:#333;font-size:28px}
p{color:#666;line-height:1.6;margin:10px 0}
</style>
</head>
<body>
<div class="container">
<div class="icon">⚠️</div>
<h1>Invalid Request</h1>
<p>This link appears to be invalid. Please use the link from your email.</p>
</div>
</body>
</html>`;

      return new Response(errorHtml, {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
          "X-Frame-Options": "DENY"
        },
      });
    }

    if (!["attending", "not_attending", "maybe"].includes(status)) {
      const errorHtml = `<!DOCTYPE html>
<html>
<head>
<title>Invalid Status</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.container{background:white;border-radius:12px;padding:40px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.icon{font-size:64px;margin-bottom:20px}
h1{margin:0 0 10px 0;color:#333;font-size:28px}
p{color:#666;line-height:1.6;margin:10px 0}
</style>
</head>
<body>
<div class="container">
<div class="icon">⚠️</div>
<h1>Invalid Status</h1>
<p>This response link has an invalid status. Please contact your organization.</p>
</div>
</body>
</html>`;

      return new Response(errorHtml, {
        status: 400,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
          "X-Frame-Options": "DENY"
        },
      });
    }

    const { data: attendance, error: updateError } = await supabase
      .from("meeting_attendance")
      .update({ status, responded_at: new Date().toISOString() })
      .eq("response_token", token)
      .select(`
        *,
        meeting:meetings(name, date, start_time),
        member:members(first_name, last_name, email)
      `)
      .maybeSingle();

    if (updateError) {
      console.error("Error updating attendance:", updateError);

      const errorHtml = `<!DOCTYPE html>
<html>
<head>
<title>Error</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.container{background:white;border-radius:12px;padding:40px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.icon{font-size:64px;margin-bottom:20px}
h1{margin:0 0 10px 0;color:#333;font-size:28px}
p{color:#666;line-height:1.6;margin:10px 0}
.error{color:#ef4444}
</style>
</head>
<body>
<div class="container">
<div class="icon">⚠️</div>
<h1>Error</h1>
<p class="error">Failed to update attendance. Please try again or contact your organization.</p>
</div>
</body>
</html>`;

      return new Response(errorHtml, {
        status: 500,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
          "X-Frame-Options": "DENY"
        },
      });
    }

    if (!attendance) {
      const notFoundHtml = `<!DOCTYPE html>
<html>
<head>
<title>Invalid Link</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.container{background:white;border-radius:12px;padding:40px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.icon{font-size:64px;margin-bottom:20px}
h1{margin:0 0 10px 0;color:#333;font-size:28px}
p{color:#666;line-height:1.6;margin:10px 0}
</style>
</head>
<body>
<div class="container">
<div class="icon">🔗</div>
<h1>Invalid or Expired Link</h1>
<p>This response link is invalid or has expired. Please contact your organization if you need assistance.</p>
</div>
</body>
</html>`;

      return new Response(notFoundHtml, {
        status: 404,
        headers: {
          "Content-Type": "text/html; charset=utf-8",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Content-Type-Options": "nosniff",
          "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
          "X-Frame-Options": "DENY"
        },
      });
    }

    // Redirect to a static confirmation page with query params
    const redirectUrl = `${supabaseUrl.replace('.supabase.co', '.netlify.app')}/meeting-response.html?status=${status}&meeting=${encodeURIComponent(attendance.meeting.name)}`;

    return new Response(null, {
      status: 302,
      headers: {
        "Location": redirectUrl,
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (error) {
    console.error("Error:", error);

    const errorHtml = `<!DOCTYPE html>
<html>
<head>
<title>Error</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%)}
.container{background:white;border-radius:12px;padding:40px;max-width:500px;box-shadow:0 20px 60px rgba(0,0,0,0.3);text-align:center}
.icon{font-size:64px;margin-bottom:20px}
h1{margin:0 0 10px 0;color:#333;font-size:28px}
p{color:#666;line-height:1.6;margin:10px 0}
.error{color:#ef4444}
</style>
</head>
<body>
<div class="container">
<div class="icon">⚠️</div>
<h1>Something Went Wrong</h1>
<p class="error">An unexpected error occurred. Please try again or contact your organization.</p>
</div>
</body>
</html>`;

    return new Response(errorHtml, {
      status: 500,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:;",
        "X-Frame-Options": "DENY"
      },
    });
  }
});