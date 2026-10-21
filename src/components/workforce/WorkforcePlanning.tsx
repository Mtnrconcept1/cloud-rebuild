import { useMemo,useState,type FormEvent } from "react";
import { addWeeks, subWeeks, format, addDays } from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import WorkforceWeekGrid from "@/components/workforce/WorkforceWeekGrid";
import { useToast } from "@/hooks/use-toast";
import { employeeName, weekRange, workedHours, dateIsValid } from "@/lib/tokWorkforce";
import { useWorkforceEmployees,useWorkforceShifts,useWorkforceAbsences,useWorkforceRefresh,workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforcePlanning({restaurantId}:{restaurantId:string}) {
  const [cursor,setCursor]=useState(new Date());
  const week=useMemo(()=>weekRange(cursor),[cursor]);
  const {data:employees=[]}=useWorkforceEmployees(restaurantId,true);
  const {data:shifts=[],isPending,isError}=useWorkforceShifts(restaurantId,true,week.start,week.end);
  const {data:absences=[]}=useWorkforceAbsences(restaurantId,true);
  const {toast}=useToast();const refresh=useWorkforceRefresh(restaurantId);
  const [employeeId,setEmployeeId]=useState("");
  const [date,setDate]=useState(week.start);
  const [start,setStart]=useState("09:00");
  const [end,setEnd]=useState("17:00");
  const [breakMinutes,setBreakMinutes]=useState("30");
  const [notes,setNotes]=useState("");
  const create=useMutation({
    mutationFn:async()=>{
      if(!employees.some(e=>e.id===employeeId&&e.is_active))throw new Error("Choisissez un collaborateur actif.");
      if(!dateIsValid(date))throw new Error("Date invalide.");
      workedHours(start,end,Number(breakMinutes));
      const {error}=await workforceDb().from("tok_workforce_shifts").insert({
        restaurant_id:restaurantId,employee_id:employeeId,shift_date:date,
        start_time:start,end_time:end,break_minutes:Number(breakMinutes),status:"planned",notes:notes.trim().slice(0,2000)||null,
      });
      if(error)throw error;
    },
    onSuccess:()=>{refresh();setNotes("");toast({title:"Service planifié"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Impossible de planifier",description:error.message}),
  });
  const change=useMutation({
    mutationFn:async({id,patch}:{id:string;patch:Record<string,string>})=>{
      const {error}=await workforceDb().from("tok_workforce_shifts").update(patch)
        .eq("restaurant_id",restaurantId).eq("id",id);if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Planning actualisé"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Modification impossible",description:error.message}),
  });
  const remove=useMutation({
    mutationFn:async(id:string)=>{
      const {error}=await workforceDb().from("tok_workforce_shifts").delete()
        .eq("restaurant_id",restaurantId).eq("id",id);if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Service supprimé"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Suppression impossible",description:error.message}),
  });
  const days=Array.from({length:7},(_,i)=>addDays(new Date(week.start+"T12:00:00"),i));
  return <div className="space-y-5">
    <Card className="rounded-2xl">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5 text-primary"/>Planning hebdomadaire</CardTitle>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="icon" aria-label="Semaine précédente" onClick={()=>setCursor(d=>subWeeks(d,1))}><ChevronLeft className="h-4 w-4"/></Button>
          <span className="min-w-32 text-center text-sm font-semibold">{format(new Date(week.start+"T12:00:00"),"d MMM",{locale:fr})} – {format(new Date(week.end+"T12:00:00"),"d MMM yyyy",{locale:fr})}</span>
          <Button variant="outline" size="icon" aria-label="Semaine suivante" onClick={()=>setCursor(d=>addWeeks(d,1))}><ChevronRight className="h-4 w-4"/></Button>
        </div>
      </div></CardHeader>
      <CardContent>
        {isPending?<p className="text-muted-foreground">Chargement des services…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger le planning.</p>:null}
        <WorkforceWeekGrid
          days={days}
          employees={employees}
          shifts={shifts}
          absences={absences}
          changing={change.isPending}
          removing={remove.isPending}
          onChange={(payload) => change.mutate(payload)}
          onDelete={(id) => { if (window.confirm("Supprimer ce service ?")) remove.mutate(id); }}
        />
      </CardContent>
    </Card>
    <Card className="rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><Plus className="h-5 w-5 text-primary"/>Ajouter un service</CardTitle></CardHeader>
      <CardContent><form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onSubmit={(event:FormEvent)=>{event.preventDefault();create.mutate();}}>
        <div className="sm:col-span-2"><Label htmlFor="wf-shift-employee">Collaborateur</Label><select id="wf-shift-employee" required value={employeeId} onChange={e=>setEmployeeId(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-2 text-sm">
          <option value="">Sélectionner…</option>{employees.filter(e=>e.is_active).map(e=><option key={e.id} value={e.id}>{employeeName(e)}</option>)}
        </select></div>
        <div><Label htmlFor="wf-shift-date">Date</Label><Input id="wf-shift-date" type="date" required value={date} onChange={e=>setDate(e.target.value)}/></div>
        <div><Label htmlFor="wf-shift-start">Début</Label><Input id="wf-shift-start" type="time" required value={start} onChange={e=>setStart(e.target.value)}/></div>
        <div><Label htmlFor="wf-shift-end">Fin</Label><Input id="wf-shift-end" type="time" required value={end} onChange={e=>setEnd(e.target.value)}/></div>
        <div><Label htmlFor="wf-shift-break">Pause (min)</Label><Input id="wf-shift-break" type="number" required min={0} max={720} step={1} value={breakMinutes} onChange={e=>setBreakMinutes(e.target.value)}/></div>
        <div className="sm:col-span-2 lg:col-span-5"><Label htmlFor="wf-shift-notes">Notes (facultatif)</Label><Input id="wf-shift-notes" maxLength={2000} value={notes} onChange={e=>setNotes(e.target.value)}/></div>
        <div className="flex items-end"><Button type="submit" disabled={create.isPending||employees.length===0} className="w-full">Planifier</Button></div>
      </form></CardContent>
    </Card>
  </div>;
}
