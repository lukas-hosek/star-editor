# star-editor

Small browser-only viewer and editor for Yale Bright Star Catalogue (BSC5) files.

## Features

- Small and responsive
- Equatorial and Local view modes
- Realistic night sky rendering
- Editing support (for your fantasy video game development needs)
- Name and class decoding. Displays star names and types in a readable format.

## Running the app

Current version is hosted here: `https://lukas-hosek.github.io/star-editor/`. The app can be installed and used offline as a PWA app.

For local development and debugging: start a local server with Python:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

## PWA and browser support

- Chromium: installable PWA, offline app shell plus bundled `catalog.bsc`, and direct `Save` / `Save As` through the File System Access API.
- Firefox: offline shell after the first online visit, local file open through the fallback picker, and download-based export for `Save` / `Save As`.
- Other browsers: expected to follow the same degraded path as Firefox when service workers and download-based export are available.
