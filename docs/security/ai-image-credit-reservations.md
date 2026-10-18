# Réservation des crédits pour les images IA

## Portée et invariants

Cette correction couvre `ai-image-enhance`, ses téléchargements d’images et le registre natif de crédits. Elle ajoute une admission durable avant les appels payants. Elle ne crée pas de portefeuille parallèle, ne change pas les prix des images et ne modifie pas les fonctions historiques de facturation.

Une intention de génération respecte les invariants suivants :

- Une seule transaction peut en devenir propriétaire. Les requêtes concurrentes avec la même clé ne reçoivent jamais le jeton du travailleur.
- La réservation de 6 ou 12 crédits est enregistrée avant l’appel fournisseur, sous le verrou `tok_credit_spend:<restaurant>` déjà employé par les écritures financières natives.
- L’insertion dans `ai_usage_logs` exécute les véritables normalisations et contrôles de solde. Les crédits de préactivation, abonnements, recharges, cadeaux administrateur et droits internes vérifiés suivent leurs règles existantes.
- La finalisation met à jour cette même ligne. Elle ne peut pas augmenter les unités, changer le restaurant ou l’acteur, déplacer la date de consommation, ni consommer une seconde fois un cadeau.
- Une réponse perdue, un délai dépassé, un résultat fournisseur incomplet ou une finalisation incertaine conservent la réservation. Aucune expiration automatique ne permet un nouvel appel payant pour cette clé.
- Une libération exige un état de nettoyage explicite et une preuve que les actifs concernés ne restent pas disponibles. Elle restaure exactement les allocations des cadeaux d’origine, avec leurs dates d’expiration inchangées.

## Contrat d’idempotence

Chaque appel natif doit fournir `Idempotency-Key` ou `body.idempotency_key`. L’alias `body.idempotencyKey` est accepté. Les valeurs doivent être identiques si plusieurs formes sont présentes. Format : `^[A-Za-z0-9_.:-]{8,200}$`.

Une clé manquante renvoie HTTP 400 `image_idempotency_key_required`. Une clé invalide renvoie `image_idempotency_key_invalid`. Une clé réutilisée avec un autre contenu, un autre restaurant ou un autre nombre d’unités renvoie HTTP 409 `image_idempotency_conflict`.

Le condensat SHA-256 couvre le corps JSON canonique, avec les propriétés d’objets triées et l’ordre des tableaux conservé. Seuls les champs de clé à la racine sont exclus. Le serveur dérive le prix des paramètres normalisés ; il n’accepte aucun prix envoyé par le client. La seed effectivement retenue est conservée dans le registre.

Le client central conserve une clé par intention et par session utilisateur. Une nouvelle intention peut être ouverte après un succès ou après `image_generation_failed`, qui est réservé à une libération confirmée. Une erreur réseau, une interruption ou `image_operation_pending` conserve la clé. Les anciens appelants natifs sans clé reçoivent une erreur explicite avant tout coût.

| État durable | Réponse de reprise | Crédit et action suivante |
| --- | --- | --- |
| `reserved` | HTTP 409, `image_operation_pending`, `retry_safe:false` | Réservé ; un seul travailleur possède l’admission |
| `provider_started` | Même réponse d’attente | Réservé ; aucun second travailleur |
| `indeterminate` | Même réponse d’attente | Réservé ; réconciliation nécessaire |
| `cleanup_pending` | Même réponse d’attente | Réservé tant que le nettoyage reste incertain |
| `completed` | HTTP 200 avec le résultat durable d’origine | Même actif et même débit ; aucune nouvelle génération |
| `failed` | HTTP 502, `image_generation_failed`, `retry_safe:true` | Réservation libérée ; cette clé reste terminale |

Le résultat durable n’allonge pas la validité des URL signées qu’il contient. Une reprise retourne le résultat d’origine, et non une nouvelle génération.

## Registre et permissions

La migration `20261018141000_ai_image_credit_reservations.sql` crée deux tables dans `private_finance` :

- `ai_image_operations` relie utilisateur, restaurant, clé, condensat, unités, usage natif, actif déterministe, seed, état et résultat.
- `ai_image_credit_releases` conserve les allocations de cadeaux restaurées, leur lot d’origine et la justification de libération.

