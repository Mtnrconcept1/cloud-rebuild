import { readFileSync, writeFileSync } from "node:fs";

const path = "supabase/functions/tok-connect-mcp/index.ts";
const lines = readFileSync(path, "utf8").split(/\r?\n/);
const output = [];
let state = "normal";
let resolved = 0;

for (const line of lines) {
  if (state === "normal") {
    if (line.startsWith("<<<<<<<")) {
      state = "keep";
      resolved += 1;
      continue;
    }
    output.push(line);
    continue;
  }

  if (state === "keep") {
    if (line === "=======") {
      state = "skip";
      continue;
    }
    output.push(line);
    continue;
  }

  if (state === "skip") {
    if (line.startsWith(">>>>>>>")) {
      state = "normal";
    }
  }
}

if (state !== "normal") {
  throw new Error(`unterminated MCP merge conflict (${state})`);
}

const source = output.join("\n");
const marker = /^(<<<<<<<(?: .*)?|=======|>>>>>>>\s*(?:.*)?)$/m;
if (marker.test(source)) {
  throw new Error("tok-connect-mcp still contains an actual merge-conflict line marker");
}

writeFileSync(path, `${source.replace(/\n+$/, "")}\n`, "utf8");
console.log(`TOK Connect MCP conflict blocks cleaned: ${resolved}.`);
