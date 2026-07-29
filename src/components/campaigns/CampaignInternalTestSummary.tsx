import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Eye, MousePointerClick, ShieldCheck, Target } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { getSupabase } from "@/integrations/supabase/client";

type CampaignInternalTestMetric = {
  campaign_id?: string | null;
  impressions?: number | string | null;
  clicks?: number | string | null;
  conversions?: number | string | null;
  last_event_at?: string | null;
};

type CampaignInternalTestTotals = {
  impressions: number;
  clicks: number;
  conversions: number;
  lastEventAt: string | null;
};

type CampaignInternalTestSummaryProps = {
  restaurantId: string | null | undefined;
  since: string;
  enabled?: boolean;
};

function toCount(value: unknown) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, count) : 0;
}

export default function CampaignInternalTestSummary({
  restaurantId,
  since,
  enabled = true,
}: CampaignInternalTestSummaryProps) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["campaign-internal-test-metrics", restaurantId, since],
    queryFn: async () => {
      const { data: rows, error: queryError } = await (getSupabase().rpc as any)(
        "get_ad_campaign_internal_test_metrics",
        {
          p_restaurant_id: restaurantId,
          p_since: since,
        },
      );
      if (queryError) throw queryError;
      return (rows || []) as CampaignInternalTestMetric[];
    },
    enabled: Boolean(enabled && restaurantId),
    retry: 1,
    staleTime: 15_000,
    refetchOnMount: "always",
    refetchInterval: 10_000,
  });

  const totals = useMemo(
    () => data.reduce<CampaignInternalTestTotals>(
      (summary, row) => ({
        impressions: summary.impressions + toCount(row.impressions),
        clicks: summary.clicks + toCount(row.clicks),
        conversions: summary.conversions + toCount(row.conversions),
        lastEventAt: !summary.lastEventAt || (
          row.last_event_at
          && Date.parse(row.last_event_at) > Date.parse(summary.lastEventAt)
        )
          ? row.last_event_at || summary.lastEventAt
          : summary.lastEventAt,
      }),
      {
        impressions: 0,
        clicks: 0,
        conversions: 0,
        lastEventAt: null as string | null,
      },
    ),
    [data],
  );

  if (!restaurantId || !enabled) return null;

  return (
    <Card className="border-amber-200 bg-amber-50/70 dark:border-amber-400/20 dark:bg-amber-400/5">
      <CardContent className="grid gap-4 py-4 lg:grid-cols-[minmax(220px,1.25fr)_minmax(0,2fr)] lg:items-center">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300">
            <ShieldCheck className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-amber-950 dark:text-amber-100">
              Tests internes — non facturés
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900/75 dark:text-amber-100/70">
              Les actions du propriétaire et des administrateurs sont visibles ici pour valider le parcours,
              mais restent exclues des KPI payants et du budget.
            </p>
            {totals.lastEventAt ? (
              <p className="mt-1 text-[11px] text-amber-900/60 dark:text-amber-100/55">
                Dernier test : {new Date(totals.lastEventAt).toLocaleString("fr-CH")}
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
          {[
            { label: "Impressions", value: totals.impressions, icon: Eye },
            { label: "Clics", value: totals.clicks, icon: MousePointerClick },
            { label: "Conversions", value: totals.conversions, icon: Target },
          ].map(({ label, value, icon: Icon }) => (
            <div
              key={label}
              className="rounded-xl border border-amber-200/80 bg-white/80 px-3 py-2.5 dark:border-amber-400/15 dark:bg-slate-950/35"
            >
              <p className="flex items-center gap-1.5 text-[11px] font-medium text-amber-900/70 dark:text-amber-100/65">
                <Icon className="h-3.5 w-3.5" />
                {label}
              </p>
              <p className="mt-1 text-xl font-black text-amber-950 dark:text-amber-100">
                {isLoading ? "…" : value.toLocaleString("fr-CH")}
              </p>
            </div>
          ))}
        </div>

        {error ? (
          <p className="text-xs text-amber-800 dark:text-amber-200 lg:col-span-2">
            Le détail des tests internes est temporairement indisponible.
          </p>
        ) : null}
      </CardContent>
    </Card>
  );
}