RLS est activée. Aucun droit direct n’est accordé à `anon`, `authenticated` ou `service_role` sur ces tables. Les quatre RPC publiques sont `SECURITY DEFINER`, ont un `search_path` vide, vérifient explicitement `auth.role()='service_role'` et sont exécutables uniquement par `service_role` :

1. `claim_ai_image_operation` vérifie l’identité et le restaurant, déduplique la clé et insère la réservation native atomiquement.
2. `advance_ai_image_operation` persiste le début du fournisseur ou l’état de réconciliation/nettoyage, avec le jeton du travailleur.
3. `finalize_ai_image_operation` crée l’actif, met à jour l’usage et stocke le résultat dans la même transaction.
4. `release_ai_image_operation` restaure les lots de cadeaux d’origine puis rend l’usage non facturable et l’opération terminale, dans la même transaction.

Les clés étrangères restrictives empêchent la suppression d’une ligne d’usage toujours liée au registre. Une purge future doit traiter explicitement la rétention de l’idempotence ; supprimer une clé puis la réadmettre peut recréer un coût.

### Interaction avec les triggers financiers

La ligne réservée contient `action='image_credit_reservation'`, `status='success'`, un coût estimé nul et les métadonnées `billing_phase='reserved'`, `generated_image=false`, `image_operation_id`, `credit_units` et `requested_output_credit_units`.

Ce statut signifie que **la réservation a réussi**. L’interface doit afficher une réservation ou une opération en cours. Elle ne doit pas afficher une image générée à partir du seul statut `success`. La finalisation met `action='image_enhance'`, `billing_phase='completed'` et `generated_image=true`. La libération met `status='failure'` et `billing_phase='released'`.

Le trigger historique `apply_admin_ai_gift_on_usage` quitte sans consommer à nouveau lorsque l’ancienne ligne est déjà `success`. La finalisation conserve le marqueur de cadeau réellement établi par ce trigger et ignore une valeur proposée dans le nouveau JSON. La vérité financière reste constituée par les lignes `admin_ai_credit_spends`.

Le nouveau contrôle `zzz_guard_ai_image_reservation_usage` s’exécute **après** les triggers de normalisation. Il vérifie les valeurs finales des unités et du coût, y compris si un autre trigger a tenté d’augmenter les unités à partir du coût. Une ligne libérée ne peut pas être remise à `success`.

La libération restaure `remaining` sur chaque lot réellement consommé et archive l’allocation avant de supprimer le spend correspondant. Elle ne crée aucun cadeau, ne prolonge aucune expiration et ne transforme pas un crédit ancien en crédit de la période actuelle. Les soldes ordinaires sont recalculés par les fonctions natives à partir du statut non facturable.

Le droit interne MTNR reste lié au propriétaire vérifié. Un membre du personnel ne l’hérite pas ; il ne finance pas les campagnes publicitaires. La réservation ne remplace ni les limitations de fréquence ni la facturation OpenAI.

## Résultat fournisseur et échecs

Chaque tentative fournisseur reçoit `X-Client-Request-Id: tok-image-<operation_id>-<tentative>`. C’est un identifiant de diagnostic, **pas une garantie d’idempotence du fournisseur**. La valeur `x-request-id` renvoyée par le fournisseur est conservée dans l’usage final et les diagnostics d’échec lorsqu’elle a été reçue. Le format client permet de rechercher les tentatives 1 à 3 à partir de l’opération.

Le serveur persiste `provider_started` avant le POST. Seule une réponse explicitement refusée peut admettre une nouvelle tentative du même travailleur, au maximum trois. Les chemins de repli applicatifs sont limités aux refus HTTP 400 qu’ils savent traiter. Il n’y a aucun repli automatique après timeout, HTTP 5xx ou corps de réponse incomplet.

Une réponse HTTP 2xx reste incertaine tant que son JSON n’a pas été intégralement lu dans les limites. Si le fournisseur a livré une réponse complète mais que la préparation ou le stockage de l’image échoue de manière déterminée, le serveur peut nettoyer les actifs et libérer la réservation. Le coût fournisseur éventuel reste à la charge de TOK ; aucun actif conservé ne doit accompagner un remboursement des crédits.

