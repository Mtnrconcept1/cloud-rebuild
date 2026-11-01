// The SQL is private. Pipe directly to psql on the intended project or use the
// generated statement through the authenticated Supabase connector.
import { readFileSync } from "node:fs";
import { parseSearchSnapshot } from "../src/marketing/growth/searchConsole.ts";

if (process.argv.length !== 3) throw new Error("Usage: node --experimental-strip-types scripts/import-marketing-search-console.mts <relevé.json>");
const raw = readFileSync(process.argv[2], "utf8");
const snapshot = JSON.parse(raw);
const report = parseSearchSnapshot(snapshot);
if (!report.observedDays) throw new Error("Aucune journée observée. Le relevé précédent est conservé.");
const json = JSON.stringify({ property: report.property, from: report.from, to: report.to, daily: snapshot.daily, queries: snapshot.queries });
if (Buffer.byteLength(json, "utf8") > 700000) throw new Error("Relevé privé trop volumineux.");
const payload = Buffer.from(json, "utf8").toString("base64");
process.stdout.write(`WITH input AS (SELECT convert_from(decode('${payload}', 'base64'), 'UTF8')::jsonb AS doc)
INSERT INTO public.marketing_search_console_report AS current_report (property, period_end, snapshot)
SELECT doc->>'property', (doc->>'to')::date, doc FROM input
ON CONFLICT (property) DO UPDATE SET period_end=EXCLUDED.period_end, snapshot=EXCLUDED.snapshot, imported_at=now()
WHERE EXCLUDED.period_end >= current_report.period_end AND EXCLUDED.snapshot IS DISTINCT FROM current_report.snapshot;
`);
