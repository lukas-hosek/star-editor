// DOM-side: toolbar wiring, side-panel form, file I/O via File System Access.
// All DOM lookups happen once, in createUI.

const HRS_PER_RAD = 12 / Math.PI;
const DEG_PER_RAD = 180 / Math.PI;

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
	const ids = [
		'btn-open', 'btn-save', 'btn-save-as', 'btn-add', 'btn-delete', 'btn-move', 'btn-grid',
		'brightness', 'brightness-readout', 'status',
		'panel-empty', 'panel-form', 'panel-title',
		'f-hr', 'f-name',
		'f-ra-h', 'f-ra-m', 'f-ra-s',
		'f-de-sign', 'f-de-d', 'f-de-m', 'f-de-s',
		'f-vmag', 'f-bv', 'f-sp', 'f-pmra', 'f-pmde', 'f-plx', 'f-rv',
		'banner',
	];
	for (const id of ids) el[id] = document.getElementById(id);
	const openFallbackInput = createOpenFallbackInput();

	if (!canUseFileSystemAccess()) {
		el['banner'].textContent = 'Open uses a standard file chooser here. Save As still requires a secure Chromium-based browser or localhost.';
		el['banner'].classList.remove('hidden');
	}

	// ---------- toolbar ----------
	el['btn-open'].addEventListener('click', async () => {
		try {
			const selection = canUseFileSystemAccess()
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

	return {
		showNoSelection,
		showSelection,
		refreshSelection,
		setStatus,
		setAddMode,
		setAllowMoving,
		setGridVisible,
		setCatalogLoaded,
		focusName: () => el['f-name'].focus(),
	};
}
