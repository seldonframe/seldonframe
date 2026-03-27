import type { AdapterDescriptor, IntegrationAdapter } from "./types";
import { hasEnv } from "./helpers";

type LazyDescriptor = {
  id: string;
  env: string[];
  load: () => Promise<IntegrationAdapter<unknown>>;
};

const lazyTier2Descriptors: LazyDescriptor[] = [
  {
    id: "twilio",
    env: ["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN"],
    load: async () => (await import("./sms/twilio")).twilioAdapter,
  },
  {
    id: "google-meet",
    env: ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
    load: async () => (await import("./video/google-meet")).googleMeetAdapter,
  },
  {
    id: "zoom",
    env: ["ZOOM_CLIENT_ID", "ZOOM_CLIENT_SECRET", "ZOOM_ACCOUNT_ID"],
    load: async () => (await import("./video/zoom")).zoomAdapter,
  },
  {
    id: "uploadthing",
    env: ["UPLOADTHING_TOKEN"],
    load: async () => (await import("./storage/uploadthing")).uploadthingAdapter,
  },
  {
    id: "s3-r2",
    env: ["S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_BUCKET"],
    load: async () => (await import("./storage/s3-r2")).s3R2Adapter,
  },
  {
    id: "plausible",
    env: ["PLAUSIBLE_API_KEY"],
    load: async () => (await import("./analytics/plausible")).plausibleAdapter,
  },
  {
    id: "posthog",
    env: ["POSTHOG_API_KEY"],
    load: async () => (await import("./analytics/posthog")).posthogAdapter,
  },
  {
    id: "openai",
    env: ["OPENAI_API_KEY"],
    load: async () => (await import("./ai/openai")).openAiAdapter,
  },
];

export async function loadTier2Adapters() {
  const loaded = await Promise.all(
    lazyTier2Descriptors
      .filter((descriptor) => hasEnv(...descriptor.env))
      .map(async (descriptor): Promise<AdapterDescriptor> => ({
        id: descriptor.id,
        tier: "tier2",
        adapter: await descriptor.load(),
      }))
  );

  return loaded;
}
