import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Database, ExternalLink, MapPin, Phone, ShieldCheck, Trash2 } from "lucide-react";
import { Link, Navigate, useParams } from "react-router-dom";

import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";
import { isCaptchaEnabled } from "@/lib/captcha";
import { submitContactSupport } from "@/lib/support/contactSupport";
import { getPublicRestaurantIllustration } from "@/lib/publicRestaurantIllustrations";

const supabase = getSupabase();

type PublicRestaurantListing = {
  id: string;
  name: string;
  category: string;
  activity_detail: string | null;
  address: string;
  postal_code: string | null;
  city: string;
  municipality: string | null;
  phone: string | null;
  website_url: string | null;
  latitude: number | null;
  longitude: number | null;
  slug: string;
  source: string;
  source_url: string;
  source_collected_on: string | null;
  claim_status: "unclaimed" | "claim_pending" | "claimed";
  claimed_restaurant_id: string | null;
};

function formatSourceDate(value: string | null) {
  if (!value) return null;
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("fr-CH", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export default function PublicRestaurantListingDetail() {
  const { slug = "" } = useParams<{ slug: string }>();
  const { toast } = useToast();
  const [showRemovalForm, setShowRemovalForm] = useState(false);
  const [requesterName, setRequesterName] = useState("");
  const [requesterEmail, setRequesterEmail] = useState("");
  const [removalReason, setRemovalReason] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [submittingRemoval, setSubmittingRemoval] = useState(false);
  const [removalSent, setRemovalSent] = useState(false);

  const { data: listing, isLoading, isError } = useQuery({
    queryKey: ["public-restaurant-listing", slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await (supabase.rpc as any)("get_public_restaurant_listing", {
        p_slug: slug,
      });
      if (error) throw error;
      return ((data || [])[0] || null) as PublicRestaurantListing | null;
    },
  });

  const sourceDateLabel = useMemo(
    () => formatSourceDate(listing?.source_collected_on || null),
    [listing?.source_collected_on],
  );
  const pagePath = `/restaurant-indexe/${encodeURIComponent(slug)}`;
  const title = listing
    ? `${listing.name} à ${listing.city} | TOK`
    : "Restaurant indexé | TOK";
  const description = listing
    ? `${listing.name}, établissement professionnel à ${listing.city}. Informations publiques issues du REG/SITG, avec possibilité de revendiquer ou demander la suppression de la fiche.`
    : "Fiche d'établissement professionnel indexée depuis une base de données publique.";

  useSeoMeta({
    title,
    description,
    path: pagePath,
    robots: listing ? "index,follow,max-snippet:-1" : "noindex,follow,noarchive",
  });

  if (isLoading) {
    return <main className="container py-16"><div className="h-72 animate-pulse rounded-3xl bg-muted" /></main>;
  }

  if (isError || !listing) {
    return (
      <main className="container py-16 text-center">
        <h1 className="font-display text-3xl font-bold">Fiche publique introuvable</h1>
        <p className="mt-3 text-muted-foreground">Cette fiche n'est plus publiée ou n'existe pas.</p>
        <Button asChild className="mt-6"><Link to="/recherche">Retour à la recherche</Link></Button>
      </main>
    );
  }

  if (listing.claim_status === "claimed" && listing.claimed_restaurant_id) {
    return <Navigate to={`/restaurant/${listing.claimed_restaurant_id}`} replace />;
  }

  const claimPending = listing.claim_status === "claim_pending";
  const illustration = getPublicRestaurantIllustration({ name: listing.name, activity: listing.activity_detail, category: listing.category });

  const submitRemovalRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!requesterName.trim() || !requesterEmail.trim() || !removalReason.trim()) {
      toast({ title: "Informations manquantes", description: "Indiquez votre nom, votre email et le motif de la demande.", variant: "destructive" });
      return;
    }
    if (isCaptchaEnabled() && !captchaToken) {
      toast({ title: "Validation requise", description: "Validez le contrôle anti-abus.", variant: "destructive" });
      return;
    }

    setSubmittingRemoval(true);
    try {
      await submitContactSupport({
        source: "public_contact",
        name: requesterName.trim(),
        email: requesterEmail.trim(),
        subject: "Demande de suppression d'une fiche restaurant indexée",
        message: [
          `Restaurant : ${listing.name}`,
          `Fiche TOK : ${pagePath}`,
          `Source publique affichée : ${listing.source}`,
          "",
          `Motif : ${removalReason.trim()}`,
        ].join("\n"),
        captchaToken: captchaToken || undefined,
        restaurantName: listing.name,
      });
      setRemovalSent(true);
      setShowRemovalForm(false);
      toast({ title: "Demande envoyée", description: "TOK examinera la demande et pourra vous demander un justificatif avant suppression." });
    } catch (error) {
      toast({
        title: "Envoi impossible",
        description: error instanceof Error ? error.message : "Réessayez dans quelques instants.",
        variant: "destructive",
      });
    } finally {
      setSubmittingRemoval(false);
      setCaptchaToken("");
    }
  };

  return (
    <main className="min-h-screen bg-background">
      <div className="container max-w-5xl space-y-6 py-8 md:py-12">
        <section className="overflow-hidden rounded-3xl border bg-card shadow-sm">
          <div className="relative min-h-72 overflow-hidden bg-muted">
            <img
              src={illustration.src}
              alt={`Image d’illustration ${illustration.label.toLowerCase()}`}
              className="absolute inset-0 h-full w-full object-cover"
              width={1200}
              height={750}
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/35 to-slate-950/10" />
            <div className="relative flex min-h-72 items-end p-6 text-white md:p-9">
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2">
                  <Badge className="gap-1 bg-slate-950/80 text-white"><Database className="h-3.5 w-3.5" /> Indexé depuis une base de données publique</Badge>
                  <Badge className="bg-white/90 text-slate-900">Image d’illustration · {illustration.label}</Badge>
                </div>
                <h1 className="font-display text-3xl font-bold md:text-5xl">{listing.name}</h1>
                <p className="text-white/85">{listing.category === "Bar" ? "Bar" : "Restaurant / café"} · {listing.city}</p>
                <p className="max-w-2xl text-xs text-white/75">Visuel générique de catégorie : il ne représente pas nécessairement cet établissement.</p>
              </div>
            </div>
          </div>

          <div className="grid gap-6 p-6 md:p-8 lg:grid-cols-[1fr_0.8fr]">
            <div className="space-y-5">
              <Alert>
                <ShieldCheck className="h-4 w-4" />
                <AlertTitle>Fiche publique non revendiquée</AlertTitle>
                <AlertDescription>
                  Cette fiche a été indexée à partir du Répertoire des entreprises et établissements du canton de Genève (REG/SITG), une base de données publique. TOK n'affiche ici que des informations professionnelles publiques. Le visuel de catégorie est une illustration générique créée pour TOK et ne constitue pas une photo de cet établissement.
                  {sourceDateLabel ? ` Données de référence actualisées le ${sourceDateLabel}.` : ""}
                </AlertDescription>
              </Alert>

              <div className="space-y-3 rounded-2xl border p-5">
                <h2 className="font-semibold">Informations publiques</h2>
                <p className="flex items-start gap-2 text-sm"><MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>{listing.address}{listing.postal_code ? `, ${listing.postal_code}` : ""} {listing.city}</span></p>
                {listing.activity_detail ? <p className="text-sm text-muted-foreground">Activité déclarée : {listing.activity_detail}</p> : null}
                {listing.phone ? <a className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline" href={`tel:${listing.phone}`} aria-label={`Appeler ${listing.name} au ${listing.phone}`}><Phone className="h-4 w-4" /><span><span className="sr-only">Téléphone professionnel public : </span>{listing.phone}</span></a> : null}
                {listing.website_url ? <a className="inline-flex items-center gap-2 text-sm text-primary hover:underline" href={listing.website_url} target="_blank" rel="noreferrer">Site internet public <ExternalLink className="h-3.5 w-3.5" /></a> : null}
                <a className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-primary" href={listing.source_url} target="_blank" rel="noreferrer">Consulter la source REG/SITG <ExternalLink className="h-3.5 w-3.5" /></a>
              </div>
            </div>

            <aside className="space-y-4 rounded-2xl border bg-muted/30 p-5">
              <h2 className="font-semibold">Vous représentez cet établissement ?</h2>
              <p className="text-sm text-muted-foreground">Revendiquer la fiche lance l'inscription restaurateur TOK avec le nom et l'adresse déjà préremplis. Les fonctions de réservation, commande et paiement restent désactivées jusqu'à validation du dossier.</p>
              {claimPending ? (
                <Button className="w-full" disabled>Revendication en cours de vérification</Button>
              ) : (
                <Button asChild className="w-full"><Link to={`/auth?type=restaurateur&claimRestaurant=${encodeURIComponent(listing.slug)}`}>Revendiquer mon restaurant</Link></Button>
              )}
              <Button type="button" variant="outline" className="w-full gap-2" onClick={() => setShowRemovalForm((value) => !value)}>
                <Trash2 className="h-4 w-4" /> Demander la suppression du restaurant
              </Button>
              {removalSent ? <p className="text-sm text-emerald-700">Votre demande de suppression a été transmise à TOK.</p> : null}
            </aside>
          </div>
        </section>

        {showRemovalForm ? (
          <section className="rounded-3xl border bg-card p-6 md:p-8">
            <h2 className="font-display text-2xl font-bold">Demande de suppression</h2>
            <p className="mt-2 text-sm text-muted-foreground">Cette demande n'est pas automatique : TOK vérifie qu'elle est légitime afin d'éviter les suppressions abusives.</p>
            <form className="mt-6 grid gap-4" onSubmit={submitRemovalRequest}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2"><Label htmlFor="removal-name">Nom</Label><Input id="removal-name" value={requesterName} onChange={(event) => setRequesterName(event.target.value)} autoComplete="name" /></div>
                <div className="space-y-2"><Label htmlFor="removal-email">Email de contact</Label><Input id="removal-email" type="email" value={requesterEmail} onChange={(event) => setRequesterEmail(event.target.value)} autoComplete="email" /></div>
              </div>
              <div className="space-y-2"><Label htmlFor="removal-reason">Motif de la demande</Label><Textarea id="removal-reason" value={removalReason} onChange={(event) => setRemovalReason(event.target.value)} rows={5} placeholder="Expliquez votre lien avec l'établissement et pourquoi la fiche doit être supprimée." /></div>
              {isCaptchaEnabled() ? <TurnstileCaptcha action="public_contact" onTokenChange={setCaptchaToken} /> : null}
              <div className="flex flex-wrap gap-3"><Button type="submit" disabled={submittingRemoval}>{submittingRemoval ? "Envoi…" : "Envoyer la demande"}</Button><Button type="button" variant="ghost" onClick={() => setShowRemovalForm(false)}>Annuler</Button></div>
            </form>
          </section>
        ) : null}
      </div>
    </main>
  );
}
