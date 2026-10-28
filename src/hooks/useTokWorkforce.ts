import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { dateIsValid, workforceInvitationEmail, workforceZurichClock } from "@/lib/tokWorkforce";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type {
  WorkforceAbsence, WorkforceEmployee, WorkforceEntry, WorkforceExchange,
  WorkforceRequest, WorkforceSettings, WorkforceShift, WorkforceValidation,
  WorkforceInvitation, WorkforceInvitationResult, WorkforceHoliday, WorkforceClockSession,
} from "@/lib/tokWorkforce";

/** The TOK database client is already authenticated and scoped by RLS.
 * Until types are regenerated after migration, we access only namespaced tables. */
export const workforceDb = (): SupabaseClient => getSupabase() as unknown as SupabaseClient;
export const workforceKey = (table:string, restaurantId:string) => ["tok-workforce",table,restaurantId] as const;

export function useWorkforceSettings(restaurantId:string|null) {
  const { user } = useAuth();
  return useQuery({
    queryKey:[...workforceKey("settings",restaurantId||""),user?.id],
    enabled:!!restaurantId,
    staleTime:30_000,
    queryFn:async()=>{
      const {data,error}=await workforceDb().from("tok_workforce_settings")
        .select("restaurant_id, enabled, canton, max_weekly_hours, min_vacation_days")
        .eq("restaurant_id",restaurantId!).maybeSingle();
      if(error)throw error;
      return data as WorkforceSettings|null;
    },
  });
}

export type WorkforceRowsOptions = {
  orderBy?:string; ascending?:boolean; startField?:string; start?:string; endField?:string; end?:string;
  /** Safety ceiling: exceeding it is an explicit error, never a partial total. */
  limit?:number; employeeId?:string; employeeField?:string; secondaryOrderBy?:string; select?:string;
};

/** Fetch every page under the caller's RLS, in a deterministic order. */
export async function fetchWorkforceRows<T>(restaurantId:string, table:string, opts:WorkforceRowsOptions = {}, signal?:AbortSignal):Promise<T[]> {
  if (!table.startsWith("tok_workforce_")) throw new Error("Table équipe invalide.");
  const ceiling = opts.limit ?? 20_000;
  const pageSize = Math.min(500, ceiling + 1);
  const rows:T[] = [];
  const seenIds = new Set<string>();
  let expectedCount:number|undefined;
  for (let offset = 0; offset <= ceiling;) {
    let query=workforceDb().from(table).select(opts.select || "*",{count:"exact"}).eq("restaurant_id",restaurantId);
    if(opts.employeeId)query=query.eq(opts.employeeField||"employee_id",opts.employeeId);
    if(opts.startField && opts.start)query=query.gte(opts.startField,opts.start);
    if(opts.endField && opts.end)query=query.lte(opts.endField,opts.end);
    const primary=opts.orderBy||"created_at";
    query=query.order(primary,{ascending:opts.ascending??false});
    if(opts.secondaryOrderBy && opts.secondaryOrderBy!==primary)query=query.order(opts.secondaryOrderBy,{ascending:true});
    if(primary!=="id" && opts.secondaryOrderBy!=="id")query=query.order("id",{ascending:true});
    if(signal)query=query.abortSignal(signal);
    const {data,error,count}=await query.range(offset,offset+pageSize-1);
    if(error)throw error;
    if(count!=null) {
      if(count>ceiling)throw new Error("Cette période contient trop de données. Réduisez la période ou sélectionnez un collaborateur pour obtenir un résultat complet.");
      if(expectedCount!==undefined && count!==expectedCount)throw new Error("Les données ont changé pendant le chargement. Actualisez pour obtenir un résultat complet.");
      expectedCount=count;
    }
    const page=(data||[]) as T[];
    for (const row of page) {
      const id = (row as {id?:unknown}|null)?.id;
      if (typeof id !== "string" || !id) throw new Error("Une donnée équipe n’a pas pu être vérifiée. Réessayez.");
      if (seenIds.has(id)) throw new Error("Les données ont changé pendant le chargement. Actualisez pour obtenir un résultat complet.");
      seenIds.add(id);
    }
    rows.push(...page);
    if(rows.length>ceiling)throw new Error("Cette période contient trop de données. Affinez les filtres pour obtenir un résultat complet.");
    if(expectedCount!==undefined && rows.length>expectedCount)throw new Error("Les données ont changé pendant le chargement. Actualisez pour obtenir un résultat complet.");
    if(expectedCount!==undefined && rows.length===expectedCount)return rows;
    if(!page.length) {
      if(expectedCount!==undefined && rows.length<expectedCount)throw new Error("Le chargement des données est incomplet. Réessayez.");
      return rows;
    }
    if(expectedCount===undefined && page.length<pageSize)return rows;
    offset+=page.length;
  }
  throw new Error("Le chargement des données est incomplet. Affinez les filtres.");
}

