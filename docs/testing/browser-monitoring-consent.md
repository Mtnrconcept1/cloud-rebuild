# Télémétrie navigateur et consentement

Le contrat existant de `src/lib/cookieInventory.ts` classe Sentry dans la catégorie
analytics. `src/lib/monitoring.ts` applique ce contrat au SDK navigateur ; les
journaux backend de sécurité et de transaction ne dépendent pas de ce module.

## Comportement attendu

- Aucun chargement du SDK ni envoi sans DSN valide et consentement analytics valide.
- L'acceptation démarre la collecte des nouvelles erreurs ; les erreurs survenues
  avant l'acceptation ne sont pas conservées pour un envoi ultérieur.
- Le retrait désactive le client et bloque ses callbacks et son transport. Une
  nouvelle acceptation crée un client neuf, sans réactiver les événements anciens.
- Un changement de compte ou une déconnexion efface les scopes et invalide les
  erreurs en attente. L'identité est comparée uniquement en mémoire locale ; aucun
  identifiant de compte ni email n'est transmis à `setUser`.
- Un choix reste effectif dans l'onglet si le stockage navigateur refuse son
  écriture. Le reçu obsolète est alors supprimé si le navigateur le permet. Si
  toute opération de stockage est bloquée, le choix ne peut pas être garanti au
  prochain chargement de la page.
  Un changement ultérieur provenant d'un autre onglet remplace ce choix temporaire.

## Données et compromis

Les événements conservent les piles d'erreur, fichiers et positions, identifiants
techniques de source maps, environnement/release, catégorie de frontière d'erreur
et pile React. Les emails, UUID, jetons JWT/Bearer et secrets nommés sont masqués
dans les textes. Les URL perdent leurs identifiants, paramètres et fragments.

Les objets utilisateur, contextes arbitraires, corps et en-têtes HTTP, pièces
jointes, variables locales et champs libres sont exclus. Les breadcrumbs de
console, formulaires, clics et événements personnalisés sont supprimés ; seuls les
URL épurées et statuts/méthodes réseau/navigation sont conservés. Les sessions
automatiques, identifiants de conversation, logs et rapports client sont désactivés.
Cela réduit volontairement le détail du diagnostic disponible.

Ce filtrage minimise les données ; il ne garantit pas l'anonymisation de tout
texte d'erreur possible. Une requête réseau déjà partie avant le retrait ne peut
pas être rappelée. Le serveur destinataire voit les métadonnées réseau nécessaires
à la réception ; ce correctif ne modifie pas la conservation ou le filtrage côté
fournisseur et n'en constitue pas une validation.

## Vérification

`src/test/monitoring-consent.test.ts` exécute le vrai module de monitoring et le vrai
gestionnaire de consentement avec le SDK Sentry et l'audit Supabase simulés. Il
couvre refus/acceptation/retrait, stockage inaccessible, synchronisation des
onglets, import différé, changement de compte, déconnexion et callbacks/transport
obsolètes. Il vérifie les données des événements et breadcrumbs sortants.

Les tests historiques `monitoring`, `legal-consent-v2`,
`legal-consent-banner-layout` et `marketing-consent-dispatch` complètent cette
vérification. Ces tests ne remplacent pas une observation réseau du déploiement
avec un DSN configuré ; aucun fournisseur n'est contacté pour la validation locale.

### Observation réseau locale avec le SDK réel

Le 10 octobre 2026, le coordinateur de la livraison a vérifié le commit
`bfc2f0e141da422be3a6aac6c6510464c9919d12` dans un navigateur avec le SDK réel
Sentry 10.49.0. Le collecteur d'enveloppes était exclusivement local
(`localhost:5178`) et le backend de consentement était simulé. Aucun compte ou
collecteur Sentry distant, ni backend de production, n'a été utilisé pour ce test.

| Étape observée | Résultat |
| --- | --- |
| Avant accord analytics | Aucun chargement SDK observé et 0 enveloppe |
| Accord puis erreur | 1 enveloppe au total ; email, paramètres et fragments d'URL supprimés |
| Retrait puis nouvelle erreur | Toujours 1 enveloppe : aucun nouvel envoi |
| Nouvel accord, erreur native automatique et changement de compte | 3 enveloppes au total ; aucune identité de compte ni secret de test retrouvé |
| Retrait lorsque `Storage.prototype.setItem` lève `QuotaExceededError` | Consentement analytics à `false` ; total inchangé à 3 enveloppes |

Cette observation complète les tests avec SDK simulé : elle vérifie la collecte
réseau et les erreurs automatiques de la version installée du SDK. Elle ne prouve
ni un déploiement, ni le traitement ou la conservation des données chez Sentry en
production. Le blocage concerne les nouveaux envois ; une requête déjà partie au
moment du retrait reste impossible à rappeler.

Retour arrière : révoquer le commit applicatif concerné. Aucun schéma de base,
fournisseur, texte légal ou secret n'est modifié.
