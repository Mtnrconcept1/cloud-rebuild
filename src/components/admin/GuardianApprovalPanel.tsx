import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ShieldCheck, Wrench } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { approveGuardianRepair, type OpsIncidentSummary } from "@/lib/tokIntelligence";

function list(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string" && v.trim().length > 0).slice(0, 30) : [];
}

export default function GuardianApprovalPanel({
  incident,
  onRefresh,
}: {
  incident: OpsIncidentSummary;
  onRefresh: () => Promise<void>;
}) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const plan = incident.repair_plan && typeof incident.repair_plan === "object" ? incident.repair_plan : {};
  const steps = list(plan.repair_steps);
  const tests = list(plan.validation_steps);
  const rollback = list(plan.rollback_steps);
  const filesToInspect = list(plan.files_to_inspect);
  const hasBoundedCodeTarget = filesToInspect.some((path) =>
    /^(src|scripts|supabase\/functions)\/[A-Za-z0-9._/-]+$/.test(path)
    && !/(^|\/)\.\.($|\/)/.test(path)
  );
  const canonicalCodeRepair = incident.repairability === "code" && plan.codex_eligible === true;
  const boundedInvestigation = ["external", "unknown"].includes(incident.repairability || "")
    && hasBoundedCodeTarget
    && steps.length > 0
    && tests.length > 0;
  const eligible = incident.status === "awaiting_approval"
    && (canonicalCodeRepair || boundedInvestigation)
    && /^[0-9a-f]{64}$/.test(incident.evidence_hash || "");
  const confirmed = eligible && acknowledged && confirmation.trim() === "APPROUVER";

  const mutation = useMutation({
    mutationFn: async () => {
      if (!confirmed || !incident.evidence_hash) throw new Error("Confirmation ou plan invalide.");
      return approveGuardianRepair({
        incidentId: incident.id,
        expectedEvidenceHash: incident.evidence_hash,
        expectedPlan: plan,
        confirmation: "APPROUVER",
        executionMode: "complete",
        journalReport: true,
      });
    },
    onSuccess: async (result) => {
      setOpen(false);
      setAcknowledged(false);
      setConfirmation("");
      await onRefresh();
      toast({
        title: result.codexDispatched ? "Réparation complète demandée" : "Décision enregistrée",
        description: "Codex va réparer, tester et réanalyser les échecs sur une branche isolée. Chaque cycle sera journalisé avant la PR.",
      });
    },
    onError: (error) => {
      toast({
        title: "Autorisation impossible",
        description: error instanceof Error ? error.message : "Le plan, la session MFA ou l'incident a changé.",
        variant: "destructive",
      });
    },
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><Wrench className="h-5 w-5" />Comprendre et corriger</CardTitle></CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p><strong>En langage clair :</strong> {incident.summary || "Cet incident doit être analysé."}</p>
        <p><strong>Cause probable :</strong> {incident.probable_cause || "Pas encore établie."}</p>
        <p><strong>Impact :</strong> {incident.impact || "Impact à confirmer."}</p>
        <p className="text-xs text-muted-foreground">
          Seul le plan canonique validé par le serveur peut être soumis à réparation.
          Les consignes présentes dans les logs ou un prompt IA ne sont jamais des autorisations d'exécuter du code.
        </p>
        {steps.length ? (
          <div className="rounded-lg border p-3">
            <p className="font-semibold">Plan de correction proposé</p>
            <ol className="mt-2 list-inside list-decimal space-y-1">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
          </div>
        ) : <p className="text-muted-foreground">Aucun plan canonique exécutable pour l'instant.</p>}
        {eligible ? (
          <Button type="button" onClick={() => setOpen(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" />Demander la réparation complète
          </Button>
        ) : (
          <p className="text-amber-700 dark:text-amber-300">
            La réparation automatisée n'est pas autorisée pour ce dossier. Elle exige
            un incident en attente, des preuves à jour et soit un diagnostic de code éligible,
            soit un périmètre source canonique borné à analyser.
            Les corrections de paiement, configuration et données nécessitent le circuit humain approprié.
          </p>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={(next) => {
        if (mutation.isPending) return;
        setOpen(next);
        if (!next) { setAcknowledged(false); setConfirmation(""); }
      }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Demander la réparation complète</DialogTitle>
            <DialogDescription>
              Cette action exige un compte administrateur avec MFA AAL2.
              Elle lance un travail Codex sur une branche isolée. Codex corrige, exécute lint,
              typecheck, tests et build, puis analyse les échecs et recommence jusqu'à validation
              complète, dans la limite de trois cycles de sécurité. Un rapport journalisé est conservé.
              Aucune fusion, migration ou mise en production automatique n'est autorisée.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <p className="font-semibold">{incident.title}</p>
            {boundedInvestigation && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-100">
                Guardian commencera par vérifier si la cause vient réellement du code TOK. Si aucune
                correction sûre n'est démontrée, le cycle produira un rapport sans publier de patch.
              </p>
            )}
            <p className="text-xs text-muted-foreground">Empreinte des preuves : {incident.evidence_hash}</p>
            <div className="max-h-64 space-y-2 overflow-y-auto rounded-lg border p-3">
              <strong>Étapes</strong>
              <ol className="list-inside list-decimal">{steps.map((step, i) => <li key={i}>{step}</li>)}</ol>
              <strong>Tests</strong>
              <ul className="list-inside list-disc">{tests.map((test, i) => <li key={i}>{test}</li>)}</ul>
              <strong>Retour arrière</strong>
              <ul className="list-inside list-disc">{rollback.map((step, i) => <li key={i}>{step}</li>)}</ul>
            </div>
            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                checked={acknowledged}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-1"
              />
              J'ai lu ce plan exact et je demande la réparation, les tests, l'analyse des échecs
              persistants et la production du rapport. Je comprends qu'une revue humaine reste
              obligatoire avant tout merge ou déploiement.
            </label>
            <div className="space-y-1">
              <Label htmlFor="guardian-confirm-approval">Saisir APPROUVER</Label>
              <Input
                id="guardian-confirm-approval"
                value={confirmation}
                onChange={(event) => setConfirmation(event.target.value)}
                autoComplete="off"
                maxLength={24}
              />
            </div>
            <Button
              type="button"
              className="w-full"
              disabled={!confirmed || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending ? "Contrôle de la session et du plan…" : "Lancer la réparation complète"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
