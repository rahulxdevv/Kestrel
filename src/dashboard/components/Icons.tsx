import { useState, type ReactNode } from 'react';
import { createAvatar } from '@dicebear/core';
import * as lorelei from '@dicebear/lorelei';
import { domainForSource } from '../../shared/sources';
import { Icon } from './NavIcons';

export function Favicon({ domain, size = 18, fallback }: { domain?: string | null; size?: number; fallback?: ReactNode }) {
  if (!domain) {
    return (
      <span
        className="inline-flex shrink-0 items-center justify-center rounded text-stone-400"
        style={{ width: size, height: size }}
        aria-hidden="true"
      >
        {fallback ?? <LinkIcon size={size} />}
      </span>
    );
  }
  const host = domain.split('/')[0].replace(/^www\./, '');
  const label = (host.split('.')[0] || host).slice(0, 1).toUpperCase();
  const hash = [...host].reduce((value, character) => value * 31 + character.charCodeAt(0), 0) >>> 0;
  const colors = [['#e8f1fb', '#2862a8'], ['#e9f4ed', '#2c7650'], ['#f8eee6', '#a75b35'], ['#f0ebf8', '#7254a2'], ['#fff4dc', '#956b17']];
  const [background, foreground] = colors[hash % colors.length];
  return <span className="inline-flex shrink-0 items-center justify-center rounded-md font-semibold" style={{ width: size, height: size, backgroundColor: background, color: foreground, fontSize: Math.max(9, Math.round(size * 0.62)) }} aria-hidden="true">{label}</span>;
}

export function LinkIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
      <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
    </svg>
  );
}

export function SourceIcon({ source, domain, size }: { source: string | null; domain?: string | null; size?: number }) {
  if (!source || source === 'Direct/None') return <Favicon size={size} />;
  const brand = SOURCE_BRANDS[source];
  if (brand) return <SourceBrandIcon key={source} slug={brand.slug} color={brand.color} source={source} domain={domain} size={size ?? 18} />;
  return <Favicon domain={domainForSource(source) ?? domain ?? (source.includes('.') ? source : null)} size={size} />;
}

const SOURCE_BRANDS: Record<string, { slug: string; color: string }> = {
  X: { slug: 'x', color: '111111' }, Google: { slug: 'google', color: '4285f4' }, Bing: { slug: 'bing', color: '008373' },
  DuckDuckGo: { slug: 'duckduckgo', color: 'de5833' }, Yahoo: { slug: 'yahoo', color: '6001d2' }, Yandex: { slug: 'yandex', color: 'fc3f1d' },
  Baidu: { slug: 'baidu', color: '2932e1' }, Ecosia: { slug: 'ecosia', color: '008009' }, 'Brave Search': { slug: 'brave', color: 'fb542b' },
  ChatGPT: { slug: 'openai', color: '412991' }, Claude: { slug: 'claude', color: 'd97757' }, Perplexity: { slug: 'perplexity', color: '20808d' },
  Gemini: { slug: 'googlegemini', color: '8e75b2' }, Copilot: { slug: 'microsoftcopilot', color: '258ffa' }, DeepSeek: { slug: 'deepseek', color: '4d6bfe' }, Grok: { slug: 'x', color: '111111' },
  YouTube: { slug: 'youtube', color: 'ff0000' }, LinkedIn: { slug: 'linkedin', color: '0a66c2' }, Reddit: { slug: 'reddit', color: 'ff4500' },
  Facebook: { slug: 'facebook', color: '0866ff' }, Instagram: { slug: 'instagram', color: 'e4405f' }, Threads: { slug: 'threads', color: '111111' },
  TikTok: { slug: 'tiktok', color: '111111' }, Pinterest: { slug: 'pinterest', color: 'bd081c' }, Bluesky: { slug: 'bluesky', color: '0285ff' },
  Mastodon: { slug: 'mastodon', color: '6364ff' }, 'Hacker News': { slug: 'ycombinator', color: 'f0652f' }, Medium: { slug: 'medium', color: '111111' },
  Substack: { slug: 'substack', color: 'ff6719' }, 'Dev.to': { slug: 'devdotto', color: '0a0a0a' }, GitHub: { slug: 'github', color: '181717' },
  Gmail: { slug: 'gmail', color: 'ea4335' }, Outlook: { slug: 'microsoftoutlook', color: '0078d4' },
};

