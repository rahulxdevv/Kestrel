/**
 * The dashboard's one icon system: 24px grid, 1.8 stroke, round caps and joins, currentColor.
 * Every pictogram in the app (navigation, tables, realtime feed, channels, devices) comes from
 * here so weight and optical size stay consistent. No emoji, no mixed symbol fonts.
 */
const paths: Record<string, string> = {
  overview: 'M4 19V9m5 10V5m5 14v-7m5 7V8',
  pulse: 'M3 12h4l2.5-7 4 14 2.5-7H21',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7ZM17 4a3.5 3.5 0 0 1 0 7M21 20v-1.5a4 4 0 0 0-3-3.87',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-4.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9Zm0-3a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z',
  settings: 'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm8-3.5a8 8 0 0 0-.14-1.5l2-1.56-2-3.46-2.36.94A8 8 0 0 0 15 4.6L14.6 2h-5.2L9 4.6a8 8 0 0 0-2.5 1.82L4.14 5.5l-2 3.46L4.14 10.5A8 8 0 0 0 4 12c0 .51.05 1.01.14 1.5l-2 1.56 2 3.46 2.36-.94A8 8 0 0 0 9 19.4L9.4 22h5.2l.4-2.6a8 8 0 0 0 2.5-1.82l2.36.94 2-3.46-2-1.56c.09-.49.14-.99.14-1.5Z',
  plus: 'M12 5v14M5 12h14',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M5 21h14',
  share: 'M4 12v7a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7M12 3v13m0-13 4 4m-4-4L8 7',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H3',
  book: 'M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Zm0 0v16',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0 0c2.5-2.4 4-5.6 4-9s-1.5-6.6-4-9c-2.5 2.4-4 5.6-4 9s1.5 6.6 4 9ZM3.5 9h17M3.5 15h17',
  filter: 'M3 5h18l-7 8v5.5l-4 2V13L3 5Z',
  search: 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm10 2-4.35-4.35',
  sparkles:
    'M11 3l1.7 4.1L17 8.8l-4.3 1.7L11 14.6 9.3 10.5 5 8.8l4.3-1.7L11 3ZM18.5 14l.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1ZM6 14l.7 1.6L8.3 16l-1.6.7L6 18.3l-.7-1.6L3.7 16l1.6-.4L6 14Z',
  file: 'M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Zm0 0v5h5M9 13h6M9 17h5',
  arrowUpRight: 'M7 17 17 7M9.5 7H17v7.5',
  dollar: 'M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6',
  monitor: 'M3 4.5h18v11H3zM8.5 20h7M12 15.5V20',
  smartphone: 'M7.5 2h9a1.5 1.5 0 0 1 1.5 1.5v17a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 6 20.5v-17A1.5 1.5 0 0 1 7.5 2Zm4 16.5h1',
  tablet: 'M4 2.5h16v19H4zM10.5 18.5h3',
  mail: 'M3 5.5h18v13H3zM3 7l9 6 9-6',
  message: 'M21 11.5a8.5 8.5 0 0 1-12.2 7.7L3.5 21l1.8-5.3A8.5 8.5 0 1 1 21 11.5Z',
  creditCard: 'M2.5 6.5h19v11h-19zM2.5 10.5h19M6 14.5h3',
  externalLink: 'M14 4h6v6M20 4 10.5 13.5M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  check: 'M4.5 12.5 9.5 17.5 19.5 6.5',
  x: 'M6 6l12 12M18 6 6 18',
  maximize: 'M8.5 3.5H3v5.5M15.5 3.5H21V9M21 15.5V21h-5.5M3 15.5V21h5.5',
  database:
    'M4 6c0-1.7 3.6-3 8-3s8 1.3 8 3-3.6 3-8 3-8-1.3-8-3Zm0 0v12c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3',
  package: 'M12 2.5 3.5 7v10L12 21.5l8.5-4.5V7L12 2.5Zm0 0v9.8M3.5 7l8.5 5.3 8.5-5.3',
  lock: 'M5.5 10.5h13v10h-13zM8.5 10.5v-3a3.5 3.5 0 0 1 7 0v3',
  tag: 'M3.5 3.5H12l8.5 8.5-8.5 8.5L3.5 12V3.5Zm5 5h.01',
  compass: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm3-12-2.2 5.2L7.6 16.4l2.2-5.2L15 9Z',
  zap: 'M13 2.5 4.5 14H11l-1 7.5 9.5-12H13l1-7Z',
  cloud: 'M6.5 18.5a4 4 0 0 1 .6-8 6 6 0 0 1 11.4 1.4A3.6 3.6 0 0 1 17.5 18.5h-11Z',
  server: 'M3.5 4.5h17v6h-17zM3.5 14.5h17v5h-17zM7 7.5h.01M7 17h.01',
  terminal: 'M4.5 17l6-5-6-5M12.5 19h7',
  layers: 'M12 3 3.5 7.5 12 12l8.5-4.5L12 3ZM3.5 12.5 12 17l8.5-4.5M3.5 17.5 12 22l8.5-4.5',
  menu: 'M4 7h16M4 12h16M4 17h16',
  chevronDown: 'm6 9 6 6 6-6',
  chevronRight: 'm9 6 6 6-6 6',
  copy: 'M8.5 8.5V5A1.5 1.5 0 0 1 10 3.5h9A1.5 1.5 0 0 1 20.5 5v9a1.5 1.5 0 0 1-1.5 1.5h-3.5M4 9.5h9.5A1.5 1.5 0 0 1 15 11v8.5a1.5 1.5 0 0 1-1.5 1.5H5.5A1.5 1.5 0 0 1 4 19.5v-10Z',
  shield: 'M12 3 4.5 6v5.5c0 4.4 3.1 7.8 7.5 9.5 4.4-1.7 7.5-5.1 7.5-9.5V6L12 3Zm-3 8.5 2.2 2.2 4.3-4.3',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-14v5l3.5 2',
  refresh: 'M20.5 12a8.5 8.5 0 1 1-2.49-6.01M20.5 3.5v5h-5',
  browser: 'M3.5 5.5h17v13h-17zM3.5 9.5h17M6.7 7.5h.01M9.3 7.5h.01M11.9 7.5h.01',
  cpu: 'M9 9h6v6H9zM7 7h10v10H7zM9.5 2.5v3M14.5 2.5v3M9.5 18.5v3M14.5 18.5v3M2.5 9.5h3M2.5 14.5h3M18.5 9.5h3M18.5 14.5h3',
};

export function Icon({
  name,
  size = 18,
  className = '',
  strokeWidth = 1.8,
}: {
  name: keyof typeof paths | string;
  size?: number;
  className?: string;
  strokeWidth?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name] ?? paths.overview} />
    </svg>
  );
}