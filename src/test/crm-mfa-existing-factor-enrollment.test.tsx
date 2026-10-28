import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

const mockMfa = vi.hoisted(() => ({
  getAuthenticatorAssuranceLevel: vi.fn(),
  listFactors: vi.fn(),
  challenge: vi.fn(),
  verify: vi.fn(),
  enroll: vi.fn(),
  unenroll: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
  invoke: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      mfa: {
        getAuthenticatorAssuranceLevel: mockMfa.getAuthenticatorAssuranceLevel,
        listFactors: mockMfa.listFactors,
        challenge: mockMfa.challenge,
        verify: mockMfa.verify,
        enroll: mockMfa.enroll,
        unenroll: mockMfa.unenroll,
      },
      refreshSession: mockMfa.refreshSession,
      signOut: mockMfa.signOut,
    },
    functions: { invoke: mockMfa.invoke },
  }),
}));
vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({ toast: mockMfa.toast }),
}));

import CrmAccessGuard from "@/components/crm/CrmAccessGuard";

const MARKETING_FACTOR = {
  id: "marketing-factor",
  factor_type: "totp",
  status: "verified",
  friendly_name: "TheTOK Marketing",
};
const EMPTY_FACTORS = { data: { all: [], totp: [] }, error: null };
const MARKETING_FACTORS = {
  data: { all: [MARKETING_FACTOR], totp: [MARKETING_FACTOR] },
  error: null,
};

function mountGuard() {
  render(
    <MemoryRouter>
      <CrmAccessGuard surface="admin" requiresElite={false}>
        <div>CRM protégé disponible</div>
      </CrmAccessGuard>
    </MemoryRouter>,
  );
}

describe("TOK CRM MFA enrollment when a separate account factor exists", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mockMfa.challenge.mockResolvedValue({ data: { id: "challenge-id" }, error: null });
    mockMfa.verify.mockResolvedValue({ data: {}, error: null });
    mockMfa.refreshSession.mockResolvedValue({ error: null });
    mockMfa.enroll.mockResolvedValue({
      data: { id: "new-crm-factor", totp: { qr_code: "<svg></svg>", secret: "new-secret" } },
      error: null,
    });
    mockMfa.unenroll.mockResolvedValue({ error: null });
  });

  it("requires a valid Marketing TOTP challenge at AAL1 before allowing CRM enrollment", async () => {
    mockMfa.getAuthenticatorAssuranceLevel
      .mockResolvedValueOnce({ data: { currentLevel: "aal1", nextLevel: "aal2" }, error: null })
      .mockResolvedValue({ data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null });
    mockMfa.listFactors.mockResolvedValue(MARKETING_FACTORS);
    mountGuard();

    expect(await screen.findByText(/Saisissez le code à 6 chiffres de TheTOK Marketing/)).toBeInTheDocument();
    expect(mockMfa.challenge).toHaveBeenCalledWith({ factorId: MARKETING_FACTOR.id });
    expect(mockMfa.enroll).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /Je n'ai plus accès/ })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Code à 6 chiffres/), { target: { value: "123456" } });
    fireEvent.click(screen.getByRole("button", { name: "Valider" }));
    await waitFor(() => expect(mockMfa.verify).toHaveBeenCalledWith({
      factorId: MARKETING_FACTOR.id,
      challengeId: "challenge-id",
      code: "123456",
    }));
    expect(await screen.findByText("CRM protégé disponible")).toBeInTheDocument();
    expect(mockMfa.enroll).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Créer le QR code CRM" }));
    await waitFor(() => expect(mockMfa.enroll).toHaveBeenCalledWith({
      factorType: "totp",
      friendlyName: "TOK CRM",
    }));
    expect(mockMfa.unenroll).not.toHaveBeenCalled();
  });

  it("lets an already AAL2 session add a CRM factor without re-challenging Marketing", async () => {
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal2", nextLevel: "aal2" }, error: null,
    });
    mockMfa.listFactors.mockResolvedValue(MARKETING_FACTORS);
    mountGuard();

    expect(await screen.findByText("CRM protégé disponible")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Créer le QR code CRM" }));
    await waitFor(() => expect(mockMfa.enroll).toHaveBeenCalledOnce());
    expect(mockMfa.challenge).toHaveBeenCalledWith({ factorId: "new-crm-factor" });
    expect(mockMfa.unenroll).not.toHaveBeenCalled();
  });

  it("keeps first-time enrollment available when no verified account factor exists", async () => {
    mockMfa.getAuthenticatorAssuranceLevel.mockResolvedValue({
      data: { currentLevel: "aal1", nextLevel: "aal1" }, error: null,
    });
    mockMfa.listFactors.mockResolvedValue(EMPTY_FACTORS);
    mountGuard();

    fireEvent.click(await screen.findByRole("button", { name: "Générer un QR code" }));
    await waitFor(() => expect(mockMfa.enroll).toHaveBeenCalledOnce());
    expect(mockMfa.verify).not.toHaveBeenCalled();
  });
});
