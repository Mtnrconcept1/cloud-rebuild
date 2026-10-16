/** SwissTime core adapted to TOK (tenant-specific data lives in Supabase). */
export type WorkforceEmployee = { id:string; restaurant_id:string; first_name:string; last_name:string; email:string|null; user_id:string|null; role:"employee"|"manager"; contracted_hours_per_week:number; vacation_days_per_year:number; hourly_cost_chf:number; is_active:boolean };
export type WorkforceShift = { id:string; restaurant_id:string; employee_id:string; shift_date:string; start_time:string; end_time:string; break_minutes:number; status:"planned"|"confirmed"|"completed"|"cancelled"; notes:string|null };
export type WorkforceEntry = { id:string; restaurant_id:string; employee_id:string; entry_date:string; start_time:string; end_time:string; break_minutes:number; notes:string|null; is_night_work:boolean; is_sunday_work:boolean; tok_workforce_clock_sessions?: Array<{clock_in_at:string;clock_out_at:string|null;break_seconds:number;reconciled_at?:string|null}> };
export type WorkforceAbsence = { id:string; restaurant_id:string; employee_id:string; absence_type:"vacation"|"sick"|"holiday"|"other"; start_date:string; end_date:string; days_count:number; notes:string|null };
export type WorkforceRequest = { id:string; restaurant_id:string; employee_id:string; request_type:"vacation"|"correction"|"schedule"|"other"; description:string; requested_start_date?:string|null; requested_end_date?:string|null; requested_days?:number|null; status:"pending"|"approved"|"rejected" };
export type WorkforceExchange = { id:string; restaurant_id:string; requester_id:string; requester_shift_id:string; target_employee_id:string; target_shift_id:string|null; target_accepted_at?:string|null; status:"pending"|"approved"|"rejected"|"cancelled" };
export type WorkforceSettings = { restaurant_id:string; enabled:boolean; canton:string; max_weekly_hours:number; min_vacation_days:number };
export type WorkforceValidation = { id:string; restaurant_id:string; time_entry_id:string; signed_name:string; signed_at:string; signature_data?:string|null };

export function employeeName(employee: Pick<WorkforceEmployee,"first_name"|"last_name"> | undefined): string {
  return employee ? employee.first_name+" "+employee.last_name : "Collaborateur inconnu";
}
export function minutesFromTime(value:string):number {
  const m=/^([0-2]\d):([0-5]\d)(?::([0-5]\d)(?:\.(\d{1,6}))?)?$/.exec(value);
  if(!m || +m[1]>23) throw new Error("Heure invalide.");
  return +m[1]*60 + +m[2] + Number(m[3] || 0)/60 + Number("0."+(m[4] || "0"))/60;
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

/** Clock timestamps are authoritative, including DST transitions and exact pauses. */
export function entryWorkedHours(entry: WorkforceEntry): number {
  const clocks = entry.tok_workforce_clock_sessions || [];
  if (clocks.length > 1) throw new Error("Plusieurs pointages associés au même relevé.");
  const clock = clocks[0];
  if (clock?.clock_out_at && !clock.reconciled_at) {
    const elapsed = (Date.parse(clock.clock_out_at) - Date.parse(clock.clock_in_at))/1000;
    const pause = Number(clock.break_seconds);
    if (!Number.isFinite(elapsed) || elapsed <= 0 || !Number.isFinite(pause) || pause < 0 || pause >= elapsed)
      throw new Error("Durée du pointage invalide.");
    return Math.round((elapsed-pause)/3600*100)/100;
  }
  return workedHours(entry.start_time,entry.end_time,entry.break_minutes);
}
