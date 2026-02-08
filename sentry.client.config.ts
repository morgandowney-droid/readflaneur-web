// This file configures the initialization of Sentry on the client.
// The config you add here will be used whenever a user loads a page in their browser.
// https://docs.sentry.io/platforms/javascript/guides/nextjs/

import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: "https://b3e23f7ef7fb85d43b222efbf99bfcac@o4510840196431872.ingest.us.sentry.io/4510840235884544",

  // Sample 20% of traces in production to stay within quota
  tracesSampleRate: 0.2,

  // Capture 100% of errors (traces != errors)
  // This ensures all JS exceptions are reported
  replaysSessionSampleRate: 0,
  replaysOnErrorSampleRate: 1.0,

  // Setting this option to true will print useful information to the console while setting up Sentry.
  debug: false,
});
