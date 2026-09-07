import { useCallback, useEffect, useState } from "react";
import { BellRing, Loader2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/lib/auth-context";
import { disablePushForCurrentSession, enablePush, isCurrentPushEnabled } from "@/lib/push-unified";

export default function PushNotificationSettings() {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    if (!user?.id) {
      setEnabled(false);
      setLoading(false);
      return;
    }

    try {
      setEnabled(await isCurrentPushEnabled(user.id));
    } catch {
      console.warn("[push-settings] device_token_status_unavailable", { user_authenticated: true });
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleToggle = async () => {
    if (!user?.id || saving) return;

    setSaving(true);
    try {
      const result = enabled
        ? await disablePushForCurrentSession(user.id)
        : await enablePush(user.id);

      if (!result.ok) {
        throw new Error(result.reason || "Impossible de modifier les notifications push.");
      }

      toast.success(
        enabled
          ? "Notifications push désactivées sur cet appareil."
          : "Notifications push activées.",
      );
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible de modifier les notifications push.";
      toast.error(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="space-y-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <BellRing className="h-6 w-6" />
        </div>
        <CardTitle>Notifications push</CardTitle>
        <CardDescription>
          Recevez les alertes TOK utiles à votre compte sur cet appareil. L’autorisation système n’est demandée qu’après votre action explicite.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="text-sm text-muted-foreground">
          État : {loading ? "Vérification…" : enabled ? "activées" : "désactivées"}
        </div>
        <Button type="button" onClick={handleToggle} disabled={!user?.id || loading || saving}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BellRing className="mr-2 h-4 w-4" />}
          {enabled ? "Désactiver les notifications push" : "Activer les notifications push"}
        </Button>
      </CardContent>
    </Card>
  );
}
