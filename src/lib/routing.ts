/**
 * Routing utilities using OSRM (Open Source Routing Machine) public API.
 * Provides ETA calculation, route geometry, and distance matrix.
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResult {
  duration_seconds: number;
  distance_meters: number;
  geometry: GeoJSON.LineString | null;
}

export interface ETAResult {
  duration_seconds: number;
  distance_meters: number;
  eta: Date;
}

const OSRM_BASE_URL = "https://router.project-osrm.org";

/**
 * Get a route between two points using OSRM.
 * Returns duration, distance, and route geometry as GeoJSON.
 */
export async function getRoute(
  from: LatLng,
  to: LatLng,
  profile: "driving" | "cycling" | "foot" = "driving"
): Promise<RouteResult> {
  const url = `${OSRM_BASE_URL}/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=false`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM routing failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
    throw new Error(`OSRM routing error: ${data.code || "No routes found"}`);
  }

  const route = data.routes[0];
  return {
    duration_seconds: route.duration,
    distance_meters: route.distance,
    geometry: route.geometry || null,
  };
}

/**
 * Calculate ETA from current position to destination.
 */
export async function getETA(
  from: LatLng,
  to: LatLng,
  profile: "driving" | "cycling" | "foot" = "driving"
): Promise<ETAResult> {
  const route = await getRoute(from, to, profile);
  return {
    duration_seconds: route.duration_seconds,
    distance_meters: route.distance_meters,
    eta: new Date(Date.now() + route.duration_seconds * 1000),
  };
}

/**
 * Get distance/duration between multiple origins and destinations.
 * Useful for dispatch algorithm to score multiple couriers.
 */
export async function getDistanceMatrix(
  origins: LatLng[],
  destinations: LatLng[],
  profile: "driving" | "cycling" | "foot" = "driving"
): Promise<{ durations: number[][]; distances: number[][] }> {
  // OSRM table service: all points as coordinates, specify source and destination indices
  const coords = [...origins, ...destinations]
    .map((p) => `${p.lng},${p.lat}`)
    .join(";");

  const sourceIndices = origins.map((_, i) => i).join(";");
  const destIndices = destinations.map((_, i) => i + origins.length).join(";");

  const url = `${OSRM_BASE_URL}/table/v1/${profile}/${coords}?sources=${sourceIndices}&destinations=${destIndices}&annotations=duration,distance`;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`OSRM table failed: ${response.status}`);
  }

  const data = await response.json();

  if (data.code !== "Ok") {
    throw new Error(`OSRM table error: ${data.code}`);
  }

  return {
    durations: data.durations || [],
    distances: data.distances || [],
  };
}

/**
 * Convert route profile based on vehicle type.
 */
export function vehicleTypeToProfile(
  vehicleType: string
): "driving" | "cycling" | "foot" {
  switch (vehicleType) {
    case "car":
    case "scooter":
      return "driving";
    case "bicycle":
      return "cycling";
    case "walk":
      return "foot";
    default:
      return "cycling";
  }
}

/**
 * Format duration in human-readable format.
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) return "< 1 min";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes > 0 ? ` ${remainingMinutes}min` : ""}`;
}

/**
 * Format distance in human-readable format.
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}
