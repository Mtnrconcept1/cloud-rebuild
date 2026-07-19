import { LogOut } from "lucide-react";

import { Button } from "@/components/ui/button";
import { getCanonicalAuthHref } from "@/lib/authDomains";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { isCommercialDemoFrameWindow } from "@/lib/commercialDemoFrame";

type SignOutButtonProps = {
  className?: string;
  iconOnly?: boolean;
  onSignedOut?: () => void;
};

export default function SignOutButton({
  className,
  iconOnly = false,
  onSignedOut,
}: SignOutButtonProps) {
  const { signOut } = useAuth();
  if (isCommercialDemoFrameWindow()) return null;

  const handleSignOut = async () => {
    await signOut();
    onSignedOut?.();
    window.location.replace(getCanonicalAuthHref());
  };

  return (
    <Button
      type="button"
      variant="ghost"
      size={iconOnly ? "icon" : "default"}
      onClick={handleSignOut}
      aria-label="Déconnexion"
      className={cn(
        iconOnly
          ? "h-11 w-11 rounded-full border border-destructive/20 bg-background/95 text-destructive shadow-[0_14px_34px_rgba(15,23,42,0.16)] backdrop-blur-md hover:bg-destructive/10 hover:text-destructive dark:border-destructive/35 dark:bg-[#07142b]/95 dark:text-red-200 dark:hover:bg-red-500/12 dark:hover:text-red-100"
          : "gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive",
        className,
      )}
    >
      <LogOut className="h-4 w-4" />
      {!iconOnly ? (
        <span>Déconnexion</span>
      ) : (
        <span className="sr-only">Déconnexion</span>
      )}
    </Button>
  );
}
