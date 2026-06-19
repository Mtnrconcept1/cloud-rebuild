import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  FileBlob,
  PresentationFile,
} from "file:///C:/Users/Pc/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/dist/artifact_tool.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outDir = path.resolve(__dirname, "..");
const sourcePptx = path.join(outDir, "TOK-dossier-restaurateurs-2026-06-15.pptx");
const outputPptx = path.join(outDir, "TOK-dossier-restaurateurs-2026-06-15-couts.pptx");
const slidesDir = path.join(outDir, "slides-couts");
const inspectPath = path.join(outDir, "TOK-dossier-restaurateurs-2026-06-15-couts.inspect.ndjson");
const montagePath = path.join(outDir, "TOK-dossier-restaurateurs-2026-06-15-couts-montage.webp");

const C = {
  ink: "#111827",
  muted: "#64748B",
  line: "#CBD5E1",
  paper: "#F8FAFC",
  white: "#FFFFFF",
  tok: "#F97316",
  tokDark: "#C2410C",
  green: "#15803D",
  blue: "#2563EB",
  slate: "#334155",
  red: "#B91C1C",
  amber: "#D97706",
};

const presentation = await PresentationFile.importPptx(await FileBlob.load(sourcePptx));

function addText(slide, text, x, y, w, h, style = {}) {
  const shape = slide.shapes.add({
    geometry: "textbox",
    position: { left: x, top: y, width: w, height: h },
    fill: "none",
    line: { style: "solid", fill: "none", width: 0 },
  });
  shape.text = text;
  shape.text.style = {
    fontFace: "Aptos",
    fontSize: 20,
    color: C.ink,
    ...style,
  };
  return shape;
}

function addRect(slide, x, y, w, h, fill, stroke = fill, radius = 0) {
  const shape = slide.shapes.add({
    geometry: radius > 0 ? "roundRect" : "rect",
    position: { left: x, top: y, width: w, height: h },
    fill,
    line: { style: "solid", fill: stroke, width: 1 },
    borderRadius: radius > 0 ? "rounded-lg" : undefined,
  });
  return shape;
}

function addBaseSlide(title, eyebrow, indexLabel) {
  const slide = presentation.slides.add();
  slide.background.fill = C.paper;
  addRect(slide, 0, 0, 1280, 720, C.paper, C.paper);
  addRect(slide, 0, 0, 1280, 18, C.tok, C.tok);
  addText(slide, eyebrow.toUpperCase(), 58, 42, 700, 22, {
    fontSize: 12,
    color: C.tokDark,
    bold: true,
  });
  addText(slide, title, 56, 70, 920, 58, {
    fontSize: 32,
    color: C.ink,
    bold: true,
  });
  addText(slide, indexLabel, 1182, 42, 42, 24, {
    fontSize: 12,
    color: C.muted,
    alignment: "right",
  });
  addRect(slide, 56, 136, 1168, 1.2, C.line, C.line);
  addText(slide, "TOK | dossier restaurateurs | coûts réels et comparatif plateformes", 56, 685, 780, 20, {
    fontSize: 10,
    color: C.muted,
  });
  return slide;
}

function addMetric(slide, label, value, note, x, y, w, color = C.tok) {
  addRect(slide, x, y, w, 144, C.white, C.line, 8);
  addRect(slide, x, y, 6, 144, color, color, 0);
  addText(slide, label.toUpperCase(), x + 24, y + 18, w - 42, 20, {
    fontSize: 10.5,
    bold: true,
    color: C.muted,
  });
  addText(slide, value, x + 24, y + 40, w - 42, 46, {
    fontSize: 19,
    bold: true,
    color,
  });
  addText(slide, note, x + 24, y + 92, w - 42, 42, {
    fontSize: 10.8,
    color: C.slate,
  });
}

function styleTable(table, rows, cols, headerRows = 1) {
  table.borders.assign({ style: "solid", fill: C.line, width: 1 });
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const cell = table.getCell(r, c);
      cell.fill = r < headerRows ? C.ink : r % 2 === 0 ? "#F1F5F9" : C.white;
      cell.text.style = {
        fontFace: "Aptos",
        fontSize: r < headerRows ? 11.5 : 10.5,
        bold: r < headerRows || c === 0,
        color: r < headerRows ? C.white : c === 0 ? C.ink : C.slate,
        verticalAlignment: "middle",
      };
    }
  }
}

function addSourceNote(slide, text) {
  addText(slide, text, 56, 660, 1130, 18, {
    fontSize: 9.4,
    color: C.muted,
  });
}

