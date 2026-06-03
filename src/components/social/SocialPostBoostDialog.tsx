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
import { buildCheckoutReturnUrl } from "@/lib/checkoutReturnUrl";
import { estimateCampaignPlan, getCampaignPricing, recommendCampaignStrategy } from "@/lib/campaignPricing";
import { invokeSupabaseFunction } from "@/lib/session";
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
  const [title, setTitle] = useState(`Boost Actualités - ${post.restaurant.name}`);
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
      toast({ title: "Budget requis", description: "Le budget doit être supérieur à 0 CHF.", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const targetCriteria = normalizeAudienceCriteria({
        ...DEFAULT_AUDIENCE_CRITERIA,
        cities: post.restaurant.city ? [post.restaurant.city] : [],
        cuisines: post.restaurant.cuisineType ? [post.restaurant.cuisineType] : [],
        restaurantId,
      });

      const { data, error } = await invokeSupabaseFunction<{ campaign?: { id?: string } }>("create-social-post-boost", {
        body: {
          restaurantId,
          postId: post.id,
          title: title.trim(),
          body: body.trim() || compactText(post.body, 220),
          imageUrl,
          totalBudget: totalBudgetValue,
          durationDays,
          startsAt,
          pricingStrategy: strategy,
          targetCriteria,
        },
      });

      if (error) throw error;
      const campaignId = data?.campaign?.id;
      if (!campaignId) throw new Error("Impossible de créer la mise en avant.");

      const checkout = await invokeSupabaseFunction<{ url?: string }>("create-checkout", {
        body: {
          checkout_kind: "campaign",
          items: [
            {
              name: `Post sponsorisé Actualités - ${post.restaurant.name}`,
              restaurant_name: post.restaurant.name,
              price: totalBudgetValue,
              quantity: 1,
            },
          ],
          payment_method: "card",
          return_url: buildCheckoutReturnUrl(`/dashboard/actualites?campaign_checkout=1&campaign_id=${campaignId}&post_id=${post.id}`),
          order_metadata: {
            checkout_kind: "campaign",
            order_reference: `social-post-campaign-${campaignId}`,
            campaign_id: campaignId,
            social_post_id: post.id,
            campaign_title: title.trim(),
            restaurant_id: restaurantId,
            target_page: "actualites",
            disable_connected_account: true,
          },
        },
      });

      if (checkout.error || !checkout.data?.url) {
        throw new Error(checkout.error?.message || "Impossible de créer la session de paiement.");
      }

      onCreated?.();
      globalThis.location.assign(checkout.data.url);
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible de créer la mise en avant.",
        variant: "destructive",
      });
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
            Créez une campagne liee à cette actualité. Elle apparaîtra comme sponsorisée quand la campagne sera payée et active.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="rounded-xl border bg-muted/30 p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <Badge variant="secondary" className="rounded-full">Actualités sponsorisées</Badge>
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
              <Label>Date de début</Label>
              <Input type="date" value={startsAt} onChange={(event) => setStartsAt(event.target.value || toDateInputValue(new Date()))} required />
            </div>
          </div>

          <div className="grid gap-3 rounded-xl border bg-background p-3 sm:grid-cols-3">
            <div>
              <p className="text-xs text-muted-foreground">Budget / jour</p>
              <p className="font-semibold">{formatChf(estimate.dailyBudget)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Personnes touchées</p>
              <p className="font-semibold">{estimate.estimatedPeopleReached.toLocaleString("fr-CH")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Fin estimée</p>
              <p className="font-semibold">{endsAt}</p>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Target className="h-3.5 w-3.5" />
              Placement: fil Actualités
            </p>
            <Button type="submit" disabled={loading} className="gap-2">
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Megaphone className="h-4 w-4" />}
              {loading ? "Préparation..." : "Payer et sponsoriser"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
