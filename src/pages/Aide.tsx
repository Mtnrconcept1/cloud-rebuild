import { useState } from "react";
import { Search, ChevronRight, ShoppingBag, User, CreditCard, ShieldCheck, Truck, HelpCircle, MessageSquare, Mail, Phone } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Link } from "react-router-dom";

declare global {
    interface Window {
        openChat?: () => void;
    }
}

const CATEGORIES = [
    { id: "orders", title: "Mes Commandes", icon: ShoppingBag, color: "text-green-600", bg: "bg-green-50" },
    { id: "account", title: "Compte & Paiement", icon: User, icon2: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
    { id: "membership", title: "Tok One", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50" },
    { id: "delivery", title: "Livraison", icon: Truck, color: "text-amber-600", bg: "bg-amber-50" },
];

const FAQS = [
    {
        category: "orders",
        questions: [
            { q: "Où est ma commande ?", a: "Vous pouvez suivre votre commande en temps réel depuis l'onglet 'Commandes' de votre profil. Une fois le livreur en route, vous verrez sa position sur la carte. Vous recevrez aussi des notifications à chaque étape (préparation, en route, arrivée)." },
            { q: "Comment annuler une commande ?", a: "L'annulation est possible tant que le restaurant n'a pas commencé la préparation. Rendez-vous dans les détails de votre commande et appuyez sur 'Annuler la commande'. Si l'option n'apparaît plus, le restaurant a déjà débuté la préparation et l'annulation n'est plus possible." },
            { q: "Il manque un article dans ma commande", a: "Nous en sommes désolés. Signalez le problème via le chat de support ou contactez-nous directement à support@tok.ch. Après vérification auprès du restaurant, un remboursement partiel ou un crédit Tok sera appliqué sous 48h." },
            { q: "Comment modifier ma commande après validation ?", a: "Une modification est possible uniquement dans les premières minutes suivant la validation, avant que le restaurant ne commence la préparation. Accédez aux détails de votre commande pour voir si l'option 'Modifier' est encore disponible." },
            { q: "Comment utiliser un code promo ?", a: "Lors du récapitulatif de commande, appuyez sur 'Ajouter un code promo' et saisissez votre code. La réduction sera appliquée automatiquement au montant total. Les codes promos ne sont pas cumulables sauf mention contraire." },
            { q: "Je souhaite demander un remboursement", a: "Rendez-vous dans l'historique de vos commandes, sélectionnez la commande concernée, puis appuyez sur 'Signaler un problème'. Décrivez le souci rencontré et notre équipe traitera votre demande sous 48h ouvrées. Le remboursement sera effectué sur votre moyen de paiement d'origine ou en crédit Tok." },
            { q: "Puis-je repasser la même commande ?", a: "Oui ! Depuis votre historique de commandes, appuyez sur 'Commander à nouveau' sur n'importe quelle commande passée. Le panier sera pré-rempli avec les mêmes articles (sous réserve de disponibilité au restaurant)." },
        ]
    },
    {
        category: "account",
        questions: [
            { q: "Comment créer un compte ?", a: "Appuyez sur 'S'inscrire' depuis l'écran de connexion. Vous pouvez créer un compte avec votre email ou vous connecter directement via Google ou Apple. Un email de vérification vous sera envoyé pour confirmer votre adresse." },
            { q: "Comment changer mon mode de paiement ?", a: "Allez dans 'Profil' > 'Moyens de paiement' pour ajouter, modifier ou supprimer vos cartes bancaires. Nous acceptons Visa, Mastercard, TWINT, Apple Pay et Google Pay." },
            { q: "Réinitialiser mon mot de passe", a: "Cliquez sur 'Mot de passe oublié' sur la page de connexion. Saisissez votre email et vous recevrez un lien de réinitialisation valable 24 heures. Si vous ne recevez pas l'email, vérifiez vos spams ou contactez le support." },
            { q: "Comment modifier mes informations personnelles ?", a: "Rendez-vous dans 'Profil' > 'Informations personnelles' pour modifier votre nom, email, numéro de téléphone ou adresse de livraison par défaut. Certaines modifications peuvent nécessiter une vérification par email." },
            { q: "Comment supprimer mon compte ?", a: "Vous pouvez demander la suppression de votre compte depuis 'Profil' > 'Paramètres' > 'Supprimer mon compte'. Cette action est irréversible et entraîne la perte de vos points de fidélité, crédits et historique de commandes. La suppression sera effective sous 30 jours." },
            { q: "Mes paiements sont-ils sécurisés ?", a: "Absolument. Tous les paiements sont traités par des prestataires certifiés PCI-DSS. Vos informations bancaires ne sont jamais stockées sur nos serveurs. Chaque transaction est protégée par un chiffrement SSL 256 bits." },
            { q: "Comment ajouter une adresse de livraison ?", a: "Depuis 'Profil' > 'Adresses', appuyez sur 'Ajouter une adresse'. Vous pouvez saisir votre adresse manuellement ou utiliser la géolocalisation. Vous pouvez enregistrer plusieurs adresses (domicile, bureau, etc.) et définir une adresse par défaut." },
        ]
    },
    {
        category: "membership",
        questions: [
            { q: "Quels sont les avantages de Tok One ?", a: "Tok One vous offre : la livraison gratuite sur tous les restaurants éligibles (sans minimum de commande), des réductions exclusives allant jusqu'à 20%, un accès prioritaire aux Chef's Tables et événements gastronomiques, un support client prioritaire, et des offres surprises régulières." },
            { q: "Combien coûte l'abonnement Tok One ?", a: "L'abonnement Tok One est disponible à 9.90 CHF/mois ou 89.90 CHF/an (soit 2 mois offerts). Vous pouvez essayer gratuitement pendant 14 jours avant d'être facturé." },
            { q: "Comment résilier mon abonnement Tok One ?", a: "Rendez-vous dans 'Profil' > 'Mon abonnement' > 'Gérer l'abonnement' > 'Résilier'. La résiliation prend effet à la fin de la période en cours, et vous conservez vos avantages jusqu'à cette date. Aucun remboursement partiel n'est effectué." },
            { q: "Quels restaurants sont éligibles à la livraison gratuite ?", a: "La grande majorité de nos restaurants partenaires sont éligibles à la livraison gratuite avec Tok One. Les restaurants éligibles sont identifiés par un badge 'Livraison gratuite' sur leur fiche. Quelques exceptions peuvent s'appliquer pour les restaurants très éloignés." },
            { q: "Puis-je partager mon abonnement Tok One ?", a: "L'abonnement Tok One est personnel et lié à un seul compte. Il ne peut pas être partagé ou transféré. Cependant, chaque membre de votre foyer peut souscrire à son propre abonnement." },
        ]
    },
    {
        category: "delivery",
        questions: [
            { q: "Quels sont les délais de livraison ?", a: "Les délais de livraison varient en général entre 20 et 45 minutes selon la distance, le restaurant et les conditions de circulation. Le délai estimé est affiché avant la validation de votre commande et mis à jour en temps réel pendant la livraison." },
            { q: "Quelles sont les zones de livraison ?", a: "Tok livre actuellement dans les principales villes de Suisse romande. La disponibilité est vérifiée automatiquement lorsque vous saisissez votre adresse. Si votre zone n'est pas encore couverte, vous pouvez vous inscrire pour être notifié de son ouverture." },
            { q: "Les frais de livraison sont-ils fixes ?", a: "Les frais de livraison varient entre 2.90 CHF et 6.90 CHF selon la distance entre le restaurant et votre adresse. Ils sont clairement affichés avant validation. Les abonnés Tok One bénéficient de la livraison gratuite sur les restaurants éligibles." },
            { q: "Je ne suis pas chez moi, que se passe-t-il ?", a: "Le livreur tentera de vous contacter par téléphone. Si vous êtes injoignable, il attendra 5 minutes maximum sur place. Passé ce délai, la commande sera considérée comme livrée. Pensez à ajouter des instructions de livraison (code d'entrée, étage, etc.) dans votre profil." },
            { q: "Puis-je programmer une livraison à l'avance ?", a: "Oui ! Lors de la commande, sélectionnez l'option 'Programmer' au lieu de 'Dès que possible'. Vous pouvez planifier une livraison jusqu'à 7 jours à l'avance, sous réserve de la disponibilité du restaurant." },
            { q: "Comment fonctionne le click & collect ?", a: "Sélectionnez l'option 'À emporter' lors de votre commande. Choisissez l'heure de retrait souhaitée. Vous recevrez une notification lorsque votre commande sera prête. Présentez-vous au restaurant avec votre numéro de commande pour récupérer votre repas." },
            { q: "Mon livreur ne trouve pas mon adresse", a: "Assurez-vous que votre adresse est correcte et complète dans votre profil. Ajoutez des instructions de livraison détaillées (numéro de bâtiment, code d'entrée, étage, interphone). Si le livreur est en difficulté, il vous contactera directement par téléphone." },
        ]
    }
];

export default function Aide() {
    const [search, setSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState<string | null>(null);

    const filteredFaqs = FAQS.filter(f => !selectedCat || f.category === selectedCat)
        .map(section => ({
            ...section,
            questions: section.questions.filter(q =>
                q.q.toLowerCase().includes(search.toLowerCase()) ||
                q.a.toLowerCase().includes(search.toLowerCase())
            )
        }))
        .filter(section => section.questions.length > 0);

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header / Search Section */}
            <div className="bg-primary pt-20 pb-16 text-primary-foreground px-6">
                <div className="container max-w-4xl space-y-8">
                    <h1 className="text-4xl md:text-5xl font-display font-bold text-center">Comment pouvons-nous vous aider ?</h1>
                    <p className="text-center text-primary-foreground/80 text-lg max-w-2xl mx-auto">
                        Trouvez rapidement une réponse à votre question ou contactez notre équipe de support.
                    </p>
                    <div className="relative max-w-2xl mx-auto">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher un problème ou une question..."
                            className="h-14 pl-12 rounded-2xl text-foreground font-medium border-0 shadow-lg text-lg"
                        />
                    </div>
                </div>
            </div>

            <div className="container max-w-5xl -mt-8 px-6 space-y-12">
                {/* Quick Categories */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat.id}
                            onClick={() => setSelectedCat(selectedCat === cat.id ? null : cat.id)}
                            className={`p-6 rounded-2xl border bg-card shadow-sm transition-all text-left space-y-3
                ${selectedCat === cat.id ? "ring-2 ring-primary border-transparent" : "hover:border-primary/20"}`}
                        >
                            <div className={`${cat.bg} p-3 rounded-xl w-fit`}>
                                <cat.icon className={`h-6 w-6 ${cat.color}`} />
                            </div>
                            <h3 className="font-bold text-sm">{cat.title}</h3>
                        </button>
                    ))}
                </div>

                {/* Content Section */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
                    {/* FAQ List */}
                    <div className="md:col-span-2 space-y-8">
                        <h2 className="text-2xl font-display font-bold">
                            {selectedCat ? CATEGORIES.find(c => c.id === selectedCat)?.title : "Questions fréquentes"}
                        </h2>
                        <div className="space-y-4">
                            {filteredFaqs.map((section) => (
                                <div key={section.category} className="space-y-4">
                                    {!selectedCat && (
                                        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2">
                                            {CATEGORIES.find(c => c.id === section.category)?.title}
                                        </h3>
                                    )}
                                    <Accordion type="single" collapsible className="w-full">
                                        {section.questions.map((item, i) => (
                                            <AccordionItem key={i} value={`${section.category}-${i}`} className="border rounded-xl px-4 py-1 mb-3 bg-card shadow-sm">
                                                <AccordionTrigger className="hover:no-underline font-semibold text-left">
                                                    {item.q}
                                                </AccordionTrigger>
                                                <AccordionContent className="text-muted-foreground text-sm leading-relaxed">
                                                    {item.a}
                                                </AccordionContent>
                                            </AccordionItem>
                                        ))}
                                    </Accordion>
                                </div>
                            ))}
                        </div>
                        {filteredFaqs.length === 0 && (
                            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-2xl border-2 border-dashed space-y-2">
                                <HelpCircle className="h-10 w-10 mx-auto text-muted-foreground/50" />
                                <p className="font-medium">Aucun résultat trouvé</p>
                                <p className="text-sm">Essayez avec d'autres mots-clés ou contactez notre support.</p>
                            </div>
                        )}
                    </div>

                    {/* Sidebar / More Help */}
                    <div className="space-y-6">
                        <div className="p-6 rounded-2xl border bg-primary/5 space-y-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <MessageSquare className="h-5 w-5 text-primary" />
                                Dépannage en direct
                            </h3>
                            <p className="text-sm text-muted-foreground">
                                Si vous avez un problème urgent avec une commande en cours, utilisez notre chat interactif.
                            </p>
                            <Button className="w-full rounded-xl gap-2 font-bold" onClick={() => window.openChat && window.openChat()}>
                                Ouvrir le chat
                            </Button>
                        </div>

                        <div className="p-6 rounded-2xl border space-y-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <Mail className="h-5 w-5 text-muted-foreground" />
                                Nous contacter
                            </h3>
                            <div className="space-y-3">
                                <div className="flex items-start gap-3">
                                    <Mail className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium">Email</p>
                                        <p className="text-xs text-muted-foreground">support@tok.ch</p>
                                        <p className="text-xs text-muted-foreground">Réponse sous 24h</p>
                                    </div>
                                </div>
                                <div className="flex items-start gap-3">
                                    <Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                                    <div>
                                        <p className="text-sm font-medium">Téléphone</p>
                                        <p className="text-xs text-muted-foreground">0800 MIAMZ (64269)</p>
                                        <p className="text-xs text-muted-foreground">Lun-Ven, 9h-21h</p>
                                    </div>
                                </div>
                            </div>
                            <Link to="/contact">
                                <Button variant="outline" className="w-full rounded-xl gap-2 font-bold mt-2">
                                    Page de contact <ChevronRight className="h-4 w-4" />
                                </Button>
                            </Link>
                        </div>

                        <div className="p-6 rounded-2xl border space-y-4">
                            <h3 className="font-bold flex items-center gap-2">
                                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                                Liens utiles
                            </h3>
                            <div className="space-y-2">
                                <Link to="/cgu" className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline">
                                    Conditions générales <ChevronRight className="h-4 w-4" />
                                </Link>
                                <Link to="/a-propos" className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline">
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