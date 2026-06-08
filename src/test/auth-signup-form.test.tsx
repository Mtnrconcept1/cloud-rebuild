import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Auth from "@/pages/Auth";

const supabaseMocks = vi.hoisted(() => ({
  resetPasswordForEmail: vi.fn(),
  rpc: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      signInWithOAuth: supabaseMocks.signInWithOAuth,
      signInWithPassword: supabaseMocks.signInWithPassword,
      signUp: supabaseMocks.signUp,
    },
    rpc: supabaseMocks.rpc,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    roles: [],
    switchRole: vi.fn(),
    user: null,
  }),
}));

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

vi.mock("@/components/AddressAutocomplete", () => ({
  default: ({
    id,
    value,
    onValueChange,
    placeholder,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

vi.mock("@/components/CityAutocomplete", () => ({
  default: ({
    id,
    value,
    onValueChange,
    placeholder,
  }: {
    id: string;
    value: string;
    onValueChange: (value: string) => void;
    placeholder?: string;
  }) => (
    <input
      id={id}
      value={value}
      onChange={(event) => onValueChange(event.target.value)}
      placeholder={placeholder}
    />
  ),
}));

function renderAuth(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <Routes>
        <Route path="/auth" element={<Auth />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("Auth signup form", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: null,
    });
    supabaseMocks.signInWithPassword.mockResolvedValue({
      data: {
        session: null,
        user: null,
      },
      error: new Error("Email not confirmed"),
    });
  });

  it("lets a client enter an email when switching to signup", () => {
    renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "client@example.com" } });

    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveValue("client@example.com");
  });

  it("lets sign in users reveal and hide the password before submitting", () => {
    renderAuth("/auth?type=client");

    const passwordInput = screen.getByLabelText("Mot de passe");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(supabaseMocks.signInWithPassword).not.toHaveBeenCalled();
  });

  it("lets signup users reveal and hide the password before submitting", () => {
    renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));

    const passwordInput = screen.getByLabelText("Mot de passe");
    expect(passwordInput).toHaveAttribute("type", "password");

    fireEvent.click(screen.getByRole("button", { name: "Afficher le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "text");

    fireEvent.click(screen.getByRole("button", { name: "Masquer le mot de passe" }));
    expect(passwordInput).toHaveAttribute("type", "password");
    expect(supabaseMocks.signUp).not.toHaveBeenCalled();
  });

  it("submits client signup with the typed email", async () => {
    renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Client Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), { target: { value: "secret123" } });
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => {
      expect(supabaseMocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "client@example.com",
          password: "secret123",
        }),
      );
    });
  });

  it("keeps the restaurateur signup email field editable", () => {
    renderAuth("/auth?type=restaurateur");

    const emailInput = screen.getByLabelText("Email");
    fireEvent.change(emailInput, { target: { value: "restaurant@example.com" } });

    expect(screen.getByRole("heading", { name: "Créer un compte vérifié" })).toBeInTheDocument();
    expect(emailInput).toHaveAttribute("type", "email");
    expect(emailInput).toHaveValue("restaurant@example.com");
  });
});
