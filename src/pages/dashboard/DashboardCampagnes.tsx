import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import DashboardLayout from "@/components/DashboardLayout";
import { useOwnerRestaurants } from "./useOwnerRestaurants";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Plus, Megaphone, Trash2, Edit2, Eye, MousePointer, ShoppingCart } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";

const CAMPAIGN_TYPES = [
  { value: "sponsored", label: "Sponsorisé" },
  { value: "banner", label: "Bannière" },
  { value: "push", label: "Push notification" },
];

const STATUS_MAP: Record<string, { label: string; variant: "default" | "secondary" | "outline" | "destructive" }> = {
  draft: { label: "Brouillon", variant: "outline" },
  active: { label: "Active", variant: "default" },
  paused: { label: "En pause", variant: "secondary" },
  ended: { label: "Terminée", variant: "destructive" },
};

export default function DashboardCampagnes() {
  const { restaurantIds } = useOwnerRestaurants();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);

  const { data: campaigns, isLoading } = useQuery({
    queryKey: ["dashboard-campaigns", restaurantIds],
    queryFn: async () => {
      if (!restaurantIds.length) return [];
      const { data } = await supabase.from("ad_campaigns").select("*").in("restaurant_id", restaurantIds).order("created_at", { ascending: false });
      return data || [];
    },
    enabled: restaurantIds.length > 0,
  });

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("ad_campaigns").update({ status }).eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns"] });
    toast({ title: `Campagne ${STATUS_MAP[status]?.label || status}` });
  };

  const deleteCampaign = async (id: string) => {
    await supabase.from("ad_campaigns").delete().eq("id", id);
    queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns"] });
    toast({ title: "Campagne supprimée" });
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Megaphone className="h-6 w-6 text-primary" />
            <h1 className="font-display text-3xl font-bold">Campagnes publicitaires</h1>
          </div>
          <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) setEditing(null); }}>
            <DialogTrigger asChild><Button className="gap-2"><Plus className="h-4 w-4" /> Nouvelle campagne</Button></DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader><DialogTitle>{editing ? "Modifier" : "Nouvelle campagne"}</DialogTitle></DialogHeader>
              <CampaignForm restaurantIds={restaurantIds} initial={editing} onSaved={() => { setOpen(false); setEditing(null); queryClient.invalidateQueries({ queryKey: ["dashboard-campaigns"] }); toast({ title: editing ? "Modifiée" : "Campagne créée" }); }} />
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <div className="space-y-3">{[1,2].map(i => <div key={i} className="h-24 bg-muted animate-pulse rounded-xl" />)}</div>
        ) : !campaigns?.length ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">Aucune campagne. Boostez la visibilité de votre restaurant !</CardContent></Card>
        ) : (
          <div className="space-y-3">
            {campaigns.map((c: any) => {
              const st = STATUS_MAP[c.status] || STATUS_MAP.draft;
              return (
                <Card key={c.id}>
                  <CardContent className="py-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-sm">{c.title}</p>
                        <Badge variant={st.variant} className="text-[10px]">{st.label}</Badge>
                        <Badge variant="outline" className="text-[10px]">{CAMPAIGN_TYPES.find(t => t.value === c.type)?.label}</Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {c.status === "draft" && <Button size="sm" variant="default" onClick={() => updateStatus(c.id, "active")}>Lancer</Button>}
                        {c.status === "active" && <Button size="sm" variant="secondary" onClick={() => updateStatus(c.id, "paused")}>Pause</Button>}
                        {c.status === "paused" && <Button size="sm" variant="default" onClick={() => updateStatus(c.id, "active")}>Reprendre</Button>}
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}><Edit2 className="h-4 w-4" /></Button>
                        <Button size="icon" variant="ghost" className="text-destructive" onClick={() => deleteCampaign(c.id)}><Trash2 className="h-4 w-4" /></Button>
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1"><Eye className="h-3 w-3" />{c.impressions || 0} impressions</span>
                      <span className="flex items-center gap-1"><MousePointer className="h-3 w-3" />{c.clicks || 0} clics</span>
                      <span className="flex items-center gap-1"><ShoppingCart className="h-3 w-3" />{c.conversions || 0} conversions</span>
                      <span>Budget: {Number(c.spent || 0).toFixed(2)}/{Number(c.total_budget || 0).toFixed(2)} CHF</span>
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

function CampaignForm({ restaurantIds, initial, onSaved }: { restaurantIds: string[]; initial?: any; onSaved: () => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [body, setBody] = useState(initial?.body || "");
  const [type, setType] = useState(initial?.type || "sponsored");
  const [totalBudget, setTotalBudget] = useState(initial?.total_budget?.toString() || "");
  const [dailyBudget, setDailyBudget] = useState(initial?.budget_daily?.toString() || "");
  const [startsAt, setStartsAt] = useState(initial?.starts_at?.split("T")[0] || "");
  const [endsAt, setEndsAt] = useState(initial?.ends_at?.split("T")[0] || "");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const payload = {
      restaurant_id: initial?.restaurant_id || restaurantIds[0],
      title, body, type,
      total_budget: Number(totalBudget) || 0,
      budget_daily: Number(dailyBudget) || 0,
      starts_at: startsAt ? new Date(startsAt).toISOString() : null,
      ends_at: endsAt ? new Date(endsAt).toISOString() : null,
    };
    if (initial) {
      await supabase.from("ad_campaigns").update(payload).eq("id", initial.id);
    } else {
      await supabase.from("ad_campaigns").insert({ ...payload, status: "draft" });
    }
    setLoading(false);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2"><Label>Titre</Label><Input value={title} onChange={e => setTitle(e.target.value)} required /></div>
      <div className="space-y-2"><Label>Description</Label><Textarea value={body} onChange={e => setBody(e.target.value)} /></div>
      <div className="space-y-2">
        <Label>Type</Label>
        <Select value={type} onValueChange={setType}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>{CAMPAIGN_TYPES.map(t => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}</SelectContent>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Budget total (CHF)</Label><Input type="number" step="0.01" value={totalBudget} onChange={e => setTotalBudget(e.target.value)} /></div>
        <div className="space-y-2"><Label>Budget quotidien (CHF)</Label><Input type="number" step="0.01" value={dailyBudget} onChange={e => setDailyBudget(e.target.value)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2"><Label>Date début</Label><Input type="date" value={startsAt} onChange={e => setStartsAt(e.target.value)} /></div>
        <div className="space-y-2"><Label>Date fin</Label><Input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} /></div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">{loading ? "Enregistrement..." : initial ? "Modifier" : "Créer la campagne"}</Button>
    </form>
  );
}