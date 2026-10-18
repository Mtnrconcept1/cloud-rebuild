import { TOK_OAUTH_OWNER_SCOPES, TOK_OAUTH_RESTAURANT_SCOPES, TOK_OAUTH_SCOPE_LABELS, type TokOAuthRestaurant } from "@/lib/tokOAuth";

type Props = {
  scopes: string[]; restaurantIds: string[]; restaurants: TokOAuthRestaurant[];
  onScopesChange: (scopes: string[]) => void; onRestaurantIdsChange: (ids: string[]) => void; disabled?: boolean;
};
export default function TokOAuthPermissions({ scopes, restaurantIds, restaurants, onScopesChange, onRestaurantIdsChange, disabled = false }: Props) {
  const requireOwner = scopes.some((scope) => TOK_OAUTH_OWNER_SCOPES.has(scope));
  const needsRestaurants = scopes.some((scope) => TOK_OAUTH_RESTAURANT_SCOPES.has(scope));
  const eligible = restaurants.filter((restaurant) => !requireOwner || restaurant.is_owner);
  const toggleScope = (scope: string, checked: boolean) => {
    const next = checked ? [...scopes, scope] : scopes.filter((value) => value !== scope);
    if (next.some((value) => TOK_OAUTH_OWNER_SCOPES.has(value))) {
      onRestaurantIdsChange(restaurantIds.filter((id) => restaurants.some((restaurant) => restaurant.id === id && restaurant.is_owner)));
    }
    onScopesChange(next);
  };
  return <fieldset disabled={disabled} className="space-y-4">
    <legend className="mb-3 text-sm font-bold">Permissions TOK choisies</legend>
    <p className="text-sm text-muted-foreground">Seules les permissions cochées sont accordées, pour 90 jours. Aucun droit administrateur n’est transmis. Vous pouvez réduire ou révoquer ces accès dans la sécurité de votre compte.</p>
    <div className="grid gap-2">
      {Object.entries(TOK_OAUTH_SCOPE_LABELS).map(([scope, label]) => <label key={scope} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
        <input type="checkbox" checked={scopes.includes(scope)} onChange={(event) => toggleScope(scope, event.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
        <span>{label}</span>
      </label>)}
    </div>
    {needsRestaurants && <div className="space-y-2 rounded-xl border p-4">
      <h3 className="text-sm font-bold">Restaurants autorisés</h3>
      <p className="text-xs text-muted-foreground">{requireOwner ? "La gestion détaillée et les générations sont réservées aux restaurants dont vous êtes propriétaire." : "Vos rôles actuels dans chaque restaurant continuent à limiter les actions possibles."}</p>
      {eligible.length ? eligible.map((restaurant) => <label key={restaurant.id} className="flex items-center gap-3 py-2 text-sm">
        <input type="checkbox" checked={restaurantIds.includes(restaurant.id)} onChange={(event) => onRestaurantIdsChange(event.target.checked ? [...restaurantIds, restaurant.id] : restaurantIds.filter((id) => id !== restaurant.id))} className="h-4 w-4" />
        {restaurant.name}
      </label>) : <p className="text-sm">Aucun restaurant éligible. Activez TOK Connect dans votre restaurant avant de déléguer sa gestion.</p>}
    </div>}
  </fieldset>;
}
