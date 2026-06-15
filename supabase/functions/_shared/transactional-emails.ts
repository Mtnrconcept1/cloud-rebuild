type EmailAudience = "customer" | "restaurant";

export type TransactionalEmailItem = {
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice?: number | null;
  totalPrice?: number | null;
  imageUrl?: string | null;
};

export type TransactionalEmailContent = {
  subject: string;
  bodyHtml: string;
  bodyText: string;
};

export type OrderConfirmationEmailInput = {
  audience: EmailAudience;
  appBaseUrl?: string | null;
  orderId: string;
  orderReference?: string | null;
  customerName?: string | null;
  customerEmail?: string | null;
  restaurantName: string;
  restaurantAddress?: string | null;
  restaurantCity?: string | null;
  restaurantPhone?: string | null;
  orderTypeLabel: string;
  createdAt?: string | null;
  scheduledLabel?: string | null;
  subtotal?: number | null;
  serviceFee?: number | null;
  discount?: number | null;
  total: number;
  detailUrl: string;
  deliveryAddress?: string | null;
  notes?: string | null;
  paymentMethodLabel?: string | null;
  items: TransactionalEmailItem[];
};

export type ReservationConfirmationEmailInput = {
  audience: EmailAudience;
  appBaseUrl?: string | null;
  reservationId: string;
  customerName?: string | null;
  customerEmail?: string | null;
  restaurantName: string;
  restaurantAddress?: string | null;
  restaurantCity?: string | null;
  restaurantPhone?: string | null;
  date: string;
  time: string;
  partySize: number;
  featureLabel: string;
  notes?: string | null;
  total?: number | null;
  detailUrl: string;
  items: TransactionalEmailItem[];
};

type QueueEmailRow = {
  to_email: string;
  subject: string;
  body_html: string;
  body_text: string;
  metadata: Record<string, unknown>;
};

const DEFAULT_APP_BASE_URL = "https://www.thetok.ch";
const TOK_CONTACT_EMAIL = "contact@thetok.ch";
const MONTHS_FR = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function normalizeBaseUrl(value?: string | null) {
  const raw = String(value || "").trim() || DEFAULT_APP_BASE_URL;
  return raw.replace(/\/+$/, "");
}

