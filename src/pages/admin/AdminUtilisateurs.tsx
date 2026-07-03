import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  Ban,
  Bike,
  BriefcaseBusiness,
  Download,
  ExternalLink,
  FileText,
  History,
  RotateCcw,
  Search,
  ShieldCheck,
  UserRound,
  Users,
} from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";
import {
  getSignupDocumentLabel,
  getSignupDocumentStatusMeta,
  getSignupRestaurateurOnboardingSelection,
  getSignupRoleLabel,
  getSignupStatusMeta,
  getVerificationDocumentUrl,
  isSignupRestaurateurOnboardingPaymentReady,
  type SignupApplication,
  type SignupApplicationDocument,
} from "@/lib/signup";
import { COURIER_APPROVAL_STATUS_META, COURIER_VEHICLE_OPTIONS } from "@/lib/courier";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  created_at?: string | null;
  email_confirmed_at?: string | null;
  account_status?: string | null;
  application_status?: string | null;
  courier_status?: string | null;
  anomalies?: string[] | null;
};

type AdminCourierRow = {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  status: string;
  vehicle_type: string | null;
  license_plate: string | null;
  iban: string | null;
  is_online: boolean | null;
  rating: number | null;
  total_deliveries: number | null;
  acceptance_rate: number | null;
  completion_rate: number | null;
  created_at: string;
  updated_at: string;
};

const AVAILABLE_ROLES = ["client", "restaurateur", "admin", "courier", "commercial"] as const;

type ReviewStatus = "approved" | "needs_changes" | "rejected";
type CourierReviewStatus = "approved" | "pending_approval" | "suspended" | "rejected";
type AdminTab = "users" | "applications" | "couriers";

type UserGovernanceAlert = {
  alert_key: string;
  severity: string;
  user_id: string;
  title: string;
  description: string;
  anomaly: string;
  metadata: Record<string, unknown> | null;
};

type CommercialCompensationProfile = {
  user_id: string;
  status: string;
  sprint_started_at: string;
  engaged_at: string | null;
  employment_active: boolean;
  team_lead_id: string | null;
  notes: string | null;
};

type AdminUserDetail = {
  user?: AdminUserRow;
  orders_summary?: Record<string, unknown>;
  reservations_summary?: Record<string, unknown>;
  incidents_summary?: Record<string, unknown>;
  restaurants?: Array<Record<string, unknown>>;
  courier_profile?: Record<string, unknown> | null;
  applications?: Array<Record<string, unknown>>;
  recent_history?: Array<Record<string, unknown>>;
};

const ANOMALY_LABELS: Record<string, string> = {
  account_suspended: "Compte suspendu",
  courier_without_profile: "Livreur sans profil",
  email_unconfirmed: "Email non confirmé",
  restaurateur_without_restaurant: "Restaurateur sans restaurant",
  user_without_role: "Utilisateur sans rôle",
};

const ACCOUNT_STATUS_META: Record<string, { label: string; tone: string }> = {
  active: { label: "Actif", tone: "bg-emerald-100 text-emerald-700" },
  suspended: { label: "Suspendu", tone: "bg-red-100 text-red-700" },
};

function getCourierVehicleLabel(vehicleType: string | null | undefined) {
  return COURIER_VEHICLE_OPTIONS.find((option) => option.value === vehicleType)?.label || vehicleType || "Non renseigné";
}

function getCourierDisplayName(courier: AdminCourierRow, application?: SignupApplication) {
  const profileName = [courier.first_name, courier.last_name].filter(Boolean).join(" ").trim();
  return profileName || application?.full_name || courier.phone || "Livreur";
}

function getRoleLabel(role: string) {
  switch (role) {
    case "admin":
      return "Admin";
    case "restaurateur":
      return "Restaurateur";
    case "courier":
      return "Livreur";
    case "commercial":
      return "Commercial";
    default:
      return "Client";
  }
}

function canApproveSignupApplication(application: SignupApplication) {
  return application.requested_role !== "restaurateur" || isSignupRestaurateurOnboardingPaymentReady(application);
}

function getOnboardingPaymentStatusLabel(application: SignupApplication) {
  return canApproveSignupApplication(application) ? "Paiement confirmé" : "Paiement requis";
}

function formatDate(value: unknown) {
  if (!value || typeof value !== "string") return "Non renseigné";
  return new Date(value).toLocaleDateString("fr-CH");
}

function formatNumber(value: unknown) {
  return Number(value || 0).toLocaleString("fr-CH");
}

function isImageDocument(document: SignupApplicationDocument) {
  const mimeType = String(document.mime_type || "").toLowerCase();
  const fileName = String(document.file_name || document.file_path || "").toLowerCase();
  return mimeType.startsWith("image/") || /\.(png|jpe?g|webp)$/i.test(fileName);
}

function SignupDocumentPreview({ document }: { document: SignupApplicationDocument }) {
  const canPreviewImage = isImageDocument(document);
  const { data: signedUrl, isLoading, error } = useQuery({
    queryKey: ["admin-signup-document-preview", document.id, document.file_path],
    enabled: canPreviewImage,
    staleTime: 45 * 60 * 1000,
    queryFn: () => getVerificationDocumentUrl(document.file_path),
  });

  if (!canPreviewImage) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-dashed bg-muted/30 text-xs text-muted-foreground">
        Aperçu image indisponible pour ce format.
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-36 rounded-lg bg-muted animate-pulse" />;
  }

  if (error || !signedUrl) {
    return (
      <div className="flex h-36 items-center justify-center rounded-lg border border-destructive/30 bg-destructive/5 text-xs text-destructive">
        Image non prévisualisable.
      </div>
    );
  }

  return (
    <a href={signedUrl} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-lg border bg-muted">
      <img
        src={signedUrl}
        alt={`Aperçu du document ${getSignupDocumentLabel(document.document_type)}`}
        className="h-36 w-full object-cover transition-transform hover:scale-[1.02]"
        loading="lazy"
      />
    </a>
  );
}

