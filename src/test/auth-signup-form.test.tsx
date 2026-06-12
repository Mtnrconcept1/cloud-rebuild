import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

import Auth from "@/pages/Auth";

const supabaseMocks = vi.hoisted(() => ({
  resend: vi.fn(),
  resetPasswordForEmail: vi.fn(),
  rpc: vi.fn(),
  signInWithOAuth: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
  upload: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      resend: supabaseMocks.resend,
      resetPasswordForEmail: supabaseMocks.resetPasswordForEmail,
      signInWithOAuth: supabaseMocks.signInWithOAuth,
      signInWithPassword: supabaseMocks.signInWithPassword,
      signOut: supabaseMocks.signOut,
      signUp: supabaseMocks.signUp,
    },
    rpc: supabaseMocks.rpc,
    storage: {
      from: () => ({
        upload: supabaseMocks.upload,
      }),
    },
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => ({
    roles: [],
    switchRole: vi.fn(),
    user: null,
  }),
}));

const toastMock = vi.hoisted(() => vi.fn());

vi.mock("@/hooks/use-toast", () => ({
  useToast: () => ({
    toast: toastMock,
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
    supabaseMocks.resend.mockResolvedValue({ error: null });
    supabaseMocks.rpc.mockResolvedValue({ data: null, error: null });
    supabaseMocks.signOut.mockResolvedValue({ error: null });
    supabaseMocks.upload.mockResolvedValue({
      data: { path: "doc.pdf" },
      error: null,
    });
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: null,
        user: { id: "new-user-id" },
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

  it("submits client signup with the confirmation redirect and does not auto-login without a session", async () => {
    renderAuth("/auth?type=client");

    fireEvent.click(screen.getByRole("button", { name: "Pas encore de compte ? S'inscrire" }));
    fireEvent.change(screen.getByLabelText("Nom complet"), { target: { value: "Client Test" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Créer mon compte" }));

    await waitFor(() => {
      expect(supabaseMocks.signUp).toHaveBeenCalledWith(
        expect.objectContaining({
          email: "client@example.com",
          password: "secret123",
          options: expect.objectContaining({
            emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
          }),
        }),
      );
    });

    expect(supabaseMocks.signInWithPassword).not.toHaveBeenCalled();
    expect(toastMock).toHaveBeenCalledWith({
      title: "Compte créé",
      description: "Compte créé. Vérifiez votre email pour confirmer votre compte.",
    });
  });

  it("logs out a restaurateur signup session after submitting the verification dossier", async () => {
    supabaseMocks.signUp.mockResolvedValue({
      data: {
        session: { access_token: "signup-session" },
        user: { id: "restaurant-user-id" },
      },
      error: null,
    });

    const { container } = renderAuth("/auth?type=restaurateur");

    fireEvent.change(screen.getByLabelText("Nom du responsable"), {
      target: { value: "Restaurateur Test" },
    });
    fireEvent.change(screen.getByLabelText("Email"), {
      target: { value: "restaurant@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Mot de passe"), {
      target: { value: "secret123" },
    });
    fireEvent.change(screen.getByLabelText("Téléphone"), {
      target: { value: "+41790000000" },
    });
    fireEvent.change(screen.getByLabelText("Ville"), {
      target: { value: "Genève" },
    });
    fireEvent.change(screen.getByLabelText("Adresse"), {
      target: { value: "Rue du Rhône 1" },
    });
    fireEvent.change(screen.getByLabelText("Nom commercial"), {
      target: { value: "Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("Raison sociale"), {
      target: { value: "Table Tok Sàrl" },
    });
    fireEvent.change(screen.getByLabelText("Numéro d'immatriculation"), {
      target: { value: "CHE-123.456.789" },
    });
    fireEvent.change(screen.getByLabelText("Nom du restaurant"), {
      target: { value: "La Table Tok" },
    });
    fireEvent.change(screen.getByLabelText("IBAN de versement"), {
      target: { value: "CH9300762011623852957" },
    });

    const documentFile = new File(["document"], "document.pdf", {
      type: "application/pdf",
    });
    const fileInputs = Array.from(
      container.querySelectorAll<HTMLInputElement>('input[type="file"]'),
    );
    expect(fileInputs).toHaveLength(3);
    for (const input of fileInputs) {
      fireEvent.change(input, { target: { files: [documentFile] } });
    }

    fireEvent.click(
      screen.getByRole("button", { name: "Envoyer mon inscription vérifiée" }),
    );

    await waitFor(() => {
      expect(supabaseMocks.rpc).toHaveBeenCalledWith(
        "sync_signup_application",
        expect.objectContaining({
          p_requested_role: "restaurateur",
          p_restaurant_name: "La Table Tok",
        }),
      );
    });

    expect(supabaseMocks.signOut).toHaveBeenCalledTimes(1);
    expect(toastMock).toHaveBeenCalledWith(
      expect.objectContaining({
        title: "Inscription enregistrée",
        description: expect.stringContaining("après validation"),
      }),
    );
  });

  it("lets users resend the signup confirmation email", async () => {
    renderAuth("/auth?type=client");

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "client@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Renvoyer l’email de confirmation" }));

    await waitFor(() => {
      expect(supabaseMocks.resend).toHaveBeenCalledWith({
        type: "signup",
        email: "client@example.com",
        options: {
          emailRedirectTo: `${window.location.origin}/auth?confirmed=1`,
        },
      });
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
