# CLAUDE.md — RAPCA Campo PWA

## Project Overview

**RAPCA Campo** is a Progressive Web App (PWA) for field data collection in ecological/pastoral evaluation campaigns (RAPCA EMA — Evaluación de Medios Agropecuarios). It is designed for mobile-first, offline-capable use by field technicians who collect vegetation, grazing, and shrub data in rural areas of Spain.

The app has three field-data workflows, plus management and analysis tools:
- **VP (Visita Previa)** — Preliminary visits: grazing degree assessment, pasture observation, and geotagged photo capture.
- **EL (Evaluación Ligera)** — Light evaluation: similar to VP but classified separately.
- **EI (Evaluación Intensa)** — Full evaluation: plant scoring across transects (T1/T2/T3), palatable species assessment, herbaceous coverage, shrub coverage/height ("matorralización"), and geotagged photos.

Additional modules:
- **Ganaderos** — Livestock breeder records with custom fields.
- **Infraestructuras** — Unit/property management with Excel import/export and custom fields.
- **Dashboard** — Statistics, charts (Chart.js), and alerts.
- **Historial (Timeline)** — Chronological inspection feed with photo lightbox.
- **Comparador** — Side-by-side or slider photo comparison between dates.
- **Mapa** — Interactive Leaflet map with markers, KML/KMZ layers, and multiple basemaps.

Data is stored locally (localStorage + IndexedDB) and synced to both a Google Form and a PHP/MySQL backend. Photos are uploaded to Cloudinary via a PHP proxy.

## File Structure

```
rapca-pwa/
├── index.html              # Single-page HTML with all UI, inline CSS (~499 lines)
├── app.js                  # Core application logic (~1542 lines, vanilla JS)
├── dashboard.js            # Dashboard charts & metrics (~181 lines)
├── timeline.js             # Timeline feed & lightbox (~144 lines)
├── comparador.js           # Photo comparator slider/side-by-side (~193 lines)
├── sw.js                   # Service worker for offline caching (~35 lines)
├── manifest.json           # PWA manifest (standalone, portrait, theme #1a3d2e)
├── auth.php                # Authentication backend (~224 lines)
├── datos.php               # Records sync backend (~136 lines)
├── upload.php              # Photo upload to Cloudinary (~157 lines)
├── notificar.php           # Upload failure notifications (~70 lines)
├── config.php              # DB & Cloudinary credentials (~14 lines)
├── icon-192.png            # App icon 192x192
├── icon-512.png            # App icon 512x512
├── icon-512-maskable.png   # Maskable icon for Android
└── CLAUDE.md               # This file
```

**No build step, no bundler, no framework.** The entire app is vanilla HTML/CSS/JS served as static files. PHP backend is optional (app works fully offline with local auth fallback).

## Architecture & Key Concepts

### Single-Page Navigation
- Eleven pages: `menu`, `vp`, `el`, `ev`, `mapa`, `ganadero`, `infra`, `panel`, `dashboard`, `timeline`, `comparador` — toggled by CSS class `.active`
- Navigation via `showPage(pageName)` function and a top nav bar with icons
- All HTML lives in `index.html`; dynamic UI (plant grids, photo lists, maps) is generated in JS files
- Menu page organized in grid with categories: Trabajo de campo, Gestión, Herramientas

### Authentication System
- **Login overlay** shown on startup; must authenticate before using the app
- **Dual auth**: tries server (`auth.php`) first, falls back to local user DB in localStorage
- **Roles**: `admin` (full access, user management, all records) and `operador` (own records only)
- **Default admin**: `rapcajaen@gmail.com` / `Gallito9431%`
- **Session**: stored in localStorage as `rapca_sesion` with `{token, email, nombre, rol, id}`
- **Admin features**: CRUD users, view all records, server records, user enable/disable, password reset

### Data Model

