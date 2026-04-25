// Camera & stereographic projection on the celestial sphere.
//
// Model: the camera's orientation is stored as a world-space orthonormal basis
// (right, up, fwd). A world unit-vector w projects to normalized device
// coordinates (nx, ny) by
//   (xc, yc, zc) = (w·right, w·up, w·fwd)
//   (sx, sy)    = stereographic projection from (0,0,-1) onto plane at fwd
//                  = (xc, yc) / (1 + zc)
//   (nx, ny)    = (sx, sy) / (tan(fov/2) * aspectScale)
//
// Stereographic is conformal and well-defined for every camera-frame direction
// except the antipode (zc = -1). It matches Stellarium's default feel.

// ---------- vector helpers ----------
export function v3(x, y, z) {
	return [x, y, z];
}


export function dot(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}


export function cross(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0],
	];
}


export function norm(a) {
	return Math.hypot(a[0], a[1], a[2]);
}


export function normalize(a) {
	const n = norm(a);
	return n > 0 ? [a[0] / n, a[1] / n, a[2] / n] : [0, 0, 0];
}


export function scale(a, s) {
	return [a[0] * s, a[1] * s, a[2] * s];
}


export function add(a, b) {
	return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}


export function sub(a, b) {
	return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}


export function sphereDir(ra, dec) {
	const cd = Math.cos(dec);
	return [cd * Math.cos(ra), -cd * Math.sin(ra), Math.sin(dec)];
}


