import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Camera, Crown, FileText, LineChart, Megaphone, MessageSquareText, Sparkles } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useSessionStorageState } from "@/hooks/useSessionStorageState";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";
import {
  getAiSubscriptionForRestaurant,
  getAiUsageForRestaurant,
  runRestaurantAgent,
  type RestaurantAgentAction,
  type RestaurantAiSubscription,
} from "@/lib/ai/tokAiClient";

const ACTIONS: Array<{
  value: RestaurantAgentAction;
  label: string;
  icon: typeof Bot;
  prompt: string;
}> = [
  { value: "general", label: "Assistant IA général", icon: Bot, prompt: "Priorise les actions utiles pour le restaurant cette semaine." },
  { value: "menu_optimizer", label: "Optimisation du menu", icon: FileText, prompt: "Améliore les descriptions des plats et signale les incohérences de prix." },
  { value: "photo_enhancer", label: "Photos & visuels", icon: Camera, prompt: "Propose un brief photo premium pour les plats à améliorer." },
  { value: "marketing_campaign", label: "Campagnes marketing", icon: Megaphone, prompt: "Crée un brouillon de campagne locale pour augmenter les commandes." },
  { value: "sales_insights", label: "Analyse des ventes", icon: LineChart, prompt: "Analyse les ventes récentes et les risques de marge." },
  { value: "promotions", label: "Promotions recommandées", icon: Sparkles, prompt: "Recommande une promotion sans dégrader la marge." },
  { value: "review_reply", label: "Réponses aux avis", icon: MessageSquareText, prompt: "Prépare des réponses aux avis difficiles en ton restaurateur." },
];

type RestaurantAgentResult = Awaited<ReturnType<typeof runRestaurantAgent>>;
type DashboardAiDraft = {
  action: RestaurantAgentAction;
  prompt: string;
  result: RestaurantAgentResult | null;
};

const DEFAULT_DRAFT: DashboardAiDraft = {
  action: "general",
  prompt: ACTIONS[0].prompt,
  result: null,
};

const FALLBACK_AI_SUBSCRIPTION: Pick<
  RestaurantAiSubscription,
  "plan" | "status" | "monthly_conversation_limit" | "monthly_text_tool_limit" | "monthly_image_limit" | "monthly_premium_image_limit" | "monthly_voice_minutes_limit"
> = {
  plan: "starter",
  status: "trialing",
  monthly_conversation_limit: 50,
  monthly_text_tool_limit: 20,
  monthly_image_limit: 0,
  monthly_premium_image_limit: 0,
  monthly_voice_minutes_limit: 0,
};

const AI_PLAN_LABELS: Record<RestaurantAiSubscription["plan"], string> = {
  starter: "Starter",
  pro: "Pro",
  premium: "Premium",
  elite: "Elite",
  custom: "Sur mesure",
};

function buildAiUpgradeMailto(restaurantName: string, plan: string) {
  const subject = encodeURIComponent(`Upgrade plan IA TOK - ${restaurantName}`);
  const body = encodeURIComponent([
    `Bonjour TOK,`,
    "",
    `Je souhaite passer au plan IA supérieur pour ${restaurantName}.`,
    `Plan actuel: ${plan}.`,
    "",
    "Merci de me proposer l'upgrade adapté.",
  ].join("\n"));
  return `mailto:hello@thetok.ch?subject=${subject}&body=${body}`;
}

