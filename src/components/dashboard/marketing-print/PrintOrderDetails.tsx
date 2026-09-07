import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getPrintOrder, requestPrintCancellation, requestPrintReorder, type PrintOrderSummary } from "@/lib/print/client";
import { ExternalLink, Loader2, PackageCheck, RotateCcw, XCircle } from "lucide-react";

function formatMoney(cents: number, currency: string) {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency: currency || "CHF" }).format(cents / 100);
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : new Intl.DateTimeFormat("fr-CH", { dateStyle: "medium", timeStyle: "short" }).format(date);
}

export default function PrintOrderDetails({
  restaurantId,
  order,
  open,
  onOpenChange,
  onChanged,
}: {
  restaurantId: string;
  order: PrintOrderSummary | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { toast } = useToast();
  const [events, setEvents] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(false);
  const [action, setAction] = useState<"cancel" | "reorder" | null>(null);
  const [reason, setReason] = useState("reorder_print_quality");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (!open || !order) return;
    let cancelled = false;
    setLoading(true);
    getPrintOrder({ restaurantId, orderId: order.id })
      .then((result) => { if (!cancelled) setEvents(result.events || []); })
      .catch((error) => {
        if (!cancelled) toast({ title: "Suivi indisponible", description: error instanceof Error ? error.message : "Impossible de charger le suivi.", variant: "destructive" });
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, order?.id, restaurantId, toast]);

  if (!order) return null;
  const canCancel = order.payment_status === "paid" && !["shipped", "delivered", "canceled", "refunded"].includes(order.status);

  async function cancel() {
    setAction("cancel");
    try {
      await requestPrintCancellation({ restaurantId, orderId: order.id });
      toast({ title: "Demande envoyée", description: "L’annulation a été demandée au fournisseur. Elle n’est pas garantie une fois la production engagée." });
      onChanged();
    } catch (error) {
      toast({ title: "Annulation impossible", description: error instanceof Error ? error.message : "Impossible de demander l’annulation.", variant: "destructive" });
    } finally {
      setAction(null);
    }
  }

  async function reorder() {
    setAction("reorder");
    try {
      await requestPrintReorder({ restaurantId, orderId: order.id, reason, description });
      toast({ title: "Demande SAV transmise", description: "TheTok va vérifier le dossier avant toute réimpression fournisseur." });
      setDescription("");
      onChanged();
    } catch (error) {
      toast({ title: "Demande impossible", description: error instanceof Error ? error.message : "Impossible d’envoyer la demande SAV.", variant: "destructive" });
    } finally {
      setAction(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Commande d’impression</DialogTitle>
          <DialogDescription>{order.quantity} exemplaires · {formatMoney(order.customer_amount_cents, order.customer_currency)}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">État</p><p className="font-semibold">{order.status}</p></div>
          <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">Paiement</p><p className="font-semibold">{order.payment_status}</p></div>
          <div className="rounded-2xl border p-3"><p className="text-xs text-muted-foreground">Créée</p><p className="font-semibold">{formatDate(order.created_at)}</p></div>
        </div>

        {order.tracking_code || order.tracking_url ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/5 p-4">
            <div className="flex items-center gap-2 font-semibold"><PackageCheck className="h-4 w-4" /> Suivi livraison</div>
            {order.carrier ? <p className="mt-1 text-sm text-muted-foreground">Transport : {order.carrier}</p> : null}
            {order.tracking_code ? <p className="text-sm text-muted-foreground">Tracking : {order.tracking_code}</p> : null}
            {order.tracking_url ? <Button variant="link" className="mt-1 h-auto p-0" asChild><a href={order.tracking_url} target="_blank" rel="noreferrer"><ExternalLink className="mr-1 h-3 w-3" /> Suivre le colis</a></Button> : null}
          </div>
        ) : null}

        <div>
          <p className="mb-3 text-sm font-semibold">Historique</p>
          {loading ? <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Chargement…</div> : (
            <div className="space-y-2">
              {events.length === 0 ? <p className="text-sm text-muted-foreground">Aucun événement détaillé disponible.</p> : events.map((event) => (
                <div key={String(event.id)} className="flex gap-3 rounded-xl border p-3 text-sm">
                  <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-primary" />
                  <div className="min-w-0"><p className="font-medium">{String(event.state || event.event_type || "Mise à jour")}</p><p className="text-xs text-muted-foreground">{String(event.message || "")}</p><p className="text-[11px] text-muted-foreground">{formatDate(String(event.created_at || ""))}</p></div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="grid gap-4 rounded-2xl border p-4 md:grid-cols-2">
          <div>
            <p className="font-semibold">Annulation</p>
            <p className="mt-1 text-xs text-muted-foreground">Une annulation fournisseur est une demande, pas une garantie une fois l’impression commencée.</p>
            <Button type="button" variant="outline" className="mt-3 gap-2" disabled={!canCancel || action !== null} onClick={() => void cancel()}>
              {action === "cancel" ? <Loader2 className="h-4 w-4 animate-spin" /> : <XCircle className="h-4 w-4" />} Demander l’annulation
            </Button>
          </div>
          <div>
            <p className="font-semibold">Réimpression / SAV</p>
            <div className="mt-2 space-y-2">
              <div><Label>Motif</Label><Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder="reorder_print_quality" /></div>
              <div><Label>Description</Label><Input value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Décrivez précisément le problème reçu" /></div>
              <Button type="button" variant="outline" className="gap-2" disabled={action !== null} onClick={() => void reorder()}>
                {action === "reorder" ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Ouvrir une demande SAV
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
