import type { ReactNode } from "react";
import { Megaphone, Sparkles } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { getSponsoredVisualConfig, type SponsoredVisualTone } from "./sponsoredVisualTheme";

interface SponsoredBadgeProps {
  tone?: SponsoredVisualTone;
  className?: string;
  label?: string;
}

export function SponsoredBadge({
  tone = "restaurant",
  className,
  label = "Sponsorisé",
}: SponsoredBadgeProps) {
  const config = getSponsoredVisualConfig(tone);

  return (
    <Badge
      className={cn(
        "gap-1 rounded-full border px-3 py-1 text-[10px] font-bold uppercase tracking-[0.2em] backdrop-blur-md",
        config.badgeClassName,
        className,
      )}
    >
      <Megaphone className="h-3 w-3" />
      {label}
    </Badge>
  );
}

interface SponsoredContextPillProps {
  tone?: SponsoredVisualTone;
  className?: string;
  children?: ReactNode;
}

export function SponsoredContextPill({
  tone = "restaurant",
  className,
  children,
}: SponsoredContextPillProps) {
  const config = getSponsoredVisualConfig(tone);

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] backdrop-blur-md",
        config.contextClassName,
        className,
      )}
    >
      <Sparkles className="h-3 w-3" />
      {children ?? config.contextLabel}
    </span>
  );
}
