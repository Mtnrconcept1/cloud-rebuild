import { useEffect, useMemo, useState } from "react";
import { Building2, CheckCircle2, FileCheck2, ShieldCheck, Trash2, X } from "lucide-react";

import { getSupabase } from "@/integrations/supabase/client";

const supabase = getSupabase();
const fromUntyped = supabase.from.bind(supabase) as (relation: string) => any;
const MAX_EVIDENCE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EVIDENCE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png", "image/webp"]);

type DirectoryRestaurant = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  phone: string | null;
  slug: string | null;
  is_directory_listing: boolean;
};

type RemovalForm = {
  requesterName: string;
  requesterEmail: string;
  requesterPhone: string;
  reason: string;
};

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function getRestaurantLocator(pathname: string) {
  const idMatch = pathname.match(/^\/restaurant\/([0-9a-f-]{36})(?:\/|$)/i);
  if (idMatch) return { id: idMatch[1], slug: null, citySlug: null };
  const seoMatch = pathname.match(/^\/restaurants\/([^/]+)\/r\/([^/]+)(?:\/|$)/i);
  if (seoMatch) return { id: null, citySlug: seoMatch[1], slug: seoMatch[2] };
  return null;
}

function useObservedLocation() {
  const [locationKey, setLocationKey] = useState(() => `${window.location.pathname}${window.location.search}`);
  useEffect(() => {
    let previous = `${window.location.pathname}${window.location.search}`;
    const timer = window.setInterval(() => {
      const current = `${window.location.pathname}${window.location.search}`;
      if (current !== previous) {
        previous = current;
        setLocationKey(current);
      }
    }, 350);
    return () => window.clearInterval(timer);
  }, []);
  return locationKey;
}

function setControlledField(id: string, value: string) {
  if (!value) return false;
  const element = document.getElementById(id) as HTMLInputElement | HTMLTextAreaElement | null;
  if (!element) return false;
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  if (!setter) return false;
  setter.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

function DirectoryClaimPrefillBridge() {
  const locationKey = useObservedLocation();
  useEffect(() => {
    if (window.location.pathname !== "/auth") return;
    const params = new URLSearchParams(window.location.search);
    if (!params.get("claimRestaurant")) return;
    const values = {
      phone: params.get("claimPhone") || "",
      city: params.get("claimCity") || "",
      address: params.get("claimAddress") || "",
      businessName: params.get("claimName") || "",
      restaurantName: params.get("claimName") || "",
    };
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      const done = Object.entries(values).every(([id, value]) => !value || setControlledField(id, value));
      if (done || attempts >= 40) window.clearInterval(timer);
    }, 150);
    return () => window.clearInterval(timer);
  }, [locationKey]);
  return null;
}

function sanitizeFilename(name: string) {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(-120) || "document"
  );
}

function validateEvidence(file: File | null, label: string) {
  if (!file) return `${label} est requis.`;
  if (!ALLOWED_EVIDENCE_TYPES.has(file.type)) return `${label} doit être un PDF, JPG, PNG ou WebP.`;
  if (file.size > MAX_EVIDENCE_SIZE) return `${label} dépasse 10 Mo.`;
  return null;
}

