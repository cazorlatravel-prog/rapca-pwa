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
├── index.html              # Single-page HTML with all UI, inline CSS (166 lines)
├── app.js                  # All application logic (380 lines, vanilla JS)
├── sw.js                   # Service worker for offline caching (32 lines)
├── manifest.json           # PWA manifest (standalone, portrait, theme #1a3d2e)
├── icon-192.png            # App icon 192x192
├── icon-512.png            # App icon 512x512
├── icon-512-maskable.png   # Maskable icon for Android
└── CLAUDE.md               # This file
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
- `id` is a `Date.now()` timestamp (or preserved from original when editing)
- **Drafts** auto-save to `rapca_borrador_vp` / `rapca_borrador_ev` in localStorage
- Drafts are also saved on `beforeunload` and `visibilitychange` (hidden) events
- **Photos** are stored as base64 JPEG thumbnails in both an in-memory cache (`fotosCacheMemoria`) and IndexedDB (`RAPCA_Fotos` database, `fotos` object store)
- Photo naming convention: `{UNIDAD}_{TIPO}_{NUM}` (general) or `{UNIDAD}_{TIPO}_{WAYPOINT}_{NUM}` (comparative)

### Google Forms Backend
- Data sync via POST to a Google Forms URL (`FORM_URL`) with `no-cors` mode
- Field entries mapped by `ENTRY` object (entry IDs for tipo, fecha, zona, unidad, transecto, datos)
- The `datos` field contains the full record data as serialized JSON
- Sync is attempted immediately on save if online, otherwise records are queued as `enviado: false`
- Batch sync (`syncPending`) sends records with 600ms delay between each to avoid rate limiting

### Camera & Geolocation
- Custom camera modal using `getUserMedia` with rear-facing camera (`facingMode: 'environment'`, ideal 1920x1080)
- Photos are composited on a canvas (3060x4080) with overlays: compass heading, mini OpenStreetMap (rendered from preloaded tiles), UTM coordinates, RAPCA branding, date, and photo code
- **Thumbnails**: 400x533 at 50% JPEG quality stored in memory cache + IndexedDB
- **Downloads**: Full-resolution at 95% JPEG quality auto-downloaded to user's device
- Compass via both `deviceorientationabsolute` (primary) and `deviceorientation` (fallback with `webkitCompassHeading` for Safari)
- GPS via `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`, `maximumAge: 5000`
- UTM conversion via inline `latLonToUTM()` function (supports zone/band calculation)
- Map tiles preloaded from OpenStreetMap as a 3x3 tile grid at zoom level 16, drawn onto the photo canvas via `dibujarMapaEnCanvas()`

### Offline Support
- Service worker (`sw.js`) uses cache-first strategy with cache name `rapca-v{N}` (currently `rapca-v13`)
- On install: caches all static assets, calls `skipWaiting()`
- On activate: removes old caches, calls `clients.claim()`
- On fetch: serves from cache, falls back to network
- Service worker registered silently at startup: `navigator.serviceWorker.register('./sw.js')`
- **When updating cached files, bump the cache version number in `sw.js`**

### PDF Export
- Records can be exported individually or all at once via `exportarPDF(id)` / `exportarTodosPDF()`
- These are `async` functions that `await obtenerTodasLasFotos()` to merge memory cache + IndexedDB photos
- Opens a new window with styled HTML including embedded photo thumbnails (base64 `<img>` tags), then triggers `window.print()` after 1 second

## Code Conventions

### Language
- **UI and code comments are in Spanish** — maintain this convention
- Variable and function names are a mix of Spanish and English (e.g., `guardarVP`, `showToast`, `actualizarResumenMatorral`)

### JavaScript Style
- **Mostly ES5** with `var` declarations and `function` keyword throughout
- **Exception**: `exportarPDF` and `exportarTodosPDF` use `async/await` (ES2017+) for photo retrieval
- No arrow functions in `app.js` (arrow functions are only used in `sw.js`)
- No modules, no imports — everything is in global scope
- Functions are densely written (often single-line with chained operations)
- DOM manipulation via `document.getElementById()` throughout
- ID naming convention: `{tipo}-{campo}` (e.g., `vp-fecha`, `ev-planta3-n5`, `ev-mat1cob`)

### CSS
- All CSS is inline in `<style>` tags within `index.html` (lines 14–114)
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
- Used for autocomplete in plant name inputs (EV form plants, palatables, and matorral species)

