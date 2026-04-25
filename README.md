# star-editor

Small browser-only editor for Yale Bright Star Catalogue (BSC5) files. It loads a fixed-width catalog, projects stars onto a WebGL sky view, and lets you select, drag, edit, add, delete, and save star records.

## Running the app

No build step is required. Open `index.html` in a browser, or serve the directory with a minimal static file server if your browser blocks module loading from `file:` URLs.

To start a local test server with Python:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## What lives where

- `index.html`: static shell for the toolbar, sky canvas, edit panel, and module entrypoint.
- `styles.css`: all layout and visual styling.
- `js/app.js`: app controller and state owner. This is the first file to read when behavior spans multiple modules.
- `js/catalog.js`: fixed-width BSC5 parser and serializer, plus derived photometry helpers.
- `js/camera.js`: stereographic camera math, projection, unprojection, panning, and zoom anchoring.
- `js/renderer.js`: WebGL2 renderer and GPU buffer synchronization.
- `js/picking.js`: screen-space picking and pixel-to-sky conversion.
- `js/ui.js`: DOM wiring, file open/save integration, and side-panel form synchronization.
- `ybsc5.readme`: upstream byte layout for the catalog format.
- `catalog.bsc`: sample catalog data for manual testing.

## Runtime model

The app is entirely client-side and uses native ES modules.

1. `index.html` loads `js/app.js`.
2. `app.js` creates the renderer, camera, and UI, and owns app state.
3. Opening a file routes through `ui.js`, then `controller.loadCatalog()`, then `parseCatalog()`, then `syncAll()`.
4. Editing a selected star updates the in-memory star object, recomputes derived photometry in `refreshStarPhotometry()`, and pushes one-slot GPU updates with `syncOne()`.
5. Saving routes back through `serializeCatalog()`, preserving untouched rows byte-for-byte via each star's `_raw` field.

## Behavior map

- Load/parse issues: start in `js/ui.js`, then `js/app.js`, then `js/catalog.js`.
- Selection or dragging issues: start in `js/app.js`, then `js/picking.js`, then `js/camera.js`.
- Visual or performance issues: start in `js/renderer.js`.
- Form-field round-trip issues: inspect `js/ui.js` and `js/catalog.js` together.
- Add/delete behavior: start in `js/app.js` and confirm renderer buffer updates in `js/renderer.js`.

## Data model notes

Each parsed star stores:

- raw catalog fields needed by the editor, such as `HR`, `Name`, `ra`, `dec`, `Vmag`, `BV`, `SpType`, `pmRA`, `pmDE`, `Parallax`, and `RadVel`
- derived render fields: `temp`, `color`, and `flux`
- preservation helpers: `_raw` for original record bytes and `_edited` to decide whether serialization should pass through or rewrite the row

This is why serializer changes should be made carefully: untouched records intentionally round-trip without reformatting.
