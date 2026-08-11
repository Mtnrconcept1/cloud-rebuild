from pathlib import Path
import re


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, text: str) -> None:
    Path(path).write_text(text, encoding="utf-8")


def rep(path: str, old: str, new: str, expected: int = 1) -> None:
    text = read(path)
    count = text.count(old)
    if count != expected:
        raise SystemExit(
            f"{path}: expected {expected} occurrences, found {count}: {old[:160]!r}"
        )
    write(path, text.replace(old, new))


# ---------------------------------------------------------------------------
# CGU: preserve legally useful product rules without exposing implementation.
# ---------------------------------------------------------------------------
p = "src/pages/CGU.tsx"
rep(
    p,
    '''  {
    title: "7. Tok One, Miamz et avantages",
    paragraphs: [
      "Les Miamz et avantages de fidélité n'ont pas de valeur monétaire en dehors de TOK et ne constituent pas un compte bancaire, un dépôt ou un actif financier.",
      "Tok One peut donner accès à des réductions, priorités, offres partenaires, support prioritaire ou autres avantages décrits dans l'application. Les droits applicables sont ceux de la formule active au moment de l'utilisation.",
      "Les conditions de souscription, renouvellement et résiliation de Tok One sont présentées dans le parcours d'achat concerné.",
    ],
  },''',
    '''  {
    title: "7. Tok One, Miamz et avantages",
    paragraphs: [
      "Les Miamz ne constituent pas une monnaie, un compte bancaire, un dépôt ou un actif financier et sont sans valeur en espèces en dehors des usages expressément proposés par TOK.",
      "Le nombre de Miamz attribués, leur durée de validité, les conditions d'utilisation et les avantages accessibles sont affichés dans l'application ou dans l'opération concernée.",
      "Une annulation, un remboursement, une fraude, un abus ou une erreur technique peut entraîner l'annulation ou la correction des Miamz liés à l'opération concernée.",
      "Les dons solidaires, lorsqu'ils sont proposés, précisent leur destination, les conditions de conversion des avantages et les informations disponibles sur la redistribution.",
      "Tok One peut donner accès à des réductions, priorités, offres partenaires, support prioritaire, tables ou expériences VIP et autres avantages décrits dans l'application. Les droits applicables sont ceux de la formule active au moment de l'utilisation.",
      "Les conditions de souscription, renouvellement et résiliation de Tok One sont présentées dans le parcours d'achat concerné.",
    ],
  },''',
)
rep(
    p,
    '''  {
    title: "8. Actualités, avis et contenus utilisateurs",
    paragraphs: [
      "Les utilisateurs doivent publier uniquement des contenus licites et respecter les droits de tiers. Les contenus haineux, menaçants, frauduleux, diffamatoires, discriminatoires, sexuellement explicites, violents ou destinés au harcèlement peuvent être modérés ou supprimés.",
      "TOK met à disposition des mécanismes de signalement et de blocage. Un compte peut être suspendu ou supprimé en cas d'abus répétés ou graves.",
    ],
  },''',
    '''  {
    title: "8. Actualités, avis, contenus et campagnes sponsorisées",
    paragraphs: [
      "Les utilisateurs doivent publier uniquement des contenus licites et respecter les droits de tiers. Les contenus haineux, menaçants, frauduleux, diffamatoires, discriminatoires, sexuellement explicites, violents ou destinés au harcèlement peuvent être modérés ou supprimés.",
      "TOK met à disposition des mécanismes de signalement et de blocage. Un compte peut être suspendu ou supprimé en cas d'abus répétés ou graves.",
      "Les campagnes sponsorisées et autres mises en avant payantes doivent être clairement identifiées. Un post ne doit être présenté comme sponsorisé que lorsque la mise en avant est effectivement active.",
      "Le budget et la durée d'une campagne, ainsi que les principales conditions de diffusion, sont présentés au restaurateur avant validation. TOK ne garantit aucun volume de vues, clics, réservations, commandes ou chiffre d'affaires.",
    ],
  },''',
)
rep(
    p,
    '''  {
    title: "9. Outils d'intelligence artificielle",
    paragraphs: [
      "Certaines fonctions peuvent utiliser des systèmes d'intelligence artificielle pour assister la recherche, le support, la rédaction, l'analyse ou la création de contenus.",
      "Les résultats peuvent comporter des erreurs. Les informations importantes, notamment prix, allergènes, disponibilités, informations contractuelles ou décisions commerciales, doivent être vérifiées avant utilisation.",
    ],
  },''',
    '''  {
    title: "9. Outils d'intelligence artificielle",
    paragraphs: [
      "Certaines fonctions peuvent utiliser des systèmes d'intelligence artificielle pour assister la recherche, le support, la rédaction, l'analyse ou la création de contenus.",
      "Les résultats peuvent comporter des erreurs. Les informations importantes, notamment prix, allergènes, disponibilités, informations contractuelles ou décisions commerciales, doivent être vérifiées avant utilisation.",
      "Les photos générées ou retouchées par IA et les textes assistés ne doivent pas induire les utilisateurs en erreur sur un plat, un prix, une disponibilité, une origine, un allergène ou une caractéristique essentielle de l'offre.",
    ],
  },''',
)
rep(
    p,
    '''  {
    title: "10. Disponibilité et responsabilité",''',
    '''  {
    title: "10. Intégrations TOK Connect et partenaires autorisés",
    paragraphs: [
      "TOK Connect permet à des partenaires approuvés d'interagir avec certaines fonctions de TOK dans la limite des permissions accordées par TOK et, lorsque nécessaire, par le restaurant concerné.",
      "Un partenaire autorisé ne peut utiliser que les données et actions nécessaires à l'intégration convenue. Les autorisations peuvent être limitées, suspendues ou révoquées en cas de risque, d'abus, de non-conformité ou à la demande du restaurant lorsque son autorisation est requise.",
      "Lorsqu'une réservation ou une autre action réelle est confirmée au moyen d'une intégration autorisée, les mêmes règles commerciales et opérationnelles que dans TOK s'appliquent. Les environnements de test ne valent jamais confirmation d'une opération réelle.",
    ],
  },
  {
    title: "11. Disponibilité et responsabilité",''',
)
rep(p, '    title: "11. Données personnelles",', '    title: "12. Données personnelles",')
rep(p, '    title: "12. Modification des CGU",', '    title: "13. Modification des CGU",')
rep(p, '    title: "13. Droit applicable et contact",', '    title: "14. Droit applicable et contact",')


