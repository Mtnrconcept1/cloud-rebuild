from pathlib import Path


def read(path):
    return Path(path).read_text(encoding="utf-8")


def write(path, text):
    Path(path).write_text(text, encoding="utf-8")


def rep(path, old, new, count=1):
    text = read(path)
    actual = text.count(old)
    if actual < count:
        raise SystemExit(f"{path}: expected >= {count}, found {actual}: {old[:120]!r}")
    write(path, text.replace(old, new, count))


p = "src/pages/Aide.tsx"
rep(p, "  Truck,\n", "")
rep(p, '''title: "Livraison & retrait",
    description: "Adresse, retrait à emporter, retards et créneaux.",
    icon: Truck,''', '''title: "Retrait à emporter",
    description: "Créneaux de retrait, préparation et récupération au restaurant.",
    icon: ShoppingBag,''')
rep(p, 'description: "Abonnement, livraison offerte, avantages et résiliation."', 'description: "Abonnement, avantages, priorités et résiliation."')
rep(p, '"Commande en cours non reçue, livreur bloqué ou adresse incorrecte."', '"Commande à emporter en cours, restaurant fermé ou créneau de retrait incorrect."')
rep(p, "Saisissez votre adresse dans la recherche ou dans le panier. L'application vérifie automatiquement les restaurants qui livrent chez vous, ceux disponibles en retrait et les offres proches. Si aucune livraison n'est disponible, le retrait à emporter ou les réservations peuvent rester accessibles selon les restaurants.", "Saisissez votre ville, une adresse de recherche ou votre position approximative. L'application affiche les restaurants proches disponibles pour le retrait à emporter, les réservations et les offres actives.")
rep(p, "par distance, horaires, livraison, retrait, offres, avis ou préférences.", "par distance, horaires, retrait à emporter, offres, avis ou préférences.")
rep(p, "sponsorisé, ouvert en ligne, livraison, retrait ou réservation.", "sponsorisé, ouvert en ligne, retrait à emporter ou réservation.")
rep(p, '''q: "Comment choisir entre livraison, retrait et réservation ?",
        a: "La livraison sert à recevoir votre repas à l'adresse choisie. Le retrait à emporter vous permet de commander et récupérer au restaurant à une heure donnée. La réservation sert à bloquer une table, parfois avec des options premium comme Zéro Attente ou La Table du Chef si elles sont disponibles."''', '''q: "Comment choisir entre retrait à emporter et réservation ?",
        a: "Le retrait à emporter vous permet de commander puis de récupérer la commande directement au restaurant au créneau choisi. La réservation sert à bloquer une table, parfois avec des options premium comme Zéro Attente ou La Table du Chef lorsqu'elles sont disponibles."''')
rep(p, "Dans le panier, vérifiez le restaurant, le mode de service, l'adresse ou l'heure de retrait, les frais, les réductions, le total et le moyen de paiement.", "Dans le panier, vérifiez le restaurant, le créneau de retrait, les réductions, le total et le moyen de paiement.")
rep(p, "commande créée, paiement confirmé, acceptée par le restaurant, en préparation, prête, prise en charge, en livraison, livrée, annulée ou remboursée selon le cas.", "commande créée, paiement confirmé, acceptée par le restaurant, en préparation, prête à retirer, retirée, annulée ou remboursée selon le cas.")
rep(p, "Tok One est un abonnement donnant accès à des avantages selon l'offre active : livraison offerte ou réduite, support prioritaire, accès anticipé, offres réservées, avantages fidélité ou expériences partenaires.", "Tok One est un abonnement donnant accès à des avantages selon l'offre active : support prioritaire, accès anticipé, offres réservées, avantages fidélité ou expériences partenaires.")
rep(p, "Ils peuvent être crédités après paiement, livraison, réservation honorée ou validation d'une action.", "Ils peuvent être crédités après une commande terminée, une réservation honorée ou la validation d'une action.")
rep(p, "Article manquant, erreur majeure, commande non livrée, double paiement, annulation restaurant, problème sanitaire, emballage renversé ou retard exceptionnel", "Article manquant, erreur majeure, commande à emporter non remise, double paiement, annulation restaurant, problème sanitaire, emballage endommagé ou retard exceptionnel")
rep(p, "Toute réservation honorée est facturée CHF 5, quel que soit le plan et quelle qu'en soit l'origine. Les abonnements couvrent l'accès et la commission marketplace : Starter CHF 69/mois et 9,9% par commande, Business CHF 129 et 8,9%, Premium CHF 199 et 7,9%, Elite CHF 499 et 6,9%. Elite inclut trois établissements, puis CHF 149/mois par site supplémentaire.", "Toute réservation honorée est facturée CHF 5, quel que soit le plan et quelle qu'en soit l'origine. Les abonnements sont Starter CHF 69/mois, Business CHF 129/mois, Premium CHF 199/mois et Elite CHF 499/mois. La commission d'une commande marketplace à emporter est fixe à 10% pour tous les plans. Elite inclut trois établissements, puis CHF 149/mois par site supplémentaire.")
rep(p, "Le restaurant conserve au minimum 90% du montant éligible de la commande et 100% des pourboires. Les taux de commission de 9,9%, 8,9%, 7,9% et 6,9% laissent respectivement 90,1%, 91,1%, 92,1% et 93,1% au restaurant sur la base commissionnable. Les frais Stripe et Connect de la marketplace sont absorbés par la part TOK.", "Le restaurant reçoit 90% de la base commissionnable de toute commande marketplace à emporter et 100% des pourboires. TOK conserve 10%. Le taux est identique pour Starter, Business, Premium et Elite ; les frais du prestataire de paiement supportés par TOK sont assumés sur la part TOK.")
rep(p, "car ils pilotent les notifications client et les flux de paiement/livraison.", "car ils pilotent les notifications client et le suivi du paiement et du retrait.")
rep(p, "Il peut être désactivé par feature flag, non inclus dans votre abonnement, réservé à certains rôles, non configuré pour votre restaurant ou temporairement indisponible. Quand un module est désactivé par l'admin, il doit être inexistant dans l'interface.", "Il peut ne pas être inclus dans votre abonnement, être réservé à certains rôles, ne pas être disponible pour votre établissement ou être temporairement indisponible. Un service non activé n'est pas présenté dans votre interface.")
rep(p, "Commandes, paiements, réservations, livraison, fidélité, actualités,", "Commandes à emporter, paiements, réservations, fidélité, actualités,")
json_ld = '''    path: "/aide",
    jsonLd: {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: FAQS.flatMap((section) => section.questions).map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: { "@type": "Answer", text: item.a },
      })),
    },'''
