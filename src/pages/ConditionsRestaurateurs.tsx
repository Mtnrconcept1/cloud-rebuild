import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const updatedAt = LEGAL_EFFECTIVE_DATE_FR;

const quickPoints = [
  "Abonnements : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499 par mois ; annuel au prix de 11 mois pour 12.",
  "Toute réservation réellement honorée est facturée CHF 5, quelle qu'en soit l'origine ; annulations, no-shows, remboursements et démonstrations valent CHF 0.",
  "Le frais de réservation est forfaitaire : il ne dépend ni du chiffre d'affaires de la table, ni du plan souscrit.",
  "Le restaurant conserve au minimum 90 % de la base commissionnable des commandes et 100 % des pourboires.",
  "Elite couvre trois établissements ; chaque site additionnel coûte CHF 149 par mois.",
  "Les tarifs et la source d'acquisition sont enregistrés côté serveur au moment de la transaction.",
];

const sections = [
  {
    title: "1. Objet et champ d'application",
    body: [
      "Les présentes Conditions Générales Restaurateurs régissent les relations contractuelles entre TOK et les établissements partenaires, exploitants, sociétés, indépendants ou représentants autorisés qui utilisent la plateforme TOK pour gérer leur présence, leurs commandes, réservations, offres, campagnes, contenus, outils marketing, outils IA, factures, statistiques ou services associés.",
      "L'inscription, la demande d'onboarding, l'accès au dashboard restaurateur, l'utilisation d'un service TOK ou la validation d'une offre commerciale implique l'acceptation pleine et entière des présentes conditions, sous réserve de tout contrat écrit spécifique signé entre les parties.",
      "Ces conditions complètent les Conditions Générales d'Utilisation, la Politique de confidentialité, la Politique cookies, les conditions tarifaires, les conditions de paiement et les règles opérationnelles affichées dans le dashboard.",
    ],
  },
  {
    title: "2. Definitions",
    body: [
      "Réservation acquise par TOK désigné une réservation dont la première source vérifiable est la marketplace TOK. La source est attribuée et scellée côté serveur à la création.",
      "Canal propre désigné le site du restaurant, un QR code attribué, Instagram, Google ou un fichier client légitime du restaurateur. Le traitement technique par TOK ne transforme pas un canal propre en acquisition TOK.",
      "Réservation honorée désigné une table effectivement accueillie, déclarée par une personne autorisée du restaurant avec le chiffre d'affaires attribué. Une annulation, un no-show, un remboursement ou une démonstration n'est jamais honorée au sens tarifaire.",
      "Base commissionnable d'une commande exclut les pourboires, la livraison refacturée et les autres coûts explicitement identifiés comme débours ou refacturations.",
      "Revenu TOK réellement encaissé désigné les montants définitivement reçus par TOK, hors TVA, remboursements, pourboires, livraison et coûts refacturés.",
    ],
  },
  {
    title: "3. Services fournis par TOK",
    body: [
      "TOK met à disposition des outils permettant au restaurateur de présenter son établissement, publier des informations, recevoir des réservations, vendre des offres, gérer des commandes, animer son actualité, lancer des campagnes, suivre des statistiques, utiliser des outils IA, consulter ses factures et dialoguer avec le support.",
      "TOK peut ajouter, modifier, limiter, suspendre ou retirer un service à tout moment, notamment pour des raisons de sécurité, conformité, maintenance, test, disponibilité locale, bug, évolution commerciale ou décision administrative.",
      "Sauf mention expresse contraire, TOK agit comme plateforme technologique d'intermédiation et non comme exploitant du restaurant, producteur alimentaire, employeur du personnel du restaurant ou garant sanitaire des prestations du restaurateur.",
    ],
  },
  {
    title: "4. Onboarding, vérification et accès restaurateur",
    body: [
      "Le restaurateur doit fournir des informations exactes, complètes et à jour: raison sociale, enseigne, adresse, représentant autorisé, coordonnées, documents utiles, IBAN, informations fiscales, moyens de paiement, horaires, modes de service, capacités, menus, photos et justificatifs demandes.",
      "TOK peut vérifier l'identité commerciale, la cohérence des informations, l'autorisation d'exploiter, les droits sur la marque, les documents transmis et la conformité minimale du dossier avant activation complète du compte ou d'un service.",
      "TOK peut refuser, suspendre ou limiter un onboarding lorsque le dossier est incomplet, incohérent, frauduleux, non conforme, juridiquement risque ou incompatible avec la qualité attendue sur la plateforme.",
      "Le restaurateur est responsable de tous les actes effectués depuis son compte, y compris par ses employés, prestataires ou personnes auxquelles il a donné accès.",
    ],
  },
  {
    title: "4 bis. Service Google Business Profile",
    body: [
      "Selon l'abonnement souscrit, TOK peut fournir un audit de fiche, des recommandations sur les informations, horaires, categories, photos et liens, préparer des projets de publications ou de réponses aux avis, créer un lien TOK traçable et suivre les clics ou conversions effectivement mesurables. Le statut inclus ou optionnel est affiché dans l'offre ; une prestation hors abonnement fait l'objet d'un accord ou devis distinct.",
      "TOK ne relie que les modules réellement activés dans le dashboard, tels que la fiche restaurant, la réservation ou la commande. TOK n'annonce aucune synchronisation, publication ou réponse automatique dans Google tant qu'une telle intégration n'est pas effectivement disponible et activée.",
      "Toute intervention de TOK dans Google exige un mandat écrit, un accès propriétaire ou gestionnaire accordé par le restaurateur et les droits nécessaires sur les contenus. Le restaurateur reste responsable de l'exactitude des informations et valide les modifications, publications et réponses aux avis. TOK ne demande pas le mot de passe personnel Google.",
      "Le délai d'audit ou d'intervention est confirmé après réception d'un dossier complet et des accès requis. Les délais sont suspendus pendant toute vérification, refus, restriction ou demande de justificatif de Google, ou tant qu'une validation du restaurateur manque.",
      "Google contrôle seul l'éligibilité, la validation, l'affichage, les fonctionnalités, le classement et la suspension de la fiche. TOK ne garantit aucun rang, volume de vues, clics, appels, réservations ou commandes. En cas de suspension, TOK peut aider au diagnostic et au recours, sans garantir le rétablissement ni son délai.",
    ],
  },
  {
    title: "5. Obligations générales du restaurateur",
    body: [
      "Le restaurateur s'engage à maintenir exactes et à jour toutes les informations visibles ou utilisées sur TOK: horaires, disponibilités, menus, prix, photos, vidéos, allergènes, ingrédients, conditions d'annulation, délais, modes de retrait, livraison, adresse, telephone, liens et informations commerciales.",
      "Le restaurateur garantit que les informations publiées sont conformes à la réalité et ne sont pas trompeuses, exagérées, discriminatoires, illicites ou contraires aux droits de tiers.",
      "Le restaurateur s'engage à utiliser TOK de bonne foi, à coopérer avec le support, à traiter les clients avec professionnalisme, à respecter les lois applicables et à ne pas porter atteinte à la sécurité, l'image ou le fonctionnement de la plateforme.",
    ],
  },
  {
    title: "6. Hygiène, allergènes, sécurité alimentaire et conformité",
    body: [
      "Le restaurateur demeure seul responsable de la préparation, conservation, disponibilité, hygiène, qualité, conformité, température, emballage, traçabilite, informations allergènes et sécurité alimentaire des produits qu'il propose.",
      "Les prix, descriptions, photos et contenus IA ne remplacent jamais l'obligation du restaurateur de vérifier les ingrédients, allergènes, contaminations croisées, mentions obligatoires, restrictions alimentaires et informations pouvant influencer la décision du client.",
      "Le restaurateur doit disposer des autorisations administratives, assurances, licences, contrôles et obligations applicables à son activité. TOK peut demander des justificatifs lorsqu'un risque client, sanitaire, réputationnel ou légal est identifié.",
    ],
  },
  {
    title: "7. Commissions et tarification",
    body: [
      "Les abonnements mensuels sont : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499. Une période annuelle fournit douze mois de service et est facturée onze mensualités, soit respectivement CHF 759, CHF 1'419, CHF 2'189 et CHF 5'489.",
      "Le prix d'une réservation honorée est de CHF 5, identique pour tous les plans. Ce montant est forfaitaire : il n'est ni plafonné, ni indexé sur le chiffre d'affaires attribué à la table.",
      "Les commissions de commande marketplace sont de 9,9 % en Starter, 8,9 % en Business, 7,9 % en Premium et 6,9 % en Elite, sur la base commissionnable. Le restaurant conserve donc respectivement 90,1 %, 91,1 %, 92,1 % ou 93,1 %, avant les éléments exclus qui lui reviennent intégralement.",
      "Elite inclut trois établissements. Chaque établissement additionnel est facturé CHF 149 par mois. Les autres plans couvrent un établissement sauf accord écrit.",
      "Les prix sont enregistrés sous une version tarifaire immuable lors de la souscription ou de la transaction. Une évolution future ne modifie pas rétroactivement les opérations déjà acquises.",
    ],
  },
  {
    title: "8. Facturation, reversements, taxes et repartition contractuelle",
    body: [
      "Sur chaque frais de réservation effectivement encaissé, 90 % reviennent à TOK et 10 % au développeur. Les frais sont annulés ou crédités lorsqu'une réservation devient non éligible avant clôture.",
      "Sur une commande, 1 % de la base commissionnable revient au développeur ; TOK conserve le solde de la commission du plan et le restaurant le solde de la base, avec 100 % des pourboires. La clé 90 % restaurant, 9 % TOK et 1 % développeur constitue la référence maximale à 10 % ; les taux Fair Growth inférieurs réduisent la part TOK au bénéfice du restaurant.",
      "Sur les abonnements, publicités et modules, le développeur reçoit 10 % du revenu TOK réellement encaissé, hors TVA, remboursements, pourboires, livraison et coûts refacturés.",
      "Pour les commandes marketplace, TOK absorbe les coûts Stripe et Connect sur sa propre part afin que le restaurant recoive la part Fair Growth annoncée. Les frais publics des prestataires peuvent évoluer ; leur snapshot et le moyen réellement utilise sont conservés avec la transaction.",
      "Le moteur de facturation ventile chaque ligne au taux suisse applicable. Le taux normal est actuellement 8,1 % et le taux réduit 2,6 %. La restauration sur place et l'alcool relèvent en principe du taux normal ; le restaurateur demeure responsable de la qualification fiscale de ses produits.",
    ],
  },
  {
    title: "9. Attribution et absence de contournement",
    body: [
      "Le restaurant reste libre d'utiliser ses canaux propres. La source d'acquisition continue d'être attribuée et scellée côté serveur à des fins de statistiques, sans influencer le montant facturé.",
      "Il est en revanche interdit de modifier, masquer ou falsifier la source d'une réservation déjà initiée et attribuée à TOK, de demander au client de la recréer sur un autre canal, ou de déclarer un faux no-show afin d'éviter un frais légitime.",
      "TOK conserve une piste d'audit de la source, des jetons de canal, du statut, du chiffre d'affaires attribué, du plafond et de la version tarifaire. Toute correction exceptionnelle exige un traitement administratif tracé.",
    ],
  },
  {
    title: "10. Réservations, no-shows, annulations et plafond",
    body: [
      "Aucun frais n'est créé à la simple confirmation. Une personne autorisée doit marquer la réservation honorée et saisir le chiffre d'affaires attribué à la table ; le moteur applique alors le tarif du plan et le plafond de 7 %.",
      "Les réservations du site du restaurant, QR code, Instagram, Google et fichier client sont gratuites. Les annulations, no-shows, remboursements et environnements de démonstration sont également gratuits.",
      "Une réservation honorée est verrouillee contre une requalification ordinaire en no-show. Les remboursements et contestations sont rapproches de la facturation avant clôture ou traites par avoir audite.",
    ],
  },
  {
    title: "11. Commandes, paiements, pourboires et modules",
    body: [
      "La commission marketplace s'applique uniquement à la base commissionnable. Les pourboires sont reversés à 100 % au restaurant et ne servent jamais de base à la commission TOK ou développeur.",
      "TWINT est prioritaire sur les parcours Stripe Checkout compatibles en Suisse. Il n'est pas propose lorsqu'une autorisation avec capture manuelle est nécessaire, notamment Match Group ; une carte compatible est alors requise.",
      "Les modules proposés sur demande sont : No-Show Shield CHF 39/mois ; Marketing Autopilot IA CHF 79/mois ; Margin & Waste Pilot CHF 59/mois ; Réputation IA CHF 29/mois. Le Réceptionniste téléphonique IA (CHF 49/mois plus CHF 1.50 par réservation réussie), Direct Order Saver (CHF 149/mois plus 1,5 %) et les cartes-cadeaux et expériences (3 % plus coût de paiement) restent des offres pilote soumises à validation technique et contractuelle.",
      "Une demande depuis le dashboard n'active pas un module et n'autorise aucun débit. TOK et le restaurateur confirment le périmètre, les prérequis, le prix, la date de début et les conditions de facturation avant toute activation payante.",
      "Garantie de valeur : si, sur une fenêtre de 90 jours après activation facturée et selon les données attribuables convenues, un module ne produit pas au moins trois fois son coût, TOK recommande sa désactivation ou accorde un crédit après vérification. Cette garantie ne constitue pas une promesse de chiffre d'affaires.",
    ],
  },
  {
    title: "12. Offres, ventes flash, anti-gaspi et offres progressives",
    body: [
      "Le restaurateur est responsable des stocks, quantités, prix barrés, remises, horaires, conditions, photos et limites associés à ses offres.",
      "Une offre doit correspondre à une disponibilité réelle. Les offres anti-gaspillage, ventes flash, offres progressives ou offres du jour ne doivent pas tromper le client sur la quantité, la fraîcheur, la remise, la date limite ou les conditions de retrait.",
      "TOK peut retirer ou suspendre une offre en cas d'erreur, abus, rupture répétée, prix incohérent, réclamations nombreuses, risque légal ou non-respect des règles de publication.",
    ],
  },
  {
    title: "13. Actualités, avis, commentaires et signalements",
    body: [
      "Les actualités, avis, commentaires, vidéos, photos, reposts et réponses restaurateur doivent refléter des informations authentiques, licites et respectueuses.",
      "Les avis publiés doivent correspondre à une expérience réelle. TOK peut masquer, modérer ou supprimer tout contenu faux, trompeur, injurieux, diffamatoire, haineux, frauduleux, illicite, publicitaire abusif ou contraire aux règles de la plateforme.",
      "Les signalements doivent être légitimes. Toute campagne de signalement abusif, harcèlement d'un concurrent, manipulation de réputation, faux avis ou action coordonnée frauduleuse peut entraîner suspension ou suppression du compte.",
    ],
  },
  {
    title: "14. Campagnes sponsorisées et communications commerciales",
    body: [
      "Le restaurateur peut lancer ou demander des campagnes sponsorisées selon les fonctionnalités disponibles: objectif, budget, durée, zone, audience, format, support, texte, visuel, calendrier et indicateurs de performance.",
      "TOK ne garantit aucun volume de ventes, chiffre d'affaires, clics, impressions, réservations, commandes ou conversion. Les estimations de portee, CPC, vues et resultats sont indicatives.",
      "Le restaurateur garantit que ses publicités, promotions, prix, réductions, photos et claims commerciaux sont exacts, non trompeurs et conformes aux règles applicables à la publicité et à la concurrence loyale.",
      "TOK peut refuser, suspendre ou modifier la diffusion d'une campagne en cas de contenu illicite, trompeur, dangereux, discriminatoire, sensible, non paye, techniquement instable ou contraire aux interets des utilisateurs.",
    ],
  },
  {
    title: "15. Outils d'intelligence artificielle et ressources de marque",
    body: [
      "Les outils d'intelligence artificielle proposés par TOK sont fournis à titre d'assistance: amélioration de texte, visuels, retouche photo, analyse marketing, suggestions, CRM, templates, modération ou recommandations opérationnelles.",
      "Le restaurateur demeure seul responsable des contenus qu'il publie, valide ou réutilise, y compris lorsqu'ils sont générés, retouchés, résumés ou proposés par IA.",
      "Le restaurateur garantit disposer de l'ensemble des droits nécessaires sur les contenus transmis à TOK: photographies, vidéos, logos, marques, textes, cartes de visite, cartes de restaurant, menus, visuels existants et éléments graphiques.",
      "TOK ne garantit ni l'exactitude absolue, ni l'absence d'erreur, ni les performances commerciales des contenus générés. Le restaurateur doit vérifier prix, horaires, allergènes, ingrédients, visuels, droits de tiers et mentions légales avant publication.",
      "Il est interdit d'utiliser les outils IA pour tenter d'obtenir des secrets, contourner les systemes, injecter des commandes, générer des contenus illicites, trompeurs, diffamatoires, discriminatoires, dangereux ou portant atteinte aux droits de tiers.",
    ],
  },
  {
    title: "16. Propriété intellectuelle et licence de contenus",
    body: [
      "Le restaurateur conserve la propriété des contenus qu'il transmet à TOK, sous réserve des droits de tiers et des licences applicables.",
      "Le restaurateur accorde à TOK une licence non exclusive, mondiale, gratuite, transférable aux prestataires techniques nécessaires et valable pendant la durée du partenariat pour afficher, héberger, adapter techniquement, optimiser, promouvoir, analyser, modérer et diffuser les contenus dans le cadre des services TOK.",
      "Cette licence permet notamment l'affichage sur la plateforme, la promotion de l'établissement, les campagnes de communication TOK, les démonstrations commerciales, les previews, les statistiques, les tests qualité et les formats adaptés aux appareils.",
      "Les logiciels, interfaces, modèles, prompts système, algorithmes, méthodes, données agrégées, designs TOK, tableaux de bord, templates et outils internes restent la propriété de TOK ou de ses partenaires.",
    ],
  },
  {
    title: "17. Données client, CRM, confidentialité et sécurité",
    body: [
      "Les données personnelles traitées via TOK doivent être utilisées uniquement pour les finalités légitimes liées au service: gestion d'une réservation, commande, support, relation client, fidélité, obligations comptables, litige, campagne autorisée ou analyse interne conforme.",
      "Le restaurateur s'engage à respecter la Loi fédérale suisse sur la protection des données, le RGPD lorsqu'il est applicable, les préférences de notification, les oppositions et les principes de confidentialité.",
      "Les exports CRM, CSV, XLS, factures, listes de clients, historiques et profils de vente doivent être conservés de manière sécurisée, accessibles uniquement aux personnes autorisées et supprimés lorsqu'ils ne sont plus nécessaires.",
      "Le restaurateur s'interdit de revendre, louer, partager, enrichir illicitement, aspirer, scraper, harceler ou contacter des clients hors cadre légitime à partir des données TOK.",
      "TOK peut imposer des mesures de sécurité complémentaires, notamment authentification forte, limitation d'export, journalisation, quotas, vérification d'identité ou blocage en cas de risque.",
    ],
  },
  {
    title: "18. Données et preuves numeriques",
    body: [
      "Les journaux informatiques, horodatages, validations électroniques, historiques de réservation, confirmations de paiement, traces de campagne, logs de notification, statuts et données techniques enregistrés par TOK font foi jusqu'à preuve contraire.",
      "Cette présomption peut être renversée par tout moyen de preuve admissible. Chaque partie doit conserver les éléments utiles à ses réclamations, notamment tickets, justificatifs, photos, historiques internes et preuves de service.",
      "TOK peut suspendre temporairement un remboursement, un versement, une campagne, une publication ou une décision opérationnelle durant l'instruction d'un dossier.",
    ],
  },
  {
    title: "19. Litiges, contestations, fraude et fausses déclarations",
    body: [
      "TOK agit comme mediateur technique entre les parties. Aucune reclamation ne donne automatiquement raison au client ou au restaurateur. Chaque dossier est étudié individuellement selon les éléments disponibles.",
      "Le restaurateur accepte de fournir tout element utile: tickets de caisse, justificatifs de préparation, preuves de service, photographies, historiques internes, témoignages et enregistrements de vidéosurveillance lorsque leur utilisation est légalement autorisée.",
      "Sont notamment frauduleux: fausses réservations, faux avis, demandes abusives de remboursement, fausses déclarations, paiement frauduleux, manipulation Miamz, création de comptes fictifs, auto-commandes artificielles, abus de campagnes ou tentative d'obtenir gratuitement un produit ou service consommé.",
      "TOK peut suspendre immédiatement tout compte, campagne, paiement, avantage ou publication suspect pendant la durée de l'enquête.",
    ],
  },
  {
    title: "20. Disponibilite, maintenance et sous-traitants",
    body: [
      "TOK met en œuvre des moyens raisonnables afin d'assurer la disponibilité et la sécurité de la plateforme, sans garantir l'absence totale d'interruption, d'erreur, de bug, de perte temporaire, de lenteur ou d'indisponibilite.",
      "La plateforme dépend de prestataires tiers, notamment hébergement, base de données, paiement, email, SMS, push, IA, stockage, cartographie, analytics ou réseaux sociaux. Les incidents de ces prestataires peuvent affecter les services TOK.",
      "TOK peut réaliser des maintenances, mises à jour, migrations, tests, corrections de sécurité ou modifications de service avec ou sans notification préalable selon l'urgence.",
    ],
  },
  {
    title: "21. Limitation de responsabilité",
    body: [
      "TOK agit comme plateforme technologique d'intermédiation. TOK ne saurait etre tenu responsable des pertes d'exploitation, pertes de clientèle, pertes de bénéfices, erreurs du restaurateur, informations publiées par le restaurateur, défaillances de prestataires tiers ou interruptions de réseaux externes.",
      "Sauf disposition légale imperative contraire, la responsabilité totale de TOK ne pourra excéder le montant total des commissions effectivement perçues auprès du restaurateur au cours des six mois précédant l'événement à l'origine du dommage.",
      "Cette limitation ne s'applique pas en cas de faute intentionnelle ou faute grave de TOK, ni lorsque le droit suisse impératif l'interdit.",
    ],
  },
  {
    title: "22. Suspension et résiliation",
    body: [
      "Le restaurateur peut demander depuis Mon compte/Facturation ou au support la pause d'un module ou la résiliation de son abonnement. Toute date d'effet est confirmée par TOK. La pause arrête l'usage et les facturations futures du module selon cette confirmation, sans annuler les sommes déjà dues.",
      "Une résiliation mensuelle prend effet à la fin de la période en cours. Une période annuelle est engagée jusqu’à son échéance et ne donne pas lieu à remboursement anticipé, sauf accord écrit ou droit impératif. Les modules optionnels peuvent etre résiliés séparément de l'abonnement principal.",
      "TOK peut suspendre ou résilier un compte en cas de fraude, non-paiement, violation des présentes conditions, utilisation abusive, atteinte à la sécurité, contournement de plateforme, non-coopération, risque légal, réclamations graves ou atteinte à l'image de TOK.",
      "Sauf fraude manifeste, urgence, risque de sécurité, risque client ou obligation légale, TOK peut accorder un delai raisonnable permettant au restaurateur de régulariser sa situation.",
      "La résiliation n'efface pas les sommes dues, obligations de confidentialité, obligations de preuve, droits de recouvrement, obligations de conservation comptable ou responsabilités nées avant la fin du partenariat.",
    ],
  },
  {
    title: "23. Force majeure",
    body: [
      "Aucune partie ne pourra etre tenue responsable en cas de force majeure ou événement échappant raisonnablement à son contrôle, notamment catastrophe naturelle, conflit armé, acte terroriste, pandémie, grève générale, décision administrative, panne majeure d'infrastructure, cyberattaque, interruption d'énergie ou indisponibilite durable de services essentiels.",
    ],
  },
  {
    title: "24. Modifications des conditions",
    body: [
      "TOK peut modifier les présentes conditions afin de tenir compte des évolutions légales, techniques, commerciales, fiscales, sécuritaires ou des nouveaux services proposés.",
      "Les modifications substantielles seront notifiées aux restaurateurs avant leur entrée en vigueur par email, notification, dashboard ou tout moyen approprie. La poursuite de l'utilisation de la plateforme après entrée en vigueur vaut acceptation des conditions modifiées.",
    ],
  },
  {
    title: "25. Droit applicable et juridiction",
    body: [
      "Les présentes conditions sont régies par le droit suisse.",
      "Tout litige relatif à leur interprétation ou à leur exécution relève de la compétence exclusive des tribunaux du Canton de Genève, sous réserve des dispositions légales imperatives applicables.",
      "Les parties s'engagent, lorsque cela est raisonnable, à rechercher une solution amiable avant toute procédure judiciaire.",
    ],
  },
  {
    title: "26. TOK Connect, partenaires API et MCP",
    body: [
      "TOK Connect permet à des partenaires approuvés d'interagir avec certains services TOK via API REST, OAuth, webhooks, portail développeur, documentation OpenAPI, serveur MCP et clients sandbox ou production.",
      "Le restaurateur peut autoriser ou refuser un partenaire par restaurant lorsque la fonctionnalité est disponible. Cette autorisation peut être limitée par scopes, quotas, période, finalité, volume de réservations, taille de table, disponibilités, webhooks ou tout autre paramètre affiche dans le dashboard.",
      "Les données accessibles via TOK Connect restent limitées au périmètre autorisé: informations restaurant, menu, disponibilités, réservation, performance agrégée, crédits ou previews de campagne selon les scopes accordés. Les données de paiement sensibles, secrets serveur et informations non nécessaires ne doivent pas être transmises au partenaire.",
      "Les réservations créées par TOK Connect engagent le restaurant uniquement lorsqu'elles sont confirmées selon le parcours TOK, les disponibilités réelles, les règles de service et les limites accordées au partenaire. Le restaurateur doit maintenir ses horaires, tables, capacités et restrictions à jour afin d'éviter des confirmations incorrectes.",
      "Les campagnes, offres, crédits, actions marketing autonomes et changements commerciaux sensibles générés via TOK Connect restent en preview, suggestion ou validation humaine tant que TOK n'a pas active explicitement un mode plus autonome. Le restaurateur demeure responsable de toute campagne ou offre qu'il valide.",
      "Les webhooks, logs API, traces MCP, request_id, clés d'idempotence, signatures, scopes et événements d'audit peuvent etre conservés afin de diagnostiquer les incidents, vérifier les quotas, prouver une action, sécuriser l'intégration et traiter les litiges.",
      "Le restaurateur doit choisir des partenaires fiables, vérifier la finalité de l'intégration, informer TOK de tout usage suspect et retirer l'autorisation lorsqu'elle n'est plus nécessaire. TOK peut suspendre ou révoquer un partenaire en cas de risque, abus, faille de sécurité, non-conformité ou demande légitime.",
    ],
  },
];

