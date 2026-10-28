# TOK Équipe — couverture fonctionnelle de SwissTime

## 1. Périmètre et état de livraison

Cette matrice compare la cartographie du dépôt `mtnrconcept/swiss-time-tracker`, au commit **`7cab98100ae189b7eec1234a7cbc6b49db2f95b7`**, avec le code TOK préparé le **28 octobre 2026** sur la branche **`feat/tok-equipe-swisstime-20261028`**, mise à jour depuis `main` au commit `070aecdfb2a8cca59191d329034c380117abf1ab`. La PR #1004 intègre ensuite la base `main` `837705c65cedfbfb3406fe9542e4afdf66020938` et régénère ses index.

Elle décrit les parcours reliés dans la branche applicative destinée à la PR. **Elle n’atteste ni le déploiement de cette branche, ni l’application en production de la nouvelle migration SQL, ni le déploiement de l’Edge Function `tok-workforce-assistant`.** Les fichiers de test constituent les preuves de comportement à exécuter ; le statut final de la CI et du déploiement relève de la livraison de la PR.

Un élément d’infrastructure est déjà publié séparément : les entrées `equipe.thetok.ch` et `équipe.thetok.ch` — forme DNS `xn--quipe-9ra.thetok.ch` — redirigent en **HTTP 307** vers le site canonique TOK. Le manifeste [tok-equipe-entry-routes.json](tok-equipe-entry-routes.json) conserve la version publiée et les règles du 28 octobre 2026 :

| Entrée | Destination |
|---|---|
| Racine de chacun des deux sous-domaines | `https://www.thetok.ch/equipe/mon-espace` |
| Chemin `/<chemin>` sur chacun des deux sous-domaines | `https://www.thetok.ch/<chemin>` |

Ces redirections réutilisent l’authentification canonique ; elles ne déploient pas à elles seules les nouvelles fonctionnalités RH. La présente documentation ne les assimile donc pas à une mise en production de la branche.

## 2. Organisation des écrans TOK

TOK réutilise ses restaurants, comptes, autorisations et routes. Les treize pages métier de SwissTime sont regroupées en quatre espaces, sans seconde application ni seconde authentification.

| Route | Public visé | Contenu effectivement relié |
|---|---|---|
| `/dashboard/equipe` | Restaurateur dans son contexte restaurant | Planning, Équipe, Badgeuse, Heures, Absences, Demandes, Échanges, Rapports, Analyses, Assistant, Paramètres. |
| `/equipe/gestion?restaurant=<uuid>` | Collaborateur actif avec rôle local `manager` | Planning, Présences, Heures, Absences, Demandes, Échanges, Rapports, Analyses, Assistant et lecture des Paramètres. Pas d’édition des fiches ou des rôles. |
| `/equipe/mon-espace?restaurant=<uuid>` | Collaborateur invité ou déjà rattaché | Acceptation de l’invitation, choix de l’établissement, puis Vue d’ensemble, Badgeuse, Planning, Mes heures, Compteurs, Demandes et Échanges. |
| `/admin/equipe` | Administrateur TOK | Recherche d’un restaurant, activation/désactivation du module, canton, seuil hebdomadaire, minimum de vacances configuré et historique des activations. |

Preuves : [routes][app], [dashboard restaurateur][dashboard], [espace responsable][manager], [portail employé][portal], [espace personnel][personal], [administration][admin].

Le restaurant explicite de l’URL est conservé. Un lien malformé ou un restaurant inaccessible n’entraîne pas de repli silencieux sur un autre établissement. Un salarié du restaurant A qui est responsable dans B peut choisir B, même après un refus d’accès dans A. Le changement de restaurant réinitialise les onglets et les formulaires ouverts. Les règles de continuation sont centralisées dans [workforceContinuation.ts][continuation] ; le parcours est vérifié par [MyWorkforceManager.test.tsx][manager-test] et [MyWorkforce.test.tsx][portal-test].

## 3. Matrice SwissTime → TOK

« Couverte » signifie qu’un parcours est relié aux données et à ses consommateurs dans cette branche. « Adaptée » signifie que TOK remplit le besoin avec ses propres rôles, regroupements ou règles explicites. Aucune de ces mentions ne signifie « déployée en production ».

### Gestion de l’équipe

