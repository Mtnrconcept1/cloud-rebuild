import { Bike, CheckCircle2, Coins, MapPin, ShieldCheck, UserRound } from "lucide-react";

import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function CommercialDemoCourierSecondary({ view }: { view: "earnings" | "profile" }) {
  const frame = useCommercialDemoFrame();
  if (!frame || frame.surface !== "courier") return null;

  const delivered = frame.snapshot.mission?.status === "delivered";

  if (view === "earnings") {
    return (
      <div className="space-y-6" data-testid="commercial-demo-courier-earnings">
        <div>
          <p className="text-sm font-semibold text-emerald-600">Espace livreur · démonstration</p>
          <h1 className="mt-1 font-display text-3xl font-bold">Mes gains</h1>
          <p className="mt-2 text-sm text-muted-foreground">Montants simulés, sans écriture comptable ni paiement réel.</p>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Card><CardHeader className="pb-2"><CardDescription>Aujourd'hui</CardDescription><CardTitle>{delivered ? "8.50 CHF" : "0.00 CHF"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Cette semaine</CardDescription><CardTitle>{delivered ? "42.50 CHF" : "34.00 CHF"}</CardTitle></CardHeader></Card>
          <Card><CardHeader className="pb-2"><CardDescription>Missions terminées</CardDescription><CardTitle>{delivered ? "5" : "4"}</CardTitle></CardHeader></Card>
        </div>
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Coins className="h-5 w-5 text-emerald-600" />Historique simulé</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {delivered ? <div className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-semibold">Restaurant Démo TOK</p><p className="text-xs text-muted-foreground">Mission de la session en cours</p></div><Badge>+8.50 CHF</Badge></div> : null}
            <div className="flex items-center justify-between rounded-xl border p-4"><div><p className="font-semibold">Livraison de démonstration</p><p className="text-xs text-muted-foreground">Hier · Genève</p></div><span className="font-semibold">+8.50 CHF</span></div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="commercial-demo-courier-profile">
      <div>
        <p className="text-sm font-semibold text-emerald-600">Espace livreur · démonstration</p>
        <h1 className="mt-1 font-display text-3xl font-bold">Profil livreur</h1>
        <p className="mt-2 text-sm text-muted-foreground">Identité fictive réservée à la présentation commerciale.</p>
      </div>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="flex items-center gap-3"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-100 text-emerald-700"><UserRound className="h-6 w-6" /></span><div><CardTitle>Alex · Livreur démo</CardTitle><CardDescription>Compte approuvé · environnement isolé</CardDescription></div></div>
            <Badge className="bg-emerald-600"><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approuvé</Badge>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><Bike className="h-4 w-4" />Véhicule</p><p className="mt-2 font-semibold">Vélo électrique</p></div>
          <div className="rounded-xl border p-4"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><MapPin className="h-4 w-4" />Zone</p><p className="mt-2 font-semibold">Genève centre</p></div>
          <div className="rounded-xl border p-4 sm:col-span-2"><p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground"><ShieldCheck className="h-4 w-4" />Sécurité</p><p className="mt-2 text-sm">Aucune donnée personnelle réelle, aucun document et aucun compte bancaire ne sont attachés à cette identité.</p></div>
        </CardContent>
      </Card>
    </div>
  );
}
