import { Link } from "react-router-dom";
import { CalendarDays, Clock3, ClipboardList, ArrowLeftRight, BarChart3, Users, CalendarOff, ShieldCheck, Bot, Settings2 } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Tabs,TabsContent,TabsList,TabsTrigger } from "@/components/ui/tabs";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { useWorkforceSettings } from "@/hooks/useTokWorkforce";
import WorkforceEmployees from "@/components/workforce/WorkforceEmployees";
import WorkforcePlanning from "@/components/workforce/WorkforcePlanning";
import WorkforceTime from "@/components/workforce/WorkforceTime";
import WorkforceAbsences from "@/components/workforce/WorkforceAbsences";
import WorkforceRequests from "@/components/workforce/WorkforceRequests";
import WorkforceExchanges from "@/components/workforce/WorkforceExchanges";
import WorkforceReports from "@/components/workforce/WorkforceReports";
import WorkforceClockOverview from "@/components/workforce/WorkforceClockOverview";
import WorkforceAnalytics from "@/components/workforce/WorkforceAnalytics";

import WorkforceAssistant from "@/components/workforce/WorkforceAssistant";
import WorkforceSettingsPanel from "@/components/workforce/WorkforceSettingsPanel";

export default function DashboardWorkforce() {
  const {selectedId,restaurants,loading,isDemoMode}=useDashboardRestaurant();
  const restaurantName=restaurants.find(restaurant=>restaurant.id===selectedId)?.name;
  const settings=useWorkforceSettings(isDemoMode?null:selectedId);
  const enabled=!isDemoMode && settings.data?.enabled===true;
  return <DashboardLayout mainClassName="tok-restaurant-page tok-page-workforce">
    <div className="space-y-6">
      <DashboardPageHero badge="Gestion du personnel" icon={Clock3} title="TOK Équipe"
        description="Vos collaborateurs, votre planning de service, les heures travaillées et les congés dans un seul espace, aux couleurs de TOK."
        tone="orange" compact
        stats={[
          {label:"Accès",value:enabled?"Activé":"En attente",icon:ShieldCheck},
          {label:"Canton",value:settings.data?.canton||"GE",icon:CalendarDays},
          {label:"Heures/semaine",value:String(settings.data?.max_weekly_hours||50),icon:Clock3},
        ]}
      />
      {(loading || (settings.isPending && !!selectedId && !isDemoMode))?
        <Card className="rounded-2xl"><CardContent className="py-10 text-center text-muted-foreground">Vérification de vos droits d'accès…</CardContent></Card>:
        settings.isError?
          <Card className="rounded-2xl border-destructive/30"><CardContent className="py-8 text-destructive" role="alert">Impossible de vérifier l'autorisation de ce restaurant. Réessayez ultérieurement.</CardContent></Card>:
        !enabled?
          <Card className="rounded-2xl border-primary/20"><CardHeader><CardTitle>Module non activé</CardTitle></CardHeader>
            <CardContent className="space-y-3"><p className="text-sm text-muted-foreground">TOK Équipe est une fonctionnalité optionnelle. Un administrateur TOK doit l'activer pour votre restaurant. Vos autres outils restent disponibles.</p>
              <Button asChild variant="outline"><Link to="/dashboard/support">Demander l'activation</Link></Button>
            </CardContent></Card>:
          <Tabs key={selectedId} defaultValue="planning" className="w-full space-y-5">
            <TabsList className="grid h-auto w-full grid-cols-2 gap-1 rounded-xl bg-muted/50 p-1 sm:grid-cols-4 xl:grid-cols-6">
              <TabsTrigger className="gap-1.5" value="planning"><CalendarDays className="h-4 w-4"/>Planning</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="employees"><Users className="h-4 w-4"/>Équipe</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="clock"><Clock3 className="h-4 w-4"/>Badgeuse</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="hours"><Clock3 className="h-4 w-4"/>Heures</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="absences"><CalendarOff className="h-4 w-4"/>Absences</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="requests"><ClipboardList className="h-4 w-4"/>Demandes</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="exchanges"><ArrowLeftRight className="h-4 w-4"/>Échanges</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="reports"><BarChart3 className="h-4 w-4"/>Rapports</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="insights">Analyses</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="assistant"><Bot className="h-4 w-4"/>Assistant</TabsTrigger>
              <TabsTrigger className="gap-1.5" value="settings"><Settings2 className="h-4 w-4"/>Paramètres</TabsTrigger>
            </TabsList>
            <TabsContent value="planning"><WorkforcePlanning restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="employees"><WorkforceEmployees restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="clock"><WorkforceClockOverview restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="hours"><WorkforceTime restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="absences"><WorkforceAbsences restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="requests"><WorkforceRequests restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="exchanges"><WorkforceExchanges restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="reports"><WorkforceReports restaurantId={selectedId!} settings={settings.data!} restaurantName={restaurantName}/></TabsContent>
            <TabsContent value="insights"><WorkforceAnalytics restaurantId={selectedId!} settings={settings.data!}/></TabsContent>
            <TabsContent value="assistant"><WorkforceAssistant restaurantId={selectedId!}/></TabsContent>
            <TabsContent value="settings"><WorkforceSettingsPanel restaurantId={selectedId!} settings={settings.data!} canEdit/></TabsContent>
          </Tabs>}
      {enabled?<p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"><Badge variant="outline">RH · Suisse</Badge>Les alertes horaires sont indicatives. Le suivi légal et la paie restent sous la responsabilité de l'employeur.</p>:null}
    </div>
  </DashboardLayout>;
}
