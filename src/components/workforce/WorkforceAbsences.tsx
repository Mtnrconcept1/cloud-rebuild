import { useMemo, useState,type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarOff, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { dateIsValid,employeeName } from "@/lib/tokWorkforce";
import { useWorkforceAbsences,useWorkforceEmployees,useWorkforceHolidays,useWorkforceRefresh,workforceDb } from "@/hooks/useTokWorkforce";
import { workforceAbsenceDates } from "@/lib/tokWorkforceReporting";

const TYPES:{key:"vacation"|"sick"|"holiday"|"other";label:string}[]=[
  {key:"vacation",label:"Vacances"},{key:"sick",label:"Maladie"},{key:"holiday",label:"Jour férié"},{key:"other",label:"Autre"},
];

export default function WorkforceAbsences({restaurantId}:{restaurantId:string}) {
  const {data:employees=[],isPending:employeesPending,isError:employeesError}=useWorkforceEmployees(restaurantId,true);
  const {data:absences=[],isPending,isError}=useWorkforceAbsences(restaurantId,true);
  const {toast}=useToast(),refresh=useWorkforceRefresh(restaurantId);
  const [employeeId,setEmployeeId]=useState(""),[type,setType]=useState<"vacation"|"sick"|"holiday"|"other">("vacation");
  const [start,setStart]=useState(""),[end,setEnd]=useState(""),[customDays,setCustomDays]=useState<string|null>(null),[notes,setNotes]=useState("");
  const holidays=useWorkforceHolidays(restaurantId,true);
  const suggestedDays=useMemo(()=>{
    if(!dateIsValid(start)||!dateIsValid(end)||end<start||holidays.isPending||holidays.isError)return null;
    try{return workforceAbsenceDates(start,end,holidays.data||[],restaurantId,type==="holiday").length;}catch{return null;}
  },[start,end,holidays.data,holidays.isPending,holidays.isError,restaurantId,type]);
  const days=customDays??String(suggestedDays??1);
  const save=useMutation({
    mutationFn:async()=>{
      if(employeesPending||employeesError)throw new Error("Actualisez la liste des collaborateurs avant de continuer.");
      if(holidays.isPending||holidays.isError)throw new Error("Actualisez le calendrier des jours fériés avant de continuer.");
      if(!employees.some(e=>e.id===employeeId&&e.is_active))throw new Error("Collaborateur actif requis.");
      if(!dateIsValid(start)||!dateIsValid(end)||end<start)throw new Error("Période invalide.");
      const span=(Date.parse(end+"T12:00:00Z")-Date.parse(start+"T12:00:00Z"))/86400000+1;
      if(!Number.isFinite(+days)||+days<=0||+days>366||+days>span)throw new Error("Nombre de jours invalide pour cette période.");
      const {data,error}=await workforceDb().from("tok_workforce_absences").insert({
        restaurant_id:restaurantId,employee_id:employeeId,absence_type:type,start_date:start,end_date:end,days_count:Number(days),notes:notes.trim().slice(0,2000)||null,
      }).select("id").single();if(error)throw error;if(!data?.id)throw new Error("L’absence n’a pas pu être confirmée.");
    },
    onSuccess:()=>{setNotes("");refresh();toast({title:"Absence enregistrée"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Enregistrement impossible",description:error.message}),
  });
  const remove=useMutation({
    mutationFn:async(id:string)=>{
      const absence=absences.find(item=>item.id===id&&item.restaurant_id===restaurantId);
      if(!absence||absence.source_request_id)throw new Error("Une absence issue d’un congé approuvé doit rester liée à sa demande.");
      const {data,error}=await workforceDb().from("tok_workforce_absences").delete().eq("restaurant_id",restaurantId).eq("id",id).select("id").single();
      if(error)throw error;
      if(data?.id!==id)throw new Error("La suppression n’a pas pu être confirmée. Actualisez les absences.");
    },
    onSuccess:()=>{refresh();toast({title:"Absence supprimée"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Suppression impossible",description:error.message}),
  });
  return <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,23rem)]">
    <Card className="rounded-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarOff className="h-5 w-5 text-primary"/>Absences et congés</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isPending?<p className="text-muted-foreground">Chargement…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les absences.</p>:null}
        {!isPending&&!isError&&absences.length===0?<p className="text-muted-foreground">Aucune absence enregistrée.</p>:null}
        {absences.map(absence=><div key={absence.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
          <div className="min-w-0"><p className="font-semibold">{employeeName(employees.find(e=>e.id===absence.employee_id))}</p>
            <p className="text-xs text-muted-foreground">{absence.start_date} au {absence.end_date} · {absence.days_count} jour(s)</p>
            <Badge className="mt-2" variant="secondary">{TYPES.find(t=>t.key===absence.absence_type)?.label||absence.absence_type}</Badge>
            {absence.notes?<p className="mt-2 whitespace-pre-wrap break-words text-sm">{absence.notes}</p>:null}
            {absence.source_request_id?<p className="mt-1 text-xs text-muted-foreground">Congé approuvé : cette absence reste liée à la demande et ne peut pas être supprimée ici.</p>:null}
          </div>
          {!absence.source_request_id?<Button size="icon" variant="ghost" disabled={remove.isPending||isPending||isError} aria-label="Supprimer l'absence" onClick={()=>{if(window.confirm("Supprimer cette absence ?"))remove.mutate(absence.id);}}>
            <Trash2 className="h-4 w-4 text-destructive"/>
          </Button>:null}
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/>Nouvelle absence</CardTitle></CardHeader>
      <CardContent><form className="space-y-3" onSubmit={(event:FormEvent)=>{event.preventDefault();if(!save.isPending)save.mutate();}}>
        {employeesError?<p role="alert" className="text-sm text-destructive">Collaborateurs indisponibles. <button type="button" className="underline" onClick={()=>void refresh()}>Réessayer</button></p>:null}
        {holidays.isError?<p role="alert" className="text-sm text-destructive">Calendrier indisponible. <button type="button" className="underline" onClick={()=>void holidays.refetch()}>Réessayer</button></p>:null}
        <fieldset className="space-y-3" disabled={save.isPending||employeesPending||employeesError||holidays.isPending||holidays.isError}>
        <div><Label htmlFor="wf-absence-person">Collaborateur</Label><select id="wf-absence-person" required className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
          <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-absence-type">Nature</Label><select id="wf-absence-type" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={type} onChange={e=>{setType(e.target.value as typeof type);setCustomDays(null);}}>
          {TYPES.map(t=><option key={t.key} value={t.key}>{t.label}</option>)}
        </select></div>
        <div><Label htmlFor="wf-absence-start">Du</Label><Input id="wf-absence-start" type="date" required value={start} onChange={e=>{setStart(e.target.value);setCustomDays(null);}}/></div>
        <div><Label htmlFor="wf-absence-end">Au</Label><Input id="wf-absence-end" type="date" required min={start} value={end} onChange={e=>{setEnd(e.target.value);setCustomDays(null);}}/></div>
        <div><Label htmlFor="wf-absence-days">Nombre de jours décomptés</Label><Input id="wf-absence-days" type="number" min="0.5" max={366} step="0.5" required value={days} onChange={e=>setCustomDays(e.target.value)}/></div>
        <p className="text-xs text-muted-foreground">Base indicative de cinq jours par semaine, hors fériés configurés sauf pour une absence « Jour férié ». Le décompte reste ajustable par demi-journée selon le contrat ; changer les dates recalcule la proposition.</p>
        <div><Label htmlFor="wf-absence-notes">Note facultative</Label><Input id="wf-absence-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        </fieldset>
        {save.error?<p role="alert" className="text-sm text-destructive">{save.error.message}</p>:null}
        <Button type="submit" disabled={save.isPending||employees.length===0||employeesPending||employeesError||holidays.isPending||holidays.isError} className="w-full">Enregistrer</Button>
      </form></CardContent>
    </Card>
  </div>;
}
