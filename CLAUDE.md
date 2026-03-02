# CLAUDE.md — RAPCA Campo PWA

## Project Overview

**RAPCA Campo** is a Progressive Web App (PWA) for field data collection in ecological/pastoral evaluation campaigns (RAPCA EMA — Evaluación de Medios Agropecuarios). It is designed for mobile-first, offline-capable use by field technicians who collect vegetation, grazing, and shrub data in rural areas of Spain.

The app has two core workflows:
- **VP (Visitas Previas)** — Preliminary visits: grazing degree assessment, pasture observation, and geotagged photo capture.
- **EV (Evaluación)** — Full evaluation: plant scoring across transects (T1/T2/T3), palatable species assessment, herbaceous coverage, shrub coverage/height ("matorralización"), and geotagged photos.

Data is stored locally (localStorage + IndexedDB for photos) and synced to a Google Form when online.

## File Structure

```
rapca-pwa/
├── index.html          # Single-page HTML with all UI, inline CSS (~166 lines)
├── app.js              # All application logic (~381 lines, vanilla JS)
├── sw.js               # Service worker for offline caching
├── manifest.json       # PWA manifest (standalone, portrait, theme #1a3d2e)
├── icon-192.png        # App icon 192x192
├── icon-512.png        # App icon 512x512
├── icon-512-maskable.png # Maskable icon for Android
└── CLAUDE.md           # This file
```

**No build step, no bundler, no framework.** The entire app is vanilla HTML/CSS/JS served as static files.

## Architecture & Key Concepts

### Single-Page Navigation
- Four pages: `menu`, `vp`, `ev`, `panel` — toggled by CSS class `.active`
- Navigation via `showPage(pageName)` function and a top nav bar
- All HTML lives in `index.html`; dynamic UI (plant grids, photo lists) is generated in `app.js`

### Data Model
- **Records** are stored in `localStorage` under key `rapca_registros` as a JSON array
- Each record: `{ id, tipo ('VP'|'EV'), fecha, zona, unidad, transecto, datos, enviado }`
- **Drafts** auto-save to `rapca_borrador_vp` / `rapca_borrador_ev` in localStorage
- **Photos** are stored as base64 JPEG thumbnails in both an in-memory cache (`fotosCacheMemoria`) and IndexedDB (`RAPCA_Fotos` database, `fotos` object store)
- Photo naming convention: `{UNIDAD}_{TIPO}_{NUM}` or `{UNIDAD}_{TIPO}_{WAYPOINT}_{NUM}`

### Google Forms Backend
- Data sync via POST to a Google Forms URL (`FORM_URL`) with `no-cors` mode
- Field entries mapped by `ENTRY` object (entry IDs for tipo, fecha, zona, unidad, transecto, datos)
- The `datos` field contains the full record data as serialized JSON
- Sync is attempted immediately on save if online, otherwise records are queued as `enviado: false`

### Camera & Geolocation
- Custom camera modal using `getUserMedia` with rear-facing camera (`facingMode: 'environment'`)
- Photos are composited on a canvas (3060x4080) with overlays: compass heading, mini OpenStreetMap, UTM coordinates, RAPCA branding, date, and photo code
- Device orientation API for compass heading
- GPS via `navigator.geolocation.watchPosition` with UTM conversion (`latLonToUTM`)
- Map tiles preloaded from OpenStreetMap for canvas overlay

### Offline Support
- Service worker (`sw.js`) uses cache-first strategy with cache name `rapca-v{N}`
- On install: caches all static assets
- On activate: removes old caches
- On fetch: serves from cache, falls back to network
- **When updating cached files, bump the cache version number in `sw.js`**

### PDF Export
- Records can be exported individually or all at once via `exportarPDF()` / `exportarTodosPDF()`
- Opens a new window with styled HTML including embedded photo thumbnails, then triggers `window.print()`

## Code Conventions

### Language
- **UI and code comments are in Spanish** — maintain this convention
- Variable and function names are a mix of Spanish and English (e.g., `guardarVP`, `showToast`, `actualizarResumenMatorral`)

