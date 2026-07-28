import { buildCorsHeaders, handleCorsPreflight, isRequestOriginAllowed } from "../_shared/cors.ts";
import { HttpError, jsonResponse } from "../_shared/auth.ts";
import { createRateLimiter } from "../_shared/rate-limit.ts";
import {
  McpProtocolError,
  assertMcpAcceptHeader,
  assertMcpContentType,
  assertMcpProtocolVersion,
  buildMcpAuthToolResult,
  buildMcpBearerChallenge,
  isMcpNotification,
  mcpAcceptedResponse,
  mcpMethodNotAllowedResponse,
  mcpResponseHeaders,
  negotiateMcpProtocolVersion,
  parseMcpJsonRpcRequest,
  type McpJsonRpcRequest,
} from "../_shared/mcp-http.ts";
import {
  SAFE_TOK_CONNECT_MCP_TOOLS,
  buildTokConnectMcpJsonResult,
  buildTokConnectAutopilotPlan,
  buildTokConnectEnvelope,
  getTokConnectSandboxMcpToolResult,
  makeTokConnectRequestId,
  sha256Base64Url,
} from "../_shared/tok-connect.ts";
import {
  assertTokConnectFeatureEnabled,
  assertTokConnectRestaurantGrant,
  authenticateTokConnectToken,
  recordTokConnectApiRequest,
  type TokConnectTokenContext,
} from "../_shared/tok-connect-auth.ts";

type McpHandleResult = {
  payload: Record<string, unknown>;
  context: TokConnectTokenContext | null;
  route: string;
  scopes: string[];
};

type TokConnectMcpTool = {
  name: string;
  title: string;
  description: string;
  requiredScopes: string[];
  inputSchema: Record<string, unknown>;
  outputSchema?: Record<string, unknown>;
  annotations?: Record<string, unknown>;
  _meta?: Record<string, unknown>;
};

const ACTION_WINDOW_RESOURCE_URI = "ui://tok-connect/actions-window-v1.html";

// The widget renders with the application's own typography, so the Google
// Fonts origins serving DM Sans and Playfair Display must be declared to the
// ChatGPT widget CSP alongside the TOK image origins.
const WIDGET_RESOURCE_DOMAINS = [
  "https://www.thetok.ch",
  "https://cloud-rebuild-recovered.vercel.app",
  "https://fonts.googleapis.com",
  "https://fonts.gstatic.com",
];
const TOK_CONNECT_PUBLIC_ORIGIN = (Deno.env.get("TOK_CONNECT_PUBLIC_ORIGIN") || "https://www.thetok.ch")
  .replace(/\/$/, "");
const TOK_CONNECT_MCP_RESOURCE = `${TOK_CONNECT_PUBLIC_ORIGIN}/mcp`;
const TOK_CONNECT_RESOURCE_METADATA_URL = `${TOK_CONNECT_PUBLIC_ORIGIN}/.well-known/oauth-protected-resource`;
const TOK_CONNECT_AUTHORIZATION_SERVER = `https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1`;
const TOK_CONNECT_OIDC_SCOPES = ["openid", "email", "profile"];

