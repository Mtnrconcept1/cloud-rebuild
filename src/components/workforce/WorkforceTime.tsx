import { useState,type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { dateIsValid,employeeName,minutesFromTime,workedHours } from "@/lib/tokWorkforce";
import { useWorkforceEntries,useWorkforceEmployees,useWorkforceRefresh,useWorkforceValidations,workforceDb } from "@/hooks/useTokWorkforce";
import { useAuth } from "@/lib/auth-context";
import WorkforceSignaturePad from "./WorkforceSignaturePad";

export default function WorkforceTime({restaurantId}:{restaurantId:string}) {
  const {data:employees=[]}=useWorkforceEmployees(restaurantId,true);
  const {data:entries=[],isPending,isError}=useWorkforceEntries(restaurantId,true);
  const {data:validations=[]}=useWorkforceValidations(restaurantId,true);
  const {user}=useAuth();const {toast}=useToast();const refresh=useWorkforceRefresh(restaurantId);
  const [employeeId,setEmployeeId]=useState("");
  const [date,setDate]=useState(()=>{ const today=new Date();return [today.getFullYear(),String(today.getMonth()+1).padStart(2,"0"),String(today.getDate()).padStart(2,"0")].join("-"); });
  const [start,setStart]=useState("09:00"),[end,setEnd]=useState("17:00"),[breakMin,setBreakMin]=useState("30");
  const [name,setName]=useState("");
  const [signature,setSignature]=useState<string|null>(null);
  const [selected,setSelected]=useState("");
  const save=useMutation({
    mutationFn:async()=>{
      if(!employees.some(e=>e.id===employeeId && e.is_active))throw new Error("Collaborateur actif requis.");
      if(!dateIsValid(date))throw new Error("Date invalide.");
      workedHours(start,end,Number(breakMin));
      const isSunday=new Date(date+"T12:00:00").getDay()===0;
      const isNight=minutesFromTime(start)<360||minutesFromTime(end)>1380||minutesFromTime(end)<minutesFromTime(start);
      const {error}=await workforceDb().from("tok_workforce_time_entries").insert({
        restaurant_id:restaurantId,employee_id:employeeId,entry_date:date,start_time:start,end_time:end,
        break_minutes:Number(breakMin),is_sunday_work:isSunday,is_night_work:isNight,
      });if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Heures enregistrées"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Enregistrement impossible",description:error.message}),
  });
  const approve=useMutation({
    mutationFn:async()=>{
      if(!user?.id)throw new Error("Connexion requise.");
      if(name.trim().length<2||name.trim().length>120)throw new Error("Indiquez le nom du signataire.");
      if(!entries.some(e=>e.id===selected))throw new Error("Sélectionnez un relevé.");
      if(!signature||signature.length>120000)throw new Error("Veuillez signer le relevé avant validation.");
      const {error}=await workforceDb().from("tok_workforce_validations").insert({
        restaurant_id:restaurantId,time_entry_id:selected,signed_by:user.id,signed_name:name.trim(),signature_data:signature,
      });if(error)throw error;
    },
    onSuccess:()=>{setSelected("");setName("");setSignature(null);refresh();toast({title:"Relevé signé et validé",description:"Identité, date et signature manuscrite enregistrées."});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Validation impossible",description:error.message}),
  });
  const validatedIds=new Set(validations.map(v=>v.time_entry_id));
  return <div className="space-y-5">
    <Card className="rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-primary"/>Saisir des heures travaillées</CardTitle></CardHeader>
      <CardContent><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(event:FormEvent)=>{event.preventDefault();save.mutate();}}>
        <div className="sm:col-span-2"><Label htmlFor="wf-entry-employee">Collaborateur</Label>
          <select id="wf-entry-employee" required className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm" value={employeeId} onChange={e=>setEmployeeId(e.target.value)}>
            <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
          </select></div>
        <div><Label htmlFor="wf-entry-date">Date</Label><Input id="wf-entry-date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><Label htmlFor="wf-entry-start">Début</Label><Input id="wf-entry-start" type="time" required value={start} onChange={e=>setStart(e.target.value)}/></div>
        <div><Label htmlFor="wf-entry-end">Fin</Label><Input id="wf-entry-end" type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></div>
        <div><Label htmlFor="wf-entry-break">Pause (min)</Label><Input id="wf-entry-break" type="number" min={0} max={720} step={1} required value={breakMin} onChange={e=>setBreakMin(e.target.value)}/></div>
        <div className="sm:col-span-2 lg:col-span-6"><Button disabled={save.isPending||employees.length===0} type="submit">{save.isPending?"Enregistrement…":"Enregistrer les heures"}</Button></div>
      </form></CardContent>
    </Card>
    <Card className="rounded-2xl">
      <CardHeader><CardTitle>Relevés et validation nominative</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isPending?<p className="text-muted-foreground">Chargement des relevés…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les heures.</p>:null}
        {!isPending&&entries.length===0?<p className="text-muted-foreground">Aucun relevé saisi.</p>:null}
        {entries.map(entry=>{
          const validation=validations.find(v=>v.time_entry_id===entry.id);
          let duration="—";try{duration=workedHours(entry.start_time,entry.end_time,entry.break_minutes).toLocaleString("fr-CH")+" h";}catch{/* malformed historical record */}
          return <div key={entry.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
            <div><p className="font-semibold">{employeeName(employees.find(e=>e.id===entry.employee_id))}</p>
              <p className="text-sm text-muted-foreground">{entry.entry_date} · {entry.start_time.slice(0,5)}–{entry.end_time.slice(0,5)} · {duration}</p>
              {validation?<p className="text-xs text-muted-foreground">Validé par {validation.signed_name} le {new Date(validation.signed_at).toLocaleDateString("fr-CH")}</p>:null}
            </div>
            {validatedIds.has(entry.id)?<Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Validé</Badge>:
              <Button size="sm" variant={selected===entry.id?"default":"outline"} onClick={()=>{setSelected(entry.id);setSignature(null);}}>Valider</Button>}
          </div>;
        })}
        {selected && !validatedIds.has(selected)?<form className="rounded-xl border border-primary/30 bg-primary/5 p-4" onSubmit={(event:FormEvent)=>{event.preventDefault();approve.mutate();}}>
          <p className="mb-2 text-sm font-semibold">Attestation de validation du relevé</p>
          <p className="mb-3 text-xs text-muted-foreground">Cette validation conserve l'auteur et la date. Elle ne remplace pas une signature électronique qualifiée.</p>
          <div className="mb-3"><WorkforceSignaturePad key={selected} onChange={setSignature}/></div>
          <div className="flex flex-wrap gap-2"><Input className="min-w-48 flex-1" required maxLength={120} value={name} onChange={e=>setName(e.target.value)} placeholder="Nom complet du responsable" aria-label="Nom complet du responsable"/>
            <Button type="submit" disabled={approve.isPending||!signature}><ClipboardCheck className="mr-1 h-4 w-4"/>Confirmer la validation</Button>
            <Button type="button" variant="outline" onClick={()=>{setSelected("");setSignature(null);}}>Annuler</Button>
          </div>
        </form>:null}
      </CardContent>
    </Card>
  </div>;
}
