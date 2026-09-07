import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { invokeSupabaseFunction } from "@/lib/session";
import { Loader2, Printer, RefreshCw, RotateCcw, ShieldAlert } from "lucide-react";

type AdminPrintOrder = {
  id: string;
  restaurant_id: string;
  status: string;
  payment_status: string;
  provider_reference: string | null;
  customer_currency: string;
  customer_amount_cents: number;
  quantity: number;
  tracking_code: string | null;
  created_at: string;
  provider_cost: {
    provider_currency: string;
    provider_product_amount: number;
    selected_shipping_amount: number;
    margin_cents: number;
    margin_bps: number;
  } | null;
};

type PrintSettings = {
  enabled: boolean;
  new_orders_enabled: boolean;
  default_margin_bps: number;
  minimum_margin_cents: number;
  rounding_increment_cents: number;
};

type ProviderMapping = {
  id: string;
  provider_reference: string;
  provider_name: string | null;
  print_product_id: string | null;
  active: boolean;
  width_mm: number | null;
  height_mm: number | null;
  synced_at: string | null;
};

type LogicalProduct = { id: string; display_name: string; slug: string };

async function callAdmin<T>(body: Record<string, unknown>) {
  const { data, error } = await invokeSupabaseFunction<T>("print-admin", { body });
  if (error) throw error;
  if (!data) throw new Error("Réponse admin impression indisponible.");
  return data;
}

async function callCatalog<T>(body: Record<string, unknown>) {
  const { data, error } = await invokeSupabaseFunction<T>("print-catalog", { body });
  if (error) throw error;
  if (!data) throw new Error("Réponse catalogue impression indisponible.");
  return data;
}

function money(cents: number, currency = "CHF") {
  return new Intl.NumberFormat("fr-CH", { style: "currency", currency }).format(cents / 100);
}

