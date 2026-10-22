import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import RestaurantCardImage from "@/components/RestaurantCardImage";

const PLACEHOLDER = "/images/tok-restaurant-placeholder.svg";

afterEach(cleanup);

describe("restaurant card photo fallback", () => {
  it("tries the same original after a transformed image fails, then stops on the neutral placeholder", () => {
    const original = "https://example.supabase.co/storage/v1/object/public/restaurant-images/terrace.jpg";
    render(<RestaurantCardImage imageUrl={original} name="Chez TOK" className="object-cover" />);
    const image = screen.getByRole("img", { name: "Chez TOK" });

    expect(image).toHaveAttribute("src", expect.stringContaining("/storage/v1/render/image/public/"));
    expect(image).toHaveAttribute("srcset", expect.stringContaining("width=360"));
    expect(image).toHaveAttribute("width", "640");
    expect(image).toHaveAttribute("height", "400");
    expect(image).toHaveAttribute("loading", "lazy");
    expect(image).toHaveClass("object-cover");

    fireEvent.error(image);
    expect(image).toHaveAttribute("src", original);
    expect(image).not.toHaveAttribute("srcset");
    expect(image).not.toHaveAttribute("sizes");
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", PLACEHOLDER);
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", PLACEHOLDER);
  });

  it("does not retry a duplicate source and starts again when the cover changes", () => {
    const original = "https://restaurant.example/terrace.jpg";
    const next = "https://restaurant.example/interior.jpg";
    const { rerender } = render(<RestaurantCardImage imageUrl={original} name="Chez TOK" />);
    const image = screen.getByRole("img", { name: "Chez TOK" });

    expect(image).toHaveAttribute("src", original);
    fireEvent.error(image);
    expect(image).toHaveAttribute("src", PLACEHOLDER);
    rerender(<RestaurantCardImage imageUrl={next} name="Chez TOK" />);
    expect(screen.getByRole("img", { name: "Chez TOK" })).toHaveAttribute("src", next);
  });

  it("uses a non-empty neutral image for missing, blocked and insecure URLs", () => {
    const { rerender } = render(<RestaurantCardImage imageUrl="" name="Chez TOK" />);
    for (const url of ["", "javascript:alert(1)", "http://restaurant.example/photo.jpg"]) {
      rerender(<RestaurantCardImage imageUrl={url} name="Chez TOK" />);
      const image = screen.getByRole("img", { name: "Chez TOK" });
      expect(image).toHaveAttribute("src", PLACEHOLDER);
      expect(image).not.toHaveAttribute("srcset");
    }
  });
});
