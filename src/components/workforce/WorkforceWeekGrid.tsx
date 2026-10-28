import "./WorkforceWeekGrid.css";
import { addDays, format } from "date-fns";
import { fr } from "date-fns/locale";
import { Plus, Trash2 } from "lucide-react";

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
  onEdit?: (shift: WorkforceShift) => void;
  onCreate?: (employeeId: string, date: string) => void;
};

const absenceLabels = { vacation: "Vacances", sick: "Maladie", holiday: "Jour férié", other: "Autre absence" };

export default function WorkforceWeekGrid({ days, employees, shifts, absences, changing, removing, onChange, onDelete, onEdit, onCreate }: WorkforceWeekGridProps) {
  const dayIds = days.map((day) => format(day, "yyyy-MM-dd"));
  const visibleAbsences = absences.filter((absence) => absence.start_date <= dayIds[dayIds.length - 1] && absence.end_date >= dayIds[0]);
  // Keep shifts whose employee record has become unavailable visible, as before.
  const employeeIds = [...new Set([...employees.map((employee) => employee.id), ...shifts.map((shift) => shift.employee_id), ...visibleAbsences.map((absence) => absence.employee_id)])];

  return (
    <div className="tok-workforce-week-scroll" role="region" aria-label="Planning de l’équipe sur sept jours" tabIndex={0}>
      <table className="tok-workforce-week">
        <caption className="sr-only">Planning hebdomadaire par collaborateur. Glissez un service vers un jour ou un collaborateur, ou utilisez Modifier pour changer l’affectation au clavier.</caption>
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
                        const source = shifts.find(shift => shift.id === shiftId);
                        if (!changing && employee?.is_active && source && source.status !== "cancelled" && source.restaurant_id === employee.restaurant_id && (source.employee_id !== rowEmployeeId || source.shift_date !== dayId)) {
                          onChange({ id: shiftId, patch: { shift_date: dayId, employee_id: rowEmployeeId } });
                        }
                      }}
                    >
                      <div className="tok-workforce-day-shifts">
                        {dayShifts.map((shift) => (
                          <div
                            key={shift.id}
                            draggable={!changing && shift.status !== "cancelled"}
                            title="Glisser vers un autre jour ou collaborateur"
                            onDragStart={(event) => event.dataTransfer.setData("text/tok-workforce-shift", shift.id)}
                            className="tok-workforce-shift"
                            data-status={shift.status}
                          >
                            <strong>{shift.start_time.slice(0, 5)} – {shift.end_time.slice(0, 5)}</strong>
                            <small>{shift.break_minutes} min pause</small>
                            {shift.notes ? <p className="tok-workforce-shift-notes">{shift.notes}</p> : null}
                            <div className="tok-workforce-shift-status">
                              <Badge className="text-[10px]" variant={shift.status === "cancelled" ? "destructive" : "secondary"}>{shift.status === "confirmed" ? "Confirmé" : shift.status === "completed" ? "Terminé" : shift.status === "cancelled" ? "Annulé" : "Prévu"}</Badge>
                              {shift.status === "planned" ? <button type="button" disabled={changing} onClick={() => onChange({ id: shift.id, patch: { status: "confirmed" } })}>Confirmer</button> : null}
                            </div>
                            <div className="tok-workforce-shift-actions">
                              {onEdit ? <button type="button" disabled={changing} aria-label={`Modifier le service de ${name} du ${dayId}`} onClick={() => onEdit(shift)}>Modifier</button> : null}
                              <button type="button" disabled={changing} onClick={() => onChange({ id: shift.id, patch: { shift_date: format(addDays(day, 1), "yyyy-MM-dd") } })}>Décaler +1 j</button>
                              <button type="button" aria-label="Supprimer le service" className="text-destructive" disabled={removing} onClick={() => onDelete(shift.id)}><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /></button>
                            </div>
                          </div>
                        ))}
                        {dayAbsences.map(absence => <div key={absence.id} className="tok-workforce-absence" data-type={absence.absence_type}><strong>{absenceLabels[absence.absence_type]}</strong>{absence.notes ? <p className="mt-1 break-words">{absence.notes}</p> : null}</div>)}
                        {dayAbsences.length > 0 && dayShifts.some(shift => shift.status !== "cancelled") ? <p className="text-xs font-semibold text-destructive" role="status">Conflit : service pendant une absence</p> : null}
                        {onCreate && employee?.is_active ? <button type="button" className="tok-workforce-add-shift" disabled={changing || dayAbsences.length > 0} aria-label={`Ajouter un service pour ${name} le ${dayId}`} onClick={() => onCreate(rowEmployeeId, dayId)}><Plus className="h-3.5 w-3.5" aria-hidden="true" />Ajouter</button> : null}
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
