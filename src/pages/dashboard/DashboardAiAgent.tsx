import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Bot, Camera, FileText, LineChart, Megaphone, MessageSquareText, Sparkles } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useDashboardRestaurant } from "@/pages/dashboard/useDashboardRestaurant";
import { getAiUsageForRestaurant, runRestaurantAgent, type RestaurantAgentAction } from "@/lib/ai/tokAiClient";

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

export default function DashboardAiAgent() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const [action, setAction] = useState<RestaurantAgentAction>("general");
  const selectedAction = useMemo(() => ACTIONS.find((item) => item.value === action) || ACTIONS[0], [action]);
  const [prompt, setPrompt] = useState(selectedAction.prompt);

  const restaurantName = restaurants.find((restaurant) => restaurant.id === selectedId)?.name || "Restaurant";

  const { data: usage = [] } = useQuery({
    queryKey: ["restaurant-ai-usage", selectedId],
    queryFn: () => getAiUsageForRestaurant(selectedId!),
    enabled: !!selectedId,
  });

  const agentMutation = useMutation({
    mutationFn: () => runRestaurantAgent({
      restaurantId: selectedId!,
      action,
      prompt,
      context: { surface: "dashboard-ai-agent" },
    }),
  });

  const totalCost = usage.reduce((sum, row) => sum + Number(row.estimated_cost_chf || 0), 0);

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
                  setAction(nextAction);
                  setPrompt(ACTIONS.find((item) => item.value === nextAction)?.prompt || "");
                }}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ACTIONS.map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-28" />
            </div>
            <Button type="button" disabled={!selectedId || !prompt.trim() || agentMutation.isPending} onClick={() => agentMutation.mutate()}>
              Générer une recommandation IA
            </Button>
            {agentMutation.error ? <p className="text-sm text-destructive">{agentMutation.error.message}</p> : null}
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

      {agentMutation.data ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>{agentMutation.data.title}</CardTitle>
              <Badge variant="secondary">Historique des actions IA</Badge>
              <Badge variant="outline">{agentMutation.data.status}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground">{agentMutation.data.summary}</p>
            <div className="whitespace-pre-wrap rounded-xl border bg-muted/30 p-4 text-sm leading-6">{agentMutation.data.markdown}</div>
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <p className="mb-2 text-sm font-semibold">Actions recommandées</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {agentMutation.data.recommended_actions.map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Garde-fous</p>
                <ul className="space-y-1 text-sm text-muted-foreground">
                  {agentMutation.data.warnings.map((item) => <li key={item}>- {item}</li>)}
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
