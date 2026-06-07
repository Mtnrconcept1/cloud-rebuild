import type { MouseEventHandler } from "react";
import { Moon, Sun } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ThemeToggleButtonProps = {
  className?: string;
  onMouseDown?: MouseEventHandler<HTMLButtonElement>;
  "aria-label"?: string;
};

export default function ThemeToggleButton({
  className,
  onMouseDown,
  "aria-label": ariaLabel = "Mode sombre",
}: ThemeToggleButtonProps) {
  const handleThemeToggle = () => {
    const nextIsDark = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", nextIsDark);
    localStorage.setItem("theme", nextIsDark ? "dark" : "light");
  };

  return (
    <Button
      variant="ghost"
      size="icon"
      type="button"
      aria-label={ariaLabel}
      onMouseDown={onMouseDown}
      onClick={handleThemeToggle}
      className={cn("relative text-muted-foreground hover:text-foreground", className)}
    >
      <Sun className="h-4 w-4 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
      <Moon className="absolute h-4 w-4 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
      <span className="sr-only">{ariaLabel}</span>
    </Button>
  );
}
