import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Bot, Send, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { dateIsValid, employeeName, weekRange } from "@/lib/tokWorkforce";
import { useWorkforceEmployees, workforceDb } from "@/hooks/useTokWorkforce";

type Message={role:"user"|"assistant";content:string};
type Advice={text:string;legend:{employeeId:string;label:string}[];period:{start:string;end:string};generatedAt:string};
const errors:Record<string,string>={
  ai_credits_exhausted:"Les crédits IA de cet établissement sont insuffisants. Le restaurateur peut consulter son solde TOK.",
  ai_rate_limited:"La limite de demandes a été atteinte. Réessayez plus tard.",
  workforce_access_denied:"Votre accès responsable n’est plus actif pour cet établissement.",
  unauthorized:"Votre session a expiré. Reconnectez-vous pour continuer.",
  workforce_period_too_large:"Cette période contient trop de services. Choisissez une période plus courte.",
  workforce_context_changed:"Le planning a changé pendant la lecture. Relancez votre question pour utiliser les données actuelles.",
  invalid_period:"Choisissez une période valide de 31 jours au maximum.",
};

export default function WorkforceAssistant({restaurantId}:{restaurantId:string}) {
  const initial=weekRange(new Date());
  const [start,setStart]=useState(initial.start),[end,setEnd]=useState(initial.end);
  const [question,setQuestion]=useState("");
  const [messages,setMessages]=useState<Message[]>([]);
  const [legend,setLegend]=useState<Advice["legend"]>([]);
  const employees=useWorkforceEmployees(restaurantId,true);
  const valid=dateIsValid(start)&&dateIsValid(end)&&start<=end&&(Date.parse(end)-Date.parse(start))/86_400_000<=30;
  const send=useMutation({
    mutationFn:async(content:string)=>{
      if(!valid||!content.trim()||content.length>2000)throw new Error("Indiquez votre question et une période valide de 31 jours au maximum.");
      const conversation=[...messages.slice(-10).map(message=>({...message,content:message.content.slice(0,2000)})),{role:"user" as const,content:content.trim()}];
      // Bound the full conversation as well as individual turns.
      while(conversation.reduce((sum,message)=>sum+message.content.length,0)>12000&&conversation.length>1)conversation.shift();
      const {data,error}=await workforceDb().functions.invoke("tok-workforce-assistant",{body:{restaurantId,start,end,messages:conversation}});
      if(error) {
        let code="";
        const context=(error as {context?:Response}).context;
        if(context&&typeof context.clone==="function") {
          try {code=String((await context.clone().json()).error||"");} catch { /* Only show a safe local message. */ }
        }
        throw new Error(errors[code]||"L’assistant est momentanément indisponible. Votre question est conservée ; vous pouvez réessayer.");
      }
      const advice=data as Advice|null;
      if(!advice||typeof advice.text!=="string"||!advice.text.trim()||advice.period?.start!==start||advice.period?.end!==end||!Array.isArray(advice.legend))throw new Error("La réponse n’a pas pu être vérifiée. Réessayez.");
      return {advice,content:content.trim()};
    },
    onSuccess:({advice,content})=>{setMessages(previous=>[...previous,{role:"user",content},{role:"assistant",content:advice.text}]);setLegend(advice.legend);setQuestion("");},
  });
  const reset=()=>{setMessages([]);setLegend([]);send.reset();};
  return <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><Bot className="h-5 w-5 text-primary"/>Assistant de planning</CardTitle><p className="text-sm text-muted-foreground">Analysez la couverture et la répartition des services à partir du planning, des heures et des indisponibilités de cet établissement. Chaque réponse utilise les crédits IA TOK du restaurant.</p></CardHeader><CardContent className="space-y-4">
    <div className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
      <div><Label htmlFor="workforce-assistant-start">Début de la période</Label><Input id="workforce-assistant-start" type="date" value={start} disabled={send.isPending} onChange={event=>{setStart(event.target.value);reset();}}/></div>
      <div><Label htmlFor="workforce-assistant-end">Fin de la période</Label><Input id="workforce-assistant-end" type="date" value={end} disabled={send.isPending} onChange={event=>{setEnd(event.target.value);reset();}}/></div>
      <Button variant="outline" disabled={send.isPending||!messages.length} onClick={reset}><RotateCcw className="mr-2 h-4 w-4"/>Nouvelle discussion</Button>
    </div>
    {!valid?<p role="alert" className="text-sm text-destructive">Sélectionnez une période de 31 jours au maximum, avec une fin après le début.</p>:null}
    {!messages.length?<div className="flex flex-wrap gap-2">{["Quels services nécessitent mon attention cette semaine ?","Comment mieux répartir les services et les repos ?","Quelles questions vérifier avant de confirmer ce planning ?"].map(suggestion=><Button key={suggestion} variant="outline" size="sm" className="h-auto whitespace-normal py-2 text-left" disabled={send.isPending} onClick={()=>setQuestion(suggestion)}>{suggestion}</Button>)}</div>:null}
    <div role="log" aria-label="Discussion avec l’assistant de planning" aria-live="polite" className="max-h-[32rem] space-y-3 overflow-y-auto">
      {messages.map((message,index)=><article key={index} className={"rounded-xl border p-4 "+(message.role==="user"?"bg-muted/40":"border-primary/20 bg-primary/5")}><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{message.role==="user"?"Votre question":"Assistant TOK"}</p><p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p></article>)}
      {send.isPending?<p role="status" className="rounded-xl bg-muted/40 p-4 text-sm">Lecture du planning et préparation des suggestions…</p>:null}
    </div>
    {legend.length?<details className="rounded-xl border p-3 text-sm"><summary className="cursor-pointer font-medium">Repères des collaborateurs</summary><ul className="mt-2 grid gap-1 sm:grid-cols-2">{legend.map(item=><li key={item.employeeId}>{item.label} : {employees.data?employeeName(employees.data.find(employee=>employee.id===item.employeeId)):"Chargement…"}</li>)}</ul></details>:null}
    <form className="space-y-3" onSubmit={event=>{event.preventDefault();if(!send.isPending)send.mutate(question);}}>
      <Label htmlFor="workforce-assistant-question">Votre question</Label><Textarea id="workforce-assistant-question" value={question} maxLength={2000} rows={3} disabled={send.isPending} onChange={event=>setQuestion(event.target.value)} placeholder="Précisez vos besoins de couverture et les contraintes du service…" aria-describedby="workforce-assistant-help"/>
      <p id="workforce-assistant-help" className="text-xs text-muted-foreground">Les collaborateurs sont désignés par des repères. Les noms, salaires et motifs d’absence ne sont pas transmis automatiquement à l’IA. Évitez d’ajouter des informations personnelles dans votre question. Les propositions restent à vérifier et à appliquer dans le planning.</p>
      {send.isError?<p role="alert" className="text-sm text-destructive">{send.error.message}</p>:null}
      <Button type="submit" disabled={!valid||!question.trim()||send.isPending}><Send className="mr-2 h-4 w-4"/>{send.isPending?"Analyse en cours…":"Demander une analyse"}</Button>
    </form>
  </CardContent></Card>;
}
