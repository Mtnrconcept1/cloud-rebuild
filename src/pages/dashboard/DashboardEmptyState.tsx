import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Inbox } from "lucide-react";

interface DashboardEmptyStateProps {
  title: string;
  description: string;
  cta?: string;
}

export default function DashboardEmptyState({ title, description, cta }: DashboardEmptyStateProps) {
  return (
    <DashboardLayout>
      <div className="max-w-3xl space-y-6">
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Inbox className="h-5 w-5 text-muted-foreground" />
              Aucun contenu pour le moment
            </CardTitle>
            <CardDescription>
              Cette section est prête, mais aucune donnée n'est encore disponible.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>{description}</p>
            {cta && <p className="font-medium text-foreground">Prochaine étape : {cta}</p>}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
