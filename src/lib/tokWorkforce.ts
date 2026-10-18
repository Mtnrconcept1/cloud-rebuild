/** SwissTime core adapted to TOK (tenant-specific data lives in Supabase). */
export type WorkforceEmployee = { id:string; restaurant_id:string; first_name:string; last_name:string; email:string|null; user_id:string|null; role:"employee"|"manager"; contracted_hours_per_week:number; vacation_days_per_year:number; hourly_cost_chf:number; is_active:boolean };
export type WorkforceShift = { id:string; restaurant_id:string; employee_id:string; shift_date:string; start_time:string; end_time:string; break_minutes:number; status:"planned"|"confirmed"|"completed"|"cancelled"; notes:string|null };
export type WorkforceEntry = { id:string; restaurant_id:string; employee_id:string; entry_date:string; start_time:string; end_time:string; break_minutes:number; notes:string|null; is_night_work:boolean; is_sunday_work:boolean };
export type WorkforceAbsence = { id:string; restaurant_id:string; employee_id:string; absence_type:"vacation"|"sick"|"holiday"|"other"; start_date:string; end_date:string; days_count:number; notes:string|null };
export type WorkforceRequest = { id:string; restaurant_id:string; employee_id:string; request_type:"vacation"|"correction"|"schedule"|"other"; description:string; requested_start_date?:string|null; requested_end_date?:string|null; requested_days?:number|null; status:"pending"|"approved"|"rejected" };
export type WorkforceExchange = { id:string; restaurant_id:string; requester_id:string; requester_shift_id:string; target_employee_id:string; target_shift_id:string|null; target_accepted_at?:string|null; status:"pending"|"approved"|"rejected"|"cancelled" };
export type WorkforceSettings = { restaurant_id:string; enabled:boolean; canton:string; max_weekly_hours:number; min_vacation_days:number };
export type WorkforceValidation = { id:string; restaurant_id:string; time_entry_id:string; signed_name:string; signed_at:string; signature_data?:string|null };

export function employeeName(employee: Pick<WorkforceEmployee,"first_name"|"last_name"> | undefined): string {
  return employee ? employee.first_name+" "+employee.last_name : "Collaborateur inconnu";
}
export function minutesFromTime(value:string):number {
  const m=/^([0-2]\d):([0-5]\d)(?::[0-5]\d(?:\.\d{1,6})?)?$/.exec(value);
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


export type WorkforceInvitationDeliveryStatus = "queued" | "processing" | "sent" | "failed" | "cancelled" | "unknown";
export type WorkforceInvitation = {
  invitation_id: string;
  employee_id: string;
  email: string;
  invited_at: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  delivery_status: WorkforceInvitationDeliveryStatus;
  provider_status: string | null;
  sent_at: string | null;
};
export type WorkforceInvitationResult = Pick<WorkforceInvitation, "invitation_id" | "employee_id" | "email" | "expires_at" | "delivery_status"> & {
  reused: boolean;
};
export type WorkforceInvitationState = "inactive" | "linked" | "not_invited" | "queued" | "processing" | "sent" | "failed" | "revoked" | "expired" | "unknown";

/** An accepted email alone is not proof of an active employee/account link. */
export function workforceInvitationState(
  employee: Pick<WorkforceEmployee, "is_active" | "user_id">,
  invitation?: WorkforceInvitation,
  now = new Date(),
): WorkforceInvitationState {
  if (!employee.is_active) return "inactive";
  if (employee.user_id) return "linked";
  if (!invitation || invitation.accepted_at) return "not_invited";
  if (invitation.revoked_at || invitation.delivery_status === "cancelled") return "revoked";
  if (new Date(invitation.expires_at).getTime() <= now.getTime()) return "expired";
  if (["bounced", "complained", "failed"].includes(invitation.provider_status || "")) return "failed";
  switch (invitation.delivery_status) {
    case "queued": case "processing": case "sent": case "failed": return invitation.delivery_status;
    default: return "unknown";
  }
}

export function workforceInvitationEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Indiquez une adresse e-mail valide pour l’invitation.");
  }
  return email;
}

export function workforceInvitationNotice(result: WorkforceInvitationResult): { title: string; description: string } {
  if (result.delivery_status === "sent") {
    return { title: "Invitation envoyée", description: "L’employé pourra activer son accès avec l’adresse " + result.email + "." };
  }
  if (result.delivery_status !== "queued" && result.delivery_status !== "processing") {
    return { title: "Envoi non confirmé", description: "Vérifiez le suivi de l’invitation avant de réessayer." };
  }
  return {
    title: result.reused ? "Envoi déjà en attente" : "Invitation programmée",
    description: "L’e-mail pour " + result.email + " est en attente d’envoi. Son état sera actualisé dans la fiche.",
  };
}

/** Dates stored for shifts use the restaurant's Swiss local time. */
export function workforceZurichClock(now = new Date()): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find(value => value.type === type)?.value || "";
  return {
    date: part("year") + "-" + part("month") + "-" + part("day"),
    time: part("hour") + ":" + part("minute") + ":" + part("second"),
  };
}