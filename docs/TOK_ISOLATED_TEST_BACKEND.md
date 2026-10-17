# Backend temporaire Stripe Test

**DRAFT — non déployé, recette Stripe Test non exécutée.** La branche payante `esmsehyxenyqewdfawie` a été supprimée après le blocage du replay ; la liste des branches confirme qu'il ne reste que main. Aucun webhook Stripe Test n'a été créé et aucun secret n'a été configuré. Ne pas fusionner ni lancer ce workflow ciblant une référence expirée.

Projet temporairement autorisé : `esmsehyxenyqewdfawie`. Aucun autre projet n'est accepté par le workflow. La production conserve sa sélection Stripe Live et ses protections webhook.

Le mode natif Test exige simultanément l'URL exacte du projet, `TOK_ISOLATED_TEST_MODE=true` et une vraie clé commençant par `sk_test_`. Un projet Test sans opt-in, un opt-in sur la production ou une clé Live font échouer la sélection. Les secrets webhook provenant du coffre ne sont pas chargés dans cet environnement.

Le workflow manuel utilise seulement les secrets GitHub `SUPABASE_ACCESS_TOKEN` et `STRIPEE_SECRET_KEY_TEST` de l'environnement Production ; il ne lance aucun workflow de production. Les opérations disponibles sont `preflight`, `configure`. Aucun déploiement Edge n'est automatique.

`configure` supprime les secrets personnalisés hérités, crée un endpoint Stripe Test idempotent et transmet son secret directement à Supabase, sans l'imprimer. Les secrets réservés `SUPABASE_*` restent gérés par Supabase. Le retour de paiement vise localhost : une interface locale explicitement branchée sur Test est nécessaire. Aucun email ni coursier réel ne doit être configuré.

`replay` est entièrement désactivé avant accès aux secrets ou à SQL. Un filtre textuel et une purge avant COMMIT ne prouvent pas l'absence d'appels indirects HTTP. Les migrations historiques comportent des appels/URL de production ; aucune reprise automatique ni substitution par rebase n'est autorisée. La configuration exige une file HTTP vide, un coffre vide et aucun cron actif, vérifiés en lecture seule.


État observé : la création de branche a échoué après 100 migrations, sur la surcharge manquante `generate_restaurant_payout_invoice(uuid,date)`. La définition canonique lue en production a été restaurée uniquement sur Test, avec EXECUTE réservé à postgres/service_role. Une tentative de quarantaine par trigger cron.job a été refusée et entièrement annulée ; aucun contournement des droits n'a été appliqué. La reprise n'a pas été exécutée.

Voie future : disposer d'un environnement au schéma complet dont la quarantaine cron/HTTP/fournisseurs est démontrée, obtenir l'autorisation pour sa nouvelle cible et remplacer explicitement l'allowlist temporaire. Le présent code ne recrée aucun projet. Après une future recette : supprimer l'endpoint Stripe Test créé pour cet environnement, supprimer sa branche payante, puis retirer son allowlist et workflow. Ne pas supprimer de webhook Live.
