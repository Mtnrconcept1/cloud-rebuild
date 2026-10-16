import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Clock3, AlertTriangle } from "lucide-react";
import { Card,CardHeader,CardContent,CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { workforceDb, useWorkforceEmployees, useWorkforceEntries } from "@/hooks/useTokWorkforce";
import { useToast } from "@/hooks/use-toast";
import { Input } from "@/components/ui/input";
import { employeeName } from "@/lib/tokWorkforce";
import { useAuth } from "@/lib/auth-context";

type ClockRow={id:string;employee_id:string;clock_in_at:string;clock_out_at:string|null;pause_started_at:string|null;entry_id:string|null};
export default function WorkforceClockOverview({restaurantId}:{restaurantId:string}) {
 const {user}=useAuth();
 const employees=useWorkforceEmployees(restaurantId,true);
 const entries=useWorkforceEntries(restaurantId,true);
 const [sessionId,setSessionId]=useState(""),[entryId,setEntryId]=useState(""),[reason,setReason]=useState("");
 const {toast}=useToast(),qc=useQueryClient();
 const reconcile=useMutation({mutationFn:async()=>{
   const {error}=await workforceDb().rpc("tok_workforce_reconcile_clock",{p_session_id:sessionId,p_entry_id:entryId,p_reason:reason.trim()});
   if(error)throw error;
 },onSuccess:async()=>{setSessionId("");setEntryId("");setReason("");await Promise.all([qc.invalidateQueries({queryKey:["workforce-clock-overview",restaurantId]}),qc.invalidateQueries({queryKey:["tok-workforce"]})]);toast({title:"Pointage régularisé",description:"Le relevé peut maintenant être signé dans l’onglet Heures."});},
 onError:(err:Error)=>toast({title:"Régularisation impossible",description:err.message,variant:"destructive"})});
 const rows=useQuery({queryKey:["workforce-clock-overview",restaurantId,user?.id],enabled:Boolean(user?.id),refetchInterval:30000,
   queryFn:async()=>{
   const sessions:ClockRow[]=[];
   for(let offset=0;offset<=10000;offset+=500){
    const {data,error}=await workforceDb().from("tok_workforce_clock_sessions")
     .select("id,employee_id,clock_in_at,clock_out_at,pause_started_at,entry_id")
     .eq("restaurant_id",restaurantId).or("clock_out_at.is.null,entry_id.is.null")
     .order("clock_in_at",{ascending:false}).order("id",{ascending:true}).range(offset,offset+499);
    if(error)throw error;
    sessions.push(...(data||[]) as ClockRow[]);
    if(sessions.length>10000)throw new Error("Trop de pointages à vérifier : contactez le support TOK.");
    if((data?.length||0)<500)return sessions;
   }
   throw new Error("Trop de pointages à vérifier : contactez le support TOK.");
  }});
 const unavailable=rows.isPending||rows.isError;
 const active=unavailable?[]:rows.data?.filter(s=>!s.clock_out_at)||[];
 const pending=unavailable?[]:rows.data?.filter(s=>s.clock_out_at&&!s.entry_id)||[];
 const stamp=(iso:string)=>new Intl.DateTimeFormat("fr-CH",{timeZone:"Europe/Zurich",dateStyle:"short",timeStyle:"short"}).format(new Date(iso));
 return <div className="grid gap-4 lg:grid-cols-2">
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex gap-2 items-center"><Clock3 className="h-5 w-5 text-primary"/>Présences en temps réel ({unavailable?"—":active.length})</CardTitle></CardHeader>
    <CardContent className="space-y-2">
     {rows.isPending?<p className="text-muted-foreground">Chargement…</p>:null}
     {rows.isError?<p role="alert" className="text-destructive">Impossible de récupérer les pointages. {rows.error.message}</p>:null}
     {!active.length&&!unavailable?<p className="text-muted-foreground">Aucun service actif.</p>:null}
     {active.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
       <div><p className="font-medium">{employeeName(employees.data?.find(e=>e.id===s.employee_id))}</p><p className="text-xs text-muted-foreground">Depuis {stamp(s.clock_in_at)}</p></div>
       <Badge variant={s.pause_started_at?"secondary":"default"}>{s.pause_started_at?"En pause":"En service"}</Badge>
     </div>)}
     <Button asChild variant="outline"><Link to="/equipe/mon-espace">Ouvrir mon espace collaborateur</Link></Button>
     <p className="text-xs text-muted-foreground">Chaque collaborateur doit se connecter avec son propre compte TOK et son email vérifié. Aucun badgeage au nom d'une autre personne.</p>
    </CardContent></Card>
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Pointages à contrôler ({unavailable?"—":pending.length})</CardTitle></CardHeader>
    <CardContent className="space-y-2">
     {unavailable?<p className="text-sm text-muted-foreground">Le contrôle des sessions est en attente des données.</p>:null}
     {!pending.length&&!unavailable?<p className="text-sm text-muted-foreground">Aucune session à régulariser.</p>:null}
     {pending.map(s=><div key={s.id} className="rounded-xl border p-3 text-sm">
      <span className="font-medium">{employeeName(employees.data?.find(e=>e.id===s.employee_id))}</span><p className="text-muted-foreground">{stamp(s.clock_in_at)} – {s.clock_out_at?stamp(s.clock_out_at):""}</p>
      <p className="text-xs text-destructive">Créez le relevé corrigé dans l’onglet Heures puis associez-le ici avant de le signer.</p>
      <Button size="sm" variant="outline" disabled={reconcile.isPending} onClick={()=>{setSessionId(s.id);setEntryId("");setReason("");}}>Régulariser ce pointage</Button>
      {sessionId===s.id?<form className="mt-3 space-y-2" onSubmit={e=>{e.preventDefault();reconcile.mutate();}}>
       <select required aria-label="Relevé corrigé" className="w-full rounded-md border bg-background p-2" value={entryId} onChange={e=>setEntryId(e.target.value)}>
        <option value="">Choisir le relevé corrigé…</option>
        {(entries.data||[]).filter(e=>e.employee_id===s.employee_id).map(e=><option key={e.id} value={e.id}>{e.entry_date} · {e.start_time.slice(0,5)}–{e.end_time.slice(0,5)}</option>)}
       </select>
       <Input required minLength={5} maxLength={1000} aria-label="Motif de régularisation" placeholder="Motif de la correction" value={reason} onChange={e=>setReason(e.target.value)}/>
       <Button type="submit" disabled={reconcile.isPending||entries.isPending||entries.isError||!entryId||reason.trim().length<5}>Confirmer l’association</Button>
      </form>:null}
     </div>)}
     <p className="text-xs text-muted-foreground">Les heures badgées créent des relevés à valider dans l'onglet « Heures ».</p>
    </CardContent></Card>
 </div>;
}
