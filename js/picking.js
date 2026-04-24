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
) {
  const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
  const halfW = cam.width * 0.5;
  const halfH = cam.height * 0.5;
  const r2 = radiusPx * radiusPx;

  let bestI = -1;
  let bestD2 = Infinity;

  for (let i = 0; i < stars.length; i++) {
    const s = stars[i];
    if (s.flux * brightness <= minScreenBrightness) continue;
    const v = sphereDir(s.ra, s.dec);
    const { nx: snx, ny: sny, zc } = project(cam, v);
    if (zc < -0.5 || !isFinite(snx)) continue;
    const dx = (snx - nx) * halfW;
    const dy = (sny - ny) * halfH;
    const d2 = dx * dx + dy * dy;
    if (d2 < bestD2 && d2 < r2) {
      bestD2 = d2;
      bestI = i;
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
