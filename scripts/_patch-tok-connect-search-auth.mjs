import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/functions/tok-connect-chatgpt/index.ts";
let source = readFileSync(path, "utf8");

const oldDescription = 'description: "Search the live TOK restaurant catalogue for ChatGPT knowledge and discovery. Authenticated users receive their authorized production view; unauthenticated calls remain sandbox-safe.",';
const newDescription = 'description: "Search the live TOK restaurant catalogue for an authenticated TOK Connect user within the scopes and grants authorized by TOK.",\n    securitySchemes: OAUTH_SECURITY,';
if (!source.includes(oldDescription)) throw new Error("search description marker missing");
source = source.replace(oldDescription, newDescription);

const oldAnnotation = '    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },\n  },\n  {\n    name: "fetch",';
const newAnnotation = '    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false, idempotentHint: true },\n    _meta: { securitySchemes: OAUTH_SECURITY, ...TOOL_UI_META },\n  },\n  {\n    name: "fetch",';
if (!source.includes(oldAnnotation)) throw new Error("search annotation marker missing");
source = source.replace(oldAnnotation, newAnnotation);

writeFileSync(path, source, "utf8");
console.log("TOK Connect standard search now requires OAuth explicitly.");
