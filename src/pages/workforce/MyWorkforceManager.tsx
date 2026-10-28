import { useQuery } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
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
import WorkforceAssistant from "@/components/workforce/WorkforceAssistant";
import WorkforceSettingsPanel from "@/components/workforce/WorkforceSettingsPanel";
import {getWorkforceContinuationTarget,WORKFORCE_MANAGEMENT_PATH} from "@/lib/workforceContinuation";

type Membership={restaurant_id:string;employee_id:string;restaurant_name:string;linked:boolean};
type SupervisorProfile={id:string;role:"manager"|"employee";is_active:boolean;user_id:string|null};
export default function MyWorkforceManager() {
 const {user}=useAuth();
 const [searchParams,setSearchParams]=useSearchParams();
 const search=searchParams.toString();
 const validTarget=getWorkforceContinuationTarget(WORKFORCE_MANAGEMENT_PATH+(search?"?"+search:""));
 const selectedId=searchParams.get("restaurant")?.toLowerCase()||"";
 const memberships=useQuery({queryKey:["workforce-management-memberships",user?.id],enabled:!!user?.id,
  queryFn:async()=>{const {data,error}=await workforceDb().rpc("tok_workforce_my_restaurants");if(error)throw error;return (data||[]) as Membership[];}});
 const linked=(memberships.data||[]).filter(m=>m.linked);
 const member=!memberships.isError&&validTarget?(selectedId?linked.find(m=>m.restaurant_id===selectedId):linked[0]):undefined;
 const restaurantId=member?.restaurant_id||null;
 const supervisor=useQuery({queryKey:["workforce-manager-profile",restaurantId,member?.employee_id,user?.id],
  enabled:!!restaurantId&&!!user,
  queryFn:async()=>{const {data,error}=await workforceDb().from("tok_workforce_employees")
   .select("id,role,is_active,user_id").eq("id",member!.employee_id).eq("restaurant_id",restaurantId!).eq("user_id",user!.id).single();
   if(error)throw error;return data as SupervisorProfile;}});
 const settings=useWorkforceSettings(restaurantId);
 const allowed=!memberships.isError&&!supervisor.isError&&!settings.isError&&supervisor.data?.role==="manager"&&supervisor.data.is_active&&supervisor.data.user_id===user?.id&&settings.data?.enabled===true;
 const waiting=memberships.isPending||(!!restaurantId&&(supervisor.isPending||settings.isPending));
 return <main className="container mx-auto min-h-screen space-y-5 px-3 py-6 sm:px-6">
  <DashboardPageHero compact badge="Responsable d'équipe · TOK" icon={ShieldCheck} tone="orange"
    title="Gestion de mon équipe" description="Planning, badgeages, relevés, congés et validation des demandes pour votre établissement."
    actions={<Button variant="outline" asChild><Link to={"/equipe/mon-espace"+(restaurantId?"?restaurant="+restaurantId:"")}>Mon espace salarié</Link></Button>}/>
  {waiting?
   <Card><CardContent className="py-8 text-muted-foreground">Vérification des autorisations de l'équipe…</CardContent></Card>:null}
  {memberships.isError||supervisor.isError||settings.isError?
   <Card><CardContent className="py-8 text-destructive" role="alert">Impossible de vérifier vos permissions de responsable.</CardContent></Card>:null}
  {!waiting&&!allowed?
   <Card><CardHeader><CardTitle>Accès responsable non autorisé</CardTitle></CardHeader>
    <CardContent className="text-sm text-muted-foreground">Votre compte doit être associé à un collaborateur actif désigné responsable par le restaurant. Le module RH doit être activé par un administrateur TOK.</CardContent></Card>:null}
  {!memberships.isError&&linked.length>0?<div className="space-y-2">
    <label htmlFor="manager-workforce-restaurant" className="block text-sm font-medium">Établissement</label>
    <select id="manager-workforce-restaurant" aria-label="Choisir un restaurant" value={restaurantId||""}
      onChange={event=>{if(linked.some(item=>item.restaurant_id===event.target.value))setSearchParams({restaurant:event.target.value},{replace:true});}}
      className="w-full rounded-xl border bg-background px-3 py-2 sm:max-w-md">
      <option value="" disabled>Choisir un établissement accessible</option>
      {linked.map(item=><option key={item.employee_id} value={item.restaurant_id}>{item.restaurant_name}</option>)}
    </select>
    {!member?<p className="text-sm text-muted-foreground">Ce lien ne correspond pas à un établissement accessible. Choisissez explicitement l’un de vos établissements.</p>:null}
  </div>:null}
  {allowed&&restaurantId?<div className="space-y-4">
   <Tabs key={restaurantId} defaultValue="planning" className="space-y-5">
    <TabsList className="grid h-auto w-full grid-cols-2 gap-1 p-1 sm:grid-cols-4 xl:grid-cols-5">
     <TabsTrigger value="planning"><CalendarDays className="mr-1 h-4 w-4"/>Planning</TabsTrigger>
     <TabsTrigger value="clock"><Clock3 className="mr-1 h-4 w-4"/>Présences</TabsTrigger>
     <TabsTrigger value="hours">Heures</TabsTrigger>
     <TabsTrigger value="absences">Absences</TabsTrigger>
     <TabsTrigger value="requests">Demandes</TabsTrigger>
     <TabsTrigger value="exchanges">Échanges</TabsTrigger>
     <TabsTrigger value="reports">Rapports</TabsTrigger>
     <TabsTrigger value="analytics"><Users className="mr-1 h-4 w-4"/>Analyses</TabsTrigger>
     <TabsTrigger value="assistant">Assistant</TabsTrigger>
     <TabsTrigger value="settings">Paramètres</TabsTrigger>
    </TabsList>
    <TabsContent value="planning"><WorkforcePlanning restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="clock"><WorkforceClockOverview restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="hours"><WorkforceTime restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="absences"><WorkforceAbsences restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="requests"><WorkforceRequests restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="exchanges"><WorkforceExchanges restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="reports"><WorkforceReports restaurantId={restaurantId} settings={settings.data!} restaurantName={member?.restaurant_name}/></TabsContent>
    <TabsContent value="analytics"><WorkforceAnalytics restaurantId={restaurantId} settings={settings.data!}/></TabsContent>
    <TabsContent value="assistant"><WorkforceAssistant restaurantId={restaurantId}/></TabsContent>
    <TabsContent value="settings"><WorkforceSettingsPanel restaurantId={restaurantId} settings={settings.data!}/></TabsContent>
   </Tabs>
  </div>:null}
 </main>;
}
