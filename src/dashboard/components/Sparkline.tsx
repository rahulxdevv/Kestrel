import { useId } from 'react';

/**
 * The little bar-and-line chart from the websites grid. Bars are revenue, the smooth line is
 * visitors. Drawn as one SVG so a page of 30 sites is still a single cheap paint.
 */
export function MiniChart({
  series,
  height = 62,
}: {
  series: { day: string; visitors: number; revenue: number }[];
  height?: number;
}) {
  const gradientId = `mini-area-${useId().replace(/:/g, '')}`;
  const width = 300;
  const data = series.length ? series : [{ day: '', visitors: 0, revenue: 0 }];
  const maxVisitors = Math.max(1, ...data.map((d) => d.visitors));
  const maxRevenue = Math.max(1, ...data.map((d) => d.revenue));
  const step = width / Math.max(1, data.length - 1);

  const point = (d: { visitors: number }, i: number) => ({
    x: data.length === 1 ? width / 2 : i * step,
    y: height - 4 - (d.visitors / maxVisitors) * (height - 12),
  });

  // A smooth path through the points with quadratic midpoints: no spikes, no overshoot.
  const anchors = data.map(point);
  let line = `M ${anchors[0].x} ${anchors[0].y}`;
  for (let i = 1; i < anchors.length; i++) {
    const prev = anchors[i - 1];
    const cur = anchors[i];
    const midX = (prev.x + cur.x) / 2;
    line += ` Q ${prev.x} ${prev.y} ${midX} ${(prev.y + cur.y) / 2} Q ${cur.x} ${cur.y} ${cur.x} ${cur.y}`;
  }
  const area = `${line} L ${anchors[anchors.length - 1].x} ${height} L ${anchors[0].x} ${height} Z`;

  const barWidth = Math.max(2, (width / data.length) * 0.42);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      preserveAspectRatio="none"
      className="block overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8dbdf0" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#8dbdf0" stopOpacity="0" />
        </linearGradient>
      </defs>
      {data.map((d, i) => {
        const h = Math.max(d.revenue > 0 ? 2 : 0.5, (d.revenue / maxRevenue) * (height - 10));
        return (
          <rect
            key={d.day || i}
            x={i * (width / data.length) + (width / data.length - barWidth) / 2}
            y={height - h}
            width={barWidth}
            height={h}
            rx={1.5}
            fill={d.revenue > 0 ? '#f0b3a1' : '#efe9e2'}
          />
        );
      })}
      <path d={area} fill={`url(#${gradientId})`} />
      <path
        d={line}
        fill="none"
        stroke="#7cb1ea"
        strokeWidth={1.6}
        strokeLinecap="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

export function Delta({
  current,
  previous,
  compact = false,
  invert = false,
}: {
  current: number;
  previous: number;
  compact?: boolean;
  /** For metrics where up is bad, such as bounce rate. */
  invert?: boolean;
}) {
  if (!previous) {
    return <span className="text-[11px] font-medium text-stone-400">{current > 0 ? 'new' : '-'}</span>;
  }
  const change = (current - previous) / previous;
  if (!Number.isFinite(change) || Math.abs(change) < 0.005) {
    return <span className="text-[11px] font-medium text-stone-400">0%</span>;
  }
  const up = change > 0;
  const good = invert ? !up : up;
  return (
    <span
      className={`inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-[11px] font-medium tabular-nums ${
        good ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
      } ${compact ? 'text-[10.5px]' : ''}`}
    >
      <span aria-hidden="true">{up ? '↑' : '↓'}</span>
      {Math.abs(Math.round(change * 100))}%
    </span>
  );
}