#### Records (localStorage: `rapca_registros`)
- JSON array of records
- Each record: `{ id, tipo ('VP'|'EL'|'EI'), fecha, zona, unidad, transecto, datos, enviado, lat, lon, operador_email, operador_nombre }`
- `id` is a `Date.now()` timestamp (preserved from original when editing)
- `tipo` was previously `'EV'` — migrated to `'EI'` via `migrarRegistrosEVaEI()`

#### Record Data Structure
```javascript
// VP/EL datos:
{
  pastoreo: [val1, val2, val3],       // NP/PL/PM/PI/PMI
  observacionPastoreo: { senal, veredas, cagarrutas },  // A/B/M/N
  fotos: 'code1, code2, ...',
  fotosComp: [{numero:'codes', waypoint:'W1'}, {numero:'codes', waypoint:'W2'}],
  observaciones: string
}

// EI datos (adds to above):
{
  plantas: [{nombre, notas:[0-5 x10], media}, ...x10],
  plantasMedia: string,
  palatables: [{nombre, notas:[0-5 x15], media}, ...x3],
  palatablesMedia: string,
  herbaceas: [0-5 x7],
  herbaceasMedia: string,
  matorral: {
    punto1: {cobertura:%, altura:cm, especie},
    punto2: {cobertura:%, altura:cm, especie},
    mediaCob:%, mediaAlt:cm, volumen:'m³/ha'
  },
  ...fotos, fotosComp, observaciones
}
```

#### Drafts (auto-saved)
- `rapca_borrador_vp` / `rapca_borrador_el` / `rapca_borrador_ev` in localStorage
- Saved on `beforeunload`, `visibilitychange` (hidden), and manual "Guardar y Salir"

#### Photos (dual-layer cache)
- **In-memory**: `fotosCacheMemoria` object (code → base64)
- **IndexedDB**: `RAPCA_Fotos` database (version 3), three object stores:
  - `fotos` (keyPath: `codigo`) — thumbnails: 400x533 at 50% JPEG quality
  - `subidas_pendientes` (keyPath: `codigo`) — upload queue: 85% JPEG quality
  - `capas_kml` (keyPath: `nombre`) — persisted KML layers
- Photo naming: `{UNIDAD}_{TIPO}_{NUM}` (general) or `{UNIDAD}_{TIPO}_{WAYPOINT}_{NUM}` (comparative W1/W2)
- Full-resolution downloads: 3060x4080 at 95% JPEG quality, auto-downloaded to device

#### Ganaderos (localStorage: `rapca_ganaderos`)
- Livestock breeder records with custom dynamic fields
- Custom fields stored in `rapca_campos_ganadero`

#### Infraestructuras (localStorage: `rapca_infraestructuras`)
- 13 base fields: `provincia, idZona, idUnidad, codInfoca, nombre, superficie, pagoMaximo, municipio, pn, contrato, vegetacion, pendiente, distancia`
- Custom fields stored in `rapca_campos_infra`
- Excel import/export support (XLSX via SheetJS)

#### All localStorage Keys
| Key | Type | Purpose |
|-----|------|---------|
| `rapca_registros` | JSON array | All VP/EL/EI records |
| `rapca_usuarios_local` | JSON array | Local user accounts |
| `rapca_sesion` | JSON object | Current session |
| `rapca_borrador_vp` | JSON object | VP form draft |
| `rapca_borrador_el` | JSON object | EL form draft |
| `rapca_borrador_ev` | JSON object | EI form draft |
| `rapca_contadores_VP` | JSON object | VP photo counters |
| `rapca_contadores_EL` | JSON object | EL photo counters |
| `rapca_contadores_EI` | JSON object | EI photo counters |
| `rapca_ganaderos` | JSON array | Livestock records |
| `rapca_campos_ganadero` | JSON array | Custom livestock fields |
| `rapca_infraestructuras` | JSON array | Infrastructure records |
| `rapca_campos_infra` | JSON array | Custom infrastructure fields |
| `rapca_kml_capas` | JSON object | KML layer data |

### Backend Systems

