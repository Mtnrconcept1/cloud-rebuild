import { describe,it,expect } from "vitest";
import { csvCell,dateIsValid,workedHours,weekRange,type WorkforceEmployee,type WorkforceShift } from "@/lib/tokWorkforce";
import { planningWarnings } from "@/lib/tokWorkforceWarnings";

const employee:WorkforceEmployee={
  id:"e1",restaurant_id:"r1",first_name:"Alice",last_name:"Martin",email:null,user_id:null,
  role:"employee",contracted_hours_per_week:20,vacation_days_per_year:20,is_active:true,
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
