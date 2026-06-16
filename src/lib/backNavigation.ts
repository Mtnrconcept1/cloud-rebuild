const CUSTOMER_SHELL_PATHS = new Set([
  "/profil",
  "/commandes",
  "/reservations",
  "/notifications",
  "/commande/confirmation",
]);

export function shouldShowFloatingBackButton(pathname: string) {
  if (pathname === "/" || pathname === "/auth") return false;
  if (pathname === "/admin" || pathname.startsWith("/admin/")) return false;
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) return false;
  if (pathname === "/courier" || pathname.startsWith("/courier/")) return false;
  if (CUSTOMER_SHELL_PATHS.has(pathname)) return false;
  return true;
}
