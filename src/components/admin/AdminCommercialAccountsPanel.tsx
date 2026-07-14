import { useMemo, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CheckCircle2,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRoundCheck,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { invokeSupabaseFunction } from "@/lib/session";

type ManagedCommercialAccount = {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  created_at: string;
  last_sign_in_at: string | null;
  last_password_reset_at: string | null;
  enabled: boolean;
  template_version: number;
  demo_restaurant: {
    id: string;
    name: string;
    is_demo: boolean;
    is_active: boolean | null;
    status: string | null;
  } | null;
};

type OneTimeCredentials = {
  fullName: string;
  email: string;
  password: string;
  kind: "created" | "reset";
};

const PASSWORD_SYMBOLS = "!@#$%*-_+?";
const PASSWORD_ALPHABET = `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789${PASSWORD_SYMBOLS}`;
const REQUIRED_COMMERCIAL_ROLES = ["commercial", "client", "restaurateur"];
const ROLE_LABELS: Record<string, string> = {
  commercial: "Commercial",
  client: "Client",
  restaurateur: "Restaurateur",
};

function getAccountIntegrityIssues(account: ManagedCommercialAccount) {
  const issues: string[] = [];
  const missingRoles = REQUIRED_COMMERCIAL_ROLES.filter((role) => !account.roles.includes(role));
  if (missingRoles.length > 0) issues.push(`Rôles manquants : ${missingRoles.map((role) => ROLE_LABELS[role]).join(", ")}`);
  if (!account.email) issues.push("Identité Auth introuvable");
  if (!account.demo_restaurant) issues.push("Restaurant de démonstration absent");
  if (account.demo_restaurant && !account.demo_restaurant.is_demo) issues.push("Restaurant non marqué comme démo");
  if (account.demo_restaurant?.is_active) issues.push("Restaurant démo publié par erreur");
  if (account.demo_restaurant && account.demo_restaurant.status !== "demo") issues.push("Statut restaurant invalide");
  return issues;
}

function randomCharacter(alphabet: string) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return alphabet[values[0] % alphabet.length];
}

