import { useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { invokeSupabaseFunction } from "@/lib/session";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type EliteContractRow = {
  id: string;
  included_establishments_snapshot: number | null;
  additional_establishment_price_cents_snapshot: number | null;
  billing_period: string | null;
};

type EliteContract = Partial<EliteContractRow> & {
  inherited: boolean;
  source?: string;
  linked?: string[];
};

export default function EliteEstablishments({ restaurantId }: { restaurantId: string }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [target, setTarget] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const restaurants = useQuery({ queryKey: ["elite-establishments", user?.id, restaurantId], enabled: Boolean(user),
    queryFn: async () => {
      const { data, error } = await getSupabase().from("restaurants").select("id,name")
        .eq("owner_id", user!.id).neq("id", restaurantId).limit(100);
      if (error) throw error;
      return data;
    } });
  const contract = useQuery({ queryKey: ["elite-contract", restaurantId], enabled: Boolean(user), queryFn: async (): Promise<EliteContract> => {
    const { data: membership, error: linkError } = await (getSupabase() as any).from("restaurant_subscription_establishments")
      .select("subscription_id,restaurant_ai_subscriptions(restaurant_id)").eq("restaurant_id", restaurantId).maybeSingle();
    if (linkError) throw linkError;
    if (membership) return { inherited: true, source: membership.restaurant_ai_subscriptions?.restaurant_id };
    // This relation is not yet present in the generated database types.
    const { data, error } = await (getSupabase() as SupabaseClient).from("restaurant_ai_subscriptions")
      .select("id,included_establishments_snapshot,additional_establishment_price_cents_snapshot,billing_period")
      .eq("restaurant_id", restaurantId).eq("stripe_mode", "live").in("status", ["active", "trialing"])
      .gt("current_period_end", new Date().toISOString()).order("created_at", { ascending: false }).limit(1)
      .returns<EliteContractRow[]>().maybeSingle();
    if (error) throw error;
    if (!data) throw new Error("Contrat actif introuvable");
    const { data: linked, error: linksError } = await (getSupabase() as any).from("restaurant_subscription_establishments")
      .select("restaurant_id").eq("subscription_id", data.id).limit(20);
    if (linksError) throw linksError;
    return { inherited: false, ...data, linked: (linked || []).map((r: { restaurant_id: string }) => r.restaurant_id) as string[] };
  } });
  const attach = async () => {
    setBusy(true);
    try {
      const { error } = await invokeSupabaseFunction("manage-restaurant-establishments", { body: {
        source_restaurant_id: restaurantId, restaurant_id: target, accept_additional_billing: accepted,
      } });
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["elite-contract"] });
      await cache.invalidateQueries({ queryKey: ["restaurant-subscription-self-service"] });
      await cache.invalidateQueries({ queryKey: ["restaurant-credit-usage"] });
      toast.success("Établissement rattaché au contrat Elite"); setTarget(""); setAccepted(false);
    } catch (error) { toast.error(error instanceof Error ? error.message : "Rattachement non confirmé. Réessayez le même établissement."); }
    finally { setBusy(false); }
  };
  if (contract.isLoading) return <p>Chargement du contrat Elite…</p>;
  if (contract.isError) return <p role="alert">Contrat indisponible. <button onClick={() => contract.refetch()}>Réessayer</button></p>;
  if (contract.data?.inherited) return <p className="rounded-xl border p-4">Cet établissement partage le contrat Elite de {restaurants.data?.find(r => r.id === contract.data.source)?.name || "votre établissement principal"}. Sélectionnez cet établissement principal pour gérer le contrat et les rattachements.</p>;
  const included = contract.data?.included_establishments_snapshot ?? 3;
  const monthlyPrice = Number(contract.data?.additional_establishment_price_cents_snapshot ?? 14900) / 100;
  const linked = contract.data?.linked || [];
  return <section className="space-y-3 rounded-xl border p-4"><h3 className="font-bold">Vos établissements Elite</h3>
    <p className="text-sm">{included} établissements au total sont inclus et partagent les crédits du contrat. Chaque site supplémentaire coûte {monthlyPrice.toLocaleString("fr-CH")} CHF/mois, avec prorata facturé à l’ajout. {contract.data?.billing_period === "yearly" && `Votre contrat annuel facture ${(monthlyPrice * 11).toLocaleString("fr-CH")} CHF/an par site supplémentaire.`}</p>
    <p className="text-sm">{linked.length + 1} établissement(s) rattaché(s) : {linked.map((id: string) => restaurants.data?.find(r => r.id === id)?.name || "Établissement").join(", ") || "établissement principal uniquement"}.</p>
    <Label htmlFor="elite-restaurant">Établissement à rattacher</Label>
    <select id="elite-restaurant" className="w-full rounded-md border bg-background p-2" value={target} onChange={e => setTarget(e.target.value)}>
      <option value="">Choisir un restaurant</option>{restaurants.data?.filter(r => !linked.includes(r.id)).map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
    </select>
    {restaurants.isError && <p role="alert">Chargement impossible. <button onClick={() => restaurants.refetch()}>Réessayer</button></p>}
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={accepted} onChange={e => setAccepted(e.target.checked)} />J’accepte la facturation indiquée si les établissements inclus sont déjà utilisés.</label>
    <Button disabled={!target || busy} onClick={attach}>{busy ? "Rattachement…" : "Rattacher cet établissement"}</Button>
    <p className="text-xs text-muted-foreground">Un établissement déjà lié ne peut pas être déplacé en cours de contrat. Pour le détacher, contactez le support afin de clôturer sa facturation et ses consommations.</p>
  </section>;
}
