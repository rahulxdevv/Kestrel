import { useEffect, useRef } from 'react';
import { countryPoints } from '../../shared/geo';
import { LAND } from '../../shared/world';
import type { LivePoint } from '../lib/api';
import { avatarMarkup } from './Icons';

/**
 * A globe and a flat world map, drawn on canvas with no mapping service, no API token and no
 * third-party requests. Coastlines come from the public-domain Natural Earth 1:110m dataset,
 * sampled through an orthographic projection so the horizon, poles and rotation are real.
 */

/** roundRect where available, plain rect on older browsers. */
function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
  else ctx.rect(x, y, w, h);
}

const RAD = Math.PI / 180;
const MASK_W = 720;
const MASK_H = 360;

const COUNTRY_LABEL_CODES = new Set([
  'US', 'CA', 'MX', 'BR', 'AR', 'CL', 'PE', 'CO', 'VE', 'GB', 'IE', 'FR', 'ES', 'PT', 'DE', 'NL', 'BE', 'CH', 'AT',
  'IT', 'PL', 'CZ', 'SK', 'HU', 'RO', 'BG', 'GR', 'TR', 'UA', 'RU', 'SE', 'NO', 'FI', 'DK', 'EE', 'LV', 'LT', 'BY',
  'KZ', 'IR', 'IQ', 'SA', 'AE', 'OM', 'YE', 'EG', 'LY', 'DZ', 'MA', 'TN', 'NG', 'GH', 'CI', 'SN', 'ML', 'NE', 'TD',
  'SD', 'ET', 'KE', 'TZ', 'AO', 'ZM', 'ZW', 'MZ', 'MG', 'ZA', 'NA', 'BW', 'IN', 'PK', 'AF', 'UZ', 'TM', 'CN', 'MN',
  'JP', 'KR', 'TW', 'VN', 'TH', 'MM', 'KH', 'LA', 'MY', 'ID', 'PH', 'AU', 'NZ', 'PG',
]);

let regionNames: Intl.DisplayNames | null = null;
try {
  regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
} catch {
  regionNames = null;
}

const countryName = (code: string) => {
  try {
    return regionNames?.of(code) ?? code;
  } catch {
    return code;
  }
};

/** Rasterised coastline: one byte per cell, 1 = land. Built once, reused by both maps. */
let mask: Uint8Array | null = null;

function landMask(): Uint8Array {
  if (mask) return mask;
  mask = new Uint8Array(MASK_W * MASK_H);
  if (typeof document === 'undefined') return mask;
  const canvas = document.createElement('canvas');
  canvas.width = MASK_W;
  canvas.height = MASK_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) return mask;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  for (const ring of LAND) {
    for (let i = 0; i < ring.length; i++) {
      const x = ((ring[i][0] + 180) / 360) * MASK_W;
      const y = ((90 - ring[i][1]) / 180) * MASK_H;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  }
  ctx.fill();
  const data = ctx.getImageData(0, 0, MASK_W, MASK_H).data;
  for (let i = 0; i < MASK_W * MASK_H; i++) mask[i] = data[i * 4 + 3] > 8 ? 1 : 0;
  return mask;
}

const hash = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

const palette = ['#e0703c', '#4a8fd4', '#5aa17f', '#b06ab3', '#d1a24a', '#5d7fb8', '#c96a6a'];

type View = { yaw: number; pitch: number; dragging: boolean; lastX: number; lastY: number };

type Marker = LivePoint & { color: string };