Les deux chemins Storage sont déterministes et n’autorisent pas l’écrasement :

- Dans `TOK_AI_IMAGE_BUCKET` (défaut `ai-generated-assets`) : `ai-generated/<restaurant>/<asset>.png`.
- Dans `restaurant-images` : `<restaurant>/ai-gallery/<asset>.png`.

Avant le premier upload, le travailleur marque localement l’issue Storage comme incertaine. Ce marqueur n’est retiré qu’après la réussite déclarée des deux uploads. Un DELETE qui réussit immédiatement après une réponse d’upload perdue ne prouve pas qu’un écrivain tardif ne publiera pas encore l’actif : l’opération reste alors `cleanup_pending`, sans libération automatique.

Si la réponse de finalisation est perdue, le travailleur relit d’abord la clé durable. Une opération déjà `completed` est rejouée sans suppression. Une lecture impossible conserve la réservation et les actifs pour réconciliation.

## Réconciliation opérateur

Il n’existe pas de réinitialisation automatique des opérations anciennes. Utiliser un accès opérateur autorisé à la base, et limiter les lectures aux opérations concernées.

1. Retrouver l’opération, son usage, ses journaux de diagnostic et les identifiants fournisseur correspondants. Vérifier la réalité de l’issue fournisseur. Un simple âge élevé de l’opération ne constitue pas une preuve d’échec.
2. Vérifier que l’ancien travailleur et toute requête d’upload sont terminés. Une suppression préalable ne suffit pas si un upload peut encore aboutir.
3. Si une finalisation a déjà été commise, restituer son résultat. Ne pas supprimer les actifs ni libérer le débit.
4. Si un résultat complet et fiable peut être récupéré, finaliser le même actif et le même usage avec le jeton opérateur conservé. Utiliser les données réelles du fournisseur et de la demande ; ne pas fabriquer de coût, de résultat ou de prompt pour forcer la transition.
5. Si la génération ne sera pas livrée, avancer vers `cleanup_pending` avec une justification, supprimer et vérifier l’absence des deux objets après arrêt des écrivains, puis appeler `release_ai_image_operation` avec le même jeton. La RPC refuse une opération dont l’actif a déjà été finalisé en base.
6. En l’absence de preuve suffisante, conserver l’état indéterminé et poursuivre le traitement support. Ne pas créer une nouvelle clé de manière silencieuse.

Le jeton du travailleur est une capacité privée de finalisation. Il n’est pas exposé dans les réponses de reprise et ne doit pas être copié dans les diagnostics clients. Ce protocole ne suppose aucune API de récupération fournisseur qui n’existerait pas réellement.

## Bornes médias et transport réseau

`ai-image-response.ts` borne les téléchargements à 18 Mio pendant leur lecture, même sans `Content-Length` ou avec une longueur annoncée fausse. Le JSON fournisseur est borné à deux images de 18 Mio encodées en base64 plus 64 Kio de métadonnées. Le décodeur vérifie la taille encodée et la taille décodée avant allocation. Les corps bloqués ont un délai de lecture et sont annulés ; une annulation qui ne répond pas ne bloque pas indéfiniment l’erreur.

Les URL d’images utilisateur et les URL d’images retournées par le fournisseur passent par `fetchPublicUrl`. La validation DNS examine toutes les réponses A/AAAA. Une réponse privée, locale, de documentation ou de transition interdite suffit à rejeter le nom, y compris les notations IPv4 mappées en IPv6 développées.

La connexion n’utilise pas un second `fetch` qui résoudrait à nouveau le nom : `pinned-public-http.ts` ouvre `Deno.connect` sur l’adresse IP validée, puis `Deno.startTls` sur **cette même connexion**, avec le hostname original, les autorités de certification normales et un handshake terminé avant l’envoi HTTP. `Host` conserve le nom original. Aucun contournement de certificat n’est permis.

