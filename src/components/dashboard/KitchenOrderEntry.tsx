import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Minus, Plus, Search, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import {
  buildKitchenLines, changeKitchenQuantity, getKitchenSetup, submitKitchenTicket,
  type KitchenBasket, type KitchenSetup,
} from "@/lib/kitchenTickets";
import { toast } from "sonner";

type Dish = KitchenSetup["menu"][number];
const EMPTY_MENU: Dish[] = [];
const EMPTY_TABLES: KitchenSetup["tables"] = [];
const EMPTY_BRANCHES: KitchenSetup["branches"] = [];

const formatChf = (amount: number) =>
  new Intl.NumberFormat("fr-CH", { style: "currency", currency: "CHF" }).format(amount);

type Props = {
  restaurantId: string;
  /** Staff don't have access to the restaurant-owner dashboard routes. */
  employeeMode?: boolean;
};

export default function KitchenOrderEntry({ restaurantId, employeeMode = false }: Props) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedBranch, setSelectedBranch] = useState<string | null>(null);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [basket, setBasket] = useState<KitchenBasket>({});
  const [note, setNote] = useState("");
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");

  const setupQuery = useQuery({
    queryKey: ["kitchen-setup", restaurantId, user?.id],
    enabled: Boolean(restaurantId) && Boolean(user?.id),
    queryFn: () => getKitchenSetup(restaurantId),
    staleTime: 0,
    refetchOnMount: "always",
    refetchInterval: 30_000,
    retry: 0,
  });

  const branches = setupQuery.data?.branches ?? EMPTY_BRANCHES;
  const tables = setupQuery.data?.tables ?? EMPTY_TABLES;
  const menu = setupQuery.data?.menu ?? EMPTY_MENU;

  const branchId = branches.some((branch) => branch.id === selectedBranch)
    ? selectedBranch : branches[0]?.id ?? null;
  const branchTables = useMemo(
    () => tables.filter((table) => table.branch_id === branchId)
      .sort((a, b) => a.table_number.localeCompare(b.table_number, "fr", { numeric: true })),
    [branchId, tables],
  );
  const tableId = branchTables.some((table) => table.id === selectedTable) ? selectedTable : null;
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
  }, [menu, category, search]);
  const portions = Object.values(basket).reduce((sum, count) => sum + count, 0);
  const total = menu.reduce((sum, dish) => sum + dish.price * (basket[dish.id] || 0), 0);

  // A table or establishment change must never silently reuse another table's basket.
  useEffect(() => {
    setSelectedTable(null);
    setBasket({});
    setNote("");
    setRequestKey(crypto.randomUUID());
  }, [restaurantId, branchId]);

  const send = useMutation({
    mutationFn: () => {
      if (!tableId || !restaurantId) throw new Error("Sélectionnez une table.");
      return submitKitchenTicket({
        restaurantId, tableId, basket, note, requestKey,
      });
    },
    onSuccess: async () => {
      setBasket({});
      setNote("");
      setRequestKey(crypto.randomUUID());
      toast.success("Commande envoyée en cuisine.");
      await queryClient.invalidateQueries({ queryKey: ["kitchen-tickets", restaurantId] });
    },
    onError: (error: Error) => {
      toast.error("Envoi non confirmé : " + error.message + ". Réessayez sans modifier le ticket.");
    },
  });

  const adjustQuantity = (dishId: string, delta: 1 | -1) => {
    try {
      setBasket(changeKitchenQuantity(basket, dishId, delta));
      setRequestKey(crypto.randomUUID());
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Quantité incorrecte.");
    }
  };

  if (setupQuery.isPending) {
    return (
      <Card><CardContent className="py-12 text-center text-sm text-muted-foreground" role="status">
        Chargement de votre salle et de la carte…
      </CardContent></Card>
    );
  }
  if (setupQuery.isError) {
    return (
      <Card><CardContent className="space-y-4 py-8">
        <p role="alert" className="text-sm text-destructive">
          Impossible d'ouvrir la salle. Votre accès TOK Équipe ou le restaurant doit être actif.
        </p>
        <Button variant="outline" onClick={() => void setupQuery.refetch()}>
          Réessayer
        </Button>
      </CardContent></Card>
    );
  }

  return (
    <div className="grid items-start gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(300px,370px)]">
      <div className="space-y-5">
        <Card className="rounded-2xl">
          <CardHeader><CardTitle className="font-serif text-xl">1. Choisir la table</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {branches.length > 1 && (
              <div className="space-y-2">
                <Label htmlFor="kitchen-branch">Établissement</Label>
                <Select value={branchId || ""} onValueChange={setSelectedBranch}>
                  <SelectTrigger id="kitchen-branch"><SelectValue placeholder="Choisir un établissement" /></SelectTrigger>
                  <SelectContent>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>{branch.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {branchTables.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucune table active.
                {employeeMode
                  ? " Demandez au restaurateur de configurer le plan de salle."
                  : <> <Link className="font-semibold text-primary underline" to="/dashboard/plan-salle">
                    Configurer le plan de salle
                  </Link>.</>}
              </p>
            ) : (
              <div className="grid max-h-64 grid-cols-3 gap-2 overflow-y-auto p-1 sm:grid-cols-4 md:grid-cols-6">
                {branchTables.map((table) => (
                  <button
                    type="button"
                    key={table.id}
                    aria-pressed={tableId === table.id}
                    onClick={() => { setSelectedTable(table.id); setRequestKey(crypto.randomUUID()); }}
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
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un plat…"
                  aria-label="Rechercher un plat"
                  className="pl-9"
                />
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
            {menu.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Aucun plat disponible.
                {employeeMode
                  ? " Demandez au restaurateur de compléter la carte."
                  : <> <Link className="font-semibold text-primary underline" to="/dashboard/menu">
                    Configurer le menu
                  </Link>.</>}
              </p>
            ) : filteredMenu.length === 0 ? (
              <p className="text-sm text-muted-foreground">Aucun plat ne correspond à cette recherche.</p>
            ) : (
              <div className="grid max-h-[620px] gap-2 overflow-y-auto pr-1 md:grid-cols-2">
                {filteredMenu.map((dish) => (
                  <article
                    key={dish.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background p-3"
                  >
                    <div className="min-w-0">
                      <h3 className="line-clamp-2 text-sm font-semibold">{dish.name}</h3>
                      <p className="text-xs text-muted-foreground">{formatChf(dish.price)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button" variant="outline" size="icon"
                        aria-label={"Retirer un " + dish.name}
                        disabled={!basket[dish.id] || send.isPending}
                        onClick={() => adjustQuantity(dish.id, -1)}
                        className="h-10 w-10 rounded-xl"
                      ><Minus className="h-4 w-4" /></Button>
                      <output className="w-7 text-center font-bold" aria-label={"Quantité " + dish.name}>
                        {basket[dish.id] || 0}
                      </output>
                      <Button
                        type="button" size="icon"
                        aria-label={"Ajouter un " + dish.name}
                        disabled={send.isPending}
                        onClick={() => adjustQuantity(dish.id, 1)}
                        className="h-10 w-10 rounded-xl"
                      ><Plus className="h-4 w-4" /></Button>
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
              {tableId ? "Table " + branchTables.find((table) => table.id === tableId)?.table_number
                : "Table non sélectionnée"}
            </span>
            <Badge variant="secondary">{portions} portion{portions > 1 ? "s" : ""}</Badge>
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
                    <span className="whitespace-nowrap">
                      {formatChf(Number(dish?.price || 0) * line.quantity)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="flex justify-between border-t pt-3 font-semibold">
            <span>Total indicatif</span><span>{formatChf(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Ticket de préparation uniquement : aucun paiement ni commission n'est déclenché.
          </p>
          <div className="space-y-2">
            <Label htmlFor="kitchen-notes">Consignes pour la cuisine</Label>
            <Textarea
              id="kitchen-notes" maxLength={500} rows={3}
              placeholder="Allergies signalées, cuisson, ordre de service…"
              disabled={send.isPending}
              value={note}
              onChange={(event) => { setNote(event.target.value); setRequestKey(crypto.randomUUID()); }}
            />
            <p className="text-right text-xs text-muted-foreground">{note.length}/500</p>
          </div>
          <Button
            className="min-h-12 w-full gap-2 text-base"
            disabled={!tableId || portions === 0 || send.isPending}
            onClick={() => send.mutate()}
          >
            <Send className="h-4 w-4" />
            {send.isPending ? "Transmission…" : "Valider et envoyer"}
          </Button>
          {send.isError && (
            <p role="alert" className="text-xs text-destructive">
              Envoi non confirmé. Réessayez sans modifier le ticket pour éviter un doublon.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
