import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { gzipSync } from "node:zlib";

const DEFAULT_OUTPUT_DIR = path.join(".tmp", "google-actions-center-feeds");

const FEEDS = [
  {
    filePrefix: "merchant_feed",
    endpoint: "/v3/feeds/merchants/",
    collectionKey: "merchant",
    includeDays: false,
  },
  {
    filePrefix: "service_feed",
    endpoint: "/v3/feeds/services/",
    collectionKey: "service",
    includeDays: false,
  },
  {
    filePrefix: "availability_feed",
    endpoint: "/v3/feeds/availability/",
    collectionKey: "service_availability",
    includeDays: true,
  },
];

function argValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0) return process.argv[index + 1] || "";
  const prefix = `${name}=`;
  const inline = process.argv.find((arg) => arg.startsWith(prefix));
  return inline ? inline.slice(prefix.length) : "";
}

function requiredEnv(name) {
  const value = (process.env[name] || "").trim();
  if (!value) throw new Error(`Missing ${name}.`);
  return value;
}

function boundedInteger(value, fallback, min, max) {
  const parsed = Math.floor(Number(value || fallback));
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function joinUrl(baseUrl, endpoint) {
  return `${baseUrl.replace(/\/+$/, "")}${endpoint}`;
}

async function fetchFeed({ baseUrl, username, password, feed, limit, days }) {
  const url = new URL(joinUrl(baseUrl, feed.endpoint));
  url.searchParams.set("limit", String(limit));
  if (feed.includeDays) url.searchParams.set("days", String(days));

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
      authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
    },
  });

  if (!response.ok) {
    throw new Error(`${feed.filePrefix} export failed with HTTP ${response.status}.`);
  }

  const payload = await response.json();
  validateFeedPayload(feed, payload);
  return payload;
}

function validateFeedPayload(feed, payload) {
  const metadata = payload?.metadata;
  const timestamp = metadata?.generation_timestamp?.seconds;

  if (metadata?.processing_instruction !== "PROCESS_AS_COMPLETE") {
    throw new Error(`${feed.filePrefix} must use PROCESS_AS_COMPLETE.`);
  }

  if (!Number.isFinite(Number(timestamp)) || Number(timestamp) <= 0) {
    throw new Error(`${feed.filePrefix} is missing metadata.generation_timestamp.seconds.`);
  }

  if (!Array.isArray(payload?.[feed.collectionKey])) {
    throw new Error(`${feed.filePrefix} is missing ${feed.collectionKey} array.`);
  }
}

function outputFileName(feed, payload) {
  const timestamp = Math.floor(Number(payload.metadata.generation_timestamp.seconds));
  return `${feed.filePrefix}_${timestamp}_001_of_001.json.gz`;
}

async function main() {
  const outputDir = path.resolve(process.cwd(), argValue("--output") || DEFAULT_OUTPUT_DIR);
  const baseUrl = requiredEnv("GOOGLE_ACTIONS_CENTER_FEED_BASE_URL");
  const username = requiredEnv("GOOGLE_ACTIONS_CENTER_USERNAME");
  const password = requiredEnv("GOOGLE_ACTIONS_CENTER_PASSWORD");
  const limit = boundedInteger(process.env.GOOGLE_ACTIONS_CENTER_FEED_LIMIT, 100, 1, 100);
  const days = boundedInteger(process.env.GOOGLE_ACTIONS_CENTER_AVAILABILITY_DAYS, 30, 1, 30);

  mkdirSync(outputDir, { recursive: true });

  for (const feed of FEEDS) {
    const payload = await fetchFeed({ baseUrl, username, password, feed, limit, days });
    const fileName = outputFileName(feed, payload);
    const destination = path.join(outputDir, fileName);
    const body = `${JSON.stringify(payload)}\n`;
    writeFileSync(destination, gzipSync(Buffer.from(body, "utf8")));
    console.log(fileName);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
