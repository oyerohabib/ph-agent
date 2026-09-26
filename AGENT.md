# AGENT.md — posthog-mcp

Instructions for AI agents using this MCP server.

## Purpose

Drive a minimal PostHog analytics surface over MCP. Default mode is **mock** (in-memory, no credentials). Use live mode only when env vars are explicitly set.

## Connection

- Transport: **stdio**
- Start: `npx tsx src/index.ts` (or `node dist/src/index.js` after build)
- Env:
  - `POSTHOG_MODE` = `mock` (default) | `live`
  - `POSTHOG_API_KEY` — project API key (`phc_…`), required for live
  - `POSTHOG_HOST` — default `https://us.i.posthog.com`
  - `POSTHOG_PERSONAL_API_KEY` — optional (`phx_…`); enables live `list_feature_flags`

Do not write logs to stdout; the protocol owns stdout.

## Tools

### capture_event

Capture one analytics event.

```json
{ "distinctId": "user_123", "event": "feature_used", "properties": { "feature": "mcp" } }
```

Rules:
- `distinctId` and `event` are required non-empty strings.
- `properties` is optional JSON object.
- Success JSON: `{ "ok": true, "mode": "mock"|"live", "distinctId", "event", "captureId?" }`.
- Failure JSON: `{ "ok": false, "error": "validation_error"|"upstream_error", "message" }` with `isError: true`.

### identify_user

Set person properties (`$set`).

```json
{ "distinctId": "user_123", "properties": { "email": "a@b.com", "plan": "pro" } }
```

Rules:
- `properties` must be a non-empty object.
- Merges with any previously identified properties in mock mode.

### get_feature_flag

Evaluate one flag for a user.

```json
{ "distinctId": "user_123", "flagKey": "new-onboarding" }
```

Optional override (mock / decide): `personProperties["$feature/<flagKey>"]`.

Mock seeded flags:
| key | value |
|-----|-------|
| `new-onboarding` | `true` |
| `beta-insights` | `false` |
| `pricing-experiment` | `"control"` |

Success includes `value` (`boolean|string|null`) and `enabled` (boolean). Unknown keys → `value: null`, `enabled: false`.

### list_feature_flags

No arguments. Mock returns seeded flags. Live returns `[]` unless `POSTHOG_PERSONAL_API_KEY` is set.

## Preferred call order

1. `list_feature_flags` — discover keys
2. `get_feature_flag` — gate behavior
3. `identify_user` — attach person context when known
4. `capture_event` — emit telemetry for actions taken

## Error handling

- Treat `isError: true` or `ok: false` as failure; read `message`.
- Do not retry validation errors with the same arguments.
- Live upstream errors may be transient; one retry is reasonable.

## Eval

Agents verifying this server should run:

```bash
npm run eval
```

Harness covers tool listing, happy paths, and validation failures over real MCP (in-memory transport).
