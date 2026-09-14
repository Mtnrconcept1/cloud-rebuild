import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  ExternalLink,
  FileCheck2,
  Link2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  XCircle,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  approveMarketingOutreachDraft,
  loadMarketingOutreach,
  recordMarketingOutreachResult,
  upsertMarketingBacklink,
  upsertMarketingOutreachDraft,
  upsertMarketingOutreachOpportunity,
  upsertMarketingOutreachTarget,
} from "@/marketing/marketingClient";
import type {
  MarketingBacklinkInput,
  MarketingBacklinkRel,
  MarketingBacklinkStatus,
  MarketingOutreachDraftInput,
  MarketingOutreachKind,
  MarketingOutreachOpportunity,
  MarketingOutreachOpportunityDraft,
  MarketingOutreachSnapshot,
  MarketingOutreachTargetDraft,
  MarketingOutreachTargetStatus,
} from "@/marketing/types";

const EMPTY_SNAPSHOT: MarketingOutreachSnapshot = {
  targets: [],
  opportunities: [],
  drafts: [],
  backlinks: [],
  metrics: {
    targetsCount: 0,
    allowlistedTargets: 0,
    pendingOpportunities: 0,
    approvedOpportunities: 0,
    publishedOpportunities: 0,
    verifiedBacklinks: 0,
  },
  nextCursor: null,
};

const KIND_LABELS: Record<MarketingOutreachKind, string> = {
  forum: "Forum",
  directory: "Annuaire",
  partner: "Partenaire",
  press: "Presse",
  community: "Communauté",
};

const TARGET_STATUS_LABELS: Record<MarketingOutreachTargetStatus, string> = {
  candidate: "À vérifier",
  allowlisted: "Autorisé",
  paused: "En pause",
  blocked: "Bloqué",
};

const BACKLINK_STATUS_LABELS: Record<MarketingBacklinkStatus, string> = {
  prospect: "Prospect",
  requested: "Demandé",
  verified: "Vérifié",
  lost: "Perdu",
  rejected: "Refusé",
};

const DEFAULT_TARGET: MarketingOutreachTargetDraft = {
  kind: "community",
  name: "",
  domain: "",
  url: "",
  status: "candidate",
  relevanceScore: 0.5,
  notes: "",
};

const DEFAULT_OPPORTUNITY: MarketingOutreachOpportunityDraft = {
  targetId: "",
  sourceUrl: "",
  title: "",
  context: "",
  suggestedAngle: "",
  suggestedLink: "/restaurants",
  status: "discovered",
  relevanceScore: 0.5,
  riskFlags: [],
};

const DEFAULT_DRAFT: MarketingOutreachDraftInput = {
  opportunityId: "",
  subject: "",
  body: "",
  status: "pending_review",
  aiAssisted: false,
};

const DEFAULT_BACKLINK: MarketingBacklinkInput = {
  sourceUrl: "",
  targetUrl: "https://www.thetok.ch/",
  rel: "nofollow",
  status: "prospect",
  verificationNote: "",
};

function safeError(error: unknown) {
  return (error instanceof Error ? error.message : "Action refusée par le backend")
    .replace(/[\r\n]+/g, " ")
    .slice(0, 220);
}