function csvEscape(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

function downloadCsv(filename: string, rows: Array<Array<unknown>>) {
  const csv = rows.map((row) => row.map(csvEscape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function UserDetailPanel({ userId, embedded = false }: { userId: string | null; embedded?: boolean }) {
  const { data: detail, isLoading, error } = useQuery({
    queryKey: ["admin-user-detail", userId],
    enabled: Boolean(userId),
    queryFn: async () => {
      const { data, error: rpcError } = await (supabase.rpc as any)("admin_get_user_admin_detail", {
        p_user_id: userId,
      });
      if (rpcError) throw rpcError;
      return (data || {}) as AdminUserDetail;
    },
  });

  if (!userId) {
    return (
      <div className="rounded-xl border border-dashed bg-card p-4 text-sm text-muted-foreground">
        Sélectionnez un compte pour ouvrir la fiche utilisateur complète.
      </div>
    );
  }

  if (isLoading) {
    return <div className="h-80 rounded-xl bg-muted animate-pulse" />;
  }

  if (error) {
    return (
      <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
        Impossible de charger la fiche utilisateur.
      </div>
    );
  }

  const user = detail?.user;
  const orders = detail?.orders_summary || {};
  const reservations = detail?.reservations_summary || {};
  const incidents = detail?.incidents_summary || {};
  const restaurants = detail?.restaurants || [];
  const applications = detail?.applications || [];
  const history = detail?.recent_history || [];
  const courierProfile = detail?.courier_profile;

  return (
    <div className={embedded ? "space-y-4" : "rounded-xl border bg-card p-4 space-y-4"}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <UserRound className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-semibold">Fiche utilisateur</h3>
          </div>
          <p className="pt-1 text-xs text-muted-foreground break-all">{user?.email || userId}</p>
        </div>
        <Badge className={ACCOUNT_STATUS_META[user?.account_status || "active"]?.tone || "bg-muted text-muted-foreground"}>
          {ACCOUNT_STATUS_META[user?.account_status || "active"]?.label || user?.account_status || "Actif"}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Commandes</p>
          <p className="text-lg font-semibold">{formatNumber(orders.total)}</p>
          <p className="text-xs text-muted-foreground">{formatNumber(orders.open)} ouvertes</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Réservations</p>
          <p className="text-lg font-semibold">{formatNumber(reservations.total)}</p>
          <p className="text-xs text-muted-foreground">{formatNumber(reservations.open)} ouvertes</p>
        </div>
        <div className="rounded-lg border p-3">
          <p className="text-xs text-muted-foreground">Incidents</p>
          <p className="text-lg font-semibold">{formatNumber(incidents.total)}</p>
          <p className="text-xs text-muted-foreground">{formatNumber(incidents.open)} ouverts</p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Rôles</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {(user?.roles || ["client"]).map((role) => (
              <Badge key={role} variant="outline">
                {getRoleLabel(role)}
              </Badge>
            ))}
          </div>
        </div>
        <div className="rounded-lg border p-3 text-sm">
          <p className="font-medium">Profil livreur</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {courierProfile
              ? `${String(courierProfile.status || "statut inconnu")} · ${String(courierProfile.vehicle_type || "véhicule non renseigné")}`
              : "Aucun profil livreur lié."}
          </p>
        </div>
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Restaurants</p>
        {restaurants.length > 0 ? (
          <div className="mt-2 space-y-2">
            {restaurants.map((restaurant) => (
              <div key={String(restaurant.id)} className="flex items-center justify-between gap-3 text-xs">
                <span className="truncate">{String(restaurant.name || restaurant.id)}</span>
                <Badge variant={restaurant.is_active ? "default" : "outline"}>
                  {String(restaurant.status || "statut inconnu")}
                </Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Aucun restaurant lié.</p>
        )}
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <p className="font-medium">Dossiers</p>
        {applications.length > 0 ? (
          <div className="mt-2 space-y-2">
            {applications.map((application) => (
              <div key={String(application.id)} className="flex items-center justify-between gap-3 text-xs">
                <span>{getSignupRoleLabel(String(application.requested_role || ""))}</span>
                <Badge variant="outline">{String(application.status || "pending_review")}</Badge>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Aucun dossier de validation.</p>
        )}
      </div>

      <div className="rounded-lg border p-3 text-sm">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-primary" />
          <p className="font-medium">Historique</p>
        </div>
        {history.length > 0 ? (
          <div className="mt-3 space-y-2">
            {history.slice(0, 8).map((entry) => (
              <div key={String(entry.id)} className="rounded-md bg-muted/50 p-2 text-xs">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium">{String(entry.action || "action")}</span>
                  <span className="text-muted-foreground">{formatDate(entry.created_at)}</span>
                </div>
                <p className="pt-1 text-muted-foreground break-all">{String(entry.entity_type || "")}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-2 text-xs text-muted-foreground">Aucune décision récente.</p>
        )}
      </div>
    </div>
  );
}

export default function AdminUtilisateurs() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("all");
  const [accountStatusFilter, setAccountStatusFilter] = useState("all");
  const [anomalyFilter, setAnomalyFilter] = useState("all");
  const [createdFilter, setCreatedFilter] = useState("all");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [savingCommercialProfileUserId, setSavingCommercialProfileUserId] = useState<string | null>(null);
  const [changingAccountUserId, setChangingAccountUserId] = useState<string | null>(null);
  const [draftRoles, setDraftRoles] = useState<Record<string, string[]>>({});

  const [applicationSearch, setApplicationSearch] = useState("");
  const [applicationRoleFilter, setApplicationRoleFilter] = useState("all");
  const [applicationStatusFilter, setApplicationStatusFilter] = useState("all");
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewingApplicationId, setReviewingApplicationId] = useState<string | null>(null);
  const [openingDocumentId, setOpeningDocumentId] = useState<string | null>(null);
  const [courierSearch, setCourierSearch] = useState("");
  const [courierStatusFilter, setCourierStatusFilter] = useState("pending_approval");
  const [courierReviewNotes, setCourierReviewNotes] = useState<Record<string, string>>({});
  const [reviewingCourierId, setReviewingCourierId] = useState<string | null>(null);
  const requestedAdminTab = searchParams.get("tab");
  const activeAdminTab: AdminTab =
    requestedAdminTab === "applications" || requestedAdminTab === "couriers" ? requestedAdminTab : "users";

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

  const { data: governanceAlerts = [] } = useQuery({
    queryKey: ["admin-user-governance-alerts"],
    queryFn: async () => {
      const { data, error: rpcError } = await (supabase.rpc as any)("admin_get_user_governance_alerts");
      if (rpcError) throw rpcError;
      return (data || []) as UserGovernanceAlert[];
    },
  });

  const { data: commercialProfiles = [] } = useQuery({
    queryKey: ["admin-commercial-compensation-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("commercial_compensation_profiles" as any)
        .select("user_id,status,sprint_started_at,engaged_at,employment_active,team_lead_id,notes")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data || []) as CommercialCompensationProfile[];
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

  const { data: couriers = [], isLoading: couriersLoading, error: couriersError } = useQuery({
    queryKey: ["admin-couriers"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("couriers")
        .select("*")
        .order("updated_at", { ascending: false });

      if (error) throw error;
      return (data || []) as AdminCourierRow[];
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

  const governanceAlertsByUserId = useMemo(() => {
    return governanceAlerts.reduce((acc, alert) => {
      if (!acc[alert.user_id]) acc[alert.user_id] = [];
      acc[alert.user_id].push(alert);
      return acc;
    }, {} as Record<string, UserGovernanceAlert[]>);
  }, [governanceAlerts]);

  const commercialProfilesByUserId = useMemo(() => {
    return commercialProfiles.reduce((acc, profile) => {
      acc[profile.user_id] = profile;
      return acc;
    }, {} as Record<string, CommercialCompensationProfile>);
  }, [commercialProfiles]);

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
      if (accountStatusFilter !== "all" && (user.account_status || "active") !== accountStatusFilter) return false;
      if (anomalyFilter !== "all" && !(user.anomalies || []).includes(anomalyFilter)) return false;

      if (createdFilter !== "all") {
        const days = Number(createdFilter);
        const createdAt = user.created_at ? new Date(user.created_at).getTime() : 0;
        const minCreatedAt = Date.now() - days * 24 * 60 * 60 * 1000;
        if (!createdAt || createdAt < minCreatedAt) return false;
      }

      if (!search.trim()) return true;
      const query = search.trim().toLowerCase();
      return (
        (user.full_name || "").toLowerCase().includes(query) ||
        (user.email || "").toLowerCase().includes(query) ||
        (user.city || "").toLowerCase().includes(query) ||
        (user.account_status || "").toLowerCase().includes(query) ||
        (user.application_status || "").toLowerCase().includes(query) ||
        (user.courier_status || "").toLowerCase().includes(query) ||
        user.user_id.toLowerCase().includes(query)
      );
    });
  }, [accountStatusFilter, anomalyFilter, createdFilter, roleFilter, search, usersWithDraft]);

  const roleCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      const roles = user.roles || ["client"];
      for (const role of roles) {
        acc[role] = (acc[role] || 0) + 1;
      }
      return acc;
    }, { client: 0, restaurateur: 0, admin: 0, courier: 0, commercial: 0 } as Record<string, number>);
  }, [users]);

  const accountStatusCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      const key = String(user.account_status || "active");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, { active: 0, suspended: 0 } as Record<string, number>);
  }, [users]);

  const anomalyCounts = useMemo(() => {
    return users.reduce((acc, user) => {
      for (const anomaly of user.anomalies || []) {
        acc[anomaly] = (acc[anomaly] || 0) + 1;
      }
      return acc;
    }, {} as Record<string, number>);
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


  const pendingRestaurantApplicationsCount = useMemo(() => {
    return applications.filter(
      (application) => application.requested_role === "restaurateur" && application.status === "pending_review",
    ).length;
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

  const courierApplicationsByUserId = useMemo(() => {
    const map = new Map<string, SignupApplication>();
    for (const application of applications) {
      if (application.requested_role !== "courier") continue;
      if (!map.has(application.user_id)) {
        map.set(application.user_id, application);
      }
    }
    return map;
  }, [applications]);

  const courierCounts = useMemo(() => {
    return couriers.reduce((acc, courier) => {
      const key = String(courier.status || "pending_approval");
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {
      pending_approval: 0,
      approved: 0,
      suspended: 0,
      rejected: 0,
    } as Record<string, number>);
  }, [couriers]);

  const filteredCouriers = useMemo(() => {
    return couriers.filter((courier) => {
      if (courierStatusFilter !== "all" && courier.status !== courierStatusFilter) {
        return false;
      }

      if (!courierSearch.trim()) return true;

      const query = courierSearch.trim().toLowerCase();
      const linkedUser = usersById[courier.user_id];
      const linkedApplication = courierApplicationsByUserId.get(courier.user_id);
      const displayName = getCourierDisplayName(courier, linkedApplication);

      return (
        displayName.toLowerCase().includes(query) ||
        (courier.phone || "").toLowerCase().includes(query) ||
        (courier.license_plate || "").toLowerCase().includes(query) ||
        (linkedApplication?.city || "").toLowerCase().includes(query) ||
        (linkedUser?.email || "").toLowerCase().includes(query) ||
        courier.user_id.toLowerCase().includes(query)
      );
    });
  }, [courierApplicationsByUserId, courierSearch, courierStatusFilter, couriers, usersById]);

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

    const currentRoles = users.find((user) => user.user_id === userId)?.roles || ["client"];
    if (currentRoles.includes("admin") && !nextRoles.includes("admin")) {
      const confirmed = window.confirm(
        "Dernier admin : la base bloque la suppression du dernier rôle admin. Confirmer ce changement sensible ?",
      );
      if (!confirmed) return;
    }

    setSavingUserId(userId);
    const safeNextRoles = nextRoles.filter((role): role is (typeof AVAILABLE_ROLES)[number] => (
      AVAILABLE_ROLES.includes(role as (typeof AVAILABLE_ROLES)[number])
    ));
    const { error: rpcError } = await supabase.rpc("admin_set_user_roles", {
      p_user_id: userId,
      p_roles: safeNextRoles.length > 0 ? safeNextRoles : ["client"],
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
    toast({ title: "Rôles mis à jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-governance-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-commercial-compensation-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
  };

  const updateCommercialProfile = async (
    userId: string,
    patch: Partial<Pick<CommercialCompensationProfile, "status" | "sprint_started_at" | "engaged_at" | "employment_active" | "team_lead_id" | "notes">>,
  ) => {
    const current = commercialProfilesByUserId[userId];
    const nextStatus = patch.status || current?.status || "sprint";
    const nextEmploymentActive =
      typeof patch.employment_active === "boolean"
        ? patch.employment_active
        : current?.employment_active || nextStatus === "engaged" || nextStatus === "team_lead";

    setSavingCommercialProfileUserId(userId);
    const { error } = await supabase
      .from("commercial_compensation_profiles" as any)
      .upsert({
        user_id: userId,
        status: nextStatus,
        sprint_started_at: patch.sprint_started_at || current?.sprint_started_at || new Date().toISOString().slice(0, 10),
        engaged_at:
          patch.engaged_at !== undefined
            ? patch.engaged_at || null
            : current?.engaged_at || (nextStatus === "engaged" || nextStatus === "team_lead" ? new Date().toISOString().slice(0, 10) : null),
        employment_active: nextStatus === "inactive" ? false : nextEmploymentActive,
        team_lead_id: patch.team_lead_id !== undefined ? patch.team_lead_id || null : current?.team_lead_id || null,
        notes: patch.notes !== undefined ? patch.notes || null : current?.notes || null,
      }, { onConflict: "user_id" });
    setSavingCommercialProfileUserId(null);

    if (error) {
      toast({ title: "Profil commercial non mis a jour", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Profil commercial mis a jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-commercial-compensation-profiles"] });
    queryClient.invalidateQueries({ queryKey: ["commercial-compensation-summary"] });
  };

  const changeAccountStatus = async (userId: string, nextStatus: "active" | "suspended") => {
    const reason = window.prompt(
      nextStatus === "suspended"
        ? "Motif de suspension du compte"
        : "Motif de réactivation du compte",
    );

    if (!reason?.trim()) {
      toast({ title: "Motif requis", description: "La décision doit être justifiée.", variant: "destructive" });
      return;
    }

    setChangingAccountUserId(userId);
    const { error: rpcError } = await (supabase.rpc as any)("admin_set_user_account_status", {
      p_user_id: userId,
      p_status: nextStatus,
      p_reason: reason.trim(),
    });
    setChangingAccountUserId(null);

    if (rpcError) {
      toast({ title: "Erreur", description: rpcError.message, variant: "destructive" });
      return;
    }

    toast({ title: nextStatus === "suspended" ? "Compte suspendu" : "Compte réactivé" });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-governance-alerts"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-detail", userId] });
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

    toast({ title: "Dossier mis à jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-signup-applications"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-governance-alerts"] });
  };

  const reviewCourierProfile = async (courierId: string, status: CourierReviewStatus) => {
    setReviewingCourierId(courierId);

    const { error } = await supabase.rpc("admin_review_courier_profile", {
      p_courier_id: courierId,
      p_status: status,
      p_review_note: courierReviewNotes[courierId] || null,
    });

    setReviewingCourierId(null);

    if (error) {
      toast({ title: "Erreur", description: error.message, variant: "destructive" });
      return;
    }

    toast({ title: "Profil livreur mis à jour" });
    queryClient.invalidateQueries({ queryKey: ["admin-couriers"] });
    queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
    queryClient.invalidateQueries({ queryKey: ["admin-signup-applications"] });
    queryClient.invalidateQueries({ queryKey: ["admin-user-governance-alerts"] });
  };

  const exportUsersCsv = () => {
    downloadCsv("admin-utilisateurs.csv", [
      ["ID", "Nom", "Email", "Ville", "Rôles", "Statut", "Email confirmé", "Anomalies", "Créé le"],
      ...filteredUsers.map((user) => [
        user.user_id,
        user.full_name,
        user.email,
        user.city,
        (user.effectiveRoles || []).map(getRoleLabel).join(" | "),
        user.account_status || "active",
        user.email_confirmed_at ? "oui" : "non",
        (user.anomalies || []).map((anomaly) => ANOMALY_LABELS[anomaly] || anomaly).join(" | "),
        user.created_at,
      ]),
    ]);
  };

  const exportApplicationsCsv = () => {
    downloadCsv("admin-dossiers.csv", [
      ["ID", "Utilisateur", "Nom", "Email", "Profil", "Statut", "Ville", "Soumis le", "Revu le"],
      ...filteredApplications.map((application) => [
        application.id,
        application.user_id,
        application.full_name,
        usersById[application.user_id]?.email,
        getSignupRoleLabel(application.requested_role),
        application.status,
        application.city,
        application.submitted_at,
        application.reviewed_at,
      ]),
    ]);
  };

  const exportCouriersCsv = () => {
    downloadCsv("admin-livreurs.csv", [
      ["ID", "Utilisateur", "Nom", "Email", "Téléphone", "Statut", "Véhicule", "Livraisons", "Note", "Mis à jour le"],
      ...filteredCouriers.map((courier) => {
        const application = courierApplicationsByUserId.get(courier.user_id);
        return [
          courier.id,
          courier.user_id,
          getCourierDisplayName(courier, application),
          usersById[courier.user_id]?.email,
          courier.phone || application?.phone,
          courier.status,
          getCourierVehicleLabel(courier.vehicle_type),
          courier.total_deliveries,
          courier.rating,
          courier.updated_at,
        ];
      }),
    ]);
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

  const handleAdminTabChange = (value: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (value === "applications" || value === "couriers") {
      nextParams.set("tab", value);
    } else {
      nextParams.delete("tab");
    }
    setSearchParams(nextParams, { replace: true });
  };

  return (
    <div className="container py-8 space-y-6">
      <DashboardPageHero
        badge="Identités et rôles"
        title="Gestion des utilisateurs"
        description="Administrez les rôles applicatifs, les comptes et les dossiers d'inscription vérifiés dans une interface unique."
        icon={Users}
        tone="sky"
        visualLabel="Utilisateurs"
        stats={[
          { label: "Utilisateurs", value: users.length, icon: Users },
          { label: "Restaurateurs", value: roleCounts.restaurateur, icon: FileText },
          { label: "Commerciaux", value: roleCounts.commercial || 0, icon: BriefcaseBusiness },
          { label: "Livreurs à valider", value: courierCounts.pending_approval, icon: Bike },
        ]}
      />

      <Tabs value={activeAdminTab} onValueChange={handleAdminTabChange} className="space-y-6">
        <TabsList className="grid w-full max-w-xl grid-cols-3">
          <TabsTrigger value="users">Comptes</TabsTrigger>
          <TabsTrigger value="applications" className="relative gap-2">
            Dossiers
            {pendingRestaurantApplicationsCount > 0 ? (
              <span
                className="ml-1 inline-flex min-h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1.5 text-[10px] font-bold leading-none text-white shadow-sm"
                aria-label={`${pendingRestaurantApplicationsCount} dossier restaurateur en attente`}
              >
                {pendingRestaurantApplicationsCount}
              </span>
            ) : null}
          </TabsTrigger>
          <TabsTrigger value="couriers">Livreurs</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
              <p className="text-2xl font-bold">{roleCounts.commercial || 0}</p>
              <p className="text-xs text-muted-foreground">Commerciaux</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{accountStatusCounts.suspended || 0}</p>
              <p className="text-xs text-muted-foreground">Suspendus</p>
            </div>
          </div>

          {governanceAlerts.length > 0 ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-center gap-2 text-sm font-medium text-amber-900">
                <AlertTriangle className="h-4 w-4" />
                {governanceAlerts.length} anomalie{governanceAlerts.length > 1 ? "s" : ""} à traiter
              </div>
              <div className="mt-3 grid gap-2 md:grid-cols-2">
                {governanceAlerts.slice(0, 6).map((alert) => (
                  <button
                    key={alert.alert_key}
                    type="button"
                    onClick={() => setSelectedUserId(alert.user_id)}
                    className="rounded-lg border bg-background p-3 text-left text-xs hover:bg-muted"
                  >
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{alert.title}</span>
                      <Badge variant={alert.severity === "critical" ? "destructive" : "secondary"}>
                        {alert.severity}
                      </Badge>
                    </div>
                    <p className="pt-1 text-muted-foreground">{alert.description}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div className="grid gap-3 xl:grid-cols-[1fr_auto_auto_auto_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher par nom, email, ville, statut ou ID..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <select
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les rôles</option>
              <option value="client">Client</option>
              <option value="restaurateur">Restaurateur</option>
              <option value="admin">Admin</option>
              <option value="courier">Livreur</option>
              <option value="commercial">Commercial</option>
            </select>
            <select
              value={accountStatusFilter}
              onChange={(event) => setAccountStatusFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les comptes</option>
              <option value="active">Actifs</option>
              <option value="suspended">Suspendus</option>
            </select>
            <select
              value={anomalyFilter}
              onChange={(event) => setAnomalyFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Toutes anomalies</option>
              {Object.entries(ANOMALY_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label} ({anomalyCounts[value] || 0})
                </option>
              ))}
            </select>
            <select
              value={createdFilter}
              onChange={(event) => setCreatedFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Toute date</option>
              <option value="7">7 derniers jours</option>
              <option value="30">30 derniers jours</option>
              <option value="90">90 derniers jours</option>
            </select>
            <Button type="button" variant="outline" className="gap-2" onClick={exportUsersCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
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
            <>
              <div className="space-y-3">
                {filteredUsers.map((user) => {
                  const baseRoles = user.roles || ["client"];
                  const effectiveRoles = user.effectiveRoles;
                  const hasChanges =
                    JSON.stringify([...effectiveRoles].sort()) !== JSON.stringify([...baseRoles].sort());
                  const statusMeta =
                    ACCOUNT_STATUS_META[user.account_status || "active"] || ACCOUNT_STATUS_META.active;
                  const anomalies = user.anomalies || [];
                  const userAlerts = governanceAlertsByUserId[user.user_id] || [];
                  const commercialProfile = commercialProfilesByUserId[user.user_id];
                  const hasCommercialRole = effectiveRoles.includes("commercial");

                  return (
                    <div key={user.user_id} className="rounded-xl border bg-card p-4 space-y-4">
                      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                        <div className="min-w-0">
                          <h3 className="font-semibold text-sm">{user.full_name || "Utilisateur"}</h3>
                          <p className="text-xs text-muted-foreground break-all">{user.email || user.user_id}</p>
                          <p className="text-xs text-muted-foreground">
                            {user.city || "Ville non renseignée"} · créé le {formatDate(user.created_at)}
                          </p>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
                          <Badge variant={user.email_confirmed_at ? "secondary" : "outline"}>
                            {user.email_confirmed_at ? "Email confirmé" : "Email non confirmé"}
                          </Badge>
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
                              {getRoleLabel(role)}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {anomalies.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {anomalies.map((anomaly) => (
                            <Badge key={anomaly} variant="outline" className="border-amber-300 text-amber-800">
                              {ANOMALY_LABELS[anomaly] || anomaly}
                            </Badge>
                          ))}
                        </div>
                      ) : null}

                      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                        {AVAILABLE_ROLES.map((role) => (
                          <label key={role} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                            <input
                              type="checkbox"
                              checked={effectiveRoles.includes(role)}
                              onChange={() => toggleRole(user.user_id, role)}
                            />
                            <span>{getRoleLabel(role)}</span>
                          </label>
                        ))}
                      </div>

                      {hasCommercialRole ? (
                        <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 text-sm">
                          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                            <div>
                              <div className="flex items-center gap-2 font-semibold text-orange-900">
                                <BriefcaseBusiness className="h-4 w-4" />
                                Paramètres commerciaux
                              </div>
                              <p className="mt-1 text-xs text-orange-900/70">
                                Le rôle commercial crée un profil de rémunération. Ces champs pilotent le fixe, le sprint et les commissions récurrentes.
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="outline"
                              className="w-full bg-white lg:w-auto"
                              onClick={() => navigate(`/commercial/comptabilite?commercialUserId=${user.user_id}`)}
                            >
                              Voir comptabilité
                            </Button>
                          </div>

                          <div className="mt-4 grid gap-3 md:grid-cols-4">
                            <label className="space-y-1">
                              <span className="text-xs font-medium uppercase tracking-[0.12em] text-orange-900/70">Statut</span>
                              <select
                                value={commercialProfile?.status || "sprint"}
                                onChange={(event) => updateCommercialProfile(user.user_id, { status: event.target.value })}
                                disabled={savingCommercialProfileUserId === user.user_id}
                                className="h-10 w-full rounded-md border bg-white px-3 text-sm"
                              >
                                <option value="sprint">Sprint 60 jours</option>
                                <option value="engaged">Commercial engagé</option>
                                <option value="team_lead">Responsable commercial</option>
                                <option value="inactive">Inactif</option>
                              </select>
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-medium uppercase tracking-[0.12em] text-orange-900/70">Debut sprint</span>
                              <Input
                                type="date"
                                value={commercialProfile?.sprint_started_at || new Date().toISOString().slice(0, 10)}
                                onChange={(event) => updateCommercialProfile(user.user_id, { sprint_started_at: event.target.value })}
                                disabled={savingCommercialProfileUserId === user.user_id}
                                className="bg-white"
                              />
                            </label>
                            <label className="space-y-1">
                              <span className="text-xs font-medium uppercase tracking-[0.12em] text-orange-900/70">Date engagement</span>
                              <Input
                                type="date"
                                value={commercialProfile?.engaged_at || ""}
                                onChange={(event) => updateCommercialProfile(user.user_id, { engaged_at: event.target.value })}
                                disabled={savingCommercialProfileUserId === user.user_id}
                                className="bg-white"
                              />
                            </label>
                            <label className="flex min-h-10 items-center gap-2 rounded-lg border bg-white px-3">
                              <input
                                type="checkbox"
                                checked={Boolean(commercialProfile?.employment_active)}
                                onChange={(event) => updateCommercialProfile(user.user_id, { employment_active: event.target.checked })}
                                disabled={savingCommercialProfileUserId === user.user_id}
                              />
                              <span className="text-sm font-medium">Contrat actif</span>
                            </label>
                          </div>
                        </div>
                      ) : null}

                      {baseRoles.includes("admin") ? (
                        <div className="flex items-center gap-2 rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                          <ShieldCheck className="h-3.5 w-3.5" />
                          Dernier admin protégé côté base lors des changements de rôle.
                        </div>
                      ) : null}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-muted-foreground">
                          {userAlerts.length > 0
                            ? `${userAlerts.length} signal${userAlerts.length > 1 ? "s" : ""} de gouvernance`
                            : "Aucun signal prioritaire"}
                        </div>
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button variant="outline" onClick={() => setSelectedUserId(user.user_id)}>
                            Fiche
                          </Button>
                          {(user.account_status || "active") === "suspended" ? (
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => changeAccountStatus(user.user_id, "active")}
                              disabled={changingAccountUserId === user.user_id}
                            >
                              <RotateCcw className="h-4 w-4" />
                              Réactiver
                            </Button>
                          ) : (
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => changeAccountStatus(user.user_id, "suspended")}
                              disabled={changingAccountUserId === user.user_id}
                            >
                              <Ban className="h-4 w-4" />
                              Suspendre
                            </Button>
                          )}
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
                          ) : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {filteredUsers.length === 0 ? (
                  <p className="text-center text-muted-foreground py-8">Aucun utilisateur trouvé.</p>
                ) : null}
              </div>
              <Dialog
                open={Boolean(selectedUserId)}
                onOpenChange={(open) => {
                  if (!open) setSelectedUserId(null);
                }}
              >
                <DialogContent className="max-h-[90vh] w-[min(96vw,980px)] max-w-none overflow-y-auto p-0">
                  <DialogHeader className="border-b px-6 py-5 pr-12">
                    <DialogTitle>Fiche utilisateur</DialogTitle>
                    <DialogDescription>
                      Informations de compte, rôles, commandes, réservations, incidents, restaurants, livreur, dossiers
                      et historique.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="p-6">
                    <UserDetailPanel userId={selectedUserId} embedded />
                  </div>
                </DialogContent>
              </Dialog>
            </>
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
              <p className="text-xs text-muted-foreground">Approuvés</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{applicationCounts.rejected}</p>
              <p className="text-xs text-muted-foreground">Refusés</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto_auto]">
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
              <option value="approved">Approuvé</option>
              <option value="rejected">Refusé</option>
            </select>
            <Button type="button" variant="outline" className="gap-2" onClick={exportApplicationsCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
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
                const onboardingSelection = getSignupRestaurateurOnboardingSelection(application);
                const onboardingPaymentReady = canApproveSignupApplication(application);

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
                            : "récemment"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant="outline">{getSignupRoleLabel(application.requested_role)}</Badge>
                        <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Téléphone</p>
                        <p className="pt-1 font-medium">{application.phone || "Non renseigné"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Ville</p>
                        <p className="pt-1 font-medium">{application.city || "Non renseignée"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Entreprise / restaurant</p>
                        <p className="pt-1 font-medium">
                          {application.restaurant_name || application.business_name || "Sans entreprise"}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Véhicule / IBAN</p>
                        <p className="pt-1 font-medium">
                          {application.vehicle_type || application.iban || "Sans détail"}
                        </p>
                      </div>
                    </div>

                    {onboardingSelection ? (
                      <div className="rounded-xl border p-4 text-sm">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="font-medium">Paiement onboarding</p>
                            <p className="pt-1 text-muted-foreground">
                              Abonnement {onboardingSelection.subscriptionBillingPeriod === "yearly" ? "annuel" : "mensuel"} sélectionné.
                            </p>
                          </div>
                          <Badge className={onboardingPaymentReady ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}>
                            {getOnboardingPaymentStatusLabel(application)}
                          </Badge>
                        </div>
                        {!onboardingPaymentReady ? (
                          <p className="pt-3 text-xs text-muted-foreground">
                            L'approbation admin sera refusée par Supabase tant que l'abonnement n'est pas payé.
                          </p>
                        ) : null}
                      </div>
                    ) : null}

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
                                <SignupDocumentPreview document={document} />
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
                          Aucun document n'est rattaché à ce dossier.
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
                        placeholder="Motif de validation, corrections demandées ou raison du refus..."
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
                        disabled={reviewingApplicationId === application.id || !onboardingPaymentReady}
                      >
                        {reviewingApplicationId === application.id
                          ? "Enregistrement..."
                          : !onboardingPaymentReady
                            ? "Paiement requis"
                            : "Approuver"}
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

        <TabsContent value="couriers" className="space-y-6">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{courierCounts.pending_approval}</p>
              <p className="text-xs text-muted-foreground">À valider</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{courierCounts.approved}</p>
              <p className="text-xs text-muted-foreground">Validés</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{courierCounts.suspended}</p>
              <p className="text-xs text-muted-foreground">Suspendus</p>
            </div>
            <div className="rounded-xl border bg-card p-4 text-center">
              <p className="text-2xl font-bold">{courierCounts.rejected}</p>
              <p className="text-xs text-muted-foreground">Refusés</p>
            </div>
          </div>

          <div className="grid gap-3 lg:grid-cols-[1fr_auto_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher par nom, email, téléphone, plaque ou ID..."
                value={courierSearch}
                onChange={(event) => setCourierSearch(event.target.value)}
              />
            </div>
            <select
              value={courierStatusFilter}
              onChange={(event) => setCourierStatusFilter(event.target.value)}
              className="h-10 rounded-md border bg-background px-3 text-sm"
            >
              <option value="all">Tous les statuts</option>
              <option value="pending_approval">À valider</option>
              <option value="approved">Validé</option>
              <option value="suspended">Suspendu</option>
              <option value="rejected">Refusé</option>
            </select>
            <Button type="button" variant="outline" className="gap-2" onClick={exportCouriersCsv}>
              <Download className="h-4 w-4" />
              CSV
            </Button>
          </div>

          {couriersLoading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((index) => (
                <div key={index} className="h-56 rounded-xl bg-muted animate-pulse" />
              ))}
            </div>
          ) : couriersError ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              Impossible de charger les profils livreurs.
            </div>
          ) : (
            <div className="space-y-4">
              {filteredCouriers.map((courier) => {
                const linkedUser = usersById[courier.user_id];
                const linkedApplication = courierApplicationsByUserId.get(courier.user_id);
                const statusMeta = COURIER_APPROVAL_STATUS_META[courier.status] || {
                  label: courier.status,
                  tone: "bg-muted text-muted-foreground",
                };
                const applicationStatusMeta = getSignupStatusMeta(linkedApplication?.status);
                const documentsCount = linkedApplication?.signup_application_documents?.length || 0;
                const noteValue = courierReviewNotes[courier.id] ?? linkedApplication?.review_note ?? "";
                const hasCourierRole = Boolean(linkedUser?.roles?.includes("courier"));
                const isReviewing = reviewingCourierId === courier.id;

                return (
                  <div key={courier.id} className="rounded-xl border bg-card p-4 space-y-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <h3 className="font-semibold text-sm">{getCourierDisplayName(courier, linkedApplication)}</h3>
                        <p className="text-xs text-muted-foreground break-all">
                          {linkedUser?.email || courier.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Mis à jour le{" "}
                          {courier.updated_at
                            ? new Date(courier.updated_at).toLocaleDateString("fr-CH")
                            : "récemment"}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Badge className={statusMeta.tone}>{statusMeta.label}</Badge>
                        <Badge variant={hasCourierRole ? "default" : "outline"}>
                          Rôle {hasCourierRole ? "actif" : "non attribué"}
                        </Badge>
                        {courier.is_online ? <Badge className="bg-emerald-100 text-emerald-700">En ligne</Badge> : null}
                      </div>
                    </div>

                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Téléphone</p>
                        <p className="pt-1 font-medium">{courier.phone || linkedApplication?.phone || "Non renseigné"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Ville</p>
                        <p className="pt-1 font-medium">{linkedApplication?.city || "Non renseignée"}</p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Véhicule</p>
                        <p className="pt-1 font-medium">
                          {getCourierVehicleLabel(courier.vehicle_type)}
                          {courier.license_plate ? ` - ${courier.license_plate}` : ""}
                        </p>
                      </div>
                      <div className="rounded-xl border p-3 text-sm">
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Performance</p>
                        <p className="pt-1 font-medium">
                          {courier.total_deliveries || 0} livraisons - {Number(courier.rating || 0).toFixed(1)}/5
                        </p>
                      </div>
                    </div>

                    <div className="rounded-xl border p-3 text-sm">
                      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                        <div>
                          <p className="font-medium">Dossier de vérification livreur</p>
                          {linkedApplication ? (
                            <p className="text-xs text-muted-foreground">
                              {documentsCount} document{documentsCount > 1 ? "s" : ""} - statut dossier{" "}
                              <span className="font-medium">{applicationStatusMeta.label}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground">Aucun dossier d'inscription lié à ce profil.</p>
                          )}
                        </div>
                        {linkedApplication ? (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              setApplicationRoleFilter("courier");
                              setApplicationStatusFilter("all");
                              setApplicationSearch(linkedUser?.email || courier.user_id);
                              handleAdminTabChange("applications");
                            }}
                          >
                            Voir le dossier
                          </Button>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor={`courier-review-note-${courier.id}`}>Note de validation</Label>
                      <Textarea
                        id={`courier-review-note-${courier.id}`}
                        value={noteValue}
                        onChange={(event) =>
                          setCourierReviewNotes((current) => ({
                            ...current,
                            [courier.id]: event.target.value,
                          }))
                        }
                        placeholder="Motif d'approbation, de suspension ou de refus..."
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-2">
                      {courier.status !== "pending_approval" ? (
                        <Button
                          variant="outline"
                          onClick={() => reviewCourierProfile(courier.id, "pending_approval")}
                          disabled={isReviewing}
                        >
                          Remettre en attente
                        </Button>
                      ) : null}
                      {courier.status === "approved" ? (
                        <Button
                          variant="outline"
                          onClick={() => reviewCourierProfile(courier.id, "suspended")}
                          disabled={isReviewing}
                        >
                          Suspendre
                        </Button>
                      ) : null}
                      {courier.status !== "rejected" ? (
                        <Button
                          variant="destructive"
                          onClick={() => reviewCourierProfile(courier.id, "rejected")}
                          disabled={isReviewing}
                        >
                          Refuser
                        </Button>
                      ) : null}
                      <Button
                        onClick={() => reviewCourierProfile(courier.id, "approved")}
                        disabled={isReviewing || courier.status === "approved"}
                      >
                        {isReviewing ? "Enregistrement..." : courier.status === "approved" ? "Déjà approuvé" : "Approuver"}
                      </Button>
                    </div>
                  </div>
                );
              })}

              {filteredCouriers.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">Aucun profil livreur correspondant.</p>
              ) : null}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
