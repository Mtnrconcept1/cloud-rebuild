import { useState } from "react";
import { BellRing, BellOff, Smartphone } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useCourierPushStatus } from "@/hooks/useCourierPushStatus";

function getStatusMeta(status: ReturnType<typeof useCourierPushStatus>["data"]) {
  if (!status) {
    return {
      label: "Verification",
      tone: "bg-muted text-muted-foreground",
      description: "Verification de l'etat des alertes push sur cet appareil.",
    };
  }

  if (!status.browserSupported) {
    return {
      label: "Non supporte",
      tone: "bg-red-100 text-red-700",
      description: "Ce navigateur ne permet pas les alertes push. Gardez l'app ouverte pour recevoir les offres en temps réel.",
    };
  }

  if (!status.configReady) {
    return {
      label: "Configuration manquante",
      tone: "bg-red-100 text-red-700",
      description: "La configuration push n'est pas complète sur cette instance.",
    };
  }

  if (status.enabled && status.permission === "granted") {
    return {
      label: "Actives",
      tone: "bg-emerald-100 text-emerald-700",
      description: "Les nouvelles missions peuvent arriver en push, meme si l'espace coursier n'est pas au premier plan.",
    };
  }

  if (status.permission === "denied") {
    return {
      label: "Bloquees",
      tone: "bg-amber-100 text-amber-700",
      description: "Le navigateur bloque actuellement les notifications push. Il faut les reautoriser dans les reglages du site.",
    };
  }

  return {
    label: "A activer",
    tone: "bg-amber-100 text-amber-700",
    description: "Activez les alertes push pour recevoir les propositions de livraison sans garder l'application ouverte.",
  };
}

export default function CourierPushStatusCard() {
  const { data: pushStatus, isLoading, enable, disable } = useCourierPushStatus();
  const [loadingAction, setLoadingAction] = useState<"enable" | "disable" | null>(null);

  const statusMeta = getStatusMeta(pushStatus);

  const handleEnable = async () => {
    setLoadingAction("enable");
    const result = await enable();
    setLoadingAction(null);

    if (result.ok) {
      toast.success("Alertes push actives sur cet appareil");
      return;
    }

    toast("Alertes push non activees", {
      description: result.reason || "Impossible d'activer les notifications push.",
    });
  };

  const handleDisable = async () => {
    setLoadingAction("disable");
    const result = await disable();
    setLoadingAction(null);

    if (result.ok) {
      toast.success("Alertes push desactivees sur cet appareil");
      return;
    }

    toast.error(result.reason || "Impossible de desactiver les notifications push.");
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-primary" />
          Alertes livreur
        </CardTitle>
        <CardDescription>{statusMeta.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border p-3">
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-primary/10 p-2">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Cet appareil</p>
              <p className="text-xs text-muted-foreground">
                {isLoading
                  ? "Verification en cours..."
                  : pushStatus?.enabled
                    ? `${pushStatus.tokenCount} token actif`
                    : "Aucun token push actif"}
              </p>
            </div>
          </div>
          <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>

        <div className="flex flex-wrap gap-3">
          {!pushStatus?.enabled ? (
            <Button
              onClick={handleEnable}
              disabled={loadingAction !== null || isLoading}
            >
              <BellRing className="mr-2 h-4 w-4" />
              Activer les alertes push
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={handleDisable}
              disabled={loadingAction !== null || isLoading}
            >
              <BellOff className="mr-2 h-4 w-4" />
              Desactiver sur cet appareil
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
