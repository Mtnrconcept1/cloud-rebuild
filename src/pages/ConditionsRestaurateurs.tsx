import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useSeoMeta } from "@/hooks/useSeoMeta";

const updatedAt = "26 juin 2026";

const quickPoints = [
  "Commission reservation: CHF 5.00 par table honoree via TOK, sauf accord ecrit different.",
  "Le restaurant reste responsable des prix, menus, allergenes, horaires, disponibilites, contenus et obligations sanitaires.",
  "Les donnees client issues de TOK ne peuvent etre utilisees que pour une relation commerciale legitime et conforme.",
  "TOK Connect donne acces a des partenaires uniquement avec autorisation, scopes, quotas et revocation possible par restaurant.",
  "Les outils IA, CRM, campagnes et exports sont des aides: le restaurateur valide et assume les contenus publies.",
  "Le contournement de la plateforme, la fraude, les faux avis et les fausses declarations peuvent entrainer suspension, resiliation et facturation retroactive.",
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
      "TOK designe la plateforme technologique, commerciale et operationnelle permettant notamment la decouverte de restaurants, la reservation, la commande, les offres locales, les actualites, les campagnes, les outils restaurateurs et les programmes de fidelite.",
      "Restaurateur designe l'etablissement partenaire, son exploitant, son representant legal, ses employes autorises et toute personne utilisant l'espace restaurateur sous son controle.",
      "Client acquis via TOK designe tout client ayant decouvert, reserve, commande, interagi, suivi, contacte ou beneficie d'une offre du restaurant par l'intermediaire de TOK.",
      "Services TOK designe les services existants ou futurs, notamment reservation en ligne, Zero Attente, Tables du Chef, ventes flash, offres anti-gaspillage, Miamz, Actualites, CRM, campagnes sponsorisées, statistiques, outils IA, facturation, support et integrations tierces.",
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
    title: "7. Commissions et tarification",
    body: [
      "Pour chaque reservation honoree via TOK, le restaurateur accepte le paiement d'une commission forfaitaire de cinq francs suisses (CHF 5.00) par table reservee, sauf accord ecrit different ou offre commerciale specifique.",
      "Cette commission est due independamment du nombre de personnes presentes, du montant de l'addition, des remises accordees, des promotions appliquees, de l'utilisation d'un code promotionnel ou du niveau Miamz du client.",
      "La commission devient exigible des lors que le client s'est presente conformement a sa reservation ou que la reservation doit etre consideree comme honoree selon les informations disponibles.",
      "D'autres services peuvent etre factures separement: packs, abonnements, campagnes sponsorisées, credits IA, options CRM, outils marketing, frais de paiement, services de support premium, onboarding ou prestations specifiques.",
      "Les montants sont exprimes en CHF. La TVA, les taxes applicables, frais de paiement ou retenues eventuelles sont traites selon les indications contractuelles, les factures et le droit fiscal applicable.",
    ],
  },
  {
    title: "8. Facturation, reversements, taxes et impayes",
    body: [
      "TOK peut emettre des factures, notes, releves de commissions, exports comptables ou justificatifs de transaction via le dashboard ou par email. Le restaurateur doit verifier ses informations de facturation et signaler rapidement toute erreur manifeste.",
      "Les reversements dus au restaurateur peuvent etre effectues par un prestataire de paiement tiers. Les delais de versement, retenues, controles KYC, remboursements, litiges bancaires, chargebacks et blocages peuvent dependre de ce prestataire.",
      "TOK peut compenser les sommes dues entre les parties, notamment commissions, remboursements, avoirs, frais, campagnes, penalites contractuelles, factures impayees ou montants contestes.",
      "Le restaurateur reste responsable de ses obligations fiscales, comptables, TVA, declaratives et sociales. Les informations fournies par TOK sont des aides comptables et ne remplacent pas le conseil d'un fiduciaire ou d'un fiscaliste.",
      "En cas d'impaye, de moyen de paiement refuse, de facture echue ou de chargeback, TOK peut limiter certains services, suspendre les campagnes, bloquer les reversements non definitifs ou engager des mesures de recouvrement.",
    ],
  },
  {
    title: "9. Interdiction de contournement",
    body: [
      "Le restaurateur s'interdit tout contournement de la plateforme, notamment l'incitation a reserver directement hors TOK, la recuperation de clients acquis via TOK afin d'eviter les commissions, la communication de coordonnees dans un but de contournement ou la creation de systemes paralleles destines a eluder la facturation.",
      "Toute reservation, commande, vente ou relation commerciale effectuee avec un client initialement acquis via TOK durant les vingt-quatre (24) mois suivant son acquisition est presumee provenir de TOK, sauf preuve contraire credible ou accord ecrit different.",
      "Toute violation peut entrainer suspension immediate, resiliation, facturation retroactive des commissions eludees, perte d'avantages, retrait de campagnes et toute action judiciaire appropriee, sous reserve des dispositions legales imperatives applicables.",
    ],
  },
  {
    title: "10. Reservations, no-shows et annulations",
    body: [
      "Le restaurateur s'engage a honorer toute reservation confirmee et a maintenir a jour ses capacités, horaires, tables, restrictions, services midi/soir et conditions d'annulation.",
      "Une reservation confirmee ne peut etre refusee qu'en cas de force majeure, fermeture exceptionnelle, risque de securite, impossibilite objective independante de la volonte du restaurateur ou information manifestement erronee devant etre corrigee rapidement.",
      "Le restaurateur doit informer TOK dans les meilleurs delais de toute impossibilite d'executer une reservation, proposer une solution raisonnable lorsque possible et documenter les motifs invoques.",
      "TOK peut enregistrer les absences, annulations tardives et comportements abusifs des clients. Le restaurateur peut signaler un no-show via la plateforme et fournir les elements utiles.",
      "TOK peut suspendre temporairement un compte client, exiger un depot de garantie, exiger un prepaiement, limiter certaines fonctionnalites ou ajuster les avantages lorsqu'un comportement abusif est constate.",
    ],
  },
  {
    title: "11. Commandes, Zero Attente, retrait et livraison",
    body: [
      "Pour Zero Attente, commande, retrait, livraison ou precommande, le restaurateur s'engage a preparer les produits conformement aux informations validees par le client et aux delais annonces.",
      "Le restaurateur demeure responsable de la disponibilite des produits, du respect des delais, de la conformite de la commande, de l'emballage, des substitutions autorisees et des informations transmises au client.",
      "Le client demeure responsable de son arrivee dans les delais prevus et du respect des consignes affichees. Lorsque la livraison ou le dispatch implique un tiers, chaque partie reste responsable de son perimetre operationnel.",
      "TOK peut retenir, annuler, rembourser, crediter ou examiner une commande en cas de litige, paiement non confirme, indisponibilite, fraude, erreur technique, retard important ou contestation credible.",
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
              <span className="rounded-full border bg-white px-3 py-1">Version 1.0</span>
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
