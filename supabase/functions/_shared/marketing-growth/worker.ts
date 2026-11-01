import { growthReservationMicros, GROWTH_MAX_REQUEST_BYTES } from "./budget.ts";
import { buildGrowthPrompt, parseGrowthDocument, parseGrowthProfile } from "./content.ts";
type RpcResult = {
    data: unknown;
    error: unknown;
};
export type GrowthWorkerClient = {
    rpc: (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult> & {
        abortSignal?: (signal: AbortSignal) => PromiseLike<RpcResult>;
    };
};
export type GrowthGenerationInput = {
    messages: {
        role: "system" | "user";
        content: string;
    }[];
    schema: Record<string, unknown>;
    model: string;
};
export type GrowthWorkerConfig = {
    providerReady: boolean;
    model: string;
    maxCostMicros: number | null;
    generate: (input: GrowthGenerationInput) => Promise<unknown>;
};
export type GrowthWorkerResult = {
    status: string;
    reason?: string;
    id?: string;
};
const string = { type: "string" };
const strings = { type: "array", items: string };
function schemaObject(properties: Record<string, unknown>) { return { type: "object", properties, required: Object.keys(properties), additionalProperties: false }; }
const array = (items: unknown) => ({ type: "array", items });
export const GROWTH_DOCUMENT_SCHEMA = schemaObject({
    title: string, description: string, summary: string, language: { type: "string", enum: ["fr-CH", "fr", "en", "de", "it"] },
    sections: array(schemaObject({ heading: string, paragraphs: strings, sourceIds: strings })),
    faq: array(schemaObject({ question: string, answer: string, sourceIds: strings })),
    sources: array(schemaObject({ id: string, url: string, title: string, checkedAt: string })), links: array(schemaObject({ label: string, url: string })),
});
async function rpc(client: GrowthWorkerClient, name: string, args: Record<string, unknown>): Promise<unknown> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const request = client.rpc(name, args);
        const result = await Promise.race([request.abortSignal ? request.abortSignal(controller.signal) : request, new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("growth_database_unavailable")); }, 8000); })]);
        if (result.error)
            throw new Error("growth_database_unavailable");
        return result.data;
    }
    finally {
        clearTimeout(timer);
    }
}
function record(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("growth_response_invalid"); return value as Record<string, unknown>; }
/** One paid request at most, no provider-controlled tools/URLs and no blind retries. */
export async function runGrowthGeneration(client: GrowthWorkerClient, config: GrowthWorkerConfig): Promise<GrowthWorkerResult> {
    const reservation = growthReservationMicros(config.model, config.maxCostMicros);
    if (!config.providerReady || reservation === null)
        return { status: "blocked", reason: "provider_cost_ceiling_missing" };
    const claim = record(await rpc(client, "service_claim_marketing_growth_job", { p_max_cost_micros: reservation, p_model: config.model }));
    if (claim.status !== "running")
        return { status: String(claim.status), ...(typeof claim.reason === "string" ? { reason: claim.reason } : {}) };
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (typeof claim.id !== "string" || !uuid.test(claim.id) || typeof claim.leaseToken !== "string" || !uuid.test(claim.leaseToken) || claim.model !== config.model)
        throw new Error("growth_claim_invalid");
    const finish = { p_job_id: claim.id, p_lease_token: claim.leaseToken };
    let document: unknown = null;
    let errorCode: string | null = null;
    try {
        const profile = parseGrowthProfile(claim.profile);
        const messages = buildGrowthPrompt(profile, String(claim.brief));
        messages[0].content += `\nLes sources sont celles fournies par le profil, sans vérification HTTP. Leur checkedAt doit être la date d’approbation du profil : ${String(claim.profileApprovedAt)}. Langue fr-CH.`;
        if (new TextEncoder().encode(JSON.stringify({ messages, schema: GROWTH_DOCUMENT_SCHEMA })).byteLength > GROWTH_MAX_REQUEST_BYTES)
            throw new Error("growth_input_limit");
        let raw: unknown;
        try {
            raw = await config.generate({ messages, schema: GROWTH_DOCUMENT_SCHEMA, model: config.model });
        }
        catch {
            errorCode = "provider_outcome_unknown";
        }
        if (!errorCode) {
            try {
                const parsed = parseGrowthDocument(raw);
                if (parsed.sources.some(s => !profile.approvedUrls.includes(s.url) || Date.parse(s.checkedAt) !== Date.parse(String(claim.profileApprovedAt))))
                    throw new Error("unapproved_source");
                document = parsed;
            }
            catch {
                errorCode = "generated_document_invalid";
            }
        }
    }
    catch {
        errorCode = "generated_document_invalid";
    }
    try {
        const completion = record(await rpc(client, "service_finish_marketing_growth_job", { ...finish, p_document: document, p_error_code: errorCode }));
        return { status: errorCode ? "reconcile" : String(completion.status), id: claim.id };
    }
    catch {
        // The DB lease expires to reconcile. Never call completion or the provider again here.
        return { status: "reconcile", reason: "completion_outcome_unknown", id: claim.id };
    }
}
