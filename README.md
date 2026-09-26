# posthog-mcp

MCP server that gives agents a tiny PostHog surface: capture events, identify users, and read feature flags.

**Mock mode is the default** — no API key required. Point `POSTHOG_MODE=live` + `POSTHOG_API_KEY` at a real project when you want network I/O.

## Why agents use this

Agents need tools they can call, not dashboards they can screenshot. This repo is a runnable slice of that: an MCP server with clear tool schemas, machine-readable docs (`AGENT.md`, `llms.txt`), and an eval harness that proves the tools behave.

Built as a Product Engineer resume project for PostHog — “you've built things agents actually use.”

## Tools (4)

| Tool | Purpose |
|------|---------|
| `capture_event` | Capture an analytics event for a `distinctId` |
| `identify_user` | `$set` person properties on a `distinctId` |
| `get_feature_flag` | Evaluate a flag for a user (boolean / multivariate / null) |
| `list_feature_flags` | List known flags (seeded in mock; live needs personal API key) |

Mock seeded flags: `new-onboarding=true`, `beta-insights=false`, `pricing-experiment="control"`.

## Run locally

```bash
npm install
npm run eval          # MCP in-memory evals (happy + failure paths)
npm run dev           # stdio MCP server (for Cursor / Claude / Inspector)
```

### Cursor / Claude Desktop MCP config

```json
{
  "mcpServers": {
    "posthog": {
      "command": "npx",
      "args": ["tsx", "src/index.ts"],
      "cwd": "/absolute/path/to/posthog-mcp",
      "env": {
        "POSTHOG_MODE": "mock"
      }
    }
  }
}
```

Or after `npm run build`: `"command": "node", "args": ["dist/src/index.js"]`.

### Live PostHog (optional)

```bash
export POSTHOG_MODE=live
export POSTHOG_API_KEY=phc_xxx
export POSTHOG_HOST=https://us.i.posthog.com   # or https://eu.i.posthog.com
# optional — needed for list_feature_flags in live mode:
export POSTHOG_PERSONAL_API_KEY=phx_xxx
npm run dev
```

## Machine docs

- [`AGENT.md`](./AGENT.md) — how an agent should call these tools
- [`llms.txt`](./llms.txt) — compact capability index for LLM crawlers / routers

## Scripts

| Script | What it does |
|--------|----------------|
| `npm run dev` | Start stdio MCP server via tsx |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled `dist/src/index.js` |
| `npm run eval` | Run the MCP eval harness |

## Layout

```
src/index.ts          # stdio entry
src/server.ts         # MCP tool registration
src/posthog/          # mock + live clients
eval/harness.ts       # in-memory MCP client↔server evals
AGENT.md / llms.txt   # docs for machines
```

## License

MIT
