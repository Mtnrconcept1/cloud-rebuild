import { useState } from "react";
import { AlertTriangle, BookOpen, ChevronDown, KeyRound, ShieldCheck } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type Section = {
  id: string;
  title: string;
  summary: string;
  body: Array<{ heading?: string; lines: string[] }>;
};

/**
 * The manual is written from the rules the database actually enforces, not from
 * the intentions of the interface. Anything stated here as a guarantee is a
 * constraint an operator cannot bypass from this screen.
 */
const SECTIONS: Section[] = [
  {
    id: "principe",
    title: "Le principe : rien ne part sans approbation",
    summary: "Comprendre la garantie centrale avant d'utiliser le reste.",
    body: [
      {
        lines: [
          "Tout élément de calendrier créé — à la main ou par l'agent IA — arrive en statut brouillon. La base le force : elle réécrit en « draft » toute tentative de créer directement un élément planifié.",
          "Un envoi n'a lieu que si un administrateur approuve explicitement l'élément, et si sa campagne parente est elle-même approuvée.",
          "Modifier un élément déjà approuvé (titre, canal, contenu, ciblage, date, audience) annule automatiquement son approbation et invalide les livraisons en attente. Une relecture est donc toujours exigée après un changement de fond.",
        ],
      },
      {
        heading: "Interrupteur général",
        lines: [
          "Le bouton de pause dans l'en-tête suspend toute la diffusion. Tant qu'il est actif, l'orchestrateur repousse les livraisons au lieu de les envoyer.",
        ],
      },
    ],
  },
  {
    id: "agent",
    title: "Agent IA",
    summary: "Génère une campagne complète en brouillon à partir d'un objectif.",
    body: [
      {
        lines: [
          "Décrivez l'objectif, choisissez les canaux, la fenêtre de dates et le nombre d'éléments. L'agent produit une campagne, un calendrier réparti sur la période, les textes adaptés à chaque canal et des visuels.",
          "L'agent ne possède aucun droit d'écriture propre. Il propose un plan ; c'est votre session qui l'enregistre, via la même opération qu'une création manuelle. Les garde-fous ne peuvent donc pas être contournés par l'IA.",
          "Un plan est rejeté s'il vise un canal que vous n'avez pas demandé, si un ciblage est vide ou s'il ne contient aucun élément. Le rejet est tracé, la campagne n'est pas créée.",
        ],
      },
      {
        heading: "Coût",
        lines: [
          "Chaque génération enregistre son modèle, ses jetons et son coût estimé en CHF, visibles dans l'historique des générations.",
          "Les visuels sont plafonnés à six par campagne. Une image qui échoue ne bloque pas la campagne : l'élément part simplement sans visuel.",
        ],
      },
    ],
  },
  {
    id: "audiences",
    title: "Audiences et ciblage",
    summary: "Sélecteurs disponibles et façon de les combiner.",
    body: [
      {
        heading: "Sélecteurs",
        lines: [
          "Type d'audience : restaurant, client ou mixte.",
          "Géographie : canton, ville, commune, code postal (quatre chiffres).",
          "Établissement : catégorie, branche, taille d'entreprise.",
          "Type de contact : utilisateur inscrit, prospect restaurant, lead restaurant, manuel.",
          "Joignabilité : présence d'un e-mail, d'un téléphone ou d'un site web.",
        ],
      },
      {
        heading: "Règle à connaître",
        lines: [
          "La joignabilité seule ne constitue pas un segment. « Tous ceux qui ont un e-mail » désigne la base entière : il faut au moins un sélecteur géographique, de catégorie ou de type. Le refus est volontaire, il évite les envois massifs par inadvertance.",
          "Commune et branche sont comparées sans tenir compte de la casse, car elles proviennent d'un registre public dont la typographie n'est pas stable. La taille d'entreprise, elle, est comparée exactement.",
        ],
      },
      {
        heading: "Estimation",
        lines: [
          "L'estimation d'audience distingue le nombre total de contacts correspondant au filtre et le nombre réellement éligible sur les canaux choisis. Un écart important signale en général un problème de base légale ou de coordonnées manquantes.",
        ],
      },
    ],
  },
  {
    id: "eligibilite",
    title: "Qui peut être contacté, et par quel canal",
    summary: "Les règles d'éligibilité, appliquées à chaque livraison.",
    body: [
      {
        lines: [
          "E-mail : consentement, relation client existante, ou intérêt légitime pour les seuls contacts professionnels (prospects et leads restaurants). Une adresse est également requise, non supprimée.",
          "Notification push et in-app : consentement ou relation client existante, et préférences de notification actives.",
          "Appel manuel : consentement, relation client existante ou intérêt légitime, avec un numéro renseigné.",
          "Visite manuelle : jamais de livraison automatique, la planification reste indicative.",
          "Réseaux sociaux, tok_news, site web : canaux publics, ils ne créent jamais de livraison individuelle.",
        ],
      },
      {
        heading: "Protections permanentes",
        lines: [
          "Un contact désinscrit ou supprimé ne redevient jamais joignable, même après réimport du registre.",
          "Heures calmes : aucun envoi entre 20h00 et 08h00 (Europe/Zurich). Les livraisons sont repoussées au créneau suivant.",
          "Plafond de fréquence par contact (72 heures par défaut) et plafond journalier global (500 par défaut), réglables dans les automatisations.",
          "Chaque e-mail porte un en-tête de désinscription, et une plainte ou une désinscription supprime définitivement le contact.",
        ],
      },
    ],
  },
  {
    id: "canaux",
    title: "État réel des canaux",
    summary: "Ce qui envoie vraiment aujourd'hui, et ce qui attend une configuration.",
    body: [
      {
        lines: [
          "Notification in-app : opérationnelle.",
          "E-mail via Resend : l'adaptateur est déployé. Le canal s'active dès que la clé du fournisseur est configurée ; sans elle les envois restent bloqués plutôt que perdus.",
          "Instagram, Facebook, LinkedIn, TikTok, YouTube, Telegram, Google Business, site web : adaptateurs écrits mais inactifs. Publier exige une application validée par chaque plateforme, démarche à mener sur vos comptes professionnels.",
          "Push : en attente de configuration du fournisseur.",
        ],
      },
      {
        heading: "Lecture d'un blocage",
        lines: [
          "Un élément en « configuration bloquée » n'est pas une erreur : c'est le refus délibéré d'envoyer par un canal dont l'intégration n'est pas prête. Le journal des envois nomme l'identifiant manquant.",
        ],
      },
    ],
  },
  {
    id: "journal",
    title: "Journal des envois et historique",
    summary: "Retrouver qui a reçu quoi, et quand.",
    body: [
      {
        lines: [
          "Le journal liste chaque livraison individuelle : destinataire masqué, canal, statut, campagne et élément d'origine, horodatage.",
          "Recherche par destinataire, filtres par canal, par statut et par période.",
          "Les statuts suivent la vie réelle de l'envoi : mis en file, envoyé, distribué, ouvert, cliqué, converti, rejeté, plainte, désinscription, ignoré, échec.",
          "Révéler l'adresse complète d'un destinataire est une action tracée qui demande un motif ; elle apparaît dans le journal d'audit.",
        ],
      },
    ],
  },
  {
    id: "parametres",
    title: "Paramétrage à effectuer",
    summary: "Ce qu'il faut configurer pour que tout fonctionne.",
    body: [
      {
        heading: "Secrets des fonctions Supabase",
        lines: [
          "Clé API du fournisseur IA — indispensable à l'agent et à la génération de visuels. Sans elle, l'agent répond « service indisponible ».",
          "Clé API du fournisseur d'e-mail — indispensable à l'envoi. Sans elle, les livraisons e-mail restent en configuration bloquée.",
          "Identité d'expédition (facultative) — nom et adresse de l'expéditeur, également servie dans l'en-tête de désinscription.",
          "Les noms exacts de ces variables figurent dans les notes de déploiement du dépôt : ils ne sont volontairement pas repris ici, car cet écran est servi au navigateur et aucune référence à un identifiant de fournisseur IA n'y est admise.",
        ],
      },
      {
        heading: "Données",
        lines: [
          "Les prospects issus du registre public doivent être importés avec leurs coordonnées pour être ciblables. L'import ne comble que les trous : il n'écrase jamais une donnée qualifiée à la main.",
          "Une synchronisation des consentements clients aligne les contacts inscrits sur leurs préférences réelles.",
        ],
      },
      {
        heading: "Accès",
        lines: [
          "L'outil exige un rôle administrateur, une double authentification et une session dédiée au domaine marketing. Un jeton de navigation ordinaire ne suffit jamais.",
          "Le drapeau de fonctionnalité « admin-marketing-operations » doit être actif, sinon toute opération est refusée.",
        ],
      },
    ],
  },
  {
    id: "depannage",
    title: "Dépannage",
    summary: "Les symptômes fréquents et leur cause réelle.",
    body: [
      {
        lines: [
          "« Campagne approuvée mais rien n'est parti » : vérifiez l'interrupteur général, l'heure (fenêtre 08h00–20h00) et l'état de l'intégration du canal.",
          "« Audience estimée à zéro » : le filtre est probablement correct mais les contacts manquent de coordonnées, ou leur base légale n'autorise pas ce canal.",
          "« Livraison ignorée » : plafond de fréquence, contact inéligible, ou préférence de notification désactivée. Le motif figure dans le journal.",
          "« L'agent refuse mon plan » : un canal non demandé, un ciblage vide ou une fenêtre incohérente. Le motif est enregistré dans l'historique des générations.",
        ],
      },
    ],
  },
];

