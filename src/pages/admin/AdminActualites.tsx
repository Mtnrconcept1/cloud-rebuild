import { EyeOff, MessageCircleWarning, Newspaper, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";

import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import SocialPostCard from "@/components/social/SocialPostCard";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminSocialModeration, useModerateSocialContent } from "@/hooks/useSocialFeed";

function statusBadge(status: string) {
  if (status === "published" || status === "resolved") return "bg-emerald-100 text-emerald-800";
  if (status === "hidden" || status === "open") return "bg-amber-100 text-amber-800";
  if (status === "deleted") return "bg-red-100 text-red-800";
  return "bg-secondary text-secondary-foreground";
}

function reportPriority(report: any) {
  if (typeof report.priority === "number") return report.priority;
  if (report.status === "open") return 2;
  return 0;
}

export default function AdminActualites() {
  const moderation = useAdminSocialModeration();
  const moderate = useModerateSocialContent();
  const posts = moderation.data?.posts || [];
  const reports = moderation.data?.reports || [];
  const openReports = reports.filter((report: any) => report.status === "open").length;

  return (
    <main className="container space-y-6 py-8">
      <DashboardPageHero
        badge="Moderation"
        title="Actualites sociales"
        description="Surveillez les posts, signalements et contenus masques du fil social."
        icon={ShieldCheck}
        tone="amber"
        stats={[
          { label: "Posts", value: posts.length, icon: Newspaper },
          { label: "Signalements", value: openReports, icon: MessageCircleWarning },
          { label: "Masques", value: posts.filter((post) => post.status !== "published").length, icon: EyeOff },
        ]}
      />

      <Tabs defaultValue="posts" className="space-y-4">
        <TabsList>
          <TabsTrigger value="posts">Posts</TabsTrigger>
          <TabsTrigger value="reports">Signalements</TabsTrigger>
        </TabsList>

        <TabsContent value="posts" className="space-y-4">
          {moderation.isLoading ? (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Chargement...</CardContent></Card>
          ) : posts.length > 0 ? (
            posts.map((post) => (
              <div key={post.id} className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-background p-3">
                  <Badge className={statusBadge(post.status)}>{post.status}</Badge>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "post", id: post.id, status: "published" })}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Restaurer
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "post", id: post.id, status: "hidden", reason: "Moderation admin" })}
                    >
                      <EyeOff className="h-4 w-4" />
                      Masquer
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "post", id: post.id, status: "deleted", reason: "Suppression admin" })}
                    >
                      <Trash2 className="h-4 w-4" />
                      Supprimer
                    </Button>
                  </div>
                </div>
                <SocialPostCard post={post} compact />
              </div>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucun post.</CardContent></Card>
          )}
        </TabsContent>

        <TabsContent value="reports" className="space-y-4">
          {reports.length > 0 ? (
            reports.map((report: any) => (
              <Card key={report.id} className="rounded-lg">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <CardTitle className="text-base">{report.reason}</CardTitle>
                      {report.category ? <Badge variant="outline">{report.category}</Badge> : null}
                      <Badge variant="secondary">Priorite {reportPriority(report)}</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{report.target_type} - {report.target_id}</p>
                  </div>
                  <Badge className={statusBadge(report.status)}>{report.status}</Badge>
                </CardHeader>
                <CardContent className="space-y-4">
                  {report.details ? <p className="text-sm">{report.details}</p> : null}
                  <div className="flex flex-wrap gap-2">
                    {["post", "comment", "repost"].includes(report.target_type) ? (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-2"
                          onClick={() =>
                            moderate.mutate({
                              type: report.target_type,
                              id: report.target_id,
                              status: "hidden",
                              reason: report.reason || "Signalement admin",
                            })
                          }
                        >
                          <EyeOff className="h-4 w-4" />
                          Masquer cible
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          className="gap-2"
                          onClick={() =>
                            moderate.mutate({
                              type: report.target_type,
                              id: report.target_id,
                              status: "deleted",
                              reason: report.reason || "Signalement admin",
                            })
                          }
                        >
                          <Trash2 className="h-4 w-4" />
                          Supprimer cible
                        </Button>
                      </>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "report", id: report.id, status: "reviewed" })}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Revu
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "report", id: report.id, status: "dismissed" })}
                    >
                      <RotateCcw className="h-4 w-4" />
                      Ecarter
                    </Button>
                    <Button
                      size="sm"
                      className="gap-2"
                      onClick={() => moderate.mutate({ type: "report", id: report.id, status: "resolved" })}
                    >
                      <ShieldCheck className="h-4 w-4" />
                      Resolu
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card className="rounded-lg"><CardContent className="p-8 text-center text-muted-foreground">Aucun signalement.</CardContent></Card>
          )}
        </TabsContent>
      </Tabs>
    </main>
  );
}
