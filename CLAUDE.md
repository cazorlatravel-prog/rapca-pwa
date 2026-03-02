# CLAUDE.md — RAPCA Campo PWA

## Descripcion del Proyecto

**RAPCA Campo** es una Progressive Web App (PWA) para la recogida de datos de campo en campanas de evaluacion ecologica y pastoral (RAPCA EMA — Evaluacion de Medios Agropecuarios). Esta disenada para uso movil con capacidad offline, pensada para tecnicos de campo que recogen datos de vegetacion, pastoreo y matorral en zonas rurales de Espana.

La app tiene dos flujos principales:
- **VP (Visitas Previas)** — Visitas preliminares: evaluacion de grados de pastoreo, observacion del estado del pasto y captura de fotos geolocalizadas.
- **EV (Evaluacion)** — Evaluacion completa: puntuacion de plantas por transectos (T1/T2/T3), evaluacion de especies palatables, cobertura herbacea, cobertura/altura de matorral ("matorralizacion") y fotos geolocalizadas.

Los datos se almacenan localmente (localStorage + IndexedDB para fotos) y se sincronizan con un Google Form cuando hay conexion.

## Estructura de Archivos

```
rapca-pwa/
├── index.html            # HTML de pagina unica con toda la UI y CSS en linea (~166 lineas)
├── app.js                # Toda la logica de la aplicacion (~381 lineas, JS vanilla)
├── sw.js                 # Service worker para cache offline
├── manifest.json         # Manifiesto PWA (standalone, portrait, tema #1a3d2e)
├── icon-192.png          # Icono de la app 192x192
├── icon-512.png          # Icono de la app 512x512
├── icon-512-maskable.png # Icono maskable para Android
└── CLAUDE.md             # Este archivo
```

**Sin paso de build, sin bundler, sin framework.** Toda la app es HTML/CSS/JS vanilla servida como archivos estaticos.

## Arquitectura y Conceptos Clave

### Navegacion de Pagina Unica
- Cuatro paginas: `menu`, `vp`, `ev`, `panel` — se alternan con la clase CSS `.active`
- Navegacion mediante la funcion `showPage(nombrePagina)` y una barra de navegacion superior
- Todo el HTML esta en `index.html`; la UI dinamica (grids de plantas, listas de fotos) se genera en `app.js`

### Modelo de Datos
- Los **registros** se guardan en `localStorage` bajo la clave `rapca_registros` como un array JSON
- Cada registro: `{ id, tipo ('VP'|'EV'), fecha, zona, unidad, transecto, datos, enviado }`
- Los **borradores** se autoguardan en `rapca_borrador_vp` / `rapca_borrador_ev` en localStorage
- Las **fotos** se guardan como miniaturas JPEG en base64 tanto en cache en memoria (`fotosCacheMemoria`) como en IndexedDB (base de datos `RAPCA_Fotos`, object store `fotos`)
- Convencion de nombres de fotos: `{UNIDAD}_{TIPO}_{NUM}` o `{UNIDAD}_{TIPO}_{WAYPOINT}_{NUM}`

### Backend con Google Forms
- Sincronizacion de datos mediante POST a una URL de Google Forms (`FORM_URL`) con modo `no-cors`
- Los campos se mapean mediante el objeto `ENTRY` (IDs de entrada para tipo, fecha, zona, unidad, transecto, datos)
- El campo `datos` contiene toda la informacion del registro como JSON serializado
- La sincronizacion se intenta inmediatamente al guardar si hay conexion; si no, los registros se encolan con `enviado: false`

### Camara y Geolocalizacion
- Modal de camara personalizado usando `getUserMedia` con camara trasera (`facingMode: 'environment'`)
- Las fotos se componen en un canvas (3060x4080) con overlays: brujula, mini mapa OpenStreetMap, coordenadas UTM, marca RAPCA, fecha y codigo de foto
- API de orientacion del dispositivo para la brujula
- GPS mediante `navigator.geolocation.watchPosition` con conversion a UTM (`latLonToUTM`)
- Tiles del mapa precargados desde OpenStreetMap para el overlay del canvas

### Soporte Offline
- El service worker (`sw.js`) usa estrategia cache-first con nombre de cache `rapca-v{N}`
- Al instalar: cachea todos los recursos estaticos
- Al activar: elimina caches antiguos
- Al hacer fetch: sirve desde cache, si falla va a red
- **Al actualizar archivos cacheados, hay que incrementar el numero de version del cache en `sw.js`**

### Exportacion PDF
- Los registros se pueden exportar individualmente o todos a la vez mediante `exportarPDF()` / `exportarTodosPDF()`
- Abre una nueva ventana con HTML estilizado incluyendo miniaturas de fotos embebidas, y luego lanza `window.print()`

## Convenciones de Codigo

### Idioma
- **La UI y los comentarios del codigo estan en espanol** — mantener esta convencion
- Los nombres de variables y funciones son una mezcla de espanol e ingles (ej: `guardarVP`, `showToast`, `actualizarResumenMatorral`)

