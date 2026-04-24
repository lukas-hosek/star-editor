// Entry point: state owner + glue between catalog, camera, renderer, picking, UI.

import { parseCatalog, serializeCatalog, makeNewStar, refreshStarPhotometry } from './catalog.js';
import {
  createCamera, setViewport, zoomAt, panTo, pixelToNDC, unproject,
} from './camera.js';
import {
  createRenderer, syncAll, syncOne, appendStar, removeAt,
  setBrightness, setGridVisible, resize, render,
} from './renderer.js';
import { pickStar, pixelToRADec } from './picking.js';
import { createUI } from './ui.js';

const canvas   = document.getElementById('sky');
const gridCanvas = document.getElementById('sky-grid');
const renderer = createRenderer(canvas, gridCanvas);
const camera   = createCamera();

const state = {
  stars: [],
  selectedIndex: -1,
  fileHandle: null,
  addMode: false,
  allowMoving: false,
  showGrid: true,
  isDirty: false,
};

let needsRender = true;
function requestRender() { needsRender = true; }

// --- Controller surface consumed by UI ----------------------------
const controller = {
  get stars()      { return state.stars; },
  get addMode()    { return state.addMode; },
  get allowMoving() { return state.allowMoving; },
  get gridVisible() { return state.showGrid; },
  get fileHandle() { return state.fileHandle; },
  set fileHandle(h) { state.fileHandle = h; },

  selectedStar() {
    return state.selectedIndex >= 0 ? state.stars[state.selectedIndex] : null;
  },

  loadCatalog(text, handle) {
    const stars = parseCatalog(text);
    state.stars = stars;
    state.fileHandle = handle || null;
    state.selectedIndex = -1;
    state.allowMoving = false;
    state.isDirty = false;
    syncAll(renderer, stars);
    ui.setCatalogLoaded(true);
    ui.setAllowMoving(state.allowMoving);
    ui.showNoSelection();
    updateStatus();
    requestRender();
  },

  serialize() { return serializeCatalog(state.stars); },

  markSaved() {
    state.isDirty = false;
    updateStatus();
  },

  setAddMode(on) {
    state.addMode = !!on;
    ui.setAddMode(state.addMode);
    canvas.classList.toggle('adding', state.addMode);
  },

  setAllowMoving(on) {
    state.allowMoving = !!on;
    ui.setAllowMoving(state.allowMoving);
    if (!state.allowMoving && drag.mode === 'star') {
      drag.mode = null;
      drag.starIndex = -1;
      canvas.classList.remove('dragging');
    }
  },

  deleteSelected() {
    if (state.selectedIndex < 0) return;
    const s = state.stars[state.selectedIndex];
    if (!window.confirm(`Delete HR ${s.HR}?`)) return;
    deleteStarAt(state.selectedIndex);
  },

  setBrightness(mult) {
    setBrightness(renderer, mult);
    requestRender();
  },

  setGridVisible(on) {
    state.showGrid = !!on;
    setGridVisible(renderer, state.showGrid);
    ui.setGridVisible(state.showGrid);
    requestRender();
  },

  onStarEdited() {
    const i = state.selectedIndex;
    if (i < 0) return;
    const s = state.stars[i];
    s._edited = true;
    refreshStarPhotometry(s);
    syncOne(renderer, i, s);
    state.isDirty = true;
    updateStatus();
    requestRender();
  },
};

const ui = createUI(controller);
ui.setCatalogLoaded(false);
ui.setAllowMoving(state.allowMoving);
controller.setGridVisible(state.showGrid);
ui.showNoSelection();

function updateStatus() {
  const n = state.stars.length;
  const dirty = state.isDirty ? ' •' : '';
  ui.setStatus(n > 0 ? `${n} stars${dirty}` : 'No catalog loaded');
}
updateStatus();

