import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ marketingBffRequest: request }));
import MarketingSocialFollowView from "@/components/marketing/views/MarketingSocialFollowView";
import type { MarketingUrlState } from "@/marketing/useMarketingUrlState";
import type { MarketingSocialCollectResult, MarketingSocialFollowList, MarketingSocialFollowRequest, MarketingSocialProfile } from "../../supabase/functions/_shared/marketing-social-follow-contract";
import { SOCIAL_ACCOUNT_ID, SOCIAL_PROFILE_ID, SOCIAL_RESTAURANT_ID, socialCollect, socialDeferred, socialList, socialProfile, socialProgress, socialRestaurant } from "./marketing-social-follow-fixtures";

const filters: MarketingUrlState = { view: "social_follow", query: "", status: "all", channel: "all", page: 1, from: "", to: "" };
const callsFor = (action: string) => request.mock.calls.filter(([, options]) => options.body.action === action);
let data: MarketingSocialFollowList;

function renderView(enabled = true, initialFilters: Partial<MarketingUrlState> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  function Harness() {
    const [state, setState] = useState({ ...filters, ...initialFilters });
    return <MarketingSocialFollowView canMutateBackend={enabled} filters={state} onFiltersChange={(patch) => setState((current) => ({ ...current, ...patch }))} />;
  }
  return { ...render(<QueryClientProvider client={queryClient}><Harness /></QueryClientProvider>), queryClient };
}

function applyRecord(body: Extract<MarketingSocialFollowRequest, { action: "record" }>) {
  const profile: MarketingSocialProfile = {
    ...data.items[0], followStatus: body.followStatus, verificationStatus: body.verificationStatus,
    sourceAccountId: body.expectedSourceAccountId, version: body.expectedVersion + 1,
    note: body.note, confirmedAt: "2026-10-19T11:00:00Z",
  };
  data = { ...data, items: [profile], counts: { unknown: 0, not_followed: 0, requested: 0, followed: 0, ignored: 0, [body.followStatus]: 1 } };
  return profile;
}

function defaultRequest(_path: string, options: { body: MarketingSocialFollowRequest; signal?: AbortSignal }) {
  const body = options.body;
  if (body.action === "list") return Promise.resolve(data);
  if (body.action === "restaurants") return Promise.resolve({ items: [socialRestaurant()], total: 1 });
  if (body.action === "record") return Promise.resolve(applyRecord(body));
  if (body.action === "add") return Promise.resolve({ profile: socialProfile({ note: body.note }), duplicate: false });
  const result = socialCollect();
  data = { ...data, collection: result.collection };
  return Promise.resolve(result);
}

async function openRecord() {
  fireEvent.click(await screen.findByRole("button", { name: "Enregistrer le contrôle" }));
  return within(await screen.findByRole("dialog"));
}

