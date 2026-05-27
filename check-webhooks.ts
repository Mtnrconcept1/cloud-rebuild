import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.production" });

const supabase = createClient(
  process.env.VITE_SUPABASE_URL!,
  process.env.SUPABASE_ACCESS_TOKEN! // using this as a stand-in if service role is missing, but wait... service role is needed to read audit logs
);

async function checkLogs() {
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(5);
  
  console.log("Stripe Webhook Events:", data);
  console.error("Error:", error);
}

checkLogs();
