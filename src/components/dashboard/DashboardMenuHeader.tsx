import { SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useTokLogoSrc } from "@/hooks/useTokLogo";
import "./DashboardMenu.css";

export default function DashboardMenuHeader({ space, description }: { space: string; description: string }) {
  const logoSrc = useTokLogoSrc();
  return (
    <SheetHeader className="tok-menu-header text-left">
      <div className="tok-menu-brand">
        <span className="tok-menu-logo"><img src={logoSrc} alt="TOK" width={64} height={58} /></span>
        <div className="min-w-0">
          <p className="tok-menu-eyebrow">{space}</p>
          <SheetTitle className="tok-menu-title">Menu principal</SheetTitle>
        </div>
      </div>
      <SheetDescription className="sr-only">{description}</SheetDescription>
    </SheetHeader>
  );
}
