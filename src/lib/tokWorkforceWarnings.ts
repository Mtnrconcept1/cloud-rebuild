import { employeeName, minutesFromTime, workedHours, type WorkforceEmployee, type WorkforceShift } from "./tokWorkforce";

/** Swiss LTr-based indicators for manager review; not a legal compliance certificate. */
export function planningWarnings(
  shifts: WorkforceShift[],
  employees: WorkforceEmployee[],
  maxWeeklyHours = 50,
): string[] {
  const warnings:string[]=[];
  for(const employee of employees) {
    const assigned=shifts.filter(s=>s.employee_id===employee.id && s.restaurant_id===employee.restaurant_id && s.status!=="cancelled")
      .sort((a,b)=>(a.shift_date+" "+a.start_time).localeCompare(b.shift_date+" "+b.start_time));
    let total=0,lastEnd=-Infinity;
    for(const shift of assigned) {
      let worked:number;
      try {worked=workedHours(shift.start_time,shift.end_time,shift.break_minutes);}
      catch {warnings.push(employeeName(employee)+": horaires invalides le "+shift.shift_date);continue;}
      total+=worked;
      const start=new Date(shift.shift_date+"T00:00:00").getTime()+minutesFromTime(shift.start_time)*60000;
      const gross=(minutesFromTime(shift.end_time)-minutesFromTime(shift.start_time)+1440)%1440;
      const end=start+gross*60000;
      if(start<lastEnd)warnings.push(employeeName(employee)+": chevauchement de services");
      else if(lastEnd!==-Infinity && start-lastEnd<11*3600000)
        warnings.push(employeeName(employee)+": repos entre services potentiellement inférieur à 11 heures");
      lastEnd=Math.max(lastEnd,end);
      const minimumBreak=gross>540?60:gross>420?30:gross>330?15:0;
      if(shift.break_minutes<minimumBreak)
        warnings.push(employeeName(employee)+": pause potentiellement insuffisante le "+shift.shift_date);
    }
    if(total>maxWeeklyHours)warnings.push(employeeName(employee)+": "+total.toFixed(1)+" h planifiées (seuil "+maxWeeklyHours+" h)");
    if(total>employee.contracted_hours_per_week)
      warnings.push(employeeName(employee)+": dépassement des heures contractuelles ("+total.toFixed(1)+" h)");
  }
  return [...new Set(warnings)];
}
