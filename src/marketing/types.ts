export const MARKETING_VIEWS = [
  "overview",
  "agent",
  "calendar",
  "campaigns",
  "audiences",
  "automations",
  "activity",
  "results",
  "integrations",
] as const;

export type MarketingView = (typeof MARKETING_VIEWS)[number];
export type MarketingChannelId =
  | "tok_news"
  | "in_app"
  | "email"
  | "push"
  | "instagram"
  | "facebook"
  | "tiktok"
  | "linkedin"
  | "youtube"
  | "google_business"
  | "telegram"
  | "website"
  | "manual_call"
  | "manual_email"
  | "manual_visit";

export const PUBLIC_MARKETING_CHANNELS: readonly MarketingChannelId[] = [
  "tok_news",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "google_business",
  "telegram",
  "website",
];

export function isPublicMarketingChannel(channel: MarketingChannelId) {
  return PUBLIC_MARKETING_CHANNELS.includes(channel);
}
export type MarketingAvailability = "available" | "manual" | "blocked_configuration" | "disconnected";
export type MarketingCampaignStatus = "draft" | "scheduled" | "active" | "paused" | "completed" | "cancelled" | "failed";
export type MarketingItemStatus = "draft" | "scheduled" | "running" | "published" | "completed" | "failed" | "cancelled" | "blocked_configuration";
export type MarketingAudienceKind = "restaurant" | "client" | "mixed";
export type MarketingProspectStatus = "new" | "qualified" | "contacted" | "follow_up" | "converted" | "opted_out";
export const MARKETING_PROSPECT_STATUSES: readonly MarketingProspectStatus[] = [
  "new",
  "qualified",
  "contacted",
  "follow_up",
  "converted",
  "opted_out",
];
export type MarketingContactType = "registered_user" | "restaurant_prospect" | "restaurant_lead" | "manual";
export type MarketingLawfulBasis = "consent" | "existing_customer" | "legitimate_interest";
export type MarketingAutomationStatus = "draft" | "active" | "paused" | "disabled" | "error";
export type MarketingDeliveryStatus =
  | "queued"
  | "leased"
  | "processing"
  | "retrying"
  | "sent"
  | "delivered"
  | "opened"
  | "clicked"
  | "converted"
  | "bounced"
  | "complained"
  | "unsubscribed"
  | "skipped"
  | "failed"
  | "cancelled"
  | "blocked_configuration"
  | "manual_required";

export const MARKETING_DELIVERY_STATUSES: readonly MarketingDeliveryStatus[] = [
  "queued",
  "leased",
  "processing",
  "retrying",
  "sent",
  "delivered",
  "opened",
  "clicked",
  "converted",
  "bounced",
  "complained",
  "unsubscribed",
  "skipped",
  "failed",
  "cancelled",
  "blocked_configuration",
  "manual_required",
];

export type MarketingChannel = {
  id: MarketingChannelId;
  label: string;
  availability: MarketingAvailability;
  reason: string;
  costModel: "free" | "provider_free_tier" | "manual";
  lastCheckedAt: string;
};

export type MarketingOverview = {
  globalPaused: boolean;
  globalPauseReason: string | null;
  freeOnly: boolean;
  approvalRequired: boolean;
  schedulerReady: boolean;
  scheduledCount: number;
  eligibleContacts: number;
  sent: number;
  delivered: number;
  clicked: number;
  conversions: number;
  deliveryRate: number;
  clickRate: number;
  conversionRate: number;
  updatedAt: string;
};

export type MarketingCampaign = {
  id: string;
  name: string;
  objective: string;
  status: MarketingCampaignStatus;
  audienceId: string;
  audienceName: string;
  channels: MarketingChannelId[];
  startsAt: string | null;
  endsAt: string | null;
  sent: number;
  delivered: number;
  clicked: number;
  conversions: number;
  requiresApproval: boolean;
  content: string;
  approvedAt: string | null;
  updatedAt: string;
};

