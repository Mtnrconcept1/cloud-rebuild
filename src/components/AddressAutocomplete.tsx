import { useEffect, useRef, useState, type ChangeEvent } from "react";

import { Loader2, MapPin } from "lucide-react";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AddressSelection = {
  fullAddress: string;
  latitude: number | null;
  longitude: number | null;
  postcode?: string;
  country?: string;
  city?: string;
  label?: string;
};

interface Suggestion {
  key: string;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  country?: string;
  full_address: string;
  latitude: number | null;
  longitude: number | null;
  label: string;
  sublabel?: string;
}

type PhotonFeature = {
  properties?: {
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
  geometry?: {
    coordinates?: unknown;
  };
};

interface AddressAutocompleteProps {
  value: string;
  onAddressSelect?: (address: string, city: string, selection?: AddressSelection) => void;
  onLocationSelect?: (selection: AddressSelection) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
  mode?: "address" | "city";
}

function normalizeLocationLabel(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export default function AddressAutocomplete({
  value,
  onAddressSelect,
  onLocationSelect,
  onValueChange,
  placeholder = "Entrez votre adresse...",
  className = "",
  inputClassName = "",
  id,
  disabled = false,
  mode = "address",
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isCityMode = mode === "city";

  useEffect(() => {
    setInputValue(value);
  }, [value]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => () => {
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=fr`,
      );
      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      const rawSuggestions = ((data.features || []) as PhotonFeature[])
        .map((feature) => {
          const properties = feature.properties || {};
          const street = properties.street || properties.name || "";
          const house = properties.housenumber || "";
          const city = properties.city || properties.town || properties.village || properties.name || "";
          const postcode = properties.postcode || "";
          const mainLine = house ? `${street} ${house}` : street;
          const cityLine = postcode ? `${postcode} ${city}` : city;
          const coordinates = Array.isArray(feature.geometry?.coordinates)
            ? feature.geometry.coordinates
            : [null, null];
          const addressLabel = cityLine ? `${mainLine}, ${cityLine}` : mainLine || city;
          const cityLabel = city || addressLabel;

          const suggestionKeyBase = isCityMode ? cityLabel : addressLabel;

          return {
            key: `${normalizeLocationLabel(suggestionKeyBase)}|${normalizeLocationLabel(postcode)}|${normalizeLocationLabel(properties.country)}`,
            name: properties.name,
            street: properties.street,
            housenumber: properties.housenumber,
            postcode: properties.postcode,
            city,
            country: properties.country,
            full_address: addressLabel,
            latitude: typeof coordinates[1] === "number" ? coordinates[1] : null,
            longitude: typeof coordinates[0] === "number" ? coordinates[0] : null,
            label: isCityMode ? cityLabel : addressLabel,
            sublabel: isCityMode
              ? [postcode, properties.country].filter(Boolean).join(" ")
              : properties.country || undefined,
          } satisfies Suggestion;
        })
        .filter((suggestion: Suggestion) => Boolean(isCityMode ? suggestion.label : suggestion.full_address));

      const formatted = isCityMode
        ? Array.from(
            new Map(rawSuggestions.map((suggestion: Suggestion) => [suggestion.key, suggestion])).values(),
          )
        : rawSuggestions;

      setSuggestions(formatted);
      setIsOpen(true);
    } catch {
      setError("Erreur de recherche");
    } finally {
      setIsLoading(false);
    }
  };

  const handleInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const newValue = event.target.value;
    setInputValue(newValue);
    onValueChange?.(newValue);

    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => fetchSuggestions(newValue), 400);
  };

  const handleSelect = (suggestion: Suggestion) => {
    const selection: AddressSelection = {
      fullAddress: suggestion.full_address,
      latitude: suggestion.latitude,
      longitude: suggestion.longitude,
      postcode: suggestion.postcode,
      country: suggestion.country,
      city: suggestion.city,
      label: suggestion.label,
    };

    if (isCityMode) {
      const cityLabel = suggestion.city || suggestion.label || suggestion.full_address;
      const citySelection = { ...selection, city: cityLabel, label: cityLabel };
      onLocationSelect?.(citySelection);
      onAddressSelect?.(cityLabel, cityLabel, citySelection);
      onValueChange?.(cityLabel);
      setInputValue(cityLabel);
      setIsOpen(false);
      return;
    }

    const mainAddress = suggestion.housenumber
      ? `${suggestion.street || ""} ${suggestion.housenumber}`.trim()
      : suggestion.street || suggestion.name || "";

    onAddressSelect?.(mainAddress, suggestion.city || "", selection);
    onLocationSelect?.({ ...selection, label: suggestion.full_address });
    onValueChange?.(suggestion.full_address);
    setInputValue(suggestion.full_address);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={cn("pl-9 pr-9", inputClassName)}
          disabled={disabled}
        />
        {isLoading ? (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        ) : null}
      </div>

      {isOpen && (suggestions.length > 0 || isLoading || error) ? (
        <div className="absolute z-[100] mt-1 min-h-[40px] w-full overflow-hidden rounded-md border bg-popover shadow-lg animate-in fade-in zoom-in-95 duration-200">
          <ul className="py-1">
            {isLoading && suggestions.length === 0 ? (
              <li className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Recherche...
              </li>
            ) : null}
            {error ? <li className="px-3 py-2 text-sm font-medium text-destructive">{error}</li> : null}
            {!isLoading && !error && suggestions.length === 0 && inputValue.length >= 3 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">Aucun resultat trouve</li>
            ) : null}
            {suggestions.map((suggestion) => (
              <li
                key={suggestion.key}
                onClick={() => handleSelect(suggestion)}
                className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 transition-colors last:border-0 hover:bg-accent hover:text-accent-foreground"
              >
                <div className="mt-0.5">
                  <MapPin className="h-4 w-4 text-primary" />
                </div>
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-tight">
                    {isCityMode ? suggestion.label : suggestion.full_address}
                  </span>
                  {suggestion.sublabel ? (
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      {suggestion.sublabel}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