# ---------------------------------------------------------------------------
# Privacy: describe relevant data/recipients at a product level, not internals.
# ---------------------------------------------------------------------------
p = "src/pages/PolitiqueConfidentialite.tsx"
rep(
    p,
    '''      "Fonctions d'intelligence artificielle : contenu de la demande, résultat et métadonnées strictement nécessaires lorsque vous utilisez une fonction IA.",''',
    '''      "Fonctions d'intelligence artificielle : contenu de la demande, résultat et métadonnées strictement nécessaires lorsque vous utilisez une fonction IA.",
      "Campagnes et personnalisation : interactions, préférences et signaux d'intérêt nécessaires pour ordonner des contenus, mesurer une campagne ou appliquer vos choix de personnalisation.",
      "Notifications : identifiant technique de notification et préférences de réception lorsque vous activez ce canal.",
      "Intégrations TOK Connect : identité du partenaire, permissions accordées, actions réalisées et données strictement nécessaires à l'intégration autorisée.",''',
)
rep(
    p,
    '''      "Autorités ou conseils : uniquement lorsque la loi l'exige ou lorsque cela est nécessaire à la défense de droits légitimes.",''',
    '''      "Partenaires TOK Connect approuvés : uniquement les données nécessaires à l'action autorisée et dans la limite des permissions accordées.",
      "Autorités ou conseils : uniquement lorsque la loi l'exige ou lorsque cela est nécessaire à la défense de droits légitimes.",''',
)
rep(
    p,
    '''  {
    title: "6. Transferts à l'étranger",''',
    '''  {
    title: "6. Intégrations TOK Connect et partenaires autorisés",
    paragraphs: [
      "Lorsqu'un restaurant ou TOK autorise une intégration partenaire, le partenaire ne reçoit que les informations nécessaires aux fonctions qui lui ont été accordées. Les permissions peuvent être retirées ou limitées selon le service concerné.",
      "TOK conserve les éléments de traçabilité nécessaires à la sécurité, au support, à la preuve d'une action et au respect des obligations applicables, sans publier les secrets ou mécanismes internes de l'intégration.",
    ],
  },
  {
    title: "7. Transferts à l'étranger",''',
)
rep(p, '    title: "7. Conservation",', '    title: "8. Conservation",')
rep(p, '    title: "8. Sécurité",', '    title: "9. Sécurité",')
rep(p, '    title: "9. Vos droits",', '    title: "10. Vos droits",')
rep(p, '    title: "10. Cookies, mesures d\'audience et communications",', '    title: "11. Cookies, mesures d\'audience et communications",')
rep(p, '    title: "11. Modifications",', '    title: "12. Modifications",')


