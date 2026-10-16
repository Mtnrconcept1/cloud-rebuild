import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkforceReports from "@/components/workforce/WorkforceReports";
import type { WorkforceSettings } from "@/lib/tokWorkforce";

const state=vi.hoisted(()=>({
  failed:false,
  employees:vi.fn(),shifts:vi.fn(),entries:vi.fn(),
}));
vi.mock("@/hooks/useTokWorkforce",()=>({
  useWorkforceEmployees:(...args:unknown[])=>state.employees(...args),
  useWorkforceShifts:(...args:unknown[])=>state.shifts(...args),
  useWorkforceEntriesInRange:(...args:unknown[])=>state.entries(...args),
}));
const settings={restaurant_id:"r1",enabled:true,canton:"GE",max_weekly_hours:42,min_vacation_days:20} as WorkforceSettings;
beforeEach(()=>{
  vi.useFakeTimers();vi.setSystemTime(new Date("2026-10-16T12:00:00Z"));
  const result=(data:unknown[])=>({data,isPending:false,isError:false});
  state.employees.mockReturnValue(result([{id:"e1",first_name:"Alex",last_name:"TOK",is_active:false,contracted_hours_per_week:42}]));
  state.shifts.mockReturnValue(result([]));
  state.entries.mockReturnValue(result([{id:"t1",employee_id:"e1",entry_date:"2026-10-15",start_time:"09:00:00.000000",end_time:"17:00:00",break_minutes:30}]));
});
afterEach(()=>{cleanup();vi.useRealTimers();vi.clearAllMocks();});
describe("TOK workforce report reliability",()=>{
  it("includes hours for a former employee and parses PostgreSQL time values",()=>{
    render(<WorkforceReports restaurantId="r1" settings={settings}/>);
    expect(screen.getByText("Alex TOK")).toBeInTheDocument();
    expect(screen.getAllByText("7.5 h")).toHaveLength(2);
    expect(screen.getByRole("button",{name:"Exporter CSV"})).toBeEnabled();
  });
  it("loads the entire selected month with explicit weekly contract units",()=>{
    render(<WorkforceReports restaurantId="r1" settings={settings}/>);
    fireEvent.change(screen.getByLabelText("Période du rapport"),{target:{value:"month"}});
    expect(state.entries).toHaveBeenLastCalledWith("r1",true,"2026-10-01","2026-10-31");
    expect(state.shifts).toHaveBeenLastCalledWith("r1",true,"2026-10-01","2026-10-31");
    expect(screen.getByText("Rapport mensuel")).toBeInTheDocument();
    expect(screen.getByText("Contrat / semaine")).toBeInTheDocument();
  });
  it("blocks export and hides stale totals if any dataset cannot be loaded",()=>{
    state.entries.mockReturnValue({data:[],isPending:false,isError:true});
    render(<WorkforceReports restaurantId="r1" settings={settings}/>);
    expect(screen.getByRole("alert")).toHaveTextContent("Rapport indisponible ou incomplet");
    expect(screen.getByRole("button",{name:"Exporter CSV"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Imprimer / PDF"})).toBeDisabled();
    expect(screen.queryByText("Alex TOK")).not.toBeInTheDocument();
    expect(screen.queryByText(/Aucun conflit élémentaire/)).not.toBeInTheDocument();
  });
});
