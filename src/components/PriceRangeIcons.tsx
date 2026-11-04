interface PriceRangeIconsProps { range: number; }

// Gamme de prix lisible : trois paliers sobres et un libellé en clair, dans la
// couleur du texte qui l'entoure (carte claire, photo de couverture, mode sombre).
// Le vert reste réservé aux disponibilités et à l'anti-gaspi.
export default function PriceRangeIcons({ range }: PriceRangeIconsProps) {
  const numericRange = Number(range);
  if (!numericRange || numericRange <= 0) return null;
  const level = Math.min(3, Math.max(1, Math.round(numericRange)));
  const label = level === 1 ? "Économique" : level === 2 ? "Moyen" : "Premium";
  return (
    <span className="inline-flex items-center gap-1.5" role="img" aria-label={`Gamme de prix : ${label}`} title={label}>
      <span className="flex items-center gap-[3px]" aria-hidden="true">
        {[1, 2, 3].map((step) => (
          <span
            key={step}
            className={`h-1.5 w-2.5 rounded-full bg-current ${step <= level ? "opacity-80" : "opacity-25"}`}
          />
        ))}
      </span>
      <span aria-hidden="true" className="text-xs font-medium">{label}</span>
    </span>
  );
}
