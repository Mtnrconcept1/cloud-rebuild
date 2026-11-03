import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Check, CheckCheck, ChefHat, Clock3, Expand, Minus, Plus, RefreshCw,
  Search, Send, UtensilsCrossed, X,
} from "lucide-react";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardPageHero from "@/components/dashboard/DashboardPageHero";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { getSupabase } from "@/integrations/supabase/client";
import {
  advanceKitchenTicket, buildKitchenLines, changeKitchenQuantity,
  kitchenWaitingMinutes, listKitchenTickets, sortKitchenTickets,
  submitKitchenTicket, type KitchenBasket, type KitchenTicket, type KitchenTicketStatus,
} from "@/lib/kitchenTickets";
import { useDashboardRestaurant } from "./useDashboardRestaurant";
import { toast } from "sonner";

type Branch = { id: string; name: string };
type DiningTable = { id: string; table_number: string; capacity: number; branch_id: string };
type MenuDish = { id: string; name: string; category: string | null; price: number };

const EMPTY_MENU: MenuDish[] = [];

const formatChf = (value: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(value);

function KitchenTicketCard({
  ticket, position, now, processing, onAdvance,
}: {
  ticket: KitchenTicket;
  position: number;
  now: number;
  processing: boolean;
  onAdvance: (ticket: KitchenTicket, next: KitchenTicketStatus) => void;
}) {
  const elapsed = kitchenWaitingMinutes(ticket.created_at, now);
  const action = ticket.status === "queued"
    ? { next: "preparing" as const, label: "Commencer", Icon: UtensilsCrossed }
    : ticket.status === "preparing"
      ? { next: "ready" as const, label: "Prête à servir", Icon: Check }
      : ticket.status === "ready"
        ? { next: "served" as const, label: "Servie", Icon: CheckCheck }
        : null;

  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm" aria-label={"Ticket table " + ticket.table_number}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div>
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Ordre #{position + 1}</span>
          <h4 className="font-serif text-xl font-bold">Table {ticket.table_number}</h4>
        </div>
        <Badge variant={elapsed >= 20 && ticket.status !== "ready" ? "destructive" : "secondary"} className="gap-1 whitespace-nowrap">
          <Clock3 className="h-3 w-3" /> {elapsed} min
        </Badge>
      </div>
      <ul className="space-y-2 border-t border-border/60 py-3">
        {ticket.items.map((item) => (
          <li key={item.id} className="flex gap-3 text-sm">
            <strong className="min-w-8 rounded-lg bg-primary/10 px-2 py-1 text-center text-primary">
              {item.quantity}×
            </strong>
            <span className="self-center font-medium">{item.name}</span>
          </li>
        ))}
      </ul>
      {ticket.note && (
        <p className="mb-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-sm font-medium text-orange-950">
          Consignes : {ticket.note}
        </p>
      )}
      <p className="mb-3 text-xs text-muted-foreground">
        Reçue à {new Date(ticket.created_at).toLocaleTimeString("fr-CH", { hour: "2-digit", minute: "2-digit" })}
      </p>
      {action && (
        <Button
          className="min-h-11 w-full gap-2"
          disabled={processing}
          onClick={() => onAdvance(ticket, action.next)}
          aria-label={action.label + " - table " + ticket.table_number}
        >
          <action.Icon className="h-4 w-4" /> {action.label}
        </Button>
      )}
      {ticket.status === "queued" && (
        <Button
          variant="ghost"
          className="mt-1 min-h-10 w-full text-muted-foreground"
          disabled={processing}
          onClick={() => {
            if (window.confirm("Annuler le ticket de la table " + ticket.table_number + " ?")) {
              onAdvance(ticket, "cancelled");
            }
          }}
        >
          <X className="mr-1 h-4 w-4" /> Annuler ce ticket
        </Button>
      )}
    </article>
  );
}

