import { render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import { AuthProvider } from "@/lib/auth";
import { useAuth } from "@/lib/auth-context";

const signOut = vi.fn();
const getSession = vi.fn();
const onAuthStateChange = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  getSupabase: () => ({
    auth: {
      getSession,
      onAuthStateChange,
      signOut,
    },
  }),
}));

vi.mock("@/lib/monitoring", () => ({
  setMonitoringUser: vi.fn(),
}));

function AuthProbe() {
  const { loading, user } = useAuth();

  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="user">{user?.id || "none"}</span>
    </div>
  );
}

function renderWithQueryClient(ui: ReactNode) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
      },
    },
  });

  return render(
    <QueryClientProvider client={queryClient}>
      {ui}
    </QueryClientProvider>,
  );
}

describe("AuthProvider", () => {
  it("clears a broken local session when the initial Supabase session refresh fails", async () => {
    signOut.mockResolvedValue({ error: null });
    getSession.mockRejectedValue(new Error("Invalid Refresh Token: Refresh Token Not Found"));
    onAuthStateChange.mockReturnValue({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    });

    renderWithQueryClient(
      <AuthProvider>
        <AuthProbe />
      </AuthProvider>,
    );

    await waitFor(() => expect(screen.getByTestId("loading")).toHaveTextContent("false"));

    expect(screen.getByTestId("user")).toHaveTextContent("none");
    expect(signOut).toHaveBeenCalledWith({ scope: "local" });
  });
});
