# Social Preview Image Design

## Objective

Use a single, site-wide sharing thumbnail for `https://www.thetok.ch/` and all route shares under `www.thetok.ch`, based on the user-provided Tok visual.

The preview must remain readable in clients that crop aggressively, especially WhatsApp, where link previews often appear close to square.

## User-facing outcome

- Any shared page on `www.thetok.ch` uses the same Tok sharing image.
- The Tok logo remains visible in square-ish crops.
- The main message remains readable after center-cropping.
- The share image is also used for Twitter/X large-card previews.

## Chosen approach

Use one dedicated static Open Graph image for the whole site.

This approach is preferred because:

- it is robust and immediate;
- it does not require per-route rendering or SSR metadata generation;
- it solves the current crop problem by changing the asset composition, not by relying on platform-specific behavior.

## Asset strategy

- Source visual: the user-provided Tok promotional image.
- A dedicated social-preview asset will be stored in `public/`.
- The asset should be treated as `1200x630`-style social media artwork, but with all important content visually centered inside a square-safe area.
- The logo must stay centered and large enough to survive WhatsApp crop behavior.
- No essential text or branding should sit near the outer left/right edges.

## Technical scope

Frontend static metadata only.

- Update `index.html`
- Add a new social preview image under `public/`

No backend, no database, no migrations, no edge functions.

## Metadata changes

Update the global sharing metadata in `index.html`:

- `og:url` -> `https://www.thetok.ch/`
- `og:image` -> new social preview asset URL under `https://www.thetok.ch/...`
- `og:image:alt` -> Tok sharing description
- `twitter:image` -> same asset
- `twitter:image:alt` -> same matching description

Because the app is SPA-based and the user wants the same preview for every page, global metadata is sufficient for this iteration.

## Validation

- Confirm metadata values in `index.html`
- Ensure the image is reachable from `/public`
- Run frontend validation:
  - `eslint` if touched files require it
  - `build`

## Deployment notes

Only the frontend needs redeployment.

After deployment, some platforms may still show the previous thumbnail until their scraper cache refreshes.

Useful refresh tools after deploy:

- Facebook Sharing Debugger
- LinkedIn Post Inspector

WhatsApp cache refresh may lag and cannot always be forced immediately.
