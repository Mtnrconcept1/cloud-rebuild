import { useId, useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useWorkforceEntriesInRange, useWorkforceHolidays, useWorkforceRefresh, useWorkforceValidations, workforceDb } from "@/hooks/useTokWorkforce";
import { dateIsValid, employeeName, workedHours, workforceZurichClock } from "@/lib/tokWorkforce";
import { workforceAbsenceDates } from "@/lib/tokWorkforceReporting";

type Person = { id: string; first_name: string; last_name: string; is_active?: boolean };
type Props = { restaurantId: string; employees: Person[]; employeeId?: string; onSuccess?: () => void };
const requestTypes = [{ value: "vacation", label: "Congé" }, { value: "correction", label: "Correction d’heures" }, { value: "schedule", label: "Planning" }, { value: "other", label: "Autre" }];

export default function WorkforceRequestForm({ restaurantId, employees, employeeId, onSuccess }: Props) {
  const formId = useId();
  const { toast } = useToast();
  const refresh = useWorkforceRefresh(restaurantId);
  const [personId, setPersonId] = useState(employeeId || "");
  const selectedPerson = employeeId || personId;
  const [type, setType] = useState("vacation"), [description, setDescription] = useState("");
  const [leaveStart, setLeaveStart] = useState(""), [leaveEnd, setLeaveEnd] = useState("");
  const [customLeaveDays, setCustomLeaveDays] = useState<string | null>(null);
  const holidays = useWorkforceHolidays(restaurantId, type === "vacation");
  const suggestedLeaveDays = useMemo(() => {
    if (!dateIsValid(leaveStart) || !dateIsValid(leaveEnd) || leaveEnd < leaveStart || holidays.isPending || holidays.isError) return null;
    try { return workforceAbsenceDates(leaveStart, leaveEnd, holidays.data || [], restaurantId).length; } catch { return null; }
  }, [leaveStart, leaveEnd, holidays.data, holidays.isPending, holidays.isError, restaurantId]);
  const leaveDays = customLeaveDays ?? String(suggestedLeaveDays ?? 1);
  const [month, setMonth] = useState(() => workforceZurichClock().date.slice(0, 7));
  const [entryId, setEntryId] = useState(""), [entryVersion, setEntryVersion] = useState<number | null>(null);
  const [startTime, setStartTime] = useState("09:00"), [endTime, setEndTime] = useState("17:00"), [pause, setPause] = useState("30");
  const range = useMemo(() => {
    const [year, monthNumber] = month.split("-").map(Number);
    return /^\d{4}-\d{2}$/.test(month) && monthNumber >= 1 && monthNumber <= 12
      ? { start: month + "-01", end: month + "-" + new Date(Date.UTC(year, monthNumber, 0)).getUTCDate() }
      : { start: "", end: "" };
  }, [month]);
  const correction = type === "correction";
  const entries = useWorkforceEntriesInRange(restaurantId, correction && !!selectedPerson && !!range.start, range.start, range.end, selectedPerson || undefined);
  const validations = useWorkforceValidations(restaurantId, correction && !!selectedPerson && !!range.start, range.start, range.end, selectedPerson || undefined);
  const signedIds = new Set((validations.data || []).map(validation => validation.time_entry_id));
  const available = (entries.data || []).filter(entry => entry.employee_id === selectedPerson && !signedIds.has(entry.id));
  const entry = available.find(item => item.id === entryId);
  const entriesUnavailable = correction && (!selectedPerson || !range.start || entries.isPending || entries.isError || validations.isPending || validations.isError);
  const selectEntry = (id: string) => {
    const selected = available.find(item => item.id === id);
    setEntryId(id);
    setEntryVersion(selected?.version ?? null);
    if (selected) { setStartTime(selected.start_time.slice(0, 5)); setEndTime(selected.end_time.slice(0, 5)); setPause(String(selected.break_minutes)); }
  };
  const create = useMutation({
    mutationFn: async () => {
      if (!employees.some(person => person.id === selectedPerson && person.is_active !== false)) throw new Error("Choisissez un collaborateur actif.");
      if (!description.trim() || description.length > 2000) throw new Error("Précisez le motif de votre demande.");
      if (type === "vacation") {
        if (holidays.isPending || holidays.isError) throw new Error("Actualisez le calendrier des jours fériés avant d’envoyer ce congé.");
        if (!dateIsValid(leaveStart) || !dateIsValid(leaveEnd) || leaveEnd < leaveStart) throw new Error("Période de congé invalide.");
        const span = (Date.parse(leaveEnd + "T12:00:00Z") - Date.parse(leaveStart + "T12:00:00Z")) / 86400000 + 1;
        if (!Number.isFinite(+leaveDays) || +leaveDays <= 0 || +leaveDays > Math.min(366, span)) throw new Error("Le nombre de jours doit correspondre à la période demandée.");
      }
      if (correction) {
        if (entriesUnavailable || !entry || !Number.isInteger(entryVersion) || !entryVersion || entryVersion < 1) throw new Error("Sélectionnez un relevé non signé à corriger.");
        if (entry.version !== entryVersion) throw new Error("Ce relevé a été modifié. Sélectionnez-le à nouveau pour vérifier ses horaires.");
        workedHours(startTime, endTime, +pause);
      }
      const { data, error } = await workforceDb().from("tok_workforce_requests").insert({
        restaurant_id: restaurantId, employee_id: selectedPerson, request_type: type, description: description.trim(), status: "pending",
        requested_start_date: type === "vacation" ? leaveStart : null, requested_end_date: type === "vacation" ? leaveEnd : null,
        requested_days: type === "vacation" ? +leaveDays : null,
        requested_entry_id: correction ? entryId : null, requested_entry_version: correction ? entryVersion : null,
        requested_start_time: correction ? startTime : null, requested_end_time: correction ? endTime : null, requested_break_minutes: correction ? +pause : null,
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("L’envoi de la demande n’a pas pu être confirmé.");
    },
    onSuccess: () => { setDescription(""); setEntryId(""); setEntryVersion(null); void refresh(); onSuccess?.(); toast({ title: "Demande envoyée au responsable" }); },
  });
  return <form aria-label="Nouvelle demande de personnel" className="space-y-4" onSubmit={event => { event.preventDefault(); if (!create.isPending) create.mutate(); }}>
    <fieldset disabled={create.isPending} className="space-y-4">
      {!employeeId ? <div><Label htmlFor={formId + "-person"}>Collaborateur</Label><select id={formId + "-person"} required className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={personId} onChange={e => { setPersonId(e.target.value); setEntryId(""); setEntryVersion(null); }}><option value="">Sélectionner…</option>{employees.filter(person => person.is_active !== false).map(person => <option key={person.id} value={person.id}>{employeeName(person)}</option>)}</select></div> : null}
      <div><Label htmlFor={formId + "-type"}>Motif</Label><select id={formId + "-type"} className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={type} onChange={e => { setType(e.target.value); create.reset(); }}>{requestTypes.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></div>
      {type === "vacation" ? <div className="space-y-2"><div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor={formId + "-from"}>Du</Label><Input id={formId + "-from"} type="date" required value={leaveStart} onChange={e => { setLeaveStart(e.target.value); setCustomLeaveDays(null); }} /></div><div><Label htmlFor={formId + "-to"}>Au</Label><Input id={formId + "-to"} type="date" required min={leaveStart} value={leaveEnd} onChange={e => { setLeaveEnd(e.target.value); setCustomLeaveDays(null); }} /></div><div><Label htmlFor={formId + "-days"}>Jours décomptés</Label><Input id={formId + "-days"} type="number" required min="0.5" max={366} step="0.5" value={leaveDays} onChange={e => setCustomLeaveDays(e.target.value)} /></div></div><p className="text-xs text-muted-foreground">Préremplissage indicatif du lundi au vendredi, hors fériés configurés. Ajustez le décompte selon le contrat, par demi-journée. Modifier les dates recalcule cette proposition.</p>{holidays.isPending ? <p role="status" className="text-sm">Lecture du calendrier…</p> : holidays.isError ? <p role="alert" className="text-sm text-destructive">Calendrier indisponible. <button type="button" className="underline" onClick={() => void holidays.refetch()}>Réessayer</button></p> : suggestedLeaveDays === 0 ? <p className="text-xs text-muted-foreground">Aucun jour ouvré sur cette période. Vérifiez votre décompte avec le responsable.</p> : null}</div> : null}
      {correction ? <div className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <div><Label htmlFor={formId + "-month"}>Mois du relevé à corriger</Label><Input id={formId + "-month"} type="month" required value={month} onChange={e => { setMonth(e.target.value); setEntryId(""); setEntryVersion(null); }} /></div>
        {selectedPerson && (entries.isError || validations.isError) ? <p role="alert" className="text-sm text-destructive">Impossible de vérifier les relevés. <button type="button" className="underline" onClick={() => { void entries.refetch(); void validations.refetch(); }}>Réessayer</button></p> : null}
        <div><Label htmlFor={formId + "-entry"}>Relevé non signé</Label><select id={formId + "-entry"} required disabled={entriesUnavailable} className="flex h-10 w-full rounded-md border bg-background px-2 text-sm" value={entryId} onChange={e => selectEntry(e.target.value)}><option value="">Sélectionner…</option>{available.map(item => <option key={item.id} value={item.id}>{item.entry_date} · {item.start_time.slice(0, 5)}–{item.end_time.slice(0, 5)} · pause {item.break_minutes} min</option>)}</select></div>
        {!entriesUnavailable && !available.length ? <p className="text-sm text-muted-foreground">Aucun relevé non signé pour ce mois.</p> : null}
        <div className="grid gap-3 sm:grid-cols-3"><div><Label htmlFor={formId + "-start"}>Début corrigé</Label><Input id={formId + "-start"} type="time" required value={startTime} onChange={e => setStartTime(e.target.value)} /></div><div><Label htmlFor={formId + "-end"}>Fin corrigée</Label><Input id={formId + "-end"} type="time" required value={endTime} onChange={e => setEndTime(e.target.value)} /></div><div><Label htmlFor={formId + "-pause"}>Pause corrigée (min)</Label><Input id={formId + "-pause"} type="number" required min={0} max={720} step={1} value={pause} onChange={e => setPause(e.target.value)} /></div></div>
        <p className="text-xs text-muted-foreground">La correction sera appliquée si le responsable l’approuve. Un relevé déjà signé doit être traité avec votre responsable.</p>
      </div> : null}
      <div><Label htmlFor={formId + "-description"}>Description de la demande</Label><Textarea id={formId + "-description"} required maxLength={2000} value={description} onChange={e => setDescription(e.target.value)} /></div>
    </fieldset>
    {create.error ? <p role="alert" className="text-sm text-destructive">{create.error.message}</p> : null}
    <Button type="submit" disabled={create.isPending || !selectedPerson || (type === "vacation" && (holidays.isPending || holidays.isError)) || (correction && (entriesUnavailable || !entryId))}>{create.isPending ? "Envoi…" : "Envoyer au responsable"}</Button>
  </form>;
}