export default function DashboardCuisine() {
  const { selectedId, restaurants, loading, isDemoMode } = useDashboardRestaurant();
  const queryClient = useQueryClient();
  const boardRef = useRef<HTMLDivElement>(null);
  const [mode, setMode] = useState<"service" | "kitchen">("service");
  const [branchSelection, setBranchSelection] = useState<string | null>(null);
  const [tableSelection, setTableSelection] = useState<string | null>(null);
  const [basket, setBasket] = useState<KitchenBasket>({});
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [note, setNote] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [now, setNow] = useState(Date.now);

  const restaurantName = restaurants.find((restaurant) => restaurant.id === selectedId)?.name || "Restaurant";

  const branchesQuery = useQuery({
    queryKey: ["kitchen-branches", selectedId],
    queryFn: async (): Promise<Branch[]> => {
      const { data, error } = await getSupabase().from("restaurant_branches")
        .select("id, name").eq("restaurant_id", selectedId!).eq("is_active", true).limit(30);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(selectedId) && !isDemoMode,
    staleTime: 60_000,
  });
  const branches = branchesQuery.data || [];
  const branchId = branches.some((branch) => branch.id === branchSelection)
    ? branchSelection : branches[0]?.id || null;

  const tablesQuery = useQuery({
    queryKey: ["kitchen-tables", branchId],
    queryFn: async (): Promise<DiningTable[]> => {
      const { data, error } = await getSupabase().from("reservation_tables")
        .select("id, table_number, capacity, branch_id")
        .eq("branch_id", branchId!).eq("is_active", true).limit(200);
      if (error) throw error;
      return (data || []).sort((a, b) =>
        a.table_number.localeCompare(b.table_number, "fr", { numeric: true }));
    },
    enabled: Boolean(branchId) && !isDemoMode,
    staleTime: 30_000,
  });
  const tables = tablesQuery.data || [];
  const tableId = tables.some((table) => table.id === tableSelection) ? tableSelection : null;

  const menuQuery = useQuery({
    queryKey: ["kitchen-menu", selectedId],
    queryFn: async (): Promise<MenuDish[]> => {
      const { data, error } = await getSupabase().from("menu_items")
        .select("id, name, category, price").eq("restaurant_id", selectedId!)
        .eq("is_available", true).eq("available_on_card", true)
        .order("name").limit(500);
      if (error) throw error;
      return data || [];
    },
    enabled: Boolean(selectedId) && !isDemoMode,
    staleTime: 30_000,
  });
  const menu = menuQuery.data ?? EMPTY_MENU;
  const categories = useMemo(
    () => Array.from(new Set(menu.map((dish) => dish.category || "Autres"))).sort(),
    [menu],
  );
  const filteredMenu = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase("fr");
    return menu.filter((dish) =>
      (category === "all" || (dish.category || "Autres") === category)
      && (!needle || dish.name.toLocaleLowerCase("fr").includes(needle)),
    );
  }, [menu, search, category]);

  const ticketsQuery = useQuery({
    queryKey: ["kitchen-tickets", selectedId],
    queryFn: () => listKitchenTickets(selectedId!),
    enabled: Boolean(selectedId) && !isDemoMode,
    refetchInterval: 8_000,
    refetchOnWindowFocus: true,
  });
  const tickets = sortKitchenTickets(ticketsQuery.data || []);
  const quantity = Object.values(basket).reduce((sum, count) => sum + count, 0);
  const subtotal = menu.reduce((sum, dish) => sum + Number(dish.price) * (basket[dish.id] || 0), 0);

  useEffect(() => {
    const clock = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(clock);
  }, []);

  useEffect(() => {
    if (!selectedId || isDemoMode) return;
    const supabase = getSupabase();
    const channel = supabase.channel("kitchen-tickets:" + selectedId)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "kitchen_tickets",
        filter: "restaurant_id=eq." + selectedId,
      }, () => { void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] }); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [selectedId, isDemoMode, queryClient]);

  useEffect(() => {
    setBasket({});
    setTableSelection(null);
    setNote("");
    setRequestKey(crypto.randomUUID());
  }, [selectedId, branchId]);

  const sendMutation = useMutation({
    mutationFn: () => submitKitchenTicket({
      restaurantId: selectedId!, tableId: tableId!, basket, note, requestKey,
    }),
    onSuccess: () => {
      toast.success("Commande envoyée en cuisine.");
      setBasket({});
      setNote("");
      setRequestKey(crypto.randomUUID());
      void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] });
    },
    onError: (error: Error) =>
      toast.error("Envoi non confirmé : " + error.message + ". Réessayez avec le même ticket."),
  });
  const advanceMutation = useMutation({
    mutationFn: ({ ticket, next }: { ticket: KitchenTicket; next: KitchenTicketStatus }) =>
      advanceKitchenTicket(ticket, next),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] }); },
    onError: (error: Error) => {
      toast.error(error.message);
      void queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", selectedId] });
    },
  });
  function adjustQuantity(id: string, delta: 1 | -1) {
    try {
      setBasket(changeKitchenQuantity(basket, id, delta));
      setRequestKey(crypto.randomUUID());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Quantité incorrecte.");
    }
  }
  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await boardRef.current?.requestFullscreen();
    } catch {
      toast.error("Le plein écran n'est pas disponible sur cet appareil.");
    }
  }

  const columns = [
    { status: "queued" as const, title: "À préparer", description: "En attente de lancement", tone: "border-l-amber-500" },
    { status: "preparing" as const, title: "En préparation", description: "En cours en cuisine", tone: "border-l-primary" },
    { status: "ready" as const, title: "Prêtes à servir", description: "À récupérer par le serveur", tone: "border-l-emerald-500" },
  ];

  return (
    <DashboardLayout mainClassName="tok-restaurant-page">
      <div className="space-y-6">
        <DashboardPageHero
          badge="Pilotage du service" icon={ChefHat}
          title="Écran cuisine & prise de commande"
          description={"Du serveur à la cuisine en temps réel · " + restaurantName}
          tone="orange" compact
        />
        {isDemoMode ? (
          <Card><CardContent className="py-8 text-center text-muted-foreground">
            Le mode démonstration ne permet pas d'envoyer de véritables commandes.
          </CardContent></Card>
        ) : !selectedId && !loading ? (
          <Card><CardContent className="py-8 text-center">
            Sélectionnez un établissement pour gérer son service.
          </CardContent></Card>
        ) : (
          <Tabs value={mode} onValueChange={(value) => setMode(value as "service" | "kitchen")} className="space-y-5">
            <TabsList className="grid h-auto w-full max-w-lg grid-cols-2 rounded-2xl p-1">
              <TabsTrigger value="service" className="min-h-12 gap-2 text-sm">
                <UtensilsCrossed className="h-4 w-4" /> Prise de commande
              </TabsTrigger>
              <TabsTrigger value="kitchen" className="min-h-12 gap-2 text-sm">
                <ChefHat className="h-4 w-4" /> Écran cuisine
                {tickets.length > 0 && <Badge className="ml-1">{tickets.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="service" className="space-y-5">
              <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,370px)]">
                <div className="space-y-5">
                  <Card className="rounded-2xl">
                    <CardHeader><CardTitle className="font-serif text-xl">1. Choisir la table</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      {branches.length > 1 && (
                        <div className="space-y-2">
                          <Label htmlFor="kitchen-branch">Établissement</Label>
                          <Select value={branchId || ""} onValueChange={setBranchSelection}>
                            <SelectTrigger id="kitchen-branch"><SelectValue placeholder="Choisir un établissement" /></SelectTrigger>
                            <SelectContent>{branches.map((branch) =>
                              <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                            )}</SelectContent>
                          </Select>
                        </div>
                      )}
                      {branchesQuery.isPending || tablesQuery.isPending ? (
                        <p className="text-sm text-muted-foreground">Chargement des tables…</p>
                      ) : branchesQuery.isError || tablesQuery.isError ? (
                        <p role="alert" className="text-sm text-destructive">Impossible de charger les tables. Réessayez.</p>
                      ) : tables.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aucune table active. <Link className="font-semibold text-primary underline" to="/dashboard/plan-salle">Configurer le plan de salle</Link>.
                        </p>
                      ) : (
                        <div className="grid max-h-60 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4 md:grid-cols-6">
                          {tables.map((table) => (
                            <button type="button" key={table.id}
                              aria-pressed={tableId === table.id}
                              onClick={() => { setTableSelection(table.id); setRequestKey(crypto.randomUUID()); }}
                              className={"min-h-16 rounded-xl border p-2 text-center transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary " +
                                (tableId === table.id ? "border-primary bg-primary text-primary-foreground"
                                  : "border-border bg-background hover:border-primary/70")}
                            >
                              <span className="block text-base font-bold">Table {table.table_number}</span>
                              <span className="block text-xs opacity-75">{table.capacity} places</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="rounded-2xl">
                    <CardHeader><CardTitle className="font-serif text-xl">2. Ajouter les plats</CardTitle></CardHeader>
                    <CardContent className="space-y-4">
                      <div className="flex flex-col gap-2 sm:flex-row">
                        <div className="relative min-w-0 flex-1">
                          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                          <Input value={search} onChange={(event) => setSearch(event.target.value)}
                            placeholder="Rechercher un plat…" aria-label="Rechercher un plat" className="pl-9" />
                        </div>
                        <Select value={category} onValueChange={setCategory}>
                          <SelectTrigger aria-label="Catégorie des plats" className="w-full sm:w-48">
                            <SelectValue placeholder="Toutes les catégories" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="all">Toutes les catégories</SelectItem>
                            {categories.map((name) => <SelectItem key={name} value={name}>{name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </div>
                      {menuQuery.isPending ? (
                        <p className="text-sm text-muted-foreground">Chargement de la carte…</p>
                      ) : menuQuery.isError ? (
                        <p role="alert" className="text-sm text-destructive">Impossible de charger la carte du restaurant.</p>
                      ) : menu.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Aucun plat disponible. <Link className="font-semibold text-primary underline" to="/dashboard/menu">Configurer le menu</Link>.
                        </p>
                      ) : filteredMenu.length === 0 ? (
                        <p className="text-sm text-muted-foreground">Aucun plat ne correspond à votre recherche.</p>
                      ) : (
                        <div className="grid max-h-[600px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                          {filteredMenu.map((dish) => (
                            <article key={dish.id} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3">
                              <div className="min-w-0">
                                <h3 className="line-clamp-2 text-sm font-semibold">{dish.name}</h3>
                                <p className="text-xs text-muted-foreground">{formatChf(Number(dish.price))}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                <Button type="button" variant="outline" size="icon"
                                  aria-label={"Retirer un " + dish.name}
                                  disabled={!basket[dish.id]} onClick={() => adjustQuantity(dish.id, -1)}
                                  className="h-10 w-10 rounded-xl"><Minus className="h-4 w-4" /></Button>
                                <output className="w-7 text-center font-bold" aria-label={"Quantité " + dish.name}>
                                  {basket[dish.id] || 0}
                                </output>
                                <Button type="button" size="icon" aria-label={"Ajouter un " + dish.name}
                                  onClick={() => adjustQuantity(dish.id, 1)}
                                  className="h-10 w-10 rounded-xl"><Plus className="h-4 w-4" /></Button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card className="rounded-2xl border-primary/30 xl:sticky xl:top-24">
                  <CardHeader><CardTitle className="font-serif text-xl">3. Envoyer en cuisine</CardTitle></CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-center justify-between rounded-xl bg-primary/10 p-3">
                      <span className="font-semibold">
                        {tableId ? "Table " + tables.find((table) => table.id === tableId)?.table_number
                          : "Table non sélectionnée"}
                      </span>
                      <Badge variant="secondary">{quantity} portion{quantity > 1 ? "s" : ""}</Badge>
                    </div>
                    {buildKitchenLines(basket).length === 0 ? (
                      <p className="text-sm text-muted-foreground">Utilisez les boutons + et − pour composer le ticket.</p>
                    ) : (
                      <ul className="space-y-2">
                        {buildKitchenLines(basket).map((line) => {
                          const dish = menu.find((item) => item.id === line.menu_item_id);
                          return (
                            <li key={line.menu_item_id} className="flex justify-between gap-3 text-sm">
                              <span><strong className="text-primary">{line.quantity}×</strong> {dish?.name || "Plat indisponible"}</span>
                              <span className="whitespace-nowrap">{formatChf(Number(dish?.price || 0) * line.quantity)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    <div className="flex justify-between border-t pt-3 font-semibold">
                      <span>Total indicatif</span><span>{formatChf(subtotal)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Ce ticket organise la préparation. Aucun paiement ni commission n'est déclenché.
                    </p>
                    <div className="space-y-2">
                      <Label htmlFor="kitchen-notes">Consignes pour la cuisine</Label>
                      <Textarea id="kitchen-notes" maxLength={500} rows={3}
                        placeholder="Allergies signalées, cuisson, ordre de service…"
                        value={note}
                        onChange={(event) => { setNote(event.target.value); setRequestKey(crypto.randomUUID()); }}
                      />
                      <p className="text-right text-xs text-muted-foreground">{note.length}/500</p>
                    </div>
                    <Button className="min-h-12 w-full gap-2 text-base"
                      disabled={!selectedId || !tableId || quantity === 0 || sendMutation.isPending}
                      onClick={() => sendMutation.mutate()}>
                      <Send className="h-4 w-4" />
                      {sendMutation.isPending ? "Transmission…" : "Valider et envoyer"}
                    </Button>
                    {sendMutation.isError && (
                      <p role="alert" className="text-xs text-destructive">
                        Envoi non confirmé. Réessayez sans modifier le ticket pour éviter un doublon.
                      </p>
                    )}
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="kitchen">
              <div ref={boardRef} className="space-y-5 rounded-2xl bg-background p-1 sm:p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="font-serif text-2xl font-bold">Tickets en cuisine</h2>
                    <p className="text-sm text-muted-foreground">
                      Du plus ancien au plus récent dans chaque étape. Actualisation automatique.
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => void ticketsQuery.refetch()}>
                      <RefreshCw className="h-4 w-4" /> Actualiser
                    </Button>
                    <Button variant="outline" size="sm" className="gap-2"
                      onClick={() => void toggleFullscreen()}>
                      <Expand className="h-4 w-4" /> Plein écran
                    </Button>
                  </div>
                </div>
                {ticketsQuery.isError && (
                  <p role="alert" className="rounded-xl border border-destructive/40 p-4 text-sm text-destructive">
                    Impossible de synchroniser les tickets. Vérifiez la connexion puis actualisez.
                  </p>
                )}
                {ticketsQuery.isPending ? (
                  <p className="text-sm text-muted-foreground">Connexion à l'écran cuisine…</p>
                ) : (
                  <div className="grid items-start gap-4 lg:grid-cols-3">
                    {columns.map((column) => {
                      const group = tickets.filter((ticket) => ticket.status === column.status);
                      return (
                        <section key={column.status}
                          className={"min-h-44 rounded-2xl border border-l-4 bg-muted/30 p-3 " + column.tone}
                          aria-label={column.title}>
                          <div className="mb-4 flex items-center justify-between gap-2">
                            <div>
                              <h3 className="font-serif text-xl font-bold">{column.title}</h3>
                              <p className="text-xs text-muted-foreground">{column.description}</p>
                            </div>
                            <Badge variant="secondary">{group.length}</Badge>
                          </div>
                          <div className="space-y-3">
                            {group.length === 0 ? (
                              <p className="rounded-xl border border-dashed bg-background/70 p-6 text-center text-sm text-muted-foreground">
                                Aucun ticket
                              </p>
                            ) : group.map((ticket, index) => (
                              <KitchenTicketCard key={ticket.id} ticket={ticket} position={index} now={now}
                                processing={advanceMutation.isPending}
                                onAdvance={(item, next) => advanceMutation.mutate({ ticket: item, next })} />
                            ))}
                          </div>
                        </section>
                      );
                    })}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        )}
      </div>
    </DashboardLayout>
  );
}
