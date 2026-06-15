import { act, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SupportChat from "@/components/SupportChat";
import TokAiSupportChat from "@/components/support/TokAiSupportChat";

const authMock = vi.hoisted(() => ({
  state: {
    user: null as { id: string } | null,
    session: null,
    loading: false,
    role: null,
    roles: [],
    isSuperAdmin: false,
    canSwitchRole: false,
    switchRole: vi.fn(),
    signOut: vi.fn(),
  },
}));

const aiClientMock = vi.hoisted(() => ({
  askClientSupport: vi.fn(),
  getClientSupportConversations: vi.fn(),
  getClientSupportConversationMessages: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authMock.state,
}));

vi.mock("@/lib/ai/tokAiClient", () => ({
  askClientSupport: aiClientMock.askClientSupport,
  getClientSupportConversations: aiClientMock.getClientSupportConversations,
  getClientSupportConversationMessages: aiClientMock.getClientSupportConversationMessages,
}));

function renderWithRouter(ui: React.ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

describe("support chat auth gate", () => {
  beforeEach(() => {
    authMock.state.user = null;
    authMock.state.session = null;
    authMock.state.loading = false;
    vi.clearAllMocks();
  });

  afterEach(() => {
    window.openChat = undefined;
  });

  it("opens the global chat as unavailable for anonymous users", () => {
    renderWithRouter(<SupportChat />);

    act(() => {
      window.openChat?.({ surface: "courier" });
    });

    expect(screen.getAllByText("Chat indisponible").length).toBeGreaterThan(0);
    expect(screen.getByText(/Connectez-vous pour utiliser le chat support TOK/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Se connecter/i })).toHaveAttribute("href", "/auth");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(aiClientMock.askClientSupport).not.toHaveBeenCalled();
  });

  it("renders embedded support chat as unavailable for anonymous users", () => {
    renderWithRouter(<TokAiSupportChat context={{ page: "aide" }} compact />);

    expect(screen.getAllByText("Chat indisponible").length).toBeGreaterThan(0);
    expect(screen.getByText(/Connectez-vous pour accéder au support IA TOK/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Envoyer au support IA/i })).not.toBeInTheDocument();
    expect(aiClientMock.askClientSupport).not.toHaveBeenCalled();
  });

  it("keeps the embedded support chat form available for authenticated users", () => {
    authMock.state.user = { id: "user-1" };

    renderWithRouter(<TokAiSupportChat context={{ page: "aide" }} compact />);

    expect(screen.getByRole("textbox")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Envoyer au support IA/i })).toBeDisabled();
  });
});