export function dirToRADec(v) {
	return {
		ra: ((Math.atan2(-v[1], v[0]) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI),
		dec: Math.asin(Math.max(-1, Math.min(1, v[2]))),
	};
}


// ---------- Rodrigues rotation of a vector ----------
// Rotates v by the rotation that takes unit vector a to unit vector b.
function rotateVecFromAtoB(v, a, b) {
	const d = dot(a, b);
	if (d > 0.9999999) return [v[0], v[1], v[2]];
	if (d < -0.9999999) {
		// 180°: pick an axis perpendicular to a, rotate π.
		const axis = Math.abs(a[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
		const n = normalize(cross(a, axis));
		const c = dot(n, v);
		return [2 * n[0] * c - v[0], 2 * n[1] * c - v[1], 2 * n[2] * c - v[2]];
	}
	const axis = cross(a, b);
	const s = norm(axis);
	const n = [axis[0] / s, axis[1] / s, axis[2] / s];
	const cosA = d;
	const sinA = s;
	const one_cosA = 1 - cosA;
	const ndv = dot(n, v);
	const nxv = cross(n, v);
	return [
		v[0] * cosA + nxv[0] * sinA + n[0] * ndv * one_cosA,
		v[1] * cosA + nxv[1] * sinA + n[1] * ndv * one_cosA,
		v[2] * cosA + nxv[2] * sinA + n[2] * ndv * one_cosA,
	];
}


// ---------- Camera ----------
export function createCamera() {
	return {
		right: [0, 1, 0],    // screen-right basis at (RA=0, Dec=0)
		up: [0, 0, 1],    // world "north"
		fwd: [1, 0, 0],    // looking at RA=0, Dec=0
		fov: Math.PI / 2,  // 90° initial (fits most of a hemisphere)
		width: 1, height: 1, // pixel viewport; set by app before use
	};
}


export function setViewport(cam, width, height) {
	cam.width = Math.max(1, width);
	cam.height = Math.max(1, height);
}


function aspectScales(cam) {
	const w = cam.width, h = cam.height;
	return w < h ? { ax: 1, ay: h / w } : { ax: w / h, ay: 1 };
}


// World direction → NDC in [-1,1]^2, plus camera-frame z for culling.
export function project(cam, w) {
	const xc = dot(w, cam.right);
	const yc = dot(w, cam.up);
	const zc = dot(w, cam.fwd);
	const tanHalf = Math.tan(cam.fov / 2);
	const { ax, ay } = aspectScales(cam);
	if (zc <= -0.999) return { nx: NaN, ny: NaN, zc };
	const k = 1 / (1 + zc);
	return {
		nx: (xc * k) / (tanHalf * ax),
		ny: (yc * k) / (tanHalf * ay),
		zc,
	};
}


// NDC → world unit-vector.
export function unproject(cam, nx, ny) {
	const tanHalf = Math.tan(cam.fov / 2);
	const { ax, ay } = aspectScales(cam);
	const sx = nx * tanHalf * ax;
	const sy = ny * tanHalf * ay;
	const r2 = sx * sx + sy * sy;
	const denom = 1 + r2;
	const x = 2 * sx / denom;
	const y = 2 * sy / denom;
	const z = (1 - r2) / denom;
	// camera-frame (x, y, z) → world
	return [
		x * cam.right[0] + y * cam.up[0] + z * cam.fwd[0],
		x * cam.right[1] + y * cam.up[1] + z * cam.fwd[1],
		x * cam.right[2] + y * cam.up[2] + z * cam.fwd[2],
	];
}


// Orthonormalize the basis (call periodically to avoid floating-point drift).
export function reorthonormalize(cam) {
	cam.fwd = normalize(cam.fwd);
	// Make right perpendicular to fwd
	cam.right = normalize(sub(cam.right, scale(cam.fwd, dot(cam.right, cam.fwd))));
	// up = fwd × right (cross order chosen so (right, up, fwd) is right-handed
	// with z=fwd; equivalently up = fwd × right)
	cam.up = cross(cam.fwd, cam.right);
}


// Rotate the camera by the rotation that maps world direction wFrom to wTo.
// Used by panning ("drag the sphere so that the point that was at mouse-down
// stays under the cursor") and zoom-around-cursor.
export function rotateCamera(cam, wFrom, wTo) {
	cam.right = rotateVecFromAtoB(cam.right, wFrom, wTo);
	cam.up = rotateVecFromAtoB(cam.up, wFrom, wTo);
	cam.fwd = rotateVecFromAtoB(cam.fwd, wFrom, wTo);
	reorthonormalize(cam);
}


// Convenience: rotate to look at a specific RA/Dec, keeping roll = 0.
export function lookAt(cam, ra, dec) {
	cam.fwd = sphereDir(ra, dec);
	cam.right = [Math.sin(ra), Math.cos(ra), 0];
	cam.up = cross(cam.fwd, cam.right);
	reorthonormalize(cam);
}


// Orient camera to a given altitude/azimuth in the local horizon frame,
// keeping up aligned with the zenith (no roll). Used when entering Local mode.
// alt: altitude in radians, az: azimuth in radians (clockwise from North).
// zenith: world-space unit vector pointing to the observer's zenith.
export function lookAtAltAz(cam, alt, az, zenith) {
	// Project world-Z (celestial north pole) onto the plane perpendicular to zenith
	// to get the "north" direction in the horizon frame.
	const Z = [0, 0, 1];
	let northLocal = normalize(sub(Z, scale(zenith, zenith[2])));
	if (!isFinite(northLocal[0])) northLocal = [1, 0, 0]; // degenerate at geographic pole
	const eastLocal = normalize(cross(zenith, northLocal));
	const ca = Math.cos(alt), sa = Math.sin(alt), cz = Math.cos(az), sz = Math.sin(az);
	cam.fwd = normalize(add(add(scale(northLocal, ca * cz), scale(eastLocal, ca * sz)), scale(zenith, sa)));
	const rawRight = cross(zenith, cam.fwd);
	const rLen = Math.hypot(rawRight[0], rawRight[1], rawRight[2]);
	cam.right = rLen < 1e-6 ? eastLocal : scale(rawRight, 1 / rLen);
	cam.up = cross(cam.fwd, cam.right);
}


// Pixel helpers ------------------------------------------------------
export function pixelToNDC(cam, px, py) {
	return [
		(px / cam.width) * 2 - 1,
		1 - (py / cam.height) * 2,
	];
}


export function ndcToPixel(cam, nx, ny) {
	return [
		(nx + 1) * 0.5 * cam.width,
		(1 - ny) * 0.5 * cam.height,
	];
}


// Zoom by scaling fov, anchored on cursor position (so the sphere point under
// the cursor stays fixed).
export function zoomAt(cam, pixelX, pixelY, factor) {
	const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
	const wBefore = unproject(cam, nx, ny);
	const MIN_FOV = 0.1 * Math.PI / 180;   // 0.1°
	const MAX_FOV = 179 * Math.PI / 180;   // 179°
	cam.fov = Math.max(MIN_FOV, Math.min(MAX_FOV, cam.fov * factor));
	const wAfter = unproject(cam, nx, ny);
	rotateCamera(cam, wAfter, wBefore);
}


// Pan: drag world direction wFrom to be under pixel (px, py).
export function panTo(cam, pixelX, pixelY, wFrom) {
	const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
	const wTo = unproject(cam, nx, ny);
	rotateCamera(cam, wTo, wFrom);
}


// Pan with no-roll constraint: after rotating, re-anchor right/up to the zenith
// plane so the camera never rolls. Used in Local mode.
export function panToConstrained(cam, pixelX, pixelY, wFrom, zenith) {
	const [nx, ny] = pixelToNDC(cam, pixelX, pixelY);
	const wTo = unproject(cam, nx, ny);
	rotateCamera(cam, wTo, wFrom);
	const rawRight = cross(zenith, cam.fwd);
	const rLen = Math.hypot(rawRight[0], rawRight[1], rawRight[2]);
	if (rLen < 1e-6) return; // looking directly at/away from zenith — skip constraint
	cam.right = [rawRight[0] / rLen, rawRight[1] / rLen, rawRight[2] / rLen];
	cam.up = cross(cam.fwd, cam.right);
}


// Decompose the camera's look direction into altitude/azimuth in the local
// horizon frame defined by zenith.  Returns { alt, az } in radians;
// alt ∈ [-π/2, π/2], az clockwise from North (matching lookAtAltAz).
export function fwdToAltAz(cam, zenith) {
	const alt = Math.asin(Math.max(-1, Math.min(1, dot(cam.fwd, zenith))));
	const Z = [0, 0, 1];
	let northLocal = normalize(sub(Z, scale(zenith, zenith[2])));
	if (!isFinite(northLocal[0])) northLocal = [1, 0, 0];
	const eastLocal = normalize(cross(zenith, northLocal));
	return {
		alt,
		az: Math.atan2(dot(cam.fwd, eastLocal), dot(cam.fwd, northLocal)),
	};
}


// Current look direction as RA/Dec, for status display.
export function lookRADec(cam) {
	return dirToRADec(cam.fwd);
}
