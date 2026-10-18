import { useCallback, useEffect, useState } from "react";
import { getSupabase } from "@/integrations/supabase/client";
import { listManagedTokOAuthClients, listTokOAuthGrants, listTokOAuthRestaurants, revokeTokOAuthConnection, saveTokOAuthGrant, TOK_OAUTH_DEFAULT_SCOPES, TOK_OAUTH_SCOPE_LABELS, type TokOAuthGrant, type TokOAuthRestaurant } from "@/lib/tokOAuth";
import TokOAuthPermissions from "./TokOAuthPermissions";
type NativeGrant = { client: { id: string; name?: string }; scopes: string[]; granted_at: string };

export default function TokOAuthConnections() {
  const [grants, setGrants] = useState<TokOAuthGrant[]>([]), [native, setNative] = useState<NativeGrant[]>([]);
  const [restaurants, setRestaurants] = useState<TokOAuthRestaurant[]>([]), [managed, setManaged] = useState<string[]>([]);
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null), [scopes, setScopes] = useState<string[]>([...TOK_OAUTH_DEFAULT_SCOPES]), [restaurantIds, setRestaurantIds] = useState<string[]>([]);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [business, identity, places] = await Promise.all([listTokOAuthGrants(), getSupabase().auth.oauth.listGrants(), listTokOAuthRestaurants()]);
      if (identity.error) throw new Error("Les connexions d’identité ne peuvent pas être chargées.");
      const nativeGrants = identity.data || [];
      const verified = await listManagedTokOAuthClients([...business.map((grant) => grant.client_id), ...nativeGrants.map((grant) => grant.client.id)]);
      setGrants(business); setNative(nativeGrants); setRestaurants(places); setManaged(verified);
    } catch (nextError) {
      setGrants([]); setNative([]); setManaged([]); setEditing(null);
      setError(nextError instanceof Error ? nextError.message : "Le chargement des connexions a échoué.");
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const ids = [...new Set([...native.map((grant) => grant.client.id), ...grants.map((grant) => grant.client_id)])];
  const revoke = async (id: string) => {
    setBusy(id); setError(null); setNotice(null);
    try { await revokeTokOAuthConnection(id); setNotice("Les permissions TOK et la connexion d’identité ont été révoquées."); setEditing(null); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "La révocation a échoué."); }
    finally { await load(); setBusy(null); }
  };
  const save = async (id: string, name: string) => {
    setBusy(id); setError(null); setNotice(null);
    try { await saveTokOAuthGrant(id, name, scopes, restaurantIds); setNotice("Permissions enregistrées pour 90 jours. Reprenez la connexion depuis votre application."); setEditing(null); await load(); }
    catch (nextError) { setError(nextError instanceof Error ? nextError.message : "Les permissions n’ont pas été enregistrées."); }
    finally { setBusy(null); }
  };
  return <section className="space-y-4 rounded-2xl border bg-card p-5 shadow-sm" aria-labelledby="tok-oauth-connections-title">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="tok-oauth-connections-title" className="text-xl font-bold">Applications connectées à mon compte</h2>
      <button type="button" onClick={() => { setError(null); void load(); }} disabled={loading || busy !== null} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50">Actualiser</button>
    </div>
    <p className="text-sm text-muted-foreground">Contrôlez les permissions et les restaurants accordés à chaque application. Pour une ancienne connexion, révoquez l’accès puis reconnectez l’application avec la nouvelle protection TOK.</p>
    {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
    {notice && <p role="status" className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950">{notice}</p>}
    {loading ? <p role="status" className="text-sm">Chargement des connexions…</p> : ids.length === 0 ? <p className="text-sm">Aucune connexion chargée.</p> : ids.map((id) => {
      const identity = native.find((grant) => grant.client.id === id), grant = grants.find((value) => value.client_id === id);
      const name = identity?.client.name || grant?.client_name || "Application externe", isManaged = managed.includes(id);
      const active = isManaged && grant && !grant.revoked_at && Date.parse(grant.expires_at) > Date.now();
      return <article key={id} className="space-y-3 rounded-xl border p-4">
        <h3 className="font-bold">{name}</h3>
        <p className="break-all text-xs text-muted-foreground">{id}</p>
        <p className="text-sm">{active ? `Permissions TOK actives jusqu’au ${new Date(grant.expires_at).toLocaleDateString("fr-CH")}.` : "Permissions métier TOK inactives. Configurez les droits avant d’utiliser l’application."} {identity ? "Connexion d’identité présente." : "Connexion d’identité absente."}</p>
        {!isManaged && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950">Ancienne connexion : révoquez-la puis reconnectez votre application. Elle ne peut pas recevoir de nouveaux droits TOK.</p>}
        {active && <><ul className="list-disc space-y-1 pl-5 text-sm">{grant.scopes.map((scope) => <li key={scope}>{TOK_OAUTH_SCOPE_LABELS[scope] || scope}</li>)}</ul><p className="text-sm">{grant.restaurant_ids.length} restaurant(s) autorisé(s).</p></>}
        <div className="flex flex-wrap gap-2">
          {identity && isManaged && <button type="button" disabled={busy !== null} className="rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-50" onClick={() => { setEditing(id); setScopes(active ? [...grant.scopes] : [...TOK_OAUTH_DEFAULT_SCOPES]); setRestaurantIds(active ? [...grant.restaurant_ids] : []); setError(null); }}>Configurer les permissions</button>}
          <button type="button" disabled={busy !== null} className="rounded-lg border border-destructive/30 px-3 py-2 text-sm font-semibold text-destructive disabled:opacity-50" onClick={() => void revoke(id)}>Révoquer l’accès</button>
        </div>
        {editing === id && <div className="space-y-4 border-t pt-4"><TokOAuthPermissions scopes={scopes} restaurantIds={restaurantIds} restaurants={restaurants} onScopesChange={setScopes} onRestaurantIdsChange={setRestaurantIds} disabled={busy !== null} /><button type="button" disabled={busy !== null} onClick={() => void save(id, name)} className="rounded-lg bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-50">Enregistrer les permissions</button></div>}
      </article>;
    })}
  </section>;
}