# ---------------------------------------------------------------------------
# Restaurant terms: keep partner/AI/sponsored duties, no team allocation data.
# ---------------------------------------------------------------------------
p = "src/pages/ConditionsRestaurateurs.tsx"
rep(
    p,
    '''      "TOK ne garantit aucun volume de vues, clics, commandes, réservations ou chiffre d'affaires issu d'une campagne ou d'un outil d'assistance.",''',
    '''      "TOK ne garantit aucun volume de vues, clics, commandes, réservations ou chiffre d'affaires issu d'une campagne ou d'un outil d'assistance.",
      "Les contenus sponsorisés doivent être clairement identifiés et ne peuvent présenter une offre, un prix, une disponibilité ou une caractéristique de manière trompeuse.",''',
)
rep(
    p,
    '''      "Les contenus générés ou assistés par intelligence artificielle doivent être vérifiés avant publication. Le restaurateur reste responsable des informations commerciales et alimentaires qu'il valide.",''',
    '''      "Les contenus générés ou assistés par intelligence artificielle doivent être vérifiés avant publication. Le restaurateur reste responsable des informations commerciales et alimentaires qu'il valide.",
      "Les photos générées ou retouchées par intelligence artificielle ne doivent pas induire le client en erreur sur le produit réellement proposé.",''',
)
rep(
    p,
    '''  {
    title: "14. Droit applicable et contact",
    body: [
      "Les présentes conditions sont régies par le droit suisse. Les règles impératives de compétence demeurent réservées.",
      `Pour toute question contractuelle ou de facturation, contactez TOK à ${SUPPORT_EMAIL}.`,
    ],
  },''',
    '''  {
    title: "14. TOK Connect et partenaires autorisés",
    body: [
      "Le restaurateur peut autoriser ou révoquer un partenaire TOK Connect pour son établissement au moyen des contrôles mis à sa disposition lorsque cette intégration est disponible.",
      "Les autorisations sont limitées aux usages nécessaires au partenaire. Le restaurateur doit vérifier les partenaires auxquels il accorde un accès et retirer une autorisation devenue inutile ou inappropriée.",
      "Une réservation réelle ou une autre opération confirmée au moyen d'une intégration autorisée engage le restaurant dans les mêmes conditions qu'une opération équivalente confirmée dans TOK, sous réserve des droits de correction et d'annulation applicables.",
      "TOK peut suspendre une intégration en cas de risque, d'abus, d'accès non autorisé ou de non-conformité.",
    ],
  },
  {
    title: "15. Droit applicable et contact",
    body: [
      "Les présentes conditions sont régies par le droit suisse. Les règles impératives de compétence demeurent réservées.",
      `Pour toute question contractuelle ou de facturation, contactez TOK à ${SUPPORT_EMAIL}.`,
    ],
  },''',
)


