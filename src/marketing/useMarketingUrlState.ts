import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";

import {
  MARKETING_VIEWS,
  type MarketingChannelId,
  type MarketingView,
} from "@/marketing/types";

export type MarketingUrlState = {
  view: MarketingView;
  query: string;
  status: string;
  channel: MarketingChannelId | "all";
  page: number;
  from: string;
  to: string;
};

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
  return Number.isInteger(page) && page > 0 ? page : 1;
}

function validDate(value: string | null) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
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

export function useMarketingUrlState() {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = useMemo<MarketingUrlState>(() => {
    const rawChannel = searchParams.get("channel");
    return {
      view: validView(searchParams.get("view")),
      query: (searchParams.get("q") || "").slice(0, 80),
      status: (searchParams.get("status") || "all").slice(0, 48),
      channel: rawChannel && CHANNELS.has(rawChannel as MarketingChannelId)
        ? rawChannel as MarketingChannelId
        : "all",
      page: validPage(searchParams.get("page")),
      from: validDate(searchParams.get("from")),
      to: validDate(searchParams.get("to")),
    };
  }, [searchParams]);

  const update = useCallback((patch: Partial<MarketingUrlState>) => {
    setSearchParams((current) => {
      return serializeMarketingState(current, { ...state, ...patch });
    }, { replace: true });
  }, [setSearchParams, state]);

  const setView = useCallback((view: MarketingView) => {
    if (view === state.view) return;
    setSearchParams((current) => serializeMarketingState(current, {
      ...state,
      view,
      page: 1,
      query: "",
      status: "all",
      channel: "all",
      from: "",
      to: "",
    }), { replace: false });
  }, [setSearchParams, state]);

  return { state, update, setView };
}
