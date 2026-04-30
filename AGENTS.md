# AGENTS.md

## Purpose

This repo is a small browser-only BSC5 editor. Future agents should optimize for quick local understanding rather than broad exploration.

## Fast start

- Start with `js/app.js`. It owns application state and wires every other module together.
- Only branch outward after identifying which slice is responsible:
  - BSC5 parsing and serialization: `js/catalog-bsc.js`
  - HYG parsing and serialization: `js/catalog-hyg.js`
  - camera math and sky projection: `js/camera.js`
  - renderer composition and exported API: `js/renderer.js`
  - renderer draw passes and shader setup: `js/renderer-pipeline.js`
  - star GPU buffers and incremental sync: `js/renderer-star-buffer.js`
  - projected grid overlays and labels: `js/renderer-overlay.js`
  - picking and pixel-to-sky conversion: `js/picking.js`
  - editor/catalog actions and selection state: `js/app-editor-actions.js`
  - resize, render loop, and live observer updates: `js/app-runtime.js`
  - canvas mouse/keyboard interactions: `js/app-canvas-interactions.js`
  - top-level UI composition and file I/O: `js/ui.js`
  - star form sync and selection panel state: `js/ui-star-form.js`
  - spectral type and distance decoding: `js/spectral.js`
  - star name / Bayer / Flamsteed / constellation decoding: `js/star-name.js`
  - sky mode/location/time controls: `js/ui-sky-controls.js`

## Control flow

- App boot: `index.html` -> manifest/icon links + service-worker registration (when supported) -> `js/app.js` -> `createEditorActions()` / `createCanvasInteractions()` / `startAppRuntime()`
- File open: `js/ui.js` -> `controller.loadCatalog()` -> format detected from file extension (`.csv` → HYG, else BSC) -> `parseBscCatalog()` or `parseHygCatalog()` -> `syncAll()`
- Side-panel edit: `js/ui-star-form.js` -> mutate selected star -> `controller.onStarEdited()` -> `refreshStarPhotometry()` -> `syncOne()`
- Side-panel title display: `js/ui-star-form.js:refreshSelection()` -> `formatSidebarTitle()` -> optional Bayer-style decode for the panel title only
- Canvas input: `js/app.js` -> `createCanvasInteractions()` in `js/app-canvas-interactions.js` -> selection / add / drag / pan / zoom handlers
- Add star: `js/app-canvas-interactions.js` -> `js/app-editor-actions.js:addStarAtPixel()` -> `pixelToRADec()` -> `makeNewStar()` -> `appendStar()`
- Delete star: `js/app-editor-actions.js:deleteStarAt()` -> swap-and-pop in app state -> `removeAt()`
- Save: `js/ui.js` -> `controller.serialize()` -> File System Access write when `state.fileHandle` is available, otherwise `showSaveFilePicker()` on Chromium or a Blob download fallback on Firefox/non-FSA contexts -> `markSaved()`

## Code style

- Two blank lines between function declarations (top-level and nested).
- Indentation: tabs, width 4. Configured in `.vscode/settings.json`.
- Prefer descriptive variable names; avoid terse names unless the scope is trivially obvious.
- Add brief comments for non-trivial control flow, math, state transitions, or data-shape assumptions when the intent would otherwise require re-reading the code.

## Project-specific rules

- Preserve byte-level round-tripping where possible. Both `js/catalog-bsc.js` and `js/catalog-hyg.js` keep `_raw` for untouched records; only `_edited` stars are reconstructed on save.
- Treat `ybsc5.readme` as the authoritative field-layout reference before changing parse/serialize offsets.
- Do not introduce a Node.js-based verification path. The user does not have Node installed and does not intend to install it.
- When adding any new feature, update this file. Add a section or extend an existing one to cover: what the feature does, which files it touches, and any non-obvious control flow or state. Keep entries concise but complete enough that a future agent can understand the design without re-reading the code.
- Prefer minimal browser-manual verification notes in final responses.

## Useful anchors

