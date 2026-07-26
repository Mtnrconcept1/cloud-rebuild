import { existsSync, readFileSync, readdirSync } from "node:fs";
import { extname, join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const codeRoots = ["src", "supabase/functions"];
const schemaRoots = ["supabase/migrations", "supabase/demo-migrations"];

function readTree(relativeRoots, extensions) {
  const files = [];
  const visit = (relativePath) => {
    const absolutePath = join(root, relativePath);
    for (const entry of readdirSync(absolutePath, { withFileTypes: true })) {
      const child = join(relativePath, entry.name);
      if (entry.isDirectory()) visit(child);
      else if (extensions.has(extname(entry.name))) files.push(child);
    }
  };
  for (const relativeRoot of relativeRoots) visit(relativeRoot);
  return files.map((file) => ({ file, source: readFileSync(join(root, file), "utf8") }));
}

const code = readTree(codeRoots, new Set([".ts", ".tsx", ".mjs"]));
const schema = readTree(schemaRoots, new Set([".sql"]));
const codeText = code.map(({ source }) => source).join("\n");
const schemaText = schema.map(({ source }) => source).join("\n");

const domains = {
  commandes: {
    tables: ["orders", "order_items", "order_events", "order_status_history", "payment_attempts"],
    functions: ["create_order_with_items_idempotent", "track_order_event"],
    edges: ["create-checkout", "complete-order-checkout", "validate-order", "restaurant-order-status"],
  },
  reservations: {
    tables: ["reservations", "reservation_slots", "reservation_status_history", "reservation_tables"],
    functions: ["validate_and_create_reservation", "get_restaurant_reservation_slot_availability"],
    edges: ["create-reservation", "create-zero-attente-reservation", "create-chefs-table-reservation"],
  },
  livraison: {
    tables: ["dispatch_jobs", "dispatch_attempts", "delivery_tracking", "proof_of_delivery", "couriers"],
    functions: ["find_nearby_couriers"],
    edges: ["dispatch-order", "dispatch-timeout", "courier-portal"],
  },
  notifications: {
    tables: ["notifications", "notification_preferences", "notification_campaigns", "notification_deliveries", "device_tokens"],
    functions: ["enqueue_notification", "dispatch_due_notification_campaigns"],
    edges: ["notification-dispatch", "send-email", "send-push"],
  },
  sinistres_et_chat: {
    tables: ["support_incidents", "support_incident_messages", "ops_incidents", "ops_incident_events"],
    functions: ["create_support_incident", "ops_register_incident", "ops_decide_incident"],
    edges: ["contact-support", "ops-incident-control"],
  },
  paiements: {
    tables: ["payment_attempts", "payment_transactions", "refund_operations", "financial_ledger"],
    functions: ["acquire_payment_attempt", "finalize_payment_attempt", "claim_stripe_webhook_event", "record_refund_status"],
    edges: ["stripe-webhook", "stripe-worker", "process-refund", "payment-attempt-status"],
  },
  stripe_connect: {
    tables: ["restaurants", "restaurant_stripe_adjustments"],
    edges: ["stripe-connect-onboard", "stripe-connect-status", "settle-developer-statement"],
  },
  fidelite: {
    tables: ["loyalty_transactions", "loyalty_tiers", "gift_points", "tok_one_subscriptions"],
    functions: ["apply_checkout_benefits", "apply_reservation_loyalty_points"],
    edges: ["manage-tok-one-subscription"],
  },
  facturation: {
    tables: ["restaurant_invoices", "restaurant_invoice_line_items", "restaurant_invoice_settings"],
    functions: ["get_payable_invoice_lines"],
    edges: ["generate-invoices"],
  },
  catalogue: {
    tables: ["restaurants", "menu_items", "restaurant_media", "restaurant_cuisines", "cuisines"],
    functions: ["restaurant_set_cuisines"],
    edges: ["menu-image-import", "restaurant-media-governance"],
  },
  avis_et_social: {
    tables: ["reviews", "review_replies", "social_posts", "social_post_comments", "social_reports"],
    functions: ["recompute_restaurant_review_stats"],
    edges: ["create-social-post-boost"],
  },
  authentification_et_roles: {
    tables: ["profiles", "user_roles", "restaurant_staff"],
    functions: ["has_role"],
    edges: ["delete-account", "submit-signup-application"],
  },
};

const failures = [];
const rows = [];
const schemaHas = (kind, name) => {
  const patterns = kind === "table"
    ? [new RegExp(`\\bcreate\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?${name}\\b`, "i")]
    : [new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?${name}\\s*\\(`, "i")];
  return patterns.some((pattern) => pattern.test(schemaText));
};

for (const [domain, contract] of Object.entries(domains)) {
  const missing = [];
  for (const table of contract.tables ?? []) {
    if (!schemaHas("table", table)) missing.push(`table:${table}:schema`);
    if (!new RegExp(`\\.from\\(\\s*["']${table}["']`).test(codeText)) missing.push(`table:${table}:consumer`);
  }
  for (const fn of contract.functions ?? []) {
    if (!schemaHas("function", fn)) missing.push(`rpc:${fn}:schema`);
    if (!new RegExp(`\\.rpc\\(\\s*["']${fn}["']`).test(codeText)) missing.push(`rpc:${fn}:consumer`);
  }
  for (const edge of contract.edges ?? []) {
    if (!existsSync(join(root, "supabase/functions", edge, "index.ts"))) missing.push(`edge:${edge}:handler`);
  }
  rows.push({ domain, status: missing.length === 0 ? "OK" : "FAIL", missing });
  failures.push(...missing.map((item) => `${domain}:${item}`));
}

console.log("TOK business wiring audit");
for (const row of rows) {
  console.log(`${row.status === "OK" ? "✓" : "✗"} ${row.domain}${row.missing.length ? ` — ${row.missing.join(", ")}` : ""}`);
}
console.log(`\n${rows.length} domaines contrôlés, ${failures.length} anomalie(s).`);

if (failures.length) process.exitCode = 1;