export function LiveGlobe({ points, height = 430 }: { points: LivePoint[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<LivePoint[]>(points);
  pointsRef.current = points;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const view: View = { yaw: -0.55, pitch: 0.30, dragging: false, lastX: 0, lastY: 0 };
    let width = 0;
    let raf = 0;
    const buffers = new Map<number, { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; image: ImageData }>();
    const avatarImages = new Map<string, HTMLImageElement>();
    const avatarImage = (id: string) => {
      let image = avatarImages.get(id);
      if (!image) {
        image = new Image();
        image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(avatarMarkup(id, 64))}`;
        avatarImages.set(id, image);
      }
      return image;
    };

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = rect.width || 520;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    const bufferFor = (dim: number) => {
      const hit = buffers.get(dim);
      if (hit) return hit;
      const canvas2 = document.createElement('canvas');
      canvas2.width = dim;
      canvas2.height = dim;
      const ctx2 = canvas2.getContext('2d');
      if (!ctx2) throw new Error('no 2d context');
      const made = { canvas: canvas2, ctx: ctx2, image: ctx2.createImageData(dim, dim) };
      buffers.set(dim, made);
      return made;
    };

    const project = (latAddr: number, lonAddr: number, radius: number, cx: number, cy: number) => {
      const phi = latAddr * RAD;
      const lambda = lonAddr * RAD + view.yaw;
      const cosPhi = Math.cos(phi);
      const sinP = Math.sin(view.pitch);
      const cosP = Math.cos(view.pitch);
      const x = cosPhi * Math.sin(lambda);
      const y = Math.sin(phi) * cosP - cosPhi * Math.cos(lambda) * sinP;
      const z = Math.sin(phi) * sinP + cosPhi * Math.cos(lambda) * cosP;
      return { x: cx + x * radius, y: cy - y * radius, z };
    };

    const drawSphere = (cx: number, cy: number, radius: number) => {
      const land = landMask();
      const dim = Math.max(64, Math.min(420, Math.round(radius * 2)));
      const buffer = bufferFor(dim);
      const data = buffer.image.data;
      const half = dim / 2;
      const scale = dim / (radius * 2);
      const sinP = Math.sin(view.pitch);
      const cosP = Math.cos(view.pitch);
      const yaw = view.yaw;

      for (let py = 0; py < dim; py++) {
        const dy = -(py - half + 0.5) / half;
        for (let px = 0; px < dim; px++) {
          const dx = (px - half + 0.5) / half;
          const rho2 = dx * dx + dy * dy;
          const index = (py * dim + px) * 4;
          if (rho2 > 1) {
            data[index + 3] = 0;
            continue;
          }
          const rho = Math.sqrt(rho2);
          const c = Math.asin(Math.min(1, rho));
          const sinC = Math.sin(c);
          const cosC = Math.cos(c);
          const latRad = Math.asin(Math.max(-1, Math.min(1, cosC * sinP + (rho ? (dy * sinC * cosP) / rho : 0))));
          const lonRad = rho ? Math.atan2(dx * sinC, rho * cosC * cosP - dy * sinC * sinP) - yaw : 0;

          const lonDeg = (lonRad / RAD + 540) % 360 - 180;
          const latDeg = latRad / RAD;
          const mx = ((lonDeg + 180) / 360) * MASK_W;
          const my = ((90 - latDeg) / 180) * MASK_H;
          const mx0 = mx | 0;
          const my0 = my | 0;
          const isLand = land[Math.min(MASK_H - 1, Math.max(0, my0)) * MASK_W + Math.min(MASK_W - 1, Math.max(0, mx0))] === 1;

          // Lambert-ish shading from the upper left, plus limb darkening at the edge of the sphere.
          const nz = Math.sqrt(Math.max(0, 1 - rho2));
          const light = Math.max(0, dx * -0.42 + dy * 0.52 + nz * 0.78);
          const limb = 0.55 + 0.45 * nz;
          const texture = ((hash(`${mx0},${my0}`) % 11) - 5) / 100;

          let r: number;
          let g: number;
          let b: number;
          if (isLand) {
            const polar = Math.min(1, Math.max(0, (Math.abs(latDeg) - 58) / 18));
            const dry = Math.max(0, 1 - Math.abs(Math.abs(latDeg) - 24) / 14) * 0.35;
            r = 118 + dry * 34 + polar * 96;
            g = 148 + dry * 20 + polar * 74;
            b = 96 + dry * 6 + polar * 92;
            // Coastal highlight, so continents read as land and not as a texture.
            const edge =
              land[my0 * MASK_W + Math.max(0, mx0 - 2)] === 0 ||
              land[my0 * MASK_W + Math.min(MASK_W - 1, mx0 + 2)] === 0 ||
              land[Math.max(0, my0 - 2) * MASK_W + mx0] === 0 ||
              land[Math.min(MASK_H - 1, my0 + 2) * MASK_W + mx0] === 0;
            if (edge) {
              r += 26;
              g += 26;
              b += 20;
            }
          } else {
            r = 18;
            g = 50;
            b = 84;
          }
          const shade = (0.55 + 0.85 * light) * limb * (1 + texture);
          data[index] = Math.max(0, Math.min(255, r * shade));
          data[index + 1] = Math.max(0, Math.min(255, g * shade));
          data[index + 2] = Math.max(0, Math.min(255, b * shade));
          data[index + 3] = 255;
        }
      }

      buffer.ctx.putImageData(buffer.image, 0, 0);
      ctx.drawImage(buffer.canvas, cx - radius, cy - radius, radius * 2, radius * 2);
      void scale;
    };

    const drawStars = (w: number, h: number, time: number) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#070d18');
      sky.addColorStop(0.55, '#0a1526');
      sky.addColorStop(1, '#050a13');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 150; i++) {
        const hx = hash(`star${i}`);
        const x = (hx % 997) / 997 * w;
        const y = ((hx >> 10) % 991) / 991 * h;
        const twinkle = 0.35 + 0.4 * Math.abs(Math.sin(time / 2600 + i));
        const size = i % 17 === 0 ? 1.6 : 0.9;
        ctx.fillStyle = `rgba(214,229,255,${(0.18 + (hx % 43) / 200) * twinkle})`;
        ctx.beginPath();
        ctx.arc(x, y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    };

    const drawLabels = (cx: number, cy: number, radius: number) => {
      ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const country of countryPoints()) {
        if (!COUNTRY_LABEL_CODES.has(country.code)) continue;
        const p = project(country.lat, country.lon, radius, cx, cy);
        if (p.z < 0.34) continue;
        ctx.fillStyle = `rgba(238,244,255,${0.30 + p.z * 0.42})`;
        ctx.shadowColor = 'rgba(0,0,0,0.55)';
        ctx.shadowBlur = 3;
        ctx.fillText(countryName(country.code), p.x, p.y);
      }
      ctx.shadowBlur = 0;
    };

    const drawMarkers = (cx: number, cy: number, radius: number, time: number, list: LivePoint[]) => {
      const markers: Marker[] = list.map((p) => ({ ...p, color: palette[hash(p.country + (p.city ?? '')) % palette.length] }));
      const totals = new Map<string, number>();
      for (const marker of markers) {
        const key = `${marker.lat.toFixed(5)},${marker.lon.toFixed(5)}`;
        totals.set(key, (totals.get(key) ?? 0) + 1);
      }
      const indexes = new Map<string, number>();
      for (const marker of markers) {
        const key = `${marker.lat.toFixed(5)},${marker.lon.toFixed(5)}`;
        const index = indexes.get(key) ?? 0;
        indexes.set(key, index + 1);
        const p = project(marker.lat, marker.lon, radius, cx, cy);
        if (p.z <= 0.06) continue;
        const angle = index * 2.399963;
        const spread = (totals.get(key) ?? 1) > 1 ? Math.min(32, 12 + Math.sqrt(index) * 5) : 0;
        p.x += Math.cos(angle) * spread;
        p.y += Math.sin(angle) * spread;
        const scale = 0.72 + p.z * 0.36;
        const r = 13 * scale;
        const alpha = 0.55 + p.z * 0.45;

        const halo = ctx.createRadialGradient(p.x, p.y, r * 0.6, p.x, p.y, r * 3.6);
        halo.addColorStop(0, `rgba(255,255,255,${0.20 * alpha})`);
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r * 3.6, 0, Math.PI * 2);
        ctx.fill();

        const pulse = (time / 2200) % 1;
        ctx.strokeStyle = `rgba(255,255,255,${(1 - pulse) * 0.35 * alpha})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r + pulse * 16, 0, Math.PI * 2);
        ctx.stroke();

        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
        ctx.fillStyle = marker.color;
        ctx.fill();
        const portrait = avatarImage(marker.visitorId ?? `${marker.country}:${marker.city ?? ''}`);
        if (portrait.complete && portrait.naturalWidth) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(p.x, p.y, r - 1, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(portrait, p.x - r, p.y - r, r * 2, r * 2);
          ctx.restore();
        } else {
          ctx.fillStyle = '#fff';
          ctx.font = `700 ${Math.round(8 * scale)}px ui-sans-serif, system-ui, sans-serif`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(marker.country.slice(0, 2), p.x, p.y + 0.5);
        }
        ctx.lineWidth = 2;
        ctx.strokeStyle = 'rgba(255,255,255,0.92)';
        ctx.stroke();

        if (marker.visitors > 1) {
          const label = `+${marker.visitors}`;
          ctx.font = '600 9px ui-sans-serif, system-ui, sans-serif';
          const w = ctx.measureText(label).width + 12;
          const bx = p.x + r + 4;
          const by = p.y - 8;
          ctx.fillStyle = 'rgba(9,14,22,0.88)';
          ctx.beginPath();
          roundRectPath(ctx, bx, by, w, 16, 8);
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,0.18)';
          ctx.lineWidth = 1;
          ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.textAlign = 'left';
          ctx.fillText(label, bx + 6, by + 8.5);
        }
        ctx.restore();
      }
    };

    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const w = width || rect.width || 520;
      const h = rect.height || height;
      const cx = w / 2;
      const cy = h / 2;
      const radius = Math.min(w * 0.46, h * 0.45);

      ctx.clearRect(0, 0, w, h);
      drawStars(w, h, time);

      const glow = ctx.createRadialGradient(cx, cy, radius * 0.9, cx, cy, radius * 1.45);
      glow.addColorStop(0, 'rgba(110,170,235,0.20)');
      glow.addColorStop(0.55, 'rgba(90,150,220,0.08)');
      glow.addColorStop(1, 'rgba(90,150,220,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(cx, cy, radius * 1.45, 0, Math.PI * 2);
      ctx.fill();

      drawSphere(cx, cy, radius);

      ctx.strokeStyle = 'rgba(160,200,245,0.28)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.stroke();

      drawLabels(cx, cy, radius);
      drawMarkers(cx, cy, radius, time, pointsRef.current);
    };

    // ~30 frames per second is plenty for a slow rotation and keeps laptops cool.
    let lastDraw = 0;
    const tick = (time: number) => {
      if (!view.dragging && !reduceMotion) view.yaw += 0.0014;
      if (time - lastDraw > 32) {
        draw(time);
        lastDraw = time;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    const onDown = (event: PointerEvent) => {
      view.dragging = true;
      view.lastX = event.clientX;
      view.lastY = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = 'grabbing';
    };
    const onMove = (event: PointerEvent) => {
      if (!view.dragging) return;
      view.yaw += (event.clientX - view.lastX) * 0.006;
      view.pitch = Math.max(-0.95, Math.min(0.95, view.pitch + (event.clientY - view.lastY) * 0.005));
      view.lastX = event.clientX;
      view.lastY = event.clientY;
    };
    const onUp = () => {
      view.dragging = false;
      canvas.style.cursor = 'grab';
    };

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('pointerleave', onUp);
    canvas.style.cursor = 'grab';
    canvas.style.touchAction = 'none';

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('pointerleave', onUp);
    };
  }, [height]);

  return (
    <canvas
      ref={canvasRef}
      height={height}
      style={{ height }}
      className="w-full select-none"
      role="img"
      aria-label={`World map with ${points.length} active locations`}
    />
  );
}

