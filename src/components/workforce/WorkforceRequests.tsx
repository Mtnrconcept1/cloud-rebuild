import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ClipboardList, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { employeeName, type WorkforceRequest } from "@/lib/tokWorkforce";
import { useWorkforceEmployees, useWorkforceRequests, useWorkforceRefresh, workforceDb } from "@/hooks/useTokWorkforce";
import WorkforceRequestForm from "./WorkforceRequestForm";

const labels = { vacation: "Congé", correction: "Correction d’heures", schedule: "Planning", other: "Autre" };

export default function WorkforceRequests({ restaurantId }: { restaurantId: string }) {
  const employeeQuery = useWorkforceEmployees(restaurantId, true);
  const { data: employees = [] } = employeeQuery;
  const { data: requests = [], isPending, isError } = useWorkforceRequests(restaurantId, true);
  const refresh = useWorkforceRefresh(restaurantId), { toast } = useToast();
  const [status, setStatus] = useState("all");
  const [decision, setDecision] = useState<{ request: WorkforceRequest; approve: boolean } | null>(null);
  const [reviewNote, setReviewNote] = useState("");
  const review = useMutation({
    mutationFn: async () => {
      if (!decision || decision.request.restaurant_id !== restaurantId || decision.request.status !== "pending") throw new Error("Cette demande ne peut plus être traitée. Actualisez la liste.");
      if (reviewNote.length > 2000) throw new Error("Le commentaire est limité à 2 000 caractères.");
      const { error } = await workforceDb().rpc("tok_workforce_review_request", { p_request_id: decision.request.id, p_approve: decision.approve, p_review_note: reviewNote.trim() || null });
      if (error) throw error;
    },
    onSuccess: () => { setDecision(null); setReviewNote(""); void refresh(); toast({ title: "Demande traitée", description: "La décision est visible dans l’espace du collaborateur." }); },
  });
  const openDecision = (request: WorkforceRequest, approve: boolean) => { review.reset(); setReviewNote(""); setDecision({ request, approve }); };
  const visible = requests.filter(request => status === "all" || request.status === status);
  return <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(20rem,26rem)]">
    <Card className="rounded-2xl"><CardHeader><CardTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary" />Demandes ({requests.filter(request => request.status === "pending").length} en attente)</CardTitle></CardHeader><CardContent className="space-y-3">
      <div><Label htmlFor="wf-request-filter">État des demandes</Label><select id="wf-request-filter" className="flex h-10 w-full rounded-md border bg-background px-3 text-sm" value={status} onChange={e => setStatus(e.target.value)}><option value="all">Toutes</option><option value="pending">En attente</option><option value="approved">Approuvées</option><option value="rejected">Refusées</option></select></div>
      {isPending ? <p role="status" className="text-muted-foreground">Chargement…</p> : null}
      {isError ? <p role="alert" className="text-destructive">Impossible de charger les demandes. <button className="underline" onClick={() => void refresh()}>Réessayer</button></p> : null}
      {!isPending && !isError && !visible.length ? <p className="text-muted-foreground">Aucune demande pour ce filtre.</p> : null}
      {!isError ? visible.map(request => <section key={request.id} className="space-y-3 rounded-xl border border-border/60 p-3" aria-label={`Demande de ${employeeName(employees.find(employee => employee.id === request.employee_id))}`}>
        <div className="flex flex-wrap justify-between gap-2"><div className="min-w-0"><p className="font-semibold">{employeeName(employees.find(employee => employee.id === request.employee_id))}</p><p className="text-xs text-muted-foreground">{labels[request.request_type]}</p></div><Badge variant={request.status === "rejected" ? "destructive" : "secondary"}>{request.status === "pending" ? "En attente" : request.status === "approved" ? "Approuvée" : "Refusée"}</Badge></div>
        <p className="whitespace-pre-wrap break-words text-sm">{request.description}</p>
        {request.requested_start_date ? <p className="text-sm text-muted-foreground">Du {request.requested_start_date} au {request.requested_end_date} · {request.requested_days} jour(s)</p> : null}
        {request.requested_entry_id ? <p className="text-sm text-muted-foreground">Correction proposée : {request.requested_start_time?.slice(0, 5)}–{request.requested_end_time?.slice(0, 5)} · pause {request.requested_break_minutes} min</p> : null}
        {request.review_note ? <div className="rounded-lg bg-muted/50 p-3 text-sm"><p className="font-medium">Réponse du responsable</p><p className="whitespace-pre-wrap break-words">{request.review_note}</p></div> : null}
        {request.status === "pending" ? <div className="flex flex-wrap gap-2"><Button size="sm" disabled={review.isPending} onClick={() => openDecision(request, true)}><Check className="mr-1 h-4 w-4" />Accepter</Button><Button size="sm" variant="outline" disabled={review.isPending} onClick={() => openDecision(request, false)}><X className="mr-1 h-4 w-4" />Refuser</Button></div> : null}
      </section>) : null}
    </CardContent></Card>
    <Card className="h-fit rounded-2xl border-primary/25"><CardHeader><CardTitle>Nouvelle demande</CardTitle></CardHeader><CardContent>{employeeQuery.isError ? <p role="alert" className="text-destructive">Équipe indisponible.</p> : employeeQuery.isPending ? <p>Chargement de l’équipe…</p> : <WorkforceRequestForm restaurantId={restaurantId} employees={employees} />}</CardContent></Card>
    {decision ? <Dialog open onOpenChange={open => { if (!open && !review.isPending) setDecision(null); }}><DialogContent hideCloseButton={review.isPending}><DialogHeader><DialogTitle>{decision.approve ? "Accepter" : "Refuser"} la demande</DialogTitle><DialogDescription>{decision.approve && decision.request.request_type === "vacation" ? "Le congé sera enregistré dans les absences et les compteurs." : decision.approve && decision.request.request_type === "correction" ? "Les nouveaux horaires remplaceront ceux du relevé non signé après vérification." : "Le collaborateur pourra consulter la décision et votre commentaire."}</DialogDescription></DialogHeader>
      <p className="whitespace-pre-wrap break-words text-sm">{decision.request.description}</p>
      <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (!review.isPending) review.mutate(); }}><div><Label htmlFor="wf-review-note">Commentaire pour le collaborateur (facultatif)</Label><Textarea id="wf-review-note" maxLength={2000} disabled={review.isPending} value={reviewNote} onChange={e => setReviewNote(e.target.value)} /></div>{review.error ? <p role="alert" className="text-sm text-destructive">{review.error.message}</p> : null}<DialogFooter><Button type="button" variant="outline" disabled={review.isPending} onClick={() => setDecision(null)}>Annuler</Button><Button type="submit" disabled={review.isPending}>{review.isPending ? "Traitement…" : "Confirmer la décision"}</Button></DialogFooter></form>
    </DialogContent></Dialog> : null}
  </div>;
}
