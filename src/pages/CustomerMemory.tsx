import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Brain,
  Check,
  Download,
  Loader2,
  Plus,
  RefreshCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

import CustomerDashboardLayout from "@/components/CustomerDashboardLayout";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { openConsentSettings } from "@/lib/consent";
import {
  addCustomerMemory,
  clearCustomerMemory,
  exportCustomerMemory,
  inferCustomerMemory,
  listCustomerMemory,
  updateCustomerMemoryStatus,
  type CustomerMemoryItem,
} from "@/lib/tokIntelligence";

const CATEGORY_OPTIONS = [
  { value: "preference", label: "Préférence" },
  { value: "budget", label: "Budget" },
  { value: "location", label: "Zone géographique" },
  { value: "service", label: "Moment ou service" },
  { value: "context", label: "Contexte de sortie" },
  { value: "dietary", label: "Préférence alimentaire explicite" },
  { value: "accessibility", label: "Besoin d’accessibilité explicite" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function memoryValue(item: CustomerMemoryItem) {
  const text =
    typeof item.value?.text === "string" ? item.value.text.trim() : "";
  const values = Array.isArray(item.value?.values)
    ? item.value.values.map(String).filter(Boolean)
    : [];
  const number =
    typeof item.value?.number === "number" ? item.value.number : null;
  const boolean =
    typeof item.value?.boolean === "boolean" ? item.value.boolean : null;

  if (text) return text;
  if (values.length) return values.join(", ");
  if (number !== null) return String(number);
  if (boolean !== null) return boolean ? "Oui" : "Non";
  return "Valeur non affichable";
}

function statusLabel(status: CustomerMemoryItem["status"]) {
  const labels: Record<CustomerMemoryItem["status"], string> = {
    pending: "À confirmer",
    active: "Active",
    rejected: "Refusée",
    deleted: "Supprimée",
  };
  return labels[status];
}

export default function CustomerMemory() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  const [category, setCategory] = useState("preference");

  const memoryQuery = useQuery({
    queryKey: ["customer-memory"],
    queryFn: listCustomerMemory,
    staleTime: 15_000,
  });

  const items = memoryQuery.data?.items || [];
  const pendingItems = useMemo(
    () => items.filter((item) => item.status === "pending"),
    [items],
  );
  const activeItems = useMemo(
    () => items.filter((item) => item.status === "active"),
    [items],
  );

  const refresh = async () => {
    await queryClient.invalidateQueries({ queryKey: ["customer-memory"] });
  };

  const addMutation = useMutation({
    mutationFn: async () => {
      if (!label.trim() || !value.trim()) {
        throw new Error("Renseignez un nom et une valeur.");
      }
      return addCustomerMemory({
        memoryKey: label,
        label,
        category,
        value: {
          text: value.trim(),
          values: value
            .split(/[,;]+/)
            .map((entry) => entry.trim())
            .filter(Boolean),
        },
      });
    },
    onSuccess: async () => {
      setLabel("");
      setValue("");
      await refresh();
      toast({
        title: "Préférence enregistrée",
        description: "Elle reste modifiable et supprimable à tout moment.",
      });
    },
    onError: (error) => {
      toast({
        title: "Enregistrement impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const inferMutation = useMutation({
    mutationFn: inferCustomerMemory,
    onSuccess: async ({ items: suggestions }) => {
      await refresh();
      toast({
        title: "Suggestions préparées",
        description: `${suggestions.length} suggestion(s) attendent votre confirmation.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Analyse impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const statusMutation = useMutation({
    mutationFn: ({
      action,
      itemId,
    }: {
      action: "confirm" | "reject" | "delete";
      itemId: string;
    }) => updateCustomerMemoryStatus(action, itemId),
    onSuccess: refresh,
    onError: (error) => {
      toast({
        title: "Action impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const clearMutation = useMutation({
    mutationFn: clearCustomerMemory,
    onSuccess: async ({ cleared }) => {
      await refresh();
      toast({
        title: "Mémoire effacée",
        description: `${cleared} élément(s) ont été désactivés.`,
      });
    },
    onError: (error) => {
      toast({
        title: "Effacement impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const exportMutation = useMutation({
    mutationFn: exportCustomerMemory,
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `tok-customer-memory-${new Date()
        .toISOString()
        .slice(0, 10)}.json`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      toast({
        title: "Export préparé",
        description: "Le fichier contient votre mémoire et son historique.",
      });
    },
    onError: (error) => {
      toast({
        title: "Export impossible",
        description: error instanceof Error ? error.message : "Erreur inconnue",
        variant: "destructive",
      });
    },
  });

  const renderItem = (item: CustomerMemoryItem) => (
    <Card key={item.id} className="overflow-hidden">
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold">{item.label}</h3>
              <Badge variant={item.status === "pending" ? "secondary" : "outline"}>
                {statusLabel(item.status)}
              </Badge>
              <Badge variant="outline">
                {item.source === "explicit" ? "Ajoutée par vous" : "Suggestion IA"}
              </Badge>
              {item.sensitivity === "sensitive" ? (
                <Badge variant="destructive">Sensible</Badge>
              ) : null}
            </div>
            <p className="mt-2 text-sm text-muted-foreground">
              {memoryValue(item)}
            </p>
            <p className="mt-2 text-xs text-muted-foreground">
              Mise à jour le {formatDate(item.updated_at)}
              {item.expires_at ? ` · expire le ${formatDate(item.expires_at)}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            {item.status === "pending" ? (
              <>
                <Button
                  size="sm"
                  onClick={() =>
                    statusMutation.mutate({
                      action: "confirm",
                      itemId: item.id,
                    })
                  }
                  disabled={statusMutation.isPending}
                >
                  <Check className="mr-1 h-4 w-4" />
                  Confirmer
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    statusMutation.mutate({
                      action: "reject",
                      itemId: item.id,
                    })
                  }
                  disabled={statusMutation.isPending}
                >
                  <X className="mr-1 h-4 w-4" />
                  Refuser
                </Button>
              </>
            ) : null}
            {item.status !== "deleted" ? (
              <Button
                size="icon"
                variant="ghost"
                aria-label={`Supprimer ${item.label}`}
                onClick={() =>
                  statusMutation.mutate({
                    action: "delete",
                    itemId: item.id,
                  })
                }
                disabled={statusMutation.isPending}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </CardContent>
    </Card>
  );

  return (
    <CustomerDashboardLayout>
      <div className="space-y-6">
        <div className="rounded-3xl border bg-gradient-to-br from-orange-50 via-background to-amber-50 p-6 dark:from-orange-950/20 dark:to-amber-950/10">
          <div className="flex items-center gap-2 text-sm font-semibold text-primary">
            <Brain className="h-4 w-4" />
            TOK Customer Memory
          </div>
          <h1 className="mt-3 font-display text-3xl font-bold">
            Ma mémoire TOK
          </h1>
          <p className="mt-3 max-w-3xl text-muted-foreground">
            Consultez, confirmez, corrigez, exportez ou effacez ce que TOK
            utilise pour personnaliser vos recommandations. Aucune préférence
            déduite n’est active sans votre confirmation.
          </p>
        </div>

        {!memoryQuery.data?.consentGranted ? (
          <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20">
            <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold">
                  La personnalisation est désactivée
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Activez-la dans les préférences de confidentialité pour
                  enregistrer ou générer des préférences.
                </p>
              </div>
              <Button onClick={openConsentSettings}>
                Ouvrir mes choix de confidentialité
              </Button>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>Ajouter une préférence explicite</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="memory-label">Nom de la préférence</Label>
                  <Input
                    id="memory-label"
                    value={label}
                    onChange={(event) => setLabel(event.target.value)}
                    maxLength={160}
                    placeholder="Ex. Terrasse calme"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="memory-category">Catégorie</Label>
                  <select
                    id="memory-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {CATEGORY_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="memory-value">Valeur</Label>
                <Textarea
                  id="memory-value"
                  value={value}
                  onChange={(event) => setValue(event.target.value)}
                  rows={3}
                  maxLength={500}
                  placeholder="Ex. Je préfère les terrasses calmes et accessibles avec une poussette."
                />
              </div>
              <Button
                onClick={() => addMutation.mutate()}
                disabled={
                  addMutation.isPending || !label.trim() || !value.trim()
                }
              >
                {addMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="mr-2 h-4 w-4" />
                )}
                Enregistrer
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid gap-4 sm:grid-cols-3">
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                Préférences actives
              </p>
              <p className="mt-2 text-3xl font-bold">{activeItems.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">
                Suggestions à confirmer
              </p>
              <p className="mt-2 text-3xl font-bold">{pendingItems.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Total visible</p>
              <p className="mt-2 text-3xl font-bold">{items.length}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle>Suggestions prudentes</CardTitle>
              <Button
                onClick={() => inferMutation.mutate()}
                disabled={
                  inferMutation.isPending ||
                  !memoryQuery.data?.consentGranted
                }
              >
                {inferMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Sparkles className="mr-2 h-4 w-4" />
                )}
                Analyser mon activité consentie
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              L’analyse exclut les données de santé, allergies, handicap,
              religion, origine, politique, sexualité, difficultés
              financières, litiges et conversations de support.
            </p>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-bold">
              Éléments mémorisés
            </h2>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => memoryQuery.refetch()}
              disabled={memoryQuery.isFetching}
            >
              <RefreshCcw
                className={`mr-2 h-4 w-4 ${
                  memoryQuery.isFetching ? "animate-spin" : ""
                }`}
              />
              Actualiser
            </Button>
          </div>

          {memoryQuery.isLoading ? (
            <Card>
              <CardContent className="flex items-center justify-center p-8">
                <Loader2 className="h-5 w-5 animate-spin" />
              </CardContent>
            </Card>
          ) : items.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                TOK ne mémorise actuellement aucune préférence.
              </CardContent>
            </Card>
          ) : (
            <>
              {pendingItems.map(renderItem)}
              {activeItems.map(renderItem)}
              {items
                .filter(
                  (item) =>
                    item.status !== "pending" && item.status !== "active",
                )
                .map(renderItem)}
            </>
          )}
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Contrôle et portabilité</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Button
                variant="outline"
                onClick={() => exportMutation.mutate()}
                disabled={exportMutation.isPending}
              >
                {exportMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Download className="mr-2 h-4 w-4" />
                )}
                Exporter ma mémoire
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (
                    window.confirm(
                      "Effacer toutes les préférences visibles de la mémoire TOK ?",
                    )
                  ) {
                    clearMutation.mutate();
                  }
                }}
                disabled={clearMutation.isPending || items.length === 0}
              >
                {clearMutation.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                Tout effacer
              </Button>
            </div>
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              Le retrait du consentement bloque immédiatement toute nouvelle
              écriture. Les preuves de consentement restent conservées pour
              l’audit, séparément des préférences.
            </div>
          </CardContent>
        </Card>
      </div>
    </CustomerDashboardLayout>
  );
}
