import * as Sentry from "@sentry/browser";

const DSN = import.meta.env.VITE_GLITCHTIP_DSN;

export function initErrorTracking() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: 0,
  });
}
