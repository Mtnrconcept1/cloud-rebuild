import { describe,it,expect } from "vitest";
import { csvCell,dateIsValid,workedHours,entryWorkedHours,type WorkforceEntry,weekRange,type WorkforceEmployee,type WorkforceShift } from "@/lib/tokWorkforce";
import { planningWarnings } from "@/lib/tokWorkforceWarnings";

const employee:WorkforceEmployee={
  id:"e1",restaurant_id:"r1",first_name:"Alice",last_name:"Martin",email:null,user_id:null,
  role:"employee",contracted_hours_per_week:20,vacation_days_per_year:20,hourly_cost_chf:0,is_active:true,
};
const shift=(date:string,start:string,end:string,breakMin:number):WorkforceShift=>({
  id:date+start,restaurant_id:"r1",employee_id:"e1",shift_date:date,
  start_time:start,end_time:end,break_minutes:breakMin,status:"planned",notes:null,
});

describe("TOK Équipe — horaires et rapport",()=>{
  it("calcule le temps net pour un service normal et un service de nuit",()=>{
    expect(workedHours("09:00","17:00",30)).toBe(7.5);
    expect(workedHours("22:00","02:30",30)).toBe(4);
  });
  it("rejette les horaires et pauses invalides",()=>{
    expect(()=>workedHours("09:00","09:00",0)).toThrow();
    expect(()=>workedHours("09:00","17:00",480)).toThrow();
    expect(()=>workedHours("30:00","17:00",0)).toThrow();
  });
  it("retourne le lundi et le dimanche d'une semaine locale",()=>{
    expect(weekRange(new Date(2026,9,14))).toEqual({start:"2026-10-12",end:"2026-10-18"});
  });
  it("ne valide pas les jours impossibles",()=>{
    expect(dateIsValid("2026-02-30")).toBe(false);
    expect(dateIsValid("2026-10-14")).toBe(true);
  });
  it("avertit des chevauchements, repos et dépassements sans données croisées",()=>{
    const shifts=[
      shift("2026-10-12","08:00","18:00",60),
      shift("2026-10-12","17:00","23:00",30),
      shift("2026-10-13","06:00","14:00",30),
      {...shift("2026-10-12","10:00","12:00",0),id:"other",employee_id:"e2",restaurant_id:"r2"},
    ];
    const warnings=planningWarnings(shifts,[employee],50);
    expect(warnings.some(s=>s.includes("chevauchement"))).toBe(true);
    expect(warnings.some(s=>s.includes("repos"))).toBe(true);
    expect(warnings.some(s=>s.includes("contractuelles"))).toBe(true);
    expect(warnings.every(s=>s.includes("Alice Martin"))).toBe(true);
  });
  it("neutralise les formules et sépare correctement les champs CSV",()=>{
    expect(csvCell("=1+1")).toBe('"\'=1+1"');
    expect(csvCell('a"b')).toBe('"a""b"');
  });
});

describe("TOK Équipe — pointages réels",()=>{
  it("accepte les secondes et microsecondes de PostgreSQL",()=>{
    expect(workedHours("09:00:00.123456","17:00:00.123456",30)).toBe(7.5);
    expect(()=>workedHours("09:00:99","17:00:00",0)).toThrow();
  });
  it("calcule le temps écoulé réel au changement d’heure et les pauses exactes",()=>{
    const entry={start_time:"01:00:00",end_time:"04:00:00",break_minutes:10,
      tok_workforce_clock_sessions:[{clock_in_at:"2026-10-24T23:00:00Z",clock_out_at:"2026-10-25T03:00:00Z",break_seconds:600}]};
    expect(entryWorkedHours(entry as WorkforceEntry)).toBe(3.83);
    expect(entryWorkedHours({...entry,tok_workforce_clock_sessions:[{...entry.tok_workforce_clock_sessions[0],reconciled_at:"2026-10-26T10:00:00Z"}]} as WorkforceEntry)).toBe(2.83);
  });
});
