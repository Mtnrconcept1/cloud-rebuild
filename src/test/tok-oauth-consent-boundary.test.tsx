import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OAuthConsent from "@/pages/OAuthConsent";
import { TOK_OAUTH_SCOPE_LABELS } from "@/lib/tokOAuth";

const api = vi.hoisted(() => ({
  rpc: vi.fn(), getSession: vi.fn(), getAuthorizationDetails: vi.fn(),
  approveAuthorization: vi.fn(), denyAuthorization: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({ rpc: api.rpc, auth: {
    getSession: api.getSession,
    oauth: { getAuthorizationDetails: api.getAuthorizationDetails, approveAuthorization: api.approveAuthorization, denyAuthorization: api.denyAuthorization },
  } }),
}));
vi.mock("@/components/auth/TokOAuthConnections", () => ({
  default: () => <section aria-label="Gestion des connexions TOK" />,
}));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const AUTHORIZATION_ID = "synthetic-authorization";
const RESTAURANT_ID = "33333333-3333-4333-8333-333333333333";
const CALLBACK = "https://client.example/callback?code=synthetic-code&state=synthetic-state";
const realWindow = window;
let assign: ReturnType<typeof vi.fn>;
let replace: ReturnType<typeof vi.fn>;

function openConsent() {
  return render(<MemoryRouter initialEntries={[`/oauth/consent?authorization_id=${AUTHORIZATION_ID}`]}><OAuthConsent /></MemoryRouter>);
}

function writes() {
  return api.rpc.mock.calls.filter(([name]) => name === "set_tok_connect_oauth_grant");
}

