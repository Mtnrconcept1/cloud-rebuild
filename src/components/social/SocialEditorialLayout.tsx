import { useEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { BarChart3, Bookmark, CalendarDays, ChevronDown, ChevronRight, Clapperboard, House, MapPin, MessageCircle, Plus, Search, Store, UserPlus, UserRound, X } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { NotificationBell } from "@/components/notifications/NotificationBell";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import type { SocialFeedPost, SocialFeedScope } from "@/lib/socialFeed";
import "@/styles/social-editorial.css";

const EDITORIAL_FEED_TABS = [
  { value: "for_you", label: "Pour vous" },
  { value: "followed", label: "Abonnements" },
  { value: "nearby", label: "À proximité" },
] as const;

type SocialEditorialLayoutProps = {
  children: ReactNode;
  dashboard?: boolean;
  canCreate?: boolean;
  restaurantName?: string | null;
  restaurantImage?: string | null;
  restaurantSelector?: ReactNode;
  profileHref?: string;
  scope: SocialFeedScope;
  onScopeChange: (value: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
  city: string;
  cities: string[];
  onCityChange: (value: string) => void;
  reels?: boolean;
  onReels: () => void;
  onCreate: () => void;
  stories: SocialFeedPost[];
  suggestions: SocialFeedPost[];
  onFollow: (post: SocialFeedPost) => void;
  following?: boolean;
  statistics?: ReactNode;
  secondary?: ReactNode;
};

function getEditorialPostImage(post: SocialFeedPost) {
  return post.media.find((media) => media.mediaType === "image")?.mediaUrl || post.restaurant.imageUrl || null;
}

function RestaurantImage({ src, className = "" }: { src?: string | null; className?: string }) {
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  return src && src !== failedSrc
    ? <img src={src} alt="" loading="lazy" decoding="async" className={className} onError={() => setFailedSrc(src)} />
    : <span className={`tok-social-image-fallback ${className}`}><Store aria-hidden="true" /></span>;
}

function tonightDate() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  return ["year", "month", "day"].map((type) => parts.find((part) => part.type === type)?.value).join("-");
}

export default function SocialEditorialLayout({
  children, dashboard = false, canCreate = false, restaurantName, restaurantImage, restaurantSelector, profileHref = "/profil",
  scope, onScopeChange, search, onSearchChange, city, cities, onCityChange, reels = false,
  onReels, onCreate, stories, suggestions, onFollow, following = false, statistics, secondary,
}: SocialEditorialLayoutProps) {
  const logo = useTokLogoSrc();
  const [mobileSearch, setMobileSearch] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchToggleRef = useRef<HTMLButtonElement>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [time, setTime] = useState("19:00");
  const bookingRestaurant = [...suggestions, ...stories].find((post) =>
    post.ctaType === "reserve"
    && (!city || (post.restaurant.city || "").trim().localeCompare(city.trim(), "fr-CH", { sensitivity: "base" }) === 0),
  );
  const bookingHref = bookingRestaurant
    ? `/restaurant/${encodeURIComponent(bookingRestaurant.restaurantId)}?reserve=true&date=${tonightDate()}&time=${encodeURIComponent(time)}&party_size=2`
    : city ? `/recherche?city=${encodeURIComponent(city)}` : "/recherche";
  const Page = dashboard ? "div" : "main";
  const selectScope = (value: string) => { onSearchChange(""); onScopeChange(value); };
  const account = <Avatar className="tok-social-account"><AvatarImage src={restaurantImage || undefined} alt="" /><AvatarFallback><UserRound size={20} aria-hidden="true" /></AvatarFallback></Avatar>;

  useEffect(() => {
    if (mobileSearch) searchInputRef.current?.focus();
  }, [mobileSearch]);

  return (
    <Page className="tok-social-editorial" data-testid="social-editorial-layout">
      <a className="tok-social-skip" href="#tok-social-feed">Aller au fil d’actualités</a>
      <aside className="tok-social-sidebar" aria-label="Espace social TOK">
        <Link to={dashboard ? "/dashboard" : "/"} className="tok-social-brand" aria-label="TOK — Accueil"><img src={logo} alt="TOK" width="144" height="112" /></Link>
        {restaurantSelector || <Link to={profileHref} className="tok-social-identity">{account}<span>{restaurantName || "Mon espace TOK"}</span><ChevronDown size={16} aria-hidden="true" /></Link>}
        <nav aria-label="Navigation du réseau social" className="tok-social-nav">
          <button type="button" className={!reels && scope !== "saved" ? "is-active" : ""} onClick={() => selectScope("for_you")}><House /><span>Fil social</span></button>
          <Link to="/recherche"><Search /><span>Explorer</span></Link>
          <button type="button" className={reels ? "is-active" : ""} onClick={onReels}><Clapperboard /><span>Reels</span></button>
          <button type="button" className={scope === "saved" ? "is-active" : ""} onClick={() => selectScope("saved")}><Bookmark /><span>Enregistrés</span></button>
          <Link to={dashboard ? "/dashboard/support" : "/contact"} title="Messages avec l’équipe TOK"><MessageCircle /><span>Messages</span></Link>
          <Link to={canCreate ? "/dashboard/photos" : "/restaurateurs/geneve"}><BarChart3 /><span>Studio</span></Link>
        </nav>
        {canCreate ? <button type="button" className="tok-social-primary tok-social-create" onClick={onCreate}><Plus /><span>Créer un post</span></button> : null}
        <Link to={dashboard ? "/dashboard" : "/"} className="tok-social-back">{dashboard ? "Mon tableau de bord" : "Découvrir TOK"}<ChevronRight size={15} /></Link>
      </aside>

      <div className="tok-social-main">
        <header className="tok-social-topbar">
          <Link to={dashboard ? "/dashboard" : "/"} className="tok-social-mobile-brand" aria-label="TOK — Accueil"><img src={logo} alt="TOK" width="88" height="70" /></Link>
          <div className={`tok-social-search ${mobileSearch ? "is-open" : ""}`}>
            <Search size={20} aria-hidden="true" />
            <input ref={searchInputRef} id="actualites-search" type="search" value={search} onChange={(event) => onSearchChange(event.target.value)} onKeyDown={(event) => {
              if (event.key === "Escape" && mobileSearch) {
                event.preventDefault();
                setMobileSearch(false);
                searchToggleRef.current?.focus();
              }
            }} placeholder="Un restaurant, une envie…" aria-label="Rechercher dans les actualités" aria-describedby="actualites-search-status" data-testid="actualites-search" />
            {search ? <button type="button" onClick={() => onSearchChange("")} aria-label="Effacer la recherche"><X size={17} /></button> : null}
          </div>
          <label className="tok-social-location"><MapPin size={20} aria-hidden="true" /><span className="sr-only">Ville des publications</span><select value={city} onChange={(event) => onCityChange(event.target.value)}><option value="">Toutes les villes</option>{cities.map((name) => <option key={name} value={name}>{name}</option>)}</select><ChevronDown size={15} aria-hidden="true" /></label>
          <button ref={searchToggleRef} type="button" className="tok-social-mobile-search" aria-label={mobileSearch ? "Fermer la recherche" : "Ouvrir la recherche"} aria-expanded={mobileSearch} aria-controls="actualites-search" onClick={() => setMobileSearch((open) => !open)}>{mobileSearch ? <X /> : <Search />}</button>
          <NotificationBell buttonClassName="tok-social-notification" />
          <button type="button" aria-label="Ouvrir mon espace" className="tok-social-profile" onClick={(event) => { accountTriggerRef.current = event.currentTarget; setAccountOpen(true); }}>{account}</button>
        </header>

        <div className="tok-social-columns">
          <section className="tok-social-feed-column" id="tok-social-feed" tabIndex={-1} aria-label={reels ? "Reels des restaurants" : "Fil d’actualités"}>
            <div data-testid="actualites-hero" className="tok-social-heading"><h1>{reels ? "Les Reels de vos tables" : "Le goût du partage"}<span>.</span></h1></div>
            <nav className="tok-social-tabs" aria-label="Choisir le fil">
              {EDITORIAL_FEED_TABS.map((tab) => <button key={tab.value} type="button" aria-pressed={!reels && scope === tab.value} onClick={() => selectScope(tab.value)}>{tab.label}</button>)}
            </nav>
            {stories.length > 0 ? <nav className="tok-social-stories" aria-label="Actualités des restaurants" data-testid="actualites-stories">
              {stories.map((post) => <Link key={post.restaurantId} to={`/actualites/${encodeURIComponent(post.id)}`} aria-label={`Voir l’actualité de ${post.restaurant.name}`}><span className="tok-social-story-ring"><RestaurantImage src={getEditorialPostImage(post)} /></span><span className="tok-social-story-name">{post.restaurant.name}</span></Link>)}
            </nav> : null}
            {scope === "saved" ? <p className="tok-social-view-label"><Bookmark size={16} /> Vos publications enregistrées</p> : null}
            {children}
          </section>

          <aside className="tok-social-discover" aria-label="Découvrir les restaurants">
            <h2>{city ? `À découvrir près de ${city}` : "De belles tables à découvrir"}</h2>
            <div className="tok-social-suggestions">
              {suggestions.slice(0, 3).map((post) => <article key={post.restaurantId} className="tok-social-suggestion">
                <Link to={`/restaurant/${encodeURIComponent(post.restaurantId)}`} aria-label={`Découvrir ${post.restaurant.name}`} className="tok-social-suggestion-image"><RestaurantImage src={post.restaurant.imageUrl || getEditorialPostImage(post)} /></Link>
                <div><Link to={`/restaurant/${encodeURIComponent(post.restaurantId)}`} className="tok-social-suggestion-name">{post.restaurant.name}</Link><p>{post.restaurant.city || "Restaurant TOK"}</p><button type="button" onClick={() => onFollow(post)} disabled={following} aria-label={`Suivre ${post.restaurant.name}`}><UserPlus size={14} /> Suivre</button></div>
              </article>)}
              {!suggestions.length ? <Link to="/recherche" className="tok-social-discover-empty"><Store /><span>Trouvez votre prochaine bonne adresse</span><ChevronRight size={16} /></Link> : null}
            </div>
            <section className="tok-social-tonight" aria-label="Chercher une table ce soir">
              <h2><CalendarDays />Une table ce soir ?</h2>
              {bookingRestaurant ? <div className="tok-social-times" role="group" aria-label="Heure de réservation souhaitée">{["19:00", "19:30", "20:00"].map((slot) => <button type="button" key={slot} onClick={() => setTime(slot)} aria-pressed={time === slot}>{slot.replace(":", " h ")}</button>)}</div> : null}
              <Link to={bookingHref} className="tok-social-primary">{bookingRestaurant ? "Voir les disponibilités" : "Trouver un restaurant"}</Link>
              {bookingRestaurant ? <p>{bookingRestaurant.restaurant.name}</p> : null}
            </section>
            {statistics || (canCreate ? <Link to="/dashboard/actualites?stats=1" className="tok-social-stats-link"><BarChart3 size={17} />Voir mes statistiques<ChevronRight size={16} /></Link> : null)}
            {secondary}
          </aside>
        </div>
      </div>

      <nav className="tok-social-mobile-nav" aria-label="Navigation mobile du réseau social">
        <button type="button" onClick={() => selectScope("for_you")} aria-current={!reels && scope !== "saved" ? "page" : undefined}><House /><span>Accueil</span></button>
        <Link to="/recherche"><Search /><span>Explorer</span></Link>
        {canCreate ? <button type="button" className="tok-social-mobile-create" onClick={onCreate} aria-label="Créer un post"><Plus /></button> : <button type="button" onClick={() => selectScope("saved")} aria-current={scope === "saved" ? "page" : undefined}><Bookmark /><span>Enregistrés</span></button>}
        <button type="button" onClick={onReels} aria-current={reels ? "page" : undefined}><Clapperboard /><span>Reels</span></button>
        <button type="button" onClick={(event) => { accountTriggerRef.current = event.currentTarget; setAccountOpen(true); }}><UserRound /><span>Profil</span></button>
      </nav>
      <Sheet open={accountOpen} onOpenChange={setAccountOpen}>
        <SheetContent className="tok-social-account-sheet" onCloseAutoFocus={(event) => {
          if (accountTriggerRef.current?.isConnected) {
            event.preventDefault();
            accountTriggerRef.current.focus();
          }
        }}>
          <SheetHeader><SheetTitle>Mon espace TOK</SheetTitle><SheetDescription>Votre restaurant et vos raccourcis.</SheetDescription></SheetHeader>
          <div className="mt-6">{restaurantSelector || <p className="mb-5 font-semibold">{restaurantName || "Bienvenue sur TOK"}</p>}</div>
          <nav className="tok-social-nav" aria-label="Raccourcis de mon espace">
            <Link to={profileHref} onClick={() => setAccountOpen(false)}><UserRound /><span>Mon profil</span></Link>
            <button type="button" onClick={() => { selectScope("saved"); setAccountOpen(false); }}><Bookmark /><span>Enregistrés</span></button>
            <Link to={canCreate ? "/dashboard/support" : "/contact"}><MessageCircle /><span>Messages</span></Link>
            {canCreate ? <><Link to="/dashboard/photos"><BarChart3 /><span>Studio</span></Link><Link to="/dashboard"><House /><span>Mon tableau de bord</span></Link></> : null}
            <button type="button" onClick={() => { selectScope("offers"); setAccountOpen(false); }}><Store /><span>Les offres des restaurants</span></button>
          </nav>
        </SheetContent>
      </Sheet>
    </Page>
  );
}
