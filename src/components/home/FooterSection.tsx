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
        <section className="py-10 md:py-16">
          <div className="container">
            <div className="relative isolate flex flex-col items-center gap-6 overflow-hidden rounded-[28px] border border-border/70 bg-card p-7 shadow-soft md:flex-row md:gap-10 md:p-12">
              <div aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 -z-10 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />
              <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Bike className="h-8 w-8 text-primary" />
              </div>
              <div className="flex-1 space-y-2 text-center md:text-left">
                <h2 className="font-display text-3xl font-semibold tracking-[-0.03em] md:text-4xl">Livraison à domicile</h2>
                <p className="max-w-xl text-muted-foreground">Faites-vous livrer vos plats préférés directement chez vous. Rapide, simple et délicieux.</p>
              </div>
              <Button size="lg" asChild><Link to="/recherche">Commander maintenant</Link></Button>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="tok-site-footer border-t border-transparent bg-[#1a1411] text-[#efe4d8]">
        <div className="container py-14 md:py-20">
          <p className="mb-12 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-medium leading-[1.02] tracking-[-0.04em] text-[#fbf4ec] md:mb-16">
            Le goût de se retrouver, <em className="tok-title-accent">près de chez vous.</em>
          </p>
          <div className="mb-12 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <img src={logoSrc} alt="Tok" width={62} height={40} loading="lazy" decoding="async" className="h-12 w-auto object-contain" />
              <p className="max-w-xs text-sm leading-relaxed text-[#bfb2a5]">Le réflexe food simple, rentable et solidaire. Commandez, réservez, et savourez.</p>
            </div>
            <div className="space-y-3">
              <h4 className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#9d8f82]">Découvrir</h4>
              <nav className="flex flex-col gap-0.5 text-[0.9375rem] text-[#e6d9cb]">
                <Link to="/recherche" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Restaurants</Link>
                {discoverLinks.map((link) => (
                  <Link key={link.to} to={link.to} className="inline-flex min-h-11 items-center transition-colors hover:text-white">
                    {link.label}
                  </Link>
                ))}
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#9d8f82]">Informations</h4>
              <nav className="flex flex-col gap-0.5 text-[0.9375rem] text-[#e6d9cb]">
                <Link to="/a-propos" className="inline-flex min-h-11 items-center transition-colors hover:text-white">À propos</Link>
                <a href="/blog" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Blog et guides TOK</a>
                <Link to="/contact" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Contact</Link>
                <Link to="/guide" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Guides d’utilisation</Link>
                <Link to="/aide" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Centre d'aide</Link>
                <Link to="/cgu" className="inline-flex min-h-11 items-center transition-colors hover:text-white">CGU</Link>
                <Link to="/politique-confidentialite" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Confidentialité</Link>
                <Link to="/cookies" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Cookies</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-sans text-[11px] font-bold uppercase tracking-[0.16em] text-[#9d8f82]">Restaurateur</h4>
              <nav className="flex flex-col gap-0.5 text-[0.9375rem] text-[#e6d9cb]">
                <Link to="/restaurateurs/geneve" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Devenir partenaire</Link>
                <Link to="/packs-restaurateur" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Voir les packs</Link>
                <Link to="/conditions-restaurateurs" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Conditions restaurateurs</Link>
                <Link to="/restaurateurs/google-business" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Audit Google Business</Link>
                <Link to="/restaurateurs/alternative-commission-couvert" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Comparer les commissions</Link>
                {dashboardEnabled ? (
                  <Link to="/dashboard" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Espace pro</Link>
                ) : null}
              </nav>
              <div className="pt-2 space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#9d8f82]">Bientôt disponible</p>
                <div className="flex gap-2">
                  <div className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-bold text-[#fbf4ec]">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    App Store
                  </div>
                  <div className="flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 text-xs font-bold text-[#fbf4ec]">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.414l2.937 1.7a1 1 0 010 1.728l-2.937 1.699-2.495-2.495 2.495-2.632zM5.864 2.659l10.937 6.333-2.302 2.302-8.635-8.635z" /></svg>
                    Google Play
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-[#9d8f82] md:flex-row">
            <p>&copy; 2026 Tok. Tous droits réservés.</p>
            <div className="flex gap-4">
              <Link to="/cgu" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Conditions</Link>
              <Link to="/politique-confidentialite" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Confidentialité</Link>
              <Link to="/cookies" className="inline-flex min-h-11 items-center transition-colors hover:text-white">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