function SourceBrandIcon({ slug, color, source, domain, size }: { slug: string; color: string; source: string; domain?: string | null; size: number }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <Favicon domain={domainForSource(source) ?? domain ?? null} size={size} />;
  return <img src={`https://cdn.simpleicons.org/${slug}/${color}`} width={size} height={size} className="shrink-0 object-contain" alt="" loading="lazy" onError={() => setBroken(true)} />;
}

/** One glyph per acquisition channel, so rows stay legible without a favicon request. */
const CHANNEL_ICON: Record<string, string> = {
  Direct: 'globe',
  'Organic Search': 'search',
  'Organic Social': 'message',
  AI: 'sparkles',
  Referral: 'externalLink',
  Email: 'mail',
  Paid: 'creditCard',
};

export function ChannelIcon({ channel }: { channel: string | null }) {
  const name = CHANNEL_ICON[channel ?? ''] ?? 'globe';
  return (
    <span className="inline-flex shrink-0 items-center justify-center text-stone-500" aria-hidden="true">
      <Icon name={name} size={17} />
    </span>
  );
}

const BROWSER_DOMAINS: Record<string, string> = {
  Chrome: 'google.com/chrome',
  'Chrome WebView': 'android.com',
  Safari: 'apple.com/safari',
  'Mobile Safari': 'apple.com/safari',
  Firefox: 'firefox.com',
  Edge: 'microsoft.com/edge',
  Opera: 'opera.com',
  'Samsung Internet': 'samsung.com',
  Brave: 'brave.com',
  Arc: 'arc.net',
  Vivaldi: 'vivaldi.com',
  Yandex: 'browser.yandex.com',
  DuckDuckGo: 'duckduckgo.com',
  Instagram: 'instagram.com',
  Facebook: 'facebook.com',
  Twitter: 'x.com',
  LinkedIn: 'linkedin.com',
  Threads: 'threads.net',
  TikTok: 'tiktok.com',
  WebKit: 'webkit.org',
};
const OS_DOMAINS: Record<string, string> = {
  'Mac OS': 'apple.com',
  iOS: 'apple.com',
  iPadOS: 'apple.com',
  Windows: 'microsoft.com',
  Android: 'android.com',
  Linux: 'kernel.org',
  'Chrome OS': 'chromeos.google',
};

export function BrowserIcon({ name, size }: { name: string | null; size?: number }) {
  const brand = name ? BROWSER_BRANDS[name] : null;
  return brand ? <SourceBrandIcon slug={brand.slug} color={brand.color} source={name!} size={size ?? 18} /> : <Favicon domain={name ? BROWSER_DOMAINS[name] : null} size={size} fallback={<Icon name="browser" size={size ?? 18} />} />;
}

export function OSIcon({ name, size }: { name: string | null; size?: number }) {
  const brand = name ? OS_BRANDS[name] : null;
  return brand ? <SourceBrandIcon slug={brand.slug} color={brand.color} source={name!} size={size ?? 18} /> : <Favicon domain={name ? OS_DOMAINS[name] : null} size={size} fallback={<Icon name="cpu" size={size ?? 18} />} />;
}