function evidenceDate(date: string) {
  if (!date) return null;
  const parsed = new Date(date + "T12:00:00+02:00");
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function dateInput(value: string | null | undefined) {
  if (!value) return "";
  return value.slice(0, 10);
}

function stateBadge(status: string) {
  const positive = ["allowlisted", "approved", "published", "won", "verified", "sent"].includes(status);
  const negative = ["blocked", "rejected", "lost"].includes(status);
  return (
    <Badge variant={positive ? "default" : negative ? "destructive" : "outline"}>
      {TARGET_STATUS_LABELS[status as MarketingOutreachTargetStatus]
        || BACKLINK_STATUS_LABELS[status as MarketingBacklinkStatus]
        || status.replace("_", " ")}
    </Badge>
  );
}

export default function MarketingOutreachView({
  canMutateBackend,
}: {
  canMutateBackend: boolean;
}) {
  const outreachQuery = useQuery({
    queryKey: ["admin-marketing-outreach"],
    queryFn: () => loadMarketingOutreach({ limit: 100 }),
    staleTime: 30_000,
    retry: false,
  });
  const data = outreachQuery.data || EMPTY_SNAPSHOT;
  const [pending, setPending] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "error"; message: string } | null>(null);
  const [targetForm, setTargetForm] = useState<MarketingOutreachTargetDraft>(DEFAULT_TARGET);
  const [opportunityForm, setOpportunityForm] = useState<MarketingOutreachOpportunityDraft>(DEFAULT_OPPORTUNITY);
  const [draftForm, setDraftForm] = useState<MarketingOutreachDraftInput>(DEFAULT_DRAFT);
  const [backlinkForm, setBacklinkForm] = useState<MarketingBacklinkInput>(DEFAULT_BACKLINK);
  const [targetFormOpen, setTargetFormOpen] = useState(false);
  const [opportunityFormOpen, setOpportunityFormOpen] = useState(false);
  const [draftFormOpen, setDraftFormOpen] = useState(false);
  const [backlinkFormOpen, setBacklinkFormOpen] = useState(false);
  const [approvalReason, setApprovalReason] = useState("Validation humaine et vérification de la pertinence.");
  const [resultNotes, setResultNotes] = useState<Record<string, string>>({});
  const [publishedUrls, setPublishedUrls] = useState<Record<string, string>>({});

  const allowlistedTargets = useMemo(
    () => data.targets.filter((target) => target.status === "allowlisted"),
    [data.targets],
  );
  const draftsByOpportunity = useMemo(() => new Map(
    data.drafts.map((draft) => [draft.opportunityId, draft]),
  ), [data.drafts]);

  const run = async (
    key: string,
    action: () => Promise<unknown>,
    success: string,
  ): Promise<boolean> => {
    if (!canMutateBackend || pending) return false;
    setPending(key);
    setNotice(null);
    try {
      await action();
      await outreachQuery.refetch();
      setNotice({ tone: "success", message: success });
      return true;
    } catch (error) {
      setNotice({ tone: "error", message: safeError(error) });
      return false;
    } finally {
      setPending(null);
    }
  };

  const saveTarget = () => {
    const valid = targetForm.name.trim().length >= 2
      && targetForm.domain.trim().length >= 3
      && targetForm.url.trim().startsWith("https://")
      && (targetForm.status !== "allowlisted" || Boolean(targetForm.robotsCheckedAt && targetForm.termsCheckedAt));
    if (!valid) return;
    void run(
      "save-target",
      () => upsertMarketingOutreachTarget({
        ...targetForm,
        name: targetForm.name.trim(),
        domain: targetForm.domain.trim().toLowerCase(),
        url: targetForm.url.trim(),
        notes: targetForm.notes.trim(),
        robotsCheckedAt: evidenceDate(targetForm.robotsCheckedAt || ""),
        termsCheckedAt: evidenceDate(targetForm.termsCheckedAt || ""),
      }),
      "Cible enregistrée. L’autorisation reste distincte de la publication.",
    ).then((ok) => {
      if (ok) {
        setTargetForm(DEFAULT_TARGET);
        setTargetFormOpen(false);
      }
    });
  };

  const saveOpportunity = () => {
    if (!opportunityForm.targetId || opportunityForm.title.trim().length < 3 || !opportunityForm.sourceUrl.trim().startsWith("https://")) return;
    void run(
      "save-opportunity",
      () => upsertMarketingOutreachOpportunity({
        ...opportunityForm,
        title: opportunityForm.title.trim(),
        sourceUrl: opportunityForm.sourceUrl.trim(),
        context: opportunityForm.context.trim(),
        suggestedAngle: opportunityForm.suggestedAngle.trim(),
        suggestedLink: opportunityForm.suggestedLink.trim() || "/restaurants",
      }),
      "Opportunité enregistrée en brouillon. Préparez un message et soumettez-le à validation.",
    ).then((ok) => {
      if (ok) {
        setOpportunityForm(DEFAULT_OPPORTUNITY);
        setOpportunityFormOpen(false);
      }
    });
  };

  const saveDraft = () => {
    if (!draftForm.opportunityId || draftForm.body.trim().length < 20) return;
    void run(
      "save-draft",
      () => upsertMarketingOutreachDraft({
        ...draftForm,
        subject: draftForm.subject.trim(),
        body: draftForm.body.trim(),
      }),
      "Brouillon soumis à la revue humaine. Aucun message n’a été envoyé.",
    ).then((ok) => {
      if (ok) {
        setDraftForm(DEFAULT_DRAFT);
        setDraftFormOpen(false);
      }
    });
  };

  const approveDraft = (draftId: string) => {
    if (approvalReason.trim().length < 8) return;
    void run(
      "approve-" + draftId,
      () => approveMarketingOutreachDraft(draftId, approvalReason),
      "Brouillon approuvé. La publication reste une action manuelle tracée.",
    );
  };

  const recordResult = (
    opportunity: MarketingOutreachOpportunity,
    status: "published" | "won" | "lost" | "rejected",
  ) => {
    const note = resultNotes[opportunity.id]?.trim() || "";
    const publishedUrl = publishedUrls[opportunity.id]?.trim() || "";
    if (note.length < 8 || (status === "published" && !publishedUrl.startsWith("https://"))) return;
    void run(
      "result-" + opportunity.id,
      () => recordMarketingOutreachResult(opportunity.id, status, note, publishedUrl || null),
      status === "published"
        ? "Publication enregistrée. Ajoutez ensuite la preuve du backlink si elle existe."
        : "Résultat enregistré dans le journal d’audit.",
    );
  };

  const saveBacklink = () => {
    const valid = backlinkForm.sourceUrl.trim().startsWith("https://")
      && backlinkForm.targetUrl.trim().startsWith("https://")
      && (backlinkForm.status !== "verified" || backlinkForm.verificationNote.trim().length >= 8);
    if (!valid) return;
    void run(
      "save-backlink",
      () => upsertMarketingBacklink({
        ...backlinkForm,
        sourceUrl: backlinkForm.sourceUrl.trim(),
        targetUrl: backlinkForm.targetUrl.trim(),
        verificationNote: backlinkForm.verificationNote.trim(),
        observedAt: backlinkForm.status === "verified" ? new Date().toISOString() : null,
      }),
      "Backlink enregistré. La vérification repose sur une preuve humaine.",
    ).then((ok) => {
      if (ok) {
        setBacklinkForm(DEFAULT_BACKLINK);
        setBacklinkFormOpen(false);
      }
    });
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Acquisition responsable</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Prospection & backlinks</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Centralisez les forums, annuaires, partenaires et preuves de liens sans automatiser le spam.
          </p>
        </div>
        <Button type="button" variant="outline" onClick={() => { void outreachQuery.refetch(); }} disabled={outreachQuery.isFetching}>
          <RefreshCw className={`mr-2 h-4 w-4 ${outreachQuery.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      <Alert className="border-amber-500/30 bg-amber-500/5">
        <ShieldCheck className="h-4 w-4 text-amber-600" />
        <AlertTitle>Mode assisté — validation humaine obligatoire</AlertTitle>
        <AlertDescription>
          Aucune publication automatique : les cibles sont allowlistées, les brouillons sont relus et chaque résultat est journalisé.
          Les forums et annuaires doivent autoriser la contribution ; les liens sponsorisés utilisent rel="sponsored" ou nofollow.
        </AlertDescription>
      </Alert>

      {notice ? (
        <Alert variant={notice.tone === "error" ? "destructive" : "default"}>
          {notice.tone === "success" ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
          <AlertTitle>{notice.tone === "success" ? "Action confirmée" : "Action impossible"}</AlertTitle>
          <AlertDescription>{notice.message}</AlertDescription>
        </Alert>
      ) : null}

      {outreachQuery.error ? (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Données indisponibles</AlertTitle>
          <AlertDescription>Le backend n’a pas confirmé la file outreach : {safeError(outreachQuery.error)}</AlertDescription>
        </Alert>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6" aria-label="Indicateurs outreach">
        {[
          ["Cibles", data.metrics.targetsCount],
          ["Allowlistées", data.metrics.allowlistedTargets],
          ["À valider", data.metrics.pendingOpportunities],
          ["Approuvées", data.metrics.approvedOpportunities],
          ["Résultats", data.metrics.publishedOpportunities],
          ["Backlinks vérifiés", data.metrics.verifiedBacklinks],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold">{Number(value).toLocaleString("fr-CH")}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2"><Target className="h-5 w-5 text-orange-600" />Cibles vérifiées</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Un domaine n’est utilisable qu’après contrôle des règles, de la pertinence et de robots.txt.</p>
          </div>
          <Button type="button" size="sm" onClick={() => setTargetFormOpen((open) => !open)}><Plus className="mr-2 h-4 w-4" />Ajouter</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {targetFormOpen ? (
            <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2">
              <div><Label htmlFor="outreach-target-name">Nom</Label><Input id="outreach-target-name" className="mt-2" value={targetForm.name} onChange={(event) => setTargetForm((current) => ({ ...current, name: event.target.value }))} placeholder="Communauté food Genève" maxLength={160} /></div>
              <div><Label htmlFor="outreach-target-kind">Type</Label><Select value={targetForm.kind} onValueChange={(kind) => setTargetForm((current) => ({ ...current, kind: kind as MarketingOutreachKind }))}><SelectTrigger id="outreach-target-kind" className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(KIND_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="outreach-target-domain">Domaine</Label><Input id="outreach-target-domain" className="mt-2" value={targetForm.domain} onChange={(event) => setTargetForm((current) => ({ ...current, domain: event.target.value }))} placeholder="example.org" maxLength={252} /></div>
              <div><Label htmlFor="outreach-target-url">URL d’accueil</Label><Input id="outreach-target-url" className="mt-2" value={targetForm.url} onChange={(event) => setTargetForm((current) => ({ ...current, url: event.target.value }))} placeholder="https://example.org/community" maxLength={2048} /></div>
              <div><Label htmlFor="outreach-target-status">État</Label><Select value={targetForm.status} onValueChange={(status) => setTargetForm((current) => ({ ...current, status: status as MarketingOutreachTargetStatus }))}><SelectTrigger id="outreach-target-status" className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(TARGET_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="outreach-target-relevance">Pertinence (0–1)</Label><Input id="outreach-target-relevance" className="mt-2" type="number" min="0" max="1" step="0.05" value={targetForm.relevanceScore} onChange={(event) => setTargetForm((current) => ({ ...current, relevanceScore: Number(event.target.value) }))} /></div>
              {targetForm.status === "allowlisted" ? (
                <>
                  <div><Label htmlFor="outreach-target-robots">Contrôle robots.txt</Label><Input id="outreach-target-robots" className="mt-2" type="date" value={dateInput(targetForm.robotsCheckedAt)} onChange={(event) => setTargetForm((current) => ({ ...current, robotsCheckedAt: event.target.value }))} /></div>
                  <div><Label htmlFor="outreach-target-terms">Contrôle des conditions</Label><Input id="outreach-target-terms" className="mt-2" type="date" value={dateInput(targetForm.termsCheckedAt)} onChange={(event) => setTargetForm((current) => ({ ...current, termsCheckedAt: event.target.value }))} /></div>
                </>
              ) : null}
              <div className="md:col-span-2"><Label htmlFor="outreach-target-notes">Notes de conformité</Label><Textarea id="outreach-target-notes" className="mt-2" value={targetForm.notes} onChange={(event) => setTargetForm((current) => ({ ...current, notes: event.target.value }))} placeholder="Pertinence, quota, règle de contribution, date du contrôle…" maxLength={2000} /></div>
              <div className="flex gap-2 md:col-span-2"><Button type="button" disabled={!canMutateBackend || pending === "save-target"} onClick={saveTarget}>Enregistrer la cible</Button><Button type="button" variant="ghost" onClick={() => setTargetFormOpen(false)}>Annuler</Button></div>
            </div>
          ) : null}
          {data.targets.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.targets.map((target) => (
                <div key={target.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-semibold">{target.name}</p><p className="mt-1 truncate text-xs text-muted-foreground">{target.domain} · {KIND_LABELS[target.kind]}</p></div>{stateBadge(target.status)}</div>
                  <a className="mt-3 block truncate text-xs text-orange-700 hover:underline" href={target.url} target="_blank" rel="noreferrer">{target.url}<ExternalLink className="ml-1 inline h-3 w-3" /></a>
                  <p className="mt-2 text-xs text-muted-foreground">Pertinence {(target.relevanceScore * 100).toFixed(0)} % · Mode {target.publicationMode === "manual" ? "manuel" : "API réservé"}</p>
                  {target.status === "allowlisted" ? <p className="mt-2 text-xs text-emerald-700 dark:text-emerald-300">Robots et conditions contrôlés.</p> : null}
                </div>
              ))}
            </div>
          ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucune cible enregistrée. Commencez par un domaine réellement pertinent et autorisé.</p>}
        </CardContent>
      </Card>

      <div className="grid gap-5 xl:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-sky-600" />Opportunités</CardTitle><p className="mt-1 text-sm text-muted-foreground">Threads et pages à traiter, sans scraping ni envoi automatique.</p></div>
            <Button type="button" size="sm" variant="outline" disabled={!allowlistedTargets.length} onClick={() => setOpportunityFormOpen((open) => !open)}><Plus className="mr-2 h-4 w-4" />Ajouter</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {!allowlistedTargets.length ? <p className="rounded-xl bg-amber-500/10 p-3 text-xs text-amber-800 dark:text-amber-200">Allowlistez d’abord une cible après contrôle des règles et de la pertinence.</p> : null}
            {opportunityFormOpen ? (
              <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                <div><Label htmlFor="outreach-opportunity-target">Cible</Label><Select value={opportunityForm.targetId} onValueChange={(targetId) => setOpportunityForm((current) => ({ ...current, targetId }))}><SelectTrigger id="outreach-opportunity-target" className="mt-2"><SelectValue placeholder="Choisir une cible" /></SelectTrigger><SelectContent>{allowlistedTargets.map((target) => <SelectItem key={target.id} value={target.id}>{target.name} · {target.domain}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="outreach-opportunity-title">Titre ou question</Label><Input id="outreach-opportunity-title" className="mt-2" value={opportunityForm.title} onChange={(event) => setOpportunityForm((current) => ({ ...current, title: event.target.value }))} maxLength={200} /></div>
                <div><Label htmlFor="outreach-opportunity-source">URL du thread ou de la page</Label><Input id="outreach-opportunity-source" className="mt-2" value={opportunityForm.sourceUrl} onChange={(event) => setOpportunityForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="https://example.org/topic" maxLength={2048} /></div>
                <div><Label htmlFor="outreach-opportunity-context">Contexte public</Label><Textarea id="outreach-opportunity-context" className="mt-2" value={opportunityForm.context} onChange={(event) => setOpportunityForm((current) => ({ ...current, context: event.target.value }))} maxLength={3000} /></div>
                <div><Label htmlFor="outreach-opportunity-angle">Angle utile, non promotionnel</Label><Textarea id="outreach-opportunity-angle" className="mt-2" value={opportunityForm.suggestedAngle} onChange={(event) => setOpportunityForm((current) => ({ ...current, suggestedAngle: event.target.value }))} maxLength={1200} /></div>
                <div><Label htmlFor="outreach-opportunity-link">Page TheTOK à proposer</Label><Input id="outreach-opportunity-link" className="mt-2" value={opportunityForm.suggestedLink} onChange={(event) => setOpportunityForm((current) => ({ ...current, suggestedLink: event.target.value }))} placeholder="/restaurants" maxLength={500} /></div>
                <div className="flex gap-2"><Button type="button" disabled={!canMutateBackend || pending === "save-opportunity"} onClick={saveOpportunity}>Enregistrer</Button><Button type="button" variant="ghost" onClick={() => setOpportunityFormOpen(false)}>Annuler</Button></div>
              </div>
            ) : null}
            {data.opportunities.length ? data.opportunities.map((opportunity) => {
              const draft = draftsByOpportunity.get(opportunity.id);
              const note = resultNotes[opportunity.id] || "";
              const publishedUrl = publishedUrls[opportunity.id] || "";
              return (
                <div key={opportunity.id} className="rounded-2xl border p-4">
                  <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-semibold">{opportunity.title}</p><p className="mt-1 truncate text-xs text-muted-foreground">{opportunity.targetDomain} · {opportunity.sourceUrl}</p></div>{stateBadge(opportunity.status)}</div>
                  {opportunity.suggestedAngle ? <p className="mt-3 text-sm text-muted-foreground">{opportunity.suggestedAngle}</p> : null}
                  {opportunity.riskFlags.length ? <p className="mt-2 rounded-lg bg-rose-500/10 p-2 text-xs text-rose-700 dark:text-rose-300">Risque à traiter avant approbation : {opportunity.riskFlags.join(", ")}</p> : null}
                  {draft ? <p className="mt-2 text-xs text-muted-foreground">Brouillon : {draft.status}{draft.aiAssisted ? " · assisté" : ""}</p> : null}
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {draft && ["draft", "pending_review"].includes(draft.status) ? <Button type="button" size="sm" disabled={!canMutateBackend || pending === "approve-" + draft.id || opportunity.status !== "pending_review"} onClick={() => approveDraft(draft.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Approuver le brouillon</Button> : null}
                    {["approved", "published"].includes(opportunity.status) ? <Button type="button" size="sm" variant="outline" onClick={() => recordResult(opportunity, "won")} disabled={!canMutateBackend || pending === "result-" + opportunity.id || note.length < 8}><CheckCircle2 className="mr-2 h-4 w-4" />Marquer gagné</Button> : null}
                    {opportunity.status === "approved" ? <Button type="button" size="sm" variant="outline" onClick={() => recordResult(opportunity, "published")} disabled={!canMutateBackend || pending === "result-" + opportunity.id || note.length < 8 || !publishedUrl.startsWith("https://")}><ExternalLink className="mr-2 h-4 w-4" />Marquer publié</Button> : null}
                  </div>
                  {["approved", "published"].includes(opportunity.status) ? <div className="mt-3 space-y-2"><Input value={publishedUrl} onChange={(event) => setPublishedUrls((current) => ({ ...current, [opportunity.id]: event.target.value }))} placeholder="URL publique de la réponse publiée" aria-label={`URL publiée pour ${opportunity.title}`} /><Textarea value={note} onChange={(event) => setResultNotes((current) => ({ ...current, [opportunity.id]: event.target.value }))} placeholder="Note de résultat (minimum 8 caractères)" maxLength={2000} aria-label={`Note pour ${opportunity.title}`} /></div> : null}
                </div>
              );
            }) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucune opportunité. Ajoutez uniquement des conversations où une réponse utile est attendue.</p>}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3">
            <div><CardTitle className="flex items-center gap-2"><FileCheck2 className="h-5 w-5 text-violet-600" />Brouillons à relire</CardTitle><p className="mt-1 text-sm text-muted-foreground">La validation journalise le motif ; elle n’envoie rien.</p></div>
            <Button type="button" size="sm" variant="outline" disabled={!data.opportunities.length} onClick={() => setDraftFormOpen((open) => !open)}><Plus className="mr-2 h-4 w-4" />Préparer</Button>
          </CardHeader>
          <CardContent className="space-y-4">
            {draftFormOpen ? (
              <div className="space-y-3 rounded-2xl border bg-muted/20 p-4">
                <div><Label htmlFor="outreach-draft-opportunity">Opportunité</Label><Select value={draftForm.opportunityId} onValueChange={(opportunityId) => setDraftForm((current) => ({ ...current, opportunityId }))}><SelectTrigger id="outreach-draft-opportunity" className="mt-2"><SelectValue placeholder="Choisir une opportunité" /></SelectTrigger><SelectContent>{data.opportunities.filter((opportunity) => !["published", "won", "lost", "rejected"].includes(opportunity.status)).map((opportunity) => <SelectItem key={opportunity.id} value={opportunity.id}>{opportunity.title}</SelectItem>)}</SelectContent></Select></div>
                <div><Label htmlFor="outreach-draft-subject">Objet (optionnel)</Label><Input id="outreach-draft-subject" className="mt-2" value={draftForm.subject} onChange={(event) => setDraftForm((current) => ({ ...current, subject: event.target.value }))} maxLength={200} /></div>
                <div><Label htmlFor="outreach-draft-body">Réponse ou message</Label><Textarea id="outreach-draft-body" className="mt-2 min-h-32" value={draftForm.body} onChange={(event) => setDraftForm((current) => ({ ...current, body: event.target.value }))} placeholder="Réponse utile, contextualisée, sans promesse de lien…" maxLength={4000} /></div>
                <div className="flex gap-2"><Button type="button" disabled={!canMutateBackend || pending === "save-draft"} onClick={saveDraft}>Soumettre à la revue</Button><Button type="button" variant="ghost" onClick={() => setDraftFormOpen(false)}>Annuler</Button></div>
              </div>
            ) : null}
            {data.drafts.length ? data.drafts.map((draft) => (
              <div key={draft.id} className="rounded-2xl border p-4">
                <div className="flex items-start justify-between gap-3"><p className="font-semibold">{draft.opportunityTitle}</p>{stateBadge(draft.status)}</div>
                {draft.subject ? <p className="mt-2 text-sm font-medium">{draft.subject}</p> : null}
                <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm text-muted-foreground">{draft.body}</p>
                {["draft", "pending_review"].includes(draft.status) ? <div className="mt-3 space-y-2"><Textarea value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} maxLength={500} aria-label={`Motif d’approbation pour ${draft.opportunityTitle}`} /><Button type="button" size="sm" disabled={!canMutateBackend || pending === "approve-" + draft.id || approvalReason.trim().length < 8} onClick={() => approveDraft(draft.id)}><CheckCircle2 className="mr-2 h-4 w-4" />Approuver et journaliser</Button></div> : null}
              </div>
            )) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucun brouillon. La file reste vide tant qu’aucune cible allowlistée n’a été choisie.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-3">
          <div><CardTitle className="flex items-center gap-2"><Link2 className="h-5 w-5 text-emerald-600" />Backlinks gagnés</CardTitle><p className="mt-1 text-sm text-muted-foreground">Enregistrez une preuve publique ; aucun achat ni schéma de liens n’est déclenché par TOK.</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => setBacklinkFormOpen((open) => !open)}><Plus className="mr-2 h-4 w-4" />Ajouter</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {backlinkFormOpen ? (
            <div className="grid gap-3 rounded-2xl border bg-muted/20 p-4 md:grid-cols-2">
              <div><Label htmlFor="outreach-backlink-source">URL source</Label><Input id="outreach-backlink-source" className="mt-2" value={backlinkForm.sourceUrl} onChange={(event) => setBacklinkForm((current) => ({ ...current, sourceUrl: event.target.value }))} placeholder="https://example.org/article" maxLength={2048} /></div>
              <div><Label htmlFor="outreach-backlink-target">URL TheTOK</Label><Input id="outreach-backlink-target" className="mt-2" value={backlinkForm.targetUrl} onChange={(event) => setBacklinkForm((current) => ({ ...current, targetUrl: event.target.value }))} placeholder="https://www.thetok.ch/restaurants" maxLength={2048} /></div>
              <div><Label htmlFor="outreach-backlink-rel">Attribut rel</Label><Select value={backlinkForm.rel} onValueChange={(rel) => setBacklinkForm((current) => ({ ...current, rel: rel as MarketingBacklinkRel }))}><SelectTrigger id="outreach-backlink-rel" className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{(["nofollow", "sponsored", "ugc", "follow"] as const).map((rel) => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}</SelectContent></Select></div>
              <div><Label htmlFor="outreach-backlink-status">État</Label><Select value={backlinkForm.status} onValueChange={(status) => setBacklinkForm((current) => ({ ...current, status: status as MarketingBacklinkStatus }))}><SelectTrigger id="outreach-backlink-status" className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(BACKLINK_STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
              <div className="md:col-span-2"><Label htmlFor="outreach-backlink-note">Preuve / note de vérification</Label><Textarea id="outreach-backlink-note" className="mt-2" value={backlinkForm.verificationNote} onChange={(event) => setBacklinkForm((current) => ({ ...current, verificationNote: event.target.value }))} placeholder="Date, emplacement public, rel observé, capture interne…" maxLength={2000} /></div>
              <div className="flex gap-2 md:col-span-2"><Button type="button" disabled={!canMutateBackend || pending === "save-backlink"} onClick={saveBacklink}>Enregistrer la preuve</Button><Button type="button" variant="ghost" onClick={() => setBacklinkFormOpen(false)}>Annuler</Button></div>
            </div>
          ) : null}
          {data.backlinks.length ? (
            <div className="grid gap-3 lg:grid-cols-2">
              {data.backlinks.map((backlink) => <div key={backlink.id} className="rounded-2xl border p-4"><div className="flex items-start justify-between gap-3"><p className="truncate text-sm font-semibold">{backlink.opportunityTitle || "Lien documenté"}</p>{stateBadge(backlink.status)}</div><a href={backlink.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 block truncate text-xs text-orange-700 hover:underline">{backlink.sourceUrl}</a><p className="mt-2 truncate text-xs text-muted-foreground">→ {backlink.targetUrl} · rel={backlink.rel}</p>{backlink.verificationNote ? <p className="mt-2 text-xs text-muted-foreground">{backlink.verificationNote}</p> : null}</div>)}
            </div>
          ) : <p className="rounded-xl border border-dashed p-5 text-sm text-muted-foreground">Aucun backlink vérifié. Un lien est un résultat à documenter, jamais une promesse automatique.</p>}
        </CardContent>
      </Card>

      <p className="flex items-start gap-2 text-xs text-muted-foreground"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />Les connecteurs API externes et la publication automatique restent désactivés tant qu’un adaptateur officiel, un quota et une revue de conformité ne sont pas configurés.</p>
    </div>
  );
}
