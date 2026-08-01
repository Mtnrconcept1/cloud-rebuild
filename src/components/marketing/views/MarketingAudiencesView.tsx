import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Ban, Building2, MapPin, Pencil, Plus, RefreshCw, Search, ShieldCheck, Sparkles, Users } from "lucide-react";

import {
  MarketingChannelBadge,
  MarketingEmptyState,
  MarketingPagination,
  MarketingStatusBadge,
  formatMarketingDate,
} from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import type {
  MarketingChannelId,
  MarketingContactListParams,
  MarketingLawfulBasis,
  MarketingOffsetPage,
  MarketingProspect,
  MarketingProspectStatus,
  MarketingRestaurantContactDraft,
  MarketingSnapshot,
  MarketingView,
} from "@/marketing/types";
import { MARKETING_PROSPECT_STATUSES } from "@/marketing/types";
import { marketingPageOffset } from "@/marketing/offsetPage";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import { marketingZurichDateTimeInput } from "@/marketing/zurichTime";

const PAGE_SIZE = 10;
const EMPTY_CONTACT_PAGE: MarketingOffsetPage<MarketingProspect> = { items: [], total: 0 };

function prospectStatusFilter(value: string): MarketingProspectStatus | null | undefined {
  if (value === "all") return null;
  return MARKETING_PROSPECT_STATUSES.includes(value as MarketingProspectStatus)
    ? value as MarketingProspectStatus
    : undefined;
}

function safeListError(error: unknown) {
  const message = error instanceof Error ? error.message : "Service de recherche indisponible";
  return message.replace(/[\r\n]+/g, " ").slice(0, 180);
}

function emptyQualification(): MarketingRestaurantContactDraft {
  return {
    displayName: "",
    email: "",
    phone: "",
    city: "",
    canton: "",
    category: "Restaurant",
    lawfulBasis: "consent",
    evidenceSource: "",
    evidenceNote: "",
    evidenceAt: marketingZurichDateTimeInput(new Date()),
  };
}

const LAWFUL_BASIS_LABELS: Record<MarketingLawfulBasis, string> = {
  consent: "Consentement explicite",
  existing_customer: "Relation client existante",
  legitimate_interest: "Intérêt légitime · appel manuel seulement",
};

