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
          "flex h-11 w-full min-w-0 max-w-full rounded-xl border border-input bg-card px-3.5 py-2 text-base text-foreground shadow-[0_1px_2px_rgb(52_34_20/4%)] ring-offset-background transition-[border-color,box-shadow] duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground hover:border-foreground/20 focus-visible:border-primary/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-primary/15 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50 dark:border-input dark:bg-card dark:text-foreground dark:placeholder:text-muted-foreground md:text-sm",
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
