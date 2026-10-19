import { useEffect, useState } from "react";
import { CheckCircle2, ExternalLink, Facebook, Instagram, Loader2, Pause, Play, Plus, RefreshCw, Search, X } from "lucide-react";

import { MarketingChannelBadge, MarketingEmptyState, MarketingPagination, formatMarketingDate } from "@/components/marketing/MarketingShared";
import {
  MarketingSocialAddDialog,
  MarketingSocialRecordDialog,
} from "@/components/marketing/MarketingSocialFollowDialogs";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { socialFollowStatusForAccount, socialProfileHref, socialSourceHref } from "@/marketing/socialFollowClient";
import { SOCIAL_FOLLOW_LABELS, SOCIAL_SELECT_CLASS, SOCIAL_VERIFICATION_LABELS } from "@/marketing/socialFollowLabels";
import { SOCIAL_FOLLOW_PAGE_SIZE, useMarketingSocialFollow, type SocialFollowMode } from "@/marketing/useMarketingSocialFollow";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import { SOCIAL_FOLLOW_STATUSES } from "../../../../supabase/functions/_shared/marketing-social-follow-contract";
import type {
  MarketingSocialCollectionProgress,
  MarketingSocialFollowStatus,
  MarketingSocialProfile,
  MarketingSocialRestaurant,
  MarketingSocialRestaurantEvidence,
  MarketingSocialSourceAccount,
} from "../../../../supabase/functions/_shared/marketing-social-follow-contract";

const number = (value: number) => value.toLocaleString("fr-CH");
const DISCOVERY_LABELS: Record<MarketingSocialRestaurant["discoveryStatus"], string> = {
  pending: "À rechercher",
  processing: "Recherche en cours",
  success: "Profil trouvé",
  no_profiles: "Aucun profil trouvé sur le site",
  no_website: "Sans site renseigné",
  robots_blocked: "Recherche refusée par le site",
  error: "Recherche à réessayer",
};

