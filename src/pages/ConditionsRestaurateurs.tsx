import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";
import { LEGAL_DOCUMENTS, LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const updatedAt = LEGAL_EFFECTIVE_DATE_FR;

const quickPoints = [
  "Fair Growth : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499 par mois ; annuel au prix de 11 mois pour 12.",
  "Seules les reservations acquises par TOK et reellement honorees sont facturees ; les canaux propres, annulations, no-shows, remboursements et demonstrations valent CHF 0.",
  "Le frais de reservation est plafonne a 7 % du chiffre d'affaires attribue a la table.",
  "Le restaurant conserve au minimum 90 % de la base commissionnable des commandes et 100 % des pourboires.",
  "Elite couvre trois etablissements ; chaque site additionnel coute CHF 149 par mois.",
  "Les tarifs et la source d'acquisition sont enregistres cote serveur au moment de la transaction.",
];

const sections = [
  {
    title: "1. Objet et champ d'application",
    body: [
      "Les presentes Conditions Generales Restaurateurs regissent les relations contractuelles entre TOK et les etablissements partenaires, exploitants, societes, independants ou representants autorises qui utilisent la plateforme TOK pour gérer leur presence, leurs commandes, reservations, offres, campagnes, contenus, outils marketing, outils IA, factures, statistiques ou services associes.",
      "L'inscription, la demande d'onboarding, l'acces au dashboard restaurateur, l'utilisation d'un service TOK ou la validation d'une offre commerciale implique l'acceptation pleine et entiere des presentes conditions, sous reserve de tout contrat ecrit specifique signe entre les parties.",
      "Ces conditions completent les Conditions Generales d'Utilisation, la Politique de confidentialite, la Politique cookies, les conditions tarifaires, les conditions de paiement et les regles operationnelles affichees dans le dashboard.",
    ],
  },
  {
    title: "2. Definitions",
    body: [
      "Reservation acquise par TOK designe une reservation dont la premiere source verifiable est la marketplace TOK. La source est attribuee et scellee cote serveur a la creation.",
      "Canal propre designe le site du restaurant, un QR code attribue, Instagram, Google ou un fichier client legitime du restaurateur. Le traitement technique par TOK ne transforme pas un canal propre en acquisition TOK.",
      "Reservation honoree designe une table effectivement accueillie, declaree par une personne autorisee du restaurant avec le chiffre d'affaires attribue. Une annulation, un no-show, un remboursement ou une demonstration n'est jamais honoree au sens tarifaire.",
      "Base commissionnable d'une commande exclut les pourboires, la livraison refacturee et les autres couts explicitement identifies comme debours ou refacturations.",
      "Revenu TOK reellement encaisse designe les montants definitivement recus par TOK, hors TVA, remboursements, pourboires, livraison et couts refactures.",
    ],
  },
  {
    title: "3. Services fournis par TOK",
    body: [
      "TOK met a disposition des outils permettant au restaurateur de presenter son etablissement, publier des informations, recevoir des reservations, vendre des offres, gérer des commandes, animer son actualite, lancer des campagnes, suivre des statistiques, utiliser des outils IA, consulter ses factures et dialoguer avec le support.",
      "TOK peut ajouter, modifier, limiter, suspendre ou retirer un service a tout moment, notamment pour des raisons de securite, conformite, maintenance, test, disponibilite locale, bug, evolution commerciale ou decision administrative.",
      "Sauf mention expresse contraire, TOK agit comme plateforme technologique d'intermediation et non comme exploitant du restaurant, producteur alimentaire, employeur du personnel du restaurant ou garant sanitaire des prestations du restaurateur.",
    ],
  },
  {
    title: "4. Onboarding, verification et acces restaurateur",
    body: [
      "Le restaurateur doit fournir des informations exactes, completes et a jour: raison sociale, enseigne, adresse, representant autorise, coordonnees, documents utiles, IBAN, informations fiscales, moyens de paiement, horaires, modes de service, capacités, menus, photos et justificatifs demandes.",
      "TOK peut verifier l'identite commerciale, la coherence des informations, l'autorisation d'exploiter, les droits sur la marque, les documents transmis et la conformite minimale du dossier avant activation complete du compte ou d'un service.",
      "TOK peut refuser, suspendre ou limiter un onboarding lorsque le dossier est incomplet, incoherent, frauduleux, non conforme, juridiquement risque ou incompatible avec la qualite attendue sur la plateforme.",
      "Le restaurateur est responsable de tous les actes effectues depuis son compte, y compris par ses employes, prestataires ou personnes auxquelles il a donne acces.",
    ],
  },
  {
    title: "5. Obligations generales du restaurateur",
    body: [
      "Le restaurateur s'engage a maintenir exactes et a jour toutes les informations visibles ou utilisees sur TOK: horaires, disponibilites, menus, prix, photos, videos, allergenes, ingredients, conditions d'annulation, delais, modes de retrait, livraison, adresse, telephone, liens et informations commerciales.",
      "Le restaurateur garantit que les informations publiees sont conformes a la realite et ne sont pas trompeuses, exagerees, discriminatoires, illicites ou contraires aux droits de tiers.",
      "Le restaurateur s'engage a utiliser TOK de bonne foi, a cooperer avec le support, a traiter les clients avec professionnalisme, a respecter les lois applicables et a ne pas porter atteinte a la securite, l'image ou le fonctionnement de la plateforme.",
    ],
  },
  {
    title: "6. Hygiène, allergenes, securite alimentaire et conformite",
    body: [
      "Le restaurateur demeure seul responsable de la preparation, conservation, disponibilite, hygiene, qualite, conformite, temperature, emballage, traçabilite, informations allergenes et securite alimentaire des produits qu'il propose.",
      "Les prix, descriptions, photos et contenus IA ne remplacent jamais l'obligation du restaurateur de verifier les ingredients, allergenes, contaminations croisees, mentions obligatoires, restrictions alimentaires et informations pouvant influencer la decision du client.",
      "Le restaurateur doit disposer des autorisations administratives, assurances, licences, controles et obligations applicables a son activite. TOK peut demander des justificatifs lorsqu'un risque client, sanitaire, reputational ou legal est identifie.",
    ],
  },
  {
    title: "7. Commissions et tarification Fair Growth",
    body: [
      "Les abonnements mensuels sont : Starter CHF 69, Business CHF 129, Premium CHF 199 et Elite CHF 499. Une periode annuelle fournit douze mois de service et est facturee onze mensualites, soit respectivement CHF 759, CHF 1'419, CHF 2'189 et CHF 5'489.",
      "Le prix d'une reservation acquise par TOK et honoree est de CHF 5 en Starter, CHF 4.50 en Business, CHF 4 en Premium et CHF 3 en Elite. Le montant facture est toujours limite au plus petit de ce prix et de 7 % du chiffre d'affaires attribue a la table.",
      "Les commissions de commande marketplace sont de 9,9 % en Starter, 8,9 % en Business, 7,9 % en Premium et 6,9 % en Elite, sur la base commissionnable. Le restaurant conserve donc respectivement 90,1 %, 91,1 %, 92,1 % ou 93,1 %, avant les elements exclus qui lui reviennent integralement.",
      "Elite inclut trois etablissements. Chaque etablissement additionnel est facture CHF 149 par mois. Les autres plans couvrent un etablissement sauf accord ecrit.",
      "Les prix sont enregistres sous une version tarifaire immuable lors de la souscription ou de la transaction. Une evolution future ne modifie pas retroactivement les operations deja acquises.",
    ],
  },
  {
    title: "8. Facturation, reversements, taxes et repartition contractuelle",
    body: [
      "Sur chaque frais de reservation effectivement encaisse, 90 % reviennent a TOK et 10 % au developpeur. Les frais sont annules ou credites lorsqu'une reservation devient non eligible avant cloture.",
      "Sur une commande, 1 % de la base commissionnable revient au developpeur ; TOK conserve le solde de la commission du plan et le restaurant le solde de la base, avec 100 % des pourboires. La cle 90 % restaurant, 9 % TOK et 1 % developpeur constitue la reference maximale a 10 % ; les taux Fair Growth inferieurs reduisent la part TOK au benefice du restaurant.",
      "Sur les abonnements, publicites et modules, le developpeur recoit 10 % du revenu TOK reellement encaisse, hors TVA, remboursements, pourboires, livraison et couts refactures.",
      "Pour les commandes marketplace, TOK absorbe les couts Stripe et Connect sur sa propre part afin que le restaurant recoive la part Fair Growth annoncee. Les frais publics des prestataires peuvent evoluer ; leur snapshot et le moyen reellement utilise sont conserves avec la transaction.",
      "Le moteur de facturation ventile chaque ligne au taux suisse applicable. Le taux normal est actuellement 8,1 % et le taux reduit 2,6 %. La restauration sur place et l'alcool relevent en principe du taux normal ; le restaurateur demeure responsable de la qualification fiscale de ses produits.",
    ],
  },
  {
    title: "9. Attribution et absence de contournement",
    body: [
      "Le restaurant peut librement utiliser ses canaux propres gratuits. Aucune clause de non-contournement ne peut rendre payante une reservation dont l'origine verifiable est un canal propre.",
      "Il est en revanche interdit de modifier, masquer ou falsifier la source d'une reservation deja initiee et attribuee a TOK, de demander au client de la recreer sur un autre canal, ou de declarer un faux no-show afin d'eviter un frais legitime.",
      "TOK conserve une piste d'audit de la source, des jetons de canal, du statut, du chiffre d'affaires attribue, du plafond et de la version tarifaire. Toute correction exceptionnelle exige un traitement administratif trace.",
    ],
  },
  {
    title: "10. Reservations, no-shows, annulations et plafond",
    body: [
      "Aucun frais n'est cree a la simple confirmation. Une personne autorisee doit marquer la reservation honoree et saisir le chiffre d'affaires attribue a la table ; le moteur applique alors le tarif du plan et le plafond de 7 %.",
      "Les reservations du site du restaurant, QR code, Instagram, Google et fichier client sont gratuites. Les annulations, no-shows, remboursements et environnements de demonstration sont egalement gratuits.",
      "Une reservation honoree est verrouillee contre une requalification ordinaire en no-show. Les remboursements et contestations sont rapproches de la facturation avant cloture ou traites par avoir audite.",
    ],
  },
  {
    title: "11. Commandes, paiements, pourboires et modules",
    body: [
      "La commission marketplace s'applique uniquement a la base commissionnable. Les pourboires sont reverses a 100 % au restaurant et ne servent jamais de base a la commission TOK ou developpeur.",
      "TWINT est prioritaire sur les parcours Stripe Checkout compatibles en Suisse. Il n'est pas propose lorsqu'une autorisation avec capture manuelle est necessaire, notamment Match Group ; une carte compatible est alors requise.",
      "Les modules proposes sur demande sont : No-Show Shield CHF 39/mois ; Marketing Autopilot IA CHF 79/mois ; Margin & Waste Pilot CHF 59/mois ; Reputation IA CHF 29/mois. Le Receptionniste telephonique IA (CHF 49/mois plus CHF 1.50 par reservation reussie), Direct Order Saver (CHF 149/mois plus 1,5 %) et les cartes-cadeaux et experiences (3 % plus cout de paiement) restent des offres pilote soumises a validation technique et contractuelle.",
      "Une demande depuis le dashboard n'active pas un module et n'autorise aucun debit. TOK et le restaurateur confirment le perimetre, les prerequis, le prix, la date de debut et les conditions de facturation avant toute activation payante.",
      "Garantie de valeur : si, sur une fenetre de 90 jours apres activation facturee et selon les donnees attribuables convenues, un module ne produit pas au moins trois fois son cout, TOK recommande sa desactivation ou accorde un credit apres verification. Cette garantie ne constitue pas une promesse de chiffre d'affaires.",
    ],
  },
  {
    title: "12. Offres, ventes flash, anti-gaspi et offres progressives",
    body: [
      "Le restaurateur est responsable des stocks, quantites, prix barrés, remises, horaires, conditions, photos et limites associes a ses offres.",
      "Une offre doit correspondre a une disponibilite reelle. Les offres anti-gaspillage, ventes flash, offres progressives ou offres du jour ne doivent pas tromper le client sur la quantite, la fraicheur, la remise, la date limite ou les conditions de retrait.",
      "TOK peut retirer ou suspendre une offre en cas d'erreur, abus, rupture repetee, prix incoherent, reclamations nombreuses, risque legal ou non-respect des regles de publication.",
    ],
  },
  {
    title: "13. Actualites, avis, commentaires et signalements",
    body: [
      "Les actualites, avis, commentaires, videos, photos, reposts et reponses restaurateur doivent refleter des informations authentiques, licites et respectueuses.",
      "Les avis publies doivent correspondre a une experience reelle. TOK peut masquer, moderer ou supprimer tout contenu faux, trompeur, injurieux, diffamatoire, haineux, frauduleux, illicite, publicitaire abusif ou contraire aux regles de la plateforme.",
      "Les signalements doivent etre legitimes. Toute campagne de signalement abusif, harcelement d'un concurrent, manipulation de reputation, faux avis ou action coordonnee frauduleuse peut entrainer suspension ou suppression du compte.",
    ],
  },
  {
    title: "14. Campagnes sponsorisées et communications commerciales",
    body: [
      "Le restaurateur peut lancer ou demander des campagnes sponsorisées selon les fonctionnalites disponibles: objectif, budget, duree, zone, audience, format, support, texte, visuel, calendrier et indicateurs de performance.",
      "TOK ne garantit aucun volume de ventes, chiffre d'affaires, clics, impressions, reservations, commandes ou conversion. Les estimations de portee, CPC, vues et resultats sont indicatives.",
      "Le restaurateur garantit que ses publicites, promotions, prix, reductions, photos et claims commerciaux sont exacts, non trompeurs et conformes aux regles applicables a la publicite et a la concurrence loyale.",
      "TOK peut refuser, suspendre ou modifier la diffusion d'une campagne en cas de contenu illicite, trompeur, dangereux, discriminatoire, sensible, non paye, techniquement instable ou contraire aux interets des utilisateurs.",
    ],
  },
  {
    title: "15. Outils d'intelligence artificielle et ressources de marque",
    body: [
      "Les outils d'intelligence artificielle proposes par TOK sont fournis a titre d'assistance: amelioration de texte, visuels, retouche photo, analyse marketing, suggestions, CRM, templates, moderation ou recommandations operationnelles.",
      "Le restaurateur demeure seul responsable des contenus qu'il publie, valide ou reutilise, y compris lorsqu'ils sont generes, retouches, resumes ou proposes par IA.",
      "Le restaurateur garantit disposer de l'ensemble des droits necessaires sur les contenus transmis a TOK: photographies, videos, logos, marques, textes, cartes de visite, cartes de restaurant, menus, visuels existants et elements graphiques.",
      "TOK ne garantit ni l'exactitude absolue, ni l'absence d'erreur, ni les performances commerciales des contenus generes. Le restaurateur doit verifier prix, horaires, allergenes, ingredients, visuels, droits de tiers et mentions legales avant publication.",
      "Il est interdit d'utiliser les outils IA pour tenter d'obtenir des secrets, contourner les systemes, injecter des commandes, generer des contenus illicites, trompeurs, diffamatoires, discriminatoires, dangereux ou portant atteinte aux droits de tiers.",
    ],
  },
  {
    title: "16. Propriete intellectuelle et licence de contenus",
    body: [
      "Le restaurateur conserve la propriete des contenus qu'il transmet a TOK, sous reserve des droits de tiers et des licences applicables.",
      "Le restaurateur accorde a TOK une licence non exclusive, mondiale, gratuite, transferable aux prestataires techniques necessaires et valable pendant la duree du partenariat pour afficher, heberger, adapter techniquement, optimiser, promouvoir, analyser, moderer et diffuser les contenus dans le cadre des services TOK.",
      "Cette licence permet notamment l'affichage sur la plateforme, la promotion de l'etablissement, les campagnes de communication TOK, les demonstrations commerciales, les previews, les statistiques, les tests qualite et les formats adaptes aux appareils.",
      "Les logiciels, interfaces, modeles, prompts systeme, algorithmes, methodes, donnees agregees, designs TOK, tableaux de bord, templates et outils internes restent la propriete de TOK ou de ses partenaires.",
    ],
  },
  {
    title: "17. Donnees client, CRM, confidentialite et securite",
    body: [
      "Les donnees personnelles traitees via TOK doivent etre utilisees uniquement pour les finalites legitimes liees au service: gestion d'une reservation, commande, support, relation client, fidelite, obligations comptables, litige, campagne autorisee ou analyse interne conforme.",
      "Le restaurateur s'engage a respecter la Loi federale suisse sur la protection des donnees, le RGPD lorsqu'il est applicable, les preferences de notification, les oppositions et les principes de confidentialite.",
      "Les exports CRM, CSV, XLS, factures, listes de clients, historiques et profils de vente doivent etre conserves de maniere securisee, accessibles uniquement aux personnes autorisees et supprimes lorsqu'ils ne sont plus necessaires.",
      "Le restaurateur s'interdit de revendre, louer, partager, enrichir illicitement, aspirer, scraper, harceler ou contacter des clients hors cadre legitime a partir des donnees TOK.",
      "TOK peut imposer des mesures de securite complementaires, notamment authentification forte, limitation d'export, journalisation, quotas, verification d'identite ou blocage en cas de risque.",
    ],
  },
  {
    title: "18. Donnees et preuves numeriques",
    body: [
      "Les journaux informatiques, horodatages, validations electroniques, historiques de reservation, confirmations de paiement, traces de campagne, logs de notification, statuts et donnees techniques enregistres par TOK font foi jusqu'a preuve contraire.",
      "Cette presomption peut etre renversee par tout moyen de preuve admissible. Chaque partie doit conserver les elements utiles a ses reclamations, notamment tickets, justificatifs, photos, historiques internes et preuves de service.",
      "TOK peut suspendre temporairement un remboursement, un versement, une campagne, une publication ou une decision operationnelle durant l'instruction d'un dossier.",
    ],
  },
  {
    title: "19. Litiges, contestations, fraude et fausses declarations",
    body: [
      "TOK agit comme mediateur technique entre les parties. Aucune reclamation ne donne automatiquement raison au client ou au restaurateur. Chaque dossier est etudie individuellement selon les elements disponibles.",
      "Le restaurateur accepte de fournir tout element utile: tickets de caisse, justificatifs de preparation, preuves de service, photographies, historiques internes, temoignages et enregistrements de videosurveillance lorsque leur utilisation est legalement autorisee.",
      "Sont notamment frauduleux: fausses reservations, faux avis, demandes abusives de remboursement, fausses declarations, paiement frauduleux, manipulation Miamz, creation de comptes fictifs, auto-commandes artificielles, abus de campagnes ou tentative d'obtenir gratuitement un produit ou service consomme.",
      "TOK peut suspendre immediatement tout compte, campagne, paiement, avantage ou publication suspect pendant la duree de l'enquete.",
    ],
  },
  {
    title: "20. Disponibilite, maintenance et sous-traitants",
    body: [
      "TOK met en oeuvre des moyens raisonnables afin d'assurer la disponibilite et la securite de la plateforme, sans garantir l'absence totale d'interruption, d'erreur, de bug, de perte temporaire, de lenteur ou d'indisponibilite.",
      "La plateforme depend de prestataires tiers, notamment hebergement, base de donnees, paiement, email, SMS, push, IA, stockage, cartographie, analytics ou reseaux sociaux. Les incidents de ces prestataires peuvent affecter les services TOK.",
      "TOK peut realiser des maintenances, mises a jour, migrations, tests, corrections de securite ou modifications de service avec ou sans notification prealable selon l'urgence.",
    ],
  },
  {
    title: "21. Limitation de responsabilite",
    body: [
      "TOK agit comme plateforme technologique d'intermediation. TOK ne saurait etre tenu responsable des pertes d'exploitation, pertes de clientele, pertes de benefices, erreurs du restaurateur, informations publiees par le restaurateur, defaillances de prestataires tiers ou interruptions de reseaux externes.",
      "Sauf disposition legale imperative contraire, la responsabilite totale de TOK ne pourra exceder le montant total des commissions effectivement percues aupres du restaurateur au cours des six mois precedant l'evenement a l'origine du dommage.",
      "Cette limitation ne s'applique pas en cas de faute intentionnelle ou faute grave de TOK, ni lorsque le droit suisse imperatif l'interdit.",
    ],
  },
  {
    title: "22. Suspension et resiliation",
    body: [
      "Le restaurateur peut demander depuis Mon compte/Facturation ou au support la pause d'un module ou la resiliation de son abonnement. Toute date d'effet est confirmee par TOK. La pause arrete l'usage et les facturations futures du module selon cette confirmation, sans annuler les sommes deja dues.",
      "Une resiliation mensuelle prend effet a la fin de la periode en cours. Une periode annuelle est engagee jusqu'a son echeance et ne donne pas lieu a remboursement anticipe, sauf accord ecrit ou droit imperatif. Les modules optionnels peuvent etre resilies separement de l'abonnement principal.",
      "TOK peut suspendre ou resilier un compte en cas de fraude, non-paiement, violation des presentes conditions, utilisation abusive, atteinte a la securite, contournement de plateforme, non-cooperation, risque legal, reclamations graves ou atteinte a l'image de TOK.",
      "Sauf fraude manifeste, urgence, risque de securite, risque client ou obligation legale, TOK peut accorder un delai raisonnable permettant au restaurateur de regulariser sa situation.",
      "La resiliation n'efface pas les sommes dues, obligations de confidentialite, obligations de preuve, droits de recouvrement, obligations de conservation comptable ou responsabilites nees avant la fin du partenariat.",
    ],
  },
  {
    title: "23. Force majeure",
    body: [
      "Aucune partie ne pourra etre tenue responsable en cas de force majeure ou evenement echappant raisonnablement a son controle, notamment catastrophe naturelle, conflit arme, acte terroriste, pandemie, greve generale, decision administrative, panne majeure d'infrastructure, cyberattaque, interruption d'energie ou indisponibilite durable de services essentiels.",
    ],
  },
  {
    title: "24. Modifications des conditions",
    body: [
      "TOK peut modifier les presentes conditions afin de tenir compte des evolutions legales, techniques, commerciales, fiscales, securitaires ou des nouveaux services proposes.",
      "Les modifications substantielles seront notifiees aux restaurateurs avant leur entree en vigueur par email, notification, dashboard ou tout moyen approprie. La poursuite de l'utilisation de la plateforme apres entree en vigueur vaut acceptation des conditions modifiees.",
    ],
  },
  {
    title: "25. Droit applicable et juridiction",
    body: [
      "Les presentes conditions sont regies par le droit suisse.",
      "Tout litige relatif a leur interpretation ou a leur execution releve de la competence exclusive des tribunaux du Canton de Geneve, sous reserve des dispositions legales imperatives applicables.",
      "Les parties s'engagent, lorsque cela est raisonnable, a rechercher une solution amiable avant toute procedure judiciaire.",
    ],
  },
  {
    title: "26. TOK Connect, partenaires API et MCP",
    body: [
      "TOK Connect permet a des partenaires approuves d'interagir avec certains services TOK via API REST, OAuth, webhooks, portail developpeur, documentation OpenAPI, serveur MCP et clients sandbox ou production.",
      "Le restaurateur peut autoriser ou refuser un partenaire par restaurant lorsque la fonctionnalite est disponible. Cette autorisation peut etre limitee par scopes, quotas, periode, finalite, volume de reservations, taille de table, disponibilites, webhooks ou tout autre parametre affiche dans le dashboard.",
      "Les donnees accessibles via TOK Connect restent limitees au perimetre autorise: informations restaurant, menu, disponibilites, reservation, performance agregee, credits ou previews de campagne selon les scopes accordes. Les donnees de paiement sensibles, secrets serveur et informations non necessaires ne doivent pas etre transmis au partenaire.",
      "Les reservations creees par TOK Connect engagent le restaurant uniquement lorsqu'elles sont confirmees selon le parcours TOK, les disponibilites reelles, les regles de service et les limites accordees au partenaire. Le restaurateur doit maintenir ses horaires, tables, capacités et restrictions a jour afin d'eviter des confirmations incorrectes.",
      "Les campagnes, offres, credits, actions marketing autonomes et changements commerciaux sensibles generes via TOK Connect restent en preview, suggestion ou validation humaine tant que TOK n'a pas active explicitement un mode plus autonome. Le restaurateur demeure responsable de toute campagne ou offre qu'il valide.",
      "Les webhooks, logs API, traces MCP, request_id, cles d'idempotence, signatures, scopes et evenements d'audit peuvent etre conserves afin de diagnostiquer les incidents, verifier les quotas, prouver une action, securiser l'integration et traiter les litiges.",
      "Le restaurateur doit choisir des partenaires fiables, verifier la finalite de l'integration, informer TOK de tout usage suspect et retirer l'autorisation lorsqu'elle n'est plus necessaire. TOK peut suspendre ou revoquer un partenaire en cas de risque, abus, faille de securite, non-conformite ou demande legitime.",
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
                Cadre contractuel entre TOK et les etablissements partenaires utilisant les outils de reservation,
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
