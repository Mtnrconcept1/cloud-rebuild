import { useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { normalizePublicImageUrl } from "@/lib/securityUrls";

interface Restaurant {
  id: string;
  name: string;
  cuisine_type?: string | null;
  rating?: number | null;
  city?: string | null;
  address?: string | null;
  image_url?: string | null;
}

interface NearbyRestaurantsMapProps {
  restaurants: Restaurant[];
  centerLat?: number;
  centerLng?: number;
}

const restaurantIcon = (emoji: string) =>
  L.divIcon({
    html: `<div style="background:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid hsl(24,95%,53%);box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:18px;">${emoji}</div>`,
    className: "",
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const userIcon = L.divIcon({
  html: '<div style="background:hsl(24,95%,53%);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px hsl(24,95%,53%),0 2px 8px rgba(0,0,0,0.3);"></div>',
  className: "",
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const cuisineEmoji: Record<string, string> = {
  italien: "\u{1F355}",
  pizza: "\u{1F355}",
  japonais: "\u{1F363}",
  sushi: "\u{1F363}",
  burger: "\u{1F354}",
  hamburger: "\u{1F354}",
  francais: "\u{1F950}",
  chinois: "\u{1F961}",
  mexicain: "\u{1F32E}",
  indien: "\u{1F35B}",
  thai: "\u{1F35C}",
  kebab: "\u{1F959}",
  cafe: "\u2615",
  dessert: "\u{1F370}",
  halal: "\u{1F356}",
};

function normalizeCuisine(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function getEmoji(cuisine?: string | null): string {
  if (!cuisine) return "\u{1F37D}\uFE0F";
  const lower = normalizeCuisine(cuisine);
  for (const [key, emoji] of Object.entries(cuisineEmoji)) {
    if (lower.includes(key)) return emoji;
  }
  return "\u{1F37D}\uFE0F";
}

function pseudoRandomOffset(name: string, index: number): [number, number] {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((hash % 100) / 100) * 0.03 - 0.015;
  const lngOffset = (((hash >> 8) % 100) / 100) * 0.03 - 0.015;
  const angle = (index * 137.5 * Math.PI) / 180;
  const radius = 0.003 + index * 0.001;
  return [latOffset + Math.cos(angle) * radius, lngOffset + Math.sin(angle) * radius];
}

function createRestaurantPopup(restaurant: Restaurant) {
  const root = document.createElement("div");
  root.style.minWidth = "180px";
  root.style.fontFamily = "sans-serif";
  root.style.overflow = "hidden";
  root.style.borderRadius = "8px";

  const imageWrap = document.createElement("div");
  imageWrap.style.height = "100px";
  imageWrap.style.width = "100%";
  imageWrap.style.overflow = "hidden";
  imageWrap.style.background = "#f3f4f6";

  const image = document.createElement("img");
  image.src = normalizePublicImageUrl(restaurant.image_url);
  image.alt = restaurant.name || "Restaurant";
  image.referrerPolicy = "no-referrer";
  image.style.width = "100%";
  image.style.height = "100%";
  image.style.objectFit = "cover";
  imageWrap.appendChild(image);

  const body = document.createElement("div");
  body.style.padding = "10px";

  const name = document.createElement("strong");
  name.style.fontSize = "14px";
  name.style.display = "block";
  name.style.marginBottom = "2px";
  name.textContent = restaurant.name || "Restaurant";
  body.appendChild(name);

  const cuisine = document.createElement("div");
  cuisine.style.color = "#666";
  cuisine.style.fontSize = "12px";
  cuisine.style.marginBottom = "4px";
  cuisine.textContent = restaurant.cuisine_type || "";
  body.appendChild(cuisine);

  if (restaurant.rating) {
    const rating = document.createElement("div");
    rating.style.color = "#f59e0b";
    rating.style.fontSize = "12px";
    rating.style.fontWeight = "bold";
    rating.textContent = `\u2B50 ${Number(restaurant.rating).toFixed(1)}`;
    body.appendChild(rating);
  }

  const cta = document.createElement("div");
  cta.style.marginTop = "8px";
  cta.style.fontSize = "11px";
  cta.style.color = "hsl(24,95%,53%)";
  cta.style.fontWeight = "bold";
  cta.textContent = "Cliquer pour voir";
  body.appendChild(cta);

  root.append(imageWrap, body);
  return root;
}

export default function NearbyRestaurantsMap({
  restaurants,
  centerLat = 46.2044,
  centerLng = 6.1432,
}: NearbyRestaurantsMapProps) {
  const navigate = useNavigate();
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const map = L.map(mapRef.current, {
      scrollWheelZoom: true,
    }).setView([centerLat, centerLng], 14);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    L.marker([centerLat, centerLng], { icon: userIcon }).addTo(map).bindPopup("Votre position");

    const bounds = L.latLngBounds([[centerLat, centerLng]]);

    restaurants.forEach((restaurant, index) => {
      const emoji = getEmoji(restaurant.cuisine_type);
      const [latOff, lngOff] = pseudoRandomOffset(restaurant.name, index);
      const lat = centerLat + latOff;
      const lng = centerLng + lngOff;

      const marker = L.marker([lat, lng], { icon: restaurantIcon(emoji) })
        .addTo(map)
        .bindPopup(createRestaurantPopup(restaurant), {
          closeButton: false,
          className: "restaurant-popup",
        });

      marker.on("mouseover", function () {
        this.openPopup();
      });

      marker.on("mouseout", function () {
        this.closePopup();
      });

      marker.on("click", () => {
        navigate(`/restaurant/${restaurant.id}`);
      });

      bounds.extend([lat, lng]);
    });

    if (restaurants.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });

    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
    };
  }, [restaurants, centerLat, centerLng, navigate]);

  return (
    <div
      ref={mapRef}
      className="w-full h-72 md:h-96 rounded-2xl overflow-hidden border shadow-sm"
      style={{ zIndex: 0 }}
    />
  );
}
