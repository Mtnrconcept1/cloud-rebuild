import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createMarketingCampaignBundle, MAX_MAILING_IMAGE_BYTES, uploadMarketingSocialImage } from "@/marketing/marketingClient";
import type { MarketingCalendarItem, MarketingChannelId } from "@/marketing/types";
import { marketingZurichLocalDateTimeToIso } from "@/marketing/zurichTime";

type SeriesRow = { filename: string; title: string; caption: string; channel: "instagram" | "facebook"; scheduledAt: string };

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let cells: string[] = [], cell = "", quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') {
      if (cell) throw new Error("Guillemets CSV mal placés.");
      quoted = true;
    } else if (char === "," || char === ";") {
      cells.push(cell); cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      cells.push(cell); cell = "";
      if (cells.some((value) => value.trim())) rows.push(cells);
      cells = [];
    } else cell += char;
  }
  if (quoted) throw new Error("Guillemets CSV non fermés.");
  cells.push(cell);
  if (cells.some((value) => value.trim())) rows.push(cells);
  return rows;
}

export function parseMarketingSocialSeriesCsv(text: string): SeriesRow[] {
  if (text.length > 128_000) throw new Error("Le planning CSV est trop volumineux.");
  const [headers, ...rows] = parseCsv(text.replace(/^\uFEFF/, ""));
  if (!headers) throw new Error("Le planning CSV est vide.");
  const columns = headers.map((cell) => cell.trim().toLowerCase());
  const index = (name: string) => columns.indexOf(name);
  const required = ["date", "heure europe/zurich", "canal", "visuel", "titre", "légende"];
  if (required.some((name) => index(name) < 0)) {
    throw new Error("Colonnes attendues : date, heure Europe/Zurich, canal, visuel, titre et légende.");
  }
  if (rows.length < 1 || rows.length > 32) throw new Error("Importez entre 1 et 32 publications par série.");
  const filenames = new Set<string>();
  return rows.map((cells, position) => {
    if (cells.length !== headers.length) throw new Error(`Ligne ${position + 2} : nombre de colonnes invalide.`);
    const read = (name: string) => cells[index(name)].trim();
    const filename = read("visuel");
    const title = read("titre");
    const caption = read("légende");
    const channelName = read("canal").toLowerCase();
    const channel = channelName === "instagram" || channelName === "facebook" ? channelName : null;
    const date = read("date"), time = read("heure europe/zurich");
    const scheduledAt = marketingZurichLocalDateTimeToIso(`${date}T${time}`);
    if (!/^[-\w]+\.(png|jpe?g)$/i.test(filename) || filenames.has(filename.toLowerCase())
      || !title || title.length > 160 || !caption || caption.length > 2_000 || !channel || !scheduledAt) {
      throw new Error(`Ligne ${position + 2} : vérifiez le fichier, le canal, le texte et l’heure de Zurich.`);
    }
    filenames.add(filename.toLowerCase());
    return { filename, title, caption, channel, scheduledAt };
  });
}