| Fonction / page SwissTime | Écran TOK | Comportement et liaisons | Preuves principales | Adaptation ou limite |
|---|---|---|---|---|
| Tableau de bord `/dashboard` : effectifs, heures, services, évolution, coûts, bien-être, IA | Équipe, Planning, Analyses, Rapports, Assistant | Effectif actif dans Équipe ; services dans Planning ; heures et contrats dans Rapports ; comparaison planifié/réalisé, coûts et repos dans Analyses ; conseils dans Assistant. | [DashboardWorkforce][dashboard], [WorkforceAnalytics][analytics], [WorkforceReports][reports] | **Adaptée** : capacités réparties entre onglets. Pas de compteur d’alertes artificiellement fixé à zéro. Le score de santé supposée est remplacé par un indicateur opérationnel de charge et de repos. |
| Collaborateurs `/employees` | Dashboard → Équipe | Créer, modifier, désactiver/réactiver ; prénom, nom, email, rôle local, heures contractuelles, vacances annuelles, coût horaire et dates du contrat. Les identifiants de fiche sont utilisés par tous les modules RH. | [WorkforceEmployees][employees], [types][types], [migration initiale][sql-base] | **Couverte et complétée** par invitation et rattachement au compte TOK. `started_on` est requis. Modifier une fiche n’envoie pas d’email ; le rattachement `user_id` ne se modifie pas librement dans le formulaire. |
| Planning `/planning` | Planning propriétaire et responsable | Semaine précédente/suivante/courante ; ajout global ou depuis une cellule ; édition complète ; suppression ; déplacement du jour et du collaborateur ; alternative au clavier ; pause, notes et statuts prévu/confirmé/terminé/annulé. Absences et conflits restent visibles. | [WorkforcePlanning][planning], [WorkforceWeekGrid][grid], [WorkforceShiftDialog][shift-editor], [contrôles immédiats][planning-checks], [intégrité SQL][sql-integrity] | **Couverte**. Le formulaire vérifie également les dates du contrat. Les chevauchements de services et les conflits avec une absence sont contrôlés en base, y compris lors des échanges. Un service terminé ne crée pas automatiquement un relevé réalisé. |
| Relevé d’heures `/time-entries` | Heures propriétaire et responsable | Saisie manuelle ; filtre mois/collaborateur/état ; suppression confirmée d’un relevé non signé ; sélection et validation individuelle ou groupée ; dessin de signature ; consultation de la preuve historique. Les durées viennent du même moteur que les rapports, avec les sessions de badgeuse lorsqu’elles correspondent au relevé. | [WorkforceTime][time], [WorkforceSignaturePad][signature-pad], [moteur des calculs][calculations], [RPC de validation][sql-integrity] | **Couverte et renforcée** : 100 relevés maximum par signature, version attendue, copie du contenu et empreinte. Une durée ambiguë ou invalide doit être régularisée avant signature. Suppression interdite si signé ou référencé par une demande de correction. |
| Absences `/absences` | Absences propriétaire et responsable | Vacances, maladie, jour férié ou autre ; salarié, dates, jours décomptés, notes ; consultation ; suppression des absences manuelles. Préremplissage des jours ouvrés à partir du calendrier du restaurant, puis ajustement possible par demi-journée. | [WorkforceAbsences][absences], [calendrier et calculs][calculations], [intégrité SQL][sql-integrity] | **Couverte**. Les absences approuvées depuis une demande sont identifiables et protégées. Aucun parcours d’annulation d’un congé déjà approuvé n’est exposé. Les motifs détaillés ne sont pas transmis automatiquement à l’assistant. |
| Demandes `/requests` | Demandes propriétaire et responsable | Liste et filtre par statut ; acceptation ou refus avec commentaire ; congé accepté → absence ; correction acceptée → modification du relevé non signé ; décision et commentaire visibles dans l’espace personnel. | [WorkforceRequests][requests], [WorkforceRequestForm][request-form], [WorkforcePersonal][personal], [RPC de traitement][sql-integrity] | **Couverte et rendue effective**. Les demandes « Planning » et « Autre » restent des demandes de décision avec texte libre : leur acceptation ne génère pas un planning automatiquement. |
| Échanges `/shift-exchanges` | Échanges propriétaire/responsable et espace personnel | Reprise simple ou échange réciproque ; choix d’un collègue et éventuellement de son service ; message ; accord/refus du collègue ; décision du responsable avec note ; annulation par le demandeur tant que la proposition est en attente ; historique. | [WorkforceExchanges][exchanges], [WorkforcePersonalExchanges][personal-exchanges], [RPC d’échange][sql-integrity] | **Couverte et rendue effective** : destinataire requis, consentement authentifié et mouvement réel des affectations dans une transaction. Les propositions ouvertes sans destinataire de la référence ne sont pas reprises. |
| Rapports `/reports` | Rapports propriétaire et responsable | Période mensuelle ou hebdomadaire, navigation, salarié ou équipe, filtre validés uniquement, synthèse, détail quotidien, CSV complet, PDF individuel et global avec signatures visuelles disponibles. | [WorkforceReports][reports], [moteur commun][calculations], [CSV][calculations], [PDF][pdf] | **Couverte**. Aucune année fixe ni multiplication par 4,33. Les exports contiennent toutes les lignes, indépendamment de la pagination de l’écran. Le nom d’établissement est fourni par le contexte propriétaire ; à défaut, le PDF emploie « Restaurant ». |
| Paramètres `/settings` : entreprise, canton, seuils, fériés, rôles | Administration TOK + Paramètres + fiche restaurant existante | Administration : activation, canton, seuil hebdomadaire et minimum de vacances. Restaurateur : ajout/suppression de fériés propres au restaurant, nom/date/caractère national. Rôle local attribué dans les fiches. Nom d’établissement réutilisé depuis TOK. | [AdminWorkforce][admin], [WorkforceSettingsPanel][settings], [WorkforceEmployees][employees], [contexte IA][assistant-context] | **Adaptée** au multirestaurant. Aucun écran RH ne permet de s’attribuer un rôle global TOK. Le calendrier est renseigné explicitement ; pas de téléchargement automatique du calendrier cantonal. Le seuil et le minimum sont affichés et transmis au contexte IA ; ils ne constituent pas une validation automatique de conformité. |

