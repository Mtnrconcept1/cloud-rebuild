export type Coordinates = {
  latitude: number;
  longitude: number;
};

export type RestaurantCoordinates = {
  latitude?: number | null;
  longitude?: number | null;
};

type RadiusFilterOptions = {
  sortByDistance?: boolean;
};

const EARTH_RADIUS_KM = 6371.0088;

function toRadians(value: number) {
  return value * (Math.PI / 180);
}

export function getDistanceKm(from: Coordinates, to: Coordinates) {
  const latitudeDelta = toRadians(to.latitude - from.latitude);
  const longitudeDelta = toRadians(to.longitude - from.longitude);
  const fromLatitude = toRadians(from.latitude);
  const toLatitude = toRadians(to.latitude);

  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(fromLatitude) * Math.cos(toLatitude) * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(haversine));
}

export function getRestaurantDistanceKm(
  restaurant: RestaurantCoordinates,
  origin: Coordinates,
) {
  if (restaurant.latitude == null || restaurant.longitude == null) return null;

  const latitude = Number(restaurant.latitude);
  const longitude = Number(restaurant.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return null;

  return getDistanceKm(origin, { latitude, longitude });
}

export function isRestaurantWithinRadius(
  restaurant: RestaurantCoordinates,
  origin: Coordinates,
  radiusKm: number,
) {
  const distanceKm = getRestaurantDistanceKm(restaurant, origin);
  return distanceKm !== null && distanceKm <= radiusKm;
}

export function filterRestaurantsWithinRadius<T extends RestaurantCoordinates>(
  restaurants: T[],
  origin: Coordinates,
  radiusKm: number,
  options: RadiusFilterOptions = {},
) {
  const matches = restaurants
    .map((restaurant) => ({
      restaurant,
      distanceKm: getRestaurantDistanceKm(restaurant, origin),
    }))
    .filter(
      (entry): entry is { restaurant: T; distanceKm: number } =>
        entry.distanceKm !== null && entry.distanceKm <= radiusKm,
    );

  if (options.sortByDistance) {
    matches.sort((left, right) => left.distanceKm - right.distanceKm);
  }

  return matches.map(({ restaurant, distanceKm }) => ({
    ...restaurant,
    distance_km: distanceKm,
  }));
}
