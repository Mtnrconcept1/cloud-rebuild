import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, ImagePlus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCreateSocialPost } from "@/hooks/useSocialFeed";
import {
  SOCIAL_POST_CTAS,
  SOCIAL_POST_TYPES,
  validateSocialPostDraft,
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
  const [scheduledAt, setScheduledAt] = useState("");
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
        scheduledAt: scheduledAt || null,
      }),
    [body, ctaType, files.length, postType, scheduledAt],
  );
  const canSubmit = Boolean(restaurantId && body.trim() && validationErrors.length === 0 && !createPost.isPending);
  const mediaLabel = useMemo(() => {
    if (files.length === 0) return "Media";
    return `${files.length}/10`;
  }, [files.length]);
  const scheduleLabel = scheduledAt ? "Publication programmee" : "Publication immediate";

  const submit = async () => {
    if (!restaurantId || !canSubmit) return;
    await createPost.mutateAsync({
      restaurantId,
      body,
      files,
      postType,
      ctaType,
      scheduledAt: scheduledAt || null,
    });
    setBody("");
    setFiles([]);
    setPostType("annonce");
    setCtaType("none");
    setScheduledAt("");
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Nouvelle actualite</h2>
          {restaurantName ? <p className="text-sm text-muted-foreground">{restaurantName}</p> : null}
        </div>
        <Badge variant="secondary" className="rounded-full">{scheduleLabel}</Badge>
      </div>

      <div className="mb-3 grid gap-3 sm:grid-cols-3">
        <Select value={postType} onValueChange={(value) => setPostType(value as SocialPostType)}>
          <SelectTrigger>
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_POST_TYPES.map((type) => (
              <SelectItem key={type.value} value={type.value}>
                {type.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={ctaType} onValueChange={(value) => setCtaType(value as SocialPostCtaType)}>
          <SelectTrigger>
            <SelectValue placeholder="CTA" />
          </SelectTrigger>
          <SelectContent>
            {SOCIAL_POST_CTAS.map((cta) => (
              <SelectItem key={cta.value} value={cta.value}>
                {cta.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="relative">
          <CalendarClock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="datetime-local"
            value={scheduledAt}
            onChange={(event) => setScheduledAt(event.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        placeholder="Annonce du jour, plat signature, coulisses, arrivage..."
        className="min-h-28 resize-none"
      />

      {files.length > 0 ? (
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {previews.map((preview, index) => (
            <div key={`${preview.file.name}-${index}`} className="group relative overflow-hidden rounded-lg border bg-muted">
              {preview.file.type.startsWith("video/") ? (
                <video src={preview.url} className="aspect-video w-full object-cover" muted />
              ) : (
                <img src={preview.url} alt={preview.file.name} className="aspect-video w-full object-cover" />
              )}
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="absolute right-2 top-2 rounded-full bg-background/90 p-1 shadow-sm hover:bg-background"
                aria-label="Retirer le media"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="absolute inset-x-0 bottom-0 bg-background/85 px-2 py-1 text-[11px]">
                <span className="block truncate">{preview.file.name}</span>
              </div>
            </div>
          ))}
        </div>
      ) : null}

      {files.length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((file, index) => (
            <Badge key={`${file.name}-${index}`} variant="outline" className="gap-1 rounded-full">
              <span className="max-w-[180px] truncate">{file.name}</span>
              <button
                type="button"
                onClick={() => setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                className="rounded-full p-0.5 hover:bg-muted"
                aria-label="Retirer le media"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
        </div>
      ) : null}

      {body.trim() ? (
        <div className="mt-3 rounded-lg border bg-muted/40 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="rounded-full">{SOCIAL_POST_TYPES.find((type) => type.value === postType)?.label}</Badge>
            {ctaType !== "none" ? (
              <Badge variant="outline" className="rounded-full">{SOCIAL_POST_CTAS.find((cta) => cta.value === ctaType)?.label}</Badge>
            ) : null}
          </div>
          <p className="whitespace-pre-wrap text-sm leading-6">{body}</p>
        </div>
      ) : null}

      {validationErrors.length > 0 ? (
        <div className="mt-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          {validationErrors[0]}
        </div>
      ) : null}

      <div className="mt-3 flex items-center justify-between gap-3">
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
        <Button type="button" variant="outline" size="sm" className="gap-2" onClick={() => inputRef.current?.click()}>
          <ImagePlus className="h-4 w-4" />
          {mediaLabel}
        </Button>
        <Button type="button" size="sm" className="gap-2" disabled={!canSubmit} onClick={submit}>
          <Send className="h-4 w-4" />
          Publier
        </Button>
      </div>
    </section>
  );
}
