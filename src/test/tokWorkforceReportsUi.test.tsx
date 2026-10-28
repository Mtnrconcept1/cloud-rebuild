import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import WorkforceReports from "@/components/workforce/WorkforceReports";
import WorkforceAnalytics from "@/components/workforce/WorkforceAnalytics";
import type { WorkforceEmployee, WorkforceEntry, WorkforceShift, WorkforceValidation } from "@/lib/tokWorkforce";

const mocks = vi.hoisted(() => ({
  employees: [] as WorkforceEmployee[], entries: [] as WorkforceEntry[], shifts: [] as WorkforceShift[], validations: [] as WorkforceValidation[],
  pending: false, error: false, entriesHook: vi.fn(), validationHook: vi.fn(), downloadPdf: vi.fn(),
}));
const result = <T,>(data: T) => ({ data, isPending: mocks.pending, isError: mocks.error, isFetching: false, refetch: vi.fn() });
vi.mock("@/hooks/useTokWorkforce", () => ({
  useWorkforceEmployees: () => result(mocks.employees), useWorkforceShifts: () => result(mocks.shifts),
  useWorkforceEntriesInRange: (...args: unknown[]) => { mocks.entriesHook(...args); return result(mocks.entries); },
  useWorkforceValidations: (...args: unknown[]) => { mocks.validationHook(...args); return result(mocks.validations); },
  useWorkforceAbsences: () => result([]), useWorkforceHolidays: () => result([]), useWorkforceClockSessionsInRange: () => result([]),
}));
vi.mock("@/hooks/use-toast", () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock("@/lib/tokWorkforcePdf", () => ({ downloadWorkforcePdf: (...args: unknown[]) => mocks.downloadPdf(...args) }));
vi.mock("recharts", () => {
  const Container = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return { ResponsiveContainer: Container, AreaChart: Container, BarChart: Container, Area: () => null, Bar: () => null,
    CartesianGrid: () => null, Legend: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null };
});
const settings = { restaurant_id: "restaurant", enabled: true, canton: "GE", max_weekly_hours: 50, min_vacation_days: 20 };
const makeEntry = (patch: Partial<WorkforceEntry> = {}): WorkforceEntry => ({
  id: "entry-1", restaurant_id: "restaurant", employee_id: "alice", entry_date: "2026-10-12", start_time: "09:00", end_time: "17:00", break_minutes: 0,
  is_night_work: false, is_sunday_work: false, notes: null, version: 2, ...patch,
});
beforeEach(() => {
  vi.clearAllMocks(); vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-10-28T10:00:00Z"));
  mocks.pending = false; mocks.error = false; mocks.downloadPdf.mockResolvedValue(undefined);
  const employee: WorkforceEmployee = { id: "alice", restaurant_id: "restaurant", first_name: "Alice", last_name: "Test", email: null, user_id: null,
    role: "employee", contracted_hours_per_week: 40, vacation_days_per_year: 20, hourly_cost_chf: 10, is_active: true };
  mocks.employees = [employee, { ...employee, id: "bob", first_name: "Bob", hourly_cost_chf: 25 }];
  mocks.entries = [makeEntry(), makeEntry({ id: "entry-2", employee_id: "bob", end_time: "14:00" }), makeEntry({ id: "september", entry_date: "2026-09-12", end_time: "13:00" })];
  mocks.shifts = [{ id: "shift-1", restaurant_id: "restaurant", employee_id: "alice", shift_date: "2026-10-12", start_time: "09:00", end_time: "13:00", break_minutes: 0, notes: null, status: "confirmed" },
    { id: "shift-2", restaurant_id: "restaurant", employee_id: "bob", shift_date: "2026-10-12", start_time: "11:00", end_time: "13:00", break_minutes: 0, notes: null, status: "planned" }];
  mocks.validations = [{ id: "validation", restaurant_id: "restaurant", time_entry_id: "entry-1", entry_version: 2, signed_name: "Manager Test", signed_at: "2026-10-20T12:00:00Z" }];
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("TOK Équipe — rapports et analyses", () => {
  it("garde toutes les lignes quotidiennes, applique le filtre validé et exporte seulement le collaborateur choisi", async () => {
    mocks.entries.push(makeEntry({ id: "entry-evening", start_time: "19:00", end_time: "22:00" }));
    mocks.entries.push(makeEntry({ id: "foreign", restaurant_id: "other" }));
    render(<WorkforceReports restaurantId="restaurant" settings={settings} restaurantName="Le Bistrot" />);
    const details = screen.getByRole("table", { name: "Détail quotidien des heures" });
    expect(within(details).getAllByRole("row")).toHaveLength(4);
    fireEvent.click(screen.getByRole("checkbox", { name: "Relevés validés uniquement" }));
    expect(within(details).getAllByRole("row")).toHaveLength(2);
    fireEvent.change(screen.getByLabelText("Collaborateur"), { target: { value: "alice" } });
    expect(mocks.entriesHook).toHaveBeenCalledWith("restaurant", true, "2026-09-30", "2026-10-31", "alice");
    expect(mocks.validationHook).toHaveBeenCalledWith("restaurant", true, "2026-09-30", "2026-10-31", "alice");
    fireEvent.click(screen.getByRole("button", { name: "PDF individuel" }));
    await waitFor(() => expect(mocks.downloadPdf).toHaveBeenCalledOnce());
    const exported = mocks.downloadPdf.mock.calls[0][0];
    expect(exported.employees).toHaveLength(1);
    expect(exported.employees[0].employee.id).toBe("alice");
    expect(exported.employees[0].records).toHaveLength(1);
    expect(mocks.downloadPdf.mock.calls[0][1]).toBe("Le Bistrot");
  });

  it("consulte une semaine passant le nouvel an sans fixer l’année", () => {
    render(<WorkforceReports restaurantId="restaurant" settings={settings} />);
    fireEvent.change(screen.getByLabelText("Période"), { target: { value: "week" } });
    fireEvent.change(screen.getByLabelText("Date de la semaine"), { target: { value: "2025-12-31" } });
    expect(mocks.entriesHook).toHaveBeenCalledWith("restaurant", true, "2025-12-28", "2026-01-04", undefined);
    expect(screen.getByText("2025-12-29 au 2026-01-04")).toBeInTheDocument();
  });

  it("bloque les exports pendant une erreur, un chargement ou une ambiguïté horaire", () => {
    mocks.pending = true;
    const view = render(<WorkforceReports restaurantId="restaurant" settings={settings} />);
    expect(screen.getByRole("button", { name: "CSV complet" })).toBeDisabled();
    expect(screen.queryByRole("table", { name: "Synthèse du rapport par collaborateur" })).not.toBeInTheDocument();
    mocks.pending = false; mocks.error = true;
    view.rerender(<WorkforceReports restaurantId="restaurant" settings={settings} />);
    expect(screen.getByRole("alert")).toHaveTextContent("rapport est indisponible");
    expect(screen.getByRole("button", { name: "PDF global" })).toBeDisabled();
    mocks.error = false; mocks.entries = [makeEntry({ entry_date: "2026-10-25", start_time: "02:30", end_time: "04:00" })];
    view.rerender(<WorkforceReports restaurantId="restaurant" settings={settings} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Heure locale ambiguë");
    expect(screen.getByRole("button", { name: "CSV complet" })).toBeDisabled();
  });

  it("utilise chaque tarif individuel pour six mois, la prévision et la comparaison au mois précédent", () => {
    render(<WorkforceAnalytics restaurantId="restaurant" settings={settings} />);
    const table = screen.getByRole("table", { name: "Heures et coûts par collaborateur" });
    const aliceRow = within(table).getByText("Alice Test").closest("tr")!;
    const bobRow = within(table).getByText("Bob Test").closest("tr")!;
    expect(aliceRow).toHaveTextContent("40 CHF"); expect(aliceRow).toHaveTextContent("80 CHF");
    expect(bobRow).toHaveTextContent("50 CHF"); expect(bobRow).toHaveTextContent("125 CHF");
    expect(screen.getByText(/\+125.0 %/)).toBeInTheDocument();
    expect(screen.getAllByText("90 CHF")).toHaveLength(2);
    const sixMonths = screen.getByRole("table", { name: "Chiffres des six mois" });
    expect(within(sixMonths).getAllByRole("row")).toHaveLength(7);
    expect(within(sixMonths).getByText("2026-05")).toBeInTheDocument();
    expect(within(sixMonths).getByText("2026-10")).toBeInTheDocument();
    expect(screen.getByText(/40 % adéquation/)).toHaveTextContent("20 % écart réalisé");
    expect(screen.getByText(/sans diagnostic de santé/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Collaborateur analysé"), { target: { value: "bob" } });
    expect(mocks.entriesHook).toHaveBeenCalledWith("restaurant", true, "2026-04-30", "2026-10-31", "bob");
    expect(within(table).queryByText("Alice Test")).not.toBeInTheDocument();
    expect(screen.getAllByText("50 CHF").length).toBeGreaterThanOrEqual(2);
  });

  it("n’affiche pas un faux coût à zéro lorsque l’analyse est indisponible", () => {
    mocks.error = true;
    render(<WorkforceAnalytics restaurantId="restaurant" settings={settings} />);
    expect(screen.getByRole("alert")).toHaveTextContent("Analyse indisponible");
    expect(screen.queryByText("0 CHF")).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });
});
