import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleHelp, Mail, MessageSquare, Search } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { createSupportTicket, type SupportTicketRow } from "@/lib/support";

import { useDashboardRestaurant } from "./DashboardContext";

const FAQ = [
  { q: "Comment modifier mes horaires d'ouverture ?", a: "Rendez-vous dans « Pilotage de service » pour configurer vos horaires par jour de la semaine." },
  { q: "Comment créer une vente flash ?", a: "Dans le menu « Ventes flash », cliquez sur « Créer une vente » puis renseignez le prix, la date et les quantités." },
  { q: "Comment gérer mes avis clients ?", a: "La section « Avis clients » permet maintenant de consulter les avis vérifiés et d'y répondre officiellement." },
  { q: "Comment ajouter des photos de mes plats ?", a: "Allez dans « Photos » pour ajouter des images à vos plats. Vous pouvez aussi les modifier depuis « Menu »." },
  { q: "Comment voir mes factures ?", a: "La section « Factures » liste toutes vos factures avec leur statut de paiement." },
  { q: "Comment activer la livraison ?", a: "Dans « Mon restaurant », activez l'option livraison et configurez les frais et le montant minimum de commande." },
  { q: "Comment lancer une campagne marketing ?", a: "Rendez-vous dans « Campagnes » pour créer des campagnes publicitaires ciblées avec un budget quotidien." },
];

export default function DashboardSupport() {
  const { toast } = useToast();
  const { selectedId, restaurants } = useDashboardRestaurant();
  const selectedRestaurant = restaurants.find((restaurant) => restaurant.id === selectedId) || null;
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const { data: tickets = [], refetch } = useQuery({
    queryKey: ["dashboard-support-tickets", selectedId],
    queryFn: async () => {
      const query = supabase
        .from("support_tickets")
        .select("id, subject, category, priority, status, description, created_at, updated_at, restaurant_id")
        .order("created_at", { ascending: false });

      const { data, error } = selectedId
        ? await query.eq("restaurant_id", selectedId)
        : await query;

      if (error) throw error;
      return (data || []) as SupportTicketRow[];
    },
  });

  const filteredFaq = search.trim()
    ? FAQ.filter((item) => item.q.toLowerCase().includes(search.toLowerCase()) || item.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      toast({ title: "Validation", description: "Veuillez remplir tous les champs.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await createSupportTicket({
        subject: subject.trim(),
        description: message.trim(),
        category: "restaurant_support",
        priority: "medium",
        restaurantId: selectedRestaurant?.id || null,
        source: "dashboard",
      });
      setSubject("");
      setMessage("");
      await refetch();
      toast({ title: "Ticket créé", description: "Votre demande support est maintenant suivie dans la plateforme." });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'envoyer le message.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="max-w-4xl space-y-6">
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-bold">Aide et support</h1>
          <p className="text-sm text-muted-foreground">
            Les demandes sont maintenant créées comme de vrais tickets support, plus comme des emails isolés.
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5" />
              Questions fréquentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher dans la FAQ..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            {filteredFaq.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun résultat. Ouvrez un ticket support ci-dessous.</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {filteredFaq.map((item, index) => (
                  <AccordionItem key={item.q} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left text-sm">{item.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{item.a}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5" />
              Ouvrir un ticket
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {selectedRestaurant ? (
                <div className="rounded-lg border bg-secondary/20 px-3 py-2 text-sm">
                  Ticket rattaché à <span className="font-semibold">{selectedRestaurant.name}</span>
                </div>
              ) : null}
              <div>
                <Label>Sujet</Label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex: problème de facturation" />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Décrivez le problème en détail..." rows={5} />
              </div>
              <Button type="submit" disabled={sending}>
                <MessageSquare className="mr-2 h-4 w-4" />
                {sending ? "Création..." : "Créer le ticket"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Tickets récents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {tickets.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun ticket pour le moment.</p>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.id} className="rounded-xl border p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">{new Date(ticket.created_at).toLocaleString("fr-FR")}</p>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline">{ticket.status}</Badge>
                      <Badge variant="secondary">{ticket.priority}</Badge>
                    </div>
                  </div>
                  {ticket.description ? <p className="mt-3 text-sm text-muted-foreground">{ticket.description}</p> : null}
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
