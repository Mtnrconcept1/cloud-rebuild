import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const supabase = getSupabase();
type Application = {
  restaurant_id: string;
  status: string;
  application_note: string;
  created_at: string;
  restaurants: { name: string } | null;
};

export default function GoldenTokReviewPanel() {
  const [page, setPage] = useState(0);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const applications = useQuery({
    queryKey: ["admin-golden-tok-applications", page],
    queryFn: async () => {
      const { data, error, count } = await (supabase.from("golden_tok_accreditations" as any) as any)
        .select("restaurant_id, status, application_note, created_at, restaurants(name)", { count: "exact" })
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .range(page * 25, (page + 1) * 25 - 1);
      if (error) throw error;
      return { rows: (data || []) as Application[], total: count || 0 };
    },
  });
  const review = useMutation({
    mutationFn: async ({ restaurantId, approve, reason }: {
      restaurantId: string;
      approve: boolean;
      reason: string;
    }) => {
      const { error } = await (supabase.rpc as any)("admin_review_golden_tok_accreditation", {
        p_restaurant_id: restaurantId, p_approve: approve, p_reason: reason,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-golden-tok-applications"] });
      toast({ title: "Candidature examinée" });
    },
    onError: (error: Error) => toast({ title: "Révision impossible", description: error.message, variant: "destructive" }),
  });
  const decide = (restaurantId: string, approve: boolean) => {
    const reason = window.prompt(approve ? "Motif d'acceptation (obligatoire) :" : "Motif de refus (obligatoire) :");
    if (!reason || reason.trim().length < 6) {
      toast({ title: "Motif de 6 caractères minimum requis", variant: "destructive" });
      return;
    }
    review.mutate({ restaurantId, approve, reason: reason.trim() });
  };
  return (
    <Card>
      <CardHeader><CardTitle>Candidatures restaurants gastronomiques ({applications.data?.total ?? "—"})</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {applications.isError && <p role="alert" className="text-sm text-destructive">Impossible de récupérer les candidatures.</p>}
        {applications.isLoading && <p className="text-sm text-muted-foreground">Chargement…</p>}
        {applications.isSuccess && applications.data.rows.length === 0 && <p className="text-sm text-muted-foreground">Aucune candidature en attente.</p>}
        {applications.data?.rows.map((item) => (
          <div key={item.restaurant_id} className="space-y-2 rounded-xl border p-4">
            <p className="font-semibold">{item.restaurants?.name || item.restaurant_id}</p>
            <p className="whitespace-pre-wrap text-sm">{item.application_note}</p>
            <p className="text-xs text-muted-foreground">Demandée le {new Date(item.created_at).toLocaleDateString("fr-CH")}</p>
            <div className="flex gap-2">
              <Button type="button" disabled={review.isPending} onClick={() => decide(item.restaurant_id, true)}>Accréditer</Button>
              <Button type="button" variant="outline" disabled={review.isPending} onClick={() => decide(item.restaurant_id, false)}>Refuser</Button>
            </div>
          </div>
        ))}
        {applications.data && applications.data.total > 25 && (
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>Précédent</Button>
            <Button type="button" variant="outline" disabled={(page + 1) * 25 >= applications.data.total} onClick={() => setPage((p) => p + 1)}>Suivant</Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
