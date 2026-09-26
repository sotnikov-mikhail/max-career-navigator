/**
 * Определение города по геопозиции без внешнего геокодера: берём ближайший город
 * из списка быстрого выбора. Если человек далеко от всех — честно
 * говорим, что не смогли определить, а не подставляем «ближайший» за 1000 км.
 */

export interface KnownCity {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}

export const KNOWN_CITIES: KnownCity[] = [
  { id: 'msk', name: 'Москва', latitude: 55.7558, longitude: 37.6173 },
  { id: 'kzn', name: 'Казань', latitude: 55.7961, longitude: 49.1064 },
  { id: 'nsk', name: 'Новосибирск', latitude: 55.0084, longitude: 82.9357 },
  { id: 'krd', name: 'Краснодар', latitude: 45.0355, longitude: 38.9753 },
  { id: 'spb', name: 'Санкт-Петербург', latitude: 59.9311, longitude: 30.3609 },
];

export const MAX_CITY_DISTANCE_KM = 150;

export function cityById(id: string): KnownCity | undefined {
  return KNOWN_CITIES.find((city) => city.id === id);
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(a));
}

export function nearestCity(latitude: number, longitude: number): { city: KnownCity; distanceKm: number } {
  let best = { city: KNOWN_CITIES[0], distanceKm: Number.POSITIVE_INFINITY };
  for (const city of KNOWN_CITIES) {
    const distanceKm = haversineKm(latitude, longitude, city.latitude, city.longitude);
    if (distanceKm < best.distanceKm) best = { city, distanceKm };
  }
  return best;
}
