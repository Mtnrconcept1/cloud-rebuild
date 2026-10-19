import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  MARKETING_VIEWS,
  type MarketingChannelId,
  type MarketingView,
} from "@/marketing/types";
import { marketingMonthRange, marketingZurichDateBoundaryToIso, marketingZurichDateKey } from "@/marketing/zurichTime";

export type MarketingUrlState = {
  view: MarketingView;
  query: string;
  status: string;
  channel: MarketingChannelId | "all";
  page: number;
  from: string;
  to: string;
  campaignId?: string;
  itemId?: string;
};

export type MarketingNavigationTarget = {
  campaignId?: string;
  itemId?: string;
  scheduledAt?: string;
};

export type MarketingNavigate = (view: MarketingView, target?: MarketingNavigationTarget) => void;

const CHANNELS = new Set<MarketingChannelId>([
  "tok_news",
  "in_app",
  "email",
  "push",
  "instagram",
  "facebook",
  "tiktok",
  "linkedin",
  "youtube",
  "google_business",
  "telegram",
  "website",
  "manual_call",
  "manual_email",
  "manual_visit",
]);

function validView(value: string | null): MarketingView {
  return MARKETING_VIEWS.includes(value as MarketingView)
    ? value as MarketingView
    : "overview";
}

function validPage(value: string | null) {
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && marketingZurichDateBoundaryToIso(value, "start") ? value : "";
}

function validId(value: string | null | undefined) {
  return value && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
    ? value.toLowerCase()
    : "";
}

function serializeMarketingState(current: URLSearchParams, state: MarketingUrlState) {
  const next = new URLSearchParams(current);
  const values: Record<string, string> = {
    view: state.view,
    q: state.query.trim(),
    status: state.status,
    channel: state.channel,
    page: String(state.page),
    from: state.from,
    to: state.to,
    campaignId: validId(state.campaignId),
    itemId: validId(state.itemId),
  };

  for (const [key, value] of Object.entries(values)) {
    const defaultValue = (
      (key === "view" && value === "overview")
      || (key === "status" && value === "all")
      || (key === "channel" && value === "all")
      || (key === "page" && value === "1")
      || value === ""
    );
    if (defaultValue) next.delete(key);
    else next.set(key, value);
  }
  return next;
}

/** Only a local marketing workspace can be resumed after the isolated login. */
export function marketingLoginReturnTarget(value: unknown) {
  if (typeof value !== "string" || !/^\/marketing(?:\?|$)/.test(value) || value.length > 2_000) return "/marketing";
  const url = new URL(value, "https://marketing.thetok.ch");
  if (url.origin !== "https://marketing.thetok.ch" || url.pathname !== "/marketing" || url.hash) return "/marketing";
  const safe = serializeMarketingState(new URLSearchParams(), readMarketingState(url.searchParams));
  return safe.size ? `/marketing?${safe.toString()}` : "/marketing";
}

function readMarketingState(searchParams: URLSearchParams): MarketingUrlState {
  const rawChannel = searchParams.get("channel");
  const view = validView(searchParams.get("view"));
  const reviewView = view === "calendar" || view === "campaigns";
  return {
    view,
    query: (searchParams.get("q") || "").slice(0, 80),
    status: (searchParams.get("status") || "all").slice(0, 48),
    channel: rawChannel && CHANNELS.has(rawChannel as MarketingChannelId)
      ? rawChannel as MarketingChannelId
      : "all",
    page: validPage(searchParams.get("page")),
    from: validDate(searchParams.get("from")),
    to: validDate(searchParams.get("to")),
    campaignId: reviewView ? validId(searchParams.get("campaignId")) : "",
    itemId: reviewView ? validId(searchParams.get("itemId")) : "",
  };
}

export function useMarketingUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo(() => readMarketingState(searchParams), [searchParams]);

  const update = useCallback((patch: Partial<MarketingUrlState>) => {
    setSearchParams((current) => {
      return serializeMarketingState(current, { ...readMarketingState(current), ...patch });
    }, { replace: true });
  }, [setSearchParams]);

  const setView = useCallback<MarketingNavigate>((view, target) => {
    if (view === state.view && !target && !state.campaignId && !state.itemId) return;
    const range = view === "calendar" && target?.scheduledAt
      ? marketingMonthRange(marketingZurichDateKey(target.scheduledAt))
      : null;
    setSearchParams((current) => serializeMarketingState(current, {
      ...state,
      view,
      page: 1,
      query: "",
      status: "all",
      channel: "all",
      from: range?.from || "",
      to: range?.to || "",
      campaignId: target?.campaignId || "",
      itemId: target?.itemId || "",
    }), { replace: false });
  }, [setSearchParams, state]);

  return { state, update, setView };
}
