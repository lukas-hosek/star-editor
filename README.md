# star-editor

Small browser-only viewer and editor for Yale Bright Star Catalogue (BSC5) files.

Current version is hosted here: https://lukas-hosek.github.io/star-editor/

## Features

- Small and responsive.
- Can be used offline as a PWA app.
- Equatorial and Local view modes.
- Realistic night sky rendering.
- Editing support (for your fantasy video game development needs).
- Name and class decoding. Displays star names and types in a readable format.

## Local development environemnt

Start a local server with Python:

```bash
python3 -m http.server 8080
```

Then open `http://localhost:8080` in your browser.

Browser support

- Chromium: installable PWA, offline app shell plus bundled `catalog.bsc`, and direct `Save` / `Save As` through the File System Access API.
- Firefox: offline shell after the first online visit, local file open through the fallback picker, and download-based export for `Save` / `Save As`.
- Other browsers: expected to follow the same degraded path as Firefox when service workers and download-based export are available.
