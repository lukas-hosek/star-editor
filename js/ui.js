// DOM-side: toolbar wiring, side-panel form, file I/O via File System Access
// with a download fallback for browsers that do not support direct file handles.
// All DOM lookups happen once, in createUI.

import { createSkyControls } from './ui-sky-controls.js';
import { createStarFormUI } from './ui-star-form.js';


// ---------- File pickers ----------
const FILE_TYPES = [{
	description: 'Bright Star Catalogue',
	accept: { 'text/plain': ['.txt', '.dat', '.bsc'] },
}];

function canUseFileSystemAccess() {
	return window.isSecureContext && 'showOpenFilePicker' in window;
}


async function pickOpen() {
	if (!canUseFileSystemAccess()) return null;
	const [handle] = await window.showOpenFilePicker({ types: FILE_TYPES, multiple: false });
	return handle;
}


async function pickSave(suggestedName) {
	return await window.showSaveFilePicker({ suggestedName, types: FILE_TYPES });
}


async function writeHandle(handle, text) {
	const writable = await handle.createWritable();
	await writable.write(text);
	await writable.close();
}


function normalizeCatalogName(fileName) {
	if (typeof fileName !== 'string') {
		return 'catalog.bsc';
	}
	const trimmedName = fileName.trim();
	if (!trimmedName) {
		return 'catalog.bsc';
	}
	return /\.[A-Za-z0-9]+$/.test(trimmedName) ? trimmedName : `${trimmedName}.bsc`;
}


function downloadCatalog(text, fileName) {
	const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
	const downloadUrl = URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = downloadUrl;
	link.download = normalizeCatalogName(fileName);
	link.hidden = true;
	document.body.appendChild(link);
	link.click();
	link.remove();
	setTimeout(() => URL.revokeObjectURL(downloadUrl), 0);
}


function createOpenFallbackInput() {
	const input = document.createElement('input');
	input.type = 'file';
	input.accept = '.txt,.dat,text/plain';
	input.hidden = true;
	document.body.appendChild(input);
	return input;
}


async function pickOpenFallback(input) {
	const file = await new Promise((resolve, reject) => {
		input.value = '';
		input.onchange = () => resolve(input.files?.[0] || null);
		input.click();
	});
	if (!file) {
		const err = new DOMException('The user aborted a request.', 'AbortError');
		throw err;
	}
	return { file, handle: null };
}


