import { Link } from "react-router-dom";
import { ArrowRight, Bike, Heart, Leaf, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { useActiveFeatures } from "@/lib/featureFlags";
import { getVisiblePublicDiscoverLinks } from "@/lib/featureVisibility";

interface FooterSectionProps {
  deliveryEnabled?: boolean;
}

const TRUST_MARKERS = [
  { icon: ShieldCheck, label: "Paiement sécurisé" },
  { icon: Leaf, label: "Anti-gaspi" },
  { icon: Heart, label: "Miamz solidaires" },
] as const;

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3.5">
      <h4 className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-foreground/70">{title}</h4>
      <nav className="flex flex-col gap-2.5 text-sm text-muted-foreground">{children}</nav>
    </div>
  );
}

const footerLinkClass =
  "w-fit rounded-sm transition-colors duration-fast ease-out-soft hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

export default function FooterSection({ deliveryEnabled = true }: FooterSectionProps) {
  const logoSrc = useTokLogoSrc();
  const activeFeatures = useActiveFeatures();
  const discoverLinks = getVisiblePublicDiscoverLinks(activeFeatures);
  const dashboardEnabled = activeFeatures.has("dashboard-restaurateur");

  return (
    <>
      {/* Livraison CTA */}
      {deliveryEnabled && (
        <section className="py-12 md:py-16">
          <div className="container">
            <div className="relative isolate overflow-hidden rounded-3xl border border-primary/15 bg-[linear-gradient(135deg,hsl(var(--primary)/0.10)_0%,hsl(var(--brand)/0.07)_46%,hsl(var(--accent)/0.07)_100%)] p-8 shadow-lg md:p-12">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-[radial-gradient(circle,hsl(var(--brand)/0.28),transparent_68%)] blur-2xl"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-3xl ring-1 ring-inset ring-white/40 dark:ring-white/[0.05]"
              />
              <div className="relative flex flex-col items-center gap-6 md:flex-row md:gap-12">
                <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-brand-gradient text-primary-foreground shadow-brand">
                  <Bike className="h-8 w-8" />
                </div>
                <div className="flex-1 space-y-2 text-center md:text-left">
                  <h2 className="font-display text-display-sm font-bold">Livraison à domicile</h2>
                  <p className="mx-auto max-w-xl text-[0.95rem] leading-6 text-muted-foreground md:mx-0">
                    Faites-vous livrer vos plats préférés directement chez vous. Rapide, simple et délicieux.
                  </p>
                </div>
                <Button size="lg" variant="brand" pill asChild className="group/cta w-full md:w-auto">
                  <Link to="/recherche">
                    Commander maintenant
                    <ArrowRight className="transition-transform duration-base ease-out-soft group-hover/cta:translate-x-0.5" />
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* Footer */}
      <footer className="relative border-t border-border/80 bg-surface-sunken">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-[linear-gradient(90deg,transparent,hsl(var(--primary)/0.5),hsl(var(--brand)/0.35),transparent)]"
        />
        <div className="container py-14 md:py-20">
          <div className="mb-12 grid grid-cols-2 gap-x-8 gap-y-10 md:grid-cols-4">
            <div className="col-span-2 space-y-5 md:col-span-1">
              <img src={logoSrc} alt="Tok" className="h-11 w-auto object-contain" />
              <p className="max-w-xs text-sm leading-relaxed text-muted-foreground">
                Le réflexe food simple, rentable et solidaire. Commandez, réservez, et savourez.
              </p>
              <ul className="flex flex-wrap gap-2">
                {TRUST_MARKERS.map(({ icon: Icon, label }) => (
                  <li
                    key={label}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-surface-raised px-2.5 py-1 text-[0.7rem] font-semibold text-muted-foreground shadow-xs"
                  >
                    <Icon className="h-3.5 w-3.5 text-primary" />
                    {label}
                  </li>
                ))}
              </ul>
            </div>

            <FooterColumn title="Découvrir">
              <Link to="/recherche" className={footerLinkClass}>Restaurants</Link>
              {discoverLinks.map((link) => (
                <Link key={link.to} to={link.to} className={footerLinkClass}>
                  {link.label}
                </Link>
              ))}
            </FooterColumn>

            <FooterColumn title="Informations">
              <Link to="/a-propos" className={footerLinkClass}>À propos</Link>
              <Link to="/contact" className={footerLinkClass}>Contact</Link>
              <Link to="/aide" className={footerLinkClass}>Centre d'aide</Link>
              <Link to="/cgu" className={footerLinkClass}>CGU</Link>
              <Link to="/politique-confidentialite" className={footerLinkClass}>Confidentialité</Link>
              <Link to="/cookies" className={footerLinkClass}>Cookies</Link>
            </FooterColumn>

            <div className="space-y-6">
              <FooterColumn title="Restaurateur">
                <Link to="/restaurateurs/geneve" className={footerLinkClass}>Devenir partenaire</Link>
                <Link to="/packs-restaurateur" className={footerLinkClass}>Voir les packs</Link>
                <Link to="/conditions-restaurateurs" className={footerLinkClass}>Conditions restaurateurs</Link>
                <Link to="/restaurateurs/google-business" className={footerLinkClass}>Audit Google Business</Link>
                <Link to="/restaurateurs/alternative-commission-couvert" className={footerLinkClass}>
                  Comparer les commissions
                </Link>
                {dashboardEnabled ? (
                  <Link to="/dashboard" className={footerLinkClass}>Espace pro</Link>
                ) : null}
              </FooterColumn>

              <div className="space-y-2.5">
                <p className="text-[0.7rem] font-bold uppercase tracking-[0.16em] text-muted-foreground">
                  Bientôt disponible
                </p>
                <div className="flex flex-wrap gap-2">
                  <div className="flex h-11 items-center gap-2 rounded-xl bg-foreground px-3.5 text-xs font-bold text-background shadow-sm">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" /></svg>
                    App Store
                  </div>
                  <div className="flex h-11 items-center gap-2 rounded-xl bg-foreground px-3.5 text-xs font-bold text-background shadow-sm">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.414l2.937 1.7a1 1 0 010 1.728l-2.937 1.699-2.495-2.495 2.495-2.632zM5.864 2.659l10.937 6.333-2.302 2.302-8.635-8.635z" /></svg>
                    Google Play
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t border-border/80 pt-7 text-xs text-muted-foreground md:flex-row">
            <p>&copy; 2026 Tok. Tous droits réservés.</p>
            <div className="flex gap-5">
              <Link to="/cgu" className={footerLinkClass}>Conditions</Link>
              <Link to="/politique-confidentialite" className={footerLinkClass}>Confidentialité</Link>
              <Link to="/cookies" className={footerLinkClass}>Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
