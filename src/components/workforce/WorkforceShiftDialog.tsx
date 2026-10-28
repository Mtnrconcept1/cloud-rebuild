import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { workforceDb, useWorkforceRefresh } from "@/hooks/useTokWorkforce";
import { shiftAvailabilityIssue } from "./workforcePlanningChecks";
import { employeeName, workedHours, type WorkforceAbsence, type WorkforceEmployee, type WorkforceShift } from "@/lib/tokWorkforce";

type Props = {
  restaurantId: string;
  employees: WorkforceEmployee[];
  absences: WorkforceAbsence[];
  shift?: WorkforceShift;
  initialEmployeeId?: string;
  initialDate: string;
  onClose: () => void;
};

export default function WorkforceShiftDialog({ restaurantId, employees, absences, shift, initialEmployeeId, initialDate, onClose }: Props) {
  const { toast } = useToast();
  const refresh = useWorkforceRefresh(restaurantId);
  const [form, setForm] = useState({
    employee_id: shift?.employee_id || initialEmployeeId || "",
    shift_date: shift?.shift_date || initialDate,
    start_time: shift?.start_time.slice(0, 5) || "09:00",
    end_time: shift?.end_time.slice(0, 5) || "17:00",
    break_minutes: String(shift?.break_minutes ?? 30),
    status: shift?.status || "planned",
    notes: shift?.notes || "",
  });
  const save = useMutation({
    mutationFn: async () => {
      if (shift && shift.restaurant_id !== restaurantId) throw new Error("Le service n’appartient pas à cet établissement.");
      workedHours(form.start_time, form.end_time, Number(form.break_minutes));
      const issue = shiftAvailabilityIssue(form, employees, absences);
      if (issue) throw new Error(issue);
      const values = { ...form, break_minutes: Number(form.break_minutes), notes: form.notes.trim() || null };
      const db = workforceDb();
      if (shift) {
        let query = db.from("tok_workforce_shifts").update(values).eq("restaurant_id", restaurantId).eq("id", shift.id);
        if (shift.updated_at) query = query.eq("updated_at", shift.updated_at);
        const { data, error } = await query.select("id").single();
        if (error) throw error;
        if (data?.id !== shift.id) throw new Error("Le service a changé. Actualisez le planning avant de réessayer.");
      } else {
        const { data, error } = await db.from("tok_workforce_shifts").insert({ ...values, restaurant_id: restaurantId }).select("id").single();
        if (error) throw error;
        if (!data?.id) throw new Error("La création du service n’a pas pu être confirmée.");
      }
    },
    onSuccess: () => { void refresh(); toast({ title: shift ? "Service modifié" : "Service planifié" }); onClose(); },
  });
  const submit = (event: FormEvent) => { event.preventDefault(); if (!save.isPending) save.mutate(); };
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="sm:max-w-xl" hideCloseButton={save.isPending}>
      <DialogHeader><DialogTitle>{shift ? "Modifier le service" : "Ajouter un service"}</DialogTitle><DialogDescription>Affectation, horaires et disponibilité sont vérifiés avant l’enregistrement. Une fin antérieure au début correspond au lendemain.</DialogDescription></DialogHeader>
      <form aria-label={shift ? "Modifier le service" : "Ajouter un service"} onSubmit={submit} className="space-y-4">
        <fieldset disabled={save.isPending} className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2"><Label htmlFor="wf-shift-person">Collaborateur</Label><select id="wf-shift-person" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.employee_id} onChange={e => setForm({ ...form, employee_id: e.target.value })}>
            <option value="">Sélectionner…</option>{employees.filter(person => person.is_active || person.id === shift?.employee_id).map(person => <option key={person.id} value={person.id} disabled={!person.is_active}>{employeeName(person)}{!person.is_active ? " · inactif" : ""}</option>)}
          </select></div>
          <div><Label htmlFor="wf-shift-date">Date du service</Label><Input id="wf-shift-date" type="date" required value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} /></div>
          <div><Label htmlFor="wf-shift-status">Statut</Label><select id="wf-shift-status" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={form.status} onChange={e => setForm({ ...form, status: e.target.value as WorkforceShift["status"] })}><option value="planned">Prévu</option><option value="confirmed">Confirmé</option><option value="completed">Terminé</option><option value="cancelled">Annulé</option></select></div>
          <div><Label htmlFor="wf-shift-start">Début</Label><Input id="wf-shift-start" type="time" required value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} /></div>
          <div><Label htmlFor="wf-shift-end">Fin</Label><Input id="wf-shift-end" type="time" required value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} /></div>
          <div><Label htmlFor="wf-shift-break">Pause (minutes)</Label><Input id="wf-shift-break" type="number" required min={0} max={720} step={1} value={form.break_minutes} onChange={e => setForm({ ...form, break_minutes: e.target.value })} /></div>
          <div className="sm:col-span-2"><Label htmlFor="wf-shift-notes">Notes du service</Label><Textarea id="wf-shift-notes" maxLength={2000} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
        </fieldset>
        {save.error ? <p role="alert" className="rounded-xl border border-destructive/30 p-3 text-sm text-destructive">{save.error.message}</p> : null}
        <DialogFooter><Button type="button" variant="outline" disabled={save.isPending} onClick={onClose}>Annuler</Button><Button type="submit" disabled={save.isPending}>{save.isPending ? "Enregistrement…" : shift ? "Enregistrer le service" : "Planifier le service"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
