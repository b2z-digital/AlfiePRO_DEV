import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// Yacht class configurations for syncing
const YACHT_CLASSES = [
  {
    name: "IOM",
    url: "https://www.radiosailing.org.au/rankings-iom",
  },
  {
    name: "10 Rater",
    url: "https://www.radiosailing.org.au/rankings-10r",
  },
  {
    name: "Marblehead",
    url: "https://www.radiosailing.org.au/rankings-marblehead",
  },
  {
    name: "A Class",
    url: "https://www.radiosailing.org.au/rankings-a-class",
  },
  {
    name: "DF65",
    url: "https://www.radiosailing.org.au/rankings-df65",
  },
  {
    name: "DF95",
    url: "https://www.radiosailing.org.au/rankings-df95",
  },
];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: corsHeaders,
    });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting weekly rankings sync...");

    // Get all national associations
    const { data: associations, error: assocError } = await supabase
      .from("national_associations")
      .select("id, name, country");

    if (assocError) {
      throw assocError;
    }

    console.log(`Found ${associations?.length || 0} national associations`);

    const results = [];

    // For each national association
    for (const association of associations || []) {
      console.log(`Syncing rankings for ${association.name}...`);

      // Sync each yacht class
      for (const yachtClass of YACHT_CLASSES) {
        try {
          console.log(`  - Syncing ${yachtClass.name}...`);

          // Call the scrape-national-rankings function
          const scrapeResponse = await fetch(
            `${Deno.env.get("SUPABASE_URL")}/functions/v1/scrape-national-rankings`,
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "X-Cron-Secret": Deno.env.get("CRON_SECRET") || "internal-cron-job",
              },
              body: JSON.stringify({
                url: yachtClass.url,
                yachtClassName: yachtClass.name,
                nationalAssociationId: association.id,
              }),
            }
          );

          const scrapeResult = await scrapeResponse.json();

          if (scrapeResult.success) {
            console.log(`    ✓ Successfully synced ${scrapeResult.rankingsImported} rankings`);
            results.push({
              association: association.name,
              yachtClass: yachtClass.name,
              status: "success",
              rankingsImported: scrapeResult.rankingsImported,
            });
          } else {
            console.log(`    ✗ Failed to sync: ${scrapeResult.message || "Unknown error"}`);
            results.push({
              association: association.name,
              yachtClass: yachtClass.name,
              status: "failed",
              error: scrapeResult.message || "Unknown error",
            });
          }

          // Small delay to avoid overwhelming the source website
          await new Promise((resolve) => setTimeout(resolve, 1000));
        } catch (error) {
          console.error(`    ✗ Error syncing ${yachtClass.name}:`, error);
          results.push({
            association: association.name,
            yachtClass: yachtClass.name,
            status: "error",
            error: error.message,
          });
        }
      }
    }

    const successCount = results.filter((r) => r.status === "success").length;
    const failCount = results.filter((r) => r.status !== "success").length;

    console.log(`\nWeekly sync completed: ${successCount} successful, ${failCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Weekly rankings sync completed`,
        summary: {
          total: results.length,
          successful: successCount,
          failed: failCount,
        },
        results: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error) {
    console.error("Error in weekly sync:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
