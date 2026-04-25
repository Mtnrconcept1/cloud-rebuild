import "@testing-library/jest-dom";
import { vi } from "vitest";

vi.stubEnv("VITE_SUPABASE_URL", "https://placeholder.supabase.co");
vi.stubEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.placeholder");

Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => {},
  }),
});

