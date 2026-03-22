import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export type FeatureFlagGroup = "application" | "growth" | "exclusive" | "custom";

interface FeatureFlagDefinition {
  name: string;
  label: string;
  description: string;
  isActive: boolean;
  group: FeatureFlagGroup;
}

export interface FeatureFlag extends FeatureFlagDefinition {
  id: string;
}

export const FEATURE_FLAG_GROUP_LABELS: Record<FeatureFlagGroup, string> = {
  application: "Modules applicatifs",
  growth: "Acquisition et pilotage",
  exclusive: "Exclusivites client",
  custom: "Autres flags",
};

export const FEATURE_FLAG_GROUP_DESCRIPTIONS: Record<FeatureFlagGroup, string> = {
  application: "Active ou masque les briques visibles du parcours client, restaurateur et livreur.",
  growth: "Controle les leviers marketing, sponsorises et les vues de performance.",
  exclusive: "Pilote les experiences premium ou experimentales exposees cote client.",
  custom: "Flags trouves en base mais non catalogues dans le frontend.",
};

export const FEATURE_FLAG_GROUP_ORDER: FeatureFlagGroup[] = [
  "application",
  "growth",
  "exclusive",
  "custom",
];

const DEFAULT_FLAGS: FeatureFlagDefinition[] = [
  {
    name: "livraison",
    label: "Livraison",
    description: "Affiche la livraison dans les parcours client et restaurateur.",
    isActive: true,
    group: "application",
  },
  {
    name: "commandes",
    label: "Mes commandes",
    description: "Affiche la page Mes commandes pour les clients et le suivi des commandes dans le dashboard restaurateur.",
    isActive: true,
    group: "application",
  },
  {
    name: "espace-livreur",
    label: "Espace livreur",
    description: "Expose les routes et acces dedies aux livreurs.",
    isActive: true,
    group: "application",
  },
  {
    name: "anti-gaspi",
    label: "Anti-gaspi",
    description: "Active la page anti-gaspi et sa gestion cote restaurateur.",
    isActive: true,
    group: "application",
  },
  {
    name: "ventes-flash",
    label: "Ventes flash",
    description: "Active les drops time-boxes dans le parcours client et restaurant.",
    isActive: true,
    group: "application",
  },
  {
    name: "campagnes-pub",
    label: "Campagnes pub",
    description: "Active les banners sponsorisees, mises en avant et campagnes marketing.",
    isActive: true,
    group: "growth",
  },
  {
    name: "performances",
    label: "Performances",
    description: "Affiche les ecrans de performance et de comparaison du dashboard restaurateur.",
    isActive: true,
    group: "growth",
  },
  {
    name: "creneaux-garantis",
    label: "Creneaux garantis",
    description: "Livraison ponctuelle ou remboursee",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "flex-prix-bas",
    label: "Offres",
    description: "Fenetre flexible, prix reduit",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "match-groupes",
    label: "Match groupes",
    description: "Commandez ensemble, payez moins",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "multi-stop",
    label: "Multi-stop",
    description: "Un trajet, plusieurs adresses",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "multi-restaurant",
    label: "Multi-restos",
    description: "Plats de differents restos",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "chefs-table",
    label: "Chef's Table",
    description: "Plats off-menu exclusifs",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "zero-attente",
    label: "Zero attente",
    description: "Precommande synchronisee",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "garantie-qualite",
    label: "Garantie qualite",
    description: "Chaud garanti ou rembourse",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "budget-auto",
    label: "Budget auto",
    description: "Menus optimises par objectifs",
    isActive: true,
    group: "exclusive",
  },
  {
    name: "abonnement",
    label: "Abonnement",
    description: "Repas recurrents planifies",
    isActive: true,
    group: "exclusive",
  },
];

const DEFAULT_FLAG_MAP = new Map(DEFAULT_FLAGS.map((flag) => [flag.name, flag]));

function toFallbackFlags() {
  return DEFAULT_FLAGS.map((flag) => ({ ...flag, id: flag.name }));
}

function toDbPayload(flags: FeatureFlagDefinition[]) {
  return flags.map((flag) => ({
    name: flag.name,
    label: flag.label,
    description: flag.description,
    is_active: flag.isActive,
  }));
}

