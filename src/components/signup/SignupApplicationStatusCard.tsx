import { AlertCircle, FileText, ShieldCheck } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getSignupDocumentLabel,
  getSignupDocumentStatusMeta,
  getSignupRoleLabel,
  getSignupStatusMeta,
  type SignupApplication,
} from "@/lib/signup";

type SignupApplicationStatusCardProps = {
  application: SignupApplication | null | undefined;
  title: string;
  emptyDescription: string;
};

export default function SignupApplicationStatusCard({
  application,
  title,
  emptyDescription,
}: SignupApplicationStatusCardProps) {
  if (!application) {
    return (
      <Card className="tok-verification-card relative overflow-hidden rounded-3xl border-dashed border-primary/55 bg-card">
        <div className="pointer-events-none absolute right-6 top-1/2 hidden -translate-y-1/2 opacity-55 sm:block">
          <div className="relative h-28 w-32">
            <FileText className="absolute right-8 top-2 h-20 w-20 rotate-6 text-slate-400/45 dark:text-slate-200/28" />
            <div className="absolute bottom-1 right-2 flex h-12 w-12 items-center justify-center rounded-full border border-[#ff9f1c]/50 bg-[#ff6a1a]/18 text-[#ffb15c] shadow-[0_0_32px_rgba(255,106,26,0.42)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
          </div>
        </div>
        <CardHeader className="relative z-10 p-6 sm:p-8">
          <CardTitle className="flex items-center gap-4 text-xl font-bold">
            <span className="tok-kpi-icon tok-tone-orange flex h-14 w-14 items-center justify-center rounded-2xl">
              <ShieldCheck className="h-6 w-6" />
            </span>
            {title}
          </CardTitle>
          <CardDescription className="max-w-2xl text-base leading-7 dark:text-slate-100/80">{emptyDescription}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const statusMeta = getSignupStatusMeta(application.status);
  const documents = application.signup_application_documents || [];

  return (
    <Card className="tok-dashboard-section relative overflow-hidden rounded-3xl border border-primary/25 bg-primary/5">
      <CardHeader className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-primary" />
              {title}
            </CardTitle>
            <CardDescription>
              Dossier {getSignupRoleLabel(application.requested_role).toLowerCase()} soumis le{" "}
              {application.submitted_at
                ? new Date(application.submitted_at).toLocaleDateString("fr-CH")
                : "recentement"}
            </CardDescription>
          </div>
          <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
        </div>
        <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {application.review_note ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <div className="mb-1 flex items-center gap-2 font-medium">
              <AlertCircle className="h-4 w-4" />
              Note de revue
            </div>
            <p>{application.review_note}</p>
          </div>
        ) : null}

        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <FileText className="h-4 w-4 text-primary" />
            Documents de vérification
          </div>
          {documents.length > 0 ? (
            <div className="grid gap-2 md:grid-cols-2">
              {documents.map((document) => {
                const documentMeta = getSignupDocumentStatusMeta(document.status);
                return (
                  <div key={document.id} className="rounded-xl border bg-background/80 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{getSignupDocumentLabel(document.document_type)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {document.file_name || document.document_type}
                        </p>
                      </div>
                      <Badge className={documentMeta.tone}>{documentMeta.label}</Badge>
                    </div>
                    {document.rejection_reason ? (
                      <p className="pt-2 text-xs text-destructive">{document.rejection_reason}</p>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
              Aucun document n'est encore rattache à ce dossier.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
