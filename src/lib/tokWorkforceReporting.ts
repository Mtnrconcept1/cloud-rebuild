import {
  csvCell, dateIsValid, employeeName, workforceZurichClock,
  type WorkforceAbsence, type WorkforceEmployee, type WorkforceEntry,
  type WorkforceShift, type WorkforceValidation,
} from "./tokWorkforce";

export type WorkforcePeriod = { start: string; end: string };
export type WorkforceHoliday = { restaurant_id: string; holiday_date: string; name: string };
export type WorkforceClockRecord = {
  restaurant_id: string; employee_id: string; entry_id: string | null;
  clock_in_at: string; clock_out_at: string | null; break_seconds: number;
};
type ContractEmployee = WorkforceEmployee & { started_on?: string | null; ended_on?: string | null };
type VersionedEntry = WorkforceEntry & { version?: number; updated_at?: string };
type VersionedValidation = WorkforceValidation & { entry_version?: number | null };

export type WorkforceTimeSlice = {
  date: string; startTime: string; endTime: string; startInstant: number; endInstant: number;
  grossMinutes: number; breakMinutes: number; workedMinutes: number; nightMinutes: number;
  sundayMinutes: number; source: "clock" | "manual";
};
export type WorkforceReportRecord = WorkforceTimeSlice & {
  entry: WorkforceEntry; validation: WorkforceValidation | null;
};
export type WorkforceAbsenceAllocation = {
  absence: WorkforceAbsence; date: string; days: number;
};
export type WorkforceVacationBalance = {
  year: number; annualDays: number; entitledDays: number; usedDays: number;
  reservedDays: number; remainingDays: number;
};
export type WorkforceEmployeeReport = {
  employee: ContractEmployee; records: WorkforceReportRecord[]; absences: WorkforceAbsenceAllocation[];
  unallocatedAbsences: WorkforceAbsence[];
  plannedMinutes: number; workedMinutes: number; nightMinutes: number; sundayMinutes: number;
  validatedMinutes: number; contractMinutes: number; holidayCreditMinutes: number;
  absenceCreditMinutes: number; expectedMinutes: number; expectedToDateMinutes: number;
  balanceMinutes: number; plannedCostChf: number; workedCostChf: number;
  vacation: WorkforceVacationBalance;
};
export type WorkforceReport = {
  restaurantId: string; period: WorkforcePeriod; asOf: string; validatedOnly: boolean;
  employees: WorkforceEmployeeReport[]; issues: string[];
};
export type WorkforceReportInput = {
  restaurantId: string; period: WorkforcePeriod; employees: ContractEmployee[];
  entries: WorkforceEntry[]; shifts?: WorkforceShift[]; absences?: WorkforceAbsence[];
  validations?: WorkforceValidation[]; holidays?: WorkforceHoliday[];
  clockSessions?: WorkforceClockRecord[]; employeeId?: string; validatedOnly?: boolean; asOf?: string;
};

const MINUTE = 60_000;
const DAY = 86_400_000;
const localFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});
const instantCache = new Map<string, number>();

export const workforceHours = (minutes: number, digits = 1) => (minutes / 60).toFixed(digits);

export function workforceAddDays(date: string, count: number): string {
  if (!dateIsValid(date)) throw new Error("Date invalide.");
  return new Date(Date.parse(date + "T12:00:00Z") + count * DAY).toISOString().slice(0, 10);
}

export function workforceMonthPeriod(month: string): WorkforcePeriod {
  if (!/^\d{4}-\d{2}$/.test(month) || !dateIsValid(month + "-01")) throw new Error("Mois invalide.");
  const date = new Date(month + "-01T12:00:00Z");
  date.setUTCMonth(date.getUTCMonth() + 1);
  return { start: month + "-01", end: workforceAddDays(date.toISOString().slice(0, 10), -1) };
}