function FaqSection({ section }: { section: Section }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="overflow-hidden rounded-lg border border-slate-300 dark:border-slate-700">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-slate-100 dark:hover:bg-slate-800"
      >
        <ChevronDown
          className={cn("mt-0.5 h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
        <span className="min-w-0">
          <span className="block text-sm font-semibold text-slate-950 dark:text-white">{section.title}</span>
          <span className="block text-xs text-slate-700 dark:text-slate-300">{section.summary}</span>
        </span>
      </button>
      {open ? (
        <div className="space-y-4 border-t border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-900 px-4 py-4">
          {section.body.map((block, index) => (
            <div key={index} className="space-y-2">
              {block.heading ? (
                <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-700 dark:text-slate-300">
                  {block.heading}
                </h3>
              ) : null}
              <ul className="space-y-1.5">
                {block.lines.map((line, lineIndex) => (
                  <li key={lineIndex} className="flex gap-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
                    <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-slate-500 dark:bg-slate-400" />
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export default function MarketingFaqView() {
  return (
    <div className="space-y-6">
      <Alert className="border-sky-300 bg-sky-50 text-sky-950 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-100">
        <ShieldCheck className="h-4 w-4" />
        <AlertTitle>Ce document décrit les règles réellement appliquées</AlertTitle>
        <AlertDescription>
          Chaque garantie énoncée ici est une contrainte vérifiée par la base de données, pas une
          convention d'interface. Un opérateur ne peut pas la contourner depuis cet écran.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-4 w-4" aria-hidden />
            Mode d'emploi du centre marketing
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {SECTIONS.map((section) => (
            <FaqSection key={section.id} section={section} />
          ))}
        </CardContent>
      </Card>

      <Card className="border-amber-300 dark:border-amber-800">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-amber-950 dark:text-amber-100">
            <KeyRound className="h-4 w-4" aria-hidden />
            Démarrage rapide
          </CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="space-y-2 text-sm leading-relaxed text-slate-800 dark:text-slate-200">
            {[
              "Configurer les clés du fournisseur IA et du fournisseur d'e-mail dans les secrets des fonctions Supabase.",
              "Importer les prospects avec leurs coordonnées, puis vérifier la couverture dans Audiences.",
              "Vérifier dans Intégrations que les canaux visés sont connectés.",
              "Générer une campagne depuis l'Agent IA, ou la créer à la main.",
              "Relire chaque élément dans le Calendrier, puis approuver.",
              "Suivre les envois dans le Journal, et les résultats dans Résultats.",
            ].map((step, index) => (
              <li key={index} className="flex gap-3">
                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[11px] font-semibold text-white">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>

      <Alert className="border-amber-300 bg-amber-50 text-amber-950 dark:border-amber-800 dark:bg-amber-950/50 dark:text-amber-100">
        <AlertTriangle className="h-4 w-4" />
        <AlertTitle>Responsabilité de l'expéditeur</AlertTitle>
        <AlertDescription>
          La prospection électronique auprès d'entreprises repose ici sur l'intérêt légitime. Le
          désabonnement doit rester possible et honoré sans délai, et toute demande de suppression
          être traitée immédiatement depuis la fiche du contact.
        </AlertDescription>
      </Alert>
    </div>
  );
}