- Central state: `state` in `js/app.js`
- Editor action wiring: `createEditorActions()` in `js/app-editor-actions.js`
- Selection logic: `selectStar()` in `js/app-editor-actions.js`
- Canvas interaction wiring: `createCanvasInteractions()` in `js/app-canvas-interactions.js`
- Runtime scheduling: `startAppRuntime()` in `js/app-runtime.js`
- Dirty tracking: `state.isDirty` in `js/app.js` plus `markSaved()` and `onStarEdited()` in `js/app-editor-actions.js`
- Derived star visuals: `refreshStarPhotometry()` in `js/catalog.js`
- GPU full sync vs incremental sync: `syncAll()`, `syncOne()` in `js/renderer-star-buffer.js` (re-exported by `js/renderer.js`)
- Shared local-horizon helpers: `localHorizonBasis()` and `altAzDir()` in `js/camera.js`
- Sky/observer state: `skyState` in `js/app.js`
- Sidereal time and horizon math: `js/sky.js`

## Sidebar title formatting

- `formatSidebarTitleName()` in `js/ui-star-form.js` decodes a narrow subset of BSC `Name` values for the selected-star sidebar title only.
- Supported display decode: optional leading Flamsteed number plus a Bayer Greek abbreviation and 3-letter constellation code, rendered as `α Lyrae`-style text. If both Flamsteed and Bayer are present, the sidebar title drops the Flamsteed number and shows only the Bayer form.
- Supported component decode: Bayer component indices attached to or spaced after the Greek abbreviation, such as `Kap1Cet`, `Bet2Cyg`, or `Pi 2Cyg`, render with superscript digits as `κ¹ Ceti`, `β² Cygni`, or `π² Cygni`.
- Supported Flamsteed-only decode: names such as `34 Cyg` render as `34 Cygni` when the name is only a Flamsteed number plus a 3-letter constellation code.
- The editable `Name` field and catalog serialization stay raw; this is display-only. Ambiguous or non-matching names such as variable-star IDs or catalog identifiers fall back to the unmodified catalog text.

## Renderer split

- `js/renderer.js` now owns renderer composition, shared renderer state assembly, and the exported renderer API.
- `js/renderer-pipeline.js` owns shader program creation plus the ground/ring/star WebGL draw passes.
- `js/renderer-star-buffer.js` owns star attribute buffer allocation plus `syncAll()`, `syncOne()`, `appendStar()`, `removeAt()`, and `setAltitudes()`.
- `js/renderer-overlay.js` owns the RA/Dec and Alt/Az grid projection/drawing helpers used by `drawGridOverlay()`, while reusing `localHorizonBasis()` / `altAzDir()` from `js/camera.js`.
- `createRenderer()` in `js/renderer.js` builds the shared renderer state, delegates pipeline setup to `createRendererPipeline()`, delegates star-buffer setup to `createStarBuffers()`, and `render()` delegates WebGL drawing to `drawRenderPipeline()` before overlay drawing runs.

## Brightness soft saturation

- Bright-star anti-clipping now lives only in the raised-cosine star shader pair `STAR_VS_RCOS` / `STAR_FS_RCOS` in `js/renderer-pipeline.js`.
- The raw rendered star color is still computed the old way: catalog RGB × `aFlux` × `uBrightness` × optional horizon dimming.
- If every channel stays below the active RCOS threshold, the shader renders the star exactly as before.
- If any channel exceeds that threshold, the shader divides the color by that peak channel and scales `gl_PointSize`, so hue is preserved and the integrated sprite energy grows through area instead of channel clipping.
- The small tent preset does not apply this clipping/normalization path; `STAR_VS_TENT` renders catalog RGB × `aFlux` × `uBrightness` × horizon dimming directly.
- Non-obvious shader detail: both star fragment kernels are size-agnostic in normalized `gl_PointCoord` space, so visible star size is controlled entirely by `gl_PointSize` from their matching vertex shaders.
- Touched files: `js/renderer-pipeline.js`, `AGENTS.md`.

## Star size presets

