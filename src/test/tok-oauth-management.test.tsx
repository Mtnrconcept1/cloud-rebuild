import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import TokOAuthConnections from "@/components/auth/TokOAuthConnections";
import { TOK_OAUTH_SCOPE_LABELS } from "@/lib/tokOAuth";

const db = vi.hoisted(() => ({
  rpc: vi.fn(), from: vi.fn(), select: vi.fn(), order: vi.fn(), limit: vi.fn(),
  listGrants: vi.fn(), revokeGrant: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    rpc: db.rpc, from: db.from,
    auth: { oauth: { listGrants: db.listGrants, revokeGrant: db.revokeGrant } },
  }),
}));

const CLIENT_ID = "11111111-1111-4111-8111-111111111111";
const OLD_CLIENT_ID = "22222222-2222-4222-8222-222222222222";
const OWNER_RESTAURANT_ID = "33333333-3333-4333-8333-333333333333";
const STAFF_RESTAURANT_ID = "44444444-4444-4444-8444-444444444444";
const restaurants = [
  { id: OWNER_RESTAURANT_ID, name: "Restaurant propriétaire", is_owner: true },
  { id: STAFF_RESTAURANT_ID, name: "Restaurant équipe", is_owner: false },
];
const grant = {
  id: "55555555-5555-4555-8555-555555555555", user_id: "native-user",
  client_id: CLIENT_ID, client_name: "Application protégée", scopes: ["restaurants:read", "availability:read"],
  restaurant_ids: [], revision: 1, created_at: "2026-01-01T00:00:00Z", updated_at: "2026-01-01T00:00:00Z",
  expires_at: "2099-01-01T00:00:00Z", revoked_at: null,
};

async function openEditor() {
  render(<TokOAuthConnections />);
  fireEvent.click(await screen.findByRole("button", { name: "Configurer les permissions" }));
  return screen.getByRole("group", { name: "Permissions TOK choisies" });
}

function mutations(name: string) {
  return db.rpc.mock.calls.filter(([rpcName]) => rpcName === name);
}

