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
    title: "Fonctionnalites",
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
    title: "Fidelite & Points",
    icon: Star,
    color: "text-yellow-600",
    bg: "bg-yellow-50",
  },
  {
    id: "quality",
    title: "Qualite & Securite",
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
        a: "Vous pouvez suivre votre commande en temps reel depuis l'onglet 'Commandes' de votre profil. Une fois le livreur en route, vous verrez sa position sur la carte avec une estimation du temps d'arrivee. Vous recevrez aussi des notifications a chaque etape : confirmation par le restaurant, debut de preparation, livreur en route, et arrivee imminente.",
      },
      {
        q: "Comment annuler une commande ?",
        a: "L'annulation est possible tant que le restaurant n'a pas commence la preparation. Rendez-vous dans les details de votre commande et appuyez sur 'Annuler la commande'. Si l'option n'apparait plus, le restaurant a deja debute la preparation et l'annulation n'est plus possible. Le remboursement est effectue sous 5 a 10 jours ouvrables sur votre moyen de paiement d'origine.",
      },
      {
        q: "Il manque un article dans ma commande",
        a: "Nous en sommes desoles. Signalez le probleme via le chat de support ou contactez-nous directement a support@tok.ch en precisant votre numero de commande et l'article manquant. Apres verification aupres du restaurant, un remboursement partiel ou un credit Tok sera applique sous 48h.",
      },
      {
        q: "Comment modifier ma commande apres validation ?",
        a: "Pour toute modification apres validation, contactez notre support via le chat en bas de page dans les premieres minutes suivant votre commande. Passe le debut de preparation par le restaurant, la modification n'est plus possible — vous devrez annuler la commande et en passer une nouvelle.",
      },
      {
        q: "Comment utiliser un code promo ?",
        a: "Lors du recapitulatif de commande, appuyez sur 'Ajouter un code promo' et saisissez votre code. La reduction sera appliquee automatiquement au montant total. Les codes promos ne sont pas cumulables sauf mention contraire. Chaque code a une date d'expiration et des conditions d'utilisation specifiques (montant minimum, restaurants eligibles, etc.).",
      },
      {
        q: "Je souhaite demander un remboursement",
        a: "Rendez-vous dans l'historique de vos commandes, selectionnez la commande concernee, puis appuyez sur 'Signaler un probleme'. Decrivez le souci rencontre (article manquant, qualite insatisfaisante, retard excessif) et notre equipe traitera votre demande sous 48h ouvrees. Le remboursement sera effectue sur votre moyen de paiement d'origine ou en credit Tok, selon la nature du probleme.",
      },
      {
        q: "Puis-je repasser la meme commande ?",
        a: "Oui ! Depuis votre historique de commandes, appuyez sur 'Commander a nouveau' sur n'importe quelle commande passee. Le panier sera pre-rempli avec les memes articles, sous reserve de disponibilite au restaurant. Vous pourrez modifier les quantites ou ajouter d'autres articles avant de valider.",
      },
      {
        q: "Comment commander depuis plusieurs restaurants en une seule commande ?",
        a: "Avec la fonctionnalite Multi-Restaurant, vous pouvez composer un repas complet en choisissant une entree, un plat et un dessert depuis differents restaurants situes dans un rayon de 500m. Toutes les commandes sont synchronisees pour arriver en meme temps. Selectionnez l'option 'Multi-Restaurant' depuis la page d'accueil pour commencer.",
      },
      {
        q: "Comment fonctionne la commande groupee ?",
        a: "Avec Match Groupes, vous pouvez rejoindre un groupe existant ou en creer un nouveau. Chaque membre commande ses plats individuellement et beneficie d'une reduction collective (jusqu'a -25%) grace a la mutualisation de la livraison. Vous pouvez trouver les groupes actifs pres de chez vous ou inviter vos proches a rejoindre le votre.",
      },
      {
        q: "Puis-je commander pour quelqu'un a une autre adresse ?",
        a: "Oui, grace a la fonctionnalite Multi-Stop. Vous pouvez ajouter jusqu'a 4 adresses de livraison differentes dans une seule commande. Chaque arret a ses propres articles et destinataire. Les frais de livraison sont optimises et partages entre les differents arrets (base 5.90 CHF + 1.50 CHF par arret supplementaire).",
      },
      {
        q: "Mon plat est arrive froid, que faire ?",
        a: "Si vous avez souscrit a la Garantie Qualite (+1.50 CHF), notre systeme detecte automatiquement les anomalies de temperature et vous serez rembourse a 100% si la temperature est inferieure a 55°C. Sans la garantie, signalez le probleme via le chat de support avec une photo si possible — notre equipe evaluera la situation et proposera une compensation appropriee.",
      },
    ],
  },
  {
    category: "account",
    questions: [
      {
        q: "Comment creer un compte ?",
        a: "Appuyez sur 'S'inscrire' depuis l'ecran de connexion. Vous pouvez creer un compte avec votre email ou vous connecter directement via Google ou Apple. Un email de verification vous sera envoye pour confirmer votre adresse. Votre compte vous donne acces a l'historique de commandes, aux points de fidelite, aux adresses enregistrees et a toutes les fonctionnalites de la plateforme.",
      },
      {
        q: "Quels moyens de paiement sont acceptes ?",
        a: "Tok accepte les moyens de paiement suivants : Visa, Mastercard, TWINT, Apple Pay et Google Pay. Vous pouvez egalement utiliser votre solde de credit Tok (recu via des remboursements ou des cadeaux de points). Pour les packs restaurateurs, PostFinance Card et PostFinance E-Finance sont egalement acceptes.",
      },
      {
        q: "Comment changer mon mode de paiement ?",
        a: "Allez dans 'Profil' > 'Moyens de paiement' pour ajouter, modifier ou supprimer vos cartes bancaires. Vous pouvez enregistrer plusieurs cartes et definir une carte par defaut. Le changement de methode de paiement est egalement possible au moment du checkout.",
      },
      {
        q: "Reinitialiser mon mot de passe",
        a: "Cliquez sur 'Mot de passe oublie' sur la page de connexion. Saisissez votre email et vous recevrez un lien de reinitialisation valable 24 heures. Si vous ne recevez pas l'email, verifiez vos spams ou contactez le support a support@tok.ch.",
      },
      {
        q: "Comment modifier mes informations personnelles ?",
        a: "Rendez-vous dans 'Profil' > 'Informations personnelles' pour modifier votre nom, email, numero de telephone ou adresse de livraison par defaut. Certaines modifications (comme l'email) peuvent necessiter une verification par email.",
      },
      {
        q: "Comment supprimer mon compte ?",
        a: "Vous pouvez demander la suppression de votre compte depuis 'Profil' > 'Parametres' > 'Supprimer mon compte'. Cette action est irreversible et entraine la perte de vos points de fidelite, credits, historique de commandes et reservations. La suppression sera effective sous 30 jours. Conformement a la LPD et au RGPD, vos donnees personnelles seront supprimees de nos serveurs.",
      },
      {
        q: "Mes paiements sont-ils securises ?",
        a: "Absolument. Tous les paiements sont traites par des prestataires certifies PCI-DSS. Vos informations bancaires ne sont jamais stockees sur nos serveurs — seuls des tokens securises sont utilises. Chaque transaction est protegee par un chiffrement SSL 256 bits et l'authentification 3D Secure est activee quand necessaire.",
      },
      {
        q: "Comment ajouter une adresse de livraison ?",
        a: "Depuis 'Profil' > 'Adresses', appuyez sur 'Ajouter une adresse'. Vous pouvez saisir votre adresse manuellement ou utiliser la geolocalisation. Ajoutez des details pratiques (code d'entree, etage, interphone) pour faciliter la livraison. Vous pouvez enregistrer plusieurs adresses (domicile, bureau, etc.) et definir une adresse par defaut.",
      },
      {
        q: "J'ai ete debite mais ma commande n'a pas ete confirmee",
        a: "En cas de debit sans confirmation, verifiez d'abord votre onglet 'Commandes' — la commande peut etre en cours de traitement. Si rien n'apparait, contactez notre support via le chat ou a support@tok.ch avec votre reference de paiement. Nous verifierons le statut de la transaction et procederons au remboursement si necessaire sous 5 a 10 jours ouvrables.",
      },
      {
        q: "Puis-je me connecter avec Google ou Apple ?",
        a: "Oui, Tok supporte la connexion via Google et Apple. Si vous avez deja un compte avec le meme email, les comptes seront lies automatiquement. Vous pouvez basculer entre les methodes de connexion a tout moment depuis les parametres de votre profil.",
      },
    ],
  },
  {
    category: "delivery",
    questions: [
      {
        q: "Quels sont les delais de livraison ?",
        a: "Les delais de livraison varient en general entre 20 et 45 minutes selon la distance, le restaurant et les conditions de circulation. Le delai estime est affiche avant la validation de votre commande et mis a jour en temps reel pendant la livraison. Vous pouvez suivre la position du livreur sur la carte en direct.",
      },
      {
        q: "Quelles sont les zones de livraison ?",
        a: "Tok livre actuellement dans les principales villes de Suisse romande, dont Geneve, Lausanne, et les communes environnantes. La disponibilite est verifiee automatiquement lorsque vous saisissez votre adresse. Si votre zone n'est pas encore couverte, vous pouvez vous inscrire pour etre notifie de son ouverture.",
      },
      {
        q: "Les frais de livraison sont-ils fixes ?",
        a: "Les frais de livraison varient entre 2.90 CHF et 6.90 CHF selon la distance entre le restaurant et votre adresse. Ils sont clairement affiches avant validation. Les abonnes Tok One beneficient de la livraison gratuite sur les restaurants eligibles (sans minimum de commande). Les commandes groupees (Match Groupes) permettent aussi de reduire les frais par personne.",
      },
      {
        q: "Je ne suis pas chez moi, que se passe-t-il ?",
        a: "Le livreur tentera de vous contacter par telephone. Si vous etes injoignable, il attendra 5 minutes maximum sur place. Passe ce delai, la commande sera consideree comme livree. Pour eviter ce probleme, pensez a ajouter des instructions de livraison detaillees (code d'entree, etage, digicode) et assurez-vous que votre telephone est joignable.",
      },
      {
        q: "Puis-je programmer une livraison a l'avance ?",
        a: "Oui ! Lors de la commande, selectionnez l'option 'Programmer' au lieu de 'Des que possible'. Vous pouvez planifier une livraison jusqu'a 7 jours a l'avance, sous reserve de la disponibilite du restaurant. Vous recevrez un rappel avant l'heure de livraison prevue.",
      },
      {
        q: "Comment fonctionne le click & collect (a emporter) ?",
        a: "Selectionnez l'option 'A emporter' lors de votre commande. Choisissez l'heure de retrait souhaitee. Vous recevrez une notification lorsque votre commande sera prete a etre retiree. Presentez-vous au restaurant avec votre numero de commande pour recuperer votre repas. Aucun frais de livraison ne s'applique pour les commandes a emporter.",
      },
      {
        q: "Mon livreur ne trouve pas mon adresse",
        a: "Assurez-vous que votre adresse est correcte et complete dans votre profil. Ajoutez des instructions de livraison detaillees (numero de batiment, code d'entree, etage, interphone). Si le livreur est en difficulte, il vous contactera directement par telephone. Vous pouvez egalement suivre sa position sur la carte et le guider par message.",
      },
      {
        q: "Que sont les Creneaux Garantis ?",
        a: "Les Creneaux Garantis vous permettent de choisir un creneau de livraison precis avec une garantie de ponctualite. Trois niveaux sont disponibles : Ultra Precis (±15 min, remboursement a 100% si manque, +2.50 CHF), Standard (±30 min, 5 CHF de credit, +1.00 CHF) et Flexible (±60 min, 2 CHF de credit, gratuit). Si le livreur ne respecte pas le creneau, la compensation est automatique.",
      },
      {
        q: "Comment fonctionne Flex Prix Bas ?",
        a: "Flex Prix Bas vous propose une reduction en echange d'une fenetre de livraison plus large. Plus la fenetre est grande, plus la reduction est importante : 1h (-15%), 1h30 (-25%), 2h (-35%), ou fenetre max 3h (-45%). L'algorithme optimise le meilleur moment de livraison dans votre creneau. Cela reduit aussi l'empreinte carbone en optimisant les trajets (jusqu'a -30% de CO2).",
      },
      {
        q: "Que se passe-t-il si ma commande est en retard ?",
        a: "Si vous avez choisi un Creneau Garanti, la compensation est automatique selon le niveau choisi. Pour les livraisons standards, si le retard depasse 15 minutes au-dela de l'estimation affichee, contactez le support via le chat. Nous evaluerons la situation et proposerons une compensation (credit Tok ou livraison gratuite sur la prochaine commande).",
      },
      {
        q: "Livrez-vous le dimanche et les jours feries ?",
        a: "Oui, la disponibilite de la livraison depend des horaires d'ouverture des restaurants partenaires. De nombreux restaurants sont ouverts le dimanche et certains jours feries. Les horaires de chaque restaurant sont affiches sur sa fiche. La plateforme est accessible 7 jours sur 7.",
      },
    ],
  },
  {
    category: "reservations",
    questions: [
      {
        q: "Comment reserver une table ?",
        a: "Rendez-vous sur la page du restaurant souhaite et appuyez sur 'Reserver'. Selectionnez la date, l'heure et le nombre de convives. Votre reservation sera confirmee instantanement si le creneau est disponible. Vous recevrez une confirmation par notification et par email avec tous les details.",
      },
      {
        q: "Qu'est-ce que Zero Attente ?",
        a: "Zero Attente est une experience de reservation premium : vous reservez votre table ET precommandez vos plats en meme temps, le tout avec un paiement anticipe. A votre arrivee au restaurant, vos plats sont deja en preparation — vous n'attendez plus. La reservation apparait dans l'onglet 'Reservations' du restaurant (et non dans les commandes) avec un badge indigo distinctif.",
      },
      {
        q: "Comment fonctionne le paiement Zero Attente ?",
        a: "Lors de la reservation Zero Attente, vous selectionnez vos plats depuis le menu du restaurant, puis vous payez directement via Stripe (carte bancaire, TWINT, PostFinance). Le paiement est securise et le montant inclut les plats precommandes. Des que le paiement est confirme, votre reservation est automatiquement validee avec le statut 'Confirmee'.",
      },
      {
        q: "Puis-je annuler une reservation ?",
        a: "L'annulation est possible jusqu'a 2 heures avant l'heure de la reservation. Passee ce delai, une annulation tardive pourrait entrainer des restrictions sur votre compte (signalement no-show). Pour les reservations Zero Attente (payees), contactez le support pour discuter d'un remboursement ou d'un report de date.",
      },
      {
        q: "Puis-je appliquer une formule a ma reservation ?",
        a: "Oui, si le restaurant propose des formules (entree + plat, plat + dessert, menu complet), elles sont applicables lors de la commande Zero Attente. La reduction de la formule sera appliquee automatiquement au total. Les details de la formule et la reduction apparaissent dans le recapitulatif.",
      },
      {
        q: "Qu'est-ce qu'un Chef's Table ?",
        a: "Un Chef's Table est un evenement gastronomique exclusif : le chef prepare des plats signature hors-carte en quantite ultra-limitee. Les portions disponibles sont affichees en temps reel et partent tres vite. Pour y participer, reservez une table au restaurant et selectionnez les plats Chef's Table disponibles. Les abonnes Tok One ont un acces prioritaire.",
      },
      {
        q: "Comment savoir si ma reservation est confirmee ?",
        a: "Apres votre reservation, vous recevez une notification et un email de confirmation. Vous pouvez aussi verifier le statut de toutes vos reservations depuis l'onglet 'Reservations' de votre profil. Les statuts possibles sont : en attente, confirmee, arrivee, annulee et no-show.",
      },
      {
        q: "Que se passe-t-il si je ne me presente pas (no-show) ?",
        a: "Si vous ne vous presentez pas sans avoir annule au prealable, cela sera enregistre comme un 'no-show'. Des no-shows repetes peuvent entrainer des restrictions sur votre capacite a reserver. Pour les reservations Zero Attente, le paiement est conserve. Pensez toujours a annuler a l'avance si vos plans changent.",
      },
      {
        q: "Puis-je modifier le nombre de convives apres la reservation ?",
        a: "Oui, vous pouvez modifier le nombre de convives tant que le creneau le permet (capacite disponible). Rendez-vous dans les details de votre reservation et appuyez sur 'Modifier'. Si le restaurant ne peut pas accommoder le nouveau nombre, vous devrez annuler et reserver un autre creneau.",
      },
    ],
  },
  {
    category: "features",
    questions: [
      {
        q: "Qu'est-ce que le Multi-Restaurant ?",
        a: "Le Multi-Restaurant vous permet de composer un repas complet en commandant depuis plusieurs restaurants differents. Choisissez votre entree chez un restaurant, votre plat chez un autre et votre dessert ailleurs — le tout dans un rayon de 500m. Toutes les preparations sont synchronisees pour que vos plats arrivent en meme temps chez vous.",
      },
      {
        q: "Comment fonctionnent les Ventes Flash ?",
        a: "Les Ventes Flash sont des offres limitees dans le temps avec des reductions allant jusqu'a -70%. Elles apparaissent avec un compte a rebours en temps reel. Une fois le delai expire, l'offre disparait automatiquement. Activez les notifications pour etre alerte des nouvelles ventes flash. Disponible en livraison et a emporter.",
      },
      {
        q: "Comment fonctionne Match Groupes ?",
        a: "Match Groupes permet de mutualiser une livraison avec d'autres personnes de votre quartier. Recherchez les groupes actifs pres de chez vous ou creez le votre en definissant un creneau, une zone et un nombre maximum de membres. Chaque participant commande individuellement et beneficie d'une reduction collective (jusqu'a -25%). La reduction CO2 atteint -45% par rapport a des commandes individuelles.",
      },
      {
        q: "Comment fonctionne Multi-Stop ?",
        a: "Multi-Stop vous permet de livrer une seule commande a plusieurs adresses (jusqu'a 4 arrets). Idéal pour envoyer un repas a des proches ou organiser un diner a plusieurs endroits. Les frais de livraison sont optimises : 5.90 CHF de base + 1.50 CHF par arret supplementaire (au lieu de payer une livraison complete par adresse). Pour chaque arret, precisez l'adresse, le destinataire et les articles.",
      },
      {
        q: "Qu'est-ce que Budget Auto ?",
        a: "Budget Auto est un outil intelligent qui compose automatiquement un menu optimise selon vos objectifs (budget, preferences alimentaires, decouverte). Definissez votre budget cible et vos criteres, et l'algorithme vous propose les meilleures combinaisons de plats disponibles dans les restaurants a proximite.",
      },
      {
        q: "Comment fonctionne l'Abonnement repas hebdomadaire ?",
        a: "L'Abonnement vous permet de planifier vos repas pour toute la semaine. Selectionnez un restaurant et un plat pour chaque jour. Vous pouvez marquer certains jours comme libres (pas de commande). L'abonnement se renouvelle chaque semaine automatiquement. Vous pouvez mettre en pause votre abonnement (vacances, par exemple) a tout moment sans perdre vos parametres.",
      },
      {
        q: "Comment offrir des points de fidelite en cadeau ?",
        a: "Rendez-vous dans 'Points cadeau' depuis le menu principal. Choisissez le montant de points a offrir (minimum 100 points), saisissez l'email du destinataire et ajoutez un message personnalise. Si le destinataire a deja un compte, les points sont credites immediatement. Sinon, un code cadeau lui est envoye par email, valable 30 jours.",
      },
      {
        q: "Puis-je donner des repas a des personnes dans le besoin ?",
        a: "Oui ! Via le programme de dons solidaires, vous pouvez offrir des repas a des personnes en difficulte. Depuis la page Anti-gaspi, appuyez sur 'Dons Solidaires' et choisissez le nombre de repas a offrir. Vous pouvez aussi convertir vos points de fidelite en dons (1000 points = 1 repas offert). Chaque contribution fait une difference concrete.",
      },
    ],
  },
  {
    category: "antigaspi",
    questions: [
      {
        q: "Qu'est-ce que l'Anti-Gaspi ?",
        a: "Le programme Anti-Gaspi de Tok permet aux restaurants de proposer leurs invendus a prix reduit (jusqu'a -70%) plutot que de les jeter. Vous contribuez a reduire le gaspillage alimentaire tout en profitant de repas de qualite a petit prix. Plus de 50 000 repas ont ete sauves grace a ce programme, et nous economisons 942 kg de nourriture par semaine.",
      },
      {
        q: "Comment fonctionnent les Paniers Surprise ?",
        a: "Les Paniers Surprise sont des lots mystere composes par le restaurant avec ses invendus du jour. Vous ne connaissez pas le contenu exact a l'avance, mais vous beneficiez de reductions allant jusqu'a -70%. Les paniers sont disponibles a des horaires specifiques (generalement en fin de service midi et soir). Reservez-les vite — ils partent tres rapidement !",
      },
      {
        q: "Les produits anti-gaspi sont-ils de bonne qualite ?",
        a: "Absolument. Il s'agit de plats et produits qui n'ont simplement pas ete vendus dans la journee. Ils respectent les memes normes d'hygiene et de fraicheur que les commandes regulieres. Les restaurants partenaires s'engagent a ne proposer que des produits encore parfaitement consommables.",
      },
      {
        q: "Comment fonctionne le programme de dons solidaires ?",
        a: "Le programme permet de financer des repas pour les personnes en difficulte. Vous pouvez faire un don direct en argent, convertir vos points de fidelite en repas (1000 points = 1 repas) ou arrondir le montant de votre commande au franc superieur pour la solidarite. Tous les dons sont redistribues a travers notre reseau de partenaires associatifs.",
      },
      {
        q: "Quel est l'impact environnemental de ma commande ?",
        a: "Chaque commande anti-gaspi affiche son impact : poids de nourriture sauvee et equivalent CO2 evite. Au global, Tok a permis de sauver plus de 50 000 repas et d'eviter des tonnes de dechets alimentaires. En utilisant Flex Prix Bas, vous reduisez aussi l'empreinte carbone de la livraison de 8 a 30% grace a l'optimisation des trajets.",
      },
      {
        q: "A quelles heures sont disponibles les offres anti-gaspi ?",
        a: "Les offres anti-gaspi apparaissent generalement en fin de service (14h-15h pour le midi, 21h-22h pour le soir), quand les restaurants souhaitent ecouler leurs invendus. Les horaires varient selon chaque restaurant. Activez les notifications anti-gaspi pour etre alerte des qu'une offre est disponible pres de chez vous.",
      },
    ],
  },
  {
    category: "membership",
    questions: [
      {
        q: "Quels sont les avantages de Tok One ?",
        a: "Tok One vous offre : la livraison gratuite sur tous les restaurants eligibles (sans minimum de commande), des reductions exclusives allant jusqu'a 20%, un acces prioritaire aux Chef's Tables et evenements gastronomiques, un acces anticipe aux ventes flash et offres speciales, un support client prioritaire avec temps de reponse accelere, et des offres surprises regulieres reservees aux membres.",
      },
      {
        q: "Combien coute l'abonnement Tok One ?",
        a: "L'abonnement Tok One est disponible en deux formules : 9.90 CHF/mois (sans engagement) ou 89.90 CHF/an (soit 2 mois offerts par rapport au tarif mensuel). Vous pouvez essayer gratuitement pendant 14 jours avant d'etre facture. Aucun frais cache.",
      },
      {
        q: "Comment resilier mon abonnement Tok One ?",
        a: "Rendez-vous dans 'Profil' > 'Mon abonnement' > 'Gerer l'abonnement' > 'Resilier'. La resiliation prend effet a la fin de la periode en cours (mois ou annee), et vous conservez tous vos avantages jusqu'a cette date. Aucun remboursement partiel n'est effectue pour la periode entamee. Vous pouvez vous reabonner a tout moment.",
      },
      {
        q: "Quels restaurants sont eligibles a la livraison gratuite ?",
        a: "La grande majorite de nos 500+ restaurants partenaires sont eligibles a la livraison gratuite avec Tok One. Les restaurants eligibles sont identifies par un badge 'Livraison gratuite' sur leur fiche. Quelques exceptions peuvent s'appliquer pour les restaurants tres eloignes ou les commandes avec des frais de livraison exceptionnels.",
      },
      {
        q: "Puis-je partager mon abonnement Tok One ?",
        a: "L'abonnement Tok One est personnel et lie a un seul compte. Il ne peut pas etre partage ou transfere a une autre personne. Cependant, chaque membre de votre foyer peut souscrire a son propre abonnement et beneficier de la periode d'essai gratuite de 14 jours.",
      },
      {
        q: "L'essai gratuit de 14 jours m'engage-t-il ?",
        a: "Non, l'essai gratuit est sans engagement. Vous pouvez resilier a tout moment pendant les 14 jours sans etre facture. Si vous ne resiliez pas, l'abonnement sera active automatiquement a la fin de la periode d'essai au tarif choisi (mensuel ou annuel).",
      },
      {
        q: "Les avantages Tok One sont-ils cumulables avec les promos ?",
        a: "Oui ! Les reductions Tok One sont cumulables avec les codes promo, les offres anti-gaspi et les ventes flash. Vous beneficiez a la fois de la livraison gratuite et des reductions eventuelles. C'est la combinaison la plus avantageuse pour les utilisateurs reguliers.",
      },
    ],
  },
  {
    category: "loyalty",
    questions: [
      {
        q: "Comment fonctionne le programme de fidelite ?",
        a: "Chaque commande et reservation vous rapporte des points Miamz. Le nombre de points depend du montant depense. Vous pouvez consulter votre solde de points depuis votre profil. Les points sont cumulables et peuvent etre convertis en reductions sur vos prochaines commandes, en cadeaux pour vos proches, ou en dons solidaires.",
      },
      {
        q: "Comment utiliser mes points Miamz ?",
        a: "Lors du checkout, vous pouvez appliquer tout ou partie de vos points Miamz pour reduire le montant de votre commande (100 Miamz ~ 1 CHF de reduction). Vous pouvez aussi les offrir en cadeau a un proche ou les convertir en repas solidaires. Rendez-vous dans 'Profil' > 'Mes points' pour voir votre solde et vos options.",
      },
      {
        q: "Mes points de fidelite expirent-ils ?",
        a: "Les points Miamz restent valides tant que votre compte est actif. En cas de suppression de compte, tous les points accumules sont perdus definitivement. Les points cadeau envoyes a un destinataire ont une validite de 30 jours pour etre reclames.",
      },
      {
        q: "Comment offrir des points a un ami ?",
        a: "Rendez-vous sur la page 'Points cadeau' accessible depuis le menu. Choisissez un montant (100, 250, 500 ou 1000 points, ou un montant personnalise), saisissez l'email de votre ami et ajoutez un message. Les points sont credites instantanement si votre ami a deja un compte Tok. Sinon, il recevra un code cadeau a utiliser lors de son inscription.",
      },
      {
        q: "Existe-t-il des niveaux de fidelite ?",
        a: "Oui, le programme de fidelite comporte differents paliers qui offrent des avantages croissants : reductions supplementaires, acces anticipe aux offres speciales, bonus de points multiplies. Plus vous commandez, plus vous montez en niveau et debloquez de recompenses.",
      },
    ],
  },
  {
    category: "quality",
    questions: [
      {
        q: "Qu'est-ce que la Garantie Qualite ?",
        a: "La Garantie Qualite est une option premium (+1.50 CHF par commande) qui vous assure un controle qualite complet de votre livraison. Elle inclut : un sac scelle inviolable, un suivi de temperature en temps reel, une verification par QR code a la reception, et une compensation automatique en cas d'anomalie detectee.",
      },
      {
        q: "Comment fonctionne la compensation automatique ?",
        a: "Avec la Garantie Qualite, les compensations sont appliquees automatiquement : temperature inferieure a 55°C = remboursement a 100%, temperature entre 55-60°C = 50% en credit Tok, sac endommage = remboursement a 100% + 5 CHF de credit, retard superieur a 15 minutes = livraison gratuite sur la prochaine commande. Aucune demarche de votre part n'est necessaire.",
      },
      {
        q: "Comment fonctionne le QR code de verification ?",
        a: "A la reception de votre commande, scannez le QR code sur l'emballage avec l'application Tok. Le scan confirme la chaine de qualite : temperature pendant le transport, integrite du sac et delai de livraison. Si une anomalie est detectee, la compensation est declenchee automatiquement.",
      },
      {
        q: "Comment les restaurants sont-ils selectionnes ?",
        a: "Chaque restaurant partenaire passe par un processus de verification rigoureux avant d'etre accepte sur la plateforme. Nous verifions les normes d'hygiene, la qualite des ingredients, la regularite du service et les avis clients. Les restaurants sont notes en continu et ceux qui ne maintiennent pas nos standards sont retires de la plateforme. 80% de nos partenaires sont des restaurants independants locaux.",
      },
      {
        q: "Les livreurs sont-ils formes ?",
        a: "Nos livreurs partenaires sont des professionnels independants equipes pour garantir la qualite de la livraison. Ils disposent de sacs isothermes pour maintenir la temperature des plats. Leur performance est suivie en continu : taux d'acceptation, delai moyen de livraison, et retours clients.",
      },
      {
        q: "Comment signaler un probleme de qualite ?",
        a: "Si vous rencontrez un probleme de qualite (plat froid, emballage endommage, article non conforme), signalez-le immediatement via le chat de support ou en envoyant un email a support@tok.ch avec votre numero de commande et une photo si possible. Notre equipe traitera votre reclamation sous 48h ouvrees.",
      },
    ],
  },
  {
    category: "restaurants",
    questions: [
      {
        q: "Comment inscrire mon restaurant sur Tok ?",
        a: "Rendez-vous sur la page d'inscription restaurateur ou contactez-nous a contact@tok.ch. Notre equipe vous accompagnera dans le processus d'inscription : creation de votre profil, digitalisation de votre menu, configuration de vos horaires et de vos modes de service (livraison, emporter, sur place). Le processus prend generalement 48 a 72h.",
      },
      {
        q: "Qu'est-ce que les Packs de Lancement ?",
        a: "Les Packs de Lancement sont des formules d'accompagnement pour les restaurateurs qui souhaitent optimiser leur presence sur Tok. Quatre formules sont disponibles : Decouverte (490 CHF), Essentiel (990 CHF), Pro (1 990 CHF, le plus populaire) et Premium (3 490 CHF, VIP). Chaque pack inclut differents services : mise en place du compte, creation de menu, photos professionnelles, gestion des reseaux sociaux, campagnes publicitaires, plan de salle digital et account manager dedie.",
      },
      {
        q: "Quels services sont inclus dans chaque pack ?",
        a: "Pack Decouverte : mise en place basique + menu jusqu'a 20 plats. Pack Essentiel : mise en place complete + 40 plats + 10 photos pro + reseaux sociaux. Pack Pro : illimite + 25 photos + reseaux sociaux + 1 campagne pub (200 CHF budget) + plan de salle. Pack Premium : tout illimite + account manager dedie + 3 campagnes (500 CHF budget total) + 3 mois de gestion reseaux sociaux.",
      },
      {
        q: "Comment fonctionne le dashboard restaurateur ?",
        a: "Le dashboard vous donne un acces complet a la gestion de votre restaurant sur Tok. Vous y trouvez : vue d'ensemble avec indicateurs cles, gestion des commandes en temps reel, suivi des reservations (y compris Zero Attente), edition du menu et des prix, galerie photo, performances et statistiques, facturation, gestion des campagnes publicitaires, et pilotage de service. Les sections accessibles dependent de votre pack de lancement.",
      },
      {
        q: "Comment voir la progression de mon pack de lancement ?",
        a: "Depuis votre dashboard, rendez-vous dans 'Pack de lancement'. Vous y verrez le pack souscrit, une barre de progression globale et le statut de chaque service inclus (en attente, planifie, en cours, termine). Notre equipe met a jour l'avancement au fur et a mesure des etapes accomplies. Vous recevrez des notifications a chaque mise a jour.",
      },
      {
        q: "Pourquoi certains onglets du dashboard sont-ils verrouilles ?",
        a: "Les onglets accessibles dans votre dashboard dependent du pack de lancement que vous avez choisi. Les fonctionnalites non incluses dans votre pack sont grises et marquees d'un cadenas. Par exemple, le plan de salle n'est accessible qu'avec les packs Pro et Premium. Contactez notre equipe pour upgrader votre pack et debloquer de nouvelles fonctionnalites.",
      },
      {
        q: "Comment les reservations Zero Attente apparaissent-elles dans mon dashboard ?",
        a: "Les reservations Zero Attente apparaissent dans l'onglet 'Reservations' de votre dashboard (pas dans les commandes). Elles sont visuellement distinctes avec une bordure et un fond indigo, ainsi qu'un badge 'Zero Attente'. Vous y verrez les details de la reservation, les plats precommandes, le montant paye et le mode de paiement. Le chiffre d'affaires des Zero Attente est inclus dans vos statistiques de performance.",
      },
      {
        q: "Comment sont calculees mes performances et mon chiffre d'affaires ?",
        a: "Le chiffre d'affaires affiche dans votre dashboard inclut les revenus des commandes (livraison et a emporter) ainsi que les paiements des reservations Zero Attente. Les commandes annulees, refusees ou en echec de paiement sont exclues. Vous pouvez consulter vos performances par periode (7, 30, 90 jours), voir les graphiques quotidiens, le panier moyen, le taux d'annulation et la satisfaction client.",
      },
      {
        q: "Comment gerer mon plan de salle ?",
        a: "Depuis l'onglet 'Plan de salle' du dashboard (disponible avec les packs Pro et Premium), vous pouvez creer et editer visuellement votre plan de salle : ajouter des tables, definir leur capacite et leur forme, les disposer dans l'espace, et affecter des reservations aux tables. Le plan de salle est utilise pour optimiser la gestion des reservations et la capacite de votre restaurant.",
      },
      {
        q: "Comment lancer une campagne publicitaire ?",
        a: "Depuis l'onglet 'Campagnes' du dashboard (disponible avec les packs Pro et Premium), creez une campagne en definissant un titre, un budget et une audience cible. La campagne mettra en avant votre restaurant aupres des utilisateurs correspondants. Le paiement se fait a la creation de la campagne. Vous pouvez suivre les performances (impressions, clics, conversions) en temps reel.",
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
            Parcourez nos {totalQuestions} questions-reponses ou contactez notre
            equipe de support pour une aide personnalisee.
          </p>
          <div className="relative max-w-2xl mx-auto">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground h-5 w-5" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher un probleme ou une question..."
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
                ${
                  selectedCat === cat.id
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
                  Essayez avec d'autres mots-cles ou contactez notre support.
                </p>
              </div>
            )}
          </div>

          {/* Sidebar / More Help */}
          <div className="space-y-6">
            <div className="p-6 rounded-2xl border bg-primary/5 space-y-4">
              <h3 className="font-bold flex items-center gap-2">
                <MessageSquare className="h-5 w-5 text-primary" />
                Depannage en direct
              </h3>
              <p className="text-sm text-muted-foreground">
                Un probleme urgent avec une commande en cours ? Utilisez notre
                chat interactif pour une aide immediate.
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
                      support@tok.ch
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Reponse sous 24h
                    </p>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Phone className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                  <div>
                    <p className="text-sm font-medium">Telephone</p>
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
                Vous etes restaurateur ?
              </h3>
              <p className="text-sm text-muted-foreground">
                Decouvrez nos packs de lancement et rejoignez les 500+
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
                  Conditions generales <ChevronRight className="h-4 w-4" />
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
                  A propos de Tok <ChevronRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
