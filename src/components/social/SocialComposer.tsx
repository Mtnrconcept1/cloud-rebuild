import { useEffect, useMemo, useRef, useState, type ComponentType } from "react";
import { CalendarClock, Facebook, ImagePlus, Instagram, Lightbulb, Music2, Plus, Send, Share2, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSocialPost, useRecordExternalShare } from "@/hooks/useSocialFeed";
import {
  SOCIAL_MARKETING_TEMPLATES,
  getSocialPostShareUrl,
  getVisibilityForAudienceSegment,
  validateSocialPostDraft,
  type SocialAudienceSegment,
  type SocialMarketingGoal,
  type SocialPostCtaType,
  type SocialPostType,
} from "@/lib/socialFeed";
import {
  SOCIAL_CROSS_POST_LABELS,
  buildSocialCrossPostActions,
  getAvailableSocialCrossPostPlatforms,
  type RestaurantSocialLinks,
  type SocialCrossPostPlatform,
} from "@/lib/socialCrossPosting";
import { SOCIAL_MEDIA_ACCEPT } from "@/lib/uploadSecurity";

const SOCIAL_CROSS_POST_ICONS: Record<SocialCrossPostPlatform, ComponentType<{ className?: string }>> = {
  instagram: Instagram,
  facebook: Facebook,
  tiktok: Music2,
};

