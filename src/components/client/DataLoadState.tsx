import { useState } from "react";
import { AlertCircle, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";

/** A read failure must never look like a zero balance, no activity or missing consent. */
export default function DataLoadState({ title, description = "Vos informations restent enregistrées. Réessayez pour les retrouver.", onRetry, loading = false }: { title: string; description?: string; onRetry?: () => unknown; loading?: boolean }) {
  const [retrying, setRetrying] = useState(false);
  const retry = async () => {
    if (retrying || !onRetry) return;
    setRetrying(true);
    try { await onRetry(); } catch { /* The query error stays visible until recovery. */ } finally { setRetrying(false); }
  };
  if (loading) return <div role="status" aria-busy="true" className="rounded-2xl border bg-card p-6"><p className="font-medium">{title}</p><div aria-hidden="true" className="mt-4 h-16 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" /></div>;
  return <section role="alert" className="rounded-2xl border border-destructive/30 bg-card p-5 sm:p-6"><div className="flex items-start gap-3"><AlertCircle aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-destructive" /><div className="min-w-0"><h2 className="font-display text-xl font-semibold">{title}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p></div></div>{onRetry ? <Button type="button" variant="outline" className="mt-4 min-h-11 w-full gap-2 sm:w-auto" onClick={() => void retry()} disabled={retrying}><RefreshCcw aria-hidden="true" className="h-4 w-4" />{retrying ? "Nouvelle tentative…" : "Réessayer"}</Button> : null}</section>;
}
