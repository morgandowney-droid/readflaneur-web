// This file configures the initialization of Sentry on the client.
// The added config here will be used whenever a users loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b3e23f7ef7fb85d43b222efbf99bfcac@o4510840196431872.ingest.us.sentry.io/4510840235884544",

  // Silence known harmless errors
  ignoreErrors: [
    // GoTrue navigator.locks AbortError when user navigates away during getSession()
    'signal is aborted without reason',
    // Mobile Safari AbortError when fetch is cancelled due to navigation or page unload
    'The operation was aborted',
  ],

  // Add optional integrations for additional features
  integrations: [Sentry.replayIntegration()],

  // Sample 20% of traces to stay within quota
  tracesSampleRate: 0.2,

  // Enable logs to be sent to Sentry
  enableLogs: true,

  // Don't record session replays for normal sessions (saves quota)
  replaysSessionSampleRate: 0,

  // Define how likely Replay events are sampled when an error occurs.
  replaysOnErrorSampleRate: 1.0,

  // Enable sending user PII (Personally Identifiable Information)
  // https://docs.sentry.io/platforms/javascript/guides/nextjs/configuration/options/#sendDefaultPii
  sendDefaultPii: true,
});

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
