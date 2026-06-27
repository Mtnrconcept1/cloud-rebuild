import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-bold ring-offset-background transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default:
          "border border-orange-900/10 bg-primary text-primary-foreground shadow-[0_12px_28px_rgba(214,66,0,0.26)] hover:bg-[#b83200] hover:shadow-[0_16px_34px_rgba(214,66,0,0.34)] dark:border-orange-300/30 dark:bg-primary dark:text-primary-foreground dark:shadow-[0_0_30px_rgba(255,106,26,0.22)] dark:hover:bg-[#b83200]",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-primary/35 bg-background text-primary shadow-sm hover:border-primary hover:bg-orange-50 hover:text-primary dark:border-orange-300/45 dark:bg-slate-950/70 dark:text-orange-200 dark:hover:border-orange-200 dark:hover:bg-orange-400/16 dark:hover:text-orange-100",
        secondary:
          "border border-orange-200/80 bg-orange-50 text-orange-950 shadow-sm hover:bg-orange-100 dark:border-orange-300/25 dark:bg-orange-400/14 dark:text-orange-50 dark:hover:bg-orange-400/22",
        ghost:
          "text-foreground hover:bg-orange-50 hover:text-primary dark:text-slate-50 dark:hover:bg-orange-400/14 dark:hover:text-orange-100",
        link: "text-primary underline-offset-4 hover:text-[#b83200] hover:underline dark:text-orange-200 dark:hover:text-orange-100",
      },
      size: {
        default: "h-[44px] px-4 py-2 sm:h-10",
        sm: "h-[44px] rounded-xl px-3 sm:h-9",
        lg: "h-[44px] rounded-xl px-8",
        icon: "h-[44px] w-[44px] sm:h-10 sm:w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);
