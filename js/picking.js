// Screen-space star picking + drag helpers.

import { project, unproject, pixelToNDC, sphereDir, dirToRADec } from './camera.js';

// Return index of the nearest visible star to (pixelX, pixelY) within radiusPx, or -1.
// O(n) — fine for 9k stars; re-evaluating every click, not every mousemove.
export function pickStar(
	cam,
	stars,
	pixelX,
	pixelY,
	radiusPx = 10,
	brightness = 1,
	minScreenBrightness = 0,
	altitudes = null,
) {
	const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
	const halfW = cam.width * 0.5;
	const halfH = cam.height * 0.5;
	const r2 = radiusPx * radiusPx;

	let bestI = -1;
	let bestD2 = Infinity;

	for (let i = 0; i < stars.length; i++) {
		const s = stars[i];
		if (altitudes && altitudes[i] < 0) continue;
		if (s.flux * brightness <= minScreenBrightness) continue;
		const v = sphereDir(s.ra, s.dec);
		const { nx: snx, ny: sny, zc } = project(cam, v);
		if (zc < -0.5 || !isFinite(snx) || !isFinite(sny)) continue;
		const dx = (snx - nx) * halfW;
		const dy = (sny - ny) * halfH;
		const d2 = dx * dx + dy * dy;
		if (d2 < bestD2 && d2 < r2) {
			bestD2 = d2;
			bestI = i;
		}
	}
	// If the picked star is a secondary, check whether its primary is within
	// 5 screen pixels. If so, prefer the primary — the two stars are visually
	// inseparable and the primary is the more meaningful selection target.
	if (bestI !== -1) {
		const picked = stars[bestI];
		if (picked.primaryHygId !== null && picked.primaryHygId !== picked.hygId) {
			for (let i = 0; i < stars.length; i++) {
				if (stars[i].hygId !== picked.primaryHygId) continue;
				if (altitudes && altitudes[i] < 0) break;
				const pv = sphereDir(stars[i].ra, stars[i].dec);
				const { nx: pnx, ny: pny, zc: pzc } = project(cam, pv);
				if (pzc < -0.5 || !isFinite(pnx) || !isFinite(pny)) break;
				const sv = sphereDir(picked.ra, picked.dec);
				const { nx: snx, ny: sny } = project(cam, sv);
				const dx = (pnx - snx) * halfW;
				const dy = (pny - sny) * halfH;
				if (dx * dx + dy * dy <= 25) bestI = i;
				break;
			}
		}
	}

	return bestI;
}


// Cursor pixel → (RA, Dec) on the celestial sphere.
// Used by LMB-drag (reposition star) and Add-Star (place new star).
export function pixelToRADec(cam, pixelX, pixelY) {
	const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
	const w = unproject(cam, nx, ny);
	return dirToRADec(w);
}