# ---------------------------------------------------------------------------
# Help: replace technical TOK Connect details with safe product-level answers.
# ---------------------------------------------------------------------------
p = "src/pages/Aide.tsx"
text = read(p)
pattern = re.compile(
    r'''  \{\n    category: "tok-connect",\n    questions: \[\n.*?\n    \],\n  \},\n\];''',
    re.S,
)
safe_tok_connect = '''  {
    category: "tok-connect",
    questions: [
      {
        q: "Qu'est-ce que TOK Connect ?",
        a: "TOK Connect permet à des partenaires approuvés de relier leurs services à certaines fonctions de TOK. Chaque intégration est limitée aux autorisations accordées et peut être suspendue ou révoquée si elle n'est plus nécessaire ou présente un risque.",
      },
      {
        q: "À quoi sert l'API TOK Connect ?",
        a: "Elle permet à un partenaire autorisé de consulter ou d'utiliser les fonctions prévues par son intégration, par exemple des informations de restaurant, des disponibilités ou certaines étapes d'une réservation, uniquement dans le périmètre qui lui a été accordé.",
      },
      {
        q: "Que signifie MCP dans TOK Connect ?",
        a: "MCP permet à un assistant compatible d'utiliser des outils TOK autorisés de manière structurée. Les actions disponibles dépendent du partenaire, du restaurant concerné et des permissions effectivement accordées.",
      },
      {
        q: "Qui peut utiliser TOK Connect ?",
        a: "Seuls les partenaires validés et les comptes autorisés peuvent utiliser une intégration TOK Connect. TOK peut limiter les fonctions accessibles, les établissements concernés et la durée de l'autorisation.",
      },
      {
        q: "Quelles données un partenaire peut-il consulter ?",
        a: "Un partenaire ne reçoit que les données nécessaires à l'action autorisée. Les données de paiement sensibles, informations internes de TOK et informations sans rapport avec l'intégration ne sont pas communiquées.",
      },
      {
        q: "Un partenaire peut-il créer une réservation réelle ?",
        a: "Oui lorsque cette action fait partie de ses autorisations, que le restaurant concerné l'accepte et que le parcours prévoit une confirmation réelle. Une opération de test n'est jamais traitée comme une réservation réelle.",
      },
      {
        q: "Les actions autonomes sont-elles autorisées ?",
        a: "Les actions sensibles restent limitées par les autorisations accordées et peuvent nécessiter une confirmation explicite. TOK peut imposer une validation humaine pour une opération commerciale ou financière.",
      },
      {
        q: "À quoi servent les notifications d'intégration ?",
        a: "Elles permettent à un partenaire autorisé d'être informé d'un changement utile à son intégration. Les échanges sont protégés et limités aux événements nécessaires au service convenu.",
      },
      {
        q: "Comment fonctionne l'environnement de test ?",
        a: "Il permet de vérifier une intégration sans transformer une opération de test en réservation, campagne ou transaction réelle.",
      },
      {
        q: "Comment un restaurateur contrôle-t-il l'accès à son établissement ?",
        a: "Lorsque TOK Connect est disponible pour son établissement, le restaurateur peut autoriser ou révoquer un partenaire et limiter les usages qui lui sont accordés. TOK peut également suspendre un accès en cas de risque ou d'abus.",
      },
      {
        q: "Comment TOK protège-t-il une intégration ?",
        a: "TOK applique des contrôles d'authentification, d'autorisation, de traçabilité et de limitation adaptés au service concerné, sans exposer les secrets ou mécanismes internes de la plateforme.",
      },
      {
        q: "Où trouver la documentation TOK Connect ?",
        a: "La page TOK Connect et l'espace réservé au partenaire autorisé présentent la documentation et les outils disponibles pour son compte.",
      },
    ],
  },
];'''
text, n = pattern.subn(safe_tok_connect, text, count=1)
if n != 1:
    raise SystemExit(f"{p}: TOK Connect FAQ block replacement count {n}")
old_seo = '''export default function Aide() {
  useSeoMeta({
    title: "Centre d'aide TOK — clients et restaurateurs",
    description: "Réponses sur les commandes, paiements, inscriptions restaurateurs, abonnements, Google Business et fonctionnalités TOK.",
    path: "/aide",
  });
  const [search, setSearch] = useState("");'''
