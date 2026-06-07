# Audit SECURITY DEFINER executable by anon

Date: 2026-06-07
Projet Supabase: `wwcrtyoueexyxkkikaos`
Advisor: `anon_security_definer_function_executable`
Remediation Supabase: https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable

Cet audit formalise le traitement des alertes Supabase Advisor remontees le 7 juin 2026. Les revocations sont livrees dans la migration `20260607033000_platform_finance_sales_governance.sql` et doivent etre appliquees par le workflow habituel du repo.

## Regle

Une fonction `SECURITY DEFINER` ne doit etre executable par `anon` que si elle est explicitement publique, ne revele aucune donnee privee et ne peut pas muter de donnees sensibles. Les fonctions de controle d'acces utilisees par les policies RLS restent disponibles pour `authenticated`, mais pas pour `anon`.

## Classification

| Fonction | Classement | Decision | Justification |
| --- | --- | --- | --- |
| `auth_can_access_branch(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Verifie l'acces a une branche de restaurant; aucun usage public direct n'est attendu. |
| `auth_can_access_cart(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Retourne un booleen d'acces panier; les visiteurs anonymes ne doivent pas appeler ce RPC directement. |
| `auth_can_access_cart_item(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Verifie l'acces a une ligne panier; usage public direct inutile. |
| `auth_can_access_credit_note(uuid)` | helper facturation authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Controle l'acces a un avoir; donnees de paiement/facturation sensibles. |
| `auth_can_access_legacy_invoice(text, uuid, uuid)` | helper facturation authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Controle l'acces aux anciennes factures; ne doit pas etre appele anonymement. |
| `auth_can_access_order(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Retourne un booleen d'acces commande; utile aux utilisateurs connectes uniquement. |
| `auth_can_access_order_item(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Verifie l'acces a une ligne de commande; rattache a des donnees client/restaurant. |
| `auth_can_access_reservation_record(uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Controle l'acces a une reservation; donnees personnelles et operationnelles. |
| `auth_can_manage_dish(uuid)` | helper restaurateur authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Verifie l'ownership menu/plat. |
| `auth_can_manage_dish_modifier_group(uuid)` | helper restaurateur authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Verifie l'ownership des options de plat. |
| `auth_can_manage_inventory_item(uuid)` | helper restaurateur authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Controle l'inventaire restaurant. |
| `auth_can_manage_menu_category(uuid)` | helper restaurateur authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Controle les categories de menu. |
| `auth_can_manage_reservation_slot(uuid, uuid)` | helper operations restaurant | a revoquer pour `anon`, conserver pour `authenticated` | Controle la gestion des tables et creneaux. |
| `auth_can_manage_table_layout_override(uuid, uuid)` | helper operations restaurant | a revoquer pour `anon`, conserver pour `authenticated` | Controle les overrides de plan de salle. |
| `auth_can_view_reservation_slot(uuid, uuid)` | helper RLS authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Visibilite de creneaux liee a des reservations. |
| `donate_points_for_meal(integer, text)` | mutation sensible fidelite/Miamz | a revoquer pour `anon`, conserver pour `authenticated` | Debite des points, ecrit une transaction et une donation. |
| `enqueue_deliveries(uuid)` | mutation interne notifications | a revoquer pour `anon` et `authenticated`, reserver a `service_role` | Enfile des notifications; doit rester serveur/cron. |
| `ensure_guest_profile(uuid, uuid, text)` | mutation interne profil/marketing | a revoquer pour `anon` et `authenticated`, reserver a `service_role` | Cree ou complete un profil invite; usage direct public trop large. |
| `estimate_campaign_audience(uuid, jsonb)` | estimation restaurateur via Edge Function | a revoquer pour `anon`, conserver pour `authenticated` | Utilisee par `campaign-portal` avec utilisateur connecte; ne doit pas etre callable anonymement. |
| `get_customer_orders_dashboard()` | dashboard client authentifie | a revoquer pour `anon`, conserver pour `authenticated` | Retourne les commandes du client courant; aucun acces anonyme. |
| `get_match_group_public_feed()` | publique volontaire | conserver pour `anon` et `authenticated` | Flux public Match Groupes sans mutation. L'exception doit rester surveillee par tests et monitoring. |

## Migration appliquee

La migration `20260607033000_platform_finance_sales_governance.sql` contient :

- `REVOKE EXECUTE` sur les helpers RLS/facturation/menu/reservation pour `PUBLIC` et `anon`.
- `REVOKE EXECUTE` sur `donate_points_for_meal(integer, text)` pour `PUBLIC` et `anon`.
- `REVOKE EXECUTE` sur `enqueue_deliveries(uuid)` et `ensure_guest_profile(uuid, uuid, text)` pour `PUBLIC`, `anon` et `authenticated`, puis `GRANT` a `service_role`.
- `GRANT EXECUTE` conserve pour `authenticated` quand la fonction est encore necessaire aux flows connectes.
- `GRANT EXECUTE` explicite pour `get_match_group_public_feed()` a `anon` et `authenticated`, car cette fonction est classee publique volontaire.

## Prochaine passe Supabase Advisor

Apres application en environnement cible, relancer Supabase Advisors et comparer les warnings restants. Toute nouvelle fonction `SECURITY DEFINER` executable par `anon` doit etre ajoutee a ce tableau avec l'une des decisions suivantes :

- publique volontaire ;
- a revoquer ;
- a passer en `SECURITY INVOKER` ;
- a deplacer dans un schema prive ;
- a remplacer par une Edge Function.

Une fonction non classee ne doit pas etre consideree comme validee.
