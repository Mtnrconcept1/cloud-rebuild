import { useState } from "react";
import { ExternalLink, ImageOff } from "lucide-react";

import { MarketingChannelBadge, formatMarketingDate } from "@/components/marketing/MarketingShared";
import { cn } from "@/lib/utils";
import { marketingPreviewImageUrl, type MarketingPostPreviewData } from "@/marketing/postPreview";
import type { MarketingChannelId } from "@/marketing/types";
import { renderTargetedMailingEmail } from "../../../supabase/functions/_shared/marketing-mailing-email";

export function MarketingPostImage({ url, title, compact = false }: {
  url?: string | null;
  title: string;
  compact?: boolean;
}) {
  const safeUrl = marketingPreviewImageUrl(url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const unavailable = !safeUrl || failedUrl === safeUrl;
  return (
    <div className={cn("flex items-center justify-center overflow-hidden rounded-xl bg-muted/40", compact ? "h-20 w-20 shrink-0" : "aspect-square max-h-[65dvh] w-full")}>
      {unavailable ? (
        <div className="flex flex-col items-center gap-2 p-3 text-center text-xs text-muted-foreground" role="status">
          <ImageOff className="h-5 w-5" aria-hidden />
          <span>{safeUrl ? "Visuel indisponible" : "Aucun visuel"}</span>
        </div>
      ) : (
        <img src={safeUrl} alt={`Visuel : ${title}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
          className={cn("object-contain", compact ? "h-20 w-20" : "h-full w-full")}
          onError={() => setFailedUrl(safeUrl)} />
      )}
    </div>
  );
}

export function MarketingPostPreview({ title, channel, scheduledAt, preview }: {
  title: string;
  channel: MarketingChannelId;
  scheduledAt: string;
  preview: MarketingPostPreviewData;
}) {
  const imageUrl = marketingPreviewImageUrl(preview.visualUrl);
  if (channel === "email" && preview.email) {
    const rendered = renderTargetedMailingEmail(preview.email);
    return <section aria-label={`Aperçu de ${title}`} className="space-y-3">
      <div className="flex items-center justify-between gap-2"><h3 className="font-semibold">Aperçu de l’e-mail</h3><MarketingChannelBadge channel={channel} /></div>
      <p className="text-xs text-muted-foreground">{formatMarketingDate(scheduledAt)} · heure de Genève</p>
      <p className="break-words text-sm"><strong>Objet :</strong> {preview.email.subject}</p>
      {!imageUrl || preview.visualStatus === "pending_upload" ? <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{preview.imageMode === "manual" ? "Importez une image pour cet e-mail, puis relisez son aperçu avant validation." : "Bannière manquante : cet e-mail ne peut pas être approuvé."}</p> : null}
      <iframe title={`Template e-mail — ${title}`} sandbox="" referrerPolicy="no-referrer" srcDoc={rendered.html} className="h-[640px] w-full rounded-xl border bg-white" />
      <details><summary className="cursor-pointer text-sm font-medium">Lire tout le texte</summary><div className="mt-3 space-y-3 text-sm"><strong>{preview.email.headline}</strong><p className="whitespace-pre-wrap break-words">{preview.email.body}</p><p>{preview.email.callToAction}</p></div></details>
      {imageUrl ? <a href={imageUrl} target="_blank" rel="noopener noreferrer" className="block text-sm underline">Examiner l’image de cet e-mail en grand</a> : null}
      <p className="text-xs text-muted-foreground">Le lien de désabonnement sera personnalisé pour chaque destinataire à l’envoi. Le rendu peut varier selon la messagerie.</p>
    </section>;
  }
  return (
    <section aria-label={`Aperçu de ${title}`} className="min-w-0 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-semibold">Aperçu de la publication</h3>
        <MarketingChannelBadge channel={channel} />
      </div>
      <p className="text-xs text-muted-foreground">{formatMarketingDate(scheduledAt)} · heure de Genève</p>
      {channel === "instagram" && preview.visualFormat === "9:16" ? <p role="status" className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">Instagram 9:16 : export pour publication manuelle en Story. Envoi automatique non pris en charge.</p> : null}
      <div className="overflow-hidden rounded-2xl border bg-background">
        {channel !== "facebook" ? <MarketingPostImage url={imageUrl} title={title} /> : null}
        <div className="p-4">
          <p className="whitespace-pre-wrap break-words text-sm leading-relaxed [overflow-wrap:anywhere]">{preview.caption || "Aucun texte enregistré pour cette publication."}</p>
        </div>
        {channel === "facebook" ? <MarketingPostImage url={imageUrl} title={title} /> : null}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span>{preview.caption.length.toLocaleString("fr-CH")} caractères</span>
        {imageUrl ? <a href={imageUrl} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer" className="inline-flex min-h-11 items-center gap-2 font-medium text-primary underline underline-offset-4">Ouvrir le visuel en grand<ExternalLink className="h-3.5 w-3.5" aria-hidden /></a> : null}
      </div>
      <p className="text-xs text-muted-foreground">Visuel et texte enregistrés. La mise en page finale peut varier selon le réseau et l’appareil.</p>
    </section>
  );
}
