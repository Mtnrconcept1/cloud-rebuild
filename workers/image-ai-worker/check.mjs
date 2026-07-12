import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { loadConfig } from "./config.js";
import { checkOllamaModels } from "./ollama.js";

const failures = [];
let config;

try {
  config = loadConfig();
} catch (error) {
  failures.push(error instanceof Error ? error.message : String(error));
}

if (config) {
  const supabase = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  const checkSupabase = async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), config.supabaseTimeoutMs);
    try {
      return await supabase.from("restaurant_images").select("id").limit(1).abortSignal(controller.signal);
    } finally {
      clearTimeout(timeout);
    }
  };

  const [database, ollama] = await Promise.allSettled([
    checkSupabase(),
    checkOllamaModels(config),
  ]);

  if (database.status === "rejected") {
    failures.push(`Supabase is not reachable: ${database.reason instanceof Error ? database.reason.message : String(database.reason)}`);
  } else if (database.value.error) {
    failures.push(`Supabase readiness failed: ${database.value.error.message}`);
  }

  if (ollama.status === "rejected") {
    failures.push(`Ollama readiness failed: ${ollama.reason instanceof Error ? ollama.reason.message : String(ollama.reason)}`);
  }
}

if (failures.length) {
  console.error("TOK local image worker is not ready:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("TOK local image worker is ready (Supabase + Ollama vision + embeddings).");
