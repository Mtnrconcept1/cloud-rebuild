import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";

type AdminDestructiveActionsProps = {
  targetUserId?: string | null;
  targetRestaurantId?: string | null;
  onDeleted?: () => void | Promise<void>;
};

const supabase = getSupabase();

export default function AdminDestructiveActions({
  targetUserId = null,
  targetRestaurantId = null,
  onDeleted,
}: AdminDestructiveActionsProps) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);

  const mode = targetUserId ? "user" : "restaurant";
  const targetId = targetUserId || targetRestaurantId || "";
  const isUserDeletion = mode === "user";
  const confirmationMatches = confirmation.trim() === targetId;
  const validReason = reason.trim().length >= 8 && reason.trim().length <= 500;

  function resetDialog() {
    setConfirmation("");
    setReason("");
  }

  async function invalidateAdminQueries() {
    const sharedInvalidations = [
      queryClient.invalidateQueries({ queryKey: ["admin-real-restaurant-owners"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-real-restaurants-for-assignment"] }),
    ];

    if (isUserDeletion) {
      await Promise.all([
        ...sharedInvalidations,
        queryClient.invalidateQueries({ queryKey: ["admin-users-full"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-users"] }),
        queryClient.invalidateQueries({ queryKey: ["admin-user-detail", targetId] }),
      ]);
      return;
    }

    await Promise.all([
      ...sharedInvalidations,
      queryClient.invalidateQueries({ queryKey: ["admin-restaurants"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-restaurant-detail", targetId] }),
    ]);
  }

  async function handleDelete() {
    if (!targetId || pending) return;

    if (!confirmationMatches) {
      toast.error("La confirmation ne correspond pas à l’identifiant demandé.");
      return;
    }

    const normalizedReason = reason.trim();
    if (!validReason) {
      toast.error("Indiquez un motif entre 8 et 500 caractères.");
      return;
    }

    setPending(true);
    try {
      if (isUserDeletion) {
        const { error } = await (supabase.rpc as any)("admin_delete_user_account", {
          p_user_id: targetId,
          p_confirmation_user_id: confirmation.trim(),
          p_reason: normalizedReason,
        });
        if (error) throw error;
      } else {
        const { error } = await (supabase.rpc as any)("admin_delete_restaurant", {
          p_restaurant_id: targetId,
          p_confirmation_restaurant_id: confirmation.trim(),
          p_reason: normalizedReason,
        });
        if (error) throw error;
      }

      await invalidateAdminQueries();
      setOpen(false);
      resetDialog();
      await onDeleted?.();

      toast.success(
        isUserDeletion
          ? "Compte utilisateur supprimé définitivement."
          : "Restaurant supprimé de la plateforme et archivé pour conserver son historique légal.",
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : isUserDeletion
            ? "Impossible de supprimer ce compte utilisateur."
            : "Impossible de supprimer ce restaurant.",
      );
    } finally {
      setPending(false);
    }
  }

  if (!targetId) return null;

  return (
    <section className="space-y-4 rounded-xl border border-destructive/40 bg-destructive/5 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h3 className="text-sm font-semibold text-destructive">Zone sensible</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {isUserDeletion
              ? "La suppression efface définitivement le compte Auth et déclenche la cascade RGPD existante."
              : "Le restaurant disparaît de la plateforme. Les commandes, paiements et pièces comptables restent archivés pour respecter les obligations légales."}
          </p>
        </div>
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={() => setOpen(true)}
        >
          <Trash2 className="mr-2 h-4 w-4" />
          {isUserDeletion ? "Supprimer le compte" : "Supprimer le restaurant"}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          if (pending) return;
          setOpen(nextOpen);
          if (!nextOpen) resetDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {isUserDeletion
                ? "Confirmer la suppression définitive du compte"
                : "Confirmer la suppression du restaurant"}
            </DialogTitle>
            <DialogDescription>
              Cette action est réservée aux administrateurs, contrôlée côté base et enregistrée dans le journal d’audit.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              <p className="font-medium">Identifiant à recopier exactement</p>
              <code className="mt-2 block break-all rounded bg-background px-2 py-1 text-xs">
                {targetId}
              </code>
            </div>

            <div className="space-y-2">
              <Label htmlFor={`delete-confirmation-${targetId}`}>Confirmation</Label>
              <Input
                id={`delete-confirmation-${targetId}`}
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                spellCheck={false}
                placeholder="Collez l’identifiant ci-dessus"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={`delete-reason-${targetId}`}>Motif obligatoire</Label>
              <Textarea
                id={`delete-reason-${targetId}`}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                minLength={8}
                maxLength={500}
                placeholder="Expliquez pourquoi cette suppression est nécessaire"
              />
              <p className="text-xs text-muted-foreground">{reason.trim().length}/500 caractères</p>
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setOpen(false)}
              >
                Annuler
              </Button>
              <Button
                type="button"
                variant="destructive"
                disabled={pending || !confirmationMatches || !validReason}
                onClick={() => void handleDelete()}
              >
                {pending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="mr-2 h-4 w-4" />
                )}
                {pending
                  ? "Suppression en cours…"
                  : isUserDeletion
                    ? "Supprimer définitivement"
                    : "Supprimer et archiver"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
