import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMarketingMailingImage } from "@/marketing/marketingClient";
import type { MarketingCalendarItem } from "@/marketing/types";

export function MarketingMailingImageUpload({ item, disabled = false, onUploaded, onPendingChange }: {
  item: MarketingCalendarItem;
  disabled?: boolean;
  onUploaded: (item: MarketingCalendarItem) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const request = useRef<AbortController | null>(null);
  const pendingCallback = useRef(onPendingChange);
  useEffect(() => { pendingCallback.current = onPendingChange; }, [onPendingChange]);
  useEffect(() => {
    setPending(false); setError(""); setSaved(false);
    return () => {
      if (request.current) {
        request.current.abort(); request.current = null;
        pendingCallback.current?.(false);
      }
    };
  }, [item.id]);
  const hasRevision = Boolean(item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)));
  const editable = !disabled && item.approvalStatus !== "approved"
    && ["draft", "blocked_configuration", "failed"].includes(item.status) && hasRevision;

  const upload = async (file?: File) => {
    if (!file || !editable || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true); setError(""); setSaved(false); onPendingChange?.(true);
    try {
      const updated = await uploadMarketingMailingImage(item.id, item.updatedAt, file, controller.signal);
      if (controller.signal.aborted) return;
      onUploaded(updated);
      setSaved(true);
    } catch (caught) {
      if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "L’image n’a pas pu être enregistrée. Réessayez.");
    } finally {
      if (request.current === controller) request.current = null;
      if (!controller.signal.aborted) { setPending(false); onPendingChange?.(false); }
    }
  };

  if (item.channel !== "email" || !item.postPreview?.email) return null;
  return <section aria-label={`Image de ${item.title}`} className="space-y-2 rounded-xl border bg-muted/20 p-3" aria-busy={pending}>
    <Label htmlFor={inputId}>{item.visualUrl ? "Remplacer l’image de cet e-mail" : "Importer l’image de cet e-mail"}</Label>
    <Input id={inputId} aria-label={`Importer une image pour ${item.title}`} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png"
      disabled={!editable || pending} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void upload(file); }} />
    <p className="text-xs text-muted-foreground">JPG ou PNG, 3 Mo maximum. Format 16:9 conseillé ; votre image est conservée sans recadrage. Cet import concerne uniquement cet e-mail.</p>
    {!hasRevision ? <p role="status" className="text-xs text-amber-800">Actualisez les publications pour charger la version de cet e-mail avant l’import.</p> : null}
    {pending ? <p role="status" className="text-sm">Import de l’image en cours…</p> : null}
    {saved && !pending ? <p role="status" className="text-sm text-emerald-700">Image enregistrée. Relisez l’aperçu de cet e-mail avant validation.</p> : null}
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
  </section>;
}
