import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import CityAutocomplete from "@/components/CityAutocomplete";

const genevaCoordinates = [6.1432, 46.2044];
const parisCoordinates = [2.3522, 48.8566];

describe("AddressAutocomplete location bias", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("biases Photon queries and ranks same-city Swiss suggestions before foreign addresses", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "Rue du Rhône",
              street: "Rue du Rhône",
              housenumber: "1",
              postcode: "75008",
              city: "Paris",
              country: "France",
            },
            geometry: { coordinates: parisCoordinates },
          },
          {
            properties: {
              name: "Rue du Rhône",
              street: "Rue du Rhône",
              housenumber: "8",
              postcode: "1204",
              city: "Genève",
              country: "Suisse",
            },
            geometry: { coordinates: genevaCoordinates },
          },
          {
            properties: {
              name: "Rue du Rhône",
              street: "Rue du Rhône",
              housenumber: "8",
              postcode: "1204",
              city: "Genève",
              country: "Suisse",
            },
            geometry: { coordinates: genevaCoordinates },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AddressAutocomplete
        value=""
        onAddressSelect={vi.fn()}
        placeholder="Adresse"
        preferredCity="Genève"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Adresse"), {
      target: { value: "Rue du Rhône" },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 450));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(requestedUrl.searchParams.get("lat")).toBe("46.2044");
    expect(requestedUrl.searchParams.get("lon")).toBe("6.1432");
    expect(requestedUrl.searchParams.get("limit")).toBe("8");

    const suggestions = await screen.findAllByText(/Rue du Rhône/i);
    expect(suggestions[0].closest("li")).toHaveTextContent("1204 Genève");
    expect(suggestions[0].closest("li")).toHaveTextContent("Suisse");
    expect(suggestions[1].closest("li")).toHaveTextContent("France");
    expect(suggestions).toHaveLength(2);
  });

  it("keeps global city searches global when no location preference is provided", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "Bangkok",
              city: "Bangkok",
              country: "Thailand",
              countrycode: "TH",
            },
            geometry: { coordinates: [100.5018, 13.7563] },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CityAutocomplete
        value=""
        onCitySelect={vi.fn()}
        placeholder="Ville"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Ville"), {
      target: { value: "Bangkok" },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    const requestedUrl = new URL(String(fetchMock.mock.calls[0][0]), "http://localhost");
    expect(requestedUrl.searchParams.get("q")).toBe("Bangkok");
    expect(requestedUrl.searchParams.has("lat")).toBe(false);
    expect(requestedUrl.searchParams.has("lon")).toBe(false);

    expect(await screen.findByText("Bangkok")).toBeInTheDocument();
    expect(screen.getByText(/Thailand/i)).toBeInTheDocument();
  });

  it("prioritizes an explicit foreign query over a nearby location bias", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "Bangkok Restaurant",
              city: "Genève",
              country: "Suisse",
              countrycode: "CH",
            },
            geometry: { coordinates: genevaCoordinates },
          },
          {
            properties: {
              name: "Bangkok",
              city: "Bangkok",
              country: "Thailand",
              countrycode: "TH",
            },
            geometry: { coordinates: [100.5018, 13.7563] },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <AddressAutocomplete
        value=""
        mode="city"
        preferredCity="Genève"
        preferredCountry="Suisse"
        onAddressSelect={vi.fn()}
        placeholder="Destination"
      />,
    );

    fireEvent.change(screen.getByPlaceholderText("Destination"), {
      target: { value: "Bangkok" },
    });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });

    const bangkok = await screen.findByText("Bangkok");
    const suggestions = bangkok.closest("ul")?.querySelectorAll("li");
    expect(suggestions?.[0]).toHaveTextContent("Bangkok");
    expect(suggestions?.[0]).toHaveTextContent("Thailand");
  });

  it("removes stale suggestions as soon as the typed query changes", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        features: [
          {
            properties: {
              name: "Genève",
              city: "Genève",
              country: "Suisse",
              countrycode: "CH",
            },
            geometry: { coordinates: genevaCoordinates },
          },
        ],
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);

    render(
      <CityAutocomplete
        value=""
        onCitySelect={vi.fn()}
        placeholder="Localité"
      />,
    );

    const input = screen.getByPlaceholderText("Localité");
    fireEvent.change(input, { target: { value: "Genève" } });

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 400));
    });
    expect(await screen.findByText("Genève")).toBeInTheDocument();

    fireEvent.change(input, { target: { value: "Bangkok" } });
    expect(screen.queryByText("Genève")).not.toBeInTheDocument();
  });
});
