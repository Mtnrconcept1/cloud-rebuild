import { useCallback, useEffect, useMemo, useState } from "react";

import { getSupabase } from "@/integrations/supabase/client";

import {
  buildFeatureMap,
  buildSafeFallbackFlags,
  FEATURE_DEFINITIONS,
  FEATURE_FLAG_GROUP_DESCRIPTIONS,
  FEATURE_FLAG_GROUP_LABELS,
  FEATURE_FLAG_GROUP_ORDER,
  FEATURE_ROUTE_MAP,
  getFeatureDefinition,
  getFeatureNameForRoute,
  isFeatureEnabled,
  isFeatureExplicitlyEnabled,
  rehydrateFlagRows,
  resolveFlags,
  type FeatureFlag,
  type FeatureFlagDefinition,
  type FeatureFlagGroup,
  type FeatureFlagRow,
} from "@/lib/featureCatalog";

export type {
  FeatureFlag,
  FeatureFlagDefinition,
  FeatureFlagGroup,
  FeatureFlagRow,
};

export {
  FEATURE_DEFINITIONS,
  FEATURE_FLAG_GROUP_DESCRIPTIONS,
  FEATURE_FLAG_GROUP_LABELS,
  FEATURE_FLAG_GROUP_ORDER,
  FEATURE_ROUTE_MAP,
  getFeatureDefinition,
  getFeatureNameForRoute,
};

export type FeatureFlagPreset = {
  name: string;
  label: string;
  description: string;
  routes: string[];
  flags: Record<string, boolean>;
};

export type FeatureFlagAuditLog = {
  id: string;
  flag_name: string;
  previous_state: boolean | null;
  new_state: boolean | null;
  reason: string | null;
  preset_name: string | null;
  admin_user_id: string | null;
  created_at: string;
};

export const FEATURE_FLAG_PRESETS: FeatureFlagPreset[] = [
  {
    name: "production stable",
    label: "production stable",
    description: "Active le parcours marketplace standard et les outils admin principaux.",
    routes: ["/", "/recherche", "/panier", "/commandes", "/reservations", "/dashboard", "/admin"],
    flags: {
      "payment-card": true,
      commandes: true,
      livraison: true,
      emporter: true,
      reservation: true,
      "dashboard-restaurateur": true,
      "admin-compta": true,
      "admin-notifications": true,
    },
  },
  {
    name: "preview",
    label: "preview",
    description: "Active les modules en observation sans couper les parcours coeur.",
    routes: ["/actualites", "/tok-one", "/dashboard/actualites", "/admin/actualites"],
    flags: {
      "actualites-sociales": true,
      "dashboard-actualites": true,
      "tok-one": true,
      "admin-actualites": true,
    },
  },
  {
    name: "maintenance paiements",
    label: "maintenance paiements",
    description: "Coupe les paiements carte et les checkouts sensibles, garde la consultation ouverte.",
    routes: ["/panier", "/commande/confirmation", "/tok-one", "/dashboard/campagnes"],
    flags: {
      "payment-card": false,
      "payment-twint": false,
      "payment-postfinance-card": false,
      "payment-postfinance-efinance": false,
      "tok-one": false,
      "campagnes-pub": false,
    },
  },
  {
    name: "maintenance livraison",
    label: "maintenance livraison",
    description: "Coupe livraison, dispatch et coursiers tout en gardant emporter et reservation.",
    routes: ["/multi-stop", "/multi-restaurant", "/courier", "/dashboard/commandes"],
    flags: {
      livraison: false,
      "espace-livreur": false,
      "courier-home": false,
      "courier-jobs": false,
      emporter: true,
      reservation: true,
    },
  },
  {
    name: "mode lecture seule",
    label: "mode lecture seule",
    description: "Limite les actions transactionnelles, conserve les pages de lecture et d'administration.",
    routes: ["/recherche", "/restaurant/:id", "/admin", "/dashboard"],
    flags: {
      commandes: false,
      livraison: false,
      emporter: false,
      reservation: false,
      "payment-card": false,
      "payment-cash": false,
      "dashboard-commandes": false,
      "dashboard-reservations": false,
    },
  },
];

