import { dateIsValid, minutesFromTime, type WorkforceAbsence, type WorkforceEmployee, type WorkforceShift } from "@/lib/tokWorkforce";

/** Immediate availability feedback; the database remains authoritative for conflicts. */
export function shiftAvailabilityIssue(
  shift: Pick<WorkforceShift, "employee_id" | "shift_date" | "start_time" | "end_time" | "status">,
  employees: WorkforceEmployee[], absences: WorkforceAbsence[],
): string | null {
  const employee = employees.find(person => person.id === shift.employee_id);
  if (!employee?.is_active) return "Choisissez un collaborateur actif.";
  if (!dateIsValid(shift.shift_date)) return "Date invalide.";
  if (shift.status === "cancelled") return null;
  const nextDay = new Date(shift.shift_date + "T12:00:00Z");
  const endMinute = minutesFromTime(shift.end_time);
  // An end at midnight does not occupy the following day's absence interval.
  if (endMinute > 0 && endMinute < minutesFromTime(shift.start_time)) nextDay.setUTCDate(nextDay.getUTCDate() + 1);
  const endDate = nextDay.toISOString().slice(0, 10);
  if ((employee.started_on && shift.shift_date < employee.started_on) || (employee.ended_on && endDate > employee.ended_on)) return "Ce service est en dehors des dates du contrat.";
  if (absences.some(absence => absence.employee_id === employee.id && absence.restaurant_id === employee.restaurant_id && absence.start_date <= endDate && absence.end_date >= shift.shift_date)) return "Une absence recoupe ce service. Choisissez un autre jour ou un autre collaborateur.";
  return null;
}
