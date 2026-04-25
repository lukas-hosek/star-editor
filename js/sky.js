// Astronomical math: sidereal time, altitude computation, observer state, and location presets.

const DEG = Math.PI / 180;

export const LOCATION_PRESETS = [
	{ name: 'Greenwich', lat: 51.4769 * DEG, lon: 0.0005 * DEG },
	{ name: 'Prague', lat: 50.0755 * DEG, lon: 14.4378 * DEG },
];

export function createObserver() {
	return {
		lat: LOCATION_PRESETS[1].lat,
		lon: LOCATION_PRESETS[1].lon,
		utcMs: Date.now(),
		lst: 0,               // derived by updateObserver()
		zenithWorld: [1, 0, 0], // derived by updateObserver()
	};
}

// Greenwich Mean Sidereal Time in radians for a given UTC epoch (ms since Unix epoch).
export function gmstRadians(utcMs) {
	const T = utcMs / 86400000.0 - 10957.5; // days since J2000.0
	return (((18.697374558 + 24.06570982441908 * T) % 24) + 24) % 24 * (Math.PI / 12);
}

export function lstRadians(utcMs, lonRad) {
	return (gmstRadians(utcMs) + lonRad + 4 * Math.PI) % (2 * Math.PI);
}

// Altitude of a star in radians given observer lat, Local Sidereal Time, and star RA/Dec.
export function starAltitude(ra, dec, lat, lst) {
	const ha = (lst - ra + 4 * Math.PI) % (2 * Math.PI);
	return Math.asin(
		Math.sin(dec) * Math.sin(lat) +
		Math.cos(dec) * Math.cos(lat) * Math.cos(ha)
	);
}

// Zenith direction as a unit vector in the equatorial world frame.
// Uses the same sphereDir convention as camera.js: x=cos(dec)*cos(ra), y=-cos(dec)*sin(ra), z=sin(dec).
// Zenith is at dec=lat, ra=lst.
export function zenithDir(lat, lst) {
	const cd = Math.cos(lat);
	return [cd * Math.cos(lst), -cd * Math.sin(lst), Math.sin(lat)];
}

// Recompute derived fields (lst, zenithWorld) from observer's utcMs + lon/lat.
export function updateObserver(obs) {
	obs.lst = lstRadians(obs.utcMs, obs.lon);
	obs.zenithWorld = zenithDir(obs.lat, obs.lst);
}

// Fill out[i] = altitude of stars[i] in radians. Allocates a new Float32Array if
// out is missing or the wrong length; otherwise reuses it.
export function computeAltitudes(stars, lat, lst, out) {
	if (!out || out.length !== stars.length) out = new Float32Array(stars.length);
	for (let i = 0; i < stars.length; i++) {
		out[i] = starAltitude(stars[i].ra, stars[i].dec, lat, lst);
	}
	return out;
}

const STORAGE_KEY = 'starEditor_locationPresets';

export function loadUserPresets() {
	try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
	catch { return []; }
}

export function saveUserPresets(presets) {
	localStorage.setItem(STORAGE_KEY, JSON.stringify(presets));
}