describe("TOK OAuth connection management boundaries", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    db.from.mockReturnValue({ select: db.select });
    db.select.mockReturnValue({ order: db.order });
    db.order.mockReturnValue({ limit: db.limit });
    db.limit.mockResolvedValue({ data: [], error: null });
    db.listGrants.mockResolvedValue({
      data: [{ client: { id: CLIENT_ID, name: "Application protégée" }, scopes: ["openid"], granted_at: "2026-01-01T00:00:00Z" }],
      error: null,
    });
    db.revokeGrant.mockResolvedValue({ data: {}, error: null });
    db.rpc.mockImplementation(async (name: string) => {
      if (name === "list_tok_connect_oauth_restaurants") return { data: restaurants, error: null };
      if (name === "get_tok_connect_managed_oauth_clients") return { data: [CLIENT_ID], error: null };
      if (name === "set_tok_connect_oauth_grant") return { data: grant, error: null };
      if (name === "revoke_tok_connect_oauth_grant") return { data: true, error: null };
      throw new Error(`Unexpected RPC: ${name}`);
    });
  });

  afterEach(cleanup);

  it("lists native connections without needing request logs and configures only managed clients", async () => {
    db.listGrants.mockResolvedValue({ data: [
      { client: { id: CLIENT_ID, name: "Application protégée" }, scopes: ["openid"], granted_at: "2026-01-01T00:00:00Z" },
      { client: { id: OLD_CLIENT_ID, name: "Ancienne application" }, scopes: ["openid"], granted_at: "2026-01-01T00:00:00Z" },
    ], error: null });
    render(<TokOAuthConnections />);

    await screen.findByRole("heading", { name: "Application protégée" });
    const legacy = screen.getByRole("heading", { name: "Ancienne application" }).closest("article")!;
    expect(within(legacy).getByText(/Elle ne peut pas recevoir de nouveaux droits TOK/)).toBeInTheDocument();
    expect(within(legacy).queryByRole("button", { name: "Configurer les permissions" })).not.toBeInTheDocument();
    expect(within(legacy).getByRole("button", { name: "Révoquer l’accès" })).toBeEnabled();
    expect(screen.getAllByRole("button", { name: "Configurer les permissions" })).toHaveLength(1);
    expect(db.from.mock.calls).toEqual([["tok_connect_oauth_grants"]]);
    expect(db.listGrants).toHaveBeenCalledTimes(1);
    expect(db.rpc).toHaveBeenCalledWith("get_tok_connect_managed_oauth_clients", { p_client_ids: [CLIENT_ID, OLD_CLIENT_ID] });
  });

  it("starts with exactly the two discovery permissions and no restaurant delegation", async () => {
    const editor = await openEditor();
    const checked = within(editor).getAllByRole("checkbox").filter((input) => (input as HTMLInputElement).checked);
    expect(checked).toHaveLength(2);
    expect(within(editor).getByRole("checkbox", { name: "Rechercher et consulter les restaurants" })).toBeChecked();
    expect(within(editor).getByRole("checkbox", { name: "Consulter les disponibilités" })).toBeChecked();
    expect(within(editor).queryByRole("heading", { name: "Restaurants autorisés" })).not.toBeInTheDocument();
    expect(mutations("set_tok_connect_oauth_grant")).toHaveLength(0);
  });

  it("requires an explicit restaurant before saving a management permission", async () => {
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole("checkbox", { name: TOK_OAUTH_SCOPE_LABELS["restaurant:read"] }));
    expect(within(editor).getByRole("checkbox", { name: "Restaurant propriétaire" })).not.toBeChecked();
    expect(within(editor).queryByRole("checkbox", { name: "Restaurant équipe" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les permissions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sélectionnez au moins un restaurant");
    expect(mutations("set_tok_connect_oauth_grant")).toHaveLength(0);

    fireEvent.click(within(editor).getByRole("checkbox", { name: "Restaurant propriétaire" }));
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les permissions" }));
    await waitFor(() => expect(mutations("set_tok_connect_oauth_grant")).toEqual([[
      "set_tok_connect_oauth_grant",
      { p_client_id: CLIENT_ID, p_client_name: "Application protégée", p_scopes: ["restaurants:read", "availability:read", "restaurant:read"], p_restaurant_ids: [OWNER_RESTAURANT_ID] },
    ]]));
  });

  it("removes a staff restaurant selection when an owner-only permission is enabled", async () => {
    const editor = await openEditor();
    fireEvent.click(within(editor).getByRole("checkbox", { name: TOK_OAUTH_SCOPE_LABELS["credits:read"] }));
    fireEvent.click(within(editor).getByRole("checkbox", { name: "Restaurant équipe" }));
    expect(within(editor).getByRole("checkbox", { name: "Restaurant équipe" })).toBeChecked();

    fireEvent.click(within(editor).getByRole("checkbox", { name: TOK_OAUTH_SCOPE_LABELS["restaurant:generate"] }));
    expect(within(editor).queryByRole("checkbox", { name: "Restaurant équipe" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les permissions" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Sélectionnez au moins un restaurant");
    expect(mutations("set_tok_connect_oauth_grant")).toHaveLength(0);
    fireEvent.click(within(editor).getByRole("checkbox", { name: TOK_OAUTH_SCOPE_LABELS["restaurant:generate"] }));
    expect(within(editor).getByRole("checkbox", { name: "Restaurant équipe" })).not.toBeChecked();
  });

  it("waits for confirmed TOK revocation before using the Auth SDK clientId object", async () => {
    render(<TokOAuthConnections />);
    const revoke = await screen.findByRole("button", { name: "Révoquer l’accès" });
    let finishBusiness!: (result: { data: boolean; error: null }) => void;
    db.rpc.mockImplementationOnce(() => new Promise((resolve) => { finishBusiness = resolve; }));
    fireEvent.click(revoke);

    expect(db.rpc).toHaveBeenLastCalledWith("revoke_tok_connect_oauth_grant", { p_client_id: CLIENT_ID });
    expect(db.revokeGrant).not.toHaveBeenCalled();
    await act(async () => { finishBusiness({ data: true, error: null }); });
    await waitFor(() => expect(db.revokeGrant).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID }));
    expect(await screen.findByText("Les permissions TOK et la connexion d’identité ont été révoquées.")).toBeInTheDocument();
  });

  it("does not claim revocation or call Auth when the TOK revocation failed", async () => {
    render(<TokOAuthConnections />);
    const revoke = await screen.findByRole("button", { name: "Révoquer l’accès" });
    db.rpc.mockResolvedValueOnce({ data: false, error: null });
    fireEvent.click(revoke);

    expect(await screen.findByRole("alert")).toHaveTextContent("La coupure des accès n’est pas confirmée");
    expect(db.revokeGrant).not.toHaveBeenCalled();
    expect(screen.queryByText("Les permissions TOK et la connexion d’identité ont été révoquées.")).not.toBeInTheDocument();
  });

  it("reports the precise partial failure when TOK is revoked but Auth is unavailable", async () => {
    db.revokeGrant.mockResolvedValue({ data: null, error: { message: "Auth unavailable" } });
    render(<TokOAuthConnections />);
    fireEvent.click(await screen.findByRole("button", { name: "Révoquer l’accès" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Les accès métier TOK sont coupés. La connexion d’identité n’a pas encore été révoquée");
    expect(db.revokeGrant).toHaveBeenCalledExactlyOnceWith({ clientId: CLIENT_ID });
    expect(mutations("revoke_tok_connect_oauth_grant")).toEqual([["revoke_tok_connect_oauth_grant", { p_client_id: CLIENT_ID }]]);
  });

  it("clears displayed connections and an open editor when reloading fails", async () => {
    await openEditor();
    expect(screen.getByRole("heading", { name: "Application protégée" })).toBeInTheDocument();
    db.listGrants.mockResolvedValueOnce({ data: null, error: { message: "Refresh failed" } });
    fireEvent.click(screen.getByRole("button", { name: "Actualiser" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Les connexions d’identité ne peuvent pas être chargées");
    expect(await screen.findByText("Aucune connexion chargée.")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Application protégée" })).not.toBeInTheDocument();
    expect(screen.queryByRole("group", { name: "Permissions TOK choisies" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Enregistrer les permissions" })).not.toBeInTheDocument();
  });
});
