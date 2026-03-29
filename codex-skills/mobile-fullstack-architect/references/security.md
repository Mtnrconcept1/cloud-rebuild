# Security Review

Security findings must be evidence-based and tied to an actual trust boundary.

## Focus areas

- secrets or signing assets committed to the repository
- session handling and token storage
- authorization gaps between UI roles and backend enforcement
- public endpoints or SQL objects that accept user-controlled identifiers
- payment, order, notification, and dispatch flows that can be replayed or spoofed
- logging or analytics that may expose personal or operational data
- supply-chain or build artifacts committed unnecessarily

## Frontend-specific checks

- Treat route guards and hidden buttons as non-security controls.
- Verify untrusted input is not used to decide authority, price, destination, or ownership.
- Check whether feature flags can expose unfinished privileged surfaces.

## Backend-specific checks

- Validate JWTs and roles in every privileged edge function.
- Use server authority for pricing, discounts, delivery assignment, and status transitions.
- Require idempotency or replay protection for webhooks and financially sensitive writes.
- Constrain service-role functions to the minimum data surface.

## Mobile-specific checks

- Do not store sensitive long-lived material in insecure storage when secure storage is expected.
- Validate incoming deep links and notification payload targets before navigation.
- Review Firebase and push setup so tokens and project identifiers are handled intentionally.

## Severity hints

- P0: exposed signing keys, auth bypass, tenant data leakage, payment or order forgery
- P1: broad but not trivially exploitable privilege weakness, replayable operational action, missing server authority on sensitive flow
- P2: hardening, logging, observability, dependency hygiene
