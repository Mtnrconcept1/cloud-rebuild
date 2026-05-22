import { useMemo, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { useCreateSocialPost } from "@/hooks/useSocialFeed";

export default function SocialComposer({
  restaurantId,
  restaurantName,
}: {
  restaurantId: string | null;
  restaurantName?: string | null;
}) {
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const createPost = useCreateSocialPost();

  const canSubmit = Boolean(restaurantId && body.trim() && !createPost.isPending);
  const mediaLabel = useMemo(() => {
    if (files.length === 0) return "Media";
    return `${files.length}/10`;
  }, [files.length]);

  const submit = async () => {
    if (!restaurantId || !canSubmit) return;
    await createPost.mutateAsync({ restaurantId, body, files });
    setBody("");
    setFiles([]);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <section className="rounded-lg border bg-background p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold">Nouvelle actualite</h2>
          {restaurantName ? <p className="text-sm text-muted-foreground">{restaurantName}</p> : null}
        </div>
        <Badge variant="secondary" className="rounded-full">Publication immediate</Badge>
      </div>

      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        maxLength={2000}
        placeholder="Annonce du jour, plat signature, coulisses, arrivage..."
        className="min-h-28 resize-none"
      />

      {files.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-2">
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

      <div className="mt-3 flex items-center justify-between gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          className="hidden"
          onChange={(event) => {
            const selected = Array.from(event.target.files || []).slice(0, 10);
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
