import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { useOwnerRestaurants, type OwnedRestaurant } from "./useOwnerRestaurants";

type OwnerRestaurantContextValue = {
  restaurants: OwnedRestaurant[];
  selectedRestaurantId: string;
  setSelectedRestaurantId: (restaurantId: string) => void;
  loading: boolean;
  error: string | null;
};

const OwnerRestaurantContext = createContext<OwnerRestaurantContextValue | undefined>(undefined);

export function OwnerRestaurantProvider({ children }: { children: React.ReactNode }) {
  const { restaurants, loading, error } = useOwnerRestaurants();
  const [selectedRestaurantId, setSelectedRestaurantId] = useState("");

  useEffect(() => {
    if (!restaurants.length) {
      setSelectedRestaurantId("");
      return;
    }

    setSelectedRestaurantId((currentRestaurantId) => {
      if (currentRestaurantId && restaurants.some((restaurant) => restaurant.id === currentRestaurantId)) {
        return currentRestaurantId;
      }
      return restaurants[0].id;
    });
  }, [restaurants]);

  const value = useMemo(
    () => ({
      restaurants,
      selectedRestaurantId,
      setSelectedRestaurantId,
      loading,
      error,
    }),
    [restaurants, selectedRestaurantId, loading, error],
  );

  return <OwnerRestaurantContext.Provider value={value}>{children}</OwnerRestaurantContext.Provider>;
}

export function useOwnerRestaurantContext() {
  const context = useContext(OwnerRestaurantContext);
  if (!context) {
    throw new Error("useOwnerRestaurantContext must be used within OwnerRestaurantProvider");
  }
  return context;
}
