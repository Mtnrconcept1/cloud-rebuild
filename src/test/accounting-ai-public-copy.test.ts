import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  formatAccountingAiResultForDisplay,
  formatAccountingAiText,
} from "@/lib/ai/accountingPublicCopy";

const RESTAURANT_ID = "bcaf6ede-2c43-4278-a516-4a3f5cde10b3";
const rootDir = process.cwd();

function readProjectFile(path: string) {
  return readFileSync(join(rootDir, path), "utf8");
}

describe("accounting AI public copy", () => {
  it("replaces technical restaurant identifiers with the restaurant display name", () => {
    const text = `Résumé mensuel pour le restaurant ${RESTAURANT_ID} avec 14 commandes.`;

    const formatted = formatAccountingAiText(text, "Quirinale");

    expect(formatted).toContain("Quirinale");
    expect(formatted).not.toContain(RESTAURANT_ID);
  });

  it("removes backend wording and raw technical statuses from visible recommendations", () => {
    const text = "Contrôler les commandes en pending_payment / preparing / accepted et le détail Stripe avant le cut-off.";

    const formatted = formatAccountingAiText(text, "Quirinale");

    expect(formatted).toContain("paiement en attente");
    expect(formatted).toContain("en préparation");
    expect(formatted).toContain("acceptée");
    expect(formatted).not.toMatch(/pending_payment|preparing|accepted|Stripe|cut-off/i);
  });

  it("keeps sanitized backend references readable", () => {
    const formatted = formatAccountingAiText("Prévision limitée par les données backend.", "Quirinale");

    expect(formatted).toBe("Prévision limitée par les données disponibles.");
  });

  it("sanitizes every visible and exported field from an accounting AI result", () => {
    const result = formatAccountingAiResultForDisplay({
      summary: `Résumé pour le restaurant ${RESTAURANT_ID}.`,
      anomalies: [{ label: "Statut pending_payment", severity: "medium", evidence: `restaurant_id ${RESTAURANT_ID}` }],
      unpaid_invoices: [`Facture ${RESTAURANT_ID}`],
      risky_restaurants: [RESTAURANT_ID],
      revenue_forecast: "Prévision limitée par les données backend.",
      margin_notes: ["Frais Stripe à vérifier."],
      recommended_actions: ["Éviter les écarts de cut-off."],
      export_markdown: `# Rapport\nRestaurant ${RESTAURANT_ID}\nStatut pending_payment`,
      insightId: "insight-1",
    }, "Quirinale");

    const serialized = JSON.stringify(result);

    expect(serialized).toContain("Quirinale");
    expect(serialized).not.toContain(RESTAURANT_ID);
    expect(serialized).not.toMatch(/backend|pending_payment|Stripe|cut-off/i);
  });

  it("keeps dashboard display, exports, and generation wired to public accounting copy", () => {
    const dashboard = readProjectFile("src/pages/dashboard/DashboardFactures.tsx");
    const admin = readProjectFile("src/pages/admin/AdminComptaAi.tsx");
    const edgeFunction = readProjectFile("supabase/functions/ai-accounting-agent/index.ts");

    expect(dashboard).toContain("restaurantName,");
    expect(dashboard).toContain("formatAccountingAiResultForDisplay(result, restaurantName)");
    expect(dashboard).toContain("formatAccountingAiText(insight.summary, restaurantName)");
    expect(admin).toContain("formatAccountingAiResultForDisplay(result)");
    expect(admin).not.toContain("JSON.stringify(result.metrics");
    expect(edgeFunction).toContain("name: restaurantDisplayName");
    expect(edgeFunction).toContain("sanitizeAccountingResult(");
    expect(edgeFunction).toContain("N'affiche jamais d'identifiant technique");
    expect(edgeFunction).toContain('.select("order_id, amount, status, type, created_at")');
    expect(edgeFunction).not.toContain("stripe_payment_intent_id");
  });
});
