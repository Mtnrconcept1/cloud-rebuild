import { useMemo, useState } from "react";
import { Loader2, Megaphone, Target } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_AUDIENCE_CRITERIA, normalizeAudienceCriteria } from "@/lib/campaignTargeting";
import { estimateCampaignPlan, getCampaignPricing, recommendCampaignStrategy } from "@/lib/campaignPricing";
import { saveRestaurantCampaign } from "@/lib/campaigns";
import type { SocialFeedPost } from "@/lib/socialFeed";

function toDateInputValue(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDaysToInputDate(value: string, days: number) {
  const base = Number.isFinite(Date.parse(value)) ? new Date(value) : new Date();
  base.setDate(base.getDate() + Math.max(0, days - 1));
  return toDateInputValue(base);
}

function formatChf(value: number, digits = 2) {
  return `${Number(value || 0).toFixed(digits)} CHF`;
}

function compactText(value: string, maxLength = 120) {
  const clean = value.replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}

export default function SocialPostBoostDialog({
  post,
  restaurantId,
  disabled = false,
  onCreated,
}: {
  post: SocialFeedPost;
  restaurantId: string;
  disabled?: boolean;
  onCreated?: () => void;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(`Boost Actualites - ${post.restaurant.name}`);
  const [body, setBody] = useState(compactText(post.body, 220));
  const [totalBudget, setTotalBudget] = useState("25");
  const [startsAt, setStartsAt] = useState(toDateInputValue(new Date()));
  const [durationDays, setDurationDays] = useState(7);
  const [loading, setLoading] = useState(false);

  const totalBudgetValue = Math.max(0, Number(totalBudget) || 0);
  const endsAt = useMemo(() => addDaysToInputDate(startsAt, durationDays), [durationDays, startsAt]);
  const strategy = useMemo(
    () => recommendCampaignStrategy({
      type: "boost",
      targetPages: ["actualites"],
      hasFlashSales: false,
      hasAntiWaste: false,
      hasPriorConversions: false,
    }),
    [],
  );
  const pricing = useMemo(() => getCampaignPricing(undefined, strategy), [strategy]);
  const estimate = useMemo(
    () => estimateCampaignPlan({ totalBudgetChf: totalBudgetValue, durationDays, strategy, pricing }),
    [durationDays, pricing, strategy, totalBudgetValue],
  );
  const imageUrl = post.media.find((media) => media.mediaType === "image")?.mediaUrl || post.restaurant.imageUrl || null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!restaurantId || !post.id) return;
    if (!title.trim()) {
      toast({ title: "Titre requis", description: "Ajoutez un titre pour la mise en avant.", variant: "destructive" });
      return;
    }
    if (totalBudgetValue <= 0) {
      toast({ title: "Budget requis", description: "Le budget doit etre superieur a 0 CHF.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const { data, error } = await saveRestaurantCampaign(restaurantId, {
        restaurant_id: restaurantId,
        social_post_id: post.id,
        title: title.trim(),
        body: body.trim() || compactText(post.body, 220),
        type: "boost",
        pricing_strategy: strategy,
        image_url: imageUrl,
        target_pages: ["actualites"],
        target_criteria: normalizeAudienceCriteria({
          ...DEFAULT_AUDIENCE_CRITERIA,
          cities: post.restaurant.city ? [post.restaurant.city] : [],
          cuisines: post.restaurant.cuisineType ? [post.restaurant.cuisineType] : [],
          restaurantId,
        }),
        total_budget: totalBudgetValue,
        budget_daily: estimate.dailyBudget,
        starts_at: startsAt ? new Date(startsAt).toISOString() : null,
        ends_at: endsAt ? new Date(endsAt).toISOString() : null,
        payment_method: "card",
        payment_status: "unpaid",
        status: "draft",
      });
      if (error) throw error;
      if (!data?.id) throw new Error("Impossible de creer la mise en avant.");

      toast({
        title: "Mise en avant creee",
        description: "La campagne Actualites est prete. Finalisez son paiement depuis Campagnes pour l'activer.",
      });
      setOpen(false);
      onCreated?.();
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de creer la mise en avant.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="outline" className="gap-2" disabled={disabled}>
          <Megaphone className="h-4 w-4" />
          Mettre en avant
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Mettre en avant ce post</DialogTitle>
          <DialogDescription>
            Creez une campagne liee a cette actualite. Elle apparaitra comme sponsorisee quand la campagne sera payee et active.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full">Actualites sponsorisees</Badge>
              <Badge variant="outline" className="rounded-full">{post.restaurant.name}</Badge>
            </div>
            <p className="text-sm leading-6 text-muted-foreground">{compactText(post.body, 260)}</p>
          </div>

          <div className="space-y-2">
            <Label>Titre de campagne</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} required />
          </div>

          <div className="space-y-2">
            <Label>Message publicitaire</Label>
            <Textarea value={body} onChange={(event) => setBody(event.target.value)} rows={3} />
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Budget total (CHF)</Label>
              <Input type="number" min="1" step="0.01" value={totalBudget} onChange={(event) => setTotalBudget(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label>Duree (jours)</Label>
              <Input type="number" min="1" step="1" value={durationDays} onChange={(event) => setDurationDays(Math.max(1, Math.round(Number(event.target.value) || 1)))} required />
            </div>
            <div className="space-y-2">
              <Label>Date de debut</Label>
              <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value || toDateInputValue(new Date()))} required />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Budget / jour</p>
              <p className="font-semibold">{formatChf(estimate.dailyBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Personnes touchees</p>
              <p className="font-semibold">{estimate.estimatedPeopleReached.toLocaleString("fr-CH")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fin estimee</p>
              <p className="font-semibold">{endsAt}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Placement: fil Actualites
            </p>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {loading ? "Preparation..." : "Creer la mise en avant"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
