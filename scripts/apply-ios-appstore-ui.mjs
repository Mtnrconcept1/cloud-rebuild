import { readFile, writeFile } from "node:fs/promises";

async function patchFile(path, replacements) {
  let source = await readFile(path, "utf8");
  for (const [label, from, to] of replacements) {
    if (!source.includes(from)) {
      throw new Error(`${path}: expected fragment not found for ${label}`);
    }
    source = source.replace(from, to);
  }
  await writeFile(path, source, "utf8");
  console.log(`Patched ${path}`);
}

await patchFile("src/pages/Auth.tsx", [
  [
    "platform import",
    'import { useAuth, type UserRole } from "@/lib/auth-context";\n',
    'import { useAuth, type UserRole } from "@/lib/auth-context";\nimport { getPlatform } from "@/lib/platform";\n',
  ],
  [
    "native restaurant signup routing",
    'function getInitialSignupRole(searchParams: URLSearchParams): SignupRole {\n  const requestedType = String(searchParams.get("type") || "").toLowerCase();\n  if (requestedType === "restaurateur") return "restaurateur";\n',
    'function getInitialSignupRole(searchParams: URLSearchParams): SignupRole {\n  const requestedType = String(searchParams.get("type") || "").toLowerCase();\n  if (getPlatform() === "ios" && requestedType === "restaurateur") return "client";\n  if (requestedType === "restaurateur") return "restaurateur";\n',
  ],
  [
    "native ios flag",
    'export default function Auth({ demoMode = false }: { demoMode?: boolean }) {\n  const isCommercialAuthHost =\n',
    'export default function Auth({ demoMode = false }: { demoMode?: boolean }) {\n  const isNativeIos = getPlatform() === "ios";\n  const isCommercialAuthHost =\n',
  ],
  [
    "force client signup on ios",
    '  useEffect(() => {\n    if (\n      !featureFlagsLoading &&\n      !courierSignupEnabled &&\n      roleMode === "courier"\n',
    '  useEffect(() => {\n    if (!isNativeIos || isLogin || roleMode !== "restaurateur") return;\n    setRoleMode("client");\n  }, [isLogin, isNativeIos, roleMode]);\n\n  useEffect(() => {\n    if (\n      !featureFlagsLoading &&\n      !courierSignupEnabled &&\n      roleMode === "courier"\n',
  ],
  [
    "native signup tab columns",
    'className={`grid h-auto w-full ${courierSignupEnabled ? "grid-cols-1 min-[360px]:grid-cols-3" : "grid-cols-2"}`}',
    'className={`grid h-auto w-full ${isNativeIos ? (courierSignupEnabled ? "grid-cols-1 min-[360px]:grid-cols-2" : "grid-cols-1") : courierSignupEnabled ? "grid-cols-1 min-[360px]:grid-cols-3" : "grid-cols-2"}`}',
  ],
  [
    "hide restaurant signup tab on ios",
    '                <TabsTrigger\n                  value="restaurateur"\n                  className="w-full min-w-0 whitespace-normal px-1.5 text-xs leading-tight sm:px-3 sm:text-sm"\n                >\n                  Restaurateur\n                </TabsTrigger>\n',
    '                {!isNativeIos ? (\n                  <TabsTrigger\n                    value="restaurateur"\n                    className="w-full min-w-0 whitespace-normal px-1.5 text-xs leading-tight sm:px-3 sm:text-sm"\n                  >\n                    Restaurateur\n                  </TabsTrigger>\n                ) : null}\n',
  ],
]);

await patchFile("src/pages/dashboard/DashboardAccountBilling.tsx", [
  [
    "platform import",
    'import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";\n',
    'import { redirectToTrustedCheckoutUrl } from "@/lib/securityUrls";\nimport { getPlatform } from "@/lib/platform";\n',
  ],
  [
    "ios read only billing surface",
    'export default function DashboardAccountBilling() {\n  const commercialDemoFrame = useCommercialDemoFrame();\n  if (commercialDemoFrame?.surface === "restaurant") return <CommercialDemoAccountBilling />;\n  return <LiveDashboardAccountBilling />;\n}\n',
    `function IosRestaurantBillingCompanion() {\n  return (\n    <DashboardLayout>\n      <div className="mx-auto max-w-3xl space-y-6 p-4 sm:p-6">\n        <Card>\n          <CardHeader>\n            <CardTitle>Abonnement TOK</CardTitle>\n          </CardHeader>\n          <CardContent className="space-y-3 text-sm text-muted-foreground">\n            <p>\n              L'application iOS donne accès aux fonctionnalités comprises dans\n              votre abonnement restaurateur actif.\n            </p>\n            <p>\n              L'achat, le changement de formule et l'achat de crédits\n              publicitaires ou numériques ne sont pas proposés dans\n              l'application iOS.\n            </p>\n            <p>\n              Aucun paiement d'abonnement restaurateur n'est déclenché depuis\n              cet écran.\n            </p>\n          </CardContent>\n        </Card>\n      </div>\n    </DashboardLayout>\n  );\n}\n\nexport default function DashboardAccountBilling() {\n  const commercialDemoFrame = useCommercialDemoFrame();\n  if (commercialDemoFrame?.surface === "restaurant") return <CommercialDemoAccountBilling />;\n  if (getPlatform() === "ios") return <IosRestaurantBillingCompanion />;\n  return <LiveDashboardAccountBilling />;\n}\n`,
  ],
]);