### Espace collaborateur

| Fonction / page SwissTime | Écran TOK | Comportement et liaisons | Preuves principales | Adaptation ou limite |
|---|---|---|---|---|
| Mon planning `/my-planning` | Mon espace → Planning | Navigation hebdomadaire lundi–dimanche ; choix d’une date ; horaires, pauses, notes, absences et quatre statuts ; accès direct au prochain service depuis la synthèse. | [WorkforcePersonal][personal], [hooks][hooks] | **Couverte** avec lecture des mêmes services que le responsable. Aucun workflow distinct de publication ou d’acceptation individuelle du planning n’est promis. |
| Mes heures `/my-hours` | Mon espace → Mes heures | Navigation par mois, total, détail par jour, origine badgeuse/saisie, nuit, dimanche, état de validation et signataire ; filtre validés uniquement ; 50 lignes par page. | [WorkforcePersonal][personal], [calculs][calculations] | **Couverte**. Les heures passant minuit sont ventilées sur les jours concernés. La demande de correction est accessible dans Demandes ; l’employé ne modifie pas directement le relevé. |
| Mes compteurs `/my-counters` | Mon espace → Compteurs | Année choisie, heures réalisées/validées, nuit/dimanche, attendu et solde à date, vacances prises/réservées/disponibles, droit proratisé, crédits fériés et absences. | [WorkforcePersonal][personal], [workforceVacationBalance et buildWorkforceReport][calculations] | **Adaptée** : solde indicatif lié au calendrier et au contrat, au lieu des formules contradictoires de la référence. Les congés futurs approuvés sont réservés ; une demande en attente ne consomme rien. |
| Mes demandes `/my-requests` | Mon espace → Demandes | Formulaire commun verrouillé sur sa propre fiche ; congé structuré, correction d’un relevé identifié et versionné, planning ou autre ; historique paginé, statut et commentaire. | [WorkforceRequestForm][request-form], [WorkforcePersonal][personal], [RPC de traitement][sql-integrity] | **Couverte** avec nomenclature TOK : congé, correction, planning, autre. Le motif libre ne suffit plus à appliquer une correction ou un congé sans références métier. |

### Capacités TOK complémentaires déjà reliées

| Capacité | Relation avec le reste du module | Preuves |
|---|---|---|
| Invitations avec suivi d’envoi | Fiche → invitation email explicite → acceptation vérifiée → compte lié à la fiche → accès aux données personnelles. États programmé, en cours, envoyé, échec, expiré, annulé et accepté distingués. | [WorkforceInvitationDialog][invitation-dialog], [hooks][hooks], [MyWorkforce][portal], [migration invitations][sql-invitations] |
| Badgeuse serveur | Arrivée → pause/reprise → départ ; les horodatages sont écrits par la RPC serveur. Une sortie valide produit un relevé à valider. Sessions et événements sont conservés ; les sessions non converties sont signalées pour régularisation. | [WorkforceClock][clock], [WorkforceClockOverview][clock-overview], [migration badgeuse][sql-clock] |
| Assistant TOK | Conversation en contexte restaurant, raccourcis de question et période maximale de 31 jours ; analyse textuelle des services, heures et indisponibilités. Utilise les crédits IA du restaurant. | [WorkforceAssistant][assistant], [handler Edge][assistant-edge], [contexte fournisseur][assistant-context] |

## 4. Droits : compte TOK, restaurant et fiche employé

Les autorisations reposent sur les fonctions SQL existantes `tok_workforce_can_manage`, `tok_workforce_can_schedule` et les politiques RLS. Le rôle local `manager` appartient à une fiche employé du restaurant ; ce n’est pas un rôle d’administration de la plateforme.

| Action | Restaurateur propriétaire | Administrateur TOK | Responsable local actif | Employé actif |
|---|---|---|---|---|
| Activer/désactiver et modifier les paramètres administratifs du module | Lecture ; demande d’activation | Oui, écran `/admin/equipe` | Lecture dans son espace | Pas de commande |
| Créer/modifier une fiche, rôle local, invitation, désactivation | Oui, restaurant activé | Autorisé côté serveur par `can_manage` | Lecture de l’équipe, sans mutation des fiches | Lecture de sa fiche liée |
| Créer/modifier/supprimer un service | Oui | Autorisé côté serveur | Oui, dans son restaurant activé | Consultation de ses services |
| Saisir, signer ou supprimer des heures non signées | Oui | Autorisé côté serveur | Oui | Badgeuse personnelle et demande de correction |
| Modifier ou supprimer un relevé déjà signé | Non | Non avec le nouveau verrou | Non | Non |
| Enregistrer des absences, traiter demandes et échanges | Oui | Autorisé côté serveur | Oui | Soumettre ses demandes, répondre aux échanges reçus, annuler ses propositions en attente |
| Modifier le calendrier des fériés | Oui | Autorisé côté serveur | Lecture | Lecture utilisée pour ses compteurs et demandes |
| Rapports, coûts et assistant de l’équipe | Oui | Capacité serveur selon le contrôle métier ; pas d’écran RH global supplémentaire | Oui, restaurant activé | Ses seuls compteurs et horaires ; pas d’analyse globale ni assistant |
| Badger au nom d’une autre personne | Non | Non | Non | Non |

