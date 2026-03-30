import { useCallback, useEffect, useMemo, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

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

async function seedMissingDefaultsViaRpc(definitions: FeatureFlagDefinition[]) {
  if (definitions.length === 0) return;

  const payload = definitions.map((definition) => ({
    name: definition.name,
    label: definition.label,
    description: definition.description,
    is_active: definition.defaultEnabled,
  }));

  await (supabase.rpc as any)("admin_seed_default_flags", { p_flags: payload });
}

async function fetchFlags(isAdmin = false): Promise<FeatureFlag[]> {
  try {
    const { data, error } = await supabase
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

async function toggleFlagViaRpc(flagName: string, isActive: boolean): Promise<{ success: boolean; error?: string }> {
  const { error } = await (supabase.rpc as any)("admin_toggle_feature_flag", {
    p_flag_name: flagName,
    p_is_active: isActive,
  });

  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function activateAllViaRpc(): Promise<{ success: boolean; count?: number; error?: string }> {
  const { data, error } = await (supabase.rpc as any)("admin_activate_all_feature_flags");
  if (error) return { success: false, error: error.message };
  return { success: true, count: Number(data || 0) };
}

function notifyFlagChange() {
  window.dispatchEvent(new Event("feature-flags-changed"));
}

export function useFeatureFlags(isAdmin = false) {
  const [flags, setFlags] = useState<FeatureFlag[]>(buildSafeFallbackFlags());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    fetchFlags(isAdmin).then((loadedFlags) => {
      if (cancelled) return;
      setFlags(loadedFlags);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const toggleFlag = useCallback(async (id: string): Promise<{ success: boolean; error?: string }> => {
    const flag = flags.find((entry) => entry.id === id);
    if (!flag) return { success: false, error: "Flag introuvable" };

    const nextExplicitState = !flag.explicitEnabled;
    const result = await toggleFlagViaRpc(flag.name, nextExplicitState);
    if (!result.success) return result;

    setFlags((previousFlags) => {
      const overrides = new Map<string, boolean>([[flag.name, nextExplicitState]]);
      return resolveFlags(rehydrateFlagRows(previousFlags, overrides));
    });
    notifyFlagChange();
    return { success: true };
  }, [flags]);

  const activateAllFlags = useCallback(async (): Promise<{ success: boolean; error?: string }> => {
    const result = await activateAllViaRpc();
    if (!result.success) return result;

    setFlags((previousFlags) => {
      const overrides = new Map(previousFlags.map((flag) => [flag.name, true]));
      return resolveFlags(rehydrateFlagRows(previousFlags, overrides));
    });
    notifyFlagChange();
    return { success: true };
  }, []);

  const featureMap = useMemo(() => buildFeatureMap(flags), [flags]);

  return {
    flags,
    featureMap,
    loading,
    toggleFlag,
    activateAllFlags,
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
