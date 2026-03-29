import { useMemo, useState } from "react";

import { X } from "lucide-react";

import CityAutocomplete from "@/components/CityAutocomplete";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface CityMultiSelectProps {
  value: string[];
  onChange: (cities: string[]) => void;
  placeholder?: string;
  emptyLabel?: string;
}

function normalizeCityValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export default function CityMultiSelect({
  value,
  onChange,
  placeholder = "Ajoutez une ville...",
  emptyLabel = "Aucune ville selectionnee",
}: CityMultiSelectProps) {
  const [draft, setDraft] = useState("");
  const cities = useMemo(
    () => Array.from(new Set(value.map(normalizeCityValue).filter(Boolean))),
    [value],
  );

  const addCity = (rawCity: string) => {
    const nextCity = normalizeCityValue(rawCity);
    if (!nextCity) return;
    if (cities.some((city) => city.toLowerCase() === nextCity.toLowerCase())) {
      setDraft("");
      return;
    }

    onChange([...cities, nextCity]);
    setDraft("");
  };

  const removeCity = (cityToRemove: string) => {
    onChange(cities.filter((city) => city.toLowerCase() !== cityToRemove.toLowerCase()));
  };

  return (
    <div className="space-y-3">
      <CityAutocomplete
        value={draft}
        onValueChange={setDraft}
        onCitySelect={(city) => addCity(city)}
        placeholder={placeholder}
      />

      {cities.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {cities.map((city) => (
            <Badge key={city} variant="secondary" className="gap-1.5 pr-1">
              <span>{city}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-5 w-5 rounded-full"
                onClick={() => removeCity(city)}
              >
                <X className="h-3 w-3" />
              </Button>
            </Badge>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{emptyLabel}</p>
      )}
    </div>
  );
}
