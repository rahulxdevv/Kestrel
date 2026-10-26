/**
 * Rough geographic centres used to place live visitors on the world map.
 *
 * Kestrel stores country / region / city names, not coordinates: bundling a GeoIP database would add
 * tens of megabytes to the image just to draw a dot. Country centroids plus a deterministic nudge per
 * city look right at globe scale and stay a few kilobytes.
 */

/** [latitude, longitude] for each country. */
const COUNTRY: Record<string, [number, number]> = {
  AD: [42.55, 1.6], AE: [23.9, 54.3], AF: [33.9, 67.7], AG: [17.1, -61.8], AL: [41.2, 20.2],
  AM: [40.1, 45.0], AO: [-11.2, 17.9], AR: [-38.4, -63.6], AT: [47.5, 14.6], AU: [-25.3, 133.8],
  AW: [12.5, -69.9], AZ: [40.1, 47.6], BA: [43.9, 17.7], BB: [13.2, -59.5], BD: [23.7, 90.4],
  BE: [50.5, 4.5], BF: [12.2, -1.6], BG: [42.7, 25.5], BH: [26.0, 50.6], BI: [-3.4, 29.9],
  BJ: [9.3, 2.3], BN: [4.5, 114.7], BO: [-16.3, -63.6], BR: [-14.2, -51.9], BS: [25.0, -77.4],
  BT: [27.5, 90.4], BW: [-22.3, 24.7], BY: [53.7, 28.0], BZ: [17.2, -88.5], CA: [56.1, -106.3],
  CD: [-4.0, 21.8], CF: [6.6, 20.9], CG: [-0.2, 15.8], CH: [46.8, 8.2], CI: [7.5, -5.5],
  CL: [-35.7, -71.5], CM: [7.4, 12.4], CN: [35.9, 104.2], CO: [4.6, -74.3], CR: [9.7, -83.8],
  CU: [21.5, -77.8], CV: [16.5, -24.0], CY: [35.1, 33.4], CZ: [49.8, 15.5], DE: [51.2, 10.4],
  DJ: [11.8, 42.6], DK: [56.3, 9.5], DM: [15.4, -61.4], DO: [18.7, -70.2], DZ: [28.0, 1.7],
  EC: [-1.8, -78.2], EE: [58.6, 25.0], EG: [26.8, 30.8], ER: [15.2, 39.8], ES: [40.5, -3.7],
  ET: [9.1, 40.5], FI: [61.9, 25.7], FJ: [-17.7, 178.1], FM: [7.4, 150.6], FR: [46.2, 2.2],
  GA: [-0.8, 11.6], GB: [55.4, -3.4], GD: [12.1, -61.7], GE: [42.3, 43.4], GH: [7.9, -1.0],
  GI: [36.1, -5.3], GM: [13.4, -15.3], GN: [9.9, -9.6], GQ: [1.7, 10.3], GR: [39.1, 21.8],
  GT: [15.8, -90.2], GU: [13.4, 144.8], GW: [11.8, -15.2], GY: [4.9, -58.9], HK: [22.4, 114.1],
  HN: [15.2, -86.2], HR: [45.1, 15.2], HT: [18.9, -72.3], HU: [47.2, 19.5], ID: [-0.8, 113.9],
  IE: [53.4, -8.2], IL: [31.0, 34.9], IN: [20.6, 79.0], IQ: [33.2, 43.7], IR: [32.4, 53.7],
  IS: [64.9, -19.0], IT: [41.9, 12.6], JM: [18.1, -77.3], JO: [30.6, 36.2], JP: [36.2, 138.3],
  KE: [-0.0, 37.9], KG: [41.2, 74.8], KH: [12.6, 105.0], KM: [-11.9, 43.9], KN: [17.4, -62.8],
  KP: [40.3, 127.5], KR: [35.9, 127.8], KW: [29.3, 47.5], KY: [19.3, -81.3], KZ: [48.0, 66.9],
  LA: [19.9, 102.5], LB: [33.9, 35.9], LC: [13.9, -60.9], LI: [47.2, 9.6], LK: [7.9, 80.8],
  LR: [6.4, -9.4], LS: [-29.6, 28.2], LT: [55.2, 23.9], LU: [49.8, 6.1], LV: [56.9, 24.6],
  LY: [26.3, 17.2], MA: [31.8, -7.1], MC: [43.7, 7.4], MD: [47.4, 28.4], ME: [42.7, 19.4],
  MG: [-18.8, 46.9], MK: [41.6, 21.7], ML: [17.6, -4.0], MM: [21.9, 95.96], MN: [46.9, 103.8],
  MO: [22.2, 113.5], MR: [21.0, -10.9], MT: [35.9, 14.4], MU: [-20.3, 57.6], MV: [3.2, 73.2],
  MW: [-13.3, 34.3], MX: [23.6, -102.6], MY: [4.2, 101.98], MZ: [-18.7, 35.5], NA: [-22.96, 18.5],
  NE: [17.6, 8.1], NG: [9.1, 8.7], NI: [12.9, -85.2], NL: [52.1, 5.3], NO: [60.5, 8.5],
  NP: [28.4, 84.1], NZ: [-40.9, 174.9], OM: [21.5, 55.9], PA: [8.5, -80.8], PE: [-9.2, -75.0],
  PG: [-6.3, 143.9], PH: [12.9, 121.8], PK: [30.4, 69.3], PL: [51.9, 19.1], PR: [18.2, -66.4],
  PT: [39.4, -8.2], PY: [-23.4, -58.4], QA: [25.4, 51.2], RO: [45.9, 25.0], RS: [44.0, 21.0],
  RU: [61.5, 105.3], RW: [-1.9, 29.9], SA: [23.9, 45.1], SB: [-9.6, 160.2], SC: [-4.7, 55.5],
  SD: [12.9, 30.2], SE: [60.1, 18.6], SG: [1.35, 103.8], SI: [46.2, 14.8], SK: [48.7, 19.7],
  SL: [8.5, -11.8], SN: [14.5, -14.5], SO: [5.2, 46.2], SR: [3.9, -56.0], SS: [6.9, 31.3],
  SV: [13.8, -88.9], SY: [34.8, 39.0], SZ: [-26.5, 31.5], TD: [15.5, 18.7], TG: [8.6, 0.8],
  TH: [15.9, 101.0], TJ: [38.9, 71.3], TL: [-8.9, 125.7], TM: [38.97, 59.6], TN: [33.9, 9.5],
  TO: [-21.2, -175.2], TR: [39.0, 35.2], TT: [10.7, -61.2], TW: [23.7, 121.0], TZ: [-6.4, 34.9],
  UA: [48.4, 31.2], UG: [1.4, 32.3], US: [39.8, -98.6], UY: [-32.5, -55.8], UZ: [41.4, 64.6],
  VA: [41.9, 12.45], VC: [13.2, -61.2], VE: [6.4, -66.6], VN: [14.1, 108.3], VU: [-15.4, 166.9],
  WS: [-13.8, -172.1], XK: [42.6, 20.9], YE: [15.6, 48.5], ZA: [-30.6, 22.9], ZM: [-13.1, 27.8],
  ZW: [-19.0, 29.2],
};

