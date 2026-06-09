# Mobile release readiness

## Current repository status

- iOS App Store source readiness is guarded by `pnpm run mobile:ios:readiness`.
- The iOS bundle includes `PrivacyInfo.xcprivacy` and the Xcode project copies it into app resources.
- The iOS target signs `App/App.entitlements`; APNs uses `development` for Debug and `production` for Release through `APS_ENVIRONMENT`.
- App Store export compliance is declared with `ITSAppUsesNonExemptEncryption=false` for standard TLS-only usage. Recheck this before release if custom/non-exempt cryptography is added.
- Native auth session storage uses Capacitor secure storage; browser local storage is retained for web builds.

## Values required before store release

- Apple Team ID: required to publish a valid `/.well-known/apple-app-site-association` file for Universal Links.
- Android release SHA-256 fingerprint: required in every deployed `/.well-known/assetlinks.json` host.
- Android release keystore: provide `android/keystore.properties` from CI secrets or local secure storage.
- Push production credentials: APNs production key/capability and Firebase Android app SHA fingerprints.
- Production domains: keep `thetok.ch`, `www.thetok.ch`, `admin.thetok.ch`, `app.thetok.ch` and any retained legacy `tok.ch` hosts aligned across app links, CORS, Stripe return URLs, Supabase site URLs and App Store metadata.
- App Store Connect metadata: privacy nutrition label, age rating, support URL, marketing URL, review notes/test account, screenshots and category must be completed outside this repo.
- Signing: set the Apple Development Team in Xcode/App Store Connect and verify the App ID enables Associated Domains and Push Notifications.

## Apple App Site Association template

Do not publish this template as-is. Replace `<APPLE_TEAM_ID>` with the real Apple Developer Team ID, then serve the JSON without extension and with `application/json` content type at each Associated Domain host.

```json
{
  "applinks": {
    "apps": [],
    "details": [
      {
        "appIDs": ["<APPLE_TEAM_ID>.com.tok.app"],
        "components": [
          {
            "/": "/*",
            "comment": "Tok mobile routes"
          }
        ]
      }
    ]
  }
}
```

## Verification commands

- iOS source readiness, no Xcode required: `pnpm run mobile:ios:readiness`
- App Store source check, no Xcode required: `pnpm run mobile:appstore:check`
- Web build: `pnpm run build`
- Capacitor sync: `pnpm exec cap sync android ios`
- Android debug build on Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/mobile-android-build.ps1 Debug`
- iOS release build on macOS with Xcode: `pnpm run mobile:build:ios:release`

## App Store Connect notes

- The privacy manifest in the repo is a technical bundle declaration. The App Store Connect privacy questionnaire still needs to match the real production behavior and legal/privacy policy.
- Do not commit Apple signing certificates, provisioning profiles, APNs private keys, App Store Connect API keys or Firebase service account secrets.
- Before the first upload, generate and deploy the Apple App Site Association file for every enabled Associated Domain host with the real `<APPLE_TEAM_ID>.com.tok.app` app ID.
