import { Link } from "react-router-dom";
import { Bike } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getVisiblePublicDiscoverLinks } from "@/lib/featureVisibility";

interface FooterSectionProps {
  deliveryEnabled?: boolean;
}

export default function FooterSection({ deliveryEnabled = true }: FooterSectionProps) {
  const logoSrc = useTokLogoSrc();
  const activeFeatures = useActiveFeatures();
  const discoverLinks = getVisiblePublicDiscoverLinks(activeFeatures);
  const dashboardEnabled = activeFeatures.has("dashboard-restaurateur");

  return (
    <>
      {/* Livraison CTA */}
      {deliveryEnabled && (
        <section className="py-10 md:py-14">
          <div className="container">
            <div className="rounded-2xl bg-primary/5 border border-primary/10 p-8 md:p-12 flex flex-col md:flex-row items-center gap-6 md:gap-12">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center shrink-0">
                <Bike className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 text-center md:text-left space-y-2">
                <h2 className="font-display text-2xl font-semibold">Livraison à domicile</h2>
                <p className="text-muted-foreground">Faites-vous livrer vos plats préférés directement chez vous. Rapide, simple et délicieux.</p>
              </div>
              <Button size="lg" asChild><Link to="/recherche">Commander maintenant</Link></Button>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <img src={logoSrc} alt="Tok" className="h-10 w-auto object-contain" />
              <p className="text-sm text-muted-foreground leading-relaxed">Le réflexe food simple, rentable et solidaire. Commandez, réservez, et savourez.</p>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Découvrir</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/recherche" className="hover:text-foreground transition-colors">Restaurants</Link>
                {discoverLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="hover:text-foreground transition-colors">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Informations</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/a-propos" className="hover:text-foreground transition-colors">À propos</Link>
                <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
                <Link to="/aide" className="hover:text-foreground transition-colors">Centre d'aide</Link>
                <Link to="/cgu" className="hover:text-foreground transition-colors">CGU</Link>
                <Link to="/politique-confidentialite" className="hover:text-foreground transition-colors">Confidentialité</Link>
                <Link to="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Restaurateur</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/restaurateurs/geneve" className="hover:text-foreground transition-colors">Devenir partenaire</Link>
                <Link to="/packs-restaurateur" className="hover:text-foreground transition-colors">Voir les packs</Link>
                <Link to="/conditions-restaurateurs" className="hover:text-foreground transition-colors">Conditions restaurateurs</Link>
                <Link to="/restaurateurs/google-business" className="hover:text-foreground transition-colors">Audit Google Business</Link>
                <Link to="/restaurateurs/alternative-commission-couvert" className="hover:text-foreground transition-colors">Comparer les commissions</Link>
                {dashboardEnabled ? (
                  <Link to="/dashboard" className="hover:text-foreground transition-colors">Espace pro</Link>
                ) : null}
              </nav>
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bientôt disponible</p>
                <div className="flex gap-2">
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    App Store
                  </div>
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.414l2.937 1.7a1 1 0 010 1.728l-2.937 1.699-2.495-2.495 2.495-2.632zM5.864 2.659l10.937 6.333-2.302 2.302-8.635-8.635z" /></svg>
                    Google Play
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>&copy; 2026 Tok. Tous droits réservés.</p>
            <div className="flex gap-4">
              <Link to="/cgu" className="hover:text-foreground transition-colors">Conditions</Link>
              <Link to="/politique-confidentialite" className="hover:text-foreground transition-colors">Confidentialité</Link>
              <Link to="/cookies" className="hover:text-foreground transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