- The toolbar now includes a `Star Size` segmented control before `RA/Dec Grid`, with presets `Small`, `Medium`, and `Large`.
- The toolbar variant is icon-only: three inline SVG star glyphs at increasing apparent sizes. Each glyph uses `currentColor`, so the existing button `color` switch handles contrast automatically for inactive, hover, and active states.
- Preset ownership is split across UI and renderer state: `state.starSize` in `js/app.js` stores the active preset name, `setStarSizePreset()` in `js/app-editor-actions.js` maps preset names to renderer settings, and `createUI()` in `js/ui.js` mirrors the active button state.
- Preset mapping: `Small` uses `pointSize = 2` with the tent shader pair `STAR_VS_TENT` / `STAR_FS_TENT`; `Medium` uses `pointSize = 4` with the raised-cosine pair `STAR_VS_RCOS` / `STAR_FS_RCOS`; `Large` uses `pointSize = 6` with the same raised-cosine pair.
- `createRendererPipeline()` in `js/renderer-pipeline.js` now compiles both star shader pairs up front. Non-obvious renderer detail: both star programs bind the same attribute locations before link, so the existing single star VAO from `js/renderer-star-buffer.js` can be reused while `drawRenderPipeline()` switches between programs via `renderer.starKernel`.
- Default startup preset is `Medium`, which initializes renderer state to `pointSize = 4` and kernel `rcos` in `js/renderer.js` / `js/app.js`.
- Touched files: `index.html`, `styles.css`, `js/ui.js`, `js/app.js`, `js/app-editor-actions.js`, `js/renderer.js`, `js/renderer-pipeline.js`, `AGENTS.md`.

## View modes

There are three view modes, toggled by a segmented button in the toolbar (`#sky-mode-toggle`) and owned by `skyState.mode` in `js/app.js`.

**All-sky** (`mode: 'allsky'`): Default. Full stereographic projection, free-form pan (camera can roll freely), all stars rendered at full brightness. Horizon and observer state are unused.

**All-sky + Horizon** (`mode: 'highlight'`): Same projection and free pan as All-sky. Stars below the observer's horizon are dimmed by `renderer.dimFactor` (default 0.18). Per-star altitudes are computed CPU-side each frame by `computeAltitudes()` in `js/sky.js` and uploaded via `setAltitudes()` to a dedicated `aAlt` GPU attribute. The shader (`STAR_VS` in `js/renderer-pipeline.js`) checks `uHorizonMode == 1` and applies the dim factor when `aAlt < 0.0`.

**Local** (`mode: 'local'`): Stars below the horizon are fully culled (shader checks `uHorizonMode == 2 && aAlt < 0.0`). Camera is constrained: `camera.up` always points toward the zenith, so pan is pure azimuth/altitude with no roll. Pan in Local mode is implemented by a direct alt/az delta: on RMB mousedown the pixel position and current center alt/az are captured (via `fwdToAltAz()` in `js/camera.js`); each mousemove computes `(dx, dy)` from the start pixel, converts to angle deltas using `fov / (height/2)` rad/px, and calls `lookAtAltAz()` with the new values. This avoids the degeneracies of the sphere-drag approach. Entering Local mode snaps the camera to `alt=DEFAULT_LOCAL_ALT, az=0` via `lookAtAltAz()` in `js/app.js`, and location changes while already in Local mode reuse that same reset view. Picking also skips below-horizon stars (optional `altitudes` param in `pickStar()`).

**Observer state** (`skyState.observer` in `js/app.js`): holds `lat`, `lon`, `utcMs`, and derived `lst` + `zenithWorld`. Updated by `updateObserver()` from `js/sky.js` before each frame that needs altitudes. Built-in location presets live in `LOCATION_PRESETS` in `js/sky.js`; they use `CCC - City` names, are stored alphabetically, and Prague remains the startup default by name lookup rather than array position. Location/time UI lives in `#sky-section` at the bottom of the side panel (always visible, pinned with flex layout). User presets are stored in `localStorage` via `loadUserPresets` / `saveUserPresets` in `js/sky.js`.

