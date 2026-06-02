import { useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Lightbulb, Plus, Send, X } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useCreateSocialPost } from "@/hooks/useSocialFeed";
import {
  SOCIAL_MARKETING_TEMPLATES,
  getVisibilityForAudienceSegment,
  validateSocialPostDraft,
  type SocialAudienceSegment,
  type SocialMarketingGoal,
  type SocialPostCtaType,
  type SocialPostType,
} from "@/lib/socialFeed";

export default function SocialComposer({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string | null;
  restaurantName?: string | null;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [postType, setPostType] = useState<SocialPostType>("annonce");
  const [ctaType, setCtaType] = useState<SocialPostCtaType>("none");
  const [campaignGoal, setCampaignGoal] = useState<SocialMarketingGoal>("awareness");
  const [audienceSegment, setAudienceSegment] = useState<SocialAudienceSegment>("local");
  const [campaignName, setCampaignName] = useState("");
  const [previews, setPreviews] = useState<Array<{ file: File; url: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const createPost = useCreateSocialPost();

  useEffect(() => {
    const nextPreviews = files.slice(0, 10).map((file) => ({ file, url: URL.createObjectURL(file) }));
    setPreviews(nextPreviews);
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url));
    };
  }, [files]);

  const validationErrors = useMemo(
    () =>
      validateSocialPostDraft({
        body,
        filesCount: files.length,
        postType,
        ctaType,
        scheduledAt: null,
      }),
    [body, ctaType, files.length, postType],
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
    await createPost.mutateAsync({
      restaurantId,
      body,
      files,
      postType,
      ctaType,
      scheduledAt: null,
      visibility: getVisibilityForAudienceSegment(audienceSegment),
      campaignGoal,
      campaignName: campaignName || null,
      audienceSegment,
      offerCode: null,
      utmCampaign,
    });
    setBody("");
    setFiles([]);
    setPostType("annonce");
    setCtaType("none");
    setCampaignGoal("awareness");
    setAudienceSegment("local");
    setCampaignName("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="rounded-[1.75rem] border border-orange-200/80 bg-white p-4 shadow-xl shadow-orange-100/60">
      <div className="flex gap-4">
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

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-2">
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

            <div className="flex shrink-0 items-center gap-2">
              <input
                ref={inputRef}
                type="file"
                accept="image/*,video/*"
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
                className="h-11 w-11 rounded-xl border-slate-200 bg-white shadow-sm"
                onClick={() => inputRef.current?.click()}
                aria-label="Ajouter un média"
                title={mediaLabel}
              >
                <ImagePlus className="h-5 w-5" />
              </Button>
              <Button
                type="button"
                className="h-11 gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-orange-600 px-5 shadow-lg shadow-orange-500/25 hover:from-orange-600 hover:to-orange-700"
                disabled={!canSubmit}
                onClick={submit}
              >
                <Send className="h-4 w-4" />
                Publier
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
