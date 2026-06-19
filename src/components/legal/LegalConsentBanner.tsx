import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, ShieldCheck, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LEGAL_CONSENT_VERSION = "2026-06-17";
const LEGAL_CONSENT_STORAGE_KEY = `tok_legal_consent_${LEGAL_CONSENT_VERSION}`;

type LegalConsentStatus = "pending" | "accepted" | "refused";

type StoredLegalConsent = {
  status: Exclude<LegalConsentStatus, "pending">;
  version: string;
  recordedAt: string;
};

function readStoredConsent(): LegalConsentStatus {
  if (typeof window === "undefined") return "accepted";

  try {
    const raw = window.localStorage.getItem(LEGAL_CONSENT_STORAGE_KEY);
    if (!raw) return "pending";
    const parsed = JSON.parse(raw) as Partial<StoredLegalConsent>;
    if (parsed.version !== LEGAL_CONSENT_VERSION) return "pending";
    return parsed.status === "accepted" || parsed.status === "refused" ? parsed.status : "pending";
  } catch {
    return "pending";
  }
}

function storeConsent(status: Exclude<LegalConsentStatus, "pending">) {
  if (typeof window === "undefined") return;

  const payload: StoredLegalConsent = {
    status,
    version: LEGAL_CONSENT_VERSION,
    recordedAt: new Date().toISOString(),
  };

  window.localStorage.setItem(LEGAL_CONSENT_STORAGE_KEY, JSON.stringify(payload));
  window.dispatchEvent(new CustomEvent("tok:legal-consent-change", { detail: payload }));
}

export default function LegalConsentBanner() {
  const [status, setStatus] = useState<LegalConsentStatus>("accepted");

  useEffect(() => {
    setStatus(readStoredConsent());
  }, []);

  const handleChoice = (nextStatus: Exclude<LegalConsentStatus, "pending">) => {
    storeConsent(nextStatus);
    setStatus(nextStatus);
  };

  if (status === "accepted") return null;

  if (status === "refused") {
    return (
      <div className="fixed bottom-4 left-4 z-[1300] max-w-[calc(100vw-2rem)]">
        <button
          type="button"
          onClick={() => setStatus("pending")}
          className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/95 px-4 py-2 text-xs font-semibold text-foreground shadow-[0_16px_36px_rgba(15,23,42,0.16)] backdrop-blur-xl transition hover:border-primary/60 hover:text-primary"
        >
          <XCircle className="h-4 w-4 text-destructive" />
          Conditions refusées
          <span className="text-muted-foreground">Modifier</span>
        </button>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-slate-950/45 px-4 py-[calc(env(safe-area-inset-top,0px)+1rem)] backdrop-blur-sm sm:px-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-consent-title"
        className={cn(
          "mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border border-orange-200 bg-white shadow-[0_30px_90px_rgba(15,23,42,0.28)]",
          "dark:border-orange-300/25 dark:bg-slate-950 dark:shadow-[0_24px_80px_rgba(0,0,0,0.55)]",
        )}
      >
        <div className="grid gap-5 p-5 sm:grid-cols-[auto_1fr] sm:p-6">
          <div className="hidden h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary sm:grid">
            <ShieldCheck className="h-6 w-6" />
          </div>

          <div className="min-w-0 space-y-2">
            <p id="legal-consent-title" className="text-base font-bold text-foreground">
              Conditions TOK
            </p>
            <p className="text-sm leading-6 text-muted-foreground">
              En acceptant, vous confirmez avoir lu les conditions générales, la politique de confidentialité et les règles cookies. Si vous refusez, vous pouvez consulter le site, mais les services nécessitant un compte, une commande, une réservation ou une campagne restent soumis aux conditions TOK.
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-semibold text-muted-foreground">
              <Link to="/cgu" className="hover:text-primary hover:underline">
                CGU
              </Link>
              <Link to="/politique-confidentialite" className="hover:text-primary hover:underline">
                Confidentialité
              </Link>
              <Link to="/cookies" className="hover:text-primary hover:underline">
                Cookies
              </Link>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-2 sm:ml-16">
            <Button
              type="button"
              variant="outline"
              className="h-11 gap-2 rounded-2xl"
              onClick={() => handleChoice("refused")}
            >
              <XCircle className="h-4 w-4" />
              Refuser
            </Button>
            <Button
              type="button"
              className="h-11 gap-2 rounded-2xl bg-primary text-primary-foreground shadow-[0_14px_30px_rgba(249,115,22,0.24)] hover:bg-primary/90"
              onClick={() => handleChoice("accepted")}
            >
              <CheckCircle2 className="h-4 w-4" />
              Accepter
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}
