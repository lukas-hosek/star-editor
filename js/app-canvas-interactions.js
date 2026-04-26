// Canvas and keyboard interactions for selection, dragging, panning, and zoom.

import {
	fwdToAltAz,
	lookAtAltAz,
	panTo,
	pixelToNDC,
	unproject,
	zoomAt,
	zoomAtConstrained,
} from './camera.js';
import { pixelToRADec, pickStar } from './picking.js';
import { syncOne } from './renderer.js';


export function createCanvasInteractions(options)
{
	const {
		camera,
		canvas,
		controller,
		renderer,
		requestRender,
		selectStar,
		skyState,
		state,
		ui,
		updateStatus,
		addStarAtPixel,
	} = options;

	const drag = {
		mode: null,        // 'star' | 'pan' | null
		starIndex: -1,
		startWorld: null,  // world direction at pan-start (non-local modes)
		startPx: 0,        // pixel position at pan-start (local mode)
		startPy: 0,
		startAlt: 0,       // camera alt/az at pan-start (local mode)
		startAz: 0,
	};


	function stopAllDrag()
	{
		if (!drag.mode)
		{
			return;
		}
		drag.mode = null;
		drag.starIndex = -1;
		canvas.classList.remove('dragging', 'panning');
	}


	function cancelStarDrag()
	{
		if (drag.mode !== 'star')
		{
			return;
		}
		drag.mode = null;
		drag.starIndex = -1;
		canvas.classList.remove('dragging');
	}


	canvas.addEventListener('contextmenu', (e) => e.preventDefault());


	canvas.addEventListener('mousedown', (e) =>
	{
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		if (e.button === 0)
		{
			if (state.addMode)
			{
				addStarAtPixel(px, py);
				controller.setAddMode(false);
				return;
			}
			const alts = skyState.mode === 'local' ? skyState.altitudes : null;
			const i = pickStar(camera, state.stars, px, py, 12, renderer.brightness, 0.4, alts);
			if (i >= 0)
			{
				const wasSelected = i === state.selectedIndex;
				selectStar(i);
				if (state.allowMoving && wasSelected)
				{
					drag.mode = 'star';
					drag.starIndex = i;
					canvas.classList.add('dragging');
				}
			}
			else
			{
				selectStar(-1);
			}
		}
		else if (e.button === 2)
		{
			drag.mode = 'pan';
			if (skyState.mode === 'local')
			{
				drag.startPx = px;
				drag.startPy = py;
				const { alt, az } = fwdToAltAz(camera, skyState.observer.zenithWorld);
				drag.startAlt = alt;
				drag.startAz = az;
			}
			else
			{
				const [nx, ny] = pixelToNDC(camera, px, py);
				drag.startWorld = unproject(camera, nx, ny);
			}
			canvas.classList.add('panning');
		}
	});


	canvas.addEventListener('mousemove', (e) =>
	{
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;

		if (drag.mode === 'star')
		{
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
		else if (drag.mode === 'pan')
		{
			if (skyState.mode === 'local')
			{
				const dx = px - drag.startPx;
				const dy = py - drag.startPy;
				const angScale = camera.fov / (camera.height / 2);
				const newAlt = Math.max(-Math.PI / 2, Math.min(Math.PI / 2,
					drag.startAlt + dy * angScale));
				const newAz = drag.startAz - dx * angScale;
				lookAtAltAz(camera, newAlt, newAz, skyState.observer.zenithWorld);
			}
			else
			{
				panTo(camera, px, py, drag.startWorld);
			}
			requestRender();
		}
	});


	window.addEventListener('mouseup', stopAllDrag);


	canvas.addEventListener('wheel', (e) =>
	{
		e.preventDefault();
		const rect = canvas.getBoundingClientRect();
		const px = e.clientX - rect.left;
		const py = e.clientY - rect.top;
		const factor = Math.exp(e.deltaY * 0.0015);
		if (skyState.mode === 'local')
		{
			zoomAtConstrained(camera, px, py, factor, skyState.observer.zenithWorld);
		}
		else
		{
			zoomAt(camera, px, py, factor);
		}
		requestRender();
	}, { passive: false });


	window.addEventListener('keydown', (e) =>
	{
		if (e.key === 'Escape' && state.addMode)
		{
			controller.setAddMode(false);
			return;
		}
		const active = document.activeElement;
		const tag = (active && active.tagName) || '';
		const inInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
		if (!inInput && e.key === 'Delete' && state.selectedIndex >= 0)
		{
			e.preventDefault();
			controller.deleteSelected();
		}
	});


	return {
		cancelStarDrag,
	};
}