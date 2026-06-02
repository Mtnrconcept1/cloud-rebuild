import { useState } from "react";
import ReactMarkdown from "react-markdown";
import { AlertTriangle, BrainCircuit, Download, FileWarning, ReceiptText, TrendingUp, WalletCards } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { runAccountingAgent } from "@/lib/ai/tokAiClient";

const accountingBlocks = [
  { title: "Résumé mensuel", icon: ReceiptText, text: "Synthèse du chiffre d'affaires, commissions, reversements et frais." },
  { title: "Anomalies factures", icon: FileWarning, text: "Détection des incohérences, montants suspects ou lignes manquantes." },
  { title: "Factures impayées", icon: AlertTriangle, text: "Priorisation des créances, restaurants à relancer et risques de retard." },
  { title: "Restaurants à risque", icon: BrainCircuit, text: "Repère les comptes à surveiller selon incidents, paiements et performance." },
  { title: "Prévision CA", icon: TrendingUp, text: "Projection du revenu TOK et du volume à venir." },
  { title: "Marge par restaurant", icon: WalletCards, text: "Lecture de la contribution, de la marge et des commissions estimées." },
  { title: "Coût IA par restaurant", icon: BrainCircuit, text: "Suivi de la consommation OpenAI et marge IA." },
  { title: "Commission TOK estimée", icon: ReceiptText, text: "Analyse des commissions générées par commandes, réservations et services." },
  { title: "Export synthèse", icon: Download, text: "Préparation d'une synthèse exploitable par l'administration." },
];

export default function AdminComptaAi() {
  const { toast } = useToast();
  const [prompt, setPrompt] = useState("Analyse la comptabilité TOK du mois en cours : revenus, commissions, reversements, impayés, anomalies, coût IA par restaurant et actions prioritaires.");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any | null>(null);

  const runAnalysis = async () => {
    setLoading(true);
    setResult(null);
    try {
      const response = await runAccountingAgent({ prompt, context: { source: "AdminComptaAi" } });
      setResult(response);
    } catch (error) {
      toast({ title: "Erreur comptabilité IA", description: error instanceof Error ? error.message : "Analyse impossible.", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="container space-y-6 py-8">
      <div className="rounded-[2rem] border bg-gradient-to-br from-slate-950 via-slate-900 to-orange-950 p-6 text-white shadow-sm">
        <Badge className="mb-3 bg-white/15 text-white hover:bg-white/20">Admin IA</Badge>
        <h1 className="text-3xl font-bold tracking-tight">Comptabilité intelligente TOK</h1>
        <p className="mt-2 max-w-3xl text-white/70">Analyse financière, détection d'anomalies, prévisions, impayés, commissions et coût IA par restaurant. Aucune écriture comptable n'est créée automatiquement.</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {accountingBlocks.map((block) => {
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
            <h2 className="text-lg font-semibold">Demander une analyse comptable IA</h2>
            <p className="text-sm text-muted-foreground">L'agent produit une synthèse, des anomalies, une prévision et des recommandations. Il ne modifie jamais les factures.</p>
          </div>
          <Textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} className="min-h-28" />
          <Button onClick={runAnalysis} disabled={loading || !prompt.trim()}>{loading ? "Analyse en cours..." : "Lancer l'analyse comptable"}</Button>
        </CardContent>
      </Card>

      {result && (
        <Card className="rounded-3xl">
          <CardContent className="space-y-4 p-5">
            <h2 className="text-xl font-semibold">{result.title || "Synthèse comptable IA"}</h2>
            <p className="text-sm text-muted-foreground">{result.summary}</p>
            <div className="prose prose-sm max-w-none dark:prose-invert"><ReactMarkdown>{result.markdown || "Aucun rapport généré."}</ReactMarkdown></div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