### Evaluation Scoring
- Plant notes: 0-5 scale, 10 plants x 10 notes each (100 scores total per transect)
- Palatable notes: 0-5 scale, 3 plants x 15 notes each (45 scores total per transect)
- Herbaceous notes: 0-5 scale, 7 items (H1–H7)
- Grazing degree: NP/PL/PM/PI/PMI (No Pastoreo to Pastoreo Muy Intenso)
- Pasture observation: A/B/M/N categories (Señal Paso, Veredas, Cagarrutas)
- Matorral: 2 measurement points, each with coverage (%), height (cm), species — with auto-calculated mean coverage, mean height, and volume (m³/ha)

### Transects (EV only)
- 3 transects per unit (T1, T2, T3)
- After saving T3, the form fully resets for the next unit (`limpiarFormularioEV(true)`)
- Between transects, only the scoring data resets; identification fields stay (`limpiarFormularioEV(false)`)

## Important Implementation Details

### Global Variables (app.js lines 1–10)
- `FORM_URL` / `ENTRY` — Google Forms endpoint and field mappings
- `PLANTAS` — Array of 32 plant species for autocomplete
- `transectoActual` — Current transect number (1–3)
- `isOnline` — Network status flag, updated via `online`/`offline` events
- `editandoId` — ID of record being edited (null when creating new)
- `cameraStream` / `camaraTipo` / `camaraSubtipo` — Active camera state
- `currentHeading` — Device compass heading in degrees
- `contadorFotosVP` / `contadorFotosEV` — Photo counter objects per unit/type/subtype
- `currentLat` / `currentLon` / `currentUTM` — GPS position
- `fotosDB` — IndexedDB database reference
- `fotosCacheMemoria` — In-memory photo cache (object: code → base64)
- `mapTilesLoaded` — Array of preloaded OSM tile images

### Photo System
- **Counter keys**: `{unidad}_{tipo}_{G|W1|W2}` (general uses `G`)
- Counters stored in localStorage as `rapca_contadores_VP` / `rapca_contadores_EV`
- Counter is pre-incremented when opening camera (`getNextFotoNum`), decremented if cancelled (`cerrarCamara`)
- On edit, counters are re-initialized from existing photo codes (`inicializarContadoresDesdeEdicion`)
- **Dual-layer cache**: photos saved to `fotosCacheMemoria` (sync) and IndexedDB (async) simultaneously
- **Retrieval**: `obtenerTodasLasFotos()` merges both caches, preferring IndexedDB data when available

### Zone Auto-Derivation
- Zone ID is auto-derived from Unit ID by stripping 1–2 trailing digits: `actualizarZonaDesdeUnidad`
- Example: Unit `23AJE01` → Zone `23AJE`

### IndexedDB Photo Cleanup
- Photos older than 5 days are automatically deleted on startup (`limpiarFotosAntiguasDB`)
- Each photo stored with `fecha: Date.now()` for age tracking

### Back Button Prevention
- `history.pushState` + `onpopstate` prevents accidental back navigation (lines 101–102)
- Users see a toast: "Usa Guardar y Salir"

### Auto-Save
- Drafts saved on `beforeunload` event and `visibilitychange` (hidden) event
- Also saved manually via `salirApp()` button ("Guardar y Salir")

### PWA Install
- Listens for `beforeinstallprompt` to show a custom install button
- Listens for `appinstalled` to confirm installation
- Hidden when already running in standalone mode (`display-mode: standalone` media query)

### Statistics & Live Calculations
- Plant scores: count + mean displayed live via `actualizarEstadisticasPlantas()`
- Palatable scores: per-plant mean + global mean via `actualizarEstadisticasPalatables()`
- Herbaceous mean: `actualizarMediaHerbaceas()`
- Matorral summary: mean coverage, mean height, volume (m³/ha), species list via `actualizarResumenMatorral()`
- Volume formula: `(cobMedia/100) × (altMedia/100) × 10000`

## Key Functions Reference (app.js)

### Initialization & Lifecycle
| Function | Line | Description |
|---|---|---|
| `initFotosDB()` | 13 | Opens IndexedDB `RAPCA_Fotos`, returns Promise |
| `guardarFotoEnDB(codigo,dataUrl)` | 29 | Saves photo to IndexedDB with timestamp |
| `obtenerTodasLasFotos()` | 45 | Merges memory + IndexedDB photos, returns Promise |
| `limpiarFotosAntiguasDB()` | 80 | Deletes photos older than 5 days |
| `iniciarGeolocalizacion()` | 112 | Starts GPS `watchPosition` |
| `DOMContentLoaded` handler | 212 | Initializes DB, dates, counters, UI, drafts, GPS |