export type MarketingCalendarItem = {
  id: string;
  campaignId: string | null;
  campaignName: string;
  title: string;
  channel: MarketingChannelId;
  status: MarketingItemStatus;
  scheduledAt: string;
  timezone: string;
  audienceName: string;
  audienceSize: number;
  approvalStatus: "pending" | "approved" | "rejected";
  content: string;
  manualOutcome: "published" | "failed" | null;
  manualNote: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

export type MarketingAudience = {
  id: string;
  name: string;
  kind: MarketingAudienceKind;
  location: string;
  total: number;
  eligible: number | null;
  consentCoverage: number | null;
  recommendedChannel: MarketingChannelId;
  updatedAt: string;
  computed: boolean;
  sampleLimited: boolean;
};

export type MarketingProspect = {
  id: string;
  contactType: MarketingContactType;
  displayName: string;
  city: string;
  canton: string;
  category: string;
  status: MarketingProspectStatus;
  leadScore: number;
  recommendedChannel: MarketingChannelId;
  contactability: "ready" | "manual_research" | "opted_out";
  lastContactAt: string | null;
  nextActionAt: string | null;
  tags: string[];
  hasEmail: boolean;
  hasPhone: boolean;
  emailMasked: string | null;
  phoneMasked: string | null;
  lawfulBasis: string | null;
  updatedAt: string;
};

export type MarketingRestaurantContactDraft = {
  id?: string;
  expectedUpdatedAt?: string;
  displayName: string;
  email: string;
  phone: string;
  city: string;
  canton: string;
  category: string;
  lawfulBasis: MarketingLawfulBasis;
  evidenceSource: string;
  evidenceNote: string;
  evidenceAt: string;
};

export type MarketingManualTarget = {
  deliveryId: string;
  channel: "manual_call" | "manual_email";
  target: string;
  revealedAt: string;
};

export type MarketingOffsetPage<T> = {
  items: T[];
  total: number;
};

export type MarketingContactListParams = {
  query: string;
  status: MarketingProspectStatus | null;
  channel: MarketingChannelId | null;
  limit: number;
  offset: number;
};

export type MarketingDeliveryListParams = {
  query: string;
  status: MarketingDeliveryStatus | null;
  channel: MarketingChannelId | null;
  limit: number;
  offset: number;
};

export type MarketingSourceSyncBatch = {
  processed: number;
  inserted: number;
  updated: number;
  suppressed: number;
  reconsented: number;
  nextCursor: string | null;
  watermark: string | null;
  hasMore: boolean;
  complete: boolean;
};

export type MarketingSourceSyncResume = {
  catalog: {
    afterSourceObjectId: string | null;
    untilSourceObjectId: string | null;
  } | null;
  consents: {
    cursor: string | null;
  } | null;
  catalogComplete: boolean;
  consentsComplete: boolean;
};

export type MarketingAutomation = {
  id: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  channel: MarketingChannelId;
  status: MarketingAutomationStatus;
  runs: number;
  errors: number;
  lastRunAt: string | null;
  nextRunAt: string | null;
  updatedAt: string;
  isSystem: boolean;
  engineConnected: boolean;
};

export type MarketingAutomationDraft = {
  id?: string;
  name: string;
  description: string;
  trigger: string;
  action: string;
  channel: MarketingChannelId;
  status: MarketingAutomationStatus;
};

export type MarketingDelivery = {
  id: string;
  itemId: string;
  campaignName: string;
  targetMasked: string;
  channel: MarketingChannelId;
  status: MarketingDeliveryStatus;
  provider: string;
  attempt: number;
  scheduledAt: string | null;
  sentAt: string | null;
  manualOutcome: "completed" | "failed" | null;
  manualNote: string | null;
  createdAt: string;
  updatedAt: string;
  errorCode: string | null;
};

export type MarketingResultPoint = {
  date: string;
  sent: number;
  delivered: number;
  clicks: number;
  conversions: number;
};

export type MarketingIntegration = {
  id: string;
  name: string;
  channel: MarketingChannelId;
  status: MarketingAvailability;
  description: string;
  configuredAt: string | null;
  lastCheckedAt: string;
  actionLabel: string;
};

export type MarketingSnapshot = {
  overview: MarketingOverview;
  channels: MarketingChannel[];
  campaigns: MarketingCampaign[];
  calendar: MarketingCalendarItem[];
  audiences: MarketingAudience[];
  prospects: MarketingProspect[];
  automations: MarketingAutomation[];
  deliveries: MarketingDelivery[];
  results: MarketingResultPoint[];
  integrations: MarketingIntegration[];
  source: "backend" | "mixed" | "fallback";
  warnings: string[];
};

export type CursorPage<T> = {
  items: T[];
  nextCursor: Record<string, string> | null;
};

export type MarketingAudienceEstimate = {
  total: number;
  eligible: number;
  byChannel: Partial<Record<MarketingChannelId, number>>;
  availabilityByChannel: Partial<Record<MarketingChannelId, MarketingAvailability>>;
};

export type MarketingCampaignDraft = {
  id?: string;
  clientRequestId?: string;
  name: string;
  objective: string;
  message: string;
  audienceId: string;
  audienceName?: string;
  audienceFilter?: Record<string, unknown>;
  channels: MarketingChannelId[];
  startsAt: string | null;
  endsAt: string | null;
  status: MarketingCampaignStatus;
  requiresApproval: boolean;
};
