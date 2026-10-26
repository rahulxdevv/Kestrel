# Kestrel

**Web analytics that answers "did that post make money?"**

Kestrel is a self-hosted analytics platform built around revenue and content, not pageview trivia. One
container, one SQLite file, a 2.6 KB tracker, and a dashboard that puts the tweet, the reel, the video or the
Google result next to the money it produced.

- **Self-hosted and owned.** Your data is a single file you can copy with `cp`.
- **Revenue-first.** Payments are stitched back to the visit that caused them.
- **Content-first.** Every visit is traced to the post, campaign or page that produced it.
- **Live and visual.** A rotating 3D globe and a flat world map show who is on the site right now.
- **Agent-ready.** A read-only MCP server lets Claude, Cursor or your own script query your numbers.
- **Tiny and fast.** A 2.6 KB tracker, no third-party calls, no cookie banner from us.
- **MIT licensed.** Free for commercial use. © 2026 rahulxdevv.

---

## What is inside

| Area | What you get |
| --- | --- |
| **Dashboard** | All websites at a glance: revenue, visitors, sales, average order, who is online, 7- and 30-day windows, sorting and per-site sparklines |
| **Overview** | Visitors (new vs returning), revenue, conversion, revenue per visitor, bounce rate, session time, online now, each compared with the previous period |
| **Chart** | Visitors and revenue by hour, day, week or month, with the source logo pinned to traffic spikes so you can see *what* caused them |
| **Content** | Ranked by revenue and visitors: X posts, Instagram reels, YouTube videos, Facebook posts, newsletters, campaigns, landing pages, with a direct link to the post |
| **Goals** | Multi-series goal and page trends, custom event properties, multi-step funnels with drop-off |
| **AI assistants** | A dedicated channel for ChatGPT, Claude, Gemini, Perplexity, Copilot, DeepSeek and Grok, over time and by assistant |
| **Live** | 30-minute realtime view, draggable 3D globe and 2D world map, live pages, sources, countries, devices and an event feed |
| **Audience** | Country, region, city, browser, OS, device, hostname, entry and exit pages, outbound links |
| **Revenue** | Customer journeys with source, amount and time to convert; Dodo Payments webhooks plus a generic payments API |
| **Agents** | MCP server with seven read-only tools, site-scoped API keys, copy-paste config for Claude Code and Cursor |
| **Languages** | Dashboard navigation, metrics and grids in English, Spanish, German, French, Portuguese, Hindi, Japanese and Chinese |
| **Sharing** | Read-only public dashboard link per site, no accounts required |
| **Export** | CSV for every table, filtered exactly like the screen |
| **Ops** | Multi-site, one password, rate limiting, `/api/health`, automatic migrations, single-file backups |

Click any row to filter the dashboard. Filters live in the URL, so a filtered view can be bookmarked or
shared.

---

## Quick start

### Docker

```bash
git clone https://github.com/rahulxdevv/kestrel.git
cd kestrel

docker build -t kestrel .
docker run -d --name kestrel -p 3000:3000 \
  -v kestrel-data:/data \
  -e ADMIN_PASSWORD='a-strong-password' \
  -e SESSION_SECRET="$(openssl rand -hex 32)" \
  kestrel
```

Open `http://localhost:3000`, sign in, add your domain and copy the snippet. The database, session secret and
migrations are created on first boot.

Or with Compose:

```bash
cp .env.example .env      # set ADMIN_PASSWORD
docker compose up -d
```

Everything lives in the `kestrel-data` volume at `/data/kestrel.db`:

```bash
sqlite3 /data/kestrel.db ".backup '/data/backup.db'"
```

### Node

Requires **Node 22.13+** (24 LTS recommended) for the built-in `node:sqlite` module.

```bash
npm ci
cp .env.example .env      # set ADMIN_PASSWORD
npm run dev               # open http://localhost:3000 (Vite + API, hot reload)
```

Vite compiles the TypeScript/React dashboard and reloads it as you edit. It serves the homepage and
dashboard on port `3000`, and forwards `/api` requests to the local Node API in the background. You only
need to open one URL; the second process is the API, not another page to visit.

```bash
npm run seed              # 30 days of demo data + /share/demo-preview
npm run build && npm start
npm test
npm run typecheck
```

`npm run dev:cf` runs the same app on Cloudflare's local Workers runtime.

