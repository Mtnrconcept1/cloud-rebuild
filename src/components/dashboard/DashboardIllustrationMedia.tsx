import { useEffect, useState } from "react";
import { ImageIcon } from "lucide-react";

import type { DashboardIllustration } from "@/lib/dashboardIllustrations";
import { cn } from "@/lib/utils";

type DashboardIllustrationMediaProps = {
  illustration: DashboardIllustration;
  className?: string;
  imageClassName?: string;
  fallbackClassName?: string;
  eager?: boolean;
};

export default function DashboardIllustrationMedia({
  illustration,
  className,
  imageClassName,
  fallbackClassName,
  eager = false,
}: DashboardIllustrationMediaProps) {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const imageFailed = failedSource === illustration.src;

  useEffect(() => {
    setFailedSource(null);
  }, [illustration.src]);

  return (
    <span
      className={cn(
        "relative flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-[radial-gradient(circle_at_center,rgba(255,159,28,0.15),transparent_68%)]",
        className,
      )}
      aria-hidden="true"
      data-dashboard-illustration={illustration.src}
    >
      {!imageFailed ? (
        <img
          src={illustration.src}
          alt={illustration.alt}
          width={illustration.width}
          height={illustration.height}
          loading={eager ? "eager" : "lazy"}
          decoding="async"
          onError={() => setFailedSource(illustration.src)}
          className={cn(
            "h-full w-full object-contain p-2 drop-shadow-[0_18px_22px_rgba(194,78,24,0.18)]",
            imageClassName,
          )}
        />
      ) : (
        <span
          className={cn(
            "flex h-full w-full items-center justify-center rounded-2xl border border-orange-200/70 bg-orange-50/70 text-orange-500 dark:border-orange-400/20 dark:bg-orange-500/10",
            fallbackClassName,
          )}
          data-dashboard-illustration-fallback
        >
          <ImageIcon className="h-8 w-8" aria-hidden="true" />
        </span>
      )}
    </span>
  );
}
