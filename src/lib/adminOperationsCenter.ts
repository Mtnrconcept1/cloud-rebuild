export type MarketplaceAlertSeverity = "critical" | "high" | "medium" | "info";

export type MarketplaceAlertStatus = "new" | "in_progress" | "resolved" | "ignored";

export type MarketplaceAlertCategory =
  | "payment"
  | "order"
  | "reservation"
  | "dispatch"
  | "refund"
  | "restaurant"
  | "campaign"
  | "support"
  | "production";

export type MarketplaceAlert = {
  id: string;
  severity: MarketplaceAlertSeverity;
  category: MarketplaceAlertCategory;
  title: string;
  body: string;
  entityType: string;
  entityId: string | null;
  status: MarketplaceAlertStatus;
  href: string;
  createdAt: string;
  payload?: Record<string, unknown>;
};

export type MarketplaceAlertInput = {
  now?: Date;
  orders?: Array<Record<string, unknown>>;
  reservations?: Array<Record<string, unknown>>;
  dispatchJobs?: Array<Record<string, unknown>>;
  paymentTransactions?: Array<Record<string, unknown>>;
  refundRequests?: Array<Record<string, unknown>>;
  restaurants?: Array<Record<string, unknown>>;
  adCampaigns?: Array<Record<string, unknown>>;
  edgeFunctionAuditLogs?: Array<Record<string, unknown>>;
  supportIncidents?: Array<Record<string, unknown>>;
};

export type ProductionHealth = {
  status: "ok" | "watch" | "critical";
  score: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  infoCount: number;
  blockingCategories: MarketplaceAlertCategory[];
};

const OPEN_ORDER_STATUSES = new Set([
  "pending",
  "pending_payment",
  "awaiting_payment",
  "paid",
  "confirmed",
  "accepted",
  "preparing",
  "ready",
  "picked_up",
  "out_for_delivery",
  "in_progress",
]);

const PAID_PAYMENT_STATUSES = new Set([
  "paid",
  "succeeded",
  "success",
  "captured",
  "requires_capture",
]);

const TERMINAL_ORDER_STATUSES = new Set([
  "delivered",
  "completed",
  "cancelled",
  "canceled",
  "refunded",
  "failed",
]);

const ACTIVE_DISPATCH_STATUSES = new Set([
  "searching",
  "assigned",
  "accepted",
  "pickup",
  "picked_up",
  "en_route",
  "delivering",
  "in_progress",
]);

const OPEN_INCIDENT_STATUSES = new Set([
  "open",
  "new",
  "pending",
  "in_progress",
  "waiting_restaurant",
  "waiting_customer",
]);

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function asString(value: unknown, fallback = "") {
  const normalized = String(value ?? "").trim();
  return normalized || fallback;
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  const normalized = normalize(value);
  return ["true", "1", "yes", "active", "enabled"].includes(normalized);
}

function isBlank(value: unknown) {
  return asString(value).length === 0;
}

function dateValue(value: unknown) {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

function minutesBetween(left: Date, right: Date) {
  return Math.floor((left.getTime() - right.getTime()) / 60_000);
}

function makeId(category: MarketplaceAlertCategory, entityType: string, entityId: unknown, suffix: string) {
  return [category, entityType, asString(entityId, "unknown"), suffix]
    .map((part) => String(part).replace(/[^a-zA-Z0-9_-]/g, "-"))
    .join(":");
}

function pushAlert(alerts: MarketplaceAlert[], alert: MarketplaceAlert) {
  const duplicate = alerts.some((existing) => existing.id === alert.id);
  if (!duplicate) alerts.push(alert);
}

function firstNonEmpty(row: Record<string, unknown>, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = asString(row[key]);
    if (value) return value;
  }
  return fallback;
}

export function getEntityDisplayName(row: Record<string, unknown>, fallback: string) {
  return firstNonEmpty(row, ["name", "restaurant_name", "title", "order_number", "reference", "email"], fallback);
}

