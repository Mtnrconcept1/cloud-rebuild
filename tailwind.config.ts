import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

/**
 * Warm neutral ramp used in place of Tailwind's blue-grey `slate`.
 *
 * `slate-*` is referenced on ~1200 call sites across the app, almost always as
 * "the neutral" rather than "the blue one". Remapping the scale here keeps
 * every one of those sites coherent with the warm design tokens in index.css
 * instead of leaving a cold cast on dark surfaces and body copy.
 * Lightness steps mirror the original ramp so existing contrast pairings hold.
 */
const warmNeutral = {
  50: "#faf8f6",
  100: "#f5f1ed",
  200: "#e9e2da",
  300: "#d6ccc1",
  400: "#a99c8f",
  500: "#7c7167",
  600: "#5e554d",
  700: "#453e38",
  800: "#2b2622",
  900: "#191512",
  950: "#0e0b09",
} as const;

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "max(1rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
        sm: "max(1.25rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
        md: "max(1.5rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
        lg: "max(2rem, env(safe-area-inset-left, 0px), env(safe-area-inset-right, 0px))",
      },
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      /**
       * Full 0-100 opacity scale.
       *
       * Tailwind ships opacities in steps of 5, so bare modifiers off that
       * scale (`bg-white/92`, `border-white/12`, `text-white/72`, …) silently
       * generate nothing and the element renders with no colour at all. ~100
       * such call sites already existed across the app; widening the scale
       * makes every one of them resolve instead of failing quietly.
       */
      opacity: Object.fromEntries(
        Array.from({ length: 101 }, (_, index) => [String(index), String(index / 100)]),
      ),
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        display: ["Playfair Display", "Georgia", "serif"],
      },
      fontSize: {
        // Fluid editorial scale for hero and section headings.
        "display-2xl": ["clamp(2.75rem, 1.6rem + 5.2vw, 5.5rem)", { lineHeight: "0.95", letterSpacing: "-0.035em" }],
        "display-xl": ["clamp(2.25rem, 1.4rem + 3.9vw, 4.25rem)", { lineHeight: "0.98", letterSpacing: "-0.032em" }],
        "display-lg": ["clamp(1.875rem, 1.25rem + 2.8vw, 3.25rem)", { lineHeight: "1.03", letterSpacing: "-0.028em" }],
        "display-md": ["clamp(1.5rem, 1.1rem + 1.9vw, 2.5rem)", { lineHeight: "1.1", letterSpacing: "-0.024em" }],
        "display-sm": ["clamp(1.25rem, 1rem + 1.1vw, 1.875rem)", { lineHeight: "1.18", letterSpacing: "-0.02em" }],
        eyebrow: ["0.6875rem", { lineHeight: "1", letterSpacing: "0.18em", fontWeight: "700" }],
      },
      colors: {
        slate: warmNeutral,
        border: {
          DEFAULT: "hsl(var(--border))",
          strong: "hsl(var(--border-strong))",
        },
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        surface: {
          DEFAULT: "hsl(var(--surface))",
          sunken: "hsl(var(--surface-sunken))",
          raised: "hsl(var(--surface-raised))",
          overlay: "hsl(var(--surface-overlay))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
          soft: "hsl(var(--primary-soft))",
          "soft-foreground": "hsl(var(--primary-soft-foreground))",
        },
        brand: {
          DEFAULT: "hsl(var(--brand))",
          foreground: "hsl(var(--brand-foreground))",
          muted: "hsl(var(--brand-muted))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
          soft: "hsl(var(--destructive-soft))",
          "soft-foreground": "hsl(var(--destructive-soft-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
          soft: "hsl(var(--success-soft))",
          "soft-foreground": "hsl(var(--success-soft-foreground))",
        },
        warning: {
          DEFAULT: "hsl(var(--warning))",
          foreground: "hsl(var(--warning-foreground))",
          soft: "hsl(var(--warning-soft))",
          "soft-foreground": "hsl(var(--warning-soft-foreground))",
        },
        info: {
          DEFAULT: "hsl(var(--info))",
          foreground: "hsl(var(--info-foreground))",
          soft: "hsl(var(--info-soft))",
          "soft-foreground": "hsl(var(--info-soft-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
          soft: "hsl(var(--accent-soft))",
          "soft-foreground": "hsl(var(--accent-soft-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
        miamz: {
          green: "hsl(var(--miamz-green))",
          "green-foreground": "hsl(var(--miamz-green-foreground))",
          orange: "hsl(var(--miamz-orange))",
          "orange-light": "hsl(var(--miamz-orange-light))",
          warm: "hsl(var(--miamz-warm))",
        },
      },
      borderRadius: {
        // xl/2xl/3xl keep their Tailwind defaults — they are used verbatim on
        // hundreds of existing surfaces and re-basing them on --radius would
        // inflate dense UI. Only the shadcn trio and a larger step are themed.
        xs: "calc(var(--radius) - 6px)",
        sm: "calc(var(--radius) - 4px)",
        md: "calc(var(--radius) - 2px)",
        lg: "var(--radius)",
        "4xl": "2rem",
      },
      boxShadow: {
        xs: "var(--shadow-xs)",
        sm: "var(--shadow-sm)",
        DEFAULT: "var(--shadow-sm)",
        md: "var(--shadow-md)",
        lg: "var(--shadow-lg)",
        xl: "var(--shadow-xl)",
        "2xl": "var(--shadow-2xl)",
        brand: "var(--shadow-brand)",
        "inset-top": "var(--shadow-inset-top)",
      },
      transitionTimingFunction: {
        "out-soft": "var(--ease-out-soft)",
        "out-quint": "var(--ease-out-quint)",
        "in-out-soft": "var(--ease-in-out-soft)",
        spring: "var(--ease-spring)",
      },
      transitionDuration: {
        fast: "140ms",
        base: "220ms",
        slow: "380ms",
      },
      backgroundImage: {
        "brand-gradient": "linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--primary)) 100%)",
        "brand-sheen": "linear-gradient(135deg, hsl(var(--brand)) 0%, hsl(var(--primary)) 55%, hsl(12 84% 40%) 100%)",
        "fresh-gradient": "linear-gradient(135deg, hsl(var(--accent)) 0%, hsl(178 70% 32%) 100%)",
        "surface-sheen": "linear-gradient(180deg, hsl(0 0% 100% / 0.7), hsl(0 0% 100% / 0))",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "fade-in": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-up": {
          from: { opacity: "0", transform: "translateY(18px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.94)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
        "slide-in-right": {
          from: { opacity: "0", transform: "translateX(24px)" },
          to: { opacity: "1", transform: "translateX(0)" },
        },
        "gradient-pan": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        "pulse-ring": {
          "0%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0.4)" },
          "70%": { boxShadow: "0 0 0 12px hsl(var(--primary) / 0)" },
          "100%": { boxShadow: "0 0 0 0 hsl(var(--primary) / 0)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s var(--ease-out-soft) forwards",
        "fade-up": "fade-up 0.55s var(--ease-out-soft) both",
        "scale-in": "scale-in 0.4s var(--ease-out-soft) both",
        "slide-in-right": "slide-in-right 0.45s var(--ease-out-soft) both",
        "gradient-pan": "gradient-pan 6s var(--ease-in-out-soft) infinite",
        "pulse-ring": "pulse-ring 2.2s var(--ease-out-soft) infinite",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
