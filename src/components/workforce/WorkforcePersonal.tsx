import { useMemo, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Clock3, ClipboardList, LayoutDashboard, Umbrella } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { workforceDb,useWorkforceAbsences,useWorkforceEntriesInRange,useWorkforceNextShift,useWorkforceRequests,useWorkforceShifts } from "@/hooks/useTokWorkforce";
import { workedHours,weekRange,workforceZurichClock } from "@/lib/tokWorkforce";
import WorkforceClock from "@/components/workforce/WorkforceClock";
import WorkforcePersonalExchanges from "@/components/workforce/WorkforcePersonalExchanges";

export default function WorkforcePersonal({restaurantId,employeeId,contractHours,vacationDays}:{restaurantId:string;employeeId:string;contractHours:number;vacationDays:number}) {
 const {toast}=useToast();
 const [activeTab,setActiveTab]=useState("overview");
 const [weekOffset,setWeekOffset]=useState(0),[description,setDescription]=useState(""),[requestType,setRequestType]=useState("vacation");
 const [leaveStart,setLeaveStart]=useState(""),[leaveEnd,setLeaveEnd]=useState(""),[leaveDays,setLeaveDays]=useState("1");
 const cursor=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+weekOffset*7);return d},[weekOffset]);
 const today=workforceZurichClock().date;
 const range=weekRange(cursor),year=Number(today.slice(0,4));
 const shifts=useWorkforceShifts(restaurantId,true,range.start,range.end,employeeId);
 const nextShift=useWorkforceNextShift(restaurantId,employeeId);
 const entries=useWorkforceEntriesInRange(restaurantId,true,year+"-01-01",year+"-12-31",employeeId);
 const absences=useWorkforceAbsences(restaurantId,true,employeeId);
 const requests=useWorkforceRequests(restaurantId,true,employeeId);
 const myShifts=(shifts.data||[]).filter(s=>s.employee_id===employeeId);
 const myEntries=(entries.data||[]).filter(e=>e.employee_id===employeeId);
 const myAbsences=(absences.data||[]).filter(a=>a.employee_id===employeeId);
 const myRequests=(requests.data||[]).filter(r=>r.employee_id===employeeId);
 const worked=myEntries.reduce((total,e)=>{try{return total+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return total}},0);
 const night=myEntries.filter(e=>e.is_night_work).reduce((sum,e)=>{try{return sum+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return sum}},0);
 const sunday=myEntries.filter(e=>e.is_sunday_work).reduce((sum,e)=>{try{return sum+workedHours(e.start_time,e.end_time,e.break_minutes)}catch{return sum}},0);
 const leave=myAbsences.filter(a=>a.absence_type==="vacation"&&a.start_date.startsWith(String(year))).reduce((sum,a)=>sum+Number(a.days_count),0);
 const monthWorked=myEntries.filter(entry=>entry.entry_date.startsWith(today.slice(0,7))).reduce((total,entry)=>{try{return total+workedHours(entry.start_time,entry.end_time,entry.break_minutes)}catch{return total}},0);
 const pendingRequests=myRequests.filter(request=>request.status==="pending").length;
 const entriesLimited=myEntries.length>=1000,absencesLimited=myAbsences.length>=200,requestsLimited=myRequests.length>=200;
 const hoursValue=(value:number)=>entries.isPending?"Chargement…":entries.isError?"Indisponibles":entriesLimited?"À consulter":value.toFixed(1)+" h";
 const vacationValue=absences.isPending?"Chargement…":absences.isError?"Indisponibles":absencesLimited?"À consulter":Math.max(0,vacationDays-leave).toFixed(1)+" jours";
 const req=useMutation({mutationFn:async()=>{if(!description.trim()||description.length>2000)throw new Error("Description invalide");
  if(requestType==="vacation"&&(!leaveStart||!leaveEnd||leaveEnd<leaveStart||!Number.isFinite(Number(leaveDays))||Number(leaveDays)<=0))throw new Error("Indiquez une période et le nombre de jours de congé.");
  const {error}=await workforceDb().from("tok_workforce_requests").insert({restaurant_id:restaurantId,employee_id:employeeId,request_type:requestType,description:description.trim(),status:"pending",
    requested_start_date:requestType==="vacation"?leaveStart:null,requested_end_date:requestType==="vacation"?leaveEnd:null,
    requested_days:requestType==="vacation"?Number(leaveDays):null});
  if(error)throw error;},onSuccess:()=>{setDescription("");requests.refetch();toast({title:"Demande envoyée"});},
  onError:(error:Error)=>toast({title:"Demande refusée",description:error.message,variant:"destructive"})});
 return <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-5">
  <TabsList className="grid h-auto grid-cols-2 gap-1 sm:grid-cols-4 xl:grid-cols-7">
   <TabsTrigger value="overview"><LayoutDashboard className="mr-1 h-4 w-4"/>Vue d’ensemble</TabsTrigger>
   <TabsTrigger value="clock"><Clock3 className="mr-1 h-4 w-4"/>Badgeuse</TabsTrigger>
   <TabsTrigger value="planning"><CalendarDays className="mr-1 h-4 w-4"/>Planning</TabsTrigger>
   <TabsTrigger value="hours">Mes heures</TabsTrigger>
   <TabsTrigger value="counters"><Umbrella className="mr-1 h-4 w-4"/>Compteurs</TabsTrigger>
   <TabsTrigger value="requests"><ClipboardList className="mr-1 h-4 w-4"/>Demandes</TabsTrigger>
   <TabsTrigger value="exchanges">Échanges</TabsTrigger>
  </TabsList>
  <TabsContent value="overview" className="space-y-5">
   <div className="space-y-1"><h2 className="text-xl font-semibold">Votre activité en un coup d’œil</h2>
    <p className="text-sm text-muted-foreground">Retrouvez vos prochains services, vos heures et le suivi de vos demandes.</p></div>
   <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
    <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Mon planning</p>
     <p className="text-xl font-semibold">{contractHours} h / semaine</p>
     <Button size="sm" variant="outline" onClick={()=>setActiveTab("planning")}>Voir mes horaires</Button>
    </CardContent></Card>
    <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Heures ce mois</p>
     <p className="text-xl font-semibold">{hoursValue(monthWorked)}</p>
     <Button size="sm" variant="outline" onClick={()=>setActiveTab("hours")}>Consulter mes heures</Button>
    </CardContent></Card>
    <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Vacances restantes</p>
     <p className="text-xl font-semibold">{vacationValue}</p>
     <Button size="sm" variant="outline" onClick={()=>setActiveTab("counters")}>Voir mes compteurs</Button>
    </CardContent></Card>
    <Card><CardContent className="space-y-3 p-5"><p className="text-sm text-muted-foreground">Demandes en attente</p>
     <p className="text-xl font-semibold">{requests.isPending?"Chargement…":requests.isError?"Indisponibles":requestsLimited?"À consulter":pendingRequests}</p>
     <Button size="sm" variant="outline" onClick={()=>setActiveTab("requests")}>Suivre mes demandes</Button>
    </CardContent></Card>
   </div>
   {entriesLimited||absencesLimited||requestsLimited?<p className="text-sm text-muted-foreground">Certains historiques ont atteint la limite d’affichage. Les compteurs concernés sont à vérifier avec votre responsable.</p>:null}
   <Card className="rounded-2xl border-primary/25"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary"/>Prochain service</CardTitle></CardHeader>
    <CardContent className="space-y-3">
     {nextShift.isPending?<p className="text-muted-foreground">Recherche du prochain service…</p>:nextShift.isError?<p role="alert" className="text-destructive">Le prochain service est indisponible. Consultez votre planning ou réessayez.</p>:nextShift.data?<>
      <p className="font-semibold">{new Intl.DateTimeFormat("fr-CH",{dateStyle:"full",timeZone:"Europe/Zurich"}).format(new Date(nextShift.data.shift_date+"T12:00:00Z"))}</p>
      <p>{nextShift.data.start_time.slice(0,5)} – {nextShift.data.end_time.slice(0,5)} · Pause : {nextShift.data.break_minutes} min</p>
      <Button size="sm" variant="outline" onClick={()=>setActiveTab("planning")}>Ouvrir mon planning</Button>
     </>:<p className="text-muted-foreground">Aucun service à venir n’est encore planifié.</p>}
    </CardContent>
   </Card>
   <div className="grid gap-5 lg:grid-cols-2">
    <WorkforceClock restaurantId={restaurantId} employeeId={employeeId}/>
    <Card className="h-fit"><CardHeader><CardTitle>Dernières demandes</CardTitle></CardHeader><CardContent className="space-y-3">
     {requests.isPending?<p className="text-muted-foreground">Chargement des demandes…</p>:requests.isError?<p role="alert" className="text-destructive">Demandes indisponibles.</p>:myRequests.length===0?<p className="text-muted-foreground">Vous n’avez pas encore envoyé de demande.</p>:myRequests.slice(0,3).map(request=><div key={request.id} className="space-y-2 rounded-xl border p-3 text-sm">
      <p className="break-words">{request.description}</p><p className="font-medium">{request.status==="pending"?"En attente":request.status==="approved"?"Acceptée":"Refusée"}</p>
     </div>)}
     {myRequests.length>=200?<p className="text-xs text-muted-foreground">Le suivi porte sur les 200 dernières demandes.</p>:null}
     <Button size="sm" onClick={()=>setActiveTab("requests")}>Faire une demande</Button>
    </CardContent></Card>
   </div>
  </TabsContent>
  <TabsContent value="clock"><WorkforceClock restaurantId={restaurantId} employeeId={employeeId}/></TabsContent>
  <TabsContent value="planning"><Card><CardHeader><CardTitle>Mon planning</CardTitle></CardHeader><CardContent className="space-y-4">
   <div className="flex items-center gap-3"><Button size="sm" variant="outline" onClick={()=>setWeekOffset(w=>w-1)}>←</Button>
    <span className="text-sm">{range.start} – {range.end}</span><Button size="sm" variant="outline" onClick={()=>setWeekOffset(w=>w+1)}>→</Button></div>
   {shifts.isError?<p role="alert" className="text-destructive">Planning indisponible.</p>:null}
   {!shifts.isPending&&!shifts.isError&&myShifts.length===0?<p className="text-muted-foreground">Aucun service planifié cette semaine.</p>:null}
   {myShifts.map(s=><div key={s.id} className="rounded-xl border p-3"><p className="font-semibold">{s.shift_date}</p>
    <p>{s.start_time.slice(0,5)} – {s.end_time.slice(0,5)} · Pause : {s.break_minutes} min · {s.status}</p></div>)}
  </CardContent></Card></TabsContent>
  <TabsContent value="hours"><Card><CardHeader><CardTitle>Mes heures · {year}</CardTitle></CardHeader><CardContent className="space-y-2">
   {entries.isError?<p role="alert" className="text-destructive">Impossible de consulter les heures.</p>:null}
   <p className="text-lg font-bold text-primary">{hoursValue(worked)}{!entries.isPending&&!entries.isError&&!entriesLimited?" comptabilisées":""}</p>
   {!entries.isPending&&!entries.isError&&myEntries.length===0?<p className="text-muted-foreground">Aucune heure enregistrée.</p>:null}
   {myEntries.map(e=><div key={e.id} className="flex flex-wrap justify-between gap-2 rounded-xl border p-3 text-sm">
    <span>{e.entry_date} · {e.start_time.slice(0,5)}–{e.end_time.slice(0,5)}</span>
    <span>{(()=>{try{return workedHours(e.start_time,e.end_time,e.break_minutes).toFixed(1)+" h";}catch{return "Durée à corriger";}})()} · Pause {e.break_minutes} min</span>
   </div>)}
   {myEntries.length>=1000?<p className="text-destructive">Limite des relevés atteinte, contactez votre responsable pour un export complet.</p>:null}
  </CardContent></Card></TabsContent>
  <TabsContent value="counters"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
   {[
    ["Heures travaillées",hoursValue(worked)],["Heures de nuit",hoursValue(night)],
    ["Dimanches",hoursValue(sunday)],["Vacances restantes",vacationValue],
   ].map(([label,value])=><Card key={label}><CardContent className="space-y-2 p-5">
    <p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold text-primary">{value}</p></CardContent></Card>)}
   <Card className="sm:col-span-2 lg:col-span-4"><CardContent className="p-5 text-sm text-muted-foreground">
    Contrat : {contractHours} h/semaine · Vacances annuelles : {vacationDays} jours.
    {!absences.isPending&&!absences.isError&&!absencesLimited?<> Congés enregistrés : {leave} jours.</>:null}
    {absencesLimited||entriesLimited?<p>Historique partiel : contactez votre responsable pour confirmer les compteurs complets.</p>:null}
    Les heures supplémentaires ne peuvent être arrêtées définitivement qu'après validation des relevés, absences et conventions applicables.
   </CardContent></Card>
  </div></TabsContent>
  <TabsContent value="requests"><Card><CardHeader><CardTitle>Mes demandes</CardTitle></CardHeader><CardContent className="space-y-4">
   <form className="grid gap-3" onSubmit={e=>{e.preventDefault();req.mutate()}}>
    <label className="text-sm">Motif <select className="ml-2 rounded-md border bg-background px-2 py-2" value={requestType} onChange={e=>setRequestType(e.target.value)}>
     <option value="vacation">Congés</option><option value="correction">Correction des heures</option><option value="schedule">Planning</option><option value="other">Autre</option>
    </select></label>
    {requestType==="vacation"?<div className="grid gap-2 sm:grid-cols-3">
      <label className="text-sm">Du <Input type="date" required value={leaveStart} onChange={e=>setLeaveStart(e.target.value)}/></label>
      <label className="text-sm">Au <Input type="date" min={leaveStart} required value={leaveEnd} onChange={e=>setLeaveEnd(e.target.value)}/></label>
      <label className="text-sm">Jours ouvrés <Input type="number" min="0.5" step="0.5" max={366} required value={leaveDays} onChange={e=>setLeaveDays(e.target.value)}/></label>
    </div>:null}
    <Input required value={description} onChange={e=>setDescription(e.target.value)} maxLength={2000} placeholder="Décrivez votre demande"/>
    <Button disabled={req.isPending||!description.trim()} type="submit">Envoyer au responsable</Button>
   </form>
   {requests.isError?<p className="text-destructive">Demandes indisponibles.</p>:null}
   {myRequests.map(r=><p key={r.id} className="rounded-xl border p-3 text-sm">{r.description} {r.requested_start_date?"· "+r.requested_start_date+" au "+r.requested_end_date:""} · {r.status==="pending"?"En attente":r.status==="approved"?"Acceptée":"Refusée"}</p>)}
  </CardContent></Card></TabsContent>
  <TabsContent value="exchanges"><WorkforcePersonalExchanges restaurantId={restaurantId} employeeId={employeeId}/></TabsContent>
 </Tabs>;
}