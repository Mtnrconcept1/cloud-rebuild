import { isCustomerWorkspacePath } from "@/lib/customerWorkspaceRoutes";

export function shouldShowFloatingBackButton(pathname: string) {
  const normalizedPathname = pathname.replace(/\/+$/, "").toLowerCase() || "/";

  if (normalizedPathname === "/" || normalizedPathname === "/auth") return false;
  if (normalizedPathname === "/admin" || normalizedPathname.startsWith("/admin/")) return false;
  if (normalizedPathname === "/dashboard" || normalizedPathname.startsWith("/dashboard/")) return false;
  if (normalizedPathname === "/courier" || normalizedPathname.startsWith("/courier/")) return false;
  if (isCustomerWorkspacePath(normalizedPathname)) return false;
  return true;
}
