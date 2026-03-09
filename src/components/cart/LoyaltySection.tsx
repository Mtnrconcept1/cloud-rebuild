import { Trophy, Heart, Sparkles } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

interface LoyaltySectionProps {
  loyaltyPoints: number;
  maxPointsDiscount: number;
  useLoyaltyPoints: boolean;
  setUseLoyaltyPoints: (v: boolean) => void;
  pointsToRedeemInput: number;
  setPointsToRedeemInput: (v: number) => void;
  maxPointsRedeemable: number;
  earnedXp: number;
  donateEarnedXp: boolean;
  setDonateEarnedXp: (v: boolean) => void;
}

export default function LoyaltySection({
  loyaltyPoints, maxPointsDiscount, useLoyaltyPoints, setUseLoyaltyPoints,
  pointsToRedeemInput, setPointsToRedeemInput, maxPointsRedeemable,
  earnedXp, donateEarnedXp, setDonateEarnedXp,
}: LoyaltySectionProps) {
  if (loyaltyPoints <= 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between p-3 rounded-lg bg-pink-500/5 border border-pink-500/20">
        <div className="flex items-center gap-3">
          <Trophy className="h-5 w-5 text-pink-500" />
          <div className="space-y-0.5">
            <Label className="font-semibold cursor-pointer">Utiliser mes Miamz</Label>
            <p className="text-xs text-muted-foreground">Solde: {loyaltyPoints} pts ({maxPointsDiscount.toFixed(2)} CHF max)</p>
          </div>
        </div>
        <Switch checked={useLoyaltyPoints} onCheckedChange={(checked) => { setUseLoyaltyPoints(checked); setPointsToRedeemInput(checked ? maxPointsRedeemable : 0); }} />
      </div>

      {useLoyaltyPoints && (
        <div className="p-3 rounded-lg border bg-card space-y-2">
          <Label className="text-xs">Nombre de Miamz à utiliser</Label>
          <div className="flex items-center gap-2">
            <Input type="number" min={0} max={maxPointsRedeemable} step={1} value={pointsToRedeemInput} onChange={(e) => {
              const parsed = Math.floor(Number(e.target.value));
              setPointsToRedeemInput(Number.isNaN(parsed) ? 0 : Math.max(0, Math.min(parsed, maxPointsRedeemable)));
            }} />
            <Button type="button" variant="outline" onClick={() => setPointsToRedeemInput(maxPointsRedeemable)}>Max</Button>
          </div>
          <p className="text-xs text-muted-foreground">Équivalent à {(pointsToRedeemInput / 100).toFixed(2)} CHF</p>
        </div>
      )}

      {earnedXp > 0 && (
        <div className="flex items-center justify-between p-3 rounded-lg bg-pink-500/5 border border-pink-500/20">
          <div className="flex items-center gap-3">
            <Heart className="h-5 w-5 text-pink-500 fill-pink-500" />
            <div className="space-y-0.5">
              <Label className="font-semibold cursor-pointer">Reverser mes Miamz aux démunis</Label>
              <p className="text-xs text-muted-foreground text-pink-500">
                Vous allez gagner <strong>{earnedXp} Miamz</strong> · Reversez-les à la cagnotte solidaire
              </p>
            </div>
          </div>
          <Switch checked={donateEarnedXp} onCheckedChange={setDonateEarnedXp} />
        </div>
      )}
    </div>
  );
}
