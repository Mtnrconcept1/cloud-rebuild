import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Gift, RefreshCw, ShieldCheck, Wallet } from "lucide-react";
import { toast } from "sonner";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";

type Row = {
  id: string;
  parrain: string;
  filleul: string;
  status: string;
  created_at: string;
  first_paid_at: string | null;
  eligible_at: string | null;
  credit_cents: number | null;
  credited_at: string | null;
  stripe_balance_transaction_id: string | null;
  rejected_reason: string | null;
};
type AdminDashboard = {
  rows: Row[];
  stats: {
    total: number;
    credited: number;
    in_progress: number;
    review_required: number;
    credited_cents: number;
  };
};

const money = (cents: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(cents / 100);
const date = (at: string | null) => at
  ? new Date(at).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" }) : "—";

function adminReferralRpc() {
  return getSupabase() as unknown as {
    rpc: (
      name: "list_admin_restaurant_referrals" | "reject_admin_restaurant_referral",
      params: { p_limit: number } | { p_referral_id: string; p_reason: string },
    ) => PromiseLike<{ data: AdminDashboard | boolean | null; error: { message: string } | null }>;
  };
}

export default function AdminParrainages() {
  const client = useQueryClient();
  const [rejecting, setRejecting] = useState<Row | null>(null);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["admin-restaurant-referrals"],
    queryFn: async () => {
      const result = await adminReferralRpc().rpc("list_admin_restaurant_referrals", { p_limit: 200 });
      if (result.error) throw new Error(result.error.message);
      return result.data as AdminDashboard;
    },
    staleTime: 30_000,
  });

  const reject = async () => {
    if (!rejecting || reason.trim().length < 10 || saving) return;
    setSaving(true);
    try {
      const response = await adminReferralRpc().rpc("reject_admin_restaurant_referral", {
        p_referral_id: rejecting.id,
        p_reason: reason.trim(),
      });
      if (response.error || response.data !== true) {
        throw new Error(response.error?.message || "Ce parrainage n'est plus modifiable.");
      }
      toast.success("Parrainage refusé et décision enregistrée");
      setRejecting(null);
      setReason("");
      await client.invalidateQueries({ queryKey: ["admin-restaurant-referrals"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Refus impossible");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <DashboardPageHero
        badge="TOK — Gouvernance"
        title="Parrainages restaurateurs"
        description="Contrôlez les filleuls, leurs 30 jours de validation, les avoirs Stripe et les éventuelles anomalies."
        icon={Gift}
        stats={[
          { label: "Total", value: data?.stats.total ?? "—", icon: Gift },
          { label: "Mois offerts", value: data?.stats.credited ?? "—", icon: ShieldCheck },
          { label: "Crédits accordés", value: data ? money(data.stats.credited_cents) : "—", icon: Wallet },
          { label: "À contrôler", value: data?.stats.review_required ?? "—", icon: RefreshCw },
        ]}
      />
      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-2">
          <CardTitle>Journal des parrainages</CardTitle>
          <Button variant="outline" size="sm" onClick={() => void refetch()}><RefreshCw className="mr-2 h-4 w-4" /> Actualiser</Button>
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p role="status">Chargement des parrainages…</p> : null}
          {error ? <p role="alert" className="text-sm text-destructive">Chargement impossible. Vérifiez les permissions administrateur et réessayez.</p> : null}
          {data?.rows.length === 0 ? <p className="text-sm text-muted-foreground">Aucun parrainage à ce jour.</p> : null}
          {data?.rows.map((referral) => (
            <div key={referral.id} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="min-w-0 space-y-1">
                <p className="font-semibold">{referral.parrain} → {referral.filleul}</p>
                <p className="text-xs text-muted-foreground">
                  Inscrit le {date(referral.created_at)} · Paiement : {date(referral.first_paid_at)}
                  · Éligible : {date(referral.eligible_at)}
                </p>
                {referral.stripe_balance_transaction_id ? (
                  <p className="break-all text-xs text-muted-foreground">Stripe : {referral.stripe_balance_transaction_id}</p>
                ) : null}
                {referral.rejected_reason ? (
                  <p className="text-xs text-destructive">Motif : {referral.rejected_reason}</p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={referral.status === "rejected" ? "destructive" : "secondary"}>
                  {referral.status}
                </Badge>
                {referral.status === "credited" && referral.credit_cents ? (
                  <span className="text-sm font-semibold">{money(referral.credit_cents)}</span>
                ) : null}
                {["pending", "qualifying"].includes(referral.status) ? (
                  <Button variant="outline" size="sm" onClick={() => { setRejecting(referral); setReason(""); }}>
                    Refuser
                  </Button>
                ) : null}
              </div>
            </div>
          ))}
          {data?.rows && data.stats.total > data.rows.length ? (
            <p className="text-xs text-muted-foreground">Affichage des 200 derniers parrainages.</p>
          ) : null}
        </CardContent>
      </Card>
      <Dialog open={!!rejecting} onOpenChange={(open) => { if (!open && !saving) setRejecting(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Refuser ce parrainage ?</DialogTitle>
            <DialogDescription>
              Le crédit ne sera plus émis. Un parrainage déjà crédité ou en traitement ne peut pas être refusé ici.
              Cette décision est tracée avec votre compte administrateur.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            maxLength={500}
            placeholder="Motif du refus (au moins 10 caractères)"
            aria-label="Motif du refus"
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)} disabled={saving}>Annuler</Button>
            <Button variant="destructive" onClick={() => void reject()} disabled={reason.trim().length < 10 || saving}>
              Confirmer le refus
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
