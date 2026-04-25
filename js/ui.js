// DOM-side: toolbar wiring, side-panel form, file I/O via File System Access.
// All DOM lookups happen once, in createUI.

import { LOCATION_PRESETS } from './sky.js';

const HRS_PER_RAD = 12 / Math.PI;
const DEG_PER_RAD = 180 / Math.PI;
const PRESET_MATCH_EPSILON = 1e-5;


function angularDistance(a, b)
{
	let d = Math.abs(a - b) % (2 * Math.PI);
	if (d > Math.PI) d = 2 * Math.PI - d;
	return d;
}


function coordsMatch(aLat, aLon, bLat, bLon)
{
	return Math.abs(aLat - bLat) <= PRESET_MATCH_EPSILON &&
		angularDistance(aLon, bLon) <= PRESET_MATCH_EPSILON;
}


function numOr(s, fb) {
	if (s === '' || s === null || s === undefined) return fb;
	const n = parseFloat(s);
	return isFinite(n) ? n : fb;
}


function fmt(n, d) {
	return (n === null || n === undefined || !isFinite(n)) ? '' : n.toFixed(d);
}


// ---------- RA/Dec <-> form ----------
function radiansToFormHMS(ra) {
	let r = ((ra % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
	const total = r * HRS_PER_RAD;
	let h = Math.floor(total);
	let rem = (total - h) * 60;
	let m = Math.floor(rem);
	let s = (rem - m) * 60;
	// Keep one decimal for RA-seconds in the UI (matches the file format).
	s = Math.round(s * 10) / 10;
	if (s >= 60) {
		s = 0;
		m += 1;
	}
	if (m >= 60) {
		m = 0;
		h += 1;
	}
	if (h >= 24) h = 0;
	return { h, m, s };
}


function radiansToFormDMS(dec) {
	const sign = dec < 0 ? '-' : '+';
	let abs = Math.abs(dec) * DEG_PER_RAD;
	let d = Math.floor(abs);
	let rem = (abs - d) * 60;
	let m = Math.floor(rem);
	let s = Math.round((rem - m) * 60);
	if (s >= 60) {
		s = 0;
		m += 1;
	}
	if (m >= 60) {
		m = 0;
		d += 1;
	}
	if (d > 90) {
		d = 90;
		m = 0;
		s = 0;
	}
	return { sign, d, m, s };
}


function formHMSToRadians(h, m, s) {
	return ((h + m / 60 + s / 3600) * 15) * Math.PI / 180;
}


function formDMSToRadians(sign, d, m, s) {
	const signNum = sign === '-' ? -1 : 1;
	return signNum * (d + m / 60 + s / 3600) * Math.PI / 180;
}


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
	const w = await handle.createWritable();
	await w.write(text);
	await w.close();
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

	if (!supportsFileSystemAccess) {
		el['banner'].textContent = 'Non-Chromium browser. Save is disabled.';
		el['banner'].classList.remove('hidden');
	}

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
			controller.loadCatalog(text, handle);
		}
		catch (err) {
			if (err.name !== 'AbortError') {
				el['banner'].textContent = err.message || 'Unable to open a catalog file in this browser context.';
				el['banner'].classList.remove('hidden');
				console.error(err);
			}
		}
	});

	el['btn-save'].addEventListener('click', async () => {
		try {
			const text = controller.serialize();
			if (controller.fileHandle) {
				await writeHandle(controller.fileHandle, text);
			}
			else {
				const handle = await pickSave('catalog');
				await writeHandle(handle, text);
				controller.fileHandle = handle;
			}
			controller.markSaved();
		}
		catch (err) {
			if (err.name !== 'AbortError') console.error(err);
		}
	});

	el['btn-save-as'].addEventListener('click', async () => {
		try {
			const text = controller.serialize();
			const handle = await pickSave('catalog');
			await writeHandle(handle, text);
			controller.fileHandle = handle;
			controller.markSaved();
		}
		catch (err) {
			if (err.name !== 'AbortError') console.error(err);
		}
	});

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
		controller.setGridVisible(!controller.gridVisible);
	});

	el['btn-altaz-grid'].addEventListener('click', () => {
		controller.setAltAzGridVisible(!controller.altAzGridVisible);
	});

	// Brightness slider: log10 gain, -2..+3 → ×0.01..×1000.
	el['brightness'].addEventListener('input', () => {
		const v = parseFloat(el['brightness'].value);
		const mult = Math.pow(10, v);
		el['brightness-readout'].textContent = '×' + (mult >= 10 ? mult.toFixed(0) : mult.toFixed(2));
		controller.setBrightness(mult);
	});
	// Fire once to populate the readout.
	el['brightness'].dispatchEvent(new Event('input'));

	// ---------- form wiring ----------
	// Each input: on 'input', read the form and push changes to controller.
	function onFormInput() {
		const star = controller.selectedStar();
		if (!star) return;
		star.Name = el['f-name'].value.slice(0, 10);
		star.ra = formHMSToRadians(
			numOr(el['f-ra-h'].value, 0),
			numOr(el['f-ra-m'].value, 0),
			numOr(el['f-ra-s'].value, 0));
		star.dec = formDMSToRadians(
			el['f-de-sign'].value,
			numOr(el['f-de-d'].value, 0),
			numOr(el['f-de-m'].value, 0),
			numOr(el['f-de-s'].value, 0));
		star.Vmag = numOr(el['f-vmag'].value, star.Vmag);
		const bvStr = el['f-bv'].value.trim();
		star.BV = bvStr === '' ? null : numOr(bvStr, star.BV);
		star.SpType = el['f-sp'].value.slice(0, 20);
		const pmr = el['f-pmra'].value.trim();
		star.pmRA = pmr === '' ? null : numOr(pmr, star.pmRA);
		const pmd = el['f-pmde'].value.trim();
		star.pmDE = pmd === '' ? null : numOr(pmd, star.pmDE);
		const plx = el['f-plx'].value.trim();
		star.Parallax = plx === '' ? null : numOr(plx, star.Parallax);
		const rv = el['f-rv'].value.trim();
		star.RadVel = rv === '' ? null : Math.round(numOr(rv, star.RadVel || 0));

		controller.onStarEdited();
	}

	const formInputs = [
		'f-name', 'f-ra-h', 'f-ra-m', 'f-ra-s',
		'f-de-sign', 'f-de-d', 'f-de-m', 'f-de-s',
		'f-vmag', 'f-bv', 'f-sp', 'f-pmra', 'f-pmde', 'f-plx', 'f-rv'
	];
	for (const id of formInputs) {
		el[id].addEventListener('input', onFormInput);
		el[id].addEventListener('change', onFormInput);
	}

	// ---------- public API exposed to controller ----------
	function showNoSelection() {
		el['panel-form'].classList.add('hidden');
		el['panel-empty'].classList.remove('hidden');
		el['btn-delete'].disabled = true;
	}


	function showSelection(star) {
		el['panel-empty'].classList.add('hidden');
		el['panel-form'].classList.remove('hidden');
		el['btn-delete'].disabled = false;
		refreshSelection(star);
	}


	function refreshSelection(star) {
		if (!star) return;
		el['panel-title'].textContent = star.Name
			? `${star.Name} (HR ${star.HR})`
			: `HR ${star.HR}`;
		el['f-hr'].value = star.HR ?? '';
		el['f-name'].value = star.Name ?? '';
		const hms = radiansToFormHMS(star.ra);
		el['f-ra-h'].value = hms.h;
		el['f-ra-m'].value = hms.m;
		el['f-ra-s'].value = hms.s.toFixed(1);
		const dms = radiansToFormDMS(star.dec);
		el['f-de-sign'].value = dms.sign;
		el['f-de-d'].value = dms.d;
		el['f-de-m'].value = dms.m;
		el['f-de-s'].value = dms.s;
		el['f-vmag'].value = fmt(star.Vmag, 2);
		el['f-bv'].value = fmt(star.BV, 2);
		el['f-sp'].value = star.SpType ?? '';
		el['f-pmra'].value = fmt(star.pmRA, 3);
		el['f-pmde'].value = fmt(star.pmDE, 3);
		el['f-plx'].value = fmt(star.Parallax, 3);
		el['f-rv'].value = (star.RadVel === null || star.RadVel === undefined) ? '' : star.RadVel;
	}


	function setStatus(text) {
		el['status'].textContent = text;
	}


	function setAddMode(active) {
		el['btn-add'].classList.toggle('active', active);
	}


	function setGridVisible(active) {
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
		el['btn-save'].disabled = !loaded || !supportsFileSystemAccess;
		el['btn-save-as'].disabled = !loaded || !supportsFileSystemAccess;
		el['btn-add'].disabled = !loaded;
		el['btn-move'].disabled = !loaded;
	}

	// ---------- Sky section ----------
	class SkyLocationManager
	{
		constructor()
		{
			this.localPreset = null;
			this.userChangedLocation = false;
			this.requestedGeolocation = false;
		}


		getPresetEntries()
		{
			const entries = [];
			if (this.localPreset)
			{
				entries.push({
					value: 'local',
					name: 'Local Position',
					lat: this.localPreset.lat,
					lon: this.localPreset.lon,
				});
			}
			for (let i = 0; i < LOCATION_PRESETS.length; i++)
			{
				const preset = LOCATION_PRESETS[i];
				entries.push({
					value: `default:${i}`,
					name: preset.name,
					lat: preset.lat,
					lon: preset.lon,
				});
			}
			for (let i = 0; i < controller.skyState.userPresets.length; i++)
			{
				const preset = controller.skyState.userPresets[i];
				entries.push({
					value: `user:${i}`,
					name: preset.name,
					lat: preset.lat,
					lon: preset.lon,
				});
			}
			return entries;
		}


		getEntryByValue(value)
		{
			for (const entry of this.getPresetEntries())
			{
				if (entry.value === value)
				{
					return entry;
				}
			}
			return null;
		}


		setInputValues(lat, lon)
		{
			el['sky-lat'].value = (lat * DEG_PER_RAD).toFixed(4);
			el['sky-lon'].value = (lon * DEG_PER_RAD).toFixed(4);
		}


		populatePresets(selectedValue)
		{
			const sel = el['sky-preset'];
			const desiredValue = selectedValue === undefined ? sel.value : selectedValue;
			sel.innerHTML = '';
			for (const entry of this.getPresetEntries())
			{
				const opt = document.createElement('option');
				opt.value = entry.value;
				opt.textContent = entry.name;
				sel.appendChild(opt);
			}
			const custom = document.createElement('option');
			custom.value = 'custom';
			custom.textContent = '— Custom —';
			sel.appendChild(custom);
			if (desiredValue === 'custom' || this.getEntryByValue(desiredValue))
			{
				sel.value = desiredValue;
			}
			else
			{
				sel.value = 'custom';
			}
		}


		syncSelectionToObserver()
		{
			const obs = controller.skyState.observer;
			for (const entry of this.getPresetEntries())
			{
				if (coordsMatch(obs.lat, obs.lon, entry.lat, entry.lon))
				{
					el['sky-preset'].value = entry.value;
					return;
				}
			}
			el['sky-preset'].value = 'custom';
		}


		syncFromObserver()
		{
			const obs = controller.skyState.observer;
			this.setInputValues(obs.lat, obs.lon);
			this.syncSelectionToObserver();
		}


		applyPreset(value)
		{
			const entry = this.getEntryByValue(value);
			if (!entry)
			{
				return;
			}
			this.userChangedLocation = true;
			this.setInputValues(entry.lat, entry.lon);
			controller.setObserverLocation(entry.lat, entry.lon);
			el['sky-preset'].value = value;
		}


		applyManualInput()
		{
			const lat = parseFloat(el['sky-lat'].value) / DEG_PER_RAD;
			const lon = parseFloat(el['sky-lon'].value) / DEG_PER_RAD;
			if (!isFinite(lat) || !isFinite(lon))
			{
				return;
			}
			this.userChangedLocation = true;
			controller.setObserverLocation(lat, lon);
			el['sky-preset'].value = 'custom';
		}


		saveCurrentPreset(name)
		{
			this.userChangedLocation = true;
			controller.saveLocationPreset(name);
			this.populatePresets(`user:${controller.skyState.userPresets.length - 1}`);
		}


		applyGeolocation(position)
		{
			this.localPreset = {
				lat: position.coords.latitude / DEG_PER_RAD,
				lon: position.coords.longitude / DEG_PER_RAD,
			};
			this.populatePresets(el['sky-preset'].value || 'custom');
			if (this.userChangedLocation)
			{
				return;
			}
			controller.setObserverLocation(this.localPreset.lat, this.localPreset.lon);
			this.syncFromObserver();
		}


		requestGeolocation()
		{
			if (this.requestedGeolocation)
			{
				return;
			}
			this.requestedGeolocation = true;
			if (!('geolocation' in navigator))
			{
				return;
			}
			navigator.geolocation.getCurrentPosition(
				(position) =>
				{
					this.applyGeolocation(position);
				},
				() =>
				{
				},
				{
					timeout: 5000,
					maximumAge: 300000,
				}
			);
		}


		initialize()
		{
			this.populatePresets('custom');
			this.syncFromObserver();
			this.requestGeolocation();
		}
	}

	const skyLocationManager = new SkyLocationManager();

	function syncSkyTime() {
		const obs = controller.skyState.observer;
		const d = new Date(obs.utcMs);
		el['sky-date'].value = d.toISOString().slice(0, 10);
		const secs = d.getUTCHours() * 3600 + d.getUTCMinutes() * 60 + d.getUTCSeconds();
		el['sky-time-slider'].value = secs;
		const hh = String(d.getUTCHours()).padStart(2, '0');
		const mm = String(d.getUTCMinutes()).padStart(2, '0');
		const ss = String(d.getUTCSeconds()).padStart(2, '0');
		el['sky-time-readout'].textContent = `${hh}:${mm}:${ss}`;
	}

	// Mode toggle buttons
	for (const btn of el['sky-mode-toggle'].querySelectorAll('.sky-mode-btn')) {
		btn.addEventListener('click', () => {
			controller.setSkyMode(btn.dataset.mode);
			for (const b of el['sky-mode-toggle'].querySelectorAll('.sky-mode-btn')) {
				b.classList.toggle('active', b.dataset.mode === btn.dataset.mode);
			}
		});
	}

	// Preset dropdown
	el['sky-preset'].addEventListener('change', () => {
		const v = el['sky-preset'].value;
		if (v === 'custom') return;
		skyLocationManager.applyPreset(v);
	});

	// Manual lat/lon
	function onLatLonInput() {
		skyLocationManager.applyManualInput();
	}
	el['sky-lat'].addEventListener('input', onLatLonInput);
	el['sky-lon'].addEventListener('input', onLatLonInput);

	// Save preset
	el['btn-save-preset'].addEventListener('click', () => {
		const name = prompt('Preset name:');
		if (!name || !name.trim()) return;
		skyLocationManager.saveCurrentPreset(name.trim());
	});

	// Date picker
	el['sky-date'].addEventListener('change', () => {
		el['sky-time-live'].checked = false;
		controller.skyState.timeLocked = true;
		const parts = el['sky-date'].value.split('-').map(Number);
		if (parts.length !== 3 || parts.some(isNaN)) return;
		const d = new Date(controller.skyState.observer.utcMs);
		d.setUTCFullYear(parts[0], parts[1] - 1, parts[2]);
		controller.setObserverTime(d.getTime());
	});

	// Time-of-day slider
	el['sky-time-slider'].addEventListener('input', () => {
		el['sky-time-live'].checked = false;
		controller.skyState.timeLocked = true;
		const secs = parseInt(el['sky-time-slider'].value, 10);
		const d = new Date(controller.skyState.observer.utcMs);
		d.setUTCHours(Math.floor(secs / 3600), Math.floor((secs % 3600) / 60), secs % 60, 0);
		const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
		const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
		const ss = String(secs % 60).padStart(2, '0');
		el['sky-time-readout'].textContent = `${hh}:${mm}:${ss}`;
		controller.setObserverTime(d.getTime());
	});

	// Live checkbox
	el['sky-time-live'].addEventListener('change', () => {
		controller.skyState.timeLocked = !el['sky-time-live'].checked;
		if (!controller.skyState.timeLocked) {
			controller.setObserverTime(Date.now());
			syncSkyTime();
		}
	});

	// Initialize sky section from current observer state
	skyLocationManager.initialize();
	syncSkyTime();

	return {
		showNoSelection,
		showSelection,
		refreshSelection,
		setStatus,
		setAddMode,
		setAllowMoving,
		setGridVisible,
		setAltAzGridVisible,
		setCatalogLoaded,
		focusName: () => el['f-name'].focus(),
		syncSkyTime,
	};
}