### Camera & Photos
| Function | Line | Description |
|---|---|---|
| `abrirCamara(tipo,subtipo)` | 133 | Opens camera modal with overlays |
| `capturarFoto()` | 157 | Takes photo, composites overlays, saves thumbnail + download |
| `cerrarCamara()` | 146 | Stops camera stream, decrements counter |
| `actualizarBrujula()` | 145 | Animates compass/coords overlay via `requestAnimationFrame` |
| `dibujarMapaEnCanvas(ctx,x,y,w,h)` | 148 | Draws OSM tiles + marker onto photo canvas |
| `precargarMapTiles()` | 116 | Preloads 3x3 OSM tile grid at zoom 16 |
| `getNextFotoNum(u,t,s)` | 130 | Increments and returns next photo number |
| `generarCodigoFoto(u,t,s,n)` | 131 | Generates photo code string |
| `agregarFotoALista(codigo)` | 210 | Adds photo tag to UI list and hidden input |

### Form Data
| Function | Line | Description |
|---|---|---|
| `obtenerDatosVP()` | 243 | Reads all VP form fields into object |
| `cargarDatosVP(d)` | 244 | Populates VP form from data object |
| `obtenerDatosEV()` | 245 | Reads all EV form fields into object |
| `cargarDatosEV(d)` | 246 | Populates EV form from data object |
| `guardarVP()` | 250 | Validates, saves VP record, syncs if online |
| `guardarEV()` | 251 | Validates, saves EV record, advances transect |
| `guardarBorradores()` | 241 | Saves VP+EV drafts to localStorage |
| `cargarBorradores()` | 242 | Restores drafts from localStorage |
| `limpiarFormularioVP()` | 248 | Resets VP form completely |
| `limpiarFormularioEV(completo)` | 249 | Resets EV form (full or scores-only) |

### Records & Sync
| Function | Line | Description |
|---|---|---|
| `getRegistros()` | 252 | Returns all records from localStorage |
| `guardarLocal(r)` | 253 | Appends record to localStorage |
| `actualizarRegistro(r)` | 254 | Updates existing record by ID |
| `enviarRegistro(r)` | 257 | POSTs single record to Google Forms |
| `syncPending()` | 258 | Sends all unsent records (600ms staggered) |
| `loadPanel()` | 259 | Renders records list in panel page |
| `editarRegistro(id)` | 260 | Loads record into form for editing |
| `eliminarRegistro(id)` | 261 | Deletes a record with confirmation |

### UI Generation
| Function | Line | Description |
|---|---|---|
| `generarPlantas()` | 229 | Creates 10 plant boxes with 10 score selects each |
| `generarPalatables()` | 230 | Creates 3 palatable boxes with 15 score selects each |
| `generarHerbaceas()` | 231 | Creates 7 herbaceous score selects |
| `opcionesNota()` | 225 | Returns HTML `<option>` tags for 0–5 scale |

### Navigation & Utility
| Function | Line | Description |
|---|---|---|
| `showPage(p)` | 238 | Switches active page and nav tab |
| `toggleSection(id)` | 239 | Toggles collapsible card sections |
| `setTransecto(n)` | 240 | Sets active transect (1–3) |
| `showToast(m,t)` | 380 | Shows 3-second toast notification |
| `showLoading(s)` | 379 | Shows/hides loading spinner |
| `updateSyncStatus()` | 378 | Updates online/offline indicator |
| `latLonToUTM(lat,lon)` | 113 | Converts lat/lon to UTM zone/band/easting/northing |
| `actualizarZonaDesdeUnidad(tipo)` | 118 | Auto-derives zone from unit ID |

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
- **ID naming must be exact** — the entire app relies on DOM element IDs with specific naming patterns (`ev-planta{N}-n{M}`, `ev-palatable{N}-n{M}`, `ev-herb{N}`, `ev-mat{N}cob`, etc.)
- **Google Forms URL and entry IDs** — if the backend form changes, update both `FORM_URL` and `ENTRY` constants at the top of `app.js`
- **Photo storage limits** — base64 thumbnails in IndexedDB can accumulate; the 5-day cleanup mitigates this
- **No CORS on Google Forms** — sync uses `mode: 'no-cors'`, which means you can't read the response; success is assumed if no network error
- **Dense single-line functions** — many functions are compressed onto single lines; read carefully before modifying
- **async/await in PDF functions** — `exportarPDF` and `exportarTodosPDF` are the only `async` functions; all other async code uses Promise callbacks
- **Photo counter consistency** — the counter pre-increments on camera open and decrements on cancel; modifying this logic can cause numbering gaps or duplicates
