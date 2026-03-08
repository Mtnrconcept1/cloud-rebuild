import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "miamz-feature-flags";

export interface FeatureFlag {
    id: string;
    label: string;
    description: string;
    isActive: boolean;
}

const DEFAULT_FLAGS: FeatureFlag[] = [
    { id: "creneaux-garantis", label: "Créneaux garantis", description: "Livraison ponctuelle ou remboursé", isActive: true },
    { id: "flex-prix-bas", label: "Offres", description: "Fenêtre flexible, prix réduit", isActive: true },
    { id: "match-groupes", label: "Match groupes", description: "Commandez ensemble, payez moins", isActive: true },
    { id: "multi-stop", label: "Multi-stop", description: "Un trajet, plusieurs adresses", isActive: true },
    { id: "multi-restaurant", label: "Multi-restos", description: "Plats de différents restos", isActive: true },
    { id: "chefs-table", label: "Chef's Table", description: "Plats off-menu exclusifs", isActive: true },
    { id: "zero-attente", label: "Zéro attente", description: "Précommande synchronisée", isActive: true },
    { id: "garantie-qualite", label: "Garantie qualité", description: "Chaud garanti ou remboursé", isActive: true },
    { id: "budget-auto", label: "Budget auto", description: "Menus optimisés par objectifs", isActive: true },
    { id: "abonnement", label: "Abonnement", description: "Repas récurrents planifiés", isActive: true },
];

function loadFlags(): FeatureFlag[] {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
            const saved: FeatureFlag[] = JSON.parse(raw);
            return DEFAULT_FLAGS.map((def) => {
                const found = saved.find((s) => s.id === def.id);
                return found ? { ...def, isActive: found.isActive } : def;
            });
        }
    } catch { }
    return DEFAULT_FLAGS;
}

function saveFlags(flags: FeatureFlag[]) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(flags));
    window.dispatchEvent(new Event("feature-flags-changed"));
}

export function useFeatureFlags() {
    const [flags, setFlags] = useState<FeatureFlag[]>(loadFlags);

    const toggleFlag = useCallback((id: string) => {
        setFlags((prev) => {
            const next = prev.map((f) => (f.id === id ? { ...f, isActive: !f.isActive } : f));
            saveFlags(next);
            return next;
        });
    }, []);

    return { flags, toggleFlag };
}

export function useActiveFeatures(): Set<string> {
    const [activeIds, setActiveIds] = useState<Set<string>>(() => {
        const flags = loadFlags();
        return new Set(flags.filter((f) => f.isActive).map((f) => f.id));
    });

    useEffect(() => {
        const handler = () => {
            const flags = loadFlags();
            setActiveIds(new Set(flags.filter((f) => f.isActive).map((f) => f.id)));
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