**Sky location UI** (`createSkyControls` / `SkyLocationManager` in `js/ui-sky-controls.js`): owns the location preset dropdown, latitude/longitude inputs, sky mode buttons, UTC time controls, and startup geolocation. On startup it first syncs the dropdown selection to the current observer coordinates so the default Prague observer also selects Prague in the menu. It then attempts a one-shot browser geolocation lookup; on success a transient `Local Position` entry is inserted at the top of the preset dropdown and applied unless the user already changed the location controls. Manual lat/lon edits still force the dropdown to `Custom`, while explicit preset selections and saved presets continue to route through `controller.setObserverLocation()`.

**Ground plane** (`js/renderer-pipeline.js`): An additional fullscreen-quad draw call uses `GROUND_VS`/`GROUND_FS` to render a dark ground plane below the horizon in Local mode. The fragment shader unprojects each pixel to a world direction and discards fragments where `dot(worldDir, uZenith) > 0` (above horizon). Drawn only when `horizonMode == 2` and the zenith uniform `uZenith` is set via `setZenith()`.

## Grid overlays

- Toolbar buttons `#btn-grid` and `#btn-altaz-grid` toggle independent overlays on the shared `#sky-grid` canvas.
- The RA/Dec grid is drawn in `drawRADecGridOverlay()` in `js/renderer-overlay.js`.
- The Alt/Az grid is drawn in `drawAltAzGridOverlay()` in `js/renderer-overlay.js`, using the same zenith-based north/east basis as `lookAtAltAz()` and `fwdToAltAz()` in `js/camera.js`. Cardinal labels `N`, `E`, `S`, `W` are placed at projected horizon points for azimuth 0/90/180/270 and nudged outward from screen center.
- Visibility is owned by `state.showRADecGrid` and `state.showAltAzGrid` in `js/app.js`, with button state mirrored by `js/ui.js`.
- Even in `mode: 'allsky'`, enabling the Alt/Az grid forces observer updates so location/time changes and live time keep the overlay in sync.

**Control flow for altitude updates:**
- `frame()` in `js/app-runtime.js` checks `skyState.needsAltUpdate` before rendering
- `needsAltUpdate` is set to `true` by: mode change, location change, time change, catalog load
- A 1-second `setInterval` always advances `skyState.observer.utcMs` to `Date.now()` and calls `ui.syncSkyTime()` unless `skyState.timeLocked` is set (live checkbox in UI). The altitude recomputation (`needsAltUpdate = true`) and `requestRender()` are only triggered when `needsObserverState()` is also true, to avoid unnecessary work in allsky mode without the alt/az grid.
,**Preserving viewport alt/az across time changes (Local mode):**
- When time changes (`setObserverTime` or the 1-s interval), the current center alt/az is captured via `fwdToAltAz` (using the old zenith) and stored in `skyState.savedAlt/savedAz`, with `skyState.preserveAltAz = true`.
- In `frame()`, immediately after `updateObserver` delivers the new zenith, if `preserveAltAz` is set the camera is re-oriented to the saved alt/az via `lookAtAltAz`, then the flag is cleared.
- Location changes and mode switches do NOT set the flag, so those keep their existing `DEFAULT_LOCAL_ALT`/0 reset behaviour.

 `appendStar()`, `removeAt()` in `js/renderer.js`
- Form/model conversion: `createStarFormUI()` in `js/ui-star-form.js`

## Spectral type subtitle

