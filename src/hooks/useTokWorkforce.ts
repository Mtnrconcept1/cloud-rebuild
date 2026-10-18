import type { SupabaseClient } from "@supabase/supabase-js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { workforceInvitationEmail, workforceZurichClock } from "@/lib/tokWorkforce";
import { getSupabase } from "@/integrations/supabase/client";
import type {
  WorkforceAbsence, WorkforceEmployee, WorkforceEntry, WorkforceExchange,
  WorkforceRequest, WorkforceSettings, WorkforceShift, WorkforceValidation,
  WorkforceInvitation, WorkforceInvitationResult,
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
  orderBy?:string; ascending?:boolean; startField?:string; start?:string; endField?:string; end?:string; limit?:number; employeeId?:string; secondaryOrderBy?:string;
}) {
  return useQuery({
    queryKey:[...workforceKey(table,restaurantId||""),opts?.start,opts?.end,opts?.employeeId],
    enabled:!!restaurantId && enabled,
    staleTime:10_000,
    queryFn:async()=>{
      let query=workforceDb().from(table).select("*").eq("restaurant_id",restaurantId!);
      if(opts?.employeeId)query=query.eq("employee_id",opts.employeeId);
      if(opts?.startField && opts.start)query=query.gte(opts.startField,opts.start);
      if(opts?.endField && opts.end)query=query.lte(opts.endField,opts.end);
      query=query.order(opts?.orderBy||"created_at",{ascending:opts?.ascending??false});
      if(opts?.secondaryOrderBy)query=query.order(opts.secondaryOrderBy,{ascending:true});
      query=query.limit(opts?.limit??150);
      const {data,error}=await query;
      if(error)throw error;
      return (data||[]) as T[];
    },
  });
}

export function useWorkforceEmployees(restaurantId:string|null, enabled:boolean) {
  return useWorkforceRows<WorkforceEmployee>(restaurantId,"tok_workforce_employees",enabled,{orderBy:"last_name",secondaryOrderBy:"id",ascending:true,limit:200});
}
export function useWorkforceShifts(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceShift>(restaurantId,"tok_workforce_shifts",enabled,{orderBy:"shift_date",ascending:true,startField:"shift_date",start,endField:"shift_date",end,limit:350,employeeId});
}
export function useWorkforceEntries(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",limit:200});
}
export function useWorkforceEntriesInRange(restaurantId:string|null,enabled:boolean,start:string,end:string,employeeId?:string) {
  return useWorkforceRows<WorkforceEntry>(restaurantId,"tok_workforce_time_entries",enabled,{orderBy:"entry_date",startField:"entry_date",start,endField:"entry_date",end,limit:1000,employeeId});
}
export function useWorkforceValidations(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceValidation>(restaurantId,"tok_workforce_validations",enabled,{orderBy:"signed_at",limit:200});
}
export function useWorkforceAbsences(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceAbsence>(restaurantId,"tok_workforce_absences",enabled,{orderBy:"start_date",limit:200,employeeId});
}
export function useWorkforceRequests(restaurantId:string|null,enabled:boolean,employeeId?:string) {
  return useWorkforceRows<WorkforceRequest>(restaurantId,"tok_workforce_requests",enabled,{limit:200,employeeId});
}
export function useWorkforceExchanges(restaurantId:string|null,enabled:boolean) {
  return useWorkforceRows<WorkforceExchange>(restaurantId,"tok_workforce_exchanges",enabled,{limit:200});
}
export function useWorkforceRefresh(restaurantId:string) {
  const client=useQueryClient();
  return ()=>client.invalidateQueries({queryKey:["tok-workforce"]});
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