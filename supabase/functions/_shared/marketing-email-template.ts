/**
 * TOK-branded email shell.
 *
 * Email clients are not browsers. Outlook renders through Word, Gmail strips
 * <style> blocks on some clients, and flexbox or grid collapse unpredictably.
 * Everything here is therefore table-based with inline styles, capped at 600px,
 * with absolute image URLs — the constraints that have not changed in fifteen
 * years.
 *
 * The shell also carries what deliverability depends on: a visible unsubscribe
 * link (the header alone is not enough for a human), a physical sender identity,
 * and a plain-text alternative. A message with no text part is itself a spam
 * signal.
 */

const BRAND = {
  orange: "#F4551E",
  ink: "#1A1A1A",
  muted: "#6B7280",
  surface: "#FFFFFF",
  page: "#FDF6F2",
  border: "#F0DDD4",
} as const;

export type MarketingEmailContent = {
  headline: string;
  body: string;
  callToAction?: string | null;
  callToActionUrl?: string | null;
  visualUrl?: string | null;
  preheader?: string | null;
};

export type MarketingEmailBrand = {
  siteUrl: string;
  unsubscribeUrl?: string | null;
  senderName: string;
  senderAddress: string;
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Only absolute https URLs may reach a mail client. */
function safeUrl(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return /^https:\/\/[^\s"'<>]+$/.test(trimmed) ? trimmed : null;
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${BRAND.ink}">${
          escapeHtml(block).replace(/\n/g, "<br />")
        }</p>`,
    )
    .join("");
}

export function renderMarketingEmail(
  content: MarketingEmailContent,
  brand: MarketingEmailBrand,
): { html: string; text: string } {
  const site = safeUrl(brand.siteUrl) || "https://www.thetok.ch";
  const logo = `${site}/logo3df.png`;
  const chef = `${site}/chef.png`;
  const visual = safeUrl(content.visualUrl);
  const ctaUrl = safeUrl(content.callToActionUrl) || site;
  const cta = (content.callToAction || "").trim();
  const unsubscribe = safeUrl(brand.unsubscribeUrl);

  // Shown by the inbox next to the subject; without it clients pull the first
  // words of the body, which is usually the logo alt text.
  const preheader = escapeHtml((content.preheader || content.headline).slice(0, 140));

  const html = `<!doctype html>
<html lang="fr"><head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<meta name="color-scheme" content="light" />
<title>${escapeHtml(content.headline)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.page};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${BRAND.page};padding:24px 12px;">
<tr><td align="center">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:100%;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:18px;overflow:hidden;">

    <tr><td align="center" style="padding:28px 24px 8px;">
      <a href="${ctaUrl}" style="text-decoration:none;">
        <img src="${logo}" width="96" height="96" alt="TOK"
             style="display:block;width:96px;height:auto;border:0;" />
      </a>
    </td></tr>

    <tr><td style="padding:8px 32px 0;">
      <h1 style="margin:0 0 18px;font-family:Georgia,'Times New Roman',serif;font-size:26px;line-height:1.25;color:${BRAND.ink};text-align:center;">
        ${escapeHtml(content.headline)}
      </h1>
    </td></tr>

    ${
    visual
      ? `<tr><td style="padding:0 24px 20px;">
      <img src="${visual}" alt="" width="552"
           style="display:block;width:100%;height:auto;border:0;border-radius:12px;" />
    </td></tr>`
      : ""
  }

    <tr><td style="padding:0 32px;font-family:Helvetica,Arial,sans-serif;">
      ${paragraphs(content.body)}
    </td></tr>

    ${
    cta
      ? `<tr><td align="center" style="padding:12px 32px 4px;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
        <td align="center" bgcolor="${BRAND.orange}" style="border-radius:999px;">
          <a href="${ctaUrl}"
             style="display:inline-block;padding:14px 32px;font-family:Helvetica,Arial,sans-serif;font-size:16px;font-weight:bold;color:#FFFFFF;text-decoration:none;border-radius:999px;">
            ${escapeHtml(cta)}
          </a>
        </td>
      </tr></table>
    </td></tr>`
      : ""
  }

    <tr><td align="center" style="padding:16px 32px 0;">
      <img src="${chef}" width="150" height="auto" alt=""
           style="display:block;width:150px;height:auto;border:0;" />
    </td></tr>

    <tr><td style="padding:8px 32px 28px;font-family:Helvetica,Arial,sans-serif;">
      <hr style="border:0;border-top:1px solid ${BRAND.border};margin:0 0 16px;" />
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
        ${escapeHtml(brand.senderName)} · ${escapeHtml(brand.senderAddress)}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
        Vous recevez ce message en tant que professionnel de la restauration.
        ${
    unsubscribe
      ? `<br /><a href="${unsubscribe}" style="color:${BRAND.muted};text-decoration:underline;">Se désabonner en un clic</a>`
      : ""
  }
      </p>
    </td></tr>

  </table>
</td></tr>
</table>
</body></html>`;

  const text = [
    content.headline,
    "",
    content.body,
    cta ? `\n${cta} : ${ctaUrl}` : "",
    "",
    "—",
    `${brand.senderName} · ${brand.senderAddress}`,
    unsubscribe ? `Se désabonner : ${unsubscribe}` : "",
  ]
    .filter((line) => line !== null && line !== undefined)
    .join("\n")
    .trim();

  return { html, text };
}
