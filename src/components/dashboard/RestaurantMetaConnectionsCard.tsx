import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Facebook, Instagram, Link2, ShieldCheck, ShieldOff } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  disconnectRestaurantMetaAccount,
  listRestaurantMetaAccounts,
  selectRestaurantMetaAccount,
  startRestaurantMetaConnection,
} from "@/lib/restaurantMetaSocial";

export default function RestaurantMetaConnectionsCard({
  restaurantId,
  disabled = false,
}: {
  restaurantId: string | null;
  disabled?: boolean;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const accountsQuery = useQuery({
    queryKey: ["restaurant-meta-social", restaurantId],
    queryFn: () => listRestaurantMetaAccounts(restaurantId!),
    enabled: Boolean(restaurantId) && !disabled,
    staleTime: 30_000,
  });
  const accounts = accountsQuery.data || [];
  const active = accounts.find((account) => account.enabled && account.connected);
  const run = async (fn: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try {
      await fn();
      await accountsQuery.refetch();
      toast({ title: message });
    } catch (error) {
      toast({
        title: "Connexion Meta",
        description: error instanceof Error ? error.message : "Action impossible.",
        variant: "destructive",
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /> Autorisation Facebook et Instagram</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Connectez-vous avec Meta pour autoriser TOK à publier sur une Page Facebook que vous gérez et sur son compte Instagram professionnel associé.
          Les liens de profils ci-dessous ne donnent aucune autorisation de publication. Un seul compte Meta peut être actif par restaurant.
        </p>
        {disabled ? (
          <p className="text-sm text-muted-foreground">La connexion réelle est désactivée en démonstration.</p>
        ) : !restaurantId ? (
          <p className="text-sm text-muted-foreground">Sélectionnez d'abord votre restaurant.</p>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => void run(() => startRestaurantMetaConnection(restaurantId), "Redirection vers Meta")}
              className="gap-2"
            >
              <Link2 className="h-4 w-4" /> Connecter avec Facebook / Instagram
            </Button>
            {accountsQuery.isLoading ? <p className="text-sm">Vérification des comptes…</p> : null}
            {accountsQuery.isError ? <p role="alert" className="text-sm text-destructive">Impossible de charger les connexions Meta.</p> : null}
            {accounts.map((account) => (
              <div key={account.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3">
                <div className="space-y-1 text-sm">
                  <p className="flex items-center gap-2 font-semibold"><Facebook className="h-4 w-4" /> {account.pageName}</p>
                  <p className="text-muted-foreground">
                    {account.instagramUserId
                      ? <span className="inline-flex items-center gap-1"><Instagram className="h-3.5 w-3.5" /> {account.instagramUsername || "Instagram professionnel relié"}</span>
                      : "Aucun Instagram professionnel associé à cette Page"}
                  </p>
                  <p className="text-xs text-muted-foreground">{account.enabled && account.connected ? "Compte sélectionné — publication autorisée" : account.connected ? "Connecté, non sélectionné" : "Déconnecté"}</p>
                </div>
                <div className="flex gap-2">
                  {account.connected && !account.enabled ? (
                    <Button
                      type="button" size="sm" disabled={busy}
                      onClick={() => void run(
                        () => selectRestaurantMetaAccount(restaurantId, account.id),
                        "Page Meta autorisée pour ce restaurant",
                      )}
                    >Utiliser cette Page</Button>
                  ) : null}
                  {account.connected ? (
                    <Button
                      type="button" size="sm" variant="outline" disabled={busy}
                      onClick={() => {
                        if (window.confirm("Retirer l'autorisation de publication Meta de cette Page ?")) {
                          void run(
                            () => disconnectRestaurantMetaAccount(restaurantId, account.id),
                            "Autorisation Meta retirée",
                          );
                        }
                      }}
                      className="gap-1"
                    ><ShieldOff className="h-3.5 w-3.5" /> Déconnecter</Button>
                  ) : null}
                </div>
              </div>
            ))}
            {active ? (
              <p className="text-xs text-emerald-700">Page sélectionnée : {active.pageName}. Seules les publications demandées explicitement seront envoyées à Meta.</p>
            ) : accounts.length ? (
              <p className="text-xs text-muted-foreground">Choisissez la Page sur laquelle publier avant de créer des posts.</p>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}
