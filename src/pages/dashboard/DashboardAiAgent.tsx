import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Bot, Camera, LineChart, Megaphone, MessageSquareReply, Sparkles, Tags, Wand2 } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { runRestaurantAgent, type TokAiRestaurantAction } from "@/lib/ai/tokAiClient";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const TOOLS: Array<{
  action: TokAiRestaurantAction;
  title: string;
  description: string;
  icon: typeof Bot;
  prompt: string;
}> = [
  {
    action: "general",
    title: "Assistant IA général",
    description: "Pose une question libre sur ton restaurant, ton offre ou ta stratégie.",
    icon: Bot,
    prompt: "Analyse mon restaurant et donne-moi trois actions prioritaires pour vendre plus cette semaine.",
  },
  {
    action: "menu_optimizer",
    title: "Optimisation du menu",
    description: "Améliore les titres, descriptions, catégories, prix et upsells.",
    icon: Tags,
    prompt: "Optimise mon menu pour augmenter le panier moyen, sans dénaturer les plats ni inventer d'allergènes.",
  },
  {
    action: "photo_enhancer",
    title: "Photos & visuels",
    description: "Brief photo, cadrage, lumière, visuels marketing et assets premium.",
    icon: Camera,
    prompt: "Fais un audit de mes photos et propose un brief visuel TOK premium pour rendre les plats plus irrésistibles.",
  },
  {
    action: "marketing_campaign",
    title: "Campagnes marketing",
    description: "Crée des campagnes push, email, actualités, réseaux sociaux et offres.",
    icon: Megaphone,
    prompt: "Crée une campagne marketing personnalisée pour augmenter mes commandes cette semaine. Ne publie rien, reste en mode brouillon.",
  },
  {
    action: "sales_insights",
    title: "Analyse des ventes",
    description: "Analyse ventes, panier moyen, plats faibles et opportunités.",
    icon: LineChart,
    prompt: "Analyse mes ventes récentes et propose des actions concrètes pour améliorer le chiffre d'affaires et la marge.",
  },
  {
    action: "promotions",
    title: "Promotions recommandées",
    description: "Propose des offres intelligentes sans détruire la marge.",
    icon: Sparkles,
    prompt: "Propose trois promotions rentables adaptées à mon restaurant et explique le risque marge de chacune.",
  },
  {
    action: "review_reply",
    title: "Réponses aux avis",
    description: "Prépare des réponses professionnelles aux avis clients.",
    icon: MessageSquareReply,
    prompt: "Prépare des réponses aux avis clients récents avec un ton professionnel, chaleureux et orienté amélioration.",
  },
];

export default function DashboardAiAgent() {
  const { selectedId, restaurants } = useDashboardRestaurant();
  const { toast } = useToast();
  const [selectedAction, setSelectedAction] = useState<TokAiRestaurantAction>("general");
  const [prompt, setPrompt] = useState(TOOLS[0].prompt);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const restaurantName = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === selectedId)?.name || "Mon restaurant",
    [restaurants, selectedId],
  );

  const runTool = async () => {
    if (!selectedId) {
      toast({ title: "Restaurant requis", description: "Sélectionne un restaurant avant d'utiliser l'agent IA.", variant: "destructive" });
      return;
    }

    setLoading(true);
    setResult(null);
    try {
      const response = await runRestaurantAgent({
        restaurantId: selectedId,
        action: selectedAction,
        prompt,
        context: { source: "DashboardAiAgent", restaurantName },
      });
      setResult(response);
    } catch (error) {
      toast({ title: "Erreur IA", description: error instanceof Error ? error.message : "Impossible d'exécuter l'agent IA.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div className="rounded-[2rem] border bg-gradient-to-br from-orange-500/12 via-background to-blue-500/10 p-6 shadow-sm">
          <Badge className="mb-3 gap-1"><Wand2 className="h-3 w-3" /> TOK IA Pro</Badge>
          <h1 className="text-3xl font-bold tracking-tight">Agent IA restaurateur</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Optimise les ventes, les photos, les menus, les campagnes marketing, les promotions et les réponses aux avis. Toutes les actions restent en mode brouillon jusqu'à validation humaine.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {TOOLS.map((tool) => {
            const Icon = tool.icon;
            const active = selectedAction === tool.action;
            return (
              <button
                key={tool.action}
                type="button"
                onClick={() => {
                  setSelectedAction(tool.action);
                  setPrompt(tool.prompt);
                }}
                className={`rounded-3xl border p-4 text-left transition hover:border-primary/60 hover:bg-primary/5 ${active ? "border-primary bg-primary/10" : "bg-card"}`}
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <div className="font-semibold">{tool.title}</div>
                <p className="mt-1 text-sm text-muted-foreground">{tool.description}</p>
              </button>
            );
          })}
        </div>

        <Card className="rounded-3xl">
          <CardContent className="space-y-4 p-5">
            <div>
              <h2 className="text-lg font-semibold">Demande personnalisée</h2>
              <p className="text-sm text-muted-foreground">Restaurant sélectionné : {restaurantName}. L'agent utilise les données disponibles du restaurant et respecte les limites de l'abonnement IA.</p>
            </div>
            <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-32" />
            <div className="flex flex-wrap items-center gap-3">
              <Button onClick={runTool} disabled={loading || !prompt.trim()}>
                {loading ? "Analyse en cours..." : "Lancer l'agent IA"}
              </Button>
              <span className="text-xs text-muted-foreground">Limites de l'abonnement IA, historique des actions IA et coûts sont suivis automatiquement.</span>
            </div>
          </CardContent>
        </Card>

        {result && (
          <Card className="rounded-3xl">
            <CardContent className="space-y-4 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">{result.title || "Résultat IA"}</h2>
                  <p className="text-sm text-muted-foreground">{result.summary}</p>
                </div>
                <Badge variant="secondary">{result.status || "draft"}</Badge>
              </div>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <ReactMarkdown>{result.markdown || result.reply || "Aucun contenu généré."}</ReactMarkdown>
              </div>
              {!!result.recommended_actions?.length && (
                <div>
                  <h3 className="mb-2 font-semibold">Actions recommandées</h3>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-muted-foreground">
                    {result.recommended_actions.map((action: string) => <li key={action}>{action}</li>)}
                  </ul>
                </div>
              )}
              {!!result.warnings?.length && (
                <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
                  <strong>Points de vigilance :</strong> {result.warnings.join(" · ")}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
