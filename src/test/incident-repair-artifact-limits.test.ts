import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const workflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/incident-codex-repair.yml"),
  "utf8",
);

describe("incident repair artifact isolation", () => {
  it("stores the sanitized context in a private read-only directory", () => {
    expect(workflow).toContain("chmod 700 .codex-runtime");
    expect(workflow).toContain(
      "chmod 400 .codex-runtime/incident-context.json",
    );
  });

  it("caps every generated file before an artifact is created", () => {
    expect(workflow).toContain("MAX_REPAIR_FILE_BYTES=5242880");
    expect(workflow).toContain('FILE_SIZE="$(stat -c \'%s\' -- "$FILE")"');
    expect(workflow).toContain(
      'if (( FILE_SIZE > MAX_REPAIR_FILE_BYTES )); then',
    );
    expect(workflow).toContain(
      "Repair file exceeds the 5 MiB per-file safety limit.",
    );
  });

  it("rechecks the same per-file limit on the fresh publishing runner", () => {
    const occurrences = workflow.match(/MAX_REPAIR_FILE_BYTES=5242880/g) || [];
    expect(occurrences).toHaveLength(2);
    expect(workflow).toContain(
      "File exceeds the 5 MiB publishing safety limit.",
    );
  });
});
