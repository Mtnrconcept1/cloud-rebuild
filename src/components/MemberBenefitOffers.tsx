import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Offer = { id: string; title: string; description: string; ends_at: string; claimed_at: string | null; code: string | null; claim_reference: string | null; fulfilled_at: string | null };
export default function MemberBenefitOffers({ enabled = true }: { enabled?: boolean }) {
  const { user } = useAuth();
  const cache = useQueryClient();
  const [pending, setPending] = useState<string | null>(null);
  const offers = useQuery({
    queryKey: ["member-benefit-campaigns", user?.id], enabled: Boolean(user && enabled),
    queryFn: async () => {
      const { data, error } = await (getSupabase().rpc as any)("get_my_benefit_campaigns");
      if (error) throw error;
      return (data || []) as Offer[];
    },
  });
  if (!user || !enabled || offers.isLoading) return null;
  if (offers.isError) return <p className="text-sm">Offres membres momentanément indisponibles. <button onClick={() => offers.refetch()}>Réessayer</button></p>;
  if (!offers.data?.length) return <p className="text-sm text-muted-foreground">Aucune offre membre disponible pour le moment.</p>;
  const claim = async (id: string) => {
    setPending(id);
    try {
      const { error } = await (getSupabase().rpc as any)("claim_member_benefit", { p_campaign_id: id });
      if (error) throw error;
      await cache.invalidateQueries({ queryKey: ["member-benefit-campaigns"] });
      toast.success("Offre ajoutée à vos avantages");
    } catch { toast.error("Cette offre n’est plus disponible ou vos droits ont changé."); }
    finally { setPending(null); }
  };
  return <section className="space-y-3" aria-label="Vos offres membres"><h3 className="font-bold">Vos offres membres</h3>
    {offers.data.map(offer => <article key={offer.id} className="space-y-2 rounded-xl border p-4">
      <h4 className="font-semibold">{offer.title}</h4><p className="whitespace-pre-wrap text-sm">{offer.description}</p>
      <p className="text-xs">Valable jusqu’au {new Date(offer.ends_at).toLocaleString("fr-CH")}</p>
      {offer.claim_reference && <p className="text-xs">Référence de retrait : <strong>{offer.claim_reference.slice(0, 18).toUpperCase()}</strong></p>}
      {offer.fulfilled_at && <p className="text-sm">Avantage remis le {new Date(offer.fulfilled_at).toLocaleDateString("fr-CH")}</p>}
      {offer.claimed_at ? <p className="font-medium">{offer.code ? `Votre code : ${offer.code}` : "Offre enregistrée — suivez les modalités ci-dessus."}</p>
        : <Button disabled={pending !== null} onClick={() => claim(offer.id)}>{pending === offer.id ? "Enregistrement…" : "Profiter de cette offre"}</Button>}
    </article>)}
  </section>;
}