#### Google Forms (primary sync for records)
- URL: `FORM_URL` constant in `app.js`
- Entry mappings: `ENTRY` object (`tipo`, `fecha`, `zona`, `unidad`, `transecto`, `datos`)
- `datos` field contains full record data as JSON string
- POST with `mode: 'no-cors'` — success assumed if no network error
- Batch sync (`syncPending`) with 600ms stagger between records

#### PHP/MySQL Backend (secondary sync + auth + photos)
- **`config.php`** — DB credentials (MySQL) and Cloudinary keys
- **`auth.php`** — User CRUD, login/logout, session validation. MySQL tables: `usuarios`, `sesiones`
- **`datos.php`** — Record sync to server. MySQL table: `registros_sync` (upsert by registro_id + email)
- **`upload.php`** — Photo upload proxy to Cloudinary. MySQL table: `fotos`
- **`notificar.php`** — Upload failure logging + admin email. MySQL table: `errores_subida`

#### Cloudinary (photo cloud storage)
- Photos uploaded as base64 via `upload.php`
- Folder structure: `rapca/{tipo}/{unidad}/{codigo}`
- Upload queue in IndexedDB (`subidas_pendientes`), processed with retry (3 attempts)
- Progress bar UI during batch uploads

### Camera & Geolocation
- Custom camera modal using `getUserMedia` with rear-facing camera (`facingMode: 'environment'`, ideal 1920x1080)
- Photos composited on canvas (3060x4080) with overlays: compass heading, mini OpenStreetMap (rendered from preloaded tiles), UTM coordinates, RAPCA branding, date, photo code
- **Photo preview modal** with annotation support: draw numbered circles on photos before accepting
- Compass via `deviceorientationabsolute` (primary) and `deviceorientation` (fallback with `webkitCompassHeading` for Safari)
- GPS via `navigator.geolocation.watchPosition` with `enableHighAccuracy: true`, `maximumAge: 5000`
- UTM conversion via inline `latLonToUTM()` function
- Map tiles preloaded from OpenStreetMap as a 3x3 tile grid at zoom level 16

### Map (Leaflet)
- Interactive Leaflet map with three basemap layers: OSM, PNOA (ortophotos), Topographic
- Marker clustering via `leaflet.markercluster`
- Record markers color-coded by type (VP=green, EL=teal, EI=orange)
- Infrastructure markers with status badges (VP/EL/EI counts, photo count)
- Photo markers (blue) from geotagged photos
- KML/KMZ file loading with persistence (localStorage + IndexedDB)
- Operator filter dropdown
- GPS position marker + "Center on me" button

### Offline Support
- Service worker (`sw.js`) uses cache-first strategy with cache name `rapca-v{N}` (currently `rapca-v32`)
- Cached files: `index.html`, `app.js`, `dashboard.js`, `timeline.js`, `comparador.js`, `manifest.json`, icons
- On install: caches all static assets, calls `skipWaiting()`
- On activate: removes old caches, calls `clients.claim()`
- On fetch: serves from cache, falls back to network
- **When updating ANY cached file, bump the cache version number in `sw.js`**

### PDF Export
- Records exported individually (`exportarPDF(id)`) or all at once (`exportarTodosPDF()`)
- `async` functions that `await obtenerTodasLasFotos()` to merge memory + IndexedDB photos
- Opens new window with styled HTML including embedded base64 photos, triggers `window.print()` after 1s
- Grid layouts: 3-column for general photos, 2-column for comparatives

### Bulk Operations
- ZIP download: by unit (`descargarZIPUnidad`) or all photos (`descargarZIPTodas`)
- Excel export/import for infrastructure (XLSX via SheetJS)
- KML export of records + infrastructure (`exportarKML`)

### Global Search
- Opened via `Ctrl+K` or search button in header
- Filters: infrastructure, records, operators
- Fuzzy search across all fields
- Quick navigation to search results

## Code Conventions

### Language
- **UI and code comments are in Spanish** — maintain this convention
- Variable and function names are a mix of Spanish and English (e.g., `guardarVP`, `showToast`, `actualizarResumenMatorral`)

