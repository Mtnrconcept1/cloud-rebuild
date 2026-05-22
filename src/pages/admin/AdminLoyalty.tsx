import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Crown, ShieldCheck, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

const EMPTY_PLAN = {
  name: "",
  description: "",
  price_monthly: "",
  price_yearly: "",
  currency: "EUR",
  free_delivery_min_order: "",
  status: "active",
};

const EMPTY_TIER = {
  name: "",
  min_points: "",
  multiplier: "1",
  benefits: "",
};

export default function AdminLoyalty() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [planOpen, setPlanOpen] = useState(false);
  const [tierOpen, setTierOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<any>(null);
  const [editingTier, setEditingTier] = useState<any>(null);
  const [planForm, setPlanForm] = useState(EMPTY_PLAN);
  const [tierForm, setTierForm] = useState(EMPTY_TIER);
  const [savingPlan, setSavingPlan] = useState(false);
  const [savingTier, setSavingTier] = useState(false);

  const { data: tiers = [] } = useQuery({
    queryKey: ["admin-loyalty-tiers"],
    queryFn: async () => {
      const { data, error } = await supabase.from("loyalty_tiers").select("*").order("min_points");
      if (error) throw error;
      return data || [];
    },
  });

  const { data: subscriptionPlans = [] } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_subscription_plans").select("*").order("created_at");
      if (error) throw error;
      return data || [];
    },
  });

  const openNewPlan = () => {
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN);
    setPlanOpen(true);
  };

  const openEditPlan = (plan: any) => {
    setEditingPlan(plan);
    setPlanForm({
      name: plan.name || "",
      description: plan.description || "",
      price_monthly: String(plan.price_monthly ?? ""),
      price_yearly: String(plan.price_yearly ?? ""),
      currency: plan.currency || "EUR",
      free_delivery_min_order: String(plan.free_delivery_min_order ?? ""),
      status: plan.status || "active",
    });
    setPlanOpen(true);
  };

  const savePlan = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingPlan(true);

    const payload = {
      name: planForm.name,
      description: planForm.description || null,
      price_monthly: Number(planForm.price_monthly || 0),
      price_yearly: Number(planForm.price_yearly || 0),
      currency: planForm.currency || "EUR",
      free_delivery_min_order: planForm.free_delivery_min_order ? Number(planForm.free_delivery_min_order) : null,
      status: planForm.status,
    };

    const { error } = editingPlan
      ? await supabase.from("user_subscription_plans").update(payload).eq("id", editingPlan.id)
      : await supabase.from("user_subscription_plans").insert(payload);

    setSavingPlan(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    setPlanOpen(false);
    setEditingPlan(null);
    setPlanForm(EMPTY_PLAN);
    queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    toast({ title: editingPlan ? "Forfait mis a jour" : "Forfait cree" });
  };

  const deletePlan = async (id: string) => {
    const { error } = await supabase.from("user_subscription_plans").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-subscription-plans"] });
    toast({ title: "Forfait supprime" });
  };

  const openNewTier = () => {
    setEditingTier(null);
    setTierForm(EMPTY_TIER);
    setTierOpen(true);
  };

  const openEditTier = (tier: any) => {
    setEditingTier(tier);
    setTierForm({
      name: tier.name || "",
      min_points: String(tier.min_points ?? ""),
      multiplier: String(tier.multiplier ?? 1),
      benefits: tier.benefits ? JSON.stringify(tier.benefits, null, 2) : "",
    });
    setTierOpen(true);
  };

  const saveTier = async (event: React.FormEvent) => {
    event.preventDefault();
    setSavingTier(true);

    let benefitsPayload: Record<string, unknown> | null = null;
    if (tierForm.benefits.trim()) {
      try {
        benefitsPayload = JSON.parse(tierForm.benefits);
      } catch {
        setSavingTier(false);
        toast({ title: "Erreur", description: "Le JSON des avantages est invalide.", variant: "destructive" });
        return;
      }
    }

    const payload = {
      name: tierForm.name,
      min_points: Number(tierForm.min_points || 0),
      multiplier: Number(tierForm.multiplier || 1),
      benefits: benefitsPayload,
    };

    const { error } = editingTier
      ? await supabase.from("loyalty_tiers").update(payload).eq("id", editingTier.id)
      : await supabase.from("loyalty_tiers").insert(payload);

    setSavingTier(false);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    setTierOpen(false);
    setEditingTier(null);
    setTierForm(EMPTY_TIER);
    queryClient.invalidateQueries({ queryKey: ["admin-loyalty-tiers"] });
    toast({ title: editingTier ? "Palier mis a jour" : "Palier cree" });
  };

  const deleteTier = async (id: string) => {
    const { error } = await supabase.from("loyalty_tiers").delete().eq("id", id);
    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }
    queryClient.invalidateQueries({ queryKey: ["admin-loyalty-tiers"] });
    toast({ title: "Palier supprime" });
  };

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Fidelite"
        title="Fidelite et abonnement"
        description="Configurez les forfaits Miamz+ et les paliers de fidelite avec une lecture rapide des plans actifs."
        icon={Crown}
        tone="amber"
        visualLabel="Loyalty"
        stats={[
          { label: "Forfaits", value: subscriptionPlans.length, icon: ShieldCheck },
          { label: "Paliers", value: tiers.length, icon: Crown },
          { label: "Actifs", value: subscriptionPlans.filter((plan: any) => plan.status === "active").length, icon: ShieldCheck },
        ]}
      />

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-5 h-5 text-primary" />
                <CardTitle>Abonnements</CardTitle>
              </div>
              <Dialog open={planOpen} onOpenChange={setPlanOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openNewPlan}>Creer forfait</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editingPlan ? "Modifier le forfait" : "Nouveau forfait"}</DialogTitle></DialogHeader>
                  <form onSubmit={savePlan} className="space-y-3">
                    <Input placeholder="Nom" value={planForm.name} onChange={(event) => setPlanForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <Textarea placeholder="Description" value={planForm.description} onChange={(event) => setPlanForm((prev) => ({ ...prev, description: event.target.value }))} />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Prix mensuel" type="number" step="0.01" value={planForm.price_monthly} onChange={(event) => setPlanForm((prev) => ({ ...prev, price_monthly: event.target.value }))} required />
                      <Input placeholder="Prix annuel" type="number" step="0.01" value={planForm.price_yearly} onChange={(event) => setPlanForm((prev) => ({ ...prev, price_yearly: event.target.value }))} required />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Devise" value={planForm.currency} onChange={(event) => setPlanForm((prev) => ({ ...prev, currency: event.target.value.toUpperCase() }))} />
                      <Input placeholder="Seuil livraison offerte" type="number" step="0.01" value={planForm.free_delivery_min_order} onChange={(event) => setPlanForm((prev) => ({ ...prev, free_delivery_min_order: event.target.value }))} />
                    </div>
                    <select value={planForm.status} onChange={(event) => setPlanForm((prev) => ({ ...prev, status: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2 text-sm">
                      <option value="active">active</option>
                      <option value="archived">archived</option>
                    </select>
                    <Button type="submit" className="w-full" disabled={savingPlan}>{savingPlan ? "Enregistrement..." : editingPlan ? "Mettre a jour" : "Creer"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>Forfaits de livraison et d'avantages partenaires</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {subscriptionPlans.map((plan: any) => (
              <div key={plan.id} className="p-4 border rounded-xl flex justify-between items-start gap-4">
                <div>
                  <p className="font-bold text-lg">{plan.name}</p>
                  <p className="text-sm text-muted-foreground">{Number(plan.price_monthly || 0).toFixed(2)} {plan.currency || "EUR"} / mois</p>
                  <p className="text-xs text-muted-foreground">{plan.description || "Sans description"}</p>
                  <p className="text-xs text-green-600 mt-1">
                    Livraison offerte {plan.free_delivery_min_order ? `(des ${plan.free_delivery_min_order} ${plan.currency || "EUR"})` : "sans minimum"}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => openEditPlan(plan)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deletePlan(plan.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
            {subscriptionPlans.length === 0 ? <p className="text-sm text-muted-foreground">Aucun abonnement configure.</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Crown className="w-5 h-5 text-amber-500" />
                <CardTitle>Paliers de fidelite</CardTitle>
              </div>
              <Dialog open={tierOpen} onOpenChange={setTierOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" size="sm" onClick={openNewTier}>Ajouter palier</Button>
                </DialogTrigger>
                <DialogContent className="max-w-lg">
                  <DialogHeader><DialogTitle>{editingTier ? "Modifier le palier" : "Nouveau palier"}</DialogTitle></DialogHeader>
                  <form onSubmit={saveTier} className="space-y-3">
                    <Input placeholder="Nom" value={tierForm.name} onChange={(event) => setTierForm((prev) => ({ ...prev, name: event.target.value }))} required />
                    <div className="grid grid-cols-2 gap-3">
                      <Input placeholder="Points minimum" type="number" value={tierForm.min_points} onChange={(event) => setTierForm((prev) => ({ ...prev, min_points: event.target.value }))} required />
                      <Input placeholder="Multiplicateur" type="number" step="0.1" value={tierForm.multiplier} onChange={(event) => setTierForm((prev) => ({ ...prev, multiplier: event.target.value }))} required />
                    </div>
                    <Textarea placeholder='Avantages JSON ex: {"priority_support": true}' value={tierForm.benefits} onChange={(event) => setTierForm((prev) => ({ ...prev, benefits: event.target.value }))} />
                    <Button type="submit" className="w-full" disabled={savingTier}>{savingTier ? "Enregistrement..." : editingTier ? "Mettre a jour" : "Creer"}</Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
            <CardDescription>Paliers de points et multiplicateurs associes</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {tiers.map((tier: any) => (
              <div key={tier.id} className="p-4 border rounded-xl bg-gradient-to-tr from-card to-muted/50 flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold capitalize">{tier.name}</p>
                    <span className="text-sm bg-primary text-primary-foreground px-2 py-0.5 rounded-full">Des {tier.min_points} pts</span>
                  </div>
                  <div className="mt-2 text-sm text-muted-foreground">Multiplicateur: x{tier.multiplier}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{tier.benefits ? JSON.stringify(tier.benefits) : "Aucun avantage JSON configure"}</div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="icon" onClick={() => openEditTier(tier)}><Pencil className="w-4 h-4" /></Button>
                  <Button variant="ghost" size="icon" className="text-destructive" onClick={() => deleteTier(tier.id)}><Trash2 className="w-4 h-4" /></Button>
                </div>
              </div>
            ))}
            {tiers.length === 0 ? <p className="text-sm text-muted-foreground">Aucun palier configure.</p> : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
