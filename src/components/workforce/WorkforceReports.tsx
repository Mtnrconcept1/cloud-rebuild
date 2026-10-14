import "@/styles/workforce-report-print.css";
import { useMemo,useState } from "react";
import { addWeeks,subWeeks,format } from "date-fns";
import { fr } from "date-fns/locale";
import { AlertTriangle, BarChart3, ChevronLeft, ChevronRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { csvCell,employeeName,weekRange,workedHours,type WorkforceSettings } from "@/lib/tokWorkforce";
import { planningWarnings } from "@/lib/tokWorkforceWarnings";
import { useWorkforceEmployees,useWorkforceShifts,useWorkforceEntriesInRange } from "@/hooks/useTokWorkforce";

export default function WorkforceReports({restaurantId,settings}:{restaurantId:string;settings:WorkforceSettings}) {
  const [cursor,setCursor]=useState(new Date());
  const {start,end}=useMemo(()=>weekRange(cursor),[cursor]);
  const {data:employees=[]}=useWorkforceEmployees(restaurantId,true);
  const {data:shifts=[],isPending}=useWorkforceShifts(restaurantId,true,start,end);
  const {data:entries=[]}=useWorkforceEntriesInRange(restaurantId,true,start,end);
  const data=useMemo(()=>employees.filter(e=>e.is_active).map(employee=>{
    const planned=shifts.filter(s=>s.employee_id===employee.id&&s.status!=="cancelled").reduce((acc,shift)=>{
      try{return acc+workedHours(shift.start_time,shift.end_time,shift.break_minutes);}catch{return acc;}
    },0);
    const actual=entries.filter(entry=>entry.employee_id===employee.id&&entry.entry_date>=start&&entry.entry_date<=end)
      .reduce((acc,entry)=>{try{return acc+workedHours(entry.start_time,entry.end_time,entry.break_minutes);}catch{return acc;}},0);
    return {employee,planned:Math.round(planned*100)/100,actual:Math.round(actual*100)/100};
  }),[employees,shifts,entries,start,end]);
  const warnings=useMemo(()=>planningWarnings(shifts,employees,settings.max_weekly_hours),[shifts,employees,settings.max_weekly_hours]);
  const download=()=>{
    const rows=[
      ["Collaborateur","Du","Au","Heures contractuelles","Heures planifiées","Heures saisies"],
      ...data.map(d=>[employeeName(d.employee),start,end,d.employee.contracted_hours_per_week,d.planned,d.actual]),
    ];
    const csv="\uFEFF"+rows.map(row=>row.map(csvCell).join(";")).join("\r\n");
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download="tok-equipe-"+start+"-"+end+".csv";document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  };
  return <div id="tok-workforce-print" className="space-y-5">
    <Card className="rounded-2xl">
      <CardHeader><div className="flex flex-wrap items-center justify-between gap-3">
        <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5 text-primary"/>Rapport hebdomadaire</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="icon" variant="outline" aria-label="Semaine précédente" onClick={()=>setCursor(d=>subWeeks(d,1))}><ChevronLeft className="h-4 w-4"/></Button>
          <span className="text-sm font-semibold">{format(new Date(start+"T12:00:00"),"d MMM",{locale:fr})} – {format(new Date(end+"T12:00:00"),"d MMM yyyy",{locale:fr})}</span>
          <Button size="icon" variant="outline" aria-label="Semaine suivante" onClick={()=>setCursor(d=>addWeeks(d,1))}><ChevronRight className="h-4 w-4"/></Button>
          <Button size="sm" variant="outline" onClick={download}><Download className="mr-1 h-4 w-4"/>Exporter CSV</Button>
          <Button className="workforce-no-print" size="sm" variant="outline" onClick={()=>window.print()}>Imprimer / PDF</Button>
        </div>
      </div></CardHeader>
      <CardContent>
        {isPending?<p className="text-muted-foreground">Calcul du rapport…</p>:null}
        <div className="overflow-x-auto"><table className="w-full min-w-[520px] text-left text-sm">
          <thead><tr className="border-b text-muted-foreground"><th className="p-3">Collaborateur</th><th className="p-3 text-right">Contrat</th><th className="p-3 text-right">Prévu</th><th className="p-3 text-right">Réalisé</th><th className="p-3 text-right">Écart prévu</th></tr></thead>
          <tbody>{data.map(d=><tr key={d.employee.id} className="border-b last:border-0">
            <td className="p-3 font-medium">{employeeName(d.employee)}</td><td className="p-3 text-right">{d.employee.contracted_hours_per_week} h</td>
            <td className="p-3 text-right">{d.planned.toFixed(1)} h</td><td className="p-3 text-right">{d.actual.toFixed(1)} h</td>
            <td className="p-3 text-right"><Badge variant={d.planned>d.employee.contracted_hours_per_week?"destructive":"secondary"}>{(d.planned-d.employee.contracted_hours_per_week).toFixed(1)} h</Badge></td>
          </tr>)}</tbody>
        </table></div>
        {!data.length?<p className="py-4 text-muted-foreground">Aucun collaborateur actif.</p>:null}
        <p className="mt-4 text-xs text-muted-foreground">Données calculées sur les relevés récents disponibles (jusqu'à 1 000 pour la semaine) et les services de la semaine (jusqu'à 350). Export indicatif, non destiné à la paie sans vérification.</p>
      </CardContent>
    </Card>
    <Card className="rounded-2xl">
      <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Points de vigilance du planning</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        <p className="text-sm text-muted-foreground">Canton : {settings.canton} · Seuil hebdomadaire configurable : {settings.max_weekly_hours} h. Les règles dépendent du secteur, des dérogations applicables et du droit suisse.</p>
        {warnings.length?warnings.map(warning=><p key={warning} className="rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-sm">{warning}</p>):
          <p className="rounded-xl bg-muted/50 px-3 py-2 text-sm">Aucun conflit élémentaire détecté sur les services chargés. Vérifiez la conformité légale avec votre spécialiste RH.</p>}
        {entries.length>=1000?<p role="alert" className="text-destructive">Limite de 1 000 relevés atteinte : rapport potentiellement incomplet.</p>:null}
        {shifts.length>=350?<p role="alert" className="text-destructive">Limite de 350 services atteinte : rapport potentiellement incomplet.</p>:null}
      </CardContent>
    </Card>
  </div>;
}
