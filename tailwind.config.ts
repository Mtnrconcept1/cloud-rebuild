import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

// Le même orange TOK est utilisé par tous les sous-domaines et boutons orange.
const TOK_BRAND_ORANGE = "#F15D22";

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
      fontFamily: {
        sans: ["DM Sans", "system-ui", "sans-serif"],
        // Fraunces porte les titres éditoriaux ; Playfair Display reste en repli.
        display: ["Fraunces", "Playfair Display", "Georgia", "serif"],
        dashboard: ["Playball", "Playfair Display", "serif"],
      },
      colors: {
        // Les aplats et textes orange portent le même orange de marque.
        // Les nuances claires (50–300) restent réservées aux fonds discrets.
        orange: {
          400: TOK_BRAND_ORANGE,
          500: TOK_BRAND_ORANGE,
          600: TOK_BRAND_ORANGE,
          700: TOK_BRAND_ORANGE,
          800: TOK_BRAND_ORANGE,
          900: TOK_BRAND_ORANGE,
          950: TOK_BRAND_ORANGE,
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
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
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      boxShadow: {
        // Ombres chaudes et superposées : relief discret, jamais de halo néon.
        soft: "var(--shadow-soft)",
        lift: "var(--shadow-lift)",
        float: "var(--shadow-float)",
      },
      transitionTimingFunction: {
        tok: "cubic-bezier(.2,.7,.2,1)",
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
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
        "fade-in": "fade-in 0.5s ease-out forwards",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;
