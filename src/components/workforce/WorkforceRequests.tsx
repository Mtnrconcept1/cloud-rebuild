import { useState,type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardList, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { employeeName } from "@/lib/tokWorkforce";
import { useWorkforceEmployees,useWorkforceRequests,useWorkforceRefresh,workforceDb } from "@/hooks/useTokWorkforce";

const requestTypes=[
  {value:"vacation",label:"Congé"},{value:"correction",label:"Correction d'heures"},
  {value:"schedule",label:"Planning"},{value:"other",label:"Autre"},
] as const;

export default function WorkforceRequests({restaurantId}:{restaurantId:string}) {
  const {user}=useAuth();
  const {data:employees=[]}=useWorkforceEmployees(restaurantId,true);
  const {data:requests=[],isPending,isError}=useWorkforceRequests(restaurantId,true);
  const refresh=useWorkforceRefresh(restaurantId),{toast}=useToast();
  const [employeeId,setEmployeeId]=useState(""),[type,setType]=useState<"vacation"|"correction"|"schedule"|"other">("vacation"),[description,setDescription]=useState("");
  const create=useMutation({
    mutationFn:async()=>{
      if(!employees.some(e=>e.id===employeeId))throw new Error("Choisissez un employé.");
      if(description.trim().length<1||description.length>2000)throw new Error("Description invalide.");
      const {error}=await workforceDb().from("tok_workforce_requests").insert({
        restaurant_id:restaurantId,employee_id:employeeId,request_type:type,description:description.trim(),status:"pending",
      });if(error)throw error;
    },
    onSuccess:()=>{setDescription("");refresh();toast({title:"Demande enregistrée"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Création impossible",description:error.message}),
  });
  const review=useMutation({
    mutationFn:async({id,approve}:{id:string;approve:boolean})=>{
      if(!user?.id)throw new Error("Connexion requise.");
      const {data,error}=await workforceDb().from("tok_workforce_requests")
        .update({status:approve?"approved":"rejected",reviewed_by:user.id,reviewed_at:new Date().toISOString()})
        .eq("restaurant_id",restaurantId).eq("id",id).eq("status","pending").select("id");
      if(error)throw error;
      if(!data?.length)throw new Error("Cette demande a déjà été traitée.");
    },
    onSuccess:()=>{refresh();toast({title:"Demande traitée"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Traitement impossible",description:error.message}),
  });
  const pending=requests.filter(r=>r.status==="pending").length;
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <Card className="rounded-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary"/>Demandes ({pending} en attente)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isPending?<p className="text-muted-foreground">Chargement…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les demandes.</p>:null}
        {!isPending&&requests.length===0?<p className="text-muted-foreground">Aucune demande.</p>:null}
        {requests.map(request=><div key={request.id} className="rounded-xl border border-border/60 p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <div className="min-w-0"><p className="font-semibold">{employeeName(employees.find(e=>e.id===request.employee_id))}</p>
              <p className="text-xs text-muted-foreground">{requestTypes.find(t=>t.value===request.request_type)?.label||request.request_type}</p>
            </div>
            <Badge variant={request.status==="rejected"?"destructive":"secondary"}>
              {request.status==="pending"?"En attente":request.status==="approved"?"Approuvée":"Refusée"}
            </Badge>
          </div>
          <p className="my-3 whitespace-pre-wrap break-words text-sm">{request.description}</p>
          {request.status==="pending"?<div className="flex flex-wrap gap-2">
            <Button size="sm" disabled={review.isPending} onClick={()=>review.mutate({id:request.id,approve:true})}><Check className="mr-1 h-4 w-4"/>Accepter</Button>
            <Button size="sm" variant="outline" disabled={review.isPending} onClick={()=>review.mutate({id:request.id,approve:false})}><X className="mr-1 h-4 w-4"/>Refuser</Button>
          </div>:null}
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle>Nouvelle demande</CardTitle></CardHeader>
      <CardContent><form className="space-y-3" onSubmit={(event:FormEvent)=>{event.preventDefault();create.mutate();}}>
        <div><Label htmlFor="wf-request-person">Collaborateur</Label><select id="wf-request-person" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
          <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-request-type">Motif</Label><select id="wf-request-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={e=>setType(e.target.value as typeof type)}>
          {requestTypes.map(t=><option key={t.value} value={t.value}>{t.label}</option>)}
        </select></div>
        <div><Label htmlFor="wf-request-description">Description</Label><textarea id="wf-request-description" required maxLength={2000} value={description} onChange={e=>setDescription(e.target.value)} className="flex min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm" /></div>
        <Button type="submit" disabled={create.isPending||employees.length===0} className="w-full">Enregistrer la demande</Button>
      </form></CardContent>
    </Card>
  </div>;
}