Le transport commun est limité à GET, HEAD et POST. Les requêtes POST sont bornées à 256 Kio. Les téléchargements d’images autorisent seulement GET/HEAD et une petite liste d’en-têtes sans cookies ni autorisation. Chaque redirection est inspectée puis résolue de nouveau ; une redirection HTTPS vers HTTP est refusée. Les webhooks utilisent le même transport sans redirection automatique.

Le parseur HTTP/1.1 impose 16 Kio d’en-têtes cumulés, refuse les ambiguïtés `Content-Length`/`Transfer-Encoding`, les doublons de cadrage, les upgrades et les encodages non pris en charge. Il demande `Accept-Encoding: identity` et refuse une réponse compressée. Les tailles réellement lues, extensions de chunks et trailers sont bornées ; les consommateurs de préfixe peuvent interrompre le flux. Annulation, erreur, fin de flux et dépassement de délai ferment la connexion disponible.

Un seul délai couvre DNS, redirections, connexion, TLS et lecture d’une image publique. Limite du runtime Deno 2.1.4 : un `Deno.connect` non encore résolu n’accepte pas de signal d’annulation. L’appel applicatif expire ; si la connexion arrive ensuite, elle est immédiatement fermée sans TLS ni écriture. Le dial sous-jacent peut durer jusqu’au délai système. Ce comportement doit être distingué d’un socket déjà disponible, fermé immédiatement.

## Validation isolée

Les tests du registre exécutent les définitions financières exactes du dépôt dans une base synthétique. `ai-image-credit-fixture.mjs` extrait les tables pertinentes, les fonctions natives, leurs wrappers historiques et les triggers ; il ne remplace pas le calcul des crédits par un compteur factice. Le schéma de support contient uniquement les colonnes nécessaires aux fonctions réelles.

Commande CI PostgreSQL 17, sur une base locale vide :

```sh
TOK_AI_SECURITY_DISPOSABLE=true PGHOST=127.0.0.1 PGPORT=5432 \
PGDATABASE=tok_security_ai PGUSER=postgres \
node scripts/security/test-ai-image-credit-postgres.mjs
```

L’ordre est : fixture native, migration, réapplication de la migration, scénarios séquentiels, puis deux vagues de douze sessions PostgreSQL indépendantes. Le runner refuse un hôte distant, une base non dédiée, les surcharges de connexion et une base contenant déjà l’application. Il ne contacte aucun fournisseur.

Les scénarios vérifient la concurrence sur une clé, la concurrence de clés différentes sur quinze crédits hebdomadaires, la dernière génération d’un abonnement, les allocations de cadeaux fractionnées, la finalisation répétée, la restauration de lots expirés, le propriétaire interne et son personnel, les unités et coûts immuables, les ACL et les clés terminales.

Tests Vitest ciblés :

```sh
pnpm exec vitest run src/test/ai-image-operation.test.ts \
  src/test/ai-image-response.test.ts src/test/pinned-public-http.test.ts \
  src/test/ai-image-reference-security.test.ts src/test/tok-ai-tools.test.ts \
  src/test/restaurant-billing-account.test.ts
```

Les tests de transport utilisent des connexions synthétiques pour les cas de cadrage et d’annulation. Une fixture HTTPS locale Deno vérifie aussi le handshake réel, le hostname attendu et le refus d’une autorité inconnue. Les résultats doivent être relancés après toute reconstruction ou modification de sources ; un ancien rapport de tests ne valide pas des fichiers restitués.

## Livraison et rollback

Appliquer d’abord la migration, puis déployer l’Edge Function et ses helpers, puis les appelants clients. Une absence des RPC bloque l’admission avant le fournisseur. Le code de l’ancien client sans clé reçoit une erreur explicite ; prévoir une livraison rapprochée des appelants.

Si un rollback est nécessaire, suspendre les nouvelles admissions IA, conserver le registre et les contrôles financiers, puis réconcilier les opérations en cours. Ne pas rétablir l’ancien endpoint qui appelait le fournisseur avant la comptabilisation. Ne pas supprimer la migration, les clés durables, les allocations ou les contraintes pendant que des opérations restent ouvertes. Une reprise de service doit conserver le contrat d’idempotence et la réservation native.
