# Conjugat: AI Coding Agent Instructions

## Project Overview
**Conjugat** is an interactive Catalan verb conjugation learning application built with React + Vite. Users practice conjugating Catalan verbs across multiple tenses by typing answers with real-time feedback and a daily progress system.

## Architecture & Data Flow

### Core Application Structure
- **[src/App.jsx](../src/App.jsx)**: Single-component monolithic app managing state, UI, and logic
  - Input handling with real-time validation and visual feedback (green/yellow/red character indicators)
  - Conjugation logic for regular verbs across 4 tenses (present, imperfect, future, conditional)
  - Settings management: person selection, tense filtering, verb type filtering, daily goal tracking
  - localStorage-based persistence (theme, goal, daily progress)
  - Confetti celebration animation system triggered on correct answers

### Verb Data System
- **[src/data/verbs.json](../src/data/verbs.json)**: Pre-built JSON array of ~600 Catalan verbs with:
  - `infinitive`, `translation`, `regular` (boolean), `group` (ar/er/ir)
  - Optional `present` object with manual overrides for irregular verbs
  - No `tenses` object needed; conjugations are generated on-the-fly
- **[scripts/build-verbs.mjs](../scripts/build-verbs.mjs)**: Generates verbs.json by:
  - Fetching Catalan word frequency data and FreeDict dictionary
  - Running Python script (build-verbs.py) with verbecc library for conjugations
  - Filtering by frequency, caching results
  - **Never edit verbs.json manually** — regenerate via `npm run build:verbs`

## Development Workflows

### Essential Commands
```bash
npm run dev         # Start Vite dev server (hot reload on file changes)
npm run build       # Production build to dist/ (minified, optimized)
npm run preview     # Serve production build locally
npm run build:verbs # Regenerate verbs.json from source data (requires .venv setup)
```

### Regenerating Verb Data
The `build:verbs` script requires Python dependencies. If verbs.json needs updates:
1. Ensure `.venv` Python environment is initialized
2. `npm run build:verbs` regenerates verbs.json
3. Restart dev server to reload new data

## Key Patterns & Conventions

### Conjugation Algorithm
Regular verbs follow predictable patterns; irregulars stored explicitly:
```javascript
function getConjugation(verb, tense, person) {
  // First check for manually-stored conjugations (irregulars)
  if (verb.tenses?.[tense]?.[person]) return verb.tenses[tense][person];
  
  // Fall back to predictable rules
  const group = verb.group || getVerbGroup(verb.infinitive);
  if (tense === "present") return regularPresent(verb.infinitive, group, person);
  // ... handle other tenses
}
```
Verb groups (ar/er/ir) determine suffix patterns for all tenses.

### Input Validation & UX Feedback
- Characters auto-lowercase (normalized input)
- Excess input truncated to expected length
- Red character stops input immediately; slices to that position
- Hinted characters show yellow; properly-typed accented chars are green
- `stripAccents()` allows users to type without diacritics (à → a is yellow, not red)

### State Persistence
Uses localStorage with date-keyed progress tracking:
- `conjugat_progress`: Daily count (resets on new day)
- `conjugat_date`: Current day key (YYYY-MM-DD format)
- `conjugat_goal`: Selected daily goal (25/50/100)
- `conjugat_theme`: "catalan" or "default"

### Theme System
- CSS custom property: `data-theme` attribute on `<body>`
- Catalan theme uses national colors; default uses neutral palette
- Toggle via Settings → Theme button

### Confetti Celebration Logic
- Small burst (28 pieces) on each correct answer
- Large burst (54 pieces) when daily goal is reached
- Animation uses CSS keyframes with CSS variables for position/rotation
- Key prop prevents React re-mounting animation during rapid-fire correct answers

## Component Interaction Patterns

### Prompt Selection
`pickNextPrompt()` selects random verb + person + tense:
- Respects enabled persons/tenses toggles
- Filters by verb regularity setting
- Avoids repeating the same prompt twice in a row (with retry limit)

### Validation Rules
`isPromptAllowed()` ensures current prompt respects all active filters — called when settings change. If invalid, auto-advances to new prompt.

## File Organization
```
src/
├── App.jsx          # Single root component (everything here)
├── main.jsx         # React bootstrap
├── styles.css       # All CSS (no component-scoped styles)
└── data/
    └── verbs.json   # Generated; never edit manually
scripts/
├── build-verbs.mjs  # Node.js orchestrator
└── build-verbs.py   # Python script using verbecc library
```

## Common Tasks & Examples

### Adding a New Tense
1. Add tense string to `TENSES` array
2. Add label to `TENSE_LABELS` object
3. Add conjugation function: `regularNewTense(infinitive, group, person)`
4. Add branch in `getConjugation()` to call new function
5. Test with multiple verb groups (ar/er/ir)

### Fixing Irregular Verb Conjugations
1. Edit [src/data/verbs.json](../src/data/verbs.json) → find verb → add `tenses` object:
   ```json
   {
     "infinitive": "ser",
     "present": { "jo": "soc", "tu": "ets", ... }  // or use "tenses" key
   }
   ```
2. Restart dev server to reload
3. Verify in UI; consider regenerating via `npm run build:verbs` if data source changed

### Theming Changes
- Edit [src/styles.css](../src/styles.css) CSS variable definitions for `[data-theme="catalan"]`
- Test toggle via Settings → Theme in UI
- Colors should be Catalan national colors: gules (red), gold, azure, green

## External Dependencies
- **React 18.3.1**: Component framework (minimal usage—single component)
- **Vite 5.4**: Build tool and dev server (zero config for this project)
- **@vitejs/plugin-react**: JSX transformation
- **@amplitude/unified**: Analytics and session replay (initialized in [src/analytics.js](../src/analytics.js))
- **.venv + Python verbecc library**: For verb conjugation data generation (build script only)

## Analytics Integration

The app integrates Amplitude Analytics and Session Replay via `@amplitude/unified`:
- **Initialization**: `initAnalytics({ enabled })` called from App.jsx on mount; only initializes once
- **API Key**: Set via `VITE_AMPLITUDE_KEY` environment variable in `.env`
  - Amplitude API keys are intentionally public (client-side only); no sensitive permissions exposed
  - `.env` is in `.gitignore` to prevent accidental commits
- **Features Enabled**: 
  - Autocapture: tracks all interactions automatically
  - Session Replay: records user sessions with 100% sample rate
  - User Preferences: respects user opt-in/opt-out via Settings → Analytics
- **Event Tracking**: `trackEvent(name, properties)` tracks custom events throughout the app
  - Tracked events: session_start, settings_changed, hint_used, goal_reached, prompt_completed
- **Client-side Only**: All analytics code runs client-side; no server-side processing

## Testing Notes
- No automated test suite; test manually via dev server
- Conjugation correctness depends on verbs.json accuracy (generated tool responsibility)
- UI feedback: typing, hinting, confetti, daily goal progress bar all visible immediately
- localStorage persistence: verify across browser restarts and date boundaries

## Critical "Why" Decisions
- **Monolithic App.jsx**: Verb app has simple state needs; no routing/complex component tree
- **Generated verbs.json**: Source of truth is FreeDict + verbecc (authoritative); JSON is build artifact
- **localStorage over server**: This is intended as offline-capable educational tool
- **Regular formula-based + irregular overrides**: Scales to many verbs without manual conjugation entries