L’écran administrateur fourni par ce module est l’écran d’activation/configuration ; la capacité serveur d’administration ne crée pas une seconde interface complète de gestion du personnel. Un propriétaire ou administrateur qui souhaite badger doit également disposer d’une fiche personnelle active liée à son compte.

Les écritures de décision sont effectuées par RPC, pas par mise à jour libre du statut dans le navigateur. Les références entre objets incluent le restaurant ; un identifiant de salarié, relevé ou service d’un autre établissement ne suffit pas à lui donner accès. Les invitations et le rattachement exigent la vérification de l’adresse et ne permettent pas au salarié de choisir lui-même un rôle supérieur. Preuves : [schéma et politiques initiaux][sql-base], [délégation aux responsables][sql-clock], [rattachement][sql-invitations], [nouveaux contrôles métier][sql-integrity].

## 5. Modèle partagé et relations

| Objet TOK | Références et consommateurs |
|---|---|
| `tok_workforce_settings` | Une configuration par `restaurant_id`. Activation et règles visibles dans les écrans et le contexte de l’assistant. |
| `tok_workforce_employees` | Fiche rattachée au restaurant, éventuellement au `user_id` TOK ; identité, rôle local, dates et paramètres du contrat. Référence des services, heures, absences, demandes, pointages et échanges. |
| `tok_workforce_shifts` | Prévision de service affectée à une fiche. Lue par les deux plannings, les échanges, les rapports, les coûts et l’assistant. |
| `tok_workforce_clock_sessions` / `tok_workforce_clock_events` | Horodatages et actions de badgeuse. Une session peut référencer le relevé généré ; sa preuve temporelle est réutilisée par le calcul des durées. |
| `tok_workforce_time_entries` | Temps réalisé, saisi ou issu d’un départ badgé. Version entière, horaires, pause et notes. Alimente les heures, compteurs, rapports et analyses. |
| `tok_workforce_validations` | Référence un relevé ; signataire, date serveur, tracé PNG, version signée, copie JSON et empreinte SHA-256 pour les nouvelles attestations. |
| `tok_workforce_absences` | Période, type, quantité de jours, notes et éventuelle `source_request_id`. Alimente les conflits du planning et les crédits/soldes. |
| `tok_workforce_requests` | Demande liée au salarié ; données de congé ou référence/version/horaires corrigés ; décision et commentaire. Les corrections appliquées conservent les copies avant/après. |
| `tok_workforce_exchanges` | Deux salariés, un ou deux services, message, versions de services, consentement, décision, note et éventuelle annulation. |
| `tok_workforce_holidays` | Dates propres au restaurant, nom et caractère national déclaré ; utilisées pour le préremplissage des jours et les calculs. |
| `tok_workforce_invitations` / `tok_workforce_access_audit` | Suivi d’accès des collaborateurs et trace des activations administratives. |

La bibliothèque de [types][types], les [hooks de lecture][hooks] et les [migrations][sql-integrity] constituent les contrats. Aucune table de solde importée de SwissTime n’est utilisée comme registre parallèle : les compteurs sont calculés à partir des données RH TOK.

## 6. Workflows métier

### 6.1 Service, réalisation et disponibilité

Le planning et les heures réalisées restent deux objets distincts. Créer, confirmer ou terminer un service modifie le planning. Enregistrer des heures ou terminer une session de badgeuse crée du réalisé. Le passage de l’un à l’autre ne dépend donc pas d’une confirmation de planning implicite.

Une édition de service utilise la version `updated_at` lorsqu’elle est disponible. Les contrôles serveur couvrent les intervalles traversant minuit, les absences et les chevauchements entre services. Créer une absence ou approuver un congé pendant un service existant échoue ; le planning doit d’abord être ajusté. Une erreur conserve la saisie et ne déclenche pas un message de réussite. [Planning][planning], [éditeur][shift-editor], [intégrité][sql-integrity].

### 6.2 Signature et suppression d’heures

1. Le responsable charge les relevés, validations et sessions de badgeuse du mois choisi.
2. Il sélectionne les relevés non signés calculables, individuellement ou par groupe de 100 maximum.
3. Il vérifie les horaires et le total issu du moteur commun, saisit son nom et dessine sa signature.
4. `tok_workforce_validate_entries` vérifie le restaurant, les droits et les versions attendues, puis crée les preuves dans une transaction.
5. Le serveur fixe l’acteur, la date, la version, la copie du relevé et son empreinte. Un rejeu renvoie la preuve existante sans remplacer son signataire.
6. Heures, espace personnel, rapports et exports relisent les validations. La consultation historique affiche le tracé et le contenu figé disponible.