rep(p, json_ld, '    path: "/aide",')

p = "src/pages/TokOne.tsx"
rep(p, "  Truck,\n", "")
rep(p, '''  price_monthly: 14.9,
  price_yearly: 149,
  currency: "CHF",
  free_delivery_min_order: 25,''', '''  price_monthly: 9.9,
  price_yearly: 89.9,
  currency: "CHF",
  free_delivery_min_order: null,''')
rep(p, '  { id: "demo-free-delivery", plan_id: COMMERCIAL_DEMO_TOK_ONE_PLAN.id, benefit_type: "free_delivery", value: { min_order: 25 } },\n', "")
rep(p, '''  {
    id: "free_delivery",
    title: "Livraison offerte",
    description:
      "Les frais de livraison TOK disparaissent sur les commandes éligibles selon votre formule active.",
    details: [
      "Le seuil d'éligibilité est lu depuis votre formule Tok One.",
      "L'avantage s'applique automatiquement au panier quand le restaurant et la zone sont couverts.",
      "Le récapitulatif de commande distingue toujours les frais économisés des autres coûts.",
    ],
    icon: Truck,
    tone: "orange",
  },''', '''  {
    id: "member_exclusives",
    title: "Avantages réservés",
    description:
      "Profitez d'avantages Tok One sur les parcours et offres partenaires éligibles.",
    details: [
      "Les avantages disponibles sont affichés avant l'action concernée.",
      "Les conditions peuvent varier selon le restaurant et l'opération active.",
      "TOK vérifie l'éligibilité au moment de la commande ou de la réservation.",
    ],
    icon: Star,
    tone: "orange",
  },''')
rep(p, '  free_delivery: CORE_BENEFITS[0],\n', "")
rep(p, "des restaurants partenaires, de la zone de livraison et des opérations actives.", "des restaurants partenaires et des opérations actives.")
rep(p, '"Abonnement premium TOK pour profiter de livraisons offertes, avantages VIP, réductions partenaires et support prioritaire en Suisse romande."', '"Abonnement premium TOK pour profiter d’avantages VIP, réductions partenaires, accès prioritaires et support prioritaire en Suisse romande."')
rep(p, '  if (benefit.benefit_type.includes("delivery")) return Truck;\n', "")
rep(p, '''title: "Tok One | Livraison offerte, avantages VIP et offres restaurant",
    description:
      "Tok One regroupe livraison offerte, avantages VIP, réductions partenaires, accès prioritaire aux expériences TOK et support prioritaire en Suisse romande."''', '''title: "Tok One | Avantages VIP et offres restaurant",
    description:
      "Tok One regroupe avantages VIP, réductions partenaires, accès prioritaire aux expériences TOK et support prioritaire en Suisse romande."''')
rep(p, ".filter((benefit) => benefit.enabled)\n    .map<BenefitCard>", '.filter((benefit) => benefit.enabled && benefit.id !== "free_delivery")\n    .map<BenefitCard>')

p = "src/lib/subscriptionEntitlements.ts"
rep(p, '''  {
    id: "free_delivery",
    label: "Livraison gratuite",
    description: "Frais de livraison offerts selon les conditions du plan.",
  },
''', "")
rep(p, "    free_delivery: isEnabled(freeDeliveryBenefit),\n", "")
rep(p, '''freeDeliveryMinOrder: enabledById.free_delivery
      ? configuredFreeDelivery || planFreeDelivery || 0
      : Number.POSITIVE_INFINITY,''', '''freeDeliveryMinOrder: isEnabled(freeDeliveryBenefit)
      ? configuredFreeDelivery || planFreeDelivery || 0
      : Number.POSITIVE_INFINITY,''')

