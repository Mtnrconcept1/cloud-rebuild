from __future__ import annotations

import sys
from pathlib import Path

VENDOR = Path(__file__).resolve().parents[1] / ".tmp" / "docx_vendor"
if str(VENDOR) not in sys.path:
    sys.path.insert(0, str(VENDOR))

from docx import Document
from docx.enum.section import WD_SECTION
from docx.enum.table import WD_ALIGN_VERTICAL, WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Cm, Inches, Pt, RGBColor


OUTPUT_DIR = Path(__file__).resolve().parents[1] / "outputs"
DOCX_PATH = OUTPUT_DIR / "tok_business_plan_2026_2029.docx"
SOURCE_NOTES_PATH = OUTPUT_DIR / "tok_business_plan_2026_2029_sources.txt"

BLUE = RGBColor(0x2E, 0x74, 0xB5)
DARK_BLUE = RGBColor(0x1F, 0x4D, 0x78)
INK = RGBColor(0x0B, 0x25, 0x45)
MUTED = RGBColor(0x66, 0x66, 0x66)
LIGHT_FILL = "F2F4F7"


def set_cell_shading(cell, fill: str) -> None:
    tc_pr = cell._tc.get_or_add_tcPr()
    shd = OxmlElement("w:shd")
    shd.set(qn("w:fill"), fill)
    tc_pr.append(shd)


def set_repeat_table_header(row) -> None:
    tr_pr = row._tr.get_or_add_trPr()
    tbl_header = OxmlElement("w:tblHeader")
    tbl_header.set(qn("w:val"), "true")
    tr_pr.append(tbl_header)


def set_cell_text(cell, text: str, bold: bool = False, color: RGBColor | None = None, align=WD_ALIGN_PARAGRAPH.LEFT) -> None:
    cell.text = ""
    p = cell.paragraphs[0]
    p.alignment = align
    p.paragraph_format.space_after = Pt(3)
    run = p.add_run(text)
    run.bold = bold
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(10.5)
    if color:
        run.font.color.rgb = color
    cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER


def add_paragraph(document: Document, text: str = "", style: str | None = None, *, bold: bool = False, color: RGBColor | None = None, size: float | None = None, align=WD_ALIGN_PARAGRAPH.LEFT):
    p = document.add_paragraph(style=style) if style else document.add_paragraph()
    p.alignment = align
    if text:
        run = p.add_run(text)
        run.bold = bold
        run.font.name = "Calibri"
        run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        if color:
            run.font.color.rgb = color
        if size:
            run.font.size = Pt(size)
    return p


def add_bullet(document: Document, text: str) -> None:
    p = document.add_paragraph(style="List Bullet")
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(text)
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(11)


def add_number(document: Document, text: str) -> None:
    p = document.add_paragraph(style="List Number")
    p.paragraph_format.space_after = Pt(4)
    p.paragraph_format.line_spacing = 1.15
    run = p.add_run(text)
    run.font.name = "Calibri"
    run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    run.font.size = Pt(11)


def add_table(document: Document, headers: list[str], rows: list[list[str]], widths: list[float]) -> None:
    table = document.add_table(rows=1, cols=len(headers))
    table.alignment = WD_TABLE_ALIGNMENT.LEFT
    table.style = "Table Grid"
    table.autofit = False
    hdr = table.rows[0]
    set_repeat_table_header(hdr)
    for idx, header in enumerate(headers):
        hdr.cells[idx].width = Inches(widths[idx])
        set_cell_shading(hdr.cells[idx], LIGHT_FILL)
        set_cell_text(hdr.cells[idx], header, bold=True, color=INK)
    for row in rows:
        cells = table.add_row().cells
        for idx, value in enumerate(row):
            cells[idx].width = Inches(widths[idx])
            align = WD_ALIGN_PARAGRAPH.CENTER if idx > 0 and len(value) < 14 else WD_ALIGN_PARAGRAPH.LEFT
            set_cell_text(cells[idx], value, align=align)
    document.add_paragraph()