- When a star is selected, a subtitle line appears directly below the sidebar title (`#panel-title`).
- Left side: decoded luminosity class from `SpType` (e.g., `G2V` → `Class V Main sequence`; `K5III` → `Class III Giant`; `DA2` → `White dwarf`; `sdM2` → `Subdwarf`). Decoded by `decodeSpectralClass()` in `js/ui-star-form.js`.
- Right side: distance computed from `Parallax` (arcsec) as `1 / Parallax` parsecs. Clicking cycles between pc and ly. Unit state is `distUnit` (local to the `createStarFormUI` closure). Formatted by `formatDistance()` in `js/ui-star-form.js`.
- The subtitle `<div id="panel-subtitle">` with child spans `#subtitle-class` and `#subtitle-dist` lives in `index.html` immediately after `#panel-title`. It carries `.hidden` by default; `updateSubtitle()` removes it only when at least one of class or distance is non-null.
- `data-clickable` attribute is set on `#subtitle-dist` only when distance data exists, gating the cursor/underline CSS in `styles.css`.
- Touched files: `index.html`, `styles.css`, `js/ui.js` (ID registration), `js/ui-star-form.js`, `js/spectral.js`, `js/star-name.js`.

## Progressive Web App

- Install assets live at the repo root: `manifest.webmanifest`, `service-worker.js`, and `icons/`.
- `index.html` links the manifest and icon files, then registers `service-worker.js` after `load` when service workers are supported.
- `service-worker.js` precaches the static app shell, bundled `catalog.bsc`, and icon assets. It does not try to cache or persist user-picked local files.
- `loadDefaultCatalog()` in `js/app.js` now uses a normal fetch so the service worker or browser cache can satisfy `catalog.bsc` while offline.
- `state.fileName` in `js/app.js` tracks the current suggested export name. `loadCatalog()` in `js/app-editor-actions.js` updates it from the opened file or bundled sample catalog, and `js/ui.js` reuses it when save falls back to a download.
- Direct save remains Chromium-first through File System Access. Firefox and other unsupported contexts keep local-file open plus download-based `Save` / `Save As`.
- Icon artwork uses the Star + Grid direction. Source SVGs live in `icons/star-editor.svg` and `icons/star-editor-maskable.svg`, and exported PNG sizes are generated from those source files for manifest use.

## Validation

## HYG catalog support

- The app now accepts both BSC5 fixed-width (`.bsc`, `.dat`, `.txt`) and HYG CSV v4.2 (`.csv`) files.
- Format is detected by file extension in `loadCatalog()` (`js/app-editor-actions.js`): `.csv` → HYG, anything else → BSC.
- `state.catalogFormat` (`'bsc'` | `'hyg'`) tracks the loaded format so `serialize()` dispatches to the correct writer.
- HYG stars share the same internal shape as BSC stars, with nine additional fields: `x`, `y`, `z` (parsecs), `vx`, `vy`, `vz` (km/s), and the catalog-ID fields `hygId`, `glieseId`, `primaryHygId`. BSC stars and newly added stars have all nine set to `null`.
- Catalog-ID fields: `hygId` is the HYG sequential integer id (CSV col 0); `glieseId` is the Gliese designation string (CSV col 4, e.g. `"Gl 551"`), null if absent; `primaryHygId` is the `comp_primary` integer (CSV col 31) referencing the primary star's HYG id for secondaries in multi-star systems.
- Unit conversion on HYG load: `pmra`/`pmdec` (mas/yr) → `pmRA`/`pmDE` (arcsec/yr) divided by 1000; `dist` (pc) → `Parallax` (arcsec) as `1/dist`. On save the reverse conversion is applied for `_edited` rows.
- `_raw` round-trip: unedited HYG rows emit their original CSV line verbatim. Edited rows are reconstructed from the mapped fields; unmapped HYG columns (`hip`, `proper`, `bayer`, `flam`, `con`, `comp`, `lum`, `var`, etc.) are written as blank.
- Touched files: `js/catalog-bsc.js` (renamed from `catalog.js`, exports renamed to `parseBscCatalog`/`serializeBscCatalog`), `js/catalog-hyg.js` (new), `js/app-editor-actions.js`, `js/app.js`, `js/ui.js`, `service-worker.js`, `AGENTS.md`.

## Validation
- Use Chromium for browser validation in this repo. Do not spend time probing for other browsers before running a test.
- The test server runs on port 8080 (`python3 -m http.server 8080`). It is likely already running for the user's manual testing. If not, run it and keep it running after the validations.
- If no executable validation is available in this environment, inspect the changed files and report the exact manual path to verify.