const ACTION_WINDOW_HTML = `<!doctype html>
<html lang="fr">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      /* Design tokens copied verbatim from the TOK application (src/index.css)
         so the ChatGPT widget renders with the product's real identity rather
         than an approximation. Light and dark follow the reader's theme. */
      @import url("https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Playfair+Display:wght@400;500;600;700&display=swap");
      :root {
        color-scheme: light dark;
        --tok-primary: hsl(24 95% 53%);
        --tok-primary-soft: hsl(24 95% 53% / 0.14);
        --tok-primary-foreground: hsl(0 0% 100%);
        --tok-accent: hsl(152 55% 45%);
        --tok-gold: hsl(35 100% 62%);
        --tok-background: hsl(0 0% 99%);
        --tok-surface: hsl(0 0% 100%);
        --tok-text: hsl(220 20% 10%);
        --tok-muted: hsl(220 10% 46%);
        --tok-line: hsl(220 13% 91%);
        --tok-shadow: 0 20px 60px hsl(220 20% 10% / 0.1);
        --tok-radius: 0.75rem;
        --tok-font-sans: "DM Sans", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        --tok-font-display: "Playfair Display", Georgia, "Times New Roman", serif;
      }
      @media (prefers-color-scheme: dark) {
        :root {
          --tok-accent: hsl(156 58% 47%);
          --tok-background: hsl(222 30% 5%);
          --tok-surface: hsl(222 28% 11%);
          --tok-text: hsl(210 30% 98%);
          --tok-muted: hsl(214 20% 80%);
          --tok-line: hsl(218 18% 29%);
          --tok-shadow: 0 20px 60px hsl(222 30% 2% / 0.55);
        }
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: var(--tok-font-sans);
        color: var(--tok-text);
        background:
          radial-gradient(circle at 18% 12%, hsl(24 95% 53% / 0.16), transparent 34%),
          radial-gradient(circle at 92% 0%, hsl(152 55% 45% / 0.12), transparent 28%),
          var(--tok-background);
      }
      h1, h2, h3, .tok-display {
        font-family: var(--tok-font-display);
      }
      .shell {
        position: relative;
        overflow: hidden;
        min-height: 100vh;
        padding: 18px;
      }
      .halo {
        position: absolute;
        inset: 22px 18px auto auto;
        width: 160px;
        height: 160px;
        border-radius: 999px;
        border: 1px solid rgba(255, 179, 71, 0.35);
        box-shadow: 0 0 70px rgba(255, 107, 20, 0.34), inset 0 0 45px rgba(255, 107, 20, 0.18);
        animation: spin 18s linear infinite;
        pointer-events: none;
      }
      .halo::before {
        content: "";
        position: absolute;
        inset: 24px;
        border-radius: inherit;
        border: 1px dashed rgba(255, 244, 229, 0.28);
      }
      @keyframes spin { to { transform: rotate(360deg); } }
      header {
        position: relative;
        z-index: 1;
        display: flex;
        justify-content: space-between;
        gap: 14px;
        align-items: flex-start;
        margin-bottom: 18px;
      }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        border: 1px solid rgba(255, 179, 71, 0.42);
        border-radius: 999px;
        padding: 7px 11px;
        color: #ffd6a3;
        background: rgba(255, 255, 255, 0.08);
        font-size: 11px;
        font-weight: 800;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      h1 {
        margin: 12px 0 6px;
        font-size: clamp(28px, 6vw, 42px);
        line-height: 1.02;
        letter-spacing: 0;
      }
      p {
        margin: 0;
        color: var(--tok-muted);
        line-height: 1.45;
      }
      .status {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        white-space: nowrap;
        border: 1px solid rgba(255, 255, 255, 0.16);
        border-radius: 999px;
        padding: 9px 12px;
        background: rgba(255, 255, 255, 0.08);
        font-weight: 800;
        font-size: 12px;
      }
      .dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: var(--tok-primary);
        box-shadow: 0 0 18px var(--tok-primary);
      }
      .grid {
        position: relative;
        z-index: 1;
        display: grid;
        grid-template-columns: minmax(0, 1.1fr) minmax(260px, 0.9fr);
        gap: 14px;
      }
      .card {
        border: 1px solid var(--tok-line);
        border-radius: 22px;
        background: linear-gradient(160deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05));
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.36);
        padding: 16px;
        backdrop-filter: blur(18px);
      }
      .card h2 {
        margin: 0 0 12px;
        font-size: 15px;
        letter-spacing: 0.08em;
        text-transform: uppercase;
      }
      .action-list {
        display: grid;
        gap: 10px;
      }
      .action {
        display: grid;
        grid-template-columns: 38px minmax(0, 1fr);
        gap: 10px;
        align-items: center;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 11px;
        background: rgba(0, 0, 0, 0.18);
      }
      .badge {
        display: grid;
        place-items: center;
        width: 38px;
        height: 38px;
        border-radius: 13px;
        color: #2b1200;
        background: linear-gradient(135deg, var(--tok-gold), var(--tok-primary));
        font-weight: 900;
        box-shadow: 0 0 24px rgba(255, 107, 20, 0.36);
      }
      .action strong {
        display: block;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .action span {
        display: block;
        margin-top: 2px;
        color: var(--tok-muted);
        font-size: 12px;
      }
      .metrics {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
      .metric {
        border-radius: 16px;
        padding: 12px;
        background: rgba(255, 255, 255, 0.08);
        border: 1px solid rgba(255, 255, 255, 0.12);
      }
      .metric b {
        display: block;
        font-size: 24px;
      }
      .metric span {
        color: var(--tok-muted);
        font-size: 12px;
      }
      .sandbox-card {
        grid-column: 1 / -1;
      }
      .sandbox-head {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
        margin-bottom: 12px;
      }
      .sandbox-head strong {
        display: block;
        font-size: 18px;
      }
      .module-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 12px 0;
      }
      .module-chip {
        border: 1px solid rgba(255, 179, 71, 0.34);
        border-radius: 999px;
        padding: 7px 10px;
        color: #ffe2bd;
        background: rgba(255, 107, 20, 0.12);
        font-size: 12px;
        font-weight: 800;
      }
      .step-list {
        display: grid;
        gap: 9px;
      }
      .step {
        display: grid;
        grid-template-columns: 34px minmax(0, 1fr);
        gap: 10px;
        border: 1px solid rgba(255, 255, 255, 0.12);
        border-radius: 16px;
        padding: 11px;
        background: rgba(0, 0, 0, 0.18);
      }
      .step-index {
        display: grid;
        place-items: center;
        width: 34px;
        height: 34px;
        border-radius: 12px;
        color: #2b1200;
        background: linear-gradient(135deg, var(--tok-gold), var(--tok-primary));
        font-weight: 900;
      }
      .step strong {
        display: block;
        margin-bottom: 3px;
      }
      .step small {
        color: #ffd6a3;
        font-weight: 800;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      .guardrails {
        display: grid;
        gap: 8px;
        margin-top: 12px;
      }
      .guardrail {
        border-radius: 14px;
        padding: 10px;
        color: #fff0df;
        background: rgba(255, 107, 20, 0.11);
        border: 1px solid rgba(255, 179, 71, 0.26);
        font-size: 13px;
      }
      .buttons {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 14px;
      }
      button {
        appearance: none;
        border: 0;
        border-radius: 999px;
        padding: 11px 14px;
        color: white;
        background: linear-gradient(135deg, #ff7a1a, #ff4d00);
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        box-shadow: 0 12px 30px rgba(255, 107, 20, 0.28);
      }
      button.secondary {
        color: var(--tok-text);
        background: rgba(255, 255, 255, 0.1);
        border: 1px solid rgba(255, 255, 255, 0.16);
        box-shadow: none;
      }
      pre {
        max-height: 260px;
        overflow: auto;
        white-space: pre-wrap;
        word-break: break-word;
        border-radius: 16px;
        margin: 0;
        padding: 12px;
        color: #ffe7cc;
        background: rgba(0, 0, 0, 0.28);
        border: 1px solid rgba(255, 255, 255, 0.12);
        font-size: 12px;
      }
      body {
        color: var(--tok-text);
        background:
          radial-gradient(circle at 8% 0%, rgba(255, 106, 26, 0.13), transparent 22rem),
          radial-gradient(circle at 94% 6%, rgba(255, 176, 0, 0.12), transparent 24rem),
          linear-gradient(180deg, #fffaf4 0%, #f8fafc 42%, #fff 100%);
      }
      .halo { display: none; }
      .app-frame {
        min-height: 100vh;
        overflow: hidden;
        background:
          linear-gradient(180deg, rgba(255, 255, 255, 0.96), rgba(255, 247, 237, 0.72) 11rem, rgba(248, 250, 252, 0.96) 100%);
      }
      .tok-topbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 16px;
        min-height: 76px;
        padding: 10px 24px;
        border-bottom: 1px solid var(--tok-line);
        background: rgba(255, 255, 255, 0.94);
        box-shadow: 0 16px 42px rgba(15, 23, 42, 0.08);
        backdrop-filter: blur(18px);
      }
      .tok-brand {
        display: flex;
        align-items: center;
        gap: 12px;
        min-width: 0;
      }
      .tok-brand img {
        width: 58px;
        height: 58px;
        object-fit: contain;
        filter: drop-shadow(0 10px 18px rgba(255, 106, 26, 0.25));
      }
      .tok-brand-fallback {
        display: none;
        place-items: center;
        width: 54px;
        height: 54px;
        border-radius: 999px;
        color: white;
        background: linear-gradient(135deg, #ff5a14, #ffb000);
        font-weight: 950;
      }
      .tok-nav {
        display: flex;
        align-items: center;
        gap: 18px;
        color: var(--tok-muted);
        font-size: 14px;
        font-weight: 750;
      }
      .tok-nav span {
        white-space: nowrap;
      }
      .tok-nav .active {
        color: #ff6a1a;
      }
      .tok-actions {
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .tok-icon-btn {
        display: grid;
        place-items: center;
        width: 42px;
        height: 42px;
        border-radius: 999px;
        border: 1px solid var(--tok-line);
        color: #0f172a;
        background: rgba(255, 255, 255, 0.95);
        box-shadow: 0 14px 34px rgba(15, 23, 42, 0.12);
      }
      .tok-space-btn {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        height: 46px;
        border-radius: 999px;
        padding: 0 20px;
        color: white;
        background: linear-gradient(135deg, #ff5a14, #ff8f00);
        box-shadow: 0 18px 38px rgba(255, 106, 26, 0.34);
        font-size: 14px;
        font-weight: 900;
      }
      .floating-menu {
        position: fixed;
        left: calc(env(safe-area-inset-left, 0px) + 18px);
        top: calc(env(safe-area-inset-top, 0px) + 92px);
        z-index: 20;
        display: flex;
        align-items: center;
        gap: 11px;
        max-width: min(19rem, calc(100vw - 2rem));
        height: 66px;
        border-radius: 24px;
        border: 1px solid rgba(253, 186, 116, 0.58);
        padding: 0 18px 0 10px;
        color: white;
        background: #0b0b0e;
        box-shadow: 0 18px 38px rgba(255, 106, 26, 0.32), 0 10px 28px rgba(15, 23, 42, 0.24);
      }
      .floating-menu-icon {
        display: grid;
        place-items: center;
        width: 46px;
        height: 46px;
        border-radius: 16px;
        background: linear-gradient(135deg, #ff5a14, #ffb000);
        box-shadow: 0 0 24px rgba(255, 106, 26, 0.55);
        font-size: 22px;
        line-height: 1;
      }
      .floating-menu small {
        display: block;
        color: #fdba74;
        font-size: 10px;
        font-weight: 800;
        letter-spacing: 0.28em;
        text-transform: uppercase;
      }
      .floating-menu strong {
        display: block;
        max-width: 11rem;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        font-size: 15px;
      }
      .shell {
        min-height: calc(100vh - 76px);
        padding: 104px 28px 32px;
      }
      .app-content {
        position: relative;
        z-index: 1;
        width: min(1180px, 100%);
        margin: 0 auto;
      }
      .app-hero {
        display: grid;
        grid-template-columns: minmax(0, 1.15fr) minmax(270px, 0.85fr);
        gap: 20px;
        align-items: stretch;
        margin-bottom: 18px;
        border: 1px solid rgba(255, 106, 26, 0.26);
        border-radius: 32px;
        padding: 26px;
        background:
          radial-gradient(circle at 82% 18%, rgba(255, 176, 0, 0.23), transparent 20rem),
          linear-gradient(135deg, rgba(255, 255, 255, 0.98), rgba(255, 247, 237, 0.96));
        box-shadow: 0 22px 64px rgba(15, 23, 42, 0.10);
      }
      .eyebrow {
        display: inline-flex;
        gap: 8px;
        align-items: center;
        border-color: rgba(255, 106, 26, 0.28);
        color: #ff6a1a;
        background: #fff7ed;
      }
      h1 {
        color: var(--tok-text);
        font-family: var(--tok-font-display);
        font-size: clamp(34px, 5vw, 58px);
        letter-spacing: 0;
      }
      p {
        color: var(--tok-muted);
      }
      .hero-copy {
        display: grid;
        align-content: center;
        min-height: 210px;
      }
      .hero-actions {
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
        margin-top: 18px;
      }
      .hero-panel {
        display: grid;
        gap: 12px;
        border-radius: 26px;
        border: 1px solid var(--tok-line);
        padding: 16px;
        background: rgba(255, 255, 255, 0.82);
      }
      .tok-mascot {
        position: relative;
        overflow: hidden;
        min-height: 116px;
        border-radius: 22px;
        background:
          radial-gradient(circle at 72% 42%, rgba(255, 106, 26, 0.28), transparent 8rem),
          linear-gradient(135deg, #111827, #1f2937);
      }
      .tok-mascot img {
        position: absolute;
        right: 10px;
        bottom: -10px;
        width: 122px;
        max-height: 140px;
        object-fit: contain;
        filter: drop-shadow(0 18px 24px rgba(0, 0, 0, 0.28));
      }
      .tok-mascot-label {
        position: relative;
        z-index: 1;
        display: grid;
        gap: 6px;
        max-width: 66%;
        padding: 16px;
        color: #fff;
      }
      .tok-mascot-label small {
        color: #fdba74;
        font-size: 10px;
        font-weight: 900;
        letter-spacing: 0.24em;
        text-transform: uppercase;
      }
      .tok-mascot-label strong {
        font-size: 18px;
        line-height: 1.12;
      }
      .metrics {
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .metric {
        border-color: var(--tok-line);
        color: var(--tok-text);
        background: var(--tok-surface);
        box-shadow: 0 12px 30px rgba(15, 23, 42, 0.06);
      }
      .metric span {
        color: var(--tok-muted);
      }
      .grid {
        grid-template-columns: minmax(0, 1fr) minmax(320px, 0.52fr);
      }
      .card {
        border: 1px solid var(--tok-line);
        border-radius: 28px;
        color: var(--tok-text);
        background: var(--tok-surface);
        box-shadow: 0 20px 60px rgba(15, 23, 42, 0.08);
      }
      .card h2 {
        color: var(--tok-text);
        letter-spacing: 0;
        text-transform: none;
        font-size: 22px;
        font-weight: 900;
      }
      .action,
      .step {
        border-color: var(--tok-line);
        color: var(--tok-text);
        background: var(--tok-surface);
        box-shadow: 0 10px 24px rgba(15, 23, 42, 0.05);
      }
      .action span,
      .step small {
        color: var(--tok-muted);
      }
      .badge,
      .step-index {
        color: white;
        background: linear-gradient(135deg, #ff5a14, #ffb000);
      }
      .module-chip {
        color: #c2410c;
        border-color: rgba(255, 106, 26, 0.25);
        background: #fff7ed;
      }
      .guardrail {
        color: #7c2d12;
        border-color: rgba(255, 106, 26, 0.18);
        background: #fff7ed;
      }
      .tok-widget-stack {
        display: grid;
        gap: 14px;
      }
      .tok-showcase-grid,
      .tok-restaurant-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 12px;
      }
      .tok-restaurant-card,
      .tok-tool-card,
      .tok-summary-card {
        position: relative;
        overflow: hidden;
        border: 1px solid rgba(255, 106, 26, 0.14);
        border-radius: 24px;
        background: var(--tok-surface);
        box-shadow: 0 16px 36px rgba(15, 23, 42, 0.08);
      }
      .tok-restaurant-media {
        position: relative;
        min-height: 128px;
        background:
          radial-gradient(circle at 80% 20%, rgba(255, 176, 0, 0.34), transparent 7rem),
          linear-gradient(135deg, #fff7ed, #fed7aa 55%, #ff6a1a);
      }
      .tok-restaurant-media::after {
        content: "";
        position: absolute;
        inset: auto 16px 16px auto;
        width: 112px;
        height: 76px;
        border-radius: 999px;
        background:
          radial-gradient(circle at 45% 38%, #f8fafc 0 18%, transparent 19%),
          radial-gradient(circle at 50% 50%, #92400e 0 38%, transparent 39%),
          linear-gradient(#f59e0b, #f97316);
        filter: drop-shadow(0 16px 18px rgba(124, 45, 18, 0.24));
        transform: rotate(-8deg);
      }
      .tok-sponsored-pill,
      .tok-miamz-pill,
      .tok-rating-pill {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        border-radius: 999px;
        font-size: 11px;
        font-weight: 950;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        white-space: nowrap;
      }
      .tok-sponsored-pill {
        position: absolute;
        left: 14px;
        top: 14px;
        z-index: 2;
        padding: 8px 12px;
        color: #fff;
        background: linear-gradient(135deg, #ff5a14, #ff8f00);
        box-shadow: 0 12px 24px rgba(255, 106, 26, 0.28);
      }
      .tok-restaurant-body {
        display: grid;
        gap: 10px;
        padding: 16px;
      }
      .tok-card-row {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 12px;
      }
      .tok-card-title {
        margin: 0;
        color: var(--tok-text);
        font-family: var(--tok-font-display);
        font-size: 24px;
        line-height: 1.02;
      }
      .tok-card-meta {
        color: var(--tok-muted);
        font-size: 12px;
        font-weight: 850;
        letter-spacing: 0.16em;
        text-transform: uppercase;
      }
      .tok-rating-pill {
        min-width: 54px;
        justify-content: center;
        padding: 9px 11px;
        color: white;
        background: linear-gradient(135deg, #ff5a14, #ff8f00);
        box-shadow: 0 12px 24px rgba(255, 106, 26, 0.24);
      }
      .tok-miamz-pill {
        width: fit-content;
        padding: 7px 10px;
        color: #047857;
        background: #d1fae5;
        letter-spacing: 0.02em;
        text-transform: none;
      }
      .tok-service-row,
      .tok-slot-row {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      .tok-service-pill,
      .tok-slot-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 32px;
        border-radius: 999px;
        padding: 7px 11px;
        border: 1px solid var(--tok-line);
        background: #f8fafc;
        color: #334155;
        font-size: 12px;
        font-weight: 850;
      }
      .tok-slot-pill {
        min-width: 78px;
        color: #fff;
        border-color: transparent;
        background: linear-gradient(135deg, #059669, #10b981);
        box-shadow: 0 12px 24px rgba(16, 185, 129, 0.18);
      }
      .tok-tool-card {
        display: grid;
        gap: 10px;
        padding: 16px;
        background:
          radial-gradient(circle at 100% 0%, rgba(255, 106, 26, 0.13), transparent 12rem),
          #fff;
      }
      .tok-tool-icon {
        display: grid;
        place-items: center;
        width: 44px;
        height: 44px;
        border-radius: 16px;
        color: #fff;
        background: linear-gradient(135deg, #ff5a14, #ffb000);
        box-shadow: 0 18px 30px rgba(255, 106, 26, 0.24);
        font-weight: 950;
      }
      .tok-tool-card strong {
        color: var(--tok-text);
        font-size: 17px;
      }
      .tok-tool-card p,
      .tok-summary-card p {
        color: var(--tok-muted);
        font-size: 13px;
      }
      .tok-summary-card {
        padding: 16px;
        background:
          linear-gradient(135deg, rgba(255, 247, 237, 0.94), rgba(255, 255, 255, 0.98));
      }
      .tok-confirmation {
        display: grid;
        gap: 10px;
        border: 1px solid rgba(16, 185, 129, 0.22);
        border-radius: 24px;
        padding: 16px;
        background: linear-gradient(135deg, #ecfdf5, #fff);
      }
      .tok-confirmation strong {
        color: #065f46;
        font-size: 18px;
      }
      .tok-empty {
        display: grid;
        gap: 12px;
      }
      .tok-empty p {
        max-width: 58rem;
      }
      .status {
        color: #065f46;
        border-color: rgba(16, 185, 129, 0.18);
        background: #ecfdf5;
      }
      .dot {
        background: #22c55e;
        box-shadow: 0 0 16px rgba(34, 197, 94, 0.42);
      }
      button {
        background: linear-gradient(135deg, #ff5a14, #ff8f00);
      }
      button.secondary {
        color: var(--tok-text);
        border: 1px solid var(--tok-line);
        background: var(--tok-surface);
      }
      details {
        margin-top: 12px;
      }
      summary {
        cursor: pointer;
        color: var(--tok-muted);
        font-size: 13px;
        font-weight: 800;
      }
      pre {
        max-height: 170px;
        margin-top: 8px;
        color: #334155;
        background: #f8fafc;
        border-color: var(--tok-line);
      }
      @media (max-width: 720px) {
        .tok-topbar { min-height: 68px; padding: 8px 14px; }
        .tok-brand img { width: 52px; height: 52px; }
        .tok-brand p { display: none; }
        .tok-nav { display: none; }
        .tok-icon-btn { display: none; }
        .tok-space-btn { height: 42px; padding: 0 14px; font-size: 13px; }
        .floating-menu { top: calc(env(safe-area-inset-top, 0px) + 82px); left: 12px; height: 62px; }
        .shell { padding: 92px 14px 20px; }
        .app-hero { grid-template-columns: 1fr; border-radius: 26px; padding: 20px; }
        .hero-copy { min-height: auto; }
        h1 { font-size: 34px; }
        .grid { grid-template-columns: 1fr; }
        .tok-showcase-grid,
        .tok-restaurant-grid { grid-template-columns: 1fr; }
        .sandbox-head { display: block; }
      }
    </style>
  </head>
  <body>
    <div class="app-frame">
      <nav class="tok-topbar" aria-label="Navigation TOK Connect">
        <div class="tok-brand">
          <img src="https://www.thetok.ch/logo.png" alt="TOK" onerror="this.style.display='none';this.nextElementSibling.style.display='grid';" />
          <span class="tok-brand-fallback">TOK</span>
          <div>
            <strong>TOK Connect</strong>
            <p>Application ChatGPT connectee</p>
          </div>
        </div>
        <div class="tok-nav" aria-hidden="true">
          <span>Explorer</span>
          <span>Actualites</span>
          <span>Anti-gaspi</span>
          <span class="active">TOK Connect</span>
        </div>
        <div class="tok-actions">
          <span class="tok-icon-btn">☾</span>
          <span class="tok-icon-btn">🔔</span>
          <span class="tok-space-btn">▦ Mes espaces</span>
        </div>
      </nav>

      <div class="floating-menu" aria-label="Espace actif">
        <span class="floating-menu-icon">☰</span>
        <span>
          <small>MCP TOK</small>
          <strong>Sandbox ChatGPT</strong>
        </span>
      </div>

      <main class="shell">
        <div class="app-content">
          <section class="app-hero">
            <div class="hero-copy">
              <div class="eyebrow"><span class="dot"></span>TOK Connect Live</div>
              <h1>Parcours ChatGPT dans TOK</h1>
              <p>Visualisez la demande, les modules TOK mobilises et chaque etape avant toute action reelle dans l'application.</p>
              <div class="hero-actions">
                <button id="ask-summary" type="button">Demander un recap</button>
                <button id="fullscreen" class="secondary" type="button">Plein ecran</button>
              </div>
            </div>
            <aside class="hero-panel">
              <div class="status"><span class="dot"></span><span id="status">Connecte</span></div>
              <div class="tok-mascot" aria-hidden="true">
                <span class="tok-mascot-label">
                  <small>Assistant TOK</small>
                  <strong>ChatGPT agit dans une interface TOK securisee.</strong>
                </span>
                <img src="https://www.thetok.ch/chef.png" alt="" />
              </div>
              <div class="metrics">
                <div class="metric"><b id="tool-count">0</b><span>outils disponibles</span></div>
                <div class="metric"><b id="history-count">0</b><span>actions suivies</span></div>
              </div>
              <p>Les paiements, reservations, commandes, publications et generations IA restent bloques jusqu'a confirmation humaine.</p>
            </aside>
          </section>

          <section class="grid">
            <article class="card sandbox-card">
              <h2>Sandbox parcours TOK</h2>
              <div id="sandbox">
                <p>Demandez a ChatGPT de simuler une reservation, une commande, PhotoPro, Studio Marketing ou un autre module TOK pour afficher le parcours ici.</p>
              </div>
            </article>
            <article class="card">
              <h2>Actions visibles</h2>
              <div id="actions" class="action-list"></div>
            </article>
            <aside class="card">
              <h2>Controle</h2>
              <p>Fenetre connectee a ChatGPT Apps. Elle suit les appels MCP sans executer de mutation directe.</p>
              <details>
                <summary>Journal technique</summary>
                <pre id="payload">{}</pre>
              </details>
            </aside>
          </section>
        </div>
      </main>
    </div>
    <script>
      const actionsEl = document.getElementById("actions");
      const sandboxEl = document.getElementById("sandbox");
      const payloadEl = document.getElementById("payload");
      const toolCountEl = document.getElementById("tool-count");
      const historyCountEl = document.getElementById("history-count");
      const statusEl = document.getElementById("status");
      const askSummaryButton = document.getElementById("ask-summary");
      const fullscreenButton = document.getElementById("fullscreen");

      function getState() {
        return window.openai && window.openai.widgetState && Array.isArray(window.openai.widgetState.actions)
          ? window.openai.widgetState.actions
          : [];
      }

      function setState(actions) {
        if (window.openai && typeof window.openai.setWidgetState === "function") {
          window.openai.setWidgetState({ actions: actions.slice(0, 20) });
        }
      }

      function summarizeContent(content) {
        if (!Array.isArray(content)) return "Aucun contenu textuel recu.";
        const text = content
          .map((item) => item && item.text ? String(item.text) : "")
          .filter(Boolean)
          .join(" ");
        return text.length > 170 ? text.slice(0, 170) + "..." : text || "Action terminee.";
      }

      function parseToolPayload(rawOutput, content) {
        const candidates = [];
        if (rawOutput && typeof rawOutput === "object") {
          candidates.push(rawOutput);
          if (rawOutput.structuredContent) candidates.push(rawOutput.structuredContent);
        }
        if (Array.isArray(content)) {
          content.forEach((item) => {
            if (item && typeof item.text === "string") {
              try {
                candidates.push(JSON.parse(item.text));
              } catch (_error) {
                // Plain text tool output is expected for a few legacy MCP calls.
              }
            }
          });
        }
        return candidates.find((candidate) =>
          candidate && typeof candidate === "object" && (
            Array.isArray(candidate.restaurants) ||
            Array.isArray(candidate.slots) ||
            candidate.reservation_preview ||
            candidate.campaign_preview ||
            candidate.estimate ||
            candidate.performance ||
            candidate.autopilot_plan
          )
        ) || {};
      }

      function moduleIcon(moduleId) {
        const icons = {
          studio_marketing: "IA",
          photopro: "4K",
          reservation: "RS",
          commande: "CMD",
          zero_attente: "0A",
          chefs_table: "CT",
          multi_resto: "MR",
          ventes_flash: "VF",
          actualites: "ACT",
          campagnes: "ADS",
          crm: "CRM",
          commercial: "COM",
          admin_supervision: "ADM",
        };
        return icons[moduleId] || "TOK";
      }

      function renderInitialShowcase() {
        return (
          '<div class="tok-empty">' +
          '<p>Demandez a ChatGPT de simuler une reservation, une commande, PhotoPro, Studio Marketing ou un autre module TOK. La fenetre affichera le parcours comme une mini-application TOK.</p>' +
          '<div class="tok-showcase-grid">' +
          renderToolCard({ id: "reservation", title: "Reservation rapide", surface: "client", safe_actions: ["Recherche", "Creneaux", "Confirmation"] }) +
          renderToolCard({ id: "studio_marketing", title: "Studio Marketing", surface: "restaurateur", safe_actions: ["Brief", "Credits", "Preview"] }) +
          '</div>' +
          '</div>'
        );
      }

      function renderToolCard(module) {
        const actions = Array.isArray(module.safe_actions) ? module.safe_actions.slice(0, 3) : [];
        return (
          '<div class="tok-tool-card">' +
          '<div class="tok-card-row">' +
          '<span class="tok-tool-icon">' + escapeHtml(moduleIcon(module.id)) + '</span>' +
          '<span class="tok-miamz-pill">' + escapeHtml(module.surface || "TOK") + '</span>' +
          '</div>' +
          '<strong>' + escapeHtml(module.title || "Module TOK") + '</strong>' +
          '<p>' + escapeHtml((module.entrypoints || []).slice(0, 3).join(" > ") || "Parcours visible dans ChatGPT.") + '</p>' +
          '<div class="tok-service-row">' + actions.map((action) => '<span class="tok-service-pill">' + escapeHtml(action) + '</span>').join("") + '</div>' +
          '</div>'
        );
      }

      function renderModuleCards(modules) {
        if (!Array.isArray(modules) || !modules.length) return "";
        return '<div class="tok-showcase-grid">' + modules.map(renderToolCard).join("") + '</div>';
      }

      function renderRestaurantCards(restaurants) {
        if (!Array.isArray(restaurants) || !restaurants.length) return "";
        return (
          '<div class="tok-restaurant-grid">' +
          restaurants.slice(0, 6).map((restaurant) => {
            const rating = restaurant.rating || restaurant.average_rating || "4.8";
            const cuisine = [restaurant.cuisine_type, restaurant.city].filter(Boolean).join(" · ") || "Restaurant TOK";
            return (
              '<article class="tok-restaurant-card">' +
              '<div class="tok-restaurant-media"><span class="tok-sponsored-pill">TOK Connect</span></div>' +
              '<div class="tok-restaurant-body">' +
              '<div class="tok-card-row">' +
              '<div><p class="tok-card-meta">' + escapeHtml(cuisine) + '</p><h3 class="tok-card-title">' + escapeHtml(restaurant.name || "Restaurant TOK") + '</h3></div>' +
              '<span class="tok-rating-pill">★ ' + escapeHtml(rating) + '</span>' +
              '</div>' +
              '<div class="tok-service-row">' +
              '<span class="tok-service-pill">' + escapeHtml(restaurant.supports_reservation ? "Reservation" : "Decouverte") + '</span>' +
              '<span class="tok-service-pill">Miamz</span>' +
              '</div>' +
              '</div>' +
              '</article>'
            );
          }).join("") +
          '</div>'
        );
      }

      function renderSlots(slots) {
        if (!Array.isArray(slots) || !slots.length) return "";
        return (
          '<div class="tok-summary-card">' +
          '<div class="tok-card-row"><strong>Creneaux disponibles</strong><span class="tok-miamz-pill">Temps reel</span></div>' +
          '<div class="tok-slot-row">' + slots.slice(0, 12).map((slot) => {
            const label = slot.time || slot.starts_at || slot.slot_time || slot.label || "Creneau";
            return '<span class="tok-slot-pill">' + escapeHtml(label) + '</span>';
          }).join("") + '</div>' +
          '</div>'
        );
      }

      function renderToolPayload(payload) {
        if (!payload || typeof payload !== "object") return "";
        if (Array.isArray(payload.restaurants)) return renderRestaurantCards(payload.restaurants);
        if (Array.isArray(payload.slots)) return renderSlots(payload.slots);
        if (payload.reservation_preview) {
          const preview = payload.reservation_preview;
          return (
            '<div class="tok-confirmation">' +
            '<strong>Reservation prete a confirmer</strong>' +
            '<p>' + escapeHtml([preview.date, preview.time, preview.party_size ? preview.party_size + " convive(s)" : ""].filter(Boolean).join(" · ")) + '</p>' +
            '<span class="tok-miamz-pill">Validation client requise</span>' +
            '</div>'
          );
        }
        if (payload.campaign_preview) {
          const preview = payload.campaign_preview;
          return (
            '<div class="tok-summary-card">' +
            '<div class="tok-card-row"><strong>Preview campagne</strong><span class="tok-miamz-pill">Credits TOK</span></div>' +
            '<p>' + escapeHtml(preview.objective || "Campagne sponsorisee en preview.") + '</p>' +
            '<div class="tok-service-row"><span class="tok-service-pill">' + escapeHtml(preview.status || "preview") + '</span><span class="tok-service-pill">Validation humaine</span></div>' +
            '</div>'
          );
        }
        if (payload.estimate) {
          return (
            '<div class="tok-summary-card">' +
            '<div class="tok-card-row"><strong>Coût estime</strong><span class="tok-rating-pill">' + escapeHtml(payload.estimate.credits || 0) + ' cr.</span></div>' +
            '<p>Le solde restaurateur doit couvrir cette action avant toute execution reelle.</p>' +
            '</div>'
          );
        }
        if (payload.autopilot_plan) {
          const plan = payload.autopilot_plan;
          return (
            '<div class="tok-summary-card">' +
            '<div class="tok-card-row"><strong>Autopilot TOK borne</strong><span class="tok-miamz-pill">' + escapeHtml(plan.status || "preview") + '</span></div>' +
            '<p>' + escapeHtml(plan.objective || "Plan prepare sans mutation.") + '</p>' +
            renderModuleCards((plan.actions || []).map((action) => ({ id: action.type, title: action.title, surface: action.execution_mode, safe_actions: ["Preview", "Validation"] }))) +
            '</div>'
          );
        }
        if (payload.performance) {
          return (
            '<div class="tok-summary-card">' +
            '<div class="tok-card-row"><strong>Performance restaurant</strong><span class="tok-miamz-pill">Lecture seule</span></div>' +
            '<p>Signaux agreges charges pour analyse et recommandations sans mutation.</p>' +
            '</div>'
          );
        }
        return "";
      }

      function renderSandbox(sandbox, structured, payload) {
        if (structured && Array.isArray(structured.modules)) {
          sandboxEl.innerHTML =
            '<div class="tok-widget-stack">' +
            '<div class="tok-summary-card"><strong>Outils TOK disponibles</strong><p>' + escapeHtml(structured.answer || "Catalogue des modules interrogeables par ChatGPT.") + '</p></div>' +
            renderModuleCards(structured.modules) +
            '<div class="guardrails">' + (Array.isArray(structured.guardrails) ? structured.guardrails : []).map((guardrail) =>
              '<div class="guardrail">' + escapeHtml(guardrail) + '</div>'
            ).join("") + '</div>' +
            '</div>';
          return;
        }

        const payloadMarkup = renderToolPayload(payload);
        if (payloadMarkup) {
          sandboxEl.innerHTML = '<div class="tok-widget-stack">' + payloadMarkup + '</div>';
          return;
        }

        if (!sandbox || !Array.isArray(sandbox.steps)) {
          sandboxEl.innerHTML = renderInitialShowcase();
          return;
        }
        const modules = Array.isArray(sandbox.modules) ? sandbox.modules : [];
        const guardrails = Array.isArray(sandbox.guardrails) ? sandbox.guardrails : [];
        sandboxEl.innerHTML =
          '<div class="tok-widget-stack">' +
          '<div class="sandbox-head">' +
          '<div><strong>' + escapeHtml(sandbox.title || "Parcours ChatGPT dans TOK") + '</strong>' +
          '<p>' + escapeHtml(sandbox.request || "Demande sandbox") + '</p></div>' +
          '<span class="module-chip">' + escapeHtml(sandbox.actor || "acteur") + '</span>' +
          '</div>' +
          '<div class="module-row">' + modules.map((module) =>
            '<span class="module-chip">' + escapeHtml(module.title || module.id || "Module TOK") + '</span>'
          ).join("") + '</div>' +
          '<div class="step-list">' + sandbox.steps.map((step, index) =>
            '<div class="step">' +
            '<div class="step-index">' + String(index + 1) + '</div>' +
            '<div><small>' + escapeHtml(step.status || "preview") + '</small>' +
            '<strong>' + escapeHtml(step.title || "Etape TOK") + '</strong>' +
            '<p>' + escapeHtml(step.detail || "") + '</p></div>' +
            '</div>'
          ).join("") + '</div>' +
          '<div class="guardrails">' + guardrails.map((guardrail) =>
            '<div class="guardrail">' + escapeHtml(guardrail) + '</div>'
          ).join("") + '</div>' +
          renderModuleCards(modules) +
          '</div>';
      }

      function render(output, metadata) {
        const rawOutput = output || {};
        const structured = rawOutput && rawOutput.structuredContent ? rawOutput.structuredContent : rawOutput;
        const meta = metadata || {};
        const tools = Array.isArray(structured.available_tools) ? structured.available_tools : [];
        const currentAction = structured.current_action || null;
        const content = meta && meta.mcp_tool_result && meta.mcp_tool_result.content
          ? meta.mcp_tool_result.content
          : Array.isArray(rawOutput.content) ? rawOutput.content : [];
        const toolPayload = parseToolPayload(rawOutput, content);
        let actions = getState();

        if (currentAction && currentAction.name) {
          const signature = currentAction.name + ":" + (currentAction.at || "");
          if (!actions.some((entry) => entry.signature === signature)) {
            actions = [{
              signature,
              name: currentAction.name,
              title: currentAction.title || currentAction.name,
              status: currentAction.status || "terminee",
              summary: currentAction.summary || summarizeContent(content),
              at: currentAction.at || new Date().toISOString(),
            }].concat(actions);
            setState(actions);
          }
        }

        const visibleActions = actions.length ? actions : tools.slice(0, 8).map((tool, index) => ({
          signature: tool.name || String(index),
          name: tool.name || "outil_tok",
          title: tool.title || tool.name || "Outil TOK Connect",
          status: "pret",
          summary: tool.description || "Outil disponible dans TOK Connect.",
          at: "",
        }));

        actionsEl.innerHTML = visibleActions.map((action, index) =>
          '<div class="action">' +
          '<div class="badge">' + String(index + 1) + '</div>' +
          '<div><strong>' + escapeHtml(action.title) + '</strong>' +
          '<span>' + escapeHtml(action.status + " - " + action.summary) + '</span></div>' +
          '</div>'
        ).join("");

        toolCountEl.textContent = String(tools.length);
        historyCountEl.textContent = String(actions.length);
        statusEl.textContent = actions.length ? "Actions suivies" : "Pret";
        renderSandbox(structured.sandbox || null, structured, toolPayload);
        payloadEl.textContent = JSON.stringify({ structured, history: actions.slice(0, 5) }, null, 2);

        if (window.openai && typeof window.openai.notifyIntrinsicHeight === "function") {
          window.openai.notifyIntrinsicHeight();
        }
      }

      function escapeHtml(value) {
        return String(value)
          .replaceAll("&", "&amp;")
          .replaceAll("<", "&lt;")
          .replaceAll(">", "&gt;")
          .replaceAll('"', "&quot;")
          .replaceAll("'", "&#039;");
      }

      askSummaryButton.addEventListener("click", () => {
        if (window.openai && typeof window.openai.sendFollowUpMessage === "function") {
          window.openai.sendFollowUpMessage({
            prompt: "Resume les actions TOK Connect affichees dans la fenetre et indique la prochaine action utile.",
            scrollToBottom: true,
          });
        }
      });

      fullscreenButton.addEventListener("click", () => {
        if (window.openai && typeof window.openai.requestDisplayMode === "function") {
          window.openai.requestDisplayMode({ mode: "fullscreen" });
        }
      });

      render(window.openai && window.openai.toolOutput, window.openai && window.openai.toolResponseMetadata);
      window.addEventListener("openai:set_globals", (event) => {
        const globals = event.detail && event.detail.globals ? event.detail.globals : {};
        render(globals.toolOutput || (window.openai && window.openai.toolOutput), globals.toolResponseMetadata || (window.openai && window.openai.toolResponseMetadata));
      }, { passive: true });
    </script>
  </body>
</html>`;