/** Major cities, keyed by lowercase name, so two visitors in one country don't share a dot. */
const CITY: Record<string, [number, number]> = {
  'san francisco': [37.77, -122.42], 'los angeles': [34.05, -118.24], 'new york': [40.71, -74.0],
  chicago: [41.88, -87.63], austin: [30.27, -97.74], seattle: [47.61, -122.33], miami: [25.76, -80.19],
  boston: [42.36, -71.06], denver: [39.74, -104.99], toronto: [43.65, -79.38], vancouver: [49.28, -123.12],
  montreal: [45.5, -73.57], 'mexico city': [19.43, -99.13], 'são paulo': [-23.55, -46.63],
  'sao paulo': [-23.55, -46.63], 'rio de janeiro': [-22.91, -43.17], 'buenos aires': [-34.6, -58.38],
  bogotá: [4.71, -74.07], bogota: [4.71, -74.07], lima: [-12.05, -77.04], santiago: [-33.45, -70.67],
  london: [51.51, -0.13], manchester: [53.48, -2.24], dublin: [53.35, -6.26], paris: [48.86, 2.35],
  berlin: [52.52, 13.4], munich: [48.14, 11.58], hamburg: [53.55, 9.99], amsterdam: [52.37, 4.9],
  rotterdam: [51.92, 4.48], brussels: [50.85, 4.35], zurich: [47.38, 8.54], geneva: [46.2, 6.14],
  vienna: [48.21, 16.37], prague: [50.08, 14.44], warsaw: [52.23, 21.01], budapest: [47.5, 19.04],
  stockholm: [59.33, 18.07], oslo: [59.91, 10.75], copenhagen: [55.68, 12.57], helsinki: [60.17, 24.94],
  'tallinn': [59.44, 24.75], lisbon: [38.72, -9.14], porto: [41.15, -8.61], madrid: [40.42, -3.7],
  barcelona: [41.39, 2.17], rome: [41.9, 12.5], milan: [45.46, 9.19], athens: [37.98, 23.73],
  istanbul: [41.01, 28.98], moscow: [55.76, 37.62], kyiv: [50.45, 30.52], 'st petersburg': [59.93, 30.34],
  tel: [32.09, 34.78], 'tel aviv': [32.09, 34.78], dubai: [25.2, 55.27], 'abu dhabi': [24.45, 54.38],
  riyadh: [24.71, 46.68], doha: [25.29, 51.53], cairo: [30.04, 31.24], lagos: [6.52, 3.38],
  nairobi: [-1.29, 36.82], 'cape town': [-33.92, 18.42], johannesburg: [-26.2, 28.05],
  accra: [5.6, -0.19], casablanca: [33.57, -7.59], tunis: [36.81, 10.18], karachi: [24.86, 67.01],
  lahore: [31.55, 74.34], 'new delhi': [28.61, 77.21], delhi: [28.61, 77.21], mumbai: [19.08, 72.88],
  bengaluru: [12.97, 77.59], bangalore: [12.97, 77.59], hyderabad: [17.39, 78.49], pune: [18.52, 73.86],
  chennai: [13.08, 80.27], kolkata: [22.57, 88.36], dhaka: [23.81, 90.41], colombo: [6.93, 79.86],
  kathmandu: [27.72, 85.32], bangkok: [13.76, 100.5], 'ho chi minh city': [10.82, 106.63],
  hanoi: [21.03, 105.85], singapore: [1.35, 103.82], 'kuala lumpur': [3.14, 101.69], jakarta: [-6.21, 106.85],
  manila: [14.6, 120.98], 'hong kong': [22.32, 114.17], taipei: [25.03, 121.57], shanghai: [31.23, 121.47],
  beijing: [39.9, 116.41], shenzhen: [22.54, 114.06], seoul: [37.57, 126.98], tokyo: [35.68, 139.69],
  osaka: [34.69, 135.5], sydney: [-33.87, 151.21], melbourne: [-37.81, 144.96], brisbane: [-27.47, 153.03],
  perth: [-31.95, 115.86], auckland: [-36.85, 174.76], wellington: [-41.29, 174.78],
};

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

export interface Point {
  lat: number;
  lon: number;
}

/**
 * Where to put a visit. City coordinates win; otherwise the country centre, nudged by up to ~1.6°
 * so a Canada full of cities doesn't collapse into one dot.
 */
export function geoPoint(country: string | null | undefined, city?: string | null): Point | null {
  const cityKey = city?.trim().toLowerCase();
  if (cityKey && CITY[cityKey]) {
    const [lat, lon] = CITY[cityKey];
    return { lat, lon };
  }
  const code = country?.toUpperCase();
  if (!code || !COUNTRY[code]) return null;
  const [lat, lon] = COUNTRY[code];
  if (!cityKey) return { lat, lon };
  const h = hash(cityKey);
  return { lat: lat + ((h % 260) / 100 - 1.3), lon: lon + (((h >> 8) % 320) / 100 - 1.6) };
}

/** The countries we can draw, with their ISO code for labels. */
export function countryPoints(): (Point & { code: string })[] {
  return Object.entries(COUNTRY).map(([code, [lat, lon]]) => ({ code, lat, lon }));
}
