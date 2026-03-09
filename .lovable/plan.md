

# Audit complet et plan d'améliorations — Plateforme Miamz

---

## A. Bugs et erreurs actifs

### A1. Warnings React `forwardRef`
- `PriceRangeIcons.tsx` : Le composant `DollarBill` reçoit une ref sans `forwardRef`. Même chose pour `RestaurantCard` utilisé dans `Index.tsx`.
- **Fix** : Envelopper `DollarBill` avec `React.forwardRef` ou supprimer les refs passées.

### A2. Triggers SQL non déployés
- La section `<db-triggers>` indique "There are no triggers in the database" alors que les migrations créent 5+ triggers (audit, loyalty, tier). Les migrations n'ont probablement pas été exécutées avec succès.
- **Fix** : Vérifier et redéployer les migrations de triggers en une seule migration consolidée.

### A3. `validate-order` — `getClaims` n'existe pas
- L'edge function utilise `supabaseUser.auth.getClaims(token)` qui n'est pas une méthode standard du SDK Supabase JS v2.
- **Fix** : Remplacer par `supabaseUser.auth.getUser(token)` pour extraire le `user_id`.

### A4. `as any` omniprésents
- Nombreux casts `as any` sur les requêtes Supabase (`profiles as any`, `email_queue as any`, `supabase.rpc as any`). Cela indique que le fichier `types.ts` n'est pas synchronisé avec le schéma réel.
- **Fix** : Régénérer les types Supabase (automatique après migration) et supprimer les casts.

---

## B. Sécurité

### B1. Hardcoded test email dans Auth.tsx
- `email === "rbarman@hotmail.ch"` permet un changement de rôle arbitraire via `set_test_role`. C'est une faille de sécurité majeure en production.
- **Fix** : Supprimer ce bloc ou le conditionner à un feature flag `dev_mode` vérifié côté serveur.

### B2. `set_test_role` — SECURITY DEFINER sans restriction
- La fonction `set_test_role` permet à n'importe quel utilisateur authentifié de se donner n'importe quel rôle (admin inclus).
- **Fix** : Supprimer cette fonction ou la restreindre à un admin via `has_role(auth.uid(), 'admin')`.

### B3. `validate-order` — `verify_jwt = false`
- L'edge function de validation de commande ne vérifie pas le JWT au niveau du gateway. L'authentification est faite manuellement dans le code, mais c'est un risque si le code change.
- **Fix** : Passer `verify_jwt = true` dans `config.toml` pour `validate-order`.

### B4. RLS policies `RESTRICTIVE` (pas `PERMISSIVE`)
- Toutes les RLS policies sont `RESTRICTIVE` (`Permissive: No`). Cela signifie qu'elles doivent TOUTES être satisfaites simultanément, ce qui peut bloquer des accès légitimes si plusieurs policies existent sur la même commande (ex: `SELECT` sur `orders` a 2 policies restrictives — un restaurateur qui est aussi client ne verra rien).
- **Fix** : Auditer les policies et convertir les appropriées en `PERMISSIVE` (comportement OR au lieu de AND).

---

## C. Cohérence métier

### C1. Zero Attente encore dans le panier
- Malgré la conversion de `ZeroAttente.tsx` vers le flux réservation, `Panier.tsx` contient encore de la logique `isZeroAttente` (lignes 39-44, 143-148, 240-241, 309-310). Code mort qui complexifie le flux.
- **Fix** : Supprimer toute la logique `isZeroAttente` de `Panier.tsx`.

### C2. Chef's Table drops — logique orpheline dans `validate-order`
- L'edge function gère des `specialItems` non-UUID pour les chef drops, mais Chef's Table est maintenant une réservation. Ce code est mort.
- **Fix** : Nettoyer le code des special items dans `validate-order`.

### C3. `create_order_with_items` RPC — doublon avec edge function
- La fonction RPC `create_order_with_items` fait la même validation de prix que l'edge function `validate-order`. Double logique, risque de divergence.
- **Fix** : La RPC devrait se limiter à l'insertion (appelée par l'edge function avec service role). Supprimer la validation de prix de la RPC.

