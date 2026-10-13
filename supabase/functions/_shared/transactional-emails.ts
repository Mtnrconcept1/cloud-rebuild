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
    const itemImage = /^https?:\/\//.test(image) ? image : assetUrl(appBaseUrl, "/logotok.png");
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
  const logoUrl = assetUrl(appBaseUrl, "/logotok.png");
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


/** Responsive, accessible email for reservation customers; merchant/order shells stay unchanged. */
function buildReservationCustomerShell(input: ReservationConfirmationEmailInput) {
  const base = normalizeBaseUrl(input.appBaseUrl);
  const logo = escapeHtml(assetUrl(base, "/logotok.png"));
  const chef = escapeHtml(assetUrl(base, "/chef2.png"));
  const hero = escapeHtml(assetUrl(base, "/images/octopus-fine-dining.jpeg"));
  const promo = escapeHtml(assetUrl(base, "/images/mixed-grill-platter.jpeg"));
  const details = escapeHtml(input.detailUrl);
  const offers = escapeHtml(assetUrl(base, "/chefs-table"));
  const dateTime = formatReservationDateTime(input.date, input.time);
  const address = textAddress(input.restaurantAddress, input.restaurantCity);
  const cell = (label: string, value: string, hint?: string) => `
    <td class="tok-cell" width="25%" valign="top" style="width:25%;padding:20px 8px;text-align:center;border-right:1px solid #f1ebe6;">
      <div style="margin:auto;background:#fff0e8;border-radius:30px;width:40px;height:40px;line-height:40px;color:#ff4814;font-size:22px;">&#9679;</div>
      <div style="margin-top:10px;color:#475569;font-size:11px;font-weight:700;">${label}</div>
      <div style="margin-top:6px;color:#101828;font-size:13px;font-weight:900;line-height:1.5;word-break:break-word;overflow-wrap:anywhere;">${escapeHtml(value)}</div>
      ${hint ? `<div style="margin-top:4px;font-size:11px;line-height:1.45;color:#64748b;word-break:break-word;">${escapeHtml(hint)}</div>` : ""}
    </td>`;
  const items = input.items.length ? `
    <tr><td class="tok-pad" style="padding:26px 30px 0;">
      <h2 style="font-size:20px;color:#111827;margin:0 0 12px;">Votre précommande</h2>
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">${renderItems(input.items, base)}</table>
      ${toNumber(input.total) > 0 ? renderTotals({ total: input.total }) : ""}
    </td></tr>` : "";
  const notes = input.notes ? `<p style="font-size:13px;color:#334155;line-height:1.55;"><strong>Votre demande :</strong> ${escapeHtml(input.notes)}</p>` : "";
  return `<!doctype html>
<html lang="fr"><head>
  <meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Votre réservation TOK est confirmée</title>
  <style>
    @media only screen and (max-width:600px) {
      .tok-wrap { width:100%!important;max-width:100%!important; }
      .tok-pad { padding-left:16px!important;padding-right:16px!important; }
      .tok-hero-copy,.tok-hero-image { display:block!important;width:100%!important;box-sizing:border-box!important; }
      .tok-hero-image { text-align:center!important; }
      .tok-hero-image img { width:158px!important;height:auto!important;margin:0 auto!important; }
      .tok-heading { font-size:29px!important; }
      .tok-cell { display:inline-block!important;box-sizing:border-box!important;width:50%!important;min-height:148px!important;vertical-align:top!important; }
      .tok-info { display:block!important;box-sizing:border-box!important;width:100%!important; }
      .tok-foot { display:block!important;box-sizing:border-box!important;width:100%!important;text-align:center!important;padding:8px 0!important; }
      .tok-cta { display:block!important;box-sizing:border-box!important;width:100%!important;text-align:center!important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:#f4f5f7;font-family:Arial,Helvetica,sans-serif;color:#111827;-webkit-text-size-adjust:100%;">
  <div style="display:none;max-height:0;opacity:0;overflow:hidden;font-size:1px;">${escapeHtml(input.restaurantName)} vous attend le ${escapeHtml(dateTime)}. Tous les détails de votre réservation à l'intérieur.</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#f4f5f7" style="border-collapse:collapse;background:#f4f5f7;">
   <tr><td align="center" style="padding:20px 8px;">
    <table role="presentation" class="tok-wrap" width="700" cellspacing="0" cellpadding="0" bgcolor="#ffffff" style="width:100%;max-width:700px;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;border-collapse:separate;">
      <tr><td bgcolor="#20140e" background="${hero}" style="padding:28px 32px;background-color:#20140e;background-image:linear-gradient(90deg,rgba(20,14,10,.94),rgba(20,14,10,.78)),url('${hero}');background-position:center;background-size:cover;">
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td class="tok-hero-copy" width="68%" valign="top" style="width:68%;">
         <img src="${logo}" alt="TOK" width="78" height="78" style="display:block;width:78px;height:78px;object-fit:contain;border:0;">
         <div style="margin-top:12px;color:#ffffff;font-size:11px;font-weight:700;">Le goût fait maison, livré avec passion.</div>
         <h1 class="tok-heading" style="margin:26px 0 18px;color:#ffffff;font-size:36px;line-height:1.06;">Votre réservation<br>est <span style="color:#ff5a1f;">confirmée !</span></h1>
         <p style="font-size:16px;line-height:1.4;color:#ffffff;font-weight:800;margin:0;">Bonjour ${escapeHtml(input.customerName || "cher client")},</p>
         <p style="font-size:14px;line-height:1.6;color:#f8f0ea;margin:9px 0 0;">Excellente nouvelle ! Votre table chez <strong>${escapeHtml(input.restaurantName)}</strong> est bien enregistrée. Toute l'équipe a hâte de vous accueillir pour un moment gourmand et convivial.</p>
        </td>
        <td class="tok-hero-image" width="32%" valign="bottom" align="right" style="width:32%;text-align:right;vertical-align:bottom;">
         <img src="${chef}" alt="Chef TOK" width="190" style="display:block;max-width:100%;width:190px;height:auto;border:0;margin-left:auto;">
        </td>
       </tr></table>
      </td></tr>
      <tr><td class="tok-pad" style="padding:24px 26px 0;">
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #eaecef;border-radius:12px;border-collapse:separate;"><tr>
        ${cell("N° de réservation", input.reservationId)}
        ${cell("Date et heure", dateTime)}
        ${cell("Convives", `${Math.max(1, Number(input.partySize || 1))} convive(s)`)}
        ${cell("Restaurant", input.restaurantName, address)}
       </tr></table>
      </td></tr>
      ${items}
      <tr><td class="tok-pad" style="padding:24px 26px 0;">
       <table role="presentation" bgcolor="#fff1e9" width="100%" cellspacing="0" cellpadding="0" style="background:#fff1e9;border-radius:12px;border-collapse:separate;"><tr><td style="padding:22px 24px;">
        <div style="font-size:19px;font-weight:900;color:#ed4516;">&#9716; &nbsp;Bon à savoir</div>
        <p style="margin:12px 0 0;color:#263247;font-size:14px;line-height:1.6;">Présentez-vous à l’heure prévue. En cas d’empêchement, pensez à modifier ou annuler votre réservation depuis votre espace TOK.</p>
        ${notes}
        <div style="margin-top:20px;"><a class="tok-cta" href="${details}" style="display:inline-block;color:#ffffff;background:#ff4814;text-decoration:none;font-size:14px;font-weight:900;padding:14px 20px;border-radius:8px;">Voir ou modifier ma réservation &rarr;</a></div>
       </td></tr></table>
      </td></tr>
      <tr><td class="tok-pad" style="padding:22px 26px 0;">
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;"><tr>
        <td class="tok-info" width="33%" style="width:33%;text-align:center;padding:10px 8px;vertical-align:top;font-size:12px;line-height:1.5;color:#263247;"><span style="font-size:22px;color:#ff4814;">&#9733;</span><br><strong>Des restaurants d’exception</strong></td>
        <td class="tok-info" width="34%" style="width:34%;text-align:center;padding:10px 8px;vertical-align:top;font-size:12px;line-height:1.5;color:#263247;"><span style="font-size:22px;color:#ff4814;">&#9889;</span><br><strong>Zéro attente avec TOK</strong></td>
        <td class="tok-info" width="33%" style="width:33%;text-align:center;padding:10px 8px;vertical-align:top;font-size:12px;line-height:1.5;color:#263247;"><span style="font-size:22px;color:#ff4814;">&#9825;</span><br><strong>Une cuisine plus responsable</strong></td>
       </tr></table>
      </td></tr>
      <tr><td class="tok-pad" style="padding:24px 26px 0;">
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#20140e" style="border-radius:12px;border-collapse:separate;background:#20140e;"><tr><td background="${promo}" bgcolor="#20140e" style="padding:24px;background-color:#20140e;background-image:linear-gradient(90deg,rgba(20,14,10,.97),rgba(20,14,10,.78)),url('${promo}');background-position:center;background-size:cover;">
        <div style="font-size:12px;color:#ffffff;font-weight:800;">Découvrez aussi</div>
        <div style="font-size:30px;line-height:1.2;color:#ff9b17;font-weight:900;margin:8px 0;">La Tok d’Or &#9819;</div>
        <p style="font-size:13px;line-height:1.6;color:#ffffff;margin:0 0 17px;">Des tables d’exception à prix irrésistibles, avec des offres pouvant aller jusqu’à −70 % selon les disponibilités.</p>
        <a href="${offers}" style="display:inline-block;border:1px solid #ffffff;color:#ffffff;border-radius:8px;text-decoration:none;padding:10px 16px;font-size:13px;font-weight:800;">Voir les offres &rarr;</a>
       </td></tr></table>
      </td></tr>
      <tr><td class="tok-pad" style="padding:24px 30px;">
       <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
        <td class="tok-foot" width="70%" style="width:70%;font-size:13px;line-height:1.8;color:#334155;">
         <span style="font-size:17px;font-weight:900;color:#ff4814;">À très bientôt chez TOK !</span><br><strong>L’équipe TOK</strong><br>
         <a href="${escapeHtml(base)}" style="color:#334155;">www.thetok.ch</a><br>
         <a href="mailto:${TOK_CONTACT_EMAIL}" style="color:#334155;">${TOK_CONTACT_EMAIL}</a>
        </td>
        <td class="tok-foot" width="30%" align="right" style="width:30%;text-align:right;"><img src="${logo}" alt="TOK" width="90" height="90" style="width:90px;height:90px;object-fit:contain;border:0;"></td>
       </tr></table>
      </td></tr>
      <tr><td bgcolor="#ff4814" style="padding:17px 12px;background:#ff4814;text-align:center;font-size:13px;font-weight:900;color:#ffffff;">TOK — Le goût fait maison, livré avec passion.</td></tr>
    </table>
    <p style="margin:15px;color:#64748b;font-size:11px;line-height:1.5;">Cet e-mail confirme une réservation effectuée sur TOK.</p>
   </td></tr>
  </table>
</body></html>`;
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

  const html = isRestaurant ? buildShell({
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
  }) : buildReservationCustomerShell(input);

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
