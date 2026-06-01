import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

describe("admin notifications governance", () => {
  it("exposes preview, test, duplication, scheduler and unsubscribe safeguards", () => {
    const page = readFileSync(resolve(root, "src/pages/admin/AdminNotifications.tsx"), "utf8");

    expect(page).toContain("Preview multi-canal");
    expect(page).toContain("Envoyer un test");
    expect(page).toContain("duplicateCampaign");
    expect(page).toContain("Dernier run scheduler");
    expect(page).toContain("Desabonnement marketing");
    expect(page).toContain("cancelCampaign");
    expect(page).toContain("failed");
    expect(page).toContain("cancelled");
    expect(page).not.toContain('.from("notification_campaigns").delete');
  });
});
