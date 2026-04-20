import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const srcRoot = path.resolve(process.cwd(), "src");
const forbiddenImportPattern =
  /import\s*\{\s*supabase\s*\}\s*from\s*["']@\/integrations\/supabase\/client["'];?/;

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const entryPath = path.join(directory, entry);
    const entryStats = statSync(entryPath);

    if (entryStats.isDirectory()) {
      return collectSourceFiles(entryPath);
    }

    if (!/\.(ts|tsx)$/.test(entryPath)) {
      return [];
    }

    return [entryPath];
  });
}

describe("supabase client imports", () => {
  it("does not import the removed supabase export", () => {
    const offenders = collectSourceFiles(srcRoot)
      .filter((filePath) => filePath !== path.join(srcRoot, "integrations", "supabase", "client.ts"))
      .filter((filePath) => forbiddenImportPattern.test(readFileSync(filePath, "utf8")))
      .map((filePath) => path.relative(srcRoot, filePath).replace(/\\/g, "/"));

    expect(offenders).toEqual([]);
  });
});
