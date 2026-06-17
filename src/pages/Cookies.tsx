import { Link } from "react-router-dom";

export default function Cookies() {
  return (
    <div className="container max-w-4xl space-y-12 py-12 md:py-20">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique cookies</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 17 juin 2026</p>
        <p className="max-w-3xl text-foreground/80 leading-relaxed">
          Cette page explique comment TOK utilise les cookies, stockages locaux, pixels, identifiants techniques et technologies similaires sur le site, l'application web et les applications mobiles associées.
        </p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Technologies concernées</h2>
          <p className="text-foreground/80 leading-relaxed">
            Le terme « cookies » désigne ici les cookies HTTP, le stockage local du navigateur, le stockage de session, les identifiants de panier, les jetons de notification, les identifiants de mesure, les pixels et les événements techniques envoyés par l'application.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Certaines technologies sont indispensables au fonctionnement de TOK. D'autres servent à mesurer l'audience, sécuriser la plateforme, personnaliser l'expérience, attribuer les campagnes sponsorisées ou améliorer les recommandations.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Technologies strictement nécessaires</h2>
          <p className="text-foreground/80 leading-relaxed">
            Ces éléments permettent au service de fonctionner correctement. Ils peuvent être utilisés pour :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>maintenir votre session, votre rôle actif et l'accès sécurisé à votre compte ;</li>
            <li>conserver le panier, le mode de commande, les brouillons nécessaires au checkout et les conflits de panier ;</li>
            <li>mémoriser votre choix relatif aux conditions générales, aux cookies ou au thème d'affichage ;</li>
            <li>prévenir la fraude, les abus, les accès non autorisés et les incidents de sécurité ;</li>
            <li>faire fonctionner les notifications web ou mobiles lorsque vous les activez.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Mesure d'audience, performance et sécurité</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut mesurer les pages vues, clics, erreurs, temps de chargement, performances frontend, réponses d'API et incidents afin d'améliorer la stabilité de la plateforme. Ces données nous aident à détecter les régressions, ralentissements, erreurs de paiement, problèmes de commande ou anomalies de sécurité.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les métriques sont utilisées prioritairement sous forme agrégée ou pseudonymisée lorsque cela est possible. Elles peuvent toutefois rester associées à un compte lorsque l'information est nécessaire au support, à la sécurité, à l'audit ou au traitement d'une commande, réservation, campagne ou réclamation.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Actualités, recommandations et contenus sponsorisés</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les interactions avec le fil Actualités peuvent générer des signaux comme vues, likes, commentaires, partages, sauvegardes, signalements, reposts, clics sur CTA, lecture vidéo, masquages, « Plus comme ça » ou « Moins comme ça ».
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Ces signaux servent à personnaliser l'ordre des contenus, améliorer les recommandations, limiter les contenus non pertinents, mesurer la performance des posts restaurateurs et attribuer les campagnes sponsorisées. Ils peuvent aussi aider TOK à modérer les contenus abusifs, frauduleux ou harcelants.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Publicité locale et attribution</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les campagnes sponsorisées peuvent utiliser des événements de visibilité, clics, impressions, conversions, réservations, commandes ou interactions afin d'estimer la diffusion et les performances. Les restaurateurs reçoivent des statistiques comme impressions, vues, clics, CPC, budget consommé, conversions ou coût global.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            TOK peut utiliser des critères de diffusion comme la ville, la distance, la cuisine préférée, les habitudes de commande ou réservation, la livraison, les horaires et l'engagement avec des contenus similaires. Les critères sont utilisés pour améliorer la pertinence locale, sans garantir une conversion ou un chiffre d'affaires.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Réseaux sociaux et services tiers</h2>
          <p className="text-foreground/80 leading-relaxed">
            Lorsque vous partagez un contenu vers un réseau social ou lorsqu'un restaurateur connecte un compte externe, le service tiers peut appliquer ses propres cookies, traceurs, règles de confidentialité et conditions d'utilisation. TOK ne contrôle pas les traitements réalisés directement par ces plateformes.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les fournisseurs techniques comme Supabase, Stripe, Vercel, Firebase, services email, analytics, support ou IA peuvent aussi traiter des événements techniques nécessaires à leurs prestations, dans les limites décrites par notre politique de confidentialité.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Gérer vos choix</h2>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez accepter ou refuser les conditions et règles cookies depuis la fenêtre affichée à votre arrivée sur le site. Votre choix est mémorisé localement pour éviter de vous redemander la même décision à chaque page.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez également supprimer les cookies et stockages locaux depuis les paramètres de votre navigateur. Certaines fonctionnalités, notamment la connexion, le panier, le thème, les notifications, la réservation ou la commande, peuvent alors ne plus fonctionner correctement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Pour les notifications, la géolocalisation ou certains accès appareil, vous pouvez retirer l'autorisation depuis les paramètres du navigateur, du système mobile ou de l'application.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Durées de conservation</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les cookies de session disparaissent généralement à la fermeture du navigateur. Les préférences locales, paniers, choix légaux, paramètres d'affichage et identifiants de mesure peuvent être conservés plus longtemps afin de maintenir une expérience stable, puis supprimés, remplacés ou anonymisés lorsqu'ils ne sont plus nécessaires.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les événements liés aux commandes, réservations, paiements, campagnes, support, sécurité ou obligations comptables peuvent être conservés dans les systèmes serveur pendant les durées nécessaires à la preuve, à l'audit, à la facturation, à la prévention de la fraude et au respect des obligations légales.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">9. Documents liés</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>
              <Link to="/cgu" className="font-medium text-primary hover:underline">
                Conditions générales d'utilisation
              </Link>
            </li>
            <li>
              <Link to="/politique-confidentialite" className="font-medium text-primary hover:underline">
                Politique de confidentialité
              </Link>
            </li>
            <li>
              <Link to="/contact" className="font-medium text-primary hover:underline">
                Contact
              </Link>
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
