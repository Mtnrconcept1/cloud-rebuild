import { useEffect, useState } from "react";
import { useMutation,useQuery,useQueryClient } from "@tanstack/react-query";
import { Clock3, ShieldCheck, Settings2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card,CardContent,CardHeader,CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { CH_CANTONS } from "@/lib/tokWorkforceCantons";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import RestaurantSearchSelect from "@/components/admin/RestaurantSearchSelect";
import { workforceDb,useWorkforceSettings } from "@/hooks/useTokWorkforce";

type WorkforceAudit={id:string;restaurant_id:string;previous_enabled:boolean|null;new_enabled:boolean;occurred_at:string;actor_id:string|null};

export default function AdminWorkforce() {
  const {user}=useAuth();
  const [restaurantId,setRestaurantId]=useState("");
  const {data:settings,isPending,isError}=useWorkforceSettings(restaurantId||null);
  const {toast}=useToast(),queryClient=useQueryClient();
  const [canton,setCanton]=useState("GE");
  const [weekly,setWeekly]=useState("50");
  const [vacation,setVacation]=useState("20");
  useEffect(()=>{
    if (!settings) return;
    setCanton(settings.canton);
    setWeekly(String(settings.max_weekly_hours));
    setVacation(String(settings.min_vacation_days));
  },[settings]);
  const {data:audit=[]}=useQuery({
    queryKey:["tok-workforce-audit",restaurantId],
    enabled:!!restaurantId,
    queryFn:async()=>{
      const {data,error}=await workforceDb().from("tok_workforce_access_audit")
        .select("id,restaurant_id,previous_enabled,new_enabled,occurred_at,actor_id")
        .eq("restaurant_id",restaurantId).order("occurred_at",{ascending:false}).limit(20);
      if(error)throw error;
      return (data||[]) as WorkforceAudit[];
    },
  });
  const save=useMutation({
    mutationFn:async(enabled:boolean)=>{
      if(!restaurantId||!user?.id)throw new Error("Sélectionnez un restaurant et reconnectez-vous si nécessaire.");
      const max=Number(weekly),min=Number(vacation);
      if(!Number.isFinite(max)||max<1||max>60||!Number.isInteger(min)||min<0||min>60)
        throw new Error("Paramètres horaires invalides.");
      if(!CH_CANTONS.includes(canton as typeof CH_CANTONS[number]))throw new Error("Canton invalide.");
      const {error}=await workforceDb().from("tok_workforce_settings").upsert({
        restaurant_id:restaurantId,enabled,canton,max_weekly_hours:max,min_vacation_days:min,updated_by:user.id,
      },{onConflict:"restaurant_id"});
      if(error)throw error;
    },
    onSuccess:()=>{queryClient.invalidateQueries({queryKey:["tok-workforce"]});queryClient.invalidateQueries({queryKey:["tok-workforce-audit",restaurantId]});toast({title:"Configuration enregistrée",description:"L'accès restaurateur se met à jour automatiquement."});},
    onError:(error:Error)=>toast({variant:"destructive",title:"Impossible de sauvegarder",description:error.message}),
  });
  const onSelect=(value:string)=>{
    setRestaurantId(value);
    // Settings shown below are loaded for this restaurant, not for the previous selection.
    setCanton("GE");setWeekly("50");setVacation("20");
  };
  return <div className="container mx-auto space-y-6 px-3 py-6 sm:px-6">
    <DashboardPageHero compact badge="Administration · Ressources humaines" title="TOK Équipe"
      description="Activer et paramétrer le suivi du personnel, les plannings et les heures de chaque restaurant, indépendamment de ses autres outils TOK."
      icon={Clock3} tone="orange"/>
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,22rem)]">
      <Card className="rounded-2xl border-primary/20"><CardHeader><CardTitle>Sélectionnez un restaurant</CardTitle></CardHeader>
        <CardContent className="space-y-5">
          <RestaurantSearchSelect value={restaurantId} onChange={onSelect}/>
          {!restaurantId?<p className="text-sm text-muted-foreground">Choisissez un restaurant pour consulter ou activer TOK Équipe.</p>:null}
          {restaurantId&&isPending?<p className="text-sm text-muted-foreground">Lecture des autorisations…</p>:null}
          {isError?<p role="alert" className="text-sm text-destructive">Impossible de lire la configuration. Aucune modification n'est autorisée.</p>:null}
          {restaurantId&&!isPending&&!isError?<div className="space-y-4">
            <div className="flex items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 p-4">
              <div><p className="font-semibold">Activer TOK Équipe</p><p className="text-sm text-muted-foreground">Ce restaurant accède au module uniquement après activation.</p></div>
              <Switch checked={!!settings?.enabled} disabled={save.isPending}
                aria-label="Activer le module de gestion du personnel" onCheckedChange={enabled=>save.mutate(enabled)}/>
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <div><Label htmlFor="wf-admin-canton">Canton</Label><select id="wf-admin-canton" value={canton} onChange={e=>setCanton(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm">
                {CH_CANTONS.map(code=><option key={code} value={code}>{code}</option>)}
              </select></div>
              <div><Label htmlFor="wf-admin-weekly">Seuil hebdomadaire (h)</Label><Input id="wf-admin-weekly" type="number" min={1} max={60} step="0.5" value={weekly} onChange={e=>setWeekly(e.target.value)}/></div>
              <div><Label htmlFor="wf-admin-vacation">Jours de vacances min.</Label><Input id="wf-admin-vacation" type="number" min={0} max={60} step={1} value={vacation} onChange={e=>setVacation(e.target.value)}/></div>
            </div>
            <Button disabled={save.isPending} onClick={()=>save.mutate(!!settings?.enabled)}><Settings2 className="mr-2 h-4 w-4"/>Enregistrer les paramètres</Button>
          </div>:null}
        </CardContent>
      </Card>
      <Card className="h-fit rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary"/>Sécurité et historique</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Badge variant={settings?.enabled?"default":"secondary"}>{settings?.enabled?"Actif":"Inactif par défaut"}</Badge>
          <p className="text-sm text-muted-foreground">Seul un administrateur TOK active le module. Chaque restaurant ne peut lire et modifier que les informations de son établissement.</p>
          {audit.map(entry=><div className="rounded-xl border border-border/60 p-2 text-sm" key={entry.id}>
            <p className="font-medium">{entry.new_enabled?"Activation":"Désactivation"}</p>
            <p className="text-xs text-muted-foreground">{new Date(entry.occurred_at).toLocaleString("fr-CH")}</p>
          </div>)}
          {restaurantId&&!audit.length?<p className="text-xs text-muted-foreground">Aucun changement d'activation enregistré.</p>:null}
        </CardContent></Card>
    </div>
  </div>;
}
