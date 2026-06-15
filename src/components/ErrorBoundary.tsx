import { Component, ErrorInfo, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";
import { captureException } from "@/lib/monitoring";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

const CHUNK_RECOVERY_QUERY_PARAM = "_tok_refresh";
const CHUNK_RECOVERY_TIMESTAMP_KEY = "tok:chunk-recovery-at";
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;

const RECOVERABLE_CHUNK_ERROR_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /Failed to load module script/i,
  /ChunkLoadError/i,
  /Loading chunk .+ failed/i,
  /Unable to preload CSS/i,
  /vite:preloadError/i,
];

function getErrorText(error: unknown) {
  if (error instanceof Error) {
    return `${error.name} ${error.message}`.trim();
  }

  if (typeof error === "string") {
    return error;
  }

  return "";
}

export function isRecoverableChunkLoadError(error: unknown) {
  const errorText = getErrorText(error);

  return RECOVERABLE_CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(errorText));
}

export function buildChunkRecoveryUrl(href: string, cacheBustValue = Date.now()) {
  const baseUrl =
    typeof window !== "undefined" && window.location.origin
      ? window.location.origin
      : "https://www.thetok.ch";
  const url = new URL(href, baseUrl);
  url.searchParams.set(CHUNK_RECOVERY_QUERY_PARAM, String(cacheBustValue));

  return url.toString();
}

function readLastChunkRecoveryAttempt() {
  try {
    const storedValue = window.sessionStorage.getItem(CHUNK_RECOVERY_TIMESTAMP_KEY);
    const parsedValue = storedValue ? Number(storedValue) : 0;

    return Number.isFinite(parsedValue) ? parsedValue : 0;
  } catch {
    return 0;
  }
}

function storeLastChunkRecoveryAttempt(timestamp: number) {
  try {
    window.sessionStorage.setItem(CHUNK_RECOVERY_TIMESTAMP_KEY, String(timestamp));
  } catch {
    // Browsers can block sessionStorage. The reload still gives the user a path forward.
  }
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
    captureException(error, {
      tags: { boundary: "root" },
      extra: { componentStack: errorInfo.componentStack },
    });

    this.recoverFromChunkLoadError(error);
  }

  private recoverFromChunkLoadError(error: Error | null, force = false) {
    if (typeof window === "undefined" || !error || !isRecoverableChunkLoadError(error)) {
      return;
    }

    const now = Date.now();
    const lastAttempt = readLastChunkRecoveryAttempt();

    if (!force && lastAttempt > 0 && now - lastAttempt < CHUNK_RECOVERY_COOLDOWN_MS) {
      return;
    }

    storeLastChunkRecoveryAttempt(now);
    window.location.replace(buildChunkRecoveryUrl(window.location.href, now));
  }

  render() {
    if (this.state.hasError) {
      const isChunkLoadError = isRecoverableChunkLoadError(this.state.error);
      const errorMessage = isChunkLoadError
        ? "Une mise à jour de TOK est disponible. Chargez la dernière version pour continuer."
        : this.state.error?.message || "Erreur inattendue";
      const buttonLabel = isChunkLoadError ? "Charger la dernière version" : "Recharger la page";
      const handleReload = isChunkLoadError
        ? () => this.recoverFromChunkLoadError(this.state.error, true)
        : () => window.location.reload();

      return (
        <div className="min-h-screen flex items-center justify-center bg-background px-4">
          <div className="max-w-md text-center space-y-4">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto" />
            <h1 className="font-display text-2xl font-bold">Oups, une erreur est survenue</h1>
            <p className="text-muted-foreground text-sm">{errorMessage}</p>
            <Button onClick={handleReload}>{buttonLabel}</Button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
