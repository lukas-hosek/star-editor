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

- Two blank lines between function declarations (top-level and nested).
- Indentation: tabs, width 4. Configured in `.vscode/settings.json`.

## Project-specific rules

- Preserve byte-level round-tripping where possible. `js/catalog.js` intentionally keeps `_raw` for untouched records.
- Treat `ybsc5.readme` as the authoritative field-layout reference before changing parse/serialize offsets.
- Do not introduce a Node.js-based verification path. The user does not have Node installed and does not intend to install it.
- Prefer minimal browser-manual verification notes in final responses.

## Useful anchors

- Central state: `state` in `js/app.js`
- Selection logic: `selectStar()` in `js/app.js`
- Dirty tracking: `state.isDirty` plus `markSaved()` and `onStarEdited()` in `js/app.js`
- Derived star visuals: `refreshStarPhotometry()` in `js/catalog.js`
- GPU full sync vs incremental sync: `syncAll()`, `syncOne()`, `appendStar()`, `removeAt()` in `js/renderer.js`
- Form/model conversion: `onFormInput()` and `refreshSelection()` in `js/ui.js`

## Git

- Do not stage, commit, push, or perform any other git operations. The user handles all version control manually.

## Validation

- If code changes are made, prefer the cheapest browser-based validation that exercises the touched path.
- If no executable validation is available in this environment, inspect the changed files and report the exact manual path to verify.