### C4. Emails — pas de vrai provider
- `send-email` edge function log les emails en console sans les envoyer. L'email queue n'est jamais vidée automatiquement (pas de cron).
- **Fix** : Intégrer un provider (Resend, SendGrid) ou planifier un appel cron via `pg_cron` ou un webhook externe.

---

## D. Performance

### D1. Page Index — 774 lignes, 30+ imports
- Composant monolithique. Difficile à maintenir et lent au premier render.
- **Fix** : Extraire les sections (Hero, Categories, Features, RestaurantList) en sous-composants.

### D2. Panier — 685 lignes
- Même problème. Logique de checkout, affichage, formules, loyalty, flex — tout dans un seul fichier.
- **Fix** : Extraire `CheckoutForm`, `CartItemList`, `LoyaltySection`, `FlexOptions` en composants séparés.

### D3. Pas de pagination sur les requêtes admin
- `AdminHome` charge les 10 dernières commandes et 15 logs d'audit. Pas de pagination pour l'historique complet.
- **Fix** : Ajouter une pagination infinie ou par page.

### D4. `DashboardHome` — requête `maybeSingle` pour le restaurant
- Si un restaurateur a plusieurs restaurants, seul le premier est affiché. Le hook `useOwnerRestaurants` existe mais n'est pas utilisé dans `DashboardHome`.
- **Fix** : Utiliser `useOwnerRestaurants` et ajouter un sélecteur de restaurant.

---

## E. UX / Frontend

### E1. Pas de gestion d'erreur globale
- Aucun `ErrorBoundary` React. Une erreur dans un composant enfant crash toute l'application.
- **Fix** : Ajouter un `ErrorBoundary` au niveau de `App.tsx`.

### E2. Pas de feedback loading sur Auth
- Le bouton de connexion n'a pas d'état disabled/loading visible pendant la soumission.
- **Fix** : Ajouter `disabled={loading}` et un spinner sur le bouton.

### E3. Suivi commande — simulation hardcodée Paris
- `SuiviCommande.tsx` utilise des coordonnées hardcodées de Paris (48.8566, 2.3522) pour la simulation. L'app est suisse (CHF).
- **Fix** : Utiliser les coordonnées du restaurant et de l'adresse de livraison depuis la commande.

### E4. Pas de page "Mot de passe oublié"
- Aucun flux de reset password.
- **Fix** : Ajouter un lien "Mot de passe oublié" qui appelle `supabase.auth.resetPasswordForEmail`.

---

## F. Infrastructure / DevOps

### F1. Pas de tests
- `src/test/example.test.ts` est un placeholder. Aucun test unitaire ou d'intégration.
- **Fix** : Ajouter des tests pour les flux critiques (checkout, loyalty, réservation).

### F2. Pas de validation Zod côté frontend
- Zod est installé mais jamais utilisé pour valider les formulaires (checkout, profil, réservation).
- **Fix** : Ajouter des schémas Zod pour les formulaires critiques.

---

## G. Priorités d'implémentation recommandées

| Priorité | Ticket | Effort |
|----------|--------|--------|
| **P0** | B1+B2 : Supprimer `set_test_role` et le hardcoded email | 15 min |
| **P0** | A3 : Corriger `getClaims` dans `validate-order` | 10 min |
| **P0** | A2 : Vérifier/redéployer les triggers SQL | 20 min |
| **P0** | B4 : Auditer les RLS policies restrictives | 30 min |
| **P1** | C1 : Nettoyer la logique Zero Attente du panier | 20 min |
| **P1** | C2 : Nettoyer les special items de validate-order | 10 min |
| **P1** | E3 : Coordonnées suivi commande dynamiques | 15 min |
| **P1** | E1 : Ajouter ErrorBoundary | 10 min |
| **P1** | E4 : Flux mot de passe oublié | 20 min |
| **P2** | D1+D2 : Refactoring Index + Panier | 1h |
| **P2** | C3 : Simplifier RPC create_order_with_items | 30 min |
| **P2** | C4 : Intégrer un vrai email provider | 1h |
| **P2** | A1 : Fix forwardRef warnings | 10 min |
| **P2** | B3 : verify_jwt=true pour validate-order | 5 min |
| **P3** | D3+D4 : Pagination admin + multi-restaurant dashboard | 1h |
| **P3** | F1+F2 : Tests + validation Zod | 2h |

