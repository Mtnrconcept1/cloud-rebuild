import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  WORKER_ID = "tok-image-worker-1",
  OLLAMA_URL = "http://127.0.0.1:11434",
  OLLAMA_API_KEY = "",
  OLLAMA_VISION_MODEL = "llava",
  OLLAMA_EMBEDDING_MODEL = "all-minilm",
  POLL_INTERVAL_MS = "5000",
  BATCH_SIZE = "3",
} = process.env;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
  },
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildOllamaHeaders(extraHeaders = {}) {
  return {
    ...extraHeaders,
    ...(OLLAMA_API_KEY ? { Authorization: `Bearer ${OLLAMA_API_KEY}` } : {}),
  };
}

function cleanArray(value) {
  if (!Array.isArray(value)) return [];

  return [...new Set(
    value
      .map((item) => String(item || "").trim().toLowerCase())
      .filter(Boolean),
  )];
}

function cleanHashtags(value) {
  return cleanArray(value).map((item) => item.startsWith("#") ? item : `#${item.replace(/^#+/, "")}`);
}

function safeString(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  return value.trim();
}

function safeBoolean(value) {
  return value === true;
}

function safeQualityScore(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 0;
  return Math.min(10, Math.max(0, score));
}

function extractJsonFromText(text) {
  const cleaned = String(text || "").trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // Ollama models sometimes wrap JSON in prose; keep a strict fallback extractor.
  }

  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) {
    throw new Error(`AI response did not contain JSON: ${cleaned.slice(0, 500)}`);
  }

  return JSON.parse(match[0]);
}

async function downloadImageAsBase64(bucket, storagePath) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .download(storagePath);

  if (error) {
    throw new Error(`Image download failed for ${bucket}/${storagePath}: ${error.message}`);
  }

  const arrayBuffer = await data.arrayBuffer();
  return Buffer.from(arrayBuffer).toString("base64");
}

async function analyzeImageWithOllama(base64Image) {
  const prompt = `
Tu es un moteur d'analyse d'image pour TOK, une application de restaurants à Genève.

Analyse l'image et retourne uniquement un JSON valide, sans markdown.

Objectif:
- améliorer le SEO
- améliorer la recherche interne
- générer des métadonnées automatiques
- identifier les plats, ingrédients, objets, ambiance, couleurs et type de photo

Règles:
- Ne devine pas une marque si elle n'est pas visible.
- Ne prétends pas reconnaître une personne.
- Si un élément est incertain, utilise des termes génériques.
- Réponds en français.
- Les hashtags doivent être sans espaces et pertinents.
- Le alt_text doit être naturel, utile pour Google et l'accessibilité.
- Le seo_title doit être court.
- La seo_description doit faire maximum 160 caractères.
- quality_score doit être entre 0 et 10.

Format JSON obligatoire:
{
  "description": "description détaillée de l'image",
  "short_description": "description courte",
  "alt_text": "texte alternatif SEO",
  "seo_title": "titre SEO",
  "seo_description": "meta description SEO",
  "detected_objects": ["objet1", "objet2"],
  "food_items": ["plat1", "plat2"],
  "ingredients": ["ingrédient1", "ingrédient2"],
  "cuisine_types": ["italienne", "japonaise"],
  "moods": ["chic", "convivial"],
  "colors": ["orange", "blanc"],
  "hashtags": ["#restaurantgeneve", "#foodgeneva"],
  "image_type": "plat | intérieur | extérieur | équipe | boisson | événement | menu | autre",
  "is_food_photo": true,
  "has_people": false,
  "has_logo": false,
  "has_text": false,
  "quality_score": 8.5
}
`;

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: "POST",
    headers: buildOllamaHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model: OLLAMA_VISION_MODEL,
      prompt,
      images: [base64Image],
      stream: false,
      options: {
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama vision error ${response.status}: ${body}`);
  }

  const result = await response.json();
  return extractJsonFromText(result.response);
}

function buildSearchText(metadata) {
  return [
    metadata.description,
    metadata.short_description,
    metadata.alt_text,
    metadata.seo_title,
    metadata.seo_description,
    ...cleanArray(metadata.detected_objects),
    ...cleanArray(metadata.food_items),
    ...cleanArray(metadata.ingredients),
    ...cleanArray(metadata.cuisine_types),
    ...cleanArray(metadata.moods),
    ...cleanArray(metadata.colors),
    ...cleanHashtags(metadata.hashtags),
    metadata.image_type,
  ]
    .filter(Boolean)
    .join(" ");
}

async function generateEmbeddingWithOllama(text) {
  const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: "POST",
    headers: buildOllamaHeaders({
      "Content-Type": "application/json",
    }),
    body: JSON.stringify({
      model: OLLAMA_EMBEDDING_MODEL,
      prompt: text,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Ollama embedding error ${response.status}: ${body}`);
  }

  const result = await response.json();
  if (!Array.isArray(result.embedding)) {
    throw new Error("Invalid Ollama embedding response.");
  }
  if (result.embedding.length !== 384) {
    throw new Error(`Invalid embedding dimension: ${result.embedding.length}. Expected 384.`);
  }

  return result.embedding;
}

