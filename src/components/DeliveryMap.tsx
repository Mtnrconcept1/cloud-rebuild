import { useEffect, useMemo, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { getRoute, type LatLng } from "@/lib/routing";

export interface RestaurantLocation {
  name: string;
  latitude: number;
  longitude: number;
}

export interface DeliveryMapRouteStop {
  id?: string;
  type?: "pickup" | "dropoff";
  label: string;
  address?: string;
  latitude: number;
  longitude: number;
}

interface DeliveryMapProps {
  routeStops?: DeliveryMapRouteStop[];
  restaurants?: RestaurantLocation[];
  restaurantLat?: number;
  restaurantLng?: number;
  deliveryLat?: number;
  deliveryLng?: number;
  currentLat?: number;
  currentLng?: number;
  status?: string;
  className?: string;
}

delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png",
  iconUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png",
  shadowUrl: "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png",
});

function createLabeledIcon(label: string, background: string) {
  return L.divIcon({
    html: `
      <div style="background:${background};width:34px;height:34px;border-radius:999px;display:flex;align-items:center;justify-content:center;border:3px solid white;box-shadow:0 8px 18px rgba(15,23,42,0.18);color:white;font-size:12px;font-weight:700;">
        ${label}
      </div>
    `,
    className: "",
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

const courierIcon = createLabeledIcon("C", "hsl(24 95% 53%)");
const dropoffIcon = createLabeledIcon("L", "hsl(220 20% 18%)");

function createPickupIcon(index: number) {
  return createLabeledIcon(String(index), "hsl(152 55% 42%)");
}

function toLatLng(point: DeliveryMapRouteStop): LatLng {
  return { lat: point.latitude, lng: point.longitude };
}

async function buildRouteSegments(points: DeliveryMapRouteStop[]) {
  const segments: L.LatLngExpression[][] = [];

  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];

    try {
      const route = await getRoute(toLatLng(from), toLatLng(to), "driving");
      if (route.geometry?.coordinates?.length) {
        segments.push(route.geometry.coordinates.map(([lng, lat]) => [lat, lng] as L.LatLngExpression));
        continue;
      }
    } catch (error) {
      console.error("delivery map route segment failed:", error);
    }

    segments.push([
      [from.latitude, from.longitude],
      [to.latitude, to.longitude],
    ]);
  }

  return segments;
}

export default function DeliveryMap({
  routeStops,
  restaurants,
  restaurantLat,
  restaurantLng,
  deliveryLat,
  deliveryLng,
  currentLat,
  currentLng,
  className = "h-64 md:h-80",
}: DeliveryMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<L.Map | null>(null);
  const layersRef = useRef<L.LayerGroup | null>(null);

  const resolvedRouteStops = useMemo(() => {
    if (routeStops && routeStops.length > 0) {
      return routeStops.filter((stop) => Number.isFinite(stop.latitude) && Number.isFinite(stop.longitude));
    }

    const pickupStops = (restaurants && restaurants.length > 0
      ? restaurants
      : (restaurantLat !== undefined && restaurantLng !== undefined
        ? [{ name: "Restaurant", latitude: restaurantLat, longitude: restaurantLng }]
        : [])
    )
      .filter((restaurant) => Number.isFinite(restaurant.latitude) && Number.isFinite(restaurant.longitude))
      .map((restaurant, index) => ({
        id: `pickup-${index + 1}`,
        type: "pickup" as const,
        label: restaurants && restaurants.length > 1 ? `Retrait ${index + 1}` : "Retrait",
        address: restaurant.name,
        latitude: restaurant.latitude,
        longitude: restaurant.longitude,
      }));

    if (deliveryLat === undefined || deliveryLng === undefined) {
      return pickupStops;
    }

    return [
      ...pickupStops,
      {
        id: "dropoff",
        type: "dropoff" as const,
        label: "Livraison",
        address: "Adresse de livraison",
        latitude: deliveryLat,
        longitude: deliveryLng,
      },
    ];
  }, [deliveryLat, deliveryLng, restaurantLat, restaurantLng, restaurants, routeStops]);

  useEffect(() => {
    if (!mapRef.current || mapInstance.current) return;

    const centerLat = currentLat ?? resolvedRouteStops[0]?.latitude ?? 46.5197;
    const centerLng = currentLng ?? resolvedRouteStops[0]?.longitude ?? 6.6323;

    const map = L.map(mapRef.current, {
      zoomControl: true,
      scrollWheelZoom: false,
    }).setView([centerLat, centerLng], 13);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
    }).addTo(map);

    layersRef.current = L.layerGroup().addTo(map);
    mapInstance.current = map;

    return () => {
      map.remove();
      mapInstance.current = null;
      layersRef.current = null;
    };
  }, [currentLat, currentLng, resolvedRouteStops]);

  useEffect(() => {
    const map = mapInstance.current;
    const layers = layersRef.current;
    if (!map || !layers) return;

    let cancelled = false;

    const renderMap = async () => {
      layers.clearLayers();

      const boundsPoints: L.LatLngExpression[] = [];

      resolvedRouteStops.forEach((stop, index) => {
        const isDropoff = stop.type === "dropoff" || index === resolvedRouteStops.length - 1;
        const icon = isDropoff ? dropoffIcon : createPickupIcon(index + 1);
        const marker = L.marker([stop.latitude, stop.longitude], { icon });

        marker
          .bindPopup(
            `<div style="min-width:160px"><strong>${stop.label}</strong><br/>${stop.address || ""}</div>`,
          )
          .addTo(layers);

        boundsPoints.push([stop.latitude, stop.longitude]);
      });

      if (currentLat !== undefined && currentLng !== undefined) {
        L.marker([currentLat, currentLng], { icon: courierIcon })
          .bindPopup("Coursier")
          .addTo(layers);
        boundsPoints.push([currentLat, currentLng]);
      }

      const segments = await buildRouteSegments(resolvedRouteStops);
      if (cancelled) return;

      segments.forEach((segment, index) => {
        L.polyline(segment, {
          color: index === segments.length - 1 ? "hsl(24 95% 53%)" : "hsl(152 55% 42%)",
          weight: 4,
          opacity: 0.9,
        }).addTo(layers);
      });

      if (boundsPoints.length > 0) {
        map.fitBounds(L.latLngBounds(boundsPoints), { padding: [36, 36] });
      }
    };

    void renderMap();

    return () => {
      cancelled = true;
    };
  }, [currentLat, currentLng, resolvedRouteStops]);

  return (
    <div
      ref={mapRef}
      className={`w-full overflow-hidden rounded-xl border ${className}`}
      style={{ zIndex: 0 }}
    />
  );
}
