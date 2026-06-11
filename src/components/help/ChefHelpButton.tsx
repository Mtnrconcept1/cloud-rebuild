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
        "group relative flex items-center justify-center overflow-visible bg-transparent text-left transition-all hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400/60",
        compact || collapsed ? "h-16 w-16 rounded-full p-0.5" : "min-h-[7.5rem] w-full rounded-[1.45rem] py-2 sm:min-h-[8.5rem]",
        className,
      )}
    >
      <img
        src="/help.png"
        alt=""
        loading="lazy"
        decoding="async"
        className={cn(
          "block shrink-0 object-contain drop-shadow-[0_10px_18px_rgba(249,115,22,0.22)] transition-transform group-hover:scale-105",
          compact || collapsed ? "h-full max-h-20 w-full max-w-20" : "h-28 w-28 sm:h-32 sm:w-32",
        )}
      />
    </button>
  );
}
