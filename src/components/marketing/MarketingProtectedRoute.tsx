import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { RefreshCw, ShieldAlert } from "lucide-react";

import AppLoadingScreen from "@/components/ui/app-loading-screen";
import { Button } from "@/components/ui/button";
import { useMarketingSession } from "@/marketing/MarketingSessionContext";

export default function MarketingProtectedRoute({ children }: { children: ReactNode }) {
  const { status, refreshSession } = useMarketingSession();

  if (status === "loading") {
    return (
      <AppLoadingScreen
        fullScreen
        title="Vérification de la session marketing"
        description="TheTOK vérifie l’accès administrateur et la fraîcheur du second facteur…"
      />
    );
  }

  if (status === "authenticated") return <>{children}</>;

  if (status === "error") {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-[#07111f] p-5 text-white">
        <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.05] p-6 text-center shadow-2xl shadow-black/30">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-rose-500/15 text-rose-300">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </span>
          <h1 className="mt-4 text-xl font-bold">Session indisponible</h1>
          <p className="mt-2 text-sm leading-relaxed text-slate-400">
            L’accès reste bloqué tant que le serveur ne peut pas confirmer votre session.
          </p>
          <Button type="button" className="mt-5 w-full" onClick={() => void refreshSession()}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
            Réessayer
          </Button>
        </section>
      </main>
    );
  }

  return <Navigate to="/marketing/login" replace />;
}
