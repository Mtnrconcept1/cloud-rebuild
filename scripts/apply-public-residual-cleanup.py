from pathlib import Path


def update(path: str, replacements: list[tuple[str, str]]) -> None:
    p = Path(path)
    text = p.read_text(encoding="utf-8")
    for old, new in replacements:
        if old not in text:
            raise SystemExit(f"{path}: missing expected text: {old[:120]!r}")
        text = text.replace(old, new, 1)
    p.write_text(text, encoding="utf-8")


update("src/pages/Aide.tsx", [
    (
        "Le total final peut inclure options, suppléments, consigne, frais de service, livraison, réductions, code promo, Miamz, taxes applicables ou frais liés au mode de paiement.",
        "Le total final peut inclure options, suppléments, consigne, frais de service, réductions, code promo, Miamz, taxes applicables ou frais liés au mode de paiement.",
    ),
    (
        "Si le pourboire est disponible, il apparaît dans le panier ou après livraison.",
        "Si le pourboire est disponible, il apparaît dans le panier ou après une commande terminée.",
    ),
    (
        "Les fonctions désactivées côté admin doivent disparaître de toute la plateforme.",
        "Une fonctionnalité non disponible ne doit pas être présentée comme active dans l'interface.",
    ),
    (
        "TOK Connect utilise OAuth client-credentials, des tokens opaques courts, des secrets hashés, des scopes, des quotas, des logs d'audit, des contrôles côté Edge Function et des signatures webhook. Les mutations sensibles ne sont pas faites directement depuis le navigateur.",
        "TOK Connect applique une authentification dédiée, des autorisations limitées au périmètre accordé, des quotas, une journalisation de sécurité et des signatures pour les échanges sensibles.",
    ),
    (
        "La page publique /tok-connect présente le produit. Le portail /tok-connect/developer donne accès à la documentation OpenAPI, aux clients sandbox, aux logs, quotas, webhooks et exemples MCP pour les utilisateurs autorisés. Les admins disposent d'une supervision dédiée dans /admin/tok-connect.",
        "La page TOK Connect et l'espace partenaire autorisé donnent accès à la documentation, aux environnements de test et aux outils prévus pour le compte concerné.",
    ),
])

update("src/pages/TokOne.tsx", [
    (
        '''          <StatTile
            value="0 CHF"
            label="Frais TOK éligibles"
            detail="Le bénéfice livraison s'applique automatiquement quand le panier est couvert."
          />''',
        '''          <StatTile
            value="VIP"
            label="Avantages membres"
            detail="Les avantages actifs sont appliqués automatiquement sur les parcours éligibles."
          />''',
    ),
    (
        "Commande, livraison, réservation, ventes flash ou Table du Chef :\n              votre statut premium suit votre compte.",
        "Commandes à emporter, réservations, ventes flash ou Table du Chef :\n              votre statut premium suit votre compte.",
    ),
])

update("src/pages/PacksRestaurateur.tsx", [
    (
        "Fair Growth facture uniquement la valeur réellement créée : vos canaux propres restent gratuits, les réservations TOK ne sont facturées que lorsqu'elles sont honorées et le restaurant conserve au minimum 90% de chaque commande.",
        "Les réservations honorées sont facturées CHF 5, et chaque commande marketplace à emporter applique une répartition fixe : 90% au restaurant et 10% à TOK, quel que soit l'abonnement.",
    ),
])

Path("scripts/apply-public-residual-cleanup.py").unlink(missing_ok=True)
Path(".github/workflows/apply-public-residual-cleanup.yml").unlink(missing_ok=True)