### JavaScript Style
- **Mostly ES5** with `var` declarations and `function` keyword throughout
- **Exception**: `exportarPDF` and `exportarTodosPDF` use `async/await` (ES2017+) for photo retrieval
- No arrow functions in `app.js` (arrow functions only in `sw.js`)
- No modules, no imports — everything is in global scope
- Functions are densely written (often single-line with chained operations)
- DOM manipulation via `document.getElementById()` throughout
- ID naming convention: `{tipo}-{campo}` (e.g., `vp-fecha`, `ev-planta3-n5`, `ev-mat1cob`, `el-unidad`)

### CSS
- All CSS is inline in `<style>` tags within `index.html`
- Color palette:
  - Primary dark green: `#1a3d2e`
  - Secondary green: `#5b8c5a`
  - VP accent (light green): `#88d8b0`
  - EL accent (green): `#2ecc71`
  - EI accent (orange): `#fd9853`
  - Map accent (blue): `#3498db`
  - Ganadero accent (blue): `#3498db`
  - Infra accent (purple): `#8e44ad`
  - Dashboard accent (yellow): `#f39c12`
  - Timeline accent (red): `#e74c3c`
  - Comparador accent (teal): `#1abc9c`
  - Background: `#f5f5f0`
- Mobile-first responsive design with `user-scalable=no`
- Card-based layout with `.card` containers
- Menu: 2-column grid with icon cards (`.menu-grid`, `.menu-btn`)
- Nav bar: icon + text buttons with hover/active states

### Plant Species
- Predefined species list in `PLANTAS` array (32 Mediterranean species):
  `Arbutus unedo, Asparagus acutifolius, Chamaerops humilis, Cistus sp., Crataegus monogyna, Cytisus sp., Daphne gnidium, Dittrichia viscosa, Foeniculum vulgare, Genista sp., Halimium sp., Helichrysum stoechas, Juncus spp., Juniperus sp., Lavandula latifolia, Myrtus communis, Olea europaea var. sylvestris, Phillyrea angustifolia, Phlomis purpurea, Pistacia lentiscus, Quercus coccifera, Quercus ilex, Quercus sp., Retama sphaerocarpa, Rhamnus sp., Rosa sp., Rosmarinus officinalis, Rubus ulmifolius, Salvia rosmarinus, Spartium junceum, Thymus sp., Ulex sp.`
- Used for autocomplete in plant name inputs (EI form plants, palatables, and matorral species)

### Evaluation Scoring (EI)
- Plant notes: 0-5 scale, 10 plants x 10 notes each (100 scores total per transect)
- Palatable notes: 0-5 scale, 3 plants x 15 notes each (45 scores total per transect)
- Herbaceous notes: 0-5 scale, 7 items (H1–H7)
- Grazing degree: NP/PL/PM/PI/PMI (No Pastoreo to Pastoreo Muy Intenso)
- Pasture observation: A/B/M/N categories (Señal Paso, Veredas, Cagarrutas)
- Matorral: 2 measurement points, each with coverage (%), height (cm), species — with auto-calculated mean coverage, mean height, and volume (m³/ha)
- Volume formula: `(cobMedia/100) × (altMedia/100) × 10000`

### Transects (EI only)
- 3 transects per unit (T1, T2, T3)
- After saving T3, the form fully resets for the next unit (`limpiarFormularioEV(true)`)
- Between transects, only the scoring data resets; identification fields stay (`limpiarFormularioEV(false)`)

## Global Variables (app.js lines 1–35)

