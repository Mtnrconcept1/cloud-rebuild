import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import ThemeToggleButton from "@/components/theme/ThemeToggleButton";

const root = process.cwd();

function read(path: string) {
  return readFileSync(resolve(root, path), "utf8");
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("mobile theme toggle", () => {
  it("toggles the html dark class and persists the selected theme", () => {
    render(<ThemeToggleButton />);

    const button = screen.getByRole("button", { name: "Mode sombre" });

    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Mode clair");
    expect(button).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(localStorage.getItem("theme")).toBe("dark");

    fireEvent.click(button);
    expect(document.documentElement.classList.contains("dark")).toBe(false);
    expect(localStorage.getItem("theme")).toBe("light");
    expect(button).toHaveAccessibleName("Mode sombre");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("reads initial dark state and synchronizes external class changes", async () => {
    document.documentElement.classList.add("dark");
    render(<ThemeToggleButton />);
    const button = screen.getByRole("button", { name: "Mode clair" });
    expect(button).toHaveAttribute("aria-pressed", "true");
    await act(async () => { document.documentElement.classList.remove("dark"); });
    expect(button).toHaveAccessibleName("Mode sombre");
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("preserves a custom accessible label and mouse handler", () => {
    const onMouseDown = vi.fn();
    render(<ThemeToggleButton aria-label="Changer le thème" onMouseDown={onMouseDown} />);
    const button = screen.getByRole("button", { name: "Changer le thème" });
    fireEvent.mouseDown(button);
    expect(onMouseDown).toHaveBeenCalledOnce();
    fireEvent.click(button);
    expect(button).toHaveAccessibleName("Changer le thème");
    expect(button).toHaveAttribute("aria-pressed", "true");
  });

  it("is mounted in every mobile-facing shell header", () => {
    const navbar = read("src/components/Navbar.tsx");
    const dashboard = read("src/components/DashboardLayout.tsx");
    const courier = read("src/components/CourierDashboardLayout.tsx");
    const app = read("src/App.tsx");

    expect(navbar).toContain("ThemeToggleButton");
    expect(navbar).toContain('aria-label="Mode sombre"');
    expect(navbar).not.toContain('"hidden lg:inline-flex" : ""} text-muted-foreground');
    expect(dashboard).toContain("ThemeToggleButton");
    expect(courier).toContain("ThemeToggleButton");
    expect(app).toContain("ThemeToggleButton");
    expect(app).toContain("AdminRouteFrame");
  });
});
