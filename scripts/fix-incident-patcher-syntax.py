from pathlib import Path

path = Path("scripts/apply-incident-intelligence-unification.mjs")
source = path.read_text(encoding="utf-8")

replacements = [
    (
        "          content: `Tu analyses un incident technique TOK à partir de preuves nettoyées.",
        "          content: \\`Tu analyses un incident technique TOK à partir de preuves nettoyées.",
    ),
    (
        "Réponds en français opérationnel dans le schéma demandé.`,",
        "Réponds en français opérationnel dans le schéma demandé.\\`,",
    ),
    (
        "  const systemPrompt = `Tu es TOK Guardian. Approfondis uniquement les éléments que le diagnostic canonique ne tranche pas.",
        "  const systemPrompt = \\`Tu es TOK Guardian. Approfondis uniquement les éléments que le diagnostic canonique ne tranche pas.",
    ),
    (
        "human_approval_required reste vrai. Réponds en français technique dans le schéma demandé.`;",
        "human_approval_required reste vrai. Réponds en français technique dans le schéma demandé.\\`;",
    ),
    (
        "  const systemPrompt = `Tu es TOK Support & Resolution, agent interne de résolution pour une plateforme suisse de restauration.",
        "  const systemPrompt = \\`Tu es TOK Support & Resolution, agent interne de résolution pour une plateforme suisse de restauration.",
    ),
    (
        "Réponds en français opérationnel.`;",
        "Réponds en français opérationnel.\\`;",
    ),
]

for old, new in replacements:
    count = source.count(old)
    if count != 1:
        raise SystemExit(f"Expected one occurrence of {old!r}, found {count}")
    source = source.replace(old, new, 1)

path.write_text(source, encoding="utf-8")
print("Nested template literals escaped for the one-shot patcher.")
