import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, Crown, Leaf, Mail, MapPin, Navigation, Percent, Search, ShoppingBag, Tag, Users, Zap } from "lucide-react";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { getSupabase } from "@/integrations/supabase/client";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { cantonFromPlaceName, cantonHeroSrc, type SwissCantonCode } from "@/lib/homeCantonHero";
import { resolveMobileCityImage, resolveWorldArt } from "@/lib/homeWorldHero";
import { HALLOWEEN_FEATURE_FLAG } from "@/components/seasonal/HalloweenTheme";
import "./HeroSection.css";
import "./HeroSectionReferenceMobile.css";

const EMPTY_FEATURES: ReadonlySet<string> = new Set();
const DEFAULT_HERO_DESKTOP = "/images/locations/Europe/Suisse/Geneve/tok-geneve-desktop.webp";
const DEFAULT_HERO_MOBILE = "/images/home/tok-geneve-mobile-sans-parasol.webp";

const newsletterConditions = [
  "Le bonus de bienvenue est réservé aux nouveaux comptes TOK qui s'inscrivent à la newsletter depuis cette offre.",
  "Les 500 Miamz sont crédités une seule fois par personne après validation du compte et de l'inscription à la newsletter.",
  "Les Miamz ne sont pas convertibles en argent et s'utilisent uniquement dans les parcours TOK éligibles, selon les règles affichées dans l'application.",
  "Vous pouvez vous désinscrire de la newsletter à tout moment. La désinscription n'annule pas les Miamz déjà crédités, sauf fraude, abus ou erreur technique.",
  "TOK peut modifier, suspendre ou arrêter l'offre si nécessaire, notamment en cas d'usage abusif, de comptes multiples ou de tentative de contournement.",
];