type TokConnectAppActor = "client" | "restaurateur" | "admin" | "commercial" | "courier" | "support" | "chatgpt";

type TokConnectAppModule = {
  id: string;
  title: string;
  surface: TokConnectAppActor | "platform";
  category: "ai" | "commerce" | "reservation" | "marketing" | "operations" | "admin" | "sales";
  route: string;
  entrypoints: string[];
  canQuery: boolean;
  canSimulate: boolean;
  mutationAllowed: boolean;
  requiresHumanConfirmation: boolean;
  requiresPayment: boolean;
  requiresCredits: boolean;
  relatedMcpTools: string[];
  safeActions: string[];
  guardrails: string[];
};

const TOK_CONNECT_APP_MODULES: TokConnectAppModule[] = [
  {
    id: "studio_marketing",
    title: "Studio Marketing",
    surface: "restaurateur",
    category: "ai",
    route: "/dashboard/photos",
    entrypoints: ["Dashboard restaurateur", "Marketing", "Studio Marketing"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: true,
    relatedMcpTools: ["estimate_campaign_credit_cost", "generate_campaign_preview"],
    safeActions: ["Lire les capacites", "Simuler le brief", "Verifier les credits requis", "Preparer une preview sans publier"],
    guardrails: ["Aucune generation IA reelle sans credit disponible et validation restaurateur.", "Aucun post sponsorise n'est publie par le MCP sans confirmation humaine."],
  },
  {
    id: "photopro",
    title: "PhotoPro",
    surface: "restaurateur",
    category: "ai",
    route: "/dashboard/photos",
    entrypoints: ["Dashboard restaurateur", "Marketing", "PhotoPro"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: true,
    relatedMcpTools: ["estimate_campaign_credit_cost"],
    safeActions: ["Lire les contraintes image", "Simuler angle et style", "Verifier les credits requis", "Preparer le parcours de retouche"],
    guardrails: ["La photo source reste sous controle du restaurateur.", "Le MCP ne finalise pas une retouche payante sans appel explicite de l'outil applicatif autorise."],
  },
  {
    id: "reservation",
    title: "Reservation classique",
    surface: "client",
    category: "reservation",
    route: "/restaurant/:id",
    entrypoints: ["Fiche restaurant", "Bouton reserver", "Mes reservations"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants", "get_real_time_availability", "prepare_reservation"],
    safeActions: ["Chercher un restaurant", "Lire disponibilites", "Preparer un recapitulatif confirmable"],
    guardrails: ["Les horaires proposes doivent venir du pilotage de service et de la disponibilite temps reel.", "La creation finale reste bloquee jusqu'a confirmation client."],
  },
  {
    id: "commande",
    title: "Commande et panier",
    surface: "client",
    category: "commerce",
    route: "/panier",
    entrypoints: ["Fiche restaurant", "Panier", "Checkout", "Confirmation commande"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: true,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants"],
    safeActions: ["Simuler panier", "Verifier horaire retrait/livraison", "Montrer decision Stripe ou zero franc"],
    guardrails: ["Le montant est toujours recalcule cote serveur.", "Si le total est a 0 CHF apres Miamz/Tok One, Stripe ne doit pas etre appele."],
  },
  {
    id: "zero_attente",
    title: "Zero Attente",
    surface: "client",
    category: "commerce",
    route: "/zero-attente",
    entrypoints: ["Zero Attente", "Fiche restaurant", "Panier"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: true,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants", "get_real_time_availability"],
    safeActions: ["Lire service disponible", "Verifier creneau", "Preparer paiement ou confirmation zero franc"],
    guardrails: ["Aucun creneau n'est affiche s'il n'est pas ouvert dans le pilotage de service.", "Paiement client via Stripe uniquement si solde final positif."],
  },
  {
    id: "chefs_table",
    title: "Table du Chef",
    surface: "client",
    category: "reservation",
    route: "/chefs-table",
    entrypoints: ["Table du Chef", "Panier", "Paiement"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: true,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants", "prepare_reservation"],
    safeActions: ["Verifier drop", "Verifier convives", "Preparer recapitulatif paiement"],
    guardrails: ["Reservation definitive seulement apres paiement valide si paiement requis.", "Idempotence obligatoire sur la creation de booking."],
  },
  {
    id: "multi_resto",
    title: "Multi-resto",
    surface: "client",
    category: "commerce",
    route: "/multi-restaurant",
    entrypoints: ["Multi-resto", "Panier groupe", "Checkout"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: true,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants"],
    safeActions: ["Comparer restaurants", "Verifier horaires compatibles", "Preparer panier multi-etablissements"],
    guardrails: ["Chaque restaurant doit etre ouvert sur son propre service.", "Les frais, reductions et Miamz sont recalcules serveur."],
  },
  {
    id: "ventes_flash",
    title: "Ventes Flash",
    surface: "restaurateur",
    category: "marketing",
    route: "/dashboard/ventes-flash",
    entrypoints: ["Dashboard restaurateur", "Ventes flash"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: true,
    relatedMcpTools: ["estimate_campaign_credit_cost", "generate_campaign_preview"],
    safeActions: ["Simuler offre", "Verifier stock et validite", "Preparer preview de campagne"],
    guardrails: ["Aucune offre client n'est publiee sans validation restaurant.", "Le stock et la periode doivent etre controles cote serveur."],
  },
  {
    id: "actualites",
    title: "Actualites",
    surface: "restaurateur",
    category: "marketing",
    route: "/dashboard/actualites",
    entrypoints: ["Dashboard restaurateur", "Actualites"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: true,
    relatedMcpTools: ["generate_campaign_preview"],
    safeActions: ["Analyser post", "Proposer tags/metadata", "Preparer sponsorisation"],
    guardrails: ["Les droits d'abonnement limitent l'acces aux posts.", "Les images et textes restent moderables avant publication."],
  },
  {
    id: "campagnes",
    title: "Campagnes sponsorisees",
    surface: "restaurateur",
    category: "marketing",
    route: "/dashboard/campagnes",
    entrypoints: ["Dashboard restaurateur", "Campagnes"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: true,
    relatedMcpTools: ["estimate_campaign_credit_cost", "generate_campaign_preview", "build_autopilot_plan"],
    safeActions: ["Estimer cout credit", "Preparer audience", "Generer plan non autonome"],
    guardrails: ["Les campagnes se paient uniquement en credits TOK.", "Si le solde est insuffisant, proposer Recharger mes credits."],
  },
  {
    id: "crm",
    title: "CRM clients",
    surface: "restaurateur",
    category: "marketing",
    route: "/dashboard/crm-clients",
    entrypoints: ["Dashboard restaurateur", "CRM clients"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: false,
    relatedMcpTools: ["get_restaurant_performance"],
    safeActions: ["Lire segmentation", "Proposer relance", "Verifier droits abonnement"],
    guardrails: ["CRM reserve aux abonnements Premium et Elite.", "Aucun message client n'est envoye sans consentement et validation."],
  },
  {
    id: "commercial",
    title: "Espace commercial",
    surface: "commercial",
    category: "sales",
    route: "/commercial",
    entrypoints: ["Espace commercial", "Prospection", "Comptabilite"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: false,
    relatedMcpTools: ["search_restaurants"],
    safeActions: ["Chercher prospect", "Simuler suivi", "Afficher commission estimee"],
    guardrails: ["Le commercial attitre et les notes terrain restent rattaches a l'utilisateur connecte.", "Les commissions doivent rester auditables."],
  },
  {
    id: "admin_supervision",
    title: "Supervision admin",
    surface: "admin",
    category: "admin",
    route: "/admin",
    entrypoints: ["Dashboard admin", "Commandes/Reservations", "Comptabilite"],
    canQuery: true,
    canSimulate: true,
    mutationAllowed: false,
    requiresHumanConfirmation: true,
    requiresPayment: false,
    requiresCredits: false,
    relatedMcpTools: ["get_restaurant_performance"],
    safeActions: ["Lire etat", "Preparer audit", "Lister controles de securite"],
    guardrails: ["Les mutations admin restent limitees aux comptes autorises.", "Tout remboursement ou paiement doit etre journalise et idempotent."],
  },
];

const TOK_CONNECT_APP_QUERY_TOOL: TokConnectMcpTool = {
  name: "query_application_tool",
  title: "Interroger les outils TOK",
  description: "Use this to answer questions about TOK application modules such as Studio Marketing, PhotoPro, reservations, orders, flash sales, CRM, commercial and admin without mutating data.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    properties: {
      tool_id: { type: "string", description: "Optional TOK module id, for example studio_marketing, photopro, reservation or commande." },
      question: { type: "string", description: "Question about a TOK tool or journey." },
      actor: {
        type: "string",
        enum: ["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"],
        default: "chatgpt",
      },
      mode: {
        type: "string",
        enum: ["catalog", "capabilities", "guardrails", "route", "pricing", "status"],
        default: "catalog",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      modules: { type: "array" },
      answer: { type: "string" },
      guardrails: { type: "array" },
      next_sandbox_action: { type: "object" },
    },
    required: ["modules", "answer", "guardrails", "next_sandbox_action"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
};

const TOK_CONNECT_APP_SANDBOX_TOOL: TokConnectMcpTool = {
  name: "open_application_sandbox",
  title: "Ouvrir la sandbox parcours TOK",
  description: "Use this when the user asks ChatGPT to show its journey inside TOK for any app flow: Studio Marketing, PhotoPro, reservation, order, checkout, Zero Attente, Multi-resto, news, campaign or commercial follow-up.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    properties: {
      request: { type: "string", description: "Natural language request to simulate through TOK." },
      actor: {
        type: "string",
        enum: ["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"],
        default: "chatgpt",
      },
      modules: {
        type: "array",
        items: { type: "string" },
        description: "Optional module ids to force in the visible journey.",
      },
      risk_mode: {
        type: "string",
        enum: ["safe_preview", "requires_confirmation"],
        default: "safe_preview",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      sandbox: { type: "object" },
      available_tools: { type: "array" },
      current_action: { type: "object" },
    },
    required: ["sandbox", "available_tools", "current_action"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  _meta: {
    ui: {
      resourceUri: ACTION_WINDOW_RESOURCE_URI,
      visibility: ["model", "app"],
    },
    "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI,
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "Preparation du parcours TOK...",
    "openai/toolInvocation/invoked": "Parcours TOK pret",
  },
};

const TOK_CONNECT_ACTION_WINDOW_TOOL: TokConnectMcpTool = {
  name: "open_action_window",
  title: "Ouvrir la fenetre d'actions TOK",
  description: "Use this when the user asks to open a TOK Connect window that shows ChatGPT actions, available tools and action results.",
  requiredScopes: [],
  inputSchema: {
    type: "object",
    properties: {
      focus: {
        type: "string",
        enum: ["overview", "last_action", "tools"],
        default: "overview",
      },
    },
    additionalProperties: false,
  },
  outputSchema: {
    type: "object",
    properties: {
      current_action: { type: "object" },
      available_tools: { type: "array" },
      focus: { type: "string" },
    },
    required: ["current_action", "available_tools", "focus"],
    additionalProperties: false,
  },
  annotations: {
    readOnlyHint: true,
    destructiveHint: false,
    openWorldHint: false,
    idempotentHint: true,
  },
  _meta: {
    ui: {
      resourceUri: ACTION_WINDOW_RESOURCE_URI,
      visibility: ["model", "app"],
    },
    "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI,
    "openai/widgetAccessible": true,
    "openai/toolInvocation/invoking": "Ouverture de la fenetre TOK...",
    "openai/toolInvocation/invoked": "Fenetre TOK ouverte",
  },
};

const MCP_TOOLS: TokConnectMcpTool[] = [
  ...SAFE_TOK_CONNECT_MCP_TOOLS,
  TOK_CONNECT_APP_QUERY_TOOL,
  TOK_CONNECT_APP_SANDBOX_TOOL,
  TOK_CONNECT_ACTION_WINDOW_TOOL,
];

const MCP_RESOURCES = [
  {
    uri: ACTION_WINDOW_RESOURCE_URI,
    name: "TOK Connect action window",
    title: "Actions TOK Connect",
    description: "ChatGPT widget that shows TOK Connect actions and results.",
    mimeType: "text/html;profile=mcp-app",
    _meta: {
      ui: {
        domain: TOK_CONNECT_PUBLIC_ORIGIN,
        prefersBorder: true,
        csp: {
          connectDomains: [],
          resourceDomains: WIDGET_RESOURCE_DOMAINS,
        },
      },
      "openai/widgetDescription": "Console visuelle des actions TOK Connect appelees depuis ChatGPT.",
      "openai/widgetPrefersBorder": true,
      "openai/widgetCSP": {
        connect_domains: [],
        resource_domains: WIDGET_RESOURCE_DOMAINS,
      },
    },
  },
  {
    uri: "tok://restaurants",
    name: "TOK restaurants",
    description: "Restaurant discovery catalog exposed through TOK Connect.",
    mimeType: "application/json",
  },
  {
    uri: "tok://availability/{restaurant_id}",
    name: "Restaurant availability",
    description: "Real-time reservation slot availability for an authorized restaurant.",
    mimeType: "application/json",
  },
  {
    uri: "tok://campaign-preview/{restaurant_id}",
    name: "Campaign preview",
    description: "Human-approved campaign preview context.",
    mimeType: "application/json",
  },
  {
    uri: "tok://autopilot-runs/{restaurant_id}",
    name: "Bounded Autopilot runs",
    description: "Autopilot plans, approval status and execution policy snapshots.",
    mimeType: "application/json",
  },
];

const MCP_PROMPTS = [
  {
    name: "prepare_guest_reservation",
    description: "Turn a guest request into a confirmation-ready TOK reservation preview.",
    arguments: [
      { name: "city", required: true },
      { name: "party_size", required: true },
      { name: "date", required: true },
      { name: "time", required: false },
    ],
  },
  {
    name: "restaurant_campaign_preview",
    description: "Prepare a campaign proposal that still requires restaurant validation.",
    arguments: [
      { name: "restaurant_id", required: true },
      { name: "objective", required: true },
      { name: "budget_chf", required: false },
    ],
  },
  {
    name: "build_bounded_autopilot_plan",
    description: "Prepare a multi-step restaurant Autopilot plan that remains blocked until human approval.",
    arguments: [
      { name: "restaurant_id", required: true },
      { name: "objective", required: true },
      { name: "budget_chf", required: false },
      { name: "requested_actions", required: false },
    ],
  },
];

function rpcResult(id: McpJsonRpcRequest["id"], result: Record<string, unknown>) {
  return { jsonrpc: "2.0", id: id ?? null, result };
}

function rpcError(
  id: McpJsonRpcRequest["id"],
  code: number,
  message: string,
  data?: Record<string, unknown>,
) {
  return { jsonrpc: "2.0", id: id ?? null, error: { code, message, ...(data ? { data } : {}) } };
}

function hasBearerToken(req: Request) {
  return /^Bearer\s+\S+/i.test(req.headers.get("Authorization") || "");
}

async function authorizeMcp(req: Request, requiredScopes: string[] = []) {
  const context = await authenticateTokConnectToken(req, requiredScopes);
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect");
  await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-mcp");
  const limiter = createRateLimiter(context.adminClient, "tok-connect-mcp");
  const rateLimitSubject = context.authMode === "supabase_oauth"
    ? `user:${context.userId}:client:${context.oauthClientId}`
    : `partner:${context.partnerId}`;
  await limiter.consume(rateLimitSubject, { maxRequests: 300, windowSeconds: 60 });
  return context;
}

function toolDefinition(tool: TokConnectMcpTool) {
  const securitySchemes = tool.requiredScopes.length > 0
    ? [{ type: "oauth2", scopes: TOK_CONNECT_OIDC_SCOPES }]
    : [{ type: "noauth" }];
  const toolMeta = tool._meta || {};
  const toolUiMeta = toolMeta.ui && typeof toolMeta.ui === "object" && !Array.isArray(toolMeta.ui)
    ? toolMeta.ui as Record<string, unknown>
    : {};
  const resourceUri = typeof toolUiMeta.resourceUri === "string" ? toolUiMeta.resourceUri : null;

  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
    securitySchemes,
    ...(tool.annotations ? { annotations: tool.annotations } : {}),
    _meta: {
      securitySchemes,
      ...(resourceUri
        ? {
          ui: { visibility: ["model", "app"], ...toolUiMeta },
          "openai/outputTemplate": resourceUri,
          "openai/widgetAccessible": true,
        }
        : {}),
      ...toolMeta,
    },
  };
}

function validateToolArguments(tool: TokConnectMcpTool, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new McpProtocolError(-32602, `invalid_tool_arguments:${tool.name}`, 200);
  }

  const args = value as Record<string, unknown>;
  const schema = tool.inputSchema;
  const properties = schema.properties && typeof schema.properties === "object"
    ? schema.properties as Record<string, Record<string, unknown>>
    : {};
  const required = Array.isArray(schema.required) ? schema.required.map(String) : [];

  for (const key of required) {
    if (args[key] === undefined || args[key] === null || args[key] === "") {
      throw new McpProtocolError(-32602, `missing_required_argument:${key}`, 200);
    }
  }
  if (schema.additionalProperties === false) {
    const unexpected = Object.keys(args).find((key) => !Object.prototype.hasOwnProperty.call(properties, key));
    if (unexpected) throw new McpProtocolError(-32602, `unexpected_argument:${unexpected}`, 200);
  }

  for (const [key, input] of Object.entries(args)) {
    if (input === undefined || input === null) continue;
    const property = properties[key];
    if (!property) continue;
    const type = property.type;
    const invalidType =
      (type === "string" && typeof input !== "string") ||
      (type === "number" && (typeof input !== "number" || !Number.isFinite(input))) ||
      (type === "integer" && (typeof input !== "number" || !Number.isInteger(input))) ||
      (type === "boolean" && typeof input !== "boolean") ||
      (type === "array" && !Array.isArray(input)) ||
      (type === "object" && (typeof input !== "object" || Array.isArray(input)));
    if (invalidType) throw new McpProtocolError(-32602, `invalid_argument_type:${key}`, 200);
    if (Array.isArray(property.enum) && !property.enum.includes(input)) {
      throw new McpProtocolError(-32602, `invalid_argument_value:${key}`, 200);
    }
    if (typeof input === "number") {
      if (typeof property.minimum === "number" && input < property.minimum) {
        throw new McpProtocolError(-32602, `argument_below_minimum:${key}`, 200);
      }
      if (typeof property.maximum === "number" && input > property.maximum) {
        throw new McpProtocolError(-32602, `argument_above_maximum:${key}`, 200);
      }
    }
    if (typeof input === "string") {
      if (typeof property.minLength === "number" && input.length < property.minLength) {
        throw new McpProtocolError(-32602, `argument_too_short:${key}`, 200);
      }
      if (typeof property.maxLength === "number" && input.length > property.maxLength) {
        throw new McpProtocolError(-32602, `argument_too_long:${key}`, 200);
      }
      if (typeof property.pattern === "string" && !(new RegExp(property.pattern)).test(input)) {
        throw new McpProtocolError(-32602, `invalid_argument_format:${key}`, 200);
      }
      if (property.format === "uuid" && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input)) {
        throw new McpProtocolError(-32602, `invalid_uuid:${key}`, 200);
      }
      if (property.format === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(input)) {
        throw new McpProtocolError(-32602, `invalid_date:${key}`, 200);
      }
      if (property.format === "date") {
        const parsedDate = new Date(`${input}T00:00:00.000Z`);
        if (Number.isNaN(parsedDate.getTime()) || parsedDate.toISOString().slice(0, 10) !== input) {
          throw new McpProtocolError(-32602, `invalid_date:${key}`, 200);
        }
      }
    }
    if (Array.isArray(input)) {
      if (typeof property.minItems === "number" && input.length < property.minItems) {
        throw new McpProtocolError(-32602, `argument_has_too_few_items:${key}`, 200);
      }
      if (typeof property.maxItems === "number" && input.length > property.maxItems) {
        throw new McpProtocolError(-32602, `argument_has_too_many_items:${key}`, 200);
      }
      const itemSchema = property.items && typeof property.items === "object"
        ? property.items as Record<string, unknown>
        : null;
      if (itemSchema) {
        for (const item of input) {
          if (itemSchema.type === "string" && typeof item !== "string") {
            throw new McpProtocolError(-32602, `invalid_array_item_type:${key}`, 200);
          }
          if (Array.isArray(itemSchema.enum) && !itemSchema.enum.includes(item)) {
            throw new McpProtocolError(-32602, `invalid_array_item_value:${key}`, 200);
          }
        }
      }
    }
  }

  return args;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

async function getToolIdempotency(toolName: string, args: Record<string, unknown>) {
  const provided = typeof args.idempotency_key === "string" ? args.idempotency_key.trim() : "";
  const input = { ...args };
  delete input.idempotency_key;
  const requestHash = await sha256Base64Url(stableJson(input));
  return {
    idempotencyKey: provided || `mcp_${toolName}_${requestHash}`,
    requestHash,
  };
}

function assertIdempotentAgentRunMatches(run: Record<string, unknown>, requestHash: string) {
  const runInput = run.input && typeof run.input === "object" && !Array.isArray(run.input)
    ? run.input as Record<string, unknown>
    : {};
  const existingHash = typeof runInput.request_hash === "string" ? runInput.request_hash : null;
  if (existingHash && existingHash !== requestHash) {
    throw new HttpError(409, "idempotency_key_reused_with_different_arguments");
  }
}

async function findIdempotentAgentRun(input: {
  context: TokConnectTokenContext;
  restaurantId: string;
  toolName: "generate_campaign_preview" | "build_autopilot_plan";
  idempotencyKey: string;
  actorId: string;
}) {
  const { data, error } = await input.context.adminClient
    .from("tok_connect_agent_runs")
    .select("id, status, mode, approval_required, risk_level, expires_at, input, output")
    .eq("restaurant_id", input.restaurantId)
    .eq("tool_name", input.toolName)
    .contains("input", {
      idempotency_key: input.idempotencyKey,
      actor_id: input.actorId,
    })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new HttpError(500, error.message);
  return data;
}

function normalizeText(value: unknown) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function toAppActor(value: unknown): TokConnectAppActor {
  const normalized = normalizeText(value);
  if (["client", "restaurateur", "admin", "commercial", "courier", "support", "chatgpt"].includes(normalized)) {
    return normalized as TokConnectAppActor;
  }
  return "chatgpt";
}

const APP_MODULE_KEYWORDS: Record<string, string[]> = {
  studio_marketing: ["studio", "marketing", "affiche", "flyer", "visuel", "banniere", "campagne image"],
  photopro: ["photopro", "photo", "retouche", "image", "angle", "seed", "style"],
  reservation: ["reservation", "reserver", "table", "disponibilite", "convive", "creneau"],
  commande: ["commande", "panier", "emporter", "livraison", "payer", "checkout", "stripe", "miamz"],
  zero_attente: ["zero attente", "sans attente", "pret", "retrait rapide"],
  chefs_table: ["chef", "table du chef", "drop", "menu special"],
  multi_resto: ["multi", "multi-resto", "multi restaurant", "groupe", "plusieurs restaurants"],
  ventes_flash: ["vente flash", "flash", "offre limitee", "promo"],
  actualites: ["actualite", "post", "fil", "news", "hashtags", "metadata"],
  campagnes: ["campagne", "sponsorise", "budget", "audience", "credit"],
  crm: ["crm", "client", "relance", "segmentation"],
  commercial: ["commercial", "prospection", "signature", "commission", "relance terrain"],
  admin_supervision: ["admin", "remboursement", "audit", "supervision", "comptabilite"],
};

function mapAppModule(module: TokConnectAppModule) {
  return {
    id: module.id,
    title: module.title,
    surface: module.surface,
    category: module.category,
    route: module.route,
    entrypoints: module.entrypoints,
    can_query: module.canQuery,
    can_simulate: module.canSimulate,
    mutation_allowed: module.mutationAllowed,
    requires_human_confirmation: module.requiresHumanConfirmation,
    requires_payment: module.requiresPayment,
    requires_credits: module.requiresCredits,
    related_mcp_tools: module.relatedMcpTools,
    safe_actions: module.safeActions,
    guardrails: module.guardrails,
  };
}

function selectApplicationModules(args: Record<string, unknown>) {
  const actor = toAppActor(args.actor);
  const requestedIds = Array.isArray(args.modules)
    ? args.modules.map((id) => normalizeText(id).replace(/[^a-z0-9_]/g, "_"))
    : [];
  const singleRequestedId = normalizeText(args.tool_id).replace(/[^a-z0-9_]/g, "_");
  if (singleRequestedId) requestedIds.push(singleRequestedId);

  const explicitModules = TOK_CONNECT_APP_MODULES.filter((module) => requestedIds.includes(module.id));
  if (explicitModules.length) return explicitModules;

  const question = `${normalizeText(args.request)} ${normalizeText(args.question)} ${normalizeText(args.mode)}`;
  const ranked = TOK_CONNECT_APP_MODULES
    .map((module) => {
      const keywords = APP_MODULE_KEYWORDS[module.id] || [];
      const keywordScore = keywords.reduce((score, keyword) => score + (question.includes(normalizeText(keyword)) ? 4 : 0), 0);
      const actorScore = module.surface === actor || actor === "chatgpt" ? 1 : 0;
      return { module, score: keywordScore + actorScore };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.module);

  if (ranked.length) return ranked.slice(0, 5);
  if (actor !== "chatgpt") {
    const actorModules = TOK_CONNECT_APP_MODULES.filter((module) => module.surface === actor);
    if (actorModules.length) return actorModules.slice(0, 5);
  }
  return TOK_CONNECT_APP_MODULES.slice(0, 8);
}

function collectGuardrails(modules: TokConnectAppModule[]) {
  return Array.from(new Set([
    "Sandbox uniquement: aucune mutation, generation payante, paiement, commande ou reservation definitive n'est executee par cette fenetre.",
    "Les actions reelles passent par les Edge Functions existantes, avec auth, RLS, idempotence et confirmation utilisateur.",
    ...modules.flatMap((module) => module.guardrails),
  ])).slice(0, 12);
}

function buildApplicationToolQueryResult(args: Record<string, unknown> = {}) {
  const modules = selectApplicationModules(args);
  const mode = typeof args.mode === "string" ? args.mode : "catalog";
  const question = typeof args.question === "string" && args.question.trim()
    ? args.question.trim()
    : "Quels outils TOK peuvent etre interroges depuis ChatGPT ?";
  const mappedModules = modules.map(mapAppModule);
  const guardrails = collectGuardrails(modules);
  const answer = [
    `Question: ${question}`,
    `Mode: ${mode}`,
    `Modules trouves: ${modules.map((module) => module.title).join(", ")}.`,
    "ChatGPT peut lire les capacites, simuler le parcours et ouvrir une sandbox visible. Les operations payantes ou mutantes restent bloquees jusqu'a confirmation via les flux TOK existants.",
  ].join(" ");

  return {
    structuredContent: {
      modules: mappedModules,
      answer,
      guardrails,
      next_sandbox_action: {
        tool_name: TOK_CONNECT_APP_SANDBOX_TOOL.name,
        suggested_arguments: {
          request: question,
          actor: toAppActor(args.actor),
          modules: modules.map((module) => module.id),
          risk_mode: "safe_preview",
        },
      },
    },
    content: [{
      type: "text",
      text: answer,
    }],
  };
}

function buildApplicationJourneySteps(request: string, actor: TokConnectAppActor, modules: TokConnectAppModule[]) {
  const steps: Array<Record<string, unknown>> = [
    {
      status: "done",
      title: "Comprendre l'intention",
      detail: `ChatGPT analyse la demande (${request || "demande vide"}) pour identifier l'acteur ${actor} et les modules TOK concernes.`,
    },
    {
      status: "done",
      title: "Selectionner les modules TOK",
      detail: `Modules retenus: ${modules.map((module) => module.title).join(", ")}.`,
    },
  ];

  modules.forEach((module) => {
    steps.push({
      status: "preview",
      title: `Ouvrir ${module.title}`,
      detail: `Point d'entree: ${module.route}. Actions sandbox: ${module.safeActions.join(", ")}.`,
      module_id: module.id,
    });
  });

  if (modules.some((module) => module.requiresCredits)) {
    steps.push({
      status: "blocked_until_confirmed",
      title: "Verifier le solde de credits TOK",
      detail: "Si le solde restaurateur est insuffisant, le parcours doit proposer Recharger mes credits ou upgrader l'abonnement avant toute action payante.",
    });
  }

  if (modules.some((module) => module.requiresPayment)) {
    steps.push({
      status: "blocked_until_confirmed",
      title: "Controler le paiement client",
      detail: "Stripe ne doit etre appele que si le total serveur est strictement positif. Un total a 0 CHF se confirme sans redirection Stripe.",
    });
  }

  if (modules.some((module) => module.category === "reservation" || module.id === "commande" || module.id === "zero_attente" || module.id === "multi_resto")) {
    steps.push({
      status: "guarded",
      title: "Verifier horaires et disponibilites",
      detail: "Les creneaux affiches doivent venir du pilotage de service du restaurant et de la disponibilite temps reel, jamais d'une grille generique.",
    });
  }

  steps.push({
    status: "waiting_for_user",
    title: "Demander confirmation humaine",
    detail: "La sandbox s'arrete avant toute reservation definitive, commande, paiement, publication, generation IA consommatrice de credits ou mutation admin.",
  });

  return steps;
}

function buildApplicationSandboxResult(args: Record<string, unknown> = {}) {
  const request = typeof args.request === "string" && args.request.trim()
    ? args.request.trim()
    : "Simuler un parcours TOK depuis ChatGPT.";
  const actor = toAppActor(args.actor);
  const modules = selectApplicationModules({ ...args, request });
  const guardrails = collectGuardrails(modules);
  const steps = buildApplicationJourneySteps(request, actor, modules);
  const availableTools = MCP_TOOLS
    .filter((tool) => tool.name !== TOK_CONNECT_ACTION_WINDOW_TOOL.name)
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      required_scopes: tool.requiredScopes,
    }));
  const at = new Date().toISOString();

  return {
    structuredContent: {
      current_action: {
        name: TOK_CONNECT_APP_SANDBOX_TOOL.name,
        title: TOK_CONNECT_APP_SANDBOX_TOOL.title,
        status: "sandbox_ready",
        summary: `Parcours prepare pour ${modules.map((module) => module.title).join(", ")}.`,
        at,
      },
      available_tools: availableTools,
      sandbox: {
        title: "Parcours ChatGPT visible dans TOK",
        request,
        actor,
        risk_mode: typeof args.risk_mode === "string" ? args.risk_mode : "safe_preview",
        modules: modules.map(mapAppModule),
        steps,
        guardrails,
        mutation_allowed: false,
        opened_at: at,
      },
    },
    content: [{
      type: "text",
      text: `Sandbox TOK ouverte pour: ${request}. Modules: ${modules.map((module) => module.title).join(", ")}. Aucune action reelle n'a ete executee.`,
    }],
    _meta: {
      ui: {
        resourceUri: ACTION_WINDOW_RESOURCE_URI,
      },
      "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI,
    },
  };
}

function buildActionWindowResult(args: Record<string, unknown> = {}) {
  const focus = typeof args.focus === "string" ? args.focus : "overview";
  const availableTools = MCP_TOOLS
    .filter((tool) => tool.name !== TOK_CONNECT_ACTION_WINDOW_TOOL.name)
    .map((tool) => ({
      name: tool.name,
      title: tool.title,
      description: tool.description,
      required_scopes: tool.requiredScopes,
    }));

  return {
    structuredContent: {
      focus,
      current_action: {
        name: TOK_CONNECT_ACTION_WINDOW_TOOL.name,
        title: TOK_CONNECT_ACTION_WINDOW_TOOL.title,
        status: "opened",
        summary: "Fenetre d'actions TOK Connect ouverte dans ChatGPT.",
        at: new Date().toISOString(),
      },
      available_tools: availableTools,
    },
    content: [{
      type: "text",
      text: "Fenetre TOK Connect ouverte. Elle affiche les outils disponibles, les actions suivies et permet de demander un recapitulatif.",
    }],
    _meta: {
      ui: {
        resourceUri: ACTION_WINDOW_RESOURCE_URI,
      },
      "openai/outputTemplate": ACTION_WINDOW_RESOURCE_URI,
    },
  };
}

async function callTool(
  context: TokConnectTokenContext,
  name: string,
  args: Record<string, unknown>,
) {
  const restaurantId = typeof args.restaurant_id === "string" ? args.restaurant_id : "";
  if (context.environment === "sandbox") {
    const sandboxResult = getTokConnectSandboxMcpToolResult(name, args);
    if (sandboxResult) return sandboxResult;
  }

  switch (name) {
    case "search_restaurants": {
      const limit = Math.min(Number(args.limit || 10), 25);
      if (context.environment === "sandbox") {
        return buildTokConnectMcpJsonResult({
          restaurants: [
            { id: "00000000-0000-4000-8000-000000000101", name: "TOK Sandbox Brasserie", city: args.city || "Genève" },
          ],
        });
      }

      let query = context.adminClient
        .from("restaurants")
        .select("id, name, cuisine_type, city, rating, supports_reservation")
        .eq("is_active", true)
        .order("rating", { ascending: false })
        .limit(limit);

      if (typeof args.city === "string" && args.city.trim()) {
        query = query.ilike("city", `%${args.city.trim()}%`);
      }
      if (typeof args.cuisine === "string" && args.cuisine.trim()) {
        query = query.ilike("cuisine_type", `%${args.cuisine.trim()}%`);
      }
      if (typeof args.query === "string" && args.query.trim()) {
        const safeQuery = args.query.trim().replace(/[%_,().]/g, " ").slice(0, 120);
        query = query.ilike("name", `%${safeQuery}%`);
      }

      const { data, error } = await query;

      if (error) throw new HttpError(500, error.message);
      return buildTokConnectMcpJsonResult({ restaurants: data || [] });
    }

    case "get_real_time_availability": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "availability:read", {
        requireMcp: true,
        partySize: Number(args.party_size || 0) || null,
      });
      const { data, error } = await context.adminClient.rpc("get_restaurant_reservation_slot_availability", {
        p_restaurant_id: args.restaurant_id,
        p_date: args.date,
      });
      if (error) throw new HttpError(500, error.message);
      return buildTokConnectMcpJsonResult({
        restaurant_id: restaurantId,
        date: String(args.date || ""),
        slots: data || [],
      });
    }

    case "prepare_reservation":
      await assertTokConnectRestaurantGrant(context, restaurantId, "reservations:create", {
        requireMcp: true,
        partySize: Number(args.party_size || 0) || null,
      });
      return buildTokConnectMcpJsonResult({
        reservation_preview: {
          restaurant_id: args.restaurant_id,
          date: args.date,
          time: args.time,
          party_size: args.party_size,
          customer_note: args.customer_note || null,
          requires_confirmation: true,
          mutation_executed: false,
        },
      });

    case "get_restaurant_performance": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "analytics:read", {
        requireMcp: true,
      });
      const period = args.period === "90d" ? "90d" : args.period === "7d" ? "7d" : "30d";
      const periodDays = period === "90d" ? 90 : period === "7d" ? 7 : 30;
      const to = new Date();
      const from = new Date(to);
      from.setUTCDate(from.getUTCDate() - periodDays + 1);
      const { data, error } = await context.adminClient.rpc("get_restaurant_performance", {
        p_restaurant_id: args.restaurant_id,
        p_from: from.toISOString().slice(0, 10),
        p_to: to.toISOString().slice(0, 10),
      });
      if (error) throw new HttpError(500, error.message);
      return buildTokConnectMcpJsonResult({
        restaurant_id: restaurantId,
        period,
        performance: data,
      });
    }

    case "estimate_campaign_credit_cost":
      await assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview", {
        requireMcp: true,
      });
      return buildTokConnectMcpJsonResult({
        estimate: {
          restaurant_id: args.restaurant_id,
          audience_size: Number(args.audience_size || 100),
          channels: Array.isArray(args.channels) ? args.channels : [],
          credits: Math.max(1, Math.ceil(Number(args.audience_size || 100) / 100)),
          currency: "TOK_CREDIT",
        },
      });

    case "generate_campaign_preview": {
      await assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview", {
        requireMcp: true,
      });
      const preview = {
        restaurant_id: args.restaurant_id,
        objective: args.objective,
        budget_chf: Number(args.budget_chf || 0),
        requires_human_approval: true,
        status: "preview",
      };
      const { idempotencyKey, requestHash } = await getToolIdempotency("generate_campaign_preview", args);
      const actorId = context.userId || context.partnerId;
      const existingRun = await findIdempotentAgentRun({
        context,
        restaurantId,
        toolName: "generate_campaign_preview",
        idempotencyKey,
        actorId,
      });
      if (existingRun) {
        assertIdempotentAgentRunMatches(existingRun, requestHash);
        const previousOutput = existingRun.output && typeof existingRun.output === "object"
          ? existingRun.output as Record<string, unknown>
          : {};
        return buildTokConnectMcpJsonResult({
          campaign_preview: previousOutput.campaign_preview || preview,
          run: existingRun,
          replayed: true,
        });
      }

      const { data: run, error } = await context.adminClient.from("tok_connect_agent_runs").insert({
        partner_id: context.authMode === "supabase_oauth" ? null : context.partnerId,
        restaurant_id: args.restaurant_id,
        mode: "preview",
        tool_name: "generate_campaign_preview",
        status: "preview",
        scopes: ["campaigns:preview"],
        input: { ...args, idempotency_key: idempotencyKey, actor_id: actorId, request_hash: requestHash },
        output: { campaign_preview: preview },
        approval_required: true,
      }).select("id, status, mode, approval_required, risk_level, expires_at").single();
      if (error) {
        if (error.code === "23505") {
          const replayRun = await findIdempotentAgentRun({
            context,
            restaurantId,
            toolName: "generate_campaign_preview",
            idempotencyKey,
            actorId,
          });
          if (replayRun) {
            assertIdempotentAgentRunMatches(replayRun, requestHash);
            return buildTokConnectMcpJsonResult({ campaign_preview: preview, run: replayRun, replayed: true });
          }
        }
        throw new HttpError(500, error.message);
      }
      return buildTokConnectMcpJsonResult({ campaign_preview: preview, run, replayed: false });
    }

    case "build_autopilot_plan": {
      await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-autopilot");
      await assertTokConnectRestaurantGrant(context, restaurantId, "campaigns:preview", {
        requireMcp: true,
      });
      await assertTokConnectRestaurantGrant(context, restaurantId, "analytics:read", {
        requireMcp: true,
      });
      const autopilotPlan = buildTokConnectAutopilotPlan({
        restaurant_id: restaurantId,
        objective: String(args.objective || ""),
        budget_chf: Number(args.budget_chf || 0),
        requested_actions: args.requested_actions,
        approval_mode: "human_required",
      });
      const { idempotencyKey, requestHash } = await getToolIdempotency("build_autopilot_plan", args);
      const actorId = context.userId || context.partnerId;
      const existingRun = await findIdempotentAgentRun({
        context,
        restaurantId,
        toolName: "build_autopilot_plan",
        idempotencyKey,
        actorId,
      });
      if (existingRun) {
        assertIdempotentAgentRunMatches(existingRun, requestHash);
        const previousOutput = existingRun.output && typeof existingRun.output === "object"
          ? existingRun.output as Record<string, unknown>
          : {};
        return buildTokConnectMcpJsonResult({
          autopilot_plan: previousOutput.autopilot_plan || autopilotPlan,
          run: existingRun,
          replayed: true,
        });
      }

      const { data: run, error } = await context.adminClient.from("tok_connect_agent_runs").insert({
        partner_id: context.authMode === "supabase_oauth" ? null : context.partnerId,
        restaurant_id: restaurantId,
        mode: "autopilot_bounded",
        tool_name: "build_autopilot_plan",
        status: "pending_approval",
        scopes: ["autopilot:plan", "analytics:read", "campaigns:preview"],
        input: { ...args, idempotency_key: idempotencyKey, actor_id: actorId, request_hash: requestHash },
        output: { autopilot_plan: autopilotPlan },
        approval_required: true,
        risk_level: autopilotPlan.risk_level,
        execution_policy: {
          human_approval_required: true,
          autonomous_mutation_allowed: false,
          max_budget_chf: autopilotPlan.budget_chf,
        },
        expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }).select("id, status, mode, approval_required, risk_level, expires_at").single();
      if (error) {
        if (error.code === "23505") {
          const replayRun = await findIdempotentAgentRun({
            context,
            restaurantId,
            toolName: "build_autopilot_plan",
            idempotencyKey,
            actorId,
          });
          if (replayRun) {
            assertIdempotentAgentRunMatches(replayRun, requestHash);
            return buildTokConnectMcpJsonResult({ autopilot_plan: autopilotPlan, run: replayRun, replayed: true });
          }
        }
        throw new HttpError(500, error.message);
      }
      return buildTokConnectMcpJsonResult({ autopilot_plan: autopilotPlan, run, replayed: false });
    }

    default:
      throw new HttpError(404, "mcp_tool_not_found");
  }
}

async function handleMcp(req: Request, rpc: McpJsonRpcRequest): Promise<McpHandleResult> {
  switch (rpc.method) {
    case "initialize": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      const protocolVersion = negotiateMcpProtocolVersion(rpc.params);
      return {
        payload: rpcResult(rpc.id, {
          protocolVersion,
          serverInfo: {
            name: "tok-connect-mcp",
            title: "TOK Connect",
            version: "2.0.0",
            websiteUrl: TOK_CONNECT_PUBLIC_ORIGIN,
          },
          capabilities: {
            tools: {},
            resources: {},
            prompts: {},
          },
          instructions: "TOK Connect permet à ChatGPT de découvrir TOK, de consulter les données autorisées et de préparer des actions. Les outils de découverte et de démonstration sont anonymes. Les données de compte exigent OAuth. Toute réservation, publication, dépense, suppression ou opération financière requiert une confirmation humaine explicite dans TOK.",
        }),
        context,
        route: context ? "MCP initialize" : "MCP initialize noauth",
        scopes: [],
      };
    }

    case "tools/list": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { tools: MCP_TOOLS.map(toolDefinition) }),
        context,
        route: context ? "MCP tools/list" : "MCP tools/list noauth",
        scopes: [],
      };
    }

    case "tools/call": {
      const toolName = String(rpc.params?.name || "");
      const tool = MCP_TOOLS.find((entry) => entry.name === toolName);
      if (!tool) throw new HttpError(404, "mcp_tool_not_found");
      const args = validateToolArguments(tool, rpc.params?.arguments || {});
      if (toolName === TOK_CONNECT_ACTION_WINDOW_TOOL.name) {
        return {
          payload: rpcResult(rpc.id, buildActionWindowResult(args)),
          context: hasBearerToken(req) ? await authorizeMcp(req, tool.requiredScopes) : null,
          route: hasBearerToken(req) ? `MCP tools/call ${toolName}` : `MCP tools/call ${toolName} noauth`,
          scopes: tool.requiredScopes,
        };
      }
      if (toolName === TOK_CONNECT_APP_QUERY_TOOL.name) {
        return {
          payload: rpcResult(rpc.id, buildApplicationToolQueryResult(args)),
          context: hasBearerToken(req) ? await authorizeMcp(req, tool.requiredScopes) : null,
          route: hasBearerToken(req) ? `MCP tools/call ${toolName}` : `MCP tools/call ${toolName} noauth`,
          scopes: tool.requiredScopes,
        };
      }
      if (toolName === TOK_CONNECT_APP_SANDBOX_TOOL.name) {
        return {
          payload: rpcResult(rpc.id, buildApplicationSandboxResult(args)),
          context: hasBearerToken(req) ? await authorizeMcp(req, tool.requiredScopes) : null,
          route: hasBearerToken(req) ? `MCP tools/call ${toolName}` : `MCP tools/call ${toolName} noauth`,
          scopes: tool.requiredScopes,
        };
      }
      if (tool.requiredScopes.length > 0 && !hasBearerToken(req)) {
        const challenge = buildMcpBearerChallenge({
          resourceMetadataUrl: TOK_CONNECT_RESOURCE_METADATA_URL,
          scopes: TOK_CONNECT_OIDC_SCOPES,
          error: "invalid_token",
          errorDescription: "Connectez votre compte TOK pour utiliser cet outil.",
        });
        return {
          payload: rpcResult(
            rpc.id,
            buildMcpAuthToolResult(challenge, "Authentification TOK requise pour accéder aux données réelles."),
          ),
          context: null,
          route: `MCP tools/call ${toolName} auth-required`,
          scopes: tool.requiredScopes,
        };
      }
      const context = await authorizeMcp(req, tool.requiredScopes);
      const result = await callTool(context, toolName, args);
      return {
        payload: rpcResult(rpc.id, result),
        context,
        route: `MCP tools/call ${toolName}`,
        scopes: tool.requiredScopes,
      };
    }

    case "resources/list": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, {
          resources: MCP_RESOURCES.filter((resource) => !resource.uri.includes("{")),
        }),
        context,
        route: context ? "MCP resources/list" : "MCP resources/list noauth",
        scopes: [],
      };
    }

    case "resources/templates/list": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, {
          resourceTemplates: MCP_RESOURCES
            .filter((resource) => resource.uri.includes("{"))
            .map((resource) => ({
              uriTemplate: resource.uri,
              name: resource.name,
              description: resource.description,
              mimeType: resource.mimeType,
            })),
        }),
        context,
        route: context ? "MCP resources/templates/list" : "MCP resources/templates/list noauth",
        scopes: [],
      };
    }

    case "resources/read": {
      const uri = String(rpc.params?.uri || "tok://restaurants");
      if (uri === ACTION_WINDOW_RESOURCE_URI) {
        return {
          payload: rpcResult(rpc.id, {
            contents: [{
              uri,
              mimeType: "text/html;profile=mcp-app",
              text: ACTION_WINDOW_HTML,
              _meta: {
                ui: {
                  domain: TOK_CONNECT_PUBLIC_ORIGIN,
                  prefersBorder: true,
                  csp: {
                    connectDomains: [],
                    resourceDomains: ["https://www.thetok.ch", "https://cloud-rebuild-recovered.vercel.app"],
                  },
                },
                "openai/widgetDescription": "Fenetre interactive affichant les actions TOK Connect de ChatGPT.",
                "openai/widgetPrefersBorder": true,
                "openai/widgetCSP": {
                  connect_domains: [],
                  resource_domains: ["https://www.thetok.ch", "https://cloud-rebuild-recovered.vercel.app"],
                },
              },
            }],
          }),
          context: hasBearerToken(req) ? await authorizeMcp(req) : null,
          route: hasBearerToken(req) ? "MCP resources/read action-window" : "MCP resources/read action-window noauth",
          scopes: [],
        };
      }
      if (!hasBearerToken(req)) {
        return {
          payload: rpcResult(rpc.id, {
            contents: [{
              uri,
              mimeType: "application/json",
              text: JSON.stringify({
                status: "sandbox",
                mutation_allowed: false,
                message: "TOK Connect DEV noauth expose uniquement des données de démonstration.",
              }),
            }],
          }),
          context: null,
          route: "MCP resources/read noauth",
          scopes: [],
        };
      }
      let context: TokConnectTokenContext;
      let scopes: string[];
      let resourceText = JSON.stringify({ status: "available", mutation_allowed: false });
      if (uri.startsWith("tok://availability/")) {
        scopes = ["availability:read"];
        context = await authorizeMcp(req, scopes);
        await assertTokConnectRestaurantGrant(
          context,
          uri.replace("tok://availability/", ""),
          "availability:read",
          { requireMcp: true },
        );
      } else if (uri.startsWith("tok://campaign-preview/")) {
        scopes = ["campaigns:preview"];
        context = await authorizeMcp(req, scopes);
        await assertTokConnectRestaurantGrant(
          context,
          uri.replace("tok://campaign-preview/", ""),
          "campaigns:preview",
          { requireMcp: true },
        );
      } else if (uri.startsWith("tok://autopilot-runs/")) {
        const restaurantId = uri.replace("tok://autopilot-runs/", "");
        scopes = ["autopilot:plan", "analytics:read", "campaigns:preview"];
        context = await authorizeMcp(req, scopes);
        await assertTokConnectFeatureEnabled(context.adminClient, "tok-connect-autopilot");
        await assertTokConnectRestaurantGrant(
          context,
          restaurantId,
          "campaigns:preview",
          { requireMcp: true },
        );
        await assertTokConnectRestaurantGrant(
          context,
          restaurantId,
          "analytics:read",
          { requireMcp: true },
        );
        const { data, error } = await context.adminClient
          .from("tok_connect_agent_runs")
          .select("id, mode, tool_name, status, approval_required, risk_level, execution_policy, created_at, approved_at, rejected_at, expires_at")
          .eq("restaurant_id", restaurantId)
          .order("created_at", { ascending: false })
          .limit(25);
        if (error) throw new HttpError(500, error.message);
        resourceText = JSON.stringify({ agent_runs: data || [], mutation_allowed: false });
      } else {
        scopes = ["restaurants:read"];
        context = await authorizeMcp(req, scopes);
      }
      return {
        payload: rpcResult(rpc.id, {
          contents: [{
            uri,
            mimeType: "application/json",
            text: resourceText,
          }],
        }),
        context,
        route: "MCP resources/read",
        scopes,
      };
    }

    case "prompts/list": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      return {
        payload: rpcResult(rpc.id, { prompts: MCP_PROMPTS }),
        context,
        route: context ? "MCP prompts/list" : "MCP prompts/list noauth",
        scopes: [],
      };
    }

    case "prompts/get": {
      const context = hasBearerToken(req) ? await authorizeMcp(req) : null;
      const name = String(rpc.params?.name || "");
      const prompt = MCP_PROMPTS.find((entry) => entry.name === name);
      if (!prompt) throw new HttpError(404, "mcp_prompt_not_found");
      return {
        payload: rpcResult(rpc.id, {
          description: prompt.description,
          messages: [{
            role: "user",
            content: {
              type: "text",
              text: `${prompt.description} Use TOK Connect scopes and return a preview before any real mutation.`,
            },
          }],
        }),
        context,
        route: context ? `MCP prompts/get ${name}` : `MCP prompts/get ${name} noauth`,
        scopes: [],
      };
    }

    case "ping":
      return {
        payload: rpcResult(rpc.id, {}),
        context: null,
        route: "MCP ping",
        scopes: [],
      };

    default:
      throw new HttpError(404, "mcp_method_not_found");
  }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCorsHeaders(req);
  if (!isRequestOriginAllowed(req)) {
    return new Response(null, { status: 403, headers: mcpResponseHeaders(corsHeaders) });
  }

  const preflight = handleCorsPreflight(req, corsHeaders);
  if (preflight) return preflight;

  const requestUrl = new URL(req.url);
  if (req.method === "GET" && requestUrl.searchParams.get("tok_connect_route") === "protected-resource") {
    return jsonResponse({
      resource: TOK_CONNECT_MCP_RESOURCE,
      authorization_servers: [TOK_CONNECT_AUTHORIZATION_SERVER],
      scopes_supported: TOK_CONNECT_OIDC_SCOPES,
      bearer_methods_supported: ["header"],
      resource_documentation: `${TOK_CONNECT_PUBLIC_ORIGIN}/tok-connect/developer`,
    }, 200, mcpResponseHeaders(corsHeaders));
  }

  if (req.method !== "POST") return mcpMethodNotAllowedResponse(corsHeaders);

  const requestId = makeTokConnectRequestId();
  const startedAt = Date.now();
  let context: TokConnectTokenContext | null = null;
  let statusCode = 200;
  let errorCode: string | null = null;
  let route = "tok-connect-mcp";
  let scopes: string[] = [];
  let rpc: McpJsonRpcRequest | null = null;

  try {
    assertMcpAcceptHeader(req);
    assertMcpContentType(req);
    rpc = await parseMcpJsonRpcRequest(req);
    assertMcpProtocolVersion(req, rpc.method);

    if (isMcpNotification(rpc)) {
      route = `MCP notification ${rpc.method}`;
      statusCode = 202;
      return mcpAcceptedResponse(corsHeaders);
    }

    const result = await handleMcp(req, rpc);
    context = result.context;
    route = result.route;
    scopes = result.scopes;
    const negotiatedVersion = rpc.method === "initialize"
      ? negotiateMcpProtocolVersion(rpc.params)
      : req.headers.get("MCP-Protocol-Version") || undefined;
    return jsonResponse(result.payload, 200, mcpResponseHeaders(corsHeaders, negotiatedVersion));
  } catch (error) {
    statusCode = error instanceof McpProtocolError
      ? error.httpStatus
      : error instanceof HttpError
      ? error.status
      : 500;
    errorCode = error instanceof Error ? error.message : "tok_connect_mcp_error";
    const isAuthError = statusCode === 401 || statusCode === 403;
    const challenge = isAuthError
      ? buildMcpBearerChallenge({
        resourceMetadataUrl: TOK_CONNECT_RESOURCE_METADATA_URL,
        scopes: TOK_CONNECT_OIDC_SCOPES,
        error: statusCode === 403 ? "insufficient_scope" : "invalid_token",
        errorDescription: errorCode,
      })
      : null;
    const rpcCode = error instanceof McpProtocolError
      ? error.code
      : statusCode === 404
      ? -32601
      : statusCode >= 500
      ? -32603
      : -32000;
    const responseStatus = error instanceof McpProtocolError || isAuthError ? statusCode : 200;
    const headers = mcpResponseHeaders(corsHeaders);
    if (challenge) headers["WWW-Authenticate"] = challenge;
    return jsonResponse(
      rpcError(rpc?.id ?? null, rpcCode, errorCode, challenge
        ? { _meta: { "mcp/www_authenticate": [challenge] } }
        : undefined),
      responseStatus,
      headers,
    );
  } finally {
    await recordTokConnectApiRequest({
      context,
      request: req,
      requestId,
      route,
      statusCode,
      startedAt,
      scopes,
      errorCode,
    });
  }
});

export const tokConnectMcpHealthEnvelope = buildTokConnectEnvelope({
  requestId: "tok_mcp_static",
  data: { server: "tok-connect-mcp" },
});
