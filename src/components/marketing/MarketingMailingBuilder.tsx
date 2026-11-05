import { useEffect, useMemo, useRef, useState } from "react";
import { Mail, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import { estimateMarketingAudience, prepareMarketingMailingRecipients } from "@/marketing/marketingClient";
import { MAILING_RECIPIENT_FILE_ACCEPT, MAILING_RECIPIENT_LIMITS, parseMailingRecipientsFile, parseMailingRecipientsText, type MailingRecipientsReport } from "@/marketing/mailingRecipients";
import type { MarketingAudienceEstimate } from "@/marketing/types";
import { marketingZurichDateKey, marketingZurichLocalDateTimeToIso } from "@/marketing/zurichTime";
import { buildCampaignSlots } from "../../../supabase/functions/_shared/marketing-campaign-request";
import { MAILING_FIELDS, mailingAudience, mailingAudienceLabel, mailingScheduleOptions, parseMailingOptions, type MailingFacetPage, type MailingField, type MailingImageMode, type MailingOptions, type MailingSelections } from "../../../supabase/functions/_shared/marketing-mailing";
import type { CampaignGenerationRequest } from "./MarketingCampaignBuilder";

const fields = Object.keys(MAILING_FIELDS) as MailingField[];
const briefExample = "Campagne mailing de 4 mails sur un mois, un par semaine, visant les pizzerias de Genève. Promouvoir le zéro attente, les ventes flash, le marketing studio et le plan de table automatisé.";
const errorText = (error: unknown) => error instanceof Error ? error.message : "Impossible de charger les données. Réessayez.";

function Facet({ field, selected, disabled, onChange }: {
  field: MailingField; selected: string[] | undefined; disabled: boolean; onChange: (values: string[] | undefined) => void;
}) {
  const [open, setOpen] = useState(field === "city" || field === "category");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState<MailingFacetPage>({ items: [], next: null });
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const requestState = useRef({ sequence: 0 }).current;
  const load = async (after: string | null, current: number, signal?: AbortSignal) => {
    setPending(true); setError("");
    try {
      const result = await marketingBffRequest<MailingFacetPage>(MARKETING_BFF_ENDPOINTS.agent, { method: "POST", signal,
        body: { action: "mailing_facets", field, query, after } });
      if (!Array.isArray(result.items)) throw new Error("Rubrique indisponible.");
      if (requestState.sequence !== current) return;
      setPage((previous) => ({ items: after ? [...previous.items, ...result.items.filter((item) => !previous.items.some((old) => old.value === item.value))] : result.items, next: result.next }));
    } catch (caught) { if (requestState.sequence === current && !signal?.aborted) setError(errorText(caught)); }
    finally { if (requestState.sequence === current) setPending(false); }
  };
  useEffect(() => {
    if (!open || disabled) return;
    const controller = new AbortController();
    const current = ++requestState.sequence;
    setPage({ items: [], next: null });
    const timer = setTimeout(() => void load(null, current, controller.signal), 200);
    return () => { clearTimeout(timer); controller.abort(); requestState.sequence += 1; };
    // `load` reads exactly these inputs; pagination is intentionally imperative.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, field, revision, disabled]);
  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-xl border p-3">
    <summary className="cursor-pointer text-sm font-semibold">{MAILING_FIELDS[field]} <span className="font-normal text-muted-foreground">· {selected === undefined ? "Tous" : `${selected.length} sélectionné(s)`}</span></summary>
    <fieldset disabled={disabled} className="mt-3 space-y-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" className="h-4 w-4 accent-orange-600" checked={selected === undefined} onChange={(event) => onChange(event.target.checked ? undefined : [])} />Tous — {MAILING_FIELDS[field].toLowerCase()}</label>
      <Input aria-label={`Rechercher — ${MAILING_FIELDS[field]}`} value={query} maxLength={100} onChange={(event) => setQuery(event.target.value)} placeholder="Rechercher dans cette rubrique…" />
      {selected?.length ? <div className="flex flex-wrap gap-1">{selected.map((value) => <button key={value} type="button" className="rounded bg-orange-50 px-2 py-1 text-xs text-orange-900" aria-label={`Retirer ${value}`} onClick={() => onChange(selected.filter((entry) => entry !== value))}>{value} ×</button>)}</div> : null}
      <div className="max-h-48 space-y-2 overflow-y-auto">
        {page.items.map(({ value, count }) => <label key={value} className="flex items-start gap-2 text-sm"><input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-orange-600" checked={selected?.includes(value) || false} onChange={(event) => onChange(event.target.checked ? [...(selected || []), value] : (selected || []).filter((entry) => entry !== value))} /><span className="break-words">{value} <span className="text-xs text-muted-foreground">({count})</span></span></label>)}
      </div>
      {pending ? <p role="status" className="text-xs">Chargement…</p> : !page.items.length && !error ? <p className="text-xs text-muted-foreground">Aucune valeur renseignée pour cette recherche.</p> : null}
      {error ? <div role="alert" className="text-xs text-rose-700">{error} <button type="button" className="underline" onClick={() => setRevision((value) => value + 1)}>Réessayer</button></div> : null}
      {page.next ? <Button type="button" variant="ghost" size="sm" disabled={pending} onClick={() => void load(page.next, ++requestState.sequence)}>Charger la suite</Button> : null}
    </fieldset>
  </details>;
}

export function MarketingMailingBuilder({ pending, disabled, onGenerate }: {
  pending: boolean; disabled: boolean; onGenerate: (request: CampaignGenerationRequest) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [selections, setSelections] = useState<MailingSelections>({});
  const [imageMode, setImageMode] = useState<MailingImageMode | null>(null);
  const [recipientMode, setRecipientMode] = useState<"filters" | "manual">("filters");
  const [recipientText, setRecipientText] = useState("");
  const [filePreview, setFilePreview] = useState<{ name: string; report: MailingRecipientsReport } | null>(null);
  const [count, setCount] = useState(4);
  const [cadence, setCadence] = useState<MailingOptions["cadence"]>("weekly");
  const [start, setStart] = useState(() => `${marketingZurichDateKey(new Date(Date.now() + 86400000))}T09:00`);
  const [busy, setBusy] = useState<"interpret" | "estimate" | "file" | null>(null);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState("");
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [reviewed, setReviewed] = useState(false);
  const [estimate, setEstimate] = useState<{ key: string; result: MarketingAudienceEstimate; createdCount?: number } | null>(null);
  const locked = pending || disabled || busy !== null;
  const recipientInput = useMemo(() => {
    try { return { report: parseMailingRecipientsText(recipientText), error: "" }; }
    catch (caught) { return { report: null, error: errorText(caught) }; }
  }, [recipientText]);
  const explicitRecipients = recipientMode === "manual" ? recipientInput.report?.emails : undefined;
  const activeSelections = recipientMode === "manual" ? {} : selections;
  const recipientInputValid = recipientMode === "filters" || Boolean(explicitRecipients?.length
    && !recipientInput.report?.invalidCount && !recipientInput.error && !filePreview);
  const key = JSON.stringify({ mode: recipientMode, selections: activeSelections, recipientEmails: explicitRecipients });
  const currentEstimate = estimate?.key === key && recipientInputValid ? estimate.result : null;
  const startsAt = marketingZurichLocalDateTimeToIso(start);
  let options: MailingOptions | undefined;
  let slots: ReturnType<typeof buildCampaignSlots> = [];
  try {
    options = parseMailingOptions({ selections: activeSelections, emailCount: count, cadence,
      ...(recipientMode === "manual" ? { recipientEmails: explicitRecipients || [] } : {}),
      ...(imageMode ? { imageMode } : {}) });
    if (startsAt && options) slots = buildCampaignSlots(mailingScheduleOptions(options), ["email"], startsAt);
  } catch { /* The form explains invalid/empty selections; generation stays disabled. */ }
  const valid = !!options && recipientInputValid && !!imageMode && !!startsAt && Date.parse(startsAt) > Date.now();
  const needsCriterionReview = recipientMode === "filters" && unresolved.length > 0 && !reviewed;
  const updatePrompt = (value: string) => { setPrompt(value); setSummary(""); setReviewed(false); };

  const interpret = async () => {
    if (locked || prompt.trim().length < 10) return;
    setBusy("interpret"); setError(""); setReviewed(false); setEstimate(null);
    try {
      const result = await marketingBffRequest<{ mailingOptions: MailingOptions; unresolved: string[]; summary: string }>(MARKETING_BFF_ENDPOINTS.agent,
        { method: "POST", timeoutMs: 125000, body: { action: "interpret_mailing", prompt: prompt.trim() } });
      const parsed = parseMailingOptions(result.mailingOptions);
      if (!parsed || !Array.isArray(result.unresolved)) throw new Error("Le brief n’a pas pu être interprété. Ajustez les critères manuellement.");
      if (recipientMode === "filters") setSelections(parsed.selections);
      setCount(parsed.emailCount); setCadence(parsed.cadence);
      setSummary(result.summary); setUnresolved(result.unresolved);
    } catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  };
  const previewAudience = async () => {
    if (locked || !options || !recipientInputValid) return;
    setBusy("estimate"); setError(""); setEstimate(null);
    try {
      if (recipientMode === "manual" && explicitRecipients) {
        const prepared = await prepareMarketingMailingRecipients(explicitRecipients);
        setEstimate({ key, result: prepared.estimate, createdCount: prepared.createdCount });
      } else {
        setEstimate({ key, result: await estimateMarketingAudience(mailingAudience(selections), ["email"]) });
      }
    }
    catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  };
  const updateRecipients = (text: string) => { setRecipientText(text); setEstimate(null); };
  const importRecipients = async (file?: File) => {
    if (locked || !file) return;
    setBusy("file"); setError(""); setFilePreview(null); setEstimate(null);
    try { setFilePreview({ name: file.name, report: await parseMailingRecipientsFile(file) }); }
    catch (caught) { setError(errorText(caught)); }
    finally { setBusy(null); }
  };
  const confirmFile = () => {
    if (locked || !filePreview) return;
    const next = [recipientText.trim(), ...filePreview.report.emails].filter(Boolean).join("\n");
    try {
      parseMailingRecipientsText(next);
      updateRecipients(next); setFilePreview(null); setError("");
    } catch (caught) { setError(errorText(caught)); }
  };
  const generate = async () => {
    if (locked || !valid || !options || !startsAt || !currentEstimate?.total || prompt.trim().length < 10 || needsCriterionReview) return;
    await onGenerate({ objective: prompt.trim(), audienceHint: mailingAudienceLabel(activeSelections, explicitRecipients).slice(0, 500), channels: ["email"],
      startsAt, endsAt: new Date(Date.parse(slots[slots.length - 1].scheduledAt) + 3600000).toISOString(), itemCount: count,
      formats: { email: "16:9" }, mailingOptions: options });
  };
  return <Card className="border-orange-200">
    <CardHeader><CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-orange-600" />Mailing ciblé · importer une liste</CardTitle><p className="text-sm text-muted-foreground">Préparez une séquence d’e-mails pour les destinataires de votre choix. Textes, images et dates seront à relire avant tout envoi.</p></CardHeader>
    <CardContent className="space-y-5">
      <fieldset disabled={locked} className="space-y-5">
        <div className="space-y-2"><Label htmlFor="mailing-prompt">Décrivez votre campagne mailing</Label><Textarea id="mailing-prompt" rows={4} value={prompt} maxLength={2000} placeholder={briefExample} onChange={(event) => updatePrompt(event.target.value)} />
          <div className="flex flex-wrap gap-2"><Button type="button" variant="outline" onClick={() => updatePrompt(briefExample)}>Utiliser l’exemple pizzerias</Button><Button type="button" variant="secondary" disabled={prompt.trim().length < 10} onClick={interpret}><Sparkles className="mr-2 h-4 w-4" />{busy === "interpret" ? "Analyse du brief…" : "Interpréter le brief"}</Button></div>
          <p className="text-xs text-muted-foreground">L’interprétation préremplit les critères et la cadence. Vous pouvez aussi les choisir directement ci-dessous ; ces choix déterminent les destinataires.</p>
        </div>
        {summary ? <p role="status" className="rounded-xl bg-orange-50 p-3 text-sm">{summary}</p> : null}
        <fieldset className="space-y-2"><legend className="mb-2 font-semibold">Destinataires</legend>
          <div className="flex flex-wrap gap-4">{([['filters','Base de restaurants'],['manual','Liste d’adresses e-mail']] as const).map(([mode,label]) => <label key={mode} className="flex items-center gap-2 text-sm"><input type="radio" name="mailing-recipient-mode" value={mode} checked={recipientMode === mode} onChange={() => { setRecipientMode(mode); setEstimate(null); setError(""); }} />{label}</label>)}</div>
        </fieldset>
        {recipientMode === "filters" ? <div><h3 className="mb-2 font-semibold">Restaurants à cibler</h3><p className="mb-3 text-xs text-muted-foreground">Plusieurs choix d’une rubrique s’additionnent. Les rubriques se croisent. « Tous » inclut aussi les contacts dont ce critère n’est pas renseigné. Cocher une valeur limite cette rubrique.</p>
          <div className="grid items-start gap-3 md:grid-cols-2">{fields.map((field) => <Facet key={field} field={field} selected={selections[field]} disabled={locked} onChange={(values) => { setEstimate(null); setSelections((current) => { const next = { ...current }; if (values === undefined) delete next[field]; else next[field] = values; return next; }); }} />)}</div>
          <p className="mt-3 break-words text-sm">Cible : {mailingAudienceLabel(selections)}</p>
          {!options ? <p className="mt-2 text-sm text-rose-700">Cochez au moins une valeur ou « Tous » dans chaque rubrique, et choisissez entre 1 et 12 e-mails.</p> : null}
        </div> : <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-2"><Label htmlFor="mailing-recipients">Adresses e-mail des destinataires</Label>
            <Textarea id="mailing-recipients" value={recipientText} rows={5} maxLength={MAILING_RECIPIENT_LIMITS.maxTextLength} onChange={(event) => updateRecipients(event.target.value)} placeholder="bonjour@restaurant.ch\ncontact@restaurant.ch" />
            <p className="text-xs text-muted-foreground">Une adresse par ligne, ou séparées par des virgules ou points-virgules. Jusqu’à {MAILING_RECIPIENT_LIMITS.maxRecipients} adresses distinctes ; seuls ces destinataires seront ciblés.</p>
          </div>
          {recipientInput.error ? <p role="alert" className="text-sm text-rose-700">{recipientInput.error}</p> : null}
          {recipientInput.report ? <div className="space-y-2 text-sm" aria-live="polite">
            <p>{recipientInput.report.emails.length} adresse(s) valide(s) · {recipientInput.report.duplicateCount} doublon(s) · {recipientInput.report.invalidCount} entrée(s) invalide(s)</p>
            {recipientInput.report.invalidCount ? <div className="rounded-lg bg-amber-50 p-3 text-amber-900"><p>Corrigez ces entrées ou retirez-les explicitement avant de vérifier les destinataires.</p><ul className="my-2 list-disc break-all pl-5">{recipientInput.report.invalidEntries.map((entry,index) => <li key={index}>{entry}</li>)}</ul><Button type="button" size="sm" variant="outline" disabled={!recipientInput.report.emails.length} onClick={() => updateRecipients(recipientInput.report!.emails.join("\n"))}>Garder uniquement les adresses valides</Button></div> : null}
            {recipientInput.report.emails.length ? <details><summary className="cursor-pointer">Voir les adresses retenues ({recipientInput.report.emails.length})</summary><ul className="mt-2 max-h-48 overflow-y-auto break-all">{recipientInput.report.emails.map((email) => <li key={email}>{email}</li>)}</ul></details> : null}
          </div> : null}
          <div className="space-y-2"><Label htmlFor="mailing-recipient-file">Importer un fichier CSV, XLS ou XLSX</Label><Input id="mailing-recipient-file" type="file" accept={MAILING_RECIPIENT_FILE_ACCEPT} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void importRecipients(file); }} /><p className="text-xs text-muted-foreground">2 Mo maximum. Import libre dans les contacts, sans pièce justificative à joindre. Utilisez une colonne Email, e-mail ou courriel, ou une liste simple d’adresses. Le fichier est lu sur cet appareil. L’import ne donne pas automatiquement le droit de prospecter les adresses.</p></div>
          {busy === "file" ? <p role="status" className="text-sm">Lecture du fichier…</p> : null}
          {filePreview ? <section aria-label="Aperçu du fichier destinataires" className="space-y-3 rounded-lg bg-muted/40 p-3 text-sm">
            <p className="break-all font-semibold">{filePreview.name}</p><p>{filePreview.report.emails.length} adresse(s) valide(s) · {filePreview.report.duplicateCount} doublon(s) · {filePreview.report.invalidCount} entrée(s) invalide(s)</p>
            {filePreview.report.warnings?.map((warning,index) => <p role="status" key={index}>{warning}</p>)}
            {filePreview.report.invalidCount ? <div><p>Ces entrées ne seront pas ajoutées :</p><ul className="list-disc break-all pl-5">{filePreview.report.invalidEntries.map((entry,index) => <li key={index}>{entry}</li>)}</ul></div> : null}
            <details><summary className="cursor-pointer">Voir les adresses du fichier</summary><ul className="mt-2 max-h-48 overflow-y-auto break-all">{filePreview.report.emails.map((email) => <li key={email}>{email}</li>)}</ul></details>
            <div className="flex flex-wrap gap-2"><Button type="button" size="sm" disabled={!filePreview.report.emails.length} onClick={confirmFile}>Ajouter les {filePreview.report.emails.length} adresses valides à la liste</Button><Button type="button" size="sm" variant="outline" onClick={() => setFilePreview(null)}>Ignorer ce fichier</Button></div>
          </section> : null}
          <p className="text-xs text-muted-foreground">Importez votre liste directement, sans justificatif à téléverser. « Enregistrer et vérifier les destinataires » ajoute les nouvelles adresses à vos contacts. Leur import n’attribue aucune autorisation de contact. Les nouvelles fiches restent non éligibles tant qu’une autorisation n’est pas renseignée dans Contacts ; les oppositions et préférences existantes sont conservées.</p>
        </div>}
        {recipientMode === "filters" && unresolved.length ? <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm" role="alert"><p className="font-semibold">Critères à vérifier</p><ul className="my-2 list-disc pl-5">{unresolved.map((warning, index) => <li key={index}>{warning}</li>)}</ul><label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={reviewed} onChange={(event) => setReviewed(event.target.checked)} />J’ai corrigé ou accepté les critères affichés ci-dessus.</label></div> : null}
        <fieldset className="space-y-3"><legend className="mb-2 font-semibold">Image des e-mails · choix obligatoire</legend>
          <label className="flex items-start gap-3 rounded-xl border p-3"><input type="radio" name="mailing-image-mode" className="mt-1" checked={imageMode === "generated"} onChange={() => setImageMode("generated")} /><span><strong className="text-sm">Image générée</strong><span className="mt-1 block text-xs text-muted-foreground">Générer les textes et une bannière TOK commune à toute la séquence.</span></span></label>
          <label className="flex items-start gap-3 rounded-xl border p-3"><input type="radio" name="mailing-image-mode" className="mt-1" checked={imageMode === "manual"} onChange={() => setImageMode("manual")} /><span><strong className="text-sm">Import manuel</strong><span className="mt-1 block text-xs text-muted-foreground">Générer les textes, puis importer une image différente sur chaque e-mail avant validation.</span></span></label>
        </fieldset>
        <div className="grid gap-4 sm:grid-cols-3">
          <div><Label htmlFor="mailing-count">Nombre d’e-mails</Label><Input id="mailing-count" type="number" min={1} max={12} step={1} value={count} onChange={(event) => setCount(Number(event.target.value))} /></div>
          <div><Label htmlFor="mailing-cadence">Rythme des e-mails</Label><select id="mailing-cadence" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={cadence} onChange={(event) => setCadence(event.target.value as MailingOptions["cadence"])}><option value="daily">Un par jour</option><option value="every_other_day">Un tous les 2 jours</option><option value="twice_weekly">Deux par semaine</option><option value="weekly">Un par semaine</option><option value="biweekly">Un toutes les 2 semaines</option></select></div>
          <div><Label htmlFor="mailing-start">Premier e-mail · heure de Genève</Label><Input id="mailing-start" type="datetime-local" value={start} onChange={(event) => setStart(event.target.value)} /></div>
        </div>
        {slots.length ? <p className="text-xs text-muted-foreground">Dates proposées : {slots.map((slot) => new Date(slot.scheduledAt).toLocaleString("fr-CH", { timeZone: "Europe/Zurich", dateStyle: "short", timeStyle: "short" })).join(" · ")}</p> : null}
        <Button type="button" variant="outline" onClick={previewAudience} disabled={!options || !recipientInputValid}>{busy === "estimate" ? "Calcul de la cible…" : recipientMode === "manual" ? "Enregistrer et vérifier les destinataires" : "Vérifier les destinataires"}</Button>
      </fieldset>
      {currentEstimate ? <div role="status" className="rounded-xl border p-3 text-sm"><strong>{currentEstimate.total.toLocaleString("fr-CH")} {recipientMode === "manual" ? "destinataires sélectionnés" : "restaurants correspondants"}</strong> · {(currentEstimate.byChannel.email || 0).toLocaleString("fr-CH")} éligibles à l’e-mail aujourd’hui.
        {recipientMode === "manual" && estimate?.createdCount !== undefined ? <p>{estimate.createdCount} nouvelle(s) fiche(s) de contact enregistrée(s).</p> : null}
        <p className="mt-1 text-xs text-muted-foreground">Les oppositions, autorisations de contact et plafonds sont revérifiés à l’envoi.{recipientMode === "filters" ? " Les contacts à cuisine inconnue ne sont pas attribués à une cuisine par supposition." : ""}</p>{!currentEstimate.total ? <p>Aucun destinataire ne correspond. Ajustez les critères.</p> : null}{!currentEstimate.byChannel.email ? <p>Le brouillon peut être préparé ; aucun destinataire n’est actuellement éligible à l’envoi.</p> : null}</div> : null}
      {currentEstimate && currentEstimate.availabilityByChannel.email !== "available" ? <p role="alert" className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm">La connexion e-mail doit être configurée dans les intégrations avant l’envoi. Vous pouvez préparer et relire les brouillons.</p> : null}
      {error ? <p role="alert" className="text-sm text-rose-700">{error}</p> : null}
      <Button type="button" disabled={locked || !valid || !currentEstimate?.total || prompt.trim().length < 10 || needsCriterionReview} onClick={generate}>{pending ? "Préparation du mailing…" : imageMode === "manual" ? "Générer les textes des e-mails" : "Générer les e-mails et la bannière TOK"}</Button>
      <p className="text-xs text-muted-foreground">{imageMode === "manual" ? "Après la rédaction, importez une image JPG ou PNG sur chaque e-mail, puis relisez l’aperçu avant validation." : imageMode === "generated" ? "Une bannière native 16:9 commune à la séquence, basée sur les références TOK. Le coût estimé affiché concerne le texte ; la génération d’image utilise également le fournisseur IA." : "Choisissez « Image générée » ou « Import manuel » avant la génération."} La génération crée uniquement des brouillons.</p>
    </CardContent>
  </Card>;
}
