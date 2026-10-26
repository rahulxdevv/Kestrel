import { Map as MapLibreMap, Marker, setWorkerUrl } from 'maplibre-gl';
// @ts-ignore - Vite emits the worker as an asset and hands us its URL.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url';
import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef } from 'react';
import type { LivePoint } from '../lib/api';
import { countryName } from '../lib/format';
import { avatarMarkup } from './Icons';

setWorkerUrl(workerUrl);

/**
 * OpenFreeMap serves OpenStreetMap vector tiles with no account, no API key and no bill, and the
 * style carries the attribution MapLibre paints in the corner, which is the licence's only demand.
 * Our own data (the markers) is layered on top; nothing about Kestrel's own numbers leaves the app.
 */
const STYLE = 'https://tiles.openfreemap.org/styles/liberty';

export interface MapCanvasProps {
  points: LivePoint[];
  mode: 'globe' | 'flat';
  height: number;
  onFail: () => void;
}

/** A marker: an illustrated face for a place with a city, the country's flag for a country dot. */
function markerElement(point: LivePoint, mode: 'globe' | 'flat'): HTMLElement {
  const el = document.createElement('div');
  const useFlag = mode === 'flat' && !point.city;
  el.className = useFlag ? 'kl-chip kl-chip-flag' : 'kl-chip kl-chip-face';
  const label = `${point.city ? `${point.city}, ` : ''}${countryName(point.country)}`;
  el.title = `${label} · ${point.visitors} ${point.visitors === 1 ? 'visitor' : 'visitors'}`;
  const count =
    point.visitors > 1 ? `<span class="kl-chip-count">+${point.visitors}</span>` : '';
  if (useFlag) {
    const code = point.country.toLowerCase();
    el.innerHTML =
      `<span class="kl-chip-pic"><img src="https://flagcdn.com/w40/${code}.png" width="22" height="15" alt="" ` +
      `onerror="this.replaceWith(document.createTextNode(''))"></span>${count}`;
  } else {
    el.innerHTML = `<span class="kl-chip-pic">${avatarMarkup(point.visitorId ?? point.city ?? point.country, 30)}</span>${count}`;
  }
  return el;
}

export default function MapCanvas({ points, mode, height, onFail }: MapCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markersRef = useRef<Marker[]>([]);
  const failRef = useRef(onFail);
  failRef.current = onFail;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let map: MapLibreMap;
    try {
      map = new MapLibreMap({
        container,
        style: STYLE,
        center: mode === 'globe' ? [14, 20] : [10, 22],
        zoom: mode === 'globe' ? 1.35 : 1.05,
        minZoom: 0.4,
        maxZoom: 9,
        attributionControl: { compact: true },
        dragRotate: mode === 'globe',
        pitchWithRotate: mode === 'globe',
        fadeDuration: 220,
      });
    } catch {
      onFail();
      return;
    }
    mapRef.current = map;

    let loaded = false;
    let errors = 0;
    const onLoad = () => {
      loaded = true;
      if (mode === 'globe') {
        try {
          map.setProjection({ type: 'globe' });
        } catch {
          /* older browsers keep the flat projection, still a real map */
        }
      }
    };
    const onError = () => {
      if (loaded) return;
      if (++errors >= 3) onFail();
    };
    map.on('load', onLoad);
    map.on('error', onError);
    // No tiles in a reasonable window means the map is useless here: let the caller fall back.
    const giveUp = window.setTimeout(() => {
      if (!loaded) onFail();
    }, 15_000);

    // Slow self-rotation, paused while the visitor is dragging the map around.
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    let raf = 0;
    let last = 0;
    const tick = (time: number) => {
      raf = requestAnimationFrame(tick);
      if (reduce || mode !== 'globe' || time - last < 50) return;
      last = time;
      if (map.isMoving()) return;
      const c = map.getCenter();
      map.setCenter([c.lng + 0.09, c.lat]);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(giveUp);
      map.off('load', onLoad);
      map.off('error', onError);
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Markers follow the data without rebuilding the map and refetching every tile.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    for (const marker of markersRef.current) marker.remove();
    markersRef.current = points.map((point) => {
      const el = markerElement(point, mode);
      return new Marker({ element: el, anchor: 'center' }).setLngLat([point.lon, point.lat]).addTo(map);
    });
    return () => {
      for (const marker of markersRef.current) marker.remove();
      markersRef.current = [];
    };
  }, [points, mode]);

  return <div ref={containerRef} className="kl-map" style={{ height }} role="img" aria-label="World map with live visitor locations" />;
}