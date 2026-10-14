import { useState, type FormEvent } from "react";
import { useMutation } from "@tanstack/react-query";
import { UserPlus, UserRoundCheck, UserRoundX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { employeeName } from "@/lib/tokWorkforce";
import { useWorkforceEmployees, useWorkforceRefresh, workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforceEmployees({restaurantId}:{restaurantId:string}) {
  const {data:employees=[],isPending,isError}=useWorkforceEmployees(restaurantId,true);
  const refresh=useWorkforceRefresh(restaurantId);
  const {toast}=useToast();
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
      const {error}=await workforceDb().from("tok_workforce_employees").insert({
        restaurant_id:restaurantId,first_name:first.trim(),last_name:last.trim(),
        email:email.trim()||null,contracted_hours_per_week:contracted,hourly_cost_chf:Number(cost),role,
      });
      if(error)throw error;
    },
    onSuccess:()=>{setFirst("");setLast("");setEmail("");refresh();toast({title:"Collaborateur ajouté"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Enregistrement impossible",description:error.message}),
  });
  const toggle=useMutation({
    mutationFn:async({id,active}:{id:string;active:boolean})=>{
      const {error}=await workforceDb().from("tok_workforce_employees")
        .update({is_active:active}).eq("restaurant_id",restaurantId).eq("id",id);
      if(error)throw error;
    },
    onSuccess:()=>{refresh();toast({title:"Fiche mise à jour"});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Mise à jour impossible",description:error.message}),
  });
  const changeCost=async(id:string,value:number)=>{try{const {error}=await workforceDb().from("tok_workforce_employees").update({hourly_cost_chf:value}).eq("restaurant_id",restaurantId).eq("id",id);if(error)throw error;refresh();toast({title:"Coût horaire actualisé"});}catch(error){toast({variant:"destructive",title:"Mise à jour impossible",description:error instanceof Error?error.message:"Erreur"});}};
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
            <p className="text-xs text-muted-foreground break-all">{employee.email||"Sans adresse e-mail"} · {employee.contracted_hours_per_week} h/semaine · {employee.hourly_cost_chf||0} CHF/h</p>
            <Badge className="mt-2" variant={employee.is_active?"secondary":"outline"}>{employee.is_active?(employee.role==="manager"?"Responsable":"Employé"):"Inactif"}</Badge>
          </div>
          <Button size="sm" variant="outline" onClick={()=>{const answer=window.prompt("Coût horaire estimé en CHF",String(employee.hourly_cost_chf||0));if(answer===null)return;const cost=Number(answer);if(!Number.isFinite(cost)||cost<0||cost>10000){toast({title:"Coût invalide",variant:"destructive"});return;}void changeCost(employee.id,cost);}}>Coût CHF/h</Button>
          <Button size="sm" variant="outline" disabled={toggle.isPending} aria-label={employee.is_active?"Désactiver "+employeeName(employee):"Réactiver "+employeeName(employee)}
            onClick={()=>toggle.mutate({id:employee.id,active:!employee.is_active})}>
            {employee.is_active?<UserRoundX className="mr-1 h-4 w-4"/>:<UserRoundCheck className="mr-1 h-4 w-4"/>}
            {employee.is_active?"Désactiver":"Réactiver"}
          </Button>
        </div>)}
      </CardContent>
    </Card>
    <Card className="h-fit rounded-2xl border-primary/25">
      <CardHeader><CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-primary"/>Ajouter un collaborateur</CardTitle></CardHeader>
      <CardContent><form onSubmit={submit} className="space-y-3">
        <div><Label htmlFor="wf-first">Prénom</Label><Input id="wf-first" maxLength={100} required value={first} onChange={e=>setFirst(e.target.value)}/></div>
        <div><Label htmlFor="wf-last">Nom</Label><Input id="wf-last" maxLength={100} required value={last} onChange={e=>setLast(e.target.value)}/></div>
        <div><Label htmlFor="wf-email">E-mail (facultatif)</Label><Input id="wf-email" type="email" maxLength={254} value={email} onChange={e=>setEmail(e.target.value)}/></div>
        <div><Label htmlFor="wf-hours">Heures contractuelles par semaine</Label><Input id="wf-hours" type="number" step="0.5" min="0" max="60" required value={hours} onChange={e=>setHours(e.target.value)}/></div>
        <div><Label htmlFor="wf-cost">Coût horaire indicatif (CHF/h)</Label><Input id="wf-cost" type="number" step="0.05" min="0" max="10000" required value={cost} onChange={e=>setCost(e.target.value)}/></div>
        <div><Label htmlFor="wf-role">Fonction</Label><select id="wf-role" className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={role} onChange={e=>setRole(e.target.value as "employee"|"manager")}>
          <option value="employee">Employé</option><option value="manager">Responsable d'équipe</option>
        </select></div>
        <Button type="submit" disabled={create.isPending} className="w-full">{create.isPending?"Enregistrement…":"Ajouter à l'équipe"}</Button>
      </form></CardContent>
    </Card>
  </div>;
}
