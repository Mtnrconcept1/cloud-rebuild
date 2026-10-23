import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.005em] ring-offset-background transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-tok focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground shadow-[0_1px_0_rgb(255_255_255/22%)_inset,0_6px_16px_rgb(241_93_34/22%)] hover:bg-primary/90 hover:shadow-[0_1px_0_rgb(255_255_255/22%)_inset,0_10px_24px_rgb(241_93_34/28%)]",
        destructive: "bg-destructive text-destructive-foreground shadow-soft hover:bg-destructive/90",
        outline: "border border-input bg-card text-foreground shadow-[0_1px_2px_rgb(52_34_20/5%)] hover:border-foreground/25 hover:bg-muted/60",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-muted hover:text-foreground",
        link: "rounded-md text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "min-h-11 px-5 py-2.5",
        sm: "min-h-11 px-4",
        lg: "min-h-12 px-7 text-[0.9375rem]",
        icon: "h-11 w-11",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
