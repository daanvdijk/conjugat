import * as Sentry from "@sentry/react-native";
import Constants from "expo-constants";

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN;

export function initErrorTracking() {
  if (!DSN) return;
  Sentry.init({
    dsn: DSN,
    environment:
      Constants.expoConfig?.extra?.environment ||
      Constants.expoConfig?.name ||
      "production",
    tracesSampleRate: 0,
  });
}