export function useWorkforceRows<T>(restaurantId:string|null, table:string, enabled:boolean, opts?:WorkforceRowsOptions) {
  const { user } = useAuth();
  return useQuery({
    queryKey:[...workforceKey(table,restaurantId||""),user?.id,opts||{}],
    enabled:!!restaurantId && enabled,
    staleTime:10_000,
    queryFn:({signal})=>fetchWorkforceRows<T>(restaurantId!,table,opts,signal),
  });
}

export function useWorkforceEmployees(restaurantId:string|null, enabled:boolean) {
  return useWorkforceRows<WorkforceEmployee>(restaurantId,"tok_workforce_employees",enabled,{orderBy:"last_name",secondaryOrderBy:"id",ascending:true});
}
export function useWorkforceShifts(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceShift>(restaurantId,"tok_workforce_shifts",enabled,{orderBy:"shift_date",ascending:true,startField:"shift_date",start,endField:"shift_date",end,employeeId});
}
export function useWorkforceEntries(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date"});
}
export function useWorkforceEntriesInRange(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",startField:"entry_date",start,endField:"entry_date",end,employeeId});
}
export function useWorkforceValidations(restaurantId:string|null,enabled:boolean,start?:string,end?:string,employeeId?:string) {
  return useWorkforceRows<WorkforceValidation>(restaurantId,"tok_workforce_validations",enabled,{
    orderBy:"signed_at", select:start||end||employeeId?"*,tok_workforce_time_entries!inner(entry_date,employee_id)":"*",
    startField:"tok_workforce_time_entries.entry_date",start,endField:"tok_workforce_time_entries.entry_date",end,
    employeeField:"tok_workforce_time_entries.employee_id",employeeId,
  });
}
export function useWorkforceAbsences(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceAbsence>(restaurantId,"tok_workforce_absences",enabled,{orderBy:"start_date",employeeId});
}
export function useWorkforceRequests(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceRequest>(restaurantId,"tok_workforce_requests",enabled,{employeeId});
}
export function useWorkforceExchanges(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceExchange>(restaurantId,"tok_workforce_exchanges",enabled);
}
export function useWorkforceHolidays(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceHoliday>(restaurantId,"tok_workforce_holidays",enabled,{orderBy:"holiday_date",ascending:true});
}
export function useWorkforceClockSessionsInRange(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  // A Swiss day can begin on the preceding UTC date; broaden server bounds and
  // let the reporting engine intersect the exact Europe/Zurich interval.
  const valid=dateIsValid(start)&&dateIsValid(end)&&start<=end;
  const lower=new Date((valid?start:"1970-01-01")+"T00:00:00Z");lower.setUTCDate(lower.getUTCDate()-1);
  const upper=new Date((valid?end:"1970-01-01")+"T00:00:00Z");upper.setUTCDate(upper.getUTCDate()+2);
  return useWorkforceRows<WorkforceClockSession>(restaurantId,"tok_workforce_clock_sessions",enabled&&valid,{
    select:"id,restaurant_id,employee_id,entry_id,clock_in_at,clock_out_at,break_seconds,pause_started_at",
    orderBy:"clock_in_at",startField:"clock_in_at",start:lower.toISOString(),endField:"clock_in_at",end:upper.toISOString(),employeeId,
  });
}

