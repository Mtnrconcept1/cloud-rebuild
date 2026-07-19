export type DemoWorkspaceSurface = "client" | "restaurant" | "courier";

export type DemoWorkspaceDefinition = {
  surface: DemoWorkspaceSurface;
  label: string;
  shortLabel: string;
  description: string;
  hostname: string;
};

export const DEMO_WORKSPACES: readonly DemoWorkspaceDefinition[] = [
  {
    surface: "client",
    label: "Démo client",
    shortLabel: "Client démo",
    description: "Commandes, réservations et profil client",
    hostname: "demo-client.thetok.ch",
  },
  {
    surface: "restaurant",
    label: "Démo restaurateur",
    shortLabel: "Restaurateur démo",
    description: "Restaurant, commandes et opérations",
    hostname: "demo-restaurateur.thetok.ch",
  },
  {
    surface: "courier",
    label: "Démo livreur",
    shortLabel: "Livreur démo",
    description: "Missions, livraison et gains",
    hostname: "demo-livreur.thetok.ch",
  },
] as const;

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);
const TOK_PREVIEW_HOST = /^cloud-rebuild-recovered-[a-z0-9-]+-mtnrconcepts-projects\.vercel\.app$/i;

export function isDemoWorkspaceSurface(value: string | null): value is DemoWorkspaceSurface {
  return value === "client" || value === "restaurant" || value === "courier";
}

export function getDemoWorkspacePath(surface: DemoWorkspaceSurface) {
  return `/commercial/demo-live?surface=${surface}`;
}

export function getDemoWorkspaceHref(
  surface: DemoWorkspaceSurface,
  hostname = typeof window !== "undefined" ? window.location.hostname : "",
) {
  const normalizedHostname = hostname.toLowerCase().replace(/\.$/, "");
  const workspace = DEMO_WORKSPACES.find((entry) => entry.surface === surface);
  if (!workspace) return getDemoWorkspacePath(surface);

  if (LOCAL_HOSTS.has(normalizedHostname) || TOK_PREVIEW_HOST.test(normalizedHostname)) {
    return getDemoWorkspacePath(surface);
  }

  return `https://${workspace.hostname}/`;
}
