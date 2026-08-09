# Mobile release readiness

## Current repository status

- iOS App Store source readiness is guarded by `pnpm run mobile:ios:readiness`.
- The App Store Connect record for iOS uses Bundle ID `ch.thetok.app`; the iOS release workflow forces and verifies this identifier on the archived app.
- Android intentionally keeps package `com.tok.app`; do not rename it as part of the iOS App Store release because the existing Android/Firebase configuration is bound to that package.
- The iOS bundle includes `PrivacyInfo.xcprivacy` and the Xcode project copies it into app resources.
- The iOS target signs `App/App.entitlements`; APNs uses `development` for Debug and `production` for Release through `APS_ENVIRONMENT`.
- App Store export compliance is declared with `ITSAppUsesNonExemptEncryption=false` for standard TLS-only usage. Recheck this before release if custom/non-exempt cryptography is added.
- Native auth session storage uses Capacitor secure storage; browser local storage is retained for web builds.
- Android Google Play source readiness is guarded by `pnpm run mobile:android:readiness`.
- The Android target already uses `compileSdkVersion=36` and `targetSdkVersion=36`, above the current Google Play minimum for new apps and updates.
- Android release signing stays outside tracked source through `android/keystore.properties`; do not commit the real keystore file.
- Android release builds only attach `signingConfigs.release` when `android/keystore.properties` exists. Without it, local AAB generation can validate the source build but the artifact is not upload-ready for Google Play.
- Android disables app backup/data extraction, blocks cleartext HTTP traffic and declares the runtime notification permission required on Android 13+.

## Values required before store release

- Apple Team ID: `73HG6QD4AJ` for the current Apple Developer team.
- iOS App Store Bundle ID: `ch.thetok.app`.
- Android release SHA-256 fingerprint: required in every deployed `/.well-known/assetlinks.json` host.
- Android release keystore: provide `android/keystore.properties` from CI secrets or local secure storage.
- Google Play Console metadata: Data Safety form, privacy policy URL, app access instructions/test account, content rating, target audience, screenshots, feature graphic, support contact and release notes must be completed outside this repo.
- Android release versioning: set `TOK_VERSION_CODE` and `TOK_VERSION_NAME` for every Play upload. `versionCode` must increase for each submitted AAB.
- Push production credentials: APNs production key/capability and Firebase Android app SHA fingerprints.
- Production domains: keep `thetok.ch`, `www.thetok.ch`, `admin.thetok.ch`, `app.thetok.ch` and any retained legacy `tok.ch` hosts aligned across app links, CORS, Stripe return URLs, Supabase site URLs and App Store metadata.
- App Store Connect metadata: privacy nutrition label, age rating, support URL, marketing URL, review notes/test account, screenshots and category must be completed outside this repo.
- Signing: verify the App ID `ch.thetok.app` enables Associated Domains and Push Notifications.

## Apple App Site Association

The tracked `public/.well-known/apple-app-site-association` file declares the current iOS application identifier:

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["73HG6QD4AJ.ch.thetok.app"],
        "components": [
          {
            "/": "/*",
            "comment": "Thetok mobile routes"
          }
        ]
      }
    ]
  }
}
```

After deployment, verify that every enabled Associated Domain host serves this document from `/.well-known/apple-app-site-association` over HTTPS without authentication or redirects that break Apple verification.

## Android Digital Asset Links template

Do not publish this template as-is. Replace `<ANDROID_RELEASE_SHA256>` with the SHA-256 fingerprint of the Play release signing certificate, then serve the JSON with `application/json` content type at `/.well-known/assetlinks.json` on every Android App Link host declared in `AndroidManifest.xml`.

```json
[
  {
    "relation": ["delegate_permission/common.handle_all_urls"],
    "target": {
      "namespace": "android_app",
      "package_name": "com.tok.app",
      "sha256_cert_fingerprints": ["<ANDROID_RELEASE_SHA256>"]
    }
  }
]
```

## Google Play Data Safety draft

Use this as the repo-aligned starting point for Play Console. The final declaration must match the production privacy policy, enabled SDKs and deployed features.

- Data collected: name, email address, phone number, delivery address, precise/coarse location, purchase/order history, reservations, user IDs, device IDs/push tokens, product interaction, search history, diagnostics/crash/performance data, photos or videos uploaded by the user, messages/comments/support content and other user-generated content.
- Main purposes: app functionality, account management, order/reservation fulfillment, fraud/security, analytics, customer support, personalization and operational communications.
- Payment card data: handled by Stripe; TOK should not declare raw card collection by the app unless a future direct-card flow is added.
- Sharing: disclose processors/providers used in production, including Supabase, Stripe, Firebase/FCM, Sentry and email/push providers where applicable.
- Security practices: data is transmitted over HTTPS/TLS; account deletion and privacy/support links must remain reachable from the app and store listing.

## Verification commands

- iOS source readiness, no Xcode required: `pnpm run mobile:ios:readiness`
- App Store source check, no Xcode required: `pnpm run mobile:appstore:check`
- Android source readiness, no Android SDK required: `pnpm run mobile:android:readiness`
- Google Play source check, no Android SDK required: `pnpm run mobile:playstore:check`
- Web build: `pnpm run build`
- Capacitor sync: `pnpm exec cap sync android ios`
- Android debug build: `pnpm run mobile:build:android:debug`
- Android release APK build: `pnpm run mobile:build:android:release`
- Android release AAB build: `pnpm run mobile:build:android:bundle` (`android/keystore.properties` required for a Play upload-ready signed artifact)
- iOS release build on macOS with Xcode: `pnpm run mobile:build:ios:release`

## App Store Connect notes

- The App Store Connect listing is named `Thetok`; the signed iOS Bundle ID is `ch.thetok.app`.
- The privacy manifest in the repo is a technical bundle declaration. The App Store Connect privacy questionnaire still needs to match the real production behavior and legal/privacy policy.
- Do not commit Apple signing certificates, provisioning profiles, APNs private keys, App Store Connect API keys or Firebase service account secrets.
- The App Store release workflow must verify the archived `CFBundleIdentifier` before validating or uploading an IPA.

## Google Play Console notes

- Android remains a separate package identity: `com.tok.app`.
- `mobile:android:readiness` is a source/configuration guard. It does not replace Play Console review, policy declarations or a real AAB upload.
- Before the first upload, generate and deploy `assetlinks.json` for `thetok.ch`, `www.thetok.ch`, `app.thetok.ch`, `admin.thetok.ch` and any retained legacy hosts declared in the manifest.
- Before generating the final upload artifact, provide `android/keystore.properties` from secure local storage or CI secrets and set a fresh `TOK_VERSION_CODE` plus `TOK_VERSION_NAME`.
- Add the Play release SHA-256 certificate fingerprint to Firebase so FCM and any Google-backed integrations recognize the production Android app.
- Do not commit Android keystores, `keystore.properties`, Play signing keys, Play Developer API service accounts or Firebase service account secrets.
