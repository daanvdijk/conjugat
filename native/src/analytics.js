import { init, setUserId, setUserProperties, setOptOut, track } from "@amplitude/analytics-react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";

let isInitialized = false;
let analyticsEnabled = false;
let baseContext = {};

async function getUserId() {
  const existing = await AsyncStorage.getItem("conjugat_analytics_uid");
  if (existing) return existing;
  const id = `uid_${Date.now()}`;
  await AsyncStorage.setItem("conjugat_analytics_uid", id);
  return id;
}

export function initAnalytics({ enabled: shouldEnable }) {
  if (isInitialized) return;

  analyticsEnabled = Boolean(shouldEnable);
  const apiKey = process.env.EXPO_PUBLIC_AMPLITUDE_KEY;
  if (!apiKey) {
    return;
  }

  init(apiKey, undefined, {
    trackingSessionEvents: true,
  });

  baseContext = {
    app_version:
      Constants.expoConfig?.version || Constants.nativeAppVersion || "0.0.1",
    platform: Platform.OS,
  };

  getUserId().then((userId) => {
    if (userId) {
      setUserId(userId);
    }
  });

  setOptOut(!analyticsEnabled);
  isInitialized = true;
}

export function setAnalyticsEnabled(value) {
  analyticsEnabled = Boolean(value);
  if (!isInitialized) return;
  setOptOut(!analyticsEnabled);
}

export function trackEvent(event, props = {}) {
  if (!isInitialized || !analyticsEnabled) return;
  track(event, { ...baseContext, ...props });
}

export function identifyUserProperties(properties) {
  if (!isInitialized || !analyticsEnabled) return;
  setUserProperties(properties);
}