// Slide 32
{
  const slide = addBaseSlide("Coût réel restaurateur : ce qu'il faut comparer", "Nouvelle section", "32");
  addText(
    slide,
    "Le coût ne se limite jamais à une commission affichée. Il combine frais d'entrée, abonnement, réservation, livraison, mise en avant, paiement, remises et perte de relation client.",
    56,
    156,
    1060,
    52,
    { fontSize: 21, color: C.slate },
  );
  addMetric(
    slide,
    "TOK",
    "490-3 490 CHF\n+ 69-499 CHF/mois",
    "Packs de lancement, abonnement, 5 CHF par réservation confirmée facturable, commission comptable 10% sur commandes.",
    56,
    232,
    278,
    C.tok,
  );
  addMetric(
    slide,
    "TheFork",
    "Tarif contractuel\nnon publié",
    "Widget direct annoncé sans commission. Les réservations marketplace et plans avancés dépendent du contrat/compte.",
    352,
    232,
    278,
    C.blue,
  );
  addMetric(
    slide,
    "Uber Eats",
    "15-30%\nselon modèle",
    "Marketplace delivery 20/25/30%, self-delivery 15%, pickup 7% ou 10% selon validation des prix.",
    648,
    232,
    278,
    C.green,
  );
  addMetric(
    slide,
    "Just Eat",
    "Tarif CH\nnon public",
    "Revenue public JET : commissions, frais paiement/admin, placements promus, abonnements. Montants à confirmer au contrat.",
    944,
    232,
    278,
    C.red,
  );
  addRect(slide, 56, 404, 1168, 184, C.white, C.line, 8);
  addText(slide, "Lecture restaurateur", 84, 426, 260, 26, {
    fontSize: 21,
    bold: true,
    color: C.ink,
  });
  addText(
    slide,
    "Avant de signer, comparer une facture mensuelle complète : commandes, réservations, no-show, campagnes, promotions, paiements, support, exclusivité, accès aux données clients et conditions de résiliation.",
    84,
    462,
    1010,
    62,
    { fontSize: 20, color: C.slate },
  );
  addText(
    slide,
    "La promesse TOK : rendre ces postes visibles dans l'offre commerciale et dans le dashboard, au lieu de laisser les coûts variables apparaître après coup.",
    84,
    532,
    1010,
    34,
    { fontSize: 16, color: C.tokDark, bold: true },
  );
  addSourceNote(slide, "Sources : données TOK internes ; pages officielles Uber Eats Merchant, TheFork Manager ; documents financiers Just Eat Takeaway.com.");
}

// Slide 33
{
  const slide = addBaseSlide("Comparatif coûts : accès, abonnement, réservation", "Tableau concurrentiel", "33");
  const data = [
    ["Poste de coût", "TOK", "TheFork", "Uber Eats", "Just Eat"],
    [
      "Pack de lancement / setup",
      "Découverte 490 CHF\nEssentiel 990 CHF\nPro 1 990 CHF\nPremium 3 490 CHF",
      "Non publié publiquement.\nPlans Visibility, Performance, Enterprise.",
      "Pas de pack public standard.\nOnboarding marketplace.",
      "Tarif CH non publié.\nInscription partenaire à confirmer.",
    ],
    [
      "Abonnement restaurateur",
      "Starter 69 CHF/mois\nPro 129 CHF/mois\nPremium 199 CHF/mois\nElite 499 CHF/mois",
      "Prix officiel non affiché.\nBenchmarks tiers à valider.\nWidget direct annoncé sans commission.",
      "Pas d'abonnement logiciel public.\nFrais par commande selon plan.",
      "Non publié CH.\nJET mentionne aussi abonnements comme catégorie de revenu.",
    ],
    [
      "Réservation / couvert / table",
      "5 CHF par réservation confirmée facturable.\nPas de frais au couvert ni à la table.",
      "Réservations directes via widget : sans commission.\nMarketplace : commission visible dans le plan, non publique.",
      "N/A réservation.\nModèle centré commande/livraison.",
      "N/A réservation.\nModèle centré commande/livraison.",
    ],
    [
      "Commande / livraison",
      "Commission comptable TOK : 10% sur base éligible.",
      "N/A livraison pure dans ce comparatif.",
      "Marketplace : 20%, 25% ou 30%.\nSelf-delivery : 15%.\nPickup : 7% ou 10%.",
      "Montant CH non publié.\nJET publie : commissions par commande, paiement, admin, placement.",
    ],
  ];
  const table = slide.tables.add({
    rows: data.length,
    columns: data[0].length,
    left: 56,
    top: 156,
    width: 1168,
    height: 456,
    values: data,
  });
  styleTable(table, data.length, data[0].length);
  addSourceNote(
    slide,
    "Note : les tarifs non publiés doivent être demandés au commercial ou vérifiés dans l'interface partenaire. Les montants TOK proviennent du modèle produit actuel.",
  );
}

