import { useState } from "react";
import { Mail, MapPin, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import TurnstileCaptcha from "@/components/security/TurnstileCaptcha";
import { isCaptchaEnabled } from "@/lib/captcha";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { submitContactSupport } from "@/lib/support/contactSupport";
import { useToast } from "@/hooks/use-toast";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";

export default function Contact() {
  const commercialDemoFrame = useCommercialDemoFrame();
  const isCommercialDemoClient = commercialDemoFrame?.surface === "client";
  const { toast } = useToast();
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [sending, setSending] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    setFeedback(null);
    if (isCommercialDemoClient) {
      setFeedback({ error: false, text: "Message simulé. Aucun ticket de production n’a été créé." });
      form.reset();
      setCaptchaToken(null);
      toast({
        title: "Message simulé",
        description: "Le parcours support a été présenté sans créer de ticket en production.",
      });
      return;
    }
    if (isCaptchaEnabled() && !captchaToken) {
      setFeedback({ error: true, text: "Validez le contrôle anti-abus avant d’envoyer votre message." });
      toast({ title: "Validation requise", description: "Validez le contrôle anti-abus avant d'envoyer.", variant: "destructive" });
      return;
    }

    const formData = new FormData(form);
    const name = String(formData.get("name") || "");
    const email = String(formData.get("email") || "");
    const subject = String(formData.get("subject") || "");
    const message = String(formData.get("message") || "");

    setSending(true);
    try {
      await submitContactSupport({
        source: "public_contact",
        name,
        email,
        subject,
        message,
        captchaToken,
      });
      form.reset();
      setCaptchaToken(null);
      setFeedback({ error: false, text: "Votre message a été envoyé. Notre équipe vous répondra par email." });
      toast({ title: "Message envoyé", description: "Notre équipe vous répondra rapidement." });
    } catch (error) {
      setFeedback({ error: true, text: error instanceof Error ? error.message : "Impossible d’envoyer le message. Votre saisie est conservée." });
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
    <div className="container max-w-6xl space-y-6 py-6 md:py-10">
      <div className="space-y-3">
        <h1 className="font-display text-4xl font-bold md:text-5xl">Contactez-nous</h1>
        <p className="max-w-2xl text-lg text-muted-foreground">Une question ? Notre équipe est là pour vous.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.2fr_0.8fr]">
        <Card className="border-primary/10 shadow-lg">
          <CardHeader>
            <CardTitle>Envoyez-nous un message</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <label htmlFor="contact-name" className="text-sm font-medium">Nom</label>
                  <Input id="contact-name" name="name" placeholder="Votre nom" required />
                </div>
                <div className="space-y-2">
                  <label htmlFor="contact-email" className="text-sm font-medium">Email</label>
                  <Input id="contact-email" name="email" type="email" placeholder="votre@email.com" required />
                </div>
              </div>
              <div className="space-y-2">
                <label htmlFor="contact-subject" className="text-sm font-medium">Sujet</label>
                <Input id="contact-subject" name="subject" placeholder="De quoi souhaitez-vous parler ?" required />
              </div>
              <div className="space-y-2">
                <label htmlFor="contact-message" className="text-sm font-medium">Message</label>
                <Textarea id="contact-message" name="message" placeholder="Votre message..." className="min-h-[150px]" required />
              </div>
              {feedback ? <p role={feedback.error ? "alert" : "status"} className={`rounded-xl border p-3 text-sm ${feedback.error ? "border-destructive/30 text-destructive" : "border-primary/30 text-foreground"}`}>{feedback.text}</p> : null}
              {!isCommercialDemoClient ? <TurnstileCaptcha action="public_contact" onTokenChange={setCaptchaToken} /> : null}
              <Button type="submit" className="min-h-11 w-full gap-2" disabled={sending}>
                <Send className="h-4 w-4" /> {sending ? "Envoi..." : "Envoyer"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <h2 className="text-2xl font-semibold">Nos coordonnées</h2>
          <div className="space-y-4">
            {[
              { icon: Mail, label: "Email", value: SUPPORT_EMAIL },
              { icon: MapPin, label: "Adresse", value: "Genève, Suisse" },
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
