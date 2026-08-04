import { readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";

// `pnpm typecheck` only covers `src`, because Deno edge functions import from
// `npm:` and `https:` specifiers that tsc cannot resolve. That blind spot let a
// plain ReferenceError reach production: create-checkout referenced
// `signupApplicationId` from a scope where it was never declared, so every
// restaurant onboarding crashed after its Stripe session had been created.
//
// `noResolve` skips the unresolvable imports while still binding every
// identifier, so this catches an out-of-scope reference without needing Deno.
const FUNCTIONS_ROOT = resolve(process.cwd(), "supabase/functions");
const UNDECLARED_IDENTIFIER_CODES = new Set([2304, 2552]);
// Deno's globals are ambient in the edge runtime, not in tsc's lib set.
const RUNTIME_GLOBALS = new Set(["Deno", "EdgeRuntime"]);

function collectTypeScriptFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = join(directory, entry);
    if (statSync(entryPath).isDirectory()) return collectTypeScriptFiles(entryPath);
    return entryPath.endsWith(".ts") ? [entryPath] : [];
  });
}

describe("edge function identifier scopes", () => {
  // Binding every edge function costs a few seconds, and more when the rest of
  // the suite is competing for cores. Keep it well clear of the 5s default.
  it("never references an identifier that is out of scope at runtime", () => {
    const files = collectTypeScriptFiles(FUNCTIONS_ROOT);
    expect(files.length).toBeGreaterThan(0);

    const program = ts.createProgram(files, {
      noResolve: true,
      noEmit: true,
      skipLibCheck: true,
      allowJs: false,
      target: ts.ScriptTarget.ESNext,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      types: [],
    });

    const undeclared = files.flatMap((file) => {
      const sourceFile = program.getSourceFile(file);
      if (!sourceFile) return [];
      return program
        .getSemanticDiagnostics(sourceFile)
        .filter((diagnostic) => UNDECLARED_IDENTIFIER_CODES.has(diagnostic.code))
        .flatMap((diagnostic) => {
          const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, " ");
          const named = /Cannot find name '([^']+)'/.exec(message)?.[1];
          if (named && RUNTIME_GLOBALS.has(named)) return [];
          const { line } = sourceFile.getLineAndCharacterOfPosition(diagnostic.start ?? 0);
          return [`${relative(process.cwd(), file)}:${line + 1} ${message}`];
        });
    });

    expect(undeclared).toEqual([]);
  }, 120_000);
});