export function validateFeatureFlagPreset(preset: FeatureFlagPreset, flags: FeatureFlag[]) {
  const current = new Map(flags.map((flag) => [flag.name, flag]));
  const warnings: string[] = [];
  const next = new Map(flags.map((flag) => [flag.name, flag.explicitEnabled]));

  Object.entries(preset.flags).forEach(([name, enabled]) => next.set(name, enabled));

  if (next.get("payment-card") && next.get("commandes") === false) {
    warnings.push("Paiement actif mais checkout/commandes désactivé.");
  }

  if (next.get("actualites-sociales") && current.has("tracking") && next.get("tracking") === false) {
    warnings.push("Actualités sponsorisées actives sans tracking.");
  }

  const missingFlags = Object.keys(preset.flags).filter((name) => !current.has(name));
  if (missingFlags.length > 0) {
    warnings.push(`Flags absents du catalogue: ${missingFlags.join(", ")}.`);
  }

  return warnings;
}

async function seedMissingDefaultsViaRpc(definitions: FeatureFlagDefinition[]) {
  if (definitions.length === 0) return;

  const payload = definitions.map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    is_active: definition.defaultEnabled,
  }));

  await (getSupabase().rpc as any)("admin_seed_default_flags", { p_flags: payload });
}

async function fetchFlags(isAdmin = false): Promise<FeatureFlag[]> {
  try {
    const { data, error } = await getSupabase()
      .from("feature_flags")
      .select("id, name, label, description, is_active")
      .order("created_at", { ascending: true });

    if (error || !Array.isArray(data)) {
      return buildSafeFallbackFlags();
    }

    const rows = data as FeatureFlagRow[];
    const existingNames = new Set(rows.map((row) => String(row.name || "")));
    const missingDefaults = FEATURE_DEFINITIONS.filter((definition) => !existingNames.has(definition.name));

    if (missingDefaults.length > 0 && isAdmin) {
      await seedMissingDefaultsViaRpc(missingDefaults);
    }

    return resolveFlags(rows);
  } catch {
    return buildSafeFallbackFlags();
  }
}

