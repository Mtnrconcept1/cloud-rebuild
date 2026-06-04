import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("customer order tracking fallback", () => {
  it("does not advance a delivery to completed with local simulation timers", () => {
    const page = read("src/pages/SuiviCommande.tsx");

    expect(page).not.toContain("SIMULATION_PHASE_SECONDS");
    expect(page).not.toContain("simulationPhase");
    expect(page).not.toContain("simulationCountdown");
    expect(page).not.toContain("setSimulationPhase");
    expect(page).not.toContain("generateRoute");
    expect(page).not.toContain("window.setTimeout");
    expect(page).toContain("hasLiveCourierFlow ? liveTracking : null");
    expect(page).toContain("Statut restaurant");
    expect(page).toContain("Aucun flux livreur n'est encore disponible");
  });
});