function assetUrl(appBaseUrl: string, path: string) {
  return `${normalizeBaseUrl(appBaseUrl)}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function toNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function formatMoney(value: unknown) {
  return `${toNumber(value).toFixed(2)} CHF`;
}

function formatDateTime(value?: string | null) {
  if (!value) return "Maintenant";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Zurich",
  }).format(date).replace(",", " à");
}

function formatReservationDateTime(dateValue: string, timeValue: string) {
  const [yearRaw, monthRaw, dayRaw] = String(dateValue || "").split("-");
  const year = Number(yearRaw);
  const monthIndex = Number(monthRaw) - 1;
  const day = Number(dayRaw);
  const time = String(timeValue || "").slice(0, 5) || "--:--";
  if (!Number.isFinite(year) || !Number.isFinite(monthIndex) || !Number.isFinite(day) || !MONTHS_FR[monthIndex]) {
    return `${dateValue} à ${time}`;
  }
  return `${day} ${MONTHS_FR[monthIndex]} ${year} à ${time}`;
}

function compactAddress(address?: string | null, city?: string | null) {
  return [address, city].map((part) => String(part || "").trim()).filter(Boolean).join("<br>");
}

function textAddress(address?: string | null, city?: string | null) {
  return [address, city].map((part) => String(part || "").trim()).filter(Boolean).join(", ");
}

function itemTotal(item: TransactionalEmailItem) {
  const total = Number(item.totalPrice);
  if (Number.isFinite(total)) return total;
  return toNumber(item.unitPrice) * Math.max(1, Number(item.quantity || 1));
}

function renderItems(items: TransactionalEmailItem[], appBaseUrl: string) {
  if (!items.length) {
    return `
      <tr>
        <td colspan="3" style="padding:18px 0;color:#64748b;font-size:14px;">
          Aucun article précommandé.
        </td>
      </tr>
    `;
  }

  return items.map((item) => {
    const image = String(item.imageUrl || "").trim();
    const itemImage = /^https?:\/\//.test(image) ? image : assetUrl(appBaseUrl, "/tok.png");
    return `
      <tr>
        <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;width:76px;">
          <img src="${escapeHtml(itemImage)}" alt="" width="58" height="58" style="display:block;width:58px;height:58px;object-fit:cover;border-radius:14px;background:#fff3ec;">
        </td>
        <td style="padding:14px 12px;border-bottom:1px solid #e5e7eb;">
          <div style="font-size:16px;font-weight:800;color:#111827;">${escapeHtml(item.name || "Article")}</div>
          ${item.description ? `<div style="font-size:14px;line-height:1.45;color:#475569;margin-top:4px;">${escapeHtml(item.description)}</div>` : ""}
        </td>
        <td style="padding:14px 0;border-bottom:1px solid #e5e7eb;text-align:right;white-space:nowrap;">
          <div style="font-weight:800;color:#111827;">x${Math.max(1, Number(item.quantity || 1))}</div>
          <div style="font-size:15px;font-weight:800;color:#111827;margin-top:8px;">${formatMoney(itemTotal(item))}</div>
        </td>
      </tr>
    `;
  }).join("");
}

function renderSummaryCards(cards: Array<{ label: string; value: string; sub?: string | null }>) {
  return cards.map((card) => `
    <td style="width:${Math.floor(100 / cards.length)}%;padding:18px 14px;text-align:center;border-right:1px solid #e5e7eb;">
      <div style="color:#ff3d00;font-size:28px;line-height:1;">●</div>
      <div style="margin-top:12px;font-size:13px;color:#111827;font-weight:700;">${escapeHtml(card.label)}</div>
      <div style="margin-top:8px;font-size:16px;color:#111827;font-weight:900;">${escapeHtml(card.value)}</div>
      ${card.sub ? `<div style="margin-top:4px;font-size:13px;color:#475569;line-height:1.35;">${escapeHtml(card.sub)}</div>` : ""}
    </td>
  `).join("");
}

function renderTotals(input: {
  subtotal?: number | null;
  serviceFee?: number | null;
  discount?: number | null;
  total?: number | null;
}) {
  const subtotal = toNumber(input.subtotal);
  const serviceFee = toNumber(input.serviceFee);
  const discount = toNumber(input.discount);
  const total = toNumber(input.total);

  const rows = [
    subtotal > 0 ? `<tr><td style="padding:6px 0;color:#374151;">Sous-total</td><td style="padding:6px 0;text-align:right;color:#111827;">${formatMoney(subtotal)}</td></tr>` : "",
    serviceFee > 0 ? `<tr><td style="padding:6px 0;color:#374151;">Frais de service</td><td style="padding:6px 0;text-align:right;color:#111827;">${formatMoney(serviceFee)}</td></tr>` : "",
    discount > 0 ? `<tr><td style="padding:6px 0;color:#374151;">Réductions</td><td style="padding:6px 0;text-align:right;color:#16a34a;">-${formatMoney(discount)}</td></tr>` : "",
  ].join("");

  return `
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;border-collapse:collapse;">
      ${rows}
      <tr>
        <td style="padding:14px 0 0;border-top:1px solid #e5e7eb;font-size:18px;font-weight:900;color:#111827;">Total TTC</td>
        <td style="padding:14px 0 0;border-top:1px solid #e5e7eb;text-align:right;font-size:26px;font-weight:900;color:#ff3d00;">${formatMoney(total)}</td>
      </tr>
    </table>
  `;
}

function buildShell(input: {
  appBaseUrl?: string | null;
  title: string;
  subtitle: string;
  greeting: string;
  intro: string;
  summaryCards: Array<{ label: string; value: string; sub?: string | null }>;
  detailTitle: string;
  items: TransactionalEmailItem[];
  totals?: { subtotal?: number | null; serviceFee?: number | null; discount?: number | null; total?: number | null };
  noticeTitle: string;
  noticeBody: string;
  detailUrl: string;
}) {
  const appBaseUrl = normalizeBaseUrl(input.appBaseUrl);
  const logoUrl = assetUrl(appBaseUrl, "/logo.png");
  const chefUrl = assetUrl(appBaseUrl, "/chef2.png");
  const safeDetailUrl = escapeHtml(input.detailUrl);

  return `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>${escapeHtml(input.title)}</title>
  </head>
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;color:#111827;">
    <div style="max-width:920px;margin:0 auto;padding:28px 14px;">
      <div style="overflow:hidden;border-radius:10px;background:#ffffff;box-shadow:0 18px 50px rgba(15,23,42,0.10);border:1px solid #e5e7eb;">
        <div style="position:relative;background:linear-gradient(135deg,#ff3d00,#ff6a00);padding:28px 42px;color:#ffffff;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
            <tr>
              <td style="width:112px;vertical-align:middle;">
                <img src="${escapeHtml(logoUrl)}" alt="TOK" width="92" height="92" style="display:block;width:92px;height:92px;border-radius:50%;background:#fff;border:2px solid rgba(255,255,255,.8);">
              </td>
              <td style="vertical-align:middle;">
                <div style="font-size:36px;line-height:1.08;font-weight:900;">${escapeHtml(input.title)}</div>
                <div style="margin-top:8px;font-size:22px;line-height:1.25;font-weight:700;">${escapeHtml(input.subtitle)}</div>
              </td>
              <td style="width:120px;text-align:right;vertical-align:bottom;">
                <img src="${escapeHtml(chefUrl)}" alt="" width="96" style="display:block;width:96px;max-height:118px;object-fit:contain;opacity:.28;margin-left:auto;">
              </td>
            </tr>
          </table>
        </div>

        <div style="padding:30px 56px 0;">
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#111827;">${escapeHtml(input.greeting)}</h1>
          <p style="margin:0 0 24px;font-size:17px;line-height:1.55;color:#374151;">${escapeHtml(input.intro)}</p>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb;border-radius:10px;overflow:hidden;border-collapse:separate;box-shadow:0 8px 22px rgba(15,23,42,0.05);">
            <tr>${renderSummaryCards(input.summaryCards)}</tr>
          </table>

          <h2 style="margin:26px 0 14px;font-size:24px;line-height:1.2;color:#111827;">${escapeHtml(input.detailTitle)}</h2>
          <div style="border:1px solid #e5e7eb;border-radius:10px;padding:10px 24px 22px;box-shadow:0 8px 22px rgba(15,23,42,0.04);">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">
              ${renderItems(input.items, appBaseUrl)}
            </table>
            ${input.totals ? renderTotals(input.totals) : ""}
          </div>

          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:22px 0 0;">
            <tr>
              <td style="vertical-align:top;border-radius:10px;background:#fff3ec;padding:18px 20px;width:68%;">
                <div style="font-size:16px;font-weight:900;color:#9a3412;">${escapeHtml(input.noticeTitle)}</div>
                <div style="margin-top:8px;font-size:15px;line-height:1.55;color:#111827;">${escapeHtml(input.noticeBody)}</div>
                <div style="margin-top:16px;">
                  <a href="${safeDetailUrl}" style="display:inline-block;background:#ff5a00;color:#ffffff;text-decoration:none;font-weight:900;border-radius:8px;padding:12px 18px;">Voir le détail</a>
                </div>
              </td>
              <td style="width:24px;"></td>
              <td style="vertical-align:bottom;text-align:right;">
                <img src="${escapeHtml(chefUrl)}" alt="Chef TOK" width="188" style="display:block;width:188px;max-width:100%;height:auto;margin-left:auto;">
              </td>
            </tr>
          </table>

          <div style="margin-top:24px;border-top:1px solid #e5e7eb;padding:26px 0 28px;">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
              <tr>
                <td style="width:132px;vertical-align:middle;">
                  <img src="${escapeHtml(logoUrl)}" alt="TOK" width="118" height="118" style="display:block;width:118px;height:118px;border-radius:50%;">
                </td>
                <td style="vertical-align:middle;">
                  <div style="font-size:17px;font-weight:900;color:#ff3d00;">À très bientôt chez TOK !</div>
                  <div style="margin-top:12px;font-size:16px;font-weight:900;color:#111827;">L'équipe TOK</div>
                  <div style="margin-top:10px;font-size:14px;line-height:1.8;color:#374151;">
                    🌐 <a href="${escapeHtml(appBaseUrl)}" style="color:#111827;text-decoration:none;">www.thetok.ch</a><br>
                    ✉️ <a href="mailto:${TOK_CONTACT_EMAIL}" style="color:#111827;text-decoration:none;">${TOK_CONTACT_EMAIL}</a>
                  </div>
                </td>
              </tr>
            </table>
          </div>
        </div>

        <div style="background:#ff3d00;color:#ffffff;text-align:center;font-size:15px;font-weight:900;padding:16px 20px;">
          TOK - Le goût fait maison, livré avec passion.
        </div>
      </div>
    </div>
  </body>
</html>`;
}

export function buildOrderConfirmationEmail(input: OrderConfirmationEmailInput): TransactionalEmailContent {
  const reference = input.orderReference || input.orderId;
  const isRestaurant = input.audience === "restaurant";
  const title = isRestaurant ? "Nouvelle commande reçue" : "Merci pour votre commande !";
  const subtitle = isRestaurant
    ? "Voici le récapitulatif complet à préparer."
    : "Voici le récapitulatif de votre commande.";
  const greeting = isRestaurant
    ? `Bonjour ${input.restaurantName},`
    : `Bonjour ${input.customerName || "cher client"},`;
  const intro = isRestaurant
    ? `${input.customerName || "Un client"} vient de passer une commande sur TOK.`
    : "Nous avons bien reçu votre commande. Voici le détail ci-dessous.";
  const scheduled = input.scheduledLabel || formatDateTime(input.createdAt);
  const restaurantAddress = compactAddress(input.restaurantAddress, input.restaurantCity);

  const html = buildShell({
    appBaseUrl: input.appBaseUrl,
    title,
    subtitle,
    greeting,
    intro,
    summaryCards: [
      { label: "Numéro de commande", value: `#${reference.replace(/^#/, "")}` },
      { label: "Date de commande", value: scheduled },
      { label: "Type de commande", value: input.orderTypeLabel },
      { label: "Restaurant", value: input.restaurantName, sub: restaurantAddress.replace(/<br>/g, " - ") },
    ],
    detailTitle: "Détail de votre commande",
    items: input.items,
    totals: {
      subtotal: input.subtotal,
      serviceFee: input.serviceFee,
      discount: input.discount,
      total: input.total,
    },
    noticeTitle: isRestaurant ? "À préparer" : "Bon à savoir",
    noticeBody: isRestaurant
      ? [
        `Client : ${input.customerName || "Client TOK"}`,
        input.customerEmail ? `Email : ${input.customerEmail}` : "",
        input.deliveryAddress ? `Adresse : ${input.deliveryAddress}` : "",
        input.paymentMethodLabel ? `Paiement : ${input.paymentMethodLabel}` : "",
        input.notes ? `Notes : ${input.notes}` : "",
      ].filter(Boolean).join(" - ")
      : "Merci de vous présenter avec ce numéro si la commande est à retirer sur place. Nous vous souhaitons un bon appétit !",
    detailUrl: input.detailUrl,
  });

  const textItems = input.items.length
    ? input.items.map((item) => `${item.name} x${Math.max(1, Number(item.quantity || 1))} - ${formatMoney(itemTotal(item))}`).join("\n")
    : "Aucun article précommandé.";

  return {
    subject: isRestaurant ? `Nouvelle commande ${reference}` : `Confirmation de commande ${reference}`,
    bodyHtml: html,
    bodyText: [
      title,
      `Commande ${reference}`,
      `Client: ${input.customerName || "-"}${input.customerEmail ? ` (${input.customerEmail})` : ""}`,
      `Restaurant: ${input.restaurantName}${textAddress(input.restaurantAddress, input.restaurantCity) ? ` - ${textAddress(input.restaurantAddress, input.restaurantCity)}` : ""}`,
      `Type: ${input.orderTypeLabel}`,
      `Date: ${scheduled}`,
      "",
      textItems,
      "",
      `Total: ${formatMoney(input.total)}`,
      `Détail: ${input.detailUrl}`,
      `Contact TOK: ${TOK_CONTACT_EMAIL}`,
    ].join("\n"),
  };
}

