import { describe, expect, it } from "vitest";
import {
  buildWorkforceReport, workforceAllocateAbsence, workforceCurrentValidation,
  workforceLoadIndicator, workforceMonthPeriod, workforceReportCsv,
  workforceTimeSlices, workforceVacationBalance,
} from "@/lib/tokWorkforceReporting";
import type { WorkforceEmployee, WorkforceEntry, WorkforceAbsence, WorkforceValidation, WorkforceShift } from "@/lib/tokWorkforce";

const employee: WorkforceEmployee = {
  id: "employee", restaurant_id: "restaurant", first_name: "Émilie", last_name: "Martin", email: null,
  user_id: "user", role: "employee", contracted_hours_per_week: 42, vacation_days_per_year: 20,
  hourly_cost_chf: 35, is_active: true,
};
const entry = (patch: Partial<WorkforceEntry> = {}): WorkforceEntry => ({
  id: "entry", restaurant_id: "restaurant", employee_id: "employee", entry_date: "2026-10-12",
  start_time: "09:00", end_time: "17:00", break_minutes: 30, notes: null,
  is_night_work: false, is_sunday_work: false, updated_at: "2026-10-12T18:00:00Z", ...patch,
});
const absence = (patch: Partial<WorkforceAbsence> = {}): WorkforceAbsence => ({
  id: "absence", restaurant_id: "restaurant", employee_id: "employee", absence_type: "vacation",
  start_date: "2026-10-14", end_date: "2026-10-14", days_count: 1, notes: null, ...patch,
});
const period = { start: "2026-10-12", end: "2026-10-18" };
const validation: WorkforceValidation = { id: "validation", restaurant_id: "restaurant", time_entry_id: "entry", signed_name: "Manager", signed_at: "2026-10-13T09:00:00Z" };

