import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { MapPin, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Suggestion { name?: string; street?: string; housenumber?: string; postcode?: string; city?: string; country?: string; full_address: string; }
interface AddressAutocompleteProps { value: string; onAddressSelect: (address: string, city: string) => void; placeholder?: string; className?: string; }

export default function AddressAutocomplete({ value, onAddressSelect, placeholder = "Entrez votre adresse...", className = "" }: AddressAutocompleteProps) {
  const [inputValue, setInputValue] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debounceTimerRef = useRef<any>(null);

  useEffect(() => { setInputValue(value); }, [value]);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => { if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) setIsOpen(false); };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const fetchSuggestions = async (query: string) => {
    if (query.length < 3) { setSuggestions([]); setIsLoading(false); return; }
    setIsLoading(true); setError(null);
    try {
      const response = await fetch(`https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=fr`);
      if (!response.ok) throw new Error(`API Error: ${response.status}`);
      const data = await response.json();
      const formatted: Suggestion[] = data.features.map((feature: any) => {
        const { properties } = feature;
        const street = properties.street || properties.name || "";
        const house = properties.housenumber || "";
        const city = properties.city || properties.town || properties.village || "";
        const postcode = properties.postcode || "";
        const mainLine = house ? `${street} ${house}` : street;
        const cityLine = postcode ? `${postcode} ${city}` : city;
        return { name: properties.name, street: properties.street, housenumber: properties.housenumber, postcode: properties.postcode, city, country: properties.country, full_address: cityLine ? `${mainLine}, ${cityLine}` : mainLine };
      });
      setSuggestions(formatted); setIsOpen(true);
    } catch (err: any) { setError("Erreur de recherche"); } finally { setIsLoading(false); }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value; setInputValue(newValue);
    if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(() => fetchSuggestions(newValue), 400);
  };

  const handleSelect = (suggestion: Suggestion) => {
    const mainAddress = suggestion.housenumber ? `${suggestion.street || ""} ${suggestion.housenumber}`.trim() : suggestion.street || suggestion.name || "";
    onAddressSelect(mainAddress, suggestion.city || "");
    setInputValue(suggestion.full_address); setIsOpen(false);
  };

  return (
    <div className={cn("relative w-full", className)} ref={dropdownRef}>
      <div className="relative">
        <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input value={inputValue} onChange={handleInputChange} onFocus={() => { if (suggestions.length > 0) setIsOpen(true); }} placeholder={placeholder} className="pl-9 pr-9" />
        {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />}
      </div>
      {isOpen && (suggestions.length > 0 || isLoading || error) && (
        <div className="absolute z-[100] w-full mt-1 bg-popover border rounded-md shadow-lg overflow-hidden animate-in fade-in zoom-in-95 duration-200 min-h-[40px]">
          <ul className="py-1">
            {isLoading && suggestions.length === 0 && <li className="px-3 py-2 text-sm text-muted-foreground flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" />Recherche...</li>}
            {error && <li className="px-3 py-2 text-sm text-destructive font-medium">{error}</li>}
            {!isLoading && !error && suggestions.length === 0 && inputValue.length >= 3 && <li className="px-3 py-2 text-sm text-muted-foreground">Aucun résultat trouvé</li>}
            {suggestions.map((suggestion, index) => (
              <li key={index} onClick={() => handleSelect(suggestion)} className="px-3 py-2 hover:bg-accent hover:text-accent-foreground cursor-pointer flex items-start gap-3 border-b last:border-0 transition-colors">
                <div className="mt-0.5"><MapPin className="h-4 w-4 text-primary" /></div>
                <div className="flex flex-col"><span className="text-sm font-medium leading-tight">{suggestion.full_address}</span>{suggestion.country && <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{suggestion.country}</span>}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
