import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import HalloweenTheme, { HalloweenCanopy } from "@/components/seasonal/HalloweenTheme";

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset.seasonalTheme;
});

describe("HalloweenTheme", () => {
  it("renders the full-width decorative image as a child of the sticky header", () => {
    const { container } = render(<header className="tok-site-header"><HalloweenCanopy /></header>);
    const canopy = container.querySelector("header > .tok-halloween-canopy");
    const image = canopy?.querySelector("img");

    expect(canopy?.getAttribute("aria-hidden")).toBe("true");
    expect(image?.getAttribute("src")).toBe("/images/seasonal/halloween/canopy.webp");
    expect(image?.getAttribute("alt")).toBe("");
  });


  it("applies the seasonal theme and removes it immediately when disabled", () => {
    const { rerender } = render(<HalloweenTheme enabled />);

    expect(document.documentElement.dataset.seasonalTheme).toBe("halloween");
    rerender(<HalloweenTheme enabled={false} />);

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });

  it("cleans the document attribute when the themed surface unmounts", () => {
    const { unmount } = render(<HalloweenTheme enabled />);

    unmount();

    expect(document.documentElement.dataset.seasonalTheme).toBeUndefined();
  });
});

// BEGIN TOK TEMP REGEN PROBE
it("TOK regenerate derived docs for isolated recovery (temporary probe)", async () => {
  const { execFileSync } = await import("node:child_process");
  const { readFileSync, writeFileSync } = await import("node:fs");
  const { resolve } = await import("node:path");
  const root = process.cwd();
  const ownPath = resolve(root, "src/test/halloween-seasonal-theme.test.tsx");
  const ownContent = readFileSync(ownPath, "utf8");
  const start = ownContent.indexOf("\n// BEGIN TOK TEMP REGEN PROBE");
  const endMarker = "// END TOK TEMP REGEN PROBE\n";
  const end = ownContent.indexOf(endMarker, start);
  if (start < 0 || end < 0) throw new Error("Cannot strip temporary probe");
  writeFileSync(ownPath, ownContent.slice(0, start) + ownContent.slice(end + endMarker.length));
  const indexFile = "docs/architecture/tok-application-search-index.json";
  const markdownFile = "docs/architecture/TOK_APPLICATION_REFERENCE.md";
  const oldIndex = JSON.parse(readFileSync(resolve(root, indexFile), "utf8"));
  execFileSync(process.execPath, ["scripts/generate-application-index.mjs"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 16_000_000,
  });
  const newIndex = JSON.parse(readFileSync(resolve(root, indexFile), "utf8"));
  const operations = [];
  const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const walk = (a, b, path) => {
    if (equal(a, b)) return;
    if (Array.isArray(a) && Array.isArray(b)) {
      const identity = ["id", "path", "name", "route"].find((key) => (
        [...a, ...b].every((item) => item && typeof item === "object"
          && !Array.isArray(item) && ["string", "number"].includes(typeof item[key]))
        && new Set(a.map((item) => item[key])).size === a.length
        && new Set(b.map((item) => item[key])).size === b.length
      ));
      if (identity) {
        const oldByKey = new Map(a.map((v) => [v[identity], v]));
        const newByKey = new Map(b.map((v) => [v[identity], v]));
        for (const item of a) {
          if (!newByKey.has(item[identity])) operations.push({ action: "remove", path, key: identity, id: item[identity] });
        }
        for (let j = 0; j < b.length; j++) {
          const item = b[j];
          if (!oldByKey.has(item[identity])) operations.push({ action: "insert", path, at: j, item });
          else walk(oldByKey.get(item[identity]), item, [...path, { by: identity, id: item[identity] }]);
        }
        return;
      }
      if (a.length === b.length) {
        a.forEach((item, index) => walk(item, b[index], [...path, index]));
        return;
      }
    }
    if (a !== null && b !== null && typeof a === "object" && typeof b === "object"
      && !Array.isArray(a) && !Array.isArray(b)) {
      for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
        if (!(key in b)) operations.push({ action: "delete", path: [...path, key] });
        else if (!(key in a)) operations.push({ action: "set", path: [...path, key], value: b[key] });
        else walk(a[key], b[key], [...path, key]);
      }
      return;
    }
    operations.push({ action: "set", path, value: b });
  };
  walk(oldIndex, newIndex, []);
  const diff = execFileSync("git", ["diff", "-U1", "--", markdownFile], {
    cwd: root, encoding: "utf8", maxBuffer: 5_000_000,
  });
  const serialized = JSON.stringify(operations);
  console.log("TOK_REGEN_REPORT " + JSON.stringify({
    oldDigest: oldIndex.sourceDigest,
    newDigest: newIndex.sourceDigest,
    opCount: operations.length,
    opLength: serialized.length,
    markdownDiffLength: diff.length,
  }));
  console.log("TOK_REGEN_JSON_PATCH " + serialized);
  console.log("TOK_REGEN_MARKDOWN_PATCH_START\n" + diff + "\nTOK_REGEN_MARKDOWN_PATCH_END");
});
// END TOK TEMP REGEN PROBE
