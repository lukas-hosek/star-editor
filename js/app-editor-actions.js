// Catalog/editor actions: catalog load/save, selection, and star mutations.

import { makeNewStar, parseCatalog, refreshStarPhotometry, serializeCatalog } from './catalog.js';
import { pixelToRADec } from './picking.js';
import {
	appendStar,
	removeAt,
	setAltAzGridVisible,
	setBrightness,
	setRADecGridVisible,
	syncAll,
	syncOne,
} from './renderer.js';


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


	function loadCatalog(text, handle)
	{
		const ui = getUI();
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
	}


	function serialize()
	{
		return serializeCatalog(state.stars);
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


	function setRADecGridVisibleState(visible)
	{
		const ui = getUI();
		state.showRADecGrid = !!visible;
		setRADecGridVisible(renderer, state.showRADecGrid);
		ui.setRADecGridVisible(state.showRADecGrid);
		requestRender();
	}


	function setAltAzGridVisibleState(visible)
	{
		const ui = getUI();
		state.showAltAzGrid = !!visible;
		setAltAzGridVisible(renderer, state.showAltAzGrid);
		ui.setAltAzGridVisible(state.showAltAzGrid);
		if (state.showAltAzGrid)
		{
			// When live time is enabled, refresh to "now" before the next altitude update so
			// the newly shown horizon grid does not render against stale observer time.
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
		// New stars get the next available HR so selection and save/load round-trips keep
		// a stable catalog identifier even for freshly added records.
		const nextHR = state.stars.reduce((highestHR, star) => Math.max(highestHR, star.HR || 0), 0) + 1;
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
		setRADecGridVisible: setRADecGridVisibleState,
		setAltAzGridVisible: setAltAzGridVisibleState,
		onStarEdited,
		selectStar,
		addStarAtPixel,
		deleteStarAt,
	};
}