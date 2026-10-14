import { useQuery } from "@tanstack/react-query";
import { Clock3, AlertTriangle } from "lucide-react";
import { Card,CardHeader,CardContent,CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { workforceDb, useWorkforceEmployees } from "@/hooks/useTokWorkforce";
import { employeeName } from "@/lib/tokWorkforce";

type ClockRow={id:string;employee_id:string;clock_in_at:string;clock_out_at:string|null;pause_started_at:string|null;entry_id:string|null};
export default function WorkforceClockOverview({restaurantId}:{restaurantId:string}) {
 const employees=useWorkforceEmployees(restaurantId,true);
 const rows=useQuery({queryKey:["workforce-clock-overview",restaurantId],refetchInterval:30000,
   queryFn:async()=>{const {data,error}=await workforceDb().from("tok_workforce_clock_sessions")
   .select("id,employee_id,clock_in_at,clock_out_at,pause_started_at,entry_id")
   .eq("restaurant_id",restaurantId).order("clock_in_at",{ascending:false}).limit(150);
   if(error)throw error;return (data||[]) as ClockRow[];}});
 const active=rows.data?.filter(s=>!s.clock_out_at)||[];
 const pending=rows.data?.filter(s=>s.clock_out_at&&!s.entry_id)||[];
 const stamp=(iso:string)=>new Intl.DateTimeFormat("fr-CH",{timeZone:"Europe/Zurich",dateStyle:"short",timeStyle:"short"}).format(new Date(iso));
 return <div className="grid gap-4 lg:grid-cols-2">
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex gap-2 items-center"><Clock3 className="h-5 w-5 text-primary"/>Présences en temps réel ({active.length})</CardTitle></CardHeader>
    <CardContent className="space-y-2">
     {rows.isPending?<p className="text-muted-foreground">Chargement…</p>:null}
     {rows.isError?<p role="alert" className="text-destructive">Impossible de récupérer les pointages.</p>:null}
     {!active.length&&!rows.isPending?<p className="text-muted-foreground">Personne n'a badgé aujourd'hui ou aucun service actif.</p>:null}
     {active.map(s=><div key={s.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3">
       <div><p className="font-medium">{employeeName(employees.data?.find(e=>e.id===s.employee_id))}</p><p className="text-xs text-muted-foreground">Depuis {stamp(s.clock_in_at)}</p></div>
       <Badge variant={s.pause_started_at?"secondary":"default"}>{s.pause_started_at?"En pause":"En service"}</Badge>
     </div>)}
     <Button asChild variant="outline"><Link to="/equipe/mon-espace">Ouvrir mon espace collaborateur</Link></Button>
     <p className="text-xs text-muted-foreground">Chaque collaborateur doit se connecter avec son propre compte TOK et son email vérifié. Aucun badgeage au nom d'une autre personne.</p>
    </CardContent></Card>
   <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500"/>Pointages à contrôler ({pending.length})</CardTitle></CardHeader>
    <CardContent className="space-y-2">
     {!pending.length?<p className="text-sm text-muted-foreground">Aucune session à régulariser parmi les 150 plus récentes.</p>:null}
     {pending.map(s=><div key={s.id} className="rounded-xl border p-3 text-sm">
      <span className="font-medium">{employeeName(employees.data?.find(e=>e.id===s.employee_id))}</span><p className="text-muted-foreground">{stamp(s.clock_in_at)} – {s.clock_out_at?stamp(s.clock_out_at):""}</p>
      <p className="text-xs text-destructive">Durée anormale ou non convertie en relevé : à saisir et valider manuellement.</p>
     </div>)}
     <p className="text-xs text-muted-foreground">Les heures badgées créent des relevés à valider dans l'onglet « Heures ».</p>
    </CardContent></Card>
 </div>;
}
