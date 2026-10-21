/** Only pages that render CustomerDashboardLayout own their workspace toolbar. */
const CUSTOMER_WORKSPACE_PATHS = new Set([
  "/mon-espace", "/reservations", "/commandes", "/mes-avis",
  "/profil", "/notifications", "/memoire-tok", "/commande/confirmation",
]);

export function isCustomerWorkspacePath(pathname: string) {
  return CUSTOMER_WORKSPACE_PATHS.has(pathname.replace(/\/+$/, "").toLowerCase());
}
