import { useEffect, useMemo, useRef, useState } from "react";
import {
  BadgePercent,
  Bell,
  CalendarDays,
  ChevronRight,
  CreditCard,
  Gift,
  HeartHandshake,
  HelpCircle,
  Leaf,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  ReceiptText,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Star,
  Store,
  Truck,
  User,
  UtensilsCrossed,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";

import TokAiSupportChat from "@/components/support/TokAiSupportChat";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SUPPORT_EMAIL } from "@/lib/contact";
import { useFeatureFlagSnapshot } from "@/lib/featureFlags";
import { isHelpCategoryVisible, isHelpQuestionVisible } from "@/lib/featureVisibility";
import type { HelpChatOpenOptions } from "@/lib/helpChat";

declare global {
  interface Window {
    openChat?: (options?: HelpChatOpenOptions) => void;
  }
}

type HelpCategory = {
  id: string;
  title: string;
  description: string;
  icon: typeof HelpCircle;
  color: string;
  bg: string;
};

type FaqItem = {
  q: string;
  a: string;
};

type FaqSection = {
  category: string;
  questions: FaqItem[];
};

const CATEGORIES: HelpCategory[] = [
  {
    id: "getting-started",
    title: "Premiers pas",
    description: "Créer son compte, chercher un restaurant, comprendre TOK.",
    icon: Smartphone,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  {
    id: "orders",
    title: "Commandes",
    description: "Panier, validation, suivi, annulation et problèmes.",
    icon: ShoppingBag,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    id: "account",
    title: "Compte & paiement",
    description: "Connexion, cartes, factures, sécurité et données.",
    icon: CreditCard,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "delivery",
    title: "Livraison & retrait",
    description: "Adresse, retrait à emporter, retards et créneaux.",
    icon: Truck,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    id: "reservations",
    title: "Réservations",
    description: "Tables, modifications, no-show et expériences premium.",
    icon: CalendarDays,
    color: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    id: "features",
    title: "Fonctionnalités",
    description: "Multi-restaurant, groupes, abonnements repas et options.",
    icon: Zap,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    id: "offers",
    title: "Promos & offres",
    description: "Codes promo, ventes flash, anti-gaspi et bons plans.",
    icon: BadgePercent,
    color: "text-red-600",
    bg: "bg-red-50",
  },
  {
    id: "social",
    title: "Actualités",
    description: "Posts, vidéos, commentaires, recommandations et signalements.",
    icon: MessageSquare,
    color: "text-cyan-600",
    bg: "bg-cyan-50",
  },
  {
    id: "antigaspi",
    title: "Anti-gaspi",
    description: "Paniers surprise, dons solidaires et impact écologique.",
    icon: Leaf,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    id: "membership",
    title: "Tok One",
    description: "Abonnement, livraison offerte, avantages et résiliation.",
    icon: ShieldCheck,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    id: "loyalty",
    title: "Miamz & cadeaux",
    description: "Points, niveaux, bonus, cadeaux et fidélité.",
    icon: Star,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  {
    id: "quality",
    title: "Qualité & sécurité",
    description: "Hygiène, remboursement, abus, confidentialité et litiges.",
    icon: ShieldCheck,
    color: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    id: "restaurants",
    title: "Restaurateurs",
    description: "Inscription, dashboard, commandes, campagnes et facturation.",
    icon: Store,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
  {
    id: "tok-connect",
    title: "TOK Connect",
    description: "API, OAuth, MCP, webhooks et accès partenaires.",
    icon: ShieldCheck,
    color: "text-slate-700",
    bg: "bg-slate-100",
  },
];

const URGENT_CASES = [
  "Commande en cours non reçue, livreur bloqué ou adresse incorrecte.",
  "Paiement débité sans confirmation visible dans l'application.",
  "Article manquant, plat renversé, allergène ou problème de sécurité alimentaire.",
  "Réservation ce soir à modifier, retard important ou impossibilité de venir.",
];

const FAQS: FaqSection[] = [
  {
    category: "getting-started",
    questions: [
      {
        q: "Qu'est-ce que TOK ?",
        a: "TOK est une plateforme suisse pour commander, réserver, découvrir des restaurants, suivre des offres locales, gagner des Miamz et profiter de services restaurateurs. L'objectif est de simplifier le réflexe food tout en donnant plus de valeur aux restaurants locaux.",
      },
      {
        q: "Comment commencer si je découvre l'application ?",
        a: "Commencez par saisir votre ville, votre adresse ou votre position approximative. Parcourez les restaurants, les catégories, les offres et les posts Actualités. Quand un restaurant vous intéresse, ouvrez sa fiche pour voir son menu, ses horaires, ses modes de service, ses avis, ses offres et ses options de réservation ou commande.",
      },
      {
        q: "Dois-je créer un compte pour utiliser TOK ?",
        a: "Vous pouvez explorer une partie de l'application sans compte. Pour commander, réserver, sauvegarder des restaurants, commenter, recevoir des notifications, gagner des Miamz ou suivre une commande, un compte est nécessaire afin de sécuriser vos informations et l'historique.",
      },
      {
        q: "Comment savoir si TOK est disponible dans ma zone ?",
        a: "Saisissez votre adresse dans la recherche ou dans le panier. L'application vérifie automatiquement les restaurants qui livrent chez vous, ceux disponibles en retrait et les offres proches. Si aucune livraison n'est disponible, le retrait à emporter ou les réservations peuvent rester accessibles selon les restaurants.",
      },
      {
        q: "Pourquoi certains restaurants ou boutons ne s'affichent pas ?",
        a: "Les restaurants et fonctionnalités dépendent de votre zone, des horaires, du mode de service, du stock, des disponibilités et des fonctionnalités activées par TOK. Si une fonctionnalité est désactivée par la plateforme, elle doit disparaître de l'interface plutôt que rester visible mais inutilisable.",
      },
      {
        q: "Comment rechercher rapidement un restaurant ou un plat ?",
        a: "Utilisez la barre de recherche avec un nom de restaurant, une cuisine, un plat, un hashtag, une ville ou une envie simple comme pizza, sushi, halal, burger, terrasse, dessert ou déjeuner. Vous pouvez ensuite filtrer par distance, horaires, livraison, retrait, offres, avis ou préférences.",
      },
      {
        q: "Que signifient les badges visibles sur les restaurants ?",
        a: "Les badges donnent des signaux rapides : type de cuisine, restaurant suivi, offre active, vente flash, anti-gaspi, nouveauté, clients proches, sponsorisé, ouvert en ligne, livraison, retrait ou réservation. Ils servent à comprendre pourquoi un restaurant ou un post remonte dans votre expérience.",
      },
      {
        q: "Comment choisir entre livraison, retrait et réservation ?",
        a: "La livraison sert à recevoir votre repas à l'adresse choisie. Le retrait à emporter vous permet de commander et récupérer au restaurant à une heure donnée. La réservation sert à bloquer une table, parfois avec des options premium comme Zéro Attente ou La Table du Chef si elles sont disponibles.",
      },
      {
        q: "Que faire si l'application semble bloquée ou n'affiche pas les données ?",
        a: "Actualisez la page, vérifiez votre connexion, désactivez temporairement les bloqueurs trop agressifs, reconnectez-vous si nécessaire et essayez de vider le cache du navigateur. Si le problème touche une commande, une réservation ou un paiement, contactez le support avec une capture et l'heure exacte.",
      },
      {
        q: "TOK est-il une marketplace ou le restaurant reste-t-il responsable de ses plats ?",
        a: "TOK facilite la découverte, la commande, le paiement, le suivi, la fidélité et certains outils opérationnels. Le restaurant reste responsable de la préparation, de la qualité des plats, des informations de menu, des allergènes déclarés et des horaires qu'il configure.",
      },
    ],
  },
  {
    category: "orders",
    questions: [
      {
        q: "Comment passer une commande ?",
        a: "Ouvrez la fiche du restaurant, choisissez vos plats, options et quantités, puis ajoutez-les au panier. Dans le panier, vérifiez le restaurant, le mode de service, l'adresse ou l'heure de retrait, les frais, les réductions, le total et le moyen de paiement. La commande est transmise au restaurant uniquement après validation du paiement lorsque le mode choisi l'exige.",
      },
      {
        q: "Quand ma commande est-elle vraiment confirmée ?",
        a: "Pour les paiements par carte ou par TWINT lorsqu’il est proposé, la commande ne doit être confirmée qu’après confirmation du paiement. Avant cela, elle peut être en attente, en création ou en échec. Si vous recevez une notification de confirmation mais que le paiement échoue, contactez le support : c'est un cas à vérifier immédiatement.",
      },
      {
        q: "Où suivre ma commande ?",
        a: "Rendez-vous dans Mes commandes ou ouvrez la notification reçue. Vous verrez les étapes disponibles : commande créée, paiement confirmé, acceptée par le restaurant, en préparation, prête, prise en charge, en livraison, livrée, annulée ou remboursée selon le cas.",
      },
      {
        q: "Pourquoi le restaurant doit-il accepter la commande ?",
        a: "Même si le paiement est autorisé, le restaurant peut devoir confirmer sa capacité à préparer la commande selon ses horaires, son stock et son volume. Si le restaurant refuse ou ne répond pas dans le délai prévu, TOK doit annuler ou relancer le flux et vous informer clairement.",
      },
      {
        q: "Puis-je modifier une commande après paiement ?",
        a: "C'est possible uniquement très tôt, avant le début de préparation et selon la réponse du restaurant. Contactez le support depuis la commande. Une fois la préparation lancée, il faut généralement passer une nouvelle commande ou traiter la demande comme un cas support.",
      },
      {
        q: "Comment annuler une commande ?",
        a: "Ouvrez la commande et utilisez l'action d'annulation si elle est disponible. Elle disparaît lorsque la préparation est trop avancée ou que le restaurant a déjà engagé des coûts. Si le bouton n'est plus visible, contactez le support : l'équipe vérifiera si une annulation exceptionnelle est possible.",
      },
      {
        q: "J'ai été débité mais la commande n'apparaît pas",
        a: `Attendez une minute puis vérifiez Mes commandes. Si aucune commande n'apparaît, contactez le support avec l'heure, le montant, le moyen de paiement et si possible une capture de la transaction. Écrivez aussi à ${SUPPORT_EMAIL} si le chat n'est pas disponible. Le paiement sera rapproché et remboursé si aucune commande valide n'existe.`,
      },
      {
        q: "Le restaurant a annulé ma commande, que se passe-t-il ?",
        a: "Vous êtes notifié et le paiement est annulé ou remboursé selon son état. Une autorisation bancaire peut disparaître en quelques jours, tandis qu'un remboursement confirmé peut prendre 5 à 10 jours ouvrables selon la banque. TOK peut proposer une alternative ou un crédit selon la situation.",
      },
      {
        q: "Il manque un article dans ma commande",
        a: `Signalez le problème depuis la commande avec le nom de l'article manquant. Ajoutez une photo du reçu ou du sac si possible. TOK vérifie avec le restaurant et propose selon le cas un remboursement partiel, un crédit ou une solution commerciale. Pour un traitement rapide, indiquez le numéro de commande à ${SUPPORT_EMAIL}.`,
      },
      {
        q: "J'ai reçu le mauvais plat",
        a: "Ne jetez pas immédiatement l'emballage si une preuve est nécessaire. Prenez une photo du plat reçu, du ticket et du numéro de commande, puis ouvrez un ticket. Si un allergène ou une restriction alimentaire est concerné, indiquez-le en priorité : ces cas sont traités comme sensibles.",
      },
      {
        q: "Puis-je commander à nouveau la même chose ?",
        a: "Oui, ouvrez l'historique, sélectionnez la commande et utilisez Commander à nouveau si l'action existe. Le panier est reconstruit avec les articles encore disponibles. Les prix, stocks, frais et promotions peuvent être différents de la commande d'origine.",
      },
      {
        q: "Pourquoi mon total a-t-il changé entre le menu et le panier ?",
        a: "Le total final peut inclure options, suppléments, consigne, frais de service, livraison, réductions, code promo, Miamz, taxes applicables ou frais liés au mode de paiement. Le panier est la source d'affichage la plus complète avant paiement.",
      },
      {
        q: "Pourquoi un plat devient indisponible pendant que je commande ?",
        a: "Les stocks et horaires peuvent changer en temps réel. Un plat peut être retiré si le restaurant le marque indisponible, si une vente flash est terminée, si l'horaire de service change ou si le stock restant est réservé par d'autres clients.",
      },
      {
        q: "Comment gérer les allergies ou restrictions alimentaires ?",
        a: "Lisez les informations allergènes affichées sur le plat et utilisez les instructions lorsque le restaurant les accepte. Pour une allergie sévère, contactez directement le restaurant avant de commander. TOK ne peut pas garantir l'absence de contamination croisée si le restaurant ne la confirme pas explicitement.",
      },
      {
        q: "Puis-je ajouter un pourboire ?",
        a: "Si le pourboire est disponible, il apparaît dans le panier ou après livraison. Le montant doit être clair avant validation. Si l'option n'apparaît pas, elle n'est pas active pour ce restaurant, ce mode de service ou cette zone.",
      },
      {
        q: "Comment utiliser une note pour le restaurant ?",
        a: "Ajoutez une instruction courte, utile et réaliste : sans oignon, sauce à part, cuisson, couverts, nom à l'accueil. Les demandes non garanties, les changements de prix ou les ajouts payants ne peuvent pas toujours être acceptés via une note.",
      },
      {
        q: "Que faire si la commande est indiquée livrée mais que je n'ai rien reçu ?",
        a: "Vérifiez l'adresse, le hall, la réception, le voisinage immédiat et vos appels manqués. Contactez ensuite le support avec votre numéro de commande. TOK vérifie l'heure de livraison, les messages, le suivi et les preuves disponibles avant de statuer.",
      },
    ],
  },
  {
    category: "account",
    questions: [
      {
        q: "Comment créer un compte ?",
        a: "Utilisez l'inscription par email ou un fournisseur compatible comme Google ou Apple lorsqu'il est activé. Confirmez votre email si demandé. Ajoutez ensuite votre nom, prénom, téléphone et adresses pour accélérer les commandes et réservations.",
      },
      {
        q: "Quels moyens de paiement sont acceptés ?",
        a: "TOK accepte les cartes bancaires et propose TWINT sur les paiements ponctuels CHF compatibles. Les abonnements et les paiements avec autorisation puis capture différée, comme Match Group, nécessitent une carte. Apple Pay, Google Pay ou un autre moyen ne sont disponibles que s’ils apparaissent effectivement dans le parcours Stripe. Les moyens visibles dans le panier sont ceux réellement disponibles pour votre commande, votre zone et le restaurant choisi.",
      },
      {
        q: "Pourquoi un moyen de paiement n'apparaît pas ?",
        a: "Il peut être indisponible pour ce montant, ce type d'achat, le pays, le navigateur, le restaurant, l'environnement ou la configuration Stripe. Utilisez un autre moyen de paiement visible ou contactez le support si un moyen annoncé ne s'affiche jamais.",
      },
      {
        q: "Comment changer ou supprimer une carte ?",
        a: "Allez dans Profil, Moyens de paiement ou dans le portail de paiement si disponible. Vous pouvez ajouter, choisir par défaut ou retirer une carte. Une carte associée à un abonnement actif peut demander un remplacement avant suppression.",
      },
      {
        q: "Mes informations bancaires sont-elles stockées par TOK ?",
        a: "TOK ne doit pas stocker vos numéros de carte complets. Les paiements sont traités par des prestataires sécurisés. L'application conserve uniquement les références techniques nécessaires au suivi, à la facturation, au remboursement ou à l'abonnement.",
      },
      {
        q: "Comment récupérer une facture ou un reçu ?",
        a: "Ouvrez la commande, la réservation payée ou l'abonnement concerné. Les reçus disponibles indiquent le montant, la date, le restaurant, le moyen de paiement et les frais. Si vous avez besoin d'un justificatif spécifique, contactez le support avec la référence.",
      },
      {
        q: "Comment modifier mon email ou mon téléphone ?",
        a: "Ouvrez Profil puis Informations personnelles. Une modification d'email ou de téléphone peut demander une vérification. Gardez un numéro joignable : il est essentiel pour les livreurs, restaurants et notifications urgentes.",
      },
      {
        q: "Je ne reçois pas l'email de connexion ou de réinitialisation",
        a: "Vérifiez les spams, l'orthographe de l'adresse et attendez quelques minutes. Essayez de demander un nouveau lien. Si rien n'arrive, contactez le support avec l'adresse concernée, sans envoyer de mot de passe.",
      },
      {
        q: "Comment réinitialiser mon mot de passe ?",
        a: `Depuis la page de connexion, utilisez Mot de passe oublié, saisissez votre email et ouvrez le lien reçu. Le lien est temporaire. Si vous ne recevez rien, vérifiez les spams puis contactez ${SUPPORT_EMAIL}.`,
      },
      {
        q: "Puis-je utiliser plusieurs rôles avec le même compte ?",
        a: "Un même utilisateur peut disposer de plusieurs rôles si TOK les lui attribue, par exemple client et restaurateur. Les données visibles changent selon le rôle actif. Les informations sensibles restent séparées par permissions et règles serveur.",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Depuis Profil ou Contact, demandez la suppression. Certaines données peuvent être conservées temporairement pour obligations légales, comptables, anti-fraude ou litiges. Les points, avantages, historiques personnels et préférences non nécessaires seront supprimés ou anonymisés selon les règles applicables.",
      },
      {
        q: "Pourquoi dois-je fournir mon téléphone ?",
        a: "Le téléphone sert aux situations opérationnelles : livreur qui ne trouve pas l'adresse, restaurant qui doit confirmer une précision, support urgent ou sécurité de compte. Il ne doit pas être utilisé pour du spam.",
      },
      {
        q: "Comment gérer mes notifications ?",
        a: "Ouvrez Profil ou Notifications. Vous pouvez généralement gérer les alertes de commande, réservation, offres, actualités, fidélité et support. Les notifications transactionnelles importantes peuvent rester nécessaires pour le bon fonctionnement du service.",
      },
      {
        q: "Que faire si je pense que mon compte a été utilisé par quelqu'un d'autre ?",
        a: "Changez immédiatement votre mot de passe, déconnectez les sessions si l'option existe, vérifiez vos moyens de paiement et contactez le support. Ne partagez jamais vos liens de connexion, codes ou emails de réinitialisation.",
      },
    ],
  },
  {
    category: "delivery",
    questions: [
      {
        q: "Quelle est la différence entre livraison et retrait à emporter ?",
        a: "En livraison, le repas est apporté à votre adresse. En retrait à emporter, vous choisissez une heure de retrait et récupérez la commande au restaurant. Le panier doit afficher Heure de retrait pour l'emporter, et Adresse pour la livraison.",
      },
      {
        q: "Comment choisir une heure de retrait ?",
        a: "Sélectionnez À emporter, choisissez la date et un créneau disponible. Les créneaux respectent les horaires du restaurant et sa capacité. Présentez-vous avec votre numéro de commande lorsque la commande est prête ou à l'heure prévue.",
      },
      {
        q: "Puis-je programmer une livraison à l'avance ?",
        a: "Oui si le restaurant accepte la programmation. Choisissez une date et un horaire dans le panier. La commande peut être transmise plus tard au restaurant selon le flux prévu, mais votre paiement et votre confirmation doivent rester cohérents avec le statut affiché.",
      },
      {
        q: "Comment les délais sont-ils estimés ?",
        a: "Les délais tiennent compte de la préparation, de la distance, du trafic, de la disponibilité des livreurs, du volume du restaurant et du mode de service. Une estimation reste indicative tant que le restaurant et la livraison n'ont pas confirmé les étapes clés.",
      },
      {
        q: "Que faire si le livreur ne trouve pas mon adresse ?",
        a: "Gardez votre téléphone disponible, ajoutez code d'entrée, étage, nom sur la sonnette et instructions précises. Si le livreur vous contacte, répondez rapidement. Une adresse imprécise peut provoquer du retard ou une livraison impossible.",
      },
      {
        q: "Puis-je modifier l'adresse après commande ?",
        a: "Seulement si la commande n'est pas trop avancée et si la nouvelle adresse reste dans la zone. Contactez le support immédiatement. Un changement d'adresse peut entraîner des frais ou être refusé si le restaurant ou le livreur ne peut pas suivre.",
      },
      {
        q: "Que sont les Créneaux Garantis ?",
        a: "Les Créneaux Garantis permettent de choisir une fenêtre de livraison plus précise avec une compensation prévue si le créneau n'est pas respecté. Les règles exactes, prix et compensations doivent être affichés avant validation.",
      },
      {
        q: "Comment fonctionne Flex Prix Bas ?",
        a: "Flex Prix Bas propose une remise en échange d'une fenêtre de livraison plus large. Plus vous êtes flexible, plus l'organisation peut optimiser les trajets et réduire les coûts. La remise et la fenêtre exacte sont affichées avant paiement.",
      },
      {
        q: "Je ne suis pas là au moment de la livraison",
        a: "Le livreur tente de vous joindre. Sans réponse, il peut attendre un temps limité et suivre la procédure prévue. Une commande alimentaire ne peut pas toujours être relivrée ou remboursée si l'adresse était correcte et que vous étiez absent.",
      },
      {
        q: "Puis-je demander une livraison sans contact ?",
        a: "Ajoutez une instruction claire dans l'adresse ou la note de livraison : déposer devant la porte, sonner puis partir, réception, hall. Pour des raisons de preuve ou de sécurité, le livreur peut tout de même devoir confirmer la remise.",
      },
      {
        q: "Pourquoi les frais de livraison changent-ils ?",
        a: "Ils peuvent varier selon distance, zone, demande, météo, disponibilité, restaurant, abonnement, promotion, commande groupée ou seuil de panier. Le montant final doit être visible avant paiement.",
      },
      {
        q: "Le retrait à emporter a du retard, que faire ?",
        a: "Présentez-vous au comptoir avec votre numéro. Si le restaurant annonce un retard important, ouvrez un ticket ou contactez le support. Le retrait dépend fortement de la charge du restaurant, surtout aux heures de pointe.",
      },
    ],
  },
  {
    category: "reservations",
    questions: [
      {
        q: "Comment réserver une table ?",
        a: "Ouvrez la fiche restaurant, choisissez Réserver, indiquez date, heure, nombre de personnes et coordonnées. Si le créneau est disponible, vous recevez une confirmation ou une demande en attente selon le fonctionnement du restaurant.",
      },
      {
        q: "Comment savoir si ma réservation est confirmée ?",
        a: "La confirmation apparaît dans Mes réservations et peut être envoyée par notification ou email. Vérifiez le statut : en attente, confirmée, modifiée, annulée, arrivée ou no-show selon le cas.",
      },
      {
        q: "Puis-je modifier une réservation ?",
        a: "Oui si le restaurant accepte la modification et si la capacité le permet. Ouvrez la réservation et modifiez l'heure, la date, le nombre de personnes ou les notes. Sinon, contactez le restaurant ou le support.",
      },
      {
        q: "Comment annuler une réservation ?",
        a: "Ouvrez Mes réservations et utilisez Annuler si l'action est disponible. Annulez dès que possible pour libérer la table. Les annulations tardives ou absences répétées peuvent limiter l'accès à certaines réservations.",
      },
      {
        q: "Qu'est-ce qu'un no-show ?",
        a: "Un no-show signifie que vous ne vous êtes pas présenté sans annuler. Cela pénalise le restaurant. Des no-shows répétés peuvent entraîner des restrictions de réservation ou l'obligation d'une garantie de paiement.",
      },
      {
        q: "Qu'est-ce que Zéro Attente ?",
        a: "Zéro Attente permet de réserver une table et de précommander certains plats afin de réduire l'attente sur place. Le paiement peut être demandé à l'avance. La réservation est confirmée uniquement lorsque les conditions affichées sont remplies, notamment le paiement si nécessaire.",
      },
      {
        q: "Puis-je venir en retard à une réservation ?",
        a: "Prévenez le restaurant dès que possible. Une tolérance peut exister mais n'est pas garantie. Après un certain retard, le restaurant peut libérer la table, surtout en service chargé.",
      },
      {
        q: "Comment ajouter une demande spéciale ?",
        a: "Utilisez le champ note : poussette, chaise bébé, anniversaire, terrasse, allergie, accès PMR, table calme. Les demandes sont transmises au restaurant mais restent soumises à disponibilité.",
      },
      {
        q: "Qu'est-ce que La Table du Chef ?",
        a: "La Table du Chef correspond à des expériences, plats signature, tables VIP ou créneaux limités proposés par certains restaurants. Les quantités et horaires sont restreints. Les conditions, prix et priorités sont affichés dans l'application.",
      },
      {
        q: "Dois-je payer pour réserver ?",
        a: "La plupart des réservations simples peuvent être gratuites. Certaines expériences, précommandes, garanties ou événements peuvent demander un paiement, une empreinte ou un acompte. Le montant et les règles doivent être indiqués avant validation.",
      },
    ],
  },
  {
    category: "features",
    questions: [
      {
        q: "Comment fonctionne le Multi-Restaurant ?",
        a: "Le Multi-Restaurant permet de composer un panier avec plusieurs restaurants compatibles. Les contraintes de distance, préparation, livraison et synchronisation sont importantes. Les frais, délais et éventuelles limites sont affichés dans le panier.",
      },
      {
        q: "Comment fonctionne Match Groupes ?",
        a: "Match Groupes permet de grouper des commandes proches pour réduire les coûts et optimiser la livraison. Chaque participant choisit ses plats, puis le groupe suit un créneau, une zone et des conditions de validation.",
      },
      {
        q: "Comment fonctionne Multi-Stop ?",
        a: "Multi-Stop sert à livrer plusieurs adresses dans une même organisation lorsque la fonctionnalité est disponible. Chaque arrêt doit avoir une adresse claire, un destinataire et des instructions. Les frais et temps augmentent selon les arrêts.",
      },
      {
        q: "Qu'est-ce que Budget Auto ?",
        a: "Budget Auto aide à composer une sélection selon un budget, des préférences et des contraintes alimentaires. L'utilisateur doit toujours valider le panier final : disponibilité, prix et options restent affichés avant paiement.",
      },
      {
        q: "Comment fonctionne l'abonnement repas ?",
        a: "L'abonnement repas sert à programmer des repas récurrents, par exemple chaque semaine. Vous définissez les jours, horaires, restaurants ou plats compatibles. Vous pouvez mettre en pause, modifier ou arrêter selon les conditions affichées.",
      },
      {
        q: "Qu'est-ce que la Garantie Qualité ?",
        a: "La Garantie Qualité est une option qui peut couvrir certains problèmes comme retard, température, emballage ou conformité selon les règles affichées. Elle ne remplace pas les droits habituels du consommateur ni la responsabilité du restaurant.",
      },
      {
        q: "Puis-je cumuler plusieurs fonctionnalités sur une commande ?",
        a: "Pas toujours. Certaines fonctions se combinent, d'autres non : code promo, Tok One, anti-gaspi, ventes flash, créneau garanti, livraison gratuite, formule, abonnement ou multi-restaurant. Le panier indique les incompatibilités avant paiement.",
      },
      {
        q: "Pourquoi une fonctionnalité affichée hier n'est plus là aujourd'hui ?",
        a: "Elle peut être désactivée temporairement, limitée à une zone, fermée par le restaurant, hors horaire, en test, complète ou non disponible pour votre compte. Les fonctions désactivées côté admin doivent disparaître de toute la plateforme.",
      },
    ],
  },
  {
    category: "offers",
    questions: [
      {
        q: "Comment utiliser un code promo ?",
        a: "Ajoutez le code dans le panier, vérifiez la réduction et relisez les conditions : montant minimum, premier achat, restaurant éligible, date de validité, mode de service, non-cumul ou usage unique.",
      },
      {
        q: "Pourquoi mon code promo ne fonctionne pas ?",
        a: "Le code peut être expiré, déjà utilisé, réservé à un compte, limité à certains restaurants, incompatible avec une autre offre ou inférieur au montant minimum. Le message d'erreur doit indiquer la raison lorsque l'information est disponible.",
      },
      {
        q: "Comment fonctionnent les Ventes Flash ?",
        a: "Les Ventes Flash sont des offres limitées en temps et en stock. Le prix, le compte à rebours, la quantité et les horaires doivent être visibles. Une fois le délai ou le stock terminé, l'offre disparaît ou revient à son prix normal.",
      },
      {
        q: "Une offre peut-elle être annulée par le restaurant ?",
        a: "Oui si le stock est épuisé, si le restaurant ferme exceptionnellement ou si une erreur manifeste est détectée. Si vous avez déjà payé, le paiement est annulé ou remboursé selon son état.",
      },
      {
        q: "Que signifie sponsorisé ?",
        a: "Sponsorisé signifie qu'un restaurant paie pour mettre en avant un contenu ou une carte. TOK doit afficher clairement cette mention. La mise en avant ne doit pas masquer les informations essentielles comme prix, cuisine, avis ou distance.",
      },
      {
        q: "Les offres sont-elles les mêmes en livraison et en retrait ?",
        a: "Pas forcément. Certaines promotions ne s'appliquent qu'à la livraison, au retrait, aux réservations, aux nouveaux clients, aux membres Tok One ou à des horaires précis. Vérifiez toujours le panier final.",
      },
      {
        q: "Comment être alerté des bons plans ?",
        a: "Activez les notifications pour les ventes flash, anti-gaspi, restaurants suivis et Actualités. Suivez vos restaurants préférés pour recevoir leurs publications et offres locales quand elles sont disponibles.",
      },
    ],
  },
  {
    category: "social",
    questions: [
      {
        q: "Comment fonctionne la page Actualités ?",
        a: "Actualités affiche les posts des restaurants : nouveautés, coulisses, offres, tables disponibles, menus du jour, événements, vidéos et contenus sponsorisés. Vous pouvez suivre, aimer, commenter, sauvegarder, partager, masquer ou signaler.",
      },
      {
        q: "Pourquoi vois-je certains posts plutôt que d'autres ?",
        a: "Le fil utilise plusieurs signaux : proximité, restaurants suivis, préférences, cuisine, interactions, popularité, fraîcheur, disponibilité, contenu sponsorisé et actions comme Plus comme ça ou Moins comme ça. L'objectif est d'afficher des contenus utiles, pas seulement les plus récents.",
      },
      {
        q: "Comment fonctionnent les vidéos ?",
        a: "Les vidéos peuvent se lancer automatiquement lorsqu'elles entrent dans l'écran et s'arrêter lorsqu'elles sortent de la zone visible. Les contrôles peuvent se masquer pendant la lecture et réapparaître à la pause selon le design.",
      },
      {
        q: "Où retrouver les posts sauvegardés ?",
        a: "Utilisez l'onglet Sauvegardés de la page Actualités si disponible. Il regroupe les posts que vous avez enregistrés pour retrouver un menu, une offre, une table ou une idée plus tard.",
      },
      {
        q: "Comment signaler un post ou un commentaire ?",
        a: "Utilisez le bouton de signalement, choisissez une raison et ajoutez un détail si nécessaire. Les signalements doivent être légitimes. Les campagnes abusives, le harcèlement d'un concurrent ou les signalements de mauvaise foi peuvent entraîner des restrictions ou la suppression du compte.",
      },
      {
        q: "Que se passe-t-il après un signalement ?",
        a: "Le contenu peut être examiné par TOK. Selon le cas, il peut rester visible, être masqué, supprimé, restauré ou conduire à une action sur le compte. Un signalement ne garantit pas automatiquement la suppression.",
      },
      {
        q: "Puis-je répondre à un commentaire ?",
        a: "Oui si les commentaires sont actifs. Lorsque vous répondez à quelqu'un, l'application peut ajouter une mention @ et envoyer une notification indiquant qu'une personne vous a mentionné dans un commentaire.",
      },
      {
        q: "Pourquoi mon commentaire n'apparaît pas ?",
        a: "Il peut être en cours d'envoi, refusé par les règles de modération, supprimé, masqué, associé à un post indisponible ou bloqué par une perte de connexion. Essayez d'actualiser avant de publier plusieurs fois.",
      },
      {
        q: "Comment un restaurateur publie-t-il une actualité ?",
        a: "Depuis le dashboard, le restaurateur saisit un texte, ajoute une image ou vidéo, choisit un appel à l'action, peut améliorer le texte avec l'IA si la fonction est active, programmer la publication et décider éventuellement de la sponsoriser.",
      },
      {
        q: "Les posts sponsorisés sont-ils ciblés ?",
        a: "Oui, ils peuvent être diffusés selon des critères comme ville, distance, cuisine préférée, genre si disponible et autorisé, habitudes de commande ou réservation, livraison, horaires et engagement. Les critères doivent rester proportionnés et conformes aux règles de confidentialité.",
      },
    ],
  },
  {
    category: "antigaspi",
    questions: [
      {
        q: "Qu'est-ce que l'Anti-gaspi ?",
        a: "L'Anti-gaspi permet aux restaurants de proposer des invendus ou préparations en surplus à prix réduit plutôt que les jeter. Vous profitez d'un repas moins cher et le restaurant limite le gaspillage.",
      },
      {
        q: "Comment fonctionnent les paniers surprise ?",
        a: "Le contenu exact peut varier selon les invendus du jour. Le restaurant indique généralement une valeur estimée, un prix réduit, une heure de retrait et les informations importantes. Le caractère surprise fait partie de l'offre.",
      },
      {
        q: "Puis-je choisir précisément les produits anti-gaspi ?",
        a: "Selon l'offre. Certains paniers sont fixes, d'autres totalement surprise. Si vous avez des allergies ou contraintes fortes, évitez les paniers dont la composition n'est pas suffisamment claire ou contactez le restaurant.",
      },
      {
        q: "Les produits anti-gaspi sont-ils sûrs ?",
        a: "Ils doivent respecter les règles d'hygiène et de consommation. Anti-gaspi ne signifie pas produit impropre, mais surplus encore consommable. Signalez immédiatement toute odeur, emballage anormal ou doute sanitaire.",
      },
      {
        q: "Pourquoi les paniers partent si vite ?",
        a: "Les quantités sont faibles et liées aux invendus réels. Activez les notifications ou suivez vos restaurants préférés pour être prévenu plus rapidement.",
      },
      {
        q: "Comment fonctionnent les dons solidaires ?",
        a: "Lorsque la fonction est disponible, vous pouvez contribuer à des repas solidaires ou convertir certains avantages en dons. Les règles de redistribution, partenaires et montants doivent être affichés dans l'application.",
      },
      {
        q: "Puis-je annuler une offre anti-gaspi ?",
        a: "Les annulations peuvent être plus strictes car le stock est limité et préparé pour un horaire précis. Vérifiez les conditions avant paiement. En cas de fermeture ou impossibilité côté restaurant, le remboursement est traité.",
      },
    ],
  },
  {
    category: "membership",
    questions: [
      {
        q: "Qu'est-ce que Tok One ?",
        a: "Tok One est un abonnement donnant accès à des avantages selon l'offre active : livraison offerte ou réduite, support prioritaire, accès anticipé, offres réservées, avantages fidélité ou expériences partenaires.",
      },
      {
        q: "Comment souscrire à Tok One ?",
        a: "Ouvrez la page Tok One, choisissez la formule, vérifiez le prix, la période d'essai éventuelle, les conditions, le renouvellement et le moyen de paiement. La souscription devient active après validation du paiement.",
      },
      {
        q: "Comment résilier Tok One ?",
        a: "Ouvrez Profil, Abonnement ou le portail de gestion. La résiliation stoppe le renouvellement futur, mais les avantages peuvent rester actifs jusqu'à la fin de la période payée selon les conditions affichées.",
      },
      {
        q: "Tok One rembourse-t-il les périodes déjà payées ?",
        a: "En général, une période commencée n'est pas remboursée automatiquement sauf erreur, double facturation, droit applicable ou geste commercial. Contactez le support en cas de situation particulière.",
      },
      {
        q: "Quels restaurants sont éligibles aux avantages Tok One ?",
        a: "Les restaurants éligibles affichent les avantages correspondants. Certains restaurants, zones, frais spéciaux, paniers anti-gaspi ou offres partenaires peuvent être exclus.",
      },
      {
        q: "Puis-je partager mon abonnement ?",
        a: "Tok One est personnel sauf mention contraire. Le partage de compte peut poser des problèmes de paiement, de données personnelles et de sécurité.",
      },
      {
        q: "Les avantages Tok One se cumulent-ils avec les promotions ?",
        a: "Parfois oui, parfois non. Le panier applique les règles de cumul. Si deux avantages ne peuvent pas être combinés, l'application doit afficher le meilleur traitement disponible ou expliquer l'incompatibilité.",
      },
    ],
  },
  {
    category: "loyalty",
    questions: [
      {
        q: "Que sont les Miamz ?",
        a: "Les Miamz sont les points de fidélité TOK. Ils peuvent être gagnés lors de commandes, réservations, actions qualifiées ou opérations spéciales, puis utilisés pour débloquer des avantages selon les règles disponibles.",
      },
      {
        q: "Comment gagner des Miamz ?",
        a: "Vous pouvez en gagner via des achats, réservations, bonus, parrainage, anniversaires, challenges, actions anti-gaspi ou campagnes partenaires. Le nombre exact dépend des règles actives et du statut de l'action.",
      },
      {
        q: "Quand mes Miamz sont-ils crédités ?",
        a: "Ils peuvent être crédités après paiement, livraison, réservation honorée ou validation d'une action. En cas d'annulation, remboursement ou fraude, les points peuvent être annulés ou retirés.",
      },
      {
        q: "Comment utiliser mes Miamz ?",
        a: "Ouvrez Profil ou Programme fidélité. Les avantages disponibles indiquent le coût, les conditions, la durée et les restrictions. Les Miamz ne sont pas forcément convertibles en argent.",
      },
      {
        q: "Quels sont les niveaux de fidélité ?",
        a: "Les niveaux comme Bronze, Silver, Gold ou Platinum peuvent donner accès à des multiplicateurs, bonus, priorités, cadeaux, événements, support prioritaire ou offres partenaires. Les paliers exacts peuvent évoluer.",
      },
      {
        q: "Comment offrir des points cadeau ?",
        a: "Si la fonctionnalité est active, choisissez le montant, le destinataire et le message. Le destinataire reçoit les points ou un code à réclamer. Les points cadeau peuvent avoir une durée de validité.",
      },
      {
        q: "Pourquoi un bonus est indiqué déjà réclamé ?",
        a: "Certains bonus sont limités à une fois par période : anniversaire, campagne, niveau ou opération partenaire. Si vous pensez à une erreur, contactez le support avec une capture.",
      },
      {
        q: "Que deviennent mes Miamz si je supprime mon compte ?",
        a: "Ils sont perdus ou anonymisés avec le compte selon les règles applicables. Utilisez vos avantages avant toute demande de suppression si vous souhaitez en profiter.",
      },
    ],
  },
  {
    category: "quality",
    questions: [
      {
        q: "Comment signaler un problème de qualité ?",
        a: `Ouvrez la commande ou le chat support. Décrivez précisément le problème, ajoutez une photo si possible, indiquez l'article concerné et gardez le ticket ou l'emballage. Pour les cas sensibles, écrivez aussi à ${SUPPORT_EMAIL}.`,
      },
      {
        q: "Quels problèmes peuvent donner lieu à remboursement ?",
        a: "Article manquant, erreur majeure, commande non livrée, double paiement, annulation restaurant, problème sanitaire, emballage renversé ou retard exceptionnel peuvent être éligibles selon les preuves et la situation. Une préférence gustative seule ne suffit pas toujours.",
      },
      {
        q: "Combien de temps prend un remboursement ?",
        a: "Après validation, le remboursement bancaire prend souvent 5 à 10 jours ouvrables selon la banque. Une autorisation non capturée peut disparaître plus vite. Un crédit TOK peut être visible plus rapidement.",
      },
      {
        q: "Comment TOK traite les allergènes ?",
        a: "TOK affiche les informations fournies par les restaurants. Pour une allergie sévère, vérifiez auprès du restaurant avant de commander. Signalez immédiatement tout écart entre votre demande, les informations affichées et le plat reçu.",
      },
      {
        q: "Comment sont modérés les avis et commentaires ?",
        a: "Les contenus peuvent être supprimés ou masqués s'ils sont illégaux, haineux, diffamatoires, menaçants, publicitaires, frauduleux, hors sujet ou s'ils contiennent des données personnelles sensibles.",
      },
      {
        q: "Puis-je laisser un avis négatif ?",
        a: "Oui, s'il est factuel, honnête et lié à une expérience réelle. Évitez accusations invérifiables, insultes, menaces ou informations privées. Un avis précis aide plus qu'un commentaire agressif.",
      },
      {
        q: "Comment TOK protège mes données ?",
        a: "Les données sont utilisées pour fournir le service : compte, commandes, réservations, paiements, support, sécurité, personnalisation et obligations légales. Les accès doivent être limités par rôle et les données sensibles protégées côté serveur.",
      },
      {
        q: "Pourquoi TOK collecte mes préférences ?",
        a: "Elles améliorent la recherche, les recommandations, les offres, les alertes et l'expérience restaurateur. Vous pouvez influencer ces signaux via vos actions, vos paramètres, vos favoris et certains choix de confidentialité.",
      },
      {
        q: "Comment éviter les abus de signalement ?",
        a: "Signalez uniquement des contenus réellement problématiques. Les signalements coordonnés contre un concurrent, un client ou un restaurant peuvent être considérés comme du harcèlement et entraîner des sanctions.",
      },
      {
        q: "Que faire en cas d'urgence alimentaire ou médicale ?",
        a: "Si vous pensez avoir ingéré un allergène dangereux ou si une personne présente des symptômes graves, contactez immédiatement les services d'urgence. Prévenez ensuite TOK et le restaurant avec les informations de commande pour l'enquête.",
      },
    ],
  },
  {
    category: "restaurants",
    questions: [
      {
        q: "Quels sont les tarifs Fair Growth ?",
        a: "Starter coûte CHF 69/mois, CHF 5 par réservation apportée par TOK et honorée, et 9,9% par commande marketplace. Business coûte CHF 129, CHF 4.50 et 8,9%. Premium coûte CHF 199, CHF 4 et 7,9%. Elite coûte CHF 499, CHF 3 et 6,9%. Elite inclut trois établissements, puis CHF 149/mois par site supplémentaire. Le rattachement des sites et tout supplément sont validés avec TOK avant facturation. L'annuel fournit 12 mois de service au prix de 11.",
      },
      {
        q: "Comment fonctionne le Plat du jour IA ?",
        a: "Le Plat du jour IA est inclus dès TOK Premium. Lorsqu'il est activé depuis Menu, il prépare chaque jour trois propositions à partir de la carte, de la saison, des ventes et avis agrégés. Il recherche Aligro en priorité, compare les prix publics accessibles de fournisseurs proches, détaille la recette, le panier, le coût par portion et la marge estimée. Le restaurateur choisit ou ajuste une variante, valide le prix et la description, puis TOK génère un visuel PhotoPro avant publication sur la fiche restaurant et, en option, dans Actualités. Les prix et stocks en ligne restent indicatifs et les allergènes doivent être contrôlés par le restaurant.",
      },
      {
        q: "Qu'est-ce qu'une réservation apportée par TOK ?",
        a: "C'est une réservation dont la première source vérifiable est la marketplace TOK. La source est enregistrée côté serveur à la création et ne peut pas être changée depuis le navigateur. Une réservation issue du site du restaurant, d'un QR code TOK attribué au restaurant, d'Instagram, de Google ou du fichier client est un canal propre et reste gratuite.",
      },
      {
        q: "Une annulation ou un no-show est-il facturé ?",
        a: "Non. Les frais de réservation ne sont créés qu'après confirmation par le restaurant que la table a été réellement honorée et après saisie du chiffre d'affaires attribué. Annulations, no-shows, remboursements et démonstrations valent CHF 0.",
      },
      {
        q: "Comment fonctionne le plafond de 7% ?",
        a: "Le frais applicable est le plus petit montant entre le tarif du plan et 7% du chiffre d'affaires réellement attribué à la table. Exemple : avec un tarif de CHF 5 et une table à CHF 50, le maximum facturé est CHF 3.50.",
      },
      {
        q: "Quelle part d'une commande revient au restaurant ?",
        a: "Le restaurant conserve au minimum 90% du montant éligible de la commande et 100% des pourboires. Les taux Fair Growth de 9,9%, 8,9%, 7,9% et 6,9% laissent respectivement 90,1%, 91,1%, 92,1% et 93,1% au restaurant sur la base commissionnable. Les frais Stripe et Connect de la marketplace sont absorbés par la part TOK.",
      },
      {
        q: "Comment fonctionne l'abonnement annuel ?",
        a: "L'abonnement annuel est payé une fois pour 12 mois de service, au prix de 11 mensualités : CHF 759 Starter, CHF 1'419 Business, CHF 2'189 Premium et CHF 5'489 Elite. Les crédits et quotas inclus restent renouvelés chaque mois.",
      },
      {
        q: "Quels modules payants sont proposés ?",
        a: "Sur demande : No-Show Shield CHF 39/mois ; Marketing Autopilot IA CHF 79/mois ; Margin & Waste Pilot CHF 59/mois ; Réputation IA CHF 29/mois. En pilote, après validation technique : Réceptionniste téléphonique IA CHF 49/mois plus CHF 1.50 par réservation réussie ; Direct Order Saver CHF 149/mois plus 1,5% ; cartes-cadeaux et expériences 3% plus coût de paiement. Les fonctions pilote ne sont pas présentées comme activées tant que TOK n'a pas confirmé leur mise en service.",
      },
      {
        q: "Une demande de module déclenche-t-elle un paiement ?",
        a: "Non. Le dashboard enregistre uniquement une demande. TOK vérifie ensuite le périmètre, les prérequis techniques, le prix et la date de début avec le restaurant. L'activation et la facturation commencent seulement après cette confirmation ; aucune intégration téléphonique, commande directe ou carte-cadeau n'est créée automatiquement.",
      },
      {
        q: "Comment fonctionne la garantie de valeur 3× ?",
        a: "TOK mesure la valeur attribuable du module pendant une fenêtre de 90 jours. Si elle n'atteint pas trois fois son coût, TOK recommande sa désactivation ou accorde un crédit après validation des données et selon les conditions du module.",
      },
      {
        q: "Quand Direct Order Saver devient-il rentable ?",
        a: "Face au taux Starter, le point d'équilibre mathématique est d'environ CHF 1'774 de commandes directes par mois, hors paiement. En incluant un panier moyen proche de CHF 40 et les coûts d'une carte suisse supportés par le flux direct, l'estimation prudente est d'environ CHF 3'100 à CHF 3'200. Le simulateur doit toujours afficher ses hypothèses.",
      },
      {
        q: "Pourquoi TWINT n'est-il pas proposé pour Match Group ?",
        a: "TWINT est proposé en priorité sur les parcours Stripe Checkout compatibles. Match Group exige une autorisation avec capture manuelle, que TWINT ne prend pas en charge ; une carte compatible est donc requise.",
      },
      {
        q: "Quels taux de TVA apparaissent sur les factures ?",
        a: "Le moteur distingue le taux normal suisse de 8,1% et le taux réduit de 2,6% par ligne. La restauration sur place et l'alcool relèvent généralement du taux normal ; les denrées éligibles hors prestation de restauration peuvent relever du taux réduit. La qualification fiscale finale reste celle du restaurant.",
      },
      {
        q: "Comment inscrire mon restaurant sur TOK ?",
        a: `Utilisez l'espace Restaurateurs ou contactez ${SUPPORT_EMAIL}. L'équipe vérifie vos informations, votre identité commerciale, vos horaires, modes de service, menu, photos, moyens de paiement et conditions opérationnelles avant mise en ligne.`,
      },
      {
        q: "Que contient le dashboard restaurateur ?",
        a: "Le dashboard peut regrouper commandes, réservations, menu, offres, anti-gaspi, ventes flash, Actualités, campagnes, CRM, performances, avis, factures, photos, support, plan de salle et pilotage de service selon les droits et fonctionnalités activées. Dès Premium, le Menu inclut le Plat du jour IA avec trois propositions quotidiennes, recherche fournisseurs et publication PhotoPro.",
      },
      {
        q: "Comment gérer les commandes entrantes ?",
        a: "Le restaurant doit accepter, préparer, marquer prêt, refuser ou signaler un problème depuis le dashboard. Les statuts doivent refléter la réalité opérationnelle, car ils pilotent les notifications client et les flux de paiement/livraison.",
      },
      {
        q: "Comment gérer les réservations ?",
        a: "Le dashboard affiche les réservations par date, statut, nombre de couverts et notes client. Le restaurant peut confirmer, annuler, modifier, assigner une table ou marquer l'arrivée selon les outils disponibles.",
      },
      {
        q: "Comment mettre à jour mon menu ?",
        a: "Modifiez catégories, plats, prix, descriptions, allergènes, photos, options et disponibilités. Les changements doivent être relus avant publication, surtout prix et allergènes. Un plat indisponible doit être désactivé plutôt que laissé commandable.",
      },
      {
        q: "Comment publier un post Actualités ?",
        a: "Depuis Actualités, rédigez le texte, ajoutez un média, choisissez un CTA, programmez si besoin, puis publiez. L'IA peut proposer des variantes lorsque la fonction est active, mais le restaurateur reste responsable du contenu final.",
      },
      {
        q: "Comment sponsoriser un post ?",
        a: "Choisissez Sponsoriser, paramétrez objectif, budget total et la durée, ville, distance, cuisine, audience, genre si autorisé, horaires et critères utiles. TOK affiche une estimation simple des impressions, du CPC et des conversions attendues avant paiement. Les notifications liées à la campagne utilisent les jetons de notification push uniquement lorsque l'utilisateur a accepté ce canal. La diffusion commence après validation du paiement et respect des règles de contenu.",
      },
      {
        q: "Comment fonctionne le CRM restaurateur ?",
        a: "Le CRM peut regrouper les clients qui commandent ou réservent : nom, prénom, email, téléphone si disponible, habitudes, horaires, préférences, panier moyen, fréquence et signaux d'intérêt. Ces données doivent être utilisées avec respect, proportionnalité et conformité.",
      },
      {
        q: "Quelles données client le restaurant reçoit-il ?",
        a: "Seulement les données nécessaires à l'opération et autorisées : identité utile, contact pour la commande/réservation, informations de service, préférences déclarées et historique pertinent. Les données de paiement sensibles ne sont pas transmises.",
      },
      {
        q: "Comment consulter mes factures ?",
        a: "Ouvrez Factures ou Mon compte/Facturation. Les documents disponibles peuvent inclure commissions, abonnements, campagnes, packs, remboursements, rapprochements et exports selon votre rôle.",
      },
      {
        q: "Pourquoi un module du dashboard est-il absent ?",
        a: "Il peut être désactivé par feature flag, non inclus dans votre pack, réservé à certains rôles, non configuré pour votre restaurant ou temporairement indisponible. Quand un module est désactivé par l'admin, il doit être inexistant dans l'interface.",
      },
      {
        q: "Comment demander de l'aide opérationnelle ?",
        a: "Utilisez l'aide restaurateur, le support dashboard ou l'email. Pour un incident urgent, donnez le restaurant, l'heure, l'ID commande/réservation, le statut actuel et la capture du problème.",
      },
    ],
  },
  {
    category: "tok-connect",
    questions: [
      {
        q: "Qu'est-ce que TOK Connect ?",
        a: "TOK Connect est le socle d'intégration de TOK pour les partenaires approuvés : API REST, OAuth, webhooks, portail développeur et serveur MCP. Il permet de lire des restaurants, menus et disponibilités, de préparer des réservations, de confirmer certaines réservations réelles et de générer des previews de campagnes sans donner un accès libre à toute la plateforme.",
      },
      {
        q: "À quoi sert l'API REST TOK Connect ?",
        a: "L'API REST versionnée sert aux applications partenaires qui veulent intégrer TOK dans leurs propres outils : recherche de restaurants, détail d'un restaurant, menu, disponibilité, preview de réservation, création de réservation confirmée, consultation de crédits et preview de campagne. Les réponses utilisent une enveloppe standard avec ok, data, error, request_id et next_cursor lorsque la pagination est nécessaire.",
      },
      {
        q: "Que signifie MCP dans TOK Connect ?",
        a: "Le serveur MCP permet à un assistant compatible, par exemple un connecteur ChatGPT configuré par un partenaire autorisé, d'appeler des outils TOK de manière structurée. En v1, seuls les outils prudents sont exposés : recherche, disponibilité, préparation de réservation, performance restaurant autorisée, estimation de coût crédit et preview de campagne.",
      },
      {
        q: "Qui peut créer un client OAuth TOK Connect ?",
        a: "Seuls les partenaires validés peuvent disposer d'un client OAuth. Un client peut être sandbox ou production, recevoir des scopes limités, des quotas et des restaurants autorisés. Les secrets ne sont pas affichés en clair après création et peuvent être révoqués ou renouvelés.",
      },
      {
        q: "Quelles données un partenaire peut-il consulter ?",
        a: "Un partenaire ne voit que les données couvertes par ses scopes et par les autorisations restaurant : informations publiques de restaurant, menus, disponibilités, données strictement nécessaires à une réservation ou statistiques agrégées lorsque le restaurant et TOK les autorisent. Les données de paiement sensibles et les secrets serveur ne sont jamais transmis.",
      },
      {
        q: "Un partenaire peut-il créer une réservation réelle ?",
        a: "Oui, mais seulement avec le scope adapté, un restaurant autorisé, une disponibilité valide et une confirmation explicite dans le parcours partenaire. Le endpoint de création exige une clé Idempotency-Key afin d'éviter les doublons si une requête est rejouée.",
      },
      {
        q: "Les actions autonomes sont-elles autorisées ?",
        a: "Non en v1 pour les actions sensibles. TOK Connect peut préparer, suggérer ou prévisualiser des campagnes, coûts, réservations et performances, mais les offres, campagnes autonomes, crédits consommés ou actions commerciales sensibles doivent rester en preview ou passer par une validation humaine explicite.",
      },
      {
        q: "Que sont les webhooks TOK Connect ?",
        a: "Les webhooks préviennent un partenaire lorsqu'un événement autorisé se produit, par exemple reservation.created, reservation.cancelled, webhook.test ou campaign.previewed. Chaque livraison comporte des en-têtes X-TOK-Event, X-TOK-Delivery, X-TOK-Timestamp et X-TOK-Signature pour permettre la vérification côté partenaire.",
      },
      {
        q: "Comment fonctionne le mode sandbox ?",
        a: "Le mode sandbox isole les tests d'un client OAuth avec des données déterministes et sans mutation production. Il sert à développer une intégration, tester l'authentification, la pagination, les erreurs, les webhooks et les appels MCP avant toute validation production.",
      },
      {
        q: "Comment un restaurateur contrôle-t-il l'accès à son établissement ?",
        a: "Le restaurateur peut autoriser ou révoquer les partenaires par restaurant depuis le dashboard TOK Connect lorsque la fonctionnalité est active. Il peut limiter les scopes, les quotas, les réservations et les usages autorisés. TOK peut aussi suspendre un accès en cas de risque, abus ou non-conformité.",
      },
      {
        q: "Comment TOK sécurise les tokens et les appels TOK Connect ?",
        a: "TOK Connect utilise OAuth client-credentials, des tokens opaques courts, des secrets hashés, des scopes, des quotas, des logs d'audit, des contrôles côté Edge Function et des signatures webhook. Les mutations sensibles ne sont pas faites directement depuis le navigateur.",
      },
      {
        q: "Où trouver la documentation et les exemples TOK Connect ?",
        a: "La page publique /tok-connect présente le produit. Le portail /tok-connect/developer donne accès à la documentation OpenAPI, aux clients sandbox, aux logs, quotas, webhooks et exemples MCP pour les utilisateurs autorisés. Les admins disposent d'une supervision dédiée dans /admin/tok-connect.",
      },
    ],
  },
];

export default function Aide() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);
  const questionsRef = useRef<HTMLElement | null>(null);
  const { activeFeatures } = useFeatureFlagSnapshot();

  const visibleCategories = useMemo(
    () => CATEGORIES.filter((category) => isHelpCategoryVisible(category.id, activeFeatures)),
    [activeFeatures],
  );

  const visibleCategoryIds = useMemo(
    () => new Set(visibleCategories.map((category) => category.id)),
    [visibleCategories],
  );

  useEffect(() => {
    if (selectedCat && !visibleCategoryIds.has(selectedCat)) {
      setSelectedCat(null);
    }
  }, [selectedCat, visibleCategoryIds]);

  const visibleFaqSections = useMemo(
    () =>
      FAQS.filter((section) => visibleCategoryIds.has(section.category))
        .map((section) => ({
          ...section,
          questions: section.questions.filter((question) =>
            isHelpQuestionVisible(section.category, question.q, question.a, activeFeatures),
          ),
        }))
        .filter((section) => section.questions.length > 0),
    [activeFeatures, visibleCategoryIds],
  );

  const normalizedSearch = search.trim().toLowerCase();

  const filteredFaqs = useMemo(
    () =>
      visibleFaqSections
        .filter((section) => !selectedCat || section.category === selectedCat)
        .map((section) => ({
          ...section,
          questions: section.questions.filter(
            (question) =>
              !normalizedSearch ||
              question.q.toLowerCase().includes(normalizedSearch) ||
              question.a.toLowerCase().includes(normalizedSearch),
          ),
        }))
        .filter((section) => section.questions.length > 0),
    [normalizedSearch, selectedCat, visibleFaqSections],
  );

  const totalQuestions = visibleFaqSections.reduce((sum, section) => sum + section.questions.length, 0);
  const selectedCategory = visibleCategories.find((category) => category.id === selectedCat);

  const scrollToQuestions = () => {
    if (typeof window === "undefined") return;

    window.setTimeout(() => {
      const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

      questionsRef.current?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "start",
      });
    }, 0);
  };

  const handleCategorySelect = (categoryId: string) => {
    setSelectedCat((current) => (current === categoryId ? null : categoryId));
    scrollToQuestions();
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <div className="bg-primary px-6 pb-14 pt-20 text-primary-foreground">
        <div className="container max-w-5xl space-y-7">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <p className="text-sm font-bold uppercase tracking-[0.2em] text-primary-foreground/70">
              Centre d'aide TOK
            </p>
            <h1 className="font-display text-4xl font-bold md:text-5xl">
              Trouvez une réponse claire avant de contacter le support
            </h1>
            <p className="mx-auto max-w-2xl text-base leading-relaxed text-primary-foreground/80 md:text-lg">
              Commandes, paiements, réservations, livraison, fidélité, actualités,
              restaurateurs et sécurité : {totalQuestions} réponses détaillées pour vous guider.
            </p>
          </div>

          <div className="relative mx-auto max-w-2xl">
            <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher : remboursement, TWINT, réservation, anti-gaspi..."
              className="h-14 rounded-2xl border-0 pl-12 text-base font-medium text-foreground shadow-lg md:text-lg"
            />
          </div>
        </div>
      </div>

      <main className="container -mt-7 max-w-6xl space-y-10 px-4 md:px-6">
        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {visibleCategories.map((category) => (
            <button
              key={category.id}
              type="button"
              onClick={() => handleCategorySelect(category.id)}
              className={`rounded-2xl border bg-card p-4 text-left shadow-sm transition-all ${
                selectedCat === category.id ? "border-transparent ring-2 ring-primary" : "hover:border-primary/30"
              }`}
            >
              <div className="flex items-start gap-3">
                <div className={`${category.bg} shrink-0 rounded-xl p-2`}>
                  <category.icon className={`h-5 w-5 ${category.color}`} />
                </div>
                <div className="min-w-0">
                  <h2 className="text-sm font-bold">{category.title}</h2>
                  <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {category.description}
                  </p>
                </div>
              </div>
            </button>
          ))}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-red-50 p-2 text-red-600">
                <Bell className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold">Urgence commande</h2>
                <p className="text-sm text-muted-foreground">Contactez le chat en priorité.</p>
              </div>
            </div>
            <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
              {URGENT_CASES.map((item) => (
                <li key={item} className="flex gap-2">
                  <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-green-50 p-2 text-green-600">
                <ReceiptText className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold">Avant d'ouvrir un ticket</h2>
                <p className="text-sm text-muted-foreground">Gagnez du temps avec les bonnes infos.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Préparez votre numéro de commande ou réservation, le restaurant, l'heure,
              le montant, le moyen de paiement, une capture et une photo si un article
              ou une qualité est concerné.
            </p>
          </div>

          <div className="rounded-2xl border bg-card p-5 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="rounded-xl bg-violet-50 p-2 text-violet-600">
                <HeartHandshake className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-bold">Réponse humaine</h2>
                <p className="text-sm text-muted-foreground">Le support reprend si l'IA ne suffit pas.</p>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
              Le chat peut aider immédiatement. Les cas de paiement, allergène, litige,
              remboursement ou incident opérationnel peuvent être transférés à l'équipe TOK.
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-10 lg:grid-cols-3">
          <section ref={questionsRef} id="questions-aide" className="scroll-mt-24 space-y-7 lg:col-span-2">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl font-bold">
                  {selectedCategory ? selectedCategory.title : "Toutes les questions fréquentes"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  {selectedCategory
                    ? selectedCategory.description
                    : "Filtrez par thème ou utilisez la recherche pour trouver la réponse précise."}
                </p>
              </div>
              {selectedCat ? (
                <Button variant="ghost" size="sm" onClick={() => setSelectedCat(null)}>
                  Voir tout
                </Button>
              ) : null}
            </div>

            <div className="space-y-6">
              {filteredFaqs.map((section) => {
                const category = visibleCategories.find((item) => item.id === section.category);

                return (
                  <div key={section.category} className="space-y-3">
                    {!selectedCat && category ? (
                      <button
                        type="button"
                        onClick={() => handleCategorySelect(section.category)}
                        className="group flex items-center gap-2"
                      >
                        <span className={`${category.bg} rounded-lg p-1.5`}>
                          <category.icon className={`h-4 w-4 ${category.color}`} />
                        </span>
                        <h3 className="pt-0.5 text-sm font-semibold uppercase tracking-wide text-muted-foreground transition-colors group-hover:text-primary">
                          {category.title}
                        </h3>
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          {section.questions.length}
                        </span>
                      </button>
                    ) : null}

                    <Accordion type="single" collapsible className="w-full">
                      {section.questions.map((item, index) => (
                        <AccordionItem
                          key={`${section.category}-${item.q}`}
                          value={`${section.category}-${index}`}
                          className="mb-3 rounded-xl border bg-card px-4 py-1 shadow-sm"
                        >
                          <AccordionTrigger className="text-left font-semibold hover:no-underline">
                            {item.q}
                          </AccordionTrigger>
                          <AccordionContent className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
                            {item.a}
                          </AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </div>
                );
              })}
            </div>

            {filteredFaqs.length === 0 ? (
              <div className="space-y-2 rounded-2xl border-2 border-dashed bg-muted/20 py-12 text-center text-muted-foreground">
                <HelpCircle className="mx-auto h-10 w-10 text-muted-foreground/50" />
                <p className="font-medium">Aucun résultat trouvé</p>
                <p className="text-sm">Essayez un autre mot-clé ou contactez le support.</p>
              </div>
            ) : null}
          </section>

          <aside className="space-y-6">
            <div className="space-y-4 rounded-2xl border bg-primary/5 p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <MessageSquare className="h-5 w-5 text-primary" />
                Dépannage en direct
              </h3>
              <p className="text-sm text-muted-foreground">
                Un problème urgent avec une commande ou un paiement ? Ouvrez le chat pour
                transmettre les informations de contexte.
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
              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <Mail className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Email</p>
                    <p className="text-xs text-muted-foreground">{SUPPORT_EMAIL}</p>
                    <p className="text-xs text-muted-foreground">Réponse généralement sous 24h ouvrées.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Téléphone</p>
                    <p className="text-xs text-muted-foreground">0800 MIAMZ (64269)</p>
                    <p className="text-xs text-muted-foreground">Lun-Ven, 9h-21h.</p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                  <div>
                    <p className="text-sm font-medium">Zone principale</p>
                    <p className="text-xs text-muted-foreground">Suisse romande, avec Genève comme zone prioritaire.</p>
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
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                Vous êtes restaurateur ?
              </h3>
              <p className="text-sm text-muted-foreground">
                Retrouvez les réponses sur l'inscription, le dashboard, les commandes,
                les campagnes, le CRM, les avis, la facturation et le support opérationnel.
              </p>
              <div className="grid gap-2">
                <Link to="/packs-restaurateur">
                  <Button variant="outline" className="w-full gap-2 rounded-xl font-bold">
                    Packs restaurateurs <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
                <Link to="/dashboard/support">
                  <Button variant="outline" className="w-full gap-2 rounded-xl font-bold">
                    Support dashboard <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <Gift className="h-5 w-5 text-muted-foreground" />
                Liens utiles
              </h3>
              <div className="space-y-2">
                <Link to="/cgu" className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
                  Conditions générales <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/politique-confidentialite"
                  className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  Politique de confidentialité <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/a-propos"
                  className="flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                >
                  À propos de TOK <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>

            <div className="space-y-3 rounded-2xl border bg-muted/25 p-6">
              <h3 className="flex items-center gap-2 font-bold">
                <User className="h-5 w-5 text-muted-foreground" />
                Bon réflexe support
              </h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Ne transmettez jamais votre mot de passe, vos codes de connexion,
                votre numéro complet de carte ou une clé privée. TOK ne vous les demandera pas.
              </p>
            </div>
          </aside>
        </div>

        <TokAiSupportChat context={{ page: "aide" }} compact />
      </main>
    </div>
  );
}