---

## Install on a site

```html
<script defer data-website-id="SITE_ID" src="https://YOUR-KESTREL-HOST/js/kestrel.js"></script>
```

- **Goals**: `<button data-kestrel-goal="signup_click">` or `window.kestrel('goal', 'signup', { plan: 'pro' })`
- **Goal details**: `data-kestrel-goal-plan="pro"` becomes `{ plan: 'pro' }`
- **Identify users**: `window.kestrel('identify', { user_id, email, name })`
- **Opt out**: open `https://yoursite.com/?kt_ignore=true` once per browser
- **SPAs**: route changes are tracked automatically
- **Subdomains**: share one visitor because the cookie is set on the root domain

### Tag the post, not just the referrer

X, Instagram, YouTube and Facebook only send the referrer host (`t.co`, `l.instagram.com`), never the post.
Put the post URL in `?ref=` (or a name in `?utm_content=`) and the exact post becomes the row you see:

```
https://yoursite.com/?ref=https://x.com/you/status/1234567890
https://yoursite.com/?ref=https://www.instagram.com/reel/C9xYzAbCdEf/
https://yoursite.com/?utm_source=youtube&utm_content=review-2026
https://yoursite.com/?utm_source=newsletter&utm_campaign=issue-44
```

Kestrel links the row to the post, shows the visitors and revenue it produced, and annotates the traffic
spike on the chart with that source's logo. UTM source, medium, campaign, term and content are stored as
well, so campaign reporting works without extra setup.

### Ad blockers

Serve the tracker and endpoint from your own domain:

```js
// next.config.js
async rewrites() {
  return [
    { source: '/stats/script.js', destination: 'https://YOUR-KESTREL-HOST/js/kestrel.js' },
    { source: '/stats/event', destination: 'https://YOUR-KESTREL-HOST/api/event' },
  ];
}
```

```html
<script defer data-website-id="SITE_ID" data-api="/stats/event" src="/stats/script.js"></script>
```

---

## Revenue attribution

### Dodo Payments

1. In Dodo → **Developer → Webhooks**, add `https://YOUR-HOST/api/webhooks/dodo/SITE_ID` for
   `payment.succeeded` and `refund.succeeded`. Paste the signing secret into site settings.
2. Pass the visitor cookies as checkout metadata:

```ts
import { cookies } from 'next/headers';

const jar = await cookies();
await dodo.checkoutSessions.create({
  product_cart: [{ product_id: 'pdt_xxx', quantity: 1 }],
  return_url: 'https://yoursite.com/thanks',
  metadata: {
    kt_visitor_id: jar.get('kt_vid')?.value ?? '',
    kt_session_id: jar.get('kt_sid')?.value ?? '',
  },
});
```

Using payment links? The tracker adds those parameters automatically. In the browser you can read them with
`window.kestrel.attribution()`.

3. Point the product's return URL at a page on your site (for example `/thanks`). Dodo appends
   `?payment_id=…`, which lets Kestrel match the payment even when metadata is lost.

**How credit is given:** a payment goes to the paying visitor's last visit that came from a real source. So
"clicked a tweet, came back directly 17 days later and paid" is credited to the tweet. When metadata is
missing, Kestrel tries the return page, an earlier payment by the same customer (renewals), an email you
`identify()`'d, then checkout timing (only when exactly one visitor clicked a checkout link in the three
hours before the payment). The Journey view shows how each payment was matched, and **Try matching again**
re-runs the fallbacks. Refunds are subtracted from revenue.

### Any other provider

```bash
curl -X POST https://YOUR-HOST/api/v1/payments \
  -H "Authorization: Bearer k_..." \
  -H "Content-Type: application/json" \
  -d '{"transaction_id":"txn_1","amount":29.99,"currency":"USD","visitor_id":"<kt_vid cookie>","email":"jane@acme.com"}'
```

---

## Give your agent access (MCP)

Kestrel runs a read-only Model Context Protocol server at `/api/mcp`, authenticated with a site API key.

```bash
claude mcp add --transport http kestrel https://YOUR-HOST/api/mcp \
  --header "Authorization: Bearer k_site_key"
```

```json
{
  "mcpServers": {
    "kestrel": {
      "type": "http",
      "url": "https://YOUR-HOST/api/mcp",
      "headers": { "Authorization": "Bearer k_site_key" }
    }
  }
}
```

