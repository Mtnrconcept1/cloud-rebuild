import { Mail, Phone, MapPin, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SUPPORT_EMAIL } from "@/lib/contact";

export default function Contact() {
  const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); alert("Votre message a été envoyé !"); };
  return (
    <div className="container py-12 md:py-20 space-y-12">
      <div className="text-center space-y-4">
        <h1 className="font-display text-4xl md:text-5xl font-bold">Contactez-nous</h1>
        <p className="text-muted-foreground text-lg max-w-2xl mx-auto">Une question ? Notre équipe est là pour vous.</p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
        <Card className="shadow-lg border-primary/10">
          <CardHeader><CardTitle>Envoyez-nous un message</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2"><label className="text-sm font-medium">Nom</label><Input placeholder="Votre nom" required /></div>
                <div className="space-y-2"><label className="text-sm font-medium">Email</label><Input type="email" placeholder="votre@email.com" required /></div>
              </div>
              <div className="space-y-2"><label className="text-sm font-medium">Sujet</label><Input placeholder="De quoi souhaitez-vous parler ?" required /></div>
              <div className="space-y-2"><label className="text-sm font-medium">Message</label><Textarea placeholder="Votre message..." className="min-h-[150px]" required /></div>
              <Button type="submit" className="w-full gap-2"><Send className="h-4 w-4" /> Envoyer</Button>
            </form>
          </CardContent>
        </Card>
        <div className="space-y-8">
          <h2 className="text-2xl font-semibold">Nos coordonnées</h2>
          <div className="space-y-4">
            {[
              { icon: Mail, label: "Email", value: SUPPORT_EMAIL },
              { icon: Phone, label: "Téléphone", value: "+33 (0)1 23 45 67 89" },
              { icon: MapPin, label: "Adresse", value: "123 Rue de la Gastronomie, 75001 Paris" },
            ].map((item) => (
              <div key={item.label} className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0"><item.icon className="h-5 w-5 text-primary" /></div>
                <div><p className="font-medium">{item.label}</p><p className="text-muted-foreground">{item.value}</p></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
