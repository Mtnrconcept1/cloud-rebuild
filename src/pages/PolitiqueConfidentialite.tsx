import { Link } from "react-router-dom";

export default function PolitiqueConfidentialite() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Politique de confidentialité</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 23 mars 2026</p>
      </div>
      <div className="prose prose-foodhub max-w-none space-y-8">

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Responsable du traitement</h2>
          <p className="text-foreground/80 leading-relaxed">
            Tok SA, société de droit suisse (ci-après « Tok », « nous »), est responsable du traitement des données personnelles collectées vià la plateforme Tok (site web et application mobile).
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email :</span> privacy@tok.ch</li>
            <li><span className="font-medium text-foreground">Siège :</span> Suisse</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Données collectées</h2>
          <p className="text-foreground/80 leading-relaxed">Nous collectons les catégories de données suivantes :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Données d'identification :</span> nom, prénom, adresse email, numéro de téléphone, date de naissance (optionnel).</li>
            <li><span className="font-medium text-foreground">Données de livraison :</span> adresse postale, coordonnées GPS pour la localisation des livraisons.</li>
            <li><span className="font-medium text-foreground">Données de commande :</span> historique des commandes, montants, préférences alimentaires, restaurants favoris.</li>
            <li><span className="font-medium text-foreground">Données de paiement :</span> méthode de paiement choisie. Les données bancaires sont traitées directement par notre prestataire Stripe et ne sont pas stockées sur nos serveurs.</li>
            <li><span className="font-medium text-foreground">Données de navigation :</span> pages visitées, interactions avec la plateforme, recherches effectuées.</li>
            <li><span className="font-medium text-foreground">Données du fil Actualités :</span> abonnements a des restaurants, réactions, commentaires, signalements, sauvegardes, partages, clics sur les boutons d'action et preferences de contenu.</li>
            <li><span className="font-medium text-foreground">Données marketing restaurateur :</span> objectifs de campagne, segments d'audience, contenus publies, codes d'offres, statistiques d'impressions, clics, engagement et performance des actualités.</li>
            <li><span className="font-medium text-foreground">Données techniques :</span> adresse IP, type de navigateur, système d'exploitation, identifiant d'appareil.</li>
            <li><span className="font-medium text-foreground">Données de géolocalisation :</span> position GPS (uniquement avec votre consentement explicite).</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Finalités et base légale</h2>
          <p className="text-foreground/80 leading-relaxed">Vos données sont traitées pour les finalités suivantes :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Exécution du contrat :</span> gestion de votre compte, traitement des commandes, livraison, facturation, gestion des réservations.</li>
            <li><span className="font-medium text-foreground">Intérêt légitime :</span> amélioration de nos services, personnalisation de l'expérience, prévention de la fraude, analyses statistiques anonymisées.</li>
            <li><span className="font-medium text-foreground">Mesure et moderation des Actualités :</span> recommandation du fil social, detection d'abus, traitement des signalements et statistiques agrégées mises a disposition des Restaurants.</li>
            <li><span className="font-medium text-foreground">Consentement :</span> envoi de notifications push, géolocalisation, cookies non essentiels, communications marketing.</li>
            <li><span className="font-medium text-foreground">Obligation légale :</span> conservation des factures, conformité fiscale.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Partage avec des tiers</h2>
          <p className="text-foreground/80 leading-relaxed">Vos données peuvent être partagées avec les prestataires suivants, dans le strict cadre de la fourniture de nos services :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Stripe :</span> traitement des paiements par carte bancaire. Stripe est certifié PCI-DSS niveau 1.</li>
            <li><span className="font-medium text-foreground">Supabase (AWS) :</span> hébergement de la base de données et authentification. Données hébergées en Europe.</li>
            <li><span className="font-medium text-foreground">Firebase (Google) :</span> envoi de notifications push sur mobile.</li>
            <li><span className="font-medium text-foreground">Restaurants partenaires :</span> transmission des informations nécessaires à la préparation et livraison de votre commande (nom, adresse de livraison, contenu de la commande).</li>
            <li><span className="font-medium text-foreground">Restaurants publieurs :</span> accès a des statistiques agrégées sur leurs actualités (impressions, clics, réactions, commentaires, sauvegardes, partages) sans vente de données personnelles nominatives.</li>
            <li><span className="font-medium text-foreground">Livreurs partenaires :</span> adresse de livraison et informations de contact nécessaires à la livraison.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Nous ne vendons jamais vos données personnelles à des tiers. Nous ne partageons vos données qu'avec les prestataires nécessaires au fonctionnement du service.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Sécurité des données</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Toutes les communications sont chiffrées en transit (TLS/HTTPS).</li>
            <li>Les données sont chiffrées au repos dans notre base de données.</li>
            <li>L'accès aux données est restreint par des politiques de contrôle d'accès (Row-Level Security).</li>
            <li>Les mots de passe sont hashés et ne sont jamais stockés en clair.</li>
            <li>Les données de paiement sont traitées par Stripe et ne transitent pas par nos serveurs.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Durée de conservation</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Données de compte :</span> conservées tant que votre compte est actif, puis supprimées dans les 30 jours suivant la suppression du compte.</li>
            <li><span className="font-medium text-foreground">Données de commande :</span> conservées 3 ans à compter de la commande (obligations comptables et fiscales).</li>
            <li><span className="font-medium text-foreground">Données de navigation :</span> conservées 13 mois maximum.</li>
            <li><span className="font-medium text-foreground">Données de géolocalisation :</span> conservées uniquement le temps de la session ou de la livraison en cours.</li>
          </ul>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Vos droits</h2>
          <p className="text-foreground/80 leading-relaxed">Conformément à la Loi fédérale sur la protection des données (LPD) et au RGPD (si applicable), vous disposez des droits suivants :</p>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Droit d'accès :</span> obtenir une copie de vos données personnelles.</li>
            <li><span className="font-medium text-foreground">Droit de rectification :</span> corriger des données inexactes ou incomplètes.</li>
            <li><span className="font-medium text-foreground">Droit à l'effacement :</span> demander la suppression de vos données (sous réserve des obligations légales de conservation).</li>
            <li><span className="font-medium text-foreground">Droit à la portabilité :</span> recevoir vos données dans un format structuré et lisible par machine.</li>
            <li><span className="font-medium text-foreground">Droit d'opposition :</span> vous opposer au traitement de vos données à des fins de marketing.</li>
            <li><span className="font-medium text-foreground">Droit de retirer votre consentement :</span> à tout moment, sans affecter la licéité du traitement antérieur.</li>
          </ul>
          <p className="text-foreground/80 leading-relaxed">
            Pour exercer ces droits, contactez-nous à <span className="font-medium text-foreground">privacy@tok.ch</span>. Nous répondrons dans un délai de 30 jours.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Suppression du compte</h2>
          <p className="text-foreground/80 leading-relaxed">
            Vous pouvez demander la suppression de votre compte et de toutes vos données personnelles à tout moment en nous contactant à <span className="font-medium text-foreground">privacy@tok.ch</span> ou depuis les paramètrès de votre profil dans l'application.
          </p>
          <p className="text-foreground/80 leading-relaxed">
            La suppression sera effective dans un délai de 30 jours. Certaines données pourront être conservées au-delà si la loi l'exige (données de facturation, obligations fiscales).
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Cookies et technologies similaires</h2>
          <p className="text-foreground/80 leading-relaxed">
            Nous utilisons des cookies strictement nécessaires au fonctionnement de la plateforme (authentification, panier, préférences). Aucun cookie publicitaire tiers n'est utilisé sans votre consentement préalable.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Mineurs</h2>
          <p className="text-foreground/80 leading-relaxed">
            Nos services ne s'adressent pas aux personnes de moins de 16 ans. Nous ne collectons pas sciemment de données personnelles de mineurs. Si vous êtes parent ou tuteur et pensez que votre enfant nous a fourni des données, contactez-nous pour que nous les supprimions.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">11. Modifications</h2>
          <p className="text-foreground/80 leading-relaxed">
            Nous nous réservons le droit de modifier cette politique de confidentialité. En cas de modification substantielle, vous serez informé par notification dans l'application ou par email. La date de dernière mise à jour est indiquée en haut de cette page.
          </p>
        </section>

        <section className="space-y-4 border-t pt-8 mt-8">
          <h2 className="text-2xl font-semibold">12. Contact</h2>
          <p className="text-foreground/80 leading-relaxed">
            Pour toute question relative à cette politique de confidentialité ou à vos données personnelles :
          </p>
          <ul className="list-none space-y-2 text-foreground/80">
            <li><span className="font-medium text-foreground">Email :</span> privacy@tok.ch</li>
            <li><span className="font-medium text-foreground">Formulaire :</span> via notre <Link to="/contact" className="text-primary hover:underline font-medium">page de contact</Link></li>
            <li><span className="font-medium text-foreground">Centre d'aide :</span> <Link to="/aide" className="text-primary hover:underline font-medium">Centre d'aide Tok</Link></li>
          </ul>
        </section>

      </div>
    </div>
  );
}
