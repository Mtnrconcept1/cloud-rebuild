import { useEffect, type ComponentType } from "react";
import {
  Bike,
  BriefcaseBusiness,
  ChevronRight,
  LayoutDashboard,
  Shield,
  Sparkles,
  Store,
  User,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

import SignOutButton from "@/components/auth/SignOutButton";
import { Badge } from "@/components/ui/badge";
import { getAdminNavigationHref } from "@/lib/adminDomains";
import { getWorkspaceChooserHref, isCanonicalAuthHost } from "@/lib/authDomains";
import { useAuth, type UserRole } from "@/lib/auth-context";
import { getCommercialNavigationHref } from "@/lib/commercialDomains";
import {
  DEMO_WORKSPACES,
  getDemoMultiWorkspaceHref,
  getDemoWorkspaceHref,
  type DemoWorkspaceSurface,
} from "@/lib/demoWorkspaces";
import { getEffectiveRoles, getRoleHomePath } from "@/lib/roleAccess";
import { cn } from "@/lib/utils";

type WorkspaceCard = {
  key: string;
  label: string;
  description: string;
  kind: "real" | "demo";
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  hostname: string;
};

const ROLE_ORDER: UserRole[] = ["admin", "commercial", "restaurateur", "courier", "client"];

const ROLE_PRESENTATION: Record<UserRole, {
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}> = {
  admin: {
    label: "Dashboard admin",
    description: "Supervision de la plateforme et opérations réelles",
    icon: Shield,
  },
  commercial: {
    label: "Dashboard commercial",
    description: "Prospection, signatures et suivi commercial",
    icon: BriefcaseBusiness,
  },
  restaurateur: {
    label: "Dashboard restaurateur",
    description: "Restaurant, commandes et outils opérationnels",
    icon: Store,
  },
  courier: {
    label: "Dashboard livreur",
    description: "Missions, livraisons et revenus",
    icon: Bike,
  },
  client: {
    label: "Espace client",
    description: "Commandes, réservations et profil",
    icon: User,
  },
};

const DEMO_ICONS: Record<DemoWorkspaceSurface, ComponentType<{ className?: string }>> = {
  client: User,
  restaurant: Store,
  courier: Bike,
};

function getRealWorkspaceHref(role: UserRole) {
  if (role === "admin") return getAdminNavigationHref("/admin");
  if (role === "commercial") return getCommercialNavigationHref("/commercial");
  return getRoleHomePath(role);
}

function getTargetHostname(target: string) {
  if (typeof window === "undefined") return "TOK";
  return new URL(target, window.location.origin).hostname;
}

export default function WorkspaceChooser() {
  const navigate = useNavigate();
  const { user, roles, switchRole } = useAuth();
  const effectiveRoles = getEffectiveRoles(roles);
  const canAccessDemo = effectiveRoles.includes("admin") || effectiveRoles.includes("commercial");

  useEffect(() => {
    if (typeof window === "undefined" || isCanonicalAuthHost(window.location.hostname)) return;
    const target = getWorkspaceChooserHref();
    if (/^https:\/\//.test(target)) window.location.replace(target);
  }, []);

  const openTarget = (target: string) => {
    const url = new URL(target, window.location.origin);
    if (url.origin !== window.location.origin) {
      window.location.assign(url.href);
      return;
    }
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };

  const realCards: WorkspaceCard[] = ROLE_ORDER
    .filter((candidateRole) => effectiveRoles.includes(candidateRole))
    .map((candidateRole) => {
      const presentation = ROLE_PRESENTATION[candidateRole];
      const target = getRealWorkspaceHref(candidateRole);
      return {
        key: `real:${candidateRole}`,
        ...presentation,
        kind: "real" as const,
        hostname: getTargetHostname(target),
        onSelect: () => {
          switchRole(candidateRole);
          openTarget(target);
        },
      };
    });

  const demoCards: WorkspaceCard[] = canAccessDemo
    ? [
      ...DEMO_WORKSPACES.map((workspace) => {
        const target = getDemoWorkspaceHref(workspace.surface);
        return {
          key: `demo:${workspace.surface}`,
          label: workspace.label,
          description: workspace.description,
          kind: "demo" as const,
          icon: DEMO_ICONS[workspace.surface],
          hostname: workspace.hostname,
          onSelect: () => openTarget(target),
        };
      }),
      {
        key: "demo:multi-dashboard",
        label: "Démo multi-dashboard",
        description: "Client, restaurateur et livreur simultanément",
        kind: "demo" as const,
        icon: LayoutDashboard,
        hostname: getTargetHostname(getDemoMultiWorkspaceHref()),
        onSelect: () => openTarget(getDemoMultiWorkspaceHref()),
      },
    ]
    : [];

  const renderCard = (card: WorkspaceCard) => {
    const Icon = card.icon;
    return (
      <button
        key={card.key}
        type="button"
        onClick={card.onSelect}
        className={cn(
          "group flex min-h-32 w-full items-center gap-4 rounded-3xl border p-5 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500",
          card.kind === "demo"
            ? "border-orange-200 bg-gradient-to-br from-orange-50 to-amber-50 dark:border-orange-400/25 dark:from-orange-400/10 dark:to-amber-400/5"
            : "border-border/70 bg-background/95",
        )}
      >
        <span className={cn(
          "flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl",
          card.kind === "demo" ? "bg-orange-500 text-white" : "bg-primary/10 text-primary",
        )}>
          <Icon className="h-6 w-6" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-black">{card.label}</span>
            {canAccessDemo ? (
              <Badge variant="outline" className="rounded-full text-[10px] uppercase tracking-wider">
                {card.kind === "demo" ? "Démo isolée" : "Données réelles"}
              </Badge>
            ) : null}
          </span>
          <span className="mt-1 block text-sm text-muted-foreground">{card.description}</span>
          <span className="mt-2 block truncate text-xs font-semibold text-muted-foreground/80">{card.hostname}</span>
        </span>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" />
      </button>
    );
  };

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.16),transparent_38%),linear-gradient(135deg,#fff7ed_0%,#f8fafc_52%,#eef6ff_100%)] px-4 py-[max(2rem,env(safe-area-inset-top))] dark:bg-[radial-gradient(circle_at_top_left,rgba(255,106,26,0.16),transparent_38%),linear-gradient(135deg,#020617_0%,#0f172a_58%,#08111f_100%)]">
      <div className="mx-auto max-w-5xl">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <Badge className="mb-3 rounded-full bg-orange-500 text-white hover:bg-orange-500">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" />Session TOK sécurisée
            </Badge>
            <h1 className="font-serif text-3xl font-black tracking-tight sm:text-4xl">Choisissez votre espace</h1>
            <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
              {canAccessDemo
                ? `Connecté en tant que ${user?.email || "utilisateur TOK"}. Les environnements de travail et de présentation restent clairement séparés.`
                : `Connecté en tant que ${user?.email || "utilisateur TOK"}. Sélectionnez l’espace que vous souhaitez ouvrir.`}
            </p>
          </div>
          <SignOutButton iconOnly />
        </header>

        <section aria-labelledby="real-workspaces-title">
          <h2 id="real-workspaces-title" className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-primary">
            {canAccessDemo ? "Accès réel" : "Vos espaces"}
          </h2>
          <div className="grid gap-3 md:grid-cols-2">{realCards.map(renderCard)}</div>
        </section>

        {demoCards.length > 0 ? (
          <section className="mt-8" aria-labelledby="demo-workspaces-title">
            <h2 id="demo-workspaces-title" className="mb-3 text-xs font-black uppercase tracking-[0.2em] text-orange-600">Accès démo</h2>
            <div className="grid gap-3 md:grid-cols-2">{demoCards.map(renderCard)}</div>
          </section>
        ) : null}
      </div>
    </main>
  );
}
