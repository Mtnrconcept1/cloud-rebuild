import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Clock3, ClipboardList, Umbrella } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { workforceDb,useWorkforceAbsences,useWorkforceEntriesInRange,useWorkforceRequests,useWorkforceShifts } from "@/hooks/useTokWorkforce";
import { workedHours,weekRange } from "@/lib/tokWorkforce";
import WorkforceClock from "@/components/workforce/WorkforceClock";
import WorkforcePersonalExchanges from "@/components/workforce/WorkforcePersonalExchanges";

export default function WorkforcePersonal({restaurantId,employeeId,contractHours,vacationDays}:{restaurantId:string;employeeId:string;contractHours:number;vacationDays:number}) {
 const {toast}=useToast();
 const [weekOffset,setWeekOffset]=useState(0),[description,setDescription]=useState(""),[requestType,setRequestType]=useState("vacation");
 const cursor=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+weekOffset*7);return d},[weekOffset]);
 const range=weekRange(cursor),year=new Date().getFullYear();
 const shifts=useWorkforceShifts(restaurantId,true,range.start,range.end);
 const entries=useWorkforceEntriesInRange(restaurantId,true,year+"-01-01",year+"-12-31");
 const absences=useWorkforceAbsences(restaurantId,true);
 const requests=useWorkforceRequests(restaurantId,true);
 const myShifts=(shifts.data||[]).filter(s=>s.employee_id===employeeId);
 const myEntries=(entries.data||[]).filter(e=>e.employee_id===employeeId);
 const myAbsences=(absences.data||[]).filter(a=>a.employee_id===employeeId);
 const myRequests=(requests.data||[]).filter(r=>r.employee_id===employeeId);
 const worked=myEntries.reduce((total,e)=>{try{return total+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return total}},0);
 const night=myEntries.filter(e=>e.is_night_work).reduce((sum,e)=>{try{return sum+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return sum}},0);
 const sunday=myEntries.filter(e=>e.is_sunday_work).reduce((sum,e)=>{try{return sum+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return sum}},0);
 const leave=myAbsences.filter(a=>a.absence_type==="vacation"&&a.start_date.startsWith(String(year))).reduce((sum,a)=>sum+Number(a.days_count),0);
 const req=useMutation({mutationFn:async()=>{if(!description.trim()||description.length>2000)throw new Error("Description invalide");
  const {error}=await workforceDb().from("tok_workforce_requests").insert({restaurant_id:restaurantId,employee_id:employeeId,request_type:requestType,description:description.trim(),status:"pending"});
  if(error)throw error;},onSuccess:()=>{setDescription("");requests.refetch();toast({title:"Demande envoyée"});},
  onError:(error:Error)=>toast({title:"Demande refusée",description:error.message,variant:"destructive"})});
 return <Tabs defaultValue="clock" className="space-y-5">
  <TabsList className="grid h-auto grid-cols-2 gap-1 sm:grid-cols-3 xl:grid-cols-6">
   <TabsTrigger value="clock"><Clock3 className="mr-1 h-4 w-4"/>Badgeuse</TabsTrigger>
   <TabsTrigger value="planning"><CalendarDays className="mr-1 h-4 w-4"/>Planning</TabsTrigger>
   <TabsTrigger value="hours">Mes heures</TabsTrigger>
   <TabsTrigger value="counters"><Umbrella className="mr-1 h-4 w-4"/>Compteurs</TabsTrigger>
   <TabsTrigger value="requests"><ClipboardList className="mr-1 h-4 w-4"/>Demandes</TabsTrigger>
   <TabsTrigger value="exchanges">Échanges</TabsTrigger>
  </TabsList>
  <TabsContent value="clock"><WorkforceClock restaurantId={restaurantId} employeeId={employeeId}/></TabsContent>
  <TabsContent value="planning"><Card><CardHeader><CardTitle>Mon planning</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="flex items-center gap-3"><Button size="sm" variant="outline" onClick={()=>setWeekOffset(w=>w-1)}>←</Button>
    <span className="text-sm">{range.start} – {range.end}</span><Button size="sm" variant="outline" onClick={()=>setWeekOffset(w=>w+1)}>→</Button></div>
   {shifts.isError?<p role="alert" className="text-destructive">Planning indisponible.</p>:null}
   {myShifts.length===0?<p className="text-muted-foreground">Aucun service planifié cette semaine.</p>:null}
   {myShifts.map(s=><div key={s.id} className="rounded-xl border p-3"><p className="font-semibold">{s.shift_date}</p>
    <p>{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)} · Pause : {s.break_minutes} min · {s.status}</p></div>)}
  </CardContent></Card></TabsContent>
  <TabsContent value="hours"><Card><CardHeader><CardTitle>Mes heures · {year}</CardTitle></CardHeader><CardContent className="space-y-2">
   {entries.isError?<p role="alert" className="text-destructive">Impossible de consulter les heures.</p>:null}
   <p className="text-lg font-bold text-primary">{worked.toFixed(1)} h comptabilisées</p>
   {myEntries.length===0?<p className="text-muted-foreground">Aucune heure enregistrée.</p>:null}
   {myEntries.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-2 rounded-xl border p-3 text-sm">
    <span>{e.entry_date} · {e.start_time.slice(0,5)}–{e.end_time.slice(0,5)}</span>
    <span>{workedHours(e.start_time,e.end_time,e.break_minutes).toFixed(1)} h · Pause {e.break_minutes} min</span>
   </div>)}
   {myEntries.length>=1000?<p className="text-destructive">Limite des relevés atteinte, contactez votre responsable pour un export complet.</p>:null}
  </CardContent></Card></TabsContent>
  <TabsContent value="counters"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   {[
    ["Heures travaillées",worked.toFixed(1)+" h"],["Heures de nuit",night.toFixed(1)+" h"],
    ["Dimanches",sunday.toFixed(1)+" h"],["Vacances restantes",Math.max(0,vacationDays-leave).toFixed(1)+" j"],
   ].map(([label,value])=><Card key={label}><CardContent className="space-y-2 p-5">
    <p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold text-primary">{value}</p></CardContent></Card>)}
   <Card className="sm:col-span-2 lg:col-span-4"><CardContent className="p-5 text-sm text-muted-foreground">
    Contrat : {contractHours} h/semaine · Vacances annuelles : {vacationDays} jours · Pris : {leave} jours.
    Les heures supplémentaires ne peuvent être arrêtées définitivement qu'après validation des relevés, absences et conventions applicables.
   </CardContent></Card>
  </div></TabsContent>
  <TabsContent value="requests"><Card><CardHeader><CardTitle>Mes demandes</CardTitle></CardHeader><CardContent className="space-y-4">
   <form className="grid gap-3" onSubmit={e=>{e.preventDefault();req.mutate()}}>
    <label className="text-sm">Motif <select className="ml-2 rounded-md border bg-background px-2 py-2" value={requestType} onChange={e=>setRequestType(e.target.value)}>
     <option value="vacation">Congés</option><option value="correction">Correction des heures</option><option value="schedule">Planning</option><option value="other">Autre</option>
    </select></label>
    <Input required value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} placeholder="Décrivez votre demande"/>
    <Button disabled={req.isPending||!description.trim()} type="submit">Envoyer au responsable</Button>
   </form>
   {requests.isError?<p className="text-destructive">Demandes indisponibles.</p>:null}
   {myRequests.map(r=><p key={r.id} className="rounded-xl border p-3 text-sm">{r.description} · {r.status==="pending"?"En attente":r.status==="approved"?"Acceptée":"Refusée"}</p>)}
  </CardContent></Card></TabsContent>
  <TabsContent value="exchanges"><WorkforcePersonalExchanges restaurantId={restaurantId} employeeId={employeeId}/></TabsContent>
 </Tabs>;
}
