import { useMemo, useState } from "react";
import { BookOpen, ImageIcon, Pencil, Trash2, Utensils } from "lucide-react";

import { Button } from "@/components/ui/button";
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
  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of items) {
      const category = item.category?.trim() || "Sans catégorie";
      counts.set(category, (counts.get(category) || 0) + 1);
    }
    return [...counts.entries()];
  }, [items]);
  const activeCategory = categories.some(([category]) => category === selectedCategory) ? selectedCategory : null;
  const visibleItems = activeCategory
    ? items.filter((item) => (item.category?.trim() || "Sans catégorie") === activeCategory)
    : items;

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
          <span aria-live="polite">{visibleItems.length} plat{visibleItems.length > 1 ? "s" : ""}</span>
        </div>
        {visibleItems.map((item) => (
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
              {item.description ? <p>{item.description}</p> : null}
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
        {items.length === 0 ? <p className="py-8 text-center text-muted-foreground">Aucun plat dans le menu</p> : null}
      </section>
    </div>
  );
}
