import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, FileText, Search, Users } from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import {
  getSignupDocumentLabel,
  getSignupDocumentStatusMeta,
  getSignupRoleLabel,
  getSignupStatusMeta,
  getVerificationDocumentUrl,
  type SignupApplication,
} from "@/lib/signup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";

const supabase = getSupabase();

type AdminUserRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
  city: string | null;
  roles: string[] | null;
};

const AVAILABLE_ROLES = ["client", "restaurateur", "admin", "courier"] as const;

type ReviewStatus = "approved" | "needs_changes" | "rejected";

export default function AdminUtilisateurs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});

  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationRoleFilter, setApplicationRoleFilter] = useState("all");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingApplicationId, setReviewingApplicationId] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);

  const { data: users = [], isLoading, error } = useQuery({
    queryKey: ["admin-users-full"],
    queryFn: async () => {
      const { data, error: rpcError } = await supabase.rpc("admin_list_users");
      if (rpcError) throw rpcError;
      return ((data || []) as AdminUserRow[]).map((user) => ({
        ...user,
        roles: Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : ["client"],
      }));
    },
  });

  const { data: applications = [], isLoading: applicationsLoading, error: applicationsError } = useQuery({
    queryKey: ["admin-signup-applications"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("signup_applications")
        .select(`
          *,
          signup_application_documents (*)
        `)
        .order("submitted_at", { ascending: false });

      if (error) throw error;
      return (data || []) as SignupApplication[];
    },
  });

  const usersById = useMemo(
    () =>
      users.reduce((acc, user) => {
        acc[user.user_id] = user;
        return acc;
      }, {} as Record<string, AdminUserRow>),
    [users],
  );

  const usersWithDraft = useMemo(
    () =>
      users.map((user) => ({
        ...user,
        effectiveRoles: draftRoles[user.user_id] || user.roles || ["client"],
      })),
    [users, draftRoles],
  );

  const filteredUsers = useMemo(() => {
    return usersWithDraft.filter((user) => {
      const roles = user.effectiveRoles;
      if (roleFilter !== "all" && !roles.includes(roleFilter)) return false;

      if (!search.trim()) return true;
      const query = search.trim().toLowerCase();
      return (
        (user.full_name || "").toLowerCase().includes(query) ||
        (user.email || "").toLowerCase().includes(query) ||
        (user.city || "").toLowerCase().includes(query) ||
        user.user_id.toLowerCase().includes(query)
      );
    });
  }, [usersWithDraft, search, roleFilter]);

  const roleCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      const roles = user.roles || ["client"];
      for (const role of roles) {
        acc[role] = (acc[role] || 0) + 1;
      }
      return acc;
    }, { client: 0, restaurateur: 0, admin: 0, courier: 0 } as Record<string, number>);
  }, [users]);

  const applicationCounts = useMemo(() => {
    return applications.reduce((acc, application) => {
      const key = String(application.status || "pending_review");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {
      pending_review: 0,
      approved: 0,
      needs_changes: 0,
      rejected: 0,
    } as Record<string, number>);
  }, [applications]);

  const filteredApplications = useMemo(() => {
    return applications.filter((application) => {
      if (applicationRoleFilter !== "all" && application.requested_role !== applicationRoleFilter) {
        return false;
      }

      if (applicationStatusFilter !== "all" && application.status !== applicationStatusFilter) {
        return false;
      }

      if (!applicationSearch.trim()) return true;

      const query = applicationSearch.trim().toLowerCase();
      const linkedUser = usersById[application.user_id];
      return (
        (application.full_name || "").toLowerCase().includes(query) ||
        (application.restaurant_name || "").toLowerCase().includes(query) ||
        (application.business_name || "").toLowerCase().includes(query) ||
        (linkedUser?.email || "").toLowerCase().includes(query) ||
        application.user_id.toLowerCase().includes(query)
      );
    });
  }, [applicationRoleFilter, applicationSearch, applicationStatusFilter, applications, usersById]);

  const toggleRole = (userId: string, role: string) => {
    setDraftRoles((prev) => {
      const current = prev[userId] || users.find((user) => user.user_id === userId)?.roles || ["client"];
      const hasRole = current.includes(role);
      const next = hasRole ? current.filter((item) => item !== role) : [...current, role];
      return { ...prev, [userId]: next.length > 0 ? next : ["client"] };
    });
  };

  const saveRoles = async (userId: string) => {
    const nextRoles = draftRoles[userId];
    if (!nextRoles) return;

    setSavingUserId(userId);
    const { error: rpcError } = await supabase.rpc("admin_set_user_roles", {
      p_user_id: userId,
      p_roles: nextRoles,
    });
    setSavingUserId(null);

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    setDraftRoles((prev) => {
      const clone = { ...prev };
      delete clone[userId];
      return clone;
    });
    toast({ title: "Roles mis a jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
  };

  const reviewApplication = async (applicationId: string, status: ReviewStatus) => {
    setReviewingApplicationId(applicationId);

    const { error } = await supabase.rpc("admin_review_signup_application", {
      p_application_id: applicationId,
      p_status: status,
      p_review_note: reviewNotes[applicationId] || null,
    });

    setReviewingApplicationId(null);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Dossier mis a jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-signup-applications"] });
  };

  const openDocument = async (documentId: string, filePath: string) => {
    setOpeningDocumentId(documentId);
    try {
      const url = await getVerificationDocumentUrl(filePath);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Impossible d'ouvrir ce document.";
      toast({ title: "Erreur", description: message, variant: "destructive" });
    } finally {
      setOpeningDocumentId(null);
    }
  };

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Identites et roles"
        title="Gestion des utilisateurs"
        description="Administrez les roles applicatifs, les comptes et les dossiers d'inscription verifies dans une interface unique."
        icon={Users}
        tone="sky"
        visualLabel="Utilisateurs"
        stats={[
          { label: "Utilisateurs", value: users.length, icon: Users },
          { label: "Restaurateurs", value: roleCounts.restaurateur, icon: FileText },
          { label: "Dossiers ouverts", value: applicationCounts.pending_review, icon: FileText },
        ]}
      />

      <Tabs defaultValue="users" className="space-y-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="users">Comptes</TabsTrigger>
          <TabsTrigger value="applications">Dossiers</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{roleCounts.client}</p>
              <p className="text-xs text-muted-foreground">Clients</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{roleCounts.restaurateur}</p>
              <p className="text-xs text-muted-foreground">Restaurateurs</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{roleCounts.admin}</p>
              <p className="text-xs text-muted-foreground">Admins</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{roleCounts.courier}</p>
              <p className="text-xs text-muted-foreground">Livreurs</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher par nom, email, ville ou ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les roles</option>
              <option value="client">Client</option>
              <option value="restaurateur">Restaurateur</option>
              <option value="admin">Admin</option>
              <option value="courier">Livreur</option>
            </select>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-28 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger les utilisateurs.
            </div>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((user) => {
                const baseRoles = user.roles || ["client"];
                const effectiveRoles = user.effectiveRoles;
                const hasChanges =
                  JSON.stringify([...effectiveRoles].sort()) !== JSON.stringify([...baseRoles].sort());

                return (
                  <div key={user.user_id} className="rounded-xl border bg-card p-4 space-y-4">
                    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{user.full_name || "Utilisateur"}</h3>
                        <p className="text-xs text-muted-foreground break-all">{user.email || user.user_id}</p>
                        <p className="text-xs text-muted-foreground">{user.city || "Ville non renseignee"}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {effectiveRoles.map((role) => (
                          <Badge
                            key={role}
                            variant={
                              role === "admin"
                                ? "destructive"
                                : role === "restaurateur"
                                  ? "default"
                                  : "secondary"
                            }
                          >
                            {role}
                          </Badge>
                        ))}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                      {AVAILABLE_ROLES.map((role) => (
                        <label key={role} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                          <input
                            type="checkbox"
                            checked={effectiveRoles.includes(role)}
                            onChange={() => toggleRole(user.user_id, role)}
                          />
                          <span>{role}</span>
                        </label>
                      ))}
                    </div>

                    <div className="flex items-center justify-end gap-2">
                      {hasChanges ? (
                        <>
                          <Button
                            variant="outline"
                            onClick={() =>
                              setDraftRoles((prev) => {
                                const clone = { ...prev };
                                delete clone[user.user_id];
                                return clone;
                              })
                            }
                          >
                            Annuler
                          </Button>
                          <Button
                            onClick={() => saveRoles(user.user_id)}
                            disabled={savingUserId === user.user_id}
                          >
                            {savingUserId === user.user_id ? "Enregistrement..." : "Enregistrer"}
                          </Button>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Aucune modification</span>
                      )}
                    </div>
                  </div>
                );
              })}
              {filteredUsers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun utilisateur trouve.</p>
              ) : null}
            </div>
          )}
        </TabsContent>

        <TabsContent value="applications" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{applicationCounts.pending_review}</p>
              <p className="text-xs text-muted-foreground">En revue</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{applicationCounts.needs_changes}</p>
              <p className="text-xs text-muted-foreground">Corrections</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{applicationCounts.approved}</p>
              <p className="text-xs text-muted-foreground">Approuves</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{applicationCounts.rejected}</p>
              <p className="text-xs text-muted-foreground">Refuses</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher par nom, email, entreprise ou ID..."
                value={applicationSearch}
                onChange={(event) => setApplicationSearch(event.target.value)}
              />
            </div>
            <select
              value={applicationRoleFilter}
              onChange={(event) => setApplicationRoleFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les profils</option>
              <option value="client">Client</option>
              <option value="restaurateur">Restaurateur</option>
              <option value="courier">Livreur</option>
            </select>
            <select
              value={applicationStatusFilter}
              onChange={(event) => setApplicationStatusFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending_review">En revue</option>
              <option value="needs_changes">Corrections</option>
              <option value="approved">Approuve</option>
              <option value="rejected">Refuse</option>
            </select>
          </div>

          {applicationsLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-56 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : applicationsError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger les dossiers d'inscription.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredApplications.map((application) => {
                const linkedUser = usersById[application.user_id];
                const statusMeta = getSignupStatusMeta(application.status);
                const documents = application.signup_application_documents || [];
                const noteValue = reviewNotes[application.id] ?? application.review_note ?? "";

                return (
                  <div key={application.id} className="rounded-xl border bg-card p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{application.full_name}</h3>
                        <p className="text-xs text-muted-foreground break-all">
                          {linkedUser?.email || application.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Soumis le{" "}
                          {application.submitted_at
                            ? new Date(application.submitted_at).toLocaleDateString("fr-CH")
                            : "recentement"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{getSignupRoleLabel(application.requested_role)}</Badge>
                        <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Telephone</p>
                        <p className="pt-1 font-medium">{application.phone || "Non renseigne"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Ville</p>
                        <p className="pt-1 font-medium">{application.city || "Non renseignee"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Entreprise / restaurant</p>
                        <p className="pt-1 font-medium">
                          {application.restaurant_name || application.business_name || "Sans entreprise"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Vehicule / IBAN</p>
                        <p className="pt-1 font-medium">
                          {application.vehicle_type || application.iban || "Sans detail"}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 text-primary" />
                        Documents soumis
                      </div>
                      {documents.length > 0 ? (
                        <div className="grid gap-3 lg:grid-cols-2">
                          {documents.map((document) => {
                            const documentMeta = getSignupDocumentStatusMeta(document.status);
                            return (
                              <div key={document.id} className="rounded-xl border p-3 space-y-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">
                                      {getSignupDocumentLabel(document.document_type)}
                                    </p>
                                    <p className="truncate text-xs text-muted-foreground">
                                      {document.file_name || document.document_type}
                                    </p>
                                  </div>
                                  <Badge className={documentMeta.tone}>{documentMeta.label}</Badge>
                                </div>
                                {document.rejection_reason ? (
                                  <p className="text-xs text-destructive">{document.rejection_reason}</p>
                                ) : null}
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="gap-2"
                                  onClick={() => openDocument(document.id, document.file_path)}
                                  disabled={openingDocumentId === document.id}
                                >
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  {openingDocumentId === document.id ? "Ouverture..." : "Ouvrir"}
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">
                          Aucun document n'est rattache a ce dossier.
                        </div>
                      )}
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`review-note-${application.id}`}>Note de revue</Label>
                      <Textarea
                        id={`review-note-${application.id}`}
                        value={noteValue}
                        onChange={(event) =>
                          setReviewNotes((current) => ({
                            ...current,
                            [application.id]: event.target.value,
                          }))
                        }
                        placeholder="Motif de validation, corrections demandees ou raison du refus..."
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => reviewApplication(application.id, "needs_changes")}
                        disabled={reviewingApplicationId === application.id}
                      >
                        Demander corrections
                      </Button>
                      <Button
                        variant="destructive"
                        onClick={() => reviewApplication(application.id, "rejected")}
                        disabled={reviewingApplicationId === application.id}
                      >
                        Refuser
                      </Button>
                      <Button
                        onClick={() => reviewApplication(application.id, "approved")}
                        disabled={reviewingApplicationId === application.id}
                      >
                        {reviewingApplicationId === application.id ? "Enregistrement..." : "Approuver"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {filteredApplications.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun dossier correspondant.</p>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
