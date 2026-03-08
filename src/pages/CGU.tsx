export default function CGU() {
  return (
    <div className="container py-12 md:py-20 max-w-4xl space-y-12">
      <div className="space-y-4">
        <h1 className="font-display text-4xl font-bold">Conditions Générales d'Utilisation</h1>
        <p className="text-muted-foreground">Dernière mise à jour : 3 mars 2026</p>
      </div>
      <div className="prose prose-foodhub max-w-none space-y-8">
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">1. Objet</h2>
          <p className="text-foreground/80 leading-relaxed">Les présentes CGU définissent les modalités d'utilisation de l'application Miamz de réservation et de commande de repas en ligne.</p>
        </section>
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">2. Acceptation</h2>
          <p className="text-foreground/80 leading-relaxed">L'utilisation de l'Application implique l'acceptation pleine et entière des présentes CGU.</p>
        </section>
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">3. Services proposés</h2>
          <ul className="list-disc pl-6 space-y-2 text-foreground/80">
            <li>Consultation de menus et cartes de restaurants partenaires.</li>
            <li>Réservation de tables en ligne.</li>
            <li>Commande de repas en livraison ou à emporter.</li>
            <li>Accès à des offres exclusives et programmes de fidélité.</li>
          </ul>
        </section>
        <section className="space-y-4 text-center py-12 border-t mt-12">
          <p className="text-muted-foreground italic">Pour toute question, contactez-nous via la page dédiée.</p>
        </section>
      </div>
    </div>
  );
}