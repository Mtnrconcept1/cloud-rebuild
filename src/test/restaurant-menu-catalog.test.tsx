import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import RestaurantMenuCatalog, { type RestaurantMenuCatalogItem } from "@/components/dashboard/RestaurantMenuCatalog";

const items: RestaurantMenuCatalogItem[] = [
  { id: "starter", restaurant_id: "restaurant", name: "Houmous", description: "Pois chiches et tahini", price: "14.50", category: "Entrées", image_url: null, is_available: true },
  { id: "dessert", restaurant_id: "restaurant", name: "Dessert du jour", description: null, price: 8, category: "Desserts", image_url: null, is_available: false },
  { id: "custom", restaurant_id: "restaurant", name: "Suggestion", description: null, price: 18, category: null, image_url: null, is_available: null },
];

describe("restaurant menu catalogue", () => {
  it("filters the existing dishes by category and always lets the restaurant return to the complete menu", () => {
    render(<RestaurantMenuCatalog items={items} onEdit={vi.fn()} onDelete={vi.fn()} onToggleAvailability={vi.fn()} />);
    expect(screen.getByRole("heading", { name: "Houmous" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dessert du jour" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher la catégorie Entrées" }));
    expect(screen.getByRole("heading", { name: "Houmous" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dessert du jour" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher la catégorie Sans catégorie" }));
    expect(screen.getByRole("heading", { name: "Suggestion" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Afficher tous les plats" }));
    expect(screen.getByRole("heading", { name: "Houmous" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Dessert du jour" })).toBeInTheDocument();
  });

  it("retains editing, deletion and stock controls with the original record and current availability", () => {
    const onEdit = vi.fn();
    const onDelete = vi.fn();
    const onToggleAvailability = vi.fn();
    render(<RestaurantMenuCatalog items={items} onEdit={onEdit} onDelete={onDelete} onToggleAvailability={onToggleAvailability} />);

    fireEvent.click(screen.getByRole("button", { name: "Modifier Houmous" }));
    expect(onEdit).toHaveBeenCalledWith(items[0]);
    fireEvent.click(screen.getByRole("button", { name: "Supprimer Houmous" }));
    expect(onDelete).toHaveBeenCalledWith("starter");
    fireEvent.click(screen.getByRole("switch", { name: "Disponibilité de Dessert du jour" }));
    expect(onToggleAvailability).toHaveBeenCalledWith("dessert", false);
    expect(screen.getByRole("switch", { name: "Disponibilité de Suggestion" })).toBeChecked();
    expect(screen.getByText("14.50 CHF")).toBeInTheDocument();
  });
});
