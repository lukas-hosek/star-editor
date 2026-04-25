// Entry point: state owner + glue between catalog, camera, renderer, picking, UI.

import { parseCatalog, serializeCatalog, makeNewStar, refreshStarPhotometry } from './catalog.js';
import {
	createCamera, setViewport, zoomAt, panTo, lookAtAltAz, fwdToAltAz, pixelToNDC, unproject,
} from './camera.js';
import {
	createRenderer, syncAll, syncOne, appendStar, removeAt,
	setBrightness, setGridVisible, setAltAzGridVisible, setHorizonMode, setAltitudes, setZenith, resize, render,
} from './renderer.js';
import {
	createObserver, updateObserver, computeAltitudes,
	DEFAULT_PRESETS, loadUserPresets, saveUserPresets,
} from './sky.js';
import { pickStar, pixelToRADec } from './picking.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('sky');
const gridCanvas = document.getElementById('sky-grid');
const renderer = createRenderer(canvas, gridCanvas);
const camera = createCamera();

const state = {
	stars: [],              // Parsed catalog records in renderer order.
	selectedIndex: -1,      // Currently selected star index, or -1 when nothing is selected.
	fileHandle: null,       // File System Access handle used for save/save-as when available.
	addMode: false,         // When true, the next left click adds a new star instead of selecting.
	allowMoving: false,     // When true, dragging the selected star updates its RA/Dec.
	showRADecGrid: true,    // Whether the RA/Dec grid overlay is visible.
	showAltAzGrid: false,   // Whether the Alt/Az grid overlay is visible.
	isDirty: false,         // Tracks unsaved catalog edits for status text and unload warnings.
};

const skyState = {
	mode: 'allsky',            // Active sky view mode: 'allsky' | 'highlight' | 'local'.
	observer: createObserver(),// Current observer location, time, and derived horizon basis.
	userPresets: loadUserPresets(), // User-saved observer location presets from localStorage.
	altitudes: new Float32Array(0), // Per-star altitude cache for horizon dimming/culling.
	needsAltUpdate: true,      // Signals that observer-derived altitude data must be recomputed.
	timeLocked: false,         // When true, live time updates are paused and the chosen UTC time is fixed.
	preserveAltAz: false,      // When true, frame loop re-orients camera after observer update.
	savedAlt: 0,               // Local-mode camera altitude to restore after a time-driven observer update.
	savedAz: 0,                // Local-mode camera azimuth to restore after a time-driven observer update.
};

let needsRender = true;

function requestRender() {
	needsRender = true;
}


function needsObserverState() {
	return skyState.mode !== 'allsky' || state.showAltAzGrid;
}

// --- Controller surface consumed by UI ----------------------------
const controller = {
	get stars() {
		return state.stars;
	},

	get addMode() {
		return state.addMode;
	},

	get allowMoving() {
		return state.allowMoving;
	},

	get gridVisible() {
		return state.showRADecGrid;
	},

	get altAzGridVisible() {
		return state.showAltAzGrid;
	},

	get fileHandle() {
		return state.fileHandle;
	},

	set fileHandle(h) {
		state.fileHandle = h;
	},

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
		skyState.needsAltUpdate = true;
		ui.setCatalogLoaded(true);
		ui.setAllowMoving(state.allowMoving);
		ui.showNoSelection();
		updateStatus();
		requestRender();
	},

	serialize() {
		return serializeCatalog(state.stars);
	},

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
		state.showRADecGrid = !!on;
		setGridVisible(renderer, state.showRADecGrid);
		ui.setGridVisible(state.showRADecGrid);
		requestRender();
	},

	setAltAzGridVisible(on) {
		state.showAltAzGrid = !!on;
		setAltAzGridVisible(renderer, state.showAltAzGrid);
		ui.setAltAzGridVisible(state.showAltAzGrid);
		if (state.showAltAzGrid) {
			if (!skyState.timeLocked) {
				skyState.observer.utcMs = Date.now();
				if (ui.syncSkyTime) ui.syncSkyTime();
			}
			skyState.needsAltUpdate = true;
		}
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

	get skyState() { return skyState; },

	setSkyMode(mode) {
		skyState.mode = mode;
		const hmMap = { allsky: 0, highlight: 1, local: 2 };
		setHorizonMode(renderer, hmMap[mode] ?? 0);
		if (mode === 'local') {
			updateObserver(skyState.observer);
			lookAtAltAz(camera, 0, 0, skyState.observer.zenithWorld);
		}
		skyState.needsAltUpdate = true;
		requestRender();
	},

	setObserverLocation(lat, lon) {
		skyState.observer.lat = lat;
		skyState.observer.lon = lon;
		skyState.needsAltUpdate = true;
		if (skyState.mode === 'local') {
			updateObserver(skyState.observer);
			lookAtAltAz(camera, 0, 0, skyState.observer.zenithWorld);
		}
		requestRender();
	},

	setObserverTime(utcMs) {
		if (skyState.mode === 'local') {
			const { alt, az } = fwdToAltAz(camera, skyState.observer.zenithWorld);
			skyState.savedAlt = alt;
			skyState.savedAz = az;
			skyState.preserveAltAz = true;
		}
		skyState.observer.utcMs = utcMs;
		skyState.needsAltUpdate = true;
		requestRender();
	},

	saveLocationPreset(name) {
		skyState.userPresets.push({ name, lat: skyState.observer.lat, lon: skyState.observer.lon });
		saveUserPresets(skyState.userPresets);
	},
};

