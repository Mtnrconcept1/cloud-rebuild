import { Link } from "react-router-dom";

export default function PolitiqueConfidentialite() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique de confidentialité</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 24 juillet 2026</p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Responsable du traitement</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK traite les données personnelles nécessaires à l'exploitation de la plateforme. Pour toute demande relative à vos données, vous pouvez nous contacter à <span className="font-medium text-foreground">privacy@thetok.ch</span>.
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Responsable :</span> l'entité exploitante TOK identifiée dans les mentions légales et le contrat ou récapitulatif applicable</li>
            <li><span className="font-medium text-foreground">Site public :</span> www.thetok.ch</li>
            <li><span className="font-medium text-foreground">Information de lancement :</span> la raison sociale, l'adresse et l'IDE/UID doivent être complétés avant l'ouverture commerciale publique</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Données collectées</h2>
          <p className="text-foreground/80 leading-relaxed">Selon votre usage de TOK, nous pouvons traiter les catégories suivantes :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Compte et identité :</span> nom, prénom, email, téléphone, photo, préférences, rôles et informations de connexion.</li>
            <li><span className="font-medium text-foreground">Commandes et réservations :</span> paniers, articles, restaurants, horaires, adresses, instructions, statuts, remboursements, sinistres et historique.</li>
            <li><span className="font-medium text-foreground">Paiement :</span> montants, devise, statut, identifiants de transaction et informations nécessaires au traitement par Stripe. Les données bancaires complètes ne sont pas stockées par TOK.</li>
            <li><span className="font-medium text-foreground">Localisation :</span> adresse, zone de livraison, distance, coordonnées approximatives ou GPS uniquement lorsque vous l'autorisez dans TOK et dans le navigateur ou le système.</li>
            <li><span className="font-medium text-foreground">Actualités et interactions :</span> vues, clics, likes, commentaires, reposts, partages, sauvegardes, signalements, posts masqués, « Plus comme ça », « Moins comme ça » et préférences déduites.</li>
            <li><span className="font-medium text-foreground">Recommandations :</span> scores d'intérêt, tags de cuisine, restaurants favoris, types de contenus, zones fréquentes, engagement historique et signaux utilisés pour ordonner le fil lorsque la personnalisation est autorisée.</li>
            <li><span className="font-medium text-foreground">Campagnes restaurateur :</span> budgets, durées, zones de diffusion, contenus, audiences, impressions, clics, CPC, conversions, dépenses, statuts et historiques.</li>
            <li><span className="font-medium text-foreground">Réseaux sociaux restaurateur :</span> profils renseignés, canaux sélectionnés, autorisations de publication, identifiants techniques et jetons strictement nécessaires lorsque le restaurateur connecte un compte externe.</li>
            <li><span className="font-medium text-foreground">Support et administration :</span> conversations, numéros de sinistre, pièces jointes, statuts de traitement, notes d'audit, décisions de modération et notifications.</li>
            <li><span className="font-medium text-foreground">Données techniques :</span> adresse IP lorsque nécessaire à la sécurité, appareil, navigateur, logs de sécurité, jetons de notification push, erreurs, performances et événements d'audit.</li>
            <li><span className="font-medium text-foreground">Preuve de consentement :</span> identifiant aléatoire, compte éventuel, version, catégories acceptées ou refusées, action, source, dates client et serveur, langue, navigateur et hash salé facultatif de l'adresse IP. L'adresse IP brute n'est pas stockée dans le journal de consentement.</li>
            <li><span className="font-medium text-foreground">Intégrations TOK Connect :</span> partenaires, membres partenaires, clients OAuth, scopes, quotas, restaurants autorisés, tokens opaques, journaux API, clés d'idempotence, endpoints webhook, livraisons webhook, request_id et traces d'agent MCP.</li>
            <li><span className="font-medium text-foreground">Données d'usage IA :</span> demandes, résultats, coûts estimés, modèles utilisés, qualité de sortie et métadonnées nécessaires aux fonctionnalités d'assistance, de génération ou de retouche, y compris lorsque le traitement implique OpenAI.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Finalités du traitement</h2>
          <p className="text-foreground/80 leading-relaxed">Nous utilisons ces données pour :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Créer et sécuriser votre compte, gérer les rôles client, restaurateur, coursier ou administrateur.</li>
            <li>Traiter les commandes, réservations, paiements, remboursements, livraisons, factures et demandes de support.</li>
            <li>Afficher des restaurants, offres, actualités et posts sauvegardés.</li>
            <li>Personnaliser l'ordre des contenus et recommandations uniquement lorsque la catégorie correspondante est autorisée.</li>
            <li>Mesurer l'usage et les campagnes sponsorisées uniquement selon les choix Analytics et Marketing enregistrés.</li>
            <li>Permettre aux restaurateurs de gérer menus, photos, campagnes, actualités, réseaux sociaux, factures, réservations et commandes.</li>
            <li>Fournir TOK Connect aux partenaires autorisés : API, OAuth, MCP, webhooks, sandbox, logs, quotas, audit et révocation.</li>
            <li>Envoyer des notifications strictement destinées au compte, rôle ou restaurant concerné.</li>
            <li>Prévenir la fraude, sécuriser la plateforme, auditer les actions sensibles et respecter nos obligations légales.</li>
            <li>Conserver la preuve d'un accord, d'un refus ou d'un retrait et appliquer ce choix sur les appareils et sessions compatibles.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Bases légales</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les traitements reposent notamment sur l'exécution du contrat, votre consentement lorsque requis, notre intérêt légitime à sécuriser et exploiter le service, ainsi que nos obligations légales comptables, fiscales ou de sécurité.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les catégories Analytics, Marketing, Personnalisation et Géolocalisation sont désactivées par défaut et reposent sur votre choix explicite lorsqu'elles ne sont pas nécessaires à une action que vous demandez. Le retrait n'affecte pas la licéité des opérations déjà effectuées avant ce retrait.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les recommandations du fil Actualités ne constituent pas une décision individuelle automatisée produisant à elles seules un effet juridique significatif.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Partage avec des tiers</h2>
          <p className="text-foreground/80 leading-relaxed">Nous partageons des données uniquement lorsque cela est nécessaire au service :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Restaurants partenaires :</span> informations nécessaires à la préparation, réservation, service, facturation et support.</li>
            <li><span className="font-medium text-foreground">Partenaires TOK Connect approuvés :</span> données strictement couvertes par leurs scopes, les autorisations restaurant, les quotas et les finalités validées.</li>
            <li><span className="font-medium text-foreground">Coursiers :</span> informations nécessaires à la livraison et au suivi de mission.</li>
            <li><span className="font-medium text-foreground">Stripe :</span> traitement des paiements, abonnements, remboursements, Connect et facturation.</li>
            <li><span className="font-medium text-foreground">Supabase :</span> authentification, base de données, stockage, fonctions serveur, temps réel, sécurité et journal de consentement.</li>
            <li><span className="font-medium text-foreground">Vercel :</span> hébergement, déploiement et logs techniques du frontend.</li>
            <li><span className="font-medium text-foreground">Firebase ou services push :</span> notifications mobiles et web lorsque vous les activez.</li>
            <li><span className="font-medium text-foreground">Réseaux sociaux tiers :</span> publication ou préparation de posts lorsque le restaurateur connecte un compte externe et déclenche cette action.</li>
            <li><span className="font-medium text-foreground">OpenAI ou prestataires IA :</span> traitement technique de certaines fonctionnalités d'assistance ou de génération lorsque ces services sont activés.</li>
            <li><span className="font-medium text-foreground">Prestataires email, analytics, sécurité et support :</span> uniquement dans les limites nécessaires à l'exploitation de TOK et de vos choix.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Nous ne vendons pas vos données personnelles nominatives. Les restaurants peuvent recevoir des statistiques agrégées sur leurs contenus et campagnes lorsque la mesure correspondante est autorisée ou fondée sur une opération contractuelle.
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
            <li>Le journal de consentement est append-only, soumis à RLS, accessible au service autorisé et ne conserve pas l'adresse IP brute.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Durées de conservation</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Compte :</span> pendant la vie du compte, puis suppression ou anonymisation selon les délais techniques et légaux applicables.</li>
            <li><span className="font-medium text-foreground">Commandes, paiements et factures :</span> pendant les durées nécessaires aux obligations comptables, fiscales, anti-fraude et de preuve.</li>
            <li><span className="font-medium text-foreground">Actualités, interactions et recommandations :</span> pendant la durée utile à l'expérience utilisateur, à la modération et à la mesure autorisée.</li>
            <li><span className="font-medium text-foreground">Support, sinistres et audit :</span> pendant la durée nécessaire au traitement, à la sécurité et à la défense des droits de TOK ou des utilisateurs.</li>
            <li><span className="font-medium text-foreground">Choix local de confidentialité :</span> 12 mois au maximum, jusqu'au retrait ou à une nouvelle version.</li>
            <li><span className="font-medium text-foreground">Journal serveur de consentement :</span> trois ans à compter de l'événement, puis suppression selon la politique automatisée applicable.</li>
            <li><span className="font-medium text-foreground">Jetons push et données locales :</span> supprimés, désactivés ou remplacés lors de la déconnexion, du changement de compte ou du retrait de consentement lorsque cela est possible.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Vos droits</h2>
          <p className="text-foreground/80 leading-relaxed">
            Conformément à la LPD et, lorsque applicable, au RGPD, vous pouvez demander l'accès, la rectification, l'effacement, la limitation, la portabilité ou l'opposition au traitement de vos données. Vous pouvez retirer séparément votre accord pour la mesure d'audience, le marketing, la personnalisation ou la géolocalisation.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez rouvrir le gestionnaire depuis la page <Link to="/cookies" className="text-primary hover:underline font-medium">Cookies et préférences</Link> ou le pied de page. Pour les autres droits, contactez <span className="font-medium text-foreground">privacy@thetok.ch</span>. Une vérification d'identité peut être demandée.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Cookies et technologies similaires</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les technologies nécessaires servent à l'authentification, au panier, à la sécurité, au thème et à la mémorisation de vos choix. Analytics, Marketing, Personnalisation et Géolocalisation sont des catégories facultatives, désactivées avant choix, avec un bouton « Tout refuser » au même niveau que « Tout accepter ».
          </p>
          <p className="text-foreground/80 leading-relaxed">
            La page Cookies publie l'inventaire des noms, fournisseurs, supports, finalités et durées actuellement connus. Le retrait bloque les nouveaux appels concernés et supprime les stockages facultatifs référencés lorsque cela est techniquement possible.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Suppression du compte</h2>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez demander la suppression de votre compte depuis l'application ou en nous contactant. Certaines données peuvent être conservées lorsqu'une obligation légale, une transaction en cours, un litige, une facture, un remboursement, une preuve de consentement ou une mesure anti-fraude l'exige.
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
            Cette politique peut être mise à jour lorsque la plateforme, nos prestataires, nos traitements ou la réglementation évoluent. Une nouvelle version du consentement facultatif entraîne une nouvelle demande de choix plutôt qu'une réutilisation automatique d'une décision ancienne.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">13. Traitements liés à TOK Connect</h2>
          <p className="text-foreground/80 leading-relaxed">
            TOK Connect permet à des partenaires approuvés d'accéder à certaines fonctionnalités TOK via API REST, OAuth, webhooks et MCP. Les données transmises dépendent toujours des scopes du client OAuth, du mode sandbox ou production, des autorisations accordées par le restaurant concerné, des quotas et des finalités validées par TOK.
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Données restaurant :</span> fiche publique, horaires, services, menus, disponibilités, identifiants techniques et paramètres nécessaires à l'intégration.</li>
            <li><span className="font-medium text-foreground">Réservations :</span> informations strictement nécessaires à la preview, à la création, à l'annulation ou au support d'une réservation autorisée.</li>
            <li><span className="font-medium text-foreground">Campagnes et performance :</span> previews, coûts estimés, crédits, métriques agrégées et indicateurs autorisés par le restaurant, TOK et les choix applicables.</li>
            <li><span className="font-medium text-foreground">Sécurité et audit :</span> client OAuth, scopes, adresse IP, request_id, horodatage, statut, erreurs, idempotence, révocation, rotation de secret, livraison webhook et signatures.</li>
            <li><span className="font-medium text-foreground">MCP :</span> appels d'outils, ressources, prompts, traces techniques et résultats nécessaires pour fournir l'assistant connecté dans le périmètre autorisé.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Les secrets OAuth sont hashés ou protégés côté serveur, les tokens sont opaques et les clés service_role ne sont pas exposées dans le navigateur. Les webhooks sont signés afin que le partenaire puisse vérifier l'origine et l'intégrité de la livraison.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Le partenaire qui reçoit des données via TOK Connect doit les utiliser uniquement pour l'intégration validée, les protéger, respecter les droits des personnes concernées et supprimer ou anonymiser les données lorsqu'elles ne sont plus nécessaires. Selon l'intégration, il peut agir comme sous-traitant ou responsable indépendant de certains traitements.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Le mode sandbox utilise des données de test ou fixtures isolées et ne doit pas contenir de mutation production. Un restaurant ou TOK peut retirer une autorisation, révoquer un client, réduire un scope ou suspendre un webhook lorsqu'un accès n'est plus justifié.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">14. Contact</h2>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email confidentialité :</span> privacy@thetok.ch</li>
            <li><span className="font-medium text-foreground">Formulaire :</span> via notre <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
            <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide TOK</Link></li>
            <li><span className="font-medium text-foreground">Préférences :</span> <Link to="/cookies" className="text-primary hover:underline font-medium">Cookies et préférences</Link></li>
          </ul>
        </section>
      </div>
    </div>
  );
}
