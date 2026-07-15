import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, BadgePercent, Trash2, Edit2 } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import {
  readCommercialDemoToolState,
  writeCommercialDemoToolState,
} from "@/lib/commercialDemoRestaurantTools";

const supabase = getSupabase();

const COMMERCIAL_DEMO_PROMOTIONS_TOOL = "promotions";

type PromotionRecord = {
  id: string;
  restaurant_id: string;
  name: string;
  promotion_type: string;
  promotion_value: number;
  target: string;
  start_at: string;
  end_at: string;
  active: boolean;
  created_at?: string;
};

type PromotionPayload = Omit<PromotionRecord, "id" | "active" | "created_at">;

function commercialDemoPromotionId(sessionId: string) {
  const suffix = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return `commercial-demo-promotion-${sessionId}-${suffix}`;
}

function buildCommercialDemoPromotionSeed(sessionId: string, restaurantId: string): PromotionRecord[] {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 14);

  return [{
    id: `commercial-demo-promotion-${sessionId}-welcome`,
    restaurant_id: restaurantId,
    name: "Offre découverte",
    promotion_type: "percentage",
    promotion_value: 15,
    target: "new",
    start_at: start.toISOString(),
    end_at: end.toISOString(),
    active: true,
    created_at: start.toISOString(),
  }];
}

const PROMO_TYPES = [
  { value: "percentage", label: "Pourcentage" },
  { value: "fixed", label: "Montant fixe" },
  { value: "free_delivery", label: "Livraison gratuite" },
];

const TARGET_OPTIONS = [
  { value: "all", label: "Tous les clients" },
  { value: "new", label: "Nouveaux clients" },
  { value: "returning", label: "Clients fidèles" },
];

