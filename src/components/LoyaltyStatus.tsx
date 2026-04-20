import { Star, Trophy, ArrowUpRight } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

const supabase = getSupabase();

const TIER_CONFIG = {
  bronze: { color: "bg-orange-700", label: "Bronze", next: 1000 },
  silver: { color: "bg-slate-400", label: "Silver", next: 2500 },
  gold: { color: "bg-amber-400", label: "Gold", next: 5000 },
  platinum: { color: "bg-indigo-400", label: "Platinum", next: null },
};

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
  const currentTier = (profile.current_tier as keyof typeof TIER_CONFIG) || "bronze";
  const config = TIER_CONFIG[currentTier];
  const progress = config.next ? (points / config.next) * 100 : 100;

  return (
    <div className="glass-morphism rounded-2xl p-6 relative overflow-hidden group">
      <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-20 transition-opacity"><Trophy className="h-24 w-24 text-pink-500" /></div>
      <div className="relative z-10 space-y-4">
        <div className="flex items-center justify-between">
          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Programme Fidélité</p>
            <h3 className="font-display text-2xl font-bold flex items-center gap-2">{points.toLocaleString()} <span className="text-pink-500 text-sm uppercase">Miamz</span></h3>
          </div>
          <Badge className={`${config.color} text-white hover:${config.color} px-3 py-1 text-xs font-bold uppercase tracking-tighter`}>Tier {config.label}</Badge>
        </div>
        <div className="space-y-2">
          <div className="flex justify-between text-xs font-medium">
            <span className="text-muted-foreground">Progression vers le niveau suivant</span>
            <span>{config.next ? `${points} / ${config.next}` : "Niveau Maximum atteint !"}</span>
          </div>
          <Progress value={progress} className="h-2 bg-secondary/50" />
        </div>
        <button className="flex items-center gap-1 text-xs font-semibold text-pink-500 hover:text-pink-600 hover:underline transition-all">Découvrir les avantages <ArrowUpRight className="h-3 w-3" /></button>
      </div>
    </div>
  );
}