async function claimJobs() {
  const { data, error } = await supabase.rpc("claim_image_analysis_jobs", {
    p_worker_id: WORKER_ID,
    p_limit: Number(BATCH_SIZE),
  });

  if (error) {
    throw new Error(`Could not claim image analysis jobs: ${error.message}`);
  }

  return data || [];
}

async function completeJob(job, metadata, embedding) {
  const payload = {
    p_job_id: job.job_id,
    p_image_id: job.image_id,
    p_description: safeString(metadata.description),
    p_short_description: safeString(metadata.short_description),
    p_alt_text: safeString(metadata.alt_text),
    p_seo_title: safeString(metadata.seo_title),
    p_seo_description: safeString(metadata.seo_description),
    p_detected_objects: cleanArray(metadata.detected_objects),
    p_food_items: cleanArray(metadata.food_items),
    p_ingredients: cleanArray(metadata.ingredients),
    p_cuisine_types: cleanArray(metadata.cuisine_types),
    p_moods: cleanArray(metadata.moods),
    p_colors: cleanArray(metadata.colors),
    p_hashtags: cleanHashtags(metadata.hashtags),
    p_image_type: safeString(metadata.image_type, "autre"),
    p_is_food_photo: safeBoolean(metadata.is_food_photo),
    p_has_people: safeBoolean(metadata.has_people),
    p_has_logo: safeBoolean(metadata.has_logo),
    p_has_text: safeBoolean(metadata.has_text),
    p_quality_score: safeQualityScore(metadata.quality_score),
    p_ai_metadata: metadata,
    p_embedding: `[${embedding.join(",")}]`,
  };

  const { error } = await supabase.rpc("complete_image_analysis_job", payload);
  if (error) {
    throw new Error(`Could not complete image analysis job: ${error.message}`);
  }
}

async function failJob(job, errorMessage) {
  const { error } = await supabase.rpc("fail_image_analysis_job", {
    p_job_id: job.job_id,
    p_image_id: job.image_id,
    p_error: String(errorMessage || "unknown").slice(0, 2000),
  });

  if (error) {
    console.error("fail_image_analysis_job failed:", error.message);
  }
}

async function processJob(job) {
  console.log(`Analyzing image ${job.image_id} from ${job.bucket}/${job.storage_path}`);

  const base64Image = await downloadImageAsBase64(job.bucket, job.storage_path);
  const metadata = await analyzeImageWithOllama(base64Image);
  const searchText = buildSearchText(metadata);
  const embedding = await generateEmbeddingWithOllama(searchText);

  await completeJob(job, metadata, embedding);
  console.log(`Image analyzed: ${job.image_id}`);
}

async function loop() {
  console.log(`Worker started: ${WORKER_ID}`);
  console.log(`Vision model: ${OLLAMA_VISION_MODEL}`);
  console.log(`Embedding model: ${OLLAMA_EMBEDDING_MODEL}`);
  console.log(`Ollama URL: ${OLLAMA_URL}`);

  while (true) {
    try {
      const jobs = await claimJobs();

      if (!jobs.length) {
        await sleep(Number(POLL_INTERVAL_MS));
        continue;
      }

      for (const job of jobs) {
        try {
          await processJob(job);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Image analysis job failed ${job.job_id}:`, message);
          await failJob(job, message);
        }
      }
    } catch (error) {
      console.error("Worker loop error:", error instanceof Error ? error.message : error);
      await sleep(Number(POLL_INTERVAL_MS));
    }
  }
}

loop();
