import { Link } from "react-router-dom";
import { SUPPORT_EMAIL } from "@/lib/contact";

export default function CGU() {
  return (
    <div className="container max-w-4xl space-y-12 py-12 md:py-20">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 9 juin 2026</p>
      </div>

      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Objet</h2>
          <p className="leading-relaxed text-foreground/80">
            Les présentes Conditions Générales d'Utilisation définissent les modalités d'accès et d'utilisation de TOK, depuis le site, l'application web et les applications mobiles associées.
          </p>
          <p className="leading-relaxed text-foreground/80">
            TOK met à disposition les parcours et outils effectivement affichés dans l'interface au moment de l'utilisation. La liste exacte des services accessibles dépend de la configuration active, de la zone, du rôle utilisateur et des droits attachés au compte.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Acceptation</h2>
          <p className="leading-relaxed text-foreground/80">
            L'utilisation de TOK implique l'acceptation pleine et entière des présentes CGU. Si vous n'acceptez pas ces conditions, vous devez cesser d'utiliser la plateforme.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Des conditions complémentaires peuvent s'appliquer à certains modules ou offres lorsqu'ils sont affichés dans l'interface.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Services affichés</h2>
          <p className="leading-relaxed text-foreground/80">
            TOK peut proposer différents parcours selon la configuration active. Un service non affiché dans l'interface ne doit pas être considéré comme disponible, même s'il a existé précédemment ou s'il est mentionné dans un ancien support de communication.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Les informations, prix, conditions, horaires, disponibilités, frais et limites présentés avant validation prévalent pour le parcours concerné.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">4. Comptes, rôles et sécurité</h2>
          <p className="leading-relaxed text-foreground/80">
            Certains services nécessitent un compte. Vous devez fournir des informations exactes, maintenir vos coordonnées à jour et protéger vos identifiants.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Les accès client, restaurateur, partenaire ou administrateur sont réservés aux personnes autorisées. Toute tentative d'accès à des données qui ne vous sont pas destinées est interdite.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">5. Paiements et validation</h2>
          <p className="leading-relaxed text-foreground/80">
            Les prix sont affichés en francs suisses (CHF). Les moyens de paiement disponibles sont ceux proposés dans l'interface au moment de la validation.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Une opération payante est validée lorsque le paiement est confirmé par le prestataire ou lorsque les conditions affichées prévoient un autre mode de confirmation.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">6. Contenus, avis et publications</h2>
          <p className="leading-relaxed text-foreground/80">
            Les contenus publiés par les utilisateurs ou partenaires doivent être authentiques, licites, respectueux et ne pas porter atteinte aux droits de tiers.
          </p>
          <p className="leading-relaxed text-foreground/80">
            TOK peut modérer, masquer, restaurer ou supprimer un contenu lorsque cela est nécessaire pour protéger les utilisateurs, les partenaires ou la plateforme.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">7. Partenaires</h2>
          <p className="leading-relaxed text-foreground/80">
            Les partenaires sont responsables des informations, prix, disponibilités, allergènes, horaires, images, offres et contenus qu'ils fournissent ou valident.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">8. Support et notifications</h2>
          <p className="leading-relaxed text-foreground/80">
            TOK peut proposer un support par email, centre d'aide ou interface dédiée selon la configuration active. Les notifications sont destinées au compte, rôle ou partenaire concerné.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Contact : {SUPPORT_EMAIL}.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">9. Propriété intellectuelle</h2>
          <p className="leading-relaxed text-foreground/80">
            Les marques, logos, textes, interfaces, bases de données, logiciels, visuels, modèles et documents appartiennent à TOK ou à ses partenaires. Toute exploitation non autorisée est interdite.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">10. Données personnelles</h2>
          <p className="leading-relaxed text-foreground/80">
            TOK traite les données personnelles conformément à la Loi fédérale suisse sur la protection des données et, lorsque applicable, au RGPD.
          </p>
          <p className="leading-relaxed text-foreground/80">
            Pour plus d'informations, consultez notre <Link to="/politique-confidentialite" className="font-medium text-primary hover:underline">Politique de confidentialité</Link>.
          </p>
        </section>
      </div>
    </div>
  );
}