export function workforceDates(period: WorkforcePeriod): string[] {
  if (!dateIsValid(period.start) || !dateIsValid(period.end) || period.end < period.start) return [];
  const count = Math.round((Date.parse(period.end + "T12:00:00Z") - Date.parse(period.start + "T12:00:00Z")) / DAY) + 1;
  if (count > 3660) throw new Error("Choisissez une période inférieure à dix ans.");
  return Array.from({ length: count }, (_, index) => workforceAddDays(period.start, index));
}

function clockParts(instant: number) {
  const parts = localFormatter.formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(item => item.type === type)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}:${part("second")}` };
}

function timeSeconds(time: string): number {
  const match = /^(\d{2}):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(time);
  if (!match || Number(match[1]) > 23) throw new Error("Heure invalide.");
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3] || 0) + Number("0." + (match[4] || "0"));
}

/** No arbitrary choice for a repeated/non-existent local time at a DST transition. */
function localInstant(date: string, time: string): number {
  const key = date + "T" + time;
  const cached = instantCache.get(key);
  if (cached != null) return cached;
  if (!dateIsValid(date)) throw new Error("Date invalide.");
  const seconds = timeSeconds(time);
  const naive = Date.parse(date + "T00:00:00Z") + seconds * 1000;
  const offsets = new Set<number>();
  for (const sample of [naive - DAY, naive, naive + DAY]) {
    const parts = clockParts(sample);
    offsets.add(Date.parse(parts.date + "T" + parts.time + "Z") - Math.floor(sample / 1000) * 1000);
  }
  const candidates = [...offsets].map(offset => naive - offset).filter(value => {
    const parts = clockParts(value);
    return parts.date === date && Math.abs(timeSeconds(parts.time) - Math.floor(seconds)) < 1;
  });
  if (!candidates.length) throw new Error("Heure locale inexistante au changement d’heure : relevé à régulariser.");
  if (candidates.length > 1) throw new Error("Heure locale ambiguë au changement d’heure : horodatage serveur nécessaire.");
  if (instantCache.size >= 10_000) instantCache.clear();
  instantCache.set(key, candidates[0]);
  return candidates[0];
}

function intersection(start: number, end: number, rangeStart: number, rangeEnd: number): number {
  return Math.max(0, Math.min(end, rangeEnd) - Math.max(start, rangeStart)) / MINUTE;
}

function validClockSession(entry: WorkforceEntry, session: WorkforceClockRecord): boolean {
  if (!session.clock_out_at || session.entry_id !== entry.id || session.restaurant_id !== entry.restaurant_id || session.employee_id !== entry.employee_id) return false;
  const startInstant = Date.parse(session.clock_in_at), endInstant = Date.parse(session.clock_out_at);
  const start = clockParts(startInstant), end = clockParts(endInstant);
  const localSeconds = (instant: number, time: string) => timeSeconds(time) + ((instant % 1000 + 1000) % 1000) / 1000;
  // A corrected entry must not be silently replaced by its original clock session.
  // Postgres retains microseconds; JavaScript timestamps retain milliseconds.
  return start.date === entry.entry_date && Math.abs(localSeconds(startInstant, start.time) - timeSeconds(entry.start_time)) < 0.001
    && Math.abs(localSeconds(endInstant, end.time) - timeSeconds(entry.end_time)) < 0.001
    && Math.ceil(Number(session.break_seconds) / 60) === Number(entry.break_minutes);
}

export function workforceTimeSlices(
  date: string, startTime: string, endTime: string, breakMinutes: number,
  clock?: WorkforceClockRecord,
): WorkforceTimeSlice[] {
  let start: number, end: number;
  if (clock?.clock_out_at) {
    start = Date.parse(clock.clock_in_at); end = Date.parse(clock.clock_out_at);
    breakMinutes = Number(clock.break_seconds) / 60;
  } else {
    const first = timeSeconds(startTime), last = timeSeconds(endTime);
    if (first === last) throw new Error("Début et fin identiques : durée indéterminée.");
    start = localInstant(date, startTime);
    end = localInstant(last < first ? workforceAddDays(date, 1) : date, endTime);
  }
  const gross = (end - start) / MINUTE;
  if (!Number.isFinite(gross) || gross <= 0 || gross > 48 * 60 || !Number.isFinite(breakMinutes) || breakMinutes < 0 || breakMinutes >= gross) {
    throw new Error("Durée ou pause invalide : relevé à régulariser.");
  }
  const breakRatio = breakMinutes / gross;
  const dates = workforceDates({ start: clockParts(start).date, end: clockParts(end - 1).date });
  return dates.map(day => {
    const midnight = localInstant(day, "00:00"), nextMidnight = localInstant(workforceAddDays(day, 1), "00:00");
    const segmentStart = Math.max(start, midnight), segmentEnd = Math.min(end, nextMidnight);
    const minutes = (segmentEnd - segmentStart) / MINUTE;
    const net = minutes * (1 - breakRatio);
    const night = intersection(segmentStart, segmentEnd, midnight, localInstant(day, "06:00"))
      + intersection(segmentStart, segmentEnd, localInstant(day, "23:00"), nextMidnight);
    return {
      date: day, startTime: clockParts(segmentStart).time.slice(0, 5),
      endTime: segmentEnd === nextMidnight ? "24:00" : clockParts(segmentEnd).time.slice(0, 5),
      startInstant: segmentStart, endInstant: segmentEnd, grossMinutes: minutes,
      breakMinutes: minutes * breakRatio, workedMinutes: net, nightMinutes: night * (1 - breakRatio),
      sundayMinutes: new Date(day + "T12:00:00Z").getUTCDay() === 0 ? net : 0,
      source: clock ? "clock" : "manual",
    };
  });
}

/** Exact elapsed clock time when unchanged; otherwise the corrected local entry. */
export function workforceEntryTimeSlices(entry: WorkforceEntry, clockSessions: WorkforceClockRecord[] = []): WorkforceTimeSlice[] {
  const clock = clockSessions.find(session => validClockSession(entry, session));
  return workforceTimeSlices(entry.entry_date, entry.start_time, entry.end_time, Number(entry.break_minutes), clock);
}

export function workforceCurrentValidation(entry: VersionedEntry, validations: VersionedValidation[]): WorkforceValidation | null {
  return validations.filter(validation => {
    if (validation.restaurant_id !== entry.restaurant_id || validation.time_entry_id !== entry.id) return false;
    if (validation.entry_version != null) return entry.version != null && validation.entry_version === entry.version;
    // Legacy signatures have no snapshot/hash. Keep them distinguishable and
    // accept only an initial entry demonstrably unchanged since it was signed.
    if (entry.version != null && entry.version !== 1) return false;
    const updatedAt = Date.parse(entry.updated_at || ""), signedAt = Date.parse(validation.signed_at);
    return Number.isFinite(updatedAt) && Number.isFinite(signedAt) && signedAt >= updatedAt;
  }).sort((a, b) => b.signed_at.localeCompare(a.signed_at))[0] || null;
}

function isWeekday(date: string) {
  const day = new Date(date + "T12:00:00Z").getUTCDay();
  return day !== 0 && day !== 6;
}

export function workforceAbsenceDates(start: string, end: string, holidays: WorkforceHoliday[], restaurantId: string, includeHolidays = false): string[] {
  const holidayDates = new Set(holidays.filter(day => day.restaurant_id === restaurantId).map(day => day.holiday_date));
  return workforceDates({ start, end }).filter(date => isWeekday(date) && (includeHolidays || !holidayDates.has(date)));
}

export function workforceAllocateAbsence(absence: WorkforceAbsence, holidays: WorkforceHoliday[] = []): WorkforceAbsenceAllocation[] {
  // A holiday absence represents the holiday itself, and therefore is not removed here.
  const days = workforceAbsenceDates(absence.start_date, absence.end_date, holidays, absence.restaurant_id, absence.absence_type === "holiday");
  const count = Number(absence.days_count);
  if (!days.length || !Number.isFinite(count) || count <= 0) return [];
  return days.map(date => ({ absence, date, days: count / days.length }));
}

function employedOn(employee: ContractEmployee, date: string) {
  return (!employee.started_on || date >= employee.started_on) && (!employee.ended_on || date <= employee.ended_on);
}

export function workforceVacationBalance(
  employee: ContractEmployee, absences: WorkforceAbsence[], holidays: WorkforceHoliday[], year: number,
  asOf = workforceZurichClock().date,
): WorkforceVacationBalance {
  const yearDays = workforceDates({ start: `${year}-01-01`, end: `${year}-12-31` });
  const employedDays = yearDays.filter(date => employedOn(employee, date)).length;
  const annualDays = Number(employee.vacation_days_per_year) || 0;
  const entitledDays = annualDays * employedDays / yearDays.length;
  const allocations = absences.filter(absence => absence.restaurant_id === employee.restaurant_id && absence.employee_id === employee.id && absence.absence_type === "vacation")
    .flatMap(absence => workforceAllocateAbsence(absence, holidays)).filter(item => item.date.startsWith(String(year) + "-"));
  const usedDays = allocations.filter(item => item.date <= asOf).reduce((sum, item) => sum + item.days, 0);
  const reservedDays = allocations.filter(item => item.date > asOf).reduce((sum, item) => sum + item.days, 0);
  return { year, annualDays, entitledDays, usedDays, reservedDays, remainingDays: entitledDays - usedDays - reservedDays };
}

function contractForPeriod(employee: ContractEmployee, period: WorkforcePeriod, allocations: WorkforceAbsenceAllocation[], holidays: WorkforceHoliday[]) {
  const holidayDates = new Set(holidays.filter(day => day.restaurant_id === employee.restaurant_id).map(day => day.holiday_date));
  const dayMinutes = Number(employee.contracted_hours_per_week) * 60 / 5;
  const credits = new Map<string, number>();
  for (const item of allocations) {
    if (item.absence.absence_type !== "other") credits.set(item.date, (credits.get(item.date) || 0) + item.days);
  }
  let contractMinutes = 0, holidayCreditMinutes = 0, absenceCreditMinutes = 0;
  for (const date of workforceDates(period)) {
    if (!isWeekday(date) || !employedOn(employee, date)) continue;
    contractMinutes += dayMinutes;
    if (holidayDates.has(date)) holidayCreditMinutes += dayMinutes;
    else absenceCreditMinutes += Math.min(1, credits.get(date) || 0) * dayMinutes;
  }
  return { contractMinutes, holidayCreditMinutes, absenceCreditMinutes, expectedMinutes: Math.max(0, contractMinutes - holidayCreditMinutes - absenceCreditMinutes) };
}

export function buildWorkforceReport(input: WorkforceReportInput): WorkforceReport {
  const { restaurantId, period } = input;
  if (!workforceDates(period).length) throw new Error("Période de rapport invalide.");
  const asOf = input.asOf || workforceZurichClock().date;
  const issues: string[] = [];
  const validations = input.validations || [], holidays = input.holidays || [];
  const clockSessionsByEntry = new Map<string, WorkforceClockRecord[]>();
  for (const session of input.clockSessions || []) {
    if (!session.entry_id || session.restaurant_id !== restaurantId) continue;
    clockSessionsByEntry.set(session.entry_id, [...(clockSessionsByEntry.get(session.entry_id) || []), session]);
  }
  const validationsByEntry = new Map<string, WorkforceValidation[]>();
  for (const validation of validations) {
    if (validation.restaurant_id !== restaurantId) continue;
    validationsByEntry.set(validation.time_entry_id, [...(validationsByEntry.get(validation.time_entry_id) || []), validation]);
  }
  const queryStart = workforceAddDays(period.start, -1);
  const employees = input.employees.filter(employee => employee.restaurant_id === restaurantId && (!input.employeeId || employee.id === input.employeeId));
  const reports = employees.map(employee => {
    const records: WorkforceReportRecord[] = [];
    const employeeEntries = input.entries.filter(entry => entry.restaurant_id === restaurantId && entry.employee_id === employee.id);
    for (const entry of employeeEntries) {
      if (entry.entry_date < queryStart || entry.entry_date > period.end) continue;
      const validation = workforceCurrentValidation(entry, validationsByEntry.get(entry.id) || []);
      if (input.validatedOnly && !validation) continue;
      try {
        for (const slice of workforceEntryTimeSlices(entry, clockSessionsByEntry.get(entry.id))) {
          if (slice.date >= period.start && slice.date <= period.end) records.push({ ...slice, entry, validation });
        }
      } catch (error) {
        if (entry.entry_date >= queryStart && entry.entry_date <= period.end) {
          issues.push(`${employeeName(employee)}, ${entry.entry_date} : ${error instanceof Error ? error.message : "Durée indisponible."}`);
        }
      }
    }
    records.sort((a, b) => a.startInstant - b.startInstant || a.entry.id.localeCompare(b.entry.id));
    let plannedMinutes = 0;
    for (const shift of input.shifts || []) {
      if (shift.restaurant_id !== restaurantId || shift.employee_id !== employee.id || shift.status === "cancelled") continue;
      if (shift.shift_date < queryStart || shift.shift_date > period.end) continue;
      try {
        plannedMinutes += workforceTimeSlices(shift.shift_date, shift.start_time, shift.end_time, Number(shift.break_minutes))
          .filter(slice => slice.date >= period.start && slice.date <= period.end).reduce((sum, slice) => sum + slice.workedMinutes, 0);
      } catch (error) {
        if (shift.shift_date >= queryStart && shift.shift_date <= period.end) {
          issues.push(`Planning ${employeeName(employee)}, ${shift.shift_date} : ${error instanceof Error ? error.message : "Durée indisponible."}`);
        }
      }
    }
    const employeeAbsences = (input.absences || []).filter(absence => absence.restaurant_id === restaurantId && absence.employee_id === employee.id);
    const allocations = employeeAbsences.flatMap(absence => workforceAllocateAbsence(absence, holidays));
    const allocatedIds = new Set(allocations.map(item => item.absence.id));
    const vacationYear = Number(period.end.slice(0, 4));
    const unallocatedAbsences = employeeAbsences.filter(absence => !allocatedIds.has(absence.id)
      && (absence.start_date <= period.end && absence.end_date >= period.start
        || absence.absence_type === "vacation" && absence.start_date <= `${vacationYear}-12-31` && absence.end_date >= `${vacationYear}-01-01`));
    for (const absence of unallocatedAbsences) {
      issues.push(`Absence ${employeeName(employee)}, ${absence.start_date}–${absence.end_date} : aucun jour ouvré imputable hors fériés. Vérifiez les dates et le décompte avec le responsable.`);
    }
    const absences = allocations.filter(item => item.date >= period.start && item.date <= period.end);
    const contract = contractForPeriod(employee, period, allocations, holidays);
    const expectedToDateMinutes = asOf < period.start ? 0 : contractForPeriod(employee, { start: period.start, end: asOf < period.end ? asOf : period.end }, allocations, holidays).expectedMinutes;
    const workedMinutes = records.reduce((sum, row) => sum + row.workedMinutes, 0);
    const workedToDate = records.filter(row => row.date <= asOf).reduce((sum, row) => sum + row.workedMinutes, 0);
    return {
      employee, records, absences, unallocatedAbsences, plannedMinutes, workedMinutes,
      nightMinutes: records.reduce((sum, row) => sum + row.nightMinutes, 0),
      sundayMinutes: records.reduce((sum, row) => sum + row.sundayMinutes, 0),
      validatedMinutes: records.filter(row => row.validation).reduce((sum, row) => sum + row.workedMinutes, 0),
      ...contract, expectedToDateMinutes, balanceMinutes: workedToDate - expectedToDateMinutes,
      plannedCostChf: plannedMinutes / 60 * Number(employee.hourly_cost_chf || 0),
      workedCostChf: workedMinutes / 60 * Number(employee.hourly_cost_chf || 0),
      vacation: workforceVacationBalance(employee, employeeAbsences, holidays, Number(period.end.slice(0, 4)), asOf),
    };
  });
  return { restaurantId, period, asOf, validatedOnly: !!input.validatedOnly, employees: reports, issues: [...new Set(issues)] };
}

export function workforceReportTotals(report: WorkforceReport) {
  return report.employees.reduce((total, row) => ({
    workedMinutes: total.workedMinutes + row.workedMinutes, plannedMinutes: total.plannedMinutes + row.plannedMinutes,
    nightMinutes: total.nightMinutes + row.nightMinutes, sundayMinutes: total.sundayMinutes + row.sundayMinutes,
    validatedMinutes: total.validatedMinutes + row.validatedMinutes, balanceMinutes: total.balanceMinutes + row.balanceMinutes,
    expectedMinutes: total.expectedMinutes + row.expectedMinutes,
    plannedCostChf: total.plannedCostChf + row.plannedCostChf, workedCostChf: total.workedCostChf + row.workedCostChf,
  }), { workedMinutes: 0, plannedMinutes: 0, nightMinutes: 0, sundayMinutes: 0, validatedMinutes: 0, balanceMinutes: 0, expectedMinutes: 0, plannedCostChf: 0, workedCostChf: 0 });
}

export const WORKFORCE_CALCULATION_NOTE = "Base contractuelle : heures hebdomadaires réparties du lundi au vendredi, bornées par les dates du contrat. Vacances, maladie et fériés crédités, autres absences non créditées. Les pauses sont réparties au prorata sur les plages travaillées faute d’horaires de pause détaillés. Nuit : 23 h–6 h, fuseau Europe/Zurich. Le solde compare les heures et le contrat jusqu’à la date du jour ; il reste provisoire tant que les relevés ne sont pas validés.";

export function workforceReportCsv(report: WorkforceReport): string {
  if (report.issues.length) throw new Error("Corrigez les anomalies du rapport avant de l’exporter.");
  const headers = ["Type", "Collaborateur", "Du", "Au", "Date", "Début", "Fin", "Pause min", "Réalisé h", "Nuit h", "Dimanche h", "Prévu h", "Contrat brut h", "Crédit fériés h", "Crédit absences h", "Attendu h", "Attendu à date h", "Solde à date h", "Vacances droit proratisé j", "Vacances prises j", "Vacances réservées j", "Vacances disponibles j", "Coût prévu CHF", "Coût réalisé CHF", "Validé", "Signataire", "Signé le", "Source", "Référence", "Notes", "Version du relevé", "Version signée", "Empreinte SHA-256", "Début du relevé original", "Fin du relevé original"];
  const rows: unknown[][] = [headers];
  for (const employee of report.employees) {
    const base = [employeeName(employee.employee), report.period.start, report.period.end];
    rows.push(["Synthèse", ...base, "", "", "", "", workforceHours(employee.workedMinutes, 4), workforceHours(employee.nightMinutes, 4), workforceHours(employee.sundayMinutes, 4), workforceHours(employee.plannedMinutes, 4), workforceHours(employee.contractMinutes, 4), workforceHours(employee.holidayCreditMinutes, 4), workforceHours(employee.absenceCreditMinutes, 4), workforceHours(employee.expectedMinutes, 4), workforceHours(employee.expectedToDateMinutes, 4), workforceHours(employee.balanceMinutes, 4), employee.vacation.entitledDays.toFixed(4), employee.vacation.usedDays.toFixed(4), employee.vacation.reservedDays.toFixed(4), employee.vacation.remainingDays.toFixed(4), employee.plannedCostChf.toFixed(2), employee.workedCostChf.toFixed(2), "", "", "", "", employee.employee.id, WORKFORCE_CALCULATION_NOTE, "", "", "", "", ""]);
    for (const record of employee.records) rows.push(["Relevé", ...base, record.date, record.startTime, record.endTime, record.breakMinutes.toFixed(4), workforceHours(record.workedMinutes, 4), workforceHours(record.nightMinutes, 4), workforceHours(record.sundayMinutes, 4), ...Array(13).fill(""), record.validation ? record.validation.entry_version == null ? "Signature historique" : "Oui" : "Non", record.validation?.signed_name || "", record.validation?.signed_at || "", record.source === "clock" ? "Horodatage serveur" : "Saisie locale", record.entry.id, record.entry.notes || "", record.entry.version ?? "", record.validation?.entry_version ?? "", record.validation?.entry_hash || "", record.entry.start_time, record.entry.end_time]);
    for (const absence of employee.absences) rows.push(["Absence", ...base, absence.date, ...Array(23).fill(""), absence.absence.id, `${absence.absence.absence_type} : ${absence.days.toFixed(4)} jour(s). ${absence.absence.notes || ""}`, "", "", "", "", ""]);
  }
  return "\uFEFF" + rows.map(row => row.map(csvCell).join(";")).join("\r\n");
}

export type WorkforceLoadIndicator = {
  score: number | null; coverageScore: number; restScore: number; actualScore: number;
  coverageRatio: number | null; restViolations: number; restIntervals: number; overlaps: number;
};

/** Operational coverage/recovery indicator, never a health or performance inference. */
export function workforceLoadIndicator(report: WorkforceEmployeeReport, shifts: WorkforceShift[], period: WorkforcePeriod): WorkforceLoadIndicator {
  const queryStart = workforceAddDays(period.start, -1);
  const intervals = shifts.filter(shift => shift.restaurant_id === report.employee.restaurant_id && shift.employee_id === report.employee.id && shift.status !== "cancelled" && shift.shift_date >= queryStart && shift.shift_date <= period.end)
    .flatMap(shift => {
      try {
        const parts = workforceTimeSlices(shift.shift_date, shift.start_time, shift.end_time, Number(shift.break_minutes));
        return [{ date: shift.shift_date, start: parts[0].startInstant, end: parts[parts.length - 1].endInstant }];
      } catch { return []; }
    }).sort((a, b) => a.start - b.start);
  let restViolations = 0, restIntervals = 0, overlaps = 0;
  let previous: typeof intervals[number] | undefined;
  for (const interval of intervals) {
    if (previous && interval.date >= period.start && interval.date <= period.end) {
      if (interval.start < previous.end) overlaps++;
      // Split services within one working day are not treated as two daily rest periods.
      else if (interval.date > previous.date) { restIntervals++; if (interval.start - previous.end < 11 * 60 * MINUTE) restViolations++; }
    }
    previous = previous && interval.end <= previous.end ? previous : interval;
  }
  const coverageRatio = report.expectedMinutes > 0 ? report.plannedMinutes / report.expectedMinutes : null;
  const coverageScore = coverageRatio == null ? (report.plannedMinutes ? 0 : 100) : Math.max(0, 100 - Math.abs(1 - coverageRatio) * 100);
  const restScore = overlaps ? 0 : restIntervals ? 100 * (1 - restViolations / restIntervals) : 100;
  const actualScore = report.expectedToDateMinutes > 0 ? Math.max(0, 100 - Math.abs(report.balanceMinutes) / report.expectedToDateMinutes * 100) : 100;
  const score = report.plannedMinutes || report.workedMinutes ? Math.round(coverageScore * 0.4 + restScore * 0.4 + actualScore * 0.2) : null;
  return { score, coverageScore, restScore, actualScore, coverageRatio, restViolations, restIntervals, overlaps };
}
