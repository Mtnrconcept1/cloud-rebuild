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

export type AddressLocationBias = {
  latitude: number | null;
  longitude: number | null;
  city?: string;
  country?: string;
};

interface Suggestion {
  key: string;
  name?: string;
  street?: string;
  housenumber?: string;
  postcode?: string;
  city?: string;
  country?: string;
  countryCode?: string;
  full_address: string;
  latitude: number | null;
  longitude: number | null;
  label: string;
  sublabel?: string;
  distanceKm?: number | null;
  localScore: number;
  sourceIndex: number;
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
    countrycode?: string;
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
  hideIcon?: boolean;
  preferredCity?: string;
  preferredCountry?: string;
  locationBias?: AddressLocationBias;
}

const ADDRESS_SEARCH_LIMIT = 8;
const ADDRESS_SUGGESTION_LIMIT = 5;

const DEFAULT_ADDRESS_BIAS: Required<AddressLocationBias> = {
  latitude: 46.2044,
  longitude: 6.1432,
  city: "Genève",
  country: "Suisse",
};

const KNOWN_SWISS_CITY_BIASES: Record<string, Required<AddressLocationBias>> = {
  bale: { latitude: 47.5596, longitude: 7.5886, city: "Bâle", country: "Suisse" },
  basel: { latitude: 47.5596, longitude: 7.5886, city: "Bâle", country: "Suisse" },
  bern: { latitude: 46.948, longitude: 7.4474, city: "Berne", country: "Suisse" },
  berne: { latitude: 46.948, longitude: 7.4474, city: "Berne", country: "Suisse" },
  fribourg: { latitude: 46.8065, longitude: 7.1619, city: "Fribourg", country: "Suisse" },
  geneve: DEFAULT_ADDRESS_BIAS,
  genf: DEFAULT_ADDRESS_BIAS,
  lausanne: { latitude: 46.5197, longitude: 6.6323, city: "Lausanne", country: "Suisse" },
  lugano: { latitude: 46.0037, longitude: 8.9511, city: "Lugano", country: "Suisse" },
  montreux: { latitude: 46.4312, longitude: 6.9107, city: "Montreux", country: "Suisse" },
  neuchatel: { latitude: 46.9929, longitude: 6.931, city: "Neuchâtel", country: "Suisse" },
  nyon: { latitude: 46.3833, longitude: 6.2396, city: "Nyon", country: "Suisse" },
  sion: { latitude: 46.2331, longitude: 7.3606, city: "Sion", country: "Suisse" },
  vevey: { latitude: 46.4628, longitude: 6.8419, city: "Vevey", country: "Suisse" },
  zurich: { latitude: 47.3769, longitude: 8.5417, city: "Zurich", country: "Suisse" },
};