new_seo = '''export default function Aide() {
  const [search, setSearch] = useState("");'''
if old_seo not in text:
    raise SystemExit(f"{p}: legacy SEO hook block not found")
text = text.replace(old_seo, new_seo, 1)
marker = '''  const normalizedSearch = search.trim().toLowerCase();'''
insertion = '''  const faqJsonLd = useMemo(
    () => ({
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: visibleFaqSections.flatMap((section) =>
        section.questions.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      ),
    }),
    [visibleFaqSections],
  );

  useSeoMeta({
    title: "Centre d'aide TOK — clients et restaurateurs",
    description: "Réponses sur les commandes à emporter, paiements, inscriptions restaurateurs, abonnements, Google Business et fonctionnalités TOK.",
    path: "/aide",
    jsonLd: faqJsonLd,
  });

  const normalizedSearch = search.trim().toLowerCase();'''
if marker not in text:
    raise SystemExit(f"{p}: normalized search marker not found")
text = text.replace(marker, insertion, 1)
write(p, text)


# Last public Tok One delivery promise.
p = "src/pages/TokOne.tsx"
rep(
    p,
    '''              Livraison offerte, accès VIP aux expériences, réductions
              partenaires et support prioritaire. Une formule claire pour les
              clients qui commandent, réservent et découvrent les meilleures
              tables de Genève.''',
    '''              Avantages réservés, accès VIP aux expériences, réductions
              partenaires et support prioritaire. Une formule claire pour les
              clients qui commandent, réservent et découvrent les meilleures
              tables de Genève.''',
)


# Flat 10% fallback must not invent a Starter entitlement.
p = "supabase/functions/_shared/marketplace-finance.ts"
rep(
    p,
    '''    pricingPlanId: null,
    pricingPlanSlug: "starter",
    pricingVersion: FAIR_GROWTH_PRICING_VERSION,
    pricingRateSource: "starter_fallback",''',
    '''    pricingPlanId: null,
    pricingPlanSlug: null,
    pricingVersion: FAIR_GROWTH_PRICING_VERSION,
    pricingRateSource: "runtime_default",''',
)


# Server onboarding must validate exactly the legal versions displayed to users.
p = "supabase/functions/submit-signup-application/validation.ts"
rep(
    p,
    'export const RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-07-v6";',
    'export const RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-08-v7";',
)
rep(
    p,
    'export const LEGAL_ACCEPTANCE_VERSION = "cgu-2026-07-v4+privacy-2026-07-v4";',
    'export const LEGAL_ACCEPTANCE_VERSION = "cgu-2026-08-v5+privacy-2026-08-v5";',
)
rep(
    p,
    'return "Role non supporte pour ce parcours (role attendu : restaurateur ou livreur).";',
    'return "Role non supporte pour ce parcours.";',
)


# Public cookie policy: remove implementation-maintenance wording.
p = "src/pages/Cookies.tsx"
rep(
    p,
    "Cet inventaire est maintenu dans le code source afin que tout ajout ou changement puisse être revu avec la fonctionnalité concernée.",
    "Cet inventaire décrit les principales technologies utilisées, leur finalité, leur durée et les conditions de leur activation.",
)