describe("TOK OAuth consent authorization boundary", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    assign = vi.fn();
    replace = vi.fn();
    const location = { origin: realWindow.location.origin, assign, replace };
    // Preserve the real DOM and router while observing navigation without any network.
    vi.stubGlobal("window", new Proxy(realWindow, {
      get(target, property, receiver) { return property === "location" ? location : Reflect.get(target, property, receiver); },
    }));
    api.getSession.mockResolvedValue({ data: { session: { user: { id: "native-user" } } }, error: null });
    api.getAuthorizationDetails.mockResolvedValue({ data: {
      authorization_id: AUTHORIZATION_ID, client: { id: CLIENT_ID, name: "Application protégée" },
      redirect_uri: "https://client.example/callback", scope: "openid email profile",
    }, error: null });
    api.approveAuthorization.mockResolvedValue({ data: { redirect_url: CALLBACK }, error: null });
    api.denyAuthorization.mockResolvedValue({ data: { redirect_url: "https://client.example/callback?error=access_denied" }, error: null });
    api.rpc.mockImplementation(async (name: string) => {
      if (name === "get_tok_connect_managed_oauth_clients") return { data: [CLIENT_ID], error: null };
      if (name === "list_tok_connect_oauth_restaurants") return { data: [{ id: RESTAURANT_ID, name: "Restaurant choisi", is_owner: true }], error: null };
      if (name === "set_tok_connect_oauth_grant") return { data: { id: "synthetic-grant" }, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("refuses an unmanaged client before showing permissions or approving", async () => {
    api.rpc.mockResolvedValueOnce({ data: [], error: null });
    openConsent();
    expect(await screen.findByRole("alert")).toHaveTextContent("Cette ancienne connexion n’utilise pas la protection TOK");
    expect(screen.queryByRole("button", { name: "Autoriser l’accès" })).not.toBeInTheDocument();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });

  it("does not forward an automatic-consent code whose client identity is missing", async () => {
    api.getAuthorizationDetails.mockResolvedValue({ data: { redirect_url: CALLBACK }, error: null });
    openConsent();

    expect(await screen.findByRole("heading", { name: "Reconnectez cette application" })).toBeInTheDocument();
    expect(screen.getByText(/Aucun code de connexion n’a été transmis/)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Gestion des connexions TOK" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Autoriser l’accès" })).not.toBeInTheDocument();
    expect(api.rpc).not.toHaveBeenCalled();
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("synthetic-code");
  });

  it("requires a verified client identity even when an authorization id is present", async () => {
    api.getAuthorizationDetails.mockResolvedValue({ data: { authorization_id: AUTHORIZATION_ID, redirect_url: CALLBACK }, error: null });
    openConsent();

    expect(await screen.findByRole("alert")).toHaveTextContent("L’application à autoriser ne peut pas être vérifiée");
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(assign).not.toHaveBeenCalled();
  });

  it("starts with two read permissions and saves them before releasing the code", async () => {
    const order: string[] = [];
    const defaultRpc = api.rpc.getMockImplementation()!;
    api.rpc.mockImplementation(async (name: string, params?: Record<string, unknown>) => {
      if (name === "set_tok_connect_oauth_grant") { order.push("save"); expect(assign).not.toHaveBeenCalled(); }
      return defaultRpc(name, params);
    });
    api.approveAuthorization.mockImplementation(async () => { order.push("approve"); return { data: { redirect_url: CALLBACK }, error: null }; });
    assign.mockImplementation(() => { order.push("redirect"); });
    openConsent();
    const approve = await screen.findByRole("button", { name: "Autoriser l’accès" });
    const editor = screen.getByRole("group", { name: "Permissions TOK choisies" });
    expect(within(editor).getAllByRole("checkbox").filter((input) => (input as HTMLInputElement).checked)).toHaveLength(2);
    expect(within(editor).getByRole("checkbox", { name: "Rechercher et consulter les restaurants" })).toBeChecked();
    expect(within(editor).getByRole("checkbox", { name: "Consulter les disponibilités" })).toBeChecked();
    fireEvent.click(approve);

    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith(CALLBACK));
    expect(api.approveAuthorization).toHaveBeenCalledExactlyOnceWith(AUTHORIZATION_ID, { skipBrowserRedirect: true });
    expect(writes()).toEqual([["set_tok_connect_oauth_grant", {
      p_client_id: CLIENT_ID, p_client_name: "Application protégée", p_scopes: ["restaurants:read", "availability:read"], p_restaurant_ids: [],
    }]]);
    expect(order).toEqual(["approve", "save", "redirect"]);
  });

  it("rechecks broker membership immediately before approving and fails closed if it was removed", async () => {
    openConsent();
    const approve = await screen.findByRole("button", { name: "Autoriser l’accès" });
    api.rpc.mockResolvedValueOnce({ data: [], error: null });
    fireEvent.click(approve);

    expect(await screen.findByRole("alert")).toHaveTextContent("La protection de cette application n’est plus confirmée");
    expect(api.rpc.mock.calls.filter(([name]) => name === "get_tok_connect_managed_oauth_clients")).toEqual([
      ["get_tok_connect_managed_oauth_clients", { p_client_ids: [CLIENT_ID] }],
      ["get_tok_connect_managed_oauth_clients", { p_client_ids: [CLIENT_ID] }],
    ]);
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it("never redirects when saving the business grant fails after Auth approval", async () => {
    const defaultRpc = api.rpc.getMockImplementation()!;
    api.rpc.mockImplementation(async (name: string, params?: Record<string, unknown>) => name === "set_tok_connect_oauth_grant"
      ? { data: null, error: { message: "Synthetic permission denial" } }
      : defaultRpc(name, params));
    openConsent();
    fireEvent.click(await screen.findByRole("button", { name: "Autoriser l’accès" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Vos permissions TOK n’ont pas été enregistrées. Aucun accès supplémentaire n’a été confirmé");
    expect(api.approveAuthorization).toHaveBeenCalledExactlyOnceWith(AUTHORIZATION_ID, { skipBrowserRedirect: true });
    expect(writes()).toHaveLength(1);
    expect(assign).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
    expect(document.body).not.toHaveTextContent("synthetic-code");
    expect(screen.getByRole("button", { name: "Autoriser l’accès" })).toBeEnabled();
  });

  it("withholds a code when management is selected without an explicit restaurant", async () => {
    openConsent();
    const approve = await screen.findByRole("button", { name: "Autoriser l’accès" });
    fireEvent.click(screen.getByRole("checkbox", { name: TOK_OAUTH_SCOPE_LABELS["restaurant:write"] }));
    expect(screen.getByRole("checkbox", { name: "Restaurant choisi" })).not.toBeChecked();
    fireEvent.click(approve);

    expect(await screen.findByRole("alert")).toHaveTextContent("Sélectionnez au moins un restaurant");
    expect(writes()).toHaveLength(0);
    expect(assign).not.toHaveBeenCalled();
  });

  it("denies without creating a TOK grant and asks Auth to avoid its own redirect", async () => {
    openConsent();
    fireEvent.click(await screen.findByRole("button", { name: "Refuser l’accès" }));

    await waitFor(() => expect(assign).toHaveBeenCalledExactlyOnceWith("https://client.example/callback?error=access_denied"));
    expect(api.denyAuthorization).toHaveBeenCalledExactlyOnceWith(AUTHORIZATION_ID, { skipBrowserRedirect: true });
    expect(api.approveAuthorization).not.toHaveBeenCalled();
    expect(writes()).toHaveLength(0);
  });
});
