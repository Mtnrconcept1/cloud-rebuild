import "dotenv/config";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  OLLAMA_URL = "http://127.0.0.1:11434",
  OLLAMA_VISION_MODEL = "llava",
  OLLAMA_EMBEDDING_MODEL = "all-minilm",
} = process.env;

const failures = [];

if (!SUPABASE_URL) {
  failures.push("SUPABASE_URL is missing.");
}

if (!SUPABASE_SERVICE_ROLE_KEY) {
  failures.push("SUPABASE_SERVICE_ROLE_KEY is missing.");
}

if (SUPABASE_SERVICE_ROLE_KEY && !SUPABASE_SERVICE_ROLE_KEY.startsWith("eyJ")) {
  failures.push("SUPABASE_SERVICE_ROLE_KEY does not look like a Supabase JWT.");
}

try {
  const response = await fetch(`${OLLAMA_URL.replace(/\/+$/, "")}/api/tags`, {
    headers: { Accept: "application/json" },
  });

  if (!response.ok) {
    failures.push(`Ollama responded with HTTP ${response.status}.`);
  } else {
    const payload = await response.json();
    const models = Array.isArray(payload.models)
      ? payload.models.map((model) => String(model.name || "")).filter(Boolean)
      : [];

    const hasVisionModel = models.some((model) => model.startsWith(`${OLLAMA_VISION_MODEL}:`) || model === OLLAMA_VISION_MODEL);
    const hasEmbeddingModel = models.some((model) => model.startsWith(`${OLLAMA_EMBEDDING_MODEL}:`) || model === OLLAMA_EMBEDDING_MODEL);

    if (!hasVisionModel) {
      failures.push(`Ollama model "${OLLAMA_VISION_MODEL}" is not installed.`);
    }

    if (!hasEmbeddingModel) {
      failures.push(`Ollama model "${OLLAMA_EMBEDDING_MODEL}" is not installed.`);
    }
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  failures.push(`Ollama is not reachable at ${OLLAMA_URL}: ${message}`);
}

if (failures.length) {
  console.error("TOK image AI worker is not ready:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("TOK image AI worker configuration is ready.");
