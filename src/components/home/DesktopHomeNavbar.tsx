import { useState } from "react";
import {
  AlarmClock,
  CalendarDays,
  ChevronDown,
  Flame,
  Heart,
  Leaf,
  MapPin,
  Search,
  UserRound,
} from "lucide-react";
import { Link, useNavigate } from "react-router-dom";

import { useTokLogoSrc } from "@/hooks/useTokLogo";
import { useAuth } from "@/lib/auth-context";
import { useActiveFeatures } from "@/lib/featureFlags";

export default function DesktopHomeNavbar() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const activeFeatures = useActiveFeatures();
  const logoSrc = useTokLogoSrc();
  const [query, setQuery] = useState("");

  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const params = new URLSearchParams();
    if (query.trim()) params.set("q", query.trim());
    params.set("city", "Genève");
    navigate(`/recherche?${params.toString()}`);
  };

  return (
    <header
      data-testid="desktop-home-navbar"
      className="sticky top-0 z-[85] hidden h-[66px] w-full border-b border-slate-200/80 bg-white/[0.98] shadow-[0_4px_18px_rgba(15,23,42,0.06)] backdrop-blur lg:block dark:bg-white"
    >
      <div className="mx-auto flex h-full w-full max-w-[1800px] items-center gap-3 px-5 xl:gap-4 xl:px-8 2xl:px-10">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Accueil TOK">
          <img src={logoSrc} alt="TOK" className="h-[56px] w-auto object-contain" />
        </Link>

        <Link
          to="/recherche?city=Genève"
          className="flex min-w-[165px] shrink-0 items-center gap-2 rounded-2xl px-2 py-1.5 text-slate-900 transition hover:bg-slate-50 xl:min-w-[190px]"
        >
          <MapPin className="h-5 w-5 shrink-0 fill-[#ff3b1c] text-[#ff3b1c]" />
          <span className="min-w-0 leading-tight">
            <span className="block truncate text-sm font-black">Genève</span>
            <span className="block text-[10px] font-medium text-slate-500">Autour de vous</span>
          </span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-700" />
        </Link>

        <form onSubmit={submitSearch} className="relative min-w-[220px] max-w-[460px] flex-1 xl:min-w-[280px]">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-slate-900" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            type="search"
            aria-label="Rechercher un restaurant"
            placeholder="Rechercher un restaurant, une cuisine, un quartier..."
            className="h-[42px] w-full rounded-full border border-slate-200 bg-[#f7f7f7] pl-11 pr-4 text-[12px] font-medium text-slate-800 outline-none transition placeholder:text-slate-500 focus:border-slate-300 focus:bg-white focus:ring-2 focus:ring-orange-100"
          />
        </form>

        <nav className="hidden shrink-0 items-center gap-2 min-[1280px]:flex" aria-label="Raccourcis TOK">
          {activeFeatures.has("ventes-flash") ? (
            <Link to="/ventes-flash" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f7f7f7] px-4 text-[12px] font-black text-[#e93418] transition hover:bg-[#fff0ec]">
              <Flame className="h-[18px] w-[18px] fill-[#ff3b1c] text-[#ff3b1c]" />
              Vente flash
            </Link>
          ) : null}
          {activeFeatures.has("anti-gaspi") ? (
            <Link to="/anti-gaspi" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f7f7f7] px-4 text-[12px] font-black text-slate-900 transition hover:bg-emerald-50">
              <Leaf className="h-[18px] w-[18px] fill-emerald-600 text-emerald-700" />
              Anti gaspi
            </Link>
          ) : null}
          {activeFeatures.has("zero-attente") ? (
            <Link to="/zero-attente" className="inline-flex h-10 items-center gap-2 rounded-full bg-[#f7f7f7] px-4 text-[12px] font-black text-slate-900 transition hover:bg-red-50">
              <AlarmClock className="h-[18px] w-[18px] text-[#ef2416]" />
              Zéro attente
            </Link>
          ) : null}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-1 text-slate-950 xl:gap-1.5">
          <Link to="/profil?tab=favoris" className="inline-flex h-11 items-center gap-2 rounded-full px-2 text-[12px] font-black transition hover:bg-slate-50 xl:px-3">
            <Heart className="h-5 w-5" />
            <span className="hidden 2xl:inline">Favoris</span>
          </Link>
          {activeFeatures.has("reservation") ? (
            <Link to="/reservations" className="inline-flex h-11 items-center gap-2 rounded-full px-2 text-[12px] font-black transition hover:bg-slate-50 xl:px-3">
              <CalendarDays className="h-5 w-5" />
              <span className="hidden 2xl:inline">Mes réservations</span>
            </Link>
          ) : null}
          <Link
            to={user ? "/profil" : "/auth"}
            className="inline-flex h-11 items-center gap-2 rounded-full bg-[#f7f7f7] px-3 text-[12px] font-black transition hover:bg-slate-100 xl:px-4"
          >
            <UserRound className="h-5 w-5" />
            <span className="hidden xl:inline">{user ? "Mon compte" : "Connexion"}</span>
            <ChevronDown className="hidden h-3.5 w-3.5 xl:block" />
          </Link>
        </div>
      </div>
    </header>
  );
}
