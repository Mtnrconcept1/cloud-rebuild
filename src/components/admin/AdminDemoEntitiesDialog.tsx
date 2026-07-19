import { useMemo, useRef, useState, type FormEvent } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  Eye,
  EyeOff,
  FlaskConical,
  Link2,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Store,
  UserRoundPlus,
} from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
import { invokeSupabaseFunction, isSessionExpiredError } from "@/lib/session";

type DemoUser = {
  user_id: string;
  full_name: string;
  email: string | null;
  roles: string[];
  restaurant_ids: string[];
  created_at: string | null;
  last_sign_in_at: string | null;
};

type DemoRestaurant = {
  id: string;
  name: string;
  address: string;
  city: string;
  cuisine_type: string | null;
  owner_user_id: string | null;
  expected_owner_id: string;
  owner_name: string | null;
  owner_email: string | null;
  is_active: boolean;
  status: string;
  created_at: string | null;
};

type DemoEnvironmentResponse = {
  ok: boolean;
  project_ref: string;
  users: DemoUser[];
  restaurants: DemoRestaurant[];
};

type OneTimeDemoCredentials = {
  fullName: string;
  email: string;
  password: string;
};

type AdminDemoEntitiesDialogProps = {
  mode: "users" | "restaurants";
};

const PASSWORD_SYMBOLS = "!@#$%*-_+?";
const PASSWORD_ALPHABET = `ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789${PASSWORD_SYMBOLS}`;

function randomCharacter(alphabet: string) {
  const values = new Uint32Array(1);
  crypto.getRandomValues(values);
  return alphabet[values[0] % alphabet.length];
}

function generateStrongPassword(length = 18) {
  const characters = [
    randomCharacter("ABCDEFGHJKLMNPQRSTUVWXYZ"),
    randomCharacter("abcdefghijkmnopqrstuvwxyz"),
    randomCharacter("23456789"),
    randomCharacter(PASSWORD_SYMBOLS),
  ];
  while (characters.length < length) characters.push(randomCharacter(PASSWORD_ALPHABET));
  for (let index = characters.length - 1; index > 0; index -= 1) {
    const values = new Uint32Array(1);
    crypto.getRandomValues(values);
    const swapIndex = values[0] % (index + 1);
    [characters[index], characters[swapIndex]] = [characters[swapIndex], characters[index]];
  }
  return characters.join("");
}

function formatDate(value: string | null | undefined) {
  if (!value) return "Jamais";
  return new Date(value).toLocaleString("fr-CH", { dateStyle: "medium", timeStyle: "short" });
}

async function copyText(value: string, label: string) {
  try {
    await navigator.clipboard.writeText(value);
    toast.success(`${label} copié`);
  } catch {
    toast.error("Copie impossible sur cet appareil.");
  }
}

