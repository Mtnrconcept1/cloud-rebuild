import { useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { workforceDb } from "@/hooks/useTokWorkforce";

type Colleague={employee_id:string;display_name:string};
type Exchange={id:string;requester_id:string;requester_shift_id:string;target_employee_id:string;status:string;target_accepted_at:string|null;requester_message:string|null};
type Shift={id:string;employee_id:string;shift_date:string;start_time:string;end_time:string;status:string};
export default function WorkforcePersonalExchanges({restaurantId,employeeId}:{restaurantId:string;employeeId:string}) {
 const {toast}=useToast(),qc=useQueryClient();
 const [shiftId,setShiftId]=useState(""),[targetId,setTargetId]=useState(""),[message,setMessage]=useState("");
 const directory=useQuery({queryKey:["workforce-colleagues",restaurantId,employeeId],queryFn:async()=>{
  const {data,error}=await workforceDb().rpc("tok_workforce_team_directory",{p_restaurant_id:restaurantId});
  if(error)throw error;return (data||[]) as Colleague[];}});
 const today=new Date().toISOString().slice(0,10);
 const shifts=useQuery({queryKey:["workforce-self-shifts",restaurantId,employeeId],queryFn:async()=>{
  const {data,error}=await workforceDb().from("tok_workforce_shifts").select("id,employee_id,shift_date,start_time,end_time,status")
   .eq("restaurant_id",restaurantId).eq("employee_id",employeeId).gte("shift_date",today).order("shift_date").limit(60);
  if(error)throw error;return (data||[]) as Shift[];}});
 const exchanges=useQuery({queryKey:["workforce-self-exchanges",restaurantId,employeeId],queryFn:async()=>{
  const {data,error}=await workforceDb().from("tok_workforce_exchanges")
   .select("id,requester_id,requester_shift_id,target_employee_id,status,target_accepted_at,requester_message")
   .eq("restaurant_id",restaurantId).order("created_at",{ascending:false}).limit(100);
  if(error)throw error;return (data||[]) as Exchange[];}});
 const refresh=()=>{qc.invalidateQueries({queryKey:["workforce-self-exchanges"]});qc.invalidateQueries({queryKey:["tok-workforce"]});};
 const propose=useMutation({mutationFn:async()=>{
  if(!shifts.data?.some(s=>s.id===shiftId&&s.employee_id===employeeId)||targetId===employeeId||!targetId)throw new Error("Service ou collègue invalide");
  const {error}=await workforceDb().from("tok_workforce_exchanges").insert({
   restaurant_id:restaurantId,requester_id:employeeId,requester_shift_id:shiftId,target_employee_id:targetId,
   status:"pending",requester_message:message.trim().slice(0,1000)||null,
  });if(error)throw error;},onSuccess:()=>{setMessage("");setShiftId("");refresh();toast({title:"Proposition d'échange transmise"});},
  onError:(e:Error)=>toast({title:"Échange impossible",description:e.message,variant:"destructive"})});
 const respond=useMutation({mutationFn:async({id,accept}:{id:string;accept:boolean})=>{
  const {error}=await workforceDb().rpc("tok_workforce_respond_exchange",{p_exchange_id:id,p_accept:accept});
  if(error)throw error;},onSuccess:()=>{refresh();toast({title:"Réponse enregistrée"});},
  onError:(e:Error)=>toast({title:"Réponse impossible",description:e.message,variant:"destructive"})});
 const name=(id:string)=>directory.data?.find(e=>e.employee_id===id)?.display_name||"Collaborateur";
 return <div className="grid gap-5 lg:grid-cols-2">
  <Card><CardHeader><CardTitle>Proposer un échange</CardTitle></CardHeader><CardContent>
   <form className="space-y-3" onSubmit={e=>{e.preventDefault();propose.mutate()}}>
    <label className="block text-sm">Mon service
      <select required className="mt-1 block w-full rounded-md border bg-background p-2" value={shiftId} onChange={e=>setShiftId(e.target.value)}>
       <option value="">Choisir un service…</option>
       {shifts.data?.filter(s=>s.status!=="cancelled").map(s=><option key={s.id} value={s.id}>{s.shift_date} {s.start_time.slice(0,5)} – {s.end_time.slice(0,5)}</option>)}
      </select>
    </label>
    <label className="block text-sm">Collègue sollicité
      <select required className="mt-1 block w-full rounded-md border bg-background p-2" value={targetId} onChange={e=>setTargetId(e.target.value)}>
       <option value="">Choisir un collègue…</option>
       {directory.data?.filter(e=>e.employee_id!==employeeId).map(e=><option key={e.employee_id} value={e.employee_id}>{e.display_name}</option>)}
      </select>
    </label>
    <Input placeholder="Motif (facultatif)" maxLength={1000} value={message} onChange={e=>setMessage(e.target.value)}/>
    <p className="text-xs text-muted-foreground">Le collègue doit accepter, puis le responsable valide le changement de planning.</p>
    <Button disabled={propose.isPending||!shiftId||!targetId} type="submit">Demander un échange</Button>
   </form>
  </CardContent></Card>
  <Card><CardHeader><CardTitle>Échanges et validations</CardTitle></CardHeader><CardContent className="space-y-3">
   {exchanges.isError?<p role="alert" className="text-destructive">Échanges indisponibles.</p>:null}
   {exchanges.data?.length===0?<p className="text-muted-foreground">Aucune demande.</p>:null}
   {exchanges.data?.map(e=><div key={e.id} className="space-y-2 rounded-xl border p-3 text-sm">
    <p className="font-semibold">{name(e.requester_id)} → {name(e.target_employee_id)}</p>
    <p className="text-muted-foreground">{e.status==="pending"?(e.target_accepted_at?"Accepté, validation du responsable en attente":"En attente d'accord du collègue"):e.status==="approved"?"Échange validé":"Échange refusé ou annulé"}</p>
    {e.requester_message?<p>{e.requester_message}</p>:null}
    {e.target_employee_id===employeeId&&e.status==="pending"&&!e.target_accepted_at?<div className="flex flex-wrap gap-2">
      <Button size="sm" disabled={respond.isPending} onClick={()=>respond.mutate({id:e.id,accept:true})}>Accepter</Button>
      <Button size="sm" variant="outline" disabled={respond.isPending} onClick={()=>respond.mutate({id:e.id,accept:false})}>Refuser</Button>
    </div>:null}
   </div>)}
  </CardContent></Card>
 </div>;
}
