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
  orange: "#FF4B11",
  ink: "#111111",
  muted: "#6B7280",
  surface: "#FFFFFF",
  page: "#FFFDF7",
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
  if (!/^https:\/\/[^\s"'<>]+$/.test(trimmed)) return null;
  try {
    const url = new URL(trimmed);
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

function paragraphs(body: string) {
  return body
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map(
      (block) =>
        `<p style="margin:0 0 16px;font-size:16px;line-height:1.65;color:${BRAND.ink};overflow-wrap:anywhere;word-break:break-word;">${
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
  const assetOrigin = new URL(site).origin;
  // These are proportional, email-sized copies of the supplied TOK logo and
  // the existing chef-with-promotion artwork, with no graphical recomposition.
  const logo = `${assetOrigin}/marketing/email/tok-logo.jpg`;
  const visual = safeUrl(content.visualUrl);
  const ctaUrl = safeUrl(content.callToActionUrl) || site;
  const cta = (content.callToAction || "Découvrir TOK").trim();
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
<body style="margin:0;padding:0;background:${BRAND.page};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background:${BRAND.page};">
<tr><td align="center" style="padding:24px 8px;">
  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;table-layout:fixed;background:${BRAND.surface};border:1px solid ${BRAND.border};border-radius:12px;">

    <tr><td align="center" style="padding:24px 24px 8px;">
      <a href="${escapeHtml(ctaUrl)}" style="text-decoration:none;">
        <img src="${escapeHtml(logo)}" width="84" height="84" alt="TOK"
             style="display:block;width:84px;max-width:100%;height:auto;border:0;" />
      </a>
    </td></tr>

    <tr><td style="padding:8px 24px 0;border-top:2px solid ${BRAND.orange};">
      <h1 style="margin:0 0 18px;font-family:Impact,'Arial Black',Helvetica,Arial,sans-serif;font-size:clamp(30px,7vw,48px);line-height:1.03;font-weight:900;text-transform:uppercase;letter-spacing:-1px;color:${BRAND.ink};text-align:left;overflow-wrap:anywhere;word-break:break-word;">
        ${escapeHtml(content.headline)}
      </h1>
    </td></tr>

    ${
    visual
      ? `<tr><td style="padding:0 12px 20px;">
      <img src="${escapeHtml(visual)}" alt="" width="552"
           style="display:block;width:100%;max-width:552px;height:auto;border:0;border-radius:24px;" />
    </td></tr>`
      : ""
  }

    <tr><td style="padding:0 24px;font-family:Helvetica,Arial,sans-serif;">
      ${paragraphs(content.body)}
    </td></tr>

    ${
    cta
      ? `<tr><td align="center" style="padding:12px 24px 4px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:440px;table-layout:fixed;"><tr>
        <td align="center" bgcolor="${BRAND.ink}" style="border-radius:999px;background:${BRAND.ink};">
          <a href="${escapeHtml(ctaUrl)}"
             style="display:block;padding:14px 20px;font-family:Helvetica,Arial,sans-serif;font-size:18px;line-height:1.4;font-weight:900;color:#FFFFFF;text-decoration:none;border-radius:999px;overflow-wrap:anywhere;word-break:break-word;">
            ${escapeHtml(cta)}
          </a>
        </td>
      </tr></table>
    </td></tr>`
      : ""
  }

    <tr><td style="padding:10px 20px 18px;">
      <table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${BRAND.orange}" style="width:100%;background:${BRAND.orange};border-radius:25px;">
        <tr><td style="padding:20px 15px 6px;" align="center">
          <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:22px;line-height:1.3;font-weight:900;color:#FFFFFF;">${escapeHtml(content.headline)}</p>
        </td></tr>
        <tr><td style="padding:10px 15px 22px;" align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="#FFFFFF" style="padding:14px 8px;background:#FFFFFF;border-radius:13px;">
            <p style="margin:0;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;font-weight:700;color:#111111;">${escapeHtml(cta)} <span style="color:#FF4B11;">●</span> TOK</p>
          </td></tr></table>
        </td></tr>
      </table>
    </td></tr>

    <tr><td style="padding:8px 24px 28px;font-family:Helvetica,Arial,sans-serif;overflow-wrap:anywhere;word-break:break-word;">
      <hr style="border:0;border-top:1px solid ${BRAND.border};margin:0 0 16px;" />
      <p style="margin:0 0 8px;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
        ${escapeHtml(brand.senderName)} · ${escapeHtml(brand.senderAddress)}
      </p>
      <p style="margin:0;font-size:12px;line-height:1.6;color:${BRAND.muted};text-align:center;">
        Vous recevez ce message en tant que professionnel de la restauration.
        ${
    unsubscribe
      ? `<br /><a href="${escapeHtml(unsubscribe)}" style="color:${BRAND.muted};text-decoration:underline;">Se désabonner en un clic</a>`
      : ""
  }
      </p>
    </td></tr>

  </table>
  <!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body></html>`;

  const text = [
    content.headline,
    "",
    content.body,
    cta ? `\n${cta} : ${ctaUrl}` : "",
    "",
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
