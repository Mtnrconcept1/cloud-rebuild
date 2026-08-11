import { readFile, writeFile } from "node:fs/promises";

const sourcePath = new URL("./app-store-connect-tok-one.mjs", import.meta.url);
const runtimePath = new URL("./.app-store-connect-tok-one-v3-runtime.mjs", import.meta.url);

const source = await readFile(sourcePath, "utf8");
const legacy = [
  "        attributes: {",
  "          startDate,",
  "          preserveCurrentPrice: false,",
  "        },",
].join("\n");
const replacement = [
  "        attributes: {",
  "          // A subscription must have a starting price before Apple accepts",
  "          // dated future price changes. null means the current starting price.",
  "          startDate: null,",
  "          preserveCurrentPrice: false,",
  "        },",
].join("\n");

if (!source.includes(legacy)) {
  throw new Error("Expected Tok One initial subscription-price attributes were not found.");
}

await writeFile(runtimePath, source.replace(legacy, replacement), "utf8");
try {
  await import(`${runtimePath.href}?v=${Date.now()}`);
} finally {
  await writeFile(runtimePath, "// generated only during App Store setup\n", "utf8").catch(() => undefined);
}
