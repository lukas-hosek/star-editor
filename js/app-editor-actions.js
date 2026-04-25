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
		const n = state.stars.length;
		const dirty = state.isDirty ? ' •' : '';
		ui.setStatus(n > 0 ? `${n} stars${dirty}` : 'No catalog loaded');
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


	function setAddMode(on)
	{
		const ui = getUI();
		state.addMode = !!on;
		ui.setAddMode(state.addMode);
		canvas.classList.toggle('adding', state.addMode);
	}


	function setAllowMoving(on)
	{
		const ui = getUI();
		state.allowMoving = !!on;
		ui.setAllowMoving(state.allowMoving);
		if (!state.allowMoving)
		{
			cancelStarDrag();
		}
	}


	function deleteSelected()
	{
		if (state.selectedIndex < 0) return;
		const s = state.stars[state.selectedIndex];
		if (!window.confirm(`Delete HR ${s.HR}?`)) return;
		deleteStarAt(state.selectedIndex);
	}


	function setBrightnessMult(mult)
	{
		setBrightness(renderer, mult);
		requestRender();
	}


	function setRADecGridVisibleState(on)
	{
		const ui = getUI();
		state.showRADecGrid = !!on;
		setRADecGridVisible(renderer, state.showRADecGrid);
		ui.setRADecGridVisible(state.showRADecGrid);
		requestRender();
	}


	function setAltAzGridVisibleState(on)
	{
		const ui = getUI();
		state.showAltAzGrid = !!on;
		setAltAzGridVisible(renderer, state.showAltAzGrid);
		ui.setAltAzGridVisible(state.showAltAzGrid);
		if (state.showAltAzGrid)
		{
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
		const i = state.selectedIndex;
		if (i < 0) return;
		const s = state.stars[i];
		s._edited = true;
		refreshStarPhotometry(s);
		syncOne(renderer, i, s);
		state.isDirty = true;
		updateStatus();
		requestRender();
	}


	function selectStar(i)
	{
		const ui = getUI();
		state.selectedIndex = i;
		if (i >= 0) ui.showSelection(state.stars[i]);
		else ui.showNoSelection();
		requestRender();
	}


	function addStarAtPixel(px, py)
	{
		const ui = getUI();
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


	function deleteStarAt(i)
	{
		const ui = getUI();
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