p = "src/pages/PacksRestaurateur.tsx"
rep(p, '          <span>Site, QR code, Instagram, Google et fichier client : <strong>CHF 0</strong></span>\n', "")
rep(p, '          <span>Frais de réservation plafonnés à <strong>7% du CA de la table</strong></span>\n', "")
rep(p, '          <span>Restaurant : <strong>au minimum 90%</strong> de la commande et 100% des pourboires</span>', '          <span>Commande à emporter : <strong>90% au restaurant / 10% à TOK</strong> · pourboires 100% restaurant</span>')

p = "src/pages/Panier.tsx"
rep(p, "Finalisez la connexion pour renseigner l&apos;adresse, activer vos avantages et confirmer le paiement.", "Finalisez la connexion pour choisir votre retrait, activer vos avantages et confirmer le paiement.")
rep(p, "Les promotions, Miamz, Tok One, le choix du paiement et les informations de livraison apparaissent juste après la connexion.", "Les promotions, Miamz, Tok One, le choix du paiement et les informations de retrait apparaissent juste après la connexion.")
rep(p, "                  Vous pouvez encore choisir entre livraison et emporter avant de continuer.", '''                  {deliveryFeatureEnabled
                    ? "Vous pouvez encore choisir entre livraison et emporter avant de continuer."
                    : "Votre commande sera préparée pour un retrait à emporter au restaurant."}''')
rep(p, '''            <div className="grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                disabled={!deliveryAvailable || hasAntiGaspi || isGuaranteedDeliveryCheckout}''', '''            <div className={`grid gap-3 ${deliveryFeatureEnabled ? "sm:grid-cols-2" : "grid-cols-1"}`}>
              {deliveryFeatureEnabled ? (
              <button
                type="button"
                disabled={!deliveryAvailable || hasAntiGaspi || isGuaranteedDeliveryCheckout}''')
rep(p, '''              </button>

              <button
                type="button"
                disabled={!takeawayAvailable || isGuaranteedDeliveryCheckout}''', '''              </button>
              ) : null}

              <button
                type="button"
                disabled={!takeawayAvailable || isGuaranteedDeliveryCheckout}''', count=1)
rep(p, "                Livraison et emporter sont actuellement indisponibles pour ce restaurant.", '''                {deliveryFeatureEnabled
                  ? "Livraison et emporter sont actuellement indisponibles pour ce restaurant."
                  : "Le retrait à emporter est actuellement indisponible pour ce restaurant."}''', count=1)
rep(p, "{tokOneDeliverySaved > 0 ? (", '{deliveryFeatureEnabled && orderMode === "delivery" && tokOneDeliverySaved > 0 ? (')
rep(p, '''<div className="flex min-w-0 justify-between gap-3 text-sm"><span className="min-w-0 break-words">{`Frais de livraison (${orderMode === "takeaway" ? "À l'emporter" : "Livraison"})`}</span><span className="shrink-0 text-right">{deliveryFee.toFixed(2)} CHF</span></div>''', '''<div className="flex min-w-0 justify-between gap-3 text-sm"><span className="min-w-0 break-words">{deliveryFeatureEnabled && orderMode === "delivery" ? "Frais de livraison" : "Retrait à emporter"}</span><span className="shrink-0 text-right">{deliveryFeatureEnabled && orderMode === "delivery" ? `${deliveryFee.toFixed(2)} CHF` : "Sans frais"}</span></div>''')
rep(p, '!isCommercialDemoClient && !isChefsTableCheckout && !isTokOneMember && orderMode === "delivery" && quotedDeliveryFee > 0', '!isCommercialDemoClient && !isChefsTableCheckout && deliveryFeatureEnabled && !isTokOneMember && orderMode === "delivery" && quotedDeliveryFee > 0')
rep(p, '!isCommercialDemoClient && !isChefsTableCheckout && orderMode === "delivery" && <FlexOptions', '!isCommercialDemoClient && !isChefsTableCheckout && deliveryFeatureEnabled && orderMode === "delivery" && <FlexOptions')
rep(p, "            Livraison et emporter sont actuellement indisponibles pour ce restaurant.", '''            {deliveryFeatureEnabled
              ? "Livraison et emporter sont actuellement indisponibles pour ce restaurant."
              : "Le retrait à emporter est actuellement indisponible pour ce restaurant."}''', count=1)
rep(p, '? "Le paiement sera effectué sur place lors du retrait ou de la livraison."', '''? (deliveryFeatureEnabled && orderMode === "delivery"
                  ? "Le paiement sera effectué lors de la remise de la commande."
                  : "Le paiement sera effectué sur place lors du retrait.")''')

p = "src/lib/featureVisibility.ts"
rep(p, '{ feature: "tok-one", terms: ["tok one", "livraison gratuite", "abonnement tok one"] },', '{ feature: "tok-one", terms: ["tok one", "abonnement tok one"] },')

Path(".github/workflows/apply-flat10-public-v3.yml").unlink(missing_ok=True)
Path("scripts/apply-flat10-public-v3.py").unlink(missing_ok=True)