Le frontend confirme que tous les identifiants demandés sont présents dans la réponse. Une attestation est immuable, et le relevé associé ne peut plus être modifié ni supprimé, même par un administrateur. Une suppression non signée exige une confirmation, le restaurant, l’identifiant et la version ; zéro ligne retournée n’est pas un succès. Une demande de correction existante empêche la suppression de sa référence. La suppression d’un relevé issu de la badgeuse conserve la session, dont le lien au relevé devient nul et qui peut apparaître à régulariser.

Le tracé est une **attestation visuelle nominative**, sans qualification de signature électronique qualifiée. Les anciennes validations peuvent manquer de copie et d’empreinte ; l’interface le signale. L’écran Heures et les rapports utilisent la même reconnaissance de validation courante : une ancienne signature sans version n’est retenue que si les métadonnées montrent un relevé initial inchangé. Une preuve historique non vérifiable reste consultable et explicitement signalée ; elle ne rend pas le relevé à nouveau modifiable, supprimable ou signable. [Heures][time], [RPC et verrou][sql-integrity], [reconnaissance de validation][calculations], [lien session/relevé][sql-clock].

### 6.3 Correction structurée

Une demande de correction contient le relevé du même salarié/restaurant, la version lue, le début, la fin et la pause proposés. Les relevés déjà signés ne sont pas sélectionnables. Le serveur vérifie à nouveau ces conditions à la création et à la décision.

L’acceptation par `tok_workforce_review_request(id, approve, review_note)` modifie le relevé, incrémente sa version si le contenu change et conserve ses copies avant/après ainsi que la décision. Si le relevé a changé ou a été signé entre-temps, la décision échoue et une nouvelle demande peut être nécessaire. Un refus ne modifie pas les heures. Le salarié voit la proposition, le statut et le commentaire.

Les horaires corrigés ne sont pas écrasés ensuite par l’ancienne session de badgeuse : le moteur n’emploie cette session comme preuve de durée que si date, horaires et pause correspondent encore au relevé. [Formulaire][request-form], [traitement][requests], [RPC][sql-integrity], [calcul des relevés][calculations].

### 6.4 Congé et absence

Les dates choisies préremplissent le nombre de jours ouvrés du lundi au vendredi, hors fériés configurés du restaurant. Ce nombre reste ajustable par demi-journée selon le contrat ; changer les dates recalcule la proposition. La même fonction du domaine est utilisée par le formulaire et la ventilation des absences.

Un congé en attente ne modifie ni la disponibilité ni le solde. Son approbation crée une absence `vacation` référencée par `source_request_id`, puis inscrit la décision dans la même transaction. L’unicité de cette référence et le traitement idempotent empêchent une deuxième absence lors d’un rejeu. Le congé approuvé apparaît dans le planning et dans les compteurs ; sa suppression ou sa modification métier directe est bloquée pour préserver la cohérence avec la demande. Les notes restent une donnée distincte.

Une absence manuelle suit les mêmes vérifications de période et de conflit. Les absences « Jour férié » incluent le férié lui-même dans leur proposition de décompte. Aucun écran de révocation d’un congé approuvé n’est inclus dans ce lot. [Absences][absences], [demande][request-form], [calculs][calculations], [transaction et intégrité][sql-integrity].

### 6.5 Reprise ou échange de services

| Étape | Reprise simple | Échange réciproque |
|---|---|---|
| Proposition | Le demandeur désigne son service et le collègue qui le reprend. | Il désigne aussi le service du collègue qu’il reprendra en retour. |
| Lecture des disponibilités | Annuaire limité à l’équipe et horaires des services proposés. | Lecture dédiée des services du collègue via `tok_workforce_exchange_candidates`. |
| Réponse du collègue | Acceptation authentifiée ou refus. | Même règle pour les deux services présentés. |
| Décision responsable | RPC avec commentaire ; un service change de salarié. | Même RPC ; les deux affectations sont permutées ensemble. |
| Contrôles | Consentement, fiches actives, version et affectation du service, disponibilité. | Contrôles sur les deux services ; les contraintes vérifient le résultat final de la permutation. |
| Annulation | Le demandeur peut annuler tant que le statut est `pending`. | Identique. |

Les RPC sont `tok_workforce_respond_exchange`, `tok_workforce_review_exchange(id, approve, manager_notes)` et `tok_workforce_cancel_exchange`. L’accord du collègue laisse le statut en attente de décision du responsable. Il doit porter à la fois la date et l’identité de l’acteur authentifié : un ancien accord portant seulement une date peut être confirmé à nouveau dans l’espace personnel, et ne permet pas encore l’approbation du responsable. La note de décision est visible dans les deux espaces. Le même rejeu conserve la décision et sa note initiales ; une décision opposée après traitement est refusée.