const BROWSER_BRANDS: Record<string, { slug: string; color: string }> = {
  Chrome: { slug: 'googlechrome', color: '4285f4' }, Firefox: { slug: 'firefox', color: 'ff7139' }, Edge: { slug: 'microsoftedge', color: '0c8ce9' },
  Opera: { slug: 'opera', color: 'ff1b2d' }, Brave: { slug: 'brave', color: 'fb542b' }, Safari: { slug: 'safari', color: '006cff' },
  'Mobile Safari': { slug: 'safari', color: '006cff' }, 'Chrome WebView': { slug: 'googlechrome', color: '4285f4' },
  'Samsung Internet': { slug: 'samsunginternet', color: '1428a0' }, Arc: { slug: 'arc', color: 'fc4f5b' }, Vivaldi: { slug: 'vivaldi', color: 'ef3939' },
};
const OS_BRANDS: Record<string, { slug: string; color: string }> = {
  'Mac OS': { slug: 'macos', color: '111111' }, iOS: { slug: 'ios', color: '111111' }, iPadOS: { slug: 'ipados', color: '111111' },
  Windows: { slug: 'windows11', color: '0078d4' }, Android: { slug: 'android', color: '3ddc84' }, Linux: { slug: 'linux', color: 'fcc624' },
};

const DEVICE_ICON: Record<string, string> = { Mobile: 'smartphone', Tablet: 'tablet', Desktop: 'monitor' };

export function DeviceIcon({ name, size = 18 }: { name: string | null; size?: number }) {
  return (
    <span className="inline-flex shrink-0 items-center justify-center text-stone-500" aria-hidden="true">
      <Icon name={DEVICE_ICON[name ?? ''] ?? 'monitor'} size={size} />
    </span>
  );
}

/**
 * Every country gets a real flag. The image comes from flagcdn (public-domain flag artwork), and
 * the hand-drawn shapes below are only the offline fallback when that request fails.
 */
export function Flag({ cc, size = 18 }: { cc: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  const code = cc && cc.length === 2 && cc !== 'XX' && cc !== 'T1' ? cc.toUpperCase() : null;
  const width = Math.round(size * 1.5);
  if (!code) {
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-stone-400" style={{ width: size, height: size }} aria-hidden="true">
        <Icon name="globe" size={size - 3} />
      </span>
    );
  }
  if (broken) {
    if (FLAG_SHAPES[code]) {
      return (
        <svg
          viewBox="0 0 24 16"
          width={width}
          height={size}
          className="shrink-0 rounded-[2px] border border-black/10"
          role="img"
          aria-label={`${code} flag`}
        >
          {FLAG_SHAPES[code]}
        </svg>
      );
    }
    return (
      <span className="inline-flex shrink-0 items-center justify-center text-stone-400" style={{ width: size, height: size }} aria-hidden="true">
        <Icon name="globe" size={size - 3} />
      </span>
    );
  }
  return (
    <img
      src={`https://flagcdn.com/w80/${code.toLowerCase()}.png`}
      width={width}
      height={size}
      className="shrink-0 rounded-[2px] border border-black/10 object-cover"
      alt=""
      loading="lazy"
      onError={() => setBroken(true)}
    />
  );
}