# ---------------------------------------------------------------------------
# Tests: align with the August 2026 legal contract and public/private boundary.
# ---------------------------------------------------------------------------
write(
    "src/test/tok-connect-legal-content.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { LEGAL_EFFECTIVE_DATE_FR } from "@/lib/legalDocuments";

const legalPages = [
  "src/pages/Aide.tsx",
  "src/pages/CGU.tsx",
  "src/pages/PolitiqueConfidentialite.tsx",
  "src/pages/ConditionsRestaurateurs.tsx",
];

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("TOK Connect legal and help content", () => {
  it("documents TOK Connect publicly without exposing private implementation details", () => {
    const aide = read("src/pages/Aide.tsx");
    expect(aide).toContain('id: "tok-connect"');
    expect(aide).toContain("Qu'est-ce que TOK Connect ?");
    expect(aide).toContain("partenaires approuvés");
    expect(aide).toContain("autorisations accordées");
    expect(aide).not.toContain("/tok-connect/developer");
    expect(aide).not.toContain("/admin/tok-connect");
    expect(aide).not.toContain("Idempotency-Key");
    expect(aide).not.toContain("X-TOK-Signature");
    expect(aide).not.toContain("contrôles côté Edge Function");
  });

  it("documents TOK Connect usage rules in the CGU", () => {
    const cgu = read("src/pages/CGU.tsx");
    const legalDocuments = read("src/lib/legalDocuments.ts");
    expect(cgu).toContain("Version {LEGAL_DOCUMENTS.cgu.version} — applicable dès le {LEGAL_EFFECTIVE_DATE_FR}");
    expect(legalDocuments).toContain(`LEGAL_EFFECTIVE_DATE_FR = "${LEGAL_EFFECTIVE_DATE_FR}"`);
    expect(cgu).toContain("Intégrations TOK Connect et partenaires autorisés");
    expect(cgu).toContain("permissions accordées");
    expect(cgu).toContain("environnements de test");
    expect(cgu).not.toContain("OAuth client-credentials");
    expect(cgu).not.toContain("Idempotency-Key");
  });

  it("documents TOK Connect privacy processing without publishing secrets", () => {
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");
    expect(privacy).toContain("Intégrations TOK Connect");
    expect(privacy).toContain("Partenaires TOK Connect approuvés");
    expect(privacy).toContain("données strictement nécessaires");
    expect(privacy).toContain("sans publier les secrets ou mécanismes internes");
    expect(privacy).not.toContain("tokens sont opaques");
  });

  it("documents restaurant consent and responsibilities for TOK Connect", () => {
    const restaurantTerms = read("src/pages/ConditionsRestaurateurs.tsx");
    expect(restaurantTerms).toContain("const updatedAt = LEGAL_EFFECTIVE_DATE_FR;");
    expect(restaurantTerms).toContain("TOK Connect et partenaires autorisés");
    expect(restaurantTerms).toContain("autoriser ou révoquer un partenaire TOK Connect");
    expect(restaurantTerms).toContain("Une réservation réelle");
    expect(restaurantTerms).toContain("15. Droit applicable et contact");
  });

  it("keeps the touched French legal pages free from common mojibake markers", () => {
    for (const page of legalPages) {
      const source = read(page);
      expect(source, page).not.toContain("\uFFFD");
      expect(source, page).not.toContain("\u00C2");
      expect(source, page).not.toContain("\u00C3");
      expect(source, page).not.toContain("\u00C5");
      expect(source, page).not.toContain("\u00E2\u20AC");
    }
  });
});
''',
)

p = "src/test/restaurant-partner-contract-export.test.ts"
rep(
    p,
    'selectedSubscriptionPriceLabel: "CHF 1\'419 · annuel, 12 mois au prix de 11 · 8,9% / commande",',
    'selectedSubscriptionPriceLabel: "CHF 1\'419 · annuel, 12 mois au prix de 11 · 10% / commande",',
)
rep(p, '    expect(html).toContain("TOK-CH-RP-2026-07-v6");\n', '')
rep(
    p,
    'expect(html).toContain("CHF 1&#39;419 · annuel, 12 mois au prix de 11 · 8,9% / commande");',
    'expect(html).toContain("CHF 1&#39;419 · annuel, 12 mois au prix de 11 · 10% / commande");',
)

p = "src/test/restaurant-contracts-governance.test.ts"
rep(
    p,
    '    expect(contractCopy).toContain("Sur les frais de réservation");',
    '    expect(contractCopy).toContain("restaurant reçoit 90%");\n    expect(contractCopy).toContain("TOK conserve 10%");',
)
rep(
    p,
    '    expect(contractCopy).toContain("sous-traitants ultérieurs");',
    '    expect(contractCopy).toContain("prestataires de paiement");',
)

p = "src/test/tok-one-stripe-test-mode.test.ts"
rep(
    p,
    '    expect(tokOnePageSource).toContain(\'id: "free_delivery"\');',
    '    expect(tokOnePageSource).not.toContain(\'id: "free_delivery"\');',
)

write(
    "src/test/legal-miamz-readiness.test.ts",
    '''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

const publicLegalPages = [
  "src/pages/CGU.tsx",
  "src/pages/PolitiqueConfidentialite.tsx",
  "src/pages/Aide.tsx",
  "src/pages/APropos.tsx",
];

const brokenEncodingMarkers = ["\u00c3", "\u00c2", "\u00e2\u20ac", "\ufffd"];

describe("legal Miamz and sponsored content readiness", () => {
  it("keeps public legal and help pages in readable UTF-8 French", () => {
    for (const path of publicLegalPages) {
      const content = read(path);
      for (const marker of brokenEncodingMarkers) expect(content, path).not.toContain(marker);
    }
  });

  it("documents Miamz value, expiry, donations and refund adjustments in public legal copy", () => {
    const cgu = read("src/pages/CGU.tsx");
    const miamz = read("src/pages/MiamzSolidaires.tsx");
    for (const expected of [
      "Les Miamz ne constituent pas une monnaie",
      "sans valeur en espèces",
      "durée de validité",
      "dons solidaires",
      "Une annulation, un remboursement, une fraude, un abus ou une erreur technique",
      "tables ou expériences VIP",
    ]) expect(cgu).toContain(expected);
    for (const expected of [
      "non convertibles en espèces",
      "durée de validité affichée",
      "preuve de redistribution",
      "annulation ou remboursement",
    ]) expect(miamz).toContain(expected);
  });

  it("covers sponsored posts and AI responsibilities without exposing production internals", () => {
    const cgu = read("src/pages/CGU.tsx");
    const privacy = read("src/pages/PolitiqueConfidentialite.tsx");
    for (const expected of [
      "campagnes sponsorisées",
      "photos générées ou retouchées par IA",
      "ne doivent pas induire les utilisateurs en erreur",
      "ne doit être présenté comme sponsorisé",
      "budget et la durée",
    ]) expect(cgu).toContain(expected);
    for (const expected of [
      "Fonctions d'intelligence artificielle",
      "OpenAI",
      "signaux d'intérêt",
      "identifiant technique de notification",
      "Partenaires TOK Connect approuvés",
    ]) expect(privacy).toContain(expected);
  });

  it("explains recent product additions in FAQ and About pages", () => {
    const aide = read("src/pages/Aide.tsx");
    const about = read("src/pages/APropos.tsx");
    for (const expected of [
      "posts sauvegardés", "Plus comme ça", "Moins comme ça", "CPC",
      "budget total et la durée", "tables VIP", "panier", "jetons de notification push",
    ]) expect(aide).toContain(expected);
    for (const expected of ["Actualités", "Miamz", "campagnes", "restaurants indépendants"]) {
      expect(about).toContain(expected);
    }
  });
});
''',
)

p = "src/test/marketplace-finance-routing.test.ts"
rep(
    p,
    'it("uses the active Fair Growth plan snapshot and an exact 1% order developer share", () => {',
    'it("uses a flat 10% marketplace fee and seals the active plan snapshot", () => {',
)
rep(p, 'expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 990");', 'expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");')
rep(p, 'expect(finance).toContain("MAX_FAIR_GROWTH_PLATFORM_FEE_BPS = 990");', 'expect(finance).toContain("MAX_FAIR_GROWTH_PLATFORM_FEE_BPS = 1000");')
rep(p, 'expect(finance).toContain(\'pricingRateSource: "starter_fallback"\');', 'expect(finance).toContain(\'pricingRateSource: "runtime_default"\');')
rep(
    p,
    'expect(finance).toContain("platformFeeBps: TOK_PLATFORM_FEE_BPS");',
    'expect(finance).toContain("platformFeeBps: TOK_PLATFORM_FEE_BPS");\n    expect(finance).toContain("pricingPlanSlug: null");',
)

p = "src/test/stripe-developer-share-routing.test.ts"
rep(p, '  platformFeeBps = 990,', '  platformFeeBps = 1000,')
rep(
    p,
    '''  it("splits a Starter order into 90.1% restaurant, 8.9% TOK and 1% developer", () => {
    expect(splitOrder(10_000)).toEqual({
      restaurantCents: 9_010,
      deliveryCents: 0,
      tokCents: 890,
      developerCents: 100,
    });
  });''',
    '''  it("keeps the public order split at 90% restaurant / 10% platform before internal settlement", () => {
    expect(splitOrder(10_000)).toEqual({
      restaurantCents: 9_000,
      deliveryCents: 0,
      tokCents: 900,
      developerCents: 100,
    });
  });''',
)
rep(
    p,
    '''    expect(splitOrder(12_000, 990, 100, 1_000, 1_000)).toEqual({
      restaurantCents: 10_010,
      deliveryCents: 1_000,
      tokCents: 890,
      developerCents: 100,
    });''',
    '''    expect(splitOrder(12_000, 1000, 100, 1_000, 1_000)).toEqual({
      restaurantCents: 10_000,
      deliveryCents: 1_000,
      tokCents: 900,
      developerCents: 100,
    });''',
)
rep(p, 'expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 990");', 'expect(finance).toContain("TOK_PLATFORM_FEE_BPS = 1000");')

p = "src/test/auth-signup-form.test.tsx"
rep(p, 'contract_version: "TOK-CH-RP-2026-07-v6",', 'contract_version: "TOK-CH-RP-2026-08-v7",')

p = "src/test/legal-public-surface-hardening.test.ts"
rep(
    p,
    '''    expect(help).not.toContain('"@type": "FAQPage"');
    expect(help).not.toContain("/admin/tok-connect");''',
    '''    expect(help).toContain('"@type": "FAQPage"');
    expect(help).toContain("visibleFaqSections.flatMap");
    expect(help).not.toContain("/admin/tok-connect");''',
)
rep(
    p,
    '''    expect(help).not.toContain("Les fonctions désactivées côté admin");
  });''',
    '''    expect(help).not.toContain("Les fonctions désactivées côté admin");
    expect(help).not.toContain("Idempotency-Key");
    expect(help).not.toContain("X-TOK-Signature");
    expect(source("src/pages/Cookies.tsx")).not.toContain("maintenu dans le code source");
  });''',
)

p = "src/test/public-feature-legal-matrix.test.ts"
rep(
    p,
    '''    expect(help).toContain('"@type": "FAQPage"');
    expect(help).toContain("acceptedAnswer");''',
    '''    expect(help).toContain('"@type": "FAQPage"');
    expect(help).toContain("acceptedAnswer");
    expect(help).toContain("visibleFaqSections.flatMap");''',
)


# Final invariants.
public_contractual = "\n".join(
    read(path)
    for path in [
        "src/pages/CGU.tsx",
        "src/pages/PolitiqueConfidentialite.tsx",
        "src/pages/ConditionsRestaurateurs.tsx",
        "src/lib/restaurantPartnerContract.ts",
        "src/pages/Aide.tsx",
    ]
)
for forbidden in [
    "le développeur",
    "admin.thetok.ch",
    "/admin/tok-connect",
    "contrôles côté Edge Function",
    "feature flag",
    "politiques RLS",
]:
    if forbidden.lower() in public_contractual.lower():
        raise SystemExit(f"public legal surface still contains forbidden wording: {forbidden}")

if "Livraison offerte" in read("src/pages/TokOne.tsx"):
    raise SystemExit("Tok One still contains active Livraison offerte copy")

validation = read("supabase/functions/submit-signup-application/validation.ts")
for expected in [
    'RESTAURANT_PARTNER_CONTRACT_VERSION = "TOK-CH-RP-2026-08-v7"',
    'LEGAL_ACCEPTANCE_VERSION = "cgu-2026-08-v5+privacy-2026-08-v5"',
]:
    if expected not in validation:
        raise SystemExit(f"signup validation legal version mismatch: {expected}")

print("legal CI alignment complete")
