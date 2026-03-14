import * as amplitude from "@amplitude/unified";

let isInitialized = false;
let analyticsEnabled = false;
let baseContext = {};

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

  baseContext = {
    app_version: import.meta.env.VITE_APP_VERSION ?? "0.0.1",
    is_mobile: window.matchMedia("(max-width: 700px)").matches,
  };

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
  amplitude.browser?.track?.(event, { ...baseContext, ...props });
}

export function identifyUserProperties(properties) {
  if (!isInitialized || !analyticsEnabled) return;
  amplitude.browser?.setUserProperties?.(properties);
}
