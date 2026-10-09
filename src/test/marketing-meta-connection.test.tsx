import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import MarketingMetaConnection from "@/components/marketing/MarketingMetaConnection";

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("@/marketing/marketingBffClient", () => ({ MARKETING_BFF_ENDPOINTS: { orchestrator: "/api/marketing/orchestrator" }, marketingBffRequest: request }));
beforeEach(() => { request.mockReset(); });
afterEach(cleanup);

it("checks Meta access on demand and identifies the verified accounts", async () => {
  request.mockResolvedValue({ accounts: ["facebook", "instagram"].map((channel) => ({
    channel, status: "connected", accountName: `TOK ${channel}`, accountId: "123456",
    checkedAt: "2026-10-09T00:00:00Z", reason: null,
  })) });
  render(<MarketingMetaConnection />);
  expect(request).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Vérifier les comptes Meta" }));
  await waitFor(() => expect(screen.getAllByText("Accès en lecture vérifié")).toHaveLength(2));
  expect(request).toHaveBeenCalledWith("/api/marketing/orchestrator", expect.objectContaining({ body: { action: "check_meta" } }));
  expect(screen.getByText(/ne confirme pas les permissions de publication/)).toBeTruthy();
});

it("never displays a successful connection after a failed check", async () => {
  request.mockRejectedValue(new Error("sensitive provider detail"));
  render(<MarketingMetaConnection />);
  fireEvent.click(screen.getByRole("button", { name: "Vérifier les comptes Meta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de vérifier");
  expect(screen.queryByText("Accès en lecture vérifié")).toBeNull();
  expect(screen.queryByText(/sensitive provider detail/)).toBeNull();
});

it("rejects malformed account responses without rendering an unverified identity", async () => {
  request.mockResolvedValue({ accounts: [null, { channel: "instagram" }] });
  render(<MarketingMetaConnection />);
  fireEvent.click(screen.getByRole("button", { name: "Vérifier les comptes Meta" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Impossible de vérifier");
  expect(screen.queryByText("Accès en lecture vérifié")).toBeNull();
});
