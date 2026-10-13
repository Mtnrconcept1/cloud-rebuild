import { useEffect, useState, type Dispatch, type SetStateAction } from "react";

export type TokAdminRestaurant = {
  restaurant_id: string;
  restaurant_name: string;
  restaurant_city: string | null;
  restaurant_address: string | null;
  owner_name: string;
  owner_email: string | null;
  mcp_enabled: boolean;
  restaurant_status: string | null;
  restaurant_active: boolean;
  directory_listing?: boolean;
};

export type CatalogCategory = "all" | "directory" | "partner";
export type CatalogAccess = "all" | "enabled" | "revoked";

type CatalogResult = {
  restaurants: TokAdminRestaurant[];
  total: number;
  page: number;
  page_size: number;
};

const EMPTY: CatalogResult = { restaurants: [], total: 0, page: 0, page_size: 50 };

export function useTokConnectAdminCatalog(
  search: string,
  category: CatalogCategory,
  access: CatalogAccess,
  selectedRestaurantId: string,
  setSelectedRestaurantId: Dispatch<SetStateAction<string>>,
  refreshKey: unknown,
  callAdmin: <T>(body: Record<string, unknown>) => Promise<T>,
) {
  const [page, setPage] = useState(0);
  const [catalog, setCatalog] = useState<CatalogResult>(EMPTY);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await callAdmin<CatalogResult>({
          action: "admin-restaurants", page, search, category, access,
        });
        if (!live) return;
        setCatalog(result);
        setSelectedRestaurantId((current) => result.restaurants.some((r) => r.restaurant_id === current)
          ? current : result.restaurants[0]?.restaurant_id || "");
      } catch (cause) {
        if (live) {
          setError(cause instanceof Error ? cause.message : "Recherche des restaurants indisponible.");
          setCatalog(EMPTY);
        }
      } finally {
        if (live) setLoading(false);
      }
    }, 250);
    return () => { live = false; window.clearTimeout(timer); };
  }, [page, search, category, access, refreshKey, callAdmin, setSelectedRestaurantId]);

  const restaurants = catalog.restaurants;
  const selectedRestaurant = restaurants.find((r) => r.restaurant_id === selectedRestaurantId)
    || restaurants[0] || null;

  return {
    restaurants,
    selectedRestaurant,
    total: catalog.total,
    pageSize: catalog.page_size,
    page,
    setPage,
    loading,
    error,
  };
}
