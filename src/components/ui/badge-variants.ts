import { cva } from "class-variance-authority";

export const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold leading-5 tracking-[-0.005em] transition-colors duration-fast ease-out-soft focus:outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&_svg]:size-3 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/90",
        brand: "border-transparent bg-brand-gradient text-primary-foreground shadow-sm",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/70",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/90",
        success: "border-transparent bg-success text-success-foreground hover:bg-success/90",
        warning: "border-transparent bg-warning text-warning-foreground hover:bg-warning/90",
        info: "border-transparent bg-info text-info-foreground hover:bg-info/90",
        outline: "border-border-strong text-foreground",
        // Tonal variants: readable at small sizes without shouting.
        soft: "border-transparent bg-primary-soft text-primary-soft-foreground",
        "soft-success": "border-transparent bg-success-soft text-success-soft-foreground",
        "soft-warning": "border-transparent bg-warning-soft text-warning-soft-foreground",
        "soft-info": "border-transparent bg-info-soft text-info-soft-foreground",
        "soft-destructive": "border-transparent bg-destructive-soft text-destructive-soft-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