function generateStrongPassword(length = 18) {
  const required = [
    randomCharacter("ABCDEFGHJKLMNPQRSTUVWXYZ"),
    randomCharacter("abcdefghijkmnopqrstuvwxyz"),
    randomCharacter("23456789"),
    randomCharacter(PASSWORD_SYMBOLS),
  ];

  while (required.length < length) required.push(randomCharacter(PASSWORD_ALPHABET));

  for (let index = required.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swapIndex = values[0] % (index + 1);
    [required[index], required[swapIndex]] = [required[swapIndex], required[index]];
  }

  return required.join("");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Jamais";
  return new Date(value).toLocaleString("fr-CH", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copié`);
  } catch {
    toast.error("Copie impossible sur cet appareil.");
  }
}

export default function AdminCommercialAccountsPanel() {
  const queryClient = useQueryClient();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generateStrongPassword());
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [oneTimeCredentials, setOneTimeCredentials] = useState<OneTimeCredentials | null>(null);
  const [resetAccount, setResetAccount] = useState<ManagedCommercialAccount | null>(null);
  const [resetPassword, setResetPassword] = useState(() => generateStrongPassword());
  const [showResetPassword, setShowResetPassword] = useState(false);
  const [resetting, setResetting] = useState(false);

  const accountsQuery = useQuery({
    queryKey: ["admin-managed-commercial-accounts"],
    queryFn: async () => {
      const { data, error } = await invokeSupabaseFunction<{ accounts?: ManagedCommercialAccount[] }>(
        "provision-commercial-accounts",
        { body: { action: "list" } },
      );
      if (error) throw error;
      return data?.accounts || [];
    },
  });

  const accounts = accountsQuery.data || [];
  const activeCount = useMemo(() => accounts.filter((account) => account.enabled).length, [accounts]);

  async function handleCreate(event: FormEvent) {
    event.preventDefault();
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedName || !normalizedEmail || !password) {
      toast.error("Nom, identifiant e-mail et mot de passe sont obligatoires.");
      return;
    }

    setSubmitting(true);
    try {
      const passwordSnapshot = password;
      const { error } = await invokeSupabaseFunction("provision-commercial-accounts", {
        body: {
          action: "create",
          full_name: normalizedName,
          email: normalizedEmail,
          password: passwordSnapshot,
        },
      });
      if (error) throw error;

      setOneTimeCredentials({
        fullName: normalizedName,
        email: normalizedEmail,
        password: passwordSnapshot,
        kind: "created",
      });
      setFullName("");
      setEmail("");
      setPassword(generateStrongPassword());
      await queryClient.invalidateQueries({ queryKey: ["admin-managed-commercial-accounts"] });
      await queryClient.invalidateQueries({ queryKey: ["admin-users-full"] });
      toast.success("Compte commercial créé avec son restaurant de démonstration.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de créer le compte commercial.");
    } finally {
      setSubmitting(false);
    }
  }

  function openPasswordReset(account: ManagedCommercialAccount) {
    setResetAccount(account);
    setResetPassword(generateStrongPassword());
    setShowResetPassword(false);
  }

  async function handleResetPassword() {
    if (!resetAccount) return;

    setResetting(true);
    try {
      const passwordSnapshot = resetPassword;
      const { error } = await invokeSupabaseFunction("provision-commercial-accounts", {
        body: {
          action: "reset_password",
          user_id: resetAccount.user_id,
          password: passwordSnapshot,
        },
      });
      if (error) throw error;

      setOneTimeCredentials({
        fullName: resetAccount.full_name,
        email: resetAccount.email || "",
        password: passwordSnapshot,
        kind: "reset",
      });
      setResetAccount(null);
      setResetPassword(generateStrongPassword());
      await queryClient.invalidateQueries({ queryKey: ["admin-managed-commercial-accounts"] });
      toast.success("Mot de passe remplacé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible de remplacer le mot de passe.");
    } finally {
      setResetting(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <UserRoundCheck className="h-8 w-8 text-sky-600" />
            <div>
              <p className="text-2xl font-bold">{accounts.length}</p>
              <p className="text-xs text-muted-foreground">Comptes gérés</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <div>
              <p className="text-2xl font-bold">{activeCount}</p>
              <p className="text-xs text-muted-foreground">Comptes actifs</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <Store className="h-8 w-8 text-orange-600" />
            <div>
              <p className="text-2xl font-bold">{accounts.filter((account) => account.demo_restaurant?.is_demo).length}</p>
              <p className="text-xs text-muted-foreground">Restaurants isolés</p>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="border-sky-200 bg-sky-50/40 dark:border-sky-400/20 dark:bg-sky-500/5">
        <CardHeader>
          <div className="flex items-start gap-3">
            <span className="rounded-xl bg-sky-100 p-2 text-sky-700 dark:bg-sky-400/15 dark:text-sky-100">
              <ShieldCheck className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="text-lg">Créer un compte commercial</CardTitle>
              <CardDescription className="mt-1">
                Le compte reçoit les espaces Commercial, Client et Restaurateur. Son espace restaurateur contient uniquement un restaurant de démonstration non public.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleCreate} className="grid gap-4 lg:grid-cols-[1fr_1.2fr_1.2fr_auto] lg:items-end">
            <div className="space-y-2">
              <Label htmlFor="commercial-full-name">Nom complet</Label>
              <Input
                id="commercial-full-name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Camille Dupont"
                autoComplete="off"
                maxLength={120}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="commercial-email">Identifiant (e-mail)</Label>
              <Input
                id="commercial-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="camille@thetok.ch"
                autoComplete="off"
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label htmlFor="commercial-password">Mot de passe initial</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setPassword(generateStrongPassword())}>
                  <RefreshCw className="mr-1 h-3 w-3" /> Générer
                </Button>
              </div>
              <div className="flex gap-2">
                <Input
                  id="commercial-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  required
                />
                <Button type="button" variant="outline" size="icon" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <Button type="submit" disabled={submitting} className="gap-2 lg:mb-0">
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              Créer
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground">
            Le mot de passe n'est jamais stocké dans la base métier ni dans les journaux. Il ne sera affiché qu'une fois après la création.
          </p>
        </CardContent>
      </Card>

      {oneTimeCredentials ? (
        <Card className="border-emerald-300 bg-emerald-50/70 dark:border-emerald-400/25 dark:bg-emerald-500/10" data-testid="commercial-one-time-credentials">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg text-emerald-900 dark:text-emerald-100">
              <KeyRound className="h-5 w-5" />
              {oneTimeCredentials.kind === "created" ? "Identifiants prêts" : "Nouveau mot de passe prêt"}
            </CardTitle>
            <CardDescription className="text-emerald-800/80 dark:text-emerald-100/70">
              Copiez-les maintenant et transmettez-les par un canal sécurisé. Le mot de passe ne pourra pas être relu ensuite.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-emerald-200 bg-background p-3">
              <p className="text-xs text-muted-foreground">Identifiant</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all text-sm font-semibold">{oneTimeCredentials.email}</code>
                <Button type="button" variant="ghost" size="icon" aria-label="Copier l'identifiant" onClick={() => copyText(oneTimeCredentials.email, "Identifiant")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="rounded-xl border border-emerald-200 bg-background p-3">
              <p className="text-xs text-muted-foreground">Mot de passe</p>
              <div className="mt-1 flex items-center justify-between gap-2">
                <code className="break-all text-sm font-semibold">{oneTimeCredentials.password}</code>
                <Button type="button" variant="ghost" size="icon" aria-label="Copier le mot de passe" onClick={() => copyText(oneTimeCredentials.password, "Mot de passe")}>
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="md:col-span-2 flex justify-end">
              <Button type="button" variant="outline" onClick={() => setOneTimeCredentials(null)}>J'ai copié les identifiants</Button>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader className="flex-row items-start justify-between gap-4">
          <div>
            <CardTitle>Comptes commerciaux</CardTitle>
            <CardDescription>Liste responsive des comptes administrés et de leur environnement de démonstration.</CardDescription>
          </div>
          <Button type="button" variant="outline" size="icon" onClick={() => accountsQuery.refetch()} aria-label="Actualiser les comptes">
            <RefreshCw className={`h-4 w-4 ${accountsQuery.isFetching ? "animate-spin" : ""}`} />
          </Button>
        </CardHeader>
        <CardContent>
          {accountsQuery.isLoading ? (
            <div className="space-y-3">
              {[1, 2].map((value) => <div key={value} className="h-36 animate-pulse rounded-xl bg-muted" />)}
            </div>
          ) : accountsQuery.error ? (
            <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
              {accountsQuery.error instanceof Error ? accountsQuery.error.message : "Impossible de charger les comptes."}
            </div>
          ) : accounts.length === 0 ? (
            <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">
              Aucun compte commercial administré. Utilisez le formulaire ci-dessus pour créer le premier.
            </div>
          ) : (
            <div className="grid gap-4 xl:grid-cols-2">
              {accounts.map((account) => (
                <article
                  key={account.user_id}
                  className={`rounded-2xl border bg-card p-4 shadow-sm ${getAccountIntegrityIssues(account).length > 0 ? "border-destructive/50" : ""}`}
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold">{account.full_name}</h3>
                        <Badge variant={account.enabled ? "secondary" : "destructive"}>{account.enabled ? "Actif" : "Désactivé"}</Badge>
                      </div>
                      <p className="mt-1 break-all text-sm text-muted-foreground">{account.email || "E-mail indisponible"}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" className="shrink-0 gap-2" onClick={() => openPasswordReset(account)}>
                      <KeyRound className="h-4 w-4" /> Nouveau mot de passe
                    </Button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    {account.roles.map((role) => <Badge key={role} variant="outline">{ROLE_LABELS[role] || role}</Badge>)}
                  </div>

                  <div className="mt-4 rounded-xl bg-muted/45 p-3">
                    <div className="flex items-start gap-2">
                      <Store className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      <div className="min-w-0">
                        <p className="break-words text-sm font-medium">{account.demo_restaurant?.name || "Restaurant démo à réparer"}</p>
                        <p className="text-xs text-muted-foreground">
                          {getAccountIntegrityIssues(account).length === 0
                            ? "Non public · outils visibles · effets externes bloqués"
                            : "Configuration incomplète — intervention administrateur requise"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {getAccountIntegrityIssues(account).length > 0 ? (
                    <div className="mt-3 rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive" role="alert">
                      <p className="font-semibold">Anomalie d'intégrité</p>
                      <ul className="mt-1 list-disc space-y-1 pl-4">
                        {getAccountIntegrityIssues(account).map((issue) => <li key={issue}>{issue}</li>)}
                      </ul>
                    </div>
                  ) : null}

                  <dl className="mt-4 grid gap-3 text-xs text-muted-foreground sm:grid-cols-2">
                    <div><dt>Créé le</dt><dd className="font-medium text-foreground">{formatDate(account.created_at)}</dd></div>
                    <div><dt>Dernière connexion</dt><dd className="font-medium text-foreground">{formatDate(account.last_sign_in_at)}</dd></div>
                  </dl>
                </article>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={Boolean(resetAccount)} onOpenChange={(open) => !open && setResetAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remplacer le mot de passe</DialogTitle>
            <DialogDescription>
              Le mot de passe actuel de {resetAccount?.full_name} sera remplacé. Le nouveau sera affiché une seule fois.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="commercial-reset-password">Nouveau mot de passe</Label>
            <div className="flex gap-2">
              <Input id="commercial-reset-password" type={showResetPassword ? "text" : "password"} value={resetPassword} onChange={(event) => setResetPassword(event.target.value)} autoComplete="new-password" minLength={12} />
              <Button type="button" variant="outline" size="icon" onClick={() => setShowResetPassword((visible) => !visible)} aria-label={showResetPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}>
                {showResetPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
              <Button type="button" variant="outline" size="icon" onClick={() => setResetPassword(generateStrongPassword())} aria-label="Générer un nouveau mot de passe">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setResetAccount(null)}>Annuler</Button>
            <Button type="button" onClick={handleResetPassword} disabled={resetting} className="gap-2">
              {resetting ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Remplacer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
