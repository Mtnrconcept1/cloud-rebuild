import { Calculator, Check, MapPinned, Menu, PanelsTopLeft } from "lucide-react";
import { useLocation, useNavigate } from "react-router-dom";

import SignOutButton from "@/components/auth/SignOutButton";
import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";
import NotificationBell from "@/components/notifications/NotificationBell";
import RoleSpaceMenuSection from "@/components/navigation/RoleSpaceMenuSection";
import ThemeToggleButton from "@/components/theme/ThemeToggleButton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

const COMMERCIAL_NAV_ITEMS = [
  {
    to: "/commercial",
    label: "Prospection",
    description: "Carte terrain et suivi des signatures",
    icon: MapPinned,
  },
  {
    to: "/commercial/comptabilite",
    label: "Comptabilité",
    description: "Revenus, bonus, primes et réservations",
    icon: Calculator,
  },
  {
    to: "/commercial/demo-live",
    label: "Démo multi-espace",
    description: "Client, restaurant et livraison en temps réel",
    icon: PanelsTopLeft,
  },
] as const;

export default function CommercialWorkspaceChrome({ activeLabel }: { activeLabel: string }) {
  const navigate = useNavigate();
  const location = useLocation();
  const commercialDemoFrame = useCommercialDemoFrame();
  const isEmbeddedCommercial = commercialDemoFrame?.surface === "commercial";
  const visibleNavItems = isEmbeddedCommercial
    ? COMMERCIAL_NAV_ITEMS.filter((item) => item.to !== "/commercial/demo-live")
    : COMMERCIAL_NAV_ITEMS;

  return (
    <>
      <div className="fixed right-[calc(env(safe-area-inset-right,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[1200] flex items-center gap-2">
        <ThemeToggleButton className="h-11 w-11 rounded-full border border-border/70 bg-background/95 text-foreground shadow-sm backdrop-blur-md hover:bg-background dark:border-border dark:bg-card/95 dark:text-white" />
        <NotificationBell />
        {!isEmbeddedCommercial ? <SignOutButton iconOnly /> : null}
      </div>

      <div className="tok-commercial-chrome pointer-events-none fixed left-[calc(env(safe-area-inset-left,0px)+0.75rem)] top-[calc(env(safe-area-inset-top,0px)+0.75rem)] z-[1190]">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="pointer-events-auto flex h-11 w-11 items-center justify-center rounded-[1rem] border border-border bg-card p-1.5 text-foreground shadow-sm ring-1 ring-white/15 backdrop-blur-md transition-transform hover:-translate-y-0.5 sm:h-16 sm:w-auto sm:max-w-[min(18rem,calc(100vw-11rem))] sm:justify-start sm:gap-2.5 sm:rounded-[1.45rem] sm:px-2.5 sm:pr-5"
              aria-label="Ouvrir le menu commercial"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-sm sm:h-11 sm:w-11 sm:rounded-[1rem]">
                <Menu className="h-5 w-5" />
              </span>
              <span className="hidden min-w-0 flex-col items-start leading-tight sm:flex">
                <span className="text-[10px] font-semibold uppercase tracking-[0.28em] text-primary">Commercial</span>
                <span className="max-w-[11rem] truncate text-sm font-semibold">{activeLabel}</span>
              </span>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-[min(20rem,calc(100vw-1.5rem))] rounded-2xl p-2">
            <DropdownMenuLabel>Espace commercial</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {visibleNavItems.map((item) => {
              const Icon = item.icon;
              const selected = location.pathname === item.to || (item.to === "/commercial" && location.pathname === "/commercial/prospection");

              return (
                <DropdownMenuItem
                  key={item.to}
                  onSelect={() => navigate(item.to)}
                  className={cn("gap-3 rounded-xl px-3 py-3", selected && "bg-primary/10 text-primary")}
                >
                  <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-muted", selected && "bg-primary text-primary-foreground")}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{item.label}</span>
                    <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                  </span>
                  {selected ? <Check className="h-4 w-4 shrink-0 text-orange-600" /> : null}
                </DropdownMenuItem>
              );
            })}
            {!isEmbeddedCommercial ? (
              <>
                <DropdownMenuSeparator />
                <RoleSpaceMenuSection className="my-2" onNavigate={() => undefined} />
                <DropdownMenuSeparator />
                <Button type="button" variant="outline" className="mt-1 h-10 w-full justify-start rounded-xl" onClick={() => navigate("/")}>Retour à l'accueil</Button>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </>
  );
}