function normalizeLocationLabel(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

function normalizeForMatching(value: unknown) {
  return normalizeLocationLabel(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function formatCoordinate(value: number) {
  return Number(value.toFixed(4)).toString();
}

function toRadians(value: number) {
  return (value * Math.PI) / 180;
}

function getDistanceKm(from: AddressLocationBias | null, latitude: number | null, longitude: number | null) {
  if (!from || !isFiniteCoordinate(from.latitude) || !isFiniteCoordinate(from.longitude)) return null;
  if (!isFiniteCoordinate(latitude) || !isFiniteCoordinate(longitude)) return null;

  const earthRadiusKm = 6371;
  const deltaLat = toRadians(latitude - from.latitude);
  const deltaLon = toRadians(longitude - from.longitude);
  const fromLat = toRadians(from.latitude);
  const toLat = toRadians(latitude);
  const haversine =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(fromLat) * Math.cos(toLat) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  return earthRadiusKm * 2 * Math.atan2(Math.sqrt(haversine), Math.sqrt(1 - haversine));
}

function getKnownCityBias(city: string | undefined) {
  const normalizedCity = normalizeForMatching(city);
  return normalizedCity ? KNOWN_SWISS_CITY_BIASES[normalizedCity] ?? null : null;
}

function getEffectiveBias(
  locationBias: AddressLocationBias | undefined,
  preferredCity: string | undefined,
  browserLocationBias: AddressLocationBias | null,
) {
  if (locationBias && isFiniteCoordinate(locationBias.latitude) && isFiniteCoordinate(locationBias.longitude)) {
    return locationBias;
  }

  const cityBias = getKnownCityBias(preferredCity);
  if (cityBias) return cityBias;

  if (browserLocationBias && isFiniteCoordinate(browserLocationBias.latitude) && isFiniteCoordinate(browserLocationBias.longitude)) {
    return browserLocationBias;
  }

  return DEFAULT_ADDRESS_BIAS;
}

function isPreferredCountry(country: string | undefined, countryCode: string | undefined, preferredCountry: string) {
  const normalizedCountry = normalizeForMatching(country);
  const normalizedPreferredCountry = normalizeForMatching(preferredCountry);
  const normalizedCountryCode = normalizeForMatching(countryCode);

  return (
    normalizedCountryCode === "ch" ||
    normalizedCountry === "suisse" ||
    normalizedCountry === "switzerland" ||
    normalizedCountry === "schweiz" ||
    Boolean(normalizedPreferredCountry && normalizedCountry === normalizedPreferredCountry)
  );
}

function scoreSuggestion(
  suggestion: Omit<Suggestion, "localScore" | "sourceIndex">,
  effectiveBias: AddressLocationBias,
  preferredCity: string | undefined,
  preferredCountry: string,
) {
  let score = 0;
  const preferredCityMatch = normalizeForMatching(preferredCity || effectiveBias.city);
  const city = normalizeForMatching(suggestion.city);
  const countryMatches = isPreferredCountry(suggestion.country, suggestion.countryCode, preferredCountry);
  const distanceKm = getDistanceKm(effectiveBias, suggestion.latitude, suggestion.longitude);

  if (preferredCityMatch && city === preferredCityMatch) score += 1800;
  else if (preferredCityMatch && city.includes(preferredCityMatch)) score += 1200;

  if (distanceKm !== null) {
    if (distanceKm <= 5) score += 1200;
    else if (distanceKm <= 15) score += 1000;
    else if (distanceKm <= 40) score += 800;
    else if (distanceKm <= 80) score += 550;
    else if (distanceKm <= 150) score += 250;
    else score -= Math.min(700, Math.round(distanceKm / 3));
  }

  score += countryMatches ? 650 : -650;
  if (suggestion.street) score += 80;
  if (suggestion.housenumber) score += 40;

  return { score, distanceKm };
}

function rankSuggestions(suggestions: Suggestion[]) {
  return [...suggestions].sort((left, right) => {
    if (right.localScore !== left.localScore) return right.localScore - left.localScore;
    const leftDistance = left.distanceKm ?? Number.POSITIVE_INFINITY;
    const rightDistance = right.distanceKm ?? Number.POSITIVE_INFINITY;
    if (leftDistance !== rightDistance) return leftDistance - rightDistance;
    return left.sourceIndex - right.sourceIndex;
  });
}

function dedupeSuggestions(suggestions: Suggestion[]) {
  return Array.from(new Map(suggestions.map((suggestion) => [suggestion.key, suggestion])).values());
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
  hideIcon = false,
  preferredCity,
  preferredCountry = "Suisse",
  locationBias,
}: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [browserLocationBias, setBrowserLocationBias] = useState<AddressLocationBias | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isCityMode = mode === "city";
  const effectiveBias = getEffectiveBias(locationBias, preferredCity, browserLocationBias);

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
    abortControllerRef.current?.abort();
  }, []);

  useEffect(() => {
    if (preferredCity || locationBias) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) return;

    let cancelled = false;
    const readCurrentPosition = () => {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          if (cancelled) return;
          setBrowserLocationBias({
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          });
        },
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 10 * 60 * 1000, timeout: 2500 },
      );
    };

    if (navigator.permissions?.query) {
      navigator.permissions
        .query({ name: "geolocation" as PermissionName })
        .then((permission) => {
          if (permission.state === "granted") readCurrentPosition();
        })
        .catch(() => undefined);
    }

    return () => {
      cancelled = true;
    };
  }, [locationBias, preferredCity]);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) {
      setSuggestions([]);
      setIsLoading(false);
      return;
    }

    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({
        q: query,
        limit: String(ADDRESS_SEARCH_LIMIT),
        lang: "fr",
      });
      params.set("lat", formatCoordinate(effectiveBias.latitude as number));
      params.set("lon", formatCoordinate(effectiveBias.longitude as number));

      const response = await fetch(
        `/api/photon?${params.toString()}`,
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error(`API Error: ${response.status}`);

      const data = await response.json();
      const rawSuggestions = ((data.features || []) as PhotonFeature[])
        .map((feature, sourceIndex) => {
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

          const baseSuggestion = {
            key: `${normalizeLocationLabel(suggestionKeyBase)}|${normalizeLocationLabel(postcode)}|${normalizeLocationLabel(properties.country)}`,
            name: properties.name,
            street: properties.street,
            housenumber: properties.housenumber,
            postcode: properties.postcode,
            city,
            country: properties.country,
            countryCode: properties.countrycode,
            full_address: addressLabel,
            latitude: typeof coordinates[1] === "number" ? coordinates[1] : null,
            longitude: typeof coordinates[0] === "number" ? coordinates[0] : null,
            label: isCityMode ? cityLabel : addressLabel,
            sublabel: isCityMode
              ? [postcode, properties.country].filter(Boolean).join(" ")
              : properties.country || undefined,
          };
          const localRank = scoreSuggestion(baseSuggestion, effectiveBias, preferredCity, preferredCountry);

          return {
            ...baseSuggestion,
            distanceKm: localRank.distanceKm,
            localScore: localRank.score,
            sourceIndex,
          } satisfies Suggestion;
        })
        .filter((suggestion: Suggestion) => Boolean(isCityMode ? suggestion.label : suggestion.full_address));

      const rankedSuggestions = dedupeSuggestions(rankSuggestions(rawSuggestions));
      const formatted = rankedSuggestions.slice(0, ADDRESS_SUGGESTION_LIMIT);

      setSuggestions(formatted);
      setIsOpen(true);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      setError("Erreur de recherche");
    } finally {
      if (abortControllerRef.current === controller) setIsLoading(false);
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
      setInputValue(cityLabel);
      setIsOpen(false);
      return;
    }

    const mainAddress = suggestion.housenumber
      ? `${suggestion.street || ""} ${suggestion.housenumber}`.trim()
      : suggestion.street || suggestion.name || "";

    onAddressSelect?.(mainAddress, suggestion.city || "", selection);
    onLocationSelect?.({ ...selection, label: suggestion.full_address });
    setInputValue(suggestion.full_address);
    setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      <div className="relative">
        {!hideIcon && <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />}
        <Input
          id={id}
          value={inputValue}
          onChange={handleInputChange}
          onFocus={() => {
            if (suggestions.length > 0) setIsOpen(true);
          }}
          placeholder={placeholder}
          className={cn(hideIcon ? "pr-9" : "pl-9 pr-9", inputClassName)}
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
                className="flex cursor-pointer items-start gap-3 border-b px-3 py-2 transition-colors last:border-0 hover:bg-muted hover:text-foreground"
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
