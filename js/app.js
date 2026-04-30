// Entry point: state owner + glue between catalog, camera, renderer, picking, UI.

import { createCanvasInteractions } from './app-canvas-interactions.js';
import { createEditorActions } from './app-editor-actions.js';
import { startAppRuntime } from './app-runtime.js';
import {
	createCamera, lookAtAltAz,
} from './camera.js';
import {
	createRenderer, setHorizonMode,
} from './renderer.js';
import {
	captureAltAzForRestore,
	createObserver, updateObserver,
	loadUserPresets, saveUserPresets,
} from './sky.js';
import { createUI } from './ui.js';

const canvas = document.getElementById('sky');
const gridCanvas = document.getElementById('sky-grid');
const renderer = createRenderer(canvas, gridCanvas);
const camera = createCamera();
const DEFAULT_LOCAL_ALT = Math.PI / 3;

const state = {
	stars: [],              // Parsed catalog records in renderer order.
	maxHR: 0,               // Highest HR seen so addStarAtPixel can mint unique HRs in O(1).
	selectedIndex: -1,      // Currently selected star index, or -1 when nothing is selected.
	fileHandle: null,       // File System Access handle used for save/save-as when available.
	fileName: 'hyg_v42.csv', // Suggested catalog file name when save falls back to download.
	addMode: false,         // When true, the next left click adds a new star instead of selecting.
	allowMoving: false,     // When true, dragging the selected star updates its RA/Dec.
	starSize: 'medium',     // Active star size preset: 'small' | 'medium' | 'large'.
	showRADecGrid: true,    // Whether the RA/Dec grid overlay is visible.
	showAltAzGrid: false,   // Whether the Alt/Az grid overlay is visible.
	isDirty: false,         // Tracks unsaved catalog edits for status text and unload warnings.
	catalogFormat: 'bsc',  // Format of the loaded catalog: 'bsc' | 'hyg'. Controls serialization.
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


function consumeRenderRequest() {
	if (!needsRender) {
		return false;
	}
	needsRender = false;
	return true;
}


function needsObserverState() {
	return skyState.mode !== 'allsky' || state.showAltAzGrid;
}

let canvasInteractions = null;
let ui = null;

const editorActions = createEditorActions({
	camera,
	canvas,
	renderer,
	requestRender,
	skyState,
	state,
	getUI()
	{
		return ui;
	},
	cancelStarDrag()
	{
		if (canvasInteractions)
		{
			canvasInteractions.cancelStarDrag();
		}
	},
});

const {
	loadCatalog,
	serialize,
	markSaved,
	setAddMode,
	setAllowMoving,
	deleteSelected,
	setBrightness,
	setStarSize,
	setRADecGridVisible,
	setAltAzGridVisible,
	onStarEdited,
} = editorActions;

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

	get starSize() {
		return state.starSize;
	},

	get raDecGridVisible() {
		return state.showRADecGrid;
	},

	get altAzGridVisible() {
		return state.showAltAzGrid;
	},

	get fileHandle() {
		return state.fileHandle;
	},

	set fileHandle(handle) {
		state.fileHandle = handle;
	},

	get fileName() {
		return state.fileName;
	},

	set fileName(fileName) {
		state.fileName = fileName;
	},

	selectedStar() {
		return state.selectedIndex >= 0 ? state.stars[state.selectedIndex] : null;
	},

	getObserver() {
		return skyState.observer;
	},

	getUserPresets() {
		return skyState.userPresets;
	},

	isTimeLocked() {
		return skyState.timeLocked;
	},

	setTimeLocked(locked) {
		skyState.timeLocked = !!locked;
	},

	loadCatalog,
	serialize,
	markSaved,
	setAddMode,
	setAllowMoving,
	deleteSelected,
	setBrightness,
	setStarSize,
	setRADecGridVisible,
	setAltAzGridVisible,
	onStarEdited,

	setSkyMode(mode) {
		skyState.mode = mode;
		const hmMap = { allsky: 0, highlight: 1, local: 2 };
		setHorizonMode(renderer, hmMap[mode] ?? 0);
		if (mode === 'local') {
			updateObserver(skyState.observer);
			lookAtAltAz(camera, DEFAULT_LOCAL_ALT, 0, skyState.observer.zenithWorld);
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
			lookAtAltAz(camera, DEFAULT_LOCAL_ALT, 0, skyState.observer.zenithWorld);
		}
		requestRender();
	},

	setObserverTime(utcMs) {
		captureAltAzForRestore(skyState, camera);
		skyState.observer.utcMs = utcMs;
		skyState.needsAltUpdate = true;
		requestRender();
	},

	saveLocationPreset(name) {
		skyState.userPresets.push({ name, lat: skyState.observer.lat, lon: skyState.observer.lon });
		saveUserPresets(skyState.userPresets);
	},
};

ui = createUI(controller);
ui.setCatalogLoaded(false);
ui.setAllowMoving(state.allowMoving);
controller.setStarSize(state.starSize);
controller.setRADecGridVisible(state.showRADecGrid);
controller.setAltAzGridVisible(state.showAltAzGrid);
ui.showNoSelection();
editorActions.updateStatus();

async function loadDefaultCatalog() {
	try {
		const response = await fetch('./hyg/hyg_v42.csv');
		if (!response.ok) {
			throw new Error(`HTTP ${response.status}`);
		}
		const text = await response.text();
		controller.loadCatalog(text, null, 'hyg_v42.csv');
	}
	catch (err) {
		const banner = document.getElementById('banner');
		if (banner) {
			banner.textContent = 'Unable to load default catalog automatically. Use Open to choose a catalog file.';
			banner.classList.remove('hidden');
		}
		console.error('Failed to load default catalog', err);
	}
}

loadDefaultCatalog();

canvasInteractions = createCanvasInteractions({
	addStarAtPixel: editorActions.addStarAtPixel,
	camera,
	canvas,
	controller,
	renderer,
	requestRender,
	selectStar: editorActions.selectStar,
	skyState,
	state,
	ui,
	updateStatus: editorActions.updateStatus,
});

startAppRuntime({
	camera,
	renderer,
	skyState,
	state,
	ui,
	requestRender,
	consumeRenderRequest,
	needsObserverState,
	getSelectedStar() {
		return state.selectedIndex >= 0 ? state.stars[state.selectedIndex] : null;
	},
});
