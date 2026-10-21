import { useMemo, useState } from "react";
import { BookOpen, ImageIcon, Pencil, Trash2, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import SortControls from "@/components/list/SortControls";
import OperationViewToggle, { type OperationViewMode } from "@/components/operations/OperationViewToggle";
import type { SortDirection } from "@/lib/listSorting";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export type RestaurantMenuCatalogItem = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  price: number | string;
  category: string | null;
  image_url: string | null;
  is_available: boolean | null;
};

type RestaurantMenuCatalogProps = {
  items: RestaurantMenuCatalogItem[];
  onEdit: (item: RestaurantMenuCatalogItem) => void;
  onDelete: (id: string) => void;
  onToggleAvailability: (id: string, current: boolean) => void;
};

export default function RestaurantMenuCatalog({
  items,
  onEdit,
  onDelete,
  onToggleAvailability,
}: RestaurantMenuCatalogProps) {
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [menuSearch, setMenuSearch] = useState("");
  const [menuAvailability, setMenuAvailability] = useState("all");
  const [menuSortKey, setMenuSortKey] = useState<"name" | "category" | "price" | "availability">("name");
  const [menuSortDirection, setMenuSortDirection] = useState<SortDirection>("asc");
  const [menuViewMode, setMenuViewMode] = useState<OperationViewMode>("details");
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const category = item.category?.trim() || "Sans catégorie";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return [...counts.entries()];
  }, [items]);
  const activeCategory = categories.some(([category]) => category === selectedCategory) ? selectedCategory : null;
  const visibleMenuItems = useMemo(() => {
    const query = menuSearch.trim().toLocaleLowerCase("fr-CH");
    const collator = new Intl.Collator("fr-CH", { sensitivity: "base", numeric: true });
    return items.filter((item) => {
      if (activeCategory && (item.category?.trim() || "Sans catégorie") !== activeCategory) return false;
      if (menuAvailability === "available" && item.is_available === false) return false;
      if (menuAvailability === "unavailable" && item.is_available !== false) return false;
      return !query || `${item.name} ${item.description || ""} ${item.category || ""}`.toLocaleLowerCase("fr-CH").includes(query);
    }).sort((left, right) => {
      const comparison = menuSortKey === "price" ? Number(left.price) - Number(right.price)
        : menuSortKey === "availability" ? Number(left.is_available !== false) - Number(right.is_available !== false)
        : menuSortKey === "category" ? collator.compare(left.category || "", right.category || "")
        : collator.compare(left.name, right.name);
      return (menuSortDirection === "asc" ? comparison : -comparison) || left.id.localeCompare(right.id);
    });
  }, [items, activeCategory, menuSearch, menuAvailability, menuSortKey, menuSortDirection]);

  return (
    <div className="tok-menu-catalog">
      <nav className="tok-menu-categories" aria-label="Catégories du menu">
        <h2>Catégories</h2>
        <div className="tok-menu-category-list">
          <button
            type="button"
            className={cn("tok-menu-category", !activeCategory && "is-active")}
            aria-label="Afficher tous les plats"
            aria-pressed={!activeCategory}
            onClick={() => setSelectedCategory(null)}
          >
            <BookOpen aria-hidden="true" />
            <span>Tous les plats</span>
            <span className="tok-menu-category-count">{items.length}</span>
          </button>
          {categories.map(([category, count]) => (
            <button
              key={category}
              type="button"
              className={cn("tok-menu-category", activeCategory === category && "is-active")}
              aria-label={`Afficher la catégorie ${category}`}
              aria-pressed={activeCategory === category}
              onClick={() => setSelectedCategory(category)}
            >
              <Utensils aria-hidden="true" />
              <span>{category}</span>
              <span className="tok-menu-category-count">{count}</span>
            </button>
          ))}
        </div>
      </nav>

      <section className="tok-menu-dishes" aria-label="Plats du menu">
        <div className="tok-menu-dishes-heading">
          <h2>{activeCategory ? `Plats de la catégorie « ${activeCategory} »` : "Votre carte"}</h2>
          <span aria-live="polite">{visibleMenuItems.length} plat{visibleMenuItems.length > 1 ? "s" : ""}</span>
        </div>
        <div className="tok-menu-list-controls space-y-3 pb-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input aria-label="Rechercher un plat" value={menuSearch} onChange={(event) => setMenuSearch(event.target.value)} placeholder="Rechercher un plat…" />
            <Select value={menuAvailability} onValueChange={setMenuAvailability}>
              <SelectTrigger aria-label="Filtrer par disponibilité"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les plats</SelectItem>
                <SelectItem value="available">Disponibles</SelectItem>
                <SelectItem value="unavailable">Épuisés</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <SortControls<"name" | "category" | "price" | "availability">
              className="w-full max-w-lg"
              columns={[{ key: "name", label: "Nom" }, { key: "category", label: "Catégorie" }, { key: "price", label: "Prix" }, { key: "availability", label: "Disponibilité" }]}
              sortKey={menuSortKey}
              direction={menuSortDirection}
              onSortKeyChange={setMenuSortKey}
              onDirectionChange={setMenuSortDirection}
            />
            <OperationViewToggle value={menuViewMode} onChange={setMenuViewMode} ariaLabel="Mode d’affichage des plats du menu" />
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => { setMenuSearch(""); setMenuAvailability("all"); setSelectedCategory(null); }}>Effacer les filtres</Button>
        </div>
        <div className="tok-menu-items" data-view={menuViewMode}>
        {visibleMenuItems.map((item) => (
          <article key={item.id} className="tok-menu-dish">
            <div className="tok-menu-dish-photo">
              {item.image_url ? (
                <img src={item.image_url} alt={item.name} loading="lazy" />
              ) : (
                <ImageIcon aria-hidden="true" />
              )}
            </div>
            <div className="tok-menu-dish-copy">
              <h3>{item.name}</h3>
              {item.description && menuViewMode === "details" ? <p>{item.description}</p> : null}
              {item.category ? <span className="tok-menu-dish-category">{item.category}</span> : null}
            </div>
            <div className="tok-menu-dish-price">
              <strong>{Number(item.price).toFixed(2)} CHF</strong>
              <div className="tok-menu-dish-availability">
                <Switch
                  aria-label={`Disponibilité de ${item.name}`}
                  checked={item.is_available ?? true}
                  onCheckedChange={() => onToggleAvailability(item.id, item.is_available ?? true)}
                />
                <span>{(item.is_available ?? true) ? "Disponible" : "Épuisé"}</span>
              </div>
            </div>
            <div className="tok-menu-dish-actions">
              <Button size="icon" variant="outline" aria-label={`Modifier ${item.name}`} onClick={() => onEdit(item)}>
                <Pencil aria-hidden="true" className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" aria-label={`Supprimer ${item.name}`} onClick={() => onDelete(item.id)}>
                <Trash2 aria-hidden="true" className="h-4 w-4" />
              </Button>
            </div>
          </article>
        ))}
        {!visibleMenuItems.length ? <p className="py-8 text-center text-muted-foreground">{items.length ? "Aucun plat ne correspond aux filtres." : "Aucun plat dans le menu"}</p> : null}
        </div>
      </section>
    </div>
  );
}