export default function DashboardAiAgent() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const [draft, setDraft, clearDraft] = useSessionStorageState<DashboardAiDraft>(
    `tok-dashboard-ai-agent:${selectedId || "pending"}`,
    DEFAULT_DRAFT,
  );
  const action = draft.action;
  const prompt = draft.prompt;

  const restaurantName = restaurants.find((restaurant) => restaurant.id === selectedId)?.name || "Restaurant";

  const { data: usage = [] } = useQuery({
    queryKey: ["restaurant-ai-usage", selectedId],
    queryFn: () => getAiUsageForRestaurant(selectedId!),
    enabled: !!selectedId,
  });

  const { data: aiSubscription } = useQuery({
    queryKey: ["restaurant_ai_subscriptions", selectedId],
    queryFn: () => getAiSubscriptionForRestaurant(selectedId!),
    enabled: !!selectedId,
  });

  const agentMutation = useMutation({
    mutationFn: () => runRestaurantAgent({
      restaurantId: selectedId!,
      action,
      prompt,
      context: { surface: "dashboard-ai-agent" },
    }),
    onSuccess: (data) => setDraft((previous) => ({ ...previous, result: data })),
  });

  const result = draft.result;
  const totalCost = usage.reduce((sum, row) => sum + Number(row.estimated_cost_chf || 0), 0);
  const usageCalls = usage.reduce((sum, row) => sum + Number(row.calls || 0), 0);
  const subscription = aiSubscription || FALLBACK_AI_SUBSCRIPTION;
  const planLabel = AI_PLAN_LABELS[subscription.plan];
  const conversationLimit = Number(subscription.monthly_conversation_limit || 0);
  const usagePercent = conversationLimit > 0 ? Math.min(100, Math.round((usageCalls / conversationLimit) * 100)) : 0;

  return (
    <div className="space-y-6">
      <DashboardPageHero
        badge="IA restaurateur"
        title="Agent IA"
        description="Assistant IA restaurateur pour optimiser menu, photos, campagnes, ventes, promotions, réponses aux avis et historique des actions IA."
        icon={Bot}
        tone="violet"
        visualLabel="AI"
        stats={[
          { label: "Limites de l'abonnement IA", value: usage.length || 0, icon: Sparkles },
          { label: "Coût estimé", value: `${totalCost.toFixed(4)} CHF`, icon: LineChart },
          { label: "Mode", value: "Brouillon", icon: FileText },
        ]}
      />

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <Card>
          <CardHeader>
            <CardTitle>Assistant IA général</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 md:grid-cols-[260px_minmax(0,1fr)]">
              <Select
                value={action}
                onValueChange={(value) => {
                  const nextAction = value as RestaurantAgentAction;
                  setDraft((previous) => ({
                    ...previous,
                    action: nextAction,
                    prompt: ACTIONS.find((item) => item.value === nextAction)?.prompt || "",
                  }));
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea
                value={prompt}
                onChange={(event) => setDraft((previous) => ({ ...previous, prompt: event.target.value }))}
                className="min-h-28"
              />
            </div>
            <Button type="button" disabled={!selectedId || !prompt.trim() || agentMutation.isPending} onClick={() => agentMutation.mutate()}>
              Générer une recommandation IA
            </Button>
            {result ? (
              <Button type="button" variant="ghost" onClick={clearDraft}>
                Effacer la recommandation
              </Button>
            ) : null}
            {agentMutation.error ? <p className="text-sm text-destructive">{agentMutation.error.message}</p> : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Crown className="h-5 w-5 text-amber-600" />Plan IA</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="rounded-xl border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{planLabel}</span>
                <Badge variant={subscription.status === "active" ? "default" : "secondary"}>{subscription.status}</Badge>
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                {usageCalls} appels ce mois-ci sur {conversationLimit || "illimité"} conversations incluses.
              </p>
              <div className="mt-3 h-2 overflow-hidden rounded-full bg-background">
                <div className="h-full rounded-full bg-primary" style={{ width: `${usagePercent}%` }} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground">
              <div className="rounded-lg border p-2">Textes: {subscription.monthly_text_tool_limit}</div>
              <div className="rounded-lg border p-2">Images: {subscription.monthly_image_limit}</div>
              <div className="rounded-lg border p-2">Images premium: {subscription.monthly_premium_image_limit}</div>
              <div className="rounded-lg border p-2">Voix: {subscription.monthly_voice_minutes_limit} min</div>
            </div>
            <Button
              type="button"
              variant="outline"
              className="w-full gap-2"
              onClick={() => { window.location.href = buildAiUpgradeMailto(restaurantName, planLabel); }}
            >
              <Sparkles className="h-4 w-4" />
              Passer au plan IA supérieur
            </Button>
            <p className="text-xs text-muted-foreground">
              Upgrade compatible avec la facturation Stripe existante, après validation TOK.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{restaurantName}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {ACTIONS.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.value} className="flex items-center gap-3 rounded-xl border p-3 text-sm">
                  <Icon className="h-4 w-4 text-primary" />
                  <span className="font-medium">{item.label}</span>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {result ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{result.title}</CardTitle>
              <Badge variant="secondary">Historique des actions IA</Badge>
              <Badge variant="outline">{result.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            <div className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-6">{result.markdown}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Actions recommandées</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.recommended_actions.map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Garde-fous</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {result.warnings.map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