L’interface personnelle consulte les 90 prochains jours ; la RPC accepte au maximum 93 jours et renvoie au maximum 200 candidats par collègue. Les anciens services sortis de cette fenêtre sont signalés comme indisponibles dans le détail d’échange. Aucun historique figé complet des horaires d’échange n’est reconstruit. [Échanges gestion][exchanges], [échanges personnels][personal-exchanges], [RPC][sql-integrity].

## 7. Calculs réellement utilisés

Le calcul principal réside dans [tokWorkforceReporting.ts][calculations]. `workforceEntryTimeSlices` et `buildWorkforceReport` sont consommés par les heures à signer, les heures et compteurs personnels, les rapports, les exports et les analyses.

| Sujet | Règle implémentée | Conséquence / hypothèse |
|---|---|---|
| Durée réalisée et planifiée | Intervalle réel dans `Europe/Zurich`, pause déduite ; une fin inférieure au début correspond au lendemain. Les services annulés sont exclus du planifié. | Pas de troncature à l’heure entière. Les segments sont répartis aux limites des jours et de la période. |
| Badgeuse | Horodatages de session utilisés s’ils correspondent au relevé ; pause en secondes. | Le temps écoulé réel reste calculable lors du changement d’heure. Une correction incompatible avec la session fait utiliser les nouveaux horaires du relevé. |
| Heure locale ambiguë/inexistante | Détection des répétitions et trous liés au changement d’heure. | Une saisie manuelle sans horodatage fiable produit une anomalie, pas un choix arbitraire. Signature désactivée ; export bloqué jusqu’à régularisation. |
| Pauses | Répartition au prorata de la durée brute sur les segments, faute de créneaux de pause détaillés dans le calcul. | Nuit et dimanche reçoivent également leur part proportionnelle de pause. |
| Nuit | Intersection réelle avec `23:00–06:00`. | L’intégralité d’un relevé n’est pas déclarée nocturne sur la seule base d’un booléen. |
| Dimanche | Minutes nettes des segments dont la date suisse est un dimanche. | Un service samedi–dimanche est ventilé. |
| Base contractuelle | Heures hebdomadaires × 60 / 5 par jour du lundi au vendredi, dans les dates du contrat. | Base indicative explicite pour les contrats dont les jours travaillés varient. |
| Attendu | Base contractuelle moins crédits fériés et absences créditées. Vacances, maladie et fériés crédités ; type « autre » non crédité. | Pas de double crédit d’un férié et d’une absence sur le même jour. Crédit d’absence plafonné à une journée contractuelle par date. |
| Solde à date | Réalisé jusqu’à la date d’arrêt moins attendu jusqu’à cette même date. | Les jours futurs ne créent pas un déficit. Ce solde indicatif ne constitue pas un calcul complet de majorations ou de paie. |
| Vacances | Droit annuel × jours calendaires du contrat dans l’année / jours de l’année. Décompte saisi ventilé sur les jours ouvrés éligibles de l’absence. | Frontières d’année prises en compte. Prises avant/à la date d’arrêt, réservées après ; disponible = droit proratisé − prises − réservées. |
| Absence sans jour imputable | Absence de jours ouvrés éligibles, par exemple seulement un week-end ou des fériés. | Anomalie explicite et compteurs à régulariser ; le décompte saisi ne disparaît pas silencieusement dans un export présenté comme complet. |
| Coût | Heures nettes prévues/réalisées × coût horaire actuel de chaque fiche. | Estimation hors charges, majorations et retenues ; tarif manquant signalé ; pas d’historique des changements de tarif. |
| Évolution | Six mois, mois de référence sélectionnable, comparaisons prévues/réalisées et coûts, semaines bornées au mois. | Analyse descriptive, sans modèle de prévision statistique. Les tableaux exposent les chiffres des graphiques. |
| Taux de confirmation | Services confirmés ou terminés / services non annulés du mois. | Mesure d’état des services, pas mesure des besoins réels de couverture. |
| Charge et repos | 40 % adéquation prévu/contrat net, 40 % repos entre journées, 20 % écart réalisé/attendu à date ; repos de moins de 11 h signalés ; chevauchement → facteur repos nul. | Services coupés regroupés pour les repos quotidiens. Aucun score sans activité. Aucun diagnostic de santé ni utilisation du motif maladie comme jugement sur une personne. |

Les arrondis sont appliqués à l’affichage ou au format d’export. Le détail de validation porte sur le relevé complet ; les rapports de période n’incluent que les segments recoupant cette période. Les deux peuvent donc afficher des quantités différentes lorsqu’un service traverse la frontière du mois, pour une raison de périmètre explicite.

Les paramètres `max_weekly_hours` et `min_vacation_days` ne remplacent pas les valeurs du contrat individuel. Le calendrier et les dates du contrat sont utilisés dans les calculs ; les seuils administratifs servent à l’affichage et au contexte de l’assistant. Aucun blocage automatique de service ou certification juridique n’est annoncé sur leur seule base. [Analyses][analytics], [Paramètres][settings], [contexte IA][assistant-context].

