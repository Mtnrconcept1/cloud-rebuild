import { fireEvent, render, screen, within } from "@testing-library/react";
import { addDays } from "date-fns";
import { describe, expect, it, vi } from "vitest";

import WorkforceWeekGrid from "@/components/workforce/WorkforceWeekGrid";
import type { WorkforceAbsence, WorkforceEmployee, WorkforceShift } from "@/lib/tokWorkforce";

const days = Array.from({ length: 7 }, (_, index) => addDays(new Date("2026-10-19T12:00:00"), index));
const employees: WorkforceEmployee[] = [
  { id: "camille", restaurant_id: "restaurant", first_name: "Camille", last_name: "Martin", email: null, user_id: null, role: "employee", contracted_hours_per_week: 40, vacation_days_per_year: 25, hourly_cost_chf: 0, is_active: true },
  { id: "alex", restaurant_id: "restaurant", first_name: "Alex", last_name: "Dupont", email: null, user_id: null, role: "manager", contracted_hours_per_week: 40, vacation_days_per_year: 25, hourly_cost_chf: 0, is_active: true },
];
const shift: WorkforceShift = { id: "shift-1", restaurant_id: "restaurant", employee_id: "camille", shift_date: "2026-10-19", start_time: "11:00:00", end_time: "15:00:00", break_minutes: 15, status: "planned", notes: null };
const absence: WorkforceAbsence = { id: "absence-1", restaurant_id: "restaurant", employee_id: "alex", absence_type: "vacation", start_date: "2026-10-20", end_date: "2026-10-21", days_count: 2, notes: null };

describe("weekly employee planning", () => {
  it("places real shifts and absences on their own employee rows and retains records with an unavailable employee", () => {
    render(<WorkforceWeekGrid days={days} employees={employees} shifts={[shift, { ...shift, id: "orphan", employee_id: "unavailable" }]} absences={[absence]} changing={false} removing={false} onChange={vi.fn()} onDelete={vi.fn()} />);

    expect(screen.getAllByRole("columnheader")).toHaveLength(8);
    expect(screen.getByRole("rowheader", { name: /Camille Martin/ })).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: /Collaborateur inconnu/ })).toBeInTheDocument();
    const monday = screen.getByRole("cell", { name: "Camille Martin, lundi 19 octobre" });
    expect(within(monday).getByText("11:00 – 15:00")).toBeInTheDocument();
    const tuesday = screen.getByRole("cell", { name: "Alex Dupont, mardi 20 octobre" });
    expect(within(tuesday).getByText("Absence")).toBeInTheDocument();
  });

  it("keeps confirmation, keyboard date movement, deletion and same-employee drag movement connected to the original shift", () => {
    const onChange = vi.fn();
    const onDelete = vi.fn();
    render(<WorkforceWeekGrid days={days} employees={employees} shifts={[shift]} absences={[]} changing={false} removing={false} onChange={onChange} onDelete={onDelete} />);

    fireEvent.click(screen.getByRole("button", { name: "Confirmer" }));
    expect(onChange).toHaveBeenLastCalledWith({ id: "shift-1", patch: { status: "confirmed" } });
    fireEvent.click(screen.getByRole("button", { name: "Décaler +1 j" }));
    expect(onChange).toHaveBeenLastCalledWith({ id: "shift-1", patch: { shift_date: "2026-10-20" } });
    fireEvent.click(screen.getByRole("button", { name: "Supprimer le service" }));
    expect(onDelete).toHaveBeenCalledWith("shift-1");

    const dataTransfer = { getData: () => "shift-1" };
    fireEvent.drop(screen.getByRole("cell", { name: "Camille Martin, mercredi 21 octobre" }), { dataTransfer });
    expect(onChange).toHaveBeenLastCalledWith({ id: "shift-1", patch: { shift_date: "2026-10-21" } });
    onChange.mockClear();
    fireEvent.drop(screen.getByRole("cell", { name: "Alex Dupont, jeudi 22 octobre" }), { dataTransfer });
    expect(onChange).not.toHaveBeenCalled();
  });

  it("keeps busy and cancelled shifts from being moved by drag and drop", () => {
    const onChange = vi.fn();
    const view = render(<WorkforceWeekGrid days={days} employees={employees} shifts={[shift]} absences={[]} changing removing onChange={onChange} onDelete={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Confirmer" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Supprimer le service" })).toBeDisabled();
    const dataTransfer = { getData: () => "shift-1" };
    fireEvent.drop(screen.getByRole("cell", { name: "Camille Martin, mercredi 21 octobre" }), { dataTransfer });
    expect(onChange).not.toHaveBeenCalled();
    view.rerender(<WorkforceWeekGrid days={days} employees={employees} shifts={[{ ...shift, status: "cancelled" }]} absences={[]} changing={false} removing={false} onChange={onChange} onDelete={vi.fn()} />);
    fireEvent.drop(screen.getByRole("cell", { name: "Camille Martin, mercredi 21 octobre" }), { dataTransfer });
    expect(onChange).not.toHaveBeenCalled();
  });
});
