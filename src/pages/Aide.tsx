import { useState } from "react";
import {
  Search,
  ChevronRight,
  ShoppingBag,
  User,
  CreditCard,
  ShieldCheck,
  Truck,
  HelpCircle,
  MessageSquare,
  Mail,
  Phone,
  CalendarDays,
  Zap,
  Leaf,
  Star,
  UtensilsCrossed,
  Store,
  Gift,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import TokAiSupportChat from "@/components/support/TokAiSupportChat";
import { SUPPORT_EMAIL } from "@/lib/contact";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Link } from "react-router-dom";

declare global {
  interface Window {
    openChat?: () => void;
  }
}

const CATEGORIES = [
  {
    id: "orders",
    title: "Mes Commandes",
    icon: ShoppingBag,
    color: "text-green-600",
    bg: "bg-green-50",
  },
  {
    id: "account",
    title: "Compte & Paiement",
    icon: CreditCard,
    color: "text-blue-600",
    bg: "bg-blue-50",
  },
  {
    id: "delivery",
    title: "Livraison & Retrait",
    icon: Truck,
    color: "text-amber-600",
    bg: "bg-amber-50",
  },
  {
    id: "reservations",
    title: "Reservations",
    icon: CalendarDays,
    color: "text-rose-600",
    bg: "bg-rose-50",
  },
  {
    id: "features",
    title: "Fonctionnalités",
    icon: Zap,
    color: "text-indigo-600",
    bg: "bg-indigo-50",
  },
  {
    id: "antigaspi",
    title: "Anti-gaspi & Durabilite",
    icon: Leaf,
    color: "text-emerald-600",
    bg: "bg-emerald-50",
  },
  {
    id: "membership",
    title: "Tok One",
    icon: ShieldCheck,
    color: "text-violet-600",
    bg: "bg-violet-50",
  },
  {
    id: "loyalty",
    title: "Fidélité & Points",
    icon: Star,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  {
    id: "quality",
    title: "Qualité & Sécurité",
    icon: ShieldCheck,
    color: "text-sky-600",
    bg: "bg-sky-50",
  },
  {
    id: "restaurants",
    title: "Restaurateurs",
    icon: Store,
    color: "text-orange-600",
    bg: "bg-orange-50",
  },
];

const FAQS = [
  {
    category: "orders",
    questions: [
      {
        q: "Ou est ma commande ?",
        a: "Vous pouvez suivre votre commande en temps réel depuis l'onglet 'Commandes' de votre profil. Une fois le livreur en route, vous verrez sa position sur la carte avec une estimation du temps d'arrivée. Vous recevrez aussi des notifications à chaque étape : confirmation par le restaurant, début de préparation, livreur en route, et arrivée imminente.",
      },
      {
        q: "Comment annuler une commande ?",
        a: "L'annulation est possible tant que le restaurant n'a pas commencé la préparation. Rendez-vous dans les détails de votre commande et appuyez sur 'Annuler la commande'. Si l'option n'apparaît plus, le restaurant a déjà débuté la préparation et l'annulation n'est plus possible. Le remboursement est effectué sous 5 à 10 jours ouvrables sur votre moyen de paiement d'origine.",
      },
      {
        q: "Il manque un article dans ma commande",
        a: `Nous en sommes désolés. Signalez le problème via le chat de support ou contactez-nous directement à ${SUPPORT_EMAIL} en précisant votre numéro de commande et l'article manquant. Après vérification auprès du restaurant, un remboursement partiel ou un crédit Tok sera appliqué sous 48h.`,
      },
      {
        q: "Comment modifier ma commande après validation ?",
        a: "Pour toute modification après validation, contactez notre support via le chat en bas de page dans les premières minutes suivant votre commande. Passe le début de préparation par le restaurant, la modification n'est plus possible — vous devrez annuler la commande et en passer une nouvelle.",
      },
      {
        q: "Comment utiliser un code promo ?",
        a: "Lors du récapitulatif de commande, appuyez sur 'Ajouter un code promo' et saisissez votre code. La réduction sera appliquée automatiquement au montant total. Les codes promos ne sont pas cumulables sauf mention contraire. Chaque code a une date d'expiration et des conditions d'utilisation spécifiques (montant minimum, restaurants éligibles, etc.).",
      },
      {
        q: "Je souhaite demander un remboursement",
        a: "Rendez-vous dans l'historique de vos commandes, sélectionnez la commande concernée, puis appuyez sur 'Signaler un problème'. Décrivez le souci rencontré (article manquant, qualité insatisfaisante, retard excessif) et notre équipe traitera votre demande sous 48h ouvrées. Le remboursement sera effectué sur votre moyen de paiement d'origine ou en crédit Tok, selon la nature du problème.",
      },
      {
        q: "Puis-je repasser la même commande ?",
        a: "Oui ! Depuis votre historique de commandes, appuyez sur 'Commander à nouveau' sur n'importe quelle commande passée. Le panier sera pré-rempli avec les mêmes articles, sous réserve de disponibilité au restaurant. Vous pourrez modifier les quantités ou ajouter d'autres articles avant de valider.",
      },
      {
        q: "Comment commander depuis plusieurs restaurants en une seule commande ?",
        a: "Avec la fonctionnalité Multi-Restaurant, vous pouvez composer un repas complet en choisissant une entrée, un plat et un dessert depuis différents restaurants situés dans un rayon de 500m. Toutes les commandes sont synchronisées pour arriver en même temps. Sélectionnez l'option 'Multi-Restaurant' depuis la page d'accueil pour commencer.",
      },
      {
        q: "Comment fonctionne la commande groupée ?",
        a: "Avec Match Groupes, vous pouvez rejoindre un groupe existant ou en créer un nouveau. Chaque membre commande ses plats individuellement et bénéficie d'une réduction collective (jusqu’à -25%) grâce à la mutualisation de la livraison. Vous pouvez trouver les groupes actifs près de chez vous ou inviter vos proches à rejoindre le vôtre.",
      },
      {
        q: "Puis-je commander pour quelqu'un à une autre adresse ?",
        a: "Oui, grâce à la fonctionnalité Multi-Stop. Vous pouvez ajouter jusqu’à 4 adresses de livraison différentes dans une seule commande. Chaque arrêt a ses propres articles et destinataire. Les frais de livraison sont optimisés et partagés entre les différents arrêts (base 5.90 CHF + 1.50 CHF par arrêt supplémentaire).",
      },
      {
        q: "Mon plat est arrive froid, que faire ?",
        a: "Si vous avez souscrit à la Garantie Qualité (+1.50 CHF), notre système détecte automatiquement les anomalies de température et vous serez remboursé à 100% si la température est inférieure à 55°C. Sans la garantie, signalez le problème via le chat de support avec une photo si possible — notre équipe évaluera la situation et proposera une compensation appropriée.",
      },
    ],
  },
  {
    category: "account",
    questions: [
      {
        q: "Comment créer un compte ?",
        a: "Appuyez sur 'S'inscrire' depuis l'écran de connexion. Vous pouvez créer un compte avec votre email ou vous connecter directement via Google ou Apple. Un email de vérification vous sera envoyé pour confirmer votre adresse. Votre compte vous donne accès à l'historique de commandes, aux points de fidélité, aux adresses enregistrées et à toutes les fonctionnalités de la plateforme.",
      },
      {
        q: "Quels moyens de paiement sont acceptés ?",
        a: "Tok accepte les moyens de paiement suivants : Visa, Mastercard, TWINT, Apple Pay et Google Pay. Vous pouvez également utiliser votre solde de crédit Tok (reçu via des remboursements ou des cadeaux de points). Pour les packs restaurateurs, PostFinance Card et PostFinance E-Finance sont également acceptés.",
      },
      {
        q: "Comment changer mon mode de paiement ?",
        a: "Allez dans 'Profil' > 'Moyens de paiement' pour ajouter, modifier ou supprimer vos cartes bancaires. Vous pouvez enregistrer plusieurs cartes et définir une carte par défaut. Le changement de méthode de paiement est également possible au moment du checkout.",
      },
      {
        q: "Réinitialiser mon mot de passe",
        a: `Cliquez sur 'Mot de passe oublié' sur la page de connexion. Saisissez votre email et vous recevrez un lien de réinitialisation valable 24 heures. Si vous ne recevez pas l'email, vérifiez vos spams ou contactez le support à ${SUPPORT_EMAIL}.`,
      },
      {
        q: "Comment modifier mes informations personnelles ?",
        a: "Rendez-vous dans 'Profil' > 'Informations personnelles' pour modifier votre nom, email, numéro de téléphone ou adresse de livraison par défaut. Certaines modifications (comme l'email) peuvent nécessiter une vérification par email.",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Vous pouvez demander la suppression de votre compte depuis 'Profil' > 'Paramètres' > 'Supprimer mon compte'. Cette action est irréversible et entraîne la perte de vos points de fidélité, crédits, historique de commandes et réservations. La suppression sera effective sous 30 jours. Conformément à la LPD et au RGPD, vos données personnelles seront supprimées de nos serveurs.",
      },
      {
        q: "Mes paiements sont-ils sécurisés ?",
        a: "Absolument. Tous les paiements sont traités par des prestataires certifiés PCI-DSS. Vos informations bancaires ne sont jamais stockées sur nos serveurs — seuls des tokens sécurisés sont utilisés. Chaque transaction est protégée par un chiffrement SSL 256 bits et l'authentification 3D Secure est activée quand nécessaire.",
      },
      {
        q: "Comment ajouter une adresse de livraison ?",
        a: "Depuis 'Profil' > 'Adresses', appuyez sur 'Ajouter une adresse'. Vous pouvez saisir votre adresse manuellement ou utiliser la géolocalisation. Ajoutez des détails pratiques (code d'entrée, étage, interphone) pour faciliter la livraison. Vous pouvez enregistrer plusieurs adresses (domicile, bureau, etc.) et définir une adresse par défaut.",
      },
      {
        q: "J'ai été débité mais ma commande n'a pas été confirmée",
        a: `En cas de débit sans confirmation, vérifiez d'abord votre onglet 'Commandes' — la commande peut être en cours de traitement. Si rien n'apparaît, contactez notre support via le chat ou à ${SUPPORT_EMAIL} avec votre référence de paiement. Nous vérifierons le statut de la transaction et procéderons au remboursement si nécessaire sous 5 à 10 jours ouvrables.`,
      },
      {
        q: "Puis-je me connecter avec Google ou Apple ?",
        a: "Oui, Tok supporte la connexion via Google et Apple. Si vous avez déjà un compte avec le même email, les comptes seront liés automatiquement. Vous pouvez basculer entre les méthodes de connexion à tout moment depuis les paramètres de votre profil.",
      },
    ],
  },
  {
    category: "delivery",
    questions: [
      {
        q: "Quels sont les délais de livraison ?",
        a: "Les délais de livraison varient en général entre 20 et 45 minutes selon la distance, le restaurant et les conditions de circulation. Le délai estimé est affiché avant la validation de votre commande et mis à jour en temps réel pendant la livraison. Vous pouvez suivre la position du livreur sur la carte en direct.",
      },
      {
        q: "Quelles sont les zones de livraison ?",
        a: "Tok livre actuellement dans les principales villes de Suisse romande, dont Genève, Lausanne, et les communes environnantes. La disponibilité est vérifiée automatiquement lorsque vous saisissez votre adresse. Si votre zone n'est pas encore couverte, vous pouvez vous inscrire pour être notifié de son ouverture.",
      },
      {
        q: "Les frais de livraison sont-ils fixes ?",
        a: "Les frais de livraison varient entre 2.90 CHF et 6.90 CHF selon la distance entre le restaurant et votre adresse. Ils sont clairement affichés avant validation. Les abonnés Tok One bénéficient de la livraison gratuite sur les restaurants éligibles (sans minimum de commande). Les commandes groupées (Match Groupes) permettent aussi de réduire les frais par personne.",
      },
      {
        q: "Je ne suis pas chez moi, que se passe-t-il ?",
        a: "Le livreur tentera de vous contacter par téléphone. Si vous êtes injoignable, il attendra 5 minutes maximum sur place. Passé ce délai, la commande sera considérée comme livrée. Pour éviter ce problème, pensez à ajouter des instructions de livraison détaillées (code d'entrée, étage, digicode) et assurez-vous que votre téléphone est joignable.",
      },
      {
        q: "Puis-je programmer une livraison à l'avance ?",
        a: "Oui ! Lors de la commande, sélectionnez l'option 'Programmer' au lieu de 'Dès que possible'. Vous pouvez planifier une livraison jusqu’à 7 jours à l'avance, sous réserve de la disponibilité du restaurant. Vous recevrez un rappel avant l'heure de livraison prévue.",
      },
      {
        q: "Comment fonctionne le click & collect (à emporter) ?",
        a: "Sélectionnez l'option 'À emporter' lors de votre commande. Choisissez l'heure de retrait souhaitée. Vous recevrez une notification lorsque votre commande sera prête à être retirée. Présentez-vous au restaurant avec votre numéro de commande pour récupérer votre repas. Aucun frais de livraison ne s'applique pour les commandes à emporter.",
      },
      {
        q: "Mon livreur ne trouve pas mon adresse",
        a: "Assurez-vous que votre adresse est correcte et complète dans votre profil. Ajoutez des instructions de livraison détaillées (numéro de bâtiment, code d'entrée, étage, interphone). Si le livreur est en difficulté, il vous contactera directement par téléphone. Vous pouvez également suivre sa position sur la carte et le guider par message.",
      },
      {
        q: "Que sont les Créneaux Garantis ?",
        a: "Les Créneaux Garantis vous permettent de choisir un créneau de livraison précis avec une garantie de ponctualité. Trois niveaux sont disponibles : Ultra Précis (±15 min, remboursement à 100% si manqué, +2.50 CHF), Standard (±30 min, 5 CHF de crédit, +1.00 CHF) et Flexible (±60 min, 2 CHF de crédit, gratuit). Si le livreur ne respecte pas le créneau, la compensation est automatique.",
      },
      {
        q: "Comment fonctionne Flex Prix Bas ?",
        a: "Flex Prix Bas vous propose une réduction en échange d'une fenêtre de livraison plus large. Plus la fenêtre est grande, plus la réduction est importante : 1h (-15%), 1h30 (-25%), 2h (-35%), ou fenêtre max 3h (-45%). L'algorithme optimise le meilleur moment de livraison dans votre créneau. Cela réduit aussi l'empreinte carbone en optimisant les trajets (jusqu’à -30% de CO2).",
      },
      {
        q: "Que se passe-t-il si ma commande est en retard ?",
        a: "Si vous avez choisi un Créneau Garanti, la compensation est automatique selon le niveau choisi. Pour les livraisons standards, si le retard dépasse 15 minutes au-delà de l'estimation affichée, contactez le support via le chat. Nous évaluerons la situation et proposerons une compensation (crédit Tok ou livraison gratuite sur la prochaine commande).",
      },
      {
        q: "Livrez-vous le dimanche et les jours fériés ?",
        a: "Oui, la disponibilité de la livraison dépend des horaires d'ouverture des restaurants partenaires. De nombreux restaurants sont ouverts le dimanche et certains jours fériés. Les horaires de chaque restaurant sont affichés sur sa fiche. La plateforme est accessible 7 jours sur 7.",
      },
    ],
  },
  {
    category: "reservations",
    questions: [
      {
        q: "Comment réserver une table ?",
        a: "Rendez-vous sur la page du restaurant souhaité et appuyez sur 'Réserver'. Sélectionnez la date, l'heure et le nombre de convives. Votre réservation sera confirmée instantanément si le créneau est disponible. Vous recevrez une confirmation par notification et par email avec tous les détails.",
      },
      {
        q: "Qu'est-ce que Zéro Attente ?",
        a: "Zéro Attente est une expérience de réservation premium : vous réservez votre table ET précommandez vos plats en même temps, le tout avec un paiement anticipé. À votre arrivée au restaurant, vos plats sont déjà en préparation — vous n'attendez plus. La réservation apparaît dans l'onglet 'Réservations' du restaurant (et non dans les commandes) avec un badge indigo distinctif.",
      },
      {
        q: "Comment fonctionne le paiement Zéro Attente ?",
        a: "Lors de la réservation Zéro Attente, vous sélectionnez vos plats depuis le menu du restaurant, puis vous payez directement via Stripe (carte bancaire, TWINT, PostFinance). Le paiement est sécurisé et le montant inclut les plats précommandés. Dès que le paiement est confirmé, votre réservation est automatiquement validée avec le statut 'Confirmée'.",
      },
      {
        q: "Puis-je annuler une réservation ?",
        a: "L'annulation est possible jusqu’à 2 heures avant l'heure de la réservation. Passé ce délai, une annulation tardive pourrait entraîner des restrictions sur votre compte (signalement no-show). Pour les réservations Zéro Attente (payées), contactez le support pour discuter d'un remboursement ou d'un report de date.",
      },
      {
        q: "Puis-je appliquer une formule à ma réservation ?",
        a: "Oui, si le restaurant propose des formules (entrée + plat, plat + dessert, menu complet), elles sont applicables lors de la commande Zéro Attente. La réduction de la formule sera appliquée automatiquement au total. Les détails de la formule et la réduction apparaissent dans le récapitulatif.",
      },
      {
        q: "Qu'est-ce qu'un La Table du Chef ?",
        a: "Un La Table du Chef est un événement gastronomique exclusif : le chef prépare des plats signature hors-carte en quantité ultra-limitée. Les portions disponibles sont affichées en temps réel et partent très vite. Pour y participer, réservez une table au restaurant et sélectionnez les plats La Table du Chef disponibles. Les abonnés Tok One ont un accès prioritaire.",
      },
      {
        q: "Comment savoir si ma réservation est confirmée ?",
        a: "Après votre réservation, vous recevez une notification et un email de confirmation. Vous pouvez aussi vérifier le statut de toutes vos réservations depuis l'onglet 'Reservations' de votre profil. Les statuts possibles sont : en attente, confirmée, arrivée, annulée et no-show.",
      },
      {
        q: "Que se passe-t-il si je ne me présente pas (no-show) ?",
        a: "Si vous ne vous présentez pas sans avoir annulé au préalable, cela sera enregistré comme un 'no-show'. Des no-shows répétés peuvent entraîner des restrictions sur votre capacité à réserver. Pour les réservations Zéro Attente, le paiement est conservé. Pensez toujours à annuler à l'avance si vos plans changent.",
      },
      {
        q: "Puis-je modifier le nombre de convives après la réservation ?",
        a: "Oui, vous pouvez modifier le nombre de convives tant que le créneau le permet (capacité disponible). Rendez-vous dans les détails de votre réservation et appuyez sur 'Modifier'. Si le restaurant ne peut pas accommoder le nouveau nombre, vous devrez annuler et réserver un autre créneau.",
      },
    ],
  },
  {
    category: "features",
    questions: [
      {
        q: "Qu'est-ce que le Multi-Restaurant ?",
        a: "Le Multi-Restaurant vous permet de composer un repas complet en commandant depuis plusieurs restaurants différents. Choisissez votre entrée chez un restaurant, votre plat chez un autre et votre dessert ailleurs — le tout dans un rayon de 500m. Toutes les préparations sont synchronisées pour que vos plats arrivent en même temps chez vous.",
      },
      {
        q: "Comment fonctionnent les Ventes Flash ?",
        a: "Les Ventes Flash sont des offres limitées dans le temps avec des réductions allant jusqu’à -70%. Elles apparaissent avec un compte à rebours en temps réel. Une fois le délai expiré, l'offre disparaît automatiquement. Activez les notifications pour être alerté des nouvelles ventes flash. Disponible en livraison et à emporter.",
      },
      {
        q: "Comment fonctionne Match Groupes ?",
        a: "Match Groupes permet de mutualiser une livraison avec d'autres personnes de votre quartier. Recherchez les groupes actifs près de chez vous ou créez le vôtre en définissant un créneau, une zone et un nombre maximum de membres. Chaque participant commande individuellement et bénéficie d'une réduction collective (jusqu’à -25%). La réduction CO2 atteint -45% par rapport à des commandes individuelles.",
      },
      {
        q: "Comment fonctionne Multi-Stop ?",
        a: "Multi-Stop vous permet de livrer une seule commande à plusieurs adresses (jusqu’à 4 arrêts). Idéal pour envoyer un repas à des proches ou organiser un dîner à plusieurs endroits. Les frais de livraison sont optimisés : 5.90 CHF de base + 1.50 CHF par arrêt supplémentaire (au lieu de payer une livraison complète par adresse). Pour chaque arrêt, précisez l'adresse, le destinataire et les articles.",
      },
      {
        q: "Qu'est-ce que Budget Auto ?",
        a: "Budget Auto est un outil intelligent qui compose automatiquement un menu optimisé selon vos objectifs (budget, préférences alimentaires, découverte). Définissez votre budget cible et vos critères, et l'algorithme vous propose les meilleures combinaisons de plats disponibles dans les restaurants à proximité.",
      },
      {
        q: "Comment fonctionne l'Abonnement repas hebdomadaire ?",
        a: "L'Abonnement vous permet de planifier vos repas pour toute la semaine. Sélectionnez un restaurant et un plat pour chaque jour. Vous pouvez marquer certains jours comme libres (pas de commande). L'abonnement se renouvelle chaque semaine automatiquement. Vous pouvez mettre en pause votre abonnement (vacances, par exemple) à tout moment sans perdre vos paramètres.",
      },
      {
        q: "Comment offrir des points de fidélité en cadeau ?",
        a: "Rendez-vous dans 'Points cadeau' depuis le menu principal. Choisissez le montant de points à offrir (minimum 100 points), saisissez l'email du destinataire et ajoutez un message personnalisé. Si le destinataire a déjà un compte, les points sont crédités immédiatement. Sinon, un code cadeau lui est envoyé par email, valable 30 jours.",
      },
      {
        q: "Puis-je donner des repas à des personnes dans le besoin ?",
        a: "Oui ! Via le programme de dons solidaires, vous pouvez offrir des repas à des personnes en difficulté. Depuis la page Anti-gaspi, appuyez sur 'Dons Solidaires' et choisissez le nombre de repas à offrir. Vous pouvez aussi convertir vos points de fidélité en dons (1000 points = 1 repas offert). Chaque contribution fait une différence concrète.",
      },
    ],
  },
  {
    category: "antigaspi",
    questions: [
      {
        q: "Qu'est-ce que l'Anti-Gaspi ?",
        a: "Le programme Anti-Gaspi de Tok permet aux restaurants de proposer leurs invendus à prix réduit (jusqu’à -70%) plutôt que de les jeter. Vous contribuez à réduire le gaspillage alimentaire tout en profitant de repas de qualité à petit prix. Plus de 50 000 repas ont été sauvés grâce à ce programme, et nous économisons 942 kg de nourriture par semaine.",
      },
      {
        q: "Comment fonctionnent les Paniers Surprise ?",
        a: "Les Paniers Surprise sont des lots mystère composés par le restaurant avec ses invendus du jour. Vous ne connaissez pas le contenu exact à l'avance, mais vous bénéficiez de réductions allant jusqu’à -70%. Les paniers sont disponibles à des horaires spécifiques (généralement en fin de service midi et soir). Réservez-les vite — ils partent très rapidement !",
      },
      {
        q: "Les produits anti-gaspi sont-ils de bonne qualité ?",
        a: "Absolument. Il s'agit de plats et produits qui n'ont simplement pas été vendus dans la journée. Ils respectent les mêmes normes d'hygiène et de fraîcheur que les commandes régulières. Les restaurants partenaires s'engagent à ne proposer que des produits encore parfaitement consommables.",
      },
      {
        q: "Comment fonctionne le programme de dons solidaires ?",
        a: "Le programme permet de financer des repas pour les personnes en difficulté. Vous pouvez faire un don direct en argent, convertir vos points de fidélité en repas (1000 points = 1 repas) ou arrondir le montant de votre commande au franc supérieur pour la solidarité. Tous les dons sont redistribués à travers notre réseau de partenaires associatifs.",
      },
      {
        q: "Quel est l'impact environnemental de ma commande ?",
        a: "Chaque commande anti-gaspi affiche son impact : poids de nourriture sauvée et équivalent CO2 évité. Au global, Tok a permis de sauver plus de 50 000 repas et d'éviter des tonnes de déchets alimentaires. En utilisant Flex Prix Bas, vous réduisez aussi l'empreinte carbone de la livraison de 8 à 30% grâce à l'optimisation des trajets.",
      },
      {
        q: "À quelles heures sont disponibles les offres anti-gaspi ?",
        a: "Les offres anti-gaspi apparaissent généralement en fin de service (14h-15h pour le midi, 21h-22h pour le soir), quand les restaurants souhaitent écouler leurs invendus. Les horaires varient selon chaque restaurant. Activez les notifications anti-gaspi pour être alerté dès qu'une offre est disponible près de chez vous.",
      },
    ],
  },
  {
    category: "membership",
    questions: [
      {
        q: "Quels sont les avantages de Tok One ?",
        a: "Tok One vous offre : la livraison gratuite sur tous les restaurants éligibles (sans minimum de commande), des réductions exclusives allant jusqu’à 20%, un accès prioritaire aux La Table du Chefs et événements gastronomiques, un accès anticipé aux ventes flash et offres spéciales, un support client prioritaire avec temps de réponse accéléré, et des offres surprises régulières réservées aux membres.",
      },
      {
        q: "Combien coûte l'abonnement Tok One ?",
        a: "L'abonnement Tok One est disponible en deux formules : 9.90 CHF/mois (sans engagement) ou 89.90 CHF/an (soit 2 mois offerts par rapport au tarif mensuel). Vous pouvez essayer gratuitement pendant 14 jours avant d'être facturé. Aucun frais caché.",
      },
      {
        q: "Comment résilier mon abonnement Tok One ?",
        a: "Rendez-vous dans 'Profil' > 'Mon abonnement' > 'Gérer l'abonnement' > 'Résilier'. La résiliation prend effet à la fin de la période en cours (mois ou année), et vous conservez tous vos avantages jusqu’à cette date. Aucun remboursement partiel n'est effectué pour la période entamée. Vous pouvez vous réabonner à tout moment.",
      },
      {
        q: "Quels restaurants sont éligibles à la livraison gratuite ?",
        a: "La grande majorité de nos 500+ restaurants partenaires sont éligibles à la livraison gratuite avec Tok One. Les restaurants éligibles sont identifiés par un badge 'Livraison gratuite' sur leur fiche. Quelques exceptions peuvent s'appliquer pour les restaurants très éloignés ou les commandes avec des frais de livraison exceptionnels.",
      },
      {
        q: "Puis-je partager mon abonnement Tok One ?",
        a: "L'abonnement Tok One est personnel et lié à un seul compte. Il ne peut pas être partagé ou transféré à une autre personne. Cependant, chaque membre de votre foyer peut souscrire à son propre abonnement et bénéficier de la période d'essai gratuite de 14 jours.",
      },
      {
        q: "L'essai gratuit de 14 jours m'engage-t-il ?",
        a: "Non, l'essai gratuit est sans engagement. Vous pouvez résilier à tout moment pendant les 14 jours sans être facturé. Si vous ne résiliez pas, l'abonnement sera activé automatiquement à la fin de la période d'essai au tarif choisi (mensuel ou annuel).",
      },
      {
        q: "Les avantages Tok One sont-ils cumulables avec les promos ?",
        a: "Oui ! Les réductions Tok One sont cumulables avec les codes promo, les offres anti-gaspi et les ventes flash. Vous bénéficiez à la fois de la livraison gratuite et des réductions éventuelles. C'est la combinaison la plus avantageuse pour les utilisateurs réguliers.",
      },
    ],
  },
  {
    category: "loyalty",
    questions: [
      {
        q: "Comment fonctionne le programme de fidélité ?",
        a: "Chaque commande et réservation vous rapporte des points Miamz. Le nombre de points dépend du montant dépensé. Vous pouvez consulter votre solde de points depuis votre profil. Les points sont cumulables et peuvent être convertis en réductions sur vos prochaines commandes, en cadeaux pour vos proches, ou en dons solidaires.",
      },
      {
        q: "Comment utiliser mes points Miamz ?",
        a: "Lors du checkout, vous pouvez appliquer tout ou partie de vos points Miamz pour réduire le montant de votre commande (100 Miamz ~ 1 CHF de réduction). Vous pouvez aussi les offrir en cadeau à un proche ou les convertir en repas solidaires. Rendez-vous dans 'Profil' > 'Mes points' pour voir votre solde et vos options.",
      },
      {
        q: "Mes points de fidélité expirent-ils ?",
        a: "Les points Miamz restent valides tant que votre compte est actif. En cas de suppression de compte, tous les points accumulés sont perdus définitivement. Les points cadeau envoyés à un destinataire ont une validité de 30 jours pour être réclamés.",
      },
      {
        q: "Comment offrir des points à un ami ?",
        a: "Rendez-vous sur la page 'Points cadeau' accessible depuis le menu. Choisissez un montant (100, 250, 500 ou 1000 points, ou un montant personnalisé), saisissez l'email de votre ami et ajoutez un message. Les points sont crédités instantanément si votre ami a déjà un compte Tok. Sinon, il recevra un code cadeau à utiliser lors de son inscription.",
      },
      {
        q: "Existe-t-il des niveaux de fidélité ?",
        a: "Oui, le programme de fidélité comporte différents paliers qui offrent des avantages croissants : réductions supplémentaires, accès anticipé aux offres spéciales, bonus de points multipliés. Plus vous commandez, plus vous montez en niveau et débloquez de récompenses.",
      },
    ],
  },
  {
    category: "quality",
    questions: [
      {
        q: "Qu'est-ce que la Garantie Qualité ?",
        a: "La Garantie Qualité est une option premium (+1.50 CHF par commande) qui vous assure un contrôle qualité complet de votre livraison. Elle inclut : un sac scellé inviolable, un suivi de température en temps réel, une vérification par QR code à la réception, et une compensation automatique en cas d'anomalie détectée.",
      },
      {
        q: "Comment fonctionne la compensation automatique ?",
        a: "Avec la Garantie Qualité, les compensations sont appliquées automatiquement : température inférieure à 55°C = remboursement à 100%, température entre 55-60°C = 50% en crédit Tok, sac endommagé = remboursement à 100% + 5 CHF de crédit, retard supérieur à 15 minutes = livraison gratuite sur la prochaine commande. Aucune démarche de votre part n'est nécessaire.",
      },
      {
        q: "Comment fonctionne le QR code de vérification ?",
        a: "À la réception de votre commande, scannez le QR code sur l'emballage avec l'application Tok. Le scan confirme la chaîne de qualité : température pendant le transport, intégrité du sac et délai de livraison. Si une anomalie est détectée, la compensation est déclenchée automatiquement.",
      },
      {
        q: "Comment les restaurants sont-ils sélectionnés ?",
        a: "Chaque restaurant partenaire passe par un processus de vérification rigoureux avant d'être accepté sur la plateforme. Nous vérifions les normes d'hygiène, la qualité des ingrédients, la régularité du service et les avis clients. Les restaurants sont notés en continu et ceux qui ne maintiennent pas nos standards sont retirés de la plateforme. 80% de nos partenaires sont des restaurants indépendants locaux.",
      },
      {
        q: "Les livreurs sont-ils formes ?",
        a: "Nos livreurs partenaires sont des professionnels indépendants équipés pour garantir la qualité de la livraison. Ils disposent de sacs isothermes pour maintenir la température des plats. Leur performance est suivie en continu : taux d'acceptation, délai moyen de livraison, et retours clients.",
      },
      {
        q: "Comment signaler un problème de qualité ?",
        a: `Si vous rencontrez un problème de qualité (plat froid, emballage endommagé, article non conforme), signalez-le immédiatement via le chat de support ou en envoyant un email à ${SUPPORT_EMAIL} avec votre numéro de commande et une photo si possible. Notre équipe traitera votre réclamation sous 48h ouvrées.`,
      },
    ],
  },
  {
    category: "restaurants",
    questions: [
      {
        q: "Comment inscrire mon restaurant sur Tok ?",
        a: "Rendez-vous sur la page d'inscription restaurateur ou contactez-nous à contact@tok.ch. Notre équipe vous accompagnera dans le processus d'inscription : création de votre profil, digitalisation de votre menu, configuration de vos horaires et de vos modes de service (livraison, emporter, sur place). Le processus prend généralement 48 à 72h.",
      },
      {
        q: "Qu'est-ce que les Packs de Lancement ?",
        a: "Les Packs de Lancement sont des formules d'accompagnement pour les restaurateurs qui souhaitent optimiser leur présence sur Tok. Quatre formules sont disponibles : Découverte (490 CHF), Essentiel (990 CHF), Pro (1 990 CHF, le plus populaire) et Premium (3 490 CHF, VIP). Chaque pack inclut différents services : mise en place du compte, création de menu, photos professionnelles, gestion des réseaux sociaux, campagnes publicitaires, plan de salle digital et account manager dédié.",
      },
      {
        q: "Quels services sont inclus dans chaque pack ?",
        a: "Pack Découverte : mise en place basique + menu jusqu’à 20 plats. Pack Essentiel : mise en place complète + 40 plats + 10 photos pro + réseaux sociaux. Pack Pro : illimité + 25 photos + réseaux sociaux + 1 campagne pub (200 CHF budget) + plan de salle. Pack Premium : tout illimité + account manager dédié + 3 campagnes (500 CHF budget total) + 3 mois de gestion réseaux sociaux.",
      },
      {
        q: "Comment fonctionne le dashboard restaurateur ?",
        a: "Le dashboard vous donne un accès complet à la gestion de votre restaurant sur Tok. Vous y trouvez : vue d'ensemble avec indicateurs clés, gestion des commandes en temps réel, suivi des réservations (y compris Zéro Attente), édition du menu et des prix, galerie photo, performances et statistiques, facturation, gestion des campagnes publicitaires, et pilotage de service. Les sections accessibles dépendent de votre pack de lancement.",
      },
      {
        q: "Comment voir la progression de mon pack de lancement ?",
        a: "Depuis votre dashboard, rendez-vous dans 'Pack de lancement'. Vous y verrez le pack souscrit, une barre de progression globale et le statut de chaque service inclus (en attente, planifié, en cours, terminé). Notre équipe met à jour l'avancement au fur et à mesure des étapes accomplies. Vous recevrez des notifications à chaque mise à jour.",
      },
      {
        q: "Pourquoi certains onglets du dashboard sont-ils verrouillés ?",
        a: "Les onglets accessibles dans votre dashboard dépendent du pack de lancement que vous avez choisi. Les fonctionnalités non incluses dans votre pack sont grisées et marquées d'un cadenas. Par exemple, le plan de salle n'est accessible qu'avec les packs Pro et Premium. Contactez notre équipe pour upgrader votre pack et débloquer de nouvelles fonctionnalités.",
      },
      {
        q: "Comment les réservations Zéro Attente apparaissent-elles dans mon dashboard ?",
        a: "Les réservations Zéro Attente apparaissent dans l'onglet 'Réservations' de votre dashboard (pas dans les commandes). Elles sont visuellement distinctes avec une bordure et un fond indigo, ainsi qu'un badge 'Zéro Attente'. Vous y verrez les détails de la réservation, les plats précommandés, le montant payé et le mode de paiement. Le chiffre d'affaires des Zéro Attente est inclus dans vos statistiques de performance.",
      },
      {
        q: "Comment sont calculées mes performances et mon chiffre d'affaires ?",
        a: "Le chiffre d'affaires affiché dans votre dashboard inclut les revenus des commandes (livraison et à emporter) ainsi que les paiements des réservations Zéro Attente. Les commandes annulées, refusées ou en échec de paiement sont exclues. Vous pouvez consulter vos performances par période (7, 30, 90 jours), voir les graphiques quotidiens, le panier moyen, le taux d'annulation et la satisfaction client.",
      },
      {
        q: "Comment gérer mon plan de salle ?",
        a: "Depuis l'onglet 'Plan de salle' du dashboard (disponible avec les packs Pro et Premium), vous pouvez créer et éditer visuellement votre plan de salle : ajouter des tables, définir leur capacité et leur forme, les disposer dans l'espace, et affecter des réservations aux tables. Le plan de salle est utilisé pour optimiser la gestion des réservations et la capacité de votre restaurant.",
      },
      {
        q: "Comment utiliser Actualités comme outil marketing ?",
        a: "Depuis le dashboard restaurateur, ouvrez 'Actualités'. Choisissez un objectif (notoriété, commandes, réservations, fidélisation ou offre limitée), une audience, un CTA et un modèle de publication. Le score marketing vous indique si le post contient une accroche suffisante, un média, un format adapté, un CTA clair et une programmation utile.",
      },
      {
        q: "Quelles statistiques sont disponibles pour mes actualités ?",
        a: "Le cockpit Actualités affiche les impressions, clics, clics CTA, réactions, commentaires, sauvegardes, partages, taux d'engagement, posts programmés et répartition par objectif marketing. Ces données vous aident à comprendre quels contenus génèrent de la visibilité, des commandes ou des réservations.",
      },
      {
        q: "Qui modere les publications et signalements Actualités ?",
        a: "Les administrateurs Tok peuvent examiner directement les publications, commentaires, reposts et signalements depuis l'espace admin, puis masquer, restaurer, supprimer ou clôturer un signalement sans passer par une console technique. Les contenus trompeurs, illicites ou contraires aux CGU peuvent être retirés.",
      },
      {
        q: "Comment lancer une campagne publicitaire ?",
        a: "Depuis l'onglet 'Campagnes' du dashboard (disponible avec les packs Pro et Premium), créez une campagne en définissant un titre, un budget et une audience cible. La campagne mettra en avant votre restaurant auprès des utilisateurs correspondants. Le paiement se fait à la création de la campagne. Vous pouvez suivre les performances (impressions, clics, conversions) en temps réel.",
      },
    ],
  },
];

export default function Aide() {
  const [search, setSearch] = useState("");
  const [selectedCat, setSelectedCat] = useState<string | null>(null);

  const filteredFaqs = FAQS.filter(
    (f) => !selectedCat || f.category === selectedCat
  )
    .map((section) => ({
      ...section,
      questions: section.questions.filter(
        (q) =>
          q.q.toLowerCase().includes(search.toLowerCase()) ||
          q.a.toLowerCase().includes(search.toLowerCase())
      ),
    }))
    .filter((section) => section.questions.length > 0);

  const totalQuestions = FAQS.reduce(
    (sum, section) => sum + section.questions.length,
    0
  );

  return (
    <div className="min-h-screen bg-background pb-20">
      {/* Header / Search Section */}
      <div className="bg-primary pt-20 pb-16 text-primary-foreground px-6">
        <div className="container max-w-4xl space-y-8">
          <h1 className="text-4xl md:text-5xl font-display font-bold text-center">
            Comment pouvons-nous vous aider ?
          </h1>
          <p className="text-center text-primary-foreground/80 text-lg max-w-2xl mx-auto">
            Parcourez nos {totalQuestions} questions-réponses ou contactez notre
            équipe de support pour une aide personnalisée.
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

      <div className="container max-w-6xl -mt-8 px-6 space-y-12">
        {/* Quick Categories */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
          {CATEGORIES.map((cat) => (
            <button
              key={cat.id}
              onClick={() =>
                setSelectedCat(selectedCat === cat.id ? null : cat.id)
              }
              className={`p-4 rounded-2xl border bg-card shadow-sm transition-all text-left space-y-2
                ${selectedCat === cat.id
                  ? "ring-2 ring-primary border-transparent"
                  : "hover:border-primary/20"
                }`}
            >
              <div className={`${cat.bg} p-2 rounded-xl w-fit`}>
                <cat.icon className={`h-5 w-5 ${cat.color}`} />
              </div>
              <h3 className="font-bold text-xs">{cat.title}</h3>
            </button>
          ))}
        </div>

        {/* Content Section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          {/* FAQ List */}
          <div className="lg:col-span-2 space-y-8">
            <div className="flex items-center justify-between">
              <h2 className="text-2xl font-display font-bold">
                {selectedCat
                  ? CATEGORIES.find((c) => c.id === selectedCat)?.title
                  : "Questions frequentes"}
              </h2>
              {selectedCat && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedCat(null)}
                >
                  Voir tout
                </Button>
              )}
            </div>
            <div className="space-y-6">
              {filteredFaqs.map((section) => (
                <div key={section.category} className="space-y-3">
                  {!selectedCat && (
                    <button
                      onClick={() => setSelectedCat(section.category)}
                      className="flex items-center gap-2 group"
                    >
                      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide pt-2 group-hover:text-primary transition-colors">
                        {
                          CATEGORIES.find((c) => c.id === section.category)
                            ?.title
                        }
                      </h3>
                      <span className="text-xs text-muted-foreground bg-muted px-2 py-0.5 rounded-full mt-2">
                        {section.questions.length}
                      </span>
                    </button>
                  )}
                  <Accordion type="single" collapsible className="w-full">
                    {section.questions.map((item, i) => (
                      <AccordionItem
                        key={i}
                        value={`${section.category}-${i}`}
                        className="border rounded-xl px-4 py-1 mb-3 bg-card shadow-sm"
                      >
                        <AccordionTrigger className="hover:no-underline font-semibold text-left">
                          {item.q}
                        </AccordionTrigger>
                        <AccordionContent className="text-muted-foreground text-sm leading-relaxed whitespace-pre-line">
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
                <p className="font-medium">Aucun resultat trouve</p>
                <p className="text-sm">
                  Essayez avec d'autres mots-clés ou contactez notre support.
                </p>
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
                Un problème urgent avec une commande en cours ? Utilisez notre
                chat interactif pour une aide immédiate.
              </p>
              <Button
                className="w-full rounded-xl gap-2 font-bold"
                onClick={() => window.openChat && window.openChat()}
              >
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
                    <p className="text-xs text-muted-foreground">
                      {SUPPORT_EMAIL}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Réponse sous 24h
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Téléphone</p>
                    <p className="text-xs text-muted-foreground">
                      0800 MIAMZ (64269)
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Lun-Ven, 9h-21h
                    </p>
                  </div>
                </div>
              </div>
              <Link to="/contact">
                <Button
                  variant="outline"
                  className="w-full rounded-xl gap-2 font-bold mt-2"
                >
                  Page de contact <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="p-6 rounded-2xl border space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <UtensilsCrossed className="h-5 w-5 text-muted-foreground" />
                Vous êtes restaurateur ?
              </h3>
              <p className="text-sm text-muted-foreground">
                Découvrez nos packs de lancement et rejoignez les 500+
                restaurants partenaires de Tok.
              </p>
              <Link to="/packs-restaurateur">
                <Button
                  variant="outline"
                  className="w-full rounded-xl gap-2 font-bold mt-1"
                >
                  Packs restaurateurs <ChevronRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>

            <div className="p-6 rounded-2xl border space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-muted-foreground" />
                Liens utiles
              </h3>
              <div className="space-y-2">
                <Link
                  to="/cgu"
                  className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
                >
                  Conditions générales <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/politique-confidentialite"
                  className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
                >
                  Politique de confidentialite{" "}
                  <ChevronRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/a-propos"
                  className="flex items-center gap-1 text-sm text-primary font-semibold hover:underline"
                >
                  À propos de Tok <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>

        <TokAiSupportChat context={{ page: "aide" }} compact />
      </div>
    </div>
  );
}