export default function AdminDemoEntitiesDialog({ mode }: AdminDemoEntitiesDialogProps) {
  const queryClient = useQueryClient();
  const mutationLockRef = useRef(false);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => generateStrongPassword());
  const [restaurantName, setRestaurantName] = useState("");
  const [restaurantAddress, setRestaurantAddress] = useState("");
  const [restaurantCity, setRestaurantCity] = useState("Genève");
  const [restaurantCuisine, setRestaurantCuisine] = useState("");
  const [restaurantPhone, setRestaurantPhone] = useState("");
  const [restaurantOwnerId, setRestaurantOwnerId] = useState("");
  const [linkUserId, setLinkUserId] = useState("");
  const [linkRestaurantId, setLinkRestaurantId] = useState("");
  const [linkReason, setLinkReason] = useState("Liaison validée depuis le dashboard admin");
  const [oneTimeCredentials, setOneTimeCredentials] = useState<OneTimeDemoCredentials | null>(null);
  const demoLoginUrl = typeof window === "undefined" ? "/auth/demo" : `${window.location.origin}/auth/demo`;

  const environmentQuery = useQuery({
    queryKey: ["admin-demo-entities"],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await invokeSupabaseFunction<DemoEnvironmentResponse>("admin-demo-entities", {
        body: { action: "list" },
      });
      if (error) throw error;
      return data || { ok: true, project_ref: "", users: [], restaurants: [] };
    },
    retry: (failureCount, error) => !isSessionExpiredError(error) && failureCount < 2,
    staleTime: 10_000,
  });

  const users = environmentQuery.data?.users || [];
  const restaurants = environmentQuery.data?.restaurants || [];
  const selectedLinkRestaurant = useMemo(
    () => restaurants.find((restaurant) => restaurant.id === linkRestaurantId) || null,
    [linkRestaurantId, restaurants],
  );
  const selectedLinkUser = useMemo(
    () => users.find((user) => user.user_id === linkUserId) || null,
    [linkUserId, users],
  );
  const alreadyLinked = Boolean(
    selectedLinkRestaurant?.owner_user_id
      && selectedLinkRestaurant.owner_user_id === selectedLinkUser?.user_id,
  );

  async function refreshEnvironment() {
    await queryClient.invalidateQueries({ queryKey: ["admin-demo-entities"] });
    await environmentQuery.refetch();
  }

  async function runMutation<T>(
    body: Record<string, unknown>,
    onSuccess: (data: T | null) => void | Promise<void>,
  ) {
    if (mutationLockRef.current) return;
    mutationLockRef.current = true;
    setSubmitting(true);
    try {
      const { data, error } = await invokeSupabaseFunction<T>("admin-demo-entities", {
        body: { ...body, request_id: crypto.randomUUID() },
      });
      if (error) throw error;
      await onSuccess(data || null);
      await refreshEnvironment();
    } catch (error) {
      if (isSessionExpiredError(error)) {
        toast.error("Session admin expirée. Reconnectez-vous.");
        const returnPath = mode === "users" ? "/admin/utilisateurs" : "/admin/restaurants";
        window.location.assign(`/auth?redirect=${encodeURIComponent(returnPath)}`);
      } else {
        toast.error(error instanceof Error ? error.message : "Opération démo impossible.");
      }
    } finally {
      mutationLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault();
    const normalizedName = fullName.trim();
    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedName || !normalizedEmail || !password) {
      toast.error("Nom, e-mail et mot de passe sont obligatoires.");
      return;
    }

    const credentials = { fullName: normalizedName, email: normalizedEmail, password };
    await runMutation(
      {
        action: "create_user",
        full_name: normalizedName,
        email: normalizedEmail,
        password,
      },
      async () => {
        setOpen(false);
        setOneTimeCredentials(credentials);
        setFullName("");
        setEmail("");
        setPassword(generateStrongPassword());
        setShowPassword(false);
        toast.success("Utilisateur restaurateur créé uniquement dans le projet démo.");
      },
    );
  }

  async function handleCreateRestaurant(event: FormEvent) {
    event.preventDefault();
    if (!restaurantName.trim() || !restaurantAddress.trim() || !restaurantCity.trim()) {
      toast.error("Nom, adresse et ville sont obligatoires.");
      return;
    }

    await runMutation(
      {
        action: "create_restaurant",
        name: restaurantName.trim(),
        address: restaurantAddress.trim(),
        city: restaurantCity.trim(),
        cuisine_type: restaurantCuisine.trim() || null,
        phone: restaurantPhone.trim() || null,
        owner_user_id: restaurantOwnerId || null,
      },
      async () => {
        setRestaurantName("");
        setRestaurantAddress("");
        setRestaurantCuisine("");
        setRestaurantPhone("");
        setRestaurantOwnerId("");
        toast.success("Restaurant créé uniquement dans le projet démo.");
      },
    );
  }

  async function handleLink() {
    if (!selectedLinkUser || !selectedLinkRestaurant) {
      toast.error("Sélectionnez un utilisateur démo et un restaurant démo.");
      return;
    }
    if (alreadyLinked) {
      toast.info("Cette liaison démo est déjà active.");
      return;
    }
    const reason = linkReason.trim();
    if (reason.length < 3 || reason.length > 500) {
      toast.error("Le motif doit contenir entre 3 et 500 caractères.");
      return;
    }

    await runMutation(
      {
        action: "link",
        user_id: selectedLinkUser.user_id,
        restaurant_id: selectedLinkRestaurant.id,
        expected_owner_id: selectedLinkRestaurant.expected_owner_id,
        reason,
      },
      async () => {
        setLinkReason("Liaison validée depuis le dashboard admin");
        toast.success("Utilisateur démo lié au restaurant démo.");
      },
    );
  }

  return (
    <>
      <Button
        type="button"
        onClick={() => setOpen(true)}
        className="gap-2"
        variant={mode === "users" ? "default" : "outline"}
      >
        {mode === "users" ? <UserRoundPlus className="h-4 w-4" /> : <Store className="h-4 w-4" />}
        {mode === "users" ? "Créer un utilisateur démo" : "Créer un restaurant démo"}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[94dvh] w-[min(96vw,1080px)] max-w-none flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="border-b px-5 py-5 pr-14 text-left sm:px-6">
            <div className="flex flex-wrap items-center gap-2">
              <DialogTitle>Environnement TOK Démo</DialogTitle>
              <Badge className="bg-violet-100 text-violet-800 hover:bg-violet-100">Projet séparé</Badge>
            </div>
            <DialogDescription>
              Ces comptes et restaurants sont créés dans Supabase « TOK Commercial Demo ». Aucune ligne réelle n’est utilisée ou modifiée.
            </DialogDescription>
          </DialogHeader>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            <div className="flex items-start gap-3 rounded-xl border border-violet-200 bg-violet-50 p-4 text-sm text-violet-950 dark:border-violet-900/60 dark:bg-violet-950/30 dark:text-violet-100">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" />
              <div>
                <p className="font-semibold">Cloisonnement strict production / démo</p>
                <p className="mt-1 text-xs opacity-80">
                  La clé privilégiée du projet démo reste côté serveur. Les restaurants partagés des commerciaux ne peuvent pas être réaffectés depuis cet écran.
                </p>
              </div>
            </div>

            {environmentQuery.isLoading ? (
              <div className="flex min-h-40 items-center justify-center rounded-xl border border-dashed">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : environmentQuery.error ? (
              <div className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">
                <p>Impossible de charger l’environnement démo.</p>
                <Button type="button" variant="outline" size="sm" onClick={() => void environmentQuery.refetch()}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  Réessayer
                </Button>
              </div>
            ) : (
              <>
                {mode === "users" ? (
                  <section className="space-y-4 rounded-xl border bg-card p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        <UserRoundPlus className="h-4 w-4 text-violet-600" />
                        Nouvel utilisateur restaurateur démo
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        L’adresse et le mot de passe fonctionneront uniquement sur la connexion démo.
                      </p>
                    </div>
                    <form onSubmit={handleCreateUser} className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="demo-user-name">Nom complet</Label>
                        <Input id="demo-user-name" value={fullName} onChange={(event) => setFullName(event.target.value)} maxLength={120} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-user-email">E-mail de connexion démo</Label>
                        <Input id="demo-user-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={254} required />
                      </div>
                      <div className="space-y-2 md:col-span-2">
                        <Label htmlFor="demo-user-password">Mot de passe provisoire fort</Label>
                        <div className="flex gap-2">
                          <div className="relative flex-1">
                            <Input
                              id="demo-user-password"
                              type={showPassword ? "text" : "password"}
                              value={password}
                              onChange={(event) => setPassword(event.target.value)}
                              minLength={12}
                              maxLength={128}
                              className="pr-11 font-mono"
                              required
                            />
                            <button
                              type="button"
                              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                              onClick={() => setShowPassword((current) => !current)}
                              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center text-muted-foreground"
                            >
                              {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          <Button type="button" variant="outline" onClick={() => setPassword(generateStrongPassword())}>
                            Régénérer
                          </Button>
                        </div>
                      </div>
                      <div className="md:col-span-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                          Créer dans TOK Démo
                        </Button>
                      </div>
                    </form>
                  </section>
                ) : (
                  <section className="space-y-4 rounded-xl border bg-card p-4">
                    <div>
                      <h3 className="flex items-center gap-2 font-semibold">
                        <Store className="h-4 w-4 text-violet-600" />
                        Nouveau restaurant démo
                      </h3>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Sans propriétaire sélectionné, le restaurant reste en attente d’affectation dans la base démo.
                      </p>
                    </div>
                    <form onSubmit={handleCreateRestaurant} className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-name">Nom</Label>
                        <Input id="demo-restaurant-name" value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} maxLength={120} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-cuisine">Type de cuisine</Label>
                        <Input id="demo-restaurant-cuisine" value={restaurantCuisine} onChange={(event) => setRestaurantCuisine(event.target.value)} maxLength={100} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-address">Adresse</Label>
                        <Input id="demo-restaurant-address" value={restaurantAddress} onChange={(event) => setRestaurantAddress(event.target.value)} maxLength={240} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-city">Ville</Label>
                        <Input id="demo-restaurant-city" value={restaurantCity} onChange={(event) => setRestaurantCity(event.target.value)} maxLength={100} required />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-phone">Téléphone</Label>
                        <Input id="demo-restaurant-phone" value={restaurantPhone} onChange={(event) => setRestaurantPhone(event.target.value)} maxLength={40} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="demo-restaurant-owner">Restaurateur démo (facultatif)</Label>
                        <select
                          id="demo-restaurant-owner"
                          value={restaurantOwnerId}
                          onChange={(event) => setRestaurantOwnerId(event.target.value)}
                          className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                        >
                          <option value="">En attente d’affectation</option>
                          {users.map((user) => (
                            <option key={user.user_id} value={user.user_id}>{user.full_name} · {user.email}</option>
                          ))}
                        </select>
                      </div>
                      <div className="md:col-span-2">
                        <Button type="submit" disabled={submitting}>
                          {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                          Créer dans TOK Démo
                        </Button>
                      </div>
                    </form>
                  </section>
                )}

                <section className="space-y-4 rounded-xl border bg-card p-4">
                  <div>
                    <h3 className="flex items-center gap-2 font-semibold">
                      <Link2 className="h-4 w-4 text-violet-600" />
                      Lier un restaurateur démo à un restaurant démo
                    </h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      La liaison est contrôlée côté serveur et protège les restaurants démo partagés existants.
                    </p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <Label htmlFor="demo-link-user">Utilisateur démo</Label>
                      <select
                        id="demo-link-user"
                        value={linkUserId}
                        onChange={(event) => setLinkUserId(event.target.value)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Choisir…</option>
                        {users.map((user) => (
                          <option key={user.user_id} value={user.user_id}>{user.full_name} · {user.email}</option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="demo-link-restaurant">Restaurant démo</Label>
                      <select
                        id="demo-link-restaurant"
                        value={linkRestaurantId}
                        onChange={(event) => setLinkRestaurantId(event.target.value)}
                        className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                      >
                        <option value="">Choisir…</option>
                        {restaurants.map((restaurant) => (
                          <option key={restaurant.id} value={restaurant.id}>
                            {restaurant.name} · {restaurant.owner_name || "non attribué"}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="space-y-2 md:col-span-2">
                      <Label htmlFor="demo-link-reason">Motif</Label>
                      <Input id="demo-link-reason" value={linkReason} onChange={(event) => setLinkReason(event.target.value)} maxLength={500} />
                    </div>
                  </div>
                  <Button type="button" onClick={() => void handleLink()} disabled={submitting || alreadyLinked || !linkUserId || !linkRestaurantId}>
                    {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
                    {alreadyLinked ? "Liaison déjà active" : "Confirmer la liaison démo"}
                  </Button>
                </section>

                <div className="grid gap-4 xl:grid-cols-2">
                  <section className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Utilisateurs démo</h3>
                      <Badge variant="secondary">{users.length}</Badge>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {users.length ? users.map((user) => (
                        <div key={user.user_id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{user.full_name}</p>
                              <p className="truncate text-xs text-muted-foreground">{user.email}</p>
                            </div>
                            <Badge variant="outline">Démo</Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {user.restaurant_ids.length} restaurant(s) · dernière connexion {formatDate(user.last_sign_in_at)}
                          </p>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Aucun utilisateur démo administré.</p>}
                    </div>
                  </section>

                  <section className="rounded-xl border bg-card p-4">
                    <div className="mb-3 flex items-center justify-between gap-2">
                      <h3 className="font-semibold">Restaurants démo</h3>
                      <Badge variant="secondary">{restaurants.length}</Badge>
                    </div>
                    <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
                      {restaurants.length ? restaurants.map((restaurant) => (
                        <div key={restaurant.id} className="rounded-lg border p-3 text-sm">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate font-medium">{restaurant.name}</p>
                              <p className="truncate text-xs text-muted-foreground">{restaurant.address}, {restaurant.city}</p>
                            </div>
                            <Badge variant={restaurant.owner_user_id ? "default" : "outline"}>
                              {restaurant.owner_user_id ? "Lié" : "À affecter"}
                            </Badge>
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground">
                            {restaurant.owner_name || "Aucun restaurateur démo"}
                          </p>
                        </div>
                      )) : <p className="text-sm text-muted-foreground">Aucun restaurant démo administré.</p>}
                    </div>
                  </section>
                </div>
              </>
            )}
          </div>

          <DialogFooter className="border-t px-5 py-4 sm:px-6">
            <Button type="button" variant="outline" onClick={() => void environmentQuery.refetch()} disabled={environmentQuery.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${environmentQuery.isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Fermer</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(oneTimeCredentials)} onOpenChange={(nextOpen) => !nextOpen && setOneTimeCredentials(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Identifiants démo créés</DialogTitle>
            <DialogDescription>
              Copiez-les maintenant. Le mot de passe n’est jamais enregistré dans le dashboard et ne pourra pas être relu.
            </DialogDescription>
          </DialogHeader>
          {oneTimeCredentials ? (
            <div className="space-y-3 rounded-xl border bg-muted/30 p-4 text-sm">
              <div><span className="text-muted-foreground">Nom</span><p className="font-medium">{oneTimeCredentials.fullName}</p></div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0"><span className="text-muted-foreground">E-mail</span><p className="break-all font-mono">{oneTimeCredentials.email}</p></div>
                <Button type="button" size="icon" variant="outline" onClick={() => void copyText(oneTimeCredentials.email, "E-mail")}><Copy className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0"><span className="text-muted-foreground">Mot de passe</span><p className="break-all font-mono">{oneTimeCredentials.password}</p></div>
                <Button type="button" size="icon" variant="outline" onClick={() => void copyText(oneTimeCredentials.password, "Mot de passe")}><Copy className="h-4 w-4" /></Button>
              </div>
              <div className="flex items-end justify-between gap-3">
                <div className="min-w-0"><span className="text-muted-foreground">Connexion</span><p className="break-all font-mono">{demoLoginUrl}</p></div>
                <Button type="button" size="icon" variant="outline" onClick={() => void copyText(demoLoginUrl, "Lien de connexion")}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" onClick={() => setOneTimeCredentials(null)}>
              <FlaskConical className="mr-2 h-4 w-4" />
              J’ai sauvegardé les identifiants
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