function mergeFlags(rows: any[]): FeatureFlag[] {
  const rowsByName = new Map(
    (rows || []).map((row) => [String(row.name || ""), row]),
  );

  const mergedDefaults = DEFAULT_FLAGS.map((flag) => {
    const row = rowsByName.get(flag.name);
    return {
      id: row?.id || flag.name,
      name: flag.name,
      label: row?.label || flag.label,
      description: row?.description || flag.description,
      isActive: row?.is_active ?? flag.isActive,
      group: flag.group,
    } satisfies FeatureFlag;
  });

  const customFlags = (rows || [])
    .filter((row) => !DEFAULT_FLAG_MAP.has(String(row.name || "")))
    .map((row) => ({
      id: row.id,
      name: row.name,
      label: row.label || row.name,
      description: row.description || "",
      isActive: !!row.is_active,
      group: "custom" as const,
    }));

  return [...mergedDefaults, ...customFlags];
}

async function fetchFlags(): Promise<FeatureFlag[]> {
  const { data, error } = await supabase
    .from("feature_flags" as any)
    .select("id, name, label, description, is_active")
    .order("created_at", { ascending: true });

  if (error || !data) {
    return toFallbackFlags();
  }

  const mergedFlags = mergeFlags(data as any[]);
  const existingNames = new Set((data as any[]).map((row) => String(row.name || "")));
  const missingDefaults = DEFAULT_FLAGS.filter((flag) => !existingNames.has(flag.name));

  if (missingDefaults.length > 0) {
    await supabase
      .from("feature_flags" as any)
      .upsert(toDbPayload(missingDefaults) as any, { onConflict: "name" });
  }

  return mergedFlags;
}

async function upsertFlagsInDb(flags: FeatureFlagDefinition[]) {
  await supabase
    .from("feature_flags" as any)
    .upsert(toDbPayload(flags) as any, { onConflict: "name" });
}

function notifyFlagChange() {
  window.dispatchEvent(new Event("feature-flags-changed"));
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>(toFallbackFlags());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFlags().then((loadedFlags) => {
      setFlags(loadedFlags);
      setLoading(false);
    });
  }, []);

  const toggleFlag = useCallback((id: string) => {
    setFlags((prev) => {
      const flag = prev.find((item) => item.id === id);
      if (!flag) return prev;

      const nextActive = !flag.isActive;

      // Cascade: disabling "livraison" also disables "commandes"
      const cascadeOff =
        flag.name === "livraison" && !nextActive
          ? prev.filter((item) => item.name === "commandes" && item.isActive)
          : [];

      const flagsToUpsert = [
        { name: flag.name, label: flag.label, description: flag.description, isActive: nextActive, group: flag.group },
        ...cascadeOff.map((item) => ({ name: item.name, label: item.label, description: item.description, isActive: false, group: item.group })),
      ];

      void upsertFlagsInDb(flagsToUpsert).catch(() => undefined);
      notifyFlagChange();

      const cascadeIds = new Set(cascadeOff.map((item) => item.id));
      return prev.map((item) =>
        item.id === id
          ? { ...item, isActive: nextActive }
          : cascadeIds.has(item.id)
            ? { ...item, isActive: false }
            : item,
      );
    });
  }, []);

  const activateAllFlags = useCallback(async () => {
    const nextFlags = flags.length > 0
      ? flags.map((flag) => ({ ...flag, isActive: true }))
      : toFallbackFlags();

    setFlags(nextFlags);
    await upsertFlagsInDb(nextFlags.map((flag) => ({
      name: flag.name,
      label: flag.label,
      description: flag.description,
      isActive: true,
      group: flag.group,
    })));
    notifyFlagChange();
  }, [flags]);

  return { flags, toggleFlag, activateAllFlags, loading };
}

export function useActiveFeatures(): Set<string> {
  const [activeIds, setActiveIds] = useState<Set<string>>(
    new Set(toFallbackFlags().filter((flag) => flag.isActive).map((flag) => flag.name)),
  );

  useEffect(() => {
    fetchFlags().then((loadedFlags) => {
      setActiveIds(new Set(loadedFlags.filter((flag) => flag.isActive).map((flag) => flag.name)));
    });

    const handler = () => {
      fetchFlags().then((loadedFlags) => {
        setActiveIds(new Set(loadedFlags.filter((flag) => flag.isActive).map((flag) => flag.name)));
      });
    };

    window.addEventListener("feature-flags-changed", handler);
    return () => window.removeEventListener("feature-flags-changed", handler);
  }, []);

  return activeIds;
}

export const FEATURE_ROUTE_MAP: Record<string, string> = {
  "creneaux-garantis": "/creneaux-garantis",
  "flex-prix-bas": "/flex-prix-bas",
  "match-groupes": "/match-groupes",
  "multi-stop": "/multi-stop",
  "multi-restaurant": "/multi-restaurant",
  "chefs-table": "/chefs-table",
  "zero-attente": "/zero-attente",
  "garantie-qualite": "/garantie-qualite",
  "budget-auto": "/budget-auto",
  "abonnement": "/abonnement",
};
