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
const COLORS = { paper: "#FFF7EB", ink: "#211C19", muted: "#665B51", orange: "#FF4B11" } as const;
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
    : `<tr><td bgcolor="${COLORS.paper}" style="background-color:${COLORS.paper};padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;background-color:${COLORS.paper};">
        <tr><td style="padding:24px 25px 16px;">
          <img src="${escapeHtml(new URL("/logotok.png", siteUrl).href)}" width="96" border="0" alt="Logo officiel TOK" style="display:block;width:96px;max-width:100%;height:auto;border:0;" />
          <p style="margin:12px 0 0;border-top:2px solid ${COLORS.orange};padding-top:10px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:700;line-height:20px;color:${COLORS.ink};">Pensé pour les restaurateurs.</p>
        </td></tr>
        <tr><td style="padding:18px 25px 20px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;table-layout:fixed;">
            <tr><td width="64%" valign="middle" style="width:64%;vertical-align:middle;overflow-wrap:anywhere;word-break:break-word;">
              <h1 style="margin:0 8px 12px 0;font-family:Arial,Helvetica,sans-serif;font-size:29px;line-height:1.11;font-weight:900;color:${COLORS.ink};">${escapeHtml(content.headline)}</h1>
              <p style="margin:0 8px 0 0;border-bottom:3px solid ${COLORS.orange};padding-bottom:8px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:800;color:${COLORS.orange};">${escapeHtml(action)}</p>
            </td><td width="36%" valign="middle" bgcolor="${COLORS.orange}" style="width:36%;vertical-align:middle;background-color:${COLORS.orange};border-radius:90px 90px 8px 8px;">
              <img src="${escapeHtml(new URL("/chef2.png", siteUrl).href)}" width="185" border="0" alt="Le chef TOK" style="display:block;width:100%;max-width:185px;height:auto;border:0;" />
            </td></tr>
          </table>
        </td></tr>
        <tr><td style="padding:0 25px 16px;">
          <p style="margin:0 0 10px;font-family:Arial,Helvetica,sans-serif;font-size:17px;line-height:24px;font-weight:800;color:${COLORS.ink};">Bonjour,</p>
          ${paragraphs(content.body)}
        </td></tr>
        <tr><td style="padding:18px 25px 25px;background-color:${COLORS.orange};border-radius:22px 22px 0 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${COLORS.paper}" style="width:100%;table-layout:fixed;background-color:${COLORS.paper};border-radius:14px;">
            <tr><td align="center" width="50%" style="width:50%;padding:16px 6px;border-right:1px solid ${COLORS.orange};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:800;color:${COLORS.ink};">Vos actualités<br /><span style="color:${COLORS.orange};">À partager</span></td>
            <td align="center" width="50%" style="width:50%;padding:16px 6px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:800;color:${COLORS.ink};">Votre présence<br /><span style="color:${COLORS.orange};">À faire vivre</span></td></tr>
          </table>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-top:20px;table-layout:fixed;">
            <tr><td align="center" bgcolor="${COLORS.ink}" style="border-radius:30px;background-color:${COLORS.ink};">
              <a href="${escapeHtml(link)}" style="display:block;padding:16px 14px;font-family:Arial,Helvetica,sans-serif;font-size:18px;line-height:24px;font-weight:900;color:#FFFFFF;text-decoration:none;border-radius:30px;">${escapeHtml(action)} &#8594;</a>
            </td></tr>
          </table>
        </td></tr>
      </table>
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
