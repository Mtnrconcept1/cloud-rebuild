import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Coins, Heart, Search, UsersRound, Utensils } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { useAuth } from "@/lib/auth-context";
import "./HeroSection.css";

const newsletterConditions = [
  "Le bonus de bienvenue est réservé aux nouveaux comptes TOK qui s'inscrivent à la newsletter depuis cette offre.",
  "Les 500 Miamz sont crédités une seule fois par personne après validation du compte et de l'inscription à la newsletter.",
  "Les Miamz ne sont pas convertibles en argent et s'utilisent uniquement dans les parcours TOK éligibles, selon les règles affichées dans l'application.",
  "Vous pouvez vous désinscrire de la newsletter à tout moment. La désinscription n'annule pas les Miamz déjà crédités, sauf fraude, abus ou erreur technique.",
  "TOK peut modifier, suspendre ou arrêter l'offre si nécessaire, notamment en cas d'usage abusif, de comptes multiples ou de tentative de contournement.",
];

export default function HeroSection({ contentVisible = true }: { contentVisible?: boolean }) {
  const navigate = useNavigate();
  const logoSrc = useTokLogoSrc();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [showNewsletterConditions, setShowNewsletterConditions] = useState(false);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams({ city: "Genève" });
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    navigate(`/recherche?${params}`);
  };

  return (
    <>
      <section
        className="tok-home-hero"
        aria-labelledby="home-hero-title"
        data-content-visible={contentVisible}
        data-authenticated={Boolean(user)}
      >
        <picture className="tok-home-hero__background" aria-hidden="true">
          <source media="(min-width: 1024px)" type="image/webp" srcSet="/images/home/tok-geneve-desktop.webp" width={1670} height={941} />
          <source media="(min-width: 1024px)" srcSet="/Chef%20TOK%20au%20bord%20du%20lac%20L%C3%A9man.png" width={1670} height={941} />
          <source type="image/webp" srcSet="/images/home/tok-geneve-mobile.webp" width={941} height={1672} />
          <img src="/64b6c2b1-eeb7-4cec-9f09-cb58519c17bc.png" alt="" width={941} height={1672} fetchPriority="high" loading="eager" />
        </picture>
        {!user ? (
          <nav className="tok-home-hero__desktop-nav" aria-label="Navigation principale">
            <Link to="/recherche?city=Gen%C3%A8ve">Les restaurants</Link>
            <Link to="/aide">Comment ça marche</Link>
            <Link className="tok-home-hero__login" to="/auth">Connexion</Link>
          </nav>
        ) : null}
        <div className="tok-home-hero__content">
          <img className="tok-home-hero__logo" src={logoSrc} alt="TOK — Miamz !" width={1691} height={1099} />
          <p className="tok-home-hero__location">À Genève</p>
          <h1 id="home-hero-title" className="tok-home-hero__title">
            <span className="tok-home-hero__title-mobile tok-home-hero__title-primary">Réservez et commandez</span>{" "}
            <span className="tok-home-hero__title-mobile tok-home-hero__accent">les meilleures offres food !</span>
            <span className="tok-home-hero__title-desktop">Les meilleures<br />offres food,<br /><span>près de chez vous.</span></span>
          </h1>
          <p className="tok-home-hero__intro">
            À Genève, cumulez des <strong>Miamz</strong> solidaires à chaque repas.
          </p>
          <ul className="tok-home-hero__benefits" aria-label="Les avantages TOK">
            <li><Coins aria-hidden="true" /><span>Moins de frais<br />pour le resto</span></li>
            <li><Heart aria-hidden="true" /><span>Plus de repas<br />financés</span></li>
            <li><UsersRound aria-hidden="true" /><span>Une communauté<br />plus solidaire</span></li>
          </ul>
          <form role="search" aria-label="Rechercher un restaurant à Genève" onSubmit={handleSearch} className="tok-home-hero__form">
            <div className="tok-home-hero__search">
              <Search aria-hidden="true" className="tok-home-hero__search-icon" />
              <label className="sr-only" htmlFor="home-restaurant-search">Cuisine, nom de restaurant ou quartier</label>
              <input id="home-restaurant-search" name="q" type="search" enterKeyHint="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Cuisine, nom de restaurant, quartier..." />
              <button type="submit" aria-label="Rechercher"><Search aria-hidden="true" /></button>
            </div>
            <button type="submit" className="tok-home-hero__cta">
              <Utensils aria-hidden="true" /><span>Je veux manger</span><ChevronRight aria-hidden="true" />
            </button>
          </form>
          <p className="tok-home-hero__signature"><span>Mangez mieux,<br />Faites plus de bien !</span><Heart aria-hidden="true" /></p>
        </div>
      </section>
      <aside className="tok-home-hero__secondary" aria-label="Rejoindre TOK">
        <Link to="/restaurateurs/geneve">Restaurateur ? Découvrez TOK <ChevronRight aria-hidden="true" size={16} /></Link>
        <div data-testid="mobile-newsletter" className="tok-home-hero__newsletter">
          <p>Abonnez-vous et recevez <strong>500 Miamz.</strong></p>
          <button type="button" onClick={() => setShowNewsletterConditions(true)} aria-haspopup="dialog">Conditions applicables.</button>
          <Link to="/auth">Inscrivez-vous</Link>
        </div>
      </aside>
      <Dialog open={showNewsletterConditions} onOpenChange={setShowNewsletterConditions}>
        <DialogContent className="max-h-[calc(100dvh-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px)-1rem)] w-[calc(100vw-env(safe-area-inset-left,0px)-env(safe-area-inset-right,0px)-1rem)] max-w-lg rounded-2xl p-0">
          <DialogHeader className="border-b px-5 pb-4 pt-5 pr-12 text-left sm:px-6">
            <DialogTitle>Conditions du bonus newsletter</DialogTitle>
            <DialogDescription>
              Ce bonus permet de recevoir 500 Miamz lors d'une inscription éligible à la newsletter TOK.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 pb-5 pt-4 text-sm leading-6 text-slate-700 sm:px-6 dark:text-slate-200">
            <ul className="list-disc space-y-3 pl-5">
              {newsletterConditions.map((condition) => (
                <li key={condition}>{condition}</li>
              ))}
            </ul>
            <p className="rounded-xl bg-orange-50 px-4 py-3 text-xs font-semibold leading-5 text-orange-900 dark:bg-orange-950/30 dark:text-orange-100">
              En continuant l'inscription, vous acceptez aussi les Conditions générales d'utilisation et la Politique de confidentialité TOK.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
