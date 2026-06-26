import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";

export default function CGU() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 26 juin 2026</p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Objet</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les présentes Conditions Générales d'Utilisation (« CGU ») définissent les modalités d'accès et d'utilisation de la plateforme TOK, accessible depuis le site, l'application web et les applications mobiles associées.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK met en relation des clients, des restaurants partenaires, des coursiers et l'équipe d'administration de la plateforme pour faciliter la découverte de restaurants, les commandes, les réservations, les offres locales, la fidélité et les outils opérationnels proposés aux restaurateurs.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Acceptation des CGU</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'utilisation de TOK implique l'acceptation pleine et entière des présentes CGU. Si vous n'acceptez pas ces conditions, vous devez cesser d'utiliser la plateforme.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Des conditions complémentaires peuvent s'appliquer à certains services, notamment Tok One, les packs restaurateurs, les campagnes sponsorisées, les réservations Zéro Attente, La Table du Chef, les dons solidaires et les services de paiement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Une fenêtre de consentement peut être affichée à l'arrivée sur le site afin de rappeler les CGU, la politique de confidentialité et les règles cookies. Le refus n'autorise pas l'utilisation des services contractuels de TOK, notamment la création de compte, la commande, la réservation, les campagnes sponsorisées, les exports CRM et les fonctionnalités restaurateur qui supposent l'acceptation des présentes conditions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Services proposés</h2>
          <p className="text-foreground/80 leading-relaxed">TOK peut proposer, selon les fonctionnalités activées et la zone de disponibilité :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>La recherche de restaurants, la consultation de fiches, menus, médias, avis et offres.</li>
            <li>La commande en livraison, à emporter, multi-restaurant, groupée ou planifiée.</li>
            <li>La réservation classique, Zéro Attente et les expériences La Table du Chef, y compris des tables ou accès VIP liés à certains niveaux Miamz ou avantages Tok One.</li>
            <li>Les offres Anti-gaspi, ventes flash, promotions, codes d'offre et dons solidaires.</li>
            <li>Le programme Miamz, les cadeaux de points, les niveaux de fidélité et les avantages associés.</li>
            <li>Le fil Actualités avec posts, commentaires, likes, partages, sauvegardes, signalements, boutons « Plus comme ça » et « Moins comme ça ».</li>
            <li>Les contenus sponsorisés, campagnes publicitaires locales, rapports de performance et métriques marketing.</li>
            <li>Les outils CRM clients, segmentation, exports CSV/XLS, profils de vente, recommandations commerciales et historiques d'interactions issus des commandes ou réservations.</li>
            <li>Les outils d'aide à la rédaction, génération de variantes, compression média, publication vidéo, programmation de posts et préparation de contenus destinés aux réseaux sociaux.</li>
            <li>TOK Connect, comprenant API REST, OAuth, webhooks, portail développeur, serveur MCP, clients sandbox et intégrations partenaires approuvées.</li>
            <li>Les interfaces restaurateur, coursier et administrateur, incluant commandes, réservations, menus, campagnes, factures, support, notifications, sinistres et outils de pilotage.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            TOK agit principalement comme intermédiaire technique et commercial entre le client et le restaurant. Sauf mention contraire, la préparation, la qualité, la conformité, les allergènes, les ingrédients, les valeurs nutritionnelles, les contaminations croisées, les obligations sanitaires et la disponibilité des plats relèvent du restaurant concerné.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut activer, désactiver, modifier, suspendre ou supprimer tout ou partie des fonctionnalités, parcours, avantages, offres ou interfaces à tout moment, notamment pour des raisons de lancement progressif, sécurité, conformité, maintenance, disponibilité locale ou stratégie commerciale, sans garantie de maintien permanent d'une fonctionnalité.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Comptes, rôles et sécurité</h2>
          <p className="text-foreground/80 leading-relaxed">
            Certains services nécessitent un compte. Vous devez fournir des informations exactes, maintenir vos coordonnées à jour et protéger vos identifiants. Un même utilisateur peut disposer de plusieurs rôles uniquement lorsque TOK l'autorise explicitement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les accès restaurateur, coursier et administrateur sont réservés aux personnes autorisées. Toute tentative d'accès à des données, notifications, paniers, commandes, réservations ou conversations qui ne vous sont pas destinés est interdite.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            À la déconnexion, TOK peut effacer les données locales liées à la session, comme le panier, certains brouillons de checkout et les jetons de notification push, afin d'éviter qu'elles persistent pour un autre utilisateur du même appareil.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut suspendre, limiter ou supprimer un compte, une réservation, une commande, une campagne, un avantage, un code promotionnel ou un accès en cas de fraude, abus, tentative d'accès non autorisé, faux avis, réservation fictive, manipulation des campagnes, exploitation automatisée, usage de robots, contournement technique, impayé, comportement illicite ou atteinte à la sécurité de la plateforme.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Commandes, réservations et paiements</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les prix sont affichés en francs suisses (CHF), toutes taxes applicables comprises lorsque cela est indiqué. Les frais de livraison, de service, de garantie, de réservation ou de campagne sont présentés avant validation lorsque le service les prévoit.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Une commande, réservation payante, campagne ou souscription est validée lorsque le paiement est confirmé par le prestataire de paiement. Les moyens de paiement disponibles peuvent inclure carte, portefeuilles compatibles, TWINT, PostFinance ou tout moyen ajouté ultérieurement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'annulation d'une commande dépend de son état de préparation. Les réservations peuvent être soumises à des délais d'annulation et à des règles spécifiques, notamment pour Zéro Attente, La Table du Chef et les expériences limitées. Les remboursements acceptés sont effectués sur le moyen de paiement d'origine ou sous forme de crédit TOK lorsque cela est proposé.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En cas de client absent, de retard important, de réservation non honorée, d'annulation tardive, de restaurant fermé, de refus de service, d'erreur de prix manifeste, d'indisponibilité de stock ou de litige sur une prestation, TOK peut appliquer les règles affichées dans le parcours concerné, demander des justificatifs, arbitrer techniquement le dossier et décider d'un remboursement total, partiel, d'un crédit TOK ou d'un refus de remboursement lorsque les circonstances le justifient.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Lorsqu'un paiement est traité par un prestataire tiers comme Stripe, les délais de capture, remboursement, annulation, contestation ou reversement dépendent également des règles et délais de ce prestataire. TOK ne garantit pas l'absence d'incident bancaire, de double autorisation temporaire, de retard de traitement ou de blocage lié au moyen de paiement utilisé.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Miamz, Tok One et avantages VIP</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les Miamz ne constituent pas une monnaie, un instrument de paiement, un dépôt bancaire ou un actif financier. Ils sont sans valeur en espèces, non convertibles en espèces et utilisables uniquement dans les parcours TOK éligibles, selon les conditions affichées dans l'application.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les niveaux Bronze, Silver, Gold, Platinum ou tout autre niveau futur peuvent donner accès à des bonus, priorités de réservation, offres partenaires, avantages de livraison, support prioritaire, tables VIP ou expériences premium. Ces avantages peuvent dépendre du restaurant, de la disponibilité, du stock, de la zone, du niveau Miamz ou de l'abonnement Tok One.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Chaque avantage, cadeau ou contribution peut être soumis à une durée de validité, à des plafonds, à des conditions d'éligibilité ou à des restrictions communiquées avant utilisation. Les dons solidaires sont traités comme des contributions d'impact local, suivies séparément des paiements dus aux restaurants.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En cas d'annulation, remboursement, fraude, abus ou erreur technique, TOK peut reprendre, ajuster ou neutraliser les Miamz associés afin de préserver la cohérence comptable et d'éviter tout avantage indu.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Actualités, recommandations et contenus utilisateurs</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les utilisateurs peuvent interagir avec le fil Actualités par des vues, clics, likes, commentaires, partages, sauvegardes, reposts, signalements et préférences de type « Plus comme ça » ou « Moins comme ça ». Ces signaux peuvent améliorer ou réduire la visibilité de contenus similaires dans l'expérience utilisateur.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut classer les contenus selon des critères comme vos interactions, les tags du post, la proximité géographique, la popularité, l'engagement global, le statut sponsorisé et les réglages de modération. Ces recommandations visent à personnaliser le fil, sans garantir qu'un contenu soit exhaustif, neutre ou affiché dans un ordre chronologique strict.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les avis, commentaires, publications, photos, vidéos et signalements doivent être authentiques, respectueux, licites et ne pas porter atteinte aux droits de tiers. TOK peut masquer, déclasser, modérer, supprimer ou restaurer un contenu lorsque cela est nécessaire pour protéger la plateforme, les utilisateurs ou les restaurants.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Restaurants, réseaux sociaux et campagnes</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les restaurants sont responsables des informations, prix, disponibilités, allergènes, horaires, images, vidéos, offres, campagnes et publications qu'ils fournissent ou valident. Ils doivent disposer des droits nécessaires sur les contenus et respecter les règles applicables aux communications commerciales.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Lorsqu'un restaurateur connecte ou renseigne ses réseaux sociaux, il autorise TOK à préparer ou publier les contenus demandés vers les canaux sélectionnés, dans la limite des permissions accordées et des règles des plateformes tierces concernées. Le restaurateur reste responsable du message publié et des réponses reçues sur ces réseaux.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les campagnes sponsorisées sont diffusées selon un budget total, une durée, une zone ou audience cible et un rythme indicatif de dépense. À titre de logique produit, le budget quotidien correspond au budget total divisé par la durée, puis la diffusion peut être modulée par la pertinence, la distance et l'engagement. Les métriques comme impressions, clics, CPC, conversions et coût global sont indicatives et ne garantissent aucun chiffre d'affaires.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Un post ne doit être présenté comme sponsorisé qu'après validation du parcours prévu, notamment le paiement ou l'autorisation de mise en avant lorsque celle-ci est payante. TOK peut suspendre une campagne en cas d'erreur, litige, contenu trompeur, défaut de paiement ou risque pour les utilisateurs.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les outils CRM restaurateur et administrateur sont réservés à la relation commerciale légitime liée à TOK. Les restaurants peuvent consulter ou exporter les données client strictement nécessaires provenant de leurs commandes, réservations ou interactions autorisées. Toute utilisation pour harceler, revendre des fichiers, contourner les préférences de notification, contacter un client sans base valable ou mener une campagne externe non conforme est interdite.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les exports CSV/XLS et tableaux CRM doivent être conservés de manière sécurisée par le restaurateur ou l'administrateur qui les télécharge. L'utilisateur exportateur devient responsable de l'usage, du stockage, de la suppression et de la confidentialité du fichier en dehors de l'environnement TOK.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Support, sinistres et notifications</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut proposer un support par chat, email, centre d'aide ou interface de suivi des sinistres. Un sinistre ou une conversation peut recevoir un statut comme « en attente », « en cours », « résolu » ou « clôturé » afin de suivre son traitement sans le classer automatiquement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les notifications sont destinées au compte, rôle ou restaurant concerné. Vous ne devez pas transférer, exploiter ou conserver une notification qui ne vous est pas destinée.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Propriété intellectuelle</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les éléments de la plateforme, notamment marques, logos, textes, interfaces, bases de données, logiciels, visuels, modèles et documents, appartiennent à TOK ou à ses partenaires. Toute reproduction, extraction, modification ou exploitation non autorisée est interdite.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En publiant un contenu sur TOK, vous accordez à TOK une licence non exclusive, mondiale, gratuite et limitée au fonctionnement, à la promotion, à la modération, à l'hébergement et à l'affichage du service. Vous garantissez disposer des droits nécessaires, y compris pour les photos générées ou retouchées par IA, qui ne doivent pas induire les utilisateurs en erreur.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les contenus, photos, vidéos, menus, textes et campagnes fournis par un restaurant restent, sauf accord contraire, la propriété du restaurant ou de ses ayants droit. Les outils, interfaces, modèles, algorithmes, prompts, systèmes de recommandation, métriques internes, rapports agrégés, bases de données et méthodes de traitement développés par TOK restent la propriété de TOK ou de ses partenaires.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les fonctionnalités d'intelligence artificielle peuvent produire des résultats inexacts, incomplets, approximatifs, non conformes à l'identité du restaurant ou juridiquement inadaptés. Le restaurateur ou l'utilisateur qui valide un contenu généré ou retouché par IA reste responsable de sa vérification avant publication, notamment pour les prix, ingrédients, allergènes, visuels de plats, promotions et messages publicitaires.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">11. Données personnelles et cookies</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK traite les données personnelles conformément à la Loi fédérale suisse sur la protection des données (LPD) et, lorsque applicable, au RGPD. Les données nécessaires aux commandes, réservations, paiements, notifications, campagnes, recommandations et services de support sont décrites dans notre Politique de confidentialité.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les cookies et technologies similaires peuvent être utilisés pour l'authentification, le panier, les préférences, la sécurité, la mesure d'audience et, avec consentement lorsque requis, la personnalisation ou le marketing.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les outils Actualités, CRM, campagnes sponsorisées, vidéo, IA, notifications, exports et réseaux sociaux peuvent impliquer des traitements supplémentaires décrits dans la politique de confidentialité et la politique cookies.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Pour plus d'informations, consultez notre <Link to="/politique-confidentialite" className="text-primary hover:underline font-medium">Politique de confidentialité</Link> et notre <Link to="/cookies" className="text-primary hover:underline font-medium">Politique cookies</Link>.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">12. Responsabilité</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK met en œuvre des moyens raisonnables pour assurer la disponibilité, la sécurité et la qualité de la plateforme, mais ne garantit pas un service ininterrompu, exempt d'erreurs ou compatible avec tous les appareils, navigateurs et réseaux.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK ne peut être tenu responsable des informations inexactes fournies par un restaurant, d'une indisponibilité de stock, d'un retard lié à la préparation ou à la livraison, d'une panne d'un prestataire tiers ou d'un usage non conforme de votre compte.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Dans les limites autorisées par le droit applicable, TOK exclut toute responsabilité pour les dommages indirects, pertes de bénéfice, pertes de chiffre d'affaires, pertes d'exploitation, pertes d'opportunité commerciale, pertes de clientèle, atteintes à l'image, pertes de données, interruptions d'activité ou conséquences économiques liées à l'utilisation ou à l'impossibilité d'utiliser la plateforme.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Lorsque la responsabilité de TOK devait malgré tout être retenue, elle est limitée, dans la mesure permise par le droit impératif, au montant effectivement payé par l'utilisateur à TOK pour le service directement concerné au cours des trois mois précédant l'événement dommageable. Cette limitation ne s'applique pas en cas de faute intentionnelle ou lorsque le droit impératif suisse l'interdit.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK ne répond pas des événements échappant raisonnablement à son contrôle, notamment panne d'internet, panne de réseau mobile, incident Stripe, indisponibilité Supabase, Vercel, OpenAI ou autre prestataire, cyberattaque majeure, grève, décision administrative, catastrophe naturelle, interruption d'énergie ou événement de force majeure affectant la plateforme, un restaurant, un coursier ou un prestataire tiers.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">13. Modification des CGU</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut modifier les présentes CGU pour tenir compte de l'évolution du service, de la réglementation, de la sécurité ou de nouvelles fonctionnalités. En cas de modification substantielle, les utilisateurs peuvent être informés par email, notification ou affichage dans l'application.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">14. Droit applicable et juridiction</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les présentes CGU sont régies par le droit suisse. En cas de litige, les parties rechercheront d'abord une solution amiable. À défaut, et sous réserve des dispositions impératives applicables aux consommateurs, le for exclusif est Genève, Suisse.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">15. TOK Connect, API partenaires, MCP et webhooks</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK Connect désigne les interfaces techniques permettant à des partenaires approuvés d'interagir avec certains services TOK, notamment via API REST, OAuth client-credentials, webhooks signés, portail développeur, documentation OpenAPI et serveur MCP.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>L'accès production à TOK Connect est réservé aux partenaires validés par TOK, aux restaurants ayant accordé les autorisations nécessaires et aux clients OAuth disposant de scopes, quotas et limites définis.</li>
            <li>Les identifiants, secrets, tokens, signatures webhook, journaux d'appel et clés d'idempotence doivent être protégés par le partenaire. Toute fuite, rotation nécessaire ou usage suspect doit être signalé sans délai à TOK.</li>
            <li>Les réponses API, ressources MCP et webhooks ne peuvent être utilisés que pour les finalités autorisées : découverte, disponibilité, réservation, support, statistiques autorisées, preview de campagne ou intégration explicitement approuvée.</li>
            <li>Les réservations créées via TOK Connect ne sont réelles qu'après validation du parcours prévu, disponibilité confirmée, scope adéquat et, lorsque requis, confirmation explicite de l'utilisateur final ou du partenaire autorisé.</li>
            <li>Les endpoints de mutation peuvent imposer une clé <span className="font-mono text-sm">Idempotency-Key</span> afin d'éviter les doublons et de conserver une trace exploitable en cas de rejouement de requête.</li>
            <li>Les campagnes, offres, crédits, actions marketing autonomes ou décisions commerciales sensibles restent en preview, suggestion ou validation humaine tant que TOK n'a pas activé un mode explicitement plus autonome.</li>
            <li>Le mode sandbox utilise des données de test ou des fixtures isolées et ne doit pas être présenté comme une confirmation production.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut refuser, limiter, suspendre, révoquer ou auditer tout accès TOK Connect en cas de non-respect des présentes CGU, de dépassement de quota, d'usage non conforme, de risque de sécurité, de demande du restaurant concerné, de soupçon de fraude ou de nécessité opérationnelle.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">16. Contact</h2>
          <p className="text-foreground/80 leading-relaxed">
            Pour toute question relative aux présentes CGU :
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email :</span> {SUPPORT_EMAIL}</li>
            <li><span className="font-medium text-foreground">Formulaire :</span> via notre <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
            <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide TOK</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