export function buildReservationConfirmationEmail(input: ReservationConfirmationEmailInput): TransactionalEmailContent {
  const isRestaurant = input.audience === "restaurant";
  const title = isRestaurant ? "Nouvelle réservation reçue" : "Merci pour votre réservation !";
  const subtitle = isRestaurant
    ? "Voici le récapitulatif complet de la réservation."
    : "Voici le récapitulatif de votre réservation.";
  const greeting = isRestaurant
    ? `Bonjour ${input.restaurantName},`
    : `Bonjour ${input.customerName || "cher client"},`;
  const intro = isRestaurant
    ? `${input.customerName || "Un client"} vient de réserver une table sur TOK.`
    : `Votre table chez ${input.restaurantName} est bien enregistrée.`;
  const dateTime = formatReservationDateTime(input.date, input.time);
  const restaurantAddress = compactAddress(input.restaurantAddress, input.restaurantCity);

  const html = buildShell({
    appBaseUrl: input.appBaseUrl,
    title,
    subtitle,
    greeting,
    intro,
    summaryCards: [
      { label: "Réservation", value: input.reservationId },
      { label: "Date et heure", value: dateTime },
      { label: "Convives", value: `${input.partySize} convive(s)` },
      { label: "Restaurant", value: input.restaurantName, sub: restaurantAddress.replace(/<br>/g, " - ") },
    ],
    detailTitle: input.items.length ? "Précommande associée" : "Détail de votre réservation",
    items: input.items,
    totals: toNumber(input.total) > 0 ? { total: input.total } : undefined,
    noticeTitle: isRestaurant ? "Informations client" : "Bon à savoir",
    noticeBody: isRestaurant
      ? [
        `Client : ${input.customerName || "Client TOK"}`,
        input.customerEmail ? `Email : ${input.customerEmail}` : "",
        `Formule : ${input.featureLabel}`,
        input.notes ? `Notes : ${input.notes}` : "",
      ].filter(Boolean).join(" - ")
      : `Présentez-vous à l'heure prévue. En cas d'empêchement, gérez votre réservation depuis votre espace TOK.`,
    detailUrl: input.detailUrl,
  });

  const textItems = input.items.length
    ? input.items.map((item) => `${item.name} x${Math.max(1, Number(item.quantity || 1))} - ${formatMoney(itemTotal(item))}`).join("\n")
    : "Aucun article précommandé.";

  return {
    subject: isRestaurant
      ? `Nouvelle réservation ${input.reservationId}`
      : `Confirmation de réservation ${input.restaurantName}`,
    bodyHtml: html,
    bodyText: [
      title,
      `Réservation ${input.reservationId}`,
      `Client: ${input.customerName || "-"}${input.customerEmail ? ` (${input.customerEmail})` : ""}`,
      `Restaurant: ${input.restaurantName}${textAddress(input.restaurantAddress, input.restaurantCity) ? ` - ${textAddress(input.restaurantAddress, input.restaurantCity)}` : ""}`,
      `Date: ${dateTime}`,
      `Convives: ${input.partySize}`,
      `Type: ${input.featureLabel}`,
      "",
      textItems,
      "",
      toNumber(input.total) > 0 ? `Total: ${formatMoney(input.total)}` : "",
      `Détail: ${input.detailUrl}`,
      `Contact TOK: ${TOK_CONTACT_EMAIL}`,
    ].filter((line) => line !== "").join("\n"),
  };
}

