import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { getMissingSupabasePublicEnvKeys } from "./src/lib/publicEnv";

const manualChunkGroups = {
  "react-vendor": ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  "supabase-vendor": ["@supabase/supabase-js"],
  "ui-vendor": [
    "@radix-ui",
    "class-variance-authority",
    "cmdk",
    "input-otp",
    "lucide-react",
    "next-themes",
    "sonner",
    "tailwind-merge",
    "vaul",
  ],
  "firebase-vendor": ["@firebase", "firebase"],
  "observability-vendor": ["@sentry"],
  "charts-vendor": ["recharts"],
} as const;

function manualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  for (const [chunkName, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`))) {
      return chunkName;
    }
  }
}

function cleanEnvValue(value: string | undefined) {
  if (!value) return "";
  return value.trim().replace(/^['"]|['"]$/g, "").trim();
}

function applyDevelopmentPublicEnvOverrides(mode: string, env: Record<string, string>) {
  if (mode === "production") return;

  const mappings = [
    ["dev_VITE_PUBLIC_", "VITE_"],
    ["dev_VITE_", "VITE_"],
  ] as const;

  for (const [sourcePrefix, targetPrefix] of mappings) {
    for (const [key, rawValue] of Object.entries(env)) {
      if (!key.startsWith(sourcePrefix)) continue;

      const value = cleanEnvValue(rawValue);
      if (!value) continue;

      const targetKey = `${targetPrefix}${key.slice(sourcePrefix.length)}`;
      process.env[targetKey] = value;
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  applyDevelopmentPublicEnvOverrides(mode, env);

  if (!process.env.VITE_SUPABASE_URL && process.env.SUPABASE_URL) {
    process.env.VITE_SUPABASE_URL = process.env.SUPABASE_URL;
  }

  if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_ANON_KEY) {
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_ANON_KEY;
  }

  if (mode === "production") {
    const missingSupabaseEnvKeys = getMissingSupabasePublicEnvKeys(env);

    if (missingSupabaseEnvKeys.length) {
      throw new Error(
        `Missing required Supabase public environment variables for production build: ${missingSupabaseEnvKeys.join(", ")}.`,
      );
    }
  }

  return {
    server: {
      host: "::",
      port: 8080,
      strictPort: true,
      allowedHosts: true,
      hmr: {
        overlay: false,
      },
      proxy: {
        "/api/photon": {
          target: "https://photon.komoot.io",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/photon/, "/api"),
        },
      },
    },
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      include: ["firebase/app", "firebase/messaging"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks,
        },
      },
    },
  };
});
