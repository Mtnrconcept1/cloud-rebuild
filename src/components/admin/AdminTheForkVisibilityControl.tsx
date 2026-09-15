import { useState } from "react";
import { Filter } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useFeatureFlags } from "@/lib/featureFlags";

const ALL_SOURCES_FLAG = "public-restaurants-all-sources";

export default function AdminTheForkVisibilityControl() {
  const { flags, loading, setFlagState } = useFeatureFlags(true);
  const [submitting, setSubmitting] = useState(false);

  const allSourcesFlag = flags.find((flag) => flag.name === ALL_SOURCES_FLAG);
  const theForkOnly = allSourcesFlag ? !allSourcesFlag.explicitEnabled : false;

  const handleToggle = async () => {
    if (!allSourcesFlag) {
      toast.error("Le réglage du catalogue public est indisponible.");
      return;
    }

    const nextAllSourcesEnabled = !allSourcesFlag.explicitEnabled;
    const nextTheForkOnly = !nextAllSourcesEnabled;
    setSubmitting(true);

    try {
      const result = await setFlagState(
        allSourcesFlag.id,
        nextAllSourcesEnabled,
        nextTheForkOnly
          ? "Activation du mode TheFork uniquement depuis Admin > Restaurants"
          : "Désactivation du mode TheFork uniquement depuis Admin > Restaurants",
      );

      if (!result.success) {
        toast.error(result.error || "Impossible de modifier le catalogue public.");
        return;
      }

      toast.success(
        nextTheForkOnly
          ? "Mode TheFork uniquement activé"
          : "Catalogue public complet réactivé",
        {
          description: nextTheForkOnly
            ? "L’application publique n’affiche plus que les restaurants présents dans le catalogue TheFork vérifié."
            : "L’application publique affiche de nouveau toutes les sources restaurant éligibles.",
        },
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Button
      type="button"
      variant={theForkOnly ? "default" : "outline"}
      className="gap-2"
      aria-pressed={theForkOnly}
      title="Limiter l’application publique aux restaurants présents sur TheFork"
      disabled={loading || submitting || !allSourcesFlag}
      onClick={() => void handleToggle()}
    >
      <Filter className="h-4 w-4" />
      The fork
      <Badge variant={theForkOnly ? "secondary" : "outline"}>
        {theForkOnly ? "Actif" : "Tous"}
      </Badge>
    </Button>
  );
}