describe("restaurant social follow workspace", () => {
  beforeEach(() => { data = socialList(); request.mockReset(); request.mockImplementation(defaultRequest); });
  afterEach(cleanup);

  it("opens a validated profile without recording a follow or starting collection", async () => {
    renderView();
    const link = await screen.findByRole("link", { name: "Ouvrir le profil" });
    expect(link).toHaveAttribute("href", "https://www.instagram.com/restaurant_du_lac/");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    fireEvent.click(link);
    expect(callsFor("record")).toHaveLength(0);
    expect(callsFor("collect")).toHaveLength(0);
    expect(screen.getByText("À contrôler", { selector: "div" })).toBeInTheDocument();
  });

  it.each(["requested", "followed"] as const)("saves %s only after identity and the current TOK account are explicitly confirmed", async (followStatus) => {
    const saved = socialDeferred<MarketingSocialProfile>();
    request.mockImplementation((path, options) => options.body.action === "record" ? saved.promise : defaultRequest(path, options));
    renderView();
    const dialog = await openRecord();
    const resultSelect = dialog.getByLabelText("Résultat du contrôle");
    expect(dialog.getByRole("option", { name: followStatus === "requested" ? "Demande envoyée" : "Suivi confirmé" })).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("Identité du restaurant"), { target: { value: "verified" } });
    fireEvent.change(resultSelect, { target: { value: followStatus } });
    const submit = dialog.getByRole("button", { name: "Enregistrer le contrôle" });
    expect(submit).toBeDisabled();
    fireEvent.click(dialog.getByRole("checkbox", { name: /Je confirme avoir utilisé le compte TOK/ }));
    fireEvent.change(dialog.getByLabelText("Note de contrôle (facultative)"), { target: { value: "Identité vérifiée à Genève" } });
    const form = submit.closest("form");
    fireEvent.submit(form!);
    fireEvent.submit(form!);
    expect(callsFor("record")).toHaveLength(1);
    const body = callsFor("record")[0][1].body;
    expect(body).toEqual({ action: "record", profileId: SOCIAL_PROFILE_ID, followStatus, verificationStatus: "verified", expectedVersion: 0, expectedSourceAccountId: SOCIAL_ACCOUNT_ID, confirmedWithTokAccount: true, note: "Identité vérifiée à Genève" });
    await act(async () => saved.resolve(applyRecord(body)));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(screen.getByText(followStatus === "requested" ? "Demande envoyée" : "Suivi confirmé", { selector: "div" })).toBeInTheDocument();
    if (followStatus === "requested") expect(screen.queryByText("Suivi confirmé", { selector: "div" })).not.toBeInTheDocument();
  });

  it("blocks follow and request declarations for a rejected identity, including a forced select value", async () => {
    renderView();
    const dialog = await openRecord();
    fireEvent.change(dialog.getByLabelText("Identité du restaurant"), { target: { value: "rejected" } });
    for (const status of ["requested", "followed"]) {
      fireEvent.change(dialog.getByLabelText("Résultat du contrôle"), { target: { value: status } });
      expect(dialog.getByRole("button", { name: "Enregistrer le contrôle" })).toBeDisabled();
      expect(dialog.getByRole("checkbox")).toBeDisabled();
      fireEvent.submit(dialog.getByRole("button", { name: "Enregistrer le contrôle" }).closest("form")!);
    }
    expect(callsFor("record")).toHaveLength(0);
  });

  it("shows an unknown follow state for a different TOK account and clears confirmations when that account changes again", async () => {
    data.items = [socialProfile({ followStatus: "followed", verificationStatus: "verified", sourceAccountId: "17841400000000999" })];
    const { queryClient } = renderView();
    expect(await screen.findByText(/Le compte TOK a changé/)).toBeInTheDocument();
    const dialog = await openRecord();
    expect(dialog.getByLabelText("Résultat du contrôle")).toHaveValue("unknown");
    fireEvent.change(dialog.getByLabelText("Résultat du contrôle"), { target: { value: "followed" } });
    fireEvent.click(dialog.getByRole("checkbox"));
    expect(dialog.getByRole("button", { name: "Enregistrer le contrôle" })).toBeEnabled();
    data = { ...data, sourceAccounts: [{ ...data.sourceAccounts[0], id: "17841400000000002", label: "@tok_nouveau" }, data.sourceAccounts[1]] };
    await act(async () => { await queryClient.invalidateQueries(); });
    await waitFor(() => expect(dialog.getByRole("button", { name: "Enregistrer le contrôle" })).toBeDisabled());
    expect(dialog.getByText(/Le compte TOK ou ce profil a changé/)).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Recharger le contrôle" }));
    const refreshed = within(screen.getByRole("dialog"));
    expect(refreshed.getByLabelText("Résultat du contrôle")).toHaveValue("unknown");
    fireEvent.change(refreshed.getByLabelText("Résultat du contrôle"), { target: { value: "followed" } });
    expect(refreshed.getByRole("checkbox")).not.toBeChecked();
    expect(refreshed.getByRole("button", { name: "Enregistrer le contrôle" })).toBeDisabled();
    expect(callsFor("record")).toHaveLength(0);
  });

  it("preserves entered notes after a version conflict and asks for a fresh control", async () => {
    request.mockImplementation((path, options) => {
      if (options.body.action !== "record") return defaultRequest(path, options);
      data = { ...data, items: [socialProfile({ version: 1 })] };
      return Promise.reject(new Error("Les données ont changé. Actualisez avant de réessayer."));
    });
    renderView();
    const dialog = await openRecord();
    fireEvent.change(dialog.getByLabelText("Note de contrôle (facultative)"), { target: { value: "Ma note à conserver" } });
    fireEvent.click(dialog.getByRole("button", { name: "Enregistrer le contrôle" }));
    expect(await dialog.findByText("Les données ont changé. Actualisez avant de réessayer.")).toBeInTheDocument();
    expect(dialog.getByLabelText("Note de contrôle (facultative)")).toHaveValue("Ma note à conserver");
    expect(dialog.getByRole("button", { name: "Enregistrer le contrôle" })).toBeDisabled();
    expect(dialog.getByRole("button", { name: "Recharger le contrôle" })).toBeEnabled();
  });

  it("processes collection batches sequentially until the durable pending count reaches zero", async () => {
    data.collection = socialProgress({ eligibleRestaurants: 6, totalJobs: 6, pending: 6 });
    const first = socialDeferred<MarketingSocialCollectResult>();
    const second = socialDeferred<MarketingSocialCollectResult>();
    request.mockImplementation((path, options) => options.body.action === "collect" ? (callsFor("collect").length === 1 ? first.promise : second.promise) : defaultRequest(path, options));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la collecte" }));
    expect(callsFor("collect")).toHaveLength(1);
    expect(screen.getByText(/Gardez cette page ouverte/)).toBeInTheDocument();
    const partial = socialCollect({ hasMore: true, collection: socialProgress({ eligibleRestaurants: 6, totalJobs: 6, completed: 3, pending: 3 }) });
    data.collection = partial.collection;
    await act(async () => first.resolve(partial));
    await waitFor(() => expect(callsFor("collect")).toHaveLength(2));
    const finished = socialCollect({ collection: socialProgress({ eligibleRestaurants: 6, totalJobs: 6, completed: 6, pending: 0, hasMore: false }) });
    data.collection = finished.collection;
    await act(async () => second.resolve(finished));
    expect(await screen.findByText(/Collecte terminée pour les restaurants disponibles/)).toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(2);
    for (const [, options] of callsFor("collect")) expect(options.body).toEqual({ action: "collect", limit: 3, restaurantId: null });
  });

  it("aborts an active batch on stop and resumes only after another explicit action", async () => {
    const first = socialDeferred<MarketingSocialCollectResult>();
    request.mockImplementation((path, options) => options.body.action === "collect" && callsFor("collect").length === 1 ? first.promise : defaultRequest(path, options));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la collecte" }));
    const firstSignal: AbortSignal = callsFor("collect")[0][1].signal;
    fireEvent.click(screen.getByRole("button", { name: "Arrêter la collecte" }));
    expect(firstSignal.aborted).toBe(true);
    const partial = socialCollect({ hasMore: true, collection: socialProgress({ completed: 1, pending: 2 }) });
    data.collection = partial.collection;
    await act(async () => first.resolve(partial));
    expect(await screen.findByText(/Le lot déjà transmis peut encore se terminer/)).toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(1);
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Actualiser" })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: "Reprendre la collecte" }));
    expect(await screen.findByText(/Collecte terminée pour les restaurants disponibles/)).toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(2);
  });

  it("aborts collection when navigating away and does not issue a next batch", async () => {
    const pending = socialDeferred<MarketingSocialCollectResult>();
    request.mockImplementation((path, options) => options.body.action === "collect" ? pending.promise : defaultRequest(path, options));
    const { unmount } = renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la collecte" }));
    const signal: AbortSignal = callsFor("collect")[0][1].signal;
    unmount();
    expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve(socialCollect({ hasMore: true, collection: socialProgress({ pending: 2 }) })));
    expect(callsFor("collect")).toHaveLength(1);
  });

  it("stops after an error and never reports a failed batch as completed", async () => {
    request.mockImplementation((path, options) => options.body.action === "collect" ? Promise.reject(new Error("Service momentanément indisponible.")) : defaultRequest(path, options));
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la collecte" }));
    expect(await screen.findByText(/Collecte arrêtée. Service momentanément indisponible/)).toBeInTheDocument();
    expect(screen.getByText("0 / 3")).toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(1);
    expect(screen.queryByText(/Collecte terminée pour/)).not.toBeInTheDocument();
  });

  it("reports deferred retries as pending instead of completed when the server has no available batch", async () => {
    request.mockImplementation((path, options) => {
      if (options.body.action !== "collect") return defaultRequest(path, options);
      const result = socialCollect({ processed: 0, hasMore: false, collection: socialProgress({ pending: 3, hasMore: false }) });
      data.collection = result.collection;
      return Promise.resolve(result);
    });
    renderView();
    fireEvent.click(await screen.findByRole("button", { name: "Reprendre la collecte" }));
    expect(await screen.findByText(/Des restaurants restent en attente d’une nouvelle tentative/)).toBeInTheDocument();
    expect(screen.queryByText(/Collecte terminée pour/)).not.toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Reprendre la collecte" })).toBeEnabled();
  });

  it("loads later restaurant pages from the backend", async () => {
    request.mockImplementation((path, options) => {
      if (options.body.action !== "restaurants") return defaultRequest(path, options);
      return Promise.resolve({ items: [socialRestaurant({ name: options.body.offset === 0 ? "Première page" : "Restaurant suivant" })], total: 25 });
    });
    renderView();
    await screen.findByText("@restaurant_du_lac");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Restaurants à rechercher" }), { button: 0, ctrlKey: false });
    await screen.findByText("Première page");
    fireEvent.click(screen.getByRole("button", { name: "Suivant" }));
    expect(await screen.findByText("Restaurant suivant")).toBeInTheDocument();
    expect(callsFor("restaurants").at(-1)![1].body).toEqual({ action: "restaurants", query: "", limit: 20, offset: 20 });
  });

  it("does not announce a targeted search as recorded when the server processed no restaurant", async () => {
    request.mockImplementation((path, options) => options.body.action === "collect"
      ? Promise.resolve(socialCollect({ processed: 0, discovered: 0, results: [], hasMore: true, collection: socialProgress() }))
      : defaultRequest(path, options));
    renderView();
    await screen.findByText("@restaurant_du_lac");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Restaurants à rechercher" }), { button: 0, ctrlKey: false });
    fireEvent.click(await screen.findByRole("button", { name: "Rechercher sur le site" }));
    expect(await screen.findByText(/Aucune nouvelle recherche n’a été effectuée pour ce restaurant/)).toBeInTheDocument();
    expect(screen.queryByText(/Recherche de ce restaurant enregistrée/)).not.toBeInTheDocument();
    expect(callsFor("collect")).toHaveLength(1);
    expect(callsFor("collect")[0][1].body).toEqual({ action: "collect", limit: 3, restaurantId: SOCIAL_RESTAURANT_ID });
  });

  it("adds a profile for a restaurant without a website from the paginated restaurant API", async () => {
    const restaurant = socialRestaurant({ websiteUrl: null, discoveryStatus: "no_website" });
    request.mockImplementation((path, options) => options.body.action === "restaurants" ? Promise.resolve({ items: [restaurant], total: 1 }) : defaultRequest(path, options));
    renderView();
    await screen.findByText("@restaurant_du_lac");
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Restaurants à rechercher" }), { button: 0, ctrlKey: false });
    const list = within(await screen.findByRole("list", { name: "Restaurants à rechercher" }));
    expect(list.getByRole("button", { name: "Rechercher sur le site" })).toBeDisabled();
    fireEvent.click(list.getByRole("button", { name: "Ajouter un profil" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByText("Restaurant du Lac · Genève")).toBeInTheDocument();
    fireEvent.change(dialog.getByLabelText("URL du profil Instagram ou Facebook"), { target: { value: "https://facebook.com/restaurantdulac/" } });
    fireEvent.change(dialog.getByLabelText("Note (facultative)"), { target: { value: "Compte indiqué sur place" } });
    fireEvent.click(dialog.getByRole("button", { name: "Ajouter à la file" }));
    expect(await screen.findByText(/Profil ajouté à la file/)).toBeInTheDocument();
    expect(callsFor("restaurants")).not.toHaveLength(0);
    expect(callsFor("add")[0][1].body).toEqual({ action: "add", restaurantId: SOCIAL_RESTAURANT_ID, profileUrl: "https://www.facebook.com/restaurantdulac/", sourceUrl: null, note: "Compte indiqué sur place" });
    expect(callsFor("record")).toHaveLength(0);
  });

  it("requires choosing an actual restaurant before a generic manual addition", async () => {
    renderView();
    await screen.findByText("@restaurant_du_lac");
    fireEvent.click(await screen.findByRole("button", { name: "Ajouter un profil" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("URL du profil Instagram ou Facebook"), { target: { value: "https://instagram.com/restaurant_du_lac/" } });
    expect(dialog.getByRole("button", { name: "Ajouter à la file" })).toBeDisabled();
    fireEvent.click(await dialog.findByRole("button", { name: /Restaurant du Lac/ }));
    expect(dialog.getByRole("button", { name: "Ajouter à la file" })).toBeEnabled();
    expect(callsFor("add")).toHaveLength(0);
  });

  it("does not show stale search results when an older request resolves after the latest one", async () => {
    const first = socialDeferred<MarketingSocialFollowList>();
    const second = socialDeferred<MarketingSocialFollowList>();
    request.mockImplementation((path, options) => {
      if (options.body.action === "list" && options.body.query === "Ancien") return first.promise;
      if (options.body.action === "list" && options.body.query === "Nouveau") return second.promise;
      return defaultRequest(path, options);
    });
    renderView();
    await screen.findByText("@restaurant_du_lac");
    const search = screen.getByLabelText("Rechercher un compte ou un restaurant");
    fireEvent.change(search, { target: { value: "Ancien" } });
    await waitFor(() => expect(callsFor("list").some(([, options]) => options.body.query === "Ancien")).toBe(true));
    const firstSignal: AbortSignal = callsFor("list").find(([, options]) => options.body.query === "Ancien")![1].signal;
    fireEvent.change(search, { target: { value: "Nouveau" } });
    await waitFor(() => expect(callsFor("list").some(([, options]) => options.body.query === "Nouveau")).toBe(true));
    await act(async () => second.resolve(socialList({ items: [socialProfile({ handle: "@compte_nouveau" })] })));
    expect(await screen.findByText("@compte_nouveau")).toBeInTheDocument();
    await act(async () => first.resolve(socialList({ items: [socialProfile({ handle: "@compte_ancien" })] })));
    expect(screen.queryByText("@compte_ancien")).not.toBeInTheDocument();
    expect(firstSignal.aborted).toBe(true);
    expect(search).toHaveValue("Nouveau");
  });

  it("resets pagination on filter changes and distinguishes backend errors from empty results", async () => {
    data = socialList({ total: 45 });
    renderView(true, { page: 2, query: "Fondue" });
    await screen.findByText("@restaurant_du_lac");
    expect(callsFor("list")[0][1].body.offset).toBe(20);
    request.mockRejectedValue(new Error("Suivi social indisponible."));
    fireEvent.change(screen.getByLabelText("Réseau"), { target: { value: "facebook" } });
    expect(await screen.findByText("La file n’a pas pu être chargée")).toBeInTheDocument();
    expect(callsFor("list").at(-1)![1].body).toMatchObject({ platform: "facebook", query: "Fondue", offset: 0 });
    expect(screen.getByLabelText("Rechercher un compte ou un restaurant")).toHaveValue("Fondue");
    expect(screen.queryByText("Aucun compte ne correspond aux filtres")).not.toBeInTheDocument();
    data = socialList({ items: [], total: 0 });
    request.mockImplementation(defaultRequest);
    fireEvent.click(screen.getByRole("button", { name: "Réessayer le chargement" }));
    expect(await screen.findByText("Aucun compte ne correspond aux filtres")).toBeInTheDocument();
  });

  it("fails closed without backend authority and never renders an arbitrary profile destination", async () => {
    const disabled = renderView(false);
    expect(screen.getByRole("button", { name: "Rechercher les comptes" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Ajouter un profil" })).toBeDisabled();
    expect(request).not.toHaveBeenCalled();
    disabled.unmount();
    data.items = [socialProfile({ profileUrl: "javascript:alert(1)", restaurants: [{ ...socialProfile().restaurants[0], sourceUrl: "javascript:alert(2)" }] })];
    renderView();
    expect(await screen.findByText("URL du compte à vérifier")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Ouvrir le profil" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Voir la source" })).not.toBeInTheDocument();
  });
});
