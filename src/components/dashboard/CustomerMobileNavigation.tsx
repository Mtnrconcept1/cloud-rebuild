import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import DashboardMenuHeader from "./DashboardMenuHeader";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

export default function CustomerMobileNavigation({ shortcuts, children, currentPage, footer }: {
  shortcuts: ReactNode;
  children: ReactNode;
  currentPage?: string;
  footer?: ReactNode | ((close: () => void) => ReactNode);
}) {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname, search]);

  return (
    <nav aria-label="Navigation mobile de l’espace client" className="tok-client-mobile-nav px-3 pt-3 md:hidden">
      <div className="grid grid-cols-4 gap-1">
        {shortcuts}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" className="tok-menu-hamburger" aria-label="Ouvrir le menu client" data-testid="customer-mobile-menu-trigger">
              <Menu className="h-5 w-5" aria-hidden="true" />Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="tok-dashboard-menu tok-mobile-dashboard-menu" data-testid="customer-mobile-menu-panel">
            <DashboardMenuHeader space="Espace client" description="Retrouvez votre activité, vos avantages et tous les services TOK." />
            <div data-sheet-scroll-area className="tok-menu-scroll" onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}><nav aria-label="Tous les services de l’espace client">{children}</nav>{typeof footer === "function" ? footer(() => setOpen(false)) : footer}</div>
          </SheetContent>
        </Sheet>
      </div>
      {currentPage ? <p className="px-2 pb-1 pt-2 text-xs font-semibold text-foreground" aria-current="page">Vous êtes ici : {currentPage}</p> : null}
    </nav>
  );
}
