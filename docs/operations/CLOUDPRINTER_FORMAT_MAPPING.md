# Cloudprinter : formats de génération et d’impression

Vérification du 9 octobre 2026, projet TOK `wwcrtyoueexyxkkikaos`.

Le catalogue compte 1 668 références distinctes retournées par l’API du compte Cloudprinter. Ce catalogue fournisseur inclut des vêtements, objets et produits multipages : toutes ces références ne sont pas imprimables depuis un visuel unique du Marketing Studio.

## Parcours pris en charge

1. Choisir la destination Impression et un support disponible avant de générer.
2. La génération enregistre le produit, les dimensions et les fonds perdus vérifiés côté serveur. L’orientation native est déduite de ces dimensions.
3. Ouvrir l’impression depuis la création sélectionnée. Le support est verrouillé ; changer le support du studio après la génération ne modifie pas celui de cette création.
4. Le serveur contrôle à nouveau le contrat enregistré et le catalogue actif avant le BAT. Le PDF vérifie le ratio et la résolution à partir du PNG/JPEG décodé.

Les créations numériques ou anciennes sans contrat d’impression enregistré doivent être régénérées avec un support d’impression. Un ratio seul ne permet pas de distinguer un A4 d’un A5 et ne sert donc pas à deviner un format physique.

## Mappings actifs vérifiés via `/products/info`

Les dimensions sont celles du format fini, en millimètres. Chaque support ci-dessous est recto, une page, avec 3 mm de fond perdu.

| Support TOK | Largeur × hauteur | Référence Cloudprinter |
| --- | --- | --- |
| Flyer A6 | 105 × 148 | `card_flat_105x148_mm_single_fc_tnr` |
| Flyer A5 | 148 × 210 | `card_flat_148x210_mm_single_fc_tnr` |
| Flyer A4 | 210 × 297 | `card_flat_210x297_mm_single_fc_tnr` |
| Affiche A3 | 297 × 420 | `poster_a3_fc` |
| Carte paysage | 85 × 55 | `businesscard_ss_int_bc_fc` |
| Carte portrait | 55 × 85 | `businesscard_ss_int_p_bc_fc` |
| Carte carrée | 55 × 55 | `businesscard_ss_s55_mm_bc_fc` |
| Carte / menu DL | 98 × 210 | `card_flat_98x210_mm_single_sided_fc_tnr` |

Les mappings des menus pliés A6/A5 et calendriers bureau A5, mural A4/A3 sont conservés mais inactifs. Ils exigent plusieurs faces/pages, que le générateur de BAT actuel ne produit pas. Les variantes recto-verso restent également inactives. Les catalogues de génération et de commande excluent ces produits même si un ancien réglage les marque actifs.

## Exploitation

L’Edge Function `print-catalog` réserve aux administrateurs et services explicitement autorisés :

- `discover`, avec `offset` et `limit` (100 maximum), lit les références disponibles chez Cloudprinter ;
- `sync` déduplique les références puis synchronise par lots, sans écraser les mappings ni leur activation ;
- `map`, avec `reference`, `productId` et `active`, relit les spécifications fournisseur et valide la géométrie orientée avant d’enregistrer et auditer le mapping ;
- `admin_mappings` permet de consulter les mappings par pages, sans troncature aux 100 premières références.

Les détails des 50 premiers mappings au maximum sont rafraîchis par `sync` ; `hydrate` et `map` permettent de rafraîchir les autres individuellement. Un code d’erreur de base neutre aide à diagnostiquer les échecs sans exposer les messages SQL ni les secrets.

La migration `20261009003407_protect_generated_print_format.sql` réserve la modification de `metadata.marketing_output_target` aux rôles serveur. Elle ne change ni les droits d’accès aux autres métadonnées ni les politiques RLS existantes.

## Vérification et retour arrière

Les tests couvrent le format verrouillé, les anciennes créations sélectionnées, les erreurs de mapping, la pagination, les pages multiples et les dimensions décodées. Le smoke SQL `supabase/tests/generated_print_format_smoke.sql` vérifie les rôles et annule ses données temporaires.

Le retour arrière applicatif consiste à révoquer le commit et redéployer les fonctions concernées (`print-catalog`, `print-admin`, `print-export`, `ai-image-enhance`). La protection SQL peut rester en place avec l’ancien code. Les mappings retirés du choix d’impression ne doivent être réactivés qu’après prise en charge réelle des faces/pages supplémentaires. Aucun paiement ni ordre d’impression réel n’a été déclenché pour ces vérifications.
