import { useMemo, useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Clock, FileSignature, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { dateIsValid, employeeName, minutesFromTime, workedHours, workforceZurichClock, type WorkforceValidation } from "@/lib/tokWorkforce";
import { useWorkforceClockSessionsInRange, useWorkforceEntriesInRange, useWorkforceEmployees, useWorkforceRefresh, useWorkforceValidations, workforceDb } from "@/hooks/useTokWorkforce";
import { workforceCurrentValidation, workforceEntryTimeSlices } from "@/lib/tokWorkforceReporting";
import { useAuth } from "@/lib/auth-context";
import WorkforceSignaturePad from "./WorkforceSignaturePad";

const durationLabel = (minutes: number | null | undefined) => minutes == null ? "Durée à corriger" : (minutes / 60).toLocaleString("fr-CH", { maximumFractionDigits: 2 }) + " h";

export default function WorkforceTime({ restaurantId }: { restaurantId: string }) {
  const [month, setMonth] = useState(() => workforceZurichClock().date.slice(0, 7));
  const [employeeFilter, setEmployeeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("pending");
  const range = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    if (!year || !monthNumber || monthNumber > 12) return { start: "", end: "" };
    return { start: month + "-01", end: month + "-" + new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() };
  }, [month]);
  const employeeQuery = useWorkforceEmployees(restaurantId, true);
  const entryQuery = useWorkforceEntriesInRange(restaurantId, !!range.start, range.start, range.end, employeeFilter || undefined);
  const validationQuery = useWorkforceValidations(restaurantId, !!range.start, range.start, range.end, employeeFilter || undefined);
  const clockQuery = useWorkforceClockSessionsInRange(restaurantId, !!range.start, range.start, range.end, employeeFilter || undefined);
  const employees = employeeQuery.data || [], entries = entryQuery.data || [], validations = validationQuery.data || [];
  const durations = useMemo(() => new Map((entryQuery.data || []).map((entry): [string, { minutes: number | null; error: string | null }] => {
    try { return [entry.id, { minutes: workforceEntryTimeSlices(entry, clockQuery.data || []).reduce((sum, slice) => sum + slice.workedMinutes, 0), error: null }]; }
    catch (error) { return [entry.id, { minutes: null, error: error instanceof Error ? error.message : "Durée à régulariser." }]; }
  })), [entryQuery.data, clockQuery.data]);
  const { user } = useAuth();
  const { toast } = useToast();
  const refresh = useWorkforceRefresh(restaurantId);
  const [employeeId, setEmployeeId] = useState("");
  const [date, setDate] = useState(() => workforceZurichClock().date);
  const [start, setStart] = useState("09:00"), [end, setEnd] = useState("17:00"), [breakMin, setBreakMin] = useState("30");
  const [name, setName] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, number | null>>({});
  const [reviewOpen, setReviewOpen] = useState(false);
  const [history, setHistory] = useState<WorkforceValidation | null>(null);
  const currentValidations = useMemo(() => new Map((entryQuery.data || []).map(entry => [entry.id, workforceCurrentValidation(entry, validationQuery.data || [])])), [entryQuery.data, validationQuery.data]);
  const attestedIds = new Set(validations.filter(validation => validation.restaurant_id === restaurantId).map(validation => validation.time_entry_id));
  const validatedIds = new Set(entries.filter(entry => currentValidations.get(entry.id)).map(entry => entry.id));
  const pending = entries.filter(entry => !validatedIds.has(entry.id));
  const eligible = pending.filter(entry => !attestedIds.has(entry.id) && durations.get(entry.id)?.minutes != null);
  const visible = entries.filter(entry => statusFilter === "all" || (statusFilter === "validated" ? validatedIds.has(entry.id) : !validatedIds.has(entry.id)));
  const selectedEntries = eligible.filter(entry => Object.prototype.hasOwnProperty.call(selected, entry.id));
  const blocked = entryQuery.isError || validationQuery.isError || clockQuery.isError || entryQuery.isPending || validationQuery.isPending || clockQuery.isPending || !range.start;
  const resetSelection = () => { setSelected({}); setSignature(null); setReviewOpen(false); };
  const selectEntry = (id: string) => {
    const entry = eligible.find(item => item.id === id);
    if (!entry || blocked) return;
    setSignature(null);
    setSelected(current => {
      if (Object.prototype.hasOwnProperty.call(current, id)) { const next = { ...current }; delete next[id]; return next; }
      if (Object.keys(current).length >= 100) return current;
      return { ...current, [id]: entry.version ?? null };
    });
  };
  const save = useMutation({
    mutationFn: async () => {
      if (!employees.some(employee => employee.id === employeeId && employee.is_active)) throw new Error("Collaborateur actif requis.");
      if (!dateIsValid(date)) throw new Error("Date invalide.");
      workedHours(start, end, Number(breakMin));
      const isSunday = new Date(date + "T12:00:00Z").getUTCDay() === 0;
      const isNight = minutesFromTime(start) < 360 || minutesFromTime(end) > 1380 || minutesFromTime(end) < minutesFromTime(start);
      const { data, error } = await workforceDb().from("tok_workforce_time_entries").insert({
        restaurant_id: restaurantId, employee_id: employeeId, entry_date: date, start_time: start, end_time: end,
        break_minutes: Number(breakMin), is_sunday_work: isSunday, is_night_work: isNight,
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("L’enregistrement des heures n’a pas pu être confirmé.");
    },
    onSuccess: () => { void refresh(); toast({ title: "Heures enregistrées" }); },
  });
  const approve = useMutation({
    mutationFn: async () => {
      if (!user?.id) throw new Error("Connexion requise.");
      if (blocked) throw new Error("Actualisez les relevés et leurs validations avant de continuer.");
      if (name.trim().length < 2 || name.trim().length > 120) throw new Error("Indiquez le nom complet du signataire.");
      const ids = Object.keys(selected);
      if (!ids.length || ids.length > 100 || selectedEntries.length !== ids.length) throw new Error("La sélection a changé. Actualisez les relevés avant de signer.");
      if (!signature?.startsWith("data:image/png;base64,") || signature.length > 120000) throw new Error("Veuillez dessiner une signature avant validation.");
      const expectedVersions = Object.fromEntries(Object.entries(selected).filter(([, version]) => !!version));
      const { data, error } = await workforceDb().rpc("tok_workforce_validate_entries", {
        p_restaurant_id: restaurantId, p_entry_ids: ids, p_signed_name: name.trim(),
        p_signature_data: signature, p_expected_versions: expectedVersions,
      });
      if (error) throw error;
      if (!Array.isArray(data) || data.length !== ids.length || !ids.every(id => data.some(validation => validation.time_entry_id === id))) throw new Error("La validation n’a pas pu être confirmée. Actualisez les relevés.");
    },
    onSuccess: () => { resetSelection(); setName(""); void refresh(); toast({ title: "Relevés signés et validés", description: "La signature et le contenu de chaque relevé ont été enregistrés ensemble." }); },
  });
  const remove = useMutation({
    mutationFn: async ({ id, version }: { id: string; version?: number }) => {
      const entry = entries.find(item => item.id === id && item.restaurant_id === restaurantId);
      if (blocked || !entry || attestedIds.has(id)) throw new Error("Seul un relevé non signé de cet établissement peut être supprimé.");
      if (!version || !Number.isInteger(version) || entry.version !== version) throw new Error("Le relevé a changé. Actualisez avant de le supprimer.");
      const { data, error } = await workforceDb().from("tok_workforce_time_entries").delete().eq("restaurant_id", restaurantId).eq("id", id).eq("version", version).select("id").single();
      if (error) throw error.code === "23503" ? new Error("Ce relevé est lié à une demande de correction. Son historique doit être conservé.") : error;
      if (data?.id !== id) throw new Error("La suppression n’a pas pu être confirmée. Le relevé a peut-être changé ; actualisez la liste.");
      return id;
    },
    onSuccess: id => { setSelected(current => { const next = { ...current }; delete next[id]; return next; }); setSignature(null); void refresh(); toast({ title: "Relevé non signé supprimé" }); },
  });
  const selectedHours = selectedEntries.reduce((sum, entry) => sum + (durations.get(entry.id)?.minutes || 0), 0) / 60;
  const signedSnapshot = history?.entry_snapshot;
  const snapshotDate = typeof signedSnapshot?.entry_date === "string" ? signedSnapshot.entry_date : null;
  const snapshotStart = typeof signedSnapshot?.start_time === "string" ? signedSnapshot.start_time : null;
  const snapshotEnd = typeof signedSnapshot?.end_time === "string" ? signedSnapshot.end_time : null;
  const snapshotPause = typeof signedSnapshot?.break_minutes === "number" ? signedSnapshot.break_minutes : null;
  return <div className="space-y-5">
    <Card className="rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary" />Saisir des heures travaillées</CardTitle></CardHeader>
      <CardContent><form onSubmit={(event: FormEvent) => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
        <fieldset disabled={save.isPending || employeeQuery.isError || employeeQuery.isPending} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
          <div className="sm:col-span-2"><Label htmlFor="wf-entry-employee">Collaborateur</Label><select id="wf-entry-employee" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={employeeId} onChange={e => setEmployeeId(e.target.value)}><option value="">Sélectionner…</option>{employees.filter(employee => employee.is_active).map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select></div>
          <div><Label htmlFor="wf-entry-date">Date</Label><Input id="wf-entry-date" type="date" required value={date} onChange={e => setDate(e.target.value)} /></div>
          <div><Label htmlFor="wf-entry-start">Début</Label><Input id="wf-entry-start" type="time" required value={start} onChange={e => setStart(e.target.value)} /></div>
          <div><Label htmlFor="wf-entry-end">Fin</Label><Input id="wf-entry-end" type="time" required value={end} onChange={e => setEnd(e.target.value)} /></div>
          <div><Label htmlFor="wf-entry-break">Pause (min)</Label><Input id="wf-entry-break" type="number" min={0} max={720} step={1} required value={breakMin} onChange={e => setBreakMin(e.target.value)} /></div>
          <div className="sm:col-span-2 lg:col-span-6"><Button disabled={save.isPending || !employees.length} type="submit">{save.isPending ? "Enregistrement…" : "Enregistrer les heures"}</Button></div>
        </fieldset>
        {save.error ? <p role="alert" className="mt-3 text-sm text-destructive">{save.error.message}</p> : null}
      </form></CardContent>
    </Card>
    <Card className="rounded-2xl"><CardHeader><CardTitle>Relevés et validation</CardTitle></CardHeader><CardContent className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div><Label htmlFor="wf-hours-month">Mois des relevés</Label><Input id="wf-hours-month" type="month" required value={month} onChange={e => { setMonth(e.target.value); resetSelection(); }} /></div>
        <div><Label htmlFor="wf-hours-person">Filtrer par collaborateur</Label><select id="wf-hours-person" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={employeeFilter} onChange={e => { setEmployeeFilter(e.target.value); resetSelection(); }}><option value="">Toute l’équipe</option>{employees.map(employee => <option key={employee.id} value={employee.id}>{employeeName(employee)}</option>)}</select></div>
        <div><Label htmlFor="wf-hours-status">État des relevés</Label><select id="wf-hours-status" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={e => { setStatusFilter(e.target.value); resetSelection(); }}><option value="pending">À valider</option><option value="validated">Validés</option><option value="all">Tous</option></select></div>
      </div>
      {entryQuery.isPending || validationQuery.isPending || clockQuery.isPending ? <p role="status" className="text-muted-foreground">Chargement des relevés, pointages et signatures…</p> : null}
      {entryQuery.isError || validationQuery.isError || clockQuery.isError ? <p role="alert" className="text-destructive">Impossible de vérifier les relevés, leurs pointages et leurs signatures. <button className="underline" onClick={() => void refresh()}>Réessayer</button></p> : null}
      {!range.start ? <p role="alert">Choisissez un mois valide.</p> : null}
      {remove.error ? <p role="alert" className="text-sm text-destructive">{remove.error.message}</p> : null}
      {statusFilter !== "validated" ? <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-muted/40 p-3">
        <label className="flex items-center gap-2 text-sm"><Checkbox aria-label="Sélectionner les relevés en attente" disabled={blocked || remove.isPending || !eligible.length} checked={eligible.length > 0 && eligible.slice(0, 100).every(entry => Object.prototype.hasOwnProperty.call(selected, entry.id))} onCheckedChange={checked => { setSignature(null); setSelected(checked ? Object.fromEntries(eligible.slice(0, 100).map(entry => [entry.id, entry.version ?? null])) : {}); }} />Sélectionner les relevés en attente</label>
        <Button disabled={blocked || remove.isPending || !selectedEntries.length} onClick={() => { approve.reset(); setSignature(null); setReviewOpen(true); }}><FileSignature className="mr-2 h-4 w-4" />Signer la sélection ({selectedEntries.length})</Button>
        {eligible.length > 100 ? <p className="w-full text-xs text-muted-foreground">Validez les relevés par groupes de 100 maximum.</p> : null}
      </div> : null}
      {!blocked && visible.length === 0 ? <p className="py-4 text-muted-foreground">Aucun relevé pour ces filtres.</p> : null}
      {!blocked ? visible.map(entry => {
        const validation = currentValidations.get(entry.id);
        const attestation = validation || validations.find(item => item.time_entry_id === entry.id && item.restaurant_id === restaurantId);
        return <div key={entry.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3">
          {!attestation ? <Checkbox disabled={remove.isPending || durations.get(entry.id)?.minutes == null} checked={Object.prototype.hasOwnProperty.call(selected, entry.id)} aria-label={`Sélectionner ${employeeName(employees.find(employee => employee.id === entry.employee_id))} le ${entry.entry_date} à ${entry.start_time.slice(0, 5)}`} onCheckedChange={() => selectEntry(entry.id)} /> : null}
          <div className="min-w-0 flex-1"><p className="font-semibold">{employeeName(employees.find(employee => employee.id === entry.employee_id))}</p><p className="text-sm text-muted-foreground">{entry.entry_date} · {entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)} · {durationLabel(durations.get(entry.id)?.minutes)} · Pause {entry.break_minutes} min</p>{validation ? <p className="text-xs text-muted-foreground">Validé par {validation.signed_name} le {new Date(validation.signed_at).toLocaleDateString("fr-CH")}</p> : null}{attestation && !validation ? <p role="alert" className="mt-1 text-sm text-destructive">Une attestation existe, mais sa correspondance avec la version actuelle du relevé n’est pas vérifiable. Modification, suppression et nouvelle signature bloquées.</p> : null}{durations.get(entry.id)?.error ? <p role="alert" className="mt-1 text-sm text-destructive">Régularisation nécessaire : {durations.get(entry.id)?.error}</p> : null}</div>
          {attestation ? <><Badge variant={validation ? "secondary" : "outline"}>{validation ? <><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Validé</> : "Preuve historique à vérifier"}</Badge><Button size="sm" variant="outline" onClick={() => setHistory(attestation)}>{validation ? "Voir la signature" : "Consulter la preuve historique"}</Button></> : <><Badge variant="outline">À valider</Badge><Button size="sm" variant="ghost" disabled={remove.isPending || approve.isPending} aria-label={`Supprimer le relevé de ${employeeName(employees.find(employee => employee.id === entry.employee_id))} du ${entry.entry_date} à ${entry.start_time.slice(0, 5)}`} onClick={() => { remove.reset(); if (window.confirm(`Supprimer le relevé non signé du ${entry.entry_date}, ${entry.start_time.slice(0, 5)}–${entry.end_time.slice(0, 5)} ? Cette action retire les heures des compteurs et rapports.`)) remove.mutate({ id: entry.id, version: entry.version }); }}><Trash2 className="h-4 w-4 text-destructive" /></Button></>}
        </div>;
      }) : null}
    </CardContent></Card>
    <Dialog open={reviewOpen} onOpenChange={open => { if (!approve.isPending) { setReviewOpen(open); setSignature(null); } }}><DialogContent className="sm:max-w-2xl" hideCloseButton={approve.isPending}>
      <DialogHeader><DialogTitle>Signer {selectedEntries.length} relevé(s)</DialogTitle><DialogDescription>Vérifiez les horaires. La signature sera associée au contenu exact de chaque relevé sélectionné.</DialogDescription></DialogHeader>
      <div className="max-h-52 overflow-auto rounded-xl border"><table className="w-full text-sm"><thead><tr className="border-b bg-muted/30"><th className="p-2 text-left">Collaborateur et date</th><th className="p-2 text-left">Horaire</th><th className="p-2 text-right">Heures</th></tr></thead><tbody>{selectedEntries.map(entry => <tr key={entry.id} className="border-b"><td className="p-2">{employeeName(employees.find(employee => employee.id === entry.employee_id))}<span className="block text-xs text-muted-foreground">{entry.entry_date}</span></td><td className="p-2">{entry.start_time.slice(0, 5)}–{entry.end_time.slice(0, 5)}<span className="block text-xs">Pause {entry.break_minutes} min</span></td><td className="p-2 text-right">{durationLabel(durations.get(entry.id)?.minutes)}</td></tr>)}</tbody></table></div>
      <p className="font-semibold">Total : {selectedHours.toFixed(2)} h</p>
      <form onSubmit={event => { event.preventDefault(); if (!approve.isPending) approve.mutate(); }} className="space-y-3">
        <div><Label htmlFor="wf-signer-name">Nom complet du responsable</Label><Input id="wf-signer-name" required maxLength={120} disabled={approve.isPending} value={name} onChange={e => setName(e.target.value)} /></div>
        <WorkforceSignaturePad key={reviewOpen ? "signing" : "closed"} onChange={setSignature} disabled={approve.isPending} />
        <p className="text-xs text-muted-foreground">Attestation nominative avec signature manuscrite. Elle ne constitue pas une signature électronique qualifiée.</p>
        {approve.error ? <p role="alert" className="text-sm text-destructive">{approve.error.message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" disabled={approve.isPending} onClick={() => { setReviewOpen(false); setSignature(null); }}>Annuler</Button><Button disabled={approve.isPending || !signature || !selectedEntries.length} type="submit"><ClipboardCheck className="mr-2 h-4 w-4" />{approve.isPending ? "Validation…" : "Confirmer la validation"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>
    {history ? <Dialog open onOpenChange={open => { if (!open) setHistory(null); }}><DialogContent><DialogHeader><DialogTitle>Signature du relevé</DialogTitle><DialogDescription>{history.signed_name} · {new Intl.DateTimeFormat("fr-CH", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Zurich" }).format(new Date(history.signed_at))}</DialogDescription></DialogHeader>
      {history.signature_data?.startsWith("data:image/png;base64,") && history.signature_data.length <= 120000 ? <img src={history.signature_data} alt={`Signature manuscrite de ${history.signed_name}`} className="max-h-48 w-full rounded-xl border bg-white object-contain" /> : <p className="text-muted-foreground">Image de signature indisponible pour cette validation.</p>}
      {snapshotDate && snapshotStart && snapshotEnd && snapshotPause !== null ? <div className="space-y-1 rounded-xl bg-muted/40 p-3 text-sm"><p className="font-semibold">Contenu signé</p><p>{snapshotDate} · {snapshotStart.slice(0, 5)}–{snapshotEnd.slice(0, 5)} · pause {snapshotPause} min</p><p>{history.entry_version ? `Version ${history.entry_version}` : "Validation historique"}</p></div> : <p className="text-xs text-muted-foreground">Cette ancienne validation ne contient pas de copie des horaires signés.</p>}
      {history.entry_hash ? <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">Empreinte du contenu signé</summary><p className="mt-2 break-all font-mono">{history.entry_hash}</p></details> : null}
      <p className="break-all text-xs text-muted-foreground">Référence du relevé : {history.time_entry_id}</p><DialogFooter><Button onClick={() => setHistory(null)}>Fermer</Button></DialogFooter>
    </DialogContent></Dialog> : null}
  </div>;
}
