# AGENTS.md

## Purpose

This repo is a small browser-only BSC5 editor. Future agents should optimize for quick local understanding rather than broad exploration.

## Fast start

- Start with `js/app.js`. It owns application state and wires every other module together.
- Only branch outward after identifying which slice is responsible:
  - parsing and serialization: `js/catalog.js`
  - camera math and sky projection: `js/camera.js`
  - rendering and GPU buffers: `js/renderer.js`
  - picking and pixel-to-sky conversion: `js/picking.js`
  - DOM, file I/O, and form sync: `js/ui.js`

## Control flow

- App boot: `index.html` -> `js/app.js`
- File open: `js/ui.js` -> `controller.loadCatalog()` -> `parseCatalog()` -> `syncAll()`
- Side-panel edit: `js/ui.js` -> mutate selected star -> `controller.onStarEdited()` -> `refreshStarPhotometry()` -> `syncOne()`
- Add star: `js/app.js:addStarAtPixel()` -> `pixelToRADec()` -> `makeNewStar()` -> `appendStar()`
- Delete star: `js/app.js:deleteStarAt()` -> swap-and-pop in app state -> `removeAt()`
- Save: `js/ui.js` -> `controller.serialize()` -> `serializeCatalog()`

## Code style

- Allman braces throughout all `.js` files: opening `{` on its own line, at the same indentation level as the preceding statement.
- Two blank lines between function declarations (top-level and nested).
- Indentation: tabs, width 4. Configured in `.vscode/settings.json`.

## Project-specific rules

- Preserve byte-level round-tripping where possible. `js/catalog.js` intentionally keeps `_raw` for untouched records.
- Treat `ybsc5.readme` as the authoritative field-layout reference before changing parse/serialize offsets.
- Do not introduce a Node.js-based verification path. The user does- **When adding any new feature, update this file.** Add a section or extend an existing one to cover: what the feature does, which files it touches, and any non-obvious control flow or state. Keep entries concise but complete enough that a future agent can understand the design without re-reading the code.
 not have Node installed and does not intend to install it.
- Prefer minimal browser-manual verification notes in final responses.

## Useful anchors

- Central state: `state` in `js/app.js`
- Selection logic: `selectStar()` in `js/app.js`
- Dirty tracking: `state.isDirty` plus `markSaved()` and `onStarEdited()` in `js/app.js`
- Derived star visuals: `refreshStarPhotometry()` in `js/catalog.js`
- GPU full sync vs incremental sync: `syncAll()`, `syncOne()`- Sky/observer state: `skyState` in `js/app.js`
- Sidereal time and horizon math: `js/sky.js`

## View modes

There are three view modes, toggled by a segmented button in the toolbar (`#sky-mode-toggle`) and owned by `skyState.mode` in `js/app.js`.

**All-sky** (`mode: 'allsky'`): Default. Full stereographic projection, free-form pan (camera can roll freely), all stars rendered at full brightness. Horizon and observer state are unused.

**All-sky + Horizon** (`mode: 'highlight'`): Same projection and free pan as All-sky. Stars below the observer's horizon are dimmed by `renderer.dimFactor` (default 0.18). Per-star altitudes are computed CPU-side each frame by `computeAltitudes()` in `js/sky.js` and uploaded via `setAltitudes()` to a dedicated `aAlt` GPU attribute. The shader (`STAR_VS` in `js/renderer.js`) checks `uHorizonMode == 1` and applies the dim factor when `aAlt < 0.0`.

**Local** (`mode: 'local'`): Stars below the horizon are fully culled (shader checks `uHorizonMode == 2 && aAlt < 0.0`). Camera is constrained: `camera.up` always points toward the zenith, so pan is pure azimuth/altitude with no roll. Pan in Local mode is implemented by a direct alt/az delta: on RMB mousedown the pixel position and current center alt/az are captured (via `fwdToAltAz()` in `js/camera.js`); each mousemove computes `(dx, dy)` from the start pixel, converts to angle deltas using `fov / (height/2)` rad/px, and calls `lookAtAltAz()` with the new values. This avoids the degeneracies of the sphere-drag approach. Entering Local mode snaps the camera to `alt=0, az=0` via `lookAtAltAz()` in `js/camera.js`. Picking also skips below-horizon stars (optional `altitudes` param in `pickStar()`).

**Observer state** (`skyState.observer` in `js/app.js`): holds `lat`, `lon`, `utcMs`, and derived `lst` + `zenithWorld`. Updated by `updateObserver()` from `js/sky.js` before each frame that needs altitudes. Location/time UI lives in `#sky-section` at the bottom of the side panel (always visible, pinned with flex layout). User presets are stored in `localStorage` via `loadUserPresets` / `saveUserPresets` in `js/sky.js`.

**Ground plane** (`js/renderer.js`): An additional fullscreen-quad draw call uses `GROUND_VS`/`GROUND_FS` to render a dark ground plane below the horizon in Local mode. The fragment shader unprojects each pixel to a world direction and discards fragments where `dot(worldDir, uZenith) > 0` (above horizon). Drawn only when `horizonMode == 2` and the zenith uniform `uZenith` is set via `setZenith()`.

**Control flow for altitude updates:**
- `frame()` in `js/app.js` checks `skyState.needsAltUpdate` before rendering
- `needsAltUpdate` is set to `true` by: mode change, location change, time change, catalog load
- A 10-second `setInterval` advances `skyState.observer.utcMs` to `Date.now()` unless `skyState.timeLocked` is set (live checkbox in UI)
,**Preserving viewport alt/az across time changes (Local mode):**
- When time changes (`setObserverTime` or the 10-s interval), the current center alt/az is captured via `fwdToAltAz` (using the old zenith) and stored in `skyState.savedAlt/savedAz`, with `skyState.preserveAltAz = true`.
- In `frame()`, immediately after `updateObserver` delivers the new zenith, if `preserveAltAz` is set the camera is re-oriented to the saved alt/az via `lookAtAltAz`, then the flag is cleared.
- Location changes and mode switches do NOT set the flag, so those keep their existing reset-to-0/0 behaviour.

 `appendStar()`, `removeAt()` in `js/renderer.js`
- Form/model conversion: `onFormInput()` and `refreshSelection()` in `js/ui.js`

## Validation

- If code changes are made, prefer the cheapest browser-based validation that exercises the touched path.
- If no executable validation is available in this environment, inspect the changed files and report the exact manual path to verify.