async function loadDefaultCatalog() {
  try {
    const response = await fetch('./catalog.bsc', { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const text = await response.text();
    controller.loadCatalog(text, null);
  } catch (err) {
    const banner = document.getElementById('banner');
    if (banner) {
      banner.textContent = 'Unable to load default catalog.bsc automatically. Use Open to choose a catalog file.';
      banner.classList.remove('hidden');
    }
    console.error('Failed to load default catalog.bsc', err);
  }
}

loadDefaultCatalog();

// --- Selection / add / delete ------------------------------------
function selectStar(i) {
  state.selectedIndex = i;
  if (i >= 0) ui.showSelection(state.stars[i]);
  else        ui.showNoSelection();
  requestRender();
}

function addStarAtPixel(px, py) {
  const { ra, dec } = pixelToRADec(camera, px, py);
  const nextHR = state.stars.reduce((m, s) => Math.max(m, s.HR || 0), 0) + 1;
  const star = makeNewStar({ ra, dec, HR: nextHR });
  state.stars.push(star);
  appendStar(renderer, star);
  state.isDirty = true;
  state.selectedIndex = state.stars.length - 1;
  ui.showSelection(star);
  ui.focusName();
  updateStatus();
  requestRender();
}

function deleteStarAt(i) {
  if (i < 0 || i >= state.stars.length) return;
  const last = state.stars.length - 1;
  if (i !== last) state.stars[i] = state.stars[last];
  state.stars.pop();
  removeAt(renderer, i, state.stars);
  state.isDirty = true;
  state.selectedIndex = -1;
  ui.showNoSelection();
  updateStatus();
  requestRender();
}

// --- Input handling ----------------------------------------------
const drag = {
  mode: null,        // 'star' | 'pan' | null
  starIndex: -1,
  startWorld: null,  // world direction at pan-start
};

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

canvas.addEventListener('mousedown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  if (e.button === 0) {
    // LMB
    if (state.addMode) {
      addStarAtPixel(px, py);
      controller.setAddMode(false);
      return;
    }
    const i = pickStar(camera, state.stars, px, py, 12, renderer.brightness, 0.05);
    if (i >= 0) {
      const wasSelected = i === state.selectedIndex;
      selectStar(i);
      if (state.allowMoving && wasSelected) {
        drag.mode = 'star';
        drag.starIndex = i;
        canvas.classList.add('dragging');
      }
    } else {
      selectStar(-1);
    }
  } else if (e.button === 2) {
    // RMB: pan
    const [nx, ny] = pixelToNDC(camera, px, py);
    drag.mode = 'pan';
    drag.startWorld = unproject(camera, nx, ny);
    canvas.classList.add('panning');
  }
});

canvas.addEventListener('mousemove', (e) => {
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;

  if (drag.mode === 'star') {
    const s = state.stars[drag.starIndex];
    const { ra, dec } = pixelToRADec(camera, px, py);
    if (!isFinite(ra) || !isFinite(dec)) return;
    s.ra = ra;
    s.dec = dec;
    s._edited = true;
    syncOne(renderer, drag.starIndex, s);
    ui.refreshSelection(s);
    state.isDirty = true;
    updateStatus();
    requestRender();
  } else if (drag.mode === 'pan') {
    panTo(camera, px, py, drag.startWorld);
    requestRender();
  }
});

window.addEventListener('mouseup', () => {
  if (drag.mode) {
    drag.mode = null;
    drag.starIndex = -1;
    canvas.classList.remove('dragging', 'panning');
  }
});

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const rect = canvas.getBoundingClientRect();
  const px = e.clientX - rect.left;
  const py = e.clientY - rect.top;
  // Negative deltaY = wheel up = zoom in = shrink FOV.
  const factor = Math.exp(e.deltaY * 0.0015);
  zoomAt(camera, px, py, factor);
  requestRender();
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.addMode) {
    controller.setAddMode(false);
    return;
  }
  const active = document.activeElement;
  const tag = (active && active.tagName) || '';
  const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
  if (!inInput && e.key === 'Delete' && state.selectedIndex >= 0) {
    e.preventDefault();
    controller.deleteSelected();
  }
});

// --- Resize + frame loop ------------------------------------------
function handleResize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  resize(renderer, rect.width, rect.height, dpr);
  setViewport(camera, rect.width, rect.height);
  requestRender();
}
window.addEventListener('resize', handleResize);
handleResize();

function frame() {
  if (needsRender) {
    needsRender = false;
    const sel = state.selectedIndex >= 0 ? state.stars[state.selectedIndex] : null;
    render(renderer, camera, sel);
  }
  requestAnimationFrame(frame);
}
frame();

// --- Warn on tab-close with unsaved edits --------------------------
window.addEventListener('beforeunload', (e) => {
  if (state.isDirty) {
    e.preventDefault();
    e.returnValue = '';
  }
});
