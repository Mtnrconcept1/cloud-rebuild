import UIKit
import Capacitor
import StoreKit

private let tokOneStoreKitProductIds = [
    "ch.thetok.app.tokone.monthly",
    "ch.thetok.app.tokone.yearly"
]

@objc(TokStoreKitPlugin)
public class TokStoreKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "TokStoreKitPlugin"
    public let jsName = "TokStoreKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "purchase", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "currentEntitlements", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "restorePurchases", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "finishTransaction", returnType: CAPPluginReturnPromise)
    ]

    private func transactionPayload(
        verification: VerificationResult<Transaction>,
        status: String = "purchased"
    ) -> [String: Any]? {
        switch verification {
        case .verified(let transaction):
            var payload: [String: Any] = [
                "status": status,
                "transactionId": String(transaction.id),
                "originalTransactionId": String(transaction.originalID),
                "productId": transaction.productID,
                "jwsRepresentation": verification.jwsRepresentation
            ]

            if let expirationDate = transaction.expirationDate {
                payload["expirationDate"] = ISO8601DateFormatter().string(from: expirationDate)
            }
            if let revocationDate = transaction.revocationDate {
                payload["revocationDate"] = ISO8601DateFormatter().string(from: revocationDate)
            }
            if let appAccountToken = transaction.appAccountToken {
                payload["appAccountToken"] = appAccountToken.uuidString.lowercased()
            }
            return payload

        case .unverified(_, let error):
            CAPLog.print("TOK StoreKit transaction verification failed: \(error.localizedDescription)")
            return nil
        }
    }

    private func currentTokOneEntitlements() async -> [[String: Any]] {
        var transactions: [[String: Any]] = []

        for await verification in Transaction.currentEntitlements {
            guard let payload = transactionPayload(verification: verification),
                  let productId = payload["productId"] as? String,
                  tokOneStoreKitProductIds.contains(productId) else {
                continue
            }
            transactions.append(payload)
        }

        return transactions
    }

    @objc public func purchase(_ call: CAPPluginCall) {
        let productId = call.getString("productId", "")
        let appAccountTokenValue = call.getString("appAccountToken", "")

        guard !productId.isEmpty, tokOneStoreKitProductIds.contains(productId) else {
            call.resolve([
                "status": "error",
                "message": "Produit Tok One StoreKit invalide."
            ])
            return
        }

        guard let appAccountToken = UUID(uuidString: appAccountTokenValue) else {
            call.resolve([
                "status": "error",
                "message": "Compte utilisateur invalide pour StoreKit."
            ])
            return
        }

        Task {
            do {
                let products = try await Product.products(for: [productId])
                guard let product = products.first(where: { $0.id == productId }) else {
                    call.resolve([
                        "status": "error",
                        "message": "Le produit Tok One n’est pas encore disponible dans l’App Store."
                    ])
                    return
                }

                let result = try await product.purchase(options: [
                    .appAccountToken(appAccountToken)
                ])

                switch result {
                case .success(let verification):
                    guard let payload = self.transactionPayload(verification: verification) else {
                        call.resolve([
                            "status": "error",
                            "message": "Apple n’a pas pu vérifier la transaction."
                        ])
                        return
                    }
                    // The transaction is intentionally not finished here. The web layer
                    // first sends the signed JWS to Supabase for server-side Apple
                    // verification and only then calls finishTransaction.
                    call.resolve(payload)

                case .userCancelled:
                    call.resolve(["status": "cancelled"])

                case .pending:
                    call.resolve(["status": "pending"])

                @unknown default:
                    call.resolve([
                        "status": "error",
                        "message": "État StoreKit non reconnu."
                    ])
                }
            } catch {
                call.resolve([
                    "status": "error",
                    "message": error.localizedDescription
                ])
            }
        }
    }

    @objc public func currentEntitlements(_ call: CAPPluginCall) {
        Task {
            let transactions = await self.currentTokOneEntitlements()
            call.resolve(["transactions": transactions])
        }
    }

    @objc public func restorePurchases(_ call: CAPPluginCall) {
        Task {
            do {
                try await AppStore.sync()
                let transactions = await self.currentTokOneEntitlements()
                call.resolve(["transactions": transactions])
            } catch {
                call.resolve([
                    "transactions": [],
                    "error": error.localizedDescription
                ])
            }
        }
    }

    @objc public func finishTransaction(_ call: CAPPluginCall) {
        let expectedTransactionId = call.getString("transactionId", "")
        guard !expectedTransactionId.isEmpty else {
            call.resolve(["finished": false])
            return
        }

        Task {
            for await verification in Transaction.unfinished {
                guard case .verified(let transaction) = verification else { continue }
                if String(transaction.id) == expectedTransactionId {
                    await transaction.finish()
                    call.resolve(["finished": true])
                    return
                }
            }
            // A transaction that is no longer in Transaction.unfinished is already
            // finished and therefore needs no further action.
            call.resolve(["finished": true])
        }
    }
}

public class TokBridgeViewController: CAPBridgeViewController {
    public override func capacitorDidLoad() {
        super.capacitorDidLoad()
        bridge?.registerPluginInstance(TokStoreKitPlugin())
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        return true
    }

    func applicationWillResignActive(_ application: UIApplication) {}

    func applicationDidEnterBackground(_ application: UIApplication) {}

    func applicationWillEnterForeground(_ application: UIApplication) {}

    func applicationDidBecomeActive(_ application: UIApplication) {}

    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
