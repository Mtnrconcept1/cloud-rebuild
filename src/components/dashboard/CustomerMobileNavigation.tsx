import { useEffect, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetTrigger } from "@/components/ui/sheet";

export default function CustomerMobileNavigation({ shortcuts, children, currentPage }: {
  shortcuts: ReactNode;
  children: ReactNode;
  currentPage?: string;
}) {
  const [open, setOpen] = useState(false);
  const { pathname, search } = useLocation();
  useEffect(() => { setOpen(false); }, [pathname, search]);

  return (
    <nav aria-label="Navigation mobile de l’espace client" className="tok-client-mobile-nav px-3 pt-3 md:hidden">
      <div className="grid grid-cols-5 gap-1">
        {shortcuts}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button type="button" variant="ghost" className="flex h-auto min-h-16 min-w-0 flex-col gap-1 rounded-2xl px-1 py-2 text-[11px]" aria-label="Tous les services de mon espace">
              <Menu className="h-5 w-5" aria-hidden="true" />Menu
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[min(90vw,360px)] overflow-y-auto pb-[calc(env(safe-area-inset-bottom,0px)+1rem)]">
            <SheetHeader className="mb-5 text-left">
              <SheetTitle>Mon espace</SheetTitle>
              <SheetDescription>Retrouvez votre activité, vos avantages et tous les services TOK.</SheetDescription>
            </SheetHeader>
            <div onClick={(event) => {
              if ((event.target as HTMLElement).closest("a")) setOpen(false);
            }}>{children}</div>
          </SheetContent>
        </Sheet>
      </div>
      {currentPage ? <p className="px-2 pb-1 pt-2 text-xs font-semibold text-foreground" aria-current="page">Vous êtes ici : {currentPage}</p> : null}
    </nav>
  );
}
