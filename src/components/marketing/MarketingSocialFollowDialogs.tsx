import { useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";

import { MarketingPagination } from "@/components/marketing/MarketingShared";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  listSocialFollowRestaurants,
  socialFollowErrorMessage,
  socialFollowStatusForAccount,
  socialProfileHref,
  socialSourceHref,
  type SocialFollowAddInput,
  type SocialFollowRecordInput,
} from "@/marketing/socialFollowClient";
import { SOCIAL_FOLLOW_QUERY_KEY, useSocialFollowSearch } from "@/marketing/useMarketingSocialFollow";
import { SOCIAL_FOLLOW_LABELS, SOCIAL_SELECT_CLASS, SOCIAL_VERIFICATION_LABELS } from "@/marketing/socialFollowLabels";
import type {
  MarketingSocialAddResult,
  MarketingSocialFollowStatus,
  MarketingSocialProfile,
  MarketingSocialRestaurant,
  MarketingSocialSourceAccount,
  MarketingSocialVerificationStatus,
} from "../../../supabase/functions/_shared/marketing-social-follow-contract";

export function MarketingSocialRecordDialog({
  profile,
  currentProfile,
  account,
  canSave,
  pending,
  onSave,
  onClose,
  onReload,
  onSaved,
}: {
  profile: MarketingSocialProfile;
  currentProfile: MarketingSocialProfile | undefined;
  account: MarketingSocialSourceAccount | undefined;
  canSave: boolean;
  pending: boolean;
  onSave: (input: SocialFollowRecordInput) => Promise<MarketingSocialProfile | undefined>;
  onClose: () => void;
  onReload: () => void;
  onSaved: () => void;
}) {
  const [accountId] = useState(account?.id ?? "");
  const [followStatus, setFollowStatus] = useState<MarketingSocialFollowStatus>(() => socialFollowStatusForAccount(profile, account));
  const [verificationStatus, setVerificationStatus] = useState(profile.verificationStatus);
  const [confirmedWithTokAccount, setConfirmedWithTokAccount] = useState(false);
  const [note, setNote] = useState(profile.note);
  const [error, setError] = useState<string | null>(null);
  const profileUrl = socialProfileHref(profile.profileUrl, profile.platform);
  const stale = account?.id !== accountId || (currentProfile !== undefined && currentProfile.version !== profile.version);
  const needsConfirmation = followStatus === "followed" || followStatus === "requested";
  const valid = canSave && account?.configured && !!accountId && !stale
    && (!needsConfirmation || (verificationStatus === "verified" && confirmedWithTokAccount && !!profileUrl));

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    setError(null);
    try {
      const result = await onSave({
        profileId: profile.id,
        followStatus,
        verificationStatus,
        expectedVersion: profile.version,
        expectedSourceAccountId: accountId,
        confirmedWithTokAccount: needsConfirmation && confirmedWithTokAccount,
        note: note.trim(),
      });
      if (result) onSaved();
    } catch (failure) {
      setError(socialFollowErrorMessage(failure));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="sm:max-w-xl" hideCloseButton={pending}>
        <DialogHeader>
          <DialogTitle>Enregistrer le contrôle</DialogTitle>
          <DialogDescription>
            Contrôlez le restaurant et le résultat affiché sur {profile.platform === "instagram" ? "Instagram" : "Facebook"}, puis consignez votre observation.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={(event) => void submit(event)} className="space-y-5">
          <div className="rounded-xl border bg-muted/30 p-3 text-sm">
            <p className="break-all font-semibold">{profile.handle || profile.canonicalKey}</p>
            <p className="mt-1 break-words text-muted-foreground">{profile.restaurants.map((restaurant) => restaurant.name).join(" · ")}</p>
            {profileUrl ? (
              <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-flex min-h-10 items-center gap-2 font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                Ouvrir le profil <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </a>
            ) : <p className="mt-2 text-destructive">Le lien du profil doit être corrigé avant de confirmer un abonnement.</p>}
          </div>

          {stale ? (
            <Alert role="alert">
              <AlertDescription>
                Le compte TOK ou ce profil a changé depuis l’ouverture du contrôle. Rechargez les données et confirmez à nouveau.
                <Button type="button" variant="outline" size="sm" className="mt-3" disabled={pending || !canSave} onClick={onReload}>Recharger le contrôle</Button>
              </AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="social-record-verification">Identité du restaurant</Label>
            <select id="social-record-verification" value={verificationStatus} disabled={pending} className={SOCIAL_SELECT_CLASS} onChange={(event) => {
              setVerificationStatus(event.target.value as MarketingSocialVerificationStatus);
              setConfirmedWithTokAccount(false);
            }} aria-describedby="social-record-identity-help">
              {Object.entries(SOCIAL_VERIFICATION_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <p id="social-record-identity-help" className="text-xs leading-relaxed text-muted-foreground">Comparez le nom, la ville et le site officiel. Un lien trouvé sur un site reste une piste à vérifier.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-record-follow">Résultat du contrôle</Label>
            <select id="social-record-follow" value={followStatus} disabled={pending} className={SOCIAL_SELECT_CLASS} onChange={(event) => {
              setFollowStatus(event.target.value as MarketingSocialFollowStatus);
              setConfirmedWithTokAccount(false);
            }} aria-describedby="social-record-follow-help">
              {Object.entries(SOCIAL_FOLLOW_LABELS).map(([value, label]) => <option key={value} value={value} disabled={(value === "followed" || value === "requested") && verificationStatus !== "verified"}>{label}</option>)}
            </select>
            <p id="social-record-follow-help" className="text-xs leading-relaxed text-muted-foreground">Pour un compte privé, « Demande envoyée » reste distinct de « Suivi confirmé » jusqu’à son acceptation. L’ouverture du profil ne change aucun statut.</p>
          </div>

          {needsConfirmation ? (
            <div className="rounded-xl border border-orange-500/30 bg-orange-500/5 p-3">
              <label className="flex cursor-pointer items-start gap-3 text-sm leading-relaxed" htmlFor="social-record-tok-account">
                <input id="social-record-tok-account" type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-orange-500" checked={confirmedWithTokAccount} disabled={pending || stale || verificationStatus !== "verified"} onChange={(event) => setConfirmedWithTokAccount(event.target.checked)} />
                <span>Je confirme avoir utilisé le compte TOK <strong className="break-words">{account?.label || "configuré pour ce réseau"}</strong> et constaté {followStatus === "requested" ? "l’envoi de la demande" : "le suivi effectif"} de ce restaurant.</span>
              </label>
              {verificationStatus !== "verified" ? <p className="mt-2 text-xs text-destructive">L’identité doit être confirmée pour enregistrer ce résultat.</p> : null}
            </div>
          ) : null}
          {!account?.configured || !accountId ? <p className="text-sm text-destructive" role="alert">Configurez le compte TOK de ce réseau dans Intégrations avant d’enregistrer un contrôle.</p> : null}

          <div className="space-y-2">
            <Label htmlFor="social-record-note">Note de contrôle (facultative)</Label>
            <Textarea id="social-record-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={500} disabled={pending} rows={3} placeholder="Ex. identité confirmée avec l’adresse de Genève…" />
          </div>
          {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? "Enregistrement…" : "Enregistrer le contrôle"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function MarketingSocialAddDialog({
  initialRestaurant,
  enabled,
  pending,
  onSave,
  onClose,
  onSaved,
}: {
  initialRestaurant: MarketingSocialRestaurant | null;
  enabled: boolean;
  pending: boolean;
  onSave: (input: SocialFollowAddInput) => Promise<MarketingSocialAddResult | undefined>;
  onClose: () => void;
  onSaved: (duplicate: boolean) => void;
}) {
  const [restaurant, setRestaurant] = useState(initialRestaurant);
  const [searchText, setSearchText] = useState("");
  const [page, setPage] = useState(1);
  const [profileUrl, setProfileUrl] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const search = useSocialFollowSearch(searchText);
  const restaurants = useQuery({
    queryKey: [...SOCIAL_FOLLOW_QUERY_KEY, "restaurant-picker", search.query, page],
    queryFn: ({ signal }) => listSocialFollowRestaurants({ query: search.query, limit: 10, offset: (page - 1) * 10 }, signal),
    enabled: enabled && !restaurant && !search.debouncing,
    gcTime: 0,
    refetchOnWindowFocus: false,
    retry: false,
  });
  const canonicalUrl = socialProfileHref(profileUrl);
  const validSource = !sourceUrl.trim() || !!socialSourceHref(sourceUrl);
  const valid = enabled && restaurant && canonicalUrl && validSource;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!valid || pending) return;
    setError(null);
    try {
      const result = await onSave({ restaurantId: restaurant.id, profileUrl: canonicalUrl, sourceUrl: sourceUrl.trim() || null, note: note.trim() });
      if (result) onSaved(result.duplicate);
    } catch (failure) {
      setError(socialFollowErrorMessage(failure));
    }
  };

  return (
    <Dialog open onOpenChange={(open) => { if (!open && !pending) onClose(); }}>
      <DialogContent className="sm:max-w-xl" hideCloseButton={pending}>
        <DialogHeader>
          <DialogTitle>Ajouter un profil trouvé</DialogTitle>
          <DialogDescription>Associez une URL Instagram ou Facebook à un restaurant de la base, y compris s’il n’a pas de site. L’identité reste à confirmer après l’ajout.</DialogDescription>
        </DialogHeader>
        <form className="space-y-5" onSubmit={(event) => void submit(event)}>
          {restaurant ? (
            <div className="flex min-w-0 flex-wrap items-center justify-between gap-3 rounded-xl border bg-muted/30 p-3">
              <div className="min-w-0">
                <p className="text-xs text-muted-foreground">Restaurant associé</p>
                <p className="break-words text-sm font-semibold">{restaurant.name} {restaurant.city ? `· ${restaurant.city}` : ""}</p>
              </div>
              <Button type="button" variant="outline" size="sm" disabled={pending} onClick={() => setRestaurant(null)}>Changer</Button>
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="social-add-restaurant-search">Rechercher un restaurant</Label>
              <Input id="social-add-restaurant-search" value={searchText} maxLength={120} disabled={pending} onChange={(event) => { setSearchText(event.target.value); setPage(1); }} placeholder="Nom ou ville" />
              {restaurants.isPending || search.debouncing ? <p role="status" className="py-3 text-sm text-muted-foreground">Chargement des restaurants…</p>
                : restaurants.error ? <Alert variant="destructive" role="alert"><AlertDescription>{socialFollowErrorMessage(restaurants.error)} <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => void restaurants.refetch()}>Réessayer la recherche</Button></AlertDescription></Alert>
                  : restaurants.data?.items.length ? (
                    <>
                      <ul className="max-h-48 overflow-y-auto rounded-lg border" aria-label="Restaurants disponibles">
                        {restaurants.data.items.map((item) => (
                          <li key={item.id} className="border-b last:border-b-0">
                            <button type="button" className="w-full px-3 py-3 text-left text-sm hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => setRestaurant(item)}>
                              <span className="block break-words font-semibold">{item.name}</span>
                              <span className="block text-xs text-muted-foreground">{item.city || "Ville non renseignée"}{!item.websiteUrl ? " · Sans site renseigné" : ""}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                      <MarketingPagination page={page} pageSize={10} total={restaurants.data.total} onPageChange={setPage} />
                    </>
                  ) : <p className="py-3 text-sm text-muted-foreground">Aucun restaurant ne correspond à cette recherche.</p>}
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="social-add-profile-url">URL du profil Instagram ou Facebook</Label>
            <Input id="social-add-profile-url" type="url" required value={profileUrl} disabled={pending} maxLength={2_048} onChange={(event) => setProfileUrl(event.target.value)} placeholder="https://www.instagram.com/restaurant/" aria-describedby="social-add-profile-help" aria-invalid={!!profileUrl && !canonicalUrl} />
            <p id="social-add-profile-help" className={profileUrl && !canonicalUrl ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>{profileUrl && !canonicalUrl ? "Utilisez le lien du compte, sans publication, story ou partage." : "L’ajout valide la forme de l’URL ; la disponibilité et l’identité du compte restent à vérifier."}</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-add-source-url">URL de la source (facultative)</Label>
            <Input id="social-add-source-url" type="url" value={sourceUrl} disabled={pending} maxLength={2_048} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://restaurant.ch/contact" aria-invalid={!validSource} aria-describedby={!validSource ? "social-add-source-error" : undefined} />
            {!validSource ? <p id="social-add-source-error" className="text-xs text-destructive">Utilisez une URL HTTP ou HTTPS complète, sans identifiant ni mot de passe.</p> : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="social-add-note">Note (facultative)</Label>
            <Textarea id="social-add-note" value={note} disabled={pending} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} placeholder="Où avez-vous trouvé ce compte ?" />
          </div>
          {error ? <Alert variant="destructive" role="alert"><AlertDescription>{error}</AlertDescription></Alert> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={pending} onClick={onClose}>Annuler</Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              {pending ? "Enregistrement…" : "Ajouter à la file"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