// Slide 34
{
  const slide = addBaseSlide("Comparatif coûts : mise en avant et variables cachées", "Tableau concurrentiel", "34");
  const data = [
    ["Poste de coût", "TOK", "TheFork", "Uber Eats", "Just Eat"],
    [
      "Mise en avant / publicité",
      "Budget choisi par le restaurateur.\nCarte restaurant : x1.\nBannière : x1,35.\nCrédits inclus selon pack/abonnement.",
      "Options visibilité et performance selon plan.\nMontants non publics.",
      "Ads/offres selon budget et plan.\nPremium annonce un match d'ads jusqu'à 100 USD/mois.",
      "JET publie des frais de placement promu, parfois par commande, parfois en revenu annexe.",
    ],
    [
      "Promotions / remises",
      "Contrôlées par le restaurateur.\nCoût = remise décidée + éventuel budget sponsorisé.",
      "Promotions possibles selon stratégie.\nImpact marge à simuler.",
      "Offres et réductions peuvent s'ajouter aux frais marketplace.",
      "Promotions et placements variables selon contrat.",
    ],
    [
      "Paiement / admin / ajustements",
      "Paiement Stripe côté serveur.\nFrais processeur selon configuration.\nFacturation réservation auditable.",
      "Conditions selon pays, produit et contrat.",
      "Frais visibles dans Uber Eats Manager.\nPeuvent varier par marché.",
      "JET publie des frais paiement en ligne et frais administratifs comme sources de revenu.",
    ],
    [
      "Données client / CRM / opérations",
      "CRM, campagnes, factures, réservations, plan de salle et opérations dans le dashboard TOK.",
      "Centralisation réservations + widgets directs.",
      "Relation client largement médiée par la plateforme.",
      "Relation client et visibilité dépendantes de la marketplace.",
    ],
  ];
  const table = slide.tables.add({
    rows: data.length,
    columns: data[0].length,
    left: 56,
    top: 156,
    width: 1168,
    height: 456,
    values: data,
  });
  styleTable(table, data.length, data[0].length);
  addSourceNote(
    slide,
    "Les coûts de publicité sont variables : budget, enchères, placement, géographie, contrat et niveau de service peuvent modifier la facture finale.",
  );
}

// Slide 35
{
  const slide = addBaseSlide("Simulation rapide : même volume, facture différente", "Exemple mensuel", "35");
  addText(
    slide,
    "Hypothèses de lecture : 100 commandes à 45 CHF de panier moyen, 200 réservations confirmées, budget visibilité de 200 CHF. Les montants concurrents non publiés restent à valider contractuellement.",
    56,
    152,
    1100,
    42,
    { fontSize: 18, color: C.slate },
  );
  const data = [
    ["Cas simulé", "TOK", "Uber Eats", "TheFork", "Just Eat"],
    [
      "100 commandes x 45 CHF",
      "450 CHF si base commissionnable à 10%.",
      "Lite 900 CHF, Plus 1 125 CHF, Premium 1 350 CHF.\nSelf-delivery 675 CHF.",
      "N/A livraison.",
      "Tarif CH non publié.\nComparer commission + paiement + admin + promotion.",
    ],
    [
      "200 réservations confirmées",
      "1 000 CHF avec frais de 5 CHF par réservation.",
      "N/A réservation.",
      "Widget direct : 0 commission.\nMarketplace : tarif non public.",
      "N/A réservation.",
    ],
    [
      "Mise en avant 200 CHF",
      "Carte : 200 CHF.\nBannière : 270 CHF.\nCrédits inclus possibles.",
      "Budget ads/offres selon plan et enchères.",
      "Dépend du plan visibilité/performance.",
      "Placement promu : montant non public.",
    ],
  ];
  const table = slide.tables.add({
    rows: data.length,
    columns: data[0].length,
    left: 56,
    top: 220,
    width: 1168,
    height: 312,
    values: data,
  });
  styleTable(table, data.length, data[0].length);
  addRect(slide, 56, 558, 1168, 78, "#FFF7ED", "#FDBA74", 8);
  addText(
    slide,
    "Message commercial : TOK doit vendre une facture lisible, pilotable et liée à des outils opérationnels. Le restaurateur compare moins un taux isolé qu'un coût total pour remplir sa salle, livrer mieux et garder ses clients.",
    82,
    578,
    1080,
    36,
    { fontSize: 17, color: C.tokDark, bold: true },
  );
  addSourceNote(slide, "Simulation indicative hors TVA, frais processeur, remises, remboursements, emballages et spécificités contractuelles.");
}