export function buildMarketplaceAlerts(input: MarketplaceAlertInput): MarketplaceAlert[] {
  const now = input.now ?? new Date();
  const alerts: MarketplaceAlert[] = [];

  for (const row of input.paymentTransactions ?? []) {
    const id = firstNonEmpty(row, ["id", "stripe_payment_intent_id", "payment_intent_id"], "payment");
    const status = normalize(row.status ?? row.payment_status);
    const hasLinkedBusinessEntity = [
      row.order_id,
      row.reservation_id,
      row.ad_campaign_id,
      row.campaign_id,
      row.match_group_id,
      row.target_id,
    ].some((value) => !isBlank(value));

    if (PAID_PAYMENT_STATUSES.has(status) && !hasLinkedBusinessEntity) {
      pushAlert(alerts, {
        id: makeId("payment", "payment_transaction", id, "orphan-paid-payment"),
        severity: "critical",
        category: "payment",
        title: "Paiement encaissé sans entité métier",
        body: "Un paiement réussi n'est relié à aucune commande, réservation, campagne ou groupe. À traiter avant réconciliation comptable.",
        entityType: "payment_transaction",
        entityId: id,
        status: "new",
        href: "/admin/commandes-reservations?tab=payments",
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.orders ?? []) {
    const id = firstNonEmpty(row, ["id", "order_id"], "order");
    const status = normalize(row.status);
    const paymentStatus = normalize(row.payment_status ?? row.stripe_status);
    const createdAt = dateValue(row.created_at) ?? now;
    const ageMinutes = minutesBetween(now, createdAt);

    if (PAID_PAYMENT_STATUSES.has(paymentStatus) && ["pending_payment", "awaiting_payment", "pending"].includes(status)) {
      pushAlert(alerts, {
        id: makeId("order", "order", id, "paid-but-pending"),
        severity: "critical",
        category: "order",
        title: "Commande payée encore bloquée paiement",
        body: "Le paiement est confirmé mais la commande reste dans un statut d'attente. Vérifier webhook Stripe et création métier.",
        entityType: "order",
        entityId: id,
        status: "new",
        href: `/admin/commandes-reservations?order=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }

    if (OPEN_ORDER_STATUSES.has(status) && !TERMINAL_ORDER_STATUSES.has(status) && ageMinutes >= 20) {
      pushAlert(alerts, {
        id: makeId("order", "order", id, "stale-open-order"),
        severity: ageMinutes >= 45 ? "critical" : "high",
        category: "order",
        title: "Commande ouverte trop longtemps",
        body: `Commande ouverte depuis ${ageMinutes} minutes. Vérifier restaurant, coursier et notification client.`,
        entityType: "order",
        entityId: id,
        status: "new",
        href: `/admin/commandes-reservations?order=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.dispatchJobs ?? []) {
    const id = firstNonEmpty(row, ["id", "dispatch_job_id"], "dispatch");
    const status = normalize(row.status);
    const createdAt = dateValue(row.created_at) ?? now;
    const ageMinutes = minutesBetween(now, createdAt);

    if (ACTIVE_DISPATCH_STATUSES.has(status) && isBlank(row.courier_id) && ageMinutes >= 10) {
      pushAlert(alerts, {
        id: makeId("dispatch", "dispatch_job", id, "no-courier"),
        severity: ageMinutes >= 25 ? "critical" : "high",
        category: "dispatch",
        title: "Mission livraison sans coursier",
        body: `Aucun coursier assigné depuis ${ageMinutes} minutes. Relancer le dispatch ou prévenir le restaurant.`,
        entityType: "dispatch_job",
        entityId: id,
        status: "new",
        href: `/admin/commandes-reservations?dispatch=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.reservations ?? []) {
    const id = firstNonEmpty(row, ["id", "reservation_id"], "reservation");
    const status = normalize(row.status);
    const reservationDate = firstNonEmpty(row, ["date", "reservation_date"]);
    const reservationTime = firstNonEmpty(row, ["time", "reservation_time"], "00:00:00");
    const startsAt = reservationDate ? dateValue(`${reservationDate}T${reservationTime}`) : dateValue(row.created_at);
    const minutesUntil = startsAt ? minutesBetween(startsAt, now) : Number.POSITIVE_INFINITY;

    if (!["confirmed", "cancelled", "canceled", "completed", "no_show"].includes(status) && minutesUntil <= 120 && minutesUntil >= -180) {
      pushAlert(alerts, {
        id: makeId("reservation", "reservation", id, "not-confirmed-soon"),
        severity: minutesUntil <= 45 ? "critical" : "high",
        category: "reservation",
        title: "Réservation proche non confirmée",
        body: "La réservation arrive bientôt mais son statut n'est pas confirmé. Contacter le restaurant ou le client.",
        entityType: "reservation",
        entityId: id,
        status: "new",
        href: `/admin/commandes-reservations?reservation=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.refundRequests ?? []) {
    const id = firstNonEmpty(row, ["id", "target_id"], "refund");
    const status = normalize(row.status ?? row.refund_status);
    const remainingAmount = asNumber(row.remaining_amount_chf ?? row.amount_chf ?? row.amount);

    if (["pending", "open", "requested", "failed", "requires_action"].includes(status) && remainingAmount > 0) {
      pushAlert(alerts, {
        id: makeId("refund", "refund_request", id, "pending-refund"),
        severity: status === "failed" ? "critical" : "high",
        category: "refund",
        title: status === "failed" ? "Remboursement échoué" : "Remboursement en attente",
        body: `${remainingAmount.toFixed(2)} CHF reste à traiter ou à confirmer côté Stripe/comptabilité.`,
        entityType: "refund_request",
        entityId: id,
        status: "new",
        href: "/admin/commandes-reservations?tab=refunds",
        createdAt: asString(row.created_at ?? row.cancelled_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.restaurants ?? []) {
    const id = firstNonEmpty(row, ["id", "restaurant_id"], "restaurant");
    const isActive = asBoolean(row.is_active ?? row.active ?? row.published);
    const missingFields = [
      ["nom", row.name],
      ["adresse", row.address],
      ["ville", row.city],
      ["latitude", row.latitude],
      ["longitude", row.longitude],
    ]
      .filter(([, value]) => isBlank(value))
      .map(([label]) => label);

    if (missingFields.length > 0 && isActive) {
      pushAlert(alerts, {
        id: makeId("restaurant", "restaurant", id, "active-incomplete"),
        severity: missingFields.length >= 3 ? "high" : "medium",
        category: "restaurant",
        title: "Restaurant actif avec données critiques manquantes",
        body: `${getEntityDisplayName(row, "Restaurant")} est publié mais incomplet : ${missingFields.join(", ")}.`,
        entityType: "restaurant",
        entityId: id,
        status: "new",
        href: `/admin/restaurants?restaurant=${id}`,
        createdAt: asString(row.updated_at ?? row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.adCampaigns ?? []) {
    const id = firstNonEmpty(row, ["id", "campaign_id"], "campaign");
    const status = normalize(row.status);
    const paymentStatus = normalize(row.payment_status ?? row.stripe_status);
    const budget = asNumber(row.budget_chf ?? row.budget_total ?? row.total_budget ?? row.budget);
    const spent = asNumber(row.spent_chf ?? row.daily_spent ?? row.spent);

    if (PAID_PAYMENT_STATUSES.has(paymentStatus) && ["inactive", "paused", "draft", "pending"].includes(status)) {
      pushAlert(alerts, {
        id: makeId("campaign", "ad_campaign", id, "paid-inactive"),
        severity: "high",
        category: "campaign",
        title: "Campagne payée inactive",
        body: "Budget encaissé mais campagne inactive. Vérifier activation, dates, ciblage et post sponsorisé associé.",
        entityType: "ad_campaign",
        entityId: id,
        status: "new",
        href: `/admin/actualites?campaign=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }

    if (budget > 0 && spent > budget * 1.05) {
      pushAlert(alerts, {
        id: makeId("campaign", "ad_campaign", id, "overspent"),
        severity: "critical",
        category: "campaign",
        title: "Campagne au-dessus du budget",
        body: `Dépense ${spent.toFixed(2)} CHF pour budget ${budget.toFixed(2)} CHF. Suspendre et rapprocher les métriques.`,
        entityType: "ad_campaign",
        entityId: id,
        status: "new",
        href: `/admin/actualites?campaign=${id}`,
        createdAt: asString(row.updated_at ?? row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.edgeFunctionAuditLogs ?? []) {
    const id = firstNonEmpty(row, ["id"], "edge-log");
    const status = normalize(row.status ?? row.result);
    const functionName = firstNonEmpty(row, ["function_name", "function", "action"], "Edge Function");

    if (["failure", "failed", "error", "timeout"].includes(status)) {
      pushAlert(alerts, {
        id: makeId("production", "edge_function_audit_log", id, "edge-failure"),
        severity: ["stripe-webhook", "create-checkout", "dispatch-order"].includes(functionName) ? "critical" : "high",
        category: "production",
        title: `Edge Function en échec : ${functionName}`,
        body: "Une fonction critique échoue. Consulter les logs avant nouvelle mise en production.",
        entityType: "edge_function_audit_log",
        entityId: id,
        status: "new",
        href: "/admin/audit",
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  for (const row of input.supportIncidents ?? []) {
    const id = firstNonEmpty(row, ["id", "incident_id"], "incident");
    const status = normalize(row.status);
    const priority = normalize(row.priority ?? row.severity);
    const createdAt = dateValue(row.created_at) ?? now;
    const ageMinutes = minutesBetween(now, createdAt);

    if (OPEN_INCIDENT_STATUSES.has(status) && (priority === "critical" || priority === "urgent" || ageMinutes >= 60)) {
      pushAlert(alerts, {
        id: makeId("support", "support_incident", id, "open-incident"),
        severity: priority === "critical" || priority === "urgent" ? "critical" : "medium",
        category: "support",
        title: "Incident support à traiter",
        body: `Incident ouvert depuis ${ageMinutes} minutes. Vérifier client, restaurant et historique de conversation.`,
        entityType: "support_incident",
        entityId: id,
        status: "new",
        href: `/admin/support?incident=${id}`,
        createdAt: asString(row.created_at, now.toISOString()),
        payload: row,
      });
    }
  }

  return alerts.sort((left, right) => {
    const severityRank: Record<MarketplaceAlertSeverity, number> = { critical: 0, high: 1, medium: 2, info: 3 };
    const severityDelta = severityRank[left.severity] - severityRank[right.severity];
    if (severityDelta !== 0) return severityDelta;
    return Date.parse(right.createdAt) - Date.parse(left.createdAt);
  });
}

export function summarizeProductionHealth(alerts: MarketplaceAlert[]): ProductionHealth {
  const criticalCount = alerts.filter((alert) => alert.severity === "critical").length;
  const highCount = alerts.filter((alert) => alert.severity === "high").length;
  const mediumCount = alerts.filter((alert) => alert.severity === "medium").length;
  const infoCount = alerts.filter((alert) => alert.severity === "info").length;
  const score = Math.max(0, 100 - criticalCount * 25 - highCount * 12 - mediumCount * 5 - infoCount * 1);
  const status: ProductionHealth["status"] = criticalCount > 0 ? "critical" : highCount > 0 || mediumCount >= 3 ? "watch" : "ok";
  const blockingCategories = Array.from(new Set(
    alerts
      .filter((alert) => alert.severity === "critical" || alert.severity === "high")
      .map((alert) => alert.category),
  ));

  return { status, score, criticalCount, highCount, mediumCount, infoCount, blockingCategories };
}

export function groupAlertsByCategory(alerts: MarketplaceAlert[]) {
  return alerts.reduce<Record<MarketplaceAlertCategory, MarketplaceAlert[]>>((groups, alert) => {
    groups[alert.category] = groups[alert.category] || [];
    groups[alert.category].push(alert);
    return groups;
  }, {} as Record<MarketplaceAlertCategory, MarketplaceAlert[]>);
}

export function getSeverityLabel(severity: MarketplaceAlertSeverity) {
  switch (severity) {
    case "critical":
      return "Critique";
    case "high":
      return "Haute";
    case "medium":
      return "Moyenne";
    default:
      return "Info";
  }
}

export function getHealthLabel(status: ProductionHealth["status"]) {
  switch (status) {
    case "critical":
      return "Critique";
    case "watch":
      return "À surveiller";
    default:
      return "OK";
  }
}
