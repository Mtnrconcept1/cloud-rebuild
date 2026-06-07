import { Link } from "react-router-dom";

export default function PolitiqueConfidentialite() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique de confidentialité</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 7 juin 2026</p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Responsable du traitement</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK traite les données personnelles nécessaires à l'exploitation de la plateforme. Pour toute demande relative à vos données, vous pouvez nous contacter à <span className="font-medium text-foreground">privacy@thetok.ch</span>.
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Responsable :</span> TOK, Suisse</li>
            <li><span className="font-medium text-foreground">Site public :</span> www.thetok.ch</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Données collectées</h2>
          <p className="text-foreground/80 leading-relaxed">Selon votre usage de TOK, nous pouvons traiter les catégories suivantes :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Compte et identité :</span> nom, prénom, email, téléphone, photo, préférences, rôles et informations de connexion.</li>
            <li><span className="font-medium text-foreground">Commandes et réservations :</span> paniers, articles, restaurants, horaires, adresses, instructions, statuts, remboursements, sinistres et historique.</li>
            <li><span className="font-medium text-foreground">Paiement :</span> montants, devise, statut, identifiants de transaction et informations nécessaires au traitement par Stripe. Les données bancaires complètes ne sont pas stockées par TOK.</li>
            <li><span className="font-medium text-foreground">Localisation :</span> adresse, zone de livraison, distance, coordonnées approximatives ou GPS lorsque vous l'autorisez.</li>
            <li><span className="font-medium text-foreground">Actualités et interactions :</span> vues, clics, likes, commentaires, reposts, partages, sauvegardes, signalements, posts masqués, « Plus comme ça », « Moins comme ça » et préférences déduites.</li>
            <li><span className="font-medium text-foreground">Recommandations :</span> scores d'intérêt, tags de cuisine, restaurants favoris, types de contenus, zones fréquentes, engagement historique et signaux utilisés pour ordonner le fil.</li>
            <li><span className="font-medium text-foreground">Campagnes restaurateur :</span> budgets, durées, zones de diffusion, contenus, audiences, impressions, clics, CPC, conversions, dépenses, statuts et historiques.</li>
            <li><span className="font-medium text-foreground">Réseaux sociaux restaurateur :</span> profils renseignés, canaux sélectionnés, autorisations de publication, identifiants techniques et jetons strictement nécessaires lorsque le restaurateur connecte un compte externe.</li>
            <li><span className="font-medium text-foreground">Support et administration :</span> conversations, numéros de sinistre, pièces jointes, statuts de traitement, notes d'audit, décisions de modération et notifications.</li>
            <li><span className="font-medium text-foreground">Données techniques :</span> adresse IP, appareil, navigateur, logs de sécurité, jetons de notification push, erreurs, performances et événements d'audit.</li>
            <li><span className="font-medium text-foreground">Données d'usage IA :</span> demandes, résultats, coûts estimés, modèles utilisés, qualité de sortie et métadonnées nécessaires aux fonctionnalités d'assistance, de génération ou de retouche, y compris lorsque le traitement implique OpenAI.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Finalités du traitement</h2>
          <p className="text-foreground/80 leading-relaxed">Nous utilisons ces données pour :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Créer et sécuriser votre compte, gérer les rôles client, restaurateur, coursier ou administrateur.</li>
            <li>Traiter les commandes, réservations, paiements, remboursements, livraisons, factures et demandes de support.</li>
            <li>Afficher des restaurants, offres, actualités, posts sauvegardés et recommandations adaptées à vos interactions.</li>
            <li>Gérer les boutons « Plus comme ça » et « Moins comme ça » pour ajuster les contenus similaires qui vous sont proposés.</li>
            <li>Mesurer les campagnes sponsorisées, répartir leur diffusion selon le budget quotidien et fournir des métriques agrégées aux restaurants.</li>
            <li>Permettre aux restaurateurs de gérer menus, photos, campagnes, actualités, réseaux sociaux, factures, réservations et commandes.</li>
            <li>Envoyer des notifications strictement destinées au compte, rôle ou restaurant concerné.</li>
            <li>Prévenir la fraude, sécuriser la plateforme, auditer les actions sensibles et respecter nos obligations légales.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Bases légales</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les traitements reposent notamment sur l'exécution du contrat, votre consentement lorsque requis, notre intérêt légitime à sécuriser et améliorer le service, ainsi que nos obligations légales comptables, fiscales ou de sécurité.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les recommandations du fil Actualités personnalisent l'ordre et la sélection des contenus. Elles ne constituent pas une décision individuelle automatisée produisant à elles seules un effet juridique significatif.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Partage avec des tiers</h2>
          <p className="text-foreground/80 leading-relaxed">Nous partageons des données uniquement lorsque cela est nécessaire au service :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Restaurants partenaires :</span> informations nécessaires à la préparation, réservation, service, facturation et support.</li>
            <li><span className="font-medium text-foreground">Coursiers :</span> informations nécessaires à la livraison et au suivi de mission.</li>
            <li><span className="font-medium text-foreground">Stripe :</span> traitement des paiements, abonnements, remboursements, Connect et facturation.</li>
            <li><span className="font-medium text-foreground">Supabase :</span> authentification, base de données, stockage, fonctions serveur, temps réel et sécurité.</li>
            <li><span className="font-medium text-foreground">Vercel :</span> hébergement, déploiement et logs techniques du frontend.</li>
            <li><span className="font-medium text-foreground">Firebase ou services push :</span> notifications mobiles et web lorsque vous les activez.</li>
            <li><span className="font-medium text-foreground">Réseaux sociaux tiers :</span> publication ou préparation de posts lorsque le restaurateur connecte un compte externe et déclenche cette action.</li>
            <li><span className="font-medium text-foreground">OpenAI ou prestataires IA :</span> traitement technique de certaines fonctionnalités d'assistance ou de génération lorsque ces services sont activés.</li>
            <li><span className="font-medium text-foreground">Prestataires email, analytics, sécurité et support :</span> uniquement dans les limites nécessaires à l'exploitation de TOK.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Nous ne vendons pas vos données personnelles nominatives. Les restaurants peuvent recevoir des statistiques agrégées sur leurs contenus et campagnes, comme impressions, clics, sauvegardes, partages, conversions et coût global.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Sécurité, notifications et session</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Les communications sont chiffrées en transit par HTTPS/TLS.</li>
            <li>Les accès aux données sont restreints par des contrôles de rôle, des politiques RLS et des vérifications serveur.</li>
            <li>Les notifications sont limitées au destinataire, rôle ou restaurant concerné.</li>
            <li>À la déconnexion, TOK peut nettoyer le panier local, les brouillons de checkout et les jetons push de la session courante.</li>
            <li>Les mots de passe sont gérés par le système d'authentification et ne sont pas stockés en clair.</li>
            <li>Les clés serveur et secrets de paiement ne sont jamais exposés dans le navigateur.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Durées de conservation</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Compte :</span> pendant la vie du compte, puis suppression ou anonymisation selon les délais techniques et légaux applicables.</li>
            <li><span className="font-medium text-foreground">Commandes, paiements et factures :</span> pendant les durées nécessaires aux obligations comptables, fiscales, anti-fraude et de preuve.</li>
            <li><span className="font-medium text-foreground">Actualités, interactions et recommandations :</span> pendant la durée utile à l'expérience utilisateur, à la modération et à la mesure des performances.</li>
            <li><span className="font-medium text-foreground">Support, sinistres et audit :</span> pendant la durée nécessaire au traitement, à la sécurité et à la défense des droits de TOK ou des utilisateurs.</li>
            <li><span className="font-medium text-foreground">Jetons push et données locales :</span> supprimés, désactivés ou remplacés lors de la déconnexion, du changement de compte ou du retrait de consentement lorsque cela est possible.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Vos droits</h2>
          <p className="text-foreground/80 leading-relaxed">
            Conformément à la LPD et, lorsque applicable, au RGPD, vous pouvez demander l'accès, la rectification, l'effacement, la limitation, la portabilité ou l'opposition au traitement de vos données. Vous pouvez aussi retirer un consentement donné, par exemple pour la géolocalisation, les notifications ou certains cookies.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Pour exercer vos droits, contactez <span className="font-medium text-foreground">privacy@thetok.ch</span>. Nous pouvons vous demander une vérification d'identité avant de répondre, afin de protéger votre compte.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Cookies et technologies similaires</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK utilise des cookies et stockages locaux nécessaires à l'authentification, au panier, à la sécurité, aux préférences et au fonctionnement de l'application. Les cookies ou technologies non essentiels, notamment analytiques ou marketing, sont soumis au consentement lorsque la loi l'exige.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Suppression du compte</h2>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez demander la suppression de votre compte depuis l'application ou en nous contactant. Certaines données peuvent être conservées lorsqu'une obligation légale, une transaction en cours, un litige, une facture, un remboursement ou une mesure anti-fraude l'exige.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">11. Mineurs</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK ne s'adresse pas aux personnes de moins de 16 ans. Si vous pensez qu'un mineur nous a transmis des données sans autorisation, contactez-nous afin que nous puissions prendre les mesures appropriées.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">12. Modifications</h2>
          <p className="text-foreground/80 leading-relaxed">
            Cette politique peut être mise à jour lorsque la plateforme, nos prestataires, nos traitements ou la réglementation évoluent. La date de dernière mise à jour figure en haut de cette page.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">13. Contact</h2>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email confidentialité :</span> privacy@thetok.ch</li>
            <li><span className="font-medium text-foreground">Formulaire :</span> via notre <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
            <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide TOK</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
