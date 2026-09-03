import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/functions/tok-connect-mcp/index.ts";
let source = readFileSync(path, "utf8");
const conflict = /^<<<<<<< Updated upstream\r?\n([\s\S]*?)^=======\r?\n([\s\S]*?)^>>>>>>> Stashed changes\r?\n?/m;
const match = source.match(conflict);
if (match) {
  source = source.replace(conflict, `${match[1]}\n`);
}
const marker = /^(<<<<<<<(?: .*)?|=======|>>>>>>>\s*(?:.*)?)\r?$/m;
if (marker.test(source)) {
  throw new Error("tok-connect-mcp still contains an actual merge-conflict line marker");
}
writeFileSync(path, source, "utf8");
console.log("TOK Connect MCP conflict markers cleaned.");