def configure_styles(document: Document) -> None:
    normal = document.styles["Normal"]
    normal.font.name = "Calibri"
    normal._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    normal._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    normal.font.size = Pt(11)
    normal.paragraph_format.space_after = Pt(6)
    normal.paragraph_format.line_spacing = 1.1

    for style_name, size, color, before, after in [
        ("Heading 1", 16, BLUE, 16, 8),
        ("Heading 2", 13, BLUE, 12, 6),
        ("Heading 3", 12, DARK_BLUE, 8, 4),
    ]:
        style = document.styles[style_name]
        style.font.name = "Calibri"
        style._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
        style._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
        style.font.size = Pt(size)
        style.font.bold = True
        style.font.color.rgb = color
        style.paragraph_format.space_before = Pt(before)
        style.paragraph_format.space_after = Pt(after)
        style.paragraph_format.line_spacing = 1.1

    for section in document.sections:
        section.page_width = Inches(8.5)
        section.page_height = Inches(11)
        section.top_margin = Inches(1)
        section.bottom_margin = Inches(1)
        section.left_margin = Inches(1)
        section.right_margin = Inches(1)
        section.header_distance = Inches(0.49)
        section.footer_distance = Inches(0.49)


def add_header_footer(document: Document) -> None:
    section = document.sections[0]
    header = section.header
    header_p = header.paragraphs[0]
    header_p.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    header_run = header_p.add_run("TOK | Business Plan 2026-2029")
    header_run.font.name = "Calibri"
    header_run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    header_run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    header_run.font.size = Pt(9)
    header_run.font.color.rgb = MUTED

    footer = section.footer
    footer_p = footer.paragraphs[0]
    footer_p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    footer_run = footer_p.add_run("Document de travail | Estimations indicatives basees sur le produit actuel et des hypotheses de marche raisonnables")
    footer_run.font.name = "Calibri"
    footer_run._element.rPr.rFonts.set(qn("w:ascii"), "Calibri")
    footer_run._element.rPr.rFonts.set(qn("w:hAnsi"), "Calibri")
    footer_run.font.size = Pt(8.5)
    footer_run.font.color.rgb = MUTED


