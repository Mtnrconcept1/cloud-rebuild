import { useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { cn } from "@/lib/utils";
import { normalizePublicImageUrl } from "@/lib/securityUrls";

interface Restaurant {
  id: string;
  name: string;
  cuisine_type?: string | null;
  rating?: number | null;
  city?: string | null;
  address?: string | null;
  image_url?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  _offerTypes?: string[];
}

interface NearbyRestaurantsMapProps {
  restaurants: Restaurant[];
  centerLat?: number;
  centerLng?: number;
  selectedRestaurantId?: string | null;
  onRestaurantSelect?: (restaurantId: string) => void;
  className?: string;
}

type MarkerTone = "promotion" | "flash" | "anti_waste" | "tok_dor" | "restaurant";

const MARKER_STYLES: Record<MarkerTone, { background: string; symbol: string; label: string }> = {
  promotion: { background: "#dc2626", symbol: "%", label: "Promotion" },
  flash: { background: "#ea580c", symbol: "⚡", label: "Vente flash" },
  anti_waste: { background: "#059669", symbol: "●", label: "Anti-gaspi" },
  tok_dor: { background: "#d79b08", symbol: "♛", label: "Tok d’Or" },
  restaurant: { background: "#f15d22", symbol: "●", label: "Restaurant" },
};

function getMarkerTone(restaurant: Restaurant): MarkerTone {
  const offerTypes = Array.isArray(restaurant._offerTypes) ? restaurant._offerTypes : [];
  if (offerTypes.includes("flash")) return "flash";
  if (offerTypes.includes("anti_waste")) return "anti_waste";
  if (offerTypes.includes("tok_dor")) return "tok_dor";
  if (offerTypes.includes("promotion")) return "promotion";
  return "restaurant";
}

function restaurantIcon(restaurant: Restaurant, selected: boolean) {
  const style = MARKER_STYLES[getMarkerTone(restaurant)];
  const size = selected ? 46 : 40;
  const borderWidth = selected ? 4 : 3;
  return L.divIcon({
    html: `<div aria-hidden="true" style="background:${style.background};width:${size}px;height:${size}px;border-radius:50% 50% 50% 12%;transform:rotate(-45deg);display:flex;align-items:center;justify-content:center;border:${borderWidth}px solid white;box-shadow:0 8px 22px rgba(15,23,42,0.28);color:white;font:800 ${selected ? 20 : 17}px/1 system-ui"><span style="transform:rotate(45deg)">${style.symbol}</span></div>`,
    className: "",
    iconSize: [size, size],
    iconAnchor: [size / 2, size],
    popupAnchor: [0, -size + 4],
  });
}

const userIcon = L.divIcon({
  html: '<div aria-hidden="true" style="background:#2563eb;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(37,99,235,.3),0 2px 8px rgba(0,0,0,.3)"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

function validCoordinates(restaurant: Restaurant): [number, number] | null {
  if (typeof restaurant.latitude !== "number" || typeof restaurant.longitude !== "number") {
    return null;
  }

  const latitude = Number(restaurant.latitude);
  const longitude = Number(restaurant.longitude);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) return null;
  return [latitude, longitude];
}

function createRestaurantPopup(restaurant: Restaurant, onNavigate: () => void) {
  const root = document.createElement("article");
  root.style.width = "220px";
  root.style.maxWidth = "calc(100vw - 64px)";
  root.style.fontFamily = "system-ui, sans-serif";
  root.style.overflow = "hidden";
  root.style.borderRadius = "16px";

  const imageWrap = document.createElement("div");
  imageWrap.style.height = "112px";
  imageWrap.style.width = "100%";
  imageWrap.style.overflow = "hidden";
  imageWrap.style.background = "#f3f4f6";

  const image = document.createElement("img");
  image.src = normalizePublicImageUrl(restaurant.image_url);
  image.alt = "";
  image.referrerPolicy = "no-referrer";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  image.addEventListener("error", () => {
    image.src = "/images/tok-restaurant-placeholder.svg";
  }, { once: true });
  imageWrap.appendChild(image);

  const body = document.createElement("div");
  body.style.padding = "12px";

  const name = document.createElement("strong");
  name.style.fontSize = "15px";
  name.style.display = "block";
  name.style.marginBottom = "3px";
  name.textContent = restaurant.name || "Restaurant";
  body.appendChild(name);

  const detail = document.createElement("p");
  detail.style.color = "#64748b";
  detail.style.fontSize = "12px";
  detail.style.margin = "0";
  detail.textContent = [restaurant.cuisine_type, restaurant.city].filter(Boolean).join(" · ");
  body.appendChild(detail);

  if (Number(restaurant.rating) > 0) {
    const rating = document.createElement("p");
    rating.style.color = "#b45309";
    rating.style.fontSize = "12px";
    rating.style.fontWeight = "700";
    rating.style.margin = "6px 0 0";
    rating.textContent = `★ ${Number(restaurant.rating).toFixed(1)}/10`;
    body.appendChild(rating);
  }

  const cta = document.createElement("button");
  cta.type = "button";
  cta.style.width = "100%";
  cta.style.minHeight = "40px";
  cta.style.marginTop = "10px";
  cta.style.border = "0";
  cta.style.borderRadius = "999px";
  cta.style.background = "#ea580c";
  cta.style.color = "white";
  cta.style.cursor = "pointer";
  cta.style.fontSize = "12px";
  cta.style.fontWeight = "800";
  cta.textContent = "Voir le restaurant →";
  cta.addEventListener("click", onNavigate);
  body.appendChild(cta);

  root.append(imageWrap, body);
  return root;
}

export default function NearbyRestaurantsMap({
  restaurants,
  centerLat,
  centerLng,
  selectedRestaurantId,
  onRestaurantSelect,
  className,
}: NearbyRestaurantsMapProps) {
  const navigate = useNavigate();
  const navigateRef = useRef(navigate);
  const onRestaurantSelectRef = useRef(onRestaurantSelect);
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const markersLayer = useRef<L.LayerGroup | null>(null);
  const markersByRestaurant = useRef(new Map<string, L.Marker>());

  const locatedCount = useMemo(
    () => restaurants.reduce((count, restaurant) => count + (validCoordinates(restaurant) ? 1 : 0), 0),
    [restaurants],
  );

  useEffect(() => {
    navigateRef.current = navigate;
  }, [navigate]);

  useEffect(() => {
    onRestaurantSelectRef.current = onRestaurantSelect;
  }, [onRestaurantSelect]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const hasUserLocation = Number.isFinite(centerLat) && Number.isFinite(centerLng);
    const mapCenter: [number, number] = hasUserLocation
      ? [Number(centerLat), Number(centerLng)]
      : [46.2044, 6.1432];
    const map = L.map(mapRef.current, {
      scrollWheelZoom: false,
      zoomControl: true,
    }).setView(mapCenter, 13);

    L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      referrerPolicy: "strict-origin",
      maxZoom: 19,
    }).addTo(map);

    if (hasUserLocation) {
      L.marker(mapCenter, { icon: userIcon, keyboard: true, title: "Votre position" })
        .addTo(map)
        .bindPopup("Votre position");
    }

    markersLayer.current = L.layerGroup().addTo(map);
    mapInstance.current = map;
    const markerRegistry = markersByRestaurant.current;

    const invalidateMapSize = () => map.invalidateSize({ pan: false });
    const frame = requestAnimationFrame(invalidateMapSize);
    const resizeObserver = typeof ResizeObserver === "undefined"
      ? null
      : new ResizeObserver(invalidateMapSize);
    resizeObserver?.observe(mapRef.current);

    return () => {
      cancelAnimationFrame(frame);
      resizeObserver?.disconnect();
      markerRegistry.clear();
      markersLayer.current = null;
      map.remove();
      mapInstance.current = null;
    };
  }, [centerLat, centerLng]);

  useEffect(() => {
    const map = mapInstance.current;
    const layer = markersLayer.current;
    if (!map || !layer) return;

    layer.clearLayers();
    markersByRestaurant.current.clear();
    const bounds = L.latLngBounds([]);

    restaurants.forEach((restaurant) => {
      const coordinates = validCoordinates(restaurant);
      if (!coordinates) return;
      const restaurantId = String(restaurant.id);
      const tone = MARKER_STYLES[getMarkerTone(restaurant)];
      const marker = L.marker(coordinates, {
        icon: restaurantIcon(restaurant, false),
        keyboard: true,
        title: `${restaurant.name} · ${tone.label}`,
        alt: restaurant.name,
        riseOnHover: true,
      })
        .addTo(layer)
        .bindPopup(
          createRestaurantPopup(restaurant, () => navigateRef.current(`/restaurant/${restaurantId}`)),
          { closeButton: true, className: "restaurant-popup", maxWidth: 240 },
        );

      marker.on("click", () => onRestaurantSelectRef.current?.(restaurantId));
      marker.on("mouseover", () => marker.openPopup());
      markersByRestaurant.current.set(restaurantId, marker);
      bounds.extend(coordinates);
    });

    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [38, 38], maxZoom: 15 });
    }
  }, [restaurants]);

  useEffect(() => {
    const map = mapInstance.current;
    if (!map) return;

    restaurants.forEach((restaurant) => {
      const restaurantId = String(restaurant.id);
      const marker = markersByRestaurant.current.get(restaurantId);
      marker?.setIcon(restaurantIcon(restaurant, restaurantId === selectedRestaurantId));
    });

    if (!selectedRestaurantId) return;
    const selectedMarker = markersByRestaurant.current.get(selectedRestaurantId);
    if (!selectedMarker) return;
    map.panTo(selectedMarker.getLatLng(), { animate: true, duration: 0.25 });
    selectedMarker.openPopup();
  }, [restaurants, selectedRestaurantId]);

  return (
    <div className={cn("relative overflow-hidden bg-muted", className)}>
      <div
        ref={mapRef}
        role="region"
        aria-label={`Carte interactive, ${locatedCount} restaurant${locatedCount > 1 ? "s" : ""} géolocalisé${locatedCount > 1 ? "s" : ""}`}
        className="h-full w-full"
        style={{ zIndex: 0 }}
      />
      <div className="pointer-events-none absolute left-3 top-3 z-[500] rounded-full border border-white/70 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-soft backdrop-blur dark:border-white/10 dark:bg-slate-950/90 dark:text-white">
        {locatedCount > 0
          ? `${locatedCount} adresse${locatedCount > 1 ? "s" : ""} sur la carte`
          : "Aucune adresse géolocalisée"}
      </div>
    </div>
  );
}
