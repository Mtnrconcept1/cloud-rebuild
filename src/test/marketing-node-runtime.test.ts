import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import ts from "typescript";
import { expect, it } from "vitest";

it("boots the emitted marketing BFF in plain Node without a TypeScript loader", () => {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
  const output = mkdtempSync(path.join(tmpdir(), "tok-marketing-runtime-"));
  const visited = new Set<string>();
  const emit = (file: string) => {
    if (visited.has(file)) return;
    visited.add(file);
    const source = readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, {
      fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
    }).outputText;
    const target = path.join(output, path.relative(root, file)).replace(/\.ts$/, ".js");
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, compiled);
    // Vercel emits JavaScript files; a surviving .ts runtime specifier cannot load them.
    for (const match of compiled.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) {
      emit(path.resolve(path.dirname(file), match[1]).replace(/\.js$/, ".ts"));
    }
  };
  try {
    writeFileSync(path.join(output, "package.json"), '{"type":"module"}');
    emit(path.join(root, "server/marketingBff.ts"));
    const entry = pathToFileURL(path.join(output, "server/marketingBff.js")).href;
    const child = spawnSync(process.execPath, ["--input-type=module", "-e", `
      const { marketingSessionHandler } = await import(${JSON.stringify(entry)});
      const response = { statusCode: 0, setHeader() {}, end(body) { this.body = body; } };
      await marketingSessionHandler({ method: "GET", headers: { host: "marketing.thetok.ch" } }, response);
      if (response.statusCode !== 401) throw new Error("Expected unauthenticated session 401, got " + response.statusCode);
    `], { encoding: "utf8", timeout: 10000 });
    expect(child.status, child.stderr || child.error?.message).toBe(0);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}, 15000);
