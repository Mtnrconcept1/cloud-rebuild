import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import { editorialPlan } from "@/marketing/growth/editorialPlan";
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
  const [start,setStart] = useState(() => new Intl.DateTimeFormat("sv-SE",{ timeZone:"Europe/Zurich" }).format(new Date()));
  const plan = report ? editorialPlan(report,start) : [];
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
      {report.comparison?.totals && <p>Du {report.comparison.from} au {report.comparison.to} · {report.comparison.observedDays} jours observés · {report.comparison.totals.impressions.toLocaleString("fr-CH")} impressions et {report.comparison.totals.clicks} clics.</p>}
      {!!report.pages?.length && <details><summary>Pages publiques à examiner</summary><ul className="space-y-1">{report.pages.map(page=><li key={page.page}><a href={page.page} target="_blank" rel="noopener noreferrer" className="break-all underline">{new URL(page.page).pathname}</a> · {page.impressions} impressions · {page.clicks} clics</li>)}</ul></details>}
      <details className="space-y-2"><summary>Proposition de calendrier sur 30 jours</summary>
        <label className="grid gap-1 text-sm">Premier jour<input type="date" value={start} onChange={e=>setStart(e.target.value)}/></label>
        <p className="text-sm">Les sujets observés sont répartis sur les jours ouvrés. Relisez l’intention et vérifiez les pages existantes avant de programmer une publication.</p>
        {plan.length ? <ol className="list-decimal pl-6">{plan.map(row=><li key={row.date}><time dateTime={row.date}>{row.date}</time> · {row.query}</li>)}</ol> : <p>Aucun sujet à planifier sur ce relevé.</p>}
      </details>
      <h4 className="font-semibold">Requêtes à travailler</h4><p className="text-sm">Positions moyennes 4 à 30, triées par impressions parmi les lignes reçues.</p>
      {report.opportunities.length ? <ul className="space-y-2">{report.opportunities.map(row => <li className="rounded border p-2" key={row.query}><strong className="break-words">{row.query}</strong><p>{row.impressions} impressions · {row.clicks} clics · position {row.position.toFixed(1)}</p>
        {onBrief && <Button variant="outline" onClick={() => onBrief(`Étudier l’intention de la requête « ${row.query} ». Search Console, ${report.from} au ${report.to} : ${row.impressions} impressions, ${row.clicks} clics, position moyenne ${row.position.toFixed(1)}. Vérifier la page existante et les faits avant de proposer un article.`)}>Préparer un brief</Button>}
      </li>)}</ul> : <p>Aucune opportunité dans cette plage de positions.</p>}
      </div>}
    </div>}
  </section>;
}
