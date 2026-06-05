import { ChefHat } from "lucide-react";

import { openHelpChat, type HelpChatSurface } from "@/lib/helpChat";
import { cn } from "@/lib/utils";

type ChefHelpButtonProps = {
  surface: HelpChatSurface;
  collapsed?: boolean;
  compact?: boolean;
  className?: string;
  onOpen?: () => void;
};

export default function ChefHelpButton({
  surface,
  collapsed = false,
  compact = false,
  className,
  onOpen,
}: ChefHelpButtonProps) {
  const handleClick = () => {
    openHelpChat({ surface });
    onOpen?.();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="Help ! Ouvrir le chat IA"
      className={cn(
        "group relative flex items-center gap-3 overflow-hidden border border-orange-300/70 bg-gradient-to-br from-white via-orange-50 to-amber-100 text-left font-extrabold text-orange-700 shadow-sm transition-all hover:-translate-y-0.5 hover:border-orange-400 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60 dark:border-orange-400/35 dark:from-[#2a1207] dark:via-[#1a0b04] dark:to-[#2b1806] dark:text-orange-100",
        compact ? "w-auto rounded-[1.25rem] px-3 py-2 text-sm" : "w-full rounded-[1.45rem] px-3 py-3 text-sm",
        collapsed && "justify-center px-2",
        className,
      )}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-b-xl rounded-t-[1.35rem] border border-orange-200 bg-white text-orange-600 shadow-sm transition-transform group-hover:scale-105 dark:border-orange-300/35 dark:bg-orange-50 dark:text-orange-700",
          compact ? "h-9 w-9" : "h-10 w-10",
        )}
        aria-hidden="true"
      >
        <span className="absolute -top-1.5 left-1/2 h-3 w-7 -translate-x-1/2 rounded-full border border-orange-200 bg-white dark:border-orange-300/35 dark:bg-orange-50" />
        <ChefHat className={compact ? "h-[1.125rem] w-[1.125rem]" : "h-5 w-5"} />
      </span>

      {!collapsed ? (
        <span className="flex min-w-0 flex-col leading-tight">
          <span className="text-[0.95rem] tracking-normal">Help !</span>
          {!compact ? (
            <span className="text-[11px] font-semibold text-orange-700/70 dark:text-orange-100/72">
              Chat IA OpenAI
            </span>
          ) : null}
        </span>
      ) : null}
    </button>
  );
}
