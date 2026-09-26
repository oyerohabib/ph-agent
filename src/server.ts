import { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import {
  createPostHogClient,
  PostHogValidationError,
  type JsonObject,
  type PostHogClient,
} from "./posthog/client.js";

const jsonValueSchema: z.ZodType<unknown> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(jsonValueSchema),
    z.record(z.string(), jsonValueSchema),
  ]),
);

const jsonObjectSchema = z.record(z.string(), jsonValueSchema);

function textResult(data: unknown, isError = false) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
    structuredContent: data as Record<string, unknown>,
    isError,
  };
}

function errorResult(err: unknown) {
  const message = err instanceof Error ? err.message : String(err);
  const code =
    err instanceof PostHogValidationError ? "validation_error" : "upstream_error";
  return textResult({ ok: false, error: code, message }, true);
}

/**
 * Build the PostHog MCP server with four tools agents can call.
 * Pass a client for tests; otherwise resolve from env (mock by default).
 */
export function createPostHogMcpServer(client?: PostHogClient): McpServer {
  const ph = client ?? createPostHogClient();
  const server = new McpServer({
    name: "posthog-mcp",
    version: "1.0.0",
  });

  server.registerTool(
    "capture_event",
    {
      title: "Capture event",
      description:
        "Capture a PostHog analytics event for a distinct_id. Use for product telemetry agents emit (signup, feature_used, error). Required: distinctId, event. Optional: properties object.",
      inputSchema: z.object({
        distinctId: z
          .string()
          .min(1)
          .describe("Stable user/device id (PostHog distinct_id)"),
        event: z.string().min(1).describe("Event name, e.g. user_signed_up"),
        properties: jsonObjectSchema
          .optional()
          .describe("Arbitrary JSON properties attached to the event"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ distinctId, event, properties }) => {
      try {
        const result = await ph.captureEvent({
          distinctId,
          event,
          properties: properties as JsonObject | undefined,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "identify_user",
    {
      title: "Identify user",
      description:
        "Identify or update a PostHog person by distinct_id with $set-style properties (email, name, plan). Required: distinctId, properties (non-empty object).",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("Stable user id to identify"),
        properties: jsonObjectSchema
          .refine((o) => Object.keys(o).length > 0, {
            message: "properties must include at least one key",
          })
          .describe("Person properties to $set, e.g. { email, plan }"),
      }),
      annotations: { readOnlyHint: false, destructiveHint: false },
    },
    async ({ distinctId, properties }) => {
      try {
        const result = await ph.identifyUser({
          distinctId,
          properties: properties as JsonObject,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "get_feature_flag",
    {
      title: "Get feature flag",
      description:
        "Evaluate a PostHog feature flag for a distinct_id. Returns value (boolean|string|null) and enabled. In mock mode, seeded flags: new-onboarding=true, beta-insights=false, pricing-experiment=\"control\". Override via personProperties.$feature/<flagKey>.",
      inputSchema: z.object({
        distinctId: z.string().min(1).describe("User id to evaluate the flag for"),
        flagKey: z.string().min(1).describe("Feature flag key"),
        personProperties: jsonObjectSchema
          .optional()
          .describe("Optional person properties for evaluation / mock overrides"),
      }),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async ({ distinctId, flagKey, personProperties }) => {
      try {
        const result = await ph.getFeatureFlag({
          distinctId,
          flagKey,
          personProperties: personProperties as JsonObject | undefined,
        });
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  server.registerTool(
    "list_feature_flags",
    {
      title: "List feature flags",
      description:
        "List known feature flags. Mock mode returns seeded flags. Live mode returns [] unless POSTHOG_PERSONAL_API_KEY is set (project API key cannot list definitions).",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true, destructiveHint: false },
    },
    async () => {
      try {
        const result = await ph.listFeatureFlags();
        return textResult(result);
      } catch (err) {
        return errorResult(err);
      }
    },
  );

  return server;
}
