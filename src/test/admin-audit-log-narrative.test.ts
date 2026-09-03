import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  describeAuditLog,
  explainAuditError,
  summarizeAuditLog,
  type AuditNarrativeInput,
} from "@/lib/admin/auditLogNarrative";

const read = (path: string) => readFileSync(resolve(process.cwd(), path), "utf8");

function edgeLog(overrides: Partial<AuditNarrativeInput> = {}): AuditNarrativeInput {
  return {
    source: "edge",
    action: "send-email:process_email_queue",
    functionName: "send-email",
    status: "success",
    actorLabel: "scheduler",
    actorType: "scheduler",
    targetType: "edge",
    targetId: "",
    errorMessage: null,
    ...overrides,
  };
}

function dataLog(overrides: Partial<AuditNarrativeInput> = {}): AuditNarrativeInput {
  return {
    source: "data",
    action: "UPDATE",
    functionName: "restaurants",
    status: "info",
    actorLabel: "a1b2c3d4",
    actorType: "user",
    targetType: "restaurants",
    targetId: "rest-123",
    ...overrides,
  };
}

/** Anything a human would have to decode mentally. */
function containsRawJargon(text: string) {
  return /_[a-z]/.test(text) || /\b[a-z]+(?:-[a-z]+){2,}\b/.test(text);
}