export default function DashboardPromotions() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemo = commercialDemoFrame?.surface === "restaurant";
  const demoSessionId = isCommercialDemo ? commercialDemoFrame.config.sessionId : null;
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PromotionRecord | null>(null);
  const effectiveRestaurantIds = isCommercialDemo && commercialDemoFrame
    ? [commercialDemoFrame.snapshot.demo_restaurant.id]
    : restaurantIds;
  const promotionsQueryKey = ["dashboard-promotions", effectiveRestaurantIds, demoSessionId] as const;
  const demoSeed = isCommercialDemo && commercialDemoFrame
    ? buildCommercialDemoPromotionSeed(
      commercialDemoFrame.config.sessionId,
      commercialDemoFrame.snapshot.demo_restaurant.id,
    )
    : [];

  const { data: promotions, isLoading } = useQuery<PromotionRecord[]>({
    queryKey: promotionsQueryKey,
    queryFn: async () => {
      if (!effectiveRestaurantIds.length) return [];

      if (demoSessionId) {
        return readCommercialDemoToolState(
          demoSessionId,
          COMMERCIAL_DEMO_PROMOTIONS_TOOL,
          demoSeed,
        );
      }

      const { data } = await supabase
        .from("restaurant_promotions")
        .select("*")
        .in("restaurant_id", effectiveRestaurantIds)
        .order("created_at", { ascending: false });
      return (data || []) as PromotionRecord[];
    },
    enabled: effectiveRestaurantIds.length > 0,
  });

  const updateCommercialDemoPromotions = (
    updater: (current: PromotionRecord[]) => PromotionRecord[],
  ) => {
    if (!demoSessionId) return false;
    const current = queryClient.getQueryData<PromotionRecord[]>(promotionsQueryKey)
      ?? readCommercialDemoToolState(
        demoSessionId,
        COMMERCIAL_DEMO_PROMOTIONS_TOOL,
        demoSeed,
      );
    const next = updater(current);
    writeCommercialDemoToolState(demoSessionId, COMMERCIAL_DEMO_PROMOTIONS_TOOL, next);
    queryClient.setQueryData(promotionsQueryKey, next);
    return true;
  };

  const toggleActive = async (id: string, current: boolean) => {
    if (updateCommercialDemoPromotions((items) => items.map((promotion) => (
      promotion.id === id ? { ...promotion, active: !current } : promotion
    )))) {
      toast({ title: current ? "Promotion désactivée" : "Promotion activée" });
      return;
    }

    await supabase.from("restaurant_promotions").update({ active: !current }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-promotions"] });
    toast({ title: current ? "Promotion désactivée" : "Promotion activée" });
  };

  const deletePromo = async (id: string) => {
    if (updateCommercialDemoPromotions((items) => items.filter((promotion) => promotion.id !== id))) {
      toast({ title: "Promotion supprimée" });
      return;
    }

    await supabase.from("restaurant_promotions").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-promotions"] });
    toast({ title: "Promotion supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Activation client"
          title="Promotions"
          description="Créez et suivez les remises par audience pour relancer la demande sans perdre le contrôle des campagnes."
          icon={BadgePercent}
          tone="orange"
          visualLabel="Promos"
          stats={[
            { label: "Promotions", value: promotions?.length || 0, icon: BadgePercent },
            { label: "Actives", value: promotions?.filter((promo) => promo.active).length || 0, icon: Plus },
            { label: "Restaurants", value: effectiveRestaurantIds.length, icon: BadgePercent },
          ]}
          actions={(
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild>
              <Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle promotion</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Modifier la promotion" : "Nouvelle promotion"}</DialogTitle></DialogHeader>
              <PromoForm
                restaurantIds={effectiveRestaurantIds}
                initial={editing}
                demoSessionId={demoSessionId}
                saveCommercialDemo={(payload) => updateCommercialDemoPromotions((items) => {
                  const now = new Date().toISOString();
                  if (editing) {
                    return items.map((promotion) => promotion.id === editing.id
                      ? { ...promotion, ...payload }
                      : promotion);
                  }
                  return [{
                    ...payload,
                    id: commercialDemoPromotionId(demoSessionId!),
                    active: true,
                    created_at: now,
                  }, ...items];
                })}
                onSaved={() => {
                  setOpen(false);
                  setEditing(null);
                  if (!demoSessionId) {
                    queryClient.invalidateQueries({ queryKey: ["dashboard-promotions"] });
                  }
                  toast({ title: editing ? "Promotion modifiée" : "Promotion créée" });
                }}
              />
            </DialogContent>
          </Dialog>
          )}
        />

        {isLoading ? (
          <div className="space-y-3">{[1, 2].map(i => <div key={i} className="h-20 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !promotions?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune promotion active. Créez-en une pour attirer plus de clients !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {promotions.map((promo) => {
              const isExpired = new Date(promo.end_at) < new Date();
              return (
                <Card key={promo.id}>
                  <CardContent className="flex items-center gap-4 py-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <p className="font-semibold text-sm">{promo.name}</p>
                        <Badge className="bg-primary/10 text-primary text-[10px]">
                          {promo.promotion_type === "percentage" ? `-${promo.promotion_value}%` :
                           promo.promotion_type === "fixed" ? `-${promo.promotion_value} CHF` :
                           "Livraison gratuite"}
                        </Badge>
                        <Badge variant="outline" className="text-[10px]">
                          {TARGET_OPTIONS.find(t => t.value === promo.target)?.label || promo.target}
                        </Badge>
                        {!promo.active && <Badge variant="secondary" className="text-[10px]">Inactive</Badge>}
                        {isExpired && <Badge variant="destructive" className="text-[10px]">Expirée</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {new Date(promo.start_at).toLocaleDateString("fr-FR")} → {new Date(promo.end_at).toLocaleDateString("fr-FR")}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch checked={promo.active} onCheckedChange={() => toggleActive(promo.id, promo.active)} />
                      <Button size="icon" variant="ghost" onClick={() => { setEditing(promo); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                      <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deletePromo(promo.id)}><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}

function PromoForm({
  restaurantIds,
  initial,
  demoSessionId,
  saveCommercialDemo,
  onSaved,
}: {
  restaurantIds: string[];
  initial?: PromotionRecord | null;
  demoSessionId?: string | null;
  saveCommercialDemo: (payload: PromotionPayload) => boolean;
  onSaved: () => void;
}) {
  const [name, setName] = useState(initial?.name || "");
  const [promoType, setPromoType] = useState(initial?.promotion_type || "percentage");
  const [promoValue, setPromoValue] = useState(initial?.promotion_value?.toString() || "10");
  const [target, setTarget] = useState(initial?.target || "all");
  const [startAt, setStartAt] = useState(initial?.start_at?.split("T")[0] || new Date().toISOString().split("T")[0]);
  const [endAt, setEndAt] = useState(initial?.end_at?.split("T")[0] || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const restaurantId = initial?.restaurant_id || restaurantIds[0];
    if (!restaurantId) {
      setLoading(false);
      return;
    }
    const normalizedPromotionValue = promoType === "free_delivery" ? 0 : Number(promoValue);
    const payload: PromotionPayload = {
      restaurant_id: restaurantId,
      name,
      promotion_type: promoType,
      promotion_value: normalizedPromotionValue,
      target,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : new Date(Date.now() + 30 * 86400000).toISOString(),
    };

    if (demoSessionId) {
      const saved = saveCommercialDemo(payload);
      setLoading(false);
      if (saved) onSaved();
      return;
    }

    if (initial) {
      await supabase.from("restaurant_promotions").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("restaurant_promotions").insert(payload);
    }
    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label>Nom de la promotion</Label>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="Ex: -20% ce weekend" required />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Type</Label>
          <Select value={promoType} onValueChange={setPromoType}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{PROMO_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Valeur {promoType === "percentage" ? "(%)" : "(CHF)"}</Label>
          <Input
            type="number"
            step="0.01"
            value={promoType === "free_delivery" ? "0" : promoValue}
            onChange={e => setPromoValue(e.target.value)}
            disabled={promoType === "free_delivery"}
            required
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Cible</Label>
        <Select value={target} onValueChange={setTarget}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{TARGET_OPTIONS.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Date début</Label><Input type="date" value={startAt} onChange={e => setStartAt(e.target.value)} required /></div>
        <div className="space-y-2"><Label>Date fin</Label><Input type="date" value={endAt} onChange={e => setEndAt(e.target.value)} required /></div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? "Enregistrement..." : initial ? "Modifier" : "Créer la promotion"}
      </Button>
    </form>
  );
}
