import { useState } from "react";
import { Search, ChevronRight, ShoppingBag, User, CreditCard, ShieldCheck, Truck, HelpCircle, MessageSquare } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

declare global {
    interface Window {
        openChat?: () => void;
    }
}

const CATEGORIES = [
    { id: "orders", title: "Mes Commandes", icon: ShoppingBag, color: "text-green-600", bg: "bg-green-50" },
    { id: "account", title: "Compte & Paiement", icon: User, icon2: CreditCard, color: "text-blue-600", bg: "bg-blue-50" },
    { id: "membership", title: "Miamz One", icon: ShieldCheck, color: "text-violet-600", bg: "bg-violet-50" },
    { id: "delivery", title: "Livraison", icon: Truck, color: "text-amber-600", bg: "bg-amber-50" },
];

const FAQS = [
    {
        category: "orders",
        questions: [
            { q: "Où est ma commande ?", a: "Vous pouvez suivre votre commande en temps réel depuis l'onglet 'Commandes' de votre profil. Une fois le livreur en route, vous verrez sa position sur la carte." },
            { q: "Comment annuler une commande ?", a: "L'annulation est possible tant que le restaurant n'a pas commencé la préparation. Rendez-vous dans les détails de votre commande pour voir si l'option est disponible." },
            { q: "Il manque un article dans ma commande", a: "Nous en sommes désolés. Signalez le problème via le chat de support ou contactez-nous directement pour obtenir un remboursement partiel." }
        ]
    },
    {
        category: "account",
        questions: [
            { q: "Comment changer mon mode de paiement ?", a: "Allez dans 'Profil' > 'Paramètres' pour ajouter ou supprimer vos cartes bancaires." },
            { q: "Réinitialiser mon mot de passe", a: "Cliquez sur 'Mot de passe oublié' sur la page de connexion pour recevoir un lien de réinitialisation par email." }
        ]
    },
    {
        category: "membership",
        questions: [
            { q: "Quels sont les avantages de Miamz One ?", a: "Frais de livraison offerts sur les restaurants partenaires, réductions exclusives et accès prioritaire aux Chef's Tables." }
        ]
    }
];

export default function Aide() {
    const [search, setSearch] = useState("");
    const [selectedCat, setSelectedCat] = useState<string | null>(null);

    const filteredFaqs = FAQS.filter(f => !selectedCat || f.category === selectedCat);

    return (
        <div className="min-h-screen bg-background pb-20">
            {/* Header / Search Section */}
            <div className="bg-primary pt-20 pb-16 text-primary-foreground px-6">
                <div className="container max-w-4xl space-y-8">
                    <h1 className="text-4xl md:text-5xl font-display font-bold text-center">Comment pouvons-nous vous aider ?</h1>
                    <div className="relative max-w-2xl mx-auto">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
                        <Input
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Rechercher un problème..."
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
                                    <Accordion type="single" collapsible className="w-full">
                                        {section.questions.filter(q => q.q.toLowerCase().includes(search.toLowerCase())).map((item, i) => (
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
                            <div className="text-center py-12 text-muted-foreground bg-muted/20 rounded-2xl border-2 border-dashed">
                                Aucun résultat trouvé pour votre recherche.
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
                                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                                Plus d'options
                            </h3>
                            <div className="space-y-1">
                                <Button variant="link" className="p-0 h-auto text-primary text-sm font-semibold hover:no-underline flex items-center gap-1">
                                    Voir toutes les catégories <ChevronRight className="h-4 w-4" />
                                </Button>
                                <p className="text-xs text-muted-foreground">Consultez notre guide complet d'utilisation pour les nouveaux gourmets.</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
