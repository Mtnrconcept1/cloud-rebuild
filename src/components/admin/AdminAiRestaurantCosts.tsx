import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, ChevronLeft, ChevronRight, RefreshCw } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { getSupabase } from "@/integrations/supabase/client";

type RestaurantAiCosts = {
  restaurant_id: string;
  restaurant_name: string;
  requests: number;
  estimated_cost_chf: number;
  input_tokens: number;
  output_tokens: number;
  logged_credit_units: number;
};

type AdminAiCostReport = {
  since: string;
  until: string;
  cost_type: "estimated_only";
  total_restaurants: number;
  has_more: boolean;
  summary: {
    requests: number;
    attributed_requests: number;
    unattributed_requests: number;
    estimated_cost_chf: number;
    input_tokens: number;
    output_tokens: number;
  };
  restaurants: RestaurantAiCosts[];
  models: Array<{ model: string; requests: number; estimated_cost_chf: number }>;
};

const PAGE_SIZE = 25;
const formatChf = (value: number) => new Intl.NumberFormat("fr-CH", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
}).format(Number(value) || 0) + " CHF";

const formatCount = (value: number) =>
  new Intl.NumberFormat("fr-CH").format(Number(value) || 0);

export default function AdminAiRestaurantCosts() {
  const [page, setPage] = useState(0);
  const query = useQuery({
    queryKey: ["admin-ai-restaurant-cost-report", page],
    queryFn: async (): Promise<AdminAiCostReport> => {
      // The SECURITY DEFINER RPC rejects all callers without the admin role.
      // No privileged Supabase or OpenAI API key is ever sent to the browser.
      const { data, error } = await (getSupabase().rpc as any)(
        "admin_ai_restaurant_cost_report",
        { p_days: 30, p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE },
      );
      if (error) throw new Error(error.message || "Rapport IA indisponible");
      if (!data || data.cost_type !== "estimated_only" || !Array.isArray(data.restaurants)) {
        throw new Error("Format du rapport IA inattendu");
      }
      return data as AdminAiCostReport;
    },
    staleTime: 60_000,
    retry: false,
  });

  const report = query.data;

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle>Consommation OpenAI par restaurant</CardTitle>
          <p className="text-sm text-muted-foreground">
            Trente derniers jours — estimation issue des journaux TOK, non du relevé de facturation OpenAI.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualiser
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        {query.isLoading && <p className="text-sm text-muted-foreground">Chargement du rapport IA…</p>}
        {query.isError && (
          <p role="alert" className="text-sm text-destructive">
            Impossible de charger les coûts IA : {query.error.message}
          </p>
        )}
        {report && (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Coût fournisseur estimé</p>
                <p className="font-semibold">{formatChf(report.summary.estimated_cost_chf)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Appels IA réussis</p>
                <p className="font-semibold">{formatCount(report.summary.requests)}</p>
              </div>
              <div className="rounded-lg border p-3">
                <p className="text-xs text-muted-foreground">Restaurants avec consommation</p>
                <p className="font-semibold">{formatCount(report.total_restaurants)}</p>
              </div>
            </div>
            {Number(report.summary.unattributed_requests) > 0 && (
              <p className="flex items-center gap-2 text-sm text-amber-700 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {formatCount(report.summary.unattributed_requests)} appels sans restaurant associé :
                ils sont inclus dans le total mais pas répartis par établissement.
              </p>
            )}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th scope="col" className="py-2 pr-3">Restaurant</th>
                    <th scope="col" className="py-2 pr-3 text-right">Appels</th>
                    <th scope="col" className="py-2 pr-3 text-right">Crédits journalisés</th>
                    <th scope="col" className="py-2 text-right">Coût OpenAI estimé</th>
                  </tr>
                </thead>
                <tbody>
                  {report.restaurants.map((restaurant) => (
                    <tr key={restaurant.restaurant_id} className="border-b">
                      <td className="py-3 pr-3">
                        <p className="font-medium">{restaurant.restaurant_name}</p>
                        <p className="text-xs text-muted-foreground">{restaurant.restaurant_id}</p>
                      </td>
                      <td className="py-3 pr-3 text-right">{formatCount(restaurant.requests)}</td>
                      <td className="py-3 pr-3 text-right">{formatCount(restaurant.logged_credit_units)}</td>
                      <td className="py-3 text-right font-medium">{formatChf(restaurant.estimated_cost_chf)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {report.restaurants.length === 0 && <p className="py-4 text-sm text-muted-foreground">Aucune consommation attribuable à un restaurant sur cette période.</p>}
            </div>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">
                Page {page + 1} sur {Math.max(1, Math.ceil(report.total_restaurants / PAGE_SIZE))}
              </span>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" disabled={page === 0 || query.isFetching} onClick={() => setPage((value) => Math.max(0, value - 1))}>
                  <ChevronLeft className="mr-1 h-4 w-4" />Précédent
                </Button>
                <Button type="button" variant="outline" size="sm" disabled={!report.has_more || query.isFetching} onClick={() => setPage((value) => value + 1)}>
                  Suivant<ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Les crédits sont ceux explicitement présents dans les journaux. Le coût utilise les tarifs
              estimés enregistrés par TOK ; il ne constitue ni le coût facturé définitif ni une marge commerciale.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
