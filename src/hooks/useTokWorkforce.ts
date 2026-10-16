import { useAuth } from "@/lib/auth-context";
import type { SupabaseClient } from "@supabase/supabase-js";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabase } from "@/integrations/supabase/client";
import type {
  WorkforceAbsence, WorkforceEmployee, WorkforceEntry, WorkforceExchange,
  WorkforceRequest, WorkforceSettings, WorkforceShift, WorkforceValidation,
} from "@/lib/tokWorkforce";

/** The TOK database client is already authenticated and scoped by RLS.
 * Until types are regenerated after migration, we access only namespaced tables. */
export const workforceDb = (): SupabaseClient => getSupabase() as unknown as SupabaseClient;
export const workforceKey = (table:string, restaurantId:string) => ["tok-workforce",table,restaurantId] as const;

export function useWorkforceSettings(restaurantId:string|null) {
  const {user}=useAuth();
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

export function useWorkforceRows<T>(restaurantId:string|null, table:string, enabled:boolean, opts?:{
  orderBy?:string; ascending?:boolean; startField?:string; start?:string; endField?:string; end?:string; limit?:number; employeeId?:string; complete?:boolean;
}) {
  const {user}=useAuth();
  return useQuery({
    queryKey:[...workforceKey(table,restaurantId||""),user?.id,opts],
    enabled:!!restaurantId && enabled,
    staleTime:10_000,
    queryFn:async()=>{
      const select=table==="tok_workforce_time_entries"
        ? "*,tok_workforce_clock_sessions(clock_in_at,clock_out_at,break_seconds,reconciled_at)" : "*";
      const rows:T[]=[];
      const pageSize=Math.min(opts?.limit??150,500);
      for(let offset=0;offset<=10000;offset+=pageSize){
        let query=workforceDb().from(table).select(select).eq("restaurant_id",restaurantId!);
        if(opts?.employeeId)query=query.eq("employee_id",opts.employeeId);
        if(opts?.startField && opts.start)query=query.gte(opts.startField,opts.start);
        if(opts?.endField && opts.end)query=query.lte(opts.endField,opts.end);
        query=query.order(opts?.orderBy||"created_at",{ascending:opts?.ascending??false}).order("id",{ascending:true});
        query=opts?.complete?query.range(offset,offset+pageSize-1):query.limit(opts?.limit??150);
        const {data,error}=await query;
        if(error)throw error;
        rows.push(...(data||[]) as unknown as T[]);
        if(rows.length>10000)throw new Error("Trop de résultats : choisissez une période plus courte pour obtenir un relevé complet.");
        if(!opts?.complete||(data?.length||0)<pageSize)return rows;
      }
      throw new Error("Période trop étendue pour obtenir un relevé complet.");
    },
  });
}

export function useWorkforceEmployees(restaurantId:string|null, enabled:boolean) {
  return useWorkforceRows<WorkforceEmployee>(restaurantId,"tok_workforce_employees",enabled,{orderBy:"last_name",ascending:true,limit:200,complete:true});
}
export function useWorkforceShifts(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceShift>(restaurantId,"tok_workforce_shifts",enabled,{orderBy:"shift_date",ascending:true,startField:"shift_date",start,endField:"shift_date",end,employeeId,limit:350,complete:true});
}
export function useWorkforceEntries(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",limit:200});
}
export function useWorkforceEntriesInRange(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",startField:"entry_date",start,endField:"entry_date",end,employeeId,limit:999,complete:true});
}
export function useWorkforceValidations(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceValidation>(restaurantId,"tok_workforce_validations",enabled,{orderBy:"signed_at",limit:200});
}
export function useWorkforceAbsences(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceAbsence>(restaurantId,"tok_workforce_absences",enabled,{orderBy:"start_date",employeeId,limit:200,complete:true});
}
export function useWorkforceRequests(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceRequest>(restaurantId,"tok_workforce_requests",enabled,{employeeId,limit:200});
}
export function useWorkforceExchanges(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceExchange>(restaurantId,"tok_workforce_exchanges",enabled,{limit:200});
}
export function useWorkforceRefresh(restaurantId:string) {
  const client=useQueryClient();
  return ()=>Promise.all([client.invalidateQueries({queryKey:["tok-workforce"]}),client.invalidateQueries({queryKey:["workforce-clock-overview",restaurantId]})]);
}
