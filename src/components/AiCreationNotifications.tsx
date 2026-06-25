import { useEffect } from "react";
import { toast } from "@/hooks/use-toast";
import {
  AI_CREATION_COMPLETED_EVENT,
  AI_CREATION_FAILED_EVENT,
  getActiveAiCreationContext,
  type AiCreationRecord,
} from "@/lib/ai/aiCreationJobs";

function shouldNotifyOutOfContext(record: AiCreationRecord) {
  if (typeof window === "undefined" || typeof document === "undefined") return false;
  if (document.hidden) return true;
  if (record.originPathname && record.originPathname !== window.location.pathname) return true;
  if (record.originContext && record.originContext !== getActiveAiCreationContext()) return true;
  return false;
}

function showBrowserNotification(title: string, body: string, tag: string) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    new Notification(title, {
      body,
      tag,
      icon: "/favicon.ico",
    });
  } catch {
    // Browser notifications are optional; the in-app toast remains the fallback.
  }
}

export default function AiCreationNotifications() {
  useEffect(() => {
    const handleCompleted = (event: Event) => {
      const record = (event as CustomEvent<AiCreationRecord>).detail;
      if (!record || !shouldNotifyOutOfContext(record)) return;

      const description = "Votre image est disponible dans Photos > Mes créations.";
      toast({
        title: "Création IA terminée",
        description,
      });
      showBrowserNotification("Création TOK terminée", `${record.title}. ${description}`, record.id);
    };

    const handleFailed = (event: Event) => {
      const record = (event as CustomEvent<AiCreationRecord>).detail;
      if (!record || !shouldNotifyOutOfContext(record)) return;

      const description = record.errorMessage || "La génération IA n'a pas pu aboutir.";
      toast({
        title: "Création IA impossible",
        description,
        variant: "destructive",
      });
      showBrowserNotification("Création TOK impossible", description, record.id);
    };

    window.addEventListener(AI_CREATION_COMPLETED_EVENT, handleCompleted);
    window.addEventListener(AI_CREATION_FAILED_EVENT, handleFailed);

    return () => {
      window.removeEventListener(AI_CREATION_COMPLETED_EVENT, handleCompleted);
      window.removeEventListener(AI_CREATION_FAILED_EVENT, handleFailed);
    };
  }, []);

  return null;
}
