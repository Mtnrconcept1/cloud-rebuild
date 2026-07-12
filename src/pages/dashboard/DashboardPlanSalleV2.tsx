import { ExternalLink, FlaskConical } from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import { Button } from "@/components/ui/button";

const PROTOTYPE_URL = "/tok-table-v2/index.html";

export default function DashboardPlanSalleV2() {
  return (
    <DashboardLayout
      contentWidth="full"
      mainClassName="p-2 pb-24 sm:p-3 md:p-4"
    >
      <section className="flex min-h-[calc(100vh-7rem)] flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-background/95 px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FlaskConical className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-lg font-semibold">Plan de salle 2</h1>
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-400/15 dark:text-amber-100">
                  Prototype
                </span>
              </div>
              <p className="text-xs text-muted-foreground">
                Test isolé : les données restent sur cet appareil et la V1 est inchangée.
              </p>
            </div>
          </div>

          <Button asChild variant="outline" size="sm">
            <a href={PROTOTYPE_URL} target="_blank" rel="noreferrer">
              Plein écran
              <ExternalLink className="ml-2 h-4 w-4" />
            </a>
          </Button>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-2xl border bg-white shadow-sm">
          <iframe
            src={PROTOTYPE_URL}
            title="TOK TABLE 2"
            className="h-[calc(100vh-11rem)] min-h-[720px] w-full border-0"
            sandbox="allow-scripts allow-same-origin allow-downloads"
          />
        </div>
      </section>
    </DashboardLayout>
  );
}
