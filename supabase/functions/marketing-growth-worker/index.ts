import { HttpError } from "../_shared/auth.ts";
import { authenticateMarketingRequest } from "../_shared/marketing-service-auth.ts";
import { createOpenAIResponse, parseStructuredOutput } from "../_shared/openai.ts";
import { AI_SECURITY_SYSTEM_PROMPT, buildAiSecurityContext } from "../_shared/ai-security.ts";
import { runGrowthGeneration } from "../_shared/marketing-growth/worker.ts";
import { GROWTH_MAX_OUTPUT_TOKENS, GROWTH_MAX_INPUT_TOKENS } from "../_shared/marketing-growth/budget.ts";
/** Separate from distribution: article latency cannot turn a completed mailing into a BFF timeout. */
Deno.serve(async (request) => {
    const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
    const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
    if (request.method !== "POST")
        return response({ error: "method_not_allowed" }, 405);
    try {
        const actor = await authenticateMarketingRequest(request, { allowSchedulerSecret: true });
        if (actor.authMode === "user_jwt" || (!actor.isServiceRole && actor.authMode !== "scheduler_secret"))
            return response({ error: "service_auth_required" }, 403);
        // No user input is consumed, no browser origin is allowed, no arbitrary job/site can be selected.
        if (request.headers.has("origin"))
            return response({ error: "service_auth_required" }, 403);
        const raw = await request.text();
        if (raw.length > 100 || !/^\s*\{\s*\}\s*$/.test(raw))
            return response({ error: "invalid_request" }, 400);
        // Housekeeping always runs, including after provider credentials have been revoked.
        const housekeeping = await actor.adminClient.rpc("service_expire_marketing_growth_jobs", {});
        if (housekeeping.error)
            return response({ status: "unavailable" }, 503);
        const result = await runGrowthGeneration(actor.adminClient, {
            providerReady: Boolean(Deno.env.get("OPENAI_API_KEY")?.trim()),
            model: Deno.env.get("MARKETING_GROWTH_MODEL")?.trim() || "",
            maxCostMicros: Number(Deno.env.get("MARKETING_GROWTH_MAX_CALL_MICROS") || 0),
            generate: async ({ messages, schema, model }) => {
                const context = buildAiSecurityContext(messages.filter(m => m.role === "user").map(m => m.content));
                // Byte-level token upper bound plus ample room for message framing. No tools or external search charges.
                const bytes = new TextEncoder().encode(JSON.stringify({ messages, schema, security: AI_SECURITY_SYSTEM_PROMPT, context: context.instruction })).byteLength;
                if (bytes + 10000 > GROWTH_MAX_INPUT_TOKENS)
                    throw new Error("growth_input_limit");
                return parseStructuredOutput(await createOpenAIResponse({ model, input: messages, maxOutputTokens: GROWTH_MAX_OUTPUT_TOKENS, timeoutMs: 45000, serviceTier: "default", jsonSchema: { name: "tok_growth_article", schema, strict: true } }));
            },
        });
        if (result.status === "blocked")
            await actor.adminClient.rpc("service_note_marketing_growth_block", { p_reason: result.reason || "provider_cost_ceiling_missing" });
        return response(result);
    }
    catch (error) {
        return response({ status: "unavailable" }, error instanceof HttpError && [401, 403].includes(error.status) ? error.status : 503);
    }
});
