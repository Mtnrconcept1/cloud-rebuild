import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("./app-store-connect-tok-one.mjs", import.meta.url);
const runtimePath = new URL("./.app-store-connect-tok-one-v2-runtime.mjs", import.meta.url);

const source = await readFile(sourcePath, "utf8");
const legacy = '  const startDate = new Date().toISOString().slice(0, 10);';
const replacement = [
  '  const priceStart = new Date();',
  '  priceStart.setUTCDate(priceStart.getUTCDate() + 1);',
  '  const startDate = priceStart.toISOString().slice(0, 10);',
].join("\n");

if (!source.includes(legacy)) {
  throw new Error("Expected Tok One price start-date expression was not found.");
}

await writeFile(runtimePath, source.replace(legacy, replacement), "utf8");
try {
  await import(`${runtimePath.href}?v=${Date.now()}`);
} finally {
  await writeFile(runtimePath, "// generated only during App Store setup\n", "utf8").catch(() => undefined);
}
