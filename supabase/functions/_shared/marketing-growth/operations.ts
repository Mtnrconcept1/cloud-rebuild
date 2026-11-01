// Node/Vite operation boundary: emitted runtime imports must use .js. Edge worker does not import this module.
import { GrowthInputError, parseGrowthDocument, parseGrowthProfile } from "./content.js";
export const MARKETING_GROWTH_OPERATION_NAMES = [
    "admin_get_marketing_growth", "admin_save_marketing_growth_profile", "admin_configure_marketing_growth",
    "admin_save_marketing_growth_article", "admin_approve_marketing_growth_article", "admin_enqueue_marketing_growth_article",
] as const;
export type GrowthOperation = typeof MARKETING_GROWTH_OPERATION_NAMES[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export function parseGrowthArgs(operation: string, value: unknown): Record<string, unknown> {
    const fail = (): never => { throw new GrowthInputError(); };
    if (!value || typeof value !== "object" || Array.isArray(value))
        return fail();
    const a = value as Record<string, unknown>;
    const keys = (allowed: string[]) => { if (Object.keys(a).some(k => !allowed.includes(k)))
        fail(); };
    const integer = (v: unknown, min = 1, max = 2147483647) => { if (typeof v !== "number" || !Number.isSafeInteger(v) || v < min || v > max)
        fail(); };
    const id = (v: unknown) => { if (typeof v !== "string" || !UUID.test(v))
        fail(); };
    switch (operation) {
        case "admin_get_marketing_growth":
            keys(["offset", "limit", "articleId", "revision"]);
            if (a.offset !== undefined)
                integer(a.offset, 0, 100000);
            if (a.limit !== undefined)
                integer(a.limit, 1, 20);
            if (a.articleId !== undefined)
                id(a.articleId);
            if (a.revision !== undefined) {
                id(a.articleId);
                integer(a.revision);
            }
            break;
        case "admin_save_marketing_growth_profile":
            keys(["expectedVersion", "profile", "approve"]);
            integer(a.expectedVersion);
            if (a.approve !== true)
                fail();
            return { ...a, profile: parseGrowthProfile(a.profile) };
        case "admin_configure_marketing_growth":
            keys(["expectedVersion", "paused", "budgetMicros"]);
            integer(a.expectedVersion);
            if (typeof a.paused !== "boolean")
                fail();
            if (a.budgetMicros !== null)
                integer(a.budgetMicros, 0, 1000000000);
            break;
        case "admin_save_marketing_growth_article":
            keys(["articleId", "expectedVersion", "slug", "brief", "document"]);
            if (a.articleId !== undefined) {
                id(a.articleId);
                integer(a.expectedVersion);
            }
            else if (a.expectedVersion !== undefined)
                fail();
            if (typeof a.slug !== "string" || a.slug.length < 3 || a.slug.length > 120 || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(a.slug))
                fail();
            if (typeof a.brief !== "string" || a.brief.trim().length < 10 || a.brief.length > 4000)
                fail();
            if (a.document !== undefined && a.document !== null)
                return { ...a, document: parseGrowthDocument(a.document) };
            break;
        case "admin_approve_marketing_growth_article":
            keys(["articleId", "expectedVersion", "revision", "reason"]);
            id(a.articleId);
            integer(a.expectedVersion);
            integer(a.revision);
            if (typeof a.reason !== "string" || a.reason.trim().length < 10 || a.reason.length > 1000)
                fail();
            break;
        case "admin_enqueue_marketing_growth_article":
            keys(["articleId", "expectedVersion"]);
            id(a.articleId);
            integer(a.expectedVersion);
            break;
        default: return fail();
    }
    return a;
}