async function toggleFlagViaRpc(
  flagName: string,
  isActive: boolean,
  reason?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await (getSupabase().rpc as any)("admin_toggle_feature_flag", {
    p_flag_name: flagName,
    p_is_active: isActive,
    p_reason: reason || null,
    p_preset_name: null,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function activateAllViaRpc(): Promise<{ success: boolean; count?: number; error?: string }> {
  const { data, error } = await (getSupabase().rpc as any)("admin_activate_all_feature_flags");
  if (error) return { success: false, error: error.message };
  return { success: true, count: Number(data || 0) };
}

async function fetchFeatureFlagAuditLogs(): Promise<FeatureFlagAuditLog[]> {
  const { data, error } = await (getSupabase().rpc as any)("admin_get_feature_flag_audit_logs", {
    p_limit: 80,
  });
  if (error) return [];
  return (data || []) as FeatureFlagAuditLog[];
}

async function applyPresetViaRpc(
  presetName: string,
  reason: string,
): Promise<{ success: boolean; error?: string }> {
  const { error } = await (getSupabase().rpc as any)("admin_apply_feature_flag_preset", {
    p_preset_name: presetName,
    p_reason: reason,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

function notifyFlagChange() {
  window.dispatchEvent(new Event("feature-flags-changed"));
}

export function useFeatureFlags(isAdmin = false) {
  const [flags, setFlags] = useState<FeatureFlag[]>(buildSafeFallbackFlags());
  const [flagAuditLogs, setFlagAuditLogs] = useState<FeatureFlagAuditLog[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchFlags(isAdmin).then((loadedFlags) => {
      if (cancelled) return;
      setFlags(loadedFlags);
      setLoading(false);
    });

    if (isAdmin) {
      fetchFeatureFlagAuditLogs().then((logs) => {
        if (cancelled) return;
        setFlagAuditLogs(logs);
      });
    }

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const refreshAuditLogs = useCallback(async () => {
    if (!isAdmin) return;
    setFlagAuditLogs(await fetchFeatureFlagAuditLogs());
  }, [isAdmin]);

  const toggleFlag = useCallback(async (
    id: string,
    reason?: string | null,
  ): Promise<{ success: boolean; error?: string }> => {
    const flag = flags.find((entry) => entry.id === id);
    if (!flag) return { success: false, error: "Flag introuvable" };

    const nextExplicitState = !flag.explicitEnabled;
    const result = await toggleFlagViaRpc(flag.name, nextExplicitState, reason);
    if (!result.success) return result;

    setFlags((previousFlags) => {
      const overrides = new Map<string, boolean>([[flag.name, nextExplicitState]]);
      return resolveFlags(rehydrateFlagRows(previousFlags, overrides));
    });
    void refreshAuditLogs();
    notifyFlagChange();
    return { success: true };
  }, [flags, refreshAuditLogs]);

  const activateAllFlags = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await activateAllViaRpc();
    if (!result.success) return result;

    setFlags((previousFlags) => {
      const overrides = new Map(previousFlags.map((flag) => [flag.name, true]));
      return resolveFlags(rehydrateFlagRows(previousFlags, overrides));
    });
    void refreshAuditLogs();
    notifyFlagChange();
    return { success: true };
  }, [refreshAuditLogs]);

  const applyFeatureFlagPreset = useCallback(async (
    presetName: string,
    reason: string,
  ): Promise<{ success: boolean; error?: string }> => {
    const result = await applyPresetViaRpc(presetName, reason);
    if (!result.success) return result;

    const loadedFlags = await fetchFlags(isAdmin);
    setFlags(loadedFlags);
    await refreshAuditLogs();
    notifyFlagChange();
    return { success: true };
  }, [isAdmin, refreshAuditLogs]);

  const featureMap = useMemo(() => buildFeatureMap(flags), [flags]);

  return {
    flags,
    flagAuditLogs,
    featureMap,
    loading,
    toggleFlag,
    activateAllFlags,
    applyFeatureFlagPreset,
    isEnabled: (featureName: string) => isFeatureEnabled(featureMap, featureName),
    isExplicitlyEnabled: (featureName: string) => isFeatureExplicitlyEnabled(featureMap, featureName),
  };
}

export function useFeatureFlagSnapshot(): {
  activeFeatures: Set<string>;
  flags: FeatureFlag[];
  featureMap: Map<string, FeatureFlag>;
  loading: boolean;
  isEnabled: (featureName: string) => boolean;
  isExplicitlyEnabled: (featureName: string) => boolean;
} {
  const [flags, setFlags] = useState<FeatureFlag[]>(buildSafeFallbackFlags());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const loadFlags = () => {
      fetchFlags().then((loadedFlags) => {
        if (cancelled) return;
        setFlags(loadedFlags);
        setLoading(false);
      });
    };

    loadFlags();
    window.addEventListener("feature-flags-changed", loadFlags);

    return () => {
      cancelled = true;
      window.removeEventListener("feature-flags-changed", loadFlags);
    };
  }, []);

  const featureMap = useMemo(() => buildFeatureMap(flags), [flags]);
  const activeFeatures = useMemo(
    () => new Set(flags.filter((flag) => flag.effectiveEnabled).map((flag) => flag.name)),
    [flags],
  );

  return {
    activeFeatures,
    flags,
    featureMap,
    loading,
    isEnabled: (featureName: string) => isFeatureEnabled(featureMap, featureName),
    isExplicitlyEnabled: (featureName: string) => isFeatureExplicitlyEnabled(featureMap, featureName),
  };
}

export function useActiveFeatures(): Set<string> {
  return useFeatureFlagSnapshot().activeFeatures;
}
