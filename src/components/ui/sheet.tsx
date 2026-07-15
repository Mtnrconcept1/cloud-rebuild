import * as SheetPrimitive from "@radix-ui/react-dialog";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import * as React from "react";

import { cn } from "@/lib/utils";

const Sheet = SheetPrimitive.Root;

const SheetTrigger = SheetPrimitive.Trigger;

const SheetClose = SheetPrimitive.Close;

const SheetPortal = SheetPrimitive.Portal;

const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Overlay
    className={cn(
      "fixed inset-0 z-[1800] bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
    ref={ref}
  />
));
SheetOverlay.displayName = SheetPrimitive.Overlay.displayName;

const sheetVariants = cva(
  "fixed z-[1810] min-w-0 max-w-full gap-4 overflow-y-auto overscroll-contain bg-background p-[clamp(1rem,2vw,1.5rem)] shadow-lg transition ease-in-out data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:duration-300 data-[state=open]:duration-500",
  {
    variants: {
      side: {
        top: "inset-x-0 top-0 max-h-[calc(100dvh-0.5rem)] border-b pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
        bottom:
          "inset-x-0 bottom-0 max-h-[calc(100dvh-0.5rem)] border-t pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
        left: "inset-y-0 left-0 h-[100dvh] w-[min(24rem,calc(100vw-0.5rem))] border-r pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pl-[calc(env(safe-area-inset-left,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left sm:max-w-none",
        right:
          "inset-y-0 right-0 h-[100dvh] w-[min(24rem,calc(100vw-0.5rem))] border-l pb-[calc(env(safe-area-inset-bottom,0px)+1rem)] pr-[calc(env(safe-area-inset-right,0px)+1rem)] pt-[calc(env(safe-area-inset-top,0px)+1rem)] data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right sm:max-w-none",
      },
    },
    defaultVariants: {
      side: "right",
    },
  },
);

interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof SheetPrimitive.Content>,
    VariantProps<typeof sheetVariants> {}

const SheetContent = React.forwardRef<React.ElementRef<typeof SheetPrimitive.Content>, SheetContentProps>(
  ({ side = "right", className, children, onOpenAutoFocus, ...props }, ref) => {
    const contentRef = React.useRef<React.ElementRef<typeof SheetPrimitive.Content> | null>(null);

    const resetScrollableContent = React.useCallback(() => {
      const content = contentRef.current;
      if (!content) return;

      content.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
      content.scrollTop = 0;
      content.scrollLeft = 0;
      content.querySelectorAll<HTMLElement>("[data-sheet-scroll-area]").forEach((scrollArea) => {
        scrollArea.scrollTo?.({ top: 0, left: 0, behavior: "auto" });
        scrollArea.scrollTop = 0;
        scrollArea.scrollLeft = 0;
      });
    }, []);

    const setContentRef = React.useCallback(
      (node: React.ElementRef<typeof SheetPrimitive.Content> | null) => {
        contentRef.current = node;

        if (typeof ref === "function") {
          ref(node);
        } else if (ref) {
          (ref as React.MutableRefObject<React.ElementRef<typeof SheetPrimitive.Content> | null>).current = node;
        }
      },
      [ref],
    );

    React.useEffect(() => {
      resetScrollableContent();
      const frame = window.requestAnimationFrame(resetScrollableContent);

      return () => window.cancelAnimationFrame(frame);
    }, [resetScrollableContent]);

    return (
      <SheetPortal>
        <SheetOverlay />
        <SheetPrimitive.Content
          ref={setContentRef}
          className={cn(sheetVariants({ side }), className)}
          onOpenAutoFocus={(event) => {
            resetScrollableContent();
            window.requestAnimationFrame(resetScrollableContent);
            onOpenAutoFocus?.(event);
          }}
          {...props}
        >
          {children}
          <SheetPrimitive.Close className="absolute right-[calc(env(safe-area-inset-right,0px)+0.5rem)] top-[calc(env(safe-area-inset-top,0px)+0.5rem)] flex h-11 w-11 items-center justify-center rounded-md opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-secondary hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
            <X className="h-4 w-4" />
            <span className="sr-only">Fermer</span>
          </SheetPrimitive.Close>
        </SheetPrimitive.Content>
      </SheetPortal>
    );
  },
);
SheetContent.displayName = SheetPrimitive.Content.displayName;

const SheetHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-2 text-center sm:text-left", className)} {...props} />
);
SheetHeader.displayName = "SheetHeader";

const SheetFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex min-w-0 flex-col-reverse gap-2 [&>*]:w-full sm:flex-row sm:justify-end sm:[&>*]:w-auto", className)} {...props} />
);
SheetFooter.displayName = "SheetFooter";

const SheetTitle = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Title>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Title ref={ref} className={cn("min-w-0 break-words pr-8 text-lg font-semibold leading-snug text-foreground", className)} {...props} />
));
SheetTitle.displayName = SheetPrimitive.Title.displayName;

const SheetDescription = React.forwardRef<
  React.ElementRef<typeof SheetPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof SheetPrimitive.Description>
>(({ className, ...props }, ref) => (
  <SheetPrimitive.Description ref={ref} className={cn("min-w-0 break-words text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = SheetPrimitive.Description.displayName;

export {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetOverlay,
  SheetPortal,
  SheetTitle,
  SheetTrigger,
};
