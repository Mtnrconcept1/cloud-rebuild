import { Link } from "react-router-dom";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";

export default function FooterSection() {
  return (
    <>
      <section className="py-10 md:py-14">
        <div className="container">
          <div className="flex flex-col items-center gap-6 rounded-2xl border border-primary/10 bg-primary/5 p-8 md:flex-row md:gap-12 md:p-12">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10">
              <CalendarDays className="h-8 w-8 text-primary" />
            </div>
            <div className="flex-1 space-y-2 text-center md:text-left">
              <h2 className="font-display text-2xl font-semibold">Reservations de tables</h2>
              <p className="text-muted-foreground">
                Decouvrez les restaurants, choisissez votre service et confirmez votre venue en ligne.
              </p>
            </div>
            <Button size="lg" asChild>
              <Link to="/recherche">Reserver maintenant</Link>
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t bg-card">
        <div className="container py-12 md:py-16">
          <div className="mb-10 grid grid-cols-2 gap-8 md:grid-cols-4">
            <div className="col-span-2 space-y-4 md:col-span-1">
              <img src="/logo.png" alt="Deliveroom" className="h-10 w-auto object-contain" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Le reflexe reservation simple, rapide et clair pour trouver la bonne table au bon moment.
              </p>
            </div>
            <div className="space-y-3">
              <h4 className="font-display text-sm font-bold">Decouvrir</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/recherche" className="transition-colors hover:text-foreground">Restaurants</Link>
                <Link to="/recherche" className="transition-colors hover:text-foreground">Reserver une table</Link>
                <Link to="/reservations" className="transition-colors hover:text-foreground">Mes reservations</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display text-sm font-bold">Informations</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/a-propos" className="transition-colors hover:text-foreground">A propos</Link>
                <Link to="/contact" className="transition-colors hover:text-foreground">Contact</Link>
                <Link to="/aide" className="transition-colors hover:text-foreground">Centre d'aide</Link>
                <Link to="/cgu" className="transition-colors hover:text-foreground">CGU</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display text-sm font-bold">Restaurateur</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/auth?type=restaurateur" className="transition-colors hover:text-foreground">Devenir partenaire</Link>
                <Link to="/dashboard" className="transition-colors hover:text-foreground">Espace pro</Link>
              </nav>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t pt-6 text-xs text-muted-foreground md:flex-row">
            <p>&copy; 2026 Deliveroom. Tous droits reserves.</p>
            <div className="flex gap-4">
              <Link to="/cgu" className="transition-colors hover:text-foreground">Conditions</Link>
              <Link to="/cgu" className="transition-colors hover:text-foreground">Confidentialite</Link>
              <Link to="/cgu" className="transition-colors hover:text-foreground">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
