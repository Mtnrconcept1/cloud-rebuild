# Plan de tests lancement 10k

Ce plan est a executer sur un environnement autorise avant lancement serieux.
Ne pas lancer ces scenarios contre la production depuis Codex.

## Scenarios de charge

- 100 utilisateurs simultanes sur la homepage.
- 100 recherches restaurant en parallele.
- 50 paniers simultanes avec recalcul serveur.
- 20 paiements Stripe test en parallele.
- Upload massif d'images sur Studio Photo, catalogue et social feed.
- Connexion simultanee client, restaurateur et admin.

## Scenarios paiement / commande

- Webhook Stripe recu plusieurs fois pour le meme evenement.
- Commande payee mais restaurant muet.
- Restaurant qui refuse une commande payee.
- Produit supprime pendant paiement.
- Checkout paye non finalise puis repris par `reconcile-paid-order-checkouts`.
- Session Stripe expiree puis marquee via `markOrderCheckoutSessionState`.

## Scenarios reservations

- Double reservation sur le meme restaurant, date et creneau.
- Capacite par creneau atteinte.
- Confirmation restaurant requise puis passage en `confirmed`.
- Client absent apres reservation confirmee, statut `no_show`.
- Acompte optionnel avec transaction reservation dedoublonnee.
- Reservation liee au plan de salle via `reservation_slots`.

## Validations attendues

- Aucun double debit et aucun double ordre finalise.
- Toutes les actions sensibles sont auditees.
- Les rate limits bloquent les pics anormaux sans couper le trafic normal.
- Les notifications transactionnelles restent en file ou sont relancees par worker.
- Le panneau admin production health expose crons, Edge Functions, notifications et anomalies paiement.

## Execution locale

- Dry-run: `pnpm test:launch:10k`.
- Execution autorisee: `TOK_LOAD_TEST_BASE_URL=http://localhost:4173 pnpm test:launch:10k -- --execute`.
- Les scenarios POST acceptent des fixtures JSON via variables d'environnement, par exemple `TOK_LOAD_TEST_CHECKOUT_PAYLOAD`, `TOK_LOAD_TEST_STRIPE_WEBHOOK_REPLAY_PAYLOAD`, `TOK_LOAD_TEST_DOUBLE_RESERVATION_PAYLOAD`, `TOK_LOAD_TEST_IMAGE_UPLOAD_PAYLOAD` et `TOK_LOAD_TEST_AUTH_PAYLOADS`.
- `TOK_LOAD_TEST_AUTH_PAYLOADS` peut contenir un tableau JSON avec les payloads client, restaurateur et admin pour tester les connexions simultanees par role.
