import { useMemo, useState } from "react";
import { addWeeks, subWeeks, format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus, RefreshCw } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import WorkforceWeekGrid from "@/components/workforce/WorkforceWeekGrid";
import WorkforceShiftDialog from "@/components/workforce/WorkforceShiftDialog";
import { shiftAvailabilityIssue } from "./workforcePlanningChecks";
import { useToast } from "@/hooks/use-toast";
import { weekRange, type WorkforceShift } from "@/lib/tokWorkforce";
import { useWorkforceEmployees, useWorkforceShifts, useWorkforceAbsences, useWorkforceRefresh, workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforcePlanning({ restaurantId }: { restaurantId: string }) {
  const [cursor, setCursor] = useState(new Date());
  const week = useMemo(() => weekRange(cursor), [cursor]);
  const employeesQuery = useWorkforceEmployees(restaurantId, true);
  const shiftsQuery = useWorkforceShifts(restaurantId, true, week.start, week.end);
  const absencesQuery = useWorkforceAbsences(restaurantId, true);
  const employees = employeesQuery.data || [], shifts = shiftsQuery.data || [], absences = absencesQuery.data || [];
  const { toast } = useToast();
  const refresh = useWorkforceRefresh(restaurantId);
  const [dialog, setDialog] = useState<{ shift?: WorkforceShift; employeeId?: string; date: string } | null>(null);
  const unavailable = employeesQuery.isError || shiftsQuery.isError || absencesQuery.isError;
  const loading = employeesQuery.isPending || shiftsQuery.isPending || absencesQuery.isPending;
  const change = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, string> }) => {
      const shift = shifts.find(item => item.id === id && item.restaurant_id === restaurantId);
      if (!shift || unavailable || loading) throw new Error("Actualisez le planning et les disponibilités avant de déplacer un service.");
      const issue = shiftAvailabilityIssue({ ...shift, ...patch }, employees, absences);
      if (issue) throw new Error(issue);
      let query = workforceDb().from("tok_workforce_shifts").update(patch).eq("restaurant_id", restaurantId).eq("id", id);
      if (shift.updated_at) query = query.eq("updated_at", shift.updated_at);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      if (data?.id !== id) throw new Error("Le service a changé. Actualisez le planning.");
    },
    onSuccess: () => { void refresh(); toast({ title: "Planning actualisé" }); },
    onError: (error: Error) => toast({ variant: "destructive", title: "Modification impossible", description: error.message }),
  });
  const remove = useMutation({
    mutationFn: async (id: string) => {
      const shift = shifts.find(item => item.id === id);
      if (!shift) throw new Error("Service indisponible.");
      let query = workforceDb().from("tok_workforce_shifts").delete().eq("restaurant_id", restaurantId).eq("id", id);
      if (shift.updated_at) query = query.eq("updated_at", shift.updated_at);
      const { data, error } = await query.select("id").single();
      if (error) throw error;
      if (data?.id !== id) throw new Error("Le service a changé. Actualisez le planning.");
    },
    onSuccess: () => { void refresh(); toast({ title: "Service supprimé" }); },
    onError: (error: Error) => toast({ variant: "destructive", title: "Suppression impossible", description: error.message }),
  });
  const days = Array.from({ length: 7 }, (_, index) => addDays(new Date(week.start + "T12:00:00"), index));
  return <div className="space-y-5">
    <Card className="rounded-2xl">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary" />Planning hebdomadaire</CardTitle>
        <Button disabled={loading || unavailable || !employees.some(person => person.is_active)} onClick={() => setDialog({ date: week.start })}><Plus className="mr-2 h-4 w-4" />Ajouter un service</Button>
      </div><div className="flex flex-wrap items-center gap-2 pt-2">
        <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={() => setCursor(day => subWeeks(day, 1))}><ChevronLeft className="h-4 w-4" /></Button>
        <span className="min-w-32 text-center text-sm font-semibold">{format(new Date(week.start + "T12:00:00"), "d MMM", { locale: fr })} – {format(new Date(week.end + "T12:00:00"), "d MMM yyyy", { locale: fr })}</span>
        <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={() => setCursor(day => addWeeks(day, 1))}><ChevronRight className="h-4 w-4" /></Button>
        <Button variant="ghost" size="sm" onClick={() => setCursor(new Date())}>Cette semaine</Button>
        <Button variant="ghost" size="sm" onClick={() => void refresh()}><RefreshCw className="mr-1 h-4 w-4" />Actualiser</Button>
      </div></CardHeader>
      <CardContent className="space-y-3">
        {loading ? <p role="status" className="text-muted-foreground">Chargement des services et disponibilités…</p> : null}
        {unavailable ? <p role="alert" className="text-destructive">Le planning ou les disponibilités sont indisponibles. Actualisez pour réessayer.</p> : null}
        <p className="text-sm text-muted-foreground">Glissez un service vers un jour ou un collaborateur. Le bouton Modifier permet les mêmes changements au clavier.</p>
        <WorkforceWeekGrid days={days} employees={employees} shifts={shifts} absences={absences}
          changing={change.isPending || remove.isPending || loading || unavailable} removing={remove.isPending || change.isPending || loading || unavailable}
          onChange={payload => change.mutate(payload)} onEdit={shift => setDialog({ shift, date: shift.shift_date })}
          onCreate={(employeeId, date) => setDialog({ employeeId, date })}
          onDelete={id => { if (window.confirm("Supprimer ce service ?")) remove.mutate(id); }} />
      </CardContent>
    </Card>
    {dialog ? <WorkforceShiftDialog key={dialog.shift?.id || `${dialog.employeeId || "new"}-${dialog.date}`} restaurantId={restaurantId} employees={employees} absences={absences} shift={dialog.shift} initialEmployeeId={dialog.employeeId} initialDate={dialog.date} onClose={() => setDialog(null)} /> : null}
  </div>;
}
