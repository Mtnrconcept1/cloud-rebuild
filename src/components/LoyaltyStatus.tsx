import { ArrowUpRight, CheckCircle2, LockKeyhole, Star, Trophy } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  getLockedTierBenefits,
  getLoyaltyStatus,
  getTierBenefits,
  LOYALTY_TIERS,
} from "@/lib/loyaltyBenefits";

const supabase = getSupabase();

export default function LoyaltyStatus() {
  const { user } = useAuth();
  const { data: profile } = useQuery({
    queryKey: ["profile-loyalty", user?.id],
    queryFn: async () => {
      const { data } = await supabase.from("profiles" as any).select("loyalty_points, current_tier").eq("user_id", user?.id).single();
      return data as any;
    },
    enabled: !!user,
  });

  if (!user || !profile) return null;

  const points = profile.loyalty_points || 0;
  const loyalty = getLoyaltyStatus(points, profile.current_tier);
  const config = LOYALTY_TIERS[loyalty.currentTier];
  const currentBenefits = getTierBenefits(loyalty.currentTier);
  const lockedBenefits = getLockedTierBenefits(loyalty.currentTier);
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
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Programme Fidelite</p>
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
            <Button variant="link" className="h-auto p-0 text-xs font-semibold text-pink-500 hover:text-pink-600">
              Decouvrir les avantages <ArrowUpRight className="h-3 w-3" />
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-xl">
            <DialogHeader>
              <DialogTitle>Avantages {config.label}</DialogTitle>
            </DialogHeader>
            <div className="space-y-5">
              <div className="rounded-lg border bg-muted/30 p-4">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="font-medium">{points.toLocaleString()} Miamz</span>
                  <span className="text-muted-foreground">
                    {nextTierLabel ? `${loyalty.pointsToNextTier} Miamz avant ${nextTierLabel}` : "Tous les avantages sont debloques"}
                  </span>
                </div>
                <Progress value={loyalty.progressPercent} className="mt-3 h-2" />
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold">Avantages actifs</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  {currentBenefits.map((benefit) => (
                    <div key={benefit.id} className="rounded-lg border p-3 text-sm">
                      <div className="flex items-center gap-2 font-medium">
                        <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        {benefit.title}
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">{benefit.description}</p>
                    </div>
                  ))}
                </div>
              </div>

              {lockedBenefits.length > 0 ? (
                <div className="space-y-2">
                  <p className="text-sm font-semibold">A debloquer ensuite</p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {lockedBenefits.slice(0, 6).map((benefit) => (
                      <div key={benefit.id} className="rounded-lg border border-dashed p-3 text-sm opacity-80">
                        <div className="flex items-center gap-2 font-medium">
                          <LockKeyhole className="h-4 w-4 text-muted-foreground" />
                          {benefit.title}
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
