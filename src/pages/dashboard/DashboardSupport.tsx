import { useState } from "react";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { useToast } from "@/hooks/use-toast";
import { CircleHelp, Mail, MessageSquare, Search } from "lucide-react";

const FAQ = [
  { q: "Comment modifier mes horaires d'ouverture ?", a: "Rendez-vous dans « Pilotage de service » pour configurer vos horaires par jour de la semaine." },
  { q: "Comment créer une vente flash ?", a: "Dans le menu « Ventes flash », cliquez sur « Créer une vente » et remplissez le formulaire avec le prix, la date et les quantités." },
  { q: "Comment gérer mes avis clients ?", a: "Consultez la section « Avis clients » pour voir et répondre aux retours de vos clients." },
  { q: "Comment ajouter des photos de mes plats ?", a: "Allez dans « Photos » pour ajouter des images à vos plats. Vous pouvez aussi les modifier depuis « Menu »." },
  { q: "Comment voir mes factures ?", a: "La section « Factures » liste toutes vos factures avec leur statut de paiement." },
  { q: "Comment activer la livraison ?", a: "Dans « Mon restaurant », activez l'option livraison et configurez les frais et le montant minimum de commande." },
  { q: "Qu'est-ce que l'anti-gaspi ?", a: "Les offres anti-gaspi permettent de vendre vos invendus à prix réduit avant la fermeture. Créez-les dans « Anti-gaspi »." },
  { q: "Comment lancer une campagne marketing ?", a: "Rendez-vous dans « Campagnes » pour créer des campagnes publicitaires ciblées avec un budget quotidien." },
];

export default function DashboardSupport() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const filteredFaq = search.trim()
    ? FAQ.filter((f) => f.q.toLowerCase().includes(search.toLowerCase()) || f.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim() || !message.trim()) {
      return toast({ title: "Validation", description: "Veuillez remplir tous les champs.", variant: "destructive" });
    }
    setSending(true);
    // Simulate sending — in production this would call an edge function
    await new Promise((r) => setTimeout(r, 800));
    toast({ title: "Message envoyé", description: "Notre équipe vous répondra sous 24h." });
    setSubject("");
    setMessage("");
    setSending(false);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 max-w-3xl">
        <h1 className="font-display text-3xl font-bold">Aide et support</h1>

        <Card>
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

        <Card>
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
