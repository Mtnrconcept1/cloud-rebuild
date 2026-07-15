import { useMemo, useState, type ReactNode } from "react";
import {
  Bot,
  Camera,
  CheckCircle2,
  CircleDollarSign,
  CreditCard,
  LifeBuoy,
  Megaphone,
  Newspaper,
  Package,
  Plug,
  RefreshCw,
  Share2,
  Sparkles,
  TestTube2,
} from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export type CommercialDemoSafeTool =
  | "advisor"
  | "actualites"
  | "billing"
  | "pack"
  | "campaigns"
  | "social"
  | "photos"
  | "support"
  | "tok-connect"
  | "accounting-inflow"
  | "accounting-outflow";

const TOOL_CONFIG: Record<CommercialDemoSafeTool, {
  title: string;
  description: string;
  badge: string;
  icon: typeof Bot;
  metrics: Array<{ label: string; value: string }>;
  steps: string[];
  action: string;
  completed: string;
}> = {
  actualites: {
    title: "Actualités du restaurant",
    description: "Montrez la création, la programmation et la mise en avant d’une actualité sans publier, notifier ni réserver de budget réel.",
    badge: "Actualités · sandbox",
    icon: Newspaper,
    metrics: [{ label: "Brouillons", value: "3" }, { label: "Audience démo", value: "2 400" }, { label: "Budget réel", value: "0 CHF" }],
    steps: ["Composer l’actualité", "Prévisualiser les formats", "Simuler la publication"],
    action: "Publier l’actualité simulée",
    completed: "Actualité publiée dans la sandbox — aucun post, boost ou message réel créé.",
  },
  advisor: {
    title: "Assistant de pilotage",
    description: "Montrez les recommandations, priorités et plans d’action sans consommer de crédit IA ni appeler un fournisseur externe.",
    badge: "Assistant IA · sandbox",
    icon: Bot,
    metrics: [{ label: "Priorités", value: "3" }, { label: "Gain estimé", value: "+12 %" }, { label: "Actions prêtes", value: "5" }],
    steps: ["Analyser le service simulé", "Prioriser les opportunités", "Valider le plan d’action"],
    action: "Générer le conseil simulé",
    completed: "Conseil généré dans la sandbox — aucun appel IA facturable.",
  },
  billing: {
    title: "Compte et facturation",
    description: "Présentez le plan, le moyen de paiement et les prochaines échéances sans créer d’abonnement ni de débit réel.",
    badge: "Facturation · sandbox",
    icon: CreditCard,
    metrics: [{ label: "Pack", value: "Elite démo" }, { label: "Prochaine facture", value: "149 CHF" }, { label: "Paiement", value: "Test" }],
    steps: ["Comparer les offres", "Vérifier les coordonnées", "Simuler une mise à niveau"],
    action: "Simuler la mise à niveau",
    completed: "Mise à niveau simulée — aucun abonnement Stripe live créé.",
  },
  pack: {
    title: "Pack restaurateur",
    description: "Tous les modules activés par l’administrateur sont présentés dans le pack commercial, sans modifier le contrat réel.",
    badge: "Pack · sandbox",
    icon: Package,
    metrics: [{ label: "Outils actifs", value: "Tous les flags ON" }, { label: "Utilisateurs", value: "Illimités" }, { label: "Environnement", value: "Démo" }],
    steps: ["Explorer les modules inclus", "Comparer les capacités", "Simuler la sélection du pack"],
    action: "Sélectionner ce pack en démo",
    completed: "Pack sélectionné pour la présentation uniquement.",
  },
  photos: {
    title: "Studio photo et marketing",
    description: "Présentez l’import, la retouche et la génération de visuels sans appeler de fournisseur IA ni consommer de crédit photo.",
    badge: "Studio photo · sandbox",
    icon: Camera,
    metrics: [{ label: "Créations", value: "4" }, { label: "Qualité", value: "Studio" }, { label: "Crédits consommés", value: "0" }],
    steps: ["Choisir une photo", "Configurer le rendu", "Prévisualiser la galerie"],
    action: "Générer le visuel simulé",
    completed: "Visuel généré dans la sandbox — aucun appel OpenAI ni débit de crédit.",
  },
  campaigns: {
    title: "Campagnes marketing",
    description: "Construisez une campagne, son audience et son aperçu sans acheter de crédit ni diffuser une publicité réelle.",
    badge: "Campagnes · sandbox",
    icon: Megaphone,
    metrics: [{ label: "Audience estimée", value: "4 800" }, { label: "Budget démo", value: "120 CHF" }, { label: "Canaux", value: "3" }],
    steps: ["Choisir l’objectif", "Définir l’audience", "Prévisualiser la diffusion"],
    action: "Lancer la campagne simulée",
    completed: "Campagne simulée — aucune diffusion, dépense ou notification réelle.",
  },
  social: {
    title: "Réseaux sociaux",
    description: "Préparez, prévisualisez et planifiez une publication sans envoyer de contenu vers un réseau externe.",
    badge: "Social · sandbox",
    icon: Share2,
    metrics: [{ label: "Réseaux", value: "3" }, { label: "Portée estimée", value: "2 400" }, { label: "Brouillons", value: "1" }],
    steps: ["Composer la publication", "Adapter les formats", "Simuler la planification"],
    action: "Planifier la publication démo",
    completed: "Publication planifiée dans la sandbox uniquement.",
  },
  support: {
    title: "Aide et support",
    description: "Montrez la création et le suivi d’une demande sans ouvrir d’incident auprès de l’équipe de production.",
    badge: "Support · sandbox",
    icon: LifeBuoy,
    metrics: [{ label: "Délai cible", value: "< 2 h" }, { label: "Dossier démo", value: "TOK-DEMO-01" }, { label: "Statut", value: "Prêt" }],
    steps: ["Choisir la catégorie", "Décrire la demande", "Suivre sa résolution"],
    action: "Créer le ticket simulé",
    completed: "Ticket créé dans la présentation — aucun incident réel ouvert.",
  },
  "tok-connect": {
    title: "TOK Connect",
    description: "Présentez les intégrations, webhooks et clés de test sans émettre de jeton de production ni contacter un partenaire.",
    badge: "TOK Connect · sandbox",
    icon: Plug,
    metrics: [{ label: "API", value: "Test" }, { label: "Webhooks", value: "3 simulés" }, { label: "Disponibilité", value: "99,9 %" }],
    steps: ["Choisir une intégration", "Tester un événement", "Vérifier le journal"],
    action: "Envoyer l’événement test",
    completed: "Événement traité dans la sandbox — aucun webhook externe envoyé.",
  },
  "accounting-inflow": {
    title: "Recettes et encaissements",
    description: "Parcourez les ventes, règlements et répartitions à partir d’un jeu comptable isolé.",
    badge: "Comptabilité · recettes démo",
    icon: CircleDollarSign,
    metrics: [{ label: "Ventes", value: "12 480 CHF" }, { label: "Part restaurant", value: "11 232 CHF" }, { label: "Part TOK", value: "1 248 CHF" }],
    steps: ["Filtrer les encaissements", "Lire la répartition", "Prévisualiser l’export"],
    action: "Simuler l’export des recettes",
    completed: "Export prévisualisé — aucun document comptable réel généré.",
  },
  "accounting-outflow": {
    title: "Dépenses et décaissements",
    description: "Expliquez chaque poste de dépense avec des factures fictives et sans action financière réelle.",
    badge: "Comptabilité · dépenses démo",
    icon: CircleDollarSign,
    metrics: [{ label: "Dépenses", value: "472,50 CHF" }, { label: "À contrôler", value: "2" }, { label: "Écart", value: "0 CHF" }],
    steps: ["Classer les dépenses", "Contrôler les justificatifs", "Simuler la clôture"],
    action: "Clôturer la période en démo",
    completed: "Période clôturée dans la sandbox uniquement.",
  },
};

