// Catalog/editor actions: catalog load/save, selection, and star mutations.

import { makeNewStar, parseBscCatalog, refreshStarPhotometry, serializeBscCatalog } from './catalog-bsc.js';
import { parseHygCatalog, serializeHygCatalog } from './catalog-hyg.js';
import { pixelToRADec } from './picking.js';
import {
	appendStar,
	removeAt,
	setAltAzGridVisible,
	setBrightness,
	setPointSize,
	setRADecGridVisible,
	setStarKernel,
	syncAll,
	syncOne,
} from './renderer.js';


const STAR_SIZE_PRESETS = {
	small: { pointSize: 2, kernel: 'tent' },
	medium: { pointSize: 4, kernel: 'rcos' },
	large: { pointSize: 6, kernel: 'rcos' },
};


export function createEditorActions(options)
{
	const {
		camera,
		canvas,
		renderer,
		requestRender,
		skyState,
		state,
		getUI,
		cancelStarDrag,
	} = options;

	function updateStatus()
	{
		const ui = getUI();
		const starCount = state.stars.length;
		const dirty = state.isDirty ? ' •' : '';
		ui.setStatus(starCount > 0 ? `${starCount} stars${dirty}` : 'No catalog loaded');
	}


	function loadCatalog(text, handle, fileName)
	{
		const ui = getUI();
		const isHyg = (fileName || '').toLowerCase().endsWith('.csv');
		const stars = isHyg ? parseHygCatalog(text) : parseBscCatalog(text);
		state.stars = stars;
		state.catalogFormat = isHyg ? 'hyg' : 'bsc';
		let maxHR = 0;
		for (const star of stars) if (star.HR > maxHR) maxHR = star.HR;
		state.maxHR = maxHR;
		state.fileHandle = handle || null;
		state.fileName = fileName || handle?.name || (isHyg ? 'catalog.csv' : 'catalog.bsc');
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
	}


	function serialize()
	{
		return state.catalogFormat === 'hyg'
			? serializeHygCatalog(state.stars)
			: serializeBscCatalog(state.stars);
	}


	function markSaved()
	{
		state.isDirty = false;
		updateStatus();
	}


	function setAddMode(enabled)
	{
		const ui = getUI();
		state.addMode = !!enabled;
		ui.setAddMode(state.addMode);
		canvas.classList.toggle('adding', state.addMode);
	}


	function setAllowMoving(enabled)
	{
		const ui = getUI();
		state.allowMoving = !!enabled;
		ui.setAllowMoving(state.allowMoving);
		if (!state.allowMoving)
		{
			cancelStarDrag();
		}
	}


	function deleteSelected()
	{
		if (state.selectedIndex < 0) return;
		const selectedStar = state.stars[state.selectedIndex];
		if (!window.confirm(`Delete HR ${selectedStar.HR}?`)) return;
		deleteStarAt(state.selectedIndex);
	}


	function setBrightnessMult(mult)
	{
		setBrightness(renderer, mult);
		requestRender();
	}


	function setStarSizePreset(size)
	{
		const preset = STAR_SIZE_PRESETS[size] || STAR_SIZE_PRESETS.medium;
		const nextSize = STAR_SIZE_PRESETS[size] ? size : 'medium';
		const ui = getUI();
		state.starSize = nextSize;
		setPointSize(renderer, preset.pointSize);
		setStarKernel(renderer, preset.kernel);
		if (ui.setStarSize) ui.setStarSize(nextSize);
		requestRender();
	}


	const GRID_KINDS = {
		radec: {
			stateKey: 'showRADecGrid',
			rendererSetter: setRADecGridVisible,
			uiSetter: (ui, value) => ui.setRADecGridVisible(value),
			refreshObserverOnEnable: false,
		},
		altaz: {
			stateKey: 'showAltAzGrid',
			rendererSetter: setAltAzGridVisible,
			uiSetter: (ui, value) => ui.setAltAzGridVisible(value),
			refreshObserverOnEnable: true,
		},
	};


	function setGridVisibility(kind, visible)
	{
		const cfg = GRID_KINDS[kind];
		const ui = getUI();
		const value = !!visible;
		state[cfg.stateKey] = value;
		cfg.rendererSetter(renderer, value);
		cfg.uiSetter(ui, value);
		if (value && cfg.refreshObserverOnEnable)
		{
			// Live time refresh: pull observer to "now" before the next altitude pass
			// so the newly shown overlay does not render against stale observer time.
			if (!skyState.timeLocked)
			{
				skyState.observer.utcMs = Date.now();
				if (ui.syncSkyTime) ui.syncSkyTime();
			}
			skyState.needsAltUpdate = true;
		}
		requestRender();
	}


	function onStarEdited()
	{
		const selectedIndex = state.selectedIndex;
		if (selectedIndex < 0) return;
		const selectedStar = state.stars[selectedIndex];
		selectedStar._edited = true;
		refreshStarPhotometry(selectedStar);
		syncOne(renderer, selectedIndex, selectedStar);
		state.isDirty = true;
		updateStatus();
		requestRender();
	}


	function selectStar(selectedIndex)
	{
		const ui = getUI();
		state.selectedIndex = selectedIndex;
		if (selectedIndex >= 0) ui.showSelection(state.stars[selectedIndex]);
		else ui.showNoSelection();
		requestRender();
	}


	function addStarAtPixel(px, py)
	{
		const ui = getUI();
		const { ra, dec } = pixelToRADec(camera, px, py);
		// Drop antipode/edge clicks where unproject can return NaN; otherwise we'd
		// persist a star with non-finite RA/Dec into the catalog.
		if (!isFinite(ra) || !isFinite(dec)) return;
		const nextHR = (state.maxHR || 0) + 1;
		const star = makeNewStar({ ra, dec, HR: nextHR });
		state.maxHR = nextHR;
		state.stars.push(star);
		appendStar(renderer, star);
		state.isDirty = true;
		state.selectedIndex = state.stars.length - 1;
		ui.showSelection(star);
		ui.focusName();
		updateStatus();
		requestRender();
	}


	function deleteStarAt(index)
	{
		const ui = getUI();
		if (index < 0 || index >= state.stars.length) return;
		const lastIndex = state.stars.length - 1;
		// App state and GPU buffers both use swap-and-pop removal, so keep the arrays dense
		// and let removeAt() mirror the same replacement on the renderer side.
		if (index !== lastIndex) state.stars[index] = state.stars[lastIndex];
		state.stars.pop();
		removeAt(renderer, index, state.stars);
		state.isDirty = true;
		state.selectedIndex = -1;
		ui.showNoSelection();
		updateStatus();
		requestRender();
	}


	return {
		updateStatus,
		loadCatalog,
		serialize,
		markSaved,
		setAddMode,
		setAllowMoving,
		deleteSelected,
		setBrightness: setBrightnessMult,
		setStarSize: setStarSizePreset,
		setRADecGridVisible: (visible) => setGridVisibility('radec', visible),
		setAltAzGridVisible: (visible) => setGridVisibility('altaz', visible),
		onStarEdited,
		selectStar,
		addStarAtPixel,
		deleteStarAt,
	};
}