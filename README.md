# Conjugat

A fast, keyboard-first Catalan verb conjugation trainer with instant per-character feedback.

## Local development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
npm run preview
```

## Environment variables

Create a `.env` in the project root:

```
VITE_AMPLITUDE_KEY=your_amplitude_key
VITE_FEEDBACK_EMAIL=hello@yourdomain.com
VITE_APP_VERSION=0.0.1
```

- `VITE_AMPLITUDE_KEY` enables analytics (Amplitude).
- `VITE_FEEDBACK_EMAIL` enables the in-app feedback email button.
- `VITE_APP_VERSION` sets the analytics app version.

## Verb list generation

This project can generate a ~200-verb list from frequency + FreeDict mappings and fetches irregular conjugations from verbs.cat.

```bash
npm run build:verbs
```

Validation (optional):

```bash
npm run build:verbs:validate
```

Generated data is written to:
- `src/data/verbs.json`

## Deploy

This is a static Vite app. Deploy the `dist/` folder to Vercel, Netlify, or similar.
