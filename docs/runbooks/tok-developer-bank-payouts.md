# Versement développeur sans Stripe Connect : PostFinance

Le paiement client reste encaissé par Stripe dans le compte marchand TOK.
Les commissions et les abonnements entrent dans le grand livre TOK ;
le développeur est créancier selon les règles contractuelles du partage
(10 % TTC sur les abonnements, autres bases selon le contrat).

## Processus recommandé

1. Rapprocher Stripe (encaissements, TVA, remboursements et litiges) avec
   `financial_ledger`. Ne verser aucun revenu absent du grand livre.
2. Après la clôture du mois, exécuter `refresh_developer_statement` et
   rapprocher le montant exact du compte `developer_payable`.
3. Faire vérifier le relevé par l'administrateur autorisé et confirmer
   le bénéficiaire exact (identité / contrat / IBAN), sans stocker l'IBAN
   en dur dans le dépôt, dans des logs ou dans des URLs.
4. Depuis le compte bancaire **professionnel de TOK**, saisir le paiement
   dans PostFinance e-finance, ou importer un ordre XML ISO 20022 `pain.001`
   (OPAE) si l'entreprise dispose du service.
5. Un opérateur bancaire autorisé approuve le paiement dans PostFinance :
   la validation d'un relevé dans TOK n'est **pas** un ordre bancaire.
6. Après débit confirmé par PostFinance, enregistrer en comptabilité la
   référence du virement, sa date, son montant exact et la preuve bancaire
   dans le système d'audit autorisé, puis solder le compte développeur sans
   créer une seconde dépense.
7. Conserver un identifiant de relevé unique pour éviter un double paiement
   en cas de réimport du relevé bancaire. Les statuts `draft`,
   `validated` et `paid` ne doivent jamais être confondus.

L'Edge Function existante `settle-developer-statement` transfère par
Stripe Connect et **ne doit pas** être utilisée pour un virement PostFinance.
Aucune fonction TOK actuelle n'initie automatiquement des virements
sur l'IBAN d'un tiers. Le compte de versement Stripe de TOK ne doit
jamais être remplacé par le compte du développeur.

Sources : https://www.postfinance.ch/fr/entreprises/produits/trafic-des-paiements/effectuer-des-paiements/ordre-paiement-electronique.html

## Factures canonique TOK

L'unique facture métier `restaurant_invoices` et ses lignes
`restaurant_invoice_line_items` alimentent les deux dashboards.
Le modèle imprimable est `TokPayableInvoiceDialog` /
`TokPayableInvoiceDocument` (logo et charte TOK) ; aucune nouvelle facture
n'est générée lors d'une prévisualisation ou d'un PDF.
Les `subscription` sont incluses dans les factures **à TOK**.

La facture Stripe hébergée par Stripe reste un document de facturation/
paiement propre à Stripe : elle ne peut pas être remplacée par une page
HTML TOK arbitraire. Pour harmoniser son apparence, configurer logo,
couleurs, pied de page et champs personnalisés dans les paramètres
de facturation Stripe et vérifier les numéros/mentions légales.

**Contrôle juridique** : l'émetteur juridique sur la facture TOK doit
correspondre au titulaire du compte marchand Stripe et à l'entité
effectivement contractante ; revalider ces données si la société change.

## Émetteur légal TOK (registre du commerce de Genève)

Document fourni le 14 octobre 2026 : extrait internet RC, entreprise
**NEW DOG'S SERVICES Sàrl**, IDE **CHE-109.513.890**,
rue de Genève 6, Chêne-Bourg (code postal 1225 vérifié dans Stripe).
Cette même société apparaît comme entreprise du compte marchand Stripe
TOK `acct_1SHGJ2GTQigE34su`.

Le logo/marque commerciale TOK peut figurer sur le document, mais la
raison sociale légale de l'émetteur doit rester exacte. L'IDE ne prouve
pas à lui seul l'assujettissement à la TVA : vérifier le registre TVA
officiel avant d'ajouter le suffixe « TVA » à la facture. La répartition
HT/TVA/TTC de l'opération doit rester conservée comme comptabilisée.

**Vérification juridique encore nécessaire :** cet extrait indique
« toilettage pour chiens » pour le but social et un gérant à signature
individuelle. Faire confirmer par la gérance habilitée la relation entre
TOK et la société et, avec le conseil juridique/registre, l'adéquation
du but statutaire à la prestation de services numériques. Un extrait
internet non certifié n'est pas un acte de signature ni une autorisation.
