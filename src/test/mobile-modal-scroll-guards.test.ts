import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function readProjectFile(path: string) {
  const absolutePath = resolve(root, path);
  expect(existsSync(absolutePath), `${path} should exist`).toBe(true);
  return readFileSync(absolutePath, "utf8");
}

describe("mobile modal scroll guards", () => {
  it("keeps shared dialog primitives bounded and scrollable on small screens", () => {
    const dialog = readProjectFile("src/components/ui/dialog.tsx");
    const alertDialog = readProjectFile("src/components/ui/alert-dialog.tsx");

    for (const source of [dialog, alertDialog]) {
      expect(source).toContain("max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)]");
      expect(source).toContain("w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)]");
      expect(source).toContain("overflow-y-auto");
      expect(source).toContain("overscroll-contain");
      expect(source).toContain("env(safe-area-inset-bottom");
    }
  });

  it("keeps long client modals scrollable with reachable actions", () => {
    const reservation = readProjectFile("src/components/ReservationDialog.tsx");
    const chefTable = readProjectFile("src/components/ChefTableSlotDialog.tsx");
    const upsell = readProjectFile("src/components/cart/UpsellModal.tsx");

    for (const source of [reservation, chefTable, upsell]) {
      expect(source).toContain("flex max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] flex-col");
      expect(source).toContain("overflow-y-auto overscroll-contain");
      expect(source).toContain("env(safe-area-inset-bottom");
    }
  });
});