// ---------- UI object ----------
export function createUI(controller) {
	const el = {};
	const supportsFileSystemAccess = canUseFileSystemAccess();
	const ids = [
		'btn-open', 'btn-save', 'btn-save-as', 'btn-add', 'btn-delete', 'btn-move', 'btn-grid', 'btn-altaz-grid',
		'brightness', 'brightness-readout', 'status',
		'panel-empty', 'panel-form', 'panel-title',
		'f-hr', 'f-name',
		'f-ra-h', 'f-ra-m', 'f-ra-s',
		'f-de-sign', 'f-de-d', 'f-de-m', 'f-de-s',
		'f-vmag', 'f-bv', 'f-sp', 'f-pmra', 'f-pmde', 'f-plx', 'f-rv',
		'banner',
		'sky-section', 'sky-mode-toggle', 'sky-preset', 'sky-lat', 'sky-lon', 'btn-save-preset',
		'sky-date', 'sky-time-slider', 'sky-time-readout', 'sky-time-live',
	];
	for (const id of ids) el[id] = document.getElementById(id);
	const openFallbackInput = createOpenFallbackInput();

	// ---------- toolbar ----------
	el['btn-open'].addEventListener('click', async () => {
		try {
			const selection = supportsFileSystemAccess
				? await (async () => {
					const handle = await pickOpen();
					const file = await handle.getFile();
					return { file, handle };
				})()
				: await pickOpenFallback(openFallbackInput);
			const { file, handle } = selection;
			const text = await file.text();
			controller.loadCatalog(text, handle, file.name);
		}
		catch (err) {
			if (err.name !== 'AbortError') {
				el['banner'].textContent = err.message || 'Unable to open a catalog file in this browser context.';
				el['banner'].classList.remove('hidden');
				console.error(err);
			}
		}
	});

	// Common save path. `forceNewHandle` is true for Save-As; Save reuses an
	// existing FSA handle when one is available.
	async function performSave(forceNewHandle) {
		try {
			const text = controller.serialize();
			if (!forceNewHandle && controller.fileHandle) {
				await writeHandle(controller.fileHandle, text);
				controller.fileName = controller.fileHandle.name || controller.fileName;
			}
			else if (supportsFileSystemAccess) {
				const handle = await pickSave(normalizeCatalogName(controller.fileName));
				await writeHandle(handle, text);
				controller.fileHandle = handle;
				controller.fileName = handle.name || controller.fileName;
			}
			else {
				const downloadName = normalizeCatalogName(controller.fileName);
				downloadCatalog(text, downloadName);
				controller.fileName = downloadName;
			}
			controller.markSaved();
		}
		catch (err) {
			if (err.name !== 'AbortError') console.error(err);
		}
	}

	el['btn-save'].addEventListener('click', () => performSave(false));
	el['btn-save-as'].addEventListener('click', () => performSave(true));

	el['btn-add'].addEventListener('click', () => {
		controller.setAddMode(!controller.addMode);
	});

	el['btn-delete'].addEventListener('click', () => {
		controller.deleteSelected();
	});

	el['btn-move'].addEventListener('click', () => {
		controller.setAllowMoving(!controller.allowMoving);
	});

	el['btn-grid'].addEventListener('click', () => {
		controller.setRADecGridVisible(!controller.raDecGridVisible);
	});

	el['btn-altaz-grid'].addEventListener('click', () => {
		controller.setAltAzGridVisible(!controller.altAzGridVisible);
	});

	// Brightness slider: log10 gain, 0..+2 → ×1..×100.
	el['brightness'].addEventListener('input', () => {
		const sliderValue = parseFloat(el['brightness'].value);
		const mult = Math.pow(10, sliderValue);
		el['brightness-readout'].textContent = '×' + (mult >= 10 ? mult.toFixed(0) : mult.toFixed(2));
		controller.setBrightness(mult);
	});
	// Fire once to populate the readout.
	el['brightness'].dispatchEvent(new Event('input'));

	const starForm = createStarFormUI(controller, el);


	function setStatus(text) {
		el['status'].textContent = text;
	}


	function setAddMode(active) {
		el['btn-add'].classList.toggle('active', active);
	}


	function setRADecGridVisible(active) {
		el['btn-grid'].classList.toggle('active', active);
	}


	function setAltAzGridVisible(active) {
		el['btn-altaz-grid'].classList.toggle('active', active);
	}


	function setAllowMoving(active) {
		el['btn-move'].classList.toggle('active', active);
		el['btn-move'].textContent = active ? '🔓' : '🔒';
		el['btn-move'].ariaLabel = active ? 'Disable moving' : 'Enable moving';
		el['btn-move'].title = active ? 'Disable moving' : 'Enable moving';
	}


	function setCatalogLoaded(loaded) {
		el['btn-save'].disabled = !loaded;
		el['btn-save-as'].disabled = !loaded;
		el['btn-add'].disabled = !loaded;
		el['btn-move'].disabled = !loaded;
	}

	const skyControls = createSkyControls(controller, el);

	return {
		showNoSelection: starForm.showNoSelection,
		showSelection: starForm.showSelection,
		refreshSelection: starForm.refreshSelection,
		setStatus,
		setAddMode,
		setAllowMoving,
		setRADecGridVisible,
		setAltAzGridVisible,
		setCatalogLoaded,
		focusName: starForm.focusName,
		syncSkyTime: skyControls.syncSkyTime,
	};
}
