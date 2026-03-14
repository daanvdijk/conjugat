# Conjugat

Conjugat is a fast, keyboard-first Catalan verb conjugation trainer with instant per-character feedback.

It focuses on repetition through typing, with a minimal interface and no distractions.

## Repo layout

- `web/` Vite + React web app
- `native/` React Native app (Expo-ready)
- `shared/` shared data files (verbs list)

## Vercel

The web app can use Vercel Analytics and Speed Insights when deployed on Vercel.

Optional environment variables for `web/`:

- `VITE_AMPLITUDE_KEY` for Amplitude analytics
- `VITE_FEEDBACK_EMAIL` for the in-app feedback mail link
- `VITE_GLITCHTIP_DSN` for browser error tracking