describe("admin audit log narrative", () => {
  it("never surfaces a raw snake_case identifier as the headline", () => {
    const samples: AuditNarrativeInput[] = [
      edgeLog(),
      edgeLog({ status: "failure", errorMessage: "ops_control_secret_not_configured", functionName: "ops-incident-native-scan", action: "ops-incident-native-scan:scan_runtime_incidents" }),
      edgeLog({ status: "failure", errorMessage: "Unauthorized" }),
      edgeLog({ functionName: "stripe-worker", action: "stripe-worker:process_restaurant_subscription_activations" }),
      dataLog(),
      dataLog({ action: "DELETE", targetType: "orders" }),
      dataLog({ action: "admin_set_user_roles", targetType: "user_roles" }),
    ];

    for (const sample of samples) {
      const headline = summarizeAuditLog(sample);
      expect(headline.length).toBeGreaterThan(20);
      expect(containsRawJargon(headline), `jargon brut dans « ${headline} »`).toBe(false);
      expect(headline).toMatch(/\.$/);
    }
  });

  it("keeps French hyphenated words intact in already-translated labels", () => {
    // Regression: the identifier humanizer was applied to French strings and
    // turned "e-mails" into "e mails".
    const narrative = describeAuditLog(edgeLog());
    expect(narrative.headline).toContain("e-mails");
    expect(narrative.what).toContain("e-mails");
    expect(narrative.headline).not.toContain("e mails");
  });

  it("explains every error message that actually occurs in production", () => {
    // Vocabulary sampled from edge_function_audit_logs over 30 days: these are
    // the messages an operator really sees, ordered by volume.
    const productionErrors = [
      "Unauthorized",
      "Missing stripe-signature header",
      "ops_control_secret_not_configured",
      "No signatures found matching the expected signature for payload.",
      "Cannot read properties of undefined (reading 'object')",
      "Le paiement Stripe test n'est pas configuré",
      "PAYMENT_ATTEMPT_ABANDON_FAILED:payment_attempt_session_mismatch",
      "Erreur interne",
      'Resend API error: 403 - {"statusCode":403,"message":"The thetok.ch domain is not verified."}',
      "restaurant_subscription_invoice_paid_rpc_failed:deferred_subscription_contract_snapshot_is_immutable",
      "ai_timeout",
      "original_payment_ledger_missing",
      "DEMO_SIDE_EFFECT_BLOCKED: cette action externe est désactivée dans le restaurant de démonstration.",
      "Le restaurant est ferme sur ce creneau.",
      "{}",
      "Please review the responsibilities of managing losses for connected accounts",
      "ai_rate_limited",
      "payment_intent_id_required",
      "recovery_email_delivery_failed",
      'null value in column "metadata" of relation "ai_messages" violates not-null constraint',
      "Authentification requise",
      "Le mot de passe doit contenir au moins 12 caractères",
      "method_not_allowed",
      "response_type_code_required",
      "Ce restaurant ne prend pas de commandes pour le moment.",
      "Session Stripe non payee.",
    ];

    for (const message of productionErrors) {
      const explanation = explainAuditError(message);
      expect(explanation, `message non expliqué : ${message}`).not.toBeNull();
      expect(explanation!.cause.length).toBeGreaterThan(40);
      expect(explanation!.impact.length).toBeGreaterThan(20);
      expect(explanation!.recommendation.length).toBeGreaterThan(20);
    }
  });

  it("states cause, consequence and next step for a recognised failure", () => {
    const narrative = describeAuditLog(edgeLog({
      status: "failure",
      functionName: "ops-incident-native-scan",
      action: "ops-incident-native-scan:scan_runtime_incidents",
      errorMessage: "ops_control_secret_not_configured",
    }));

    expect(narrative.causeIdentified).toBe(true);
    expect(narrative.headline).toContain("planificateur automatique TOK");
    expect(narrative.what).toContain("incidents");
    expect(narrative.cause).toContain("secret");
    expect(narrative.impact).toContain("détection");
    expect(narrative.recommendation).toContain("production");
  });

  it("stays readable when the error code is unknown, without hiding the raw message", () => {
    const narrative = describeAuditLog(edgeLog({
      status: "failure",
      errorMessage: "quantum_flux_desynchronised",
    }));

    expect(narrative.causeIdentified).toBe(false);
    expect(narrative.cause).toContain("quantum_flux_desynchronised");
    expect(narrative.cause).toContain("pas encore traduit");
    expect(narrative.recommendation.length).toBeGreaterThan(20);
  });

  it("describes direct database changes with the right verb and warns on deletions", () => {
    const updated = describeAuditLog(dataLog({ action: "UPDATE", targetType: "restaurants" }));
    expect(updated.headline).toContain("a modifié");
    expect(updated.headline).toContain("la fiche d’un restaurant");

    const deleted = describeAuditLog(dataLog({ action: "DELETE", targetType: "orders" }));
    expect(deleted.headline).toContain("a supprimé");
    expect(deleted.headline).toContain("une commande");
    expect(deleted.impact).toContain("réversible");
  });

  it("names Stripe webhook events instead of echoing the event key", () => {
    const refund = describeAuditLog(edgeLog({
      functionName: "stripe-webhook",
      action: "stripe-webhook:charge.refunded",
      actorType: "service_role",
      actorLabel: "service_role",
    }));

    expect(refund.what).toContain("remboursé");
    expect(refund.what).not.toContain("charge.refunded");
  });

  it("distinguishes the scheduler, internal services and real users", () => {
    expect(summarizeAuditLog(edgeLog({ actorType: "scheduler" }))).toContain("planificateur automatique");
    expect(summarizeAuditLog(edgeLog({ actorType: "service_role" }))).toContain("service interne");
    expect(summarizeAuditLog(edgeLog({ actorType: "user", actorLabel: "u-42" }))).toContain("L’utilisateur u-42");
  });

  it("names every active Edge Function so no audit log falls back to its slug", () => {
    const module = read("src/lib/admin/auditLogNarrative.ts");
    const dictionary = module.split("const FUNCTION_PURPOSE")[1].split("};")[0];
    const covered = new Set(Array.from(dictionary.matchAll(/"([a-z0-9-]+)":/g), (match) => match[1]));

    const deployed = readdirSync(resolve(process.cwd(), "supabase/functions"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("_"))
      .map((entry) => entry.name);

    const retiredWithoutAuditSideEffects = new Set(
      deployed.filter((name) => {
        const source = read(`supabase/functions/${name}/index.ts`);
        return source.includes("STRIPE_SETUP_RETIRED")
          && source.includes("status: 410")
          && !/Deno\.env|getStripe|STRIPE_SECRET|service[_-]?role/i.test(source);
      }),
    );

    expect(deployed.length).toBeGreaterThan(50);
    expect(retiredWithoutAuditSideEffects).toEqual(new Set(["stripe-setup"]));
    const missing = deployed.filter((name) => !covered.has(name) && !retiredWithoutAuditSideEffects.has(name));
    expect(missing, `fonctions sans description métier : ${missing.join(", ")}`).toEqual([]);
  });

  it("is wired into the admin security page instead of the raw summary column", () => {
    const page = read("src/pages/admin/AdminAuditLogs.tsx");

    expect(page).toContain("describeAuditLog");
    expect(page).toContain("getAuditNarrative");
    expect(page).toContain("Ce qui s’est passé");
    expect(page).toContain("Message technique brut");
    expect(page).toContain("Pourquoi cela s’est produit");

    // The old opaque fallbacks must be gone from the table.
    expect(page).not.toContain("Cette opération a été enregistrée sans anomalie détaillée.");
    expect(page).not.toContain("const summary = `${targetType} ${targetId}`.trim();");
  });
});