export function MarketingSocialSeriesImport({ disabled, onImported, onPendingChange }: {
  disabled: boolean;
  onImported: () => Promise<unknown> | void;
  onPendingChange?: (pending: boolean) => void;
}) {
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [files, setFiles] = useState<Map<string, File>>(new Map());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [progress, setProgress] = useState("");
  const [items, setItems] = useState<MarketingCalendarItem[] | null>(null);
  const requestId = useRef(crypto.randomUUID());
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => { controller.current?.abort(); onPendingChange?.(false); }, []); // parent locks navigation during upload

  const selectPlanning = async (file?: File) => {
    if (!file || pending || items) return;
    try { setRows(parseMarketingSocialSeriesCsv(await file.text())); setError(""); }
    catch (caught) { setRows([]); setError(caught instanceof Error ? caught.message : "Planning invalide."); }
  };
  const selected = rows.length > 0 && rows.every((row) => files.has(row.filename.toLowerCase()));
  const run = async () => {
    if (!selected || disabled || pending) return;
    const abort = new AbortController();
    controller.current = abort;
    setPending(true); setError(""); onPendingChange?.(true);
    let complete = false;
    try {
      let batch = items;
      if (!batch) {
        setProgress("Création des brouillons…");
        const start = rows[0].scheduledAt;
        const end = rows[rows.length - 1].scheduledAt;
        const audienceFilter = { audience_kind: "mixed" };
        const result = await createMarketingCampaignBundle({
          name: `Série visuelle · ${rows[0].title.slice(0, 60)} · ${new Date(start).toLocaleDateString("fr-CH", { timeZone: "Europe/Zurich" })}`,
          objective: "Présenter les fonctionnalités TOK et l’offre aux restaurateurs.",
          message: "Série sociale importée, à relire avant publication.",
          audienceId: "", audienceName: "Restaurants et clients", audienceFilter,
          channels: Array.from(new Set(rows.map((row) => row.channel))) as MarketingChannelId[],
          startsAt: start, endsAt: end, status: "draft", requiresApproval: true,
        }, rows.map((row) => ({
          title: row.title, channel: row.channel, status: "draft", scheduled_at: row.scheduledAt,
          timezone: "Europe/Zurich", audience_name: "Restaurants et clients", targeting: audienceFilter,
          content: { message: row.caption, body: row.caption, image_mode: "manual",
            visual_required: true, visual_status: "pending_upload" },
        })), requestId.current);
        if (!result.complete || result.items.length !== rows.length) throw new Error("La série créée est incomplète. Actualisez avant de réessayer.");
        batch = result.items;
        setItems(batch);
      }
      for (let i = 0; i < rows.length; i += 1) {
        if (abort.signal.aborted) throw new DOMException("Import annulé.", "AbortError");
        if (batch[i].visualUrl) continue;
        setProgress(`Image ${i + 1}/${rows.length} : ${rows[i].filename}`);
        const updated = await uploadMarketingSocialImage(batch[i].id, batch[i].updatedAt,
          files.get(rows[i].filename.toLowerCase())!, abort.signal);
        batch = batch.map((item, index) => index === i ? updated : item);
        setItems(batch);
      }
      setProgress(`${rows.length} publications importées en brouillons. Relisez et approuvez la campagne, puis les publications.`);
      complete = true;
    } catch (caught) {
      if (!abort.signal.aborted) setError(caught instanceof Error ? caught.message : "Import interrompu. Réessayez.");
    } finally {
      if (controller.current === abort) controller.current = null;
      setPending(false); onPendingChange?.(false);
      if (complete) void Promise.resolve(onImported()).catch(() => undefined);
    }
  };

  return <section aria-label="Importer une série de publications" className="space-y-3 rounded-2xl border p-4" aria-busy={pending}>
    <div><h3 className="font-semibold">Importer une série de publications</h3>
      <p className="text-sm text-muted-foreground">Sélectionnez planning.csv et ses images JPG ou PNG extraites de l’archive. Les publications restent en brouillons jusqu’à leur approbation.</p></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <div><Label htmlFor="social-series-csv">Planning CSV</Label><Input id="social-series-csv" type="file" accept=".csv,text/csv" disabled={pending || Boolean(items) || disabled}
        onChange={(event) => { void selectPlanning(event.target.files?.[0]); }} /></div>
      <div><Label htmlFor="social-series-images">Images de la série</Label><Input id="social-series-images" type="file" multiple accept=".jpg,.jpeg,.png,image/jpeg,image/png" disabled={pending || disabled}
        onChange={(event) => {
          const selectedFiles = Array.from(event.target.files || []);
          const map = new Map<string, File>();
          for (const file of selectedFiles) map.set(file.name.toLowerCase(), file);
          setFiles(map); event.target.value = "";
        }} /></div>
    </div>
    {rows.length ? <p className="text-sm">{rows.length} publications · {rows.filter((row) => files.has(row.filename.toLowerCase())).length} images trouvées · JPG/PNG de 3 Mo maximum chacune.</p> : null}
    {selected && rows.some((row) => (files.get(row.filename.toLowerCase())?.size || 0) > MAX_MAILING_IMAGE_BYTES)
      ? <p role="alert" className="text-sm text-rose-700">Une image dépasse 3 Mo.</p> : null}
    {progress ? <p role="status" className="text-sm">{progress}</p> : null}
    {error ? <p role="alert" className="text-sm text-rose-700">{error} {items ? "Les brouillons déjà créés sont conservés ; relancez pour les images restantes." : ""}</p> : null}
    <Button type="button" disabled={!selected || disabled || pending || Boolean(items?.every((item) => item.visualUrl))
      || rows.some((row) => (files.get(row.filename.toLowerCase())?.size || 0) > MAX_MAILING_IMAGE_BYTES)} onClick={() => { void run(); }}>
      {pending ? "Import en cours…" : items ? "Reprendre les images manquantes" : `Importer ${rows.length || "la série"} brouillons`}
    </Button>
  </section>;
}