const FLAG_SHAPES: Record<string, ReactNode> = {
  US: <g>
    {Array.from({ length: 13 }, (_, i) => <rect key={i} y={(16 / 13) * i} width="24" height={16 / 13} fill={i % 2 ? '#fff' : '#b22234'} />)}
    <rect width="10.5" height="8.6" fill="#3c3b6e" />
    {[[2, 2], [5, 2], [8, 2], [3.5, 4.4], [6.5, 4.4], [2, 6.8], [5, 6.8], [8, 6.8]].map(([x, y], i) => <circle key={i} cx={x} cy={y} r=".55" fill="#fff" />)}
  </g>,
  CA: <g><rect width="24" height="16" fill="#fff" /><rect width="5.2" height="16" fill="#d80621" /><rect x="18.8" width="5.2" height="16" fill="#d80621" /><path d="m12 3 1.1 2.2 1.8-.5-.9 2 2 1.1-2 .8.8 2.1-1.7-.8-.7 2.8-.8-2.8-1.7.8.7-2.1-1.9-.8 1.9-1.1-.8-2 1.8.5Z" fill="#d80621" /></g>,
  IN: <g><rect width="24" height="5.34" fill="#ff9933" /><rect y="5.33" width="24" height="5.34" fill="#fff" /><rect y="10.66" width="24" height="5.34" fill="#138808" /><circle cx="12" cy="8" r="2.15" fill="none" stroke="#000080" strokeWidth=".45" />{Array.from({ length: 12 }, (_, i) => <path key={i} d="M12 5.9v4.2" stroke="#000080" strokeWidth=".2" transform={`rotate(${i * 30} 12 8)`} />)}</g>,
  DE: <g><rect width="24" height="5.34" fill="#000" /><rect y="5.33" width="24" height="5.34" fill="#dd0000" /><rect y="10.66" width="24" height="5.34" fill="#ffce00" /></g>,
  GB: <g><rect width="24" height="16" fill="#012169" /><path d="m0 0 24 16m0-16L0 16" stroke="#fff" strokeWidth="4" /><path d="m0 0 24 16m0-16L0 16" stroke="#c8102e" strokeWidth="1.5" /><path d="M12 0v16M0 8h24" stroke="#fff" strokeWidth="6" /><path d="M12 0v16M0 8h24" stroke="#c8102e" strokeWidth="2.6" /></g>,
  BR: <g><rect width="24" height="16" fill="#009739" /><path d="m12 2 9 6-9 6-9-6Z" fill="#ffdf00" /><circle cx="12" cy="8" r="3.1" fill="#002776" /><path d="M9 7.2c2-.7 4.8-.4 6.5.7" fill="none" stroke="#fff" strokeWidth=".4" /></g>,
  AU: <g><rect width="24" height="16" fill="#00008b" /><path d="M0 0 12 8m0-8L0 8" stroke="#fff" strokeWidth="2.4" /><path d="M0 0 12 8m0-8L0 8" stroke="#c8102e" strokeWidth=".9" /><path d="M6 0v8M0 4h12" stroke="#fff" strokeWidth="3" /><path d="M6 0v8M0 4h12" stroke="#c8102e" strokeWidth="1.2" /><path d="m17 2 .45 1.2 1.3.05-1 .8.35 1.2-1.1-.7-1.1.7.35-1.2-1-.8 1.3-.05Z M21 8l.4 1 1.1.05-.85.65.3 1-.95-.6-.95.6.3-1-.85-.65 1.1-.05Z M16 11l.4 1.1 1.2.05-.9.7.3 1.1-1-.65-1 .65.3-1.1-.9-.7 1.2-.05Z" fill="#fff" /></g>,
  FR: <g><rect width="8" height="16" fill="#002395" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#ed2939" /></g>,
  IT: <g><rect width="8" height="16" fill="#009246" /><rect x="8" width="8" height="16" fill="#fff" /><rect x="16" width="8" height="16" fill="#ce2b37" /></g>,
  JP: <g><rect width="24" height="16" fill="#fff" /><circle cx="12" cy="8" r="4.2" fill="#bc002d" /></g>,
  CN: <g><rect width="24" height="16" fill="#de2910" /><path d="m4 2 .6 1.8 1.9.1-1.5 1.1.5 1.8L4 5.7 2.5 6.8 3 5 1.5 3.9l1.9-.1Z" fill="#ffde00" /></g>,
  NL: <g><rect width="24" height="5.34" fill="#ae1c28" /><rect y="5.33" width="24" height="5.34" fill="#fff" /><rect y="10.66" width="24" height="5.34" fill="#21468b" /></g>,
  ES: <g><rect width="24" height="4" fill="#aa151b" /><rect y="4" width="24" height="8" fill="#f1bf00" /><rect y="12" width="24" height="4" fill="#aa151b" /></g>,
};

/* ------------------------------------------------------------------ *
 * Profile pictures
 *
 * Every visitor gets their own illustrated face, derived from their id: skin tone, hairstyle,
 * hair colour, glasses, beard and shirt are all picked by a hash, so one person always looks
 * the same across the dashboard and no two people share a picture.
 * ------------------------------------------------------------------ */

