import { readFileSync } from "node:fs";
import path from "node:path";
import {
  INDEX_JSON_PATH,
  REPOSITORY_ROOT,
  hydrateApplicationSearchResults,
  searchApplicationIndex,
} from "./application-index-core.mjs";

const args = process.argv.slice(2);
const options = { limit: 20 };
const queryParts = [];
let json = false;
for (const argument of args) {
  if (argument === "--json") json = true;
  else if (argument.startsWith("--type=")) options.type = argument.slice("--type=".length);
  else if (argument.startsWith("--surface=")) options.surface = argument.slice("--surface=".length);
  else if (argument.startsWith("--limit=")) options.limit = Number.parseInt(argument.slice("--limit=".length), 10);
  else queryParts.push(argument);
}

const index = JSON.parse(readFileSync(path.join(REPOSITORY_ROOT, INDEX_JSON_PATH), "utf8"));
const matches = searchApplicationIndex(index.records, queryParts.join(" "), options);
const results = json ? hydrateApplicationSearchResults(index, matches) : matches;

if (json) {
  console.log(JSON.stringify(results, null, 2));
} else if (!results.length) {
  console.log("Aucun résultat.");
  process.exitCode = 1;
} else {
  console.log(`${results.length} résultat(s) sur ${index.records.length} entrées :`);
  for (const result of results) {
    const location = result.path ? `${result.path}${result.line ? `:${result.line}` : ""}` : "sans fichier";
    console.log(`- [${result.type}] ${result.title} — ${location}`);
    if (result.description) console.log(`  ${result.description}`);
  }
}
