# Mobile association domain operation

Risk level 3: the apex domain serves production traffic. This operation does not change DNS, credentials, security controls or domain ownership.

The repository redirect must serve the two `/.well-known/` association files directly while redirecting ordinary apex paths to `www.thetok.ch`. A global Vercel domain redirect takes precedence and must therefore be removed only after the routing correction is live.

Use the **Mobile Association Domains** workflow on `main`. Its default action is read-only `inspect`. The `apply` action verifies the exact checked-out SHA against the deployment serving the live www alias, its READY production state, the repository redirect/header and the live JSON association for `73HG6QD4AJ.ch.thetok.app`. It then rechecks the domain before changing only its `redirect` field. Unexpected targets, redirects, concurrent updates or missing evidence stop the operation before mutation.

After success, verify both association files on apex, www, admin and app with redirect following disabled. Each must return 200 JSON and the expected native identities. Also verify the root, nested paths, query strings, existing auth/admin redirects and three restaurant SEO pages. Attaching a missing app domain is a separate, scoped provider operation; this workflow does not add or remove domains.

If these checks fail, use the `rollback` action to restore the previously recorded global `308` redirect to `www.thetok.ch`. Rollback deliberately requires only the exact verified project/domain and expected prior redirect state; it remains usable when the current deployment is unhealthy. Recheck the ordinary web paths afterwards. Association files on the apex will again redirect, so the mobile delivery task remains open.

Run this operation while no deployment, rollback or manual domain edit is in progress. The script rereads both the live deployment and the domain immediately before applying; rollback also rereads the domain. These checks narrow the race window but the Vercel API has no compare-and-swap precondition here: they cannot make the remote change atomic with another operator or deployment. Workflow concurrency only serializes this workflow, not native Vercel deployments.

The result artifact contains only public identifiers and redirect state. The existing production Vercel secret remains within the runner and is never written to this artifact. An operation failure after a request is not proof that no mutation occurred: inspect the provider state before retrying.

References: [Vercel domain update API](https://vercel.com/docs/rest-api/projects/update-a-project-domain), [live alias API](https://vercel.com/docs/rest-api/aliases/get-an-alias), [Apple associated domains](https://developer.apple.com/documentation/xcode/supporting-associated-domains).
