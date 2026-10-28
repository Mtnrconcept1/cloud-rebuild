import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { getMissingSupabasePublicEnvKeys } from "./src/lib/publicEnv";
import { getTokConnectPreviewWidgetScript, TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH } from "./src/lib/tok-connect-preview";

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


/**
 * A srcDoc iframe inherits the site's CSP, which intentionally blocks inline
 * scripts. Serve the exact inline runtime of the canonical MCP HTML as an
 * external first-party asset in development and in the production build.
 */
function tokConnectPreviewWidgetPlugin(): Plugin {
  const scriptSource = getTokConnectPreviewWidgetScript();
  return {
    name: "tok-connect-preview-external-widget-script",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.url?.split("?")[0] !== TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH) return next();
        response.setHeader("Content-Type", "text/javascript; charset=utf-8");
        response.setHeader("Cache-Control", "no-store");
        response.end(scriptSource);
      });
    },
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: TOK_CONNECT_PREVIEW_WIDGET_SCRIPT_PATH.slice(1),
        source: scriptSource,
      });
    },
  };
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
      strictPort: false,
      allowedHosts: ["localhost", "127.0.0.1", ".local"],
      hmr: {
        overlay: true,
      },
      proxy: {
        "/api/photon": {
          target: "https://photon.komoot.io",
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api\/photon/, "/api"),
        },
      },
    },
    plugins: [react(), tokConnectPreviewWidgetPlugin()],
    resolve: {
      alias: {
        // Keep the large legacy studio source untouched and wrap only the
        // application's absolute import with TheTok Print. The shell imports
        // the legacy module relatively, so this exact alias cannot recurse.
        "@/components/dashboard/TokAiMarketingStudio": path.resolve(
          __dirname,
          "./src/components/dashboard/TokAiMarketingStudioPrintShell.tsx",
        ),
        // The Marketing Studio identifies image calls with marketingAssetMode.
        // This exact alias applies the selected final output target immediately
        // before the existing TOK AI client, while the wrapper imports the base
        // client relatively to avoid recursion. Non-marketing requests remain
        // unchanged.
        "@/lib/ai/tokAiClient": path.resolve(
          __dirname,
          "./src/lib/ai/tokAiClientMarketingOutputShell.ts",
        ),
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