export function workforceQueryMatchesRestaurant(key:readonly unknown[],restaurantId:string):boolean {
  return key[0]==="tok-workforce" ? key[2]===restaurantId
    : typeof key[0]==="string" && key[0].startsWith("workforce-") && key[1]===restaurantId;
}
export function useWorkforceRefresh(restaurantId:string) {
  const client=useQueryClient();
  return ()=>client.invalidateQueries({predicate:query=>workforceQueryMatchesRestaurant(query.queryKey,restaurantId)});
}


/** Delivery details are exposed only by the authorized, restaurant-scoped RPC. */
export function useWorkforceInvitations(restaurantId: string, enabled = true) {
  const client = useQueryClient();
  const queryKey = workforceKey("invitations", restaurantId);
  return useQuery({
    queryKey,
    enabled: !!restaurantId && enabled,
    staleTime: 10_000,
    refetchInterval: 15_000,
    queryFn: async () => {
      const { data, error } = await workforceDb().rpc("tok_workforce_list_invitations", { p_restaurant_id: restaurantId });
      if (error) throw error;
      if (!Array.isArray(data)) throw new Error("Le suivi des invitations est indisponible.");
      const invitations = data as WorkforceInvitation[];
      const previous = client.getQueryData<WorkforceInvitation[]>(queryKey);
      if (previous && invitations.some(invitation => invitation.accepted_at &&
        !previous.find(item => item.invitation_id === invitation.invitation_id)?.accepted_at)) {
        void client.invalidateQueries({ queryKey: workforceKey("tok_workforce_employees", restaurantId) });
      }
      return invitations;
    },
  });
}

export function useInviteWorkforceEmployee(restaurantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ employeeId, email }: { employeeId: string; email?: string | null }) => {
      const { data, error } = await workforceDb().rpc("tok_workforce_invite_employee", {
        p_restaurant_id: restaurantId,
        p_employee_id: employeeId,
        p_email: email == null ? null : workforceInvitationEmail(email),
      });
      if (error) throw error;
      const result = data as WorkforceInvitationResult | null;
      if (!result?.invitation_id || result.employee_id !== employeeId || !result.email ||
        !["queued", "processing", "sent"].includes(result.delivery_status)) {
        throw new Error("L’envoi de l’invitation n’a pas été confirmé. Vérifiez le suivi avant de réessayer.");
      }
      return result;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["tok-workforce"] }),
  });
}

export function useRevokeWorkforceInvitation(restaurantId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async (employeeId: string) => {
      const { error } = await workforceDb().rpc("tok_workforce_revoke_invitation", {
        p_restaurant_id: restaurantId, p_employee_id: employeeId,
      });
      if (error) throw error;
    },
    onSuccess: () => client.invalidateQueries({ queryKey: ["tok-workforce"] }),
  });
}

export function useWorkforceNextShift(restaurantId: string, employeeId: string) {
  return useQuery({
    queryKey: [...workforceKey("next-shift", restaurantId), employeeId],
    enabled: !!restaurantId && !!employeeId,
    staleTime: 30_000,
    refetchInterval: 60_000,
    queryFn: async () => {
      const now = workforceZurichClock();
      const { data, error } = await workforceDb().from("tok_workforce_shifts").select("*")
        .eq("restaurant_id", restaurantId).eq("employee_id", employeeId)
        .in("status", ["planned", "confirmed"])
        .or("shift_date.gt." + now.date + ",and(shift_date.eq." + now.date + ",start_time.gte." + now.time + ")")
        .order("shift_date", { ascending: true }).order("start_time", { ascending: true })
        .limit(1).maybeSingle();
      if (error) throw error;
      return data as WorkforceShift | null;
    },
  });
}
