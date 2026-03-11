import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface FeatureFlag {
  id: string;
  name: string;
  label: string;
  description: string;
  isActive: boolean;
}

const DEFAULT_FLAGS: Omit<FeatureFlag, "id">[] = [
  { name: "creneaux-garantis", label: "Creneaux garantis", description: "Livraison ponctuelle ou remboursee", isActive: true },
  { name: "flex-prix-bas", label: "Offres", description: "Fenetre flexible, prix reduit", isActive: true },
  { name: "match-groupes", label: "Match groupes", description: "Commandez ensemble, payez moins", isActive: true },
  { name: "multi-stop", label: "Multi-stop", description: "Un trajet, plusieurs adresses", isActive: true },
  { name: "multi-restaurant", label: "Multi-restos", description: "Plats de differents restos", isActive: true },
  { name: "chefs-table", label: "Chef's Table", description: "Plats off-menu exclusifs", isActive: true },
  { name: "zero-attente", label: "Zero attente", description: "Precommande synchronisee", isActive: true },
  { name: "garantie-qualite", label: "Garantie qualite", description: "Chaud garanti ou rembourse", isActive: true },
  { name: "budget-auto", label: "Budget auto", description: "Menus optimises par objectifs", isActive: true },
  { name: "abonnement", label: "Abonnement", description: "Repas recurrents planifies", isActive: true },
];

function toFallbackFlags() {
  return DEFAULT_FLAGS.map((flag) => ({ ...flag, id: flag.name }));
}

async function fetchFlags(): Promise<FeatureFlag[]> {
  const { data, error } = await supabase
    .from("feature_flags" as any)
    .select("id, name, label, description, is_active")
    .order("created_at", { ascending: true });

  if (error || !data || data.length === 0) {
    return toFallbackFlags();
  }

  return (data as any[]).map((row) => ({
    id: row.id,
    name: row.name,
    label: row.label,
    description: row.description || "",
    isActive: !!row.is_active,
  }));
}

async function upsertFlagsInDb(flags: Omit<FeatureFlag, "id">[]) {
  const payload = flags.map((flag) => ({
    name: flag.name,
    label: flag.label,
    description: flag.description,
    is_active: flag.isActive,
  }));

  await supabase
    .from("feature_flags" as any)
    .upsert(payload as any, { onConflict: "name" });
}

function notifyFlagChange() {
  window.dispatchEvent(new Event("feature-flags-changed"));
}

export function useFeatureFlags() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
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
      upsertFlagsInDb([{
        name: flag.name,
        label: flag.label,
        description: flag.description,
        isActive: nextActive,
      }]);
      notifyFlagChange();

      return prev.map((item) => (item.id === id ? { ...item, isActive: nextActive } : item));
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
    })));
    notifyFlagChange();
  }, [flags]);

  return { flags, toggleFlag, activateAllFlags, loading };
}

export function useActiveFeatures(): Set<string> {
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

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
