import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parse as parseDotenv } from "dotenv";

export const LIVE_STRIPE_PUBLISHABLE_KEY_PATTERN = /^pk_live_[A-Za-z0-9]+$/;

const DEFAULT_ENV_FILES = [
  ".vercel/.env.production.local",
  ".env.production.local",
  ".env.production",
];
const MAX_REMOTE_ASSETS = 80;
const MAX_REMOTE_BYTES = 24 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 15_000;

export function isLiveStripePublishableKey(value) {
  return LIVE_STRIPE_PUBLISHABLE_KEY_PATTERN.test(cleanValue(value));
}

export async function resolveLiveStripePublishableKey(options = {}) {
  const root = options.root || process.cwd();
  const env = options.env || process.env;
  const explicitCandidates = options.explicitCandidates || [
    env.VITE_STRIPE_PUBLISHABLE_KEY,
    env.VITE_STRIPE_PUBLISHABLE_KEY_FALLBACK,
  ];

  for (const candidate of explicitCandidates) {
    const value = cleanValue(candidate);
    if (isLiveStripePublishableKey(value)) {
      persistForGitHubActions(value, options);
      return { value, source: "environment" };
    }
  }

  const envFiles = options.envFiles || DEFAULT_ENV_FILES;
  for (const relativeFile of envFiles) {
    const absoluteFile = path.isAbsolute(relativeFile)
      ? relativeFile
      : path.join(root, relativeFile);
    const parsed = readDotenvFile(absoluteFile);
    const value = cleanValue(parsed.VITE_STRIPE_PUBLISHABLE_KEY);
    if (isLiveStripePublishableKey(value)) {
      persistForGitHubActions(value, options);
      return { value, source: relativeFile };
    }
  }

  if (options.allowRemote === false) {
    throw missingLiveKeyError();
  }

  const baseUrl = cleanValue(
    options.appBaseUrl
      || env.APP_BASE_URL
      || env.PUBLIC_APP_URL
      || env.SITE_URL
      || "https://www.thetok.ch",
  );
  const value = await discoverLiveKeyFromProductionBundle({
    baseUrl,
    fetchImpl: options.fetchImpl || globalThis.fetch,
    maxAssets: options.maxAssets || MAX_REMOTE_ASSETS,
    maxBytes: options.maxBytes || MAX_REMOTE_BYTES,
  });

  if (!value) {
    throw missingLiveKeyError();
  }

  persistForGitHubActions(value, options);
  return { value, source: "production_bundle" };
}

export async function discoverLiveKeyFromProductionBundle(options = {}) {
  const fetchImpl = options.fetchImpl || globalThis.fetch;
  if (typeof fetchImpl !== "function") return null;

  let baseUrl;
  try {
    baseUrl = new URL(options.baseUrl || "https://www.thetok.ch");
  } catch {
    return null;
  }

  if (baseUrl.protocol !== "https:") return null;

  const maxAssets = Math.max(1, Number(options.maxAssets || MAX_REMOTE_ASSETS));
  const maxBytes = Math.max(1, Number(options.maxBytes || MAX_REMOTE_BYTES));
  const pageUrl = new URL(baseUrl.pathname || "/", baseUrl.origin);
  const page = await fetchText(pageUrl, fetchImpl);
  if (!page) return null;

  const inlineMatch = findLiveStripeKey(page.text);
  if (inlineMatch) return inlineMatch;

  const queue = collectHtmlJavaScriptUrls(page.text, page.url, baseUrl.origin);
  const visited = new Set();
  let totalBytes = Buffer.byteLength(page.text, "utf8");

  while (queue.length > 0 && visited.size < maxAssets && totalBytes <= maxBytes) {
    const current = queue.shift();
    if (!current || visited.has(current.href)) continue;
    visited.add(current.href);

    const asset = await fetchText(current, fetchImpl);
    if (!asset) continue;

    totalBytes += Buffer.byteLength(asset.text, "utf8");
    if (totalBytes > maxBytes) break;

    const match = findLiveStripeKey(asset.text);
    if (match) return match;

    for (const nested of collectJavaScriptAssetUrls(asset.text, asset.url, baseUrl.origin)) {
      if (!visited.has(nested.href) && !queue.some((queued) => queued.href === nested.href)) {
        queue.push(nested);
      }
    }
  }

  return null;
}

function collectHtmlJavaScriptUrls(html, documentUrl, allowedOrigin) {
  const urls = [];
  const attributePattern = /\b(?:src|href)=["']([^"']+\.js(?:\?[^"']*)?)["']/gi;
  for (const match of html.matchAll(attributePattern)) {
    addSafeJavaScriptUrl(urls, match[1], documentUrl, allowedOrigin);
  }
  return urls;
}

function collectJavaScriptAssetUrls(source, documentUrl, allowedOrigin) {
  const urls = [];
  const assetPattern = /(?:https:\/\/[^"'`\s)]+)?\/?assets\/[A-Za-z0-9._/-]+\.js(?:\?[^"'`\s)]*)?/g;
  for (const match of source.matchAll(assetPattern)) {
    addSafeJavaScriptUrl(urls, match[0], documentUrl, allowedOrigin);
  }
  return urls;
}

function addSafeJavaScriptUrl(target, candidate, documentUrl, allowedOrigin) {
  try {
    const url = new URL(candidate, documentUrl);
    if (url.protocol !== "https:" || url.origin !== allowedOrigin || !/\.js$/i.test(url.pathname)) {
      return;
    }
    if (!target.some((existing) => existing.href === url.href)) {
      target.push(url);
    }
  } catch {
    // Ignore malformed asset references from generated bundles.
  }
}

async function fetchText(url, fetchImpl) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetchImpl(url, {
      headers: {
        Accept: "text/html,application/javascript,text/javascript;q=0.9,*/*;q=0.1",
        "User-Agent": "TOK-release-readiness/1.0",
      },
      redirect: "follow",
      signal: controller.signal,
    });
    if (!response?.ok) return null;

    const finalUrl = new URL(response.url || url.href);
    if (finalUrl.protocol !== "https:" || finalUrl.origin !== url.origin) return null;

    return {
      text: await response.text(),
      url: finalUrl,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function findLiveStripeKey(source) {
  const matches = String(source || "").match(/pk_live_[A-Za-z0-9]+/g) || [];
  return matches.find((candidate) => isLiveStripePublishableKey(candidate)) || null;
}

function readDotenvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  try {
    return parseDotenv(fs.readFileSync(filePath, "utf8"));
  } catch {
    return {};
  }
}

function persistForGitHubActions(value, options) {
  if (options.persistToGitHubEnv === false || !isLiveStripePublishableKey(value)) return;

  const githubEnv = cleanValue(options.githubEnvPath || process.env.GITHUB_ENV);
  if (!githubEnv) return;

  console.log(`::add-mask::${value}`);
  fs.appendFileSync(githubEnv, `VITE_STRIPE_PUBLISHABLE_KEY=${value}\n`, "utf8");
}

function cleanValue(value) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/^['"]|['"]$/g, "");
}

function missingLiveKeyError() {
  return new Error(
    "Missing VITE_STRIPE_PUBLISHABLE_KEY live publishable key. Configure a pk_live_... value in GitHub Actions or Vercel production.",
  );
}
