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
    { name: "creneaux-garantis", label: "Créneaux garantis", description: "Livraison ponctuelle ou remboursé", isActive: true },
    { name: "flex-prix-bas", label: "Offres", description: "Fenêtre flexible, prix réduit", isActive: true },
    { name: "match-groupes", label: "Match groupes", description: "Commandez ensemble, payez moins", isActive: true },
    { name: "multi-stop", label: "Multi-stop", description: "Un trajet, plusieurs adresses", isActive: true },
    { name: "multi-restaurant", label: "Multi-restos", description: "Plats de différents restos", isActive: true },
    { name: "chefs-table", label: "Chef's Table", description: "Plats off-menu exclusifs", isActive: true },
    { name: "zero-attente", label: "Zéro attente", description: "Précommande synchronisée", isActive: true },
    { name: "garantie-qualite", label: "Garantie qualité", description: "Chaud garanti ou remboursé", isActive: true },
    { name: "budget-auto", label: "Budget auto", description: "Menus optimisés par objectifs", isActive: true },
    { name: "abonnement", label: "Abonnement", description: "Repas récurrents planifiés", isActive: true },
];

async function fetchFlags(): Promise<FeatureFlag[]> {
    const { data, error } = await supabase
        .from("feature_flags" as any)
        .select("id, name, label, description, is_active")
        .order("created_at", { ascending: true });

    if (error || !data || data.length === 0) {
        // Fallback: return defaults with name as id
        return DEFAULT_FLAGS.map((f) => ({ ...f, id: f.name }));
    }

    return (data as any[]).map((row) => ({
        id: row.id,
        name: row.name,
        label: row.label,
        description: row.description || "",
        isActive: row.is_active,
    }));
}

async function updateFlagInDb(id: string, isActive: boolean) {
    await supabase
        .from("feature_flags" as any)
        .update({ is_active: isActive } as any)
        .eq("id", id);
}

export function useFeatureFlags() {
    const [flags, setFlags] = useState<FeatureFlag[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetchFlags().then((f) => {
            setFlags(f);
            setLoading(false);
        });
    }, []);

    const toggleFlag = useCallback((id: string) => {
        setFlags((prev) => {
            const flag = prev.find((f) => f.id === id);
            if (!flag) return prev;
            const newActive = !flag.isActive;
            // Persist to DB (fire-and-forget, optimistic update)
            updateFlagInDb(id, newActive);
            // Notify other hooks in the same tab
            window.dispatchEvent(new Event("feature-flags-changed"));
            return prev.map((f) => (f.id === id ? { ...f, isActive: newActive } : f));
        });
    }, []);

    return { flags, toggleFlag, loading };
}

export function useActiveFeatures(): Set<string> {
    const [activeIds, setActiveIds] = useState<Set<string>>(new Set());

    useEffect(() => {
        fetchFlags().then((flags) => {
            setActiveIds(new Set(flags.filter((f) => f.isActive).map((f) => f.name)));
        });

        const handler = () => {
            fetchFlags().then((flags) => {
                setActiveIds(new Set(flags.filter((f) => f.isActive).map((f) => f.name)));
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
