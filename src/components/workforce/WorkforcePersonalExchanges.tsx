import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { workforceZurichClock, type WorkforceExchange } from "@/lib/tokWorkforce";
import { workforceDb, useWorkforceRefresh, useWorkforceRows, useWorkforceShifts } from "@/hooks/useTokWorkforce";

type Colleague = { employee_id: string; display_name: string };
type Exchange = WorkforceExchange & { requester_message?: string | null; manager_notes?: string | null; created_at?: string };
type Candidate = { shift_id: string; employee_id: string; display_name: string; shift_date: string; start_time: string; end_time: string; break_minutes: number; status: string; updated_at: string };
const shiftLabel = (shift: { shift_date: string; start_time: string; end_time: string }) => shift.shift_date + " · " + shift.start_time.slice(0, 5) + "–" + shift.end_time.slice(0, 5);

export default function WorkforcePersonalExchanges({ restaurantId, employeeId }: { restaurantId: string; employeeId: string }) {
  const { toast } = useToast(), { user } = useAuth();
  const refresh = useWorkforceRefresh(restaurantId);
  const [shiftId, setShiftId] = useState(""), [targetId, setTargetId] = useState(""), [message, setMessage] = useState("");
  const [mode, setMode] = useState("cover"), [targetShiftId, setTargetShiftId] = useState("");
  const today = workforceZurichClock().date;
  const endDay = new Date(today + "T12:00:00Z"); endDay.setUTCDate(endDay.getUTCDate() + 90);
  const until = endDay.toISOString().slice(0, 10);
  const directory = useQuery({
    queryKey: ["workforce-colleagues", restaurantId, employeeId, user?.id], enabled: !!restaurantId && !!employeeId && !!user,
    queryFn: async () => {
      const { data, error } = await workforceDb().rpc("tok_workforce_team_directory", { p_restaurant_id: restaurantId });
      if (error) throw error;
      return (data || []) as Colleague[];
    },
  });
  const shifts = useWorkforceShifts(restaurantId, true, today, until, employeeId);
  const outgoing = useWorkforceRows<Exchange>(restaurantId, "tok_workforce_exchanges", true, { employeeField: "requester_id", employeeId });
  const incoming = useWorkforceRows<Exchange>(restaurantId, "tok_workforce_exchanges", true, { employeeField: "target_employee_id", employeeId });
  const exchanges = [...new Map([...(outgoing.data || []), ...(incoming.data || [])].map(exchange => [exchange.id, exchange])).values()].sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
  const candidates = useQuery({
    queryKey: ["workforce-exchange-candidates", restaurantId, employeeId, user?.id, targetId, today, until],
    enabled: mode === "swap" && !!targetId && !!user,
    queryFn: async () => {
      const { data, error } = await workforceDb().rpc("tok_workforce_exchange_candidates", { p_restaurant_id: restaurantId, p_employee_id: targetId, p_start_date: today, p_end_date: until });
      if (error) throw error;
      return (data || []) as Candidate[];
    },
  });
  const pendingColleagues = [...new Set(exchanges.filter(exchange => exchange.status === "pending")
    .flatMap(exchange => [exchange.requester_id, exchange.target_employee_id]).filter(id => id !== employeeId))].sort();
  const exchangeDetails = useQuery({
    queryKey: ["workforce-exchange-details", restaurantId, employeeId, user?.id, today, until, pendingColleagues.join(",")],
    enabled: !!user && pendingColleagues.length > 0,
    queryFn: async () => {
      const details = await Promise.all(pendingColleagues.map(async colleagueId => {
        const { data, error } = await workforceDb().rpc("tok_workforce_exchange_candidates", { p_restaurant_id: restaurantId, p_employee_id: colleagueId, p_start_date: today, p_end_date: until });
        if (error) throw error;
        return (data || []) as Candidate[];
      }));
      return details.flat();
    },
  });
  const myShifts = (shifts.data || []).filter(shift => shift.employee_id === employeeId && ["planned", "confirmed"].includes(shift.status));
  const blocked = directory.isError || directory.isPending || shifts.isError || shifts.isPending;
  const propose = useMutation({
    mutationFn: async () => {
      if (blocked || !myShifts.some(shift => shift.id === shiftId)) throw new Error("Sélectionnez un de vos services à venir.");
      if (targetId === employeeId || !directory.data?.some(colleague => colleague.employee_id === targetId)) throw new Error("Sélectionnez un collègue de cet établissement.");
      if (mode === "swap" && (candidates.isPending || candidates.isError || !candidates.data?.some(shift => shift.shift_id === targetShiftId && shift.employee_id === targetId))) throw new Error("Sélectionnez le service du collègue à échanger.");
      const { data, error } = await workforceDb().from("tok_workforce_exchanges").insert({
        restaurant_id: restaurantId, requester_id: employeeId, requester_shift_id: shiftId, target_employee_id: targetId,
        target_shift_id: mode === "swap" ? targetShiftId : null, status: "pending", requester_message: message.trim().slice(0, 1000) || null,
      }).select("id").single();
      if (error) throw error;
      if (!data?.id) throw new Error("La proposition n’a pas pu être confirmée.");
    },
    onSuccess: () => { setMessage(""); setShiftId(""); setTargetShiftId(""); void refresh(); toast({ title: "Proposition transmise", description: "L’accord du collègue puis celui du responsable sont nécessaires." }); },
  });
  const respond = useMutation({
    mutationFn: async ({ id, accept }: { id: string; accept: boolean }) => {
      const { error } = await workforceDb().rpc("tok_workforce_respond_exchange", { p_exchange_id: id, p_accept: accept });
      if (error) throw error;
    },
    onSuccess: () => { void refresh(); toast({ title: "Réponse enregistrée" }); },
  });
  const cancel = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await workforceDb().rpc("tok_workforce_cancel_exchange", { p_exchange_id: id });
      if (error) throw error;
    },
    onSuccess: () => { void refresh(); toast({ title: "Proposition annulée" }); },
  });
  const name = (id: string) => id === employeeId ? "Vous" : directory.data?.find(person => person.employee_id === id)?.display_name || "Collaborateur";
  const findShift = (id: string) => shifts.data?.find(shift => shift.id === id)
    || candidates.data?.find(shift => shift.shift_id === id)
    || exchangeDetails.data?.find(shift => shift.shift_id === id);
  const findShiftLabel = (id: string) => {
    const shift = findShift(id);
    return shift ? shiftLabel(shift) : "Service indisponible ou hors des 90 prochains jours";
  };
  return <div className="grid gap-5 xl:grid-cols-2">
    <Card><CardHeader><CardTitle>Proposer une reprise ou un échange</CardTitle></CardHeader><CardContent>
      {blocked ? <p role={directory.isError || shifts.isError ? "alert" : "status"} className="mb-3 text-sm text-muted-foreground">{directory.isError || shifts.isError ? <>Services ou collègues indisponibles. <button className="underline" onClick={() => void refresh()}>Réessayer</button></> : "Chargement des services et collègues…"}</p> : null}
      <form aria-label="Proposer un échange de service" className="space-y-4" onSubmit={event => { event.preventDefault(); if (!propose.isPending) propose.mutate(); }}>
        <fieldset disabled={blocked || propose.isPending} className="space-y-4">
          <div><Label htmlFor="wf-personal-exchange-mode">Type de proposition</Label><select id="wf-personal-exchange-mode" className="mt-1 block w-full rounded-md border bg-background p-2" value={mode} onChange={e => { setMode(e.target.value); setTargetShiftId(""); }}><option value="cover">Faire reprendre mon service</option><option value="swap">Échanger deux services</option></select></div>
          <div><Label htmlFor="wf-personal-exchange-shift">Mon service</Label><select id="wf-personal-exchange-shift" required className="mt-1 block w-full rounded-md border bg-background p-2" value={shiftId} onChange={e => setShiftId(e.target.value)}><option value="">Choisir un service…</option>{myShifts.map(shift => <option key={shift.id} value={shift.id}>{shiftLabel(shift)}</option>)}</select></div>
          <div><Label htmlFor="wf-personal-exchange-colleague">Collègue sollicité</Label><select id="wf-personal-exchange-colleague" required className="mt-1 block w-full rounded-md border bg-background p-2" value={targetId} onChange={e => { setTargetId(e.target.value); setTargetShiftId(""); }}><option value="">Choisir un collègue…</option>{directory.data?.filter(person => person.employee_id !== employeeId).map(person => <option key={person.employee_id} value={person.employee_id}>{person.display_name}</option>)}</select></div>
          {mode === "swap" ? <div><Label htmlFor="wf-personal-exchange-return">Service du collègue en retour</Label><select id="wf-personal-exchange-return" required disabled={!targetId || candidates.isPending || candidates.isError} className="mt-1 block w-full rounded-md border bg-background p-2" value={targetShiftId} onChange={e => setTargetShiftId(e.target.value)}><option value="">Choisir le service à reprendre…</option>{candidates.data?.map(shift => <option key={shift.shift_id} value={shift.shift_id}>{shiftLabel(shift)} · pause {shift.break_minutes} min</option>)}</select>{targetId && candidates.isError ? <p role="alert" className="mt-2 text-sm text-destructive">Les services de ce collègue sont indisponibles.</p> : null}{targetId && !candidates.isPending && !candidates.isError && !candidates.data?.length ? <p className="mt-2 text-sm text-muted-foreground">Aucun service échangeable sur les 90 prochains jours.</p> : null}</div> : null}
          <div><Label htmlFor="wf-personal-exchange-message">Message au collègue (facultatif)</Label><Input id="wf-personal-exchange-message" maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} /></div>
        </fieldset>
        <p className="text-xs text-muted-foreground">Le collègue accepte la proposition, puis le responsable vérifie les disponibilités et valide le changement.</p>
        {propose.error ? <p role="alert" className="text-sm text-destructive">{propose.error.message}</p> : null}
        <Button disabled={propose.isPending || blocked || !shiftId || !targetId || (mode === "swap" && (!targetShiftId || candidates.isError || candidates.isPending))} type="submit">{propose.isPending ? "Envoi…" : "Envoyer la proposition"}</Button>
      </form>
    </CardContent></Card>
    <Card><CardHeader><CardTitle>Mes échanges et réponses</CardTitle></CardHeader><CardContent className="space-y-3">
      {outgoing.isError || incoming.isError ? <p role="alert" className="text-destructive">Échanges indisponibles. <button className="underline" onClick={() => void refresh()}>Réessayer</button></p> : outgoing.isPending || incoming.isPending ? <p role="status">Chargement…</p> : !exchanges.length ? <p className="text-muted-foreground">Aucune proposition.</p> : null}
      {pendingColleagues.length > 0 && exchangeDetails.isPending ? <p role="status" className="text-sm text-muted-foreground">Chargement des horaires proposés…</p> : null}
      {exchangeDetails.isError ? <p role="alert" className="text-sm text-destructive">Impossible de vérifier les horaires proposés. <button className="underline" onClick={() => void refresh()}>Réessayer</button></p> : null}
      {respond.error || cancel.error ? <p role="alert" className="text-sm text-destructive">{respond.error?.message || cancel.error?.message}</p> : null}
      {!outgoing.isError && !incoming.isError ? exchanges.map(exchange => <section key={exchange.id} className="space-y-2 rounded-xl border p-3 text-sm" aria-label={`Échange de ${name(exchange.requester_id)} à ${name(exchange.target_employee_id)}`}>
        <p className="font-semibold">{name(exchange.requester_id)} → {name(exchange.target_employee_id)}</p>
        <p>{exchange.target_shift_id ? "Échange réciproque" : "Reprise simple"} · {findShiftLabel(exchange.requester_shift_id)}</p>
        {exchange.target_shift_id ? <p>En retour : {findShiftLabel(exchange.target_shift_id)}</p> : null}
        <p className="text-muted-foreground">{exchange.status === "pending" ? exchange.target_accepted_at && exchange.target_accepted_by ? "Accepté par le collègue, validation du responsable en attente" : exchange.target_accepted_at ? "Accord historique : une nouvelle confirmation du collègue est nécessaire depuis son compte TOK." : "En attente de l’accord du collègue" : exchange.status === "approved" ? "Échange validé · planning mis à jour" : exchange.status === "cancelled" ? "Proposition annulée" : "Proposition refusée"}</p>
        {exchange.requester_message ? <p className="whitespace-pre-wrap break-words">{exchange.requester_message}</p> : null}
        {exchange.manager_notes ? <p className="rounded-lg bg-muted/40 p-2">Responsable : {exchange.manager_notes}</p> : null}
        {exchange.target_employee_id === employeeId && exchange.status === "pending" && (!exchange.target_accepted_at || !exchange.target_accepted_by) ? <div className="flex flex-wrap gap-2"><Button size="sm" disabled={respond.isPending || cancel.isPending || exchangeDetails.isError || !findShift(exchange.requester_shift_id) || (!!exchange.target_shift_id && !findShift(exchange.target_shift_id))} onClick={() => respond.mutate({ id: exchange.id, accept: true })}>Accepter</Button><Button size="sm" variant="outline" disabled={respond.isPending || cancel.isPending} onClick={() => respond.mutate({ id: exchange.id, accept: false })}>Refuser</Button></div> : null}
        {exchange.requester_id === employeeId && exchange.status === "pending" ? <Button size="sm" variant="outline" disabled={respond.isPending || cancel.isPending} onClick={() => { if (window.confirm("Annuler cette proposition d’échange ?")) cancel.mutate(exchange.id); }}>Annuler ma proposition</Button> : null}
      </section>) : null}
    </CardContent></Card>
  </div>;
}
