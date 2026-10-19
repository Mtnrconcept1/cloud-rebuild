import type { MarketingChannelId } from "@/marketing/types";
import { composeMetaCaption } from "../../supabase/functions/_shared/meta-publishing";
import type { MailingEmailPreview } from "../../supabase/functions/_shared/marketing-mailing-email";

export type MarketingPostPreviewData = {
  caption: string;
  visualUrl: string | null;
  visualFormat?: string;
  imageMode?: "generated" | "manual";
  visualStatus?: string;
  email?: MailingEmailPreview;
};

const text = (value: unknown) => typeof value === "string" ? value.trim() : "";

export function marketingPreviewImageUrl(value: unknown): string | null {
  try {
    const url = new URL(text(value));
    if (url.protocol !== "https:" || url.username || url.password) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function isMarketingMailingReady(preview: MarketingPostPreviewData): boolean {
  const email = preview.email;
  return Boolean(email && marketingPreviewImageUrl(preview.visualUrl) && preview.visualStatus === "ready"
    && [email.subject, email.headline, email.body, email.callToAction].every((value) => value.trim().length > 0));
}

/** Keep Meta caption composition aligned with the publisher, including tag deduplication. */
export function marketingPostPreview(content: unknown, channel: MarketingChannelId): MarketingPostPreviewData {
  const row = content && typeof content === "object" && !Array.isArray(content)
    ? content as Record<string, unknown> : {};
  const structured = composeMetaCaption(row);
  const fallback = text(content) || text(row.message) || text(row.body) || text(row.text) || text(row.summary);
  return {
    ...(channel === "email" && row.mailing_version === "tok-mailing-v1" ? { email: {
      subject: text(row.subject), headline: text(row.headline), body: text(row.body), callToAction: text(row.call_to_action),
      visualUrl: marketingPreviewImageUrl(row.visual_url),
    } } : {}),
    caption: channel === "instagram" || channel === "facebook" ? structured || fallback : fallback || structured,
    visualUrl: marketingPreviewImageUrl(row.visual_url),
    ...(row.image_mode === "manual" || row.image_mode === "generated" ? { imageMode: row.image_mode } : {}),
    ...(text(row.visual_status) ? { visualStatus: text(row.visual_status) } : {}),
    ...(text(row.visual_format) || text(row.format) ? { visualFormat: text(row.visual_format) || text(row.format) } : {}),
  };
}
