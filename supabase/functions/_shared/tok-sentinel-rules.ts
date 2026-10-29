/**
 * TOK Sentinel: deterministic read-only correlation.
 * AI analyses are advisory. Only dual independent and fresh verified evidence
 * from authenticated sensors may authorize an automatic global proposal.
 */
export type SentinelCategory =
  | "authorization_probing"
  | "payment_abuse"
  | "distributed_probing"
  | "confirmed_rls_bypass"
  | "confirmed_privilege_compromise"
  | "confirmed_destructive_activity";
export type SentinelScope = "account" | "restaurant" | "payments" | "administration" | "global";

export interface SentinelAudit {
  id: string;
  created_at: string;
  function_name: string;
  action: string;
  status: string;
  error_message: string | null;
  actor_user_id: string | null;
  request_metadata: Record<string, unknown> | null;
}
export interface SentinelFinding {
  category: SentinelCategory;
  scope: SentinelScope;
  severity: "high" | "critical";
  correlationKey: string; // Internal only: hash before persistence or notification.
  count: number;
  evidenceIds: string[];
  functions: string[];
  observedAt: string;
  summary: string;
  recommended: ReturnType<typeof sentinelReport>;
}
export interface CriticalProof {
  category: "confirmed_rls_bypass" | "confirmed_privilege_compromise" | "confirmed_destructive_activity";
  source: "database_guard" | "runtime_integrity" | "independent_monitor";
  verified: boolean;
  observedAt: string;
  evidenceRef: string;
}
const UUID = /^[a-f0-9]{8}-[a-f0-9-]{27,40}$/i;
const DENIED = /(?:forbidden|unauthorized|permission.denied|rls|ownership|access.denied|tenant|not.allowed)/i;
const FINANCIAL_FUNCTIONS = new Set([
  "create-checkout", "complete-order-checkout", "process-refund",
  "stripe-connect-onboard", "manage-restaurant-subscription",
]);
const AUTO_CRITICAL = new Set([
  "confirmed_rls_bypass", "confirmed_privilege_compromise", "confirmed_destructive_activity",
]);

export function allowAutomaticGlobalContainment(
  category: SentinelCategory, proofs: CriticalProof[], now: number,
  explicitlyEnabled: boolean, independentEnforcementReady: boolean,
): boolean {
  if (!explicitlyEnabled || !independentEnforcementReady || !AUTO_CRITICAL.has(category)) return false;
  const sources = new Set<CriticalProof["source"]>();
  for (const proof of proofs) {
    const observed = Date.parse(proof.observedAt);
    if (proof.category !== category || !proof.verified || !UUID.test(proof.evidenceRef)) continue;
    if (!Number.isFinite(observed) || observed > now + 30_000 || now - observed > 180_000) continue;
    sources.add(proof.source);
  }
  return sources.has("independent_monitor") &&
    (sources.has("database_guard") || sources.has("runtime_integrity"));
}

