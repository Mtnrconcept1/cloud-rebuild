import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import type { MarketingOutreachKind } from "@/marketing/types";

export type DiscoveredMarketingSource = {
  title: string; url: string; domain: string; rationale: string; kind: MarketingOutreachKind;
  submissionUrl?: string | null; evidenceUrl?: string | null; accountEvidence?: string;
  accountRequirement?: "none" | "required" | "unknown";
  publicationMode?: "editorial_review" | "directory_review" | "direct" | "unknown";
};
type DiscoveryResult = { sources: DiscoveredMarketingSource[]; searchedAt: string };

export default function MarketingSourceDiscovery({ enabled, onSelect }: {
  enabled: boolean;
  onSelect: (source: DiscoveredMarketingSource, searchedAt: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [withoutAccountOnly, setWithoutAccountOnly] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<DiscoveryResult | null>(null);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  const search = async () => {
    if (!enabled || controller.current || query.trim().length < 10) return;
    const request = new AbortController();
    controller.current = request;
    setPending(true);
    setResult(null);
    setError("");
    try {
      const data = await marketingBffRequest<DiscoveryResult>(MARKETING_BFF_ENDPOINTS.agent, {
        body: { action: "discover_sources", query: query.trim(), limit: 5, withoutAccountOnly },
        requireCsrf: true, timeoutMs: 70_000, signal: request.signal,
      });
      if (!request.signal.aborted) setResult(data);
    } catch (failure) {
      if (!request.signal.aborted) setError(failure instanceof Error ? failure.message : "La recherche est indisponible. Réessayez plus tard.");
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setPending(false);
    }
  };
  return <Card>
    <CardHeader><CardTitle>Rechercher des sources de backlinks</CardTitle></CardHeader>
    <CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Décrivez votre audience, votre région et le sujet. L’outil recherche des pages sur le web et propose des cibles à vérifier.</p>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void search(); }}>
        <Label htmlFor="backlink-discovery-query">Sources recherchées</Label>
        <Textarea id="backlink-discovery-query" value={query} onChange={(event) => setQuery(event.target.value)} maxLength={1000} minLength={10} required disabled={pending || !enabled} placeholder="Communautés et médias locaux sur la gastronomie à Genève, pertinents pour présenter TOK" />
        <label className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1" checked={withoutAccountOnly} disabled={pending || !enabled} onChange={(event) => setWithoutAccountOnly(event.target.checked)} />Uniquement les démarches déclarées sans création de compte</label>
        <Button type="submit" disabled={!enabled || pending || query.trim().length < 10}>{pending ? "Recherche en cours…" : "Chercher des sources"}</Button>
      </form>
      {pending ? <p role="status" className="text-sm">Recherche et vérification des sources…</p> : null}
      {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      {result ? <div className="space-y-3" aria-live="polite">
        <p className="text-sm">{result.sources.length ? `${result.sources.length} sources trouvées. Sélectionnez une cible pour vérifier puis enregistrer sa fiche.` : "Aucune source étayée trouvée. Précisez votre région ou votre sujet."}</p>
        {result.sources.map((source) => <article key={source.url} className="space-y-2 rounded-xl border p-4">
          <a href={source.url} target="_blank" rel="noopener noreferrer" className="break-words font-medium underline">{source.title}</a>
          <p className="break-all text-xs text-muted-foreground">{source.domain}</p>
          <p className="text-sm">{source.rationale}</p>
          <p className="text-xs text-muted-foreground">{source.accountRequirement === "none" ? "Sans compte selon les conditions citées — à contrôler" : source.accountRequirement === "required" ? "Compte requis" : "Besoin de compte non établi"} · {source.publicationMode === "editorial_review" ? "Décision éditoriale" : source.publicationMode === "directory_review" ? "Soumission à modération" : source.publicationMode === "direct" ? "Publication directe annoncée, à vérifier" : "Mode de publication à vérifier"}</p>
          {source.accountEvidence && source.evidenceUrl ? <p className="text-xs"><q>{source.accountEvidence}</q> — <a href={source.evidenceUrl} target="_blank" rel="noopener noreferrer" className="underline">Voir les conditions citées</a></p> : null}
          {source.submissionUrl ? <a href={source.submissionUrl} target="_blank" rel="noopener noreferrer" className="block text-sm underline">Voir la démarche de soumission</a> : null}
          <Button type="button" variant="outline" disabled={!enabled} onClick={() => onSelect(source, result.searchedAt)}>Préparer cette cible</Button>
        </article>)}
      </div> : null}
      <p className="text-xs text-muted-foreground">Les suggestions ne constituent pas une autorisation de publier. Vérifiez les conditions et les règles de contribution avant toute prise de contact.</p>
    </CardContent>
  </Card>;
}
