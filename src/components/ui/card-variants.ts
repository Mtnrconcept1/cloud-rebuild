import { cva } from "class-variance-authority";

export const cardVariants = cva(
  "neon-card min-w-0 max-w-full rounded-lg border bg-card text-card-foreground transition-[box-shadow,border-color,transform] duration-base ease-out-soft",
  {
    variants: {
      variant: {
        default: "shadow-sm",
        raised: "shadow-lg",
        flat: "shadow-none",
        sunken: "border-border/70 bg-surface-sunken shadow-none",
        glass: "glass border-border/70",
        outline: "border-border-strong bg-transparent shadow-none",
      },
      interactive: {
        true: "cursor-pointer hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-xl",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);