export default function ConditionsRestaurateurs() {
  useSeoMeta({
    title: "Conditions générales restaurateurs | TOK",
    description: "Cadre contractuel applicable aux établissements partenaires utilisant les services TOK.",
    path: "/conditions-restaurateurs",
  });

  return (
    <main className="bg-background">
      <section className="border-b bg-gradient-to-br from-orange-50 via-background to-background">
        <div className="container grid gap-8 py-12 md:grid-cols-[minmax(0,1fr)_360px] md:py-16">
          <div className="space-y-5">
            <p className="inline-flex rounded-full border border-orange-200 bg-white px-4 py-2 text-xs font-bold uppercase tracking-[0.28em] text-orange-600">
              Conditions restaurateurs
            </p>
            <div className="space-y-3">
              <h1 className="font-display text-4xl font-bold tracking-tight md:text-5xl">
                Conditions générales restaurateurs TOK
              </h1>
              <p className="max-w-3xl text-base leading-7 text-muted-foreground">
                Cadre contractuel entre TOK et les établissements partenaires utilisant les outils de réservation,
                commande, marketing, CRM, IA, facturation et pilotage restaurateur.
              </p>
            </div>
            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
              <span className="rounded-full border bg-white px-3 py-1">Version {LEGAL_DOCUMENTS.restaurantTerms.version}</span>
              <span className="rounded-full border bg-white px-3 py-1">Derniere mise a jour: {updatedAt}</span>
              <span className="rounded-full border bg-white px-3 py-1">Droit suisse · Geneve</span>
            </div>
          </div>

          <aside className="rounded-3xl border bg-white p-5 shadow-sm">
            <h2 className="font-display text-xl font-bold">A retenir</h2>
            <ul className="mt-4 space-y-3 text-sm text-muted-foreground">
              {quickPoints.map((point) => (
                <li key={point} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-500" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      </section>

      <div className="container grid gap-8 py-10 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4 rounded-3xl border bg-card p-4">
            <p className="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Sommaire</p>
            <nav className="max-h-[68vh] space-y-2 overflow-y-auto pr-1 text-sm">
              {sections.map((section) => (
                <a key={section.title} href={`#article-${section.title.split(".")[0]}`} className="block rounded-xl px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground">
                  {section.title}
                </a>
              ))}
            </nav>
          </div>
        </aside>

        <div className="space-y-8">
          <div className="prose prose-foodhub max-w-none space-y-8">
            {sections.map((section) => (
              <section key={section.title} id={`article-${section.title.split(".")[0]}`} className="scroll-mt-28 rounded-3xl border bg-card p-5 shadow-sm md:p-7">
                <h2 className="text-2xl font-semibold">{section.title}</h2>
                <div className="mt-4 space-y-4">
                  {section.body.map((paragraph) => (
                    <p key={paragraph} className="text-foreground/80 leading-relaxed">
                      {paragraph}
                    </p>
                  ))}
                </div>
              </section>
            ))}

            <section className="rounded-3xl border bg-card p-5 shadow-sm md:p-7">
              <h2 className="text-2xl font-semibold">27. Contact</h2>
              <p className="mt-4 text-foreground/80 leading-relaxed">
                Pour toute question relative aux presentes conditions restaurateurs, contactez TOK par email ou via le centre d'aide.
              </p>
              <ul className="mt-4 list-none space-y-2 text-foreground/80">
                <li><span className="font-medium text-foreground">Email :</span> {SUPPORT_EMAIL}</li>
                <li><span className="font-medium text-foreground">Formulaire :</span> <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
                <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide TOK</Link></li>
              </ul>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
