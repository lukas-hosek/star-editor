// Resize handling, render loop scheduling, observer updates, and unload warning.

import { lookAtAltAz, setViewport } from './camera.js';
import { render, resize, setAltitudes, setZenith } from './renderer.js';
import { captureAltAzForRestore, computeAltitudes, updateObserver } from './sky.js';

// How often the live-time clock advances the observer's UTC. 1 s keeps the
// displayed time readout in sync with wall clock without repainting at full frame rate.
const LIVE_TIME_POLL_MS = 1000;

let liveTimeIntervalId = null;


export function startAppRuntime(options)
{
	const {
		camera,
		renderer,
		skyState,
		state,
		ui,
		requestRender,
		consumeRenderRequest,
		needsObserverState,
		getSelectedStar,
	} = options;

	function handleResize()
	{
		const rect = renderer.canvas.getBoundingClientRect();
		const dpr = window.devicePixelRatio || 1;
		resize(renderer, rect.width, rect.height, dpr);
		setViewport(camera, rect.width, rect.height);
		requestRender();
	}


	function frame()
	{
		if (consumeRenderRequest())
		{
			if (needsObserverState() && skyState.needsAltUpdate)
			{
				updateObserver(skyState.observer);
				// In Local mode, time changes should move the sky while keeping the current
				// alt/az view centered, so restore the saved orientation after zenith updates.
				if (skyState.preserveAltAz && skyState.mode === 'local')
				{
					lookAtAltAz(camera, skyState.savedAlt, skyState.savedAz, skyState.observer.zenithWorld);
					skyState.preserveAltAz = false;
				}
				if (skyState.mode !== 'allsky' && state.stars.length > 0)
				{
					skyState.altitudes = computeAltitudes(
						state.stars, skyState.observer.lat, skyState.observer.lst, skyState.altitudes);
					setAltitudes(renderer, skyState.altitudes);
				}
				setZenith(renderer, skyState.observer.zenithWorld);
				skyState.needsAltUpdate = false;
			}
			render(renderer, camera, getSelectedStar());
		}
		requestAnimationFrame(frame);
	}


	function advanceLiveObserverTime()
	{
		if (skyState.timeLocked) return;
		captureAltAzForRestore(skyState, camera);
		skyState.observer.utcMs = Date.now();
		if (ui.syncSkyTime) ui.syncSkyTime();
		if (!needsObserverState()) return;
		skyState.needsAltUpdate = true;
		requestRender();
	}


	window.addEventListener('resize', handleResize);
	handleResize();
	frame();
	if (liveTimeIntervalId !== null) clearInterval(liveTimeIntervalId);
	liveTimeIntervalId = setInterval(advanceLiveObserverTime, LIVE_TIME_POLL_MS);

	window.addEventListener('beforeunload', (e) =>
	{
		if (state.isDirty)
		{
			e.preventDefault();
			e.returnValue = '';
		}
	});
}