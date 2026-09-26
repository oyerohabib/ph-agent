/** Shared PostHog-shaped types used by mock + live clients. */

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type CaptureEventInput = {
  distinctId: string;
  event: string;
  properties?: JsonObject;
};

export type CaptureEventResult = {
  ok: true;
  mode: "mock" | "live";
  distinctId: string;
  event: string;
  /** Mock-only: assigned capture id. Live mode may omit. */
  captureId?: string;
};

export type IdentifyUserInput = {
  distinctId: string;
  properties: JsonObject;
};

export type IdentifyUserResult = {
  ok: true;
  mode: "mock" | "live";
  distinctId: string;
  properties: JsonObject;
};

export type GetFeatureFlagInput = {
  distinctId: string;
  flagKey: string;
  /** Optional person properties used for local evaluation / mock overrides. */
  personProperties?: JsonObject;
};

export type GetFeatureFlagResult = {
  ok: true;
  mode: "mock" | "live";
  flagKey: string;
  distinctId: string;
  /** Flag payload: boolean, string variant, or null when missing. */
  value: boolean | string | null;
  enabled: boolean;
};

export type ListFeatureFlagsResult = {
  ok: true;
  mode: "mock" | "live";
  flags: Array<{
    key: string;
    active: boolean;
    /** Mock default / last-known value when available. */
    defaultValue?: boolean | string | null;
  }>;
};

export type PostHogMode = "mock" | "live";

export interface PostHogClient {
  readonly mode: PostHogMode;
  captureEvent(input: CaptureEventInput): Promise<CaptureEventResult>;
  identifyUser(input: IdentifyUserInput): Promise<IdentifyUserResult>;
  getFeatureFlag(input: GetFeatureFlagInput): Promise<GetFeatureFlagResult>;
  listFeatureFlags(): Promise<ListFeatureFlagsResult>;
}
