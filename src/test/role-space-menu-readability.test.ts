import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const source = readFileSync(
  resolve(process.cwd(), "src/components/navigation/RoleSpaceMenuSection.tsx"),
  "utf8",
);

describe("role space menu readability", () => {
  it("wraps workspace labels and descriptions instead of truncating them", () => {
    expect(source).toContain(
      'className="block whitespace-normal break-words text-sm font-extrabold leading-5"',
    );
    expect(source).toContain(
      '"block whitespace-normal break-words text-xs leading-snug"',
    );
    expect(source).not.toContain("block truncate text-sm font-extrabold leading-5");
    expect(source).not.toContain("block truncate text-xs leading-snug");
  });
});
