import { useState,type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight,Check,X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { employeeName } from "@/lib/tokWorkforce";
import { useWorkforceEmployees,useWorkforceExchanges,useWorkforceRefresh,useWorkforceShifts,workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforceExchanges({restaurantId}:{restaurantId:string}) {
  const {data:employees=[]}=useWorkforceEmployees(restaurantId,true);
  const now=new Date();const from=new Date(now);from.setDate(from.getDate()-14);
  const until=new Date(now);until.setDate(until.getDate()+60);
  const date=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const {data:shifts=[]}=useWorkforceShifts(restaurantId,true,date(from),date(until));
  const {data:exchanges=[],isPending,isError}=useWorkforceExchanges(restaurantId,true);
  const refresh=useWorkforceRefresh(restaurantId),{toast}=useToast();
  const [requesterShift,setRequesterShift]=useState("");
  const [targetEmployee,setTargetEmployee]=useState("");
  const [targetShift,setTargetShift]=useState("");
  const selectedShift=shifts.find(s=>s.id===requesterShift);
  const create=useMutation({
    mutationFn:async()=>{
      if(!selectedShift)throw new Error("Sélectionnez un service.");
      if(!targetEmployee||selectedShift.employee_id===targetEmployee||!employees.some(e=>e.id===targetEmployee&&e.is_active))
        throw new Error("Choisissez un autre collaborateur actif.");
      if(targetShift && !shifts.some(s=>s.id===targetShift&&s.employee_id===targetEmployee))throw new Error("Le service échangé ne correspond pas à l'employé ciblé.");
      const {error}=await workforceDb().from("tok_workforce_exchanges").insert({
        restaurant_id:restaurantId,requester_id:selectedShift.employee_id,requester_shift_id:selectedShift.id,
        target_employee_id:targetEmployee,target_shift_id:targetShift||null,status:"pending",
      });if(error)throw error;
    },
    onSuccess:()=>{setRequesterShift("");setTargetShift("");refresh();toast({title:"Échange proposé",description:"Il attend la validation du responsable."});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Proposition impossible",description:error.message}),
  });
  const review=useMutation({
    mutationFn:async({id,approve}:{id:string;approve:boolean})=>{
      const {error}=await workforceDb().rpc("tok_workforce_review_exchange",{p_exchange_id:id,p_approve:approve});
      if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Échange traité",description:"Le planning est mis à jour automatiquement si accepté."});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Échange non validé",description:error.message}),
  });
  const options=shifts.filter(s=>s.status!=="cancelled");
  const displayShift=(id:string)=>{
    const shift=shifts.find(s=>s.id===id);
    return shift?employeeName(employees.find(e=>e.id===shift.employee_id))+" · "+shift.shift_date+" "+shift.start_time.slice(0,5)+"–"+shift.end_time.slice(0,5):"Service antérieur";
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <Card className="rounded-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary"/>Échanges de services</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isPending?<p className="text-muted-foreground">Chargement…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les échanges.</p>:null}
        {!isPending&&exchanges.length===0?<p className="text-muted-foreground">Aucune proposition en attente.</p>:null}
        {exchanges.map(exchange=><div key={exchange.id} className="rounded-xl border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{employeeName(employees.find(e=>e.id===exchange.requester_id))} → {employeeName(employees.find(e=>e.id===exchange.target_employee_id))}</p>
            <Badge variant={exchange.status==="rejected"?"destructive":"secondary"}>{exchange.status==="pending"?"En attente":exchange.status==="approved"?"Approuvé":exchange.status==="rejected"?"Refusé":"Annulé"}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{displayShift(exchange.requester_shift_id)}</p>
          {exchange.target_shift_id?<p className="text-xs text-muted-foreground">Contre : {displayShift(exchange.target_shift_id)}</p>:<p className="text-xs text-muted-foreground">Reprise du service sans échange réciproque</p>}
          {exchange.status==="pending"?<div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" disabled={review.isPending} onClick={()=>review.mutate({id:exchange.id,approve:true})}><Check className="mr-1 h-4 w-4"/>Valider et déplacer</Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={()=>review.mutate({id:exchange.id,approve:false})}><X className="mr-1 h-4 w-4"/>Refuser</Button>
          </div>:null}
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle>Proposer un échange</CardTitle></CardHeader>
      <CardContent><form className="space-y-3" onSubmit={(event:FormEvent)=>{event.preventDefault();create.mutate();}}>
        <div><Label htmlFor="wf-exchange-shift">Service à remplacer</Label><select id="wf-exchange-shift" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={requesterShift} onChange={e=>{setRequesterShift(e.target.value);setTargetShift("");}}>
          <option value="">Sélectionner…</option>{options.map(s=><option key={s.id} value={s.id}>{displayShift(s.id)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-exchange-target">Collaborateur remplaçant</Label><select id="wf-exchange-target" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={targetEmployee} onChange={e=>{setTargetEmployee(e.target.value);setTargetShift("");}}>
          <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active&&e.id!==selectedShift?.employee_id).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-exchange-target-shift">Service échangé (facultatif)</Label><select id="wf-exchange-target-shift" className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={targetShift} onChange={e=>setTargetShift(e.target.value)}>
          <option value="">Simple remplacement</option>{options.filter(s=>s.employee_id===targetEmployee&&s.id!==requesterShift).map(s=><option key={s.id} value={s.id}>{displayShift(s.id)}</option>)}
        </select></div>
        <p className="text-xs text-muted-foreground">L'affectation du planning change uniquement lorsque le responsable approuve l'échange.</p>
        <Button type="submit" className="w-full" disabled={create.isPending||!options.length}>Soumettre l'échange</Button>
      </form></CardContent>
    </Card>
  </div>;
}