def build_document() -> Document:
    doc = Document()
    configure_styles(doc)
    add_header_footer(doc)

    title = add_paragraph(doc, "TOK / TheTok", bold=True, color=INK, size=24)
    title.paragraph_format.space_after = Pt(4)
    subtitle = add_paragraph(doc, "Business plan complet et projections de revenu 2026-2029", color=BLUE, size=16)
    subtitle.paragraph_format.space_after = Pt(10)
    add_paragraph(doc, "Version: juin 2026 | Marche cible prioritaire: Geneve puis Suisse romande", color=MUTED, size=10.5)
    add_paragraph(
        doc,
        "Ce document synthese presente le positionnement, le modele economique, les hypotheses d'execution et les projections basse, moyenne et haute de TOK sur les trois prochaines annees.",
    )

    doc.add_page_break()

    add_paragraph(doc, "1. Resume executif", "Heading 1")
    add_paragraph(
        doc,
        "TOK est une plateforme suisse restaurant-first qui combine acquisition client, reservation, commande directe, fidelite, abonnement premium, campagnes marketing et outils d'exploitation restaurant. L'opportunite n'est pas seulement de generer du volume transactionnel; elle est de devenir la couche de revenu, d'operations et de relation client des restaurants independants.",
    )
    for bullet in [
        "Le produit deja present dans le code supporte quatre surfaces monetisables: client, dashboard restaurateur, back-office admin et courier.",
        "Le coeur du modele economique est diversifie: packs de lancement, abonnements restaurateurs, frais de reservation, commissions sur commandes directes, campagnes sponsorisees et abonnement client Tok One.",
        "Le meilleur chemin de monetisation est local, dense et discipliné: Geneve d'abord, puis Lausanne et une troisieme zone romande seulement apres validation du PMF.",
        "Le scenario moyen conduit a environ 3.05 MCHF de revenu annuel en annee 3; le scenario bas reste au-dessus du million, le scenario haut depasse 8 MCHF avec une execution commerciale exceptionnelle.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "2. Ce que le produit vend deja ou prepare", "Heading 1")
    add_paragraph(doc, "Les monetisations lisibles dans le repository actuel sont les suivantes:")
    add_table(
        doc,
        ["Ligne de revenu", "Base produit", "Prix / logique actuelle", "Role dans le mix"],
        [
            ["Packs de lancement restaurateur", "launch_packs", "490 / 990 / 1'990 / 3'490 CHF", "Cash d'acquisition et onboarding"],
            ["Abonnements restaurateur", "restaurant_subscription_plans", "69 / 129 / 199 / 499 CHF / mois", "MRR B2B"],
            ["Tok One client", "user_subscription_plans", "9.90 CHF / mois ou 89.90 CHF / an", "MRR B2C et fidelisation"],
            ["Frais de reservation", "reservations.billing_fee_chf", "5 CHF / reservation", "Revenu peu capitalistique"],
            ["Commandes directes", "commission_rate / checkout", "take rate nette variable", "Scale transactionnel"],
            ["Campagnes sponsorisees", "ad_campaigns", "budget + CPC/CVR", "ARPU restaurant additionnel"],
        ],
        [1.8, 1.4, 1.5, 1.8],
    )

    add_paragraph(doc, "3. Probleme marche", "Heading 1")
    add_paragraph(
        doc,
        "Les restaurants independants ont quatre douleurs structurelles: commissions elevees, faible controle de la relation client, fragmentation des outils et manque de visibilite operationnelle. En parallele, les consommateurs veulent une experience simple, locale, mobile et fidele.",
    )
    for bullet in [
        "Les marketplaces classiques captent une partie significative de la marge sans toujours apporter un controle durable sur le client final.",
        "Les reservations, commandes, avis, campagnes, support et facturation sont souvent eparpilles dans des outils distincts.",
        "Les exploitants veulent un canal complementaire plus previsible, pas seulement un nouveau cout d'acquisition.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "4. Solution et proposition de valeur", "Heading 1")
    add_paragraph(
        doc,
        "TOK se positionne comme une plateforme unifiee et premium pour la restauration en Suisse romande. Le produit relie la decouverte, la transaction et l'exploitation au lieu de traiter ces sujets separement.",
    )
    add_table(
        doc,
        ["Surface", "Valeur cle", "Effet economique"],
        [
            ["Client", "Decouverte, reservation, panier, suivi, flash sales, anti-gaspi, Tok One", "Plus de conversion et recurrence"],
            ["Restaurateur", "Menu, commandes, reservations, CRM, campagnes, photos, compta, support", "Plus de controle et MRR"],
            ["Admin", "Audit, moderation, configuration, compta plateforme, incidents", "Pilotage et reduction du risque"],
            ["Courier", "Jobs, earnings, profile, dispatch", "Option de capacite logistique"],
        ],
        [1.3, 3.3, 1.9],
    )

    add_paragraph(doc, "5. Positionnement strategique", "Heading 1")
    add_paragraph(
        doc,
        "La these la plus forte n'est pas de devenir uniquement un acteur de delivery. La these la plus defendable est de devenir le systeme de revenu et d'operations des restaurants partenaires, avec une couche transactionnelle selective la ou elle est rentable.",
    )
    for bullet in [
        "Prioriser les reservations, l'onboarding B2B et les campagnes sponsorisees donne un meilleur ratio marge / complexite qu'une course immediate au delivery.",
        "Le discours commercial doit rester: moins de dependance, plus de controle, plus de revenu direct, meilleure lecture business.",
        "La densite locale vaut plus que la dispersion geographique. Chaque nouvelle ville doit etre lancee quand l'offre et la demande locales sont deja vivantes.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "6. Modele economique cible", "Heading 1")
    add_paragraph(
        doc,
        "Le modele economique doit etre construit par strates. Les lignes les moins capitalistiques financent la montee en puissance des lignes transactionnelles.",
    )
    for bullet in [
        "Couche 1 - Cash rapide: packs de lancement et abonnements restaurateurs.",
        "Couche 2 - Revenu recurrent rentable: reservations, campagnes, CRM premium et Tok One.",
        "Couche 3 - Scale transactionnel: commandes directes, prise de commission et monetisation des usages frequents.",
        "Couche 4 - Optionalite: IA photo, IA support, recommendations sponsorisees, monetisation B2B de data/insights.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "7. Hypotheses financieres", "Heading 1")
    add_table(
        doc,
        ["Hypothese", "Bas", "Moyen", "Haut"],
        [
            ["Restaurants actifs fin annee 1", "20", "35", "60"],
            ["Restaurants actifs fin annee 2", "55", "110", "220"],
            ["Restaurants actifs fin annee 3", "120", "240", "500"],
            ["Take rate nette commandes", "6.0%", "8.0%", "10.0%",],
            ["Reservations payantes / restaurant / mois en annee 3", "12", "25", "45"],
            ["Taux de penetration Tok One sur base client active", "faible", "modere", "fort"],
            ["ARPU campagnes sponsorisees / resto / mois A3", "80 CHF", "150 CHF", "300 CHF"],
        ],
        [2.8, 0.9, 0.9, 0.9],
    )

    add_paragraph(doc, "8. Projections de revenu 3 ans", "Heading 1")
    add_table(
        doc,
        ["Scenario", "Annee 1", "Annee 2", "Annee 3"],
        [
            ["Bas", "135 kCHF", "445 kCHF", "1.04 MCHF"],
            ["Moyen", "365 kCHF", "1.32 MCHF", "3.05 MCHF"],
            ["Haut", "878 kCHF", "3.17 MCHF", "8.01 MCHF"],
        ],
        [2.2, 1.4, 1.4, 1.4],
    )

    add_paragraph(doc, "9. Decomposition du scenario moyen", "Heading 1")
    add_table(
        doc,
        ["Ligne", "A1", "A2", "A3"],
        [
            ["Packs de lancement", "68 kCHF", "174 kCHF", "220 kCHF"],
            ["Abonnements restaurateurs", "40 kCHF", "108 kCHF", "230 kCHF"],
            ["Frais de reservation", "97 kCHF", "311 kCHF", "700 kCHF"],
            ["Commandes directes", "108 kCHF", "514 kCHF", "1.35 MCHF"],
            ["Campagnes sponsorisees", "20 kCHF", "85 kCHF", "180 kCHF"],
            ["Tok One", "32 kCHF", "127 kCHF", "370 kCHF"],
        ],
        [2.4, 1.2, 1.2, 1.2],
    )
    add_paragraph(
        doc,
        "Lecture: l'annee 1 est essentiellement financee par le B2B et les reservations. L'annee 2 valide la recurrence. L'annee 3 est celle ou les commandes directes deviennent le premier moteur de revenu.",
    )

    add_paragraph(doc, "10. Go-to-market", "Heading 1")
    for idx, step in enumerate([
        "0 a 12 mois: Geneve. Signer 20 a 35 restaurants actifs, standardiser l'onboarding, pousser les packs, reservations et premiers flux Tok One.",
        "12 a 24 mois: Lausanne + 1 zone romande. Industrialiser la prospection, la demo et le support restaurateur. Commencer a densifier les campagnes sponsorisees.",
        "24 a 36 mois: concentration sur la retention, la densite locale et l'upsell. N'etendre que ce qui prouve sa marge.",
    ], 1):
        add_number(doc, step)

    add_paragraph(doc, "11. Strategie commerciale", "Heading 1")
    add_table(
        doc,
        ["Canal", "Objectif", "Message commercial"],
        [
            ["Prospection directe", "Signer les premiers comptes", "Moins de commission, plus de controle"],
            ["Landing pages B2B", "Generer des leads inbound", "Alternative locale premium et mesurable"],
            ["Google Business / SEO local", "Capturer l'intention", "Reservation et commande directe sans friction"],
            ["Partenariats restaurants vitrines", "Creer la preuve", "Cas clients, contenu, bouche-a-oreille"],
        ],
        [1.8, 1.6, 3.1],
    )

    add_paragraph(doc, "12. Operations et execution", "Heading 1")
    add_paragraph(
        doc,
        "Le repository montre que les zones critiques sont deja bien identifiees: paiements Stripe, RLS Supabase, workflow d'activation, admin incidents, notifications et compta. Cela permet de penser le business plan comme un sujet d'execution commerciale et de priorisation, plus que comme un sujet de faisabilite produit pure.",
    )
    for bullet in [
        "Ne pas ouvrir trop tot la logistique courier comme axe principal tant que la marge n'est pas lisible.",
        "Mesurer strictement les temps d'onboarding restaurant, les incidents de paiement, le support, le taux d'activation menu et la recurrence d'usage.",
        "Garder un cadre de feature flags et de gouvernance pour activer les modules ville par ville.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "13. KPIs de pilotage", "Heading 1")
    add_table(
        doc,
        ["Bloc", "KPI critique", "Pourquoi"],
        [
            ["Acquisition resto", "Restaurants signes / actives", "Mesure la traction commerciale utile"],
            ["Activation", "Temps moyen onboarding / menu live", "Conditionne le time-to-revenue"],
            ["Transactions", "Reservations, commandes, GMV", "Mesure la profondeur d'usage"],
            ["Retention", "Churn resto, frequence client, reachat Tok One", "Mesure la qualite du PMF"],
            ["Unit economics", "CAC, LTV, take rate nette, marge par ligne", "Evite la croissance destructrice"],
        ],
        [1.5, 2.0, 3.0],
    )

    add_paragraph(doc, "14. Principaux risques", "Heading 1")
    for bullet in [
        "Trop de largeur produit avant une densite locale suffisante.",
        "Complexite support / remboursement / incident si le transactionnel scale avant les ops.",
        "Acquisition B2C trop precoce si l'offre restaurant reste trop peu dense.",
        "Confusion de positionnement si TOK se presente a la fois comme SaaS, marketplace, media et logisticien sans ordre clair.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "15. Recommandation strategique", "Heading 1")
    add_paragraph(
        doc,
        "Le meilleur plan n'est pas de chercher le scenario haut immediatement. Il faut viser le scenario moyen comme objectif directeur: il est suffisamment ambitieux pour attirer partenaires et investisseurs, tout en restant ancre dans des hypotheses denses et pilotables.",
    )
    for bullet in [
        "Priorite revenu 12 mois: packs + abonnements + reservations.",
        "Priorite produit 12 mois: fiabilite, activation, SEO local, admin ops, campagnes simples.",
        "Priorite 24 mois: commandes directes et Tok One comme accelerateurs de recurrence.",
        "Priorite 36 mois: CRM premium, campagnes sponsorisees, IA et expansion selective.",
    ]:
        add_bullet(doc, bullet)

    add_paragraph(doc, "16. Conclusion", "Heading 1")
    add_paragraph(
        doc,
        "TOK peut raisonnablement viser entre 1.0 MCHF et 3.0 MCHF de revenu annuel a horizon trois ans sans hypothese irreelle. Le levier decisif n'est pas une guerre frontale du delivery mais un systeme local, premium et restaurant-first ou chaque ligne de revenu renforce les autres.",
    )

    section = doc.add_section(WD_SECTION.NEW_PAGE)
    configure_styles(doc)
    section.header.is_linked_to_previous = True
    section.footer.is_linked_to_previous = True
    add_paragraph(doc, "Annexe - Sources et ancrages utilises", "Heading 1")
    sources = [
        "Repository TOK / TheTok local: lecture du routing, des pages, des migrations Supabase, des fonctions Edge et des prix seeds au 17 juin 2026.",
        "Office federal de la statistique (Suisse): consommation des menages, rubrique restaurants and accommodation services, acces juin 2026.",
        "Stripe - Payments in Switzerland: adoption cartes et sans contact, acces juin 2026.",
        "GastroSuisse - conjoncture 2026: signal de pression sur le chiffre d'affaires du secteur.",
        "Zenchef pricing / positioning: reference de marche sur l'angle zero commission / zero commission per cover.",
    ]
    for src in sources:
        add_bullet(doc, src)

    return doc


def write_source_notes() -> None:
    text = """TOK business plan - source notes

Internal product anchors
- src/pages/PacksRestaurateur.tsx
- src/pages/TokOne.tsx
- src/pages/AlternativeCommissionCouvert.tsx
- supabase/migrations/20260404120000_launch_offer_packs.sql
- supabase/migrations/20260526170535_tok_one_default_plan.sql
- supabase/migrations/20260615001515_restaurateur_onboarding_payment_gate.sql
- supabase/migrations/20260417120000_reservation_billing_schema.sql
- supabase/migrations/20260425014839_campaign_hybrid_pricing.sql
- supabase/migrations/20260607033000_platform_finance_sales_governance.sql

External market anchors used in the narrative
- OFS/BFS Switzerland: household final consumption expenditure, restaurants and accommodation services
- Stripe Switzerland payments overview
- GastroSuisse business climate note
- Zenchef pricing / zero commission positioning

Method
- Forecasts are scenario-based estimates, not observed production revenue.
- Scenarios were derived from productized revenue lines visible in the codebase and from local-market execution assumptions.
"""
    SOURCE_NOTES_PATH.write_text(text, encoding="utf-8")


def main() -> None:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    write_source_notes()
    document = build_document()
    document.save(DOCX_PATH)
    print(DOCX_PATH)


if __name__ == "__main__":
    main()
