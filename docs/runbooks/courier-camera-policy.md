# Courier QR camera policy

Risk level 3: browser permissions. The delivery proof scanner calls `getUserMedia` only after the courier selects **Scanner le QR** and requests `audio: false`. The courier route and server-side job ownership checks remain unchanged.

`camera=()` blocks camera use even if the user wants to grant permission. The global header now uses `camera=(self), microphone=(), payment=(self), geolocation=(self)`. The camera allowlist contains only the document's own origin, with no wildcard, external origin or implicit subdomain grant. It does not grant device permission: the browser's permission decision still applies. Microphone capture stays disabled.

The policy applies to the initial HTML document. This SPA can navigate from `/` or `/auth` to `/courier/jobs` without loading another document, so a camera exception only on the courier URL would leave those entry paths blocked. A same-origin allowlist is the narrowest functional header for the existing SPA without changing its navigation architecture.

Verification without accessing a real camera:

1. After the exact commit is deployed and READY, make a read-only HTTP request to `/`, `/auth` and `/courier/jobs` on the deployed origin. Inspect the final document's `Permissions-Policy` header and ensure it matches the policy above. Record redirects separately; the native hosting result is authoritative, not a configuration-only test.
2. In a supporting browser, inspect `document.permissionsPolicy || document.featurePolicy`. `allowsFeature('camera')` must be true, `allowsFeature('microphone')` false and `allowsFeature('camera', 'https://example.org')` false. Repeat after internal navigation. This only inspects policy and does not request camera access. Unsupported introspection is an unavailable check, not a pass.
3. The component tests use synthetic streams/detector results to cover refusal, manual code fallback, unsupported QR detection, explicit verification, track cleanup, delayed permission/playback and stale detector results/errors. They never invoke physical capture or a production delivery mutation.

Before this change, a live HEAD request to `https://www.thetok.ch/courier/jobs` on 2026-10-10 returned 200 with `camera=(), microphone=(), payment=(self), geolocation=(self)`. A successful local test does not prove deployment or a signed-device scan. Real camera/device validation remains a separate courier acceptance check with consent.

Rollback: revert this change and redeploy. Manual code and signature remain available, but the camera scanner will again be blocked by the header.

References: [W3C Permissions Policy](https://www.w3.org/TR/permissions-policy/) (origin allowlists, document policy and introspection), [W3C Media Capture and Streams](https://www.w3.org/TR/mediacapture-streams/) (camera permission and track lifecycle).
