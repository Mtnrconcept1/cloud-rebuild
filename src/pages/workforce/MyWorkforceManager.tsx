import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { CalendarDays, Clock3, Users, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { useAuth } from "@/lib/auth-context";
import { workforceDb,useWorkforceSettings } from "@/hooks/useTokWorkforce";
import WorkforcePlanning from "@/components/workforce/WorkforcePlanning";
import WorkforceTime from "@/components/workforce/WorkforceTime";
import WorkforceAbsences from "@/components/workforce/WorkforceAbsences";
import WorkforceRequests from "@/components/workforce/WorkforceRequests";
import WorkforceExchanges from "@/components/workforce/WorkforceExchanges";
import WorkforceReports from "@/components/workforce/WorkforceReports";
import WorkforceAnalytics from "@/components/workforce/WorkforceAnalytics";
import WorkforceClockOverview from "@/components/workforce/WorkforceClockOverview";

type Membership={restaurant_id:string;employee_id:string;restaurant_name:string;linked:boolean};
type SupervisorProfile={id:string;role:"manager"|"employee";is_active:boolean;user_id:string|null};
export default function MyWorkforceManager() {
 const {user}=useAuth();
 const [selectedId,setSelectedId]=useState("");
 const memberships=useQuery({queryKey:["workforce-management-memberships",user?.id],enabled:!!user?.id,
  queryFn:async()=>{const {data,error}=await workforceDb().rpc("tok_workforce_my_restaurants");if(error)throw error;return (data||[]) as Membership[];}});
 const linked=(memberships.data||[]).filter(m=>m.linked);
 const member=linked.find(m=>m.restaurant_id===selectedId)||linked[0];
 const restaurantId=member?.restaurant_id||null;
 const supervisor=useQuery({queryKey:["workforce-manager-profile",restaurantId,member?.employee_id,user?.id],
  enabled:!!restaurantId&&!!user,
  queryFn:async()=>{const {data,error}=await workforceDb().from("tok_workforce_employees")
   .select("id,role,is_active,user_id").eq("id",member!.employee_id).eq("restaurant_id",restaurantId!).single();
   if(error)throw error;return data as SupervisorProfile;}});
 const settings=useWorkforceSettings(restaurantId);
 const allowed=supervisor.data?.role==="manager"&&supervisor.data.is_active&&supervisor.data.user_id===user?.id&&settings.data?.enabled===true;
 return <main className="container mx-auto min-h-screen space-y-5 px-3 py-6 sm:px-6">
  <DashboardPageHero compact badge="Responsable d'équipe · TOK" icon={ShieldCheck} tone="orange"
    title="Gestion de mon équipe" description="Planning, badgeages, relevés, congés et validation des demandes pour votre établissement."
    actions={<Button variant="outline" asChild><Link to="/equipe/mon-espace">Mon espace salarié</Link></Button>}/>
  {memberships.isPending||supervisor.isPending&&!!restaurantId||settings.isPending&&!!restaurantId?
   <Card><CardContent className="py-8 text-muted-foreground">Vérification des autorisations de l'équipe…</CardContent></Card>:null}
  {memberships.isError||supervisor.isError||settings.isError?
   <Card><CardContent className="py-8 text-destructive" role="alert">Impossible de vérifier vos permissions de responsable.</CardContent></Card>:null}
  {!memberships.isPending&&!supervisor.isPending&&!settings.isPending&&!allowed?
   <Card><CardHeader><CardTitle>Accès responsable non autorisé</CardTitle></CardHeader>
    <CardContent className="text-sm text-muted-foreground">Votre compte doit être associé à un collaborateur actif désigné responsable par le restaurant. Le module RH doit être activé par un administrateur TOK.</CardContent></Card>:null}
  {allowed&&restaurantId?<div className="space-y-4">
   {linked.length>1?<label className="block text-sm">Établissement
     <select aria-label="Choisir un restaurant" value={restaurantId} onChange={e=>setSelectedId(e.target.value)}
      className="ml-2 rounded-lg border bg-background px-3 py-2">{linked.map(m=><option key={m.employee_id} value={m.restaurant_id}>{m.restaurant_name}</option>)}</select>
   </label>:<p className="font-medium text-primary">{member?.restaurant_name}</p>}
   <Tabs defaultValue="planning" className="space-y-5">
    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4 xl:grid-cols-8">
     <TabsTrigger value="planning"><CalendarDays className="mr-1 h-4 w-4"/>Planning</TabsTrigger>
     <TabsTrigger value="clock"><Clock3 className="mr-1 h-4 w-4"/>Présences</TabsTrigger>
     <TabsTrigger value="hours">Heures</TabsTrigger>
     <TabsTrigger value="absences">Absences</TabsTrigger>
     <TabsTrigger value="requests">Demandes</TabsTrigger>
     <TabsTrigger value="exchanges">Échanges</TabsTrigger>
     <TabsTrigger value="reports">Rapports</TabsTrigger>
     <TabsTrigger value="analytics"><Users className="mr-1 h-4 w-4"/>Analyses</TabsTrigger>
    </TabsList>
    <TabsContent value="planning"><WorkforcePlanning restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="clock"><WorkforceClockOverview restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="hours"><WorkforceTime restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="absences"><WorkforceAbsences restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="requests"><WorkforceRequests restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="exchanges"><WorkforceExchanges restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="reports"><WorkforceReports restaurantId={restaurantId} settings={settings.data!}/></TabsContent>
    <TabsContent value="analytics"><WorkforceAnalytics restaurantId={restaurantId} settings={settings.data!}/></TabsContent>
   </Tabs>
  </div>:null}
 </main>;
}
