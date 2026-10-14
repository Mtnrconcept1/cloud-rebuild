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
  return useQuery({
    queryKey:workforceKey("settings",restaurantId||""),
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
  orderBy?:string; ascending?:boolean; startField?:string; start?:string; endField?:string; end?:string; limit?:number;
}) {
  return useQuery({
    queryKey:[...workforceKey(table,restaurantId||""),opts?.start,opts?.end],
    enabled:!!restaurantId && enabled,
    staleTime:10_000,
    queryFn:async()=>{
      let query=workforceDb().from(table).select("*").eq("restaurant_id",restaurantId!);
      if(opts?.startField && opts.start)query=query.gte(opts.startField,opts.start);
      if(opts?.endField && opts.end)query=query.lte(opts.endField,opts.end);
      query=query.order(opts?.orderBy||"created_at",{ascending:opts?.ascending??false}).limit(opts?.limit??150);
      const {data,error}=await query;
      if(error)throw error;
      return (data||[]) as T[];
    },
  });
}

export function useWorkforceEmployees(restaurantId:string|null, enabled:boolean) {
  return useWorkforceRows<WorkforceEmployee>(restaurantId,"tok_workforce_employees",enabled,{orderBy:"last_name",ascending:true,limit:200});
}
export function useWorkforceShifts(restaurantId:string|null,enabled:boolean,start:string,end:string) {
  return useWorkforceRows<WorkforceShift>(restaurantId,"tok_workforce_shifts",enabled,{orderBy:"shift_date",ascending:true,startField:"shift_date",start,endField:"shift_date",end,limit:350});
}
export function useWorkforceEntries(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",limit:200});
}
export function useWorkforceEntriesInRange(restaurantId:string|null,enabled:boolean,start:string,end:string) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",startField:"entry_date",start,endField:"entry_date",end,limit:1000});
}
export function useWorkforceValidations(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceValidation>(restaurantId,"tok_workforce_validations",enabled,{orderBy:"signed_at",limit:200});
}
export function useWorkforceAbsences(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceAbsence>(restaurantId,"tok_workforce_absences",enabled,{orderBy:"start_date",limit:200});
}
export function useWorkforceRequests(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceRequest>(restaurantId,"tok_workforce_requests",enabled,{limit:200});
}
export function useWorkforceExchanges(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceExchange>(restaurantId,"tok_workforce_exchanges",enabled,{limit:200});
}
export function useWorkforceRefresh(restaurantId:string) {
  const client=useQueryClient();
  return ()=>client.invalidateQueries({queryKey:["tok-workforce"]});
}
