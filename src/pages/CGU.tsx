import { Link } from "react-router-dom";

export default function CGU() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 3 mars 2026</p>
      </div>
      <div className="prose prose-foodhub max-w-none space-y-8">

        {/* 1. Objet */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Objet</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les présentes Conditions Générales d'Utilisation (ci-après « CGU ») définissent les modalités d'accès et d'utilisation de la plateforme Tok (ci-après « la Plateforme »), accessible via le site web et l'application mobile, éditée par Tok SA, société de droit suisse, dont le siège est situé en Suisse.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            La Plateforme permet la mise en relation entre des utilisateurs (ci-après « les Utilisateurs ») et des restaurants partenaires (ci-après « les Restaurants »), en vue de la consultation de menus, la réservation de tables, la commande de repas en livraison ou à emporter, ainsi que l'accès à des offres exclusives.
          </p>
        </section>

        {/* 2. Acceptation */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Acceptation des CGU</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'utilisation de la Plateforme implique l'acceptation pleine et entière des présentes CGU. L'Utilisateur reconnaît en avoir pris connaissance et s'engage à les respecter.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En créant un compte ou en passant une commande, l'Utilisateur déclare avoir lu, compris et accepté sans réserve les présentes CGU. Si l'Utilisateur n'accepte pas ces conditions, il est invité à ne pas utiliser la Plateforme.
          </p>
        </section>

        {/* 3. Services proposés */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Services proposés</h2>
          <p className="text-foreground/80 leading-relaxed">La Plateforme offre les services suivants :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Consultation des menus, cartes et informations des Restaurants partenaires.</li>
            <li>Réservation de tables en ligne avec confirmation instantanée.</li>
            <li>Commande de repas en livraison à domicile ou à emporter (click & collect).</li>
            <li>Accès à des offres exclusives, promotions et programmes de fidélité.</li>
            <li>Suivi en temps réel des commandes et des livraisons.</li>
            <li>Accès aux avis et évaluations d'autres Utilisateurs.</li>
            <li>Abonnement Tok One offrant des avantages premium (livraison gratuite, réductions exclusives, accès prioritaire aux événements).</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Tok agit en qualité d'intermédiaire entre l'Utilisateur et le Restaurant. Le contrat de vente des repas est conclu directement entre l'Utilisateur et le Restaurant concerné.
          </p>
        </section>

        {/* 4. Inscription et Compte */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Inscription et compte utilisateur</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'accès à certains services nécessite la création d'un compte personnel. L'Utilisateur doit être âgé d'au moins 16 ans et fournir des informations exactes, complètes et à jour lors de son inscription.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur est responsable de la confidentialité de ses identifiants de connexion et de toutes les activités effectuées depuis son compte. En cas d'utilisation non autorisée de son compte, l'Utilisateur s'engage à en informer Tok immédiatement.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Tok se réserve le droit de suspendre ou de supprimer tout compte en cas de violation des présentes CGU, de fraude, ou d'utilisation abusive de la Plateforme.
          </p>
        </section>

        {/* 5. Commandes et Paiement */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Commandes et paiement</h2>
          <h3 className="text-xl font-medium mt-4">5.1 Passation de commande</h3>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur sélectionne les articles de son choix parmi les menus proposés par les Restaurants partenaires. La commande est validée une fois le paiement effectué. Un récapitulatif de commande est envoyé par email et/ou notification.
          </p>
          <h3 className="text-xl font-medium mt-4">5.2 Prix</h3>
          <p className="text-foreground/80 leading-relaxed">
            Les prix affichés sur la Plateforme sont indiqués en francs suisses (CHF), toutes taxes comprises. Tok se réserve le droit de modifier les prix à tout moment. Les prix applicables sont ceux en vigueur au moment de la validation de la commande.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Des frais de livraison peuvent s'appliquer en fonction de la distance et du Restaurant, et sont clairement indiqués avant la validation de la commande.
          </p>
          <h3 className="text-xl font-medium mt-4">5.3 Moyens de paiement</h3>
          <p className="text-foreground/80 leading-relaxed">
            Le paiement s'effectue en ligne via les moyens de paiement acceptés : carte bancaire (Visa, Mastercard), TWINT, Apple Pay, Google Pay et solde Tok. Le paiement est sécurisé et traité par nos prestataires de paiement certifiés.
          </p>
          <h3 className="text-xl font-medium mt-4">5.4 Annulation et remboursement</h3>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur peut annuler sa commande tant que le Restaurant n'a pas commencé la préparation. Passé ce délai, aucune annulation ne sera possible. En cas d'annulation valide, le remboursement est effectué sous 5 à 10 jours ouvrés sur le moyen de paiement utilisé.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En cas de problème avéré (article manquant, erreur de commande, qualité non conforme), l'Utilisateur peut contacter le service client pour obtenir un remboursement partiel ou total, ou un crédit Tok.
          </p>
        </section>

        {/* 6. Livraison */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Livraison</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les livraisons sont effectuées par des livreurs indépendants partenaires de Tok. Les délais de livraison estimés sont indicatifs et peuvent varier en fonction des conditions de circulation, de la météo et du volume de commandes.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur s'engage à fournir une adresse de livraison exacte et complète, ainsi qu'à être disponible pour réceptionner sa commande. En cas d'absence ou d'adresse incorrecte, Tok ne pourra être tenu responsable de la non-livraison.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les zones de livraison sont limitées et dépendent de la localisation du Restaurant partenaire. La disponibilité de la livraison est indiquée lors de la saisie de l'adresse de livraison.
          </p>
        </section>

        {/* 7. Réservation de tables */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Réservation de tables</h2>
          <p className="text-foreground/80 leading-relaxed">
            Le service de réservation permet à l'Utilisateur de réserver une table dans un Restaurant partenaire. La réservation est confirmée par email et/ou notification dans l'application.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            En cas d'impossibilité de se rendre au restaurant, l'Utilisateur est prié d'annuler sa réservation au moins 2 heures à l'avance. Les absences répétées sans annulation (no-show) pourront entraîner des restrictions d'accès au service de réservation.
          </p>
        </section>

        {/* 8. Programme de fidélité et Tok One */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Programme de fidélité et Tok One</h2>
          <p className="text-foreground/80 leading-relaxed">
            Tok propose un programme de fidélité permettant de cumuler des points à chaque commande. Ces points peuvent être convertis en réductions ou avantages selon les modalités en vigueur.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'abonnement Tok One est un service premium payant offrant des avantages exclusifs, notamment la livraison gratuite sur les restaurants éligibles, des réductions supplémentaires et un accès prioritaire aux événements gastronomiques (La Table du Chefs). Les conditions spécifiques de l'abonnement sont détaillées lors de la souscription.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'abonnement Tok One est renouvelé automatiquement à chaque période. L'Utilisateur peut résilier son abonnement à tout moment depuis les paramètres de son compte, la résiliation prenant effet à la fin de la période en cours.
          </p>
        </section>

        {/* 9. Avis et contenus utilisateurs */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Avis et contenus utilisateurs</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les Utilisateurs peuvent publier des avis, notes et commentaires sur les Restaurants. Ces contenus doivent être authentiques, respectueux et conformes à la législation en vigueur. Il est interdit de publier des contenus diffamatoires, discriminatoires, injurieux, trompeurs ou portant atteinte aux droits de tiers.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Tok se réserve le droit de modérer, modifier ou supprimer tout contenu jugé inapproprié, sans notification préalable. L'Utilisateur accorde à Tok une licence non exclusive et gratuite d'utilisation des contenus publiés sur la Plateforme.
          </p>
        </section>

        {/* 10. Propriété intellectuelle */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Propriété intellectuelle</h2>
          <p className="text-foreground/80 leading-relaxed">
            L'ensemble des éléments composant la Plateforme (textes, images, logos, marques, design, logiciels, bases de données, etc.) sont la propriété exclusive de Tok SA ou de ses partenaires et sont protégés par les lois suisses et internationales relatives à la propriété intellectuelle.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Toute reproduction, représentation, modification, distribution ou exploitation de ces éléments, en tout ou en partie, sans l'autorisation écrite préalable de Tok, est strictement interdite et constitue une contrefaçon sanctionnable.
          </p>
        </section>

        {/* 11. Données personnelles */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">11. Protection des données personnelles</h2>
          <p className="text-foreground/80 leading-relaxed">
            Tok s'engage à protéger les données personnelles de ses Utilisateurs conformément à la Loi fédérale sur la protection des données (LPD) et au Règlement général sur la protection des données (RGPD) lorsque applicable.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les données collectées (nom, prénom, email, adresse, historique de commandes, données de paiement, géolocalisation) sont nécessaires à la fourniture des services et ne sont transmises à des tiers que dans la mesure strictement nécessaire à l'exécution des commandes (Restaurants partenaires, prestataires de livraison, prestataires de paiement).
          </p>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur dispose d'un droit d'accès, de rectification, de suppression et de portabilité de ses données. Il peut exercer ces droits en contactant Tok à l'adresse : <span className="font-medium text-foreground">privacy@tok.ch</span>.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Pour plus de détails, veuillez consulter notre Politique de Confidentialité disponible sur la Plateforme.
          </p>
        </section>

        {/* 12. Cookies */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">12. Cookies</h2>
          <p className="text-foreground/80 leading-relaxed">
            La Plateforme utilise des cookies et technologies similaires pour améliorer l'expérience utilisateur, analyser le trafic et personnaliser les contenus. L'Utilisateur peut gérer ses préférences en matière de cookies via les paramètres de son navigateur ou le bandeau de consentement affiché lors de sa première visite.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Les cookies essentiels au fonctionnement de la Plateforme ne peuvent pas être désactivés. Les cookies analytiques et publicitaires sont soumis au consentement préalable de l'Utilisateur.
          </p>
        </section>

        {/* 13. Responsabilité */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">13. Responsabilité</h2>
          <h3 className="text-xl font-medium mt-4">13.1 Responsabilité de Tok</h3>
          <p className="text-foreground/80 leading-relaxed">
            Tok agit en qualité d'intermédiaire technique et ne saurait être tenu responsable de la qualité, de la quantité ou de la conformité des repas préparés et servis par les Restaurants partenaires. Tok s'engage néanmoins à mettre en œuvre tous les moyens raisonnables pour assurer le bon fonctionnement de la Plateforme.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Tok ne garantit pas la disponibilité ininterrompue de la Plateforme et ne saurait être tenu responsable des dommages résultant d'une indisponibilité temporaire, de bugs ou d'erreurs techniques.
          </p>
          <h3 className="text-xl font-medium mt-4">13.2 Responsabilité de l'Utilisateur</h3>
          <p className="text-foreground/80 leading-relaxed">
            L'Utilisateur est responsable de l'utilisation qu'il fait de la Plateforme et s'engage à ne pas utiliser celle-ci à des fins illicites ou contraires aux présentes CGU. Il est notamment interdit de :
          </p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Créer de faux comptes ou usurper l'identité d'un tiers.</li>
            <li>Utiliser la Plateforme pour des activités frauduleuses.</li>
            <li>Perturber le fonctionnement de la Plateforme (attaques, scraping, etc.).</li>
            <li>Publier des contenus illégaux ou portant atteinte aux droits de tiers.</li>
            <li>Abuser des offres promotionnelles ou du programme de fidélité.</li>
          </ul>
        </section>

        {/* 14. Modifications des CGU */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">14. Modification des CGU</h2>
          <p className="text-foreground/80 leading-relaxed">
            Tok se réserve le droit de modifier les présentes CGU à tout moment. Les Utilisateurs seront informés des modifications par notification dans l'application ou par email. La poursuite de l'utilisation de la Plateforme après modification vaut acceptation des nouvelles CGU.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            Il est recommandé à l'Utilisateur de consulter régulièrement les CGU pour prendre connaissance des éventuelles modifications.
          </p>
        </section>

        {/* 15. Droit applicable et juridiction */}
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">15. Droit applicable et juridiction</h2>
          <p className="text-foreground/80 leading-relaxed">
            Les présentes CGU sont régies par le droit suisse. En cas de litige relatif à l'interprétation, l'exécution ou la résiliation des présentes CGU, les parties s'engagent à rechercher une solution amiable avant de saisir les tribunaux compétents.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            À défaut de règlement amiable, tout litige sera soumis à la compétence exclusive des tribunaux du siège social de Tok SA, sous réserve des dispositions impératives du droit de la consommation applicables.
          </p>
        </section>

        {/* 16. Contact */}
        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">16. Contact</h2>
          <p className="text-foreground/80 leading-relaxed">
            Pour toute question relative aux présentes CGU, vous pouvez nous contacter :
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email :</span> support@tok.ch</li>
            <li><span className="font-medium text-foreground">Formulaire :</span> via notre <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
            <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide Tok</Link></li>
          </ul>
        </section>

      </div>
    </div>
  );
}