| Variable | Purpose |
|----------|---------|
| `AUTH_URL` / `DATOS_URL` / `UPLOAD_URL` | PHP backend endpoints |
| `sesionActual` | Current user session `{token, email, nombre, rol, id}` |
| `FORM_URL` / `ENTRY` | Google Forms endpoint and field mappings |
| `PLANTAS` | Array of 32 plant species for autocomplete |
| `transectoActual` | Current transect number (1–3) |
| `isOnline` | Network status flag |
| `currentAutocomplete` | Active autocomplete `{input, list}` |
| `editandoId` | ID of record being edited (null when creating) |
| `cameraStream` / `camaraTipo` / `camaraSubtipo` | Active camera state |
| `currentHeading` | Device compass heading in degrees |
| `contadorFotosVP` / `contadorFotosEV` / `contadorFotosEL` | Photo counter objects |
| `currentLat` / `currentLon` / `currentUTM` | GPS position |
| `deferredPrompt` | PWA install prompt |
| `mapTilesLoaded` | Preloaded OSM tile images array |
| `mapaLeaflet` / `controlCapas` / `capasKML` / `capasKMLRaw` | Leaflet map instances |
| `marcadorPosicion` / `clusterGroup` | Map markers |
| `syncEnProgreso` / `syncStats` / `fallosSubida` | Photo upload state |
| `anotaciones` / `modoAnotacion` | Photo annotation state |
| `editandoGanaderoId` / `editandoInfraId` | Edit state for livestock/infra |
| `camposExtraGan` / `camposExtraInf` | Custom field arrays |
| `INFRA_CAMPOS_BASE` | 13 base infrastructure field definitions |
| `fotosDB` | IndexedDB database reference |
| `fotosCacheMemoria` | In-memory photo cache (code → base64) |

## Key Functions Reference

### app.js — Authentication & Session (~750-900)

| Function | Line | Description |
|----------|------|-------------|
| `getUsuariosLocal()` | 37 | Get local user DB |
| `guardarUsuariosLocal(lista)` | 38 | Save local user DB |
| `initUsuariosLocal()` | 39 | Init default admin + migrate old credentials |
| `loginLocal(email, password)` | 61 | Local login validation |
| `crearUsuarioLocal(email, nombre, password, rol)` | 67 | Create local user |
| `iniciarSesion()` | 748 | Login handler (server → local fallback) |
| `validarSesion()` | 782 | Validate session token |
| `cerrarSesion()` | 797 | Logout + clear session |
| `ocultarLoginMostrarApp()` | 806 | Hide login, show app |
| `crearUsuario()` | 816 | Admin: create user |
| `cargarListaUsuarios()` | 834 | Admin: render user list |
| `toggleUsuario(id)` | 865 | Admin: enable/disable user |
| `cambiarPasswordUsuario(id)` | 873 | Admin: change password |
| `eliminarUsuario(id, email)` | 882 | Admin: delete user |

### app.js — IndexedDB & Photos (~84-260)

| Function | Line | Description |
|----------|------|-------------|
| `initFotosDB()` | 84 | Open IndexedDB `RAPCA_Fotos` v3 (3 stores) |
| `guardarFotoEnDB(codigo, dataUrl)` | 108 | Save photo to DB + memory cache |
| `obtenerTodasLasFotos()` | 124 | Merge memory + IndexedDB photos |
| `limpiarFotosAntiguasDB()` | 159 | Delete photos older than 5 days |
| `guardarSubidaPendiente(codigo, dataUrl, unidad, tipo)` | 176 | Queue photo for cloud upload |
| `eliminarSubidaPendiente(codigo)` | 180 | Remove from upload queue |
| `procesarSubidasPendientes()` | 188 | Start processing upload queue |
| `subirFotoNube(codigo, dataUrl, unidad, tipo)` | 204 | Upload single photo to cloud |
| `subirConReintentos(codigo, dataUrl, unidad, tipo, maxI, cb)` | 219 | Upload with 3 retries |

### app.js — Map (Leaflet & KML) (~261-530)

| Function | Line | Description |
|----------|------|-------------|
| `initMapa()` | 261 | Init Leaflet with OSM/PNOA/Topographic layers |
| `poblarFiltrosMapa()` | 282 | Populate operator filter |
| `actualizarMarcadoresMapa()` | 293 | Update all map markers |
| `cargarArchivoMapa(file)` | 358 | Load KML/KMZ file |
| `procesarKML(kmlText, nombre)` | 379 | Parse and display KML |
| `parsearKML(kmlText)` | 393 | Convert KML to Leaflet features |
| `centrarEnMiPosicion()` | 509 | Center map on GPS |
| `exportarKML()` | 1477 | Export records + infra as KML |