Tools: `get_overview`, `get_traffic_sources`, `get_content_performance`, `get_top_pages`, `get_audience`,
`get_live_visitors`, `get_site_info`. The key can read one site and nothing else, and no tool can write or
delete. Protocol, curl examples and prompts: [docs/MCP.md](docs/MCP.md).

---

## Deploy

### Dokploy, Coolify or any Docker host

1. Create an application from this repository.
2. Build type: **Dockerfile** (multi-stage; the runtime image carries only the bundle).
3. Add a persistent volume mounted at `/data`.
4. Set `ADMIN_PASSWORD` and `SESSION_SECRET` (and optionally `SITE_URL`).
5. Point the domain at port `3000`. Health check: `/api/health`.

For a public showcase, set `DEMO_MODE=true` and run `npm run seed` once in the deployed container after
its first start. This opens the full dashboard with the Kestrel Demo sample and disables every API write,
including site/funnel changes and incoming tracking/payment events. Visitors can explore Overview, Live,
Content, Audience, and Goals without logging in; settings, exports, and editing controls are hidden. The
demo is illustrative and does not collect production analytics. Set `DEMO_MODE=false` to return to the
password-protected dashboard. Seeded “online now” visitors expire after five minutes.

### Render

Use the included `render.yaml`. SQLite needs a persistent disk, so attach one at `/data` and set
`DATA_DIR=/data`.

### Cloudflare Workers

```bash
npm run db:migrate:cf
npm run deploy:cloudflare
```

D1 replaces SQLite; the same Hono app, queries and dashboard are used.

### Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `ADMIN_PASSWORD` | - | Dashboard password. Required. |
| `SESSION_SECRET` | generated | Signs the login cookie. |
| `DATA_DIR` | `data` | Folder for the database and generated secret. |
| `DATABASE_PATH` | `$DATA_DIR/kestrel.db` | Exact SQLite file path. |
| `ASSETS_DIR` | `dist` | Built static files. |
| `SITE_URL` | request origin | Public URL used in snippets and docs. |
| `INGEST_RATE_LIMIT` | `300` | Tracked events per minute per IP. `0` disables. |
| `DEMO_MODE` | `false` | Public sample-data dashboard with every API write disabled. |
| `MIGRATIONS_DIR` | `migrations` | SQL migration folder. |

---

## Privacy and accuracy

- **First-party only.** Cookies are `kt_vid` and `kt_sid` on your own domain. The tracker makes no third-party
  requests and sells no data; whether you need a consent banner depends on your jurisdiction. The dataset is
  deliberately minimal and no full IP address is stored.
- **Bots are filtered** by user agent and `navigator.webdriver`.
- **No analytics tool is perfectly accurate.** Ad blockers may drop the tracker; payments still arrive by
  webhook and are matched to a visitor.
- **Safari** caps JavaScript cookies at seven days. A returning Safari visitor may count as new; email and
  payment fallbacks recover most attributed revenue.
- **Geo needs proxy headers** (Cloudflare, Vercel, or a GeoIP module such as Caddy/Traefik). Nothing else is
  sent to a third party. The world map positions visitors by country and city centroid, never by IP.
- **Currencies** are converted only when the payment provider supplies a settlement amount in the site's
  currency.

---

## Data sources

A few public resources are used, each under terms that allow commercial use:

- **Map tiles and style:** OpenFreeMap (map data © OpenStreetMap contributors, style by OpenMapTiles), rendered
  with MapLibre GL JS (BSD-3-Clause). The attribution line stays in the corner of every map, as the licence
  requires. Tiles are requested from OpenFreeMap only when the map is on screen.
- **Flags:** public-domain country flag images served by flagcdn.com, with a hand-drawn SVG fallback offline.
- **Favicons:** Google's public favicon service, used only for source and browser icons in the dashboard.
- **Offline fallback map:** coastlines from Natural Earth (public domain), compiled into this repository.

Everything else — the tracker, the dashboard, the charts, the generated avatars and the map markers — was
written for this repository.

---

## Contributing

```bash
npm run typecheck && npm test
```

Keep contributions original: no code copied from another analytics project, and no compatibility shims or
branding from other products. If you adapt an idea, implement it fresh and credit it in the pull request.

## License

[MIT](LICENSE) © 2026 rahulxdevv