const ui = createUI(controller);
ui.setCatalogLoaded(false);
ui.setAllowMoving(state.allowMoving);
controller.setGridVisible(state.showRADecGrid);
controller.setAltAzGridVisible(state.showAltAzGrid);
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
	}
	catch (err) {
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
	else ui.showNoSelection();
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
	startWorld: null,  // world direction at pan-start (non-local modes)
	startPx: 0,        // pixel position at pan-start (local mode)
	startPy: 0,
	startAlt: 0,       // camera alt/az at pan-start (local mode)
	startAz: 0,
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
		const alts = skyState.mode === 'local' ? skyState.altitudes : null;
		const i = pickStar(camera, state.stars, px, py, 12, renderer.brightness, 0.4, alts);
		if (i >= 0) {
			const wasSelected = i === state.selectedIndex;
			selectStar(i);
			if (state.allowMoving && wasSelected) {
				drag.mode = 'star';
				drag.starIndex = i;
				canvas.classList.add('dragging');
			}
		}
		else {
			selectStar(-1);
		}
	}
	else if (e.button === 2) {
		// RMB: pan
		drag.mode = 'pan';
		if (skyState.mode === 'local') {
			drag.startPx = px;
			drag.startPy = py;
			const { alt, az } = fwdToAltAz(camera, skyState.observer.zenithWorld);
			drag.startAlt = alt;
			drag.startAz = az;
		} else {
			const [nx, ny] = pixelToNDC(camera, px, py);
			drag.startWorld = unproject(camera, nx, ny);
		}
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
	}
	else if (drag.mode === 'pan') {
		if (skyState.mode === 'local') {
			const dx = px - drag.startPx;
			const dy = py - drag.startPy;
			const angScale = camera.fov / (camera.height / 2);
			const newAlt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
				drag.startAlt + dy * angScale));
			const newAz = drag.startAz - dx * angScale;
			lookAtAltAz(camera, newAlt, newAz, skyState.observer.zenithWorld);
		} else {
			panTo(camera, px, py, drag.startWorld);
		}
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
		if (needsObserverState() && skyState.needsAltUpdate) {
			updateObserver(skyState.observer);
			if (skyState.preserveAltAz && skyState.mode === 'local') {
				lookAtAltAz(camera, skyState.savedAlt, skyState.savedAz, skyState.observer.zenithWorld);
				skyState.preserveAltAz = false;
			}
			if (skyState.mode !== 'allsky' && state.stars.length > 0) {
				skyState.altitudes = computeAltitudes(
					state.stars, skyState.observer.lat, skyState.observer.lst, skyState.altitudes);
				setAltitudes(renderer, skyState.altitudes);
			}
			setZenith(renderer, skyState.observer.zenithWorld);
			skyState.needsAltUpdate = false;
		}
		const sel = state.selectedIndex >= 0 ? state.stars[state.selectedIndex] : null;
		render(renderer, camera, sel);
	}
	requestAnimationFrame(frame);
}
frame();

// Advance observer time in real-time when in highlight or local mode.
setInterval(() => {
	if (!needsObserverState() || skyState.timeLocked) return;
	if (skyState.mode === 'local') {
		const { alt, az } = fwdToAltAz(camera, skyState.observer.zenithWorld);
		skyState.savedAlt = alt;
		skyState.savedAz = az;
		skyState.preserveAltAz = true;
	}
	skyState.observer.utcMs = Date.now();
	skyState.needsAltUpdate = true;
	requestRender();
	if (ui.syncSkyTime) ui.syncSkyTime();
}, 10000);

// --- Warn on tab-close with unsaved edits --------------------------
window.addEventListener('beforeunload', (e) => {
	if (state.isDirty) {
		e.preventDefault();
		e.returnValue = '';
	}
});