function SourceAccounts({ accounts }: { accounts: MarketingSocialSourceAccount[] }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2" aria-label="Comptes TOK configurés">
      {(["instagram", "facebook"] as const).map((platform) => {
        const account = accounts.find((item) => item.platform === platform);
        const url = socialProfileHref(account?.profileUrl, platform);
        const Icon = platform === "instagram" ? Instagram : Facebook;
        return (
          <div key={platform} className="flex min-w-0 items-start gap-3 rounded-xl border bg-background p-4">
            <span className="rounded-lg bg-muted p-2"><Icon className="h-5 w-5 text-muted-foreground" aria-hidden="true" /></span>
            <div className="min-w-0 text-sm">
              <p className="font-semibold">TOK · {platform === "instagram" ? "Instagram" : "Facebook"}</p>
              <p className="mt-1 break-words text-muted-foreground">{account?.configured && account.id ? account.label : "Compte TOK à configurer dans Intégrations"}</p>
              {url ? <a href={url} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-10 items-center gap-1 font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voir le compte TOK <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CollectionProgress({ collection }: { collection: MarketingSocialCollectionProgress }) {
  const total = Math.max(collection.totalJobs, collection.eligibleRestaurants);
  return (
    <div className="space-y-4" aria-label="Avancement enregistré de la collecte">
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          ["Restaurants traités", `${number(collection.completed)} / ${number(total)}`],
          ["Restant à rechercher", number(collection.pending)],
          ["Comptes uniques retrouvés", number(collection.profiles)],
          ["Recherches sans site", number(collection.noWebsite)],
        ].map(([label, value]) => <div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tracking-tight">{value}</p></div>)}
      </div>
      <progress className="h-2 w-full overflow-hidden rounded-full accent-orange-500 [&::-webkit-progress-bar]:bg-muted [&::-webkit-progress-value]:bg-orange-500" value={Math.min(collection.completed, total)} max={Math.max(1, total)} aria-label="Restaurants dont la recherche est terminée" />
      <p className="text-xs leading-relaxed text-muted-foreground">
        {number(collection.noProfiles)} sans profil repéré · {number(collection.errors)} erreurs · {number(collection.robotsBlocked)} sites refusant la recherche · {number(collection.processing)} en cours sur le serveur.
        {" "}Un restaurant peut partager son compte avec plusieurs fiches ; les comptes sont regroupés.
      </p>
    </div>
  );
}

function Evidence({ restaurant }: { restaurant: MarketingSocialRestaurantEvidence }) {
  const sourceUrl = socialSourceHref(restaurant.sourceUrl);
  return (
    <li className="min-w-0 rounded-lg bg-muted/35 p-3 text-sm">
      <p className="break-words font-medium">{restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ""}</p>
      <p className="mt-1 text-xs text-muted-foreground">{restaurant.sourceKind === "website" ? "Lien publié sur le site" : restaurant.sourceKind === "database" ? "Lien présent dans la fiche TOK" : "Ajout manuel"}</p>
      {restaurant.context ? <p className="mt-1 break-words text-xs leading-relaxed text-muted-foreground">{restaurant.context}</p> : null}
      {sourceUrl ? <a href={sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex min-h-10 items-center gap-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voir la source <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : <p className="mt-2 text-xs text-muted-foreground">URL de source non disponible</p>}
    </li>
  );
}

function ProfileCard({ profile, account, disabled, onRecord }: {
  profile: MarketingSocialProfile;
  account: MarketingSocialSourceAccount | undefined;
  disabled: boolean;
  onRecord: () => void;
}) {
  const profileUrl = socialProfileHref(profile.profileUrl, profile.platform);
  const status = socialFollowStatusForAccount(profile, account);
  const previousAccount = !!profile.sourceAccountId && profile.sourceAccountId !== account?.id;
  return (
    <Card className="min-w-0">
      <CardContent className="space-y-4 p-4 sm:p-5">
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <MarketingChannelBadge channel={profile.platform} />
              <Badge variant="outline" className={cn(status === "followed" && "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300", status === "requested" && "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300")}>{SOCIAL_FOLLOW_LABELS[status]}</Badge>
              <Badge variant="outline" className={cn(profile.verificationStatus === "rejected" && "border-rose-500/30 text-rose-700 dark:text-rose-300")}>{SOCIAL_VERIFICATION_LABELS[profile.verificationStatus]}</Badge>
            </div>
            <h3 className="break-all text-base font-semibold">{profile.handle || profile.canonicalKey}</h3>
            <p className="text-xs text-muted-foreground">{number(profile.restaurantCount)} fiche{profile.restaurantCount > 1 ? "s" : ""} associée{profile.restaurantCount > 1 ? "s" : ""} · Repéré le {formatMarketingDate(profile.lastSeenAt, false)}</p>
          </div>
          <div className="flex w-full flex-wrap gap-2 sm:w-auto">
            {profileUrl ? <Button type="button" variant="outline" asChild><a href={profileUrl} target="_blank" rel="noopener noreferrer">Ouvrir le profil <ExternalLink className="ml-2 h-4 w-4" aria-hidden="true" /></a></Button> : <p className="text-sm text-destructive">URL du compte à vérifier</p>}
            <Button type="button" disabled={disabled || !account?.configured || !account.id} onClick={onRecord}>Enregistrer le contrôle</Button>
          </div>
        </div>
        {previousAccount ? <p className="text-sm text-amber-700 dark:text-amber-300">Le compte TOK a changé. Le suivi reste à contrôler pour le compte actuellement configuré.</p> : null}
        <ul className="grid gap-2 sm:grid-cols-2">
          {profile.restaurants.slice(0, 2).map((restaurant) => <Evidence key={restaurant.id} restaurant={restaurant} />)}
        </ul>
        {profile.restaurants.length > 2 ? (
          <details className="rounded-lg border p-3">
            <summary className="cursor-pointer text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Voir les {number(profile.restaurants.length - 2)} autres fiches et sources</summary>
            <ul className="mt-3 grid max-h-72 gap-2 overflow-y-auto sm:grid-cols-2">{profile.restaurants.slice(2).map((restaurant) => <Evidence key={restaurant.id} restaurant={restaurant} />)}</ul>
          </details>
        ) : null}
        {profile.restaurantCount > profile.restaurants.length ? <p className="text-xs text-muted-foreground">{number(profile.restaurants.length)} fiches détaillées sur {number(profile.restaurantCount)} associations.</p> : null}
        {profile.note ? <p className="break-words text-sm text-muted-foreground"><span className="font-medium">Note : </span>{profile.note}</p> : null}
        {profile.confirmedAt && !previousAccount ? <p className="text-xs text-muted-foreground">Dernier contrôle manuel : {formatMarketingDate(profile.confirmedAt)}.</p> : null}
        {!account?.configured || !account.id ? <p className="text-xs text-muted-foreground">Configurez le compte TOK de ce réseau dans Intégrations pour enregistrer un contrôle.</p> : null}
      </CardContent>
    </Card>
  );
}

export default function MarketingSocialFollowView({ canMutateBackend, filters, onFiltersChange }: {
  canMutateBackend: boolean;
  filters: MarketingUrlState;
  onFiltersChange: (patch: Partial<MarketingUrlState>) => void;
}) {
  const [mode, setMode] = useState<SocialFollowMode>("profiles");
  const [recordSelection, setRecordSelection] = useState<{ profile: MarketingSocialProfile; revision: number } | null>(null);
  const [addSelection, setAddSelection] = useState<{ restaurant: MarketingSocialRestaurant | null } | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const platform = filters.channel === "instagram" || filters.channel === "facebook" ? filters.channel : "all";
  const status = SOCIAL_FOLLOW_STATUSES.includes(filters.status as MarketingSocialFollowStatus) ? filters.status as MarketingSocialFollowStatus : "all";
  const controller = useMarketingSocialFollow({ enabled: canMutateBackend, mode, query: filters.query, platform, status, page: filters.page });
  const data = controller.profiles;
  const total = mode === "profiles" ? data?.total : controller.restaurants?.total;
  const available = canMutateBackend && !!data && !controller.error;
  const selectedAccount = data?.sourceAccounts.find((account) => account.platform === recordSelection?.profile.platform);
  const currentProfile = data?.items.find((profile) => profile.id === recordSelection?.profile.id);
  const collection = data?.collection;
  const canCollect = available && collection && (collection.totalJobs === 0 || collection.pending > 0 || collection.processing > 0 || collection.eligibleRestaurants > collection.totalJobs);

  useEffect(() => {
    if (total !== undefined && !controller.loading && !controller.error) {
      const lastPage = Math.max(1, Math.ceil(total / SOCIAL_FOLLOW_PAGE_SIZE));
      if (filters.page > lastPage) onFiltersChange({ page: lastPage });
    }
  }, [controller.error, controller.loading, filters.page, onFiltersChange, total]);

  const changeMode = (value: string) => {
    if (value !== "profiles" && value !== "restaurants") return;
    setMode(value);
    onFiltersChange({ query: "", page: 1, status: "all", channel: "all" });
  };

  return (
    <section className="space-y-5">
      <div className="flex min-w-0 flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-3xl">
          <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Réseaux des restaurants</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">Retrouvez les comptes Instagram et Facebook des restaurants, puis consignez le suivi réalisé avec TOK. Les abonnements et les demandes se font directement sur chaque réseau.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" disabled={!canMutateBackend || controller.refreshing} onClick={() => void controller.refresh()}><RefreshCw className={cn("mr-2 h-4 w-4", controller.refreshing && "animate-spin")} aria-hidden="true" />Actualiser</Button>
          <Button type="button" variant="outline" disabled={!available || !!controller.pendingAction} onClick={() => setAddSelection({ restaurant: null })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Ajouter un profil</Button>
        </div>
      </div>

      {!canMutateBackend ? <Alert variant="destructive" role="alert"><AlertTitle>Centre marketing indisponible</AlertTitle><AlertDescription>Rétablissez la connexion au centre marketing pour charger la file et reprendre les recherches.</AlertDescription></Alert> : null}
      {controller.notice ? (
        <Alert variant={controller.notice.tone === "error" ? "destructive" : "default"} className="relative pr-12" role={controller.notice.tone === "error" ? "alert" : "status"}>
          <AlertDescription>{controller.notice.message}</AlertDescription>
          <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" aria-label="Fermer le message de collecte" onClick={controller.clearNotice}><X className="h-4 w-4" aria-hidden="true" /></Button>
        </Alert>
      ) : null}
      {actionMessage ? <Alert className="relative border-emerald-500/30 pr-12" role="status"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /><AlertDescription>{actionMessage}</AlertDescription><Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" aria-label="Fermer la confirmation" onClick={() => setActionMessage(null)}><X className="h-4 w-4" aria-hidden="true" /></Button></Alert> : null}

      {data ? <div className="space-y-2"><SourceAccounts accounts={data.sourceAccounts} /><p className="text-xs text-muted-foreground">Ces comptes sont configurés dans TOK. Vérifiez également le compte actif dans l’onglet Instagram ou Facebook avant de suivre un restaurant.</p></div> : null}
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 max-w-3xl">
            <h2 className="text-lg font-semibold">Recherche des comptes</h2>
            <CardDescription className="mt-2 leading-relaxed">Les liens de la base et des sites des restaurants sont examinés par lots de trois maximum. Gardez cette page ouverte pour avancer ; vous pouvez arrêter et reprendre depuis la progression enregistrée sur le serveur.</CardDescription>
          </div>
          {controller.collecting ? <Button type="button" variant="outline" className="shrink-0" onClick={controller.stopCollection}><Pause className="mr-2 h-4 w-4" aria-hidden="true" />Arrêter la collecte</Button>
            : <Button type="button" className="shrink-0" disabled={!canCollect} onClick={() => void controller.startCollection()}><Play className="mr-2 h-4 w-4" aria-hidden="true" />{collection?.totalJobs ? "Reprendre la collecte" : "Rechercher les comptes"}</Button>}
        </CardHeader>
        <CardContent>
          {collection ? <CollectionProgress collection={collection} /> : controller.loading ? <Skeleton className="h-24 w-full rounded-xl" /> : <p className="text-sm text-muted-foreground">L’avancement sera affiché dès que les données seront disponibles.</p>}
          {controller.collecting ? <p className="mt-4 flex items-center gap-2 text-sm" role="status"><Loader2 className="h-4 w-4 animate-spin text-orange-500" aria-hidden="true" />{controller.collectingRestaurantId ? "Recherche du restaurant sélectionné…" : "Collecte en cours. Le lot suivant démarrera après la réponse du serveur."}</p> : null}
        </CardContent>
      </Card>

      <Tabs value={mode} onValueChange={changeMode} className="space-y-4">
        <TabsList className="grid h-auto w-full grid-cols-2 sm:w-fit">
          <TabsTrigger value="profiles" className="min-h-11 whitespace-normal px-3 sm:px-5">Comptes retrouvés</TabsTrigger>
          <TabsTrigger value="restaurants" className="min-h-11 whitespace-normal px-3 sm:px-5">Restaurants à rechercher</TabsTrigger>
        </TabsList>
        <div className="grid gap-3 rounded-xl border bg-background p-4 sm:grid-cols-2 xl:grid-cols-4">
          <div className={cn("space-y-2", mode === "profiles" ? "sm:col-span-2" : "sm:col-span-2 xl:col-span-4")}>
            <Label htmlFor="social-follow-search">{mode === "profiles" ? "Rechercher un compte ou un restaurant" : "Rechercher un restaurant"}</Label>
            <div className="relative"><Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" aria-hidden="true" /><Input id="social-follow-search" className="pl-9" value={filters.query} maxLength={80} onChange={(event) => onFiltersChange({ query: event.target.value, page: 1 })} placeholder={mode === "profiles" ? "Compte, nom du restaurant ou ville" : "Nom ou ville"} /></div>
          </div>
          {mode === "profiles" ? <>
            <div className="space-y-2"><Label htmlFor="social-follow-platform">Réseau</Label><select id="social-follow-platform" className={SOCIAL_SELECT_CLASS} value={platform} onChange={(event) => onFiltersChange({ channel: event.target.value as "all" | "instagram" | "facebook", page: 1 })}><option value="all">Tous les réseaux</option><option value="instagram">Instagram</option><option value="facebook">Facebook</option></select></div>
            <div className="space-y-2"><Label htmlFor="social-follow-status">Suivi par TOK</Label><select id="social-follow-status" className={SOCIAL_SELECT_CLASS} value={status} onChange={(event) => onFiltersChange({ status: event.target.value, page: 1 })}><option value="all">Tous les états</option>{Object.entries(SOCIAL_FOLLOW_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          </> : null}
        </div>

        {controller.error ? <Alert variant="destructive" role="alert"><AlertTitle>La file n’a pas pu être chargée</AlertTitle><AlertDescription>{controller.error} <Button type="button" variant="outline" size="sm" className="mt-3" disabled={controller.refreshing} onClick={() => void controller.refresh()}>Réessayer le chargement</Button></AlertDescription></Alert> : null}

        <TabsContent value="profiles" className="space-y-4">
          <h2 className="sr-only">Comptes retrouvés</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Les sources indiquent où le lien a été trouvé. Vérifiez ensuite l’identité et la disponibilité du compte. L’état de suivi correspond à un contrôle manuel avec le compte TOK configuré, sans synchronisation automatique avec Meta.</p>
          {data && !controller.loading && !controller.error ? <p className="text-xs leading-relaxed text-muted-foreground">Pour cette recherche et ce réseau, avant le filtre d’état : {number(data.counts.unknown)} à contrôler · {number(data.counts.not_followed)} non suivis · {number(data.counts.requested)} demandes envoyées · {number(data.counts.followed)} suivis confirmés · {number(data.counts.ignored)} à ignorer.</p> : null}
          {controller.loading ? <div className="space-y-3" role="status"><span className="sr-only">Chargement des comptes retrouvés</span><Skeleton className="h-44 rounded-xl" /><Skeleton className="h-44 rounded-xl" /></div>
            : !controller.error && data?.items.length ? <>
              <ul className="space-y-4" aria-label="Comptes retrouvés">
                {data.items.map((profile) => <li key={profile.id}><ProfileCard profile={profile} account={data.sourceAccounts.find((account) => account.platform === profile.platform)} disabled={!available || !!controller.pendingAction} onRecord={() => { setActionMessage(null); setRecordSelection({ profile, revision: 0 }); }} /></li>)}
              </ul>
              <MarketingPagination page={filters.page} pageSize={SOCIAL_FOLLOW_PAGE_SIZE} total={data.total} onPageChange={(page) => onFiltersChange({ page })} />
            </> : !controller.error && data ? <MarketingEmptyState title={filters.query || status !== "all" || platform !== "all" ? "Aucun compte ne correspond aux filtres" : "Aucun compte retrouvé pour le moment"} description={filters.query || status !== "all" || platform !== "all" ? "Modifiez la recherche, le réseau ou l’état de suivi pour afficher d’autres comptes." : "Lancez la recherche sur les sites des restaurants ou ajoutez un profil que vous avez trouvé."} action={filters.query || status !== "all" || platform !== "all" ? <Button type="button" variant="outline" onClick={() => onFiltersChange({ query: "", status: "all", channel: "all", page: 1 })}>Effacer les filtres</Button> : undefined} /> : null}
        </TabsContent>

        <TabsContent value="restaurants" className="space-y-4">
          <h2 className="sr-only">Restaurants à rechercher</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">Toutes les fiches de restaurants hors démonstration, avec leur état de recherche. Pour les restaurants sans site, recherchez le compte sur Instagram ou Facebook et ajoutez son lien à la fiche.</p>
          {controller.loading ? <div role="status"><span className="sr-only">Chargement des restaurants</span><Skeleton className="h-64 rounded-xl" /></div>
            : !controller.error && controller.restaurants?.items.length ? <>
              <ul className="grid gap-3 xl:grid-cols-2" aria-label="Restaurants à rechercher">
                {controller.restaurants.items.map((restaurant) => {
                  const websiteUrl = socialSourceHref(restaurant.websiteUrl);
                  return <li key={restaurant.id} className="min-w-0 rounded-xl border bg-background p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><h3 className="break-words font-semibold">{restaurant.name}</h3><p className="mt-1 text-sm text-muted-foreground">{restaurant.city || "Ville non renseignée"}</p></div><Badge variant="outline" className="max-w-full whitespace-normal">{DISCOVERY_LABELS[restaurant.discoveryStatus]}</Badge></div>
                    {websiteUrl ? <a href={websiteUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-1 text-sm font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Ouvrir le site associé <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" /></a> : <p className="mt-3 text-sm text-muted-foreground">{restaurant.websiteUrl ? "URL du site à vérifier" : "Aucun site renseigné. Vous pouvez ajouter un compte trouvé manuellement."}</p>}
                    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="outline" size="sm" disabled={!available || !websiteUrl || controller.collecting || restaurant.discoveryStatus === "processing"} onClick={() => void controller.startCollection(restaurant.id)}><Search className="mr-2 h-4 w-4" aria-hidden="true" />Rechercher sur le site</Button><Button type="button" variant="outline" size="sm" disabled={!available || !!controller.pendingAction} onClick={() => setAddSelection({ restaurant })}><Plus className="mr-2 h-4 w-4" aria-hidden="true" />Ajouter un profil</Button></div>
                  </li>;
                })}
              </ul>
              <MarketingPagination page={filters.page} pageSize={SOCIAL_FOLLOW_PAGE_SIZE} total={controller.restaurants.total} onPageChange={(page) => onFiltersChange({ page })} />
            </> : !controller.error && controller.restaurants ? <MarketingEmptyState title="Aucun restaurant trouvé" description={filters.query ? "Essayez un autre nom ou une autre ville." : "Aucune fiche de restaurant hors démonstration n’est disponible."} /> : null}
        </TabsContent>
      </Tabs>

      {recordSelection ? <MarketingSocialRecordDialog key={`${recordSelection.profile.id}:${recordSelection.revision}`} profile={recordSelection.profile} currentProfile={currentProfile} account={selectedAccount} canSave={available} pending={!!controller.pendingAction} onSave={controller.record} onClose={() => setRecordSelection(null)} onReload={() => { if (currentProfile) setRecordSelection({ profile: currentProfile, revision: recordSelection.revision + 1 }); else { setRecordSelection(null); void controller.refresh(); } }} onSaved={() => { setRecordSelection(null); setActionMessage("Contrôle enregistré. Le statut consigné correspond à votre observation manuelle du compte TOK."); }} /> : null}
      {addSelection ? <MarketingSocialAddDialog initialRestaurant={addSelection.restaurant} enabled={available} pending={controller.pendingAction === "add"} onSave={controller.add} onClose={() => setAddSelection(null)} onSaved={(duplicate) => { setAddSelection(null); setActionMessage(duplicate ? "Ce compte existait déjà dans la file. Son association au restaurant est enregistrée." : "Profil ajouté à la file. Son identité et le suivi par TOK restent à contrôler."); }} /> : null}
    </section>
  );
}
