import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();

type AdminLogResetResult = {
  ok?: boolean;
  deleted_edge_logs?: number;
  deleted_data_logs?: number;
  deleted_ai_usage_logs?: number;
};

type AdminLogResetButtonProps = {
  className?: string;
  size?: "sm" | "default";
  variant?: "outline" | "destructive" | "ghost";
};

function getResetTotal(result: AdminLogResetResult | null | undefined) {
  return Number(result?.deleted_edge_logs || 0)
    + Number(result?.deleted_data_logs || 0)
    + Number(result?.deleted_ai_usage_logs || 0);
}

export default function AdminLogResetButton({
  className,
  size = "sm",
  variant = "destructive",
}: AdminLogResetButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await (supabase.rpc as any)("admin_reset_dashboard_logs", {
        p_confirmation_code: code.trim(),
      });

      if (error) throw error;
      return data as AdminLogResetResult;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs"] });
      queryClient.invalidateQueries({ queryKey: ["admin-audit-logs-full"] });
      queryClient.invalidateQueries({ queryKey: ["admin-production-health"] });
      queryClient.invalidateQueries({ queryKey: ["admin-security-abuse-summary"] });
      queryClient.invalidateQueries({ queryKey: ["payment-integrity-anomalies"] });

      setOpen(false);
      setCode("");

      toast({
        title: "Logs remis à zéro",
        description: `${getResetTotal(result)} entrée(s) supprimée(s) du dashboard admin.`,
      });
    },
    onError: (error: Error) => {
      toast({
        title: "Remise à zéro impossible",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const trimmedCode = code.trim();

  return (
    <>
      <Button
        type="button"
        variant={variant}
        size={size}
        className={className}
        onClick={() => setOpen(true)}
      >
        <RotateCcw className="h-4 w-4" />
        Remise à zéro
      </Button>

      <Dialog open={open} onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) {
          setCode("");
          resetMutation.reset();
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Remise à zéro des logs admin</DialogTitle>
            <DialogDescription>
              Cette action supprime les logs d’audit, d’exécution Edge et d’usage IA visibles dans le dashboard admin.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-2">
            <Label htmlFor="admin-log-reset-code">Code de confirmation</Label>
            <Input
              id="admin-log-reset-code"
              value={code}
              onChange={(event) => setCode(event.target.value)}
              placeholder="Saisir le code"
              autoComplete="off"
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setOpen(false)}
              disabled={resetMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={() => resetMutation.mutate()}
              disabled={!trimmedCode || resetMutation.isPending}
            >
              {resetMutation.isPending ? "Remise à zéro..." : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
