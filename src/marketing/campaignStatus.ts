import type { MarketingCampaign, MarketingCampaignStatus } from "@/marketing/types";

/** Campaign review and delivery are separate server states. Approval does not schedule its items. */
export function getMarketingCampaignDisplayStatus(
  campaign: Pick<MarketingCampaign, "status" | "approvedAt">,
): MarketingCampaignStatus | "approved" {
  return campaign.status === "draft" && campaign.approvedAt ? "approved" : campaign.status;
}
