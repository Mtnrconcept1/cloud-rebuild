import "./WorkforceWeekGrid.css";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Trash2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { employeeName, type WorkforceAbsence, type WorkforceEmployee, type WorkforceShift } from "@/lib/tokWorkforce";

type WorkforceWeekGridProps = {
  days: Date[];
  employees: WorkforceEmployee[];
  shifts: WorkforceShift[];
  absences: WorkforceAbsence[];
  changing: boolean;
  removing: boolean;
  onChange: (change: { id: string; patch: Record<string, string> }) => void;
  onDelete: (id: string) => void;
};

export default function WorkforceWeekGrid({ days, employees, shifts, absences, changing, removing, onChange, onDelete }: WorkforceWeekGridProps) {
  const dayIds = days.map((day) => format(day, "yyyy-MM-dd"));
  const visibleAbsences = absences.filter((absence) => absence.start_date <= dayIds[dayIds.length - 1] && absence.end_date >= dayIds[0]);
  // Keep shifts whose employee record has become unavailable visible, as before.
  const employeeIds = [...new Set([...employees.map((employee) => employee.id), ...shifts.map((shift) => shift.employee_id), ...visibleAbsences.map((absence) => absence.employee_id)])];

  return (
    <div className="tok-workforce-week-scroll" role="region" aria-label="Planning de l’équipe sur sept jours" tabIndex={0}>
      <table className="tok-workforce-week">
        <caption className="sr-only">Planning hebdomadaire par collaborateur. Glissez un service sur un autre jour de la même ligne ou utilisez Décaler +1 j.</caption>
        <thead>
          <tr>
            <th scope="col">Membre</th>
            {days.map((day, index) => <th scope="col" key={dayIds[index]}><span>{format(day, "EEE", { locale: fr })}</span><small>{format(day, "d MMM", { locale: fr })}</small></th>)}
          </tr>
        </thead>
        <tbody>
          {employeeIds.map((rowEmployeeId) => {
            const employee = employees.find((item) => item.id === rowEmployeeId);
            const name = employeeName(employee);
            return (
              <tr key={rowEmployeeId}>
                <th scope="row">
                  <span className="tok-workforce-person"><span aria-hidden="true" className="tok-workforce-initial">{employee?.first_name.slice(0, 1) || "?"}</span><span>{name}<small>{employee?.role === "manager" ? "Responsable" : "Collaborateur"}</small></span></span>
                </th>
                {days.map((day, index) => {
                  const dayId = dayIds[index];
                  const dayShifts = shifts.filter((shift) => shift.employee_id === rowEmployeeId && shift.shift_date === dayId);
                  const dayAbsences = visibleAbsences.filter((absence) => absence.employee_id === rowEmployeeId && absence.start_date <= dayId && absence.end_date >= dayId);
                  return (
                    <td
                      key={dayId}
                      aria-label={`${name}, ${format(day, "EEEE d MMMM", { locale: fr })}`}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        const shiftId = event.dataTransfer.getData("text/tok-workforce-shift");
                        if (!changing && shifts.some((shift) => shift.id === shiftId && shift.employee_id === rowEmployeeId && shift.status !== "cancelled")) {
                          onChange({ id: shiftId, patch: { shift_date: dayId } });
                        }
                      }}
                    >
                      <div className="tok-workforce-day-shifts">
                        {dayShifts.map((shift) => (
                          <div
                            key={shift.id}
                            draggable
                            title="Glisser sur un autre jour"
                            onDragStart={(event) => event.dataTransfer.setData("text/tok-workforce-shift", shift.id)}
                            className="tok-workforce-shift"
                            data-status={shift.status}
                          >
                            <strong>{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</strong>
                            <small>{shift.break_minutes} min pause</small>
                            <div className="tok-workforce-shift-status">
                              <Badge className="text-[10px]" variant={shift.status === "cancelled" ? "destructive" : "secondary"}>{shift.status === "confirmed" ? "Confirmé" : shift.status === "completed" ? "Terminé" : shift.status === "cancelled" ? "Annulé" : "Prévu"}</Badge>
                              <button type="button" disabled={changing} onClick={() => onChange({ id: shift.id, patch: { status: shift.status === "planned" ? "confirmed" : "planned" } })}>{shift.status === "planned" ? "Confirmer" : "Modifier"}</button>
                            </div>
                            <div className="tok-workforce-shift-actions">
                              <button type="button" disabled={changing} onClick={() => onChange({ id: shift.id, patch: { shift_date: format(addDays(day, 1), "yyyy-MM-dd") } })}>Décaler +1 j</button>
                              <button type="button" aria-label="Supprimer le service" className="text-destructive" disabled={removing} onClick={() => onDelete(shift.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            </div>
                          </div>
                        ))}
                        {dayAbsences.map((absence) => <p key={absence.id} className="tok-workforce-absence">Absence</p>)}
                        {!dayShifts.length && !dayAbsences.length ? <span className="tok-workforce-day-empty">—</span> : null}
                      </div>
                    </td>
                  );
                })}
              </tr>
            );
          })}
          {!employeeIds.length ? <tr><td colSpan={8} className="py-8 text-center text-muted-foreground">Aucun collaborateur ni service pour cette semaine.</td></tr> : null}
        </tbody>
      </table>
    </div>
  );
}
