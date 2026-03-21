import { useState } from "react";
import { CircleHelp, Mail, MessageSquare, Search } from "lucide-react";

import DashboardLayout from "@/components/DashboardLayout";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const FAQ = [
  { q: "Comment modifier mes horaires d'ouverture ?", a: "Rendez-vous dans « Pilotage de service » pour configurer vos horaires par jour de la semaine." },
  { q: "Comment activer la reservation en ligne ?", a: "Dans « Mon restaurant », verifiez que la reservation de table est active, puis reglez vos services dans « Pilotage de service »." },
  { q: "Comment fermer un service ponctuellement ?", a: "Dans « Pilotage de service », activez « Service ferme » sur le service concerne." },
  { q: "Comment definir ma capacite ?", a: "Ajustez la capacite maximale ainsi que les tailles de groupe pour chaque service depuis « Pilotage de service »." },
  { q: "Comment ajouter des photos du lieu ?", a: "Allez dans « Photos » pour publier des visuels de la salle, de l'ambiance ou de la facade." },
  { q: "Comment gerer mes reservations ?", a: "La section « Reservations » centralise les reservations du jour, les statuts et le detail de chaque table." },
];

export default function DashboardSupport() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const filteredFaq = search.trim()
    ? FAQ.filter((faq) => faq.q.toLowerCase().includes(search.toLowerCase()) || faq.a.toLowerCase().includes(search.toLowerCase()))
    : FAQ;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!subject.trim() || !message.trim()) {
      return toast({ title: "Validation", description: "Veuillez remplir tous les champs.", variant: "destructive" });
    }

    setSending(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    toast({ title: "Message envoye", description: "Notre equipe vous repondra sous 24h." });
    setSubject("");
    setMessage("");
    setSending(false);
  };

  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-3xl font-bold">Aide et support</h1>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CircleHelp className="h-5 w-5" />
              Questions frequentes
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="Rechercher dans la FAQ..." value={search} onChange={(event) => setSearch(event.target.value)} className="pl-9" />
            </div>
            {filteredFaq.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun resultat. Posez votre question ci-dessous.</p>
            ) : (
              <Accordion type="single" collapsible className="w-full">
                {filteredFaq.map((faq, index) => (
                  <AccordionItem key={index} value={`faq-${index}`}>
                    <AccordionTrigger className="text-left text-sm">{faq.q}</AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground">{faq.a}</AccordionContent>
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
              Contacter le support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label>Sujet</Label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="Ex: Disponibilite de reservation" />
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Decrivez votre besoin en detail..." rows={5} />
              </div>
              <Button type="submit" disabled={sending}>
                <MessageSquare className="mr-2 h-4 w-4" />
                {sending ? "Envoi..." : "Envoyer"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
