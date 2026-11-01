import { MARKETING_BFF_ENDPOINTS, marketingBffRequest } from "@/marketing/marketingBffClient";
import type { GrowthDocument, GrowthProfile } from "../../../supabase/functions/_shared/marketing-growth/content";
import type { GrowthOperation } from "../../../supabase/functions/_shared/marketing-growth/operations";
export type { GrowthDocument, GrowthProfile };
export type GrowthArticle = {
    id: string;
    slug: string;
    brief: string;
    version: number;
    current_revision: number | null;
    approved_revision: number | null;
    updated_at: string;
};
export type GrowthRevision = {
    article_id: string;
    revision: number;
    profile_version: number;
    document?: GrowthDocument;
    origin: string;
    created_at: string;
};
export type GrowthJob = {
    id: string;
    article_id: string;
    status: string;
    error_code: string | null;
    reserved_micros: number;
    created_at: string;
    completed_at: string | null;
};
export type GrowthDashboard = {
    site: {
        profile: GrowthProfile | null;
        profile_version: number;
        profile_approved_at: string | null;
        paused: boolean;
        monthly_budget_micros: number | null;
        version: number;
    };
    articles: GrowthArticle[];
    revisions: GrowthRevision[];
    jobs: GrowthJob[];
    total: number;
    reservedMicros: number;
};
export function growthOperation<T = unknown>(operation: GrowthOperation, args: Record<string, unknown> = {}): Promise<T> {
    return marketingBffRequest<T>(MARKETING_BFF_ENDPOINTS.rpc, { body: { operation, args } });
}
export function loadGrowthDashboard(offset = 0, articleId?: string, revision?: number) { return growthOperation<GrowthDashboard>("admin_get_marketing_growth", { offset, limit: 20, ...(articleId ? { articleId } : {}), ...(revision ? { revision } : {}) }); }
