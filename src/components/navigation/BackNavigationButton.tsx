import { ArrowLeft } from "lucide-react";
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type BackNavigationButtonProps = {
  fallback?: string;
  label?: string;
  className?: string;
};

const CUSTOMER_SHELL_PATHS = new Set([
  "/profil",
  "/commandes",
  "/reservations",
  "/notifications",
  "/commande/confirmation",
]);

function getBackFallbackForPathname(pathname: string) {
  if (pathname.startsWith("/admin/compta/")) return "/admin/compta";
  if (pathname.startsWith("/admin/")) return "/admin";
  if (pathname.startsWith("/dashboard/factures/")) return "/dashboard/factures";
  if (pathname.startsWith("/dashboard/")) return "/dashboard";
  if (pathname.startsWith("/courier/")) return "/courier";
  if (pathname.startsWith("/commande/")) return "/commandes";
  return "/";
}

function hasAppHistory() {
  if (typeof window === "undefined") return false;
  const historyIndex = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof historyIndex === "number" && historyIndex > 0;
}

function shouldShowFloatingBackButton(pathname: string) {
  if (pathname === "/" || pathname === "/auth") return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return false;
  if (pathname === "/courier" || pathname.startsWith("/courier/")) return false;
  if (pathname.startsWith("/restaurant/")) return false;
  if (CUSTOMER_SHELL_PATHS.has(pathname)) return false;
  return true;
}

export function BackNavigationButton({
  fallback = "/",
  label = "Retour",
  className,
}: BackNavigationButtonProps) {
  const navigate = useNavigate();

  const handleBack = useCallback(() => {
    if (hasAppHistory()) {
      navigate(-1);
      return;
    }

    navigate(fallback, { replace: true });
  }, [fallback, navigate]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      onClick={handleBack}
      aria-label="Retour à l'écran précédent"
      className={cn(
        "gap-2 rounded-full border border-border/70 bg-background/95 px-3 font-semibold text-foreground shadow-sm backdrop-blur-md hover:bg-background",
        "dark:border-[#5f7aad]/35 dark:bg-[#07142b]/90 dark:text-white dark:shadow-[0_12px_34px_rgba(0,0,0,0.35)] dark:hover:bg-[#0c1b38]",
        className,
      )}
    >
      <ArrowLeft className="h-4 w-4" />
      <span>{label}</span>
    </Button>
  );
}

export function FloatingRouteBackButton() {
  const { pathname } = useLocation();

  if (!shouldShowFloatingBackButton(pathname)) return null;

  return (
    <div className="fixed left-3 top-[calc(env(safe-area-inset-top,0px)+4.75rem)] z-[55] sm:left-4 sm:top-20">
      <BackNavigationButton
        fallback={getBackFallbackForPathname(pathname)}
        className="shadow-[0_14px_34px_rgba(15,23,42,0.16)]"
      />
    </div>
  );
}