function CommercialDemoToolSandbox({ tool }: { tool: CommercialDemoSafeTool }) {
  const frame = useCommercialDemoFrame()!;
  const config = TOOL_CONFIG[tool];
  const Icon = config.icon;
  const [completed, setCompleted] = useState(false);
  const enabledFeatureCount = useMemo(
    () => frame.snapshot.active_features.filter((feature) => feature.startsWith("dashboard-")).length,
    [frame.snapshot.active_features],
  );

  return (
    <DashboardLayout>
      <div className="space-y-6" data-testid={`commercial-demo-tool-${tool}`}>
        <DashboardPageHero
          badge={config.badge}
          title={config.title}
          description={config.description}
          icon={Icon}
          tone="orange"
          visualLabel="Sandbox isolée"
          stats={config.metrics.map((metric) => ({ ...metric, icon: Sparkles }))}
        />

        <div className="flex flex-col gap-3 rounded-2xl border border-violet-200 bg-violet-50/80 p-4 text-violet-950 sm:flex-row sm:items-center dark:border-violet-400/20 dark:bg-violet-400/10 dark:text-violet-100">
          <TestTube2 className="h-5 w-5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Vrai module · effets externes remplacés par une sandbox</p>
            <p className="mt-1 text-sm opacity-80">{enabledFeatureCount} outils restaurateur sont actuellement autorisés par les flags admin. Ce scénario ne touche ni Stripe live, ni crédits, ni partenaires, ni comptabilité de production.</p>
          </div>
          <Badge variant="outline" className="w-fit bg-background/60">Temps réel isolé</Badge>
        </div>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(17rem,0.42fr)]">
          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>Parcours de démonstration</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {config.steps.map((step, index) => (
                <div key={step} className="flex items-center gap-3 rounded-2xl border bg-muted/20 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary font-bold text-primary-foreground">{index + 1}</span>
                  <p className="font-semibold">{step}</p>
                  {completed ? <CheckCircle2 className="ml-auto h-5 w-5 text-emerald-600" /> : null}
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="rounded-3xl">
            <CardHeader>
              <CardTitle>Action sûre</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-muted-foreground">L’action reproduit le retour utilisateur du module sans créer d’effet externe.</p>
              <Button type="button" className="min-h-11 w-full whitespace-normal" onClick={() => setCompleted(true)} disabled={completed}>
                {completed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Icon className="mr-2 h-4 w-4" />}
                {completed ? "Scénario terminé" : config.action}
              </Button>
              {completed ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950 dark:border-emerald-400/20 dark:bg-emerald-400/10 dark:text-emerald-100" role="status">
                  {config.completed}
                </div>
              ) : null}
              <Button type="button" variant="outline" className="w-full" onClick={() => setCompleted(false)} disabled={!completed}>
                <RefreshCw className="mr-2 h-4 w-4" />Réinitialiser
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

export default function CommercialDemoToolBoundary({
  tool,
  children,
}: {
  tool: CommercialDemoSafeTool;
  children: ReactNode;
}) {
  const frame = useCommercialDemoFrame();
  if (frame?.surface === "restaurant") return <CommercialDemoToolSandbox tool={tool} />;
  return <>{children}</>;
}