### app.js — Camera & Capture (~548-745)

| Function | Line | Description |
|----------|------|-------------|
| `iniciarGeolocalizacion()` | 548 | Start GPS watchPosition |
| `latLonToUTM(lat, lon)` | 549 | Convert lat/lon to UTM |
| `precargarMapTiles()` | 552 | Preload 3x3 OSM tile grid |
| `abrirCamara(tipo, subtipo)` | 572 | Open camera modal |
| `actualizarBrujula()` | 584 | Update compass overlay |
| `cerrarCamara()` | 585 | Close camera, decrement counter |
| `dibujarMapaEnCanvas(ctx, x, y, w, h)` | 587 | Draw OSM tiles on canvas |
| `capturarFoto()` | 596 | Capture photo with overlays |
| `mostrarVistaPrevia()` | 628 | Show photo preview modal |
| `toggleAnotacion()` | 662 | Toggle annotation drawing mode |
| `aceptarFoto()` | 680 | Accept photo, save + download + queue upload |
| `agregarFotoALista(c)` | 745 | Add photo code to form UI |

### app.js — Form Data & Saving (~947-990)

| Function | Line | Description |
|----------|------|-------------|
| `generarPlantas()` | 951 | Create 10 plant boxes x 10 score inputs |
| `generarPalatables()` | 952 | Create 3 palatable boxes x 15 inputs |
| `generarHerbaceas()` | 953 | Create 7 herbaceous inputs |
| `obtenerDatosVP()` / `cargarDatosVP(d)` | 965-966 | VP form read/write |
| `obtenerDatosEL()` / `cargarDatosEL(d)` | 972-973 | EL form read/write |
| `obtenerDatosEV()` / `cargarDatosEV(d)` | 967-968 | EI form read/write |
| `guardarVP()` | 977 | Validate + save VP record |
| `guardarEL()` | 974 | Validate + save EL record |
| `guardarEV()` | 978 | Validate + save EI record, advance transect |
| `guardarBorradores()` / `cargarBorradores()` | 963-964 | Draft auto-save/restore |

### app.js — Records & Sync (~979-990)

| Function | Line | Description |
|----------|------|-------------|
| `getRegistros()` | 979 | Get all records from localStorage |
| `getRegistrosUsuario()` | 980 | Get user's records (all if admin) |
| `guardarLocal(r)` | 981 | Append record to localStorage |
| `actualizarRegistro(r)` | 982 | Update record by ID |
| `enviarRegistro(r)` | 985 | POST to Google Forms |
| `syncPending()` | 986 | Send all unsent records (600ms stagger) |
| `sincronizarRegistroServidor(registro)` | 908 | Sync to PHP backend |
| `loadPanel()` | 987 | Render records list in panel |
| `editarRegistro(id)` | 988 | Load record for editing |
| `eliminarRegistro(id)` | 989 | Delete record |
| `borrarTodo()` | 990 | Delete all user's records |

### app.js — Navigation & UI (~960-1110)

| Function | Line | Description |
|----------|------|-------------|
| `showPage(p)` | 960 | Switch active page + nav tab |
| `toggleSection(id)` | 961 | Toggle collapsible section |
| `setTransecto(n)` | 962 | Set transect 1-3 |
| `updateSyncStatus()` | 1108 | Update online/offline indicator |
| `showLoading(s)` | 1109 | Show/hide loading spinner |
| `showToast(m, t)` | 1110 | Show 3-second toast |
| `abrirBusqueda()` | 1348 | Open global search (Ctrl+K) |
| `ejecutarBusqueda()` | 1365 | Execute search query |

### app.js — PDF & Export (~993-1106)

| Function | Line | Description |
|----------|------|-------------|
| `generarHTMLRegistroConFotos(r, fotos)` | 993 | Generate styled HTML for PDF |
| `exportarPDF(id)` | 1072 | Export single record as PDF |
| `exportarTodosPDF()` | 1088 | Export all records as multi-page PDF |

