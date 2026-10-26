# Agent access (MCP)

Kestrel runs a small [Model Context Protocol](https://modelcontextprotocol.io) server, so an AI agent can
read your traffic and revenue instead of you pasting screenshots into a chat.

- **Endpoint:** `POST https://YOUR-HOST/api/mcp`
- **Transport:** stateless Streamable HTTP (JSON-RPC 2.0). One request, one response, no session to keep alive.
- **Auth:** the **site API key** from *Settings → Data & advanced*, as `Authorization: Bearer <key>` or `x-api-key`.
- **Scope:** read-only, and only the site that owns the key. There is no tool that writes, deletes or spends.

## Connect a client

Claude Code:

```bash
claude mcp add --transport http kestrel https://YOUR-HOST/api/mcp \
  --header "Authorization: Bearer k_your_site_key"
```

Cursor, Claude Desktop, or any client with a JSON config:

```json
{
  "mcpServers": {
    "kestrel": {
      "type": "http",
      "url": "https://YOUR-HOST/api/mcp",
      "headers": { "Authorization": "Bearer k_your_site_key" }
    }
  }
}
```

The same block is generated for you, filled in with the real key, in *Settings → Agents & MCP*.

## Tools

| Tool | Answers |
| --- | --- |
| `get_overview` | Visitors, pageviews, bounce rate, session time, revenue, customers, conversion, online now, and the previous period. |
| `get_traffic_sources` | Channel, referrer, campaign or keyword, with visitors and revenue. |
| `get_content_performance` | The exact post, video, reel or landing page behind each visit, the best day in the period, and what drove it. |
| `get_top_pages` | Most-read pages and the revenue earned by the people who read them. |
| `get_audience` | Country, region, city, device, browser or OS. |
| `get_live_visitors` | Who is on the site in the last 30 minutes. |
| `get_site_info` | Domain, timezone, currency, install snippet, endpoints. |

`period` accepts `today`, `yesterday`, `24h`, `48h`, `7d` (default), `30d`, `90d`, `12m`, `all`.

## Try it without a client

```bash
curl -s https://YOUR-HOST/api/mcp \
  -H "Authorization: Bearer k_your_site_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"get_content_performance","arguments":{"period":"7d"}}}'
```

```bash
# List the tools
curl -s https://YOUR-HOST/api/mcp \
  -H "Authorization: Bearer k_your_site_key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'
```

## Prompts that work well

- “Why did traffic jump this week? Which post caused it, and how much revenue did it make?”
- “Compare last 30 days to the 30 before. Where did the extra revenue come from?”
- “Which pages bring visitors who never convert? Suggest three fixes.”
- “Write a changelog update using this month's numbers.”

## Notes

- A key that leaks exposes one site's read-only analytics. Rotate it in *Settings → Data & advanced*.
- The endpoint returns `405` to `GET`, because there is nothing to stream for a stateless server.
- Want a tool that is missing? The whole server is one file: `src/worker/mcp.ts`.
