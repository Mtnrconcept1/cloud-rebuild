/** SwissTime core adapted to TOK (tenant-specific data lives in Supabase). */
export type WorkforceEmployee = { id:string; restaurant_id:string; first_name:string; last_name:string; email:string|null; user_id:string|null; role:"employee"|"manager"; contracted_hours_per_week:number; vacation_days_per_year:number; is_active:boolean };
export type WorkforceShift = { id:string; restaurant_id:string; employee_id:string; shift_date:string; start_time:string; end_time:string; break_minutes:number; status:"planned"|"confirmed"|"completed"|"cancelled"; notes:string|null };
export type WorkforceEntry = { id:string; restaurant_id:string; employee_id:string; entry_date:string; start_time:string; end_time:string; break_minutes:number; notes:string|null; is_night_work:boolean; is_sunday_work:boolean };
export type WorkforceAbsence = { id:string; restaurant_id:string; employee_id:string; absence_type:"vacation"|"sick"|"holiday"|"other"; start_date:string; end_date:string; days_count:number; notes:string|null };
export type WorkforceRequest = { id:string; restaurant_id:string; employee_id:string; request_type:"vacation"|"correction"|"schedule"|"other"; description:string; status:"pending"|"approved"|"rejected" };
export type WorkforceExchange = { id:string; restaurant_id:string; requester_id:string; requester_shift_id:string; target_employee_id:string; target_shift_id:string|null; status:"pending"|"approved"|"rejected"|"cancelled" };
export type WorkforceSettings = { restaurant_id:string; enabled:boolean; canton:string; max_weekly_hours:number; min_vacation_days:number };
export type WorkforceValidation = { id:string; restaurant_id:string; time_entry_id:string; signed_name:string; signed_at:string };

export function employeeName(employee: Pick<WorkforceEmployee,"first_name"|"last_name"> | undefined): string {
  return employee ? employee.first_name+" "+employee.last_name : "Collaborateur inconnu";
}
export function minutesFromTime(value:string):number {
  const m=/^([0-2]\d):([0-5]\d)(?::\d{2})?$/.exec(value);
  if(!m || +m[1]>23) throw new Error("Heure invalide.");
  return +m[1]*60 + +m[2];
}
export function workedHours(start:string,end:string,breakMinutes:number):number {
  const first=minutesFromTime(start),last=minutesFromTime(end);
  if(first===last) throw new Error("Début et fin doivent différer.");
  const duration=last>first?last-first:1440+last-first;
  if(!Number.isInteger(breakMinutes)||breakMinutes<0||breakMinutes>=duration||breakMinutes>720) throw new Error("Pause invalide.");
  return Math.round((duration-breakMinutes)/60*100)/100;
}
export function weekRange(day:Date):{start:string;end:string} {
  const start=new Date(day.getFullYear(),day.getMonth(),day.getDate(),12);
  start.setDate(start.getDate()-(start.getDay()+6)%7);
  const end=new Date(start);end.setDate(end.getDate()+6);
  const iso=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  return {start:iso(start),end:iso(end)};
}
export function dateIsValid(date:string):boolean {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return false;
  const dt=new Date(date+"T12:00:00");
  return !Number.isNaN(dt.getTime()) && [dt.getFullYear(),String(dt.getMonth()+1).padStart(2,"0"),String(dt.getDate()).padStart(2,"0")].join("-")===date;
}
export function csvCell(value:unknown):string {
  const input=String(value??"").replace(/^[=+\-@\t\r]/,"'$&");
  return '"'+input.replace(/"/g,'""')+'"';
}
