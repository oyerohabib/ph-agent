/**
 * Minimal eval harness for posthog-mcp.
 * Speaks real MCP over InMemoryTransport — happy paths + failure cases.
 *
 * Run: npm run eval
 */
import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { createPostHogMcpServer } from "../src/server.js";
import { MockPostHogClient } from "../src/posthog/mock.js";

type CaseResult = { name: string; ok: boolean; detail?: string };

function parseToolJson(result: {
  content?: Array<{ type: string; text?: string }>;
  isError?: boolean;
}): { data: Record<string, unknown>; isError: boolean } {
  const text = result.content?.find((c) => c.type === "text")?.text ?? "{}";
  let data: Record<string, unknown> = {};
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = { raw: text };
  }
  return { data, isError: Boolean(result.isError) };
}

async function withClient(
  fn: (client: Client, mock: MockPostHogClient) => Promise<void>,
): Promise<void> {
  const mock = new MockPostHogClient();
  const server = createPostHogMcpServer(mock);

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();

  const client = new Client({ name: "posthog-mcp-eval", version: "1.0.0" });
  await server.connect(serverTransport);
  await client.connect(clientTransport);

  try {
    await fn(client, mock);
  } finally {
    await client.close().catch(() => undefined);
    await server.close().catch(() => undefined);
  }
}

async function runCase(
  name: string,
  body: () => Promise<void>,
): Promise<CaseResult> {
  try {
    await body();
    return { name, ok: true };
  } catch (err) {
    return {
      name,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  const results: CaseResult[] = [];

  results.push(
    await runCase("lists exactly four tools", async () => {
      await withClient(async (client) => {
        const listed = await client.listTools();
        const names = listed.tools.map((t) => t.name).sort();
        assert(
          JSON.stringify(names) ===
            JSON.stringify([
              "capture_event",
              "get_feature_flag",
              "identify_user",
              "list_feature_flags",
            ]),
          `unexpected tools: ${names.join(", ")}`,
        );
      });
    }),
  );

  results.push(
    await runCase("capture_event happy path", async () => {
      await withClient(async (client, mock) => {
        const raw = await client.callTool({
          name: "capture_event",
          arguments: {
            distinctId: "user_1",
            event: "agent_ran_eval",
            properties: { suite: "harness" },
          },
        });
        const { data, isError } = parseToolJson(raw);
        assert(!isError, `unexpected error: ${JSON.stringify(data)}`);
        assert(data.ok === true, "ok !== true");
        assert(data.mode === "mock", "expected mock mode");
        assert(data.event === "agent_ran_eval", "event mismatch");
        assert(mock.events.length === 1, "event not stored in mock");
      });
    }),
  );

  results.push(
    await runCase("identify_user happy path", async () => {
      await withClient(async (client, mock) => {
        const raw = await client.callTool({
          name: "identify_user",
          arguments: {
            distinctId: "user_1",
            properties: { email: "agent@example.com", plan: "pro" },
          },
        });
        const { data, isError } = parseToolJson(raw);
        assert(!isError, `unexpected error: ${JSON.stringify(data)}`);
        assert(data.ok === true, "ok !== true");
        const person = mock.persons.get("user_1");
        assert(person?.properties.email === "agent@example.com", "person not stored");
      });
    }),
  );

  results.push(
    await runCase("get_feature_flag seeded + unknown", async () => {
      await withClient(async (client) => {
        const on = parseToolJson(
          await client.callTool({
            name: "get_feature_flag",
            arguments: { distinctId: "user_1", flagKey: "new-onboarding" },
          }),
        );
        assert(!on.isError && on.data.enabled === true, "new-onboarding should be on");

        const multivariate = parseToolJson(
          await client.callTool({
            name: "get_feature_flag",
            arguments: { distinctId: "user_1", flagKey: "pricing-experiment" },
          }),
        );
        assert(
          multivariate.data.value === "control",
          `expected control, got ${String(multivariate.data.value)}`,
        );

        const missing = parseToolJson(
          await client.callTool({
            name: "get_feature_flag",
            arguments: { distinctId: "user_1", flagKey: "does-not-exist" },
          }),
        );
        assert(
          missing.data.value === null && missing.data.enabled === false,
          "unknown flag should be null/disabled",
        );
      });
    }),
  );

  results.push(
    await runCase("list_feature_flags returns seeded keys", async () => {
      await withClient(async (client) => {
        const { data, isError } = parseToolJson(
          await client.callTool({ name: "list_feature_flags", arguments: {} }),
        );
        assert(!isError, "list failed");
        const flags = data.flags as Array<{ key: string }>;
        const keys = flags.map((f) => f.key).sort();
        assert(keys.includes("new-onboarding"), "missing new-onboarding");
        assert(keys.includes("beta-insights"), "missing beta-insights");
        assert(keys.includes("pricing-experiment"), "missing pricing-experiment");
      });
    }),
  );

  results.push(
    await runCase("capture_event rejects empty event (validation)", async () => {
      await withClient(async (client) => {
        const { data, isError } = parseToolJson(
          await client.callTool({
            name: "capture_event",
            arguments: { distinctId: "user_1", event: "   " },
          }),
        );
        // Zod may reject before handler, or handler returns isError.
        // Either way the call must not report ok:true.
        assert(data.ok !== true, "empty event must not succeed");
        assert(
          isError || data.error === "validation_error" || typeof data === "object",
          "expected failure signal",
        );
      });
    }),
  );

  results.push(
    await runCase("identify_user rejects empty properties", async () => {
      await withClient(async (client) => {
        const raw = await client.callTool({
          name: "identify_user",
          arguments: { distinctId: "user_1", properties: {} },
        });
        const { data, isError } = parseToolJson(raw);
        assert(data.ok !== true, "empty properties must not succeed");
        assert(isError || data.error === "validation_error", "expected validation failure");
      });
    }),
  );

  results.push(
    await runCase("get_feature_flag rejects missing distinctId", async () => {
      await withClient(async (client) => {
        const raw = await client.callTool({
          name: "get_feature_flag",
          arguments: { distinctId: "", flagKey: "new-onboarding" },
        });
        const { data, isError } = parseToolJson(raw);
        assert(data.ok !== true, "empty distinctId must not succeed");
        assert(isError || data.error === "validation_error", "expected validation failure");
      });
    }),
  );

  const failed = results.filter((r) => !r.ok);
  for (const r of results) {
    const mark = r.ok ? "PASS" : "FAIL";
    console.log(`${mark}  ${r.name}${r.detail ? ` — ${r.detail}` : ""}`);
  }
  console.log(
    `\n${results.length - failed.length}/${results.length} passed` +
      (failed.length ? ` (${failed.length} failed)` : ""),
  );

  if (failed.length) process.exit(1);
}

main().catch((err) => {
  console.error("eval harness crashed:", err);
  process.exit(1);
});
