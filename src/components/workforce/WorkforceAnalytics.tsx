import { useMemo,useState } from "react";
import { BarChart3, AlertTriangle } from "lucide-react";
import { Bar,BarChart,CartesianGrid,ResponsiveContainer,Tooltip,XAxis,YAxis } from "recharts";
import { Card,CardHeader,CardContent,CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { weekRange,workedHours,employeeName,type WorkforceSettings } from "@/lib/tokWorkforce";
import { planningWarnings } from "@/lib/tokWorkforceWarnings";
import { useWorkforceEmployees,useWorkforceShifts } from "@/hooks/useTokWorkforce";

export default function WorkforceAnalytics({restaurantId,settings}:{restaurantId:string;settings:WorkforceSettings}) {
 const [offset,setOffset]=useState(0);
 const range=useMemo(()=>{const d=new Date();d.setDate(d.getDate()+7*offset);return weekRange(d)},[offset]);
 const employees=useWorkforceEmployees(restaurantId,true);
 const shifts=useWorkforceShifts(restaurantId,true,range.start,range.end);
 const rows=useMemo(()=>(employees.data||[]).filter(e=>e.is_active).map(e=>{
   const hours=(shifts.data||[]).filter(s=>s.employee_id===e.id&&s.status!=="cancelled").reduce((n,s)=>{
     try{return n+workedHours(s.start_time,s.end_time,s.break_minutes)}catch{return n}},0);
   return {id:e.id,name:employeeName(e),hours:Math.round(hours*100)/100,cost:Math.round(hours*Number(e.hourly_cost_chf||0)*100)/100,contract:Number(e.contracted_hours_per_week)};
 }),[employees.data,shifts.data]);
 const warnings=planningWarnings(shifts.data||[],employees.data||[],Number(settings.max_weekly_hours));
 const totalHours=rows.reduce((n,r)=>n+r.hours,0),totalCost=rows.reduce((n,r)=>n+r.cost,0);
 return <div className="space-y-4">
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary"/>Analyse du personnel</CardTitle></CardHeader>
   <CardContent className="space-y-4">
    <div className="flex flex-wrap items-center gap-3"><Button variant="outline" size="sm" onClick={()=>setOffset(n=>n-1)}>←</Button>
     <span>{range.start} au {range.end}</span><Button variant="outline" size="sm" onClick={()=>setOffset(n=>n+1)}>→</Button>
    </div>
    <div className="grid gap-3 sm:grid-cols-3">
     {[["Collaborateurs",rows.length.toString()],["Heures prévues",totalHours.toFixed(1)+" h"],["Coût prévisionnel",totalCost.toFixed(2)+" CHF"]].map(([label,value])=>
      <Card key={label}><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-xl font-bold">{value}</p></CardContent></Card>)}
    </div>
    {shifts.isError?<p className="text-destructive" role="alert">Planning indisponible.</p>:null}
    <div className="h-72 w-full"><ResponsiveContainer width="100%" height="100%">
     <BarChart data={rows} margin={{top:15,right:15,left:0,bottom:35}}><CartesianGrid strokeDasharray="3 3"/>
      <XAxis dataKey="name" angle={-25} textAnchor="end" height={75} tick={{fontSize:10}}/><YAxis/>
      <Tooltip formatter={(v)=>[Number(v).toFixed(1)+" h","Planifié"]}/>
      <Bar dataKey="hours" fill="#ff6a1a" radius={[5,5,0,0]}/>
     </BarChart>
    </ResponsiveContainer></div>
    <p className="text-xs text-muted-foreground">Coûts calculés sur les tarifs horaires renseignés par le restaurant, sans charges sociales, TVA, majorations ni retenues. Ce graphique ne remplace pas un logiciel de paie.</p>
   </CardContent></Card>
  <Card><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Risques et repos</CardTitle></CardHeader>
   <CardContent className="space-y-2">
    <p className="text-sm text-muted-foreground">Score indicatif de couverture et de repos, basé sur les services planifiés, sans inférence médicale.</p>
    {warnings.length?warnings.map(w=><p key={w} className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-2 text-sm">{w}</p>):
     <p className="text-sm">Aucune anomalie élémentaire détectée sur les services chargés.</p>}
   </CardContent></Card>
 </div>;
}