async function copySocialCrossPostText(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return false;

  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function openSocialCrossPostUrl(url: string) {
  if (typeof window === "undefined") return;
  window.open(url, "_blank", "noopener,noreferrer");
}

function getMinimumScheduledAtInputValue() {
  const minimum = new Date(Date.now() + 5 * 60_000);
  const local = new Date(minimum.getTime() - minimum.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export default function SocialComposer({
  restaurantId,
  restaurantName,
  socialLinks,
}: {
  restaurantId: string | null;
  restaurantName?: string | null;
  socialLinks?: RestaurantSocialLinks | null;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [postType, setPostType] = useState<SocialPostType>("annonce");
  const [ctaType, setCtaType] = useState<SocialPostCtaType>("none");
  const [campaignGoal, setCampaignGoal] = useState<SocialMarketingGoal>("awareness");
  const [audienceSegment, setAudienceSegment] = useState<SocialAudienceSegment>("local");
  const [campaignName, setCampaignName] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const [selectedCrossPostPlatforms, setSelectedCrossPostPlatforms] = useState<SocialCrossPostPlatform[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const createPost = useCreateSocialPost();
  const recordExternalShare = useRecordExternalShare();
  const minimumScheduledAt = useMemo(() => getMinimumScheduledAtInputValue(), []);
  const availableCrossPostPlatforms = useMemo(
    () => getAvailableSocialCrossPostPlatforms(socialLinks),
    [socialLinks],
  );
  const canCrossPostNow = availableCrossPostPlatforms.length > 0 && !scheduledAt;

  useEffect(() => {
    const nextPreviews = files.slice(0, 10).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files]);

  useEffect(() => {
    setSelectedCrossPostPlatforms((current) =>
      current.filter((platform) => availableCrossPostPlatforms.includes(platform)),
    );
  }, [availableCrossPostPlatforms]);

  const validationErrors = useMemo(
    () =>
      validateSocialPostDraft({
        body,
        filesCount: files.length,
        postType,
        ctaType,
        scheduledAt: scheduledAt || null,
      }),
    [body, ctaType, files.length, postType, scheduledAt],
  );
  const canSubmit = Boolean(restaurantId && body.trim() && validationErrors.length === 0 && !createPost.isPending);
  const mediaLabel = files.length === 0 ? "Média" : `${files.length}/10`;
  const utmCampaign = useMemo(() => {
    const source = campaignName.trim() || `${campaignGoal}-${restaurantName || "tok"}`;
    return source
      .toLocaleLowerCase("fr-CH")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
      .slice(0, 80);
  }, [campaignGoal, campaignName, restaurantName]);

  const submit = async () => {
    if (!restaurantId || !canSubmit) return;
    const scheduledIso = scheduledAt ? new Date(scheduledAt).toISOString() : null;
    const crossPostPlatforms = scheduledIso ? [] : selectedCrossPostPlatforms;

    const postId = await createPost.mutateAsync({
      restaurantId,
      body,
      files,
      postType,
      ctaType,
      scheduledAt: scheduledIso,
      visibility: getVisibilityForAudienceSegment(audienceSegment),
      campaignGoal,
      campaignName: campaignName || null,
      audienceSegment,
      offerCode: null,
      utmCampaign,
    });

    const crossPostActions = buildSocialCrossPostActions({
      body,
      postUrl: getSocialPostShareUrl(postId),
      selectedPlatforms: crossPostPlatforms,
      socialLinks,
    });

    if (crossPostActions.length > 0) {
      await copySocialCrossPostText(crossPostActions[0].clipboardText);
      crossPostActions.forEach((action) => {
        openSocialCrossPostUrl(action.url);
        recordExternalShare.mutate({ postId, channel: action.platform });
      });
    }

    setBody("");
    setFiles([]);
    setPostType("annonce");
    setCtaType("none");
    setCampaignGoal("awareness");
    setAudienceSegment("local");
    setCampaignName("");
    setScheduledAt("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="rounded-[1.75rem] border border-orange-200/80 bg-white p-4 shadow-xl shadow-orange-100/60">
      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="hidden pt-2 sm:block">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-orange-400 to-orange-600 text-white shadow-lg shadow-orange-500/30">
            <Plus className="h-7 w-7" />
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-4">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            maxLength={2000}
            placeholder="Quoi de neuf dans votre restaurant ?"
            className="min-h-[76px] resize-none rounded-2xl border-slate-200 bg-white px-5 py-4 text-base shadow-inner placeholder:text-slate-400 focus-visible:ring-orange-200"
          />

          {previews.length > 0 ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {previews.map((preview, index) => (
                <div key={`${preview.file.name}-${index}`} className="group relative overflow-hidden rounded-2xl border bg-muted shadow-sm">
                  {preview.file.type.startsWith("video/") ? (
                    <video src={preview.url} className="aspect-video w-full object-cover" muted />
                  ) : (
                    <img src={preview.url} alt={preview.file.name} className="aspect-video w-full object-cover" />
                  )}
                  <button
                    type="button"
                    onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                    className="absolute right-2 top-2 rounded-full bg-white/90 p-1 shadow-sm hover:bg-white"
                    aria-label="Retirer le média"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {availableCrossPostPlatforms.length > 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Share2 className="h-4 w-4 text-primary" />
                  <span>Partager aussi</span>
                </div>
                {scheduledAt ? (
                  <span className="text-xs text-muted-foreground">Disponible pour une publication immediate.</span>
                ) : null}
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {availableCrossPostPlatforms.map((platform) => {
                  const Icon = SOCIAL_CROSS_POST_ICONS[platform];
                  const label = SOCIAL_CROSS_POST_LABELS[platform];
                  const checkboxId = `social-cross-post-${platform}`;
                  const checked = selectedCrossPostPlatforms.includes(platform);

                  return (
                    <label
                      key={platform}
                      htmlFor={checkboxId}
                      className="flex cursor-pointer items-center gap-2 rounded-full border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm transition hover:border-orange-200 hover:bg-orange-50 has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60"
                    >
                      <Checkbox
                        id={checkboxId}
                        checked={checked}
                        disabled={!canCrossPostNow}
                        aria-label={label}
                        onCheckedChange={(value) => {
                          setSelectedCrossPostPlatforms((current) => {
                            if (value === true) return current.includes(platform) ? current : [...current, platform];
                            return current.filter((item) => item !== platform);
                          });
                        }}
                      />
                      <Icon className="h-4 w-4 text-primary" />
                      <span>{label}</span>
                    </label>
                  );
                })}
              </div>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                Facebook ouvre le partage de l'actualite Tok. Instagram et TikTok copient le texte puis ouvrent le profil pour finaliser la publication.
              </p>
            </div>
          ) : null}

          <div className="flex flex-col gap-3">
            <div className="flex w-full min-w-0 flex-wrap gap-2">
              {SOCIAL_MARKETING_TEMPLATES.map((template) => (
                <Button
                  key={template.id}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-9 gap-2 rounded-full border-slate-200 bg-white px-3 text-sm shadow-sm hover:border-orange-200 hover:bg-orange-50"
                  onClick={() => {
                    setBody(template.body);
                    setCampaignGoal(template.goal);
                    setPostType(template.postType);
                    setCtaType(template.ctaType);
                    setCampaignName(template.label);
                  }}
                >
                  <Lightbulb className="h-3.5 w-3.5 text-primary" />
                  {template.label}
                </Button>
              ))}
            </div>

            <div className="flex w-full min-w-0 flex-wrap items-center gap-2">
              <div className="flex min-w-0 flex-1 basis-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm sm:basis-[13rem]">
                <CalendarClock className="h-4 w-4 shrink-0 text-primary" />
                <div className="min-w-0 flex-1">
                  <Label htmlFor="social-post-scheduled-at" className="sr-only">Programmer la publication</Label>
                  <Input
                    id="social-post-scheduled-at"
                    type="datetime-local"
                    min={minimumScheduledAt}
                    value={scheduledAt}
                    onChange={(event) => setScheduledAt(event.target.value)}
                    aria-label="Programmer la publication"
                    className="h-7 border-0 bg-transparent p-0 text-xs shadow-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  />
                </div>
              </div>
              <input
                ref={inputRef}
                type="file"
                accept={SOCIAL_MEDIA_ACCEPT}
                multiple
                className="hidden"
                onChange={(event) => {
                  const selected = Array.from(event.target.files || []);
                  setFiles(selected);
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-11 w-11 shrink-0 rounded-xl border-slate-200 bg-white shadow-sm"
                onClick={() => inputRef.current?.click()}
                aria-label="Ajouter un média"
                title={mediaLabel}
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                className="h-11 min-w-[8rem] flex-1 gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700 sm:flex-none"
                disabled={!canSubmit}
                onClick={submit}
              >
                <Send className="h-4 w-4" />
                {scheduledAt ? "Programmer" : "Publier"}
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {restaurantName ? <Badge variant="secondary" className="rounded-full">{restaurantName}</Badge> : null}
              {files.length > 0 ? <Badge variant="outline" className="rounded-full">{mediaLabel}</Badge> : null}
            </div>
            {validationErrors.length > 0 ? (
              <p className="text-xs font-medium text-destructive">{validationErrors[0]}</p>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