const AV_BG = ['#17181c', '#1c2129', '#241d2c', '#16222a', '#1f2629', '#1b2621', '#272019', '#1a2130'];
const AV_SKIN = ['#f6d3b3', '#f0c49d', '#e5b189', '#d69c71', '#c0875a', '#9d6a45', '#7c5033', '#5e3c27'];
const AV_HAIR = ['#141414', '#241a14', '#3d2a1c', '#5c3a20', '#8a5c2b', '#b8813f', '#d9c07a', '#9a9a9a', '#e9e6e0', '#a34a24', '#7b4bd6', '#c74f7a'];
const AV_SHIRT = ['#3f6fb5', '#4a8f6f', '#b45f4a', '#7a5fc0', '#c9a24a', '#3f9aa8', '#c46b8a', '#586474', '#2f3b4a', '#a9563f'];

const hashId = (s: string) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
};

/** The pieces one id always maps to, so the same visitor looks the same everywhere. */
export function avatarTraits(id: string) {
  const h = hashId(id || 'guest');
  const pick = (arr: string[], salt: number) => arr[Math.floor(h / salt) % arr.length];
  return {
    bg: pick(AV_BG, 1),
    skin: pick(AV_SKIN, 7),
    hair: pick(AV_HAIR, 3),
    shirt: pick(AV_SHIRT, 13),
    hairStyle: Math.floor(h / 5) % 8,
    beard: Math.floor(h / 17) % 3,
    glasses: Math.floor(h / 29) % 3 === 0,
    smile: Math.floor(h / 37) % 3,
  };
}

