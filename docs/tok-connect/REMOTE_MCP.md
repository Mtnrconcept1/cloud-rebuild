# TOK Connect Remote MCP

TOK Connect exposes one provider-neutral remote MCP endpoint for interactive AI clients:

```text
https://www.thetok.ch/mcp
```

This is the only public MCP URL that should be configured in Claude, ChatGPT or another remote MCP client. Direct Supabase Edge Function URLs are implementation details and are not client contracts.

## Protocol compatibility

The public gateway supports:

- MCP `2026-07-28` as the preferred stateless transport;
- MCP `2025-11-25`;
- MCP `2025-06-18`;
- MCP `2025-03-26`.

For MCP `2026-07-28`, TOK validates the routing headers `Mcp-Method` and, for `tools/call`, `Mcp-Name`. The gateway adapts 2026 traffic to the existing internal 2025 TOK MCP services so legacy integrations do not need to be rewritten at once.

The OAuth protected-resource metadata is available at:

```text
https://www.thetok.ch/.well-known/oauth-protected-resource
```

The authorization server remains Supabase Auth for interactive end users:

```text
https://wwcrtyoueexyxkkikaos.supabase.co/auth/v1
```

## What an agent can really do

The remote MCP is not limited to mocked responses. Depending on the authenticated TOK identity, restaurant grants, roles and feature flags, an agent can use live TOK data to:

- search the restaurant catalogue;
- read restaurant details;
- read menus;
- inspect real-time availability through the canonical TOK MCP tools;
- read TOK credit balances without spending them;
- prepare reservation and cancellation decisions;
- create a real reservation after explicit end-user confirmation;
- cancel a reservation created by the same TOK Connect integration after explicit end-user confirmation;
- generate campaign previews and bounded Autopilot plans where the corresponding TOK grants allow them;
- inspect the broader TOK application surface through read/preview tools.

Real reservation creation and cancellation remain idempotent and are revalidated server-side. A model cannot bypass restaurant grants, capacity checks, ownership rules or the required end-user confirmation by changing tool arguments.

## Operations that remain protected

The remote MCP deliberately does not turn every application mutation into an autonomous model action. Payments, refunds, credit spending, campaign publication, administrative mutations and other high-risk operations stay in their existing protected TOK flows unless a dedicated, audited MCP action is added later.

This boundary is intentional: an AI client may prepare or request a sensitive operation, but TOK remains authoritative for authorization, confirmation, pricing, payments and final state transitions.

## Claude

Create a custom remote MCP connector using:

```text
https://www.thetok.ch/mcp
```

Use OAuth when the client asks for authentication. Do not configure the internal `tok-connect-full-app-mcp` or a direct Supabase function URL.

Browser-origin calls from `https://claude.ai` are explicitly permitted by TOK CORS, while server-to-server MCP clients continue to work without an `Origin` header.

## ChatGPT

Configure the custom/developer MCP connection with the same endpoint:

```text
https://www.thetok.ch/mcp
```

The existing ChatGPT-oriented action gateway remains behind the universal wrapper, which preserves the current TOK reservation actions and application widget integration.

## Other MCP clients

A compatible client should:

1. call `initialize` using one of the supported protocol versions;
2. follow the protected-resource OAuth metadata when authentication is required;
3. send `MCP-Protocol-Version` after initialization as required by its negotiated protocol;
4. for MCP `2026-07-28`, send `Mcp-Method` and `Mcp-Name` where required;
5. use `tools/list` and `tools/call` rather than depending on internal Edge Function names;
6. preserve idempotency keys for real mutations.

## Security invariants

- No Supabase `service_role` key is sent to an MCP client.
- The public gateway does not bypass RLS or TOK grants.
- Real reservation mutations require OAuth, explicit confirmation and idempotency.
- Destructive tools are annotated as destructive.
- Sensitive operations remain server-authoritative.
- Unknown browser origins are rejected; server-to-server requests without an `Origin` header remain supported.
- The public MCP endpoint and OAuth metadata are `noindex` surfaces.

## Production verification

Before declaring a new client integration production-ready, verify the complete flow with that client:

1. MCP discovery and `initialize`;
2. OAuth discovery and consent;
3. authenticated `tools/list`;
4. a live read such as restaurant search or availability;
5. a reservation preview;
6. a real reservation only after an explicit user confirmation;
7. replay of the same idempotency key to confirm no duplicate reservation is created;
8. cancellation preview and explicit cancellation when appropriate;
9. token expiry/refresh behavior;
10. audit logs and restaurant grant enforcement.
