import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface Restaurant { id: string; name: string; cuisine_type?: string | null; rating?: number | null; city?: string | null; address?: string | null; }
interface NearbyRestaurantsMapProps { restaurants: Restaurant[]; centerLat?: number; centerLng?: number; }

const restaurantIcon = (emoji: string) => L.divIcon({ html: `<div style="background:white;width:36px;height:36px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid hsl(24,95%,53%);box-shadow:0 2px 8px rgba(0,0,0,0.15);font-size:18px;">${emoji}</div>`, className: "", iconSize: [36, 36], iconAnchor: [18, 18] });
const userIcon = L.divIcon({ html: `<div style="background:hsl(24,95%,53%);width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 2px hsl(24,95%,53%),0 2px 8px rgba(0,0,0,0.3);"></div>`, className: "", iconSize: [16, 16], iconAnchor: [8, 8] });

const cuisineEmoji: Record<string, string> = { italien: "🍕", pizza: "🍕", japonais: "🍣", sushi: "🍣", burger: "🍔", hamburger: "🍔", français: "🥐", chinois: "🥡", mexicain: "🌮", indien: "🍛", thaï: "🍜", kebab: "🥙", café: "☕", dessert: "🍰", halal: "🍖" };
function getEmoji(cuisine?: string | null): string { if (!cuisine) return "🍽️"; const lower = cuisine.toLowerCase(); for (const [key, emoji] of Object.entries(cuisineEmoji)) { if (lower.includes(key)) return emoji; } return "🍽️"; }

function pseudoRandomOffset(name: string, index: number): [number, number] {
  let hash = 0; for (let i = 0; i < name.length; i++) { hash = (hash << 5) - hash + name.charCodeAt(i); hash |= 0; }
  const latOffset = ((hash % 100) / 100) * 0.03 - 0.015; const lngOffset = (((hash >> 8) % 100) / 100) * 0.03 - 0.015;
  const angle = (index * 137.5 * Math.PI) / 180; const radius = 0.003 + (index * 0.001);
  return [latOffset + Math.cos(angle) * radius, lngOffset + Math.sin(angle) * radius];
}

export default function NearbyRestaurantsMap({ restaurants, centerLat = 46.2044, centerLng = 6.1432 }: NearbyRestaurantsMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current, { scrollWheelZoom: false }).setView([centerLat, centerLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    L.marker([centerLat, centerLng], { icon: userIcon }).addTo(map).bindPopup("Votre position");
    const bounds = L.latLngBounds([[centerLat, centerLng]]);
    restaurants.forEach((r, index) => {
      const emoji = getEmoji(r.cuisine_type);
      const [latOff, lngOff] = pseudoRandomOffset(r.name, index);
      const lat = centerLat + latOff; const lng = centerLng + lngOff;
      L.marker([lat, lng], { icon: restaurantIcon(emoji) }).addTo(map).bindPopup(`<div style="text-align:center;font-family:sans-serif;"><strong style="font-size:14px;">${r.name}</strong><br/><span style="color:#666;font-size:12px;">${r.cuisine_type || ""}</span>${r.rating ? `<br/><span style="color:#f59e0b;font-size:12px;">⭐ ${Number(r.rating).toFixed(1)}</span>` : ""}</div>`);
      bounds.extend([lat, lng]);
    });
    if (restaurants.length > 0) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 });
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, [restaurants, centerLat, centerLng]);

  return <div ref={mapRef} className="w-full h-72 md:h-96 rounded-2xl overflow-hidden border shadow-sm" style={{ zIndex: 0 }} />;
}
