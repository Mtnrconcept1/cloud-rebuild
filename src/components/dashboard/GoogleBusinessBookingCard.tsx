import { useEffect, useState } from "react";
import { BarChart3, CheckCircle2, Clipboard, ExternalLink, HelpCircle, LifeBuoy, Loader2, Save, Store } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useRestaurantGoogleBookingSetup, useUpdateRestaurantGoogleBookingSetup } from "@/hooks/useGoogleBusinessBooking";
import {
  formatGoogleBookingDate,
  getGoogleBookingStatusLabel,
  getGoogleBookingStatusMessage,
  getGoogleBookingStatusTone,
  isHttpsUrl,
  normalizeOptionalHttpsUrl,
  PREVIOUS_BOOKING_PROVIDER_OPTIONS,
  type GoogleBookingAction,
  type PreviousBookingProvider,
} from "@/lib/googleBusinessBooking";
import { cn } from "@/lib/utils";

type GoogleBusinessBookingCardProps = {
  restaurantId: string;
};

const GUIDE_STEPS = [
  "Connectez-vous au compte Google qui gère votre fiche établissement.",
  "Recherchez votre restaurant sur Google ou ouvrez votre fiche Google Business Profile.",
  "Allez dans la section Réservation / Booking.",
  "Ajoutez un nouveau lien de réservation.",
  "Collez votre lien TOK.",
  "Enregistrez.",
  "Définissez TOK comme lien préféré si Google vous propose l'option.",
  "Supprimez ou désactivez l'ancien fournisseur si vous ne souhaitez plus l'utiliser.",
  "Revenez dans TOK et cliquez sur “J'ai configuré mon bouton Google”.",
];

const GOOGLE_BOOKING_ACTION_TOASTS: Record<GoogleBookingAction, { title: string; description: string }> = {
  save: {
    title: "Paramètres enregistrés",
    description: "Les informations Google Business sont sauvegardées.",
  },
  copy: {
    title: "Lien copié",
    description: "Ajoutez maintenant ce lien dans votre fiche Google Business.",
  },
  configured: {
    title: "Configuration confirmée",
    description: "TOK marque votre bouton Google comme configuré.",
  },
  help: {
    title: "Demande d'aide envoyée",
    description: "L'équipe TOK voit votre demande dans le suivi admin.",
  },
  problem: {
    title: "Problème signalé",
    description: "L'équipe TOK peut reprendre la configuration avec vous.",
  },
};

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Réessayez dans quelques instants.";
}

