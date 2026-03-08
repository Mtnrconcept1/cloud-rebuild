import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

interface RestaurantLocation { name: string; latitude: number; longitude: number; }

interface DeliveryMapProps {
  restaurants?: RestaurantLocation[];
  restaurantLat?: number;
  restaurantLng?: number;
  deliveryLat: number;
  deliveryLng: number;
  currentLat: number;
  currentLng: number;
  status: string;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

const driverIcon = L.divIcon({ html: `<div style="background:hsl(24,95%,53%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;">🛵</div>`, className: "", iconSize: [32, 32], iconAnchor: [16, 16] });
const restaurantIcon = L.divIcon({ html: `<div style="background:hsl(152,55%,45%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;">🍽️</div>`, className: "", iconSize: [32, 32], iconAnchor: [16, 16] });
const homeIcon = L.divIcon({ html: `<div style="background:hsl(220,20%,10%);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3);font-size:16px;">🏠</div>`, className: "", iconSize: [32, 32], iconAnchor: [16, 16] });

export default function DeliveryMap({ restaurants, restaurantLat, restaurantLng, deliveryLat, deliveryLng, currentLat, currentLng, status }: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const driverMarker = useRef<L.Marker | null>(null);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;
    const map = L.map(mapRef.current).setView([currentLat, currentLng], 14);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }).addTo(map);
    const locations = restaurants || (restaurantLat && restaurantLng ? [{ name: "Restaurant", latitude: restaurantLat, longitude: restaurantLng }] : []);
    locations.forEach(loc => {
      if (loc.latitude && loc.longitude) {
        L.marker([loc.latitude, loc.longitude], { icon: restaurantIcon }).addTo(map).bindPopup(loc.name);
        L.polyline([[loc.latitude, loc.longitude], [deliveryLat, deliveryLng]], { color: "hsl(24, 95%, 53%)", weight: 3, opacity: 0.3, dashArray: "5, 10" }).addTo(map);
      }
    });
    L.marker([deliveryLat, deliveryLng], { icon: homeIcon }).addTo(map).bindPopup("Adresse de livraison");
    const driver = L.marker([currentLat, currentLng], { icon: driverIcon }).addTo(map).bindPopup("Livreur");
    driverMarker.current = driver;
    const allPoints: L.LatLngExpression[] = [[deliveryLat, deliveryLng], [currentLat, currentLng], ...locations.filter(l => l.latitude && l.longitude).map(l => [l.latitude, l.longitude] as L.LatLngExpression)];
    map.fitBounds(L.latLngBounds(allPoints), { padding: [50, 50] });
    mapInstance.current = map;
    return () => { map.remove(); mapInstance.current = null; };
  }, []);

  useEffect(() => { if (driverMarker.current) driverMarker.current.setLatLng([currentLat, currentLng]); }, [currentLat, currentLng]);

  return <div ref={mapRef} className="w-full h-64 md:h-80 rounded-xl overflow-hidden border" style={{ zIndex: 0 }} />;
}
