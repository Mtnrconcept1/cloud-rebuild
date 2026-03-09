import { Link } from "react-router-dom";
import { Bike } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function FooterSection() {
  return (
    <>
      {/* Livraison CTA */}
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

      {/* Footer */}
      <footer className="border-t bg-card">
        <div className="container py-12 md:py-16">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-10">
            <div className="col-span-2 md:col-span-1 space-y-4">
              <img src="/logo.png" alt="Miamz" className="h-10 w-auto object-contain" />
              <p className="text-sm text-muted-foreground leading-relaxed">Le réflexe food simple, rentable et solidaire. Commandez, réservez, et savourez.</p>
              <div className="flex gap-3">
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/></svg>
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z"/></svg>
                </a>
                <a href="#" className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center hover:bg-primary hover:text-primary-foreground transition-colors">
                  <svg className="h-4 w-4" fill="currentColor" viewBox="0 0 24 24"><path d="M23.953 4.57a10 10 0 01-2.825.775 4.958 4.958 0 002.163-2.723c-.951.555-2.005.959-3.127 1.184a4.92 4.92 0 00-8.384 4.482C7.69 8.095 4.067 6.13 1.64 3.162a4.822 4.822 0 00-.666 2.475c0 1.71.87 3.213 2.188 4.096a4.904 4.904 0 01-2.228-.616v.06a4.923 4.923 0 003.946 4.827 4.996 4.996 0 01-2.212.085 4.936 4.936 0 004.604 3.417 9.867 9.867 0 01-6.102 2.105c-.39 0-.779-.023-1.17-.067a13.995 13.995 0 007.557 2.209c9.053 0 13.998-7.496 13.998-13.985 0-.21 0-.42-.015-.63A9.935 9.935 0 0024 4.59z"/></svg>
                </a>
              </div>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Découvrir</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/recherche" className="hover:text-foreground transition-colors">Restaurants</Link>
                <Link to="/anti-gaspi" className="hover:text-foreground transition-colors">Anti-gaspi</Link>
                <Link to="/ventes-flash" className="hover:text-foreground transition-colors">Ventes flash</Link>
                <Link to="/chefs-table" className="hover:text-foreground transition-colors">Chef's Table</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Informations</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/a-propos" className="hover:text-foreground transition-colors">À propos</Link>
                <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
                <Link to="/aide" className="hover:text-foreground transition-colors">Centre d'aide</Link>
                <Link to="/cgu" className="hover:text-foreground transition-colors">CGU</Link>
              </nav>
            </div>
            <div className="space-y-3">
              <h4 className="font-display font-bold text-sm">Restaurateur</h4>
              <nav className="flex flex-col gap-2 text-sm text-muted-foreground">
                <Link to="/auth?type=restaurateur" className="hover:text-foreground transition-colors">Devenir partenaire</Link>
                <Link to="/dashboard" className="hover:text-foreground transition-colors">Espace pro</Link>
              </nav>
              <div className="pt-2 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bientôt disponible</p>
                <div className="flex gap-2">
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>
                    App Store
                  </div>
                  <div className="h-10 px-3 rounded-lg bg-foreground text-background flex items-center gap-2 text-xs font-bold">
                    <svg className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M3.609 1.814L13.792 12 3.61 22.186a.996.996 0 01-.61-.92V2.734a1 1 0 01.609-.92zm10.89 10.893l2.302 2.302-10.937 6.333 8.635-8.635zm3.199-1.414l2.937 1.7a1 1 0 010 1.728l-2.937 1.699-2.495-2.495 2.495-2.632zM5.864 2.659l10.937 6.333-2.302 2.302-8.635-8.635z"/></svg>
                    Google Play
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-muted-foreground">
            <p>&copy; 2026 Miamz. Tous droits réservés.</p>
            <div className="flex gap-4">
              <Link to="/cgu" className="hover:text-foreground transition-colors">Conditions</Link>
              <Link to="/cgu" className="hover:text-foreground transition-colors">Confidentialité</Link>
              <Link to="/cgu" className="hover:text-foreground transition-colors">Cookies</Link>
            </div>
          </div>
        </div>
      </footer>
    </>
  );
}