async function insertQueuedEmail(adminClient: any, row: QueueEmailRow) {
  const dedupeKey = String(row.metadata.transactional_email_key || "");
  if (dedupeKey) {
    const { data: existing } = await adminClient
      .from("email_queue")
      .select("id")
      .filter("metadata->>transactional_email_key", "eq", dedupeKey)
      .limit(1)
      .maybeSingle();

    if (existing?.id) return;
  }

  const { error } = await adminClient.from("email_queue").insert(row);
  if (error) throw error;
}

export async function queueOrderConfirmationEmails(input: {
  adminClient: any;
  appBaseUrl?: string | null;
  order: {
    id: string;
    order_number?: string | null;
    created_at?: string | null;
    total_amount?: number | null;
    original_total?: number | null;
    discount_amount?: number | null;
    delivery_fee?: number | null;
    service_fee_amount?: number | null;
    delivery_address?: string | null;
    notes?: string | null;
    metadata?: Record<string, unknown> | null;
  };
  restaurant: {
    id: string;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
  };
  customer: {
    name?: string | null;
    email?: string | null;
  };
  restaurantEmail?: string | null;
  orderTypeLabel: string;
  scheduledLabel?: string | null;
  paymentMethodLabel?: string | null;
  items: TransactionalEmailItem[];
}) {
  const appBaseUrl = normalizeBaseUrl(input.appBaseUrl);
  const orderReference = input.order.order_number || input.order.id;
  const total = toNumber(input.order.total_amount);
  const subtotal = toNumber(input.order.original_total || input.order.metadata?.pre_discount_subtotal || total);
  const serviceFee = toNumber(input.order.delivery_fee) + toNumber(input.order.service_fee_amount);
  const discount = toNumber(input.order.discount_amount);
  const customerDetailUrl = `${appBaseUrl}/commande/${encodeURIComponent(input.order.id)}`;
  const restaurantDetailUrl = `${appBaseUrl}/dashboard/commandes`;

  const common = {
    appBaseUrl,
    orderId: input.order.id,
    orderReference,
    customerName: input.customer.name || null,
    customerEmail: input.customer.email || null,
    restaurantName: input.restaurant.name || "Restaurant TOK",
    restaurantAddress: input.restaurant.address || null,
    restaurantCity: input.restaurant.city || null,
    restaurantPhone: input.restaurant.phone || null,
    orderTypeLabel: input.orderTypeLabel,
    createdAt: input.order.created_at || null,
    scheduledLabel: input.scheduledLabel || null,
    subtotal,
    serviceFee,
    discount,
    total,
    deliveryAddress: input.order.delivery_address || null,
    notes: input.order.notes || null,
    paymentMethodLabel: input.paymentMethodLabel || null,
    items: input.items,
  };

  const rows: QueueEmailRow[] = [];
  if (input.customer.email) {
    const email = buildOrderConfirmationEmail({
      ...common,
      audience: "customer",
      detailUrl: customerDetailUrl,
    });
    rows.push({
      to_email: input.customer.email,
      subject: email.subject,
      body_html: email.bodyHtml,
      body_text: email.bodyText,
      metadata: {
        transactional_email: "order_confirmation",
        transactional_email_key: `order:${input.order.id}:customer`,
        recipient_role: "customer",
        order_id: input.order.id,
        restaurant_id: input.restaurant.id,
      },
    });
  }

  if (input.restaurantEmail) {
    const email = buildOrderConfirmationEmail({
      ...common,
      audience: "restaurant",
      detailUrl: restaurantDetailUrl,
    });
    rows.push({
      to_email: input.restaurantEmail,
      subject: email.subject,
      body_html: email.bodyHtml,
      body_text: email.bodyText,
      metadata: {
        transactional_email: "order_confirmation",
        transactional_email_key: `order:${input.order.id}:restaurant`,
        recipient_role: "restaurant",
        order_id: input.order.id,
        restaurant_id: input.restaurant.id,
      },
    });
  }

  for (const row of rows) {
    await insertQueuedEmail(input.adminClient, row);
  }
}

