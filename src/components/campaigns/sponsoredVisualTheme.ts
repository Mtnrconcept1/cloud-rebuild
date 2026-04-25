export type SponsoredVisualTone =
  | "home"
  | "search"
  | "flash_sales"
  | "anti_waste"
  | "restaurant";

type SponsoredVisualConfig = {
  badgeClassName: string;
  contextClassName: string;
  bannerShellClassName: string;
  bannerOverlayClassName: string;
  bannerSpotlightClassName: string;
  contextLabel: string;
};

const SPONSORED_VISUALS: Record<SponsoredVisualTone, SponsoredVisualConfig> = {
  home: {
    badgeClassName:
      "border-white/20 bg-gradient-to-r from-[#ff7a18] via-[#ff9b2f] to-[#ff5f6d] text-white shadow-[0_14px_28px_rgba(249,115,22,0.34)]",
    contextClassName: "border-white/18 bg-white/12 text-white/88",
    bannerShellClassName:
      "border-[#ffb97d]/35 bg-[linear-gradient(135deg,rgba(18,23,37,0.88),rgba(49,28,20,0.78)_48%,rgba(88,39,17,0.76))]",
    bannerOverlayClassName:
      "bg-[linear-gradient(115deg,rgba(10,14,24,0.88)_0%,rgba(10,14,24,0.42)_38%,rgba(10,14,24,0.22)_64%,rgba(255,126,30,0.12)_100%)]",
    bannerSpotlightClassName:
      "bg-[radial-gradient(circle_at_top_right,rgba(255,185,125,0.34),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(255,109,64,0.22),transparent_26%)]",
    contextLabel: "Accueil",
  },
  search: {
    badgeClassName:
      "border-white/20 bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#f59e0b] text-white shadow-[0_14px_28px_rgba(249,115,22,0.28)]",
    contextClassName: "border-amber-100/20 bg-amber-50/12 text-amber-50",
    bannerShellClassName:
      "border-[#f4b26a]/35 bg-[linear-gradient(135deg,rgba(20,29,45,0.9),rgba(45,31,20,0.78)_48%,rgba(76,43,20,0.74))]",
    bannerOverlayClassName:
      "bg-[linear-gradient(115deg,rgba(10,14,24,0.9)_0%,rgba(10,14,24,0.48)_40%,rgba(10,14,24,0.18)_68%,rgba(245,158,11,0.14)_100%)]",
    bannerSpotlightClassName:
      "bg-[radial-gradient(circle_at_top_right,rgba(252,211,77,0.28),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.18),transparent_24%)]",
    contextLabel: "Recherche",
  },
  flash_sales: {
    badgeClassName:
      "border-white/20 bg-gradient-to-r from-[#fb7185] via-[#f97316] to-[#f59e0b] text-white shadow-[0_14px_28px_rgba(244,63,94,0.28)]",
    contextClassName: "border-white/16 bg-white/10 text-white/88",
    bannerShellClassName:
      "border-[#fb7185]/28 bg-[linear-gradient(135deg,rgba(28,20,37,0.92),rgba(66,26,20,0.82)_50%,rgba(106,46,13,0.76))]",
    bannerOverlayClassName:
      "bg-[linear-gradient(118deg,rgba(16,12,23,0.88)_0%,rgba(16,12,23,0.44)_36%,rgba(16,12,23,0.18)_66%,rgba(251,113,133,0.14)_100%)]",
    bannerSpotlightClassName:
      "bg-[radial-gradient(circle_at_top_right,rgba(251,113,133,0.24),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(251,146,60,0.18),transparent_24%)]",
    contextLabel: "Ventes flash",
  },
  anti_waste: {
    badgeClassName:
      "border-white/20 bg-gradient-to-r from-[#f97316] via-[#f59e0b] to-[#10b981] text-white shadow-[0_14px_28px_rgba(16,185,129,0.24)]",
    contextClassName: "border-emerald-100/18 bg-emerald-50/10 text-emerald-50",
    bannerShellClassName:
      "border-[#7dd3a7]/30 bg-[linear-gradient(135deg,rgba(18,26,23,0.94),rgba(40,46,24,0.82)_48%,rgba(62,55,17,0.74))]",
    bannerOverlayClassName:
      "bg-[linear-gradient(116deg,rgba(10,18,16,0.9)_0%,rgba(10,18,16,0.44)_40%,rgba(10,18,16,0.18)_68%,rgba(16,185,129,0.14)_100%)]",
    bannerSpotlightClassName:
      "bg-[radial-gradient(circle_at_top_right,rgba(16,185,129,0.26),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.18),transparent_24%)]",
    contextLabel: "Anti-gaspi",
  },
  restaurant: {
    badgeClassName:
      "border-white/20 bg-gradient-to-r from-[#f97316] via-[#fb923c] to-[#f59e0b] text-white shadow-[0_12px_26px_rgba(249,115,22,0.26)]",
    contextClassName: "border-amber-200/80 bg-white/88 text-amber-700",
    bannerShellClassName:
      "border-[#f3c186]/55 bg-[linear-gradient(180deg,rgba(255,248,238,0.98),rgba(255,255,255,0.98))]",
    bannerOverlayClassName:
      "bg-[linear-gradient(115deg,rgba(255,255,255,0.12)_0%,rgba(255,255,255,0)_40%,rgba(255,164,72,0.1)_100%)]",
    bannerSpotlightClassName:
      "bg-[radial-gradient(circle_at_top_right,rgba(251,191,36,0.24),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(249,115,22,0.12),transparent_24%)]",
    contextLabel: "Mise en avant",
  },
};

export function getSponsoredVisualConfig(tone: SponsoredVisualTone = "restaurant") {
  return SPONSORED_VISUALS[tone];
}
