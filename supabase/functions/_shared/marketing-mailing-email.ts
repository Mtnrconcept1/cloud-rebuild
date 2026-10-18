import { renderMarketingEmail } from "./marketing-email-template.ts";
import { assertMailingReady } from "./marketing-mailing.ts";

export type MailingEmailPreview = { subject: string; headline: string; body: string; callToAction: string; visualUrl: string | null };

/** The preview and the worker share this renderer; unsubscribe is personalized only at dispatch. */
export function renderTargetedMailingEmail(content: MailingEmailPreview, unsubscribeUrl?: string, senderAddress = "Genève, Suisse") {
  return renderMarketingEmail({ headline: content.headline, body: content.body,
    callToAction: content.callToAction, callToActionUrl: "https://www.thetok.ch/packs-restaurateur",
    visualUrl: content.visualUrl, preheader: content.headline },
  { siteUrl: "https://www.thetok.ch", senderName: "TOK", senderAddress, unsubscribeUrl });
}

export function prepareTargetedMailingContent(content: Record<string, unknown>, unsubscribeUrl: string, senderAddress?: string) {
  assertMailingReady(content);
  return renderTargetedMailingEmail({ subject: String(content.subject), headline: String(content.headline), body: String(content.body),
    callToAction: String(content.call_to_action), visualUrl: String(content.visual_url) }, unsubscribeUrl, senderAddress);
}