export default function MarketingAudiencesView({
  snapshot,
  filters,
  canMutateBackend,
  pendingAction,
  onFiltersChange,
  onNavigate,
  onSyncSources,
  onLoadContactsPage,
  contactsRevision,
  onQualifyContact,
  onSuppressContact,
}: {
  snapshot: MarketingSnapshot;
  filters: MarketingUrlState;
  canMutateBackend: boolean;
  pendingAction: string | null;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
  onNavigate: (view: MarketingView) => void;
  onSyncSources: () => Promise<unknown>;
  onLoadContactsPage: (params: MarketingContactListParams) => Promise<MarketingOffsetPage<MarketingProspect>>;
  contactsRevision: number;
  onQualifyContact: (draft: MarketingRestaurantContactDraft) => Promise<unknown>;
  onSuppressContact: (contactId: string, reason: string) => Promise<unknown>;
}) {
  const [tab, setTab] = useState("audiences");
  const [syncDialogOpen, setSyncDialogOpen] = useState(false);
  const [qualificationOpen, setQualificationOpen] = useState(false);
  const [qualificationOriginal, setQualificationOriginal] = useState<MarketingProspect | null>(null);
  const [qualification, setQualification] = useState<MarketingRestaurantContactDraft>(emptyQualification);
  const [suppressionContact, setSuppressionContact] = useState<MarketingProspect | null>(null);
  const [suppressionReason, setSuppressionReason] = useState("");
  const [contactPage, setContactPage] = useState<MarketingOffsetPage<MarketingProspect>>(EMPTY_CONTACT_PAGE);
  const [contactsLoading, setContactsLoading] = useState(true);
  const [contactsError, setContactsError] = useState<string | null>(null);
  const contactsGeneration = useRef(0);
  const query = filters.query.trim().toLowerCase();
  const audiences = useMemo(() => snapshot.audiences.filter((audience) => (
    (!query || `${audience.name} ${audience.location} ${audience.kind}`.toLowerCase().includes(query))
    && (filters.channel === "all" || audience.recommendedChannel === filters.channel)
  )), [filters.channel, query, snapshot.audiences]);
  const pageProspects = contactPage.items;
  const qualificationKey = `qualify-contact-${qualification.id || "new"}`;
  const existingPhone = qualificationOriginal?.hasPhone === true;
  const existingEmail = qualificationOriginal?.hasEmail === true;
  const hasCoordinate = Boolean(qualification.email.trim() || qualification.phone.trim() || existingEmail || existingPhone);
  const hasPhone = Boolean(qualification.phone.trim() || existingPhone);
  const qualificationValid = qualification.displayName.trim().length >= 2
    && qualification.city.trim().length >= 2
    && /^[A-Za-z]{2}$/.test(qualification.canton.trim())
    && hasCoordinate
    && (qualification.lawfulBasis !== "legitimate_interest" || hasPhone)
    && qualification.evidenceSource.trim().length >= 3
    && qualification.evidenceNote.trim().length >= 10
    && Boolean(qualification.evidenceAt);

  const loadContacts = useCallback(async () => {
    const generation = contactsGeneration.current + 1;
    contactsGeneration.current = generation;
    setContactPage(EMPTY_CONTACT_PAGE);
    setContactsLoading(true);
    setContactsError(null);

    if (!canMutateBackend) {
      if (contactsGeneration.current === generation) {
        setContactsError("Le backend marketing est indisponible ; aucun contact mémorisé n'est affiché.");
        setContactsLoading(false);
      }
      return;
    }

    const status = prospectStatusFilter(filters.status);
    if (status === undefined) {
      if (contactsGeneration.current === generation) {
        setContactsError("Le filtre de statut est invalide. La liste reste masquée.");
        setContactsLoading(false);
      }
      return;
    }

    try {
      const result = await onLoadContactsPage({
        query: filters.query,
        status,
        channel: filters.channel === "all" ? null : filters.channel,
        limit: PAGE_SIZE,
        offset: marketingPageOffset(filters.page, PAGE_SIZE),
      });
      if (contactsGeneration.current !== generation) return;
      const lastPage = Math.max(1, Math.ceil(result.total / PAGE_SIZE));
      if (filters.page > lastPage) {
        onFiltersChange({ page: lastPage });
        return;
      }
      setContactPage(result);
    } catch (error) {
      if (contactsGeneration.current !== generation) return;
      setContactPage(EMPTY_CONTACT_PAGE);
      setContactsError(safeListError(error));
    } finally {
      if (contactsGeneration.current === generation) setContactsLoading(false);
    }
  }, [canMutateBackend, filters.channel, filters.page, filters.query, filters.status, onFiltersChange, onLoadContactsPage]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContacts();
    }, filters.query.trim() ? 250 : 0);
    return () => {
      window.clearTimeout(timer);
      contactsGeneration.current += 1;
    };
  }, [contactsRevision, filters.query, loadContacts]);

  const openQualification = (prospect?: MarketingProspect) => {
    setQualificationOriginal(prospect || null);
    setQualification(prospect ? {
      id: prospect.id,
      expectedUpdatedAt: prospect.updatedAt,
      displayName: prospect.displayName,
      email: "",
      phone: "",
      city: prospect.city,
      canton: prospect.canton === "CH" ? "" : prospect.canton,
      category: prospect.category || "Restaurant",
      lawfulBasis: ["consent", "existing_customer", "legitimate_interest"].includes(prospect.lawfulBasis || "")
        ? prospect.lawfulBasis as MarketingLawfulBasis
        : "consent",
      evidenceSource: "",
      evidenceNote: "",
      evidenceAt: marketingZurichDateTimeInput(new Date()),
    } : emptyQualification());
    setQualificationOpen(true);
  };

  const closeQualification = () => {
    setQualificationOpen(false);
    setQualificationOriginal(null);
    setQualification(emptyQualification());
  };

  const submitQualification = async () => {
    if (!qualificationValid) return;
    const result = await onQualifyContact(qualification);
    if (result) {
      closeQualification();
      setTab("prospects");
    }
  };

  const submitSuppression = async () => {
    if (!suppressionContact || suppressionReason.trim().length < 8) return;
    const result = await onSuppressContact(suppressionContact.id, suppressionReason.trim());
    if (result) {
      setSuppressionContact(null);
      setSuppressionReason("");
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-orange-600">Ciblage responsable</p>
          <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">Audiences & prospects</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Priorisez les segments joignables sans exposer de données personnelles. L'éligibilité finale est toujours recalculée côté serveur au moment du dispatch.</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button type="button" disabled={!canMutateBackend} onClick={() => openQualification()}>
            <Plus className="mr-2 h-4 w-4" />Qualifier un restaurant
          </Button>
          <Button type="button" variant="outline" disabled={!canMutateBackend || pendingAction === "sync-sources"} onClick={() => setSyncDialogOpen(true)}>
            <RefreshCw className={pendingAction === "sync-sources" ? "mr-2 h-4 w-4 animate-spin" : "mr-2 h-4 w-4"} />Synchroniser les sources
          </Button>
        </div>
      </div>

      <Alert className="border-sky-500/25 bg-sky-500/5">
        <ShieldCheck className="h-4 w-4 text-sky-600" />
        <AlertTitle>Minimisation des données</AlertTitle>
        <AlertDescription>Cette vue n'affiche que les attributs nécessaires au ciblage. Une qualification exige une coordonnée, une base légale positive et sa preuve datée ; elle ne déclenche aucun envoi.</AlertDescription>
      </Alert>

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[minmax(12rem,1fr)_12rem_12rem]">
          <label className="relative block">
            <span className="sr-only">Rechercher une audience ou un prospect</span>
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={filters.query} maxLength={80} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder="Segment, ville, canton, catégorie…" className="pl-9" />
          </label>
          <Select value={filters.status} onValueChange={(status) => onFiltersChange({ status, page: 1 })}>
            <SelectTrigger aria-label="Filtrer les prospects par statut"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les statuts</SelectItem><SelectItem value="new">Nouveaux</SelectItem><SelectItem value="qualified">Qualifiés</SelectItem><SelectItem value="contacted">Contactés</SelectItem><SelectItem value="follow_up">À relancer</SelectItem><SelectItem value="converted">Convertis</SelectItem><SelectItem value="opted_out">Opposition</SelectItem></SelectContent>
          </Select>
          <Select value={filters.channel} onValueChange={(channel) => onFiltersChange({ channel: channel as MarketingChannelId | "all", page: 1 })}>
            <SelectTrigger aria-label="Filtrer par meilleur canal"><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="all">Tous les canaux</SelectItem>{snapshot.channels.map((channel) => <SelectItem key={channel.id} value={channel.id}>{channel.label}</SelectItem>)}</SelectContent>
          </Select>
        </CardContent>
      </Card>

      <Tabs value={tab} onValueChange={(value) => { setTab(value); onFiltersChange({ page: 1 }); }}>
        <TabsList className="grid h-auto w-full max-w-md grid-cols-2">
          <TabsTrigger value="audiences">Audiences ({audiences.length})</TabsTrigger>
          <TabsTrigger value="prospects">Prospects ({contactsLoading ? "…" : contactPage.total.toLocaleString("fr-CH")})</TabsTrigger>
        </TabsList>

        <TabsContent value="audiences" className="mt-5">
          {audiences.length ? (
            <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
              {audiences.map((audience) => (
                <Card key={audience.id} className="min-w-0">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-orange-600">{audience.kind === "restaurant" ? <Building2 className="h-5 w-5" /> : <Users className="h-5 w-5" />}</span>
                      <MarketingChannelBadge channel={audience.recommendedChannel} />
                    </div>
                    <CardTitle className="pt-2">{audience.name}</CardTitle>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3.5 w-3.5" />{audience.location}</p>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-2 gap-3"><div className="rounded-xl bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Profils dans l'aperçu</p><p className="mt-1 text-xl font-bold">{audience.total.toLocaleString("fr-CH")}</p></div><div className="rounded-xl bg-sky-500/10 p-3"><p className="text-xs text-muted-foreground">Éligibilité</p><p className="mt-1 text-sm font-bold text-sky-700 dark:text-sky-300">À estimer côté serveur</p></div></div>
                    {audience.sampleLimited ? <p className="text-xs text-muted-foreground">Aperçu non juridique sur les 100 contacts les plus récents au maximum. Il ne déclare ni taille totale, ni consentement, ni éligibilité.</p> : null}
                    <Button type="button" variant="outline" className="w-full" onClick={() => onNavigate("campaigns")}><Sparkles className="mr-2 h-4 w-4" />Estimer dans une campagne</Button>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <MarketingEmptyState title="Aucune audience confirmée" description={snapshot.source === "fallback" ? "Le backend est indisponible ; aucun volume ni segment n'est inventé." : "Aucun segment ne correspond à vos filtres."} action={<Button type="button" variant="outline" onClick={() => onNavigate("campaigns")}>Créer un ciblage dynamique</Button>} />
          )}
        </TabsContent>

        <TabsContent value="prospects" className="mt-5">
          <Card>
            <CardContent className="p-0 sm:p-4">
              {contactsLoading ? (
                <div className="flex min-h-56 items-center justify-center gap-2 p-6 text-sm text-muted-foreground" role="status" aria-live="polite">
                  <RefreshCw className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Chargement sécurisé des prospects…
                </div>
              ) : contactsError ? (
                <div className="p-4">
                  <MarketingEmptyState
                    title="Prospects indisponibles"
                    description={`${contactsError} Aucune ancienne page n'est conservée.`}
                    action={<Button type="button" variant="outline" onClick={() => { void loadContacts(); }}><RefreshCw className="mr-2 h-4 w-4" />Réessayer</Button>}
                  />
                </div>
              ) : pageProspects.length ? (
                <>
                  <Table>
                    <TableHeader><TableRow><TableHead>Prospect</TableHead><TableHead>Localisation</TableHead><TableHead>Contact masqué</TableHead><TableHead>Statut</TableHead><TableHead>Score</TableHead><TableHead>Canal recommandé</TableHead><TableHead>Prochaine action</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {pageProspects.map((prospect) => (
                        <TableRow key={prospect.id}>
                          <TableCell data-label="Prospect"><div className="min-w-0"><p className="truncate font-semibold">{prospect.displayName}</p><p className="truncate text-xs text-muted-foreground">{prospect.category}</p></div></TableCell>
                          <TableCell data-label="Localisation">{prospect.city} · {prospect.canton}</TableCell>
                          <TableCell data-label="Contact masqué"><div className="text-xs"><p>{prospect.emailMasked || "E-mail non disponible"}</p><p className="mt-0.5 text-muted-foreground">{prospect.phoneMasked || "Téléphone non disponible"}</p></div></TableCell>
                          <TableCell data-label="Statut"><MarketingStatusBadge status={prospect.status} /></TableCell>
                          <TableCell data-label="Score"><span className="font-semibold">{prospect.leadScore}/100</span></TableCell>
                          <TableCell data-label="Canal"><MarketingChannelBadge channel={prospect.recommendedChannel} /></TableCell>
                          <TableCell data-label="Prochaine action"><span className="text-sm">{formatMarketingDate(prospect.nextActionAt)}</span></TableCell>
                          <TableCell data-label="Actions" className="text-right"><div className="flex justify-end gap-1">
                            {prospect.contactType !== "registered_user" && prospect.status !== "opted_out" ? <Button type="button" size="sm" variant="outline" disabled={!canMutateBackend} onClick={() => openQualification(prospect)}><Pencil className="mr-1 h-3.5 w-3.5" />Qualifier</Button> : null}
                            {prospect.status !== "opted_out" ? <Button type="button" size="sm" variant="ghost" className="text-rose-600 hover:text-rose-700" disabled={!canMutateBackend || pendingAction === `suppress-contact-${prospect.id}`} onClick={() => setSuppressionContact(prospect)}><Ban className="mr-1 h-3.5 w-3.5" />Opposition</Button> : null}
                          </div></TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="px-4 pb-4"><MarketingPagination page={filters.page} pageSize={PAGE_SIZE} total={contactPage.total} onPageChange={(page) => onFiltersChange({ page })} /></div>
                </>
              ) : (
                <div className="p-4"><MarketingEmptyState title="Aucun prospect confirmé" description={snapshot.source === "fallback" ? "La source de prospection est indisponible ; aucune entreprise fictive n'est affichée." : "Aucun prospect ne correspond aux filtres."} /></div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={qualificationOpen} onOpenChange={(open) => { if (!open) closeQualification(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{qualification.id ? "Qualifier le restaurant" : "Ajouter un restaurant qualifié"}</DialogTitle>
            <DialogDescription>Les coordonnées servent uniquement à préparer des tâches manuelles gouvernées. Cette action ne lance ni e-mail, ni appel, ni publication.</DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-500/25 bg-amber-500/5">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <AlertTitle>Preuve obligatoire</AlertTitle>
            <AlertDescription>Documentez une source vérifiable et la justification. L'intérêt légitime est limité aux appels manuels ; le consentement explicite est requis pour l'e-mail hors relation client existante.</AlertDescription>
          </Alert>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2"><Label htmlFor="qualification-name">Restaurant</Label><Input id="qualification-name" className="mt-2" value={qualification.displayName} maxLength={200} onChange={(event) => setQualification((current) => ({ ...current, displayName: event.target.value }))} /></div>
            <div><Label htmlFor="qualification-email">E-mail</Label><Input id="qualification-email" type="email" autoComplete="off" className="mt-2" value={qualification.email} maxLength={320} placeholder={qualificationOriginal?.emailMasked || "contact@restaurant.ch"} onChange={(event) => setQualification((current) => ({ ...current, email: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">{existingEmail ? "Laisser vide conserve l'e-mail existant." : "Requis si aucun téléphone."}</p></div>
            <div><Label htmlFor="qualification-phone">Téléphone</Label><Input id="qualification-phone" type="tel" autoComplete="off" className="mt-2" value={qualification.phone} maxLength={64} placeholder={qualificationOriginal?.phoneMasked || "+41 …"} onChange={(event) => setQualification((current) => ({ ...current, phone: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">{existingPhone ? "Laisser vide conserve le téléphone existant." : "Obligatoire pour l'intérêt légitime."}</p></div>
            <div><Label htmlFor="qualification-city">Ville</Label><Input id="qualification-city" className="mt-2" value={qualification.city} maxLength={120} onChange={(event) => setQualification((current) => ({ ...current, city: event.target.value }))} /></div>
            <div><Label htmlFor="qualification-canton">Canton</Label><Input id="qualification-canton" className="mt-2 uppercase" value={qualification.canton} minLength={2} maxLength={2} placeholder="GE" onChange={(event) => setQualification((current) => ({ ...current, canton: event.target.value.toUpperCase() }))} /></div>
            <div><Label htmlFor="qualification-category">Catégorie</Label><Input id="qualification-category" className="mt-2" value={qualification.category} maxLength={120} onChange={(event) => setQualification((current) => ({ ...current, category: event.target.value }))} /></div>
            <div><Label>Base légale</Label><Select value={qualification.lawfulBasis} onValueChange={(value) => setQualification((current) => ({ ...current, lawfulBasis: value as MarketingLawfulBasis }))}><SelectTrigger className="mt-2"><SelectValue /></SelectTrigger><SelectContent>{Object.entries(LAWFUL_BASIS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
            <div><Label htmlFor="qualification-evidence-source">Source de preuve</Label><Input id="qualification-evidence-source" className="mt-2" value={qualification.evidenceSource} minLength={3} maxLength={200} placeholder="Formulaire, contrat, dossier ou référence" onChange={(event) => setQualification((current) => ({ ...current, evidenceSource: event.target.value }))} /></div>
            <div><Label htmlFor="qualification-evidence-at">Preuve constatée le · heure suisse</Label><Input id="qualification-evidence-at" type="datetime-local" className="mt-2" value={qualification.evidenceAt} max={marketingZurichDateTimeInput(new Date())} onChange={(event) => setQualification((current) => ({ ...current, evidenceAt: event.target.value }))} /></div>
            <div className="sm:col-span-2"><Label htmlFor="qualification-evidence-note">Justification et périmètre</Label><Textarea id="qualification-evidence-note" className="mt-2 min-h-28" value={qualification.evidenceNote} minLength={10} maxLength={1_000} placeholder="Décrire la preuve, le périmètre du consentement ou l'évaluation documentée de l'intérêt légitime…" onChange={(event) => setQualification((current) => ({ ...current, evidenceNote: event.target.value }))} /><p className="mt-1 text-xs text-muted-foreground">{qualification.evidenceNote.trim().length}/1000 · minimum 10 caractères</p></div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={closeQualification}>Annuler</Button>
            <Button type="button" disabled={!canMutateBackend || !qualificationValid || pendingAction === qualificationKey} onClick={submitQualification}>{pendingAction === qualificationKey ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}Enregistrer la qualification</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(suppressionContact)} onOpenChange={(open) => { if (!open) { setSuppressionContact(null); setSuppressionReason(""); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader><DialogTitle>Enregistrer une opposition</DialogTitle><DialogDescription>{suppressionContact?.displayName} sera exclu des audiences individuelles et ses tâches en attente seront annulées.</DialogDescription></DialogHeader>
          <div><Label htmlFor="suppression-reason">Motif obligatoire</Label><Textarea id="suppression-reason" className="mt-2 min-h-24" value={suppressionReason} minLength={8} maxLength={500} placeholder="Demande d'opposition reçue par…" onChange={(event) => setSuppressionReason(event.target.value)} /><p className="mt-1 text-xs text-muted-foreground">{suppressionReason.trim().length}/500 · minimum 8 caractères</p></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => { setSuppressionContact(null); setSuppressionReason(""); }}>Annuler</Button><Button type="button" variant="destructive" disabled={!canMutateBackend || suppressionReason.trim().length < 8 || pendingAction === `suppress-contact-${suppressionContact?.id}`} onClick={submitSuppression}>Confirmer l'opposition</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={syncDialogOpen} onOpenChange={setSyncDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Synchroniser les sources marketing</DialogTitle>
            <DialogDescription>Importer les références du catalogue restaurants et appliquer les derniers consentements clients enregistrés, par lots bornés et reprenables.</DialogDescription>
          </DialogHeader>
          <Alert className="border-amber-500/25 bg-amber-500/5">
            <ShieldCheck className="h-4 w-4 text-amber-600" />
            <AlertTitle>Oppositions prioritaires</AlertTitle>
            <AlertDescription>La synchronisation peut annuler les traitements en attente pour un client opposé. Elle s'arrête après un nombre borné de lots ; si le cycle n'est pas terminé, relancez cette action pour reprendre au dernier curseur confirmé. Le résultat contient uniquement des compteurs.</AlertDescription>
          </Alert>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setSyncDialogOpen(false)}>Annuler</Button>
            <Button type="button" disabled={!canMutateBackend || pendingAction === "sync-sources"} onClick={async () => { const result = await onSyncSources(); if (result) setSyncDialogOpen(false); }}>
              {pendingAction === "sync-sources" ? <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> : null}Confirmer la synchronisation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