export default function HeroSection({ contentVisible = true, activeFeatures = EMPTY_FEATURES, locationCanton = null, profileCity = null, profileCityPending = false, gpsCity = null, gpsCountry = null }: {
  contentVisible?: boolean;
  activeFeatures?: ReadonlySet<string>;
  locationCanton?: SwissCantonCode | null;
  profileCity?: string | null;
  profileCityPending?: boolean;
  gpsCity?: string | null;
  gpsCountry?: string | null;
}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState("");
  const [city, setCity] = useState(() => profileCity?.trim() || "");
  const cityEditedByVisitor = useRef(false);
  const [showNewsletterConditions, setShowNewsletterConditions] = useState(false);
  const [showNewsletterSignup, setShowNewsletterSignup] = useState(false);
  const [newsletterConsent, setNewsletterConsent] = useState(false);
  const [newsletterSubmitting, setNewsletterSubmitting] = useState(false);
  const { toast } = useToast();

  const subscribeExistingUser = async () => {
    if (!user || !newsletterConsent || newsletterSubmitting) return;
    setNewsletterSubmitting(true);
    try {
      const { error } = await getSupabase().rpc("subscribe_tok_newsletter");
      if (error) throw error;
      toast({ title: "Newsletter activée", description: "Votre inscription à la newsletter TOK est enregistrée. Vous pouvez vous désinscrire dans votre profil." });
      setShowNewsletterSignup(false);
      setNewsletterConsent(false);
    } catch (error) {
      toast({ title: "Inscription impossible", description: error instanceof Error ? error.message : "Réessayez plus tard.", variant: "destructive" });
    } finally {
      setNewsletterSubmitting(false);
    }
  };

  useEffect(() => {
    const savedCity = profileCity?.trim();
    if (savedCity && !cityEditedByVisitor.current) setCity(savedCity);
  }, [profileCity]);

  // The visitor's explicit choice outranks the saved city; GPS is only a fallback.
  const selectedCity = city.trim() || (!cityEditedByVisitor.current ? profileCity?.trim() : "") || null;
  const pending = !city.trim() && !cityEditedByVisitor.current && profileCityPending;
  const canton = selectedCity ? cantonFromPlaceName(selectedCity) : locationCanton;
  const worldArt = !pending ? resolveWorldArt(selectedCity || gpsCity, selectedCity ? null : gpsCountry) : null;
  const cantonImage = !pending && canton ? cantonHeroSrc(canton) : null;
  const halloweenEnabled = activeFeatures.has(HALLOWEEN_FEATURE_FLAG);
  const desktopImage = halloweenEnabled
    ? "/images/seasonal/halloween/hero-desktop.webp"
    : cantonImage || worldArt?.desktop || (pending ? null : DEFAULT_HERO_DESKTOP);
  // The commune variations contain added heraldic shields. Keep location-aware
  // artwork where possible, but use the original shield-free Geneva portrait.
  const mobileCityImage = !pending ? resolveMobileCityImage(selectedCity || gpsCity) : null;
  const shieldFreeMobileCityImage = mobileCityImage?.startsWith("/images/home-mobile/communes/") ? null : mobileCityImage;
  const mobileImage = halloweenEnabled
    ? "/images/seasonal/halloween/hero-mobile-20261030.webp"
    : canton === "GE" || (!selectedCity && cantonFromPlaceName(gpsCity) === "GE") ? DEFAULT_HERO_MOBILE : shieldFreeMobileCityImage || worldArt?.mobile || (canton ? desktopImage : worldArt?.desktop && !cantonImage ? desktopImage : DEFAULT_HERO_MOBILE);

  const handleSearch = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (city.trim()) params.set("city", city.trim());
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    navigate(`/recherche${params.size ? `?${params}` : ""}`);
  };

  return (
    <>
      <div className="tok-home-first-screen">
      <section
        className="tok-home-hero"
        aria-labelledby="home-hero-title"
        data-content-visible={contentVisible}
        data-authenticated={Boolean(user)}
        data-home-canton={pending ? "pending" : canton ?? "default"}
        data-seasonal-hero={halloweenEnabled ? "halloween" : undefined}
      >
        <div className="tok-home-hero__content">
          {!halloweenEnabled ? (
            <div className="tok-home-hero__mobile-mascot" aria-hidden="true" />
          ) : null}
          <div className="tok-home-hero__editorial">
            <h1 id="home-hero-title" className="tok-home-hero__title" aria-label="Votre prochaine bonne adresse.">
              Votre prochaine<br /><span>bonne adresse.</span>
            </h1>
            <p className="tok-home-hero__intro">
              {halloweenEnabled
                ? "Une table, un repas à emporter, une envie ensorcelante. Trouvez l’adresse qui vous fera frissonner."
                : "Une table, un repas à emporter, une nouvelle envie. Trouvez le restaurant qui vous correspond."}
            </p>
          </div>
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
                <input
                  id="home-city-search"
                  name="city"
                  type="text"
                  autoComplete="address-level2"
                  value={city}
                  onChange={(event) => {
                    cityEditedByVisitor.current = true;
                    setCity(event.target.value);
                  }}
                  placeholder="Genève"
                />
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
          <nav className="tok-home-hero__mobile-actions" aria-label="Découvrir les services TOK">
            <Link to={activeFeatures.has("ventes-flash") ? "/ventes-flash" : "/recherche"}><Zap aria-hidden="true" /><span>Ventes flash</span></Link>
            <Link to={activeFeatures.has("anti-gaspi") ? "/anti-gaspi" : "/recherche"}><Leaf aria-hidden="true" /><span>Anti-gaspi</span></Link>
            <Link to={activeFeatures.has("chefs-table") ? "/chefs-table" : "/recherche"}><Crown aria-hidden="true" /><span>La Tok d’Or</span></Link>
            <Link to="/recherche"><Tag aria-hidden="true" /><span>Offres &amp; promos</span></Link>
          </nav>
        </div>
        <div className="tok-home-hero__art" aria-hidden="true" data-canton-image={Boolean(cantonImage)}>
          {desktopImage ? (
            <picture key={desktopImage} className="tok-home-hero__background">
              {mobileImage !== desktopImage ? <source media="(max-width: 767px)" type="image/webp" srcSet={mobileImage} /> : null}
              <img src={desktopImage} alt="" width={1440} height={810} {...({ fetchpriority: "high" } as const)} loading="eager" decoding="async" />
            </picture>
          ) : null}
        </div>
      </section>
      <aside className="tok-home-hero__secondary" aria-label="Rejoindre TOK">
        <Link className="tok-home-hero__pro-link" to="/restaurateurs/geneve">Restaurateur ? Découvrez TOK <ChevronRight aria-hidden="true" size={16} /></Link>
        <div data-testid="mobile-newsletter" className="tok-home-hero__newsletter">
          <Mail aria-hidden="true" className="tok-home-hero__mail-icon" />
          <p>{user ? "Recevez les offres et actualités de TOK par email." : <>Abonnez-vous à notre newsletter et recevez <strong>500 Miamz.</strong></>}</p>
          <button type="button" onClick={() => setShowNewsletterConditions(true)} aria-haspopup="dialog">Conditions applicables.</button>
          {user ? (
            <button type="button" className="tok-home-hero__newsletter-cta" onClick={() => setShowNewsletterSignup(true)}>M'abonner</button>
          ) : (
            <Link to="/auth?newsletter=1">Inscrivez-vous</Link>
          )}
        </div>
      </aside>
      </div>
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
      <Dialog open={showNewsletterSignup} onOpenChange={(open) => {
        if (newsletterSubmitting) return;
        setShowNewsletterSignup(open);
        if (!open) setNewsletterConsent(false);
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Recevoir la newsletter TOK</DialogTitle>
            <DialogDescription>
              Recevez les offres et nouveautés TOK par email. Le bonus de 500 Miamz est réservé aux nouveaux comptes éligibles créés depuis l'offre de bienvenue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex items-start gap-3 rounded-lg border p-3 text-sm">
            <Checkbox
              id="newsletter-existing-consent"
              checked={newsletterConsent}
              onCheckedChange={(checked) => setNewsletterConsent(checked === true)}
              aria-label="Je souhaite recevoir les emails marketing TOK"
            />
            <label htmlFor="newsletter-existing-consent" className="cursor-pointer leading-5">
              J'accepte de recevoir les emails de la newsletter TOK. Je pourrai me désinscrire à tout moment dans les préférences de mon profil.
            </label>
          </div>
          <button
            type="button"
            className="min-h-11 rounded-xl bg-primary px-4 py-3 font-semibold text-primary-foreground disabled:opacity-50"
            disabled={!newsletterConsent || newsletterSubmitting}
            onClick={() => void subscribeExistingUser()}
          >
            {newsletterSubmitting ? "Inscription en cours..." : "Confirmer mon abonnement"}
          </button>
        </DialogContent>
      </Dialog>
    </>
  );
}
