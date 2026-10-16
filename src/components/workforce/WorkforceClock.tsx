import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { workforceDb } from "@/hooks/useTokWorkforce";

type Session = {id:string;clock_in_at:string;clock_out_at:string|null;pause_started_at:string|null;entry_id:string|null};
export default function WorkforceClock({restaurantId, employeeId}:{restaurantId:string;employeeId:string}) {
 const {toast}=useToast();const qc=useQueryClient();
 const query=useQuery({queryKey:["workforce-clock",restaurantId,employeeId],refetchInterval:30000,
  queryFn:async()=>{const {data,error}=await workforceDb().from("tok_workforce_clock_sessions")
  .select("id,clock_in_at,clock_out_at,pause_started_at,entry_id")
  .eq("restaurant_id",restaurantId).eq("employee_id",employeeId).order("clock_in_at",{ascending:false}).limit(30);
  if(error)throw error;return (data||[]) as Session[];}});
 const unavailable=query.isPending||query.isError||query.isFetching;
 const live=query.data?.find(s=>!s.clock_out_at),paused=Boolean(live?.pause_started_at);
 const punch=useMutation({mutationFn:async(action:string)=>{const {data,error}=await workforceDb().rpc("tok_workforce_punch",{p_restaurant_id:restaurantId,p_action:action});
  if(error)throw error;return data as {time_entry_id?:string|null};},
  onSuccess:(data,action)=>{
    toast({title:"Pointage enregistré",description:action==="clock_out"&&!data?.time_entry_id?"Relevé à régulariser par le responsable":undefined});},
  onSettled:async()=>{await Promise.all([qc.invalidateQueries({queryKey:["workforce-clock"]}),qc.invalidateQueries({queryKey:["workforce-clock-overview"]}),qc.invalidateQueries({queryKey:["tok-workforce"]})]);},
  onError:(err:Error)=>toast({title:"Pointage impossible",description:err.message,variant:"destructive"})});
 const stamp=(date:string)=>new Intl.DateTimeFormat("fr-CH",{dateStyle:"short",timeStyle:"short",timeZone:"Europe/Zurich"}).format(new Date(date));
 return <div className="space-y-4">
  <Card className="rounded-3xl border-primary/30 bg-primary/5">
   <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary"/>Badgeuse TOK</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    {query.isPending?<p>Chargement du pointage…</p>:null}
    {query.isError?<p role="alert" className="text-destructive">État indisponible. Aucun pointage possible.</p>:null}
    <p className="text-lg font-semibold">{query.isError?"État inconnu":query.isPending?"Vérification…":!live?"Hors service":paused?"En pause":"En service"}</p>
    {live?<p className="text-sm text-muted-foreground">Arrivée : {stamp(live.clock_in_at)}</p>:null}
    <div className="flex flex-wrap gap-3">
     {!live?<Button disabled={punch.isPending||unavailable} onClick={()=>punch.mutate("clock_in")}>Badger l'arrivée</Button>:null}
     {live&&!paused?<><Button variant="secondary" disabled={punch.isPending||unavailable} onClick={()=>punch.mutate("break_start")}>Début de pause</Button>
      <Button disabled={punch.isPending||unavailable} onClick={()=>punch.mutate("clock_out")}>Badger le départ</Button></>:null}
     {live&&paused?<Button disabled={punch.isPending||unavailable} onClick={()=>punch.mutate("break_end")}>Terminer la pause</Button>:null}
    </div>
    <p className="text-xs text-muted-foreground">Pointages horodatés sur le serveur, fuseau Europe/Zurich. Aucun antidatage possible.</p>
   </CardContent></Card>
  <Card><CardHeader><CardTitle>Derniers pointages</CardTitle></CardHeader><CardContent className="space-y-2">
   {query.data?.map(s=><div key={s.id} className="rounded-lg border p-3 text-sm">
    {stamp(s.clock_in_at)} → {s.clock_out_at?stamp(s.clock_out_at):"En cours"}
    {s.clock_out_at&&!s.entry_id?<span className="ml-3 text-destructive">À régulariser</span>:null}</div>)}
  </CardContent></Card>
 </div>;
}