### JavaScript Style
- **ES5-compatible** with `var` declarations and `function` keyword (no arrow functions except in service worker)
- No modules, no imports — everything is in global scope
- Functions are densely written (often single-line with chained operations)
- DOM manipulation via `document.getElementById()` throughout
- ID naming convention: `{tipo}-{campo}` (e.g., `vp-fecha`, `ev-planta3-n5`, `ev-mat1cob`)

### CSS
- All CSS is inline in `<style>` tags within `index.html`
- Color palette:
  - Primary dark green: `#1a3d2e`
  - Secondary green: `#5b8c5a`
  - VP accent (light green): `#88d8b0`
  - EV accent (orange): `#fd9853`
  - Background: `#f5f5f0`
- Mobile-first responsive design with `user-scalable=no`
- Card-based layout with `.card` containers

### Plant Species
- Predefined species list in `PLANTAS` array (32 Mediterranean species)
- Used for autocomplete in plant name inputs (EV form and matorral species)

### Evaluation Scoring
- Plant notes: 0-5 scale, 10 plants x 10 notes each
- Palatable notes: 0-5 scale, 3 plants x 15 notes each
- Herbaceous notes: 0-5 scale, 7 items
- Grazing degree: NP/PL/PM/PI/PMI (No Pastoreo to Pastoreo Muy Intenso)
- Pasture observation: A/B/M/N categories
- Matorral: coverage (%), height (cm), species — with auto-calculated volume (m³/ha)

### Transects (EV only)
- 3 transects per unit (T1, T2, T3)
- After saving T3, the form fully resets for the next unit
- Between transects, only the scoring data resets (identification stays)

## Important Implementation Details

### Photo Counter System
- Photo counters are tracked per `{unidad}_{tipo}_{subtipo}` key
- Stored in localStorage as `rapca_contadores_VP` / `rapca_contadores_EV`
- Counter is decremented when camera is cancelled (`cerrarCamara`)
- On edit, counters are re-initialized from existing photo codes (`inicializarContadoresDesdeEdicion`)

### Zone Auto-Derivation
- Zone ID is auto-derived from Unit ID by stripping trailing digits: `actualizarZonaDesdeUnidad`
- Example: Unit `23AJE01` → Zone `23AJE`

### IndexedDB Photo Cleanup
- Photos older than 5 days are automatically deleted on startup (`limpiarFotosAntiguasDB`)

### Back Button Prevention
- `history.pushState` + `onpopstate` prevents accidental back navigation
- Users are directed to use the "Guardar y Salir" button instead

### PWA Install
- Listens for `beforeinstallprompt` to show a custom install button
- Hidden when already running in standalone mode

## Development Workflow

### Running Locally
Serve the project directory with any static file server:
```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```
Then open `http://localhost:8000` in a browser. For camera/GPS features, use HTTPS or localhost.

### Making Changes
1. Edit `index.html` for UI/CSS changes
2. Edit `app.js` for logic changes
3. **Bump `CACHE_NAME` in `sw.js`** (e.g., `rapca-v13` → `rapca-v14`) whenever you change any file, so the service worker picks up updates
4. Test on mobile (or Chrome DevTools mobile emulation) — this is a mobile-first app

### No Build / No Tests
- There is no build step, linter, or test suite
- Changes are immediately reflected when served
- Manual testing in mobile browser is the primary QA method

### Deployment
- Static file hosting (GitHub Pages, Netlify, or any web server)
- All files must be served from the same directory (relative paths used everywhere)

## Common Pitfalls

- **Forgetting to bump `sw.js` cache version** — changes won't appear for users who already have the app cached
- **ID naming must be exact** — the entire app relies on DOM element IDs with specific naming patterns (`ev-planta{N}-n{M}`, `ev-palatable{N}-n{M}`, etc.)
- **Google Forms URL and entry IDs** — if the backend form changes, update both `FORM_URL` and `ENTRY` constants at the top of `app.js`
- **Photo storage limits** — base64 thumbnails in IndexedDB can accumulate; the 5-day cleanup mitigates this
- **No CORS on Google Forms** — sync uses `mode: 'no-cors'`, which means you can't read the response; success is assumed if no network error
