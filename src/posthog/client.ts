import { LivePostHogClient } from "./live.js";
import { MockPostHogClient } from "./mock.js";
import type { PostHogClient, PostHogMode } from "./types.js";

export type ClientOptions = {
  /** Force mode. Default: live if POSTHOG_API_KEY is set and POSTHOG_MODE!=mock, else mock. */
  mode?: PostHogMode;
  apiKey?: string;
  host?: string;
  personalApiKey?: string;
};

/**
 * Resolve mock vs live client.
 * Default is mock so agents can run without credentials.
 * Set POSTHOG_MODE=live and POSTHOG_API_KEY to hit a real project.
 */
export function createPostHogClient(options: ClientOptions = {}): PostHogClient {
  const envMode = (process.env.POSTHOG_MODE ?? "").toLowerCase();
  const apiKey = options.apiKey ?? process.env.POSTHOG_API_KEY ?? "";
  const host =
    options.host ?? process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";
  const personalApiKey =
    options.personalApiKey ?? process.env.POSTHOG_PERSONAL_API_KEY;

  let mode: PostHogMode;
  if (options.mode) {
    mode = options.mode;
  } else if (envMode === "live" || envMode === "mock") {
    mode = envMode;
  } else {
    // Credentials alone do not flip to live — agents must opt in.
    mode = "mock";
  }

  if (mode === "live") {
    return new LivePostHogClient({ apiKey, host, personalApiKey });
  }

  return new MockPostHogClient();
}

export { MockPostHogClient } from "./mock.js";
export { LivePostHogClient } from "./live.js";
export { PostHogValidationError } from "./mock.js";
export type * from "./types.js";