const STEPS: Record<SentinelCategory, string[]> = {
  authorization_probing: [
    "Identifier les roles et tenants vises dans les journaux immuables.",
    "Tester les politiques RLS et les fonctions privees dans un environnement isole.",
    "Limiter les acces verifies comme abusifs, revoquer les sessions compromises.",
  ],
  payment_abuse: [
    "Verifier les transactions dans le compte Stripe reel sans suspendre les webhooks.",
    "Limiter les nouvelles tentatives suspectes et maintenir la reconciliation.",
    "Comparer les journaux et la comptabilite avant toute reprise.",
  ],
  distributed_probing: [
    "Correlier les signatures et analyser les periodes de tentatives.",
    "Verifier les limitations de debit et protections de perimetre.",
    "Tester l'isolation multi-restaurants et les privilèges.",
  ],
  confirmed_rls_bypass: [
    "Restreindre immediatement les lectures privilegiees affectees.",
    "Auditer les SECURITY DEFINER, GRANT, RLS et droits Storage.",
    "Valider le correctif avec des comptes de plusieurs restaurants.",
  ],
  confirmed_privilege_compromise: [
    "Revoquer les identifiants et secrets compromis via un canal distinct.",
    "Reconstituer les modifications de roles et secrets.",
    "Revalider MFA, sessions et historique avant reouverture.",
  ],
  confirmed_destructive_activity: [
    "Suspendre les ecritures destructrices et preservers les preuves.",
    "Verifier l'integrite des donnees et sauvegardes immuables.",
    "Rejouer les transactions manquantes uniquement apres rapprochement.",
  ],
};
export function sentinelReport(category: SentinelCategory, count: number, functions: string[]) {
  return {
    assessment: "Signal technique a verifier; un echec ou une rafale ne prouve jamais une intrusion.",
    evidence: { event_count: count, affected_functions: functions.slice(0, 12) },
    repair_steps: STEPS[category],
    validation_steps: [
      "Reproduire le risque avec comptes factices et roles separes.",
      "Verifier les chemins d'acces API, RLS et le maintien des webhooks financiers.",
      "Tester la restauration progressive et comparer les journaux.",
    ],
    rollback_steps: [
      "Exiger la validation MFA de l'administrateur de securite.",
      "Lever le confinement cible et surveiller la recurrence.",
    ],
  };
}
export function detectSentinelFindings(
  audits: SentinelAudit[], now: number, minutes = 10,
): SentinelFinding[] {
  const groups = new Map<string, SentinelAudit[]>();
  const since = now - Math.min(15, Math.max(1, minutes)) * 60_000;
  for (const row of audits.slice(0, 500)) {
    const timestamp = Date.parse(row.created_at);
    if (row.status !== "failure" || !UUID.test(row.id) ||
      !Number.isFinite(timestamp) || timestamp < since || timestamp > now + 30_000) continue;
    const ip = row.request_metadata?.ip;
    const key = typeof ip === "string" && ip.length < 65 && ip.length > 0
      ? `ip:${ip}`
      : row.actor_user_id && UUID.test(row.actor_user_id)
        ? `user:${row.actor_user_id}` : "";
    if (!key) continue;
    const existing = groups.get(key) || [];
    if (existing.length < 300) existing.push(row);
    groups.set(key, existing);
  }
  const findings: SentinelFinding[] = [];
  for (const [correlationKey, rows] of groups) {
    const add = (category: SentinelCategory, scope: SentinelScope, matches: SentinelAudit[], summary: string) => {
      const functions = [...new Set(matches.map((row) => row.function_name))].sort().slice(0, 12);
      findings.push({
        category, scope, severity: "high", correlationKey, count: matches.length,
        evidenceIds: matches.slice(-35).map((row) => row.id), functions,
        observedAt: matches.reduce((max, row) => row.created_at > max ? row.created_at : max, ""),
        summary, recommended: sentinelReport(category, matches.length, functions),
      });
    };
    const denied = rows.filter((row) => DENIED.test(row.error_message || "") ||
      DENIED.test(row.action || ""));
    const payment = rows.filter((row) => FINANCIAL_FUNCTIONS.has(row.function_name));
    const actors = new Set(rows.map((r) => r.actor_user_id).filter(Boolean));
    const functions = new Set(rows.map((r) => r.function_name));
    if (denied.length >= 8 && new Set(denied.map((r) => r.function_name)).size >= 2) {
      add("authorization_probing", "administration", denied,
        "Echecs d'autorisation repetes sur au moins deux fonctions.");
    }
    if (payment.length >= 12) {
      add("payment_abuse", "payments", payment,
        "Tentatives financieres anormalement frequentes.");
    }
    if (rows.length >= 30 && actors.size >= 3 && functions.size >= 3) {
      add("distributed_probing", "administration", rows,
        "Anomalies correlees sur plusieurs comptes et fonctions.");
    }
  }
  return findings.slice(0, 8);
}
