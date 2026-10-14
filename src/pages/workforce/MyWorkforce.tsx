import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Clock3, Home, MailCheck, UserRoundCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { workforceDb } from "@/hooks/useTokWorkforce";
import type { WorkforceEmployee } from "@/lib/tokWorkforce";
import WorkforcePersonal from "@/components/workforce/WorkforcePersonal";

type Member={restaurant_id:string;employee_id:string;restaurant_name:string;linked:boolean};
export default function MyWorkforce() {
 const {user}=useAuth(),{toast}=useToast(),client=useQueryClient();
 const [selectedId,setSelectedId]=useState("");
 const memberships=useQuery({
   queryKey:["workforce-memberships",user?.id],
   enabled:!!user?.id,
   queryFn:async()=>{const {data,error}=await workforceDb().rpc("tok_workforce_my_restaurants");
    if(error)throw error;return (data||[]) as Member[];},
 });
 const selected=(memberships.data||[]).find(m=>m.restaurant_id===selectedId)||memberships.data?.[0]||null;
 const profile=useQuery({
   queryKey:["workforce-self-profile",user?.id,selected?.employee_id],
   enabled:!!selected?.linked,
   queryFn:async()=>{
    const {data,error}=await workforceDb().from("tok_workforce_employees")
      .select("id,restaurant_id,first_name,last_name,contracted_hours_per_week,vacation_days_per_year")
      .eq("id",selected!.employee_id).eq("restaurant_id",selected!.restaurant_id).single();
    if(error)throw error;return data as Pick<WorkforceEmployee,"id"|"restaurant_id"|"first_name"|"last_name"|"contracted_hours_per_week"|"vacation_days_per_year">;
   },
 });
 const claim=useMutation({
   mutationFn:async()=>{if(!selected)throw new Error("Aucune invitation");const {error}=await workforceDb().rpc("tok_workforce_claim_employee",{p_restaurant_id:selected.restaurant_id});
    if(error)throw error;},
   onSuccess:()=>{client.invalidateQueries({queryKey:["workforce-memberships"]});client.invalidateQueries({queryKey:["workforce-self-profile"]});toast({title:"Compte associé à votre établissement"});},
   onError:(err:Error)=>toast({title:"Association impossible",description:err.message,variant:"destructive"}),
 });
 return <main className="container mx-auto min-h-screen space-y-5 px-3 py-6 sm:px-6">
  <DashboardPageHero compact badge="Espace collaborateur" title="Mon équipe TOK"
   description="Badgez votre arrivée et votre départ, consultez vos horaires, vos compteurs et vos demandes, directement avec votre compte TOK."
   icon={Clock3} tone="orange" actions={<Button variant="outline" asChild><Link to="/espaces"><Home className="mr-2 h-4 w-4"/>Mes espaces</Link></Button>}/>
  {memberships.isPending?<Card><CardContent className="py-10 text-center text-muted-foreground">Recherche de vos établissements…</CardContent></Card>:null}
  {memberships.isError?<Card><CardContent className="py-8 text-destructive" role="alert">Impossible de vérifier vos droits d'accès. Aucun pointage possible.</CardContent></Card>:null}
  {!memberships.isPending&&!memberships.isError&&!selected?<Card><CardHeader><CardTitle>Pas d'établissement associé</CardTitle></CardHeader>
   <CardContent className="text-sm text-muted-foreground">Demandez à votre employeur de vous enregistrer avec la même adresse e-mail que votre compte TOK. Vérifiez votre adresse e-mail dans TOK, puis rechargez cette page. Seules les entreprises dont l'administrateur TOK a activé la gestion du personnel sont accessibles.</CardContent></Card>:null}
  {selected?<div className="space-y-4">
   <Card><CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
    <div><p className="font-semibold">{selected.restaurant_name}</p><p className="text-xs text-muted-foreground">{selected.linked?"Compte collaborateur vérifié":"Invitation à accepter"}</p></div>
    {(memberships.data?.length||0)>1?<select className="rounded-xl border bg-background px-3 py-2 text-sm" aria-label="Choisir l'établissement" value={selected.restaurant_id} onChange={e=>setSelectedId(e.target.value)}>
     {memberships.data?.map(m=><option key={m.employee_id} value={m.restaurant_id}>{m.restaurant_name}</option>)}
    </select>:null}
    {selected.linked?<Badge><UserRoundCheck className="mr-2 h-4 w-4"/>Accès vérifié</Badge>:null}
   </CardContent></Card>
   {!selected.linked?<Card className="border-primary/30"><CardHeader><CardTitle className="flex items-center gap-2"><MailCheck className="h-5 w-5 text-primary"/>Accepter mon invitation</CardTitle></CardHeader>
    <CardContent className="space-y-4"><p className="text-sm text-muted-foreground">Votre employeur vous a déclaré avec votre adresse e-mail vérifiée. L’association permet de consulter uniquement vos propres données et de badger en votre nom.</p>
     <Button disabled={claim.isPending} onClick={()=>claim.mutate()}>Associer mon compte TOK</Button></CardContent></Card>:null}
   {selected.linked&&profile.isPending?<p className="text-muted-foreground">Chargement de votre profil…</p>:null}
   {profile.isError?<p role="alert" className="text-destructive">Impossible de charger votre profil employé.</p>:null}
   {selected.linked&&profile.data?<WorkforcePersonal key={selected.employee_id} restaurantId={selected.restaurant_id} employeeId={selected.employee_id}
     contractHours={Number(profile.data.contracted_hours_per_week)} vacationDays={Number(profile.data.vacation_days_per_year)}/>:null}
  </div>:null}
 </main>;
}
