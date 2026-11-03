import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import QRCode from "qrcode";
import {
  CheckCircle2, Clock3, Copy, Gift, Mail, MessageCircle,
  ShieldCheck, Share2, Store, Wallet,
} from "lucide-react";
import { toast } from "sonner";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { getSupabase } from "@/integrations/supabase/client";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

type ReferralRow = {
  id: string;
  restaurant_name: string;
  status: "pending" | "qualifying" | "processing" | "credited" | "rejected" | "review_required";
  created_at: string;
  eligible_at: string | null;
  credit_cents: number | null;
  credited_at: string | null;
};
type ReferralDashboard = {
  code: string;
  stats: {
    total: number;
    credited: number;
    in_progress: number;
    saved_cents: number;
  };
  referrals: ReferralRow[];
};

const STATUS_LABELS: Record<ReferralRow["status"], string> = {
  pending: "Inscription reçue",
  qualifying: "Vérification des 30 jours",
  processing: "Crédit en traitement",
  credited: "Mois offert",
  rejected: "Non admissible",
  review_required: "Vérification TOK",
};

const formatMoney = (cents: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(cents / 100);

const formatDate = (date: string | null) =>
  date ? new Date(date).toLocaleDateString("fr-CH", { day: "2-digit", month: "short", year: "numeric" }) : "—";

async function fetchReferralDashboard(restaurantId: string): Promise<ReferralDashboard> {
  // This RPC verifies ownership in Postgres and never exposes a public ledger.
  const api = getSupabase() as unknown as {
    rpc: (
      name: "get_restaurant_referral_dashboard",
      params: { p_restaurant_id: string },
    ) => PromiseLike<{ data: ReferralDashboard | null; error: { message: string } | null }>;
  };
  const { data, error } = await api.rpc("get_restaurant_referral_dashboard", {
    p_restaurant_id: restaurantId,
  });
  if (error) throw new Error(error.message);
  if (!data?.code) throw new Error("Aucun code de parrainage disponible.");
  return data;
}

export default function DashboardParrainage() {
  const { restaurants, selectedId, isDemoMode } = useDashboardRestaurant();
  const commercialDemo = useCommercialDemoFrame();
  const disabled = isDemoMode || commercialDemo?.surface === "restaurant";
  const restaurant = restaurants.find((item) => item.id === selectedId);
  const [qrSrc, setQrSrc] = useState("");
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["restaurant-referrals", selectedId],
    queryFn: () => fetchReferralDashboard(selectedId!),
    enabled: Boolean(selectedId) && !disabled,
    staleTime: 60_000,
    retry: 1,
  });

  const link = useMemo(
    () => data?.code
      ? "https://www.thetok.ch/auth?type=restaurateur&parrain=" + encodeURIComponent(data.code)
      : "",
    [data?.code],
  );

  useEffect(() => {
    let active = true;
    if (!link) {
      setQrSrc("");
      return;
    }
    QRCode.toDataURL(link, { width: 200, margin: 2 })
      .then((src) => { if (active) setQrSrc(src); })
      .catch(() => { if (active) setQrSrc(""); });
    return () => { active = false; };
  }, [link]);

  const shareMessage = "Je vous invite à rejoindre TOK ! Inscrivez votre restaurant sur " + link;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success("Lien de parrainage copié");
    } catch {
      toast.error("La copie automatique est indisponible. Sélectionnez le lien pour le copier.");
    }
  };

  const handleShare = async () => {
    if (!navigator.share) return handleCopy();
    try {
      await navigator.share({ title: "Invitation restaurant TOK", text: shareMessage, url: link });
    } catch {
      // User cancellation is not a failure.
    }
  };

  return (
    <DashboardLayout mainClassName="tok-restaurant-page">
      <div className="space-y-6">
        <DashboardPageHero
          badge="Programme Ambassadeurs TOK"
          title="Parrainez un restaurant, gagnez un mois"
          description="Pour chaque nouveau restaurant inscrit grâce à vous et abonné pendant 30 jours, TOK vous offre l'équivalent d'un mois de votre formule."
          icon={Gift}
          stats={[
            { label: "Restaurants parrainés", value: data?.stats.total ?? "—", icon: Store },
            { label: "Mois offerts", value: data?.stats.credited ?? "—", icon: Gift },
            { label: "Économies créditées", value: data ? formatMoney(data.stats.saved_cents) : "—", icon: Wallet },
          ]}
        />

        {disabled ? (
          <Card><CardContent className="py-8 text-sm text-muted-foreground">
            Le parrainage n'est pas disponible en mode démonstration. Connectez-vous à votre vrai établissement.
          </CardContent></Card>
        ) : !selectedId ? (
          <Card><CardContent className="py-8">Sélectionnez un restaurant dans le dashboard.</CardContent></Card>
        ) : (
          <>
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Share2 className="h-5 w-5 text-primary" /> Votre invitation personnelle</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {isLoading ? <p role="status" className="text-sm text-muted-foreground">Chargement de votre code…</p> : null}
                {error ? (
                  <div role="alert" className="rounded-lg border border-destructive/30 p-4 text-sm">
                    Impossible de charger vos parrainages. Vérifiez votre connexion et réessayez.
                    <Button className="ml-3" variant="outline" size="sm" onClick={() => void refetch()}>Réessayer</Button>
                  </div>
                ) : null}
                {link ? (
                  <>
                    {restaurant?.status !== "active" || !restaurant?.is_active ? (
                      <p className="text-sm text-amber-700">
                        Votre établissement doit être activé pour que votre code soit utilisable par un filleul.
                      </p>
                    ) : null}
                    <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
                      <div className="min-w-0 flex-1 space-y-3">
                        <label htmlFor="restaurant-referral-link" className="text-sm font-semibold">
                          Lien de parrainage
                        </label>
                        <Input
                          id="restaurant-referral-link"
                          value={link}
                          readOnly
                          onFocus={(event) => event.currentTarget.select()}
                          aria-label="Votre lien de parrainage TOK"
                        />
                        <div className="flex flex-wrap gap-2">
                          <Button onClick={() => void handleCopy()}><Copy className="mr-2 h-4 w-4" /> Copier</Button>
                          <Button variant="outline" onClick={() => void handleShare()}><Share2 className="mr-2 h-4 w-4" /> Partager</Button>
                          <Button variant="outline" onClick={() => window.open(
                            "https://wa.me/?text=" + encodeURIComponent(shareMessage),
                            "_blank", "noopener,noreferrer",
                          )}><MessageCircle className="mr-2 h-4 w-4" /> WhatsApp</Button>
                          <Button variant="outline" onClick={() => {
                            window.location.href = "mailto:?subject=" + encodeURIComponent("Invitation TOK")
                              + "&body=" + encodeURIComponent(shareMessage);
                          }}><Mail className="mr-2 h-4 w-4" /> Email</Button>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          Code : <span className="font-mono font-semibold">{data?.code}</span>. Le lien ouvre
                          directement l'inscription restaurateur.
                        </p>
                      </div>
                      {qrSrc ? (
                        <div className="flex shrink-0 flex-col items-center gap-2 rounded-xl border bg-white p-3">
                          <img src={qrSrc} alt="QR code de votre lien de parrainage TOK" width={180} height={180} loading="lazy" />
                          <span className="text-xs text-neutral-700">Scannez pour vous inscrire</span>
                        </div>
                      ) : null}
                    </div>
                  </>
                ) : null}
              </CardContent>
            </Card>

            <Card>
              <CardHeader><CardTitle className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /> Suivi de mes filleuls</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {data && data.referrals.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Aucun filleul pour le moment. Partagez votre code pour commencer.</p>
                ) : data?.referrals.map((referral) => (
                  <div key={referral.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4">
                    <div className="min-w-0">
                      <p className="font-semibold">{referral.restaurant_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Inscrit le {formatDate(referral.created_at)}
                        {referral.eligible_at && referral.status === "qualifying" ? " · Vérifiable dès le " + formatDate(referral.eligible_at) : ""}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {referral.status === "credited" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : null}
                      <Badge variant={referral.status === "rejected" ? "destructive" : "secondary"}>
                        {STATUS_LABELS[referral.status] || referral.status}
                      </Badge>
                      {referral.status === "credited" && referral.credit_cents ? (
                        <span className="font-semibold">{formatMoney(referral.credit_cents)}</span>
                      ) : null}
                    </div>
                  </div>
                ))}
                {data && data.stats.total > data.referrals.length ? (
                  <p className="text-xs text-muted-foreground">Les 100 derniers parrainages sont affichés.</p>
                ) : null}
              </CardContent>
            </Card>
          </>
        )}

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Comment obtenir votre mois offert ?</CardTitle></CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>1. Partagez votre lien avec un restaurant qui n'a pas encore d'abonnement TOK.</p>
            <p>2. Le restaurant s'inscrit, est vérifié, active son établissement et paie son abonnement.</p>
            <p>3. Après 30 jours, si l'abonnement et le paiement sont toujours valides, un avoir égal à un mois de votre formule est attribué à votre compte Stripe TOK.</p>
            <p>4. L'avoir est déduit automatiquement des prochaines factures d'abonnement. Sur une formule annuelle, il peut être utilisé à la prochaine échéance.</p>
            <p>Les parrainages sont cumulables et sans limite annoncée. Les auto-parrainages, établissements liés, remboursements et comptes de démonstration sont exclus. Aucun versement en espèces.</p>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
