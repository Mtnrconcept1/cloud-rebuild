import { useEffect, useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Download, FileText, Euro } from "lucide-react";

type Invoice = {
  id: string;
  period_start: string;
  period_end: string;
  amount_ht: number;
  amount_tva: number;
  amount_ttc: number;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  pdf_url: string | null;
  created_at: string;
  restaurant_id: string;
};

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  pending: { label: "En attente", variant: "secondary" },
  paid: { label: "Payée", variant: "default" },
  overdue: { label: "En retard", variant: "destructive" },
};

export default function DashboardFactures() {
  const { toast } = useToast();
  const { restaurants, restaurantIds, loading: loadingRestaurants, error: restaurantError } = useOwnerRestaurants();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    if (!restaurantIds.length) return setLoading(false);
    setLoading(true);
    const { data, error } = await supabase
      .from("restaurant_invoices")
      .select("*")
      .in("restaurant_id", restaurantIds)
      .order("period_end", { ascending: false });
    setError(error?.message || null);
    setInvoices((data || []) as Invoice[]);
    setLoading(false);
  };

  useEffect(() => {
    if (!loadingRestaurants) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingRestaurants, restaurantIds.join(",")]);

  const totalHT = invoices.reduce((s, i) => s + Number(i.amount_ht), 0);
  const totalTTC = invoices.reduce((s, i) => s + Number(i.amount_ttc), 0);
  const unpaid = invoices.filter((i) => i.status !== "paid");

  const restaurantName = (id: string) => restaurants.find((r) => r.id === id)?.name || "—";
  const fmt = (d: string) => new Date(d).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" });

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <h1 className="font-display text-3xl font-bold">Factures</h1>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total HT</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalHT.toFixed(2)} €</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total TTC</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{totalTTC.toFixed(2)} €</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Impayées</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{unpaid.length}</p></CardContent>
          </Card>
        </div>

        {loadingRestaurants || loading ? <p>Chargement...</p> : null}
        {restaurantError || error ? <p className="text-destructive">Erreur : {restaurantError || error}</p> : null}
        {!loading && !error && !invoices.length ? (
          <Card>
            <CardContent className="pt-6 text-center text-muted-foreground">
              <FileText className="mx-auto h-10 w-10 mb-2 opacity-40" />
              <p>Aucune facture pour le moment.</p>
            </CardContent>
          </Card>
        ) : null}

        <div className="space-y-3">
          {invoices.map((inv) => {
            const s = STATUS_MAP[inv.status] || STATUS_MAP.draft;
            return (
              <Card key={inv.id}>
                <CardContent className="pt-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <Euro className="h-4 w-4 text-muted-foreground" />
                      <span className="font-semibold">{Number(inv.amount_ttc).toFixed(2)} € TTC</span>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {restaurantName(inv.restaurant_id)} · Période : {fmt(inv.period_start)} → {fmt(inv.period_end)}
                    </p>
                    {inv.due_at && !inv.paid_at && (
                      <p className="text-xs text-muted-foreground">Échéance : {fmt(inv.due_at)}</p>
                    )}
                    {inv.paid_at && (
                      <p className="text-xs text-muted-foreground">Payée le {fmt(inv.paid_at)}</p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {inv.pdf_url && (
                      <Button size="sm" variant="outline" asChild>
                        <a href={inv.pdf_url} target="_blank" rel="noreferrer"><Download className="h-4 w-4 mr-1" />PDF</a>
                      </Button>
                    )}
                    {inv.status !== "paid" && (
                      <Button
                        size="sm"
                        onClick={async () => {
                          const { error } = await supabase
                            .from("restaurant_invoices")
                            .update({ status: "paid", paid_at: new Date().toISOString() })
                            .eq("id", inv.id);
                          if (error) toast({ title: "Erreur", description: error.message, variant: "destructive" });
                          else { toast({ title: "Facture marquée comme payée" }); load(); }
                        }}
                      >
                        Marquer payée
                      </Button>
                    )}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </div>
    </DashboardLayout>
  );
}
