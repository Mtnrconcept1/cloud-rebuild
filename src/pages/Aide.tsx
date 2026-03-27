import { useState } from "react";
import {
  CalendarDays,
  ChevronRight,
  HelpCircle,
  Mail,
  MessageSquare,
  Phone,
  Search,
  ShieldCheck,
  ShoppingBag,
  User,
} from "lucide-react";
import { Link } from "react-router-dom";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

declare global {
  interface Window {
    openChat?: () => void;
  }
}

const CATEGORIES = [
  { id: "reservations", title: "Réservations", icon: CalendarDays, color: "text-rose-600", bg: "bg-rose-50" },
  { id: "orders", title: "Retrait & commandes", icon: ShoppingBag, color: "text-green-600", bg: "bg-green-50" },
  { id: "account", title: "Compte & paiement", icon: User, color: "text-blue-600", bg: "bg-blue-50" },
  { id: "membership", title: "Tok One", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50" },
] as const;

const FAQS = [
  {
    category: "reservations",
    questions: [
      {
        q: "Comment réserver une table ?",
        a: "Depuis la fiche d'un restaurant, choisissez la date, l'heure et le nombre de couverts, puis confirmez votre réservation. Si une formule ou une offre de réservation est disponible sur ce créneau, elle vous est proposée avant validation.",
      },
      {
        q: "Comment modifier ou annuler ma réservation ?",
        a: "Rendez-vous dans \"Mes réservations\" pour vérifier si la modification ou l'annulation reste autorisée. Une fois la limite du restaurant dépassée ou si la réservation est imminente, il faut contacter le support pour toute demande exceptionnelle.",
      },
      {
        q: "Comment fonctionne la réservation zéro attente ?",
        a: "Le parcours Zéro Attente vous permet de choisir votre heure d'arrivée, de précommander vos plats et, selon le restaurant, de régler à l'avance. Le restaurant prépare votre venue pour réduire au maximum l'attente sur place.",
      },
      {
        q: "Où retrouver ma réservation zéro attente ?",
        a: "Elle apparaît dans \"Mes réservations\" avec l'horaire d'arrivée retenu, les plats précommandés et le montant associé s'il y en a un. Il vous suffit ensuite de vous présenter au restaurant à l'heure choisie.",
      },
      {
        q: "Comment fonctionne une réservation avec offre ?",
        a: "Certaines tables proposent une formule ou une promotion sur des créneaux précis. La remise s'affiche avant confirmation et reste attachée à votre réservation. Les conditions exactes dépendent du restaurant et du service sélectionné.",
      },
      {
        q: "Puis-je ajouter une demande spéciale à ma réservation ?",
        a: "Oui. Vous pouvez ajouter une note lors de la réservation pour signaler un anniversaire, une allergie, une chaise haute ou une préférence de placement. Le restaurant la traite selon ses possibilités.",
      },
    ],
  },
  {
    category: "orders",
    questions: [
      {
        q: "Où voir l'état de ma commande à emporter ?",
        a: "Suivez-la depuis l'onglet \"Commandes\" de votre profil. Vous verrez si la préparation a commencé, quand le retrait est prêt et le créneau de collecte à respecter.",
      },
      {
        q: "Comment annuler une commande à emporter ?",
        a: "L'annulation est possible tant que le restaurant n'a pas lancé la préparation ou que l'offre n'a pas été définitivement confirmée. Ouvrez les détails de la commande pour vérifier si l'action est encore disponible.",
      },
      {
        q: "Comment fonctionne une vente flash ?",
        a: "Les ventes flash sont des offres limitées dans le temps, disponibles uniquement à emporter. Chaque offre précise son stock, sa date d'expiration et son horaire de retrait fixé par le restaurateur.",
      },
      {
        q: "Comment fonctionne une commande zéro gaspi ?",
        a: "Les offres zéro gaspi permettent de récupérer un panier ou des articles à prix réduit sur un créneau de retrait défini par le restaurant. Selon le type d'offre, le contenu peut varier légèrement en fonction des invendus disponibles.",
      },
      {
        q: "Puis-je modifier l'heure de retrait ?",
        a: "Pour une commande classique à emporter, une modification peut être possible avant le lancement en cuisine et selon les créneaux restants. Pour une vente flash ou une offre zéro gaspi, l'horaire est généralement fixe.",
      },
      {
        q: "Il manque un article dans ma commande",
        a: "Signalez le problème depuis votre historique de commandes ou contactez-nous à support@tok.ch. Après vérification auprès du restaurant, un remboursement partiel ou un avoir peut être appliqué.",
      },
      {
        q: "Comment utiliser un code promo ?",
        a: "Lors du récapitulatif, appuyez sur \"Ajouter un code promo\" puis saisissez votre code. La réduction s'applique si votre commande à emporter ou votre réservation remplit les conditions de l'offre.",
      },
    ],
  },
  {
    category: "account",
    questions: [
      {
        q: "Comment créer un compte ?",
        a: "Appuyez sur \"S'inscrire\" depuis l'écran de connexion. Vous pouvez créer un compte avec votre email ou vous connecter via Google ou Apple. Un email de vérification peut être demandé pour confirmer votre adresse.",
      },
      {
        q: "Comment changer mon mode de paiement ?",
        a: "Allez dans \"Profil\" puis \"Moyens de paiement\" pour ajouter, modifier ou supprimer vos cartes. Les paiements disponibles peuvent inclure carte bancaire, TWINT, Apple Pay ou Google Pay selon votre appareil.",
      },
      {
        q: "Réinitialiser mon mot de passe",
        a: "Cliquez sur \"Mot de passe oublié\" sur la page de connexion, saisissez votre email et suivez le lien reçu. Si vous ne recevez rien, vérifiez vos spams ou contactez le support.",
      },
      {
        q: "Comment modifier mes informations personnelles ?",
        a: "Depuis \"Profil\", vous pouvez mettre à jour votre nom, votre email, votre numéro de téléphone et vos préférences utiles pour les réservations et commandes. Certaines modifications peuvent nécessiter une nouvelle vérification.",
      },
      {
        q: "Comment gérer mes notifications d'offres et de réservations ?",
        a: "Les alertes peuvent être activées ou désactivées selon votre appareil et vos autorisations navigateur. Elles servent notamment à recevoir les confirmations de réservation, les commandes prêtes au retrait et les ventes flash.",
      },
      {
        q: "Mes paiements sont-ils sécurisés ?",
        a: "Oui. Les paiements sont traités par des prestataires conformes aux standards PCI-DSS. Vos données bancaires ne sont pas stockées directement sur nos serveurs et chaque transaction est chiffrée.",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Vous pouvez demander la suppression de votre compte depuis les paramètres de votre profil. Cette action est irréversible et entraîne la perte de votre historique, de vos crédits et de vos avantages associés.",
      },
    ],
  },
  {
    category: "membership",
    questions: [
      {
        q: "Quels sont les avantages de Tok One ?",
        a: "Tok One donne accès à des remises exclusives sur certaines réservations et commandes à emporter, à des avantages prioritaires sur des tables et créneaux demandés, ainsi qu'à des offres surprises réservées aux membres.",
      },
      {
        q: "Combien coûte l'abonnement Tok One ?",
        a: "L'abonnement Tok One est disponible à 9.90 CHF par mois ou 89.90 CHF par an. Une période d'essai peut être proposée avant la première facturation selon l'offre en cours.",
      },
      {
        q: "Comment résilier mon abonnement Tok One ?",
        a: "Rendez-vous dans \"Profil\" puis \"Mon abonnement\" pour gérer ou résilier Tok One. La résiliation prend effet à la fin de la période déjà réglée.",
      },
      {
        q: "Quels établissements sont éligibles aux avantages Tok One ?",
        a: "Les avantages Tok One apparaissent directement sur les fiches restaurants, les créneaux de réservation ou les offres concernées. Selon l'établissement, ils peuvent s'appliquer aux réservations, aux formules promo ou aux commandes à emporter.",
      },
      {
        q: "Puis-je partager mon abonnement Tok One ?",
        a: "Non. Tok One est lié à un seul compte utilisateur et ne peut pas être transféré. Chaque personne doit disposer de son propre abonnement pour profiter des avantages associés.",
      },
    ],
  },
] as const;

export default function Aide() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const normalizedSearch = search.toLowerCase();

  const filteredFaqs = FAQS
    .filter((section) => !selectedCat || section.category === selectedCat)
    .map((section) => ({
      ...section,
      questions: section.questions.filter(
        (item) =>
          item.q.toLowerCase().includes(normalizedSearch) ||
          item.a.toLowerCase().includes(normalizedSearch),
      ),
    }))
    .filter((section) => section.questions.length > 0);

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-primary px-6 pb-16 pt-20 text-primary-foreground">
        <div className="container max-w-4xl space-y-8">
          <h1 className="text-center font-display text-4xl font-bold md:text-5xl">
            Comment pouvons-nous vous aider ?
          </h1>
          <p className="mx-auto max-w-2xl text-center text-lg text-primary-foreground/80">
            Trouvez rapidement une réponse sur vos réservations, vos retraits, vos offres et votre compte.
          </p>
          <div className="relative mx-auto max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une réservation, un retrait, une offre..."
              className="h-14 rounded-2xl border-0 pl-12 text-lg font-medium text-foreground shadow-lg"
            />
          </div>
        </div>
      </div>

      <div className="container -mt-8 max-w-5xl space-y-12 px-6">
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
              className={`space-y-3 rounded-2xl border bg-card p-6 text-left shadow-sm transition-all ${
                selectedCat === cat.id ? "border-transparent ring-2 ring-primary" : "hover:border-primary/20"
              }`}
            >
              <div className={`${cat.bg} w-fit rounded-xl p-3`}>
                <cat.icon className={`h-6 w-6 ${cat.color}`} />
              </div>
              <h3 className="text-sm font-bold">{cat.title}</h3>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 gap-12 md:grid-cols-3">
          <div className="space-y-8 md:col-span-2">
            <h2 className="text-2xl font-display font-bold">
              {selectedCat ? CATEGORIES.find((category) => category.id === selectedCat)?.title : "Questions fréquentes"}
            </h2>

            <div className="space-y-4">
              {filteredFaqs.map((section) => (
                <div key={section.category} className="space-y-4">
                  {!selectedCat && (
                    <h3 className="pt-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {CATEGORIES.find((category) => category.id === section.category)?.title}
                    </h3>
                  )}
                  <Accordion type="single" collapsible className="w-full">
                    {section.questions.map((item, index) => (
                      <AccordionItem
                        key={index}
                        value={`${section.category}-${index}`}
                        className="mb-3 rounded-xl border bg-card px-4 py-1 shadow-sm"
                      >
                        <AccordionTrigger className="text-left font-semibold hover:no-underline">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-sm leading-relaxed text-muted-foreground">
                          {item.a}
                        </AccordionContent>
                      </AccordionItem>
                    ))}
                  </Accordion>
                </div>
              ))}
            </div>

            {filteredFaqs.length === 0 && (
              <div className="space-y-2 rounded-2xl border-2 border-dashed bg-muted/20 py-12 text-center text-muted-foreground">
                <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">Aucun résultat trouvé</p>
                <p className="text-sm">Essayez avec d'autres mots-clés ou contactez notre support.</p>
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="space-y-4 rounded-2xl border bg-primary/5 p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <MessageSquare className="h-5 w-5 text-primary" />
                Dépannage en direct
              </h3>
              <p className="text-sm text-muted-foreground">
                Si vous avez un problème urgent avec une réservation du jour ou un retrait en cours, utilisez notre chat interactif.
              </p>
              <Button className="w-full gap-2 rounded-xl font-bold" onClick={() => window.openChat?.()}>
                Ouvrir le chat
              </Button>
            </div>

            <div className="space-y-4 rounded-2xl border p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <Mail className="h-5 w-5 text-muted-foreground" />
                Nous contacter
              </h3>
              <div className="space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">support@tok.ch</p>
                    <p className="text-xs text-muted-foreground">Réponse sous 24h</p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Téléphone</p>
                    <p className="text-xs text-muted-foreground">0800 MIAMZ (64269)</p>
                    <p className="text-xs text-muted-foreground">Lun-Ven, 9h-21h</p>
                  </div>
                </div>
              </div>

              <Link to="/contact">
                <Button variant="outline" className="mt-2 w-full gap-2 rounded-xl font-bold">
                  Page de contact <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="space-y-4 rounded-2xl border p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                Liens utiles
              </h3>
              <div className="space-y-2">
                <Link to="/cgu" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Conditions générales <ChevronRight className="h-4 w-4" />
                </Link>
                <Link to="/a-propos" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  À propos de Tok <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