export default function AdminPrintOrders() {
  const { toast } = useToast();
  const [orders, setOrders] = useState<AdminPrintOrder[]>([]);
  const [settings, setSettings] = useState<PrintSettings | null>(null);
  const [mappings, setMappings] = useState<ProviderMapping[]>([]);
  const [logicalProducts, setLogicalProducts] = useState<LogicalProduct[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("all");
  const [reorderCause, setReorderCause] = useState("reorder_print_quality");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [orderResult, settingsResult, mappingResult] = await Promise.all([
        callAdmin<{ orders: AdminPrintOrder[] }>({ action: "list", page: 1, pageSize: 50, ...(statusFilter !== "all" ? { status: statusFilter } : {}) }),
        callAdmin<{ settings: PrintSettings }>({ action: "settings" }),
        callCatalog<{ mappings: ProviderMapping[]; logicalProducts: LogicalProduct[] }>({ action: "admin_mappings" }),
      ]);
      setOrders(orderResult.orders || []);
      setSettings(settingsResult.settings);
      setMappings(mappingResult.mappings || []);
      setLogicalProducts(mappingResult.logicalProducts || []);
    } catch (error) {
      toast({ title: "Administration Print indisponible", description: error instanceof Error ? error.message : "Erreur de chargement.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [statusFilter, toast]);

  useEffect(() => { void load(); }, [statusFilter]);

  async function updateSettings(patch: Record<string, unknown>) {
    setWorking("settings");
    try {
      const result = await callAdmin<{ settings: PrintSettings }>({ action: "update_settings", ...patch });
      setSettings(result.settings);
      toast({ title: "Paramètres Print enregistrés" });
    } catch (error) {
      toast({ title: "Modification impossible", description: error instanceof Error ? error.message : "Erreur paramètres.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function syncCatalog() {
    setWorking("sync");
    try {
      const result = await callCatalog<{ discovered: number; hydrated: number }>({ action: "sync" });
      toast({ title: "Catalogue synchronisé", description: `${result.discovered} produits découverts, ${result.hydrated} mappings détaillés.` });
      await load();
    } catch (error) {
      toast({ title: "Synchronisation impossible", description: error instanceof Error ? error.message : "Cloudprinter indisponible.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function mapProduct(providerProductId: string, printProductId: string) {
    setWorking(`map:${providerProductId}`);
    try {
      await callAdmin({ action: "map_product", providerProductId, printProductId, active: true });
      toast({ title: "Produit Print activé" });
      await load();
    } catch (error) {
      toast({ title: "Mapping impossible", description: error instanceof Error ? error.message : "Erreur de mapping.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  async function orderAction(orderId: string, action: "reconcile" | "cancel" | "reorder") {
    setWorking(`${action}:${orderId}`);
    try {
      if (action === "reorder") {
        await callAdmin({ action, orderId, cause: reorderCause, description: `Réimpression approuvée depuis l’admin TheTok (${reorderCause}).` });
      } else await callAdmin({ action, orderId });
      toast({ title: action === "reconcile" ? "Commande réconciliée" : action === "cancel" ? "Annulation demandée" : "Réimpression envoyée" });
      await load();
    } catch (error) {
      toast({ title: "Action Print impossible", description: error instanceof Error ? error.message : "Erreur fournisseur.", variant: "destructive" });
    } finally {
      setWorking(null);
    }
  }

  return (
    <section className="mt-8 space-y-6" aria-label="Administration TheTok Print">
      <Card className="rounded-3xl border-orange-500/20">
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2"><Printer className="h-5 w-5" /> TheTok Print — opérations</CardTitle>
            <CardDescription>Cloudprinter, marges, commandes, incidents, réconciliation et SAV.</CardDescription>
          </div>
          <Button variant="outline" disabled={loading || working !== null} onClick={() => void load()}>{loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Actualiser</Button>
        </CardHeader>
        <CardContent className="space-y-6">
          {settings ? (
            <div className="grid gap-4 rounded-2xl border p-4 lg:grid-cols-5">
              <div className="flex items-center justify-between gap-3 lg:block"><Label>Module Print</Label><Switch className="lg:mt-3" checked={settings.enabled} disabled={working !== null} onCheckedChange={(checked) => void updateSettings({ enabled: checked })} /></div>
              <div className="flex items-center justify-between gap-3 lg:block"><Label>Nouvelles commandes</Label><Switch className="lg:mt-3" checked={settings.new_orders_enabled} disabled={working !== null} onCheckedChange={(checked) => void updateSettings({ newOrdersEnabled: checked })} /></div>
              <div><Label>Marge (%)</Label><Input type="number" value={(settings.default_margin_bps / 100).toFixed(2)} onChange={(event) => setSettings({ ...settings, default_margin_bps: Math.round((Number(event.target.value) || 0) * 100) })} onBlur={() => void updateSettings({ defaultMarginBps: settings.default_margin_bps })} /></div>
              <div><Label>Marge min. (CHF)</Label><Input type="number" value={(settings.minimum_margin_cents / 100).toFixed(2)} onChange={(event) => setSettings({ ...settings, minimum_margin_cents: Math.round((Number(event.target.value) || 0) * 100) })} onBlur={() => void updateSettings({ minimumMarginCents: settings.minimum_margin_cents })} /></div>
              <div><Label>Arrondi (ct.)</Label><Input type="number" value={settings.rounding_increment_cents} onChange={(event) => setSettings({ ...settings, rounding_increment_cents: Number(event.target.value) || 1 })} onBlur={() => void updateSettings({ roundingIncrementCents: settings.rounding_increment_cents })} /></div>
            </div>
          ) : null}

          <div className="rounded-2xl border p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><p className="font-semibold">Catalogue fournisseur</p><p className="text-xs text-muted-foreground">Un produit reste invisible au restaurateur tant qu’il n’est pas explicitement mappé à un support TheTok.</p></div>
              <Button variant="outline" disabled={working !== null} onClick={() => void syncCatalog()}>{working === "sync" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}Synchroniser Cloudprinter</Button>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {mappings.slice(0, 100).map((mapping) => (
                <div key={mapping.id} className="grid items-center gap-2 rounded-xl border p-3 md:grid-cols-[1fr_220px_auto]">
                  <div className="min-w-0"><p className="truncate text-sm font-medium">{mapping.provider_name || mapping.provider_reference}</p><p className="truncate text-xs text-muted-foreground">{mapping.provider_reference}{mapping.width_mm && mapping.height_mm ? ` · ${mapping.width_mm} × ${mapping.height_mm} mm` : ""}</p></div>
                  <Select value={mapping.print_product_id || "unmapped"} onValueChange={(value) => { if (value !== "unmapped") void mapProduct(mapping.id, value); }}>
                    <SelectTrigger><SelectValue placeholder="Mapper à TheTok" /></SelectTrigger>
                    <SelectContent><SelectItem value="unmapped">Non mappé</SelectItem>{logicalProducts.map((product) => <SelectItem key={product.id} value={product.id}>{product.display_name}</SelectItem>)}</SelectContent>
                  </Select>
                  <span className={`text-xs font-semibold ${mapping.active ? "text-emerald-600" : "text-muted-foreground"}`}>{mapping.active ? "Actif" : "Inactif"}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div><p className="font-semibold">Commandes</p><p className="text-xs text-muted-foreground">Le coût fournisseur et la marge restent réservés à l’administration.</p></div>
            <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger className="w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Tous les états</SelectItem><SelectItem value="paid">Payées</SelectItem><SelectItem value="submitted">Soumises</SelectItem><SelectItem value="producing">En production</SelectItem><SelectItem value="shipped">Expédiées</SelectItem><SelectItem value="production_error">Incident production</SelectItem><SelectItem value="delivery_failed">Incident livraison</SelectItem></SelectContent></Select>
          </div>

          <div className="space-y-2">
            {orders.map((order) => {
              const providerCents = order.provider_cost ? Math.round((Number(order.provider_cost.provider_product_amount || 0) + Number(order.provider_cost.selected_shipping_amount || 0)) * 100) : null;
              return (
                <div key={order.id} className="grid gap-3 rounded-2xl border p-4 xl:grid-cols-[1fr_auto_auto] xl:items-center">
                  <div className="min-w-0"><p className="font-semibold">{order.quantity} ex. · {money(order.customer_amount_cents, order.customer_currency)}</p><p className="truncate text-xs text-muted-foreground">{order.provider_reference || order.id} · {order.status} · paiement {order.payment_status}</p>{providerCents !== null ? <p className="mt-1 text-xs">Coût fournisseur: {money(providerCents, order.provider_cost?.provider_currency || "CHF")} · Marge: {money(order.provider_cost?.margin_cents || 0)}</p> : null}</div>
                  <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" disabled={working !== null} onClick={() => void orderAction(order.id, "reconcile")}><RefreshCw className="mr-1 h-3 w-3" />Réconcilier</Button><Button size="sm" variant="outline" disabled={working !== null} onClick={() => void orderAction(order.id, "cancel")}><ShieldAlert className="mr-1 h-3 w-3" />Annuler</Button></div>
                  <div className="flex gap-2"><Input className="w-56" value={reorderCause} onChange={(event) => setReorderCause(event.target.value)} /><Button size="sm" disabled={working !== null} onClick={() => void orderAction(order.id, "reorder")}><RotateCcw className="mr-1 h-3 w-3" />Réimprimer</Button></div>
                </div>
              );
            })}
            {!orders.length && !loading ? <p className="rounded-2xl border border-dashed p-6 text-center text-sm text-muted-foreground">Aucune commande Print pour ce filtre.</p> : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
