interface PriceRangeIconsProps { range: number; }

const DollarBill = ({ active }: { active: boolean }) => (
  <svg width="18" height="10" viewBox="0 0 18 10" className={`transition-colors h-2.5 w-auto ${active ? "text-emerald-500" : "text-gray-200"}`} fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect x="0.5" y="0.5" width="17" height="9" rx="1" stroke="currentColor" strokeWidth="1" fill={active ? "currentColor" : "none"} fillOpacity={active ? "0.15" : "0"} />
    <circle cx="9" cy="5" r="2.2" stroke="currentColor" strokeWidth="0.8" />
    <path d="M9 3.5V6.5 M7.5 4.5 C7.5 4.5 8 4 9 4 C10 4 10.5 4.5 9 5 C7.5 5.5 8 7 9.5 7 C10 7 10.5 6.5 10.5 6.5" stroke="currentColor" strokeWidth="0.6" strokeLinecap="round" />
    <circle cx="2" cy="2.5" r="0.4" fill="currentColor" opacity="0.5" />
    <circle cx="16" cy="2.5" r="0.4" fill="currentColor" opacity="0.5" />
    <circle cx="2" cy="7.5" r="0.4" fill="currentColor" opacity="0.5" />
    <circle cx="16" cy="7.5" r="0.4" fill="currentColor" opacity="0.5" />
  </svg>
);

export default function PriceRangeIcons({ range }: PriceRangeIconsProps) {
  const numericRange = Number(range);
  if (!numericRange || numericRange <= 0) return null;
  const getLabel = () => { if (numericRange <= 1) return "Économique"; if (numericRange === 2) return "Moyen"; return "Premium"; };
  return (
    <div className="flex items-center gap-1.5" title={getLabel()}>
      <div className="flex gap-0.5">{[0, 1, 2].map((index) => <DollarBill key={index} active={index < numericRange} />)}</div>
      <span className="text-[10px] font-bold tracking-tight opacity-70">{getLabel()}</span>
    </div>
  );
}
