/**
 * Image-first marketing email renderer.
 *
 * Modelled on TOK's delivered 20 October 2026 07:46 (Europe/Zurich) email:
 * one full-width 9:16 campaign poster inside a single link, followed only by
 * sender identity and a visible unsubscribe footer. Avoid CSS layout tricks
 * that break in Outlook: 600px presentation table, inline CSS, fluid image.
 * Text alternative preserves campaign content when images are disabled.
 */
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
const COLORS = { paper: "#FFF7EB", ink: "#211C19", muted: "#665B51", orange: "#F4551E" } as const;
function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
/** Reject data/javascript, credentials and non-HTTPS URLs from generated content. */
function safeUrl(input: string | null | undefined): string | null {
  if (typeof input !== "string" || !/^https:\/\/[^\s"'<>]+$/.test(input.trim())) return null;
  try {
    const url = new URL(input.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch { return null; }
}
function paragraphs(value: string): string {
  return value.split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
    .map(s => `<p style="margin-top:0;margin-bottom:14px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;color:${COLORS.ink};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(s).replace(/\n/g, "<br />")}</p>`).join("");
}
export function renderMarketingEmail(content: MarketingEmailContent, brand: MarketingEmailBrand): { html: string; text: string } {
  const siteUrl = safeUrl(brand.siteUrl) || "https://www.thetok.ch";
  const visual = safeUrl(content.visualUrl);
  const link = safeUrl(content.callToActionUrl) || siteUrl;
  const action = (content.callToAction || "Découvrir TOK").trim() || "Découvrir TOK";
  const unsubscribe = safeUrl(brand.unsubscribeUrl);
  const preheader = escapeHtml((content.preheader || content.headline).slice(0, 140));
  const alt = escapeHtml(`TOK — ${content.headline}. ${action}`.slice(0, 200));
  const visualHtml = visual
    ? `<tr><td bgcolor="${COLORS.paper}" style="background-color:${COLORS.paper};font-size:0;line-height:0;">
      <a href="${escapeHtml(link)}" aria-label="${alt}" style="display:block;text-decoration:none;">
        <img src="${escapeHtml(visual)}" width="600" border="0" alt="${alt}" style="display:block;width:100%;max-width:600px;height:auto;border:0;" />
      </a>
    </td></tr>`
    : `<tr><td bgcolor="${COLORS.paper}" style="background-color:${COLORS.paper};padding-top:24px;padding-right:24px;padding-bottom:24px;padding-left:24px;">
      <h1 style="margin-top:0;margin-bottom:18px;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:900;color:${COLORS.ink};overflow-wrap:anywhere;word-break:break-word;">${escapeHtml(content.headline)}</h1>
      ${paragraphs(content.body)}
      <a href="${escapeHtml(link)}" style="display:inline-block;background-color:${COLORS.ink};color:#FFFFFF;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:bold;text-decoration:none;padding-top:12px;padding-bottom:12px;padding-left:20px;padding-right:20px;">${escapeHtml(action)} →</a>
    </td></tr>`;
  const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="color-scheme" content="light"><title>${escapeHtml(content.headline)}</title></head>
<body style="margin:0;background-color:${COLORS.paper};-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.paper}" style="width:100%;table-layout:fixed;background-color:${COLORS.paper};">
<tr><td align="center" style="padding:0;">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.paper}" style="width:100%;max-width:600px;table-layout:fixed;background-color:${COLORS.paper};">
${visualHtml}
<tr><td align="center" bgcolor="${COLORS.paper}" style="background-color:${COLORS.paper};padding-top:17px;padding-right:22px;padding-bottom:24px;padding-left:22px;">
  <p style="margin-top:0;margin-bottom:9px;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;color:${COLORS.ink};"><strong>${escapeHtml(brand.senderName)} — ${escapeHtml(brand.senderAddress)}</strong></p>
  <p style="margin-top:0;margin-bottom:9px;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:${COLORS.muted};"><a href="${escapeHtml(siteUrl)}" style="color:${COLORS.orange};text-decoration:underline;">thetok.ch</a></p>
  <p style="margin-top:0;margin-bottom:0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:19px;color:${COLORS.muted};">Vous recevez cette communication de TOK.
  ${unsubscribe ? `<br /><a href="${escapeHtml(unsubscribe)}" style="color:${COLORS.orange};text-decoration:underline;">Se désabonner en un clic</a>` : ""}</p>
</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;
  const text = [
    content.headline, "", content.body,
    "", `${action} : ${link}`, "",
    `${brand.senderName} — ${brand.senderAddress}`,
    siteUrl,
    ...(unsubscribe ? [`Se désabonner : ${unsubscribe}`] : []),
  ].join("\n").trim();
  return { html, text };
}
