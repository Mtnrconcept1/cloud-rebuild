import { useState,type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeftRight,Check,X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { employeeName, workforceZurichClock,type WorkforceExchange } from "@/lib/tokWorkforce";
import { useWorkforceEmployees,useWorkforceExchanges,useWorkforceRefresh,useWorkforceShifts,workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforceExchanges({restaurantId}:{restaurantId:string}) {
  const {data:employees=[],isError:employeesError,isPending:employeesPending}=useWorkforceEmployees(restaurantId,true);
  const now=new Date();const from=new Date(now);from.setDate(from.getDate()-14);
  const until=new Date(now);until.setDate(until.getDate()+60);
  const date=(d:Date)=>[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");
  const {data:shifts=[],isError:shiftsError,isPending:shiftsPending}=useWorkforceShifts(restaurantId,true,date(from),date(until));
  const {data:exchanges=[],isPending,isError}=useWorkforceExchanges(restaurantId,true);
  const refresh=useWorkforceRefresh(restaurantId),{toast}=useToast();
  const [requesterShift,setRequesterShift]=useState("");
  const [targetEmployee,setTargetEmployee]=useState("");
  const [targetShift,setTargetShift]=useState("");
  const [statusFilter,setStatusFilter]=useState("all");
  const [message,setMessage]=useState("");
  const [decision,setDecision]=useState<{exchange:WorkforceExchange;approve:boolean}|null>(null);
  const [managerNotes,setManagerNotes]=useState("");
  const unavailable=employeesError||employeesPending||shiftsError||shiftsPending;
  const selectedShift=shifts.find(s=>s.id===requesterShift);
  const create=useMutation({
    mutationFn:async()=>{
      if(unavailable||!selectedShift||!["planned","confirmed"].includes(selectedShift.status))throw new Error("Sélectionnez un service à venir.");
      if(!targetEmployee||selectedShift.employee_id===targetEmployee||!employees.some(e=>e.id===targetEmployee&&e.is_active))
        throw new Error("Choisissez un autre collaborateur actif.");
      if(targetShift && !shifts.some(s=>s.id===targetShift&&s.employee_id===targetEmployee))throw new Error("Le service échangé ne correspond pas à l'employé ciblé.");
      const {data,error}=await workforceDb().from("tok_workforce_exchanges").insert({
        restaurant_id:restaurantId,requester_id:selectedShift.employee_id,requester_shift_id:selectedShift.id,
        target_employee_id:targetEmployee,target_shift_id:targetShift||null,status:"pending",requester_message:message.trim().slice(0,1000)||null,
      }).select("id").single();if(error)throw error;if(!data?.id)throw new Error("La proposition n’a pas pu être confirmée.");
    },
    onSuccess:()=>{setRequesterShift("");setTargetShift("");setMessage("");refresh();toast({title:"Échange proposé",description:"Le collègue doit accepter avant la validation du responsable."});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Proposition impossible",description:error.message}),
  });
  const review=useMutation({
    mutationFn:async()=>{
      if(!decision||decision.exchange.restaurant_id!==restaurantId||decision.exchange.status!=="pending")throw new Error("Cette proposition ne peut plus être traitée. Actualisez la liste.");
      if(decision.approve&&(!decision.exchange.target_accepted_at||!decision.exchange.target_accepted_by))throw new Error("Le collègue doit confirmer son accord depuis son compte TOK avant validation.");
      if(managerNotes.length>2000)throw new Error("Le commentaire est limité à 2 000 caractères.");
      const {error}=await workforceDb().rpc("tok_workforce_review_exchange",{p_exchange_id:decision.exchange.id,p_approve:decision.approve,p_manager_notes:managerNotes.trim()||null});
      if(error)throw error;
    },
    onSuccess:()=>{setDecision(null);setManagerNotes("");void refresh();toast({title:"Échange traité",description:"Le planning est mis à jour automatiquement si accepté. Votre commentaire est visible par les collaborateurs."});},
  });
  const openDecision=(exchange:WorkforceExchange,approve:boolean)=>{review.reset();setManagerNotes("");setDecision({exchange,approve});};
  const today=workforceZurichClock().date;
  const options=shifts.filter(s=>["planned","confirmed"].includes(s.status)&&s.shift_date>=today);
  const displayShift=(id:string)=>{
    const shift=shifts.find(s=>s.id===id);
    return shift?employeeName(employees.find(e=>e.id===shift.employee_id))+" · "+shift.shift_date+" "+shift.start_time.slice(0,5)+"–"+shift.end_time.slice(0,5):"Service hors de la période affichée";
  };
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <Card className="rounded-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="h-5 w-5 text-primary"/>Échanges de services</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div><Label htmlFor="wf-exchange-filter">État des échanges</Label><select id="wf-exchange-filter" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Tous</option><option value="pending">En attente</option><option value="approved">Approuvés</option><option value="rejected">Refusés</option><option value="cancelled">Annulés</option></select></div>
        {isPending?<p className="text-muted-foreground">Chargement…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les échanges.</p>:null}
        {!isPending&&exchanges.length===0?<p className="text-muted-foreground">Aucune proposition en attente.</p>:null}
        {exchanges.filter(exchange=>statusFilter==="all"||exchange.status===statusFilter).map(exchange=><div key={exchange.id} className="rounded-xl border border-border/60 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="font-semibold">{employeeName(employees.find(e=>e.id===exchange.requester_id))} → {employeeName(employees.find(e=>e.id===exchange.target_employee_id))}</p>
            <Badge variant={exchange.status==="rejected"?"destructive":"secondary"}>{exchange.status==="pending"?"En attente":exchange.status==="approved"?"Approuvé":exchange.status==="rejected"?"Refusé":"Annulé"}</Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{displayShift(exchange.requester_shift_id)}</p>
          {exchange.target_shift_id?<p className="text-xs text-muted-foreground">Contre : {displayShift(exchange.target_shift_id)}</p>:<p className="text-xs text-muted-foreground">Reprise du service sans échange réciproque</p>}
          {exchange.requester_message?<p className="mt-2 whitespace-pre-wrap break-words text-sm">{exchange.requester_message}</p>:null}
          {exchange.manager_notes?<p className="mt-2 rounded-lg bg-muted/40 p-2 text-sm">Responsable : {exchange.manager_notes}</p>:null}
          {exchange.status==="pending"?<div className="mt-3 flex flex-wrap gap-2">
            {!exchange.target_accepted_at||!exchange.target_accepted_by?<p className="w-full text-xs text-muted-foreground">{exchange.target_accepted_at?"L’ancien accord doit être confirmé à nouveau depuis le compte TOK du collègue.":"En attente de l’accord du collègue depuis son espace TOK."}</p>:null}
            <Button size="sm" disabled={review.isPending||!exchange.target_accepted_at||!exchange.target_accepted_by||isError} onClick={()=>openDecision(exchange,true)}><Check className="mr-1 h-4 w-4"/>Valider et déplacer</Button>
            <Button size="sm" variant="outline" disabled={review.isPending||isError} onClick={()=>openDecision(exchange,false)}><X className="mr-1 h-4 w-4"/>Refuser</Button>
          </div>:null}
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle>Proposer un échange</CardTitle></CardHeader>
      <CardContent>{employeesError||shiftsError?<p role="alert" className="mb-3 text-sm text-destructive">Collaborateurs ou planning indisponibles. Actualisez avant de proposer un échange.</p>:null}<form className="space-y-3" onSubmit={(event:FormEvent)=>{event.preventDefault();if(!create.isPending)create.mutate();}}>
        <div><Label htmlFor="wf-exchange-shift">Service à remplacer</Label><select id="wf-exchange-shift" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={requesterShift} onChange={e=>{setRequesterShift(e.target.value);setTargetShift("");}}>
          <option value="">Sélectionner…</option>{options.map(s=><option key={s.id} value={s.id}>{displayShift(s.id)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-exchange-message">Message (facultatif)</Label><textarea id="wf-exchange-message" maxLength={1000} className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" value={message} onChange={e=>setMessage(e.target.value)}/></div>
        <div><Label htmlFor="wf-exchange-target">Collaborateur remplaçant</Label><select id="wf-exchange-target" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={targetEmployee} onChange={e=>{setTargetEmployee(e.target.value);setTargetShift("");}}>
          <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active&&e.id!==selectedShift?.employee_id).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-exchange-target-shift">Service échangé (facultatif)</Label><select id="wf-exchange-target-shift" className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={targetShift} onChange={e=>setTargetShift(e.target.value)}>
          <option value="">Simple remplacement</option>{options.filter(s=>s.employee_id===targetEmployee&&s.id!==requesterShift).map(s=><option key={s.id} value={s.id}>{displayShift(s.id)}</option>)}
        </select></div>
        <p className="text-xs text-muted-foreground">L'affectation du planning change uniquement lorsque le responsable approuve l'échange.</p>
        {create.error?<p role="alert" className="text-sm text-destructive">{create.error.message}</p>:null}
        <Button type="submit" className="w-full" disabled={create.isPending||unavailable||!options.length}>Soumettre l'échange</Button>
      </form></CardContent>
    </Card>
    {decision?<Dialog open onOpenChange={open=>{if(!open&&!review.isPending)setDecision(null);}}><DialogContent hideCloseButton={review.isPending}>
      <DialogHeader><DialogTitle>{decision.approve?"Valider l’échange":"Refuser l’échange"}</DialogTitle><DialogDescription>{decision.approve?"Les affectations seront modifiées ensemble après contrôle des services et disponibilités. Le commentaire sera visible par les deux collaborateurs.":"Le planning restera inchangé. Les collaborateurs pourront lire votre décision et son commentaire."}</DialogDescription></DialogHeader>
      <div className="space-y-1 text-sm"><p>{displayShift(decision.exchange.requester_shift_id)}</p>{decision.exchange.target_shift_id?<p>En retour : {displayShift(decision.exchange.target_shift_id)}</p>:null}</div>
      <form className="space-y-4" onSubmit={event=>{event.preventDefault();if(!review.isPending)review.mutate();}}><div><Label htmlFor="wf-exchange-review-note">Commentaire de décision (facultatif)</Label><Textarea id="wf-exchange-review-note" maxLength={2000} disabled={review.isPending} value={managerNotes} onChange={event=>setManagerNotes(event.target.value)}/></div>
        {review.error?<p role="alert" className="text-sm text-destructive">{review.error.message}</p>:null}
        <DialogFooter><Button type="button" variant="outline" disabled={review.isPending} onClick={()=>setDecision(null)}>Annuler</Button><Button type="submit" disabled={review.isPending}>{review.isPending?"Traitement…":"Confirmer la décision"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>:null}
  </div>;
}
