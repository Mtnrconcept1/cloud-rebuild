import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { getMissingSupabasePublicEnvKeys } from "./src/lib/publicEnv";

const manualChunkGroups = {
  "react-vendor": ["react", "react-dom", "react-router-dom", "@tanstack/react-query"],
  "supabase-vendor": ["@supabase/supabase-js"],
} as const;

function manualChunks(id: string) {
  const normalizedId = id.replace(/\\/g, "/");

  for (const [chunkName, packages] of Object.entries(manualChunkGroups)) {
    if (packages.some((packageName) => normalizedId.includes(`/node_modules/${packageName}/`))) {
      return chunkName;
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  if (mode === "production") {
    const env = loadEnv(mode, process.cwd(), "");
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
    plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    build: {
      rollupOptions: {
        external: ["firebase/app", "firebase/messaging"],
        output: {
          manualChunks,
        },
      },
    },
  };
});
