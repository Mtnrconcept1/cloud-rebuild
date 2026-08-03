#!/usr/bin/env node
/**
 * Fill the marketing prospect contacts with the coordinates held in the public
 * registry export that also feeds the commercial map.
 *
 * The 4843 Geneva restaurants were synchronised into marketing_contacts as bare
 * identifiers, because the catalogue table only carries a source_objectid. The
 * addresses, phone numbers and emails live in a static JSON asset instead of a
 * table, so they have to be pushed in from here.
 *
 * The script only ever fills gaps: the SQL side refuses to overwrite a value an
 * administrator qualified, and skips any contact that opted out or was
 * suppressed. Re-running it is therefore safe.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... \
 *     node scripts/import-marketing-prospect-coordinates.mjs [--dry-run]
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SOURCES = [
  { path: "public/data/geneva-commercial-prospects.json", label: "sitg" },
  { path: "public/data/thefork-geneva-commercial-prospects.json", label: "thefork" },
];

const BATCH_SIZE = 500;
const CANTON = "GE";

function readSource(relativePath) {
  try {
    const parsed = JSON.parse(readFileSync(resolve(process.cwd(), relativePath), "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    throw new Error(`Cannot read ${relativePath}: ${error.message}`);
  }
}

function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, max);
}

function cleanEmail(value) {
  const text = cleanText(value, 320);
  if (!text) return null;
  // A registry row occasionally carries several addresses in one cell, or a
  // placeholder. Only a single, plausible address is worth importing.
  if (/[;,\s]/.test(text)) return null;
  return /^[^@\s]+@[^@\s.]+\.[^@\s]+$/.test(text) ? text.toLowerCase() : null;
}

function cleanUrl(value) {
  const text = cleanText(value, 500);
  if (!text) return null;
  return /^https?:\/\//i.test(text) ? text : null;
}

function cleanPostalCode(value) {
  const text = cleanText(value, 10);
  return text && /^[0-9]{4}$/.test(text) ? text : null;
}

function cleanCoordinate(value, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || Math.abs(parsed) > max) return null;
  return Number(parsed.toFixed(6));
}

function toImportRow(record, label) {
  const sourceObjectId = Number(record.sourceObjectId);
  if (!Number.isInteger(sourceObjectId)) return null;

  return {
    source_objectid: String(sourceObjectId),
    display_name: cleanText(record.name ?? record.legalName, 160),
    email: cleanEmail(record.email),
    phone: cleanText(record.phone, 40),
    website: cleanUrl(record.website),
    street_address: cleanText(record.address, 240),
    postal_code: cleanPostalCode(record.postalCode),
    commune: cleanText(record.commune, 160),
    city: cleanText(record.locality ?? record.commune, 160),
    canton: CANTON,
    category: cleanText(record.category, 160),
    branch: cleanText(record.branch, 240),
    company_size: cleanText(record.companySize, 60),
    latitude: cleanCoordinate(record.latitude, 90),
    longitude: cleanCoordinate(record.longitude, 180),
    source: label,
    collected_at: cleanText(record.collectedAt, 40),
  };
}

async function callImport(config, rows) {
  const response = await fetch(
    `${config.url}/rest/v1/rpc/service_import_marketing_prospect_coordinates`,
    {
      method: "POST",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ p_rows: rows }),
    },
  );

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Import batch failed (${response.status}): ${text.slice(0, 500)}`);
  }
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const config = {
    url: (process.env.SUPABASE_URL || "").trim().replace(/\/+$/, ""),
    serviceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim(),
  };
  if (!dryRun && (!config.url || !config.serviceRoleKey)) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required (or pass --dry-run)");
  }

  // A source_objectid present in both exports must produce one row, and the
  // richer record has to win: TheFork carries coordinates for only 8% of its
  // entries, so letting it overwrite an SITG row would erase real data.
  const byId = new Map();
  const stats = { read: 0, malformed: 0, duplicates: 0 };

  for (const source of SOURCES) {
    for (const record of readSource(source.path)) {
      stats.read += 1;
      const row = toImportRow(record, source.label);
      if (!row) {
        stats.malformed += 1;
        continue;
      }
      const existing = byId.get(row.source_objectid);
      if (!existing) {
        byId.set(row.source_objectid, row);
        continue;
      }
      stats.duplicates += 1;
      for (const [key, value] of Object.entries(row)) {
        if (existing[key] === null && value !== null) existing[key] = value;
      }
    }
  }

  const rows = [...byId.values()];
  const reachable = {
    email: rows.filter((row) => row.email).length,
    phone: rows.filter((row) => row.phone).length,
    website: rows.filter((row) => row.website).length,
    geo: rows.filter((row) => row.latitude !== null && row.longitude !== null).length,
  };

  console.log(
    `read ${stats.read} records -> ${rows.length} unique prospects ` +
      `(${stats.duplicates} merged, ${stats.malformed} malformed)`,
  );
  console.log(
    `reachable: ${reachable.email} email, ${reachable.phone} phone, ` +
      `${reachable.website} website, ${reachable.geo} geolocated`,
  );

  if (dryRun) {
    console.log("dry run: nothing was sent");
    return;
  }

  const totals = { total: 0, updated: 0, skipped: 0 };
  for (let offset = 0; offset < rows.length; offset += BATCH_SIZE) {
    const batch = rows.slice(offset, offset + BATCH_SIZE);
    const result = await callImport(config, batch);
    totals.total += Number(result.total) || 0;
    totals.updated += Number(result.updated) || 0;
    totals.skipped += Number(result.skipped) || 0;
    console.log(
      `batch ${offset / BATCH_SIZE + 1}: ${Number(result.updated) || 0} updated, ` +
        `${Number(result.skipped) || 0} skipped`,
    );
  }

  console.log(`done: ${totals.updated} contacts enriched, ${totals.skipped} skipped`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
