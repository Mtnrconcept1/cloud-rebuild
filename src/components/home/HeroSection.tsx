import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Heart, Mail, MapPin, Navigation, Percent, Search, ShoppingBag, Users } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import "./HeroSection.css";

const HERO_IMAGE_FETCH_PRIORITY_PROPS = { fetchpriority: "high" } as const;
const EMPTY_FEATURES: ReadonlySet<string> = new Set();

const newsletterConditions = [
  "Le bonus de bienvenue est réservé aux nouveaux comptes TOK qui s'inscrivent à la newsletter depuis cette offre.",
  "Les 500 Miamz sont crédités une seule fois par personne après validation du compte et de l'inscription à la newsletter.",
  "Les Miamz ne sont pas convertibles en argent et s'utilisent uniquement dans les parcours TOK éligibles, selon les règles affichées dans l'application.",
  "Vous pouvez vous désinscrire de la newsletter à tout moment. La désinscription n'annule pas les Miamz déjà crédités, sauf fraude, abus ou erreur technique.",
  "TOK peut modifier, suspendre ou arrêter l'offre si nécessaire, notamment en cas d'usage abusif, de comptes multiples ou de tentative de contournement.",
];

export default function HeroSection({ contentVisible = true, activeFeatures = EMPTY_FEATURES }: { contentVisible?: boolean; activeFeatures?: ReadonlySet<string> }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [city, setCity] = useState("");
  const [showNewsletterConditions, setShowNewsletterConditions] = useState(false);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (city.trim()) params.set("city", city.trim());
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    navigate(`/recherche${params.size ? `?${params}` : ""}`);
  };

  return (
    <>
      <section
        className="tok-home-hero"
        aria-labelledby="home-hero-title"
        data-content-visible={contentVisible}
        data-authenticated={Boolean(user)}
      >
        <div className="tok-home-hero__content">
          <div className="tok-home-hero__brand">
            <p className="tok-home-hero__eyebrow">Le goût de se retrouver</p>
          </div>
          <h1 id="home-hero-title" className="tok-home-hero__title">
            Votre prochaine<br /><span>bonne adresse.</span>
          </h1>
          <p className="tok-home-hero__intro">
            Une table, un repas à emporter, une nouvelle envie. Trouvez le restaurant qui vous correspond.
          </p>
          <form role="search" aria-label="Rechercher un restaurant" onSubmit={handleSearch} className="tok-home-hero__form">
            <div className="tok-home-hero__field">
              <label htmlFor="home-restaurant-search">Restaurant ou cuisine</label>
              <div className="tok-home-hero__input-row">
                <Search aria-hidden="true" />
                <input id="home-restaurant-search" name="q" type="search" enterKeyHint="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="De quoi avez-vous envie ?" />
              </div>
            </div>
            <div className="tok-home-hero__field tok-home-hero__field--city">
              <label htmlFor="home-city-search">Où ? <span>(facultatif)</span></label>
              <div className="tok-home-hero__input-row">
                <MapPin aria-hidden="true" />
                <input id="home-city-search" name="city" type="text" autoComplete="address-level2" value={city} onChange={(event) => setCity(event.target.value)} placeholder="Genève" />
              </div>
            </div>
            <button type="submit" className="tok-home-hero__cta">
              <span>Rechercher</span><ArrowRight aria-hidden="true" />
            </button>
          </form>
          <nav className="tok-home-hero__filters" aria-label="Accès rapides aux restaurants">
            <Link to="/recherche"><Navigation aria-hidden="true" /> Autour de moi</Link>
            {activeFeatures.has("ventes-flash") ? <Link to="/ventes-flash"><Percent aria-hidden="true" /> Offres</Link> : null}
            <Link to="/recherche"><ShoppingBag aria-hidden="true" /> À emporter</Link>
            {activeFeatures.has("chefs-table") ? <Link to="/chefs-table"><Users aria-hidden="true" /> Grandes tables</Link> : null}
          </nav>
        </div>
        <div className="tok-home-hero__art" aria-hidden="true">
          <picture className="tok-home-hero__background">
            <source media="(max-width: 767px)" type="image/webp" srcSet="/images/home/tok-geneve-mobile-original.webp" />
            <img src="/images/home/tok-leman-signature.webp" alt="" width={1672} height={941} {...HERO_IMAGE_FETCH_PRIORITY_PROPS} loading="eager" decoding="async" />
          </picture>
        </div>
      </section>
      <aside className="tok-home-hero__secondary" aria-label="Rejoindre TOK">
        <p className="tok-home-hero__signature"><Heart aria-hidden="true" /><span>Mangez mieux. Faites plus de bien, avec les Miamz solidaires.</span></p>
        <Link className="tok-home-hero__pro-link" to="/restaurateurs/geneve">Restaurateur ? Découvrez TOK <ChevronRight aria-hidden="true" size={16} /></Link>
        <div data-testid="mobile-newsletter" className="tok-home-hero__newsletter">
          <Mail aria-hidden="true" className="tok-home-hero__mail-icon" />
          <p>Abonnez-vous à notre newsletter et recevez <strong>500 Miamz.</strong></p>
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
