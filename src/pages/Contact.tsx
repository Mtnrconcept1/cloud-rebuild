import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, MapPin, Phone, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth";
import { createSupportTicket } from "@/lib/support";

export default function Contact() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (!user) {
      toast({
        title: "Connexion requise",
        description: "Connectez-vous pour ouvrir un ticket support suivi.",
        variant: "destructive",
      });
      navigate("/auth");
      return;
    }

    if (!subject.trim() || !message.trim()) {
      toast({ title: "Validation", description: "Sujet et message requis.", variant: "destructive" });
      return;
    }

    setSending(true);
    try {
      await createSupportTicket({
        subject: subject.trim(),
        description: [
          name.trim() ? `Nom: ${name.trim()}` : null,
          email.trim() ? `Email de contact: ${email.trim()}` : null,
          "",
          message.trim(),
        ].filter(Boolean).join("\n"),
        category: "contact",
        priority: "medium",
        source: "contact_page",
      });
      setName("");
      setEmail("");
      setSubject("");
      setMessage("");
      toast({ title: "Ticket créé", description: "Votre demande a bien été enregistrée." });
    } catch (error) {
      toast({
        title: "Erreur",
        description: error instanceof Error ? error.message : "Impossible d'envoyer votre demande.",
        variant: "destructive",
      });
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="container space-y-12 py-12 md:py-20">
      <div className="space-y-4 text-center">
        <h1 className="font-display text-4xl font-bold md:text-5xl">Contactez-nous</h1>
        <p className="mx-auto max-w-2xl text-lg text-muted-foreground">
          Une question ? Les demandes sont maintenant suivies comme de vrais tickets support.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle>Envoyez-nous un message</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Nom</label>
                  <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Votre nom" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Email</label>
                  <Input value={email} onChange={(event) => setEmail(event.target.value)} type="email" placeholder="votre@email.com" />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Sujet</label>
                <Input value={subject} onChange={(event) => setSubject(event.target.value)} placeholder="De quoi souhaitez-vous parler ?" required />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Message</label>
                <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Votre message..." className="min-h-[150px]" required />
              </div>
              <Button type="submit" className="w-full gap-2" disabled={sending}>
                <Send className="h-4 w-4" />
                {sending ? "Création..." : "Créer le ticket"}
              </Button>
              {!user ? (
                <p className="text-xs text-muted-foreground">
                  Une connexion est requise pour suivre la conversation support dans l'application.
                </p>
              ) : null}
            </form>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <h2 className="text-2xl font-semibold">Nos coordonnées</h2>
          <div className="space-y-4">
            {[
              { icon: Mail, label: "Email", value: "support@tok.ch" },
              { icon: Phone, label: "Téléphone", value: "+33 (0)1 23 45 67 89" },
              { icon: MapPin, label: "Adresse", value: "123 Rue de la Gastronomie, 75001 Paris" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                  <item.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="font-medium">{item.label}</p>
                  <p className="text-muted-foreground">{item.value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
