# Préremplissage du consentement restaurateur — plan et décision

**Objectif :** reprendre les informations disponibles dans la fiche prospect, afficher un bloc e-mail modifiable et un bloc de signature personnel au restaurateur. L’absence d’e-mail permet la saisie manuelle.

**Architecture :** réutiliser le `prospect` déjà transmis par `CommercialProspection`, le document versionné renvoyé par le serveur et `WorkforceSignaturePad`. Aucun nouvel appel réseau, changement de permission, migration, envoi direct ou dépendance. Le responsable de collecte n’est pas inventé ni activé automatiquement.

**Périmètre :** niveau 2 (formulaire React) avec protections de consentement vérifiées explicitement. La logique serveur du consentement immédiat signé et de la confirmation complémentaire reste inchangée.

## Fichiers et ordre

1. `src/test/commercial-email-consent.test.tsx` : rendre les attentes de préremplissage rouges, couvrir adresse absente/invalide, correction, signature neuve, changement de restaurant, fermeture/réouverture et rechargement.
2. `src/components/commercial/CommercialEmailConsentDialog.tsx` : initialiser les deux champs e-mail avec l’adresse valide normalisée de la fiche ; afficher établissement/adresse connus, autorisation chargée, bloc e-mail éditable et signature clairement dédiée au restaurateur.
3. Ce plan puis références canoniques générées : `docs/architecture/TOK_APPLICATION_REFERENCE.md`, `docs/architecture/tok-application-search-index.json`, `src/data/tok-user-guide-catalog.generated.ts` (seulement si modifié).

## Décisions de sécurité et UX

- Le texte d’autorisation et l’identité du responsable proviennent du contexte serveur existant. Aucun nom de personne, fonction ou identité juridique n’est déduit du nom du restaurant.
- Les deux champs e-mail sont préremplis pour ne pas imposer une recopie. Ils restent modifiables et doivent concorder avant enregistrement. Le signataire doit vérifier l’adresse avant d’approuver.
- Une adresse absente ou non valide produit des champs vides et un message de saisie manuelle. L’adresse de contact de TOK n’est jamais utilisée comme destinataire de remplacement.
- Le préremplissage se fait à l’ouverture. Une actualisation du même prospect ne remplace pas une saisie en cours ; fermeture/réouverture ou changement de prospect initialise une session neuve.
- Toute modification d’un champ signable efface la signature et l’accord, comme avant. L’accord est toujours décoché et aucune signature précédente n’est réutilisée.
- Le formulaire reste bloqué si le responsable de collecte n’est pas configuré. Les erreurs réseau gardent le payload signé figé et sa clé d’idempotence.

## Validation et retour arrière

Tests ciblés Vitest avant/après, tests de confirmation existants, lint, TypeScript/build en CI, index canonique et `git diff --check`. Aucun test avec une signature réelle ni envoi en production. Retour arrière : revenir sur le commit frontend de cette branche ; aucune modification de données à annuler.

## Environnement

Base distante lue : `42b2c493ba6b099514b128c55b6f0cb9ecf98bb5`. Branche dédiée `feat/commercial-consent-prefill-20261028`. Le réseau Git du conteneur ne résout pas GitHub ; le worktree local utilise l’arbre exact `e695e595d3249a9a34344b50e475ac68bf163b96` restauré depuis l’archive validée de la PR 993. La comparaison GitHub confirme que les fichiers applicatifs et tests de consentement n’ont pas changé entre cette version et la base distante. Les changements distants seront appliqués uniquement aux fichiers concernés sur la base actuelle ; la CI de cette base fait autorité pour la validation complète. Aucun merge ni déploiement demandé pour cette révision.

- [x] Tests rouges observés : 12 échecs attendus avant modification.
- [x] Formulaire modifié : 66 tests ciblés verts sur six fichiers ; lint ciblé et diff --check réussis.
- [ ] Références régénérées sur la base distante et CI contrôlée.
- [ ] Commit propre, PR et livraison des fichiers complets.

Validation distante : un workflow temporaire limité à cette branche restaure le patch contrôlé par empreintes, génère les références depuis la vraie base distante, vérifie tests/types/lint/build et publie uniquement les objets de fichiers validés. Il ne publie aucun commit, ne déplace aucune branche, ne lit aucun secret de production et sera retiré de l’arbre final.