// Slide 36
{
  const slide = addBaseSlide("Checklist avant de signer une plateforme", "Argumentaire restaurateur", "36");
  const checks = [
    ["1", "Quel est le coût total mensuel ?", "Frais fixes, commissions, paiement, admin, publicité, promos et support."],
    ["2", "Quel canal coûte quoi ?", "Livraison, pickup, réservation directe, marketplace, réservation depuis Google/partenaires."],
    ["3", "Qui possède la relation client ?", "Accès au CRM, historique, opt-in marketing, avis, segmentation et relance."],
    ["4", "Quels frais apparaissent après coup ?", "No-show, annulation, remboursement, chargeback, ajustement prix, minimum spend."],
    ["5", "Quelle liberté commerciale reste au restaurant ?", "Prix menu, exclusivité, résiliation, données, campagnes, mise en avant."],
  ];
  for (let i = 0; i < checks.length; i += 1) {
    const y = 158 + i * 92;
    addRect(slide, 56, y, 1168, 72, C.white, C.line, 8);
    addRect(slide, 78, y + 18, 36, 36, C.tok, C.tok, 18);
    addText(slide, checks[i][0], 88, y + 25, 16, 20, {
      fontSize: 15,
      bold: true,
      color: C.white,
      alignment: "center",
    });
    addText(slide, checks[i][1], 136, y + 14, 460, 24, {
      fontSize: 19,
      bold: true,
      color: C.ink,
    });
    addText(slide, checks[i][2], 136, y + 40, 940, 22, {
      fontSize: 15,
      color: C.slate,
    });
  }
  addText(
    slide,
    "Positionnement TOK : un pack d'activation + un abonnement clair + des coûts variables explicités, avec un tableau de bord qui relie dépense, réservations, commandes, campagnes et marge.",
    56,
    628,
    1130,
    34,
    { fontSize: 18, color: C.tokDark, bold: true },
  );
}

const updatedSources = `# Sources - section coûts restaurateur

## Données TOK internes

- Packs de lancement : \`supabase/migrations/20260404120000_launch_offer_packs.sql\`
- Abonnements restaurateur : \`supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql\`
- Frais de réservation : \`supabase/migrations/20260417120000_reservation_billing_schema.sql\`
- Commission comptable TOK : \`src/lib/comptaFlow.ts\`
- Mise en avant / pricing campagne : \`src/lib/campaignPricing.ts\`

## Sources concurrentes utilisées

- Uber Eats Merchant pricing : https://merchants.ubereats.com/us/en/pricing/
- Uber Help, marketplace fee changes : https://help.uber.com/merchants-and-restaurants/article/uber-eats-marketplace-fee-changes--?nodeId=2cec9c6f-a7b8-47b5-8cc8-07c8a2c24569
- TheFork Manager, restaurant software price/features : https://www.theforkmanager.com/en/restaurant-software-price
- TheFork Manager, packages Visibility / Performance / Enterprise : https://www.theforkmanager.com/en/blog/thefork-tools/new-packages-thefork-manager
- TheFork Manager, booking widget and direct reservations : https://www.theforkmanager.com/en/restaurant-booking-management
- Just Eat Takeaway.com, rapports et documents investisseurs : https://www.justeattakeaway.com/investors/shareholders-meetings/2025/default.aspx

## Limites

- TheFork ne publie pas un prix universel par couvert ou par réservation sur les pages consultées. Les pages officielles indiquent que le widget direct est sans commission et que le plan/commission applicable dépend du compte/contrat.
- Just Eat Suisse ne publie pas de grille tarifaire restaurateur complète sur les pages publiques consultées. Le rapport annuel JET décrit les catégories de revenus : commissions, frais de paiement, frais administratifs, placements promus et abonnements.
- Uber Eats publie des taux de référence, mais précise que certains frais varient par marché, canal et configuration partenaire.
`;

await fs.mkdir(slidesDir, { recursive: true });
await fs.writeFile(path.join(outDir, "TOK-dossier-restaurateurs-couts-sources.md"), updatedSources, "utf8");

const exportedPptx = await PresentationFile.exportPptx(presentation);
await exportedPptx.save(outputPptx);

const slides = presentation.slides.items;
for (let i = 0; i < slides.length; i += 1) {
  const rendered = await presentation.export({
    slide: slides[i],
    format: "png",
    scale: 1,
  });
  await fs.writeFile(
    path.join(slidesDir, `slide-${String(i + 1).padStart(2, "0")}.png`),
    Buffer.from(await rendered.arrayBuffer()),
  );
}

const montage = await presentation.export({
  format: "webp",
  montage: true,
  scale: 0.5,
});
await fs.writeFile(montagePath, Buffer.from(await montage.arrayBuffer()));

const inspect = await presentation.inspect({ includeText: true, includeGeometry: true });
await fs.writeFile(inspectPath, typeof inspect === "string" ? inspect : inspect.ndjson, "utf8");

console.log(JSON.stringify({
  outputPptx,
  slideCount: slides.length,
  slidesDir,
  inspectPath,
  montagePath,
}));
