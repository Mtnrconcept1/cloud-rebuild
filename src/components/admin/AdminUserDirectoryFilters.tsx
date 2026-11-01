import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_USER_FILTERS, DIRECTORY_ROLES, type AdminUserFilters } from "@/lib/adminUserDirectory";

const ROLE_LABELS: Record<string, string> = { client: "Client", restaurateur: "Restaurateur", courier: "Livreur", commercial: "Commercial", admin: "Admin" };
const PRESENCE = [["all", "Indifférent"], ["present", "Renseigné"], ["missing", "Non renseigné"]];
type SelectKey = Exclude<keyof AdminUserFilters, "roles">;
const STATUS = [["all", "Tous"], ["none", "Aucun dossier"], ["pending_review", "En attente"], ["approved", "Approuvé"], ["needs_changes", "À compléter"], ["rejected", "Refusé"]];
type Props = {
  filters: AdminUserFilters;
  onChange: (filters: AdminUserFilters) => void;
  roleCounts: Record<string, number>;
  anomalyLabels: Record<string, string>;
  resultCount: number; totalCount: number;
};

export default function AdminUserDirectoryFilters({ filters, onChange, roleCounts, anomalyLabels, resultCount, totalCount }: Props) {
  const set = <K extends keyof AdminUserFilters>(key: K, value: AdminUserFilters[K]) => onChange({ ...filters, [key]: value });
  const select = (label: string, key: SelectKey, options: string[][]) => (
    <label className="grid gap-1 text-sm">
      <span>{label}</span>
      <select className="h-10 min-w-0 rounded-md border bg-background px-3 text-sm" value={String(filters[key])}
        onChange={(event) => set(key, event.target.value as AdminUserFilters[SelectKey])}>
        {options.map(([value, title]) => <option key={value} value={value}>{title}</option>)}
      </select>
    </label>
  );
  const input = (label: string, key: "name" | "email" | "city" | "emailDomain" | "createdFrom" | "createdTo", type = "text") => (
    <label className="grid gap-1 text-sm"><span>{label}</span><Input type={type} value={filters[key]} onChange={(event) => set(key, event.target.value)} /></label>
  );
  return (
    <section aria-label="Recherche et filtres utilisateurs" className="space-y-4 rounded-xl border bg-card p-4">
      <div className="grid gap-3 md:grid-cols-[1fr_auto]">
        <label className="grid gap-1 text-sm"><span>Recherche globale</span>
          <Input placeholder="Nom, email, ville, rôle, statut ou ID..." value={filters.search} onChange={(event) => set("search", event.target.value)} />
        </label>
        {select("Trier les utilisateurs", "sort", [
          ["name_asc", "Nom : A → Z"], ["name_desc", "Nom : Z → A"], ["email_asc", "Email : A → Z"], ["email_desc", "Email : Z → A"],
          ["city_asc", "Ville : A → Z"], ["city_desc", "Ville : Z → A"], ["created_desc", "Inscription : plus récents"], ["created_asc", "Inscription : plus anciens"],
        ])}
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Types de comptes à afficher</legend>
        <div className="flex flex-wrap gap-2">
          {DIRECTORY_ROLES.map((role) => (
            <label key={role} className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-sm">
              <input type="checkbox" className="h-4 w-4 accent-primary" checked={filters.roles.includes(role)}
                onChange={(event) => set("roles", event.target.checked ? [...filters.roles, role] : filters.roles.filter((item) => item !== role))} />
              {ROLE_LABELS[role]} ({roleCounts[role] || 0})
            </label>
          ))}
          <Button type="button" size="sm" variant="ghost" onClick={() => set("roles", [...DIRECTORY_ROLES])}>Tout cocher</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => set("roles", [])}>Tout décocher</Button>
        </div>
        <div className="max-w-sm">{select("Correspondance des rôles", "roleMatch", [["any", "Au moins un des rôles cochés"], ["all", "Tous les rôles cochés"]])}</div>
      </fieldset>
      <details>
        <summary className="cursor-pointer py-2 text-sm font-medium">Filtres avancés</summary>
        <div className="grid gap-3 pt-3 sm:grid-cols-2 xl:grid-cols-4">
          {input("Nom contient", "name")}
          {input("Email contient", "email")}
          {input("Ville contient", "city")}
          {input("Domaine email exact", "emailDomain")}
          {select("Statut du compte", "accountStatus", [["all", "Tous"], ["active", "Actif"], ["suspended", "Suspendu"]])}
          {select("Email confirmé", "emailConfirmed", [["all", "Indifférent"], ["yes", "Oui"], ["no", "Non"]])}
          {select("Nom renseigné", "namePresence", PRESENCE)}
          {select("Email renseigné", "emailPresence", PRESENCE)}
          {select("Ville renseignée", "cityPresence", PRESENCE)}
          {select("Statut du dossier", "applicationStatus", STATUS)}
          {select("Statut du livreur", "courierStatus", [["all", "Tous"], ["none", "Aucun profil"], ["pending_approval", "En attente"], ["approved", "Approuvé"], ["suspended", "Suspendu"], ["rejected", "Refusé"]])}
          {select("Anomalies", "anomaly", [["all", "Indifférent"], ["any", "Avec anomalie"], ["none", "Sans anomalie"], ...Object.entries(anomalyLabels)])}
          {select("Période d'inscription", "createdDays", [["all", "Toute période"], ["7", "7 derniers jours"], ["30", "30 derniers jours"], ["90", "90 derniers jours"], ["365", "365 derniers jours"]])}
          {input("Inscrit depuis le (Suisse)", "createdFrom", "date")}
          {input("Inscrit jusqu'au (Suisse)", "createdTo", "date")}
        </div>
        {filters.createdFrom && filters.createdTo && filters.createdFrom > filters.createdTo
          ? <p role="alert" className="mt-2 text-sm text-destructive">La date de début doit précéder la date de fin.</p> : null}
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
        <p role="status" className="text-sm text-muted-foreground">{resultCount} utilisateur{resultCount > 1 ? "s" : ""} sur {totalCount}</p>
        <Button type="button" variant="outline" size="sm" onClick={() => onChange({ ...DEFAULT_USER_FILTERS, roles: [...DIRECTORY_ROLES] })}>Réinitialiser les filtres</Button>
      </div>
      <p className="text-xs text-muted-foreground">Les critères se cumulent. Le CSV reprend tous les résultats filtrés, dans cet ordre, avec les rôles enregistrés. Un email confirmé ne constitue pas un consentement marketing.</p>
    </section>
  );
}
