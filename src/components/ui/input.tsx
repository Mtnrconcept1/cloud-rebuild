import * as React from "react";

import { cn } from "@/lib/utils";

const INPUTS_WITH_24H_LOCALE = new Set(["time", "datetime-local"]);

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, lang, type, ...props }, ref) => {
    const resolvedLang = lang ?? (type && INPUTS_WITH_24H_LOCALE.has(type) ? "fr-CH" : undefined);

    return (
      <input
        lang={resolvedLang}
        type={type}
        className={cn(
          "flex h-11 w-full min-w-0 max-w-full rounded-md border border-input bg-surface-raised px-3.5 py-2 text-base text-foreground shadow-xs transition-[border-color,box-shadow,background-color] duration-fast ease-out-soft file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground/80 "
          + "hover:border-border-strong focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/25 "
          + "disabled:cursor-not-allowed disabled:bg-muted disabled:opacity-60 aria-[invalid=true]:border-destructive aria-[invalid=true]:ring-destructive/25 md:h-10 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
