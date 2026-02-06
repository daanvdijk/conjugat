import * as amplitude from "@amplitude/unified";

let isInitialized = false;
let analyticsEnabled = false;

function getUserId() {
  const existing = localStorage.getItem("conjugat_analytics_uid");
  if (existing) return existing;
  const id = globalThis.crypto?.randomUUID?.() ?? `uid_${Date.now()}`;
  localStorage.setItem("conjugat_analytics_uid", id);
  return id;
}

export function initAnalytics({ enabled: shouldEnable }) {
  if (isInitialized) return;

  analyticsEnabled = Boolean(shouldEnable);

  const apiKey = import.meta.env.VITE_AMPLITUDE_KEY;
  if (!apiKey) {
    console.warn("VITE_AMPLITUDE_KEY not configured");
    return;
  }

  amplitude.initAll(apiKey, {
    serverZone: "EU",
    analytics: {
      autocapture: true,
    },
    sessionReplay: {
      sampleRate: 1,
    },
  });

  if (!analyticsEnabled) {
    amplitude.browser?.optOut?.();
  }

  isInitialized = true;
}

export function setAnalyticsEnabled(value) {
  analyticsEnabled = Boolean(value);
  if (!isInitialized) return;
  if (analyticsEnabled) {
    amplitude.browser?.optIn?.();
  } else {
    amplitude.browser?.optOut?.();
  }
}

export function trackEvent(event, props = {}) {
  if (!isInitialized || !analyticsEnabled) return;
  amplitude.browser?.track?.(event, props);
}
