# Mobile release readiness

## Values required before store release

- Apple Team ID: required to publish a valid `/.well-known/apple-app-site-association` file for Universal Links.
- Android release SHA-256 fingerprint: required in every deployed `/.well-known/assetlinks.json` host.
- Android release keystore: provide `android/keystore.properties` from CI secrets or local secure storage.
- Push production credentials: APNs production key/capability and Firebase Android app SHA fingerprints.
- Production domains: keep `tok.ch`, `www.tok.ch`, `app.tok.ch`, `thetok.ch`, `www.thetok.ch`, and `app.thetok.ch` aligned across app links, CORS, Stripe return URLs, and Supabase site URLs.

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

- Web build: `npm run build`
- Capacitor sync: `npx cap sync android ios`
- Android debug build on Windows: `powershell -NoProfile -ExecutionPolicy Bypass -File ./scripts/mobile-android-build.ps1 Debug`
- iOS release build on macOS: `npm run mobile:build:ios:release`
