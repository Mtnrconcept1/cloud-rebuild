import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import { parseSearchSnapshot, type SearchReport } from "@/marketing/growth/searchConsole";

export default function MarketingSearchConsole({ onBrief }: { onBrief?: (brief: string) => void }) {
  const [imported, setImported] = useState<SearchReport>();
  const [importError, setImportError] = useState("");
  const [open, setOpen] = useState(false);
  const live = useQuery({ queryKey: ["tok-search-console"], enabled: open && !imported,
    queryFn: ({signal}) => marketingBffRequest<SearchReport>(MARKETING_BFF_ENDPOINTS.rpc, {
      body: { operation: "admin_read_tok_search_console" }, signal, timeoutMs: 15000,
    }), staleTime: 300000, gcTime: 0, retry: false, refetchOnWindowFocus: false });
  const report = imported ?? live.data;
  async function importFile(file: File) {
    setImported(undefined); setImportError("");
    try {
      if (file.size > 3_000_000) throw new Error("Le fichier dépasse 3 Mo.");
      setImported(parseSearchSnapshot(JSON.parse(await file.text())));
    } catch (error) { setImportError(error instanceof SyntaxError ? "Fichier JSON illisible." : error instanceof Error ? error.message : "Import impossible."); }
  }
  return <section className="space-y-3 rounded-2xl border bg-card p-5">
    <Button variant="outline" aria-expanded={open} onClick={() => setOpen(!open)}>Recherche Google</Button>
    {open && <div className="space-y-3">
      <h3 className="font-semibold">Search Console · thetok.ch</h3>
      <label className="block text-sm">Importer un relevé JSON privé
        <input type="file" accept=".json,application/json" className="block" onChange={e => {
          const file = e.currentTarget.files?.[0]; e.currentTarget.value = ""; if (file) void importFile(file);
        }}/>
      </label>
      <Button variant="outline" disabled={live.isFetching} onClick={() => { setImported(undefined); setImportError(""); void live.refetch(); }}>Actualiser depuis Windsor</Button>
      {importError && <p role="alert">{importError}</p>}
      {!imported && live.isFetching && <p role="status">Lecture de Windsor…</p>}
      {!imported && live.isError && <p role="alert">{live.error.message}</p>}
      {report && <div className="space-y-2"><p>{imported ? "Relevé importé dans cet onglet" : report.source === "stored" ? "Dernier relevé privé enregistré" : "Lecture directe Windsor"} · {report.from} – {report.to} · {report.observedDays} jours observés</p>
      {report.totals ? <p><strong>{report.totals.impressions.toLocaleString("fr-CH")} impressions</strong> · {report.totals.clicks} clics · CTR {report.totals.impressions ? (report.totals.clicks * 100 / report.totals.impressions).toFixed(2) + " %" : "indisponible"}</p> : <p>Aucun total quotidien disponible.</p>}
      <h4 className="font-semibold">Requêtes à travailler</h4><p className="text-sm">Positions moyennes 4 à 30, triées par impressions parmi les lignes reçues.</p>
      {report.opportunities.length ? <ul className="space-y-2">{report.opportunities.map(row => <li className="rounded border p-2" key={row.query}><strong className="break-words">{row.query}</strong><p>{row.impressions} impressions · {row.clicks} clics · position {row.position.toFixed(1)}</p>
        {onBrief && <Button variant="outline" onClick={() => onBrief(`Étudier l’intention de la requête « ${row.query} ». Search Console, ${report.from} au ${report.to} : ${row.impressions} impressions, ${row.clicks} clics, position moyenne ${row.position.toFixed(1)}. Vérifier la page existante et les faits avant de proposer un article.`)}>Préparer un brief</Button>}
      </li>)}</ul> : <p>Aucune opportunité dans cette plage de positions.</p>}
      </div>}
    </div>}
  </section>;
}
