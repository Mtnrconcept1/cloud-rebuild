import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { Activity, AlertOctagon, Bot, Gauge, ShieldAlert, Ticket, Timer, TrendingDown, UsersRound, Wrench } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { runAdminMonitor } from "@/lib/ai/tokAiClient";

const operationsBlocks = [
  { title: "Santé IA", icon: Activity, text: "Score global des fonctions IA, disponibilité et erreurs." },
  { title: "Coût OpenAI estimé", icon: Bot, text: "Consommation, coût moyen conversation et coût par restaurant." },
  { title: "Alertes sécurité", icon: ShieldAlert, text: "Signaux abusifs, comportements suspects et demandes sensibles." },
  { title: "Erreurs Supabase Functions", icon: AlertOctagon, text: "Détection des fonctions instables et erreurs récurrentes." },
  { title: "Tickets critiques", icon: Ticket, text: "Sinistres urgents, escalades humaines et litiges sensibles." },
  { title: "Utilisateurs abusifs", icon: UsersRound, text: "Répétition de remboursements, litiges et comportements à risque." },
  { title: "Restaurants avec incidents répétés", icon: TrendingDown, text: "Retards, annulations, erreurs de commande et mauvaise expérience." },
  { title: "Temps de réponse moyen", icon: Timer, text: "Latence IA, temps traitement support et performance backend." },
  { title: "Taux d'escalade humaine", icon: Gauge, text: "Mesure la charge support évitée ou transférée aux humains." },
  { title: "Actions recommandées", icon: Wrench, text: "Correctifs admin et priorités opérationnelles sans action destructive automatique." },
];

export default function AdminAiOperations() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Analyse la santé IA de TOK : sécurité, performance, coûts, tickets critiques, utilisateurs abusifs, restaurants avec incidents répétés et actions recommandées.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const runMonitor = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await runAdminMonitor({ scope: "platform", prompt, context: { source: "AdminAiOperations" } });
      setResult(response);
    } catch (error) {
      toast({ title: "Erreur monitoring IA", description: error instanceof Error ? error.message : "Monitoring impossible.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="rounded-[2rem] border bg-gradient-to-br from-blue-950 via-slate-950 to-orange-950 p-6 text-white shadow-sm">
        <Badge className="mb-3 bg-white/15 text-white hover:bg-white/20">Supervision TOK</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Centre de supervision IA</h1>
        <p className="mt-2 max-w-3xl text-white/70">Contrôle sécurité, performance, incidents, tickets critiques, coûts OpenAI et santé des Edge Functions. L'agent ne réalise aucune action destructive.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {operationsBlocks.map((block) => {
          const Icon = block.icon;
          return (
            <Card key={block.title} className="rounded-3xl">
              <CardContent className="p-4">
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <h2 className="font-semibold">{block.title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{block.text}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Card className="rounded-3xl">
        <CardContent className="space-y-4 p-5">
          <div>
            <h2 className="text-lg font-semibold">Demander un rapport opérationnel IA</h2>
            <p className="text-sm text-muted-foreground">Le rapport classe les alertes, propose des actions et trace l'usage IA. Aucune suspension, suppression ou remboursement n'est déclenché automatiquement.</p>
          </div>
          <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-28" />
          <Button onClick={runMonitor} disabled={loading || !prompt.trim()}>{loading ? "Analyse en cours..." : "Lancer le monitoring IA"}</Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="rounded-3xl">
          <CardContent className="space-y-4 p-5">
            <h2 className="text-xl font-semibold">{result.title || "Rapport supervision IA"}</h2>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{result.markdown || "Aucun rapport généré."}</ReactMarkdown></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
