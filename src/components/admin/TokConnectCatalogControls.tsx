import { Button } from "@/components/ui/button";
import type { CatalogAccess, CatalogCategory } from "@/hooks/useTokConnectAdminCatalog";

type Props = {
  category: CatalogCategory;
  access: CatalogAccess;
  onCategory: (category: CatalogCategory) => void;
  onAccess: (access: CatalogAccess) => void;
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  error: string | null;
  onPage: (page: number) => void;
};

export default function TokConnectCatalogControls(props: Props) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4">
        <label className="text-sm font-semibold">Établissements
          <select className="ml-2 rounded-xl border bg-background p-2" value={props.category}
            onChange={(event) => props.onCategory(event.target.value as CatalogCategory)}>
            <option value="all">Tous</option>
            <option value="partner">Restaurants revendiqués</option>
            <option value="directory">Annuaire public</option>
          </select>
        </label>
        <label className="text-sm font-semibold">Accès MCP
          <select className="ml-2 rounded-xl border bg-background p-2" value={props.access}
            onChange={(event) => props.onAccess(event.target.value as CatalogAccess)}>
            <option value="all">Tous</option>
            <option value="enabled">Autorisés</option>
            <option value="revoked">Révoqués</option>
          </select>
        </label>
      </div>
      {props.error ? <p role="alert" className="text-sm text-destructive">{props.error}</p> : null}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" disabled={props.loading || props.page === 0}
          onClick={() => props.onPage(props.page - 1)}>Précédent</Button>
        <span className="text-center text-xs text-muted-foreground" aria-live="polite">
          {props.loading ? "Recherche en cours…" : `${props.total} résultats — page ${props.page + 1}/${Math.max(1, Math.ceil(props.total / props.pageSize))}`}
        </span>
        <Button variant="outline"
          disabled={props.loading || (props.page + 1) * props.pageSize >= props.total}
          onClick={() => props.onPage(props.page + 1)}>Suivant</Button>
      </div>
    </>
  );
}
