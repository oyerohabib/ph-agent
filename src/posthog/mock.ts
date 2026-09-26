import type {
  CaptureEventInput,
  CaptureEventResult,
  GetFeatureFlagInput,
  GetFeatureFlagResult,
  IdentifyUserInput,
  IdentifyUserResult,
  JsonObject,
  ListFeatureFlagsResult,
  PostHogClient,
} from "./types.js";

type StoredEvent = CaptureEventInput & { captureId: string; capturedAt: string };
type StoredPerson = { distinctId: string; properties: JsonObject; updatedAt: string };

/** Seed flags agents can exercise without credentials. */
const DEFAULT_FLAGS: Record<string, boolean | string> = {
  "new-onboarding": true,
  "beta-insights": false,
  "pricing-experiment": "control",
};

/**
 * In-memory PostHog stand-in. Deterministic, no network.
 * Seeded feature flags: new-onboarding=true, beta-insights=false, pricing-experiment="control".
 */
export class MockPostHogClient implements PostHogClient {
  readonly mode = "mock" as const;
  readonly events: StoredEvent[] = [];
  readonly persons = new Map<string, StoredPerson>();
  readonly flags: Record<string, boolean | string>;
  private seq = 0;

  constructor(seedFlags: Record<string, boolean | string> = DEFAULT_FLAGS) {
    this.flags = { ...seedFlags };
  }

  async captureEvent(input: CaptureEventInput): Promise<CaptureEventResult> {
    const event = input.event?.trim();
    const distinctId = input.distinctId?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!event) throw new PostHogValidationError("event is required");

    this.seq += 1;
    const captureId = `mock_evt_${this.seq}`;
    this.events.push({
      ...input,
      distinctId,
      event,
      captureId,
      capturedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      mode: "mock",
      distinctId,
      event,
      captureId,
    };
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

    const existing = this.persons.get(distinctId);
    const properties = { ...(existing?.properties ?? {}), ...input.properties };
    this.persons.set(distinctId, {
      distinctId,
      properties,
      updatedAt: new Date().toISOString(),
    });

    return {
      ok: true,
      mode: "mock",
      distinctId,
      properties,
    };
  }

  async getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult> {
    const distinctId = input.distinctId?.trim();
    const flagKey = input.flagKey?.trim();
    if (!distinctId) throw new PostHogValidationError("distinctId is required");
    if (!flagKey) throw new PostHogValidationError("flagKey is required");

    // Allow person property override: personProperties[`$feature/${flagKey}`]
    const overrideKey = `$feature/${flagKey}`;
    const override = input.personProperties?.[overrideKey];
    let value: boolean | string | null;
    if (typeof override === "boolean" || typeof override === "string") {
      value = override;
    } else if (flagKey in this.flags) {
      value = this.flags[flagKey]!;
    } else {
      value = null;
    }

    const enabled = value === true || (typeof value === "string" && value.length > 0 && value !== "false");

    return {
      ok: true,
      mode: "mock",
      flagKey,
      distinctId,
      value,
      enabled,
    };
  }

  async listFeatureFlags(): Promise<ListFeatureFlagsResult> {
    return {
      ok: true,
      mode: "mock",
      flags: Object.entries(this.flags).map(([key, defaultValue]) => ({
        key,
        active: true,
        defaultValue,
      })),
    };
  }
}

export class PostHogValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PostHogValidationError";
  }
}