/** The same data on a flat equirectangular map: faster to read when you just want "where". */
export function LiveMap2D({ points, height = 430 }: { points: LivePoint[]; height?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pointsRef = useRef<LivePoint[]>(points);
  pointsRef.current = points;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 0;
    let raf = 0;

    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const rect = canvas.getBoundingClientRect();
      width = rect.width || 520;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
    observer?.observe(canvas);

    const xy = (lon: number, lat: number, w: number, h: number) => ({
      x: ((lon + 180) / 360) * w,
      y: ((90 - lat) / 180) * h,
    });

    const draw = (time: number) => {
      const rect = canvas.getBoundingClientRect();
      const w = width || rect.width || 520;
      const h = rect.height || height;
      const pad = 0.12;
      const mapW = w - 8;
      const mapH = Math.min(h - 8, mapW * 0.5);
      const ox = 4;
      const oy = (h - mapH) / 2;

      ctx.clearRect(0, 0, w, h);
      const ocean = ctx.createLinearGradient(0, oy, 0, oy + mapH);
      ocean.addColorStop(0, '#0d2037');
      ocean.addColorStop(0.5, '#123453');
      ocean.addColorStop(1, '#0d2037');
      ctx.fillStyle = ocean;
      ctx.beginPath();
      roundRectPath(ctx, ox, oy, mapW, mapH, 12);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, ox, oy, mapW, mapH, 12);
      ctx.clip();

      // Graticule
      ctx.strokeStyle = 'rgba(120,170,220,0.12)';
      ctx.lineWidth = 1;
      for (let lon = -150; lon <= 150; lon += 30) {
        const x = ox + ((lon + 180) / 360) * mapW;
        ctx.beginPath();
        ctx.moveTo(x, oy);
        ctx.lineTo(x, oy + mapH);
        ctx.stroke();
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        const y = oy + ((90 - lat) / 180) * mapH;
        ctx.beginPath();
        ctx.moveTo(ox, y);
        ctx.lineTo(ox + mapW, y);
        ctx.stroke();
      }

      // Land
      ctx.beginPath();
      for (const ring of LAND) {
        for (let i = 0; i < ring.length; i++) {
          const p = xy(ring[i][0], ring[i][1], mapW, mapH);
          if (i === 0) ctx.moveTo(ox + p.x, oy + p.y);
          else ctx.lineTo(ox + p.x, oy + p.y);
        }
        ctx.closePath();
      }
      const landGradient = ctx.createLinearGradient(0, oy, 0, oy + mapH);
      landGradient.addColorStop(0, '#a9c8b4');
      landGradient.addColorStop(0.5, '#8fb187');
      landGradient.addColorStop(1, '#a9c8b4');
      ctx.fillStyle = landGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.30)';
      ctx.lineWidth = 0.7;
      ctx.stroke();

      // Visitor dots
      for (const point of pointsRef.current) {
        const p = xy(point.lon, point.lat, mapW, mapH);
        const x = ox + p.x;
        const y = oy + p.y;
        const r = 3.4 + Math.min(4, point.visitors);
        const glow = ctx.createRadialGradient(x, y, 0.5, x, y, r * 4);
        glow.addColorStop(0, 'rgba(224,123,95,0.55)');
        glow.addColorStop(1, 'rgba(224,123,95,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();

        const pulse = (time / 1800 + (hash(point.country) % 10) / 10) % 1;
        ctx.strokeStyle = `rgba(255,170,120,${(1 - pulse) * 0.5})`;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.arc(x, y, r + pulse * 12, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = '#fff6f0';
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#e0703c';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.5, 0, Math.PI * 2);
        ctx.fill();

        if (point.visitors > 1) {
          ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
          ctx.textAlign = 'left';
          ctx.textBaseline = 'middle';
          const label = `+${point.visitors}`;
          const lw = ctx.measureText(label).width + 12;
          ctx.fillStyle = 'rgba(8,13,20,0.85)';
          ctx.beginPath();
          roundRectPath(ctx, x + r + 3, y - 8, lw, 16, 8);
          ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.92)';
          ctx.fillText(label, x + r + 9, y + 0.5);
        }
      }

      // Labels for the countries that actually have visitors
      const active = new Map<string, { lat: number; lon: number }>();
      for (const country of countryPoints()) {
        if (pointsRef.current.some((p) => p.country === country.code)) active.set(country.code, country);
      }
      ctx.font = '600 10px ui-sans-serif, system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const [code, pos] of active) {
        const p = xy(pos.lon, pos.lat, mapW, mapH);
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        ctx.shadowColor = 'rgba(0,0,0,0.7)';
        ctx.shadowBlur = 4;
        ctx.fillText(countryName(code), ox + p.x, oy + p.y - 14);
      }
      ctx.shadowBlur = 0;
      ctx.restore();

      void pad;
    };

    const tick = (time: number) => {
      draw(time);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(raf);
      observer?.disconnect();
    };
  }, [height]);

  return (
    <canvas
      ref={canvasRef}
      height={height}
      style={{ height }}
      className="w-full select-none"
      role="img"
      aria-label={`Flat world map with ${points.length} active locations`}
    />
  );
}
