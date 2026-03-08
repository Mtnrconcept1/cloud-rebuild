import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

interface StarRatingProps { rating: number; maxRating?: number; onRate?: (rating: number) => void; size?: "sm" | "md"; }

export default function StarRating({ rating, maxRating = 5, onRate, size = "sm" }: StarRatingProps) {
  const starSize = size === "sm" ? "h-4 w-4" : "h-5 w-5";
  return (
    <div className="flex items-center gap-0.5">
      {Array.from({ length: maxRating }, (_, i) => (
        <button key={i} type="button" disabled={!onRate} onClick={() => onRate?.(i + 1)} className={cn("transition-colors", onRate && "cursor-pointer hover:scale-110")}>
          <Star className={cn(starSize, i < rating ? "fill-primary text-primary" : "text-muted-foreground/30")} />
        </button>
      ))}
    </div>
  );
}