describe("TOK Équipe — calculs communs et rapports", () => {
  it("conserve les minutes et répartit proportionnellement les pauses, la nuit et le dimanche", () => {
    const slices = workforceTimeSlices("2026-10-17", "22:00", "02:00", 30);
    expect(slices.map(slice => slice.date)).toEqual(["2026-10-17", "2026-10-18"]);
    expect(slices.reduce((sum, slice) => sum + slice.workedMinutes, 0)).toBe(210);
    expect(slices.reduce((sum, slice) => sum + slice.nightMinutes, 0)).toBe(157.5);
    expect(slices.reduce((sum, slice) => sum + slice.sundayMinutes, 0)).toBe(105);
    expect(workforceTimeSlices("2026-10-12", "09:10", "17:25", 25)[0].workedMinutes).toBe(470);
  });

  it("respecte le changement d’heure suisse et refuse de choisir une occurrence ambiguë", () => {
    expect(workforceTimeSlices("2026-03-29", "00:00", "04:00", 0)[0].workedMinutes).toBe(180);
    expect(workforceTimeSlices("2026-10-25", "00:00", "04:00", 0)[0].workedMinutes).toBe(300);
    expect(() => workforceTimeSlices("2026-10-25", "02:30", "04:00", 0)).toThrow(/ambiguë/);
    expect(() => workforceTimeSlices("2026-03-29", "02:30", "04:00", 0)).toThrow(/inexistante/);
  });

  it("utilise l’horodatage de badgeuse exact mais respecte ensuite une correction manuelle", () => {
    const punched = entry({ entry_date: "2026-10-25", start_time: "02:30", end_time: "04:00", break_minutes: 1 });
    const input = {
      restaurantId: "restaurant", period: { start: "2026-10-25", end: "2026-10-25" }, employees: [employee], entries: [punched],
      clockSessions: [{ restaurant_id: "restaurant", employee_id: "employee", entry_id: "entry", clock_in_at: "2026-10-25T00:30:00Z", clock_out_at: "2026-10-25T03:00:00Z", break_seconds: 30 }],
      asOf: "2026-10-26",
    };
    const report = buildWorkforceReport(input);
    expect(report.issues).toEqual([]);
    expect(report.employees[0].workedMinutes).toBe(149.5);
    expect(report.employees[0].records[0].source).toBe("clock");
    const corrected = buildWorkforceReport({ ...input, entries: [{ ...punched, start_time: "03:00", break_minutes: 0 }] });
    expect(corrected.employees[0].workedMinutes).toBe(60);
    expect(corrected.employees[0].records[0].source).toBe("manual");
  });

  it("ventile un service de fin de mois et garde plusieurs relevés du même jour", () => {
    const report = buildWorkforceReport({
      restaurantId: "restaurant", period: workforceMonthPeriod("2026-11"), employees: [employee], asOf: "2026-11-30",
      entries: [entry({ entry_date: "2026-10-31", start_time: "22:00", end_time: "02:00", break_minutes: 0 }),
        entry({ id: "lunch", entry_date: "2026-11-01", start_time: "11:00", end_time: "14:00", break_minutes: 0 }),
        entry({ id: "dinner", entry_date: "2026-11-01", start_time: "18:00", end_time: "22:00", break_minutes: 0 })],
    });
    expect(report.employees[0].records).toHaveLength(3);
    expect(report.employees[0].workedMinutes).toBe(540);
    expect(report.employees[0].sundayMinutes).toBe(540);
  });

  it("respecte une correction d’une seconde et tolère seulement la précision milliseconde du stockage JS", () => {
    const punched = entry({ start_time: "09:00:12.123456", end_time: "17:00:08.654321", break_minutes: 1 });
    const input = { restaurantId: "restaurant", period, employees: [employee], entries: [punched],
      clockSessions: [{ restaurant_id: "restaurant", employee_id: "employee", entry_id: "entry", clock_in_at: "2026-10-12T07:00:12.123456Z", clock_out_at: "2026-10-12T15:00:08.654321Z", break_seconds: 30 }] };
    expect(buildWorkforceReport(input).employees[0].records[0].source).toBe("clock");
    const corrected = buildWorkforceReport({ ...input, entries: [{ ...punched, end_time: "17:00:09.654321" }] });
    expect(corrected.employees[0].records[0].source).toBe("manual");
    expect(corrected.employees[0].workedMinutes).toBeCloseTo((8 * 3600 - 2.469135 - 60) / 60, 5);
  });

  it("borne le contrat aux dates d’emploi et crédite une seule fois les absences et fériés", () => {
    const result = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [{ ...employee, started_on: "2026-10-14", ended_on: "2026-10-16" }], entries: [],
      holidays: [{ restaurant_id: "restaurant", holiday_date: "2026-10-15", name: "Férié" }],
      absences: [absence(), absence({ id: "duplicate", absence_type: "sick" }), absence({ id: "holiday-overlap", start_date: "2026-10-15", end_date: "2026-10-15" })], asOf: "2026-10-18" }).employees[0];
    expect(result.contractMinutes).toBe(1512);
    expect(result.holidayCreditMinutes).toBe(504);
    expect(result.absenceCreditMinutes).toBe(504);
    expect(result.expectedMinutes).toBe(504);
  });

  it("n’ajoute pas les jours futurs au déficit du contrat", () => {
    const result = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee], entries: [entry()], asOf: "2026-10-12" }).employees[0];
    expect(result.expectedMinutes).toBe(2520);
    expect(result.expectedToDateMinutes).toBe(504);
    expect(result.balanceMinutes).toBe(-54);
  });

  it("ne crée aucun attendu ni droit aux vacances hors des années du contrat", () => {
    for (const dates of [{ started_on: "2027-01-01" }, { ended_on: "2025-12-31" }]) {
      const result = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [{ ...employee, ...dates }], entries: [], asOf: "2026-10-18" }).employees[0];
      expect(result.expectedMinutes).toBe(0);
      expect(result.expectedToDateMinutes).toBe(0);
      expect(result.vacation.entitledDays).toBe(0);
      expect(result.balanceMinutes).toBe(0);
    }
  });

  it("signale les absences sans jours ouvrés imputables et empêche un export trompeur", () => {
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee], entries: [],
      absences: [absence({ start_date: "2026-10-17", end_date: "2026-10-18", days_count: 2 })] });
    expect(report.issues[0]).toContain("aucun jour ouvré imputable");
    expect(report.employees[0].unallocatedAbsences).toHaveLength(1);
    expect(() => workforceReportCsv(report)).toThrow(/anomalies/);
  });

  it("ventile les congés entre années, sépare pris/réservé et prorate le droit au contrat", () => {
    const crossing = absence({ start_date: "2026-12-31", end_date: "2027-01-04", days_count: 3 });
    expect(workforceAllocateAbsence(crossing).map(item => [item.date, item.days])).toEqual([["2026-12-31", 1], ["2027-01-01", 1], ["2027-01-04", 1]]);
    expect(workforceVacationBalance(employee, [crossing], [], 2026, "2026-10-28")).toMatchObject({ usedDays: 0, reservedDays: 1, remainingDays: 19 });
    expect(workforceVacationBalance(employee, [crossing], [], 2027, "2027-01-02")).toMatchObject({ usedDays: 1, reservedDays: 1, remainingDays: 18 });
    expect(workforceVacationBalance({ ...employee, started_on: "2026-12-31" }, [], [], 2026).entitledDays).toBeCloseTo(20 / 365);
  });

  it("lie la preuve de validation à la version du relevé", () => {
    expect(workforceCurrentValidation({ ...entry(), version: 2 }, [{ ...validation, entry_version: 1 }])).toBeNull();
    expect(workforceCurrentValidation({ ...entry(), version: 2 }, [{ ...validation, entry_version: 2 }])?.id).toBe("validation");
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee], entries: [{ ...entry(), version: 2 }], validations: [{ ...validation, entry_version: 1 }], validatedOnly: true });
    expect(report.employees[0].workedMinutes).toBe(0);
  });

  it("préserve séparément les signatures historiques uniquement si le relevé initial est inchangé", () => {
    expect(workforceCurrentValidation(entry({ version: 1 }), [validation])?.id).toBe("validation");
    expect(workforceCurrentValidation(entry({ version: 2 }), [validation])).toBeNull();
    expect(workforceCurrentValidation(entry({ version: 1, updated_at: "2026-10-14T12:00:00Z" }), [validation])).toBeNull();
    expect(workforceCurrentValidation(entry({ version: 1, updated_at: undefined }), [validation])).toBeNull();
    expect(workforceCurrentValidation(entry({ version: 1, updated_at: "invalid" }), [validation])).toBeNull();
  });

  it("ne mélange pas les restaurants, même avec des identifiants injectés dans les données", () => {
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee, { ...employee, id: "other", restaurant_id: "other-restaurant" }],
      entries: [entry(), entry({ id: "foreign", restaurant_id: "other-restaurant" })],
      absences: [absence({ restaurant_id: "other-restaurant" })], validations: [{ ...validation, restaurant_id: "other-restaurant" }], asOf: "2026-10-18" });
    expect(report.employees).toHaveLength(1);
    expect(report.employees[0].records).toHaveLength(1);
    expect(report.employees[0].validatedMinutes).toBe(0);
    expect(report.employees[0].vacation.remainingDays).toBe(20);
  });

  it("signale une durée impossible plutôt que d’annoncer un rapport complet", () => {
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee], entries: [entry({ end_time: "09:00" })] });
    expect(report.issues).toHaveLength(1);
    expect(report.issues[0]).toContain("durée indéterminée");
  });

  it("exporte la synthèse, chaque relevé et les absences dans un CSV échappé cohérent", () => {
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [{ ...employee, first_name: "=HYPERLINK(1)" }],
      entries: [entry({ notes: 'Texte; avec "guillemets"' })], absences: [absence()], validations: [validation], asOf: "2026-10-18" });
    const csv = workforceReportCsv(report);
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(csv).toContain("'=HYPERLINK(1)");
    expect(csv).toContain('Texte; avec ""guillemets""');
    expect(csv).toContain('"7.5000"');
    expect(csv).toContain('"Relevé"');
    expect(csv).toContain('"Absence"');
    expect(csv).toContain('"Manager"');
  });

  it("ne transforme pas un service coupé du même jour en violation du repos quotidien", () => {
    const shifts: WorkforceShift[] = [
      { id: "lunch", restaurant_id: "restaurant", employee_id: "employee", shift_date: "2026-10-12", start_time: "11:00", end_time: "14:00", break_minutes: 0, status: "planned", notes: null },
      { id: "dinner", restaurant_id: "restaurant", employee_id: "employee", shift_date: "2026-10-12", start_time: "18:00", end_time: "23:00", break_minutes: 0, status: "confirmed", notes: null },
      { id: "next", restaurant_id: "restaurant", employee_id: "employee", shift_date: "2026-10-13", start_time: "07:00", end_time: "10:00", break_minutes: 0, status: "planned", notes: null },
    ];
    const report = buildWorkforceReport({ restaurantId: "restaurant", period, employees: [employee], entries: [], shifts, asOf: "2026-10-18" });
    const indicator = workforceLoadIndicator(report.employees[0], shifts, period);
    expect(indicator.restIntervals).toBe(1);
    expect(indicator.restViolations).toBe(1);
    expect(indicator.overlaps).toBe(0);
    expect(indicator.score).toBeGreaterThanOrEqual(0);
  });
});
