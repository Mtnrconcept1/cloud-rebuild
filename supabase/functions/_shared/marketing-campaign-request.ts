/** Request-only contract: no runtime imports, so Node emission has no Deno .ts dependencies. */
import type { CampaignTemplateId } from "./marketing-campaign-templates.ts";

export const CAMPAIGN_FORMAT_SIZES = {
  "1:1": "1024x1024", "4:5": "1024x1280", "9:16": "720x1280", "16:9": "1280x720",
} as const;
export type CampaignFormat = keyof typeof CAMPAIGN_FORMAT_SIZES;
export const CAMPAIGN_CADENCE_DAYS = { daily: 1, every_other_day: 2, twice_weekly: 3.5, weekly: 7, biweekly: 14 } as const;
export const GUIDED_CAMPAIGN_CHANNELS = ["instagram", "facebook", "linkedin", "tok_news", "google_business"] as const;
export const MAX_CAMPAIGN_VARIANTS = 12;
export const MAX_CAMPAIGN_VISUALS = 6;
export type CampaignOptions = {
  templateIds: CampaignTemplateId[];
  postCount: number;
  cadence: keyof typeof CAMPAIGN_CADENCE_DAYS;
  formatsByChannel: Record<string, CampaignFormat[]>;
};
export class CampaignOptionsError extends Error {
  constructor(readonly reason: string) { super(reason); this.name = "CampaignOptionsError"; }
}
function record(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function fail(reason: string): never { throw new CampaignOptionsError(reason); }
export function campaignOptionCounts(options: CampaignOptions) {
  const formats = Object.values(options.formatsByChannel);
  return { itemCount: options.postCount * formats.reduce((sum, values) => sum + values.length, 0),
    visualCount: options.postCount * new Set(formats.flat()).size };
}
/** Shared by browser, BFF and Edge; only the server validation is authoritative. */
export function parseCampaignOptions(value: unknown, channels: readonly string[], allowedTemplateIds: readonly string[]): CampaignOptions | undefined {
  if (value === undefined) return undefined;
  if (!record(value) || Object.keys(value).some((key) => !["templateIds", "postCount", "cadence", "formatsByChannel"].includes(key))) fail("campaign_options_invalid");
  if (!Array.isArray(value.templateIds) || value.templateIds.length < 1 || value.templateIds.length > allowedTemplateIds.length ||
    value.templateIds.some((id) => typeof id !== "string" || !allowedTemplateIds.includes(id)) ||
    new Set(value.templateIds).size !== value.templateIds.length) fail("campaign_templates_invalid");
  if (typeof value.postCount !== "number" || !Number.isInteger(value.postCount) || value.postCount < 1 || value.postCount > 12) fail("campaign_post_count_invalid");
  if (typeof value.cadence !== "string" || !Object.hasOwn(CAMPAIGN_CADENCE_DAYS, value.cadence)) fail("campaign_cadence_invalid");
  if (!channels.length || new Set(channels).size !== channels.length || channels.some((channel) => !(GUIDED_CAMPAIGN_CHANNELS as readonly string[]).includes(channel))) fail("campaign_channels_invalid");
  if (!record(value.formatsByChannel) || Object.keys(value.formatsByChannel).some((channel) => !channels.includes(channel))) fail("campaign_formats_invalid");
  const formatsByChannel: Record<string, CampaignFormat[]> = {};
  for (const channel of channels) {
    const formats = value.formatsByChannel[channel];
    if (!Array.isArray(formats) || !formats.length || formats.length > 4 || new Set(formats).size !== formats.length ||
      formats.some((format) => typeof format !== "string" || !Object.hasOwn(CAMPAIGN_FORMAT_SIZES, format))) fail("campaign_formats_invalid");
    formatsByChannel[channel] = [...formats] as CampaignFormat[];
  }
  const options: CampaignOptions = { templateIds: [...value.templateIds] as CampaignTemplateId[], postCount: value.postCount,
    cadence: value.cadence as CampaignOptions["cadence"], formatsByChannel };
  const counts = campaignOptionCounts(options);
  if (counts.itemCount > MAX_CAMPAIGN_VARIANTS) fail("campaign_too_many_variants");
  if (counts.visualCount > MAX_CAMPAIGN_VISUALS) fail("campaign_too_many_visuals");
  return options;
}

function zurichWallTime(timestamp: number): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(timestamp);
  const part = (name: string) => Number(parts.find((entry) => entry.type === name)?.value);
  return Date.UTC(part("year"), part("month") - 1, part("day"), part("hour"), part("minute"), part("second"));
}
function addZurichDays(start: number, days: number): string {
  if (!days) return new Date(start).toISOString();
  const targetWall = zurichWallTime(start) + days * 86_400_000;
  let timestamp = start + days * 86_400_000;
  for (let attempt = 0; attempt < 3; attempt++) timestamp += targetWall - zurichWallTime(timestamp);
  if (zurichWallTime(timestamp) !== targetWall) fail("campaign_local_time_unavailable");
  return new Date(timestamp).toISOString();
}
/** Retain the chosen Swiss local hour across daylight-saving changes. */
export function buildCampaignSlots(options: CampaignOptions, channels: readonly string[], startsAt: string) {
  const start = Date.parse(startsAt);
  if (!Number.isFinite(start)) fail("campaign_start_invalid");
  return Array.from({ length: options.postCount }, (_, postIndex) => ({
    postIndex, scheduledAt: addZurichDays(start, Math.floor(postIndex * CAMPAIGN_CADENCE_DAYS[options.cadence])),
  })).flatMap((post) => channels.flatMap((channel) => options.formatsByChannel[channel].map((format) => ({ ...post, channel, format }))));
}