## 8. Rapports, assistant et rafraîchissement

### Rapports et export

Le CSV reprend synthèse, détail des relevés et ventilation des absences, avec références, signataire, versions et empreinte lorsque disponibles. Les cellules sont protégées contre une interprétation involontaire en formule. Le PDF est un fichier téléchargeable, individuel ou global, avec synthèse, détail quotidien, notes et tracés des signatures existantes. Le PDF ne fabrique aucune signature manquante.

Une lecture incomplète, une erreur ou une anomalie de calcul bloque l’export. Le tableau paginé n’ampute pas le contenu du fichier. Un filtre « validés uniquement » utilise les validations correspondant à la version courante ; les anciennes signatures sont distinguées. [Rapports][reports], [CSV et validation courante][calculations], [PDF][pdf].

### Assistant

L’Edge Function authentifie l’utilisateur, vérifie `can_schedule` et l’activation du restaurant, puis lit les données RH avec le client soumis aux RLS. Le contexte transmis emploie des repères « Collaborateur NN » ; il exclut automatiquement noms, emails, coûts salariaux, notes et motifs d’absence. Une légende est résolue dans l’interface autorisée. Un utilisateur peut néanmoins saisir des informations personnelles dans sa question ; le formulaire lui demande de l’éviter.

La conversation est bornée, stockée dans l’état du composant et partiellement retransmise pour conserver le contexte ; elle n’est pas un historique persistant en base. Les quotas de requêtes, crédits TOK et journaux d’usage sont réutilisés. L’assistant ne crée ni ne déplace un service : les propositions sont textuelles, à examiner puis appliquer par les commandes normales du planning. Les erreurs conservent la question. [Interface][assistant], [handler][assistant-edge], [préparation du contexte][assistant-context].

### Lecture et mise à jour des données

Les lectures partagées sont filtrées par restaurant, et par salarié lorsque l’écran le demande. Elles parcourent les pages de 500 lignes avec ordre déterministe ; un plafond de 20 000 lignes ou une lecture détectée incomplète produit une erreur explicite. Les changements de volume et les identifiants doublés pendant la pagination sont également détectés. Cela évite de présenter les premières lignes comme un total exhaustif, sans prétendre constituer un instantané transactionnel de toutes les lectures.

`useWorkforceRefresh` invalide les familles de cache du restaurant concerné. Les pages sont réinitialisées lors d’un changement de contexte. La badgeuse et la vue de présence interrogent périodiquement les dernières sessions ; les invitations et le prochain service ont également une actualisation périodique. L’historique de badgeuse affiché est limité à 30 sessions côté salarié et 150 côté gestion ; les calculs de période utilisent les lectures paginées dédiées.

Ces invalidations et interrogations périodiques ne sont ni des notifications push ni un abonnement temps réel généralisé. L’envoi d’email explicitement relié ici concerne les invitations. Aucune notification externe automatique de décision ou d’échange n’est annoncée. [Hooks][hooks], [badgeuse][clock], [présences][clock-overview], [invitations][invitation-dialog].

## 9. Différences assumées, limites et preuve de couverture

Les treize familles fonctionnelles de la cartographie sont présentes dans la branche, avec les adaptations décrites dans la matrice. Les deux écarts repérés pendant sa rédaction — suppression des heures non signées et note de décision d’échange — ont été raccordés à leurs écrans et testés.

Les limites qui subsistent sont explicites : modèle contractuel indicatif sur cinq jours, calendrier saisi par le restaurant, coût au tarif actuel, signatures visuelles, protection des congés approuvés sans écran de révocation, consultation bornée des services anciens dans les échanges, absence de publication automatique du planning et de création de services par l’IA. Les structures inutilisées ou parcours incomplets de SwissTime ne sont pas présentés comme des capacités à reproduire à l’identique.

| Parcours / risque | Fichiers de vérification |
|---|---|
| Invitations, continuation, mauvais établissement et compte lié | `src/test/MyWorkforce.test.tsx`, `src/test/workforce-auth-continuation.test.ts`, `src/test/tokWorkforceInvitationsUi.test.tsx` |
| Responsable dans un autre restaurant, URL explicite, remise à zéro des formulaires | `src/test/MyWorkforceManager.test.tsx` |
| Grille, déplacement entre salariés, édition et absence conflictuelle | `src/test/workforce-week-grid.test.tsx`, `src/test/tokWorkforceShiftEditor.test.tsx` |
| Signature groupée, versions, réponse partielle, suppression protégée et changement d’heure | `src/test/tokWorkforceTimeValidation.test.tsx` |
| Correction, congé, commentaire et préremplissage des jours | `src/test/tokWorkforceRequestsUi.test.tsx`, `src/test/tokWorkforceAbsencesUi.test.tsx` |
| Accord du collègue, échange réciproque, annulation et décision commentée | `src/test/tokWorkforcePersonalExchangesUi.test.tsx`, `src/test/tokWorkforceExchangeReviewUi.test.tsx` |
| Calculs partagés, dates, nuits, vacances, rapports et PDF | `src/test/tokWorkforceReporting.test.ts`, `src/test/tokWorkforceReportsUi.test.tsx`, `src/test/tokWorkforcePdf.test.ts`, `src/test/tokWorkforcePersonalOverview.test.tsx` |
| Pagination, périmètre salarié et invalidation restaurant | `src/test/tokWorkforcePersonalQueries.test.tsx` |
| Assistant et calendrier, droits et contexte limité | `src/test/tokWorkforceAssistant.test.ts`, `src/test/tokWorkforceSettingsAssistantUi.test.tsx` |
| Contraintes et transitions en base, isolation et concurrence | `src/test/sql/tok_workforce_postgres_smoke.sql`, `src/test/sql/tok_workforce_integrity_smoke.sql`, `src/test/sql/tok_workforce_concurrency_smoke.sql` |

