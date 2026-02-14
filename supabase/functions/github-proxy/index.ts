import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, X-Client-Info, Apikey",
};

const GITHUB_API = "https://api.github.com";

async function verifySuperdmin(authHeader: string) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error,
  } = await userClient.auth.getUser();
  if (error || !user) return null;

  const adminClient = createClient(supabaseUrl, serviceKey);

  const isSuperAdmin = user.user_metadata?.is_super_admin === true;

  if (!isSuperAdmin) {
    const { data: platformAdmin } = await adminClient
      .from("platform_super_admins")
      .select("id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .maybeSingle();

    if (!platformAdmin) return null;
  }

  return { user, adminClient };
}

async function getGitHubConfig(adminClient: any) {
  const { data: tokenRow } = await adminClient
    .from("platform_settings")
    .select("value")
    .eq("key", "github_token")
    .maybeSingle();

  const { data: repoRow } = await adminClient
    .from("platform_settings")
    .select("value")
    .eq("key", "github_repo")
    .maybeSingle();

  return {
    token: tokenRow?.value || null,
    repo: repoRow?.value || null,
  };
}

async function githubFetch(
  path: string,
  token: string,
  method = "GET",
  body?: any
) {
  const res = await fetch(`${GITHUB_API}${path}`, {
    method,
    headers: {
      Authorization: `token ${token}`,
      Accept: "application/vnd.github.v3+json",
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${errText}`);
  }

  return res.json();
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await verifySuperdmin(authHeader);
    if (!result) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { adminClient } = result;
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "";

    if (action === "save-config") {
      const body = await req.json();
      const { token, repo } = body;

      if (token) {
        await adminClient
          .from("platform_settings")
          .upsert(
            {
              key: "github_token",
              value: token,
              category: "github",
              updated_by: result.user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
      }
      if (repo) {
        await adminClient
          .from("platform_settings")
          .upsert(
            {
              key: "github_repo",
              value: repo,
              category: "github",
              updated_by: result.user.id,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "key" }
          );
      }

      return new Response(JSON.stringify({ success: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "get-config") {
      const config = await getGitHubConfig(adminClient);
      return new Response(
        JSON.stringify({
          configured: !!config.token && !!config.repo,
          repo: config.repo,
          hasToken: !!config.token,
        }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const config = await getGitHubConfig(adminClient);
    if (!config.token || !config.repo) {
      return new Response(
        JSON.stringify({ error: "GitHub not configured", needsSetup: true }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const { token, repo } = config;

    if (action === "repo") {
      const data = await githubFetch(`/repos/${repo}`, token);
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "branches") {
      const data = await githubFetch(
        `/repos/${repo}/branches?per_page=30`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "commits") {
      const branch = url.searchParams.get("branch") || "main";
      const perPage = url.searchParams.get("per_page") || "20";
      const data = await githubFetch(
        `/repos/${repo}/commits?sha=${encodeURIComponent(branch)}&per_page=${perPage}`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "pulls") {
      const state = url.searchParams.get("state") || "open";
      const data = await githubFetch(
        `/repos/${repo}/pulls?state=${state}&per_page=30&sort=updated&direction=desc`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "compare") {
      const base = url.searchParams.get("base") || "main";
      const head = url.searchParams.get("head") || "dev";
      const data = await githubFetch(
        `/repos/${repo}/compare/${encodeURIComponent(base)}...${encodeURIComponent(head)}`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "create-pr") {
      const body = await req.json();
      const data = await githubFetch(`/repos/${repo}/pulls`, token, "POST", {
        title: body.title,
        body: body.body || "",
        head: body.head,
        base: body.base,
      });
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "deployments") {
      const data = await githubFetch(
        `/repos/${repo}/deployments?per_page=10`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "actions") {
      const data = await githubFetch(
        `/repos/${repo}/actions/runs?per_page=10`,
        token
      );
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Internal error", details: String(err) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
