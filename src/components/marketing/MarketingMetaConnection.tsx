import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";

type EmailHealth = { status: "connected" | "blocked_configuration"; verifiedNow: boolean; checkedAt: string; senderDomain: string | null; reason: string | null };
type Account = {
  channel: "facebook" | "instagram";
  status: "connected" | "blocked_configuration";
  accountName: string | null;
  accountId: string | null;
  checkedAt: string;
  reason: string | null;
};

export default function MarketingMetaConnection() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [email, setEmail] = useState<EmailHealth | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const checkEmail = async () => {
    setPending(true); setError(null); setEmail(null);
    try {
      const result = await marketingBffRequest<{ email: EmailHealth }>(MARKETING_BFF_ENDPOINTS.orchestrator, {
        method: "POST", body: { action: "check_resend" }, timeoutMs: 45_000,
      });
      if (!result?.email || typeof result.email.checkedAt !== "string"
        || typeof result.email.verifiedNow !== "boolean"
        || !["connected", "blocked_configuration"].includes(result.email.status)) throw new Error("invalid_response");
      setEmail(result.email);
    } catch { setError("Vérification Resend indisponible. Aucun e-mail envoyé."); }
    finally { setPending(false); }
  };
  const check = async () => {
    setPending(true);
    setError(null);
    setAccounts([]);
    try {
      const result = await marketingBffRequest<{ accounts: Account[] }>(MARKETING_BFF_ENDPOINTS.orchestrator, {
        method: "POST", body: { action: "check_meta" }, timeoutMs: 45_000,
      });
      if (!result || !Array.isArray(result.accounts) || result.accounts.length !== 2
        || result.accounts.some((account) => !account || typeof account !== "object"
          || !["connected", "blocked_configuration"].includes(account.status)
          || typeof account.checkedAt !== "string" || !Number.isFinite(Date.parse(account.checkedAt))
          || [account.accountName, account.accountId, account.reason].some((value) => value !== null && typeof value !== "string"))
        || !["facebook", "instagram"].every((channel) => result.accounts.some((account) => account.channel === channel))
      ) {
        throw new Error("invalid_response");
      }
      setAccounts(result.accounts);
    } catch {
      setError("Impossible de vérifier les comptes Meta. Réessayez plus tard.");
    } finally { setPending(false); }
  };
  return (
    <><Card>
      <CardHeader><CardTitle>Resend · courrier marketing</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">Vérifier le domaine et les secrets de TOK directement auprès de Resend, sans envoyer de message.</p>
        <Button type="button" onClick={() => void checkEmail()} disabled={pending}>Vérifier Resend</Button>
        {email ? <div role="status" className="text-sm"><p>{email.verifiedNow ? "Domaine Resend vérifié" : "Envoi non confirmé"}</p><p>{email.senderDomain || "Expéditeur non confirmé"}</p><p>{email.reason || "Configuration technique validée ; aucun envoi de test effectué."}</p></div> : null}
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
      </CardContent>
    </Card><Card>
      <CardHeader><CardTitle>Comptes Facebook et Instagram</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">Vérifiez l’accès en lecture aux comptes configurés sur le serveur. Cette vérification ne confirme pas les permissions de publication et ne réactive aucun canal en pause.</p>
        <Button type="button" onClick={() => void check()} disabled={pending}>
          {pending ? "Vérification en cours…" : "Vérifier les comptes Meta"}
        </Button>
        {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2" aria-live="polite">
          {accounts.map((account) => (
            <div key={account.channel} className="min-w-0 rounded-xl border p-3 text-sm">
              <p className="font-semibold">{account.channel === "facebook" ? "Facebook" : "Instagram"}</p>
              <p>{account.status === "connected" ? "Accès en lecture vérifié" : "Accès non confirmé"}</p>
              {account.accountName ? <p className="break-words">{account.accountName} · {account.accountId}</p> : null}
              {account.reason ? <p className="mt-2 text-muted-foreground">{account.reason}</p> : null}
              <p className="mt-2 text-xs text-muted-foreground">{new Date(account.checkedAt).toLocaleString("fr-CH")}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card></>
  );
}
