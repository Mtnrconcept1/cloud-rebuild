import { ArrowUpRight, CheckCircle2, LockKeyhole, Star, Trophy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useToast } from "@/hooks/use-toast";
import {
  getLockedTierBenefits,
  getLoyaltyStatus,
  getTierBenefits,
  LOYALTY_TIERS,
} from "@/lib/loyaltyBenefits";

const supabase = getSupabase();

export default function LoyaltyStatus() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points, current_tier").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });
  const { data: tiers = [] } = useQuery({
    queryKey: ["loyalty-tiers"],
    queryFn: async () => {
      const { data } = await supabase
        .from("loyalty_tiers")
        .select("name, benefits")
        .order("min_points", { ascending: true });
      return data || [];
    },
    enabled: !!user,
  });
  const birthdayBonusMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("claim_miamz_birthday_bonus");
      if (error) throw error;
      return data as { already_claimed?: boolean; points?: number } | null;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["profile-loyalty"] });
      queryClient.invalidateQueries({ queryKey: ["loyalty-transactions"] });
      toast({
        title: result?.already_claimed ? "Bonus deja reclame" : "Bonus anniversaire ajoute",
        description: result?.already_claimed
          ? "Votre bonus anniversaire MIAMZ a deja ete utilise cette annee."
          : `${Number(result?.points || 0).toLocaleString()} Miamz ajoutes a votre solde.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Bonus indisponible",
        description: error?.message || "Le bonus anniversaire ne peut pas etre reclame maintenant.",
        variant: "destructive",
      });
    },
  });

  if (!user || !profile) return null;

  const points = profile.loyalty_points || 0;
  const loyalty = getLoyaltyStatus(points, profile.current_tier);
  const config = LOYALTY_TIERS[loyalty.currentTier];
  const currentBenefits = getTierBenefits(loyalty.currentTier, tiers);
  const lockedBenefits = getLockedTierBenefits(loyalty.currentTier, tiers);
  const previewBenefits = currentBenefits.filter((benefit) => benefit.highlight).slice(0, 2);
  const nextTierLabel = loyalty.nextTier ? LOYALTY_TIERS[loyalty.nextTier].label : null;

  return (
    <div className="glass-morphism rounded-2xl p-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity">
        <Trophy className="h-24 w-24 text-pink-500" />
      </div>
      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Programme Fidélité</p>
            <h3 className="font-display text-2xl font-bold flex items-center gap-2">
              {points.toLocaleString()} <span className="text-pink-500 text-sm uppercase">Miamz</span>
            </h3>
          </div>
          <Badge className={`${config.colorClass} text-white px-3 py-1 text-xs font-bold uppercase tracking-tighter`}>
            Tier {config.label}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between gap-3 text-xs font-medium">
            <span className="text-muted-foreground">Progression vers le niveau suivant</span>
            <span>{loyalty.nextThreshold ? `${points} / ${loyalty.nextThreshold}` : "Niveau maximum atteint"}</span>
          </div>
          <Progress value={loyalty.progressPercent} className="h-2 bg-secondary/50" />
        </div>

        {previewBenefits.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {previewBenefits.map((benefit) => (
              <span key={benefit.id} className="inline-flex items-center gap-1 rounded-full bg-background/70 px-2.5 py-1 text-[11px] font-medium text-foreground">
                <Star className="h-3 w-3 text-pink-500" />
                {benefit.title}
              </span>
            ))}
          </div>
        ) : null}

        <Dialog>
          <DialogTrigger asChild>
            <Button variant="link" className="min-h-[44px] justify-start p-0 text-xs font-semibold text-pink-500 hover:text-pink-600">
              Découvrir les avantages <ArrowUpRight className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="flex h-[calc(100dvh-0.75rem)] max-h-[calc(100dvh-0.75rem)] w-[calc(100vw-0.75rem)] max-w-2xl flex-col gap-0 overflow-hidden p-0 sm:h-[min(860px,calc(100dvh-2rem))] sm:max-h-[min(860px,calc(100dvh-2rem))]">
            <DialogHeader className="shrink-0 border-b bg-background/95 px-4 py-4 pr-12 text-left backdrop-blur sm:px-6">
              <DialogTitle>Avantages {config.label}</DialogTitle>
              <DialogDescription>
                Tous vos avantages actifs et ceux à débloquer, lisibles sur mobile.
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] sm:px-6">
              <div className="sticky top-0 z-10 rounded-lg border bg-background/95 p-3 shadow-sm backdrop-blur sm:p-4">
                <div className="flex flex-col gap-1 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <span className="font-medium">{points.toLocaleString()} Miamz</span>
                  <span className="text-muted-foreground">
                    {nextTierLabel ? `${loyalty.pointsToNextTier} Miamz avant ${nextTierLabel}` : "Tous les avantages sont débloqués"}
                  </span>
                </div>
                <Progress value={loyalty.progressPercent} className="mt-3 h-2" />
              </div>

              <div className="mt-5 space-y-2">
                <p className="text-sm font-semibold">Avantages actifs</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentBenefits.map((benefit) => (
                    <div key={benefit.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                        <span>{benefit.title}</span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{benefit.description}</p>
                      {benefit.id === "birthday_bonus" ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-3 h-8 rounded-md px-2 text-xs"
                          aria-label={`Bonus anniversaire - ${benefit.title}`}
                          disabled={birthdayBonusMutation.isPending}
                          onClick={() => birthdayBonusMutation.mutate()}
                        >
                          {birthdayBonusMutation.isPending ? "Traitement..." : "Reclamer"}
                        </Button>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>

              {lockedBenefits.length > 0 ? (
                <div className="mt-5 space-y-2 pb-2">
                  <p className="text-sm font-semibold">À débloquer ensuite</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {lockedBenefits.slice(0, 6).map((benefit) => (
                      <div key={benefit.id} className="rounded-lg border border-dashed p-3 text-sm opacity-80">
                        <div className="flex items-center gap-2 font-medium">
                          <LockKeyhole className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span>{benefit.title}</span>
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">{benefit.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