Cette liste identifie les preuves disponibles, sans remplacer leurs résultats d’exécution ni une validation du déploiement. Les nouveaux parcours nécessitent la migration [20261028044351_tok_workforce_integrity_and_workflows.sql][sql-integrity] ; l’assistant nécessite également le déploiement de son [Edge Function][assistant-edge]. Les migrations historiques restent des références, sans être réécrites par ce lot.

## 10. Références du code

La référence SwissTime est figée au commit audité : [pages et routes de la référence](https://github.com/mtnrconcept/swiss-time-tracker/tree/7cab98100ae189b7eec1234a7cbc6b49db2f95b7/src/pages), [composants de la référence](https://github.com/mtnrconcept/swiss-time-tracker/tree/7cab98100ae189b7eec1234a7cbc6b49db2f95b7/src/components), [backend de la référence](https://github.com/mtnrconcept/swiss-time-tracker/tree/7cab98100ae189b7eec1234a7cbc6b49db2f95b7/supabase). Les liens TOK ci-dessous sont relatifs à cette branche et désignent le code réel du dépôt.

[app]: ../../src/App.tsx
[dashboard]: ../../src/pages/dashboard/DashboardWorkforce.tsx
[manager]: ../../src/pages/workforce/MyWorkforceManager.tsx
[portal]: ../../src/pages/workforce/MyWorkforce.tsx
[personal]: ../../src/components/workforce/WorkforcePersonal.tsx
[admin]: ../../src/pages/admin/AdminWorkforce.tsx
[continuation]: ../../src/lib/workforceContinuation.ts
[types]: ../../src/lib/tokWorkforce.ts
[hooks]: ../../src/hooks/useTokWorkforce.ts
[employees]: ../../src/components/workforce/WorkforceEmployees.tsx
[planning]: ../../src/components/workforce/WorkforcePlanning.tsx
[grid]: ../../src/components/workforce/WorkforceWeekGrid.tsx
[shift-editor]: ../../src/components/workforce/WorkforceShiftDialog.tsx
[planning-checks]: ../../src/components/workforce/workforcePlanningChecks.ts
[time]: ../../src/components/workforce/WorkforceTime.tsx
[signature-pad]: ../../src/components/workforce/WorkforceSignaturePad.tsx
[absences]: ../../src/components/workforce/WorkforceAbsences.tsx
[requests]: ../../src/components/workforce/WorkforceRequests.tsx
[request-form]: ../../src/components/workforce/WorkforceRequestForm.tsx
[exchanges]: ../../src/components/workforce/WorkforceExchanges.tsx
[personal-exchanges]: ../../src/components/workforce/WorkforcePersonalExchanges.tsx
[reports]: ../../src/components/workforce/WorkforceReports.tsx
[calculations]: ../../src/lib/tokWorkforceReporting.ts
[pdf]: ../../src/lib/tokWorkforcePdf.ts
[analytics]: ../../src/components/workforce/WorkforceAnalytics.tsx
[settings]: ../../src/components/workforce/WorkforceSettingsPanel.tsx
[invitation-dialog]: ../../src/components/workforce/WorkforceInvitationDialog.tsx
[clock]: ../../src/components/workforce/WorkforceClock.tsx
[clock-overview]: ../../src/components/workforce/WorkforceClockOverview.tsx
[assistant]: ../../src/components/workforce/WorkforceAssistant.tsx
[assistant-edge]: ../../supabase/functions/tok-workforce-assistant/index.ts
[assistant-context]: ../../supabase/functions/_shared/workforce-assistant-context.ts
[sql-base]: ../../supabase/migrations/20261014165500_tok_workforce_restaurants.sql
[sql-clock]: ../../supabase/migrations/20261014180000_tok_workforce_clock_teams.sql
[sql-invitations]: ../../supabase/migrations/20261018190000_tok_workforce_invitations.sql
[sql-integrity]: ../../supabase/migrations/20261028044351_tok_workforce_integrity_and_workflows.sql
[manager-test]: ../../src/test/MyWorkforceManager.test.tsx
[portal-test]: ../../src/test/MyWorkforce.test.tsx
