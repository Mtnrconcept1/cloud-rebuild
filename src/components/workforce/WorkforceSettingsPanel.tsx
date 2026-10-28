import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { CalendarDays, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { dateIsValid, workforceZurichClock, type WorkforceSettings } from "@/lib/tokWorkforce";
import { useWorkforceHolidays, useWorkforceRefresh, workforceDb } from "@/hooks/useTokWorkforce";

export default function WorkforceSettingsPanel({restaurantId,settings,canEdit=false}:{restaurantId:string;settings:WorkforceSettings;canEdit?:boolean}) {
  const { user }=useAuth();
  const { toast }=useToast();
  const refresh=useWorkforceRefresh(restaurantId);
  const holidays=useWorkforceHolidays(restaurantId,true);
  const [year,setYear]=useState(workforceZurichClock().date.slice(0,4));
  const [date,setDate]=useState("");
  const [name,setName]=useState("");
  const [national,setNational]=useState(false);
  const reportError=(error:Error)=>toast({title:"Calendrier non modifié",description:error.message,variant:"destructive"});
  const add=useMutation({
    mutationFn:async()=>{
      if(!canEdit||!user?.id)throw new Error("Seul le restaurateur peut modifier ce calendrier.");
      if(!dateIsValid(date)||!name.trim()||name.trim().length>120)throw new Error("Indiquez une date et un nom de 1 à 120 caractères.");
      const {error}=await workforceDb().from("tok_workforce_holidays").insert({restaurant_id:restaurantId,holiday_date:date,name:name.trim(),is_national:national,created_by:user.id});
      if(error)throw error.code==="23505"?new Error("Cette date figure déjà dans le calendrier de l’établissement."):error;
      return date;
    },
    onSuccess:async(savedDate)=>{setYear(savedDate.slice(0,4));setDate("");setName("");setNational(false);await refresh();toast({title:"Jour férié ajouté"});},onError:reportError,
  });
  const remove=useMutation({
    mutationFn:async(id:string)=>{
      if(!canEdit||!holidays.data?.some(item=>item.id===id&&item.restaurant_id===restaurantId))throw new Error("Jour férié indisponible.");
      const {data,error}=await workforceDb().from("tok_workforce_holidays").delete().eq("restaurant_id",restaurantId).eq("id",id).select("id");
      if(error)throw error;
      if(!data?.length)throw new Error("Le jour férié n’a pas été supprimé. Actualisez vos droits.");
    },onSuccess:async()=>{await refresh();toast({title:"Jour férié supprimé"});},onError:reportError,
  });
  const rows=(holidays.data||[]).filter(item=>item.holiday_date.startsWith(year+"-"));
  const validYear=/^\d{4}$/.test(year)&&Number(year)>=2000&&Number(year)<=2100;
  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Règles de l’établissement</CardTitle></CardHeader><CardContent className="space-y-3">
      <dl className="grid gap-4 sm:grid-cols-3">
        <div><dt className="text-sm text-muted-foreground">Canton</dt><dd className="text-xl font-semibold">{settings.canton}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Seuil d’alerte hebdomadaire</dt><dd className="text-xl font-semibold">{settings.max_weekly_hours} h</dd></div>
        <div><dt className="text-sm text-muted-foreground">Vacances minimales configurées</dt><dd className="text-xl font-semibold">{settings.min_vacation_days} jours</dd></div>
      </dl>
      <p className="text-sm text-muted-foreground">Ces paramètres sont gérés par l’administration TOK. Chaque fiche collaborateur possède son propre contrat horaire et son quota de vacances.</p>
    </CardContent></Card>
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5"/>Calendrier des jours fériés</CardTitle></CardHeader><CardContent className="space-y-4">
      <p className="text-sm text-muted-foreground">Définissez les dates applicables à votre établissement dans le canton {settings.canton}. Elles sont utilisées par les rapports et les compteurs. Vérifiez le calendrier cantonal et communal avant de l’enregistrer.</p>
      <div className="max-w-40"><Label htmlFor="workforce-holiday-year">Année du calendrier</Label><Input id="workforce-holiday-year" type="number" min="2000" max="2100" value={year} onChange={event=>setYear(event.target.value)}/></div>
      {!validYear?<p role="alert" className="text-sm text-destructive">Indiquez une année entre 2000 et 2100.</p>:holidays.isPending?<p role="status">Chargement du calendrier…</p>:holidays.isError?<div role="alert" className="space-y-2 text-destructive"><p>Le calendrier n’a pas pu être chargé.</p><Button variant="outline" onClick={()=>void holidays.refetch()}>Réessayer</Button></div>:rows.length?<ul className="divide-y rounded-xl border px-4">{rows.map(item=><li key={item.id} className="flex items-center justify-between gap-3 py-3"><div><p className="font-medium">{item.name}</p><p className="text-sm text-muted-foreground">{item.holiday_date}{item.is_national?" · National":" · Établissement"}</p></div>{canEdit?<Button variant="ghost" size="icon" disabled={remove.isPending||add.isPending} aria-label={"Supprimer "+item.name+" du "+item.holiday_date} onClick={()=>{if(window.confirm("Supprimer « "+item.name+" » du calendrier ? Les compteurs seront recalculés."))remove.mutate(item.id);}}><Trash2 className="h-4 w-4"/></Button>:null}</li>)}</ul>:<p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">Aucun jour férié configuré pour {year}. Les rapports ne déduiront aucun férié non renseigné.</p>}
      {canEdit?<form onSubmit={event=>{event.preventDefault();if(!add.isPending&&!remove.isPending)add.mutate();}}><fieldset disabled={add.isPending||remove.isPending||holidays.isPending||holidays.isError} className="grid gap-3 rounded-xl bg-muted/30 p-4 sm:grid-cols-2">
        <div><Label htmlFor="workforce-holiday-date">Date</Label><Input id="workforce-holiday-date" type="date" required value={date} onChange={event=>setDate(event.target.value)}/></div>
        <div><Label htmlFor="workforce-holiday-name">Nom</Label><Input id="workforce-holiday-name" maxLength={120} required placeholder="Nom du jour férié" value={name} onChange={event=>setName(event.target.value)}/></div>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={national} onChange={event=>setNational(event.target.checked)}/>Férié national</label>
        <Button type="submit" disabled={add.isPending||remove.isPending||holidays.isError} className="sm:justify-self-end"><Plus className="mr-2 h-4 w-4"/>{add.isPending?"Enregistrement…":"Ajouter le jour férié"}</Button>
      </fieldset></form>:null}
    </CardContent></Card>
  </div>;
}
