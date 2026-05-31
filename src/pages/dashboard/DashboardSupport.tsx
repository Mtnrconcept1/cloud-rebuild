import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { AlertTriangle, CircleHelp, Mail, MessageSquare, Search, ShieldQuestion } from "lucide-react";
import { getSupabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { useDashboardRestaurant } from "./useDashboardRestaurant";

const supabase = getSupabase();

const FAQ = [
  { q: "Comment modifier mes horaires d'ouverture ?", a: "Rendez-vous dans « Pilotage de service » pour configurer vos horaires par jour de la semaine." },
  { q: "Comment créer une vente flash ?", a: "Dans le menu « Ventes flash », cliquez sur « Créer une vente » et remplissez le formulaire avec le prix, la date et les quantités." },
  { q: "Comment gérer mes avis clients ?", a: "Consultez la section « Avis clients » pour voir et répondre aux retours de vos clients." },
  { q: "Comment ajouter des photos de mes plats ?", a: "Allez dans « Photos » pour ajouter des images à vos plats. Vous pouvez aussi les modifier depuis « Menu »." },
  { q: "Comment voir mes factures ?", a: "La section « Factures » liste toutes vos factures avec leur statut de paiement." },
  { q: "Comment activer la livraison ?", a: "Dans « Mon restaurant », activez l'option livraison et configurez les frais et le montant minimum de commande." },
  { q: "Qu'est-ce que l'anti-gaspi ?", a: "Les offres anti-gaspi permettent de vendre vos invendus à prix réduit avant la fermeture. Créez-les dans « Anti-gaspi »." },
  { q: "Comment transformer une actualite en action marketing ?", a: "Dans « Actualites », selectionnez un objectif, une audience, un CTA et un modele. Le score marketing vous aide a ajouter media, accroche, programmation et bouton d'action avant publication." },
  { q: "Comment lire les performances Actualites ?", a: "Le cockpit suit impressions, clics, clics CTA, engagement, sauvegardes, posts programmes et objectifs de campagne pour identifier ce qui amene visibilite, commandes ou reservations." },
  { q: "Comment lancer une campagne marketing ?", a: "Rendez-vous dans « Campagnes » pour créer des campagnes publicitaires ciblées avec un budget quotidien." },
];

type SupportIncident = {
  id: string;
  category: string;
  priority: "low" | "normal" | "high" | "urgent";
  status: "open" | "waiting_customer" | "waiting_restaurant" | "waiting_admin" | "resolved" | "closed";
  subject: string;
  description: string | null;
  order_id: string | null;
  reservation_id: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  last_message_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleString("fr-CH", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getStatusLabel(status: SupportIncident["status"]) {
  const labels: Record<SupportIncident["status"], string> = {
    open: "Ouvert",
    waiting_customer: "Client attendu",
    waiting_restaurant: "Restaurant attendu",
    waiting_admin: "Admin attendu",
    resolved: "Résolu",
    closed: "Clôturé",
  };
  return labels[status] || status;
}

function getCategoryLabel(category: string) {
  const labels: Record<string, string> = {
    general: "Général",
    order_missing: "Commande absente",
    order_late: "Commande en retard",
    wrong_item: "Mauvais produit",
    missing_item: "Produit manquant",
    quality_issue: "Qualité",
    refund_request: "Remboursement",
    payment_issue: "Paiement",
    reservation_issue: "Réservation",
    zero_attente_issue: "Zero Attente",
    delivery_issue: "Livraison",
    restaurant_issue: "Restaurant",
    technical_issue: "Technique",
  };
  return labels[category] || category.replace(/_/g, " ");
}

export default function DashboardSupport() {
  const { toast } = useToast();
  const { user } = useAuth();
  const { selectedId, restaurants } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((r) => r.id === selectedId);
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data: incidents = [], isLoading: incidentsLoading, error: incidentsError } = useQuery({
    queryKey: ["restaurant-support-incidents", selectedId],
    queryFn: async () => {
      const { data, error } = await (supabase.from("support_incidents" as any) as any)
        .select("id,category,priority,status,subject,description,order_id,reservation_id,user_id,created_at,updated_at,last_message_at")
        .eq("restaurant_id", selectedId)
        .order("updated_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      return (data || []) as SupportIncident[];
    },
    enabled: !!selectedId,
  });

  const filteredFaq = search.trim()
    ? FAQ.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ;

  const incidentStats = useMemo(() => ({
    total: incidents.length,
    open: incidents.filter((incident) => !["resolved", "closed"].includes(incident.status)).length,
    urgent: incidents.filter((incident) => incident.priority === "urgent" || incident.priority === "high").length,
  }), [incidents]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      return toast({ title: "Validation", description: "Veuillez remplir tous les champs.", variant: "destructive" });
    }
    setSending(true);

    const restaurantLabel = selectedRestaurant?.name || selectedId || "N/A";
    const userEmail = user?.email || "inconnu";

    const { error } = await supabase.from("email_queue" as any).insert({
      to_email: "support@tok.ch",
      subject: `[Support] ${subject}`,
      body_text: `De: ${userEmail}\nRestaurant: ${restaurantLabel}\n\n${message}`,
      body_html: `<p><strong>De:</strong> ${userEmail}</p><p><strong>Restaurant:</strong> ${restaurantLabel}</p><hr/><p>${message.replace(/\n/g, "<br/>")}</p>`,
      status: "queued",
    });

    setSending(false);

    if (error) {
      toast({ title: "Erreur", description: "Impossible d'envoyer le message. Réessayez plus tard.", variant: "destructive" });
      return;
    }

    toast({ title: "Message envoyé", description: "Notre équipe vous répondra sous 24h." });
    setSubject("");
    setMessage("");
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <DashboardPageHero
          badge="Support restaurateur"
          title="Aide et support"
          description="Retrouvez les reponses rapides, suivez les incidents clients et contactez l'equipe support avec le contexte du restaurant selectionne."
          icon={CircleHelp}
          tone="sky"
          visualLabel="Support"
          stats={[
            { label: "FAQ", value: filteredFaq.length, icon: Search },
            { label: "Restaurant", value: selectedRestaurant?.name || "Aucun", icon: CircleHelp },
            { label: "Incidents ouverts", value: incidentStats.open, icon: ShieldQuestion },
            { label: "Urgents", value: incidentStats.urgent, icon: AlertTriangle },
          ]}
        />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><ShieldQuestion className="h-5 w-5" />Incidents clients</CardTitle>
          </CardHeader>
          <CardContent>
            {incidentsError ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                Impossible de charger les incidents du restaurant.
              </div>
            ) : incidentsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((value) => <div key={value} className="h-14 rounded-lg bg-muted animate-pulse" />)}
              </div>
            ) : incidents.length === 0 ? (
              <div className="rounded-lg border bg-muted/30 p-4 text-sm text-muted-foreground">
                Aucun incident client ouvert pour ce restaurant.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Statut</TableHead>
                    <TableHead>Priorité</TableHead>
                    <TableHead>Catégorie</TableHead>
                    <TableHead>Sujet</TableHead>
                    <TableHead>Cible</TableHead>
                    <TableHead>Dernière activité</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {incidents.map((incident) => (
                    <TableRow key={incident.id}>
                      <TableCell>
                        <Badge variant={["resolved", "closed"].includes(incident.status) ? "outline" : "secondary"}>
                          {getStatusLabel(incident.status)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant={incident.priority === "urgent" || incident.priority === "high" ? "destructive" : "outline"}>
                          {incident.priority}
                        </Badge>
                      </TableCell>
                      <TableCell>{getCategoryLabel(incident.category)}</TableCell>
                      <TableCell className="max-w-[24rem]">
                        <div className="font-medium">{incident.subject}</div>
                        {incident.description ? <div className="line-clamp-1 text-xs text-muted-foreground">{incident.description}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {incident.order_id ? <div>Commande {incident.order_id}</div> : null}
                        {incident.reservation_id ? <div>Réservation {incident.reservation_id}</div> : null}
                        {!incident.order_id && !incident.reservation_id ? <div>Restaurant</div> : null}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateTime(incident.last_message_at || incident.updated_at || incident.created_at)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CircleHelp className="h-5 w-5" />Questions fréquentes</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher dans la FAQ..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9"
              />
            </div>
            {filteredFaq.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun résultat. Posez votre question ci-dessous.</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {filteredFaq.map((f, i) => (
                  <AccordionItem key={i} value={`faq-${i}`}>
                    <AccordionTrigger className="text-sm text-left">{f.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{f.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5" />Contacter le support</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Sujet</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Ex: Problème de facturation" />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Décrivez votre problème en détail..." rows={5} />
              </div>
              <Button type="submit" disabled={sending}>
                <MessageSquare className="h-4 w-4 mr-2" />
                {sending ? "Envoi..." : "Envoyer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
