import { useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tag, Check, X, Loader2 } from "lucide-react";

const supabase = getSupabase();

interface PromoCodeInputProps {
  restaurantId: string | null;
  userId: string | undefined;
  subtotal: number;
  onApplied: (discount: number, name: string | null, codeId: string | null) => void;
}

export default function PromoCodeInput({ restaurantId, userId, subtotal, onApplied }: PromoCodeInputProps) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<{ name: string; discount: number } | null>(null);

  const handleApply = async () => {
    const trimmed = code.trim().toUpperCase();
    if (!trimmed) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch promo code
      const { data: promo, error: fetchErr } = await supabase
        .from("promo_codes")
        .select("*")
        .eq("code", trimmed)
        .eq("is_active", true)
        .maybeSingle();

      if (fetchErr) throw fetchErr;
      if (!promo) { setError("Code promo invalide."); setLoading(false); return; }

      const now = new Date().toISOString();

      // Validate dates
      if (promo.valid_from && promo.valid_from > now) { setError("Ce code n'est pas encore actif."); setLoading(false); return; }
      if (promo.valid_until && promo.valid_until < now) { setError("Ce code a expiré."); setLoading(false); return; }

      // Validate uses
      if (promo.max_uses != null && promo.current_uses >= promo.max_uses) { setError("Ce code a atteint sa limite d'utilisation."); setLoading(false); return; }

      // Validate restaurant
      if (promo.restaurant_id && promo.restaurant_id !== restaurantId) { setError("Ce code n'est pas valable pour ce restaurant."); setLoading(false); return; }

      // Validate min order amount
      if (promo.min_order_amount && subtotal < Number(promo.min_order_amount)) {
        setError(`Commande minimum de ${Number(promo.min_order_amount).toFixed(2)} CHF requise.`);
        setLoading(false);
        return;
      }

      // Check per-user limit
      if (userId && promo.per_user_limit) {
        const { count } = await supabase
          .from("promo_code_uses")
          .select("*", { count: "exact", head: true })
          .eq("promo_code_id", promo.id)
          .eq("user_id", userId);

        if (count != null && count >= promo.per_user_limit) {
          setError("Vous avez déjà utilise ce code.");
          setLoading(false);
          return;
        }
      }

      // Check first order only
      if (promo.is_first_order_only && userId) {
        const { count } = await supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("user_id", userId)
          .neq("status", "cancelled");

        if (count != null && count > 0) {
          setError("Ce code est réservé à la première commande.");
          setLoading(false);
          return;
        }
      }

      // Calculate discount
      let discount = 0;
      if (promo.type === "percentage") {
        discount = (subtotal * Number(promo.value)) / 100;
        if (promo.max_discount) discount = Math.min(discount, Number(promo.max_discount));
      } else if (promo.type === "fixed") {
        discount = Math.min(Number(promo.value), subtotal);
      }
      // free_delivery handled via metadata, not as item discount

      const name = `Code ${trimmed} (-${promo.type === "percentage" ? promo.value + "%" : Number(promo.value).toFixed(2) + " CHF"})`;
      setApplied({ name, discount });
      onApplied(discount, name, promo.id);
    } catch {
      setError("Erreur lors de la vérification du code.");
    } finally {
      setLoading(false);
    }
  };

  const handleRemove = () => {
    setApplied(null);
    setCode("");
    setError(null);
    onApplied(0, null, null);
  };

  if (applied) {
    return (
      <div className="flex items-center gap-2 p-3 rounded-xl border border-primary/20 bg-primary/5">
        <Badge variant="secondary" className="bg-primary/10 text-primary">
          <Check className="h-3 w-3 mr-1" />{applied.name}
        </Badge>
        <span className="text-sm font-medium text-primary ml-auto">-{applied.discount.toFixed(2)} CHF</span>
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={handleRemove}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-primary transition-colors"
      >
        <Tag className="h-4 w-4" />
        Ajouter un code promo
      </button>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={code}
          onChange={(e) => { setCode(e.target.value); setError(null); }}
          placeholder="Saisir le code promo"
          className="uppercase"
          onKeyDown={(e) => e.key === "Enter" && handleApply()}
        />
        <Button onClick={handleApply} disabled={loading || !code.trim()} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Appliquer"}
        </Button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