/** SVG inner markup for a face. Shared by the React avatar and the map markers. */
export function avatarInner(id: string): string {
  const t = avatarTraits(id);
  const esc = (s: string) => s.replace(/[^#a-z0-9()., ]/gi, '');
  const skin = esc(t.skin);
  const hair = esc(t.hair);
  const parts: string[] = [];

  parts.push(`<rect width="64" height="64" rx="${18}" fill="${esc(t.bg)}"/>`);

  // Long hair sits behind the head.
  if (t.hairStyle === 3) parts.push(`<ellipse cx="32" cy="33" rx="18.5" ry="19" fill="${hair}"/>`);
  if (t.hairStyle === 7) parts.push(`<circle cx="32" cy="23" r="17.5" fill="${hair}"/>`);

  // Shoulders, neck, head.
  parts.push(`<path d="M6 64c1.6-12 11-17.5 26-17.5S56.4 52 58 64Z" fill="${esc(t.shirt)}"/>`);
  parts.push(`<path d="M27.5 40h9v9.5c0 2.5-9 2.5-9 0Z" fill="${skin}"/>`);
  parts.push(`<ellipse cx="32" cy="30" rx="15" ry="16.5" fill="${skin}"/>`);
  parts.push(`<circle cx="17.6" cy="32" r="3.3" fill="${skin}"/><circle cx="46.4" cy="32" r="3.3" fill="${skin}"/>`);

  // Hair on top: a crescent hairline, with per-style extras.
  const hairline = `M16.8 30c0-12.5 6.6-18.5 15.2-18.5S47.2 17.5 47.2 30c-1.6-7.6-6.2-11-15.2-11S18.4 22.4 16.8 30Z`;
  if (t.hairStyle !== 6) parts.push(`<path d="${hairline}" fill="${hair}"/>`);
  if (t.hairStyle === 1) parts.push(`<path d="M17.6 26.5c1.4-7.6 7-12 14.4-12s13 4.4 14.4 12c-3-5.4-8-7.6-14.4-7.6S20.6 21.1 17.6 26.5Z" fill="${hair}" opacity=".75"/>`);
  if (t.hairStyle === 2)
    parts.push(
      `<circle cx="22" cy="16" r="6" fill="${hair}"/><circle cx="32" cy="13" r="6.6" fill="${hair}"/><circle cx="42" cy="16" r="6" fill="${hair}"/><circle cx="27" cy="11" r="5" fill="${hair}"/><circle cx="37" cy="11" r="5" fill="${hair}"/>`,
    );
  if (t.hairStyle === 4) parts.push(`<circle cx="45.5" cy="14.5" r="7" fill="${hair}"/>`);
  if (t.hairStyle === 5)
    parts.push(`<path d="M17.5 24.5c3-8 10-12.5 19-11.5-6 1.5-11 5-13.5 10.5Z" fill="${hair}"/>`);
  if (t.hairStyle === 6) parts.push(`<path d="M17.4 28.5c1-9.6 7-15 14.6-15s13.6 5.4 14.6 15c-3.4-6.4-8.4-9-14.6-9s-11.2 2.6-14.6 9Z" fill="${hair}" opacity=".25"/>`);

  // Brows, eyes, nose.
  parts.push(`<path d="M23 26.4q3.6-2.2 7.2-.2" stroke="${hair}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M33.8 26.2q3.6-2 7.2.2" stroke="${hair}" stroke-width="2.1" fill="none" stroke-linecap="round"/>`);
  parts.push(`<circle cx="26.6" cy="31" r="2.3" fill="#1a1a1e"/><circle cx="37.4" cy="31" r="2.3" fill="#1a1a1e"/>`);
  parts.push(`<circle cx="27.4" cy="30.2" r=".8" fill="#fff"/><circle cx="38.2" cy="30.2" r=".8" fill="#fff"/>`);
  parts.push(`<path d="M31.6 34.4c0 2.2-1.4 3.4-3 3.6" stroke="rgba(0,0,0,.22)" stroke-width="1.6" fill="none" stroke-linecap="round"/>`);

  // Beard before the mouth, so the smile stays visible.
  if (t.beard)
    parts.push(
      `<ellipse cx="32" cy="41.5" rx="12.6" ry="9.6" fill="${hair}" opacity="${t.beard === 1 ? '.38' : '.92'}"/><ellipse cx="32" cy="37" rx="9.4" ry="6" fill="${skin}"/>`,
    );

  const mouth =
    t.smile === 0
      ? `<path d="M28.4 41.6q3.6 3.2 7.2 0" stroke="#8a4a44" stroke-width="2" fill="none" stroke-linecap="round"/>`
      : t.smile === 1
        ? `<path d="M28.6 42h6.8" stroke="#8a4a44" stroke-width="2" fill="none" stroke-linecap="round"/>`
        : `<path d="M28.4 41.2q3.6 4.4 7.2 0" stroke="#8a4a44" stroke-width="2" fill="none" stroke-linecap="round"/>`;
  parts.push(mouth);

  if (t.glasses)
    parts.push(
      `<g stroke="#1d1d21" stroke-width="1.7" fill="rgba(255,255,255,.14)"><rect x="20.6" y="26.6" width="10.4" height="8.6" rx="3.4"/><rect x="33" y="26.6" width="10.4" height="8.6" rx="3.4"/><path d="M31 30.2h2" fill="none"/></g>`,
    );

  return parts.join('');
}

/** The illustrated profile picture every visitor keeps across the dashboard. */
export function Avatar({ id, size = 40, className = '' }: { id: string; size?: number; className?: string }) {
  return (
    <span className={`block shrink-0 overflow-hidden rounded-full ${className}`} style={{ width: size, height: size }}
      role="img" aria-label="Visitor profile" dangerouslySetInnerHTML={{ __html: profileSvg(id, size) }} />
  );
}

/** Same face as a plain HTML string, for map marker elements that are not React. */
export function avatarMarkup(id: string, size: number): string {
  return profileSvg(id, size);
}

function profileSvg(id: string, size: number): string {
  const backgrounds = ['dbeafe', 'dcfce7', 'fef3c7', 'fce7f3', 'ede9fe', 'cffafe', 'ffedd5'];
  return createAvatar(lorelei, {
    seed: id || 'anonymous-visitor', size, radius: 18, backgroundType: ['solid'],
    backgroundColor: [backgrounds[hashId(id || 'anonymous-visitor') % backgrounds.length]],
  }).toString();
}