export default function DirectoryRestaurantOwnershipNotice() {
  const locationKey = useObservedLocation();
  const pathname = locationKey.split("?")[0];
  const locator = useMemo(() => getRestaurantLocator(pathname), [pathname]);
  const [restaurant, setRestaurant] = useState<DirectoryRestaurant | null>(null);
  const [loading, setLoading] = useState(false);
  const [removalOpen, setRemovalOpen] = useState(false);
  const [registryDocument, setRegistryDocument] = useState<File | null>(null);
  const [identityDocument, setIdentityDocument] = useState<File | null>(null);
  const [mandateDocument, setMandateDocument] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [removalForm, setRemovalForm] = useState<RemovalForm>({
    requesterName: "",
    requesterEmail: "",
    requesterPhone: "",
    reason: "",
  });

  useEffect(() => {
    if (!locator) {
      setRestaurant(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      let query = fromUntyped("restaurants")
        .select("id, name, address, city, phone, slug, is_directory_listing")
        .eq("is_directory_listing", true);
      if (locator.id) query = query.eq("id", locator.id);
      else if (locator.slug) query = query.eq("slug", locator.slug).limit(4);
      const { data, error } = await query;
      if (cancelled) return;
      if (error) {
        setRestaurant(null);
        setLoading(false);
        return;
      }
      const rows = (Array.isArray(data) ? data : data ? [data] : []) as unknown as DirectoryRestaurant[];
      const matched = locator.citySlug
        ? rows.find((row) => slugify(row.city || "geneve") === locator.citySlug) || null
        : rows[0] || null;
      setRestaurant(matched);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [locator]);

  useEffect(() => {
    if (!restaurant) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("removeRestaurant") !== restaurant.id) return;
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setRemovalForm((current) => ({
        ...current,
        requesterEmail: current.requesterEmail || data.user?.email || "",
        requesterName: current.requesterName || String(data.user?.user_metadata?.full_name || ""),
      }));
      setRemovalOpen(true);
    });
  }, [restaurant]);

  const claimRestaurant = () => {
    if (!restaurant) return;
    const params = new URLSearchParams({
      type: "restaurateur",
      claimRestaurant: restaurant.id,
      claimName: restaurant.name,
      redirect: "/dashboard",
    });
    if (restaurant.phone) params.set("claimPhone", restaurant.phone);
    if (restaurant.city) params.set("claimCity", restaurant.city);
    if (restaurant.address) params.set("claimAddress", restaurant.address);
    window.location.assign(`/auth?${params.toString()}`);
  };

  const openRemoval = async () => {
    if (!restaurant) return;
    const { data } = await supabase.auth.getUser();
    if (!data.user) {
      const returnTarget = `${window.location.pathname}?removeRestaurant=${encodeURIComponent(restaurant.id)}`;
      window.location.assign(`/auth?redirect=${encodeURIComponent(returnTarget)}`);
      return;
    }
    setRemovalForm((current) => ({
      ...current,
      requesterEmail: current.requesterEmail || data.user?.email || "",
      requesterName: current.requesterName || String(data.user?.user_metadata?.full_name || ""),
    }));
    setRemovalOpen(true);
  };

  const submitRemoval = async () => {
    if (!restaurant || submitting) return;
    setErrorMessage("");
    const evidenceError =
      validateEvidence(registryDocument, "L’extrait du registre du commerce") ||
      validateEvidence(identityDocument, "La pièce d’identité ou preuve de représentation") ||
      (mandateDocument ? validateEvidence(mandateDocument, "La procuration") : null);
    if (evidenceError) {
      setErrorMessage(evidenceError);
      return;
    }
    if (!removalForm.requesterName.trim() || !removalForm.requesterEmail.trim()) {
      setErrorMessage("Votre nom et votre e-mail sont requis.");
      return;
    }

    setSubmitting(true);
    const uploadedPaths: string[] = [];
    try {
      const { data } = await supabase.auth.getUser();
      const user = data.user;
      if (!user) throw new Error("Reconnectez-vous pour envoyer la demande.");
      const requestId = crypto.randomUUID();
      const files = [registryDocument!, identityDocument!, mandateDocument].filter(Boolean) as File[];
      for (const [index, file] of files.entries()) {
        const path = `${user.id}/${restaurant.id}/${requestId}/${index + 1}-${sanitizeFilename(file.name)}`;
        const { error } = await supabase.storage
          .from("restaurant-removal-evidence")
          .upload(path, file, { upsert: false, contentType: file.type });
        if (error) throw error;
        uploadedPaths.push(path);
      }
      const { error } = await fromUntyped("restaurant_directory_removal_requests").insert({
        id: requestId,
        restaurant_id: restaurant.id,
        requester_id: user.id,
        requester_name: removalForm.requesterName.trim(),
        requester_email: removalForm.requesterEmail.trim().toLowerCase(),
        requester_phone: removalForm.requesterPhone.trim() || null,
        reason: removalForm.reason.trim() || null,
        document_paths: uploadedPaths,
        status: "pending",
      });
      if (error) throw error;
      setSubmitted(true);
    } catch (error) {
      if (uploadedPaths.length > 0) {
        await supabase.storage.from("restaurant-removal-evidence").remove(uploadedPaths).catch(() => undefined);
      }
      setErrorMessage(error instanceof Error ? error.message : "La demande n’a pas pu être envoyée.");
    } finally {
      setSubmitting(false);
    }
  };

  if (pathname === "/auth") return <DirectoryClaimPrefillBridge />;
  if (!locator || loading || !restaurant) return null;

  return (
    <>
      <aside
        className="fixed inset-x-3 bottom-3 z-[70] mx-auto max-w-3xl rounded-2xl border border-amber-300/70 bg-background/95 p-4 shadow-2xl backdrop-blur md:inset-x-auto md:bottom-5 md:right-5 md:w-[460px]"
        aria-label="Informations sur la fiche restaurant indexée"
      >
        <div className="flex items-start gap-3">
          <div className="mt-0.5 rounded-full bg-amber-100 p-2 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
            <Building2 className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-foreground">Restaurant indexé depuis des données publiques</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              TOK constitue son annuaire à partir de bases publiques d’établissements, notamment de données issues du registre du commerce et de sources publiques de référence. Cette fiche n’a pas encore été revendiquée par l’établissement.
            </p>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              <button type="button" onClick={claimRestaurant} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90">
                <ShieldCheck className="h-4 w-4" /> Revendiquer mon restaurant
              </button>
              <button type="button" onClick={() => void openRemoval()} className="inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/5">
                <Trash2 className="h-4 w-4" /> Supprimer mon restaurant
              </button>
            </div>
          </div>
        </div>
      </aside>

      {removalOpen ? (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="directory-removal-title">
          <div className="max-h-[94dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl bg-background p-5 shadow-2xl sm:rounded-2xl sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 id="directory-removal-title" className="text-xl font-bold">Demander la suppression de {restaurant.name}</h2>
                <p className="mt-1 text-sm text-muted-foreground">La suppression n’est jamais automatique. TOK vérifie d’abord que la personne qui fait la demande est habilitée à représenter l’établissement.</p>
              </div>
              <button type="button" aria-label="Fermer" onClick={() => setRemovalOpen(false)} className="rounded-full p-2 hover:bg-muted"><X className="h-5 w-5" /></button>
            </div>

            {submitted ? (
              <div className="mt-6 rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-emerald-950 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100">
                <div className="flex gap-3"><CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" /><div><p className="font-semibold">Demande enregistrée</p><p className="mt-1 text-sm">La fiche reste visible pendant la vérification des justificatifs. Elle ne sera supprimée qu’après validation de la propriété ou du pouvoir de représentation.</p></div></div>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-1 text-sm"><span className="font-medium">Nom du demandeur *</span><input value={removalForm.requesterName} onChange={(event) => setRemovalForm((current) => ({ ...current, requesterName: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" /></label>
                  <label className="space-y-1 text-sm"><span className="font-medium">E-mail *</span><input type="email" value={removalForm.requesterEmail} onChange={(event) => setRemovalForm((current) => ({ ...current, requesterEmail: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" /></label>
                  <label className="space-y-1 text-sm sm:col-span-2"><span className="font-medium">Téléphone</span><input value={removalForm.requesterPhone} onChange={(event) => setRemovalForm((current) => ({ ...current, requesterPhone: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" /></label>
                </div>

                <div className="rounded-xl border bg-muted/30 p-4">
                  <div className="mb-3 flex items-start gap-2"><FileCheck2 className="mt-0.5 h-5 w-5 shrink-0 text-primary" /><div><p className="font-semibold">Justificatifs obligatoires</p><p className="text-xs text-muted-foreground">Fichiers privés, PDF/JPG/PNG/WebP, 10 Mo maximum chacun.</p></div></div>
                  <div className="space-y-3 text-sm">
                    <label className="block space-y-1"><span className="font-medium">Extrait récent du registre du commerce ou document officiel équivalent *</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setRegistryDocument(event.target.files?.[0] || null)} className="block w-full text-sm" /></label>
                    <label className="block space-y-1"><span className="font-medium">Pièce d’identité du propriétaire/gérant ou preuve de représentation *</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setIdentityDocument(event.target.files?.[0] || null)} className="block w-full text-sm" /></label>
                    <label className="block space-y-1"><span className="font-medium">Procuration ou mandat (si nécessaire)</span><input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" onChange={(event) => setMandateDocument(event.target.files?.[0] || null)} className="block w-full text-sm" /></label>
                  </div>
                </div>

                <label className="block space-y-1 text-sm"><span className="font-medium">Motif ou précision</span><textarea rows={3} value={removalForm.reason} onChange={(event) => setRemovalForm((current) => ({ ...current, reason: event.target.value }))} className="w-full rounded-md border bg-background px-3 py-2" placeholder="Précisez votre fonction dans l’établissement ou toute information utile à la vérification." /></label>
                {errorMessage ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</p> : null}
                <button type="button" disabled={submitting} onClick={() => void submitRemoval()} className="inline-flex min-h-11 w-full items-center justify-center rounded-lg bg-destructive px-4 py-2 font-semibold text-destructive-foreground disabled:opacity-60">
                  {submitting ? "Envoi et vérification des documents…" : "Envoyer ma demande de suppression"}
                </button>
                <p className="text-xs leading-relaxed text-muted-foreground">En envoyant cette demande, vous certifiez être propriétaire, gérant ou représentant habilité du restaurant. Les documents sont utilisés uniquement pour vérifier cette demande.</p>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