### app.js — Ganaderos (~1120-1195)

| Function | Line | Description |
|----------|------|-------------|
| `getGanaderos()` / `guardarGanaderos(lista)` | 1120-1121 | CRUD helpers |
| `guardarGanadero()` | 1122 | Save/update livestock record |
| `cargarListaGanaderos()` | 1137 | Render list with search |
| `editarGanadero(id)` / `eliminarGanadero(id)` | 1156/1169 | Edit/delete |
| `agregarCampoGanadero()` / `renderCamposExtraGan()` | 1174/1185 | Custom fields |

### app.js — Infraestructuras (~1196-1340)

| Function | Line | Description |
|----------|------|-------------|
| `getInfras()` / `guardarInfras(lista)` | 1196-1197 | CRUD helpers |
| `guardarInfra()` | 1198 | Save/update infrastructure |
| `cargarListaInfra()` | 1213 | Render list with search + status badges |
| `editarInfra(id)` / `eliminarInfra(id)` | 1249/1256 | Edit/delete |
| `importarExcel(file)` | 1283 | Import infrastructure from Excel |
| `exportarExcel()` | 1320 | Export infrastructure to Excel |

### app.js — Bulk Downloads & KML (~1414-1530)

| Function | Line | Description |
|----------|------|-------------|
| `descargarZIPUnidad(unidad)` | 1414 | Download unit photos as ZIP |
| `descargarZIPTodas()` | 1444 | Download all photos as ZIP |
| `exportarKML()` | 1477 | Export records + infra as KML |

### dashboard.js

| Function | Description |
|----------|-------------|
| `initDashboard()` | Initialize dashboard |
| `poblarFiltrosDashboard()` | Populate filter dropdowns (zona, provincia, municipio, PN, operador) |
| `actualizarDashboard()` | Calculate metrics + render charts |
| `filtrarRegistrosDash()` / `filtrarInfrasDash()` | Apply filters |
| `renderChartActividad(rs)` | Stacked bar chart (activity by day, last 30 days) |
| `renderChartTipos(vp, el, ei)` | Doughnut chart (distribution by type) |
| `renderAlertasDash(rs)` | Pending sync + units missing EI alerts |

### timeline.js

| Function | Description |
|----------|-------------|
| `initTimeline()` | Initialize timeline feed |
| `actualizarTimeline()` | Render filtered inspection list (max 100) |
| `obtenerFotosDeRegistro(r)` | Extract photo codes from record |
| `abrirLightbox(registroId, fotoIdx)` | Open photo lightbox |
| `mostrarFotoLightbox()` / `navLightbox(dir)` | Navigate lightbox |

### comparador.js

| Function | Description |
|----------|-------------|
| `initComparador()` | Populate unit selector |
| `cargarFechasComparador()` | Load dates for selected unit |
| `cargarFotosComparador()` | Load and compare photos |
| `setModoComparador(modo)` | Switch `slider` / `side` mode |
| `renderSlider(fotos1, fotos2, r1, r2)` | Before/after slider overlay |
| `renderSideBySide(fotos1, fotos2, r1, r2)` | Side-by-side grid |

## Event Listeners (app.js)

| Event | Target | Purpose |
|-------|--------|---------|
| `beforeinstallprompt` | window | Store PWA install prompt |
| `appinstalled` | window | Confirm installation |
| `beforeunload` | window | Save drafts |
| `visibilitychange` | document | Save drafts when hidden |
| `deviceorientationabsolute` | window | Compass heading (primary) |
| `deviceorientation` | window | Compass heading (Safari fallback) |
| `online` / `offline` | window | Update sync status, process uploads |
| `click` | document | Close autocomplete on outside click |
| `DOMContentLoaded` | document | Init users, validate session, setup login |
| `keydown` | document | Ctrl+K search, Escape close search |

## Photo System Details

