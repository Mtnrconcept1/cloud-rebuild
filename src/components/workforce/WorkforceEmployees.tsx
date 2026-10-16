import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { employeeName,type WorkforceEmployee } from "@/lib/tokWorkforce";
import { useWorkforceEmployees, useWorkforceRefresh, workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforceEmployees({restaurantId}:{restaurantId:string}) {
  const {data:employees=[],isPending,isError}=useWorkforceEmployees(restaurantId,true);
  const refresh=useWorkforceRefresh(restaurantId);
  const {toast}=useToast();
  const [editing,setEditing]=useState<WorkforceEmployee|null>(null);
  const [vacation,setVacation]=useState("20");
  const [first,setFirst]=useState("");
  const [last,setLast]=useState("");
  const [email,setEmail]=useState("");
  const [hours,setHours]=useState("42");
  const [cost,setCost]=useState("0");
  const [role,setRole]=useState<"employee"|"manager">("employee");
  const create=useMutation({
    mutationFn:async()=>{
      if(!first.trim()||!last.trim()||first.length>100||last.length>100)throw new Error("Renseignez un prénom et un nom valides.");
      const contracted=Number(hours);
      if(!Number.isFinite(contracted)||contracted<0||contracted>60)throw new Error("Heures contractuelles invalides.");
      if(email && (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)||email.length>254))throw new Error("Adresse e-mail invalide.");
      if(!Number.isFinite(Number(cost))||Number(cost)<0||Number(cost)>10000)throw new Error("Coût horaire invalide.");
      const days=Number(vacation);
      if(!Number.isInteger(days)||days<0||days>60)throw new Error("Vacances annuelles invalides.");
      const values={
        restaurant_id:restaurantId,first_name:first.trim(),last_name:last.trim(),
        email:email.trim().toLowerCase()||null,contracted_hours_per_week:contracted,hourly_cost_chf:Number(cost),role,
        vacation_days_per_year:days,
      };
      const query=workforceDb().from("tok_workforce_employees");
      const {error}=editing
        ? await query.update(values).eq("restaurant_id",restaurantId).eq("id",editing.id).select("id").single()
        : await query.insert(values).select("id").single();
      if(error)throw error;
    },
    onSuccess:()=>{setEditing(null);setFirst("");setLast("");setEmail("");setHours("42");setCost("0");setVacation("20");setRole("employee");refresh();toast({title:editing?"Collaborateur mis à jour":"Collaborateur ajouté"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Enregistrement impossible",description:error.message}),
  });
  const toggle=useMutation({
    mutationFn:async({id,active}:{id:string;active:boolean})=>{
      const {error}=await workforceDb().from("tok_workforce_employees")
        .update({is_active:active}).eq("restaurant_id",restaurantId).eq("id",id).select("id").single();
      if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Fiche mise à jour"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Mise à jour impossible",description:error.message}),
  });
  const edit=(employee:WorkforceEmployee)=>{
    setEditing(employee);setFirst(employee.first_name);setLast(employee.last_name);
    setEmail(employee.email||"");setHours(String(employee.contracted_hours_per_week));
    setCost(String(employee.hourly_cost_chf||0));setVacation(String(employee.vacation_days_per_year));setRole(employee.role);
  };
  const submit=(event:FormEvent)=>{event.preventDefault();create.mutate();};
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(18rem,24rem)]">
    <Card className="rounded-2xl border-border/70">
      <CardHeader><CardTitle className="flex items-center gap-2"><UserRoundCheck className="h-5 w-5 text-primary"/>Équipe ({employees.filter(e=>e.is_active).length} actifs)</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {isPending?<p className="text-muted-foreground">Chargement de l'équipe…</p>:null}
        {isError?<p role="alert" className="text-destructive">Impossible de charger les employés.</p>:null}
        {!isPending && employees.length===0?<p className="text-muted-foreground">Ajoutez votre premier collaborateur pour préparer les plannings.</p>:null}
        {employees.map(employee=><div key={employee.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/60 p-3">
          <div className="min-w-0">
            <p className="font-semibold break-words">{employeeName(employee)}</p>
            <p className="text-xs text-muted-foreground break-all">{employee.email||"Sans adresse e-mail"} · {employee.contracted_hours_per_week} h/semaine · {employee.hourly_cost_chf||0} CHF/h · {employee.vacation_days_per_year} jours de vacances</p>
            <Badge className="mt-2" variant={employee.is_active?"secondary":"outline"}>{employee.is_active?(employee.role==="manager"?"Responsable":"Employé"):"Inactif"}</Badge>
          </div>
          <Button size="sm" variant="outline" disabled={create.isPending} onClick={()=>edit(employee)}>Modifier la fiche</Button>
          <Button size="sm" variant="outline" disabled={toggle.isPending} aria-label={employee.is_active?"Désactiver "+employeeName(employee):"Réactiver "+employeeName(employee)}
            onClick={()=>toggle.mutate({id:employee.id,active:!employee.is_active})}>
            {employee.is_active?<UserRoundX className="mr-1 h-4 w-4"/>:<UserRoundCheck className="mr-1 h-4 w-4"/>}
            {employee.is_active?"Désactiver":"Réactiver"}
          </Button>
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary"/>{editing?"Modifier le collaborateur":"Ajouter un collaborateur"}</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-3">
        <div><Label htmlFor="wf-first">Prénom</Label><Input id="wf-first" maxLength={100} required value={first} onChange={e=>setFirst(e.target.value)}/></div>
        <div><Label htmlFor="wf-last">Nom</Label><Input id="wf-last" maxLength={100} required value={last} onChange={e=>setLast(e.target.value)}/></div>
        <div><Label htmlFor="wf-email">E-mail (facultatif)</Label><Input id="wf-email" disabled={Boolean(editing?.user_id)} type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></div>
        <div><Label htmlFor="wf-hours">Heures contractuelles par semaine</Label><Input id="wf-hours" type="number" step="0.5" min="0" max="60" required value={hours} onChange={e=>setHours(e.target.value)}/></div>
        <div><Label htmlFor="wf-vacation">Jours de vacances annuels</Label><Input id="wf-vacation" type="number" min="0" max="60" step="1" required value={vacation} onChange={e=>setVacation(e.target.value)}/></div>
        <div><Label htmlFor="wf-cost">Coût horaire indicatif (CHF/h)</Label><Input id="wf-cost" type="number" step="0.05" min="0" max="10000" required value={cost} onChange={e=>setCost(e.target.value)}/></div>
        <div><Label htmlFor="wf-role">Fonction</Label><select id="wf-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={e=>setRole(e.target.value as "employee"|"manager")}>
          <option value="employee">Employé</option><option value="manager">Responsable d'équipe</option>
        </select></div>
        <Button type="submit" disabled={create.isPending} className="w-full">{create.isPending?"Enregistrement…":editing?"Enregistrer la fiche":"Ajouter à l'équipe"}</Button>
        {editing?<Button type="button" variant="ghost" disabled={create.isPending} onClick={()=>{setEditing(null);setFirst("");setLast("");setEmail("");setHours("42");setCost("0");setVacation("20");setRole("employee");}}>Annuler la modification</Button>:null}
        <p className="text-xs text-muted-foreground">Le collaborateur accède à sa badgeuse sur /equipe/mon-espace avec son adresse e-mail vérifiée. Une fiche déjà liée conserve son identité TOK.</p>
      </form></CardContent>
    </Card>
  </div>;
}