await patchFile("src/pages/TokOne.tsx", [
  [
    "ios commerce imports",
    'import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";\n',
    'import { useCommercialDemoFrame } from "@/components/commercial/CommercialDemoFrameProvider";\nimport { getPlatform } from "@/lib/platform";\nimport { restoreTokOneIosPurchases } from "@/lib/iosCommerceFetch";\n',
  ],
  [
    "native ios state",
    'export default function TokOne() {\n  const { user } = useAuth();\n  const commercialDemoFrame = useCommercialDemoFrame();\n',
    'export default function TokOne() {\n  const { user } = useAuth();\n  const isNativeIos = getPlatform() === "ios";\n  const commercialDemoFrame = useCommercialDemoFrame();\n',
  ],
  [
    "restore loading state",
    '  const [checkoutLoading, setCheckoutLoading] = useState(false);\n  const [cancelLoading, setCancelLoading] = useState(false);\n',
    '  const [checkoutLoading, setCheckoutLoading] = useState(false);\n  const [restoreLoading, setRestoreLoading] = useState(false);\n  const [cancelLoading, setCancelLoading] = useState(false);\n',
  ],
  [
    "restore handler",
    '  const activeSubscription = isTokOneSubscriptionActive(subscription);\n  const entitlements = buildTokOneEntitlements({\n',
    `  const activeSubscription = isTokOneSubscriptionActive(subscription);\n\n  const handleRestoreIosPurchases = async () => {\n    if (!isNativeIos || !user?.id || restoreLoading) return;\n    const planId = subscription?.plan_id || selectedPlan?.id;\n    if (!planId) {\n      toast({\n        title: "Restauration impossible",\n        description: "La formule Tok One n'est pas encore disponible.",\n        variant: "destructive",\n      });\n      return;\n    }\n\n    setRestoreLoading(true);\n    try {\n      const result = await restoreTokOneIosPurchases({\n        userId: user.id,\n        sync: async (signedTransaction) => {\n          const { error } = await supabase.functions.invoke("sync-apple-storekit", {\n            body: {\n              signed_transaction: signedTransaction,\n              plan_id: planId,\n              source: "ios_storekit_restore",\n            },\n          });\n          if (error) throw error;\n        },\n      });\n\n      queryClient.invalidateQueries({ queryKey: ["tok-one-subscription"] });\n      await refetchSubscription();\n      toast({\n        title: result.restored > 0 ? "Achats restaurés" : "Aucun achat à restaurer",\n        description: result.restored > 0\n          ? "Votre abonnement Tok One Apple a été resynchronisé."\n          : "Aucun abonnement Tok One actif n'a été trouvé sur ce compte Apple.",\n      });\n    } catch (error) {\n      toast({\n        title: "Restauration impossible",\n        description: error instanceof Error ? error.message : "Impossible de restaurer les achats Apple.",\n        variant: "destructive",\n      });\n    } finally {\n      setRestoreLoading(false);\n    }\n  };\n\n  const entitlements = buildTokOneEntitlements({\n`,
  ],
  [
    "restore and subscription legal disclosure",
    '              {activeSubscription ? "Abonnement déjà actif" : "Souscrire à Tok One"}\n            </Button>\n          </div>\n',
    `              {activeSubscription ? "Abonnement déjà actif" : "Souscrire à Tok One"}\n            </Button>\n            {isNativeIos ? (\n              <div className="space-y-3 text-center">\n                <Button\n                  type="button"\n                  variant="outline"\n                  onClick={handleRestoreIosPurchases}\n                  disabled={restoreLoading || !user}\n                >\n                  {restoreLoading ? (\n                    <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />\n                  ) : null}\n                  Restaurer mes achats Apple\n                </Button>\n                <p className="mx-auto max-w-xl text-xs leading-5 text-muted-foreground">\n                  Tok One est un abonnement mensuel auto-renouvelable. Le prix\n                  affiché ci-dessus est débité sur votre compte Apple. Le\n                  renouvellement peut être géré depuis les réglages de votre\n                  compte Apple. Consultez les <Link className="underline" to="/cgu">conditions d'utilisation</Link>\n                  {" "}et la <Link className="underline" to="/politique-confidentialite">politique de confidentialité</Link>.\n                </p>\n              </div>\n            ) : null}\n          </div>\n`,
  ],
]);

await patchFile("src/components/social/SocialPostCard.tsx", [
  [
    "explicit report and block copy",
    '<DialogTitle>Signaler ce post</DialogTitle>\n              <DialogDescription>\n                Choisissez la raison du signalement. Notre équipe l\'examinera\n                avant toute action.\n              </DialogDescription>',
    '<DialogTitle>Signaler et bloquer ce compte</DialogTitle>\n              <DialogDescription>\n                Choisissez la raison du signalement. Le contenu sera transmis\n                à notre équipe de modération et l\'auteur sera immédiatement\n                masqué de votre fil.\n              </DialogDescription>',
  ],
]);
