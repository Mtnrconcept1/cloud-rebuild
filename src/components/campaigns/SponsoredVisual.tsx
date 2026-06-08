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
        "min-h-8 gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-extrabold uppercase tracking-[0.18em] shadow-[0_12px_28px_rgba(15,23,42,0.30)] ring-1 ring-white/35 backdrop-blur-xl",
        config.badgeClassName,
        className,
      )}
    >
      <Megaphone className="h-3.5 w-3.5 shrink-0" />
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
        "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] shadow-[0_12px_28px_rgba(15,23,42,0.28)] ring-1 ring-white/25 backdrop-blur-xl",
        config.contextClassName,
        className,
      )}
    >
      <Sparkles className="h-3.5 w-3.5 shrink-0" />
      {children ?? config.contextLabel}
    </span>
  );
}