### Estilo JavaScript
- **Compatible con ES5** usando declaraciones `var` y la palabra clave `function` (sin arrow functions excepto en el service worker)
- Sin modulos, sin imports — todo esta en scope global
- Las funciones estan escritas de forma compacta (a menudo en una sola linea con operaciones encadenadas)
- Manipulacion del DOM mediante `document.getElementById()` en todo el codigo
- Convencion de nombres de IDs: `{tipo}-{campo}` (ej: `vp-fecha`, `ev-planta3-n5`, `ev-mat1cob`)

### CSS
- Todo el CSS esta en linea dentro de etiquetas `<style>` en `index.html`
- Paleta de colores:
  - Verde oscuro principal: `#1a3d2e`
  - Verde secundario: `#5b8c5a`
  - Acento VP (verde claro): `#88d8b0`
  - Acento EV (naranja): `#fd9853`
  - Fondo: `#f5f5f0`
- Diseno responsive mobile-first con `user-scalable=no`
- Layout basado en tarjetas con contenedores `.card`

### Especies Vegetales
- Lista predefinida de especies en el array `PLANTAS` (32 especies mediterraneas)
- Se usa para autocompletado en los inputs de nombres de plantas (formulario EV y especies de matorral)

### Sistema de Puntuacion de Evaluacion
- Notas de plantas: escala 0-5, 10 plantas x 10 notas cada una
- Notas de palatables: escala 0-5, 3 plantas x 15 notas cada una
- Notas de herbaceas: escala 0-5, 7 items
- Grado de pastoreo: NP/PL/PM/PI/PMI (No Pastoreo hasta Pastoreo Muy Intenso)
- Observacion del pasto: categorias A/B/M/N
- Matorral: cobertura (%), altura (cm), especie — con calculo automatico del volumen (m3/ha)

### Transectos (solo EV)
- 3 transectos por unidad (T1, T2, T3)
- Al guardar T3, el formulario se resetea completamente para la siguiente unidad
- Entre transectos, solo se resetean los datos de puntuacion (la identificacion se mantiene)

## Detalles Importantes de Implementacion

### Sistema de Contadores de Fotos
- Los contadores de fotos se rastrean por clave `{unidad}_{tipo}_{subtipo}`
- Se guardan en localStorage como `rapca_contadores_VP` / `rapca_contadores_EV`
- El contador se decrementa cuando se cancela la camara (`cerrarCamara`)
- Al editar, los contadores se reinicializan a partir de los codigos de fotos existentes (`inicializarContadoresDesdeEdicion`)

### Derivacion Automatica de Zona
- El ID de zona se deriva automaticamente del ID de unidad eliminando los digitos finales: `actualizarZonaDesdeUnidad`
- Ejemplo: Unidad `23AJE01` -> Zona `23AJE`

### Limpieza de Fotos en IndexedDB
- Las fotos con mas de 5 dias se eliminan automaticamente al iniciar la app (`limpiarFotosAntiguasDB`)

### Prevencion del Boton Atras
- `history.pushState` + `onpopstate` evita la navegacion accidental hacia atras
- Se indica al usuario que use el boton "Guardar y Salir"

### Instalacion PWA
- Escucha el evento `beforeinstallprompt` para mostrar un boton de instalacion personalizado
- Se oculta cuando ya esta ejecutandose en modo standalone

## Flujo de Desarrollo

### Ejecutar en Local
Servir el directorio del proyecto con cualquier servidor de archivos estaticos:
```bash
# Python
python3 -m http.server 8000

# Node.js (npx)
npx serve .

# PHP
php -S localhost:8000
```
Abrir `http://localhost:8000` en un navegador. Para funciones de camara/GPS, usar HTTPS o localhost.

### Hacer Cambios
1. Editar `index.html` para cambios de UI/CSS
2. Editar `app.js` para cambios de logica
3. **Incrementar `CACHE_NAME` en `sw.js`** (ej: `rapca-v13` -> `rapca-v14`) cada vez que se modifique cualquier archivo, para que el service worker recoja las actualizaciones
4. Probar en movil (o emulacion movil de Chrome DevTools) — esta es una app mobile-first

### Sin Build / Sin Tests
- No hay paso de build, linter ni suite de tests
- Los cambios se reflejan inmediatamente al servir
- La prueba manual en navegador movil es el metodo principal de QA

### Despliegue
- Hosting de archivos estaticos (GitHub Pages, Netlify o cualquier servidor web)
- Todos los archivos deben servirse desde el mismo directorio (se usan rutas relativas en todo el proyecto)

## Errores Comunes

- **Olvidar incrementar la version del cache en `sw.js`** — los cambios no apareceran para usuarios que ya tienen la app cacheada
- **Los nombres de IDs deben ser exactos** — toda la app depende de IDs de elementos DOM con patrones de nombres especificos (`ev-planta{N}-n{M}`, `ev-palatable{N}-n{M}`, etc.)
- **URL y entry IDs de Google Forms** — si el formulario backend cambia, actualizar tanto `FORM_URL` como las constantes de `ENTRY` al principio de `app.js`
- **Limites de almacenamiento de fotos** — las miniaturas base64 en IndexedDB pueden acumularse; la limpieza de 5 dias lo mitiga
- **Sin CORS en Google Forms** — la sincronizacion usa `mode: 'no-cors'`, lo que significa que no se puede leer la respuesta; se asume exito si no hay error de red
