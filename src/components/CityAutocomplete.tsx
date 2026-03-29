import AddressAutocomplete, { type AddressSelection } from "@/components/AddressAutocomplete";

export type CitySelection = AddressSelection & {
  city: string;
};

interface CityAutocompleteProps {
  value: string;
  onCitySelect: (city: string, selection?: CitySelection) => void;
  onValueChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  id?: string;
  disabled?: boolean;
}

export default function CityAutocomplete({
  value,
  onCitySelect,
  onValueChange,
  placeholder = "Commencez a saisir une ville...",
  className,
  inputClassName,
  id,
  disabled,
}: CityAutocompleteProps) {
  return (
    <AddressAutocomplete
      id={id}
      mode="city"
      value={value}
      onValueChange={onValueChange}
      onLocationSelect={(selection) => {
        const city = selection.city || selection.label || selection.fullAddress;
        onCitySelect(city, { ...selection, city });
      }}
      placeholder={placeholder}
      className={className}
      inputClassName={inputClassName}
      disabled={disabled}
    />
  );
}