function MetricPill({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 dark:border-[#5f7aad]/25 dark:bg-[#07142b]/70">
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-black tracking-tight">{value}</p>
    </div>
  );
}

export default function GoogleBusinessBookingCard({ restaurantId }: GoogleBusinessBookingCardProps) {
  const { toast } = useToast();
  const { data: setup, isLoading } = useRestaurantGoogleBookingSetup(restaurantId);
  const updateSetup = useUpdateRestaurantGoogleBookingSetup();
  const [googleBusinessUrl, setGoogleBusinessUrl] = useState("");
  const [confirmationScreenshotUrl, setConfirmationScreenshotUrl] = useState("");
  const [previousProvider, setPreviousProvider] = useState<PreviousBookingProvider | "">("unknown");
  const [pendingAction, setPendingAction] = useState<GoogleBookingAction | null>(null);

  useEffect(() => {
    if (!setup) return;
    setGoogleBusinessUrl(setup.google_business_url || "");
    setConfirmationScreenshotUrl(setup.confirmation_screenshot_url || "");
    setPreviousProvider(setup.previous_booking_provider || "unknown");
  }, [setup]);

  const status = setup?.google_booking_status || "not_configured";
  const isConfigured = status === "configured";
  const isBusy = updateSetup.isPending || pendingAction !== null;

  function validateUrls() {
    if (!isHttpsUrl(googleBusinessUrl)) {
      toast({
        title: "URL Google invalide",
        description: "Collez une URL HTTPS de votre fiche Google Business.",
        variant: "destructive",
      });
      return false;
    }

    if (!isHttpsUrl(confirmationScreenshotUrl)) {
      toast({
        title: "URL de preuve invalide",
        description: "La preuve visuelle doit être une URL HTTPS.",
        variant: "destructive",
      });
      return false;
    }

    return true;
  }

  async function mutate(action: GoogleBookingAction) {
    if (!restaurantId || !validateUrls()) return false;
    setPendingAction(action);
    try {
      await updateSetup.mutateAsync({
        restaurantId,
        googleBusinessUrl: normalizeOptionalHttpsUrl(googleBusinessUrl),
        previousBookingProvider: previousProvider || "unknown",
        confirmationScreenshotUrl: normalizeOptionalHttpsUrl(confirmationScreenshotUrl),
        action,
      });
      toast(GOOGLE_BOOKING_ACTION_TOASTS[action]);
      return true;
    } catch (error) {
      toast({
        title: "Mise à jour impossible",
        description: getErrorMessage(error),
        variant: "destructive",
      });
      return false;
    } finally {
      setPendingAction((current) => (current === action ? null : current));
    }
  }

  async function handleCopy() {
    if (!setup?.tok_booking_url) return;

    try {
      await navigator.clipboard.writeText(setup.tok_booking_url);
    } catch (error) {
      toast({
        title: "Copie impossible",
        description: error instanceof Error ? error.message : "Copiez le lien manuellement.",
        variant: "destructive",
      });
      return;
    }

    await mutate("copy"); // action: "copy"
  }

  if (isLoading) {
    return (
      <Card className="tok-dashboard-section rounded-3xl border border-border/70">
        <CardContent className="flex min-h-[220px] items-center justify-center text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Préparation du lien Google Business...
        </CardContent>
      </Card>
    );
  }

  if (!setup) return null;

  if (isConfigured) {
    return (
      <Card className="tok-dashboard-section rounded-3xl border border-emerald-200/80 bg-emerald-50/70 dark:border-emerald-400/25 dark:bg-emerald-500/10">
        <CardContent className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-600 text-white">
              <CheckCircle2 className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-lg font-black tracking-tight text-emerald-950 dark:text-emerald-50">
                  Bouton google configuré
                </p>
                <Badge className="gap-1 rounded-full bg-white text-emerald-700 hover:bg-white dark:bg-emerald-400/15 dark:text-emerald-100">
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Vu
                </Badge>
              </div>
              <p className="mt-1 text-sm text-emerald-800 dark:text-emerald-100/80">
                Les réservations issues de Google restent suivies dans TOK.
              </p>
            </div>
          </div>
          <div className="grid min-w-[18rem] grid-cols-3 gap-2">
            <MetricPill label="Visites" value={Number(setup.link_clicks || 0)} />
            <MetricPill label="Ouverts" value={Number(setup.reservation_starts || 0)} />
            <MetricPill label="Réservations Google" value={Number(setup.reservation_completions || 0)} />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="tok-dashboard-section overflow-hidden rounded-3xl border border-orange-200/70 bg-gradient-to-br from-white via-white to-orange-50/65 dark:border-[#ff8a3d]/30 dark:from-[#07142b] dark:via-[#07142b] dark:to-[#30130b]">
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-3">
            <Badge variant="outline" className={cn("w-fit border", getGoogleBookingStatusTone(status))}>
              {getGoogleBookingStatusLabel(status)}
            </Badge>
            <CardTitle className="flex items-center gap-3 text-2xl font-black tracking-tight">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary dark:bg-[#ff6a1a]/18 dark:text-[#ffd8c3]">
                <Store className="h-6 w-6" />
              </span>
              Bouton Google Business
            </CardTitle>
            <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
              Recevez vos réservations Google directement sur TOK. Copiez votre lien de réservation TOK,
              ajoutez-le à votre fiche Google Business, puis définissez-le comme lien préféré.
            </p>
            <p className="text-sm font-semibold text-foreground">{getGoogleBookingStatusMessage(status)}</p>
          </div>
          <div className="grid min-w-[220px] grid-cols-3 gap-2">
            <MetricPill label="Visites" value={Number(setup.link_clicks || 0)} />
            <MetricPill label="Ouverts" value={Number(setup.reservation_starts || 0)} />
            <MetricPill label="Réservés" value={Number(setup.reservation_completions || 0)} />
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Lien TOK à copier</Label>
            <Input value={setup.tok_booking_url} readOnly className="font-mono text-sm" />
          </div>
          {!isConfigured ? (
            <Button onClick={handleCopy} disabled={isBusy} className="gap-2">
              {pendingAction === "copy" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Clipboard className="h-4 w-4" />}
              {pendingAction === "copy" ? "Copie..." : "Copier mon lien TOK"}
            </Button>
          ) : (
            <p className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
              La configuration est confirmée.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <div className="space-y-2">
            <Label>Ancien fournisseur</Label>
            <Select
              value={previousProvider || "unknown"}
              onValueChange={(value) => setPreviousProvider(value as PreviousBookingProvider)}
              disabled={isConfigured}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PREVIOUS_BOOKING_PROVIDER_OPTIONS.map((provider) => (
                  <SelectItem key={provider.value} value={provider.value}>
                    {provider.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <Label>URL fiche Google</Label>
            <Input
              value={googleBusinessUrl}
              onChange={(event) => setGoogleBusinessUrl(event.target.value)}
              disabled={isConfigured}
              placeholder="https://www.google.com/maps/..."
            />
          </div>
        </div>

        <div className="space-y-2">
          <Label>Preuve visuelle optionnelle</Label>
          <Input
            value={confirmationScreenshotUrl}
            onChange={(event) => setConfirmationScreenshotUrl(event.target.value)}
            disabled={isConfigured}
            placeholder="https://.../capture-google-business.png"
          />
        </div>

        {!isConfigured ? (
          <div className="flex flex-wrap gap-3">
            <Button variant="outline" onClick={() => mutate("save")} disabled={isBusy} className="gap-2">
              {pendingAction === "save" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {pendingAction === "save" ? "Enregistrement..." : "Enregistrer"}
            </Button>

            <Dialog>
              <DialogTrigger asChild>
                <Button variant="outline" className="gap-2">
                  <HelpCircle className="h-4 w-4" />
                  Voir le guide Google Business
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Comment remplacer votre bouton de réservation Google par TOK</DialogTitle>
                  <DialogDescription>
                    TOK ne modifie pas automatiquement votre fiche Google à cette étape. Vous gardez le contrôle :
                    vous ajoutez vous-même votre lien TOK ou vous demandez l'aide de notre équipe.
                  </DialogDescription>
                </DialogHeader>
                <ol className="space-y-3">
                  {GUIDE_STEPS.map((step, index) => (
                    <li key={step} className="flex gap-3 rounded-2xl border border-border/70 bg-background/70 p-3 text-sm">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-black text-primary-foreground">
                        {index + 1}
                      </span>
                      <span>{step}</span>
                    </li>
                  ))}
                </ol>
              </DialogContent>
            </Dialog>

            <Button
              variant="outline"
              onClick={() => mutate("configured")} // action: "configured"
              disabled={isBusy}
              className="gap-2 border-emerald-200 text-emerald-700 hover:bg-emerald-50"
              aria-label="J'ai configure mon bouton Google"
            >
              {pendingAction === "configured" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              {pendingAction === "configured" ? "Confirmation..." : "J'ai configuré mon bouton Google"}
            </Button>

            <Button
              variant="outline"
              onClick={() => mutate("help")} // action: "help"
              disabled={isBusy}
              className="gap-2 border-amber-200 text-amber-800 hover:bg-amber-50"
            >
              {pendingAction === "help" ? <Loader2 className="h-4 w-4 animate-spin" /> : <LifeBuoy className="h-4 w-4" />}
              {pendingAction === "help" ? "Demande..." : "Demander l'aide de TOK"}
            </Button>

            {googleBusinessUrl ? (
              <Button variant="ghost" asChild className="gap-2">
                <a href={googleBusinessUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  Ouvrir la fiche Google
                </a>
              </Button>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-xs text-muted-foreground dark:border-[#5f7aad]/25 dark:bg-[#07142b]/70">
          <BarChart3 className="h-4 w-4 text-primary" />
          Dernière copie : {formatGoogleBookingDate(setup.copied_at)}.
          Confirmation : {formatGoogleBookingDate(setup.preferred_link_confirmed_at)}.
        </div>
      </CardContent>
    </Card>
  );
}