### Counter Logic
- **Counter keys**: `{unidad}_{tipo}_{G|W1|W2}` (general uses `G`)
- Counters stored per type: `rapca_contadores_VP` / `rapca_contadores_EL` / `rapca_contadores_EI`
- Pre-incremented on camera open (`getNextFotoNum`), decremented on cancel (`cerrarCamara`)
- Reinitialized from existing codes on edit (`inicializarContadoresDesdeEdicion`)

### Photo Pipeline
1. Camera opens → counter pre-incremented → photo code generated
2. Photo captured → canvas composited (3060x4080) with overlays
3. Preview modal shown → user can annotate (circles) or retake
4. On accept:
   - Thumbnail (400x533, 50% quality) saved to memory + IndexedDB
   - Full-res (95% quality) auto-downloaded to device
   - Upload version (85% quality) queued in `subidas_pendientes`
5. Cloud upload processed via `upload.php` → Cloudinary

### Photo Annotations
- User draws circles on preview canvas
- Numbered markers (red circles with numbers)
- Undo support
- Annotations burned into final saved photo

## Development Workflow

### Running Locally
```bash
# PHP (recommended — includes backend)
php -S localhost:8000

# Python (frontend only)
python3 -m http.server 8000

# Node.js (frontend only)
npx serve .
```
For camera/GPS features, use HTTPS or localhost.

### Making Changes
1. Edit `index.html` for UI/CSS changes
2. Edit `app.js` for core logic
3. Edit `dashboard.js` / `timeline.js` / `comparador.js` for respective modules
4. Edit PHP files for backend changes
5. **Bump `CACHE_NAME` in `sw.js`** whenever you change ANY cached file
6. Test on mobile (or Chrome DevTools mobile emulation) — this is a mobile-first app

### Backend Requirements
- PHP 7.4+ with cURL and PDO MySQL extensions
- MySQL database (credentials in `config.php`)
- Cloudinary account (credentials in `config.php`)
- Backend is optional — app works fully offline with local auth

### No Build / No Tests
- There is no build step, linter, or test suite
- Changes are immediately reflected when served
- Manual testing in mobile browser is the primary QA method

### Deployment
- Static file hosting for frontend (GitHub Pages, Netlify, or any web server)
- PHP hosting for backend (Hostinger, shared hosting, VPS)
- All files served from the same directory (relative paths)

## Common Pitfalls

- **Forgetting to bump `sw.js` cache version** — changes won't appear for users who already have the app cached
- **ID naming must be exact** — the entire app relies on DOM element IDs with specific naming patterns (`ev-planta{N}-n{M}`, `ev-palatable{N}-n{M}`, `ev-herb{N}`, `ev-mat{N}cob`, `el-unidad`, etc.)
- **EV vs EI naming** — the code internally uses both `EV` and `EI`. Records use `tipo: 'EI'` but many function names still use `EV` (e.g., `guardarEV`, `obtenerDatosEV`, `limpiarFormularioEV`). The HTML page ID is `page-ev`. Do not rename without migrating all references.
- **Google Forms URL and entry IDs** — if the backend form changes, update both `FORM_URL` and `ENTRY` constants at the top of `app.js`
- **Photo storage limits** — base64 thumbnails in IndexedDB can accumulate; the 5-day cleanup mitigates this
- **No CORS on Google Forms** — sync uses `mode: 'no-cors'`, which means you can't read the response
- **Dense single-line functions** — many functions are compressed onto single lines; read carefully before modifying
- **async/await in PDF functions** — `exportarPDF` and `exportarTodosPDF` are the only `async` functions; all other async code uses Promise callbacks
- **Photo counter consistency** — the counter pre-increments on camera open and decrements on cancel; modifying this logic can cause numbering gaps or duplicates
- **Dual auth paths** — login tries server first, falls back to local. Both must stay in sync for user management.
- **config.php contains secrets** — DB passwords and Cloudinary API keys. Never commit changes that expose these.
- **External libraries loaded via CDN** — Leaflet, MarkerCluster, Chart.js, SheetJS are loaded from CDNs in `index.html`; no local copies.
