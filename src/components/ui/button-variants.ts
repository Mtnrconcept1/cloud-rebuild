import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  // Retour de pression : léger enfoncement (scale) en 160 ms, courbe ease-out franche.
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-semibold tracking-[-0.005em] ring-offset-background transition-[background-color,border-color,color,filter,transform] duration-150 ease-tok-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        // Aplat orange TOK exact, sans halo au repos ; le survol fonce légèrement l'aplat.
        default: "bg-primary text-primary-foreground hover:brightness-[0.93]",
        destructive: "bg-destructive text-destructive-foreground hover:brightness-[0.93]",
        outline: "border border-input bg-card text-foreground hover:border-foreground/30 hover:bg-muted/60",
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
