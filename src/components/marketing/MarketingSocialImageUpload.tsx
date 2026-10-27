import { useEffect, useId, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { uploadMarketingSocialImage } from "@/marketing/marketingClient";
import type { MarketingCalendarItem } from "@/marketing/types";

export function MarketingSocialImageUpload({ item, disabled, onUploaded, onPendingChange }: {
  item: MarketingCalendarItem;
  disabled: boolean;
  onUploaded: (item: MarketingCalendarItem) => void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const inputId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const request = useRef<AbortController | null>(null);
  useEffect(() => () => { request.current?.abort(); onPendingChange?.(false); }, []);
  const editable = !disabled && Boolean(item.updatedAt && Number.isFinite(Date.parse(item.updatedAt)))
    && item.approvalStatus !== "approved" && ["draft", "blocked_configuration", "failed"].includes(item.status);
  if (!["instagram", "facebook"].includes(item.channel)) return null;
  return <section className="space-y-2 rounded-xl border bg-muted/20 p-3" aria-busy={pending}>
    <Label htmlFor={inputId}>{item.visualUrl ? "Remplacer le visuel" : "Importer un visuel"}</Label>
    <Input id={inputId} type="file" accept=".jpg,.jpeg,.png,image/jpeg,image/png" disabled={!editable || pending}
      onChange={async (event) => {
        const file = event.target.files?.[0]; event.target.value = "";
        if (!file || !editable || request.current) return;
        const abort = new AbortController(); request.current = abort;
        setPending(true); setError(""); onPendingChange?.(true);
        try { const updated = await uploadMarketingSocialImage(item.id, item.updatedAt, file, abort.signal);
          if (!abort.signal.aborted) onUploaded(updated);
        } catch (caught) { if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Import impossible."); }
        finally { if (request.current === abort) request.current = null; setPending(false); onPendingChange?.(false); }
      }} />
    <p className="text-xs text-muted-foreground">JPG ou PNG, 3 Mo maximum. L’image est conservée sans recadrage.</p>
    {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
  </section>;
}