export async function queueReservationConfirmationEmails(input: {
  adminClient: any;
  appBaseUrl?: string | null;
  reservation: {
    id: string;
    date: string;
    time: string;
    party_size: number;
    feature?: string | null;
    total_amount?: number | null;
    notes?: string | null;
  };
  restaurant: {
    id: string;
    name?: string | null;
    address?: string | null;
    city?: string | null;
    phone?: string | null;
  };
  customer: {
    name?: string | null;
    email?: string | null;
  };
  restaurantEmail?: string | null;
  featureLabel: string;
  items: TransactionalEmailItem[];
}) {
  const appBaseUrl = normalizeBaseUrl(input.appBaseUrl);
  const customerDetailUrl = `${appBaseUrl}/reservations`;
  const restaurantDetailUrl = `${appBaseUrl}/dashboard/reservations`;
  const common = {
    appBaseUrl,
    reservationId: input.reservation.id,
    customerName: input.customer.name || null,
    customerEmail: input.customer.email || null,
    restaurantName: input.restaurant.name || "Restaurant TOK",
    restaurantAddress: input.restaurant.address || null,
    restaurantCity: input.restaurant.city || null,
    restaurantPhone: input.restaurant.phone || null,
    date: input.reservation.date,
    time: input.reservation.time,
    partySize: input.reservation.party_size,
    featureLabel: input.featureLabel,
    notes: input.reservation.notes || null,
    total: input.reservation.total_amount || 0,
    items: input.items,
  };

  const rows: QueueEmailRow[] = [];
  if (input.customer.email) {
    const email = buildReservationConfirmationEmail({
      ...common,
      audience: "customer",
      detailUrl: customerDetailUrl,
    });
    rows.push({
      to_email: input.customer.email,
      subject: email.subject,
      body_html: email.bodyHtml,
      body_text: email.bodyText,
      metadata: {
        transactional_email: "reservation_confirmation",
        transactional_email_key: `reservation:${input.reservation.id}:customer`,
        recipient_role: "customer",
        reservation_id: input.reservation.id,
        restaurant_id: input.restaurant.id,
      },
    });
  }

  if (input.restaurantEmail) {
    const email = buildReservationConfirmationEmail({
      ...common,
      audience: "restaurant",
      detailUrl: restaurantDetailUrl,
    });
    rows.push({
      to_email: input.restaurantEmail,
      subject: email.subject,
      body_html: email.bodyHtml,
      body_text: email.bodyText,
      metadata: {
        transactional_email: "reservation_confirmation",
        transactional_email_key: `reservation:${input.reservation.id}:restaurant`,
        recipient_role: "restaurant",
        reservation_id: input.reservation.id,
        restaurant_id: input.restaurant.id,
      },
    });
  }

  for (const row of rows) {
    await insertQueuedEmail(input.adminClient, row);
  }
}
