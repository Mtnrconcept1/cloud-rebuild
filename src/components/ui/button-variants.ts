import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md",
    "text-sm font-semibold tracking-[-0.01em]",
    "transition-[background-color,border-color,color,box-shadow,transform,opacity,filter] duration-base ease-out-soft",
    "outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
    "disabled:pointer-events-none disabled:opacity-50 disabled:shadow-none",
    "active:translate-y-px",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  ].join(" "),
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-sm hover:bg-primary/90 hover:shadow-md",
        brand:
          "bg-brand-gradient text-primary-foreground shadow-brand hover:brightness-110 hover:shadow-xl",
        destructive:
          "bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 hover:shadow-md",
        success:
          "bg-success text-success-foreground shadow-sm hover:bg-success/90 hover:shadow-md",
        outline:
          "border border-input bg-background text-foreground shadow-xs hover:border-border-strong hover:bg-muted",
        secondary:
          "bg-secondary text-secondary-foreground shadow-xs hover:bg-secondary/70",
        soft:
          "bg-primary-soft text-primary-soft-foreground hover:bg-primary-soft/70",
        ghost:
          "text-foreground/80 hover:bg-muted hover:text-foreground",
        glass:
          "glass text-foreground hover:bg-surface-raised/90",
        link:
          "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-[44px] px-4 py-2 sm:h-10",
        sm: "h-[44px] rounded-md px-3 text-[0.8125rem] sm:h-9",
        lg: "h-[48px] rounded-lg px-7 text-[0.9375rem] sm:h-12",
        xl: "h-[54px] rounded-lg px-8 text-base",
        icon: "h-[44px] w-[44px] sm:h-10 sm:w-10",
        "icon-sm": "h-9 w-9 rounded-md",
      },
      pill: {
        true: "rounded-full",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
