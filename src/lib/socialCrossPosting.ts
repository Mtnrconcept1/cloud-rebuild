import { normalizeSocialUrl } from "@/lib/securityUrls";

export type SocialCrossPostPlatform = "instagram" | "facebook" | "tiktok";

export type RestaurantSocialLinks = Partial<Record<SocialCrossPostPlatform, string | null>>;

export type SocialCrossPostAction = {
  platform: SocialCrossPostPlatform;
  label: string;
  url: string;
  clipboardText: string;
};

export const SOCIAL_CROSS_POST_PLATFORMS: SocialCrossPostPlatform[] = ["instagram", "facebook", "tiktok"];

export const SOCIAL_CROSS_POST_LABELS: Record<SocialCrossPostPlatform, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  tiktok: "TikTok",
};

const MAX_EXTERNAL_CAPTION_LENGTH = 2200;

function readOpeningHoursString(openingHours: unknown, key: string) {
  if (!openingHours || typeof openingHours !== "object" || Array.isArray(openingHours)) return null;
  const value = (openingHours as Record<string, unknown>)[key];
  return typeof value === "string" ? value : null;
}

export function getRestaurantSocialLinks(openingHours: unknown): RestaurantSocialLinks {
  return {
    instagram: normalizeSocialUrl(readOpeningHoursString(openingHours, "social_instagram"), "instagram"),
    facebook: normalizeSocialUrl(readOpeningHoursString(openingHours, "social_facebook"), "facebook"),
    tiktok: normalizeSocialUrl(readOpeningHoursString(openingHours, "social_tiktok"), "tiktok"),
  };
}

export function getAvailableSocialCrossPostPlatforms(
  socialLinks: RestaurantSocialLinks | null | undefined,
): SocialCrossPostPlatform[] {
  return SOCIAL_CROSS_POST_PLATFORMS.filter((platform) =>
    Boolean(normalizeSocialUrl(socialLinks?.[platform], platform)),
  );
}

export function buildSocialCrossPostClipboardText({
  body,
  postUrl,
}: {
  body: string;
  postUrl: string;
}) {
  const cleanBody = body.trim();
  const cleanUrl = postUrl.trim();
  const fullText = [cleanBody, cleanUrl].filter(Boolean).join("\n\n");

  if (fullText.length <= MAX_EXTERNAL_CAPTION_LENGTH) return fullText;

  const urlSuffix = cleanUrl ? `\n\n${cleanUrl}` : "";
  const bodyLimit = Math.max(0, MAX_EXTERNAL_CAPTION_LENGTH - urlSuffix.length - 3);
  return `${cleanBody.slice(0, bodyLimit).trimEnd()}...${urlSuffix}`;
}

export function buildSocialCrossPostActions({
  body,
  postUrl,
  selectedPlatforms,
  socialLinks,
}: {
  body: string;
  postUrl: string;
  selectedPlatforms: SocialCrossPostPlatform[];
  socialLinks: RestaurantSocialLinks | null | undefined;
}): SocialCrossPostAction[] {
  const selected = new Set(selectedPlatforms);
  const clipboardText = buildSocialCrossPostClipboardText({ body, postUrl });

  return SOCIAL_CROSS_POST_PLATFORMS.flatMap((platform) => {
    if (!selected.has(platform)) return [];

    const profileUrl = normalizeSocialUrl(socialLinks?.[platform], platform);
    if (!profileUrl) return [];

    return [{
      platform,
      label: SOCIAL_CROSS_POST_LABELS[platform],
      url: platform === "facebook"
        ? `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(postUrl)}`
        : profileUrl,
      clipboardText,
    }];
  });
}
