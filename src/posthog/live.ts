import type {
  CaptureEventInput,
  CaptureEventResult,
  GetFeatureFlagInput,
  GetFeatureFlagResult,
  IdentifyUserInput,
  IdentifyUserResult,
  ListFeatureFlagsResult,
  PostHogClient,
} from "./types.js";
import { PostHogValidationError } from "./mock.js";

export type LivePostHogConfig = {
  apiKey: string;
  /** Capture / decide host, e.g. https://us.i.posthog.com */
  host: string;
  /** Personal API key for /api/feature_flag/ (optional; list falls back to empty). */
  personalApiKey?: string;
};

/**
 * Thin live PostHog client using the public capture + decide endpoints.
 * Requires POSTHOG_API_KEY. No SDK dependency — keep the surface small.
 */
export class LivePostHogClient implements PostHogClient {
  readonly mode = "live" as const;

  constructor(private readonly config: LivePostHogConfig) {
    if (!config.apiKey?.trim()) {
      throw new PostHogValidationError("POSTHOG_API_KEY is required for live mode");
    }
  }

  private hostUrl(path: string): string {
    return `${this.config.host.replace(/\/$/, "")}${path}`;
  }

  async captureEvent(input: CaptureEventInput): Promise<CaptureEventResult> {
    const distinctId = input.distinctId?.trim();
    const event = input.event?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!event) throw new PostHogValidationError("event is required");

    const res = await fetch(this.hostUrl("/i/v0/e/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        event,
        distinct_id: distinctId,
        properties: {
          ...input.properties,
          $lib: "posthog-mcp",
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog capture failed (${res.status}): ${body.slice(0, 200)}`);
    }

    return { ok: true, mode: "live", distinctId, event };
  }

  async identifyUser(input: IdentifyUserInput): Promise<IdentifyUserResult> {
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!input.properties || typeof input.properties !== "object" || Array.isArray(input.properties)) {
      throw new PostHogValidationError("properties must be a non-null object");
    }
    if (Object.keys(input.properties).length === 0) {
      throw new PostHogValidationError("properties must include at least one key");
    }

    // $identify via capture endpoint
    const res = await fetch(this.hostUrl("/i/v0/e/"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        event: "$identify",
        distinct_id: distinctId,
        properties: {
          $set: input.properties,
          $lib: "posthog-mcp",
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog identify failed (${res.status}): ${body.slice(0, 200)}`);
    }

    return {
      ok: true,
      mode: "live",
      distinctId,
      properties: input.properties,
    };
  }

  async getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult> {
    const distinctId = input.distinctId?.trim();
    const flagKey = input.flagKey?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!flagKey) throw new PostHogValidationError("flagKey is required");

    const res = await fetch(this.hostUrl("/decide/?v=3"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: this.config.apiKey,
        distinct_id: distinctId,
        person_properties: input.personProperties ?? {},
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog decide failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      featureFlags?: Record<string, boolean | string>;
    };
    const raw = data.featureFlags?.[flagKey];
    const value: boolean | string | null =
      typeof raw === "boolean" || typeof raw === "string" ? raw : null;
    const enabled =
      value === true || (typeof value === "string" && value.length > 0 && value !== "false");

    return {
      ok: true,
      mode: "live",
      flagKey,
      distinctId,
      value,
      enabled,
    };
  }

  async listFeatureFlags(): Promise<ListFeatureFlagsResult> {
    // Public project API key cannot list flag definitions. Personal API key optional.
    if (!this.config.personalApiKey) {
      return { ok: true, mode: "live", flags: [] };
    }

    const projectHost = this.config.host
      .replace("://us.i.", "://us.")
      .replace("://eu.i.", "://eu.")
      .replace(/\/$/, "");

    const res = await fetch(`${projectHost}/api/feature_flag/?limit=100`, {
      headers: {
        Authorization: `Bearer ${this.config.personalApiKey}`,
      },
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog list flags failed (${res.status}): ${body.slice(0, 200)}`);
    }

    const data = (await res.json()) as {
      results?: Array<{ key: string; active: boolean }>;
    };

    return {
      ok: true,
      mode: "live",
      flags: (data.results ?? []).map((f) => ({
        key: f.key,
        active: f.active,
      })),
    };
